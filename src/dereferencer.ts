import { JSONSchema, JSONSchemaObject } from "@json-schema-tools/meta-schema";
import traverse from "@json-schema-tools/traverse";
import referenceResolver from "@json-schema-tools/reference-resolver";
import safeStringify from "fast-safe-stringify";
import { ProtocolHandlerMap } from "@json-schema-tools/reference-resolver/build/reference-resolver";

export interface RefCache { [k: string]: JSONSchema; }
/**
 * Options that can be passed to the derefencer constructor.
 */
export interface DereferencerOptions {
  /**
   * If true, resolved non-local references will also be dereferenced using the same options.
   */
  recursive?: boolean;
  /**
   * Preseed the dereferencer with resolved refs
   */
  refCache?: RefCache;
  rootSchema?: JSONSchema;
  /**
   * Setup custom protocol handlers. See https://github.com/json-schema-tools/reference-resolver for details
   */
  protocolHandlerMap?: ProtocolHandlerMap;
}

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
export class NonStringRefError implements Error {
  public message: string;
  public name = "NonStringRefError";

  constructor(s: JSONSchema) {
    this.message = [
      "NonStringRefError",
      "Found an improperly formatted $ref in schema. $ref must be a string",
      `schema in question: ${safeStringify(s)}`,
    ].join("\n");
  }
}

const copyOrNot = (s1: JSONSchemaObject, s2: JSONSchema) => {
  if (
    s1.$ref !== undefined &&
    Object.keys(s1).length > 1 &&
    (s2 !== true && s2 !== false)
  ) {
    const reflessCopy = {
      ...s2,
      ...s1
    };
    delete reflessCopy.$ref;
    return reflessCopy;
  } else {
    return s2;
  }
}

/**
 * When instantiated, represents a fully configured dereferencer. When constructed, references are pulled out.
 * No references are fetched until .resolve is called.
 */
export default class Dereferencer {
  public refs: string[];
  private schema: JSONSchema;
  public refCache: RefCache = {};

  constructor(schema: JSONSchema, private options: DereferencerOptions = {}) {
    if (this.options.recursive === undefined) {
      this.options.recursive = true;
    }

    if (this.options.rootSchema === undefined) {
      this.options.rootSchema = schema;
    }

    if (schema !== true && schema !== false && schema.$id) {
      this.options.rootSchema = schema;
    }

    if (this.options.refCache) {
      this.refCache = this.options.refCache;
    }

    if (this.options.protocolHandlerMap) {
      for (const k of Object.keys(this.options.protocolHandlerMap)) {
        referenceResolver.protocolHandlerMap[k] = this.options.protocolHandlerMap[k];
      }
    }

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
    await this._resolve();
    delete (this.schema as any).definitions;
    delete (this.schema as any).components;
    return this.schema;
  }

  public async _resolve(): Promise<JSONSchema> {
    if (this.schema === true || this.schema === false) {
      return Promise.resolve(this.schema);
    }

    if (this.refs.length === 0) {
      return Promise.resolve(this.schema);
    }
    const unfetchedRefs = this.refs.filter((r) => this.refCache[r] === undefined);

    const proms = [];
    for (const ref of unfetchedRefs) {
      let fetched;
      if (this.refCache[ref] !== undefined) {
        fetched = this.refCache[ref];
      } else if (ref === "#") {
        if (this.options.rootSchema === undefined) {
          throw new Error("options.rootSchema was not provided, but one of the schemas references '#'");
        }
        fetched = this.options.rootSchema;
      } else {
        const refProm = referenceResolver.resolve(ref, this.options.rootSchema);
        proms.push(refProm);
        fetched = await refProm as JSONSchema;
      }

      if (this.options.recursive === true && fetched !== true && fetched !== false && ref !== "#") {
        const subDerefferOpts = {
          ...this.options,
          refCache: this.refCache,
        };

        const subDereffer = new Dereferencer(fetched, subDerefferOpts);
        if (subDereffer.refs.length !== 0) {
          const subFetchedProm = subDereffer._resolve();
          proms.push(subFetchedProm);
          const subFetched = await subFetchedProm;
          this.refCache[ref] = copyOrNot(fetched, subFetched);
        } else {
          this.refCache[ref] = fetched;
        }
      } else {
        this.refCache[ref] = fetched;
      }
    }

    if (this.schema.$ref !== undefined) {
      this.schema = copyOrNot(this.schema, this.refCache[this.schema.$ref]);
    } else {
      traverse(this.schema, (s) => {
        if (s === true || s === false) {
          return s;
        }
        if (s.$ref !== undefined) {
          const reffedSchema = this.refCache[s.$ref];
          return copyOrNot(s, reffedSchema);
        }
        return s;
      }, { mutable: true });
    }

    await Promise.all(proms)
    return this.schema;
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
