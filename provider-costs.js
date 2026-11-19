'use strict';
// Provider-only counters. No prompts, audio, transcripts or raw credentials are retained.
const crypto=require('node:crypto');
const {responseUsage}=require('./public/voice-cost-sample');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const valid=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000000;
const VERSION='openai-standard-2026-11-13';
// Verified official rates; expiry forces review instead of silently using stale promotional rates.
const START=Date.parse('2026-11-13T00:00:00Z'),END=Date.parse('2026-12-01T00:00:00Z');
function price(kind,model,u,at=Date.now(),tier='default'){
 if(!u||at<START||at>=END||!['default','standard'].includes(tier))return null;
 if(kind==='voice'&&model==='gpt-realtime-2.1')return ((u.inputAudio-u.cachedAudio)*32+(u.inputText-u.cachedText)*4+(u.cachedAudio+u.cachedText)*.4+u.outputAudio*64+u.outputText*24)/1e6;
 if(kind==='transcription'&&model==='gpt-transcribe'&&u.type==='duration')return u.seconds*.0045/60;
 if(kind==='text'&&['gpt-5.6-sol','gpt-5.6'].includes(model)&&u.cacheWriteTokens!==null&&u.cacheWrite30m!==null&&u.cacheWrite12h!==null){
  const long=u.inputTokens>272000;
  return ((u.inputTokens-u.cachedTokens-u.cacheWriteTokens)*(long?8:4)+u.cachedTokens*(long?.8:.4)+u.cacheWrite30m*(long?10:5)+u.cacheWrite12h*(long?20:10)+u.outputTokens*(long?30:20))/1e6;
 }
 return null;
}
function textUsage(u){
 const i=u?.input_tokens,o=u?.output_tokens,c=u?.input_tokens_details?.cached_tokens,w=u?.input_tokens_details?.cache_write_tokens;
 if(![i,o,c].every(valid)||c>i)return null;
 if(w!==undefined&&(!valid(w)||w+c>i))return null;
 // Older payloads without cache-write counters cannot establish exact text pricing.
 const d=u.input_tokens_details?.cache_write_tokens_details;
 let a=w===0?0:null,b=w===0?0:null;
 if(d){if(!valid(d.ttl_30m_tokens)||!valid(d.ttl_12h_tokens)||d.ttl_30m_tokens+d.ttl_12h_tokens!==w)return null;a=d.ttl_30m_tokens;b=d.ttl_12h_tokens;}
 return {inputTokens:i,outputTokens:o,cachedTokens:c,cacheWriteTokens:w??null,cacheWrite30m:a,cacheWrite12h:b};
}
function transcriptionUsage(u){
 if(u?.type==='duration'&&Number.isFinite(u.seconds)&&u.seconds>=0&&u.seconds<=600)return {type:'duration',seconds:u.seconds};
 if(u?.type==='tokens'&&valid(u.input_tokens)&&valid(u.output_tokens))return {type:'tokens',inputTokens:u.input_tokens,outputTokens:u.output_tokens};
 return null;
}
function createProviderCosts(pool,{now=Date.now}={}){
 async function init(){
  await pool.query(`CREATE TABLE IF NOT EXISTS ai_provider_sessions (
   sample_key TEXT PRIMARY KEY REFERENCES ai_cost_samples(sample_key) ON DELETE CASCADE,
   state TEXT NOT NULL DEFAULT 'connecting',gap BOOLEAN NOT NULL DEFAULT false,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ai_provider_events (
   event_key TEXT PRIMARY KEY,sample_key TEXT NOT NULL REFERENCES ai_cost_samples(sample_key) ON DELETE CASCADE,
   category TEXT NOT NULL,model TEXT NOT NULL,usage JSONB,cost_usd NUMERIC,rate_version TEXT,
   service_tier TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query('CREATE INDEX IF NOT EXISTS ai_provider_events_sample_idx ON ai_provider_events(sample_key)');
  await pool.query("UPDATE ai_provider_sessions SET state='interrupted',gap=true WHERE state IN ('connecting','observing') AND updated_at<NOW()-INTERVAL '10 minutes'");
 }
 async function begin(sample){await pool.query("INSERT INTO ai_provider_sessions(sample_key) VALUES($1) ON CONFLICT DO NOTHING",[sample]);}
 async function state(sample,state,gap=false){await pool.query('UPDATE ai_provider_sessions SET state=$2,gap=gap OR $3,updated_at=NOW() WHERE sample_key=$1',[sample,state,gap]);}
 async function record(sample,id,category,model,usage,tier='default'){
  if(typeof id!=='string'||!id||id.length>250)throw Error('Missing provider event identifier');
  const amount=price(category,model,usage,now(),tier);
  await pool.query(`INSERT INTO ai_provider_events(event_key,sample_key,category,model,usage,cost_usd,rate_version,service_tier)
   VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8) ON CONFLICT(event_key) DO UPDATE SET usage=EXCLUDED.usage,cost_usd=EXCLUDED.cost_usd,
    model=EXCLUDED.model,rate_version=EXCLUDED.rate_version,service_tier=EXCLUDED.service_tier
    WHERE ai_provider_events.usage IS NULL AND EXCLUDED.usage IS NOT NULL`,[hash(sample+':'+category+':'+id),sample,category,String(model).slice(0,100),usage?JSON.stringify(usage):null,amount,amount===null?null:VERSION,String(tier).slice(0,40)]);
 }
 async function event(sample,event,models){
  if(event?.type==='response.created'){
   await record(sample,event.response?.id,'voice',models.voice,null);
  }else if(event?.type==='input_audio_buffer.committed'){
   await record(sample,event.item_id+':0','transcription',models.transcription,null);
  }else if(event?.type==='response.done'){
   const r=event.response;
   await record(sample,r?.id,'voice',r?.model||models.voice,responseUsage(r?.usage),r?.service_tier||'default');
  }else if(event?.type==='conversation.item.input_audio_transcription.completed'){
   await record(sample,event.item_id+':'+event.content_index,'transcription',models.transcription,transcriptionUsage(event.usage));
  }else if(event?.type==='conversation.item.input_audio_transcription.failed'){
   await record(sample,event.item_id+':'+event.content_index,'transcription',models.transcription,null);
  }
 }
 async function report(sample,model,response){
  await record(sample,response?.id||crypto.randomUUID(),'text',response?.model||model,textUsage(response?.usage),response?.service_tier||'default');
 }
 async function byStudent(){
  return (await pool.query(`WITH events AS (
   SELECT sample_key,COUNT(*)::int events,COUNT(cost_usd)::int priced_events,SUM(cost_usd) usd,
   SUM(cost_usd) FILTER(WHERE category='voice') voice_usd,
   SUM(cost_usd) FILTER(WHERE category='transcription') transcription_usd,
   SUM(cost_usd) FILTER(WHERE category='text') text_usd
   FROM ai_provider_events GROUP BY sample_key)
   SELECT s.student_key,s.group_key,
   COUNT(*) FILTER(WHERE s.category IN ('learn','mock'))::int voice_starts,
   COUNT(p.sample_key)::int observed_sessions,
   COUNT(*) FILTER(WHERE s.category IN ('learn','mock') AND (p.sample_key IS NULL OR p.gap OR p.state<>'closed'))::int incomplete_sessions,
   COUNT(*) FILTER(WHERE s.category IN ('report','review','practice') AND e.sample_key IS NULL)::int legacy_text_requests,
   COALESCE(SUM(e.events),0)::int events,COALESCE(SUM(e.priced_events),0)::int priced_events,
   SUM(e.usd) usd,SUM(e.voice_usd) voice_usd,SUM(e.transcription_usd) transcription_usd,SUM(e.text_usd) text_usd
   FROM ai_cost_samples s LEFT JOIN ai_provider_sessions p USING(sample_key) LEFT JOIN events e USING(sample_key)
   WHERE s.created_at>=NOW()-INTERVAL '30 days' GROUP BY s.student_key,s.group_key`)).rows;
 }
 async function exportPeriod(start,end){
  const a=Date.parse(start),b=Date.parse(end);
  if(!Number.isFinite(a)||!Number.isFinite(b)||a>=b||b-a>31*86400000)throw Object.assign(Error('Choose a period of at most 31 days.'),{status:400,publicMessage:'Choose a period of at most 31 days.'});
  const rows=(await pool.query(`SELECT (e.created_at AT TIME ZONE 'UTC')::date::text AS day,e.category,e.model,e.service_tier,e.rate_version,
   COUNT(*)::int events,COUNT(e.cost_usd)::int priced_events,SUM(e.cost_usd)::text calculated_usd
   FROM ai_provider_events e WHERE e.created_at >= $1 AND e.created_at < $2
   GROUP BY 1,2,3,4,5 ORDER BY 1,2,3`,[new Date(a).toISOString(),new Date(b).toISOString()])).rows;
  const gaps=(await pool.query(`SELECT COUNT(*)::int attempts,
   COUNT(*) FILTER(WHERE s.category IN ('learn','mock') AND (p.sample_key IS NULL OR p.gap OR p.state<>'closed'))::int incomplete_voice_sessions,
   COUNT(*) FILTER(WHERE s.category NOT IN ('learn','mock') AND NOT EXISTS(SELECT 1 FROM ai_provider_events e WHERE e.sample_key=s.sample_key))::int unrecorded_text_requests
   FROM ai_cost_samples s LEFT JOIN ai_provider_sessions p USING(sample_key) WHERE s.created_at >= $1 AND s.created_at < $2`,[new Date(a).toISOString(),new Date(b).toISOString()])).rows[0];
  return {start:new Date(a).toISOString(),end:new Date(b).toISOString(),currency:'USD',basis:'provider_usage_calculated_not_invoice',retentionDays:30,rows,gaps};
 }
 return {init,begin,state,event,report,byStudent,exportPeriod};
}
module.exports={createProviderCosts,price,textUsage,transcriptionUsage,hash,VERSION};
