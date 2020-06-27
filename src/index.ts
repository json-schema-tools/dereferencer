import { CoreSchemaMetaSchema } from "@json-schema-tools/meta-schema";
import traverse from "@json-schema-tools/traverse";
import * as fs from "fs";
import fetch from "node-fetch";
import Ptr from "@json-schema-spec/json-pointer";
import * as path from "path";

const fileExistsAndReadable = (f: string): Promise<boolean> => {
  return new Promise((resolve) => {
    fs.access(f, fs.constants.F_OK | fs.constants.R_OK, (e) => { //tslint:disable-line
      if (e) { return resolve(false); }
      resolve(true);
    });
  });
};
const readFile = (f: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    fs.readFile(f, "utf8", (err, data) => {
      if (err) {
        return reject(err);
      }
      return resolve(data);
    });
  });
};

/**
 * Options that can be passed to the derefencer constructor.
 */
export interface DereferencerOptions {
  // we dont actually have one yet
  placeholder?: boolean;
}

/**
 * Error thrown by the constructor when given a ref that isn't a string
 *
 *
 * @example
 * ```typescript
 *
 *import Dereferencer, { NonStringRefError } from "@json-schema-tools/dereferencer";
 *
 *try { const dereffer = new Dereferencer({}); }
 *catch(e) {
 *  if (e instanceof NonStringRefError) { ... }
 *}
 * ```
 *
 */
export class NonStringRefError extends Error {
  constructor(schema: CoreSchemaMetaSchema) {
    let schemaString = "";
    try {
      schemaString = JSON.stringify(schema);
    } catch (e) {
      schemaString = [
        `Keys: ${Object.keys(schema)}`,
        `Respective Values: ${Object.values(schema)}`,
      ].join("\n");
    }
    super(
      [
        "NonStringRefError",
        "Found an improperly formatted $ref in schema. $ref must be a string",
        `schema in question: ${schemaString}`,
      ].join("\n"),
    );
  }
}

/**
 * Error thrown when the fetched reference is not properly formatted JSON or is encoded
 * incorrectly
 *
 * @example
 * ```typescript
 *
 *import Dereferencer, { NonJsonRefError } from "@json-schema-tools/dereferencer";
 *const dereffer = new Dereferencer({});
 *try { await dereffer.resolve(); }
 *catch(e) {
 *  if (e instanceof NonJsonRefError) { ... }
 *}
 * ```
 *
 */
export class NonJsonRefError extends Error {
  constructor(schema: CoreSchemaMetaSchema, nonJson: string) {
    super(
      [
        "NonJsonRefError",
        `The resolved value at the reference: ${schema.$ref} was not JSON.parse 'able`,
        `The non-json content in question: ${nonJson}`,
      ].join("\n"),
    );
  }
}

/**
 * Error thrown when a JSON pointer is provided but is not parseable as per the RFC6901
 *
 * @example
 * ```typescript
 *
 *import Dereferencer, { InvalidJsonPointerRefError } from "@json-schema-tools/dereferencer";
 *const dereffer = new Dereferencer({});
 *try { await dereffer.resolve(); }
 *catch(e) {
 *  if (e instanceof InvalidJsonPointerRefError) { ... }
 *}
 * ```
 *
 */
export class InvalidJsonPointerRefError extends Error {
  constructor(schema: CoreSchemaMetaSchema) {
    super(
      [
        "InvalidJsonPointerRefError",
        `The provided RFC6901 JSON Pointer is invalid: ${schema.$ref}`,
      ].join("\n"),
    );
  }
}

/**
 * Error thrown when given an invalid file system path as a reference.
 *
 * @example
 * ```typescript
 *
 *import Dereferencer, { InvalidFileSystemPathError } from "@json-schema-tools/dereferencer";
 *const dereffer = new Dereferencer({});
 *try { await dereffer.resolve(); }
 *catch(e) {
 *  if (e instanceof InvalidFileSystemPathError) { ... }
 *}
 * ```
 *
 */
export class InvalidFileSystemPathError extends Error {
  constructor(ref: string) {
    super(
      [
        "InvalidFileSystemPathError",
        `The path was not resolvable: ${ref}`,
        `resolved path: ${path.resolve(process.cwd(), ref)}`,
      ].join("\n"),
    );
  }
}

/**
 * When instantiated, represents a fully configured dereferencer.
 */
export class Dereferencer {

  public refs: string[];
  private schema: CoreSchemaMetaSchema;

  constructor(schema: CoreSchemaMetaSchema, private options?: DereferencerOptions) {
    this.schema = { ...schema }; // start by making a shallow copy.
    this.refs = this.collectRefs();
  }

