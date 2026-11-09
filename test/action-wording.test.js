import test from 'node:test';import assert from 'node:assert/strict';
import{createGame,profileInputForLevel,optionalProfileInputs,validateGeneratedScene,encodeSave,decodeSave}from'../public/engine.js';
import{storyRequest}from'../public/story.js';import{fourReply}from'./fixtures/ai-replies.js';
test('fresh family-planning wording cannot disguise a possible birth as family time; old scenes preserve wording',()=>{
 const game=createGame(optionalProfileInputs(profileInputForLevel({age:30,occupation:'office',partner:'partner',children:0,childrenWish:'one'},'advanced')));
 const raw=fourReply(storyRequest(game).context);raw.options[3]={id:'familyPlan',label:'家族との時間を最優先する',hint:'家族と過ごす',reason:'暮らしのため',decision:{id:'familyPlan',intent:'家族と過ごす時間を増やす'}};
 const fresh=validateGeneratedScene(raw,game,{fresh:true});const option=fresh.options.find(o=>o.id==='familyPlan');assert.match(option.label,/新しい家族/);assert.match(option.hint,/増える可能性/);assert.match(option.decision.intent,/迎える準備/);
 const old=validateGeneratedScene(raw,game,{fresh:false});assert.equal(old.options[3].label,raw.options[3].label);
 assert.deepEqual(decodeSave(encodeSave(game)),game);
});
