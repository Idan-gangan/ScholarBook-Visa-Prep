// Optional integration test: node --test test/postgres-voice.cjs
// TEST_DATABASE_URL must point to a disposable PostgreSQL database.
const assert=require('node:assert/strict');
const {createVoiceLimits}=require('../voice-limits');
async function exerciseVoiceAdmission(first,second=first){
 let hangupFails=false;
 const request=async()=>({ok:!hangupFails,status:hangupFails?503:200});
 const a=createVoiceLimits(first,'fixture',request),b=createVoiceLimits(second,'fixture',request);
 await a.init();
 const tokens=await Promise.all(Array.from({length:20},(_,i)=>(i%2?a:b).acquire('account')));
 assert.equal(tokens.filter(Boolean).length,1);
 const token=tokens.find(Boolean);
 await a.track('/v1/realtime/calls/rtc_sql','mock','account');await a.attach('account',token,'/v1/realtime/calls/rtc_sql');
 await b.end('different-account',token);assert.equal(await b.acquire('account'),null);
 await first.query("UPDATE voice_admission SET last_started=NOW()-INTERVAL '20 seconds',pending_until=NOW()-INTERVAL '1 second' WHERE user_id='account'");
 assert.equal(await b.acquire('account'),null); // attached calls outlive pending lease
 hangupFails=true;await assert.rejects(b.end('account',token));
 await first.query("UPDATE voice_call_limits SET expires_at=NOW()-INTERVAL '1 second'");
 await b.sweep();assert.equal(await a.acquire('account'),null);
 hangupFails=false;await b.sweep();const next=await a.acquire('account');assert.ok(next);
 await b.end('account',token);assert.equal(await b.acquire('account'),null);
 await a.end('account',next);assert.equal(await b.acquire('account'),null); // cooldown survives release
 await first.query("UPDATE voice_admission SET last_started=NOW()-INTERVAL '20 seconds'");
 const pending=await b.acquire('account');assert.ok(pending);
 await first.query("UPDATE voice_admission SET pending_until=NOW()-INTERVAL '1 second',last_started=NOW()-INTERVAL '100 seconds'");
 const recovered=await a.acquire('account');assert.ok(recovered);assert.notEqual(recovered,pending);
 await a.end('account',recovered);
 await first.query("UPDATE voice_admission SET last_started=NOW()-INTERVAL '20 seconds'");
 await a.track('/v1/realtime/calls/rtc_orphan','mock','account');
 assert.equal(await b.acquire('account'),null); // tracked but unattached call still blocks
 await first.query("UPDATE voice_call_limits SET expires_at=NOW()-INTERVAL '1 second'");
 await b.sweep();assert.ok(await b.acquire('account'));
}
module.exports={exerciseVoiceAdmission};
if(require.main===module){
 const {test}=require('node:test'),{Pool}=require('pg');
 if(!process.env.TEST_DATABASE_URL)throw Error('TEST_DATABASE_URL is required');
 test('PostgreSQL voice admission serializes across pools and recovers safely',async()=>{
  const schema='voice_test_'+require('node:crypto').randomBytes(8).toString('hex');
  const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pools=[];
  try{
   await admin.query('CREATE SCHEMA '+schema);
   for(let i=0;i<2;i++)pools.push(new Pool({connectionString:process.env.TEST_DATABASE_URL,options:'-c search_path='+schema}));
   await exerciseVoiceAdmission(...pools);
  }finally{
   await Promise.all(pools.map(p=>p.end()));
   await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end();
  }
 });
}
