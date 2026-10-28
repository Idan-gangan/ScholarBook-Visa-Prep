const {test}=require('node:test'),assert=require('node:assert/strict');
const {Pool}=require('pg');const {createOperations}=require('../operations');
if(!process.env.TEST_DATABASE_URL)throw Error('TEST_DATABASE_URL required');
test('operation counters persist and increment atomically without personal data',async()=>{
 const schema='ops_'+require('node:crypto').randomBytes(8).toString('hex');
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL});let pool;
 try{await admin.query(`CREATE SCHEMA ${schema}`);pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`});
 const ops=createOperations(pool);await ops.init();await Promise.all(Array.from({length:10},()=>ops.record('/api/evaluate',200)));await ops.record('/api/evaluate',500);await ops.record('/api/evaluate',403);
 const rows=await ops.summary();assert.equal(rows.length,1);assert.equal(rows[0].requests,12);assert.equal(rows[0].successes,10);assert.equal(rows[0].rejected,1);assert.equal(rows[0].failures,1);
 }finally{if(pool)await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});

test('cost samples persist, deduplicate, isolate users and retain unknown costs',async()=>{
 const schema='cost_'+require('node:crypto').randomBytes(8).toString('hex');
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL});let pool;
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`});
  const m=require('../cost-diagnostics').createCostDiagnostics(pool);await m.init();
  const sample={inputAudio:100,inputText:50,cachedAudio:40,cachedText:10,outputAudio:20,outputText:10,responses:1,missing:0};
  await m.voiceStart('user-a','token-a','mock');await m.voiceEnd('user-b','token-a',sample);
  assert.equal((await m.summary())[0].samples,0);
  await Promise.all([m.voiceEnd('user-a','token-a',sample),m.voiceEnd('user-a','token-a',sample)]);
  let rows=await m.summary();assert.equal(rows[0].attempts,1);assert.equal(rows[0].samples,1);assert.equal(rows[0].priced_samples,1);
  await m.voiceStart('user-a','token-b','mock');await m.voiceEnd('user-a','token-b',undefined);
  rows=await m.summary();assert.equal(rows[0].attempts,2);assert.equal(rows[0].samples,1);
  const response={id:'response-a',usage:{input_tokens:10,output_tokens:5,input_tokens_details:{cached_tokens:2}}};
  await m.report('session-a','report','test-model',response);await m.report('session-a','report','test-model',response);
  const r=(await m.summary()).find(r=>r.category==='report');assert.equal(r.attempts,1);assert.equal(r.samples,1);assert.equal(r.priced_samples,0);assert.equal(Number(r.input_tokens),10);assert.equal(r.estimated_usd,null);
 }finally{if(pool)await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
