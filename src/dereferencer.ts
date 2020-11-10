import { JSONSchema, JSONSchemaObject } from "@json-schema-tools/meta-schema";
import traverse from "@json-schema-tools/traverse";
import referenceResolver from "@json-schema-tools/reference-resolver";
import safeStringify from "fast-safe-stringify";

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

const copyProps = (s1: JSONSchemaObject, s2: JSONSchemaObject) => {
  Object
    .entries(s2)
    .filter(([k]) => k !== "$ref")
    .forEach(([k, v]) => s1[k] = v);
};

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
    console.log("Resolving started on: ", this.schema);
    const refMap: { [s: string]: JSONSchema } = {};

    if (this.schema === true || this.schema === false) {
      return Promise.resolve(this.schema);
    }

    if (this.refs.length === 0) {
      // delete this.schema.definitions;
      return Promise.resolve(this.schema);
    }

    const proms = [];
    for (const ref of this.refs) {
      if (refMap[ref] === undefined) {
        let fetched;
        if (this.refCache[ref] !== undefined) {
          console.log("Resolving from cache: ", ref, this.refCache[ref]);
          fetched = this.refCache[ref];
        } else {
          const refProm = await referenceResolver(ref, this.options.rootSchema);
          proms.push(refProm);
          fetched = await refProm;
          console.log("resolved:", fetched);
        }

        console.log("found reffed schema: ", ref, fetched);

        if (this.options.recursive === true && fetched !== true && fetched !== false) {
          const subDerefferOpts = {
            ...this.options,
            refCache: this.refCache,
          };
          console.log("bout to make subdereffer on:", fetched, subDerefferOpts);

          if (fetched.$ref !== undefined && Object.keys(fetched).length > 1) {
            console.log("BOOGER", fetched);
          }

          const subDereffer = new Dereferencer(fetched, subDerefferOpts);
          console.log("subdereffer found refs:", subDereffer.refs);

          if (subDereffer.refs.length !== 0) {
            const subFetchedProm = subDereffer.resolve();
            const subFetched = await subFetchedProm;
            proms.push(subFetchedProm);

            // if there are props other than $ref present on the fetched schema,
            // we have to break referential integrity, creating a new schema all together.
            refMap[ref] = copyOrNot(fetched, subFetched);
          } else {
            refMap[ref] = fetched;
          }
        } else {
          refMap[ref] = fetched;
        }
        this.refCache[ref] = refMap[ref];
        console.log("updated ref cache:", this.refCache);
      }
    }

    if (this.schema.$ref !== undefined) {
      this.schema = copyOrNot(this.schema, refMap[this.schema.$ref]);
    } else {
      traverse(this.schema, (s) => {
        if (s === true || s === false) {
          return s;
        }
        if (s.$ref !== undefined) {
          const reffedSchema = refMap[s.$ref];
          return copyOrNot(s, reffedSchema);
        }
        return s;
      }, { mutable: true });
    }

    return Promise
      .all(proms)
      .then(() => {
        if (this.schema !== false && this.schema !== true) { // while not required, makes it nicer.
          delete this.schema.definitions;
          delete this.schema.components;
        }
        return this.schema
      });
    // .then(() => this.pluckInternalRefContainersOutOfSchema(this.schema));
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

  private pluckInternalRefContainersOntoSchema(s: any) {
    this.refs.forEach((ref) => {
      const firstKeyInRefPath = ref.replace("#/", "").split("/")[0];
      console.log("first key in path: ", firstKeyInRefPath);
      if (s[firstKeyInRefPath] === undefined) {
        s[firstKeyInRefPath] = (this.schema as any)[firstKeyInRefPath];
      } else {
        s[firstKeyInRefPath] = (this.schema as any)[firstKeyInRefPath];
      }
    });

    return s;
  }

  private pluckInternalRefContainersOutOfSchema(s: any) {
    console.log("removing:", this.refs, "from: ", s);
    this.refs.forEach((ref) => {
      const firstKeyInRefPath = ref.replace("#/", "").split("/")[0];
      delete s[firstKeyInRefPath];
    });
    return s;
  }
}
