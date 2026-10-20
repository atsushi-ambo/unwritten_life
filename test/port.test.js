import { test } from "node:test";
import assert from "node:assert/strict";
import { appPort, DEFAULT_PORT } from "../lib/port.mjs";
import { destination } from "../lib/network.mjs";

test("the app port defaults to 4341 and rejects invalid values", () => {
  assert.equal(DEFAULT_PORT, 4341);
  assert.equal(appPort({}), 4341);
  assert.equal(appPort({ PORT: "4342" }), 4342);
  for (const PORT of ["80", "70000", "abc", "4341.5"]) assert.throws(() => appPort({ PORT }), /Invalid PORT/);
});

test("an AI destination on the game port itself is refused, other loopback ports are allowed", async () => {
  await assert.rejects(() => destination(`http://127.0.0.1:${appPort()}`, true), /ポート/);
  assert.equal((await destination("http://127.0.0.1:11434", true)).address, "127.0.0.1");
});
