// Full HTTP requests against a disposable migrated database; never real email or AI.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Pool}=require('pg'),{spawn}=require('node:child_process'),{once}=require('node:events');
const store=require('../record-store'),{hashPassword}=require('../passwords');
const url=process.env.TEST_DATABASE_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Local TEST_DATABASE_URL required');
test('record mode HTTP: registration, login, profile, learning, reviews, export, recovery and deletion', {timeout:120000},async()=>{
 const schema='http_'+require('crypto').randomBytes(8).toString('hex'),admin=new Pool({connectionString:url});let pool,child;
 const password='Synthetic test password 123!';
 try{
  await admin.query('CREATE SCHEMA '+schema);
  const connection=new URL(url);connection.searchParams.set('options','-c search_path='+schema);
  pool=new Pool({connectionString:connection.href});
  await pool.query('CREATE TABLE app_state(id integer PRIMARY KEY,data jsonb NOT NULL);CREATE TABLE user_credentials(user_id text PRIMARY KEY,password_hash text NOT NULL,version integer NOT NULL DEFAULT 0)');
  await pool.query('INSERT INTO app_state VALUES(1,$1)',[{users:[{id:'owner',name:'Owner',email:'owner@example.test',role:'owner'},{id:'other',email:'other@example.test',role:'athlete'}],athletes:[{id:'other-profile',userId:'other'}],reports:[],transcripts:[],mockSessions:[]}]);
  await pool.query('INSERT INTO user_credentials VALUES($1,$2,0)',['owner',await hashPassword(password)]);
  const client=await pool.connect();try{await store.migrate(client);}finally{client.release();}
  const net=require('node:net'),probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
  child=spawn(process.execPath,['server.js'],{cwd:require('node:path').join(__dirname,'..'),env:{...process.env,DATABASE_URL:connection.href,RECORD_STORAGE:'enabled',PORT:String(port),COACH_EMAIL:'',COACH_PASSWORD:'',RESEND_API_KEY:'',OPENAI_API_KEY:'',AI_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
  let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
  const base='http://127.0.0.1:'+port;
  for(let i=0;i<200;i++){if(child.exitCode!==null)throw Error('Test server exited: '+log);try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));if(i===199)throw Error('Startup timeout: '+log);}
  async function call(path,{method='GET',body,cookie,status=200}={}){const res=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await res.json();assert.equal(res.status,status,JSON.stringify({path,data}));return {data,cookie:res.headers.get('set-cookie')?.split(';')[0]};}
  const registered=await call('/api/register-athlete',{method:'POST',status:201,body:{name:'Synthetic student',email:'new@example.test',password,ageBand:'18+',termsAccepted:true,termsVersion:'2026-10-25'}});
  const cookie=registered.cookie,uid=registered.data.user.id,adapter=store.create(pool);
  const profile=(await call('/api/my-profile',{cookie})).data;
  await call('/api/my-profile',{method:'PUT',cookie,body:{major:'Computer Science'}});
  assert.equal((await call('/api/my-profile',{cookie})).data.major,'Computer Science');
  assert.equal((await call('/api/athletes',{cookie})).data.length,1);
  const lesson='/api/learning/study-purpose?athleteId='+profile.id;
  await call(lesson,{method:'PUT',cookie,body:{draftAnswer:'My synthetic answer',reflected:true,completed:true}});
  assert.equal((await call(lesson,{cookie})).data.progress.completed,true);
  await call('/api/learning/study-purpose?athleteId=other-profile',{cookie,status:403});
  await adapter.mutate(async db=>{db.users.find(u=>u.id===uid).emailVerifiedAt=new Date().toISOString();db.mockSessions.push({id:'session',userId:uid,athleteId:profile.id});});
  await call('/api/mock-session/end',{method:'POST',cookie,body:{mockSessionId:'session',transcript:[{role:'athlete',text:'Synthetic answer'}]}});
  await call('/api/my-review',{method:'POST',cookie,body:{rating:4,displayName:'Synthetic',text:'Synthetic test review only.',adult:true,publicReview:true}});
  assert.equal((await call('/api/reviews')).data.count,0);
  const owner=(await call('/api/login',{method:'POST',body:{email:'owner@example.test',password}})).cookie;
  const review=(await call('/api/review-moderation',{cookie:owner})).data.reviews[0];
  await call('/api/review-moderation',{method:'POST',cookie:owner,body:{id:review.id,status:'published'}});
  assert.equal((await call('/api/reviews')).data.count,1);
  const exported=(await call('/api/export-account',{method:'POST',cookie,body:{currentPassword:password}})).data;
  assert.equal(exported.profiles.length,1);assert.equal(exported.learningProgress.length,1);assert.equal(exported.mockSessions[0].transcript.length,1);
  // Recovery must see a user created AFTER migration, absent from legacy app_state.
  const messages=[],recovery=require('../password-recovery').createPasswordRecovery(pool,{recordStorage:true,env:{RESEND_API_KEY:'synthetic',RESEND_FROM:'test@example.test'},send:async(_url,opt)=>{messages.push(JSON.parse(opt.body));return {ok:true};}});
  await recovery.init();await recovery.request('new@example.test');await recovery.processOne();assert.equal(messages.length,1);
  const token=new URL(messages[0].text.match(/https:\/\/\S+/)[0]).hash.slice(7),replacement='Replacement synthetic password 123!';
  await call('/api/reset-password',{method:'POST',body:{token,newPassword:replacement,confirmPassword:replacement}});
  await call('/api/my-profile',{cookie,status:401});
  const next=(await call('/api/login',{method:'POST',body:{email:'new@example.test',password:replacement}})).cookie;
  await call('/api/delete-account',{method:'POST',cookie:next,body:{currentPassword:replacement,confirmation:'DELETE'}});
  await call('/api/my-profile',{cookie:next,status:401});
  assert.equal(await adapter.user(uid),null);assert.ok(await adapter.user('other'));
  assert.equal((await call('/api/reviews')).data.count,0);
 }finally{
  if(child&&child.exitCode===null){child.kill();await once(child,'exit');}
  if(pool)await pool.end();await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end();
 }
});
