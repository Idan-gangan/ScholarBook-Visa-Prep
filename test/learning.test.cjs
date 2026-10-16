const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {Readable}=require('node:stream');
const learning=require('../learning');
const passwords=require('../passwords');
const student={id:'s1',userId:'u1',name:'Test student',major:'Biology',university:'Example University',scholarship:'Merit award',scholarshipCoverage:'Tuition only',remainingSponsor:'Parent',postGradPlan:'Environmental research',email:'private@example.test',country:'Nigeria',phoneCountry:'NG',phone:'+2348031234567',interviewCountry:'Nigeria',interviewCity:'Lagos',studyStatus:'Not started yet',previousRefusal:'No',previousTravel:'No',previousAttempts:0,fundingSources:'Family / guardian'};
function harness(user={id:'u1',role:'athlete'},env={}){
 let handler;const starts=new Map();const progress=new Map(),calls=[],logs=[];
 const credentials=new Map([[user.id,{password_hash:user.passwordHash||'fixture-unusable',version:0}]]);
 const evaluationUsage=new Map();
 const db={users:[user],athletes:[{academicLevel:'Undergraduate',...structuredClone(student)},{id:'s2',userId:'u2'}],reports:[],transcripts:[]};
 const pool={query:async(sql,args)=>{
   if(sql.trim().startsWith('ALTER TABLE') || sql.trim().startsWith('CREATE TABLE') || sql.trim().startsWith('INSERT INTO app_state'))return {rows:[]};
   if(sql.startsWith('INSERT INTO user_credentials')){if(!credentials.has(args[0]))credentials.set(args[0],{password_hash:args[1],version:0});return {rows:[]};}
   if(sql.startsWith('SELECT password_hash'))return {rows:credentials.has(args[0])?[structuredClone(credentials.get(args[0]))]:[]};
   if(sql==='UPDATE user_credentials SET version=version+1 WHERE user_id=$1'){const c=credentials.get(args[0]);if(c)c.version++;return {rows:[]};}
   if(sql.startsWith('UPDATE user_credentials')){const c=credentials.get(args[1]);if(!c||c.password_hash!==args[2]||c.version!==args[3])return {rows:[]};c.password_hash=args[0];c.version++;return {rows:[{version:c.version}]};}
   if(sql.startsWith('UPDATE app_state SET data=jsonb_set')){for(const u of db.users)delete u.passwordHash;return {rows:[]};}
   if(sql.includes('FROM app_state'))return {rows:[{data:structuredClone(db)}]};
   if(sql.startsWith('UPDATE app_state')){Object.assign(db,structuredClone(args[0]));return {rows:[]}}
   if(sql.startsWith('SELECT data FROM learning_progress'))return {rows:progress.has(args[0]+":"+args[1])?[{data:progress.get(args[0]+":"+args[1])}]:[]};
   if(sql.startsWith('INSERT INTO learning_progress')){progress.set(args[0]+":"+args[1],JSON.parse(args[2]));return {rows:[]}}
   if(sql.startsWith('INSERT INTO evaluation_daily_usage')){
     const row=evaluationUsage.get(args[0])||{attempts:0,completed:0,token:null};
     if(row.token||row.attempts>=args[3]||row.completed>=args[4])return {rows:[]};row.attempts++;row.token=args[1];evaluationUsage.set(args[0],row);return {rows:[{attempts:row.attempts}]};
   }
   if(sql.startsWith('UPDATE evaluation_daily_usage')){const row=evaluationUsage.get(args[0]);if(row?.token===args[1]){row.token=null;if(sql.includes('completed=completed+1')){row.completed++;return {rows:[{user_id:args[0]}]};}}return {rows:[]};}
   if(sql.startsWith('SELECT attempts,completed'))return {rows:evaluationUsage.has(args[0])?[evaluationUsage.get(args[0])]:[]};
   if(sql.startsWith('INSERT INTO voice_mode_usage')){const key=args[0]+':'+args[2],n=starts.get(key)||0;if(n>=args[1])return {rows:[]};starts.set(key,n+1);return {rows:[{starts:n+1}]};}
   if(sql.startsWith('SELECT starts FROM voice_mode_usage'))return {rows:[{starts:starts.get(args[0]+':'+args[1])||0}]};
   if(sql.startsWith('INSERT INTO voice_call_limits'))return {rows:[]};
   throw new Error('Unexpected query: '+sql);
 }};
 let queue=Promise.resolve();
 pool.connect=async()=>{
   let unlock,snapshot,credentialSnapshot;
   return {query:async(sql,args)=>{
     if(sql==='BEGIN')return {rows:[]};
     if(sql.includes('FROM app_state') && sql.includes('FOR UPDATE')){
       const previous=queue;queue=new Promise(resolve=>unlock=resolve);await previous;
       snapshot=structuredClone(db);credentialSnapshot=structuredClone(credentials);
       return {rows:[{data:structuredClone(db)}]};
     }
     if(sql==='ROLLBACK'){
       if(snapshot){Object.assign(db,snapshot);credentials.clear();for(const [k,v] of credentialSnapshot)credentials.set(k,v);}
       return {rows:[]};
     }
     if(sql==='COMMIT')return {rows:[]};
     return pool.query(sql,args);
   },release(){if(unlock)unlock();}};
 };
 const context=vm.createContext({require:id=>id==='./interview-design'?require('../interview-design'):id==='./public/profile-requirements'?require('../public/profile-requirements'):id==='./interview-posts.json'?require('../interview-posts.json'):id==='./email-verification'?require('../email-verification'):id==='./profile-options'?require('../profile-options'):id==='./owner-access'?require('../owner-access'):id==='./report-practice'?require('../report-practice'):id==='http'?{createServer:fn=>{handler=fn;return {}}}:id==='pg'?{Pool:function(){return pool}}:id==='fs'?{...fs,readFileSync:(file,...args)=>file===path.resolve(__dirname,'../data/db.json')?'{}':fs.readFileSync(file,...args)}:id==='./evaluation-limits'?require('../evaluation-limits'):id==='./voice-limits'?require('../voice-limits'):id==='./learning'?learning:id==='./passwords'?passwords:id==='./password-recovery'?require('../password-recovery'):require(id),__dirname:path.resolve(__dirname,'..'),process:{env:{OPENAI_API_KEY:'test-only',...env}},console:{log:(...args)=>logs.push(args.join(' ')),warn:(...args)=>logs.push(args.join(' ')),error:(...args)=>logs.push(args.join(' '))},Buffer,URL,FormData,AbortSignal,fetch:async(url,options)=>{if(url.endsWith('/responses')){calls.push({url,request:JSON.parse(options.body)});return {ok:true,json:async()=>({output_text:JSON.stringify(JSON.parse(options.body).input.includes('VISAATLAS_EVIDENCE_REPORT_V3')?{summary:'Only limited answers were captured.',strengths:[],assessments:require('../interview-design').TOPICS.map(([topic])=>({topic,status:'not_covered'}))}:{scores:{},overall:45,readiness:'High Concern',biggestWeakness:'Test',feedback:'Test feedback',nextStep:'Practice'})})};}calls.push({url,session:JSON.parse(options.body.get('session'))});return {ok:true,status:200,headers:{get:()=>'/v1/realtime/calls/rtc_test'},text:async()=> 'test-sdp-answer'}}});
 let source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');source=source.slice(0,source.indexOf('initDb().then('));vm.runInContext(source,context);vm.runInContext(`sessions.set('test-token',{userId:${JSON.stringify(user.id)},version:0,expires:Date.now()+60000})`,context);
 async function request(method,url,body,authenticated=true){
   // Existing evaluation fixtures represent distinct server-issued mock sessions.
   // Explicit null/invalid IDs exercise missing-session rejection instead.
   if(url==='/api/evaluate'&&body?.transcript&&body.mockSessionId===undefined&&authenticated&&learning.canAccessStudent(user,db.athletes.find(a=>a.id===body.athleteId))){
     const id='fixture_'+require('node:crypto').createHash('sha256').update(JSON.stringify([body.athleteId,body.transcript.map(x=>({role:x.role,text:x.text}))])).digest('hex');
     db.mockSessions??=[];
     if(!db.mockSessions.some(x=>x.id===id))db.mockSessions.push({id,userId:user.id,athleteId:body.athleteId,createdAt:new Date().toISOString()});
     body={...body,mockSessionId:id};
   }
   const req=Readable.from(body===undefined?[]:[Buffer.from(typeof body==='string'?body:JSON.stringify(body))]);req.method=method;req.url=url;req.headers={'content-type':'application/json',host:'localhost',cookie:authenticated?'sb_session=test-token':''};
   const result={};await handler(req,{writeHead:(status,headers)=>{result.status=status;result.headers=headers;},end:text=>{result.text=text;try{result.body=JSON.parse(text)}catch{}}});return result;
 }
 return {request,progress,calls,db,logs,credentials,init:()=>vm.runInContext('initDb()',context),run:code=>vm.runInContext(code,context)};
}
test('unverified users cannot spend voice or evaluation allowance; me never exposes verification tokens',async()=>{
 const h=harness({id:'u1',role:'athlete',verificationRequired:true,email:'test@example.test',emailVerification:{hash:'secret-hash'}});
 for(const url of ['/api/realtime-session','/api/evaluate']){
  const response=await h.request('POST',url,{});
  assert.equal(response.status,403,url);
 }
 assert.equal(h.calls.length,0);
 const me=await h.request('GET','/api/me');assert.equal(me.body.needsEmailVerification,true);assert.doesNotMatch(me.text,/secret-hash|emailVerification"/);
 const legacy=await harness().request('GET','/api/me');assert.equal(legacy.body.needsEmailVerification,false);assert.equal(legacy.body.emailVerified,false);
});
test('short signup creates an unverified student even when email delivery is unavailable',async()=>{
 const h=harness();
 const result=await h.request('POST','/api/register-athlete',{name:'New Student',email:'new@example.test',password:'long test password for signup',role:'owner',emailVerifiedAt:'fake'},false);
 assert.equal(result.status,201);assert.match(result.headers['Set-Cookie'],/sb_session=/);
 const user=h.db.users.find(u=>u.email==='new@example.test');
 assert.equal(user.role,'athlete');assert.equal(user.verificationRequired,true);assert.equal(user.emailVerifiedAt,undefined);
 assert.equal(h.db.athletes.find(a=>a.userId===user.id).profileStatus,'Incomplete');
 assert.equal((await h.request('POST','/api/resend-verification',{},false)).status,401);
 assert.equal((await h.request('POST','/api/verify-email',{token:'invalid'},false)).status,400);
});
test('owner routes reject anonymous, student and staff accounts',async()=>{
 for(const role of ['athlete','coach','supervisor','manager','unknown']){
  const h=harness({id:'u1',role});
  assert.equal((await h.request('GET','/api/owner/accounts')).status,403);
  assert.equal((await h.request('POST','/api/owner/role',{userId:'u1',role:'owner'})).status,403);
  assert.equal((await h.request('POST','/api/owner/voice-access',{userId:'u1',enabled:true})).status,403);
 }
 assert.equal((await harness().request('GET','/api/owner/accounts',undefined,false)).status,401);
});
test('owner can grant extra voice starts without changing permissions; password and boolean are required',async()=>{
 const password='Test-owner-passphrase-123';
 const h=harness({id:'u1',role:'owner',passwordHash:await passwords.hashPassword(password)});
 h.db.users.push({id:'u2',role:'athlete'});
 const route='/api/owner/voice-access';
 assert.equal((await h.request('POST',route,{userId:'u2',enabled:true,currentPassword:'wrong'})).status,403);
 assert.equal((await h.request('POST',route,{userId:'u2',enabled:'true',currentPassword:password})).status,400);
 assert.equal((await h.request('POST',route,{userId:'u2',enabled:true,currentPassword:password})).status,200);
 assert.equal(h.db.users[1].voiceTester,true);assert.equal(h.db.users[1].role,'athlete');
 assert.equal(h.db.securityAudit.at(-1).action,'voice-access');
 assert.equal((await h.request('GET','/api/voice-usage',undefined,false)).status,401);
 assert.equal((await h.request('GET','/api/voice-usage')).body.mock.limit,6);
 h.db.users[0].voiceTester=true;
 assert.equal((await h.request('GET','/api/voice-usage')).body.mock.limit,18);
});
test('owner sees accounts without credentials, all students and reports, and own profile',async()=>{
 const h=harness({id:'u1',role:'owner',email:'owner@example.test',secret:'never-expose'});
 h.db.reports.push({id:'r2',athleteId:'s2'});
 assert.equal((await h.request('GET','/api/athletes')).body.length,2);
 assert.equal((await h.request('GET','/api/reports')).body.length,1);
 assert.equal((await h.request('GET','/api/my-profile')).body.id,'s1');
 const overview=await h.request('GET','/api/owner/accounts');
 assert.equal(overview.status,200);assert.doesNotMatch(overview.text,/password|never-expose|fixture-unusable/);
 assert.equal((await h.request('PUT','/api/my-profile',{major:'Updated'})).status,200);
 assert.equal((await h.request('POST','/api/human-review',{reportId:'r2',score:60,note:'Reviewed'})).status,200);
 assert.equal((await h.request('GET','/api/learning/funding?athleteId=s2')).status,200);
 const bad=harness({id:'u1',role:'unknown'});
 for(const route of ['/api/athletes','/api/reports'])assert.equal((await bad.request('GET',route)).status,403);
 assert.equal(learning.canAccessStudent({id:'u1',role:'unknown'},student),false);
});
test('owner role changes need current password, preserve profiles, audit and invalidate target sessions',async()=>{
 const h=harness({id:'u1',role:'owner',email:'owner@example.test'});
 const currentPassword='owner-current-long-password';
 h.credentials.get('u1').password_hash=await passwords.hashPassword(currentPassword);
 h.db.users.push({id:'u2',role:'athlete',email:'student@example.test'});
 h.credentials.set('u2',{password_hash:'keep-password',version:0});
 h.run("sessions.set('student-session',{userId:'u2',version:0,expires:Date.now()+60000})");
 const before=structuredClone(h.db.athletes);
 assert.equal((await h.request('POST','/api/owner/role',{userId:'u2',role:'coach',currentPassword:'wrong'})).status,403);
 for(const body of [{userId:'u1',role:'coach'},{userId:'u2',role:'owner'},{userId:'missing',role:'coach'}]){
  assert.ok((await h.request('POST','/api/owner/role',{...body,currentPassword})).status>=400);
 }
 assert.equal(h.db.users[1].role,'athlete');
 const changed=await h.request('POST','/api/owner/role',{userId:'u2',role:'coach',currentPassword});
 assert.equal(changed.status,200);assert.equal(h.db.users[1].role,'coach');
 assert.equal(h.credentials.get('u2').version,1);assert.equal(h.credentials.get('u2').password_hash,'keep-password');
 assert.equal(h.run("sessions.has('student-session')"),false);
 assert.deepEqual(h.db.athletes,before);assert.equal(h.db.securityAudit[0].actorId,'u1');
 assert.equal(h.db.securityAudit[0].targetId,'u2');
 assert.equal((await h.request('POST','/api/owner/role',{userId:'u2',role:'athlete',currentPassword})).status,200);
 assert.equal(h.credentials.get('u2').version,2);
 assert.doesNotMatch(JSON.stringify(h.db),/owner-current-long-password/);
});
test('owner activation is exact, preserves data, rejects ambiguity and another owner',()=>{
 const {selectOwnerTarget,changeRole}=require('../owner-access');
 const db={users:[{id:'one',email:'owner@example.test',role:'athlete'}],athletes:[]};
 assert.equal(selectOwnerTarget(db,' OWNER@example.test ').id,'one');
 assert.equal(db.users[0].role,'athlete');
 assert.throws(()=>selectOwnerTarget(db,'missing@example.test'));
 db.users.push({id:'other',email:'OWNER@example.test',role:'athlete'});
 assert.throws(()=>selectOwnerTarget(db,'owner@example.test'));
 db.users[1]={id:'other',email:'other@example.test',role:'owner'};
 assert.throws(()=>selectOwnerTarget(db,'owner@example.test'));
 assert.throws(()=>changeRole(db,'one','other','coach'));
 assert.throws(()=>changeRole(db,'other','one','athlete'));
});
test('recovery routes reject malformed bodies, hide internal errors and revoke local sessions on success',async()=>{
 const h=harness({id:'u1',role:'athlete',email:'student@example.test'});
 for(const route of ['/api/forgot-password','/api/reset-password']){
   for(const body of ['{','null','[]'])assert.equal((await h.request('POST',route,body,false)).status,400);
   assert.equal((await h.request('POST',route,'x'.repeat(4097),false)).status,413);
 }
 assert.equal((await h.request('POST','/api/forgot-password',{email:'student@example.test'},false)).status,503);
 h.run("passwordRecovery.request=async()=>({ok:true,message:'Check your email'})");
 const admitted=await h.request('POST','/api/forgot-password',{email:'student@example.test'},false);
 assert.equal(admitted.body.message,'Check your email');
 h.run("passwordRecovery.request=async()=>{throw Object.assign(new Error('quota'),{status:429,publicMessage:'Try again in 5 minutes.'})}");
 const blocked=await h.request('POST','/api/forgot-password',{email:'student@example.test'},false);
 assert.equal(blocked.status,429);assert.equal(blocked.body.error,'Try again in 5 minutes.');
 h.run("passwordRecovery.reset=async()=>{throw new Error('private-token-provider-details')}");
 const failed=await h.request('POST','/api/reset-password',{token:'a'.repeat(64)},false);
 assert.equal(failed.status,503);assert.ok(!JSON.stringify([failed,h.logs]).includes('private-token-provider-details'));
 h.run("passwordRecovery.reset=async()=> 'u1'");
 assert.equal((await h.request('POST','/api/reset-password',{token:'b'.repeat(64)},false)).status,200);
 assert.equal(h.run('sessions.size'),0);
 assert.equal((await h.request('GET','/api/me')).status,401);
});
test('coach password survives startup and legacy login upgrades only after valid verification',async()=>{
 const hash=require('node:crypto').createHash('sha256').update('existing-password').digest('hex');
 const h=harness({id:'u1',role:'coach',email:'Coach@example.test',passwordHash:hash},{COACH_EMAIL:'coach@example.test',COACH_PASSWORD:'different-env-password'});
 h.credentials.clear();
 await h.init();
 assert.equal(h.db.users[0].passwordHash,undefined);
 assert.equal(h.credentials.get('u1').password_hash,hash);
 assert.equal((await h.request('POST','/api/login',{email:'coach@example.test',password:'different-env-password'},false)).status,401);
 assert.equal((await h.request('POST','/api/login',{email:' COACH@example.test ',password:'existing-password'},false)).status,200);
 assert.match(h.credentials.get('u1').password_hash,/^scrypt\$/);
 await h.init();
 assert.equal(await passwords.verifyPassword('existing-password',h.credentials.get('u1').password_hash),true);
});
test('password change requires current password, confirmation and authentication; revokes all sessions',async()=>{
 const h=harness({id:'u1',role:'coach',email:'coach@example.test'});
 h.credentials.get('u1').password_hash=await passwords.hashPassword('old-private-password');
 const next={currentPassword:'old-private-password',newPassword:'new-private-password ',confirmPassword:'new-private-password '};
 const initial=structuredClone(h.db);
 assert.equal((await h.request('POST','/api/change-password',next,false)).status,401);
 for(const fields of [{currentPassword:'wrong'},{newPassword:'short',confirmPassword:'short'},{confirmPassword:'mismatch'}]){
   assert.equal((await h.request('POST','/api/change-password',{...next,...fields})).status,400);
 }
 assert.equal((await h.request('POST','/api/change-password',next)).status,200);
 assert.deepEqual(h.db,initial);
 assert.equal((await h.request('GET','/api/me')).status,401);
 assert.equal(h.run('sessions.size'),0);
 assert.equal(await passwords.verifyPassword(next.newPassword,h.credentials.get('u1').password_hash),true);
 assert.equal(await passwords.verifyPassword(next.newPassword.trim(),h.credentials.get('u1').password_hash),false);
 assert.equal((await h.request('POST','/api/login',{email:'coach@example.test',password:next.currentPassword},false)).status,401);
 assert.equal((await h.request('POST','/api/login',{email:'coach@example.test',password:next.newPassword},false)).status,200);
 assert.doesNotMatch(h.logs.join('\n'),/private-password/);
});
test('new coach bootstrap creates a strong credential but cannot elevate an existing student',async()=>{
 const env={COACH_EMAIL:'coach@example.test',COACH_PASSWORD:'bootstrap-secret-long'};
 const h=harness({id:'u1',role:'athlete',email:'student@example.test'},env);
 await h.init();const coach=h.db.users.find(u=>u.email===env.COACH_EMAIL);
 assert.equal(coach.role,'coach');assert.match(h.credentials.get(coach.id).password_hash,/^scrypt\$/);
 const existing=harness({id:'u2',role:'athlete',email:env.COACH_EMAIL},env);
 await existing.init();assert.equal(existing.db.users[0].role,'athlete');
});
test('login throttling is bounded and invalid data does not authenticate',async()=>{
 const h=harness({id:'u1',role:'athlete',email:'student@example.test'});
 for(let i=0;i<10;i++)assert.equal((await h.request('POST','/api/login',{email:'unknown@example.test',password:{}},false)).status,401);
 assert.equal((await h.request('POST','/api/login',{email:'unknown@example.test',password:'wrong'},false)).status,429);
});
test('version changes and expiry invalidate sessions; production cookies are secure',async()=>{
 const h=harness({id:'u1',role:'coach',email:'coach@example.test'},{RENDER:'true'});
 h.credentials.get('u1').password_hash=await passwords.hashPassword('private-long-password');
 h.credentials.get('u1').version++;
 assert.equal((await h.request('GET','/api/me')).status,401);
 const login=await h.request('POST','/api/login',{email:'coach@example.test',password:'private-long-password'},false);
 assert.match(login.headers['Set-Cookie'],/; Secure/);assert.match(login.headers['Set-Cookie'],/Max-Age=28800/);
 h.run("sessions.set('test-token',{userId:'u1',version:1,expires:0})");
 assert.equal((await h.request('GET','/api/me')).status,401);
});
test('concurrent password changes cannot both succeed with the same old password',async()=>{
 const h=harness({id:'u1',role:'coach',email:'coach@example.test'});
 h.credentials.get('u1').password_hash=await passwords.hashPassword('old-password-long');
 const attempts=['new-password-one','new-password-two'].map(newPassword=>h.request('POST','/api/change-password',{currentPassword:'old-password-long',newPassword,confirmPassword:newPassword}));
 const results=await Promise.all(attempts);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal(h.credentials.get('u1').version,1);
});
test('report and transcript writes reject anonymous, cross-student and missing targets without side effects',async()=>{
 for(const route of ['/api/save-transcript','/api/evaluate']){
   const h=harness();const before=structuredClone(h.db);
   assert.equal((await h.request('POST',route,{athleteId:'s1'},false)).status,401);
   for(const athleteId of ['s2','missing',undefined]){
     assert.equal((await h.request('POST',route,{athleteId,transcript:[{role:'athlete',text:'Test'}],role:'coach',userId:'u2'})).status,403);
   }
   assert.deepEqual(h.db,before);assert.equal(h.calls.length,0);
 }
});
test('students can save their own transcript and generate their own report',async()=>{
 const h=harness();const transcript=[{role:'athlete',text:'My study plans'}];
 assert.equal((await h.request('POST','/api/save-transcript',{athleteId:'s1',userId:'forged',transcript})).status,200);
 assert.equal(h.db.transcripts[0].userId,'u1');assert.equal(h.db.transcripts[0].athleteId,'s1');
 assert.equal((await h.request('POST','/api/evaluate',{athleteId:'s1',transcript})).status,200);
 assert.equal(h.calls.length,1);assert.equal(h.db.reports[0].athleteId,'s1');
 assert.equal(h.db.athletes.find(a=>a.id==='s2').currentScore,undefined);
});
test('existing staff access is preserved while unrelated roles cannot write another student',async()=>{
 for(const role of ['coach','supervisor','manager']){
   const h=harness({id:'staff',role});
   for(const route of ['/api/save-transcript','/api/evaluate'])assert.equal((await h.request('POST',route,{athleteId:'s2',transcript:[{role:'athlete',text:'My study plans'}]})).status,200);
 }
 const h=harness({id:'other',role:'unknown'});
 for(const route of ['/api/save-transcript','/api/evaluate'])assert.equal((await h.request('POST',route,{athleteId:'s1'})).status,403);
 assert.equal(h.calls.length,0);assert.equal(h.db.transcripts.length,0);assert.equal(h.db.reports.length,0);
});
test('student registration permits no sport and retains student-only privileges',async()=>{
 const h=harness({id:'u1',role:'athlete',email:'existing@example.test'});
 const result=await h.request('POST','/api/register-athlete',{name:'New Student',email:'new@example.test',password:'example-password',country:'Nigeria',university:'Example University',major:'Biology',role:'coach'},false);
 assert.equal(result.status,201);
 assert.equal(h.db.users.at(-1).role,'athlete');
 assert.equal(h.db.athletes.at(-1).sport,'');
});
test('notes save and reload without changing mock reports or scores',async()=>{
 const h=harness();const body={subjectReason:' My interest ',studyOpportunity:'A checked course',futureUse:'My goals',draftAnswer:'My own explanation',reflected:true,completed:true};
 const saved=await h.request('PUT','/api/learning/study-purpose?athleteId=s1',body);assert.equal(saved.status,200);assert.equal(saved.body.progress.subjectReason,'My interest');
 const read=await h.request('GET','/api/learning/study-purpose?athleteId=s1');assert.equal(read.body.progress.completed,true);assert.equal(h.db.reports.length,0);assert.equal(h.db.transcripts.length,0);
});
test('unauthenticated and cross-student requests cannot read/save notes or start tutor',async()=>{
 const h=harness();assert.equal((await h.request('GET','/api/learning/study-purpose?athleteId=s1',undefined,false)).status,401);
 for(const method of ['GET','PUT'])assert.equal((await h.request(method,'/api/learning/study-purpose?athleteId=s2',{})).status,403);
 assert.equal((await h.request('POST','/api/realtime-session?athleteId=s2&mode=learn&lesson=study-purpose','v=0\r\noffer')).status,403);assert.equal(h.calls.length,0);
});
test('completion requires reflection but no notes; oversized or malformed notes are rejected',async()=>{
 const h=harness();for(const body of [{completed:true},{subjectReason:'a'.repeat(2001)},{subjectReason:{injected:true}},'{invalid'])assert.equal((await h.request('PUT','/api/learning/study-purpose?athleteId=s1',body)).status,400);
 assert.equal(h.progress.size,0);
 assert.equal((await h.request('PUT','/api/learning/study-purpose?athleteId=s1',{completed:true,reflected:true})).status,200);
 assert.equal((await h.request('GET','/api/learning/study-purpose?athleteId=s1')).body.progress.completed,true);
 assert.equal(h.db.reports.length,0);
});
test('report focus stays scoped to its student and selected lesson',async()=>{
 const h=harness();
 h.db.reports.push({id:'r1',athleteId:'s1',mockNumber:1,clarifications:['Clarify tuition coverage'],practiceLessons:['funding']},{id:'other',athleteId:'s2',biggestWeakness:'Private feedback'});
 const listed=await h.request('GET','/api/reports');
 assert.equal(listed.body.length,1);assert.equal(listed.body[0].practiceTargets[0].lessonId,'funding');
 const route='/api/realtime-session?athleteId=s1&mode=learn&lesson=funding&reportId=';
 for(const suffix of ['other&focus=0','missing&focus=0','r1&focus=9','r1&focus=-1'])assert.equal((await h.request('POST',route+suffix,'v=0\r\noffer')).status,404);
 assert.equal(h.calls.length,0);
 assert.equal((await h.request('POST',route+'r1&focus=0','v=0\r\noffer')).status,200);
 assert.match(h.calls[0].session.instructions,/Clarify tuition coverage/);
 assert.match(h.calls[0].session.instructions,/untrusted feedback data/);
 assert.doesNotMatch(h.calls[0].session.instructions,/Private feedback/);
});
test('old reports get general practice without guessing a lesson',()=>{
 const {practiceTargets,resolvePractice}=require('../report-practice');
 assert.equal(practiceTargets({biggestWeakness:'Check funding'})[0].lessonId,'interview-practice');
 assert.deepEqual(practiceTargets({}),[]);
 const db={reports:[{id:'r',athleteId:'s1',clarifications:['Focus'],practiceLessons:['funding']}]};
 assert.equal(resolvePractice(db,'s1','r','0','study-purpose'),null);
 assert.equal(resolvePractice(db,'s2','r','0','funding'),null);
});
test('tutor gets teaching instructions and saved context, never mock-only instructions',async()=>{
 const h=harness();await h.request('PUT','/api/learning/study-purpose?athleteId=s1',{subjectReason:'I enjoy ecology'});
 assert.equal((await h.request('POST','/api/realtime-session?athleteId=s1&mode=learn&lesson=study-purpose','v=0\r\noffer')).status,200);
 const session=h.calls[0].session;
 assert.equal(session.max_output_tokens,1024);
 assert.match(session.instructions,/35–65 words/);
 assert.match(session.instructions,/EXPLAIN → EXAMPLE → OPTIONAL PRACTICE → FEEDBACK/);
 assert.match(session.instructions,/Stay on that point for this feedback turn/);
 const context=JSON.parse(session.instructions.slice(session.instructions.lastIndexOf('\n')+1));
 assert.equal(context.profile.scholarshipCoverage,'Tuition only');
 assert.equal(context.profile.remainingSponsor,'Parent');
 assert.equal(context.profile.postGradPlan,'Environmental research');
 assert.equal(context.notes.subjectReason,'I enjoy ecology');
 assert.equal(context.profile.email,undefined);
 assert.match(session.instructions,/learning tutor/);assert.match(session.instructions,/I enjoy ecology/);assert.doesNotMatch(session.instructions,/Do not coach during the interview/);assert.equal(session.audio.input.turn_detection.create_response,false);assert.equal(session.audio.input.turn_detection.interrupt_response,false);
});
test('incomplete profile blocks mock before spending; learning remains accessible and drafts save',async()=>{
 const h=harness();h.db.athletes[0].phone='';
 const blocked=await h.request('POST','/api/realtime-session?athleteId=s1','v=0\r\noffer');assert.equal(blocked.status,422);assert.match(blocked.body.error,/Phone number/);assert.equal(h.calls.length,0);
 assert.equal((await h.request('POST','/api/realtime-session?athleteId=s1&mode=learn&lesson=study-purpose','v=0\r\noffer')).status,200);
 const saved=await h.request('PUT','/api/my-profile',{interviewCountry:'Nigeria',interviewCity:'Lagos',previousAttempts:''});assert.equal(saved.status,200);assert.equal(saved.body.profileStatus,'Incomplete');assert.equal(saved.body.interviewLocation,'Lagos, Nigeria');
 assert.equal((await h.request('PUT','/api/my-profile',{previousAttempts:-1})).status,400);
 assert.equal((await h.request('PUT','/api/my-profile',{previousAttempts:'abc'})).status,400);
});
test('mock role stays separate and unknown lesson/mode makes no API call',async()=>{
 const h=harness();for(const query of ['mode=other','mode=learn&lesson=missing'])assert.equal((await h.request('POST','/api/realtime-session?athleteId=s1&'+query,'v=0\r\noffer')).status,400);
 assert.equal(h.calls.length,0);await h.request('POST','/api/realtime-session?athleteId=s1','v=0\r\noffer');assert.match(h.calls[0].session.instructions,/Do not coach during the interview/);
});
test('staff can coach a student while unrelated roles cannot access their learning',async()=>{
 assert.equal((await harness({id:'staff',role:'coach'}).request('GET','/api/learning/study-purpose?athleteId=s1')).status,200);
 assert.equal(learning.canAccessStudent({id:'other',role:'unknown'},student),false);
});
test('voice admission is checked before upstream calls and rejects malformed SDP',async()=>{
 const h=harness();const route='/api/realtime-session?athleteId=s1';
 assert.equal((await h.request('POST',route,'not-sdp')).status,400);
 assert.equal(h.calls.length,0);
 for(let i=0;i<6;i++){
   const r=await h.request('POST',route,'v=0\r\noffer');assert.equal(r.status,200);
   assert.equal(r.headers['X-Voice-Limit-Seconds'],'720');
 }
 assert.equal(h.calls[0].session.max_output_tokens,512);
 assert.equal((await h.request('POST',route,'v=0\r\noffer')).status,429);
 assert.equal(h.calls.length,6);
});
test('evaluation cannot overwrite report ownership and metadata through model output',async()=>{
 const h=harness();
 const forged={id:'forged',athleteId:'s2',mockNumber:999,createdAt:'forged',overall:45,scores:{communication:999},feedback:'Feedback',biggestWeakness:'Weakness',nextStep:'Practice',humanReview:{score:100}};
 h.run(`fetch=async()=>({ok:true,json:async()=>({output_text:${JSON.stringify(JSON.stringify(forged))}})})`);
 const r=await h.request('POST','/api/evaluate',{athleteId:'s1',transcript:[{role:'athlete',text:'My study plans'}]});
 assert.equal(r.status,200);assert.equal(r.body.athleteId,'s1');assert.notEqual(r.body.id,'forged');assert.equal(r.body.mockNumber,1);assert.notEqual(r.body.createdAt,'forged');assert.equal(r.body.humanReview,null);assert.deepEqual(r.body.scores,{});
 assert.equal(r.headers['X-Content-Type-Options'],'nosniff');
});
test('malformed evaluation and internal failures do not expose raw data',async()=>{
 const h=harness();h.run(`fetch=async()=>({ok:true,json:async()=>({output_text:'secret invalid model text'})})`);
 const bad=await h.request('POST','/api/evaluate',{athleteId:'s1',transcript:[{role:'athlete',text:'My study plans'}]});assert.equal(bad.status,502);assert.doesNotMatch(bad.text,/secret/);
 h.run(`loadDb=async()=>{throw new Error('private database connection detail')}`);
 const failed=await h.request('GET','/api/me');assert.equal(failed.status,500);assert.deepEqual(failed.body,{error:'Server error'});
});
test('overlapping profile writes preserve both fields',async()=>{
 const h=harness();
 const results=await Promise.all([h.request('PUT','/api/my-profile',{major:'Chemistry'}),h.request('PUT','/api/my-profile',{university:'New university'})]);
 assert.ok(results.every(r=>r.status===200));assert.equal(h.db.athletes[0].major,'Chemistry');assert.equal(h.db.athletes[0].university,'New university');
});
test('slow evaluation preserves intervening profile save and rejects overlap',async()=>{
 const h=harness();
 h.run(`pending=[];fetch=async()=>{await new Promise(resolve=>pending.push(resolve));return {ok:true,json:async()=>({output_text:JSON.stringify({overall:50,feedback:'Feedback',biggestWeakness:'Weakness',nextStep:'Practice'})})}}`);
 const first=h.request('POST','/api/evaluate',{athleteId:'s1',transcript:[{role:'athlete',text:'My study plans'}]});
 for(let i=0;i<100&&h.run('pending.length')<1;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.run('pending.length'),1);
 const second=await h.request('POST','/api/evaluate',{athleteId:'s1',transcript:[{role:'athlete',text:'Another answer'}]});assert.equal(second.status,429);
 const profile=await h.request('PUT','/api/my-profile',{major:'Updated while evaluating'});assert.equal(profile.status,200);
 h.run('pending.forEach(resolve=>resolve())');
 assert.equal((await first).status,200);assert.equal(h.db.athletes[0].mocks,1);assert.equal(h.db.athletes[0].major,'Updated while evaluating');
});
test('concurrent duplicate registrations create only one account and credential',async()=>{
 const h=harness();const body={name:'Student',email:'new@example.test',password:'a-long-test-password',country:'Nigeria',university:'Example',major:'Biology'};
 const responses=await Promise.all([h.request('POST','/api/register-athlete',body,false),h.request('POST','/api/register-athlete',body,false)]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);assert.equal(h.db.users.filter(u=>u.email===body.email).length,1);assert.equal(h.credentials.size,2);
});
test('failed mutation rolls back account data and credential then releases the lock',async()=>{
 const h=harness();
 await assert.rejects(h.run(`mutateDb(async(db,client)=>{db.users.push({id:'failed'});await client.query('INSERT INTO user_credentials (user_id,password_hash) VALUES ($1,$2) ON CONFLICT (user_id) DO NOTHING',['failed','hash']);throw new Error('fail')})`),/fail/);
 assert.equal(h.db.users.some(u=>u.id==='failed'),false);assert.equal(h.credentials.has('failed'),false);
 await h.run(`mutateDb(async(db)=>{db.athletes[0].major='After rollback'})`);assert.equal(h.db.athletes[0].major,'After rollback');
});
test('completed transcript retries reuse the report without a provider call',async()=>{
 const h=harness();const body={athleteId:'s1',transcript:[{role:'athlete',text:'My plans',at:'first'}]};
 const first=await h.request('POST','/api/evaluate',body);body.transcript[0].at='later';
 const second=await h.request('POST','/api/evaluate',body);
 assert.equal(first.status,200);assert.equal(second.body.id,first.body.id);assert.equal(h.calls.length,1);assert.equal(h.db.reports.length,1);
 assert.equal(h.calls[0].request.max_output_tokens,4096);assert.equal(h.calls[0].request.store,false);
});
test('six distinct reports are admitted and malformed transcripts never call provider',async()=>{
 const h=harness();
 assert.equal((await h.request('POST','/api/evaluate',{athleteId:'s1',transcript:[]})).status,400);
 assert.equal((await h.request('POST','/api/evaluate',{athleteId:'s1',transcript:[{role:'athlete',text:'x'.repeat(40001)}]})).status,400);
 for(let i=0;i<7;i++)assert.equal((await h.request('POST','/api/evaluate',{athleteId:'s1',transcript:[{role:'athlete',text:'Answer '+i}]})).status,i<6?200:429);
 assert.equal(h.calls.length,6);
});
test('provider timeout gives a useful error and releases admission',async()=>{
 const h=harness();h.run(`fetch=async()=>{throw Object.assign(new Error('private provider details'),{name:'TimeoutError'})}`);
 const body={athleteId:'s1',transcript:[{role:'athlete',text:'Plans'}]};
 for(let i=0;i<2;i++){const response=await h.request('POST','/api/evaluate',body);assert.equal(response.status,504);assert.doesNotMatch(response.text,/private/);}
});
test('structured evaluation stores concise sections and legacy compatibility fields',async()=>{
 const h=harness();const result={overall:60,summary:'You explained your subject clearly.',priority:'Clarify the funding gap.',strengths:['You linked your subject to an interest.'],clarifications:['Which costs does your award cover?'],nextSteps:['Check your award letter.','Identify uncovered costs.','Explain your funding in your own words.']};
 h.run(`fetch=async()=>({ok:true,json:async()=>({output_text:${JSON.stringify(JSON.stringify(result))}})})`);
 const r=await h.request('POST','/api/evaluate',{athleteId:'s1',transcript:[{role:'athlete',text:'My answer'}]});
 assert.equal(r.status,200);assert.equal(r.body.formatVersion,2);assert.deepEqual(r.body.nextSteps,result.nextSteps);assert.equal(r.body.feedback,result.summary);assert.equal(r.body.biggestWeakness,result.priority);
});
test('malformed structured sections are rejected without saving a report',async()=>{
 const h=harness();h.run(`fetch=async()=>({ok:true,json:async()=>({output_text:JSON.stringify({overall:50,summary:'Summary',priority:'Priority',strengths:[],clarifications:['Clarify'],nextSteps:['Only one']})})})`);
 const r=await h.request('POST','/api/evaluate',{athleteId:'s1',transcript:[{role:'athlete',text:'My answer'}]});assert.equal(r.status,502);assert.equal(h.db.reports.length,0);
});

test('six modules isolate saved progress and reject unknown modules before starting voice',async()=>{
 const h=harness();
 for(const lesson of learning.LESSONS){
  const route='/api/learning/'+lesson.id+'?athleteId=s1';
  assert.equal((await h.request('PUT',route,{draftAnswer:lesson.id})).status,200);
 }
 for(const lesson of learning.LESSONS){
  assert.equal((await h.request('GET','/api/learning/'+lesson.id+'?athleteId=s1')).body.progress.draftAnswer,lesson.id);
  assert.equal((await h.request('GET','/api/learning/'+lesson.id+'?athleteId=s2')).status,403);
 }
 assert.equal((await h.request('GET','/api/learning/missing?athleteId=s1')).status,404);
 assert.equal((await h.request('POST','/api/realtime-session?athleteId=s1&mode=learn&lesson=missing','v=0\r\noffer')).status,400);
 assert.equal((await h.request('POST','/api/realtime-session?athleteId=s1&mode=learn&lesson=funding','v=0\r\noffer')).status,200);
 const prompt=h.calls.at(-1).session.instructions;
 assert.match(prompt,/Selected module: Your funding/);assert.match(prompt,/remaining sponsor/);
 assert.match(prompt,/"draftAnswer":"funding"/);
});

test('mock sessions receive the saved academic preparation path',async()=>{
 for(const level of ['High school','Undergraduate','Master’s','PhD / Doctorate']){
  const h=harness();h.db.athletes[0].academicLevel=level;h.db.athletes[0].sport='';
  const response=await h.request('POST','/api/realtime-session?athleteId=s1&mode=mock','v=0\r\noffer');
  assert.equal(response.status,200);
  assert.ok(h.calls[0].session.instructions.includes('Preparation path: '+learning.LESSONS.resolveLevel(level)));
 }
});

test('tutoring and mock allowances are independent and their remaining counts are exposed',async()=>{
 const h=harness();
 for(let i=0;i<12;i++)assert.equal((await h.request('POST','/api/realtime-session?athleteId=s1&mode=learn&lesson=funding','v=0\r\noffer')).status,200);
 assert.equal((await h.request('POST','/api/realtime-session?athleteId=s1&mode=learn&lesson=funding','v=0\r\noffer')).status,429);
 const mock=await h.request('POST','/api/realtime-session?athleteId=s1','v=0\r\noffer');assert.equal(mock.status,200);assert.match(mock.headers['X-Mock-Session-Id'],/^mock_/);
 const usage=(await h.request('GET','/api/voice-usage')).body;assert.equal(usage.learn.remaining,0);assert.equal(usage.mock.remaining,5);assert.equal(usage.reports.remaining,6);
 const prompt=h.calls.at(-1).session.instructions;assert.match(prompt,/no intimidation, praise, scoring/);assert.match(prompt,/feedback comes after/);assert.match(prompt,/never as a real consular officer/);
});
test('reports require the issued mock session and freeze its first submitted answers',async()=>{
 const h=harness(),transcript=[{role:'athlete',text:'My answer'}];
 assert.equal((await h.request('POST','/api/evaluate',{athleteId:'s1',transcript,mockSessionId:null})).status,400);
 const started=await h.request('POST','/api/realtime-session?athleteId=s1','v=0\r\noffer');
 const mockSessionId=started.headers['X-Mock-Session-Id'];
 const first=await h.request('POST','/api/evaluate',{athleteId:'s1',transcript,mockSessionId});assert.equal(first.status,200);
 const repeat=await h.request('POST','/api/evaluate',{athleteId:'s1',transcript:[{role:'athlete',text:'Changed answer'}],mockSessionId});assert.equal(repeat.body.id,first.body.id);
 assert.equal(h.db.reports.length,1);assert.equal((await h.request('GET','/api/voice-usage')).body.reports.remaining,5);
 h.db.mockSessions[0].userId='someone-else';assert.equal((await h.request('POST','/api/evaluate',{athleteId:'s1',transcript,mockSessionId})).status,400);
});
test('failed reports can retry without consuming the successful report allowance',async()=>{
 const h=harness();h.run(`fetch=async()=>{throw Object.assign(new Error('timeout'),{name:'TimeoutError'})}`);
 const body={athleteId:'s1',transcript:[{role:'athlete',text:'Answer'}]};
 for(let i=0;i<12;i++)assert.equal((await h.request('POST','/api/evaluate',body)).status,504);
 assert.equal((await h.request('POST','/api/evaluate',body)).status,429);
 const usage=(await h.request('GET','/api/voice-usage')).body.reports;assert.equal(usage.remaining,6);assert.equal(usage.attemptsRemaining,0);
});

test('mock modes are validated before spending, persisted, and passed to interviewer',async()=>{
 const h=harness();
 assert.equal((await h.request('POST','/api/realtime-session?athleteId=s1&difficulty=unknown','v=0\r\noffer')).status,400);assert.equal(h.calls.length,0);
 for(const difficulty of ['standard','challenging','intensive']){
  const response=await h.request('POST','/api/realtime-session?athleteId=s1&difficulty='+difficulty,'v=0\r\noffer');assert.equal(response.status,200);
  const session=h.db.mockSessions.at(-1);assert.equal(session.difficulty,difficulty);assert.equal(session.evaluationVersion,3);assert.equal(session.profile.phone,undefined);
  assert.ok(h.calls.at(-1).session.instructions.includes(require('../interview-design').MODES[difficulty]+' mode'));
 }
});
test('ending a mock saves question history without generating a paid report; repeat context is scoped',async()=>{
 const h=harness(),body={athleteId:'s1'};
 const start=await h.request('POST','/api/realtime-session?athleteId=s1','v=0\r\noffer');
 const id=start.headers['X-Mock-Session-Id'],transcript=[{role:'assistant',text:'Why this particular school?'},{role:'athlete',text:'The research course fits my interests.'}];
 assert.equal((await h.request('POST','/api/mock-session/end',{mockSessionId:id,transcript},false)).status,401);
 assert.equal((await h.request('POST','/api/mock-session/end',{mockSessionId:'wrong',transcript})).status,403);
 assert.equal((await h.request('POST','/api/mock-session/end',{mockSessionId:id,transcript})).status,200);
 assert.equal(h.db.reports.length,0);assert.equal(h.calls.length,1);
 h.db.athletes[0].university='Changed after session';
 const report=await h.request('POST','/api/evaluate',{...body,mockSessionId:id,transcript,difficulty:'intensive'});assert.equal(report.status,200);assert.equal(report.body.overall,null);assert.equal(report.body.difficulty,'standard');
 assert.match(h.calls.at(-1).request.input,/Example University/);assert.doesNotMatch(h.calls.at(-1).request.input,/Changed after session/);
 await h.request('POST','/api/realtime-session?athleteId=s1','v=0\r\noffer');assert.match(h.calls.at(-1).session.instructions,/Why this particular school/);
 h.db.mockSessions[0].userId='other';assert.equal((await h.request('POST','/api/mock-session/end',{mockSessionId:id,transcript})).status,403);
});
