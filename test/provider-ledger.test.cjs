'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {createCostDiagnostics}=require('../cost-diagnostics');
const {hash}=require('../provider-costs');
const usage={input_tokens:150,output_tokens:30,input_token_details:{audio_tokens:100,text_tokens:50,cached_tokens:50,cached_tokens_details:{audio_tokens:40,text_tokens:10}},output_token_details:{audio_tokens:20,text_tokens:10}};
test('durable provider ledger deduplicates retries, keeps attribution, flags gaps, and cascades deletion',async()=>{
 const db=new PGlite();try{
  const costs=createCostDiagnostics(db,{now:()=>Date.parse("2026-11-13T12:00:00Z")});await costs.init();
  await costs.voiceStart('u','t','mock','mock1','student1');
  await costs.voiceStart('u2','t2','learn',null,'student2');
  const sample=hash('u:t');await costs.provider.begin(sample);await costs.provider.state(sample,'observing');
  await costs.provider.event(sample,{type:'response.created',response:{id:'resp1'}},{voice:'gpt-realtime-2.1'});
  const event={type:'response.done',response:{id:'resp1',usage}};
  await Promise.all(Array.from({length:12},()=>costs.provider.event(sample,event,{voice:'gpt-realtime-2.1'})));
  await costs.provider.event(sample,{type:'input_audio_buffer.committed',item_id:'item1'},{transcription:'gpt-transcribe'});
  let rows=(await db.query('SELECT * FROM ai_provider_events')).rows;
  assert.equal(rows.length,2);assert.equal(rows.filter(r=>r.usage!==null).length,1);
  await costs.provider.event(sample,{type:'conversation.item.input_audio_transcription.completed',item_id:'item1',content_index:0,usage:{type:'duration',seconds:30}},{transcription:'gpt-transcribe'});
  await costs.provider.state(sample,'closed');
  // Browser values cannot overwrite the provider ledger or become a second provider total.
  await costs.voiceEnd('u','t',{inputAudio:999999,inputText:1,cachedAudio:0,cachedText:0,outputAudio:1,outputText:1,responses:1,missing:0});
  const summaries=await costs.provider.byStudent(),one=summaries.find(r=>r.group_key===hash('mock1'));
  assert.equal(one.events,2);assert.equal(one.priced_events,2);assert.equal(Number(one.usd),.00587);
  assert.equal(one.incomplete_sessions,0);assert.equal(summaries.find(r=>r!==one).incomplete_sessions,1);
  const exported=await costs.provider.exportPeriod(new Date(Date.now()-10000).toISOString(),new Date(Date.now()+10000).toISOString());
  assert.equal(exported.gaps.incomplete_voice_sessions,1);assert.equal(exported.rows.length,2);
  await assert.rejects(()=>costs.provider.exportPeriod('invalid','2026-12-01'));
  await db.query('DELETE FROM ai_cost_samples WHERE sample_key=$1',[sample]);
  assert.equal((await db.query('SELECT COUNT(*)::int n FROM ai_provider_events')).rows[0].n,0);
  assert.equal((await db.query('SELECT COUNT(*)::int n FROM ai_provider_sessions')).rows[0].n,0);
 }finally{await db.close();}
});
test('text requests survive network/JSON failures and billable malformed output retains usage',async()=>{
 const db=new PGlite();try{
  const costs=createCostDiagnostics(db,{now:()=>Date.parse("2026-11-13T12:00:00Z")});await costs.init();
  await assert.rejects(()=>costs.measuredFetch('m','report','gpt-5.6-sol','student',async()=>{throw Error('timeout')}));
  const bad=await costs.measuredFetch('m','review','gpt-5.6-sol','student',async()=>({json:async()=>{throw Error('bad json')}}));
  await assert.rejects(()=>bad.json());
  const response=await costs.measuredFetch('m','report','gpt-5.6-sol','student',async()=>({json:async()=>({id:'resp-text',model:'gpt-5.6-sol',output_text:'invalid report structure',usage:{input_tokens:100,output_tokens:20,input_tokens_details:{cached_tokens:10,cache_write_tokens:0}}})}));
  await response.json();
  const rows=(await db.query('SELECT * FROM ai_cost_samples')).rows;assert.equal(rows.length,3);assert.equal(rows.filter(r=>r.finished_at===null).length,2);
  const events=(await db.query('SELECT * FROM ai_provider_events')).rows;assert.equal(events.length,1);assert.equal(Number(events[0].cost_usd),.000764);
  assert.doesNotMatch(JSON.stringify(events),/invalid report structure|resp-text/);
 }finally{await db.close();}
});
