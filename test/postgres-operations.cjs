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


test('Owner cost summary groups by hashed student key and retains unattributed legacy groups separately',async()=>{
 const schema='studentcost_'+require('node:crypto').randomBytes(8).toString('hex');
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL});let pool;
 try{
  await admin.query('CREATE SCHEMA '+schema);
  pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:'-c search_path='+schema});
  const m=require('../cost-diagnostics').createCostDiagnostics(pool);await m.init();
  const {studentKey,groupKey}=require('../owner-student-analytics');
  const sample={inputAudio:100,inputText:50,cachedAudio:40,cachedText:10,outputAudio:20,outputText:10,responses:1,missing:0};
  await m.voiceStart('user-one','token1','learn',undefined,'student-one');
  await m.voiceEnd('user-one','token1',sample);
  await m.voiceStart('user-two','token2','learn',undefined,'student-two');
  await m.voiceEnd('user-two','token2',sample);
  await m.report('mock-one','report','model',{id:'response-a',usage:{input_tokens:40,output_tokens:20,input_tokens_details:{cached_tokens:0}}});
  const result=await m.summaryByStudent([groupKey('mock-one')]);
  assert.equal(result.keyed.length,2);
  assert.deepEqual(new Set(result.keyed.map(x=>x.student_key)),new Set([studentKey('student-one'),studentKey('student-two')]));
  assert.equal(result.legacy.length,1);
  assert.equal(result.legacy[0].group_key,groupKey('mock-one'));
  assert.doesNotMatch(JSON.stringify(result),/student-one|student-two|user-one|user-two|token1|token2/);
  assert.equal((await m.summaryByStudent([])).legacy.length,0);
 }finally{if(pool)await pool.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}
});
