import test from "node:test";
import assert from "node:assert/strict";
import { memoryStopReason, swapMiB } from "../scripts/local-memory.mjs";
const sample = (free, swap) => ({
  pressure: `System-wide memory free percentage: ${free}%`,
  swap: `vm.swapusage: total = 4096.00M used = ${swap} free = 1.00M (encrypted)`,
});
test("benchmark stops on new memory pressure, not swap retained from an earlier run", () => {
  const before = sample(76, "2627.19M");
  assert.equal(memoryStopReason(before, sample(30, "2627.19M")), null);
  assert.equal(memoryStopReason(before, sample(10, "3651.18M")), null);
  assert.match(
    memoryStopReason(before, sample(30, "3651.19M")),
    /Memory limit/,
  );
  assert.match(memoryStopReason(before, sample(9, "2627.19M")), /Memory limit/);
  assert.equal(swapMiB("used = 2.5G"), 2560);
  assert.equal(swapMiB("used = 1024K"), 1);
  assert.equal(swapMiB("unavailable"), null);
});
