import buildDereferencer from "./dereferencer";
import fetch from "isomorphic-fetch";
import * as fs from "fs";

export default buildDereferencer(fetch, fs);
