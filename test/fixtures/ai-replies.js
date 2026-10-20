// Synthetic AI replies for tests. A reply is built from the request context, so
// it always uses the actions the game currently allows.
import { makeAI } from "../../lib/ai.mjs";

const companies = ["合成商事", "合成ソフト", "合成ロジ"];
export function fourReply(context, { career = context.generationMode === "career", ...overrides } = {}) {
  const ids = context.allowedActions.map((a) => a.id);
  const options = career
    ? [
        ...companies.map((name, i) => ({
          id: "switch",
          label: `${name}で経験を生かす`,
          hint: "移行の負担がある",
          reason: "これまでの仕事との接点",
          decision: {
            id: "switch", target: "custom", name, role: "tech", companyType: "unknown",
            candidateKind: "real", workModel: i ? "services" : (context.workplace?.model ?? "unknown") === "unknown" ? "product" : context.workplace.model,
            proposal: "経験を生かす架空の役割", intent: "仕事の幅を広げる",
          },
        })),
        ...["focus", "rest"].filter((id) => ids.includes(id)).slice(0, 1).map((id) => ({
          id, label: "今の場所で続ける", hint: "変化は小さい", reason: "今の経験を積む",
          decision: { id, intent: "今の仕事を深める" },
        })),
      ]
    : ids
        .filter((id) => !["switch", "startup", "move", "opportunity"].includes(id))
        .slice(0, 4)
        .map((id) => ({
          id, label: `合成の${id}`, hint: "時間の配分", reason: "本人の条件",
          decision: { id, intent: `${id}を試す` },
        }))
        // Between jobs one path looks for the next job, as the game requires.
        .map((o, i, all) => context.currentEmployer === "次の仕事を探している" && ids.includes("switch") && i === all.length - 1
          ? { id: "switch", label: "次の仕事を探す", hint: "条件が合うとは限らない", reason: "これまでの経験",
            decision: { id: "switch", target: "custom", name: "合成クラウド社", role: "tech", companyType: "unknown",
              candidateKind: "real", workModel: "services", proposal: "経験を生かす架空の役割", intent: "次の仕事を探す" } }
          : o);
  return {
    title: "学びを仕事へ",
    body: "会社と暮らしを考え、次の一年を選ぶ。直前の結果を受けて、何を続けるかを考える。",
    insight: "これは仮想の場面。",
    options,
    ...overrides,
  };
}
export const isVerification = (options) => JSON.parse(options.body).messages.at(-1).content === '{"ok":true} をそのまま返してください。';
export function replyFor(options, overrides) {
  if (isVerification(options)) return { ok: true };
  const payload = JSON.parse(options.body);
  const messages = payload.messages;
  return fourReply(JSON.parse(messages.at(-1).content), overrides);
}
export const ollamaText = (scene) => JSON.stringify({ message: { content: JSON.stringify(scene) } });
export const chatText = (scene) => JSON.stringify({ choices: [{ message: { content: JSON.stringify(scene) } }] });

// An AI connected to a stub Ollama that lists "qwen3:8b".
export async function readyAI(transport, { config = {}, ...options } = {}) {
  const ai = makeAI({
    validateDestination: async () => {},
    ...options,
    transport: async (url, request = {}) =>
      url.endsWith("/api/tags")
        ? { status: 200, text: JSON.stringify({ models: [{ name: "qwen3:8b" }] }) }
        : isVerification(request)
          ? { status: 200, text: ollamaText({ ok: true }) }
          : transport(url, request),
  });
  await ai.configure({ provider: "ollama", model: "qwen3:8b", ...config });
  return ai;
}
