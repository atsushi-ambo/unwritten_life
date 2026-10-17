import { makeDirectorySearch } from "../public/careers.js";
import { requestText } from "./network.mjs";
export function makeCompanySearch({ transport = requestText } = {}) {
  return makeDirectorySearch({ transport });
}
