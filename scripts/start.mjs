import { spawn, execFile } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { STALE_NOTICE } from "../lib/server-revision.mjs";
import { makeServer } from "../server.mjs";

const port = Number(process.env.PORT ?? 4317);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid PORT");
const url = `http://127.0.0.1:${port}`;
const browser = () => {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "explorer.exe"
        : "xdg-open";
  execFile(command, [url], () => {});
};
try {
  const res = await fetch(`${url}/api/status`, {
    signal: AbortSignal.timeout(1000),
  });
  const data = await res.json();
  if (!data.token || !data.ai) throw new Error("Port in use");
  if (data.stale || !data.serverRevision) {
    console.error(STALE_NOTICE);
    process.exit(1);
  }
  console.log(`起動済みのゲームを開きます: ${url}`);
  browser();
  process.exit(0);
} catch (error) {
  if (error.message === "Port in use")
    throw new Error(
      "このポートは別のアプリが使用しています。PORTを変更してください。",
    );
}

let ownedOllama;
try {
  await fetch("http://127.0.0.1:11434/api/tags", {
    signal: AbortSignal.timeout(1000),
  });
} catch {
  ownedOllama = spawn("ollama", ["serve"], {
    env: {
      ...process.env,
      OLLAMA_HOST: "127.0.0.1:11434",
      OLLAMA_NO_CLOUD: "1",
    },
    stdio: "ignore",
  });
  ownedOllama.on("error", () =>
    console.log("Ollamaが見つかりません。ゲームのAI設定で別の接続先を選んでください。"),
  );
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch("http://127.0.0.1:11434/api/tags", {
        signal: AbortSignal.timeout(500),
      });
      if (res.ok) break;
    } catch {}
    await delay(300);
  }
}
const server = makeServer();
server.requestTimeout = 10000;
server.headersTimeout = 10000;
server.on("error", (error) => {
  console.error(`ゲームを起動できません: ${error.code ?? "error"}`);
  ownedOllama?.kill();
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => {
  console.log(
    `Unwritten Life を起動しました: ${url}\n終了するにはこのターミナルで Ctrl+C。`,
  );
  browser();
});
function stop() {
  ownedOllama?.kill();
  server.close();
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
