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
  child=spawn(process.execPath,['--require','./test/fixtures/provider-stub.cjs','server.js'],{cwd:require('node:path').join(__dirname,'..'),env:{...process.env,DATABASE_URL:connection.href,RECORD_STORAGE:'enabled',MAX_CONCURRENT_VOICE:'20',PORT:String(port),COACH_EMAIL:'',COACH_PASSWORD:'',RESEND_API_KEY:'',OPENAI_API_KEY:'synthetic',AI_ENABLED:'true',VISAATLAS_SYNTHETIC_TEST:'1'},stdio:['ignore','pipe','pipe']});
  let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
  const base='http://127.0.0.1:'+port;
  for(let i=0;i<200;i++){if(child.exitCode!==null)throw Error('Test server exited: '+log);try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));if(i===199)throw Error('Startup timeout: '+log);}
  async function call(path,{method='GET',body,cookie,status=200}={}){const res=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await res.json();assert.equal(res.status,status,JSON.stringify({path,data}));return {data,cookie:res.headers.get('set-cookie')?.split(';')[0]};}
  const registered=await call('/api/register-athlete',{method:'POST',status:201,body:{name:'Synthetic student',email:'new@example.test',password,ageBand:'18+',termsAccepted:true,termsVersion:'2026-10-25'}});
  const cookie=registered.cookie,uid=registered.data.user.id,adapter=store.create(pool);
  assert.equal((await call('/api/me',{cookie})).data.needsEmailVerification,true);
  for(const path of ['/api/my-profile','/api/athletes','/api/reports','/api/learning/study-purpose'])await call(path,{cookie,status:403});
  await adapter.mutate(async db=>{db.users.find(u=>u.id===uid).emailVerifiedAt=new Date().toISOString();});
  const profile=(await call('/api/my-profile',{cookie})).data;
  await call('/api/my-profile',{method:'PUT',cookie,body:{major:'Computer Science'}});
  assert.equal((await call('/api/my-profile',{cookie})).data.major,'Computer Science');
  assert.equal((await call('/api/athletes',{cookie})).data.length,1);
  const lesson='/api/learning/study-purpose?athleteId='+profile.id;
  await call(lesson,{method:'PUT',cookie,body:{draftAnswer:'My synthetic answer',reflected:true,completed:true}});
  assert.equal((await call(lesson,{cookie})).data.progress.completed,true);
  await call('/api/learning/study-purpose?athleteId=other-profile',{cookie,status:403});
  await adapter.mutate(async db=>{db.users.find(u=>u.id===uid).emailVerifiedAt=new Date().toISOString();Object.assign(db.athletes.find(a=>a.id===profile.id),{country:'Nigeria',university:'Synthetic university',academicLevel:'Undergraduate',studyStatus:'In school',phoneCountry:'US',phone:'+12025550123',interviewCountry:'Nigeria',interviewCity:'Not booked yet',postGradPlan:'Return home',previousRefusal:'No',previousTravel:'No',previousAttempts:0,fundingSources:'Family'});});
  const voice=await fetch(base+'/api/realtime-session?athleteId='+profile.id+'&mode=mock',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/sdp'},body:'v=0\r\n'});
  assert.equal(voice.status,201,await voice.text());
  const sessionId=voice.headers.get('x-mock-session-id'),voiceToken=voice.headers.get('x-voice-token');
  assert.ok(sessionId);assert.ok(voiceToken);
  await call('/api/delete-account',{method:'POST',cookie,status:409,body:{currentPassword:password,confirmation:'DELETE'}});
  await call('/api/voice/end',{method:'POST',cookie,body:{token:voiceToken}});
  const transcript=[{role:'athlete',text:'Synthetic answer'}];
  await call('/api/mock-session/end',{method:'POST',cookie,body:{mockSessionId:sessionId,transcript}});
  const evaluation={athleteId:profile.id,mockSessionId:sessionId,transcript};
  const report=(await call('/api/evaluate',{method:'POST',cookie,body:evaluation})).data;
  assert.equal((await call('/api/evaluate',{method:'POST',cookie,body:evaluation})).data.id,report.id);
  assert.equal((await call('/api/reports',{cookie})).data.length,1);
  const pdf=await fetch(base+'/api/reports/'+report.id+'/pdf',{headers:{Cookie:cookie}});
  assert.equal(pdf.status,200);assert.match(pdf.headers.get('content-type'),/application\/pdf/);

  await call('/api/my-review',{method:'POST',cookie,body:{rating:4,displayName:'Synthetic',text:'Synthetic test review only.',adult:true,publicReview:true}});
  assert.equal((await call('/api/reviews')).data.count,0);
  const owner=(await call('/api/login',{method:'POST',body:{email:'owner@example.test',password}})).cookie;
  // Assignment changes take effect immediately in both lists and lesson access.
  await adapter.mutate(async(db,c)=>{db.users.push({id:'staff',email:'staff@example.test',role:'coach'},{id:'minor',email:'minor@example.test',role:'athlete',ageEligibility:{ageBand:'13-17',guardian:{email:'guardian@example.test'}}});db.athletes.push({id:'minor-profile',userId:'minor'});await c.query("INSERT INTO user_credentials(user_id,password_hash) VALUES('staff',$1),('minor',$1)",[await hashPassword(password)]);});
  const staff=(await call('/api/login',{method:'POST',body:{email:'staff@example.test',password}})).cookie;
  const minor=(await call('/api/login',{method:'POST',body:{email:'minor@example.test',password}})).cookie;
  assert.equal((await call('/api/athletes',{cookie:staff})).data.length,0);
  await call('/api/owner/student-access',{method:'POST',cookie:owner,body:{studentId:profile.id,staffIds:['staff'],currentPassword:password}});
  assert.equal((await call('/api/reports',{cookie:staff})).data.length,1);
  await call(lesson,{cookie:staff});
  await call('/api/owner/student-access',{method:'POST',cookie:owner,body:{studentId:profile.id,staffIds:[],currentPassword:password}});
  assert.equal((await call('/api/reports',{cookie:staff})).data.length,0);
  await call(lesson,{cookie:staff,status:403});
  await call('/api/owner/guardian-withdrawal',{method:'POST',cookie:owner,body:{userId:'minor',verifiedGuardian:true,confirmation:'WITHDRAW',currentPassword:password}});
  await call('/api/my-profile',{cookie:minor,status:401});
  await call('/api/login',{method:'POST',status:403,body:{email:'minor@example.test',password}});
  const review=(await call('/api/review-moderation' ,{cookie:owner})).data.reviews[0];
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
  // More simultaneous admissions than the default ten-connection pool. Nested
  // pool queries inside a locked mutation previously exhausted all connections.
  const batchHash=await hashPassword(password);
  await adapter.mutate(async(db,c)=>{
    for(let i=0;i<21;i++){
      db.users.push({id:'batch-u'+i,name:'Synthetic',email:'batch'+i+'@example.test',role:'athlete',emailVerifiedAt:new Date().toISOString()});
      db.athletes.push({id:'batch-a'+i,userId:'batch-u'+i,name:'Synthetic',major:'Computer Science',country:'Nigeria',university:'Synthetic university',academicLevel:'Undergraduate',studyStatus:'In school',phoneCountry:'US',phone:'+12025550123',interviewCountry:'Nigeria',interviewCity:'Not booked yet',postGradPlan:'Return home',previousRefusal:'No',previousTravel:'No',previousAttempts:0,fundingSources:'Family'});
      await c.query('INSERT INTO user_credentials VALUES($1,$2,0)',['batch-u'+i,batchHash]);
    }
  });
  const batch=[];
  for(let i=0;i<21;i++)batch.push({i,cookie:(await call('/api/login',{method:'POST',body:{email:'batch'+i+'@example.test',password}})).cookie});
  const overflow=batch.pop();
  await Promise.all(batch.map(async student=>{
    const r=await fetch(base+'/api/realtime-session?athleteId=batch-a'+student.i+'&mode=mock',{method:'POST',headers:{Cookie:student.cookie,'Content-Type':'application/sdp'},body:'v=0\r\n',signal:AbortSignal.timeout(10000)});
    assert.equal(r.status,201,await r.text());student.sessionId=r.headers.get('x-mock-session-id');student.token=r.headers.get('x-voice-token');
  }));
  const startOverflow=()=>fetch(base+'/api/realtime-session?athleteId=batch-a'+overflow.i+'&mode=mock',{method:'POST',headers:{Cookie:overflow.cookie,'Content-Type':'application/sdp'},body:'v=0\r\n'});
  const full=await startOverflow();assert.equal(full.status,429);assert.match((await full.json()).error,/slots are currently in use/);
  await call('/api/voice/end',{method:'POST',cookie:batch[0].cookie,body:{token:batch[0].token}});
  const freed=await startOverflow();assert.equal(freed.status,201,await freed.text());
  await call('/api/voice/end',{method:'POST',cookie:overflow.cookie,body:{token:freed.headers.get('x-voice-token')}});
  await Promise.all(batch.map(student=>call('/api/voice/end',{method:'POST',cookie:student.cookie,body:{token:student.token}})));
  await Promise.all(batch.map(async student=>{
    const body={athleteId:'batch-a'+student.i,mockSessionId:student.sessionId,transcript};
    const r=(await call('/api/evaluate',{method:'POST',cookie:student.cookie,body})).data;
    const saved=(await call('/api/reports',{cookie:student.cookie})).data;
    assert.equal(saved.length,1);assert.equal(saved[0].id,r.id);
    assert.equal((await call('/api/evaluate',{method:'POST',cookie:student.cookie,body})).data.id,r.id);
  }));
 }finally{
  if(child&&child.exitCode===null){child.kill();await once(child,'exit');}
  if(pool)await pool.end();await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end();
 }
});
