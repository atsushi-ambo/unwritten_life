import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  advance,
  replay,
  encodeSave,
  decodeSave,
  validateGeneratedScene,
  eventFor,
  availableChoices,
} from "../public/engine.js";
import { storyRequest, sceneSchema } from "../public/story.js";
import { makeAI } from "../lib/ai.mjs";
import { readyAI } from "./fixtures/ai-replies.js";
import { makeServer } from "../server.mjs";
const profile = {
  age: 32,
  region: "city",
  job: "tech",
  income: 600,
  ai: "daily",
  priority: "balance",
  gender: "undisclosed",
  household: "solo",
  savings: 500,
  monthlyCost: 12,
  companyType: "small",
  company: "合成自社サービス社",
  workModel: "product",
  careerNotes: "自社SaaSの開発と利用者の声をもとにした改善。",
};
const ordinary = (id, label) => ({
  id,
  label,
  hint: "時間を使い、成果は保証されない",
  reason: "現在の暮らしと経験から考える",
  decision: { id, intent: label },
});
function lifeScene() {
  return {
    title: "仕事と暮らしの次の一歩",
    body: "今の仕事の経験を踏まえ、暮らしと新しい取り組みの間で時間の使い方を考える。",
    insight: "選択の結果はゲームの中の仮定です。",
    options: [
      ordinary("studyDaily", "自社サービスの信頼性を毎日学ぶ"),
      ordinary("focus", "今の会社で信頼性の改善を任せてもらう"),
      ordinary("rest", "健康と暮らしのペースを整える"),
      {
        ...ordinary("move", "大都市へ住まいを移す"),
        decision: { id: "move", intent: "大都市で暮らす", region: "metro" },
      },
    ],
  };
}
function careerScene() {
  return {
    ...lifeScene(),
    options: [
      ...["合成SaaS候補A", "合成銀行候補B", "合成研究候補C"].map((name, i) => ({
        ...ordinary("switch", `${name}で経験を生かす`),
        reason: "自社サービスで続けた改善の経験を使う",
        decision: {
          id: "switch",
          target: "custom",
          name,
          role: "tech",
          companyType: "unknown",
          candidateKind: "real",
          workModel: ["product", "inhouse", "inhouse"][i],
          proposal:
            "架空の提案として、利用者と現場をつなぐシステムの改善を考える。",
          intent: `${name}で開発の経験を生かす`,
        },
      })),
      ordinary("focus", "現職でサービス改善を続ける"),
    ],
  };
}
test("same engineer role preserves separate product/SI backgrounds and rich life context without a fixed employer list", () => {
  const product = createGame(profile, "steady", 7612026);
  const services = createGame(
    {
      ...profile,
      company: "合成SI社",
      workModel: "services",
      careerNotes: "顧客向けAWS構築と要件の整理。",
    },
    "steady",
    7612026,
  );
  const a = storyRequest(product),
    b = storyRequest(services);
  assert.equal(a.context.workplace.model, "product");
  assert.equal(b.context.workplace.model, "services");
  assert.notEqual(a.context.careerNotes, b.context.careerNotes);
  assert.equal(a.context.careerRoutes, undefined);
  assert.deepEqual(
    a.context.allowedActions.map((x) => x.id),
    availableChoices(product),
  );
  assert.match(a.messages[0].content, /会社名を固定リストから選ばない/);
  assert.match(a.messages[0].content, /学習・家族・起業・住居・休養/);
  assert.equal(sceneSchema(product).properties.options.minItems, 4);
  assert.equal(sceneSchema(product).properties.options.maxItems, 4);
  assert.equal(eventFor(product).options.length, 4);
  assert.throws(() => createGame({ ...profile, workModel: "__proto__" }));
  assert.equal(
    storyRequest(createGame({ ...profile, workModel: undefined })).context
      .workplace.model,
    "unknown",
  );
});
test("AI can offer three companies outside the catalog; selecting one persists its actual intent and unverified premise without claiming evidence", () => {
  const g = createGame(profile, "steady", 7612026);
  const scene = validateGeneratedScene(careerScene(), g, { mode: "career" });
  assert.deepEqual(validateGeneratedScene(scene, g, { mode: "career" }), scene);
  const moved = advance(g, scene.options[1].decision);
  assert.equal(moved.employer.name, "合成銀行候補B");
  assert.equal(moved.employer.workModel, "inhouse");
  assert.equal(moved.employer.unverifiedCandidate, true);
  assert.equal(moved.employer.facts, null);
  assert.equal(
    moved.history.at(-1).intention,
    scene.options[1].decision.intent,
  );
  assert.deepEqual(decodeSave(encodeSave(moved)), moved);
  assert.equal(
    storyRequest(moved).context.workplace.proposal,
    scene.options[1].decision.proposal,
  );
  assert.equal(
    storyRequest(moved).context.pastChoices.at(-1).intention,
    scene.options[1].decision.intent,
  );
  const stayed = advance(g, scene.options[3].decision);
  assert.equal(stayed.employer.name, g.employer.name);
  assert.equal(stayed.employer.workModel, "product");
});
test("non-career choices execute real engine actions and retain the concrete learning/family/region intent across replay", () => {
  const g = createGame(
    {
      ...profile,
      partner: "partner",
      children: 1,
      childStage: "young",
      childrenWish: "two",
    },
    "steady",
    7612026,
  );
  const scene = validateGeneratedScene(lifeScene(), g);
  const studied = advance(g, scene.options[0].decision);
  assert.equal(studied.studyHours, 365);
  assert.equal(studied.employer.name, g.employer.name);
  assert.match(
    storyRequest(studied).context.pastChoices.at(-1).intention,
    /信頼性/,
  );
  assert.equal(storyRequest(studied).context.family.childAges.length, 1);
  assert.deepEqual(decodeSave(encodeSave(studied)), studied);
  const moved = advance(g, scene.options[3].decision);
  assert.equal(moved.region, "metro");
  assert.notEqual(moved.region, advance(g, "move").region);
  assert.equal(replay(g.profile, g.scenario, g.seed, []).region, "city");
  const startup = {
    ...ordinary("startup", "地域の暮らしを支える事業を始める"),
    decision: {
      id: "startup",
      venture: "community",
      name: "合成生活支援工房",
      intent: "地域のケア経験を小さな事業へ",
    },
  };
  const sceneWithBusiness = validateGeneratedScene(
    { ...lifeScene(), options: [startup, ...lifeScene().options.slice(1)] },
    g,
  );
  const business = advance(g, sceneWithBusiness.options[0].decision);
  assert.equal(business.employer.name, "合成生活支援工房");
  assert.equal(business.businessStage !== null, true);
  assert.equal(business.history.at(-1).businessSetup, 180);
});
test("four-choice validation rejects invented rewards/evidence, duplicate/current companies, unavailable future companies and mismatched actions", () => {
  const g = createGame(profile, "steady", 7612026),
    base = careerScene();
  for (const patch of [
    {
      facts: {
        confirmed: true,
        sources: [{ url: "https://example.com" }],
        summary: "偽の確認",
      },
    },
    { reward: 999999 },
    { proposal: "" },
    { name: profile.company },
    { candidateKind: "fictional" },
    { role: "independent" },
    { workModel: "__proto__" },
    { intent: "target:custom" },
    { name: "未公開のAIスタートアップ" },
    { name: "グローバル展開を加速させるテック企業" },
  ]) {
    const copy = structuredClone(base);
    Object.assign(copy.options[0].decision, patch);
    assert.throws(() => validateGeneratedScene(copy, g, { mode: "career" }));
  }
  const duplicate = structuredClone(base);
  duplicate.options[1].decision.name = duplicate.options[0].decision.name;
  assert.throws(() => validateGeneratedScene(duplicate, g, { mode: "career" }));
  const aliased = structuredClone(base);
  aliased.options[0].decision.name = "NTT DATA";
  assert.throws(() =>
    validateGeneratedScene(
      aliased,
      createGame({ ...profile, company: "株式会社NTTデータ" }),
      { mode: "career" },
    ),
  );
  for (const options of [
    lifeScene().options.slice(0, 3),
    [...lifeScene().options, ordinary("learn", "学ぶ")],
  ])
    assert.throws(
      () => validateGeneratedScene({ ...lifeScene(), options }, g),
      /4択/,
    );
  const mismatch = lifeScene();
  mismatch.options[0].decision.id = "rest";
  assert.throws(() => validateGeneratedScene(mismatch, g));
  const extra = lifeScene();
  extra.options[0].decision.region = "rural";
  assert.throws(() => validateGeneratedScene(extra, g));
  assert.throws(() =>
    validateGeneratedScene(base, { ...g, retired: true }, { mode: "career" }),
  );
});
test("personalized API uses separate caches for life/career, validates exactly four, and rejects bad modes before any call", async () => {
  const requests = [];
  const ai = makeAI({
    validateDestination: async () => {},
    transport: async (_url, options) => {
      const payload = JSON.parse(options.body);
      requests.push(payload);
      const mode = JSON.parse(payload.messages[1].content).generationMode;
      return {
        status: 200,
        text: JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify(
                  mode === "career" ? careerScene() : lifeScene(),
                ),
              },
            },
          ],
        }),
      };
    },
  });
  await ai.configure({
    provider: "custom",
    baseURL: "http://127.0.0.1:1234/v1",
    model: "synthetic",
  });
  const save = encodeSave(createGame(profile));
  assert.equal(
    (await ai.generate(save, false, { personalized: true, mode: "life" })).scene
      .options.length,
    4,
  );
  assert.equal(
    (await ai.generate(save, false, { personalized: true, mode: "career" }))
      .scene.options[0].decision.name,
    "合成SaaS候補A",
  );
  assert.equal(
    (await ai.generate(save, false, { personalized: true, mode: "career" }))
      .cached,
    true,
  );
  await assert.rejects(() =>
    ai.generate(save, false, { personalized: true, mode: "shell" }),
  );
  assert.equal(requests.length, 2);
});
test("career AI rejects the retirement boundary before transport or accounting, while legacy clients retain their choice rule", async () => {
  let requests = 0;
  const ai = await readyAI(async (_url, options) => {
    requests++;
    const context = JSON.parse(JSON.parse(options.body).messages[1].content);
    assert.ok(context.allowedActions.some((a) => a.id === "switch"));
    return {
      status: 200,
      text: JSON.stringify({
        message: { content: JSON.stringify(careerScene()) },
      }),
    };
  });
  // These cases check the retirement guard itself, so the career ending is off.
  const before = createGame({ ...profile, age: 64, retirementAge: 65 }, "steady", 4,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 110),
    boundary = advance(before, "rest");
  assert.equal(boundary.age, 65);
  assert.equal(boundary.retired, false);
  for (const game of [
    boundary,
    advance(boundary, "rest"),
    advance(before, "retire"),
  ]) {
    await assert.rejects(
      () => ai.generate(encodeSave(game), false, {
        personalized: true,
        mode: "career",
      }),
      /退職後は転職の4択を生成できません/,
    );
    assert.equal(requests, 0);
    assert.equal(ai.status().calls, 0);
    assert.equal(ai.status().reservedUSD, 0);
    assert.equal(ai.status().busy, false);
  }
  assert.equal(
    (await ai.generate(encodeSave(before), false, {
      personalized: true,
      mode: "career",
    })).scene.options.length,
    4,
  );
  const legacy = JSON.parse(encodeSave(boundary));
  delete legacy.retirementFrom;
  assert.equal(
    (await ai.generate(JSON.stringify(legacy), false, {
      personalized: true,
      mode: "career",
    })).scene.options.length,
    4,
  );
  assert.equal(requests, 2);
  assert.equal(ai.status().calls, 2);
});
test("actual local HTTP route forwards the personalized career contract and rejects unsupported versions/modes before generation", async (t) => {
  let calls = 0;
  const ai = makeAI({
    validateDestination: async () => {},
    transport: async (_url, options) => {
      const request = JSON.parse(options.body);
      const context = JSON.parse(request.messages[1].content);
      assert.equal(context.life.municipality, "合成県あおば市");
      assert.equal(context.workplace.industry, "銀行・証券・保険・金融");
      calls++;
      return {
        status: 200,
        text: JSON.stringify({
          choices: [{ message: { content: JSON.stringify(careerScene()) } }],
        }),
      };
    },
  });
  await ai.configure({
    provider: "custom",
    baseURL: "http://127.0.0.1:1234/v1",
    model: "synthetic",
  });
  const server = makeServer({ ai });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const status = await (await fetch(origin + "/api/status")).json();
  assert.equal(status.choicesRevision, "personalized-four-v1");
  assert.equal(status.profileRevision, "profile-details-v1");
  const send = (extra) =>
    fetch(origin + "/api/scene", {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        "X-Unwritten-Token": status.token,
      },
      body: JSON.stringify({
        save: encodeSave(
          createGame({
            ...profile,
            municipality: "合成県あおば市",
            occupation: "infrastructure",
            industry: "finance",
            jobDetail: "銀行のクラウド運用",
          }),
        ),
        choiceVersion: 1,
        mode: "career",
        ...extra,
      }),
    });
  for (const extra of [
    { choiceVersion: 2 },
    { mode: "shell" },
    { choiceVersion: undefined },
  ])
    assert.equal((await send(extra)).status, 400);
  assert.equal(calls, 0);
  const response = await send({});
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.scene.options.length, 4);
  assert.equal(result.scene.options[0].decision.name, "合成SaaS候補A");
  assert.equal(calls, 1);
});
