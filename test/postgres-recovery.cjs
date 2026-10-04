// Real PostgreSQL, isolated schemas, mocked email only. Never use production DB.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {Pool}=require('pg');
const {createPasswordRecovery,MESSAGE}=require('../password-recovery');
const {verifyPassword}=require('../passwords');
if(!process.env.TEST_DATABASE_URL)throw new Error('TEST_DATABASE_URL is required');
const env={RESEND_API_KEY:'test-only',RESEND_FROM:'VisaAtlas <noreply@notify.visaatlasprep.com>'};
async function fixture(fn){
 const schema='recovery_test_'+crypto.randomBytes(8).toString('hex');
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL});const pools=[];
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);
  for(let i=0;i<2;i++)pools.push(new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`}));
  const pool=pools[0];
  await pool.query('CREATE TABLE user_credentials(user_id TEXT PRIMARY KEY,password_hash TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0); CREATE TABLE app_state(id INTEGER PRIMARY KEY,data JSONB NOT NULL)');
  const state={users:[{id:'u1',email:'Student@Example.com'},{id:'u2',email:'other@example.com'}],reports:[{id:'keep'}],athletes:[{id:'a1',notes:'keep'}]};
  await pool.query("INSERT INTO user_credentials VALUES ('u1','original',0),('u2','other',0)");
  await pool.query('INSERT INTO app_state VALUES(1,$1)',[state]);
  const emails=[],diagnostics=[];let behavior=async()=>({ok:true,status:200});
  const options={env,diagnostic:code=>diagnostics.push(code),send:async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');emails.push({body:JSON.parse(options.body),headers:options.headers});return behavior();}};
  const services=pools.map(pool=>createPasswordRecovery(pool,options));await services[0].init();
  const advance=()=>pool.query("UPDATE password_reset_dispatch SET next_at=NOW(),blocked_until=NOW(); UPDATE password_reset_queue SET available_at=NOW()");
  const cooldown=()=>pool.query("UPDATE password_reset_cooldowns SET available_at=NOW()-INTERVAL '1 second'");
  await fn({pool,pools,state,emails,diagnostics,services,options,advance,cooldown,setBehavior:fn=>behavior=fn});
 }finally{await Promise.all(pools.map(pool=>pool.end()));await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
}
const tokenFrom=mail=>new URL(mail.body.text.match(/https:\/\/\S+/)[0]).hash.slice(7);
const reset=token=>({token,newPassword:'A long replacement passphrase',confirmPassword:'A long replacement passphrase'});

test('durable admission uses a 60-second per-email cooldown, ignores legacy caps and coalesces pending requests',()=>fixture(async h=>{
 const {pool,services:[service,second],emails,cooldown,advance}=h;
 await pool.query('CREATE TABLE password_reset_limits(bucket TEXT PRIMARY KEY,attempts INTEGER,expires_at TIMESTAMPTZ)');
 await pool.query("INSERT INTO password_reset_limits VALUES('global',30,NOW()+INTERVAL '1 hour')");
 const replies=await Promise.allSettled(Array.from({length:10},(_,i)=>(i%2?service:second).request(' Student@Example.com ')));
 assert.equal(replies.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(replies.filter(x=>x.status==='rejected' && x.reason.status===429 && x.reason.retryAfter<=60).length,9);
 assert.equal(emails.length,0);assert.equal((await pool.query('SELECT * FROM password_reset_queue')).rowCount,1);
 await cooldown();assert.equal((await second.request('student@example.com')).message,MESSAGE);
 assert.equal((await pool.query('SELECT * FROM password_reset_queue')).rowCount,1);
 await second.request('unknown@example.com');await advance();await service.processOne();await advance();await second.processOne();
 assert.equal(emails.length,1);assert.deepEqual(emails[0].body.to,['student@example.com']);
 // Requests before registration now delay a new account at most one minute.
 await assert.rejects(service.request('unknown@example.com'),{status:429});
 await pool.query("INSERT INTO user_credentials VALUES('new','original',0)");
 await pool.query("UPDATE app_state SET data=jsonb_set(data,'{users}',(data->'users') || $1::jsonb)",[JSON.stringify([{id:'new',email:'unknown@example.com'}])]);
 await cooldown();await service.request('unknown@example.com');await advance();await second.processOne();assert.equal(emails.length,2);
}));

test('500 independent requests persist across worker restarts and drain without loss or duplicate messages',()=>fixture(async h=>{
 const {pool,pools,state,services,options,emails,advance}=h;
 state.users=Array.from({length:500},(_,i)=>({id:'bulk'+i,email:'person'+i+'@example.com'}));
 await pool.query('INSERT INTO user_credentials(user_id,password_hash) SELECT $1 || n,$2 FROM generate_series(0,499) n',['bulk','original']);
 await pool.query('UPDATE app_state SET data=$1',[state]);
 const result=await Promise.all(state.users.map((u,i)=>services[i%2].request(u.email)));
 assert.equal(result.length,500);assert.ok(result.every(r=>r.ok && r.retryAfter===60));assert.equal(emails.length,0);
 assert.equal((await pool.query('SELECT * FROM password_reset_queue')).rowCount,500);
 // Fresh objects share the persisted jobs and cross-process dispatcher lock.
 const workers=pools.map(pool=>createPasswordRecovery(pool,options));await workers[0].init();
 for(let i=0;i<500;i++){await advance();await Promise.all(workers.map(w=>w.processOne()));}
 assert.equal(emails.length,500);assert.equal(new Set(emails.map(m=>m.body.to[0])).size,500);
 assert.equal(new Set(emails.map(m=>m.headers['Idempotency-Key'])).size,500);
 assert.equal((await pool.query('SELECT * FROM password_reset_queue')).rowCount,0);
 assert.deepEqual((await pool.query('SELECT data FROM app_state')).rows[0].data,state);
}));

test('expired, reused, concurrent and superseded reset links cannot change credentials twice',()=>fixture(async h=>{
 const {pool,services:[service,second],emails,cooldown,advance,state}=h;
 async function issue(email){await cooldown();await service.request(email);await advance();await service.processOne();return tokenFrom(emails.at(-1));}
 const expired=await issue('student@example.com');await pool.query("UPDATE password_reset_tokens SET expires_at=NOW()-INTERVAL '1 second'");
 await assert.rejects(service.reset(reset(expired)),{status:400});
 const a=await issue('student@example.com'),b=await issue('student@example.com');
 const result=await Promise.allSettled([service.reset(reset(a)),second.reset(reset(b))]);
 assert.equal(result.filter(x=>x.status==='fulfilled').length,1);
 await assert.rejects(service.reset(reset(a)),{status:400});await assert.rejects(second.reset(reset(b)),{status:400});
 const saved=(await pool.query("SELECT * FROM user_credentials WHERE user_id='u1'")).rows[0];
 assert.equal(saved.version,1);assert.equal(await verifyPassword('A long replacement passphrase',saved.password_hash),true);
 const other=await issue('other@example.com');await pool.query("UPDATE user_credentials SET version=version+1 WHERE user_id='u2'");
 await assert.rejects(service.reset(reset(other)),{status:400});
 assert.deepEqual((await pool.query('SELECT data FROM app_state')).rows[0].data,state);
}));

test('retry after timeout/restart reuses the exact message and idempotency key; provider quotas pause admission',()=>fixture(async h=>{
 const {pool,pools,services:[service],options,emails,advance,cooldown,setBehavior,diagnostics}=h;
 setBehavior(async()=>{throw new TypeError('private provider details')});
 await service.request('student@example.com');await service.processOne();
 const token=tokenFrom(emails[0]);
 assert.ok(!JSON.stringify((await pool.query('SELECT * FROM password_reset_queue')).rows).includes(token));
 assert.ok(!JSON.stringify((await pool.query('SELECT * FROM password_reset_tokens')).rows).includes(token));
 // Changes to sender config must not change an already prepared idempotent message.
 const restarted=createPasswordRecovery(pools[1],{...options,env:{...env,RESEND_FROM:'Changed <changed@example.com>'}});
 setBehavior(async()=>({ok:true,status:200}));await advance();await restarted.processOne();
 assert.deepEqual(emails[1],emails[0]);assert.equal((await pool.query('SELECT * FROM password_reset_queue')).rowCount,0);
 await cooldown();await service.request('other@example.com');
 setBehavior(async()=>({ok:false,status:429,headers:{get:()=> '75'},json:async()=>({name:'daily_quota_exceeded',message:'private details'})}));
 await advance();await service.processOne();
 await assert.rejects(service.request('new@example.com'),{status:503});
 assert.ok(diagnostics.includes('PASSWORD_RECOVERY_PROVIDER_QUOTA'));
 assert.ok(diagnostics.every(code=>/^PASSWORD_RECOVERY_[A-Z0-9_]+$/.test(code)));
 assert.ok((await pool.query('SELECT available_at>NOW()+INTERVAL \'70 seconds\' AS delayed FROM password_reset_queue')).rows[0].delayed);
 // Expired queued jobs are removed, never sent as stale links.
 await pool.query("UPDATE password_reset_queue SET created_at=NOW()-INTERVAL '31 minutes'");
 const count=emails.length;await advance();await createPasswordRecovery(pools[1],options).processOne();assert.equal(emails.length,count);
}));

test('shared dispatcher prevents overlap, preserves pacing and cancels jobs when the derivation secret changes',()=>fixture(async h=>{
 const {pool,pools,services:[service,second],emails,options,advance,setBehavior}=h;
 await service.request('student@example.com');await service.request('other@example.com');
 let release,entered;const inside=new Promise(r=>entered=r);
 setBehavior(()=>{entered();return new Promise(r=>release=r)});
 const first=service.processOne();await inside;
 assert.equal(await second.processOne(),false);assert.equal(emails.length,1);
 release({ok:true,status:200});await first;
 // Force a future rate gate to verify other instances respect it.
 await pool.query("UPDATE password_reset_dispatch SET next_at=NOW()+INTERVAL '1 minute'");
 assert.equal(await second.processOne(),false);
 setBehavior(async()=>{throw new TypeError('timeout fixture')});await advance();await second.processOne();
 const sent=emails.length;
 const changed=createPasswordRecovery(pools[1],{...options,env:{...env,PASSWORD_RESET_SECRET:'x'.repeat(32)}});
 await advance();await changed.processOne();assert.equal(emails.length,sent);
 assert.equal((await pool.query('SELECT * FROM password_reset_queue')).rowCount,0);
}));

test('password changes cancel queued work before token creation',()=>fixture(async h=>{
 const {pool,services:[service],emails}=h;
 await service.request('student@example.com');
 await pool.query("UPDATE user_credentials SET version=version+1 WHERE user_id='u1'");
 await service.processOne();assert.equal(emails.length,0);
 assert.equal((await pool.query('SELECT * FROM password_reset_tokens')).rowCount,0);
 assert.equal((await pool.query('SELECT * FROM password_reset_queue')).rowCount,0);
}));
