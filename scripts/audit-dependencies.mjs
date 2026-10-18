import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// Evaluate every dependency, including dev tools. Only this exact, expiring
// advisory chain may be accepted; network/JSON errors never become a pass.
export function auditFailures(report, lock, policy, now = new Date()) {
  if (!report || report.error || report.auditReportVersion !== 2 || !report.vulnerabilities)
    return ["Invalid audit report"];
  const failures = [];
  const deadline = policy && /^\d{4}-\d{2}-\d{2}$/.test(policy.expires)
    ? Date.parse(`${policy.expires}T00:00:00Z`) : NaN;
  function permitted(name, visiting = new Set()) {
    const v = report.vulnerabilities[name];
    if (!v || visiting.has(name) || !policy || !Number.isFinite(deadline) || !Number.isFinite(now.getTime()) || now.getTime() >= deadline) return false;
    if (!["high", "moderate", "low"].includes(v.severity) || !v.via?.length || !v.nodes?.length) return false;
    if (!v.nodes.every((path) => lock.packages?.[path]?.dev === true &&
      policy.packages[name]?.includes(lock.packages[path].version))) return false;
    const next = new Set([...visiting, name]);
    return v.via.every((via) => typeof via === "string"
      ? permitted(via, next)
      : via.url === policy.advisory && via.name === "braces" && via.severity === "high");
  }
  for (const name of Object.keys(report.vulnerabilities)) {
    if (!permitted(name)) failures.push(`${name}: unaccepted dependency vulnerability`);
  }
  return failures;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const policy = JSON.parse(await readFile(resolve(root, "security/dependency-exceptions.json"), "utf8"));
  let failed = false;
  for (const directory of [".", "hosted"]) {
    const cwd = resolve(root, directory);
    const result = spawnSync("npm", ["audit", "--json"], { cwd, encoding: "utf8", timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
    if (result.error || ![0, 1].includes(result.status)) throw Error(`Audit unavailable: ${directory}`);
    const report = JSON.parse(result.stdout);
    const lock = JSON.parse(await readFile(resolve(cwd, "package-lock.json"), "utf8"));
    const failures = auditFailures(report, lock, directory === "hosted" ? policy : null);
    const count = Object.keys(report.vulnerabilities || {}).length;
    console.log(`${directory}: ${count} affected packages; ${failures.length} unaccepted. ${count && !failures.length ? `Build-only braces exception expires ${policy.expires}; raw audit is not clean.` : ""}`);
    for (const failure of failures) console.error(failure);
    failed ||= failures.length > 0;
  }
  if (failed) process.exitCode = 1;
}
