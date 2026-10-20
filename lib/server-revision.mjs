import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";

export const STALE_NOTICE = "アプリが更新されています。ターミナルでサーバーを止めて start.command（npm run play）で起動し直してください。";

// Snapshot only server sources and imported browser modules, never user data.
export async function makeServerRevision({ root = new URL("../", import.meta.url), interval = 3000, now = Date.now } = {}) {
  const cached = new Map();
  async function revision() {
    const files = ["server.mjs", ...(await readdir(new URL("lib/", root))).filter((name) => name.endsWith(".mjs")).map((name) => `lib/${name}`),
      ...["engine", "story", "world", "careers"].map((name) => `public/${name}.js`)].sort();
    const hash = createHash("sha256");
    for (const file of files) {
      const url = new URL(file, root), info = await stat(url);
      const stamp = `${info.mtimeMs}:${info.ctimeMs}:${info.size}`;
      let entry = cached.get(file);
      if (entry?.stamp !== stamp) {
        entry = { stamp, hash: createHash("sha256").update(await readFile(url)).digest("hex") };
        cached.set(file, entry);
      }
      hash.update(`${file}:${entry.hash}\n`);
    }
    return hash.digest("hex");
  }
  const serverRevision = await revision();
  let checkedAt = now(), stale = false, checking;
  return async () => {
    if (now() - checkedAt >= interval && !checking) {
      checkedAt = now();
      checking = revision().then((current) => { stale = current !== serverRevision; }, () => { stale = true; }).finally(() => { checking = null; });
    }
    if (checking) await checking;
    return { serverRevision, stale };
  };
}
