// Pseudonymous, short-lived diagnostics. Not a billing or entitlement ledger.
const crypto=require('node:crypto');
const {keys}=require('./public/voice-cost-sample');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const number=n=>Number.isSafeInteger(n)&&n>=0&&n<=10000000;
// USD per million tokens, checked against OpenAI pricing on 2026-10-28.
const VOICE_RATES={inputAudio:32,inputText:4,cachedAudio:.4,cachedText:.4,outputAudio:64,outputText:24};
function voiceSample(s){
 if(!s||!keys.every(k=>number(s[k]))||!number(s.responses)||s.responses>256||!number(s.missing)||s.cachedAudio>s.inputAudio||s.cachedText>s.inputText)return null;
 return Object.fromEntries([...keys,'responses','missing'].map(k=>[k,s[k]]));
}
function voiceEstimate(s){
 if(!s||!s.responses||s.missing)return null;
 return ((s.inputAudio-s.cachedAudio)*VOICE_RATES.inputAudio+(s.inputText-s.cachedText)*VOICE_RATES.inputText+s.cachedAudio*VOICE_RATES.cachedAudio+s.cachedText*VOICE_RATES.cachedText+s.outputAudio*VOICE_RATES.outputAudio+s.outputText*VOICE_RATES.outputText)/1e6;
}
function reportSample(u){
 if(!u||!number(u.input_tokens)||!number(u.output_tokens)||!number(u.input_tokens_details?.cached_tokens)||u.input_tokens_details.cached_tokens>u.input_tokens)return null;
 return {inputTokens:u.input_tokens,outputTokens:u.output_tokens,cachedTokens:u.input_tokens_details.cached_tokens};
}
function createCostDiagnostics(pool,{log=console.warn}={}){
 let nextCleanup=0;
 async function safe(fn){try{return await fn()}catch{log('[cost] DIAGNOSTICS_UNAVAILABLE');return null}}
 async function cleanup(){if(Date.now()<nextCleanup)return;nextCleanup=Date.now()+3600000;await pool.query("DELETE FROM ai_cost_samples WHERE created_at < NOW()-INTERVAL '30 days'")}
 async function init(){await pool.query(`CREATE TABLE IF NOT EXISTS ai_cost_samples (
 sample_key TEXT PRIMARY KEY, group_key TEXT NOT NULL, category TEXT NOT NULL, model TEXT NOT NULL,
 source TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), finished_at TIMESTAMPTZ,
 usage JSONB, elapsed_seconds NUMERIC, estimated_usd NUMERIC)`);await pool.query('CREATE INDEX IF NOT EXISTS ai_cost_samples_created_idx ON ai_cost_samples(created_at)');}
 async function voiceStart(userId,token,mode,sessionId){return safe(async()=>{if(!['learn','mock'].includes(mode))return;const key=hash(userId+':'+token);await pool.query(`INSERT INTO ai_cost_samples(sample_key,group_key,category,model,source) VALUES($1,$3,$2,'gpt-realtime-2.1','browser_diagnostic') ON CONFLICT DO NOTHING`,[key,mode,sessionId?hash(sessionId):key]);await cleanup()})}
 async function voiceEnd(userId,token,sample){return safe(async()=>{const s=voiceSample(sample);await pool.query(`UPDATE ai_cost_samples SET finished_at=NOW(),usage=$2::jsonb,elapsed_seconds=LEAST(480,GREATEST(0,EXTRACT(EPOCH FROM NOW()-created_at))),estimated_usd=$3 WHERE sample_key=$1 AND source='browser_diagnostic' AND finished_at IS NULL`,[hash(userId+':'+token),s?JSON.stringify(s):null,voiceEstimate(s)])})}
 async function report(sessionId,phase,model,response){return safe(async()=>{
  if(!['report','review'].includes(phase))return;
  const s=reportSample(response?.usage),key=hash(response?.id||crypto.randomUUID());
  await pool.query(`INSERT INTO ai_cost_samples(sample_key,group_key,category,model,source,usage,finished_at) VALUES($1,$2,$3,$4,'provider_response',$5::jsonb,NOW()) ON CONFLICT DO NOTHING`,[key,hash(sessionId),phase,String(response?.model||model).slice(0,100),s?JSON.stringify(s):null]);await cleanup();
 })}
 async function summary(){return (await pool.query(`SELECT category,model,source,COUNT(*)::int AS attempts,COUNT(usage)::int AS samples,COUNT(estimated_usd)::int AS priced_samples,COUNT(DISTINCT group_key)::int AS sessions,SUM(elapsed_seconds) AS elapsed_seconds,SUM(estimated_usd) AS estimated_usd,SUM((usage->>'inputTokens')::bigint) AS input_tokens,SUM((usage->>'cachedTokens')::bigint) AS cached_tokens,SUM((usage->>'outputTokens')::bigint) AS output_tokens FROM ai_cost_samples WHERE created_at>=NOW()-INTERVAL '30 days' GROUP BY category,model,source ORDER BY category,model`)).rows}
 return {init,voiceStart,voiceEnd,report,summary};
}
module.exports={createCostDiagnostics,voiceSample,voiceEstimate,reportSample};
