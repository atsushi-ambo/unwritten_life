import test from "node:test";
import assert from "node:assert/strict";
import { auditFailures } from "../scripts/audit-dependencies.mjs";
const url = "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm";
function fixture() {
  return {
    report: { auditReportVersion: 2, vulnerabilities: {
      braces: { severity: "high", nodes: ["node_modules/braces"], via: [{ url, name: "braces", severity: "high" }] },
      tool: { severity: "high", nodes: ["node_modules/tool"], via: ["braces"] },
    } },
    lock: { packages: {
      "node_modules/braces": { version: "3.0.3", dev: true },
      "node_modules/tool": { version: "1.0.0", dev: true },
    } },
    policy: { advisory: url, expires: "2026-10-24", packages: { braces: ["3.0.3"], tool: ["1.0.0"] } },
  };
}
const before = new Date("2026-10-23T23:59:59Z");
const check = ({ report, lock, policy }, date = before) => auditFailures(report, lock, policy, date);
test("audit exception accepts only reviewed dev versions/advisory before expiry", () => {
  assert.deepEqual(check(fixture()), []);
  for (const mutate of [
    (f) => { f.policy.expires = "invalid"; },
    (f) => { f.lock.packages["node_modules/braces"].dev = false; },
    (f) => { f.lock.packages["node_modules/braces"].version = "3.0.4"; },
    (f) => { f.report.vulnerabilities.braces.via.push({ url: "https://example.invalid/new", name: "braces", severity: "high" }); },
    (f) => { f.report.vulnerabilities.tool.via.push("missing"); },
    (f) => { f.report.vulnerabilities.tool.via = ["tool"]; },
    (f) => { f.report.vulnerabilities.braces.severity = "critical"; },
    (f) => { f.report.error = { message: "unavailable" }; },
  ]) {
    const f = fixture(); mutate(f); assert.ok(check(f).length > 0);
  }
  assert.equal(check(fixture(), new Date("2026-10-24T00:00:00Z")).length, 2);
  assert.deepEqual(auditFailures({ auditReportVersion: 2, vulnerabilities: {} }, { packages: {} }, null), []);
  assert.ok(auditFailures({}, {}, null).length > 0);
});
