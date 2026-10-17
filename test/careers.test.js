import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPLOYERS,
  careerOffers,
  careerCandidates,
} from "../public/careers.js";
import {
  JOBS,
  createGame,
  advance,
  encodeSave,
  decodeSave,
  validateDecision,
} from "../public/engine.js";
import { storyRequest } from "../public/story.js";
const profile = {
  age: 30,
  region: "city",
  job: "tech",
  income: 500,
  ai: "sometimes",
  priority: "balance",
  gender: "undisclosed",
  household: "solo",
  savings: 500,
  monthlyCost: 12,
  companyType: "small",
  company: "合成企業",
};
test("career offers contain two different plausible industries, staying and a different surprise; each is executable", () => {
  for (const job of Object.keys(JOBS))
    for (const year of [2026, 2036, 2041])
      for (const seed of [0, 1, 42, 7612026]) {
        let g = createGame({ ...profile, job }, "steady", seed);
        while (g.year < year && !g.ended) g = advance(g, "rest");
        if (g.ended || g.retired) continue;
        const offers = careerOffers(g);
        assert.deepEqual(
          offers.map((o) => o.id),
          ["familiar", "bridge", "stay", "surprise"],
        );
        const moving = offers.filter((o) => typeof o.decision === "object");
        assert.equal(new Set(moving.map((o) => o.decision.target)).size, 3);
        assert.equal(new Set(moving.map((o) => o.industry)).size, 3);
        for (const offer of offers) {
          assert.ok(offer.reason && offer.work && offer.tradeoff);
          validateDecision(offer.decision, g);
          const next = advance(g, offer.decision);
          assert.equal(next.year, g.year + 1);
          assert.deepEqual(
            decodeSave(encodeSave(next)).employer,
            next.employer,
          );
        }
        const stayed = advance(g, offers[2].decision);
        assert.deepEqual(stayed.employer, g.employer);
        assert.equal(stayed.careerMoves, g.careerMoves);
        assert.equal(stayed.history.at(-1).choice, "focus");
      }
});
test("example engineer gets NTT DATA, Mizuho, staying and Chugai; marketers receive marketing work, and choices rotate", () => {
  const g = createGame(profile, "steady", 7612026);
  assert.deepEqual(
    careerOffers(g).map((o) => o.company),
    ["NTTデータ", "みずほ銀行", "合成企業", "中外製薬"],
  );
  const marketing = createGame(
    { ...profile, job: "marketing" },
    "steady",
    7612026,
  );
  const offers = careerOffers(marketing);
  assert.ok(
    offers
      .filter((o) => o.id !== "stay")
      .every((o) => o.role === "marketing" && o.work.includes("顧客")),
  );
  assert.notDeepEqual(
    offers.map((o) => o.company),
    careerOffers(g).map((o) => o.company),
  );
  const next = advance(g, "focus");
  assert.notDeepEqual(
    careerOffers(next).map((o) => o.company),
    careerOffers(g).map((o) => o.company),
  );
  assert.deepEqual(
    storyRequest(g, { personalized: false }).context.careerRoutes.map(
      (o) => o.company,
    ),
    careerOffers(g).map((o) => o.company),
  );
});
test("current and recently worked employers are excluded or deprioritized, aliases are recognized, future companies obey founding dates", () => {
  for (const [id, c] of Object.entries(EMPLOYERS)) {
    const g = createGame(
      { ...profile, company: c.aliases?.[0] ?? c.name },
      "steady",
      7612026,
    );
    assert.ok(!careerCandidates(g).some((x) => x.id === id));
    const moving = careerOffers(g).filter(
      (o) => typeof o.decision === "object",
    );
    assert.ok(!moving.some((o) => o.decision.target === id));
    assert.ok(
      moving.every((o) => EMPLOYERS[o.decision.target].industry !== c.industry),
    );
  }
  const g = createGame(profile, "steady", 7612026);
  assert.ok(
    careerOffers(g)
      .filter((o) => o.kind)
      .every((o) => o.kind === "real"),
  );
  const switched = advance(g, careerOffers(g)[0].decision);
  assert.ok(
    !careerOffers(switched).some(
      (o) => o.decision?.target === switched.employer.id,
    ),
  );
  const returned = advance(
    advance(g, { id: "switch", target: "microsoft", role: "tech" }),
    { id: "switch", target: "nttdata", role: "tech" },
  );
  assert.equal(careerOffers(returned)[0].company, "LayerX");
  assert.equal(careerOffers({ ...g, retired: true }).length, 0);
  assert.equal(careerOffers({ ...g, ended: true }).length, 0);
  const seeking = {
    ...g,
    employer: { ...g.employer, kind: "seeking", name: "次の仕事を探している" },
  };
  assert.equal(careerOffers(seeking)[2].decision, "rest");
});
