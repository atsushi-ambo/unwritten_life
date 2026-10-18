import test from "node:test";
import assert from "node:assert/strict";
import { auditFailures } from "../scripts/audit-dependencies.mjs";
test("dependency audit rejects all findings and malformed/unavailable reports, without advisory exceptions", () => {
  assert.deepEqual(auditFailures({ auditReportVersion: 2, vulnerabilities: {} }), []);
  for (const severity of ["low", "moderate", "high", "critical"]) {
    assert.equal(auditFailures({ auditReportVersion: 2, vulnerabilities: {
      braces: { severity, isDirect: false, via: [{ url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm" }] },
    } }).length, 1);
  }
  for (const report of [null, {}, { error: "unavailable" },
    { auditReportVersion: 2, vulnerabilities: [] }, { auditReportVersion: 1, vulnerabilities: {} }])
    assert.ok(auditFailures(report).length > 0);
});
