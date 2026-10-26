const {test}=require('node:test'),assert=require('node:assert/strict'),{Pool}=require('pg'),store=require('../record-store');
if(!process.env.TEST_DATABASE_URL)throw Error('TEST_DATABASE_URL required');
test('record migration preserves every collection; updates and rollback retain latest state atomically',async()=>{
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),schema='records_'+require('crypto').randomBytes(8).toString('hex');let pool;
 try{await admin.query('CREATE SCHEMA '+schema);pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:'-c search_path='+schema});await pool.query('CREATE TABLE app_state(id integer PRIMARY KEY,data jsonb NOT NULL);CREATE TABLE user_credentials(user_id text PRIMARY KEY,version integer);');
 const original={users:[{id:'u1',role:'athlete'},{id:'u2',role:'athlete'}],athletes:[{id:'a1',userId:'u1'},{id:'a2',userId:'u2'}],reports:[{id:'r',athleteId:'a1'}],transcripts:[{athleteId:'a1',text:'sample'}],guardianPermissions:[{tokenHash:'synthetic'}],reviews:[{userId:'u1',text:'synthetic'}],empty:[],configuration:{version:1}};
 await pool.query('INSERT INTO app_state VALUES(1,$1)',[original]);const c=await pool.connect();try{await store.migrate(c);}finally{c.release();}
 const adapter=store.create(pool);assert.deepEqual(await adapter.load(),original);assert.deepEqual(await adapter.user('u1'),original.users[0]);
 // Actual SQL permission checks cover students, every staff role, owners and revocation.
 assert.equal((await adapter.reportsFor('u1')).length,1);
 assert.deepEqual(await adapter.reportsFor('u2'),[]);
 assert.deepEqual(await adapter.studentsFor('missing'),[]);
 await adapter.mutate(async db=>{db.users.push({id:'staff',role:'coach'},{id:'owner',role:'owner'});db.athletes[0].staffIds=['staff'];});
 for(const role of ['coach','supervisor','manager']){
   await adapter.mutate(async db=>{db.users.find(u=>u.id==='staff').role=role;});
   assert.deepEqual((await adapter.studentsFor('staff')).map(a=>a.id),['a1']);
   assert.equal((await adapter.reportsFor('staff')).length,1);
 }
 assert.equal((await adapter.studentsFor('owner')).length,2);
 await adapter.mutate(async db=>{db.athletes[0].staffIds=[];});
 assert.deepEqual(await adapter.reportsFor('staff'),[]);
 await adapter.mutate(async db=>{db.users[0].accessSuspended=true;});
 assert.deepEqual(await adapter.studentsFor('u1'),[]);
 assert.deepEqual(await adapter.reportsFor('u1'),[]);
 await adapter.mutate(async db=>{delete db.users[0].accessSuspended;db.users=db.users.filter(u=>!['owner','staff'].includes(u.id));});
 // Scoped writes must preserve other students, collection ordering and global metadata.
 await adapter.mutate(async db=>{db.athletes[0].note='Scoped profile edit';},{userId:'u1',athleteId:'a1'});
 assert.equal((await adapter.load()).athletes[0].note,'Scoped profile edit');
 assert.deepEqual((await adapter.load()).athletes[1],original.athletes[1]);
 await adapter.mutate(async db=>{db.reviews.push({id:'new-review',userId:'u2'});},{collections:['reviews']});
 assert.deepEqual((await adapter.load()).configuration,{version:1});
 assert.equal((await adapter.load()).transcripts.length,1);
 await adapter.mutate(async db=>{db.transcripts.push({id:'new-transcript',athleteId:'a1',text:'new'});},{userId:'u1',athleteId:'a1'});
 assert.equal((await adapter.load()).transcripts.length,2);
 await Promise.all(Array.from({length:10},()=>adapter.mutate(async db=>{db.configuration.version++;})));assert.equal((await adapter.load()).configuration.version,11);
 await assert.rejects(adapter.mutate(async(db,c)=>{db.users=[];await c.query("INSERT INTO user_credentials VALUES('failed',1)");throw Error('simulated');}),/simulated/);assert.equal((await adapter.load()).users.length,2);assert.equal((await pool.query('SELECT * FROM user_credentials')).rowCount,0);
 await adapter.mutate(async db=>{db.users=db.users.filter(u=>u.id!=='u1');db.athletes=db.athletes.filter(a=>a.userId!=='u1');db.reports=[];db.transcripts=[];db.reviews=[];});assert.equal(await adapter.user('u1'),null);assert.ok(await adapter.user('u2'));
 const latest=await adapter.load(),rc=await pool.connect();try{await store.rollback(rc);}finally{rc.release();}assert.deepEqual((await pool.query('SELECT data FROM app_state')).rows[0].data,latest);
 }finally{if(pool)await pool.end();await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end();}
});
