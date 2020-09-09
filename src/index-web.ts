import buildDereferencer from "./dereferencer";
import fetch from "isomorphic-fetch";

export default buildDereferencer(fetch, {
  access: () => Promise.resolve(false),
  readFile: () => Promise.resolve(""),
  constants: {
    F_OK: 0,
    R_OK: 4,
  },
});
