import test from 'node:test';
import assert from 'node:assert/strict';
import {validateExtractedProfile,extractionRequest} from '../public/profile-extraction.js';
import {makeAI} from '../lib/ai.mjs';
import {isVerification,readyAI,ollamaText} from './fixtures/ai-replies.js';
test('bulk extraction accepts explicit facts, zero, and unit conversion without defaults',()=>{
 const text='30歳です。年収は500万円。貯金0円。子どもは現在2人です。';
 assert.deepEqual(validateExtractedProfile({fields:{age:{value:30,evidence:'30歳'},income:{value:500,evidence:'年収は500万円'},savings:{value:0,evidence:'貯金0円'},children:{value:2,evidence:'現在2人'}}},text).fields.age.value,30);
 assert.deepEqual(validateExtractedProfile({fields:{}},text),{fields:{}});
});
test('bulk extraction rejects unsupported keys, injected evidence, ambiguous amounts and future children',()=>{
 for(const [key,value,evidence,text] of [['age',50,'30歳','30歳'],['income',500,'月収500万円','月収500万円'],['children',2,'希望は2人','希望は2人'],['company','秘密企業','合成社','合成社']])assert.throws(()=>validateExtractedProfile({fields:{[key]:{value,evidence}}},text));
 assert.throws(()=>validateExtractedProfile(JSON.parse('{"fields":{"__proto__":{"value":"x","evidence":"文字"}}}'),'文字'));
 assert.throws(()=>extractionRequest('x'.repeat(6001)));
});
test('local profile extraction shares attempt cap and never starts a game',async()=>{
 let calls=0;
 const ai=makeAI({validateDestination:async()=>{},transport:async(url,options)=>{
 if(url.endsWith('/api/tags'))return {status:200,text:JSON.stringify({models:[{name:'synthetic-model'}]})};
 const body=JSON.parse(options.body);if(isVerification(options))return {status:200,text:ollamaText({ok:true})};calls++;return {status:200,text:ollamaText({fields:{age:{value:30,evidence:'30歳'}}})};
 }});
 await ai.configure({provider:'ollama',model:'synthetic-model',requestCap:1});
 const result=await ai.extractProfile('私は30歳です。');assert.equal(result.profile.fields.age.value,30);assert.equal(ai.status().calls,1);
 await assert.rejects(ai.extractProfile('私は30歳です。'),/上限/);assert.equal(calls,1);
});
test('zero children without a numeric unit is explicit, debt is not an asset and substring numbers do not match',()=>{
 assert.equal(validateExtractedProfile({fields:{children:{value:0,evidence:'子どもはいません'}}},'子どもはいません').fields.children.value,0);
 assert.throws(()=>validateExtractedProfile({fields:{children:{value:2,evidence:'12人'}}},'12人'));
 assert.throws(()=>validateExtractedProfile({fields:{savings:{value:300,evidence:'借金300万円'}}},'借金300万円'));
});
test('spoken housing and family wishes stay distinct from current family counts',()=>{
 const text='持ち家です。子どもはいません。希望は2人です。';
 const out=validateExtractedProfile({fields:{housing:{value:'own',evidence:'持ち家です'},children:{value:0,evidence:'子どもはいません'},childrenWish:{value:'two',evidence:'希望は2人です'}}},text);
 assert.equal(out.fields.children.value,0);assert.equal(out.fields.childrenWish.value,'two');assert.equal(out.fields.housing.value,'own');
});
