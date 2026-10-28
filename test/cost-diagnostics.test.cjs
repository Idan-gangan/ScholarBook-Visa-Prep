const {test}=require('node:test'),assert=require('node:assert/strict');
const counters=require('../public/voice-cost-sample');
const {voiceSample,voiceEstimate,reportSample,createCostDiagnostics}=require('../cost-diagnostics');
const usage={input_tokens:150,output_tokens:30,input_token_details:{audio_tokens:100,text_tokens:50,cached_tokens:50,cached_tokens_details:{audio_tokens:40,text_tokens:10}},output_token_details:{audio_tokens:20,text_tokens:10}};
test('voice cost counts each response once, separates cached tokens, and never copies speech',()=>{
 const c=counters.create();for(let i=0;i<2;i++)c.add({id:'resp_1',usage,output:['private speech']});
 assert.equal(c.sample().responses,1);assert.equal(c.sample().inputAudio,100);assert.doesNotMatch(JSON.stringify(c.sample()),/private|resp_1/);
 assert.ok(Math.abs(voiceEstimate(c.sample())-(60*32+40*4+50*.4+20*64+10*24)/1e6)<1e-10);
 c.add({id:'resp_2'});assert.equal(c.sample().missing,1);assert.equal(voiceEstimate(c.sample()),null);
});
test('missing or malformed token counts are unknown rather than zero dollars',()=>{
 for(const u of [undefined,{}, {...usage,input_tokens:1},{...usage,output_tokens:-1},{...usage,input_token_details:{...usage.input_token_details,cached_tokens:500}}])assert.equal(counters.responseUsage(u),null);
 assert.equal(voiceEstimate(counters.create().sample()),null);
 assert.equal(voiceSample({...counters.create().sample(),inputAudio:NaN}),null);
 assert.equal(reportSample({input_tokens:3,output_tokens:2}),null);
 assert.deepEqual(reportSample({input_tokens:3,output_tokens:2,input_tokens_details:{cached_tokens:1},text:'private'}),{inputTokens:3,outputTokens:2,cachedTokens:1});
});
test('stored diagnostics exclude identities, credentials, transcript and extra sample fields',async()=>{
 const queries=[],m=createCostDiagnostics({query:async(sql,args)=>{queries.push({sql,args});return {rows:[]}}});
 const c=counters.create();c.add({id:'resp_a',usage});
 await m.voiceStart('private-user','secret-token','learn');await m.voiceEnd('private-user','secret-token',{...c.sample(),transcript:'private speech'});
 await m.report('private-session','report','gpt-5.6',{id:'provider-id',usage:{input_tokens:3,output_tokens:2,input_tokens_details:{cached_tokens:0}},output_text:'private output'});
 assert.doesNotMatch(JSON.stringify(queries),/private-user|secret-token|private speech|private-session|provider-id|private output/);
 assert.equal(queries[0].args[0],queries.find(q=>q.sql.startsWith('UPDATE')).args[0]);
});
test('diagnostic write failure does not block practice or expose database errors',async()=>{
 const logs=[],m=createCostDiagnostics({query:async()=>{throw Error('secret connection string')}},{log:x=>logs.push(x)});
 await m.voiceStart('u','t','mock');await m.voiceEnd('u','t',{});await m.report('m','report','model',{});
 assert.deepEqual(logs,Array(3).fill('[cost] DIAGNOSTICS_UNAVAILABLE'));
});
