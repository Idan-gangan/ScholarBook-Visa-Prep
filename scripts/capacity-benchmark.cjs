// Synthetic database-core burst benchmark, NOT a production concurrent-user limit.
const {Pool}=require('pg'),fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const url=process.env.TEST_DATABASE_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname)||new URL(url).pathname!=='/visaatlas_capacity_test')throw Error('Dedicated local visaatlas_capacity_test database required');
const pool=new Pool({connectionString:url,max:5});
const source=fs.readFileSync('server.js','utf8');
const load=vm.runInNewContext(source.slice(source.indexOf('async function loadDb('),source.indexOf('// All state writers'))+';loadDb',{pool});
const mutate=vm.runInNewContext(source.slice(source.indexOf('async function mutateDb('),source.indexOf('function stateError('))+';mutateDb',{pool,console});
const results=[];
(async()=>{await pool.query('CREATE TABLE app_state(id integer PRIMARY KEY,data jsonb NOT NULL)');
for(const accounts of [200,1000,10000]){
 const db={users:[],athletes:[],reports:[],transcripts:[]};
 for(let i=0;i<accounts;i++){db.users.push({id:'u'+i,name:'Synthetic '+i,email:'student'+i+'@example.test',role:'athlete'});db.athletes.push({id:'a'+i,userId:'u'+i,university:'Test university',major:'Test program'});db.reports.push({id:'r'+i,athleteId:'a'+i,summary:crypto.randomBytes(256).toString('hex')});db.transcripts.push({athleteId:'a'+i,text:crypto.randomBytes(512).toString('hex')});}
 await pool.query('INSERT INTO app_state VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data',[db]);const bytes=Buffer.byteLength(JSON.stringify(db));
 for(const concurrency of [10,25,50,100]){
 const times=[];let failures=0;const start=performance.now();let peak=0;const timer=setInterval(()=>{peak=Math.max(peak,process.memoryUsage().rss)},20);
 await Promise.all(Array.from({length:concurrency},async(_,i)=>{const t=performance.now();try{if(i%5===0)await mutate(async data=>{data.athletes[i%accounts].lastTestNote='synthetic '+i;});else{const data=await load();if(!data.users.find(u=>u.id==='u'+(i%accounts)))throw Error('Missing synthetic user');}}catch{failures++;}times.push(performance.now()-t);}));clearInterval(timer);peak=Math.max(peak,process.memoryUsage().rss);times.sort((a,b)=>a-b);const elapsed=performance.now()-start;
 const row={accounts,concurrentOperations:concurrency,stateMiB:+(bytes/1048576).toFixed(2),operations:times.length,failures,p50ms:+times[Math.floor(times.length*.5)].toFixed(1),p95ms:+times[Math.min(times.length-1,Math.ceil(times.length*.95)-1)].toFixed(1),elapsedMs:+elapsed.toFixed(1),opsPerSecond:+(times.length*1000/elapsed).toFixed(2),processPeakMiB:+(peak/1048576).toFixed(1)};results.push(row);console.log(JSON.stringify(row));
 }
}
fs.writeFileSync('capacity-results.json',JSON.stringify({scope:'Synthetic PostgreSQL app_state read/write bursts; 80% reads, 20% writes, five database connections. No HTTP, login, email, OpenAI or real audio. GitHub runner hardware differs from Render; not a user-capacity certification.',results},null,2));
})().finally(()=>pool.end()).catch(e=>{console.error(e.message);process.exitCode=1});
