import { makeDirectorySearch } from "../public/careers.js";
import { requestText } from "./network.mjs";
import { parse } from "parse5";
export function makeCompanySearch({ transport = requestText } = {}) {
  return makeDirectorySearch({ transport, parseHTML: parse });
}
