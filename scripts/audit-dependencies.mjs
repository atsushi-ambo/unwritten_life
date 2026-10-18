import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// No advisory exceptions. All severities and dev dependencies are checked.
export function auditFailures(report) {
  if (!report || report.error || report.auditReportVersion !== 2 ||
      !report.vulnerabilities || Array.isArray(report.vulnerabilities) ||
      typeof report.vulnerabilities !== "object") return ["Invalid audit report"];
  return Object.keys(report.vulnerabilities).map((name) => `${name}: dependency vulnerability`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  let failed = false;
  for (const directory of [".", "hosted"]) {
    const result = spawnSync("npm", ["audit", "--json"], {
      cwd: resolve(root, directory), encoding: "utf8", timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
    });
    if (result.error || ![0, 1].includes(result.status)) throw Error(`Audit unavailable: ${directory}`);
    const report = JSON.parse(result.stdout);
    const failures = auditFailures(report);
    if (result.status === 1 && failures.length === 0) throw Error(`Inconsistent audit report: ${directory}`);
    console.log(`${directory}: ${failures.length} dependency findings (including dev tools; no exceptions).`);
    for (const failure of failures) console.error(failure);
    failed ||= failures.length > 0;
  }
  if (failed) process.exitCode = 1;
}
