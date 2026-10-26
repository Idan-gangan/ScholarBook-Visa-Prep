const {test}=require('node:test'),assert=require('node:assert/strict'),{Pool}=require('pg'),store=require('../record-store');
if(!process.env.TEST_DATABASE_URL)throw Error('TEST_DATABASE_URL required');
test('record migration preserves every collection; updates and rollback retain latest state atomically',async()=>{
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),schema='records_'+require('crypto').randomBytes(8).toString('hex');let pool;
 try{await admin.query('CREATE SCHEMA '+schema);pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:'-c search_path='+schema});await pool.query('CREATE TABLE app_state(id integer PRIMARY KEY,data jsonb NOT NULL);CREATE TABLE user_credentials(user_id text PRIMARY KEY,version integer);');
 const original={users:[{id:'u1',role:'athlete'},{id:'u2',role:'athlete'}],athletes:[{id:'a1',userId:'u1'},{id:'a2',userId:'u2'}],reports:[{id:'r',athleteId:'a1'}],transcripts:[{athleteId:'a1',text:'sample'}],guardianPermissions:[{tokenHash:'synthetic'}],reviews:[{userId:'u1',text:'synthetic'}],empty:[],configuration:{version:1}};
 await pool.query('INSERT INTO app_state VALUES(1,$1)',[original]);const c=await pool.connect();try{await store.migrate(c);}finally{c.release();}
 const adapter=store.create(pool);assert.deepEqual(await adapter.load(),original);assert.deepEqual(await adapter.user('u1'),original.users[0]);
 await Promise.all(Array.from({length:10},()=>adapter.mutate(async db=>{db.configuration.version++;})));assert.equal((await adapter.load()).configuration.version,11);
 await assert.rejects(adapter.mutate(async(db,c)=>{db.users=[];await c.query("INSERT INTO user_credentials VALUES('failed',1)");throw Error('simulated');}),/simulated/);assert.equal((await adapter.load()).users.length,2);assert.equal((await pool.query('SELECT * FROM user_credentials')).rowCount,0);
 await adapter.mutate(async db=>{db.users=db.users.filter(u=>u.id!=='u1');db.athletes=db.athletes.filter(a=>a.userId!=='u1');db.reports=[];db.transcripts=[];db.reviews=[];});assert.equal(await adapter.user('u1'),null);assert.ok(await adapter.user('u2'));
 const latest=await adapter.load(),rc=await pool.connect();try{await store.rollback(rc);}finally{rc.release();}assert.deepEqual((await pool.query('SELECT data FROM app_state')).rows[0].data,latest);
 }finally{if(pool)await pool.end();await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end();}
});
