import { JSONMetaSchema } from "@json-schema-tools/meta-schema";
import * as path from "path";

export interface RefCache { [k: string]: JSONMetaSchema; }

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
  constructor(schema: JSONMetaSchema, nonJson: string) {
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
  constructor(schema: JSONMetaSchema) {
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

const fetchRef = (ref: string, src: JSONMetaSchema, refCache: RefCache): Promise<JSONMetaSchema> => {
  if (refCache[ref] !== undefined) {
    return Promise.resolve(refCache[ref]);
  }

  if (ref[0] === "#") {
    const withoutHash = ref.replace("#", "");
    try {
      const pointer = Ptr.parse(withoutHash);
      const reffedSchema = pointer.eval(src);

      if (reffedSchema.$ref !== undefined) {
        return fetchRef(reffedSchema.$ref, src, refCache);
      }

      this.refCache[ref] = reffedSchema;
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
    this.refCache[ref] = reffedSchema;
    return reffedSchema;
  } else if (["$", ".", "/"].indexOf(ref[0]) !== -1) {
    // there is good reason to assume this was intended to be a file path, but it was
    // not resolvable. In this case we should give a good error message.
    throw new InvalidFileSystemPathError(ref);
  }

  // handle http/https uri references
  // this forms the base case. We use node-fetch (or injected fetch lib) and let r rip
  try {
    console.log("fetching url"); // tslint:disable-line
    const fetchResult = await fetch(ref);
    console.log("fetch success"); // tslint:disable-line
    try {
      console.log("parsing fetched result to json"); // tslint:disable-line
      const reffedSchema = await fetchResult.json();
      console.log("json parsing complete"); // tslint:disable-line

      this.refCache[ref] = reffedSchema;

      console.log("fetched url", reffedSchema); // tslint:disable-line
      return reffedSchema;
    } catch (e) {
      console.log("found big ol json parse error", e); // tslint:disable-line
      throw new NonJsonRefError({ $ref: ref }, await fetchResult.text());
    }
  } catch (e) {
    console.log("found fetch error", e); // tslint:disable-line
    throw new Error("Unhandled ref");
  }
};

export default fetchRef;
