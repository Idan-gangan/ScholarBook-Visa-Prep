// Run only against a disposable database: TEST_DATABASE_URL must be explicit.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {Pool}=require('pg');
if(!process.env.TEST_DATABASE_URL)throw new Error('TEST_DATABASE_URL is required');
test('PostgreSQL serializes state writes across pools and rolls back failed credentials',async()=>{
 const schema='state_test_'+require('node:crypto').randomBytes(8).toString('hex');
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL});
 const pools=[];
 try{
   await admin.query(`CREATE SCHEMA ${schema}`);
   for(let i=0;i<2;i++)pools.push(new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`}));
   await pools[0].query('CREATE TABLE app_state(id integer PRIMARY KEY,data jsonb NOT NULL); CREATE TABLE user_credentials(user_id text PRIMARY KEY,password_hash text NOT NULL)');
   await pools[0].query('INSERT INTO app_state VALUES (1,$1)',[{count:0,users:[]}]);
   const source=fs.readFileSync(require('node:path').join(__dirname,'../server.js'),'utf8');
   const code=source.slice(source.indexOf('async function mutateDb('),source.indexOf('function stateError('));
   const writers=pools.map(pool=>vm.runInNewContext(code+';mutateDb',{pool,console}));
   await Promise.all(Array.from({length:20},(_,i)=>writers[i%2](async(db)=>{db.count++;db.users.push({id:i});})));
   let data=(await pools[0].query('SELECT data FROM app_state WHERE id=1')).rows[0].data;
   assert.equal(data.count,20);assert.equal(new Set(data.users.map(u=>u.id)).size,20);
   await assert.rejects(writers[0](async(db,client)=>{db.count=999;await client.query("INSERT INTO user_credentials VALUES ('failed','hash')");throw new Error('rollback fixture');}),/rollback fixture/);
   assert.equal((await pools[1].query('SELECT * FROM user_credentials')).rows.length,0);
   await writers[1](async(db)=>{db.count++;});
   data=(await pools[0].query('SELECT data FROM app_state WHERE id=1')).rows[0].data;assert.equal(data.count,21);
   const {createEvaluationLimits}=require('../evaluation-limits');
   const limits=pools.map(pool=>createEvaluationLimits(pool));await limits[0].init();
   const reservations=await Promise.all(Array.from({length:20},(_,i)=>limits[i%2].reserve('account')));
   const tokens=reservations.filter(Boolean);assert.equal(tokens.length,1);
   await limits[1].release('account','wrong-token');assert.equal(await limits[0].reserve('account'),null);
   await limits[1].release('account',tokens[0]);
   for(let i=0;i<5;i++){const token=await limits[i%2].reserve('account');assert.ok(token);await limits[0].release('account',token);}
   assert.equal(await limits[1].reserve('account'),null);
   // Restarting the service does not reset quota.
   assert.equal(await createEvaluationLimits(pools[0]).reserve('account'),null);
   await pools[0].query("UPDATE evaluation_daily_usage SET usage_day=(NOW() AT TIME ZONE 'UTC')::date-1 WHERE user_id='account'");
   const tomorrow=await limits[1].reserve('account');assert.ok(tomorrow);
   await pools[0].query("UPDATE evaluation_daily_usage SET lease_until=NOW()-INTERVAL '1 second' WHERE user_id='account'");
   const recovered=await limits[0].reserve('account');assert.ok(recovered);
   await limits[1].release('account',tomorrow);assert.equal(await limits[0].reserve('account'),null);
   await limits[0].release('account',recovered);
 }finally{
   await Promise.all(pools.map(pool=>pool.end()));
   await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();
 }
});
