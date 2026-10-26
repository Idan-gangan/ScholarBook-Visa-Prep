// Integrated adapter benchmark. Synthetic data, local disposable schema only.
const {Pool}=require('pg'),store=require('../record-store'),{performance}=require('node:perf_hooks');
const url=process.env.TEST_DATABASE_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Local test database required');
(async()=>{
 const schema='capacity_'+require('crypto').randomBytes(8).toString('hex'),admin=new Pool({connectionString:url});let pool;
 try{
  await admin.query('CREATE SCHEMA '+schema);pool=new Pool({connectionString:url,options:'-c search_path='+schema,max:5});
  await pool.query('CREATE TABLE app_state(id integer PRIMARY KEY,data jsonb NOT NULL)');
  const results=[];
  for(const accounts of [200,1000,10000]){
   const state={users:[],athletes:[],reports:[],transcripts:[],mockSessions:[]};
   for(let i=0;i<accounts;i++){state.users.push({id:'u'+i,email:'synthetic'+i+'@example.test',role:'athlete'});state.athletes.push({id:'a'+i,userId:'u'+i,major:'Synthetic program'});state.reports.push({id:'r'+i,athleteId:'a'+i,feedback:'x'.repeat(512)});state.transcripts.push({id:'t'+i,athleteId:'a'+i,text:'x'.repeat(1024)});}
   await pool.query('DROP TABLE IF EXISTS record_store_rows,record_store_meta');
   await pool.query('INSERT INTO app_state VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data',[state]);
   const c=await pool.connect();try{await store.migrate(c);}finally{c.release();}
   const adapter=store.create(pool);
   for(const concurrency of [10,25,50,100]){
    let failures=0;const times=[],started=performance.now();
    await Promise.all(Array.from({length:concurrency},async(_,i)=>{const start=performance.now(),scope={userId:'u'+i,athleteId:'a'+i};try{
     if(i%5===0)await adapter.mutate(async db=>{db.athletes[0].note='Synthetic '+i;},scope);
     else{const db=await adapter.load(scope);if(db.users.length!==1||db.athletes.length!==1||db.reports.length!==1)throw Error('Scope mismatch');}
    }catch(e){failures++;console.error(e.message);}times.push(performance.now()-start);}));
    times.sort((a,b)=>a-b);const row={accounts,concurrentOperations:concurrency,failures,p95ms:+times[Math.ceil(times.length*.95)-1].toFixed(1),elapsedMs:+(performance.now()-started).toFixed(1),rssMiB:+(process.memoryUsage().rss/1048576).toFixed(1)};
    results.push(row);console.log('RECORD_CAPACITY '+JSON.stringify(row));
    if(failures)throw Error('Capacity test failures');
   }
  }
  console.log('CAPACITY_SCOPE: integrated database adapter; 80% student reads/20% profile writes; pool 5; GitHub runner, not Render; excludes real voice/AI, sustained HTTP load and heavy admin operations. Not a concurrent-user guarantee.');
 }finally{if(pool)await pool.end();await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end();}
})().catch(e=>{console.error(e);process.exitCode=1;});
