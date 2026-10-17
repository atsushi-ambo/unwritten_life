import test from "node:test";
import assert from "node:assert/strict";
import { modelEvaluationCases } from "../scripts/model-eval-fixtures.mjs";
import { encodeSave, decodeSave } from "../public/engine.js";
import { storyRequest, sceneSchema } from "../public/story.js";

test("model evaluation uses reproducible valid saves with difficult authoritative outcomes", () => {
  const fixtures = modelEvaluationCases();
  assert.deepEqual(modelEvaluationCases(), fixtures);
  const cases = Object.fromEntries(fixtures.map((f) => [f.id, f.game]));
  for (const id of ["study-income-fall", "startup-success-income-fall"]) {
    assert.equal(cases[id].history.at(-1).outcome.kind, "success");
    assert.ok(cases[id].income < cases[id].profile.income);
  }
  assert.equal(cases["business-failure"].employer.kind, "seeking");
  assert.equal(cases["family-wish"].family.childAges.length, 2);
  assert.equal(cases["family-wish"].family.desired, 3);
  assert.equal(cases.retired.retired, true);
  for (const { game, mode } of fixtures) {
    assert.deepEqual(decodeSave(encodeSave(game)), game);
    const request = storyRequest(game, { mode });
    assert.ok(request.messages[0].content);
    assert.equal(sceneSchema(game, { mode }).properties.options.minItems, 4);
    assert.equal(sceneSchema(game, { mode }).properties.options.maxItems, 4);
  }
});

test("profile-sensitive evaluation covers separate work and family contexts rather than one engineer", () => {
  const fixtures = modelEvaluationCases();
  const context = (id) =>
    storyRequest(fixtures.find((f) => f.id === id).game).context;
  const si = context("si-profile"),
    product = context("product-marketing"),
    care = context("regional-care");
  assert.equal(si.workplace.model, "services");
  assert.equal(product.workplace.model, "product");
  assert.equal(care.workplace.model, "public");
  assert.equal(si.companyEvidence.confirmed, true);
  assert.equal(si.life.municipality, "あおば市");
  assert.equal(product.family.childAges.length, 1);
  assert.match(care.workplace.startingWork.jobDetail, /看護/);
  assert.equal(context("business-failure").companyEvidence, null);
});
