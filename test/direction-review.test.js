import test from "node:test";
import assert from "node:assert/strict";
import {createGame,advanceDirection,directionReview,encodeSave,decodeSave,rewindTo} from "../public/engine.js";
const profile={age:32,region:"city",job:"tech",income:500,savings:700,monthlyCost:12,rent:7,ai:"sometimes",priority:"balance",gender:"undisclosed",household:"solo",companyType:"small",company:"合成企業"};
const start=()=>createGame(profile,"steady",42);

test("direction review includes the first year and never changes the save",()=>{
  const initial=start();
  assert.equal(directionReview(initial),null);
  const game=advanceDirection(initial,{id:"learn",intent:"運用の設計を学ぶ"},{years:1}).game;
  const saved=encodeSave(game),view=directionReview(game);
  assert.equal(view.years,1);
  assert.equal(view.fromYear,2026);
  assert.equal(view.toYear,2026);
  assert.equal(view.intention,"運用の設計を学ぶ");
  assert.equal(view.changes.income,game.income-initial.income);
  assert.equal(view.changes.savings,game.savings-initial.savings);
  assert.equal(view.changes.health,game.health-initial.health);
  assert.equal(encodeSave(game),saved);
  assert.deepEqual(directionReview(decodeSave(saved)),view);
});

test("later reviews compare only their own direction and rewind drops future changes",()=>{
  const first=advanceDirection(start(),"rest",{years:1}).game;
  const next=advanceDirection(first,"focus",{years:1}).game;
  const view=directionReview(next);
  assert.equal(view.step,1);
  assert.equal(view.changes.savings,next.savings-first.savings);
  assert.deepEqual(directionReview(rewindTo(next,1)),directionReview(first));
  assert.equal(directionReview(rewindTo(next,0)),null);
  const old=JSON.parse(encodeSave(next));
  delete old.directionBlocks;
  assert.equal(directionReview(decodeSave(JSON.stringify(old))),null);
});

test("shortened directions and missing old metrics do not invent five years or zero balances",()=>{
  const ended=advanceDirection(createGame({...profile,age:64},"steady",42),"retire").game;
  assert.equal(directionReview(ended).years,1);
  const first=advanceDirection(start(),"rest",{years:1}).game;
  const next=advanceDirection(first,"focus",{years:1}).game;
  const incomplete=structuredClone(next);
  delete incomplete.history[0].savings;
  assert.equal(directionReview(incomplete).changes.savings,null);
  incomplete.history[1].incident={title:"記録した転機"};
  incomplete.history[1].familyOutcome={title:"家族の節目"};
  assert.deepEqual(new Set(directionReview(incomplete).moments.map(m=>m.title)),new Set(["記録した転機","家族の節目"]));
});

test("five-year reviews use exact blocks, and never guess a legacy or partially rewound period",()=>{
  let journey;
  for(let seed=0;seed<100;seed++) {
    const g=createGame(profile,"steady",seed);
    const candidate=advanceDirection(g,"rest");
    if(candidate.entries.length===5){journey=candidate;break;}
  }
  assert.ok(journey);
  const game=journey.game,view=directionReview(game);
  assert.equal(view.years,5);
  assert.equal(view.toYear-view.fromYear,4);
  assert.equal(view.changes.savings,game.savings-createGame(profile,"steady",game.seed).savings);
  assert.equal(directionReview({...game,directionBlocks:[]}),null);
  assert.equal(directionReview({...game,directionBlocks:[[0,4]]}),null);
  assert.equal(directionReview(rewindTo(game,3)),null);
});
