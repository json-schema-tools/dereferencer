import { JSONSchema } from "@json-schema-tools/meta-schema";

interface FSLoader {
  access: any;
  readFile: any;
};

interface FetchResult {
  json: () => Promise<JSONSchema>;
}

type FetchLoader = (url: string) => Promise<FetchResult>

interface Loaders {
  fs?: FSLoader;
  fetch?: FetchLoader;
};

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
export class NoInjectedFetchError extends Error {
  constructor(ref: string) {
    super(
      [
        "NoInjectedFilesystemError",
        "the dereferencer was not instantiated with a filesystem loader. As a result the $ref:",
        `"${ref}"`,
        "cannot be dereferenced."
      ].join("\n"),
    );
  }
}

/**
 * Error thrown when the reference is a filesystem path, but no filesystem loader was injected
 *
 * @example
 * ```typescript
 *
 * import Dereferencer, { NoInjectedFilesystemError } from "@json-schema-tools/dereferencer";
 * const dereffer = new Dereferencer({});
 * try { await dereffer.resolve(); }
 * catch(e) {
 *   if (e instanceof NoInjectedFilesystemError) { ... }
 * }
 * ```
 *
 */
export class NoInjectedFilesystemError extends Error {
  constructor(ref: string) {
    super(
      [
        "NoInjectedFilesystemError",
        "the dereferencer was not instantiated with a filesystem loader. As a result the $ref:",
        `"${ref}"`,
        "cannot be dereferenced."
      ].join("\n"),
    );
  }
}


const handleLoaderOptions = (injectedLoaders: Loaders) => {
  const loaderCopy = { ...injectedLoaders };
  if (injectedLoaders.fs === undefined) {
    console.warn("no filesystem interface provided. Attempting to dereference file paths will throw.");
    loaderCopy.fs = {
      access: (f: string) => { throw new NoInjectedFilesystemError(f); },
      readFile: (f: string) => { throw new NoInjectedFilesystemError(f); },
    };
  }

  if (injectedLoaders.fetch === undefined) {
    console.warn("no fetch interface provided. Attempting to dereference urls will throw.");
    loaderCopy.fetch = (f: string) => { throw new NoInjectedFetchError(f); };
  }
};
