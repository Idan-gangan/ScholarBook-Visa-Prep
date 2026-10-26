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
