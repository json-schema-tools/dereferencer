import buildDereferencer from "./dereferencer";
import fetch from "isomorphic-fetch";

export default buildDereferencer(fetch, {
  access: () => Promise.resolve(false),
  readFile: () => Promise.resolve(""),
});
