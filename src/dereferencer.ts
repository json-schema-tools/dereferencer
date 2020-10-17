import { JSONSchema } from "@json-schema-tools/meta-schema";
import traverse from "@json-schema-tools/traverse";
import referenceResolver from "@json-schema-tools/reference-resolver";
import safeStringify from "fast-safe-stringify";

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
  constructor(s: JSONSchema) {
    super(
      [
        "NonStringRefError",
        "Found an improperly formatted $ref in schema. $ref must be a string",
        `schema in question: ${safeStringify(s)}`,
      ].join("\n"),
    );
  }
}

export interface RefCache { [k: string]: JSONSchema; }

/**
 * When instantiated, represents a fully configured dereferencer. When constructed, references are pulled out.
 * No references are fetched until .resolve is called.
 */
export default class Dereferencer {
  public refs: string[];
  private schema: JSONSchema;
  private refCache: RefCache = {};

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
      let fetched;
      if (this.refCache[ref] !== undefined) {
        fetched = this.refCache[ref];
      } else {
        fetched = await referenceResolver(ref, this.schema);
        this.refCache[ref] = fetched;
      }

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
