const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {Readable}=require('node:stream');
const learning=require('../learning');
const student={id:'s1',userId:'u1',name:'Test student',major:'Biology',university:'Example University',scholarship:'Merit award',scholarshipCoverage:'Tuition only',remainingSponsor:'Parent',postGradPlan:'Environmental research',email:'private@example.test'};
function harness(user={id:'u1',role:'athlete'}){
 let handler;const progress=new Map(),calls=[];
 const db={users:[user],athletes:[student,{id:'s2',userId:'u2'}],reports:[],transcripts:[]};
 const pool={query:async(sql,args)=>{
   if(sql.includes('FROM app_state'))return {rows:[{data:structuredClone(db)}]};
   if(sql.startsWith('SELECT data FROM learning_progress'))return {rows:progress.has(args[0])?[{data:progress.get(args[0])}]:[]};
   if(sql.startsWith('INSERT INTO learning_progress')){progress.set(args[0],JSON.parse(args[2]));return {rows:[]}}
   throw new Error('Unexpected query: '+sql);
 }};
 const context=vm.createContext({require:id=>id==='http'?{createServer:fn=>{handler=fn;return {}}}:id==='pg'?{Pool:function(){return pool}}:id==='./learning'?learning:require(id),__dirname:path.resolve(__dirname,'..'),process:{env:{OPENAI_API_KEY:'test-only'}},console,Buffer,URL,FormData,fetch:async(url,options)=>{calls.push({url,session:JSON.parse(options.body.get('session'))});return {status:200,text:async()=> 'test-sdp-answer'}}});
 let source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');source=source.slice(0,source.indexOf('initDb().then('));vm.runInContext(source,context);vm.runInContext(`sessions.set('test-token',${JSON.stringify(user.id)})`,context);
 async function request(method,url,body,authenticated=true){
   const req=Readable.from(body===undefined?[]:[Buffer.from(typeof body==='string'?body:JSON.stringify(body))]);req.method=method;req.url=url;req.headers={host:'localhost',cookie:authenticated?'sb_session=test-token':''};
   const result={};await handler(req,{writeHead:status=>result.status=status,end:text=>{result.text=text;try{result.body=JSON.parse(text)}catch{}}});return result;
 }
 return {request,progress,calls,db};
}
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

test('learning routes athletes, graduate students and previous refusals using saved facts',()=>{
 const plan=learning.learningPlan({sport:'Track',academicLevel:'Graduate',previousRefusal:'Yes',scholarship:'Partial athletic scholarship'});
 const ids=plan.map(t=>t.id);
 assert.ok(ids.includes('athletics'));assert.ok(ids.includes('refusal'));
 assert.ok(plan.find(t=>t.id==='education').questions.some(q=>q.includes("bachelor")));
 assert.ok(plan.find(t=>t.id==='funding').questions.some(q=>q.includes('remaining amount')));
 assert.ok(plan.every(t=>t.questions.every(q=>q.endsWith('?'))));
});
test('non-athletes without refusals get undergraduate topics without irrelevant branches',()=>{
 const plan=learning.learningPlan({role:'athlete',sport:'None',academicLevel:'Undergraduate',previousRefusal:'No',previousAttempts:2,scholarship:'No scholarship'});
 assert.ok(!plan.some(t=>['athletics','refusal'].includes(t.id)));
 assert.ok(plan.find(t=>t.id==='education').questions.some(q=>q.includes('high school')));
 assert.ok(!plan.find(t=>t.id==='funding').questions.some(q=>q.includes('your scholarship')));
});
test('unknown values do not fabricate a category and graduate labels avoid undergraduate collision',()=>{
 for(const academicLevel of [undefined,'Other']){
   const plan=learning.learningPlan({academicLevel,previousAttempts:7,sport:'N/A'});
   assert.ok(!plan.some(t=>['athletics','refusal'].includes(t.id)));
   assert.equal(plan.find(t=>t.id==='education').title,'Academic background');
 }
 for(const academicLevel of ["Master's degree",'Masters','PhD']){
   assert.equal(learning.learningPlan({academicLevel}).find(t=>t.id==='education').title,'Previous degree and graduate study');
 }
 assert.ok(!learning.learningPlan({sport:'No sports',scholarship:'Non-athletic scholarship'}).some(t=>t.id==='athletics'));
});
test('tutor context retains refusal facts and omits regional policy and mock routing',()=>{
 const prompt=learning.tutorInstructions({previousRefusal:'No',previousAttempts:0,academicLevel:'Freshman / First year'});
 const data=JSON.parse(prompt.slice(prompt.lastIndexOf('\n')+1));
 assert.equal(data.profile.previousRefusal,'No');
 assert.equal(data.profile.previousAttempts,0);
 assert.doesNotMatch(prompt,/Routine visa services|Do not coach the applicant during/);
});