  /**
   * Fetches the schemas for all the refs in the configured input schema(s)
   *
   * @returns a promise that will resolve a fully dereferenced schema, where all the
   *          promises for each ref has been resolved as well.
   *
   *
   */
  public async resolve(): Promise<CoreSchemaMetaSchema> {
    const fetchedRefs = await Promise.all(this.refs.map((ref) => {
      return this.fetchRef(ref).then((fetchedRef) => ({ [ref]: fetchedRef }));
    }));

    let refMap: { [s: string]: CoreSchemaMetaSchema } = {};
    fetchedRefs.forEach((r) => { refMap = { ...refMap, ...r }; });

    return traverse(this.schema, (s) => {
      if (s.$ref !== undefined) {
        return refMap[s.$ref];
      }
      return s;
    });
  }

  private async fetchRef(ref: string): Promise<CoreSchemaMetaSchema> {
    if (ref[0] === "#") {
      const withoutHash = ref.replace("#", "");
      try {
        const pointer = Ptr.parse(withoutHash);
        const reffedSchema = pointer.eval(this.schema);

        if (reffedSchema.$ref !== undefined) {
          return this.fetchRef(reffedSchema.$ref);
        }

        return Promise.resolve(reffedSchema);
      } catch (e) {
        throw new InvalidJsonPointerRefError({ $ref: ref });
      }
    }

    // handle file references

    if (await fileExistsAndReadable(ref) === true) {
      const fileContents = await readFile(ref);
      let reffedSchema;
      try {
        reffedSchema = JSON.parse(fileContents);
      } catch (e) {
        throw new NonJsonRefError({ $ref: ref }, fileContents);
      }

      // throw if not valid json schema
      // (todo when we have validator)

      // return it
      return reffedSchema;
    } else if (["$", ".", "/"].indexOf(ref[0]) !== -1) {
      // there is good reason to assume this was intended to be a file path, but it was
      // not resolvable. In this case we should give a good error message.
      throw new InvalidFileSystemPathError(ref);
    }

    // handle http/https uri references
    // this forms the base case. We use node-fetch (or injected fetch lib) and let r rip
    try {
      const fetchResult = await fetch(ref);
      try {
        const reffedSchema = await fetchResult.json();
        return reffedSchema;
      } catch (e) {
        throw new NonJsonRefError({ $ref: ref }, await fetchResult.text());
      }
    } catch (e) { /* noop */ }

    throw new Error("Unhandled ref");
  }

  /**
   * First-pass traversal to collect all the refs that we can find. This allows us to
   * optimize the async work required as well.
   */
  private collectRefs(): string[] {
    const refs: string[] = [];
    traverse(this.schema, (s) => {
      if (s.$ref && refs.indexOf(s.$ref) === -1) {
        if (typeof s.$ref !== "string") { throw new NonStringRefError(s); }
        refs.push(s.$ref);
      }
      return s;
    });
    return refs;
  }

  /**
   * the guts
   *
   * At some point soon this should mainly just apply middleware that is available.
   *
   */
  private async applyDeref(schema: CoreSchemaMetaSchema): Promise<CoreSchemaMetaSchema> {
    if (schema.$ref === undefined) { return schema; }
    if (typeof schema.$ref !== "string") { throw new NonStringRefError(schema); }

    // handle internal reference
    if (schema.$ref[0] === "#") {
      const withoutHash = schema.$ref.replace("#", "");
      try {
        const pointer = Ptr.parse(withoutHash);
        const reffedSchema = pointer.eval(this.schema);
        return reffedSchema;
      } catch (e) {
        throw new InvalidJsonPointerRefError(schema);
      }
    }

    // handle file references
    if (await fileExistsAndReadable(schema.$ref) === true) {
      const fileContents = await readFile(schema.$ref);
      let reffedSchema;
      try {
        reffedSchema = JSON.parse(fileContents);
      } catch (e) {
        throw new NonJsonRefError(schema, fileContents);
      }

      // throw if not valid json schema
      // (todo when we have validator)

      // return it
      return reffedSchema;
    }

    // handle http/https uri references
    // this forms the base case. We use node-fetch (or injected fetch lib) and let r rip
    try {
      const fetchResult = await fetch(schema.$ref);
      try {
        const reffedSchema = await fetchResult.json();
        return reffedSchema;
      } catch (e) {
        throw new NonJsonRefError(schema, await fetchResult.text());
      }
    } catch (e) { /* noop */ }

    return schema;
  }
}

export default Dereferencer;
