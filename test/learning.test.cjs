const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {Readable}=require('node:stream');
const learning=require('../learning');
const student={id:'s1',userId:'u1',name:'Test student',major:'Biology',university:'Example University',scholarship:'Merit award',scholarshipCoverage:'Tuition only',remainingSponsor:'Parent',postGradPlan:'Environmental research',email:'private@example.test'};
function harness(user={id:'u1',role:'athlete'},env={}){
 let handler;const progress=new Map(),calls=[],logs=[];
 const db={users:[user],athletes:[student,{id:'s2',userId:'u2'}],reports:[],transcripts:[]};
 const pool={query:async(sql,args)=>{
   if(sql.trim().startsWith('CREATE TABLE') || sql.trim().startsWith('INSERT INTO app_state'))return {rows:[]};
   if(sql.includes('FROM app_state'))return {rows:[{data:structuredClone(db)}]};
   if(sql.startsWith('UPDATE app_state')){Object.assign(db,structuredClone(args[0]));return {rows:[]}}
   if(sql.startsWith('SELECT data FROM learning_progress'))return {rows:progress.has(args[0])?[{data:progress.get(args[0])}]:[]};
   if(sql.startsWith('INSERT INTO learning_progress')){progress.set(args[0],JSON.parse(args[2]));return {rows:[]}}
   throw new Error('Unexpected query: '+sql);
 }};
 const context=vm.createContext({require:id=>id==='http'?{createServer:fn=>{handler=fn;return {}}}:id==='pg'?{Pool:function(){return pool}}:id==='fs'?{...fs,readFileSync:(file,...args)=>file===path.resolve(__dirname,'../data/db.json')?'{}':fs.readFileSync(file,...args)}:id==='./learning'?learning:require(id),__dirname:path.resolve(__dirname,'..'),process:{env:{OPENAI_API_KEY:'test-only',...env}},console:{log:(...args)=>logs.push(args.join(' ')),warn:(...args)=>logs.push(args.join(' ')),error:(...args)=>logs.push(args.join(' '))},Buffer,URL,FormData,fetch:async(url,options)=>{if(url.endsWith('/responses')){calls.push({url,request:JSON.parse(options.body)});return {ok:true,json:async()=>({output_text:JSON.stringify({scores:{},overall:45,readiness:'High Concern',biggestWeakness:'Test',feedback:'Test feedback',nextStep:'Practice'})})};}calls.push({url,session:JSON.parse(options.body.get('session'))});return {status:200,text:async()=> 'test-sdp-answer'}}});
 let source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');source=source.slice(0,source.indexOf('initDb().then('));vm.runInContext(source,context);vm.runInContext(`sessions.set('test-token',${JSON.stringify(user.id)})`,context);
 async function request(method,url,body,authenticated=true){
   const req=Readable.from(body===undefined?[]:[Buffer.from(typeof body==='string'?body:JSON.stringify(body))]);req.method=method;req.url=url;req.headers={host:'localhost',cookie:authenticated?'sb_session=test-token':''};
   const result={};await handler(req,{writeHead:status=>result.status=status,end:text=>{result.text=text;try{result.body=JSON.parse(text)}catch{}}});return result;
 }
 return {request,progress,calls,db,logs,init:()=>vm.runInContext('initDb()',context)};
}
test('coach startup applies configured password and login tolerates email whitespace without changing password bytes',async()=>{
 const h=harness({id:'coach1',role:'coach',email:'Coach@Example.test',passwordHash:'old'},
   {COACH_EMAIL:' coach@example.test ',COACH_PASSWORD:'new-password-for-test '});
 const students=structuredClone(h.db.athletes);
 await h.init();
 assert.equal(h.db.users.length,1);assert.equal(h.db.users[0].id,'coach1');
 assert.deepEqual(h.db.athletes,students);
 assert.ok(h.logs.includes('[auth] COACH_PASSWORD_WRITE_VERIFIED'));
 assert.equal((await h.request('POST','/api/login',{email:' COACH@example.test ',password:'new-password-for-test '},false)).status,200);
 for(const password of ['old','new-password-for-test',{},null]){
   const r=await h.request('POST','/api/login',{email:'coach@example.test',password},false);
   assert.equal(r.status,401);assert.equal(r.body.error,'Invalid email or password');
 }
 assert.equal(h.logs.filter(s=>s==='[auth] LOGIN_PASSWORD_MISMATCH').length,1);
 assert.ok(h.logs.includes('[auth] COACH_STORED_PASSWORD_MATCHES_RUNTIME'));
 h.db.users[0].passwordHash='changed-after-startup';
 await h.request('POST','/api/login',{email:'coach@example.test',password:'new-password-for-test '},false);
 assert.ok(h.logs.includes('[auth] COACH_STORED_PASSWORD_DIFFERS_FROM_RUNTIME'));
 assert.doesNotMatch(h.logs.join('\n'),/new-password|coach@example|changed-after-startup|test-token/i);
});
test('hidden characters are diagnosed without accepting a modified password or leaking credentials',async()=>{
 const password='private-fixture\r\n ';
 const h=harness({id:'u1',role:'coach',email:'coach@example.test'},{COACH_EMAIL:'coach@example.test',COACH_PASSWORD:password});
 await h.init();
 assert.ok(h.logs.includes('[auth] COACH_PASSWORD_HAS_LINE_BREAK'));
 assert.ok(h.logs.includes('[auth] COACH_PASSWORD_HAS_EDGE_WHITESPACE'));
 const r=await h.request('POST','/api/login',{email:'coach@example.test',password:password.trim()},false);
 assert.equal(r.status,401);
 assert.match(r.body.reference,/^auth2-[a-f0-9]{12}$/);
 assert.ok(h.logs.some(s=>s.includes('reference='+r.body.reference)));
 assert.doesNotMatch(h.logs.join('\n'),/private-fixture|coach@example.test/);
 assert.equal((await h.request('POST','/api/login',{email:'coach@example.test',password},false)).status,200);
 for(let i=0;i<105;i++) await h.request('POST','/api/login',{email:'coach@example.test',password:'wrong'},false);
 assert.equal(h.logs.filter(s=>s.includes('LOGIN_REJECTED reference=')).length,100);
});
test('missing coach config and unknown login have private, bounded diagnostics',async()=>{
 const h=harness({id:'u1',role:'athlete',email:'student@example.test'});
 const before=structuredClone(h.db);await h.init();assert.deepEqual(h.db,before);
 assert.ok(h.logs.includes('[auth] COACH_EMAIL_MISSING'));
 assert.ok(h.logs.includes('[auth] COACH_PASSWORD_MISSING'));
 for(const email of ['unknown@example.test','',{},null]){
   const r=await h.request('POST','/api/login',{email,password:'secret-attempt'},false);
   assert.equal(r.status,401);assert.equal(r.body.error,'Invalid email or password');
 }
 assert.equal(h.logs.filter(s=>s==='[auth] LOGIN_ACCOUNT_NOT_FOUND').length,1);
 assert.doesNotMatch(h.logs.join('\n'),/example.test|secret-attempt/);
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
   for(const route of ['/api/save-transcript','/api/evaluate'])assert.equal((await h.request('POST',route,{athleteId:'s2',transcript:[]})).status,200);
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
 assert.equal((await h.request('POST','/api/realtime-session?athleteId=s2&mode=learn&lesson=study-purpose','offer')).status,403);assert.equal(h.calls.length,0);
});
test('completion requires all notes and reflection; oversized or malformed notes are rejected',async()=>{
 const h=harness();for(const body of [{completed:true},{subjectReason:'a'.repeat(2001)},{subjectReason:{injected:true}},'{invalid'])assert.equal((await h.request('PUT','/api/learning/study-purpose?athleteId=s1',body)).status,400);
 assert.equal(h.progress.size,0);
});
test('tutor gets teaching instructions and saved context, never mock-only instructions',async()=>{
 const h=harness();await h.request('PUT','/api/learning/study-purpose?athleteId=s1',{subjectReason:'I enjoy ecology'});
 assert.equal((await h.request('POST','/api/realtime-session?athleteId=s1&mode=learn&lesson=study-purpose','offer')).status,200);
 const session=h.calls[0].session;
 const context=JSON.parse(session.instructions.slice(session.instructions.lastIndexOf('\n')+1));
 assert.equal(context.profile.scholarshipCoverage,'Tuition only');
 assert.equal(context.profile.remainingSponsor,'Parent');
 assert.equal(context.profile.postGradPlan,'Environmental research');
 assert.equal(context.notes.subjectReason,'I enjoy ecology');
 assert.equal(context.profile.email,undefined);
 assert.match(session.instructions,/learning tutor/);assert.match(session.instructions,/I enjoy ecology/);assert.doesNotMatch(session.instructions,/Do not coach during the interview/);assert.equal(session.audio.input.turn_detection.create_response,false);assert.equal(session.audio.input.turn_detection.interrupt_response,false);
});
test('mock role stays separate and unknown lesson/mode makes no API call',async()=>{
 const h=harness();for(const query of ['mode=other','mode=learn&lesson=missing'])assert.equal((await h.request('POST','/api/realtime-session?athleteId=s1&'+query,'offer')).status,400);
 assert.equal(h.calls.length,0);await h.request('POST','/api/realtime-session?athleteId=s1','offer');assert.match(h.calls[0].session.instructions,/Do not coach during the interview/);
});
test('staff can coach a student while unrelated roles cannot access their learning',async()=>{
 assert.equal((await harness({id:'staff',role:'coach'}).request('GET','/api/learning/study-purpose?athleteId=s1')).status,200);
 assert.equal(learning.canAccessStudent({id:'other',role:'unknown'},student),false);
});
