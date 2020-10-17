import { JSONSchema, JSONSchemaObject } from "@json-schema-tools/meta-schema";
import traverse from "@json-schema-tools/traverse";
import * as path from "path";
import referenceResolver from "@json-schema-tools/reference-resolver";

/**
 * Options that can be passed to the derefencer constructor.
 */
export interface DereferencerOptions {
  /**
   * If true, resolved non-local references will also be dereferenced using the same options.
   */
  recursive?: boolean;
}

export const defaultDereferencerOptions: DereferencerOptions = {
  recursive: true,
};

/**
 * Error thrown by the constructor when given a ref that isn't a string
 *
 *
 * @example
 * ```typescript
 *
 * import Dereferencer, { NonStringRefError } from "@json-schema-tools/dereferencer";
 *
 * try { const dereffer = new Dereferencer({}); }
 * catch(e) {
 *   if (e instanceof NonStringRefError) { ... }
 * }
 * ```
 *
 */
export class NonStringRefError extends Error {
  constructor(schema: JSONSchema) {
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
 * import Dereferencer, { NonJsonRefError } from "@json-schema-tools/dereferencer";
 * const dereffer = new Dereferencer({});
 * try { await dereffer.resolve(); }
 * catch(e) {
 *   if (e instanceof NonJsonRefError) { ... }
 * }
 * ```
 *
 */
export class NonJsonRefError extends Error {
  constructor(schema: JSONSchemaObject, nonJson: string) {
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
 * import Dereferencer, { InvalidJsonPointerRefError } from "@json-schema-tools/dereferencer";
 * const dereffer = new Dereferencer({});
 * try { await dereffer.resolve(); }
 * catch(e) {
 *   if (e instanceof InvalidJsonPointerRefError) { ... }
 * }
 * ```
 *
 */
export class InvalidJsonPointerRefError extends Error {
  constructor(schema: JSONSchemaObject) {
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
 * import Dereferencer, { InvalidFileSystemPathError } from "@json-schema-tools/dereferencer";
 * const dereffer = new Dereferencer({});
 * try { await dereffer.resolve(); }
 * catch(e) {
 *   if (e instanceof InvalidFileSystemPathError) { ... }
 * }
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
 * Error thrown when given an invalid file system path as a reference.
 *
 */
export class InvalidRemoteURLError extends Error {
  constructor(ref: string) {
    super(
      [
        "InvalidRemoteURLError",
        `The url was not resolvable: ${ref}`,
      ].join("\n"),
    );
  }
}

/**
 * When instantiated, represents a fully configured dereferencer. When constructed, references are pulled out.
 * No references are fetched until .resolve is called.
 */
export default class Dereferencer {
  public refs: string[];
  private schema: JSONSchema;

  constructor(schema: JSONSchema, private options: DereferencerOptions = defaultDereferencerOptions) {
    this.schema = schema; // shallow copy breaks recursive
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
  public async resolve(): Promise<JSONSchema> {
    const refMap: { [s: string]: JSONSchema } = {};

    if (this.schema === true || this.schema === false) {
      return Promise.resolve(this.schema);
    }

    if (this.refs.length === 0) {
      delete this.schema.definitions;
      return Promise.resolve(this.schema);
    }

    const proms = [];
    for (const ref of this.refs) {
      const fetched = await referenceResolver(ref, this.schema);
      proms.push(fetched);

      if (this.options.recursive === true && ref[0] !== "#") {

        const subDereffer = new Dereferencer(await fetched, this.options);
        const subFetched = subDereffer.resolve();
        proms.push(subFetched);
        refMap[ref] = await subFetched;
      } else {
        refMap[ref] = await fetched;
      }
    }

    if (this.schema.$ref !== undefined) {
      this.schema = refMap[this.schema.$ref];
    } else {
      traverse(this.schema, (s) => {
        if (s === true || s === false) {
          return s;
        }
        if (s.$ref !== undefined) {
          return refMap[s.$ref];
        }
        return s;
      }, { mutable: true });
    }

    if (this.options.recursive === true) {
      this.refs = this.collectRefs();
      const recurseResolve = this.resolve();
      proms.push(recurseResolve);
    }

    return Promise.all(proms).then(() => this.schema);
  }

  /**
   * First-pass traversal to collect all the refs that we can find. This allows us to
   * optimize the async work required as well.
   */
  public collectRefs(): string[] {
    const refs: string[] = [];

    traverse(this.schema, (s) => {
      if (s === true || s === false) {
        return s;
      }
      if (s.$ref && refs.indexOf(s.$ref) === -1) {
        if (typeof s.$ref !== "string") {
          throw new NonStringRefError(s);
        }

        refs.push(s.$ref);
      }
      return s;
    });

    return refs;
  }
}
