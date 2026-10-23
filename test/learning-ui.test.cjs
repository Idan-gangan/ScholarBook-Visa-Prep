const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
function fixture(){
 const elements=new Map();
 function element(){const classes=new Set();return {value:'',textContent:'',innerHTML:'',disabled:false,checked:false,children:[],dataset:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)},querySelectorAll(){return []},setAttribute(){},addEventListener(){},append(...items){this.children.push(...items)},appendChild(item){this.children.push(item)},replaceChildren(...items){this.children=items;if(items[0]?.value)this.value=items[0].value},pause(){},showModal(){this.open=true},close(){this.open=false}}}
 for(const match of html.matchAll(/id="([^"]+)"/g))elements.set(match[1],element());
 const document={getElementById:id=>{if(!elements.has(id)){if(id.startsWith('p_')||['educationHistory','educationHistoryTitle','interviewCities'].includes(id))elements.set(id,element());else throw new Error('Missing DOM element '+id);}return elements.get(id)},querySelector:selector=>{if(!elements.has(selector))elements.set(selector,element());return elements.get(selector)},querySelectorAll:selector=>selector==='.screen'?['learning','dashboard','interview','profile','reports','manager'].map(id=>elements.get(id)):[],createElement:()=>element(),createTextNode:text=>({textContent:text})};
 const student={id:'s1',userId:'u1',name:'Test Student',university:'Example University',major:'Biology',currentScore:0};
 const store={progress:{},moduleProgress:{},requests:[],tracks:[],failLoad:false,failPassword:false};
 const ctx=vm.createContext({document,console,AbortController,URL,Date,JSON,Set,setTimeout,clearTimeout,Option:function(text,value){return {text,value}},window:{VisaAtlasCurriculum:require("../public/curriculum"),addEventListener(){}},location:{reload(){}},confirm:()=>true,navigator:{mediaDevices:{getUserMedia:async()=>{const track={enabled:true,stop(){this.stopped=true}};store.tracks.push(track);return {getTracks:()=>[track],getAudioTracks:()=>[track]}}}},RTCPeerConnection:class{addTrack(){}createDataChannel(){return {readyState:'open',addEventListener(){},send(){},close(){}}}async createOffer(){return {sdp:'offer'}}async setLocalDescription(){}async setRemoteDescription(){}close(){}},fetch:async(url,opt={})=>{
   store.requests.push({url,...opt});let data;const route=new URL(url,'http://local').pathname;
   if(route==='/api/change-password'){if(store.failPassword)return {ok:false,json:async()=>({error:'Current password is incorrect.'})};data={ok:true};}
   else if(route==='/api/me')data=store.user||{id:'u1',name:'Test Student',role:'athlete'};
   else if(route==='/api/owner/accounts')data=store.ownerData;
   else if(route==='/api/voice/end')data={ok:true};
   else if(route==='/api/owner/role'||route==='/api/owner/student-access')data={ok:true};
   else if(route==='/api/owner/voice-access')data={ok:true};
   else if(route==='/api/voice-usage')data=store.usage||{learn:{limit:12,used:2,remaining:10,resetsAt:'2026-10-17T00:00:00.000Z'},mock:{limit:6,used:1,remaining:5,resetsAt:'2026-10-17T00:00:00.000Z'},reports:{limit:6,used:1,remaining:5,attemptsRemaining:11,resetsAt:'2026-10-17T00:00:00.000Z'}};
   else if(route==='/api/profile-options')data=JSON.parse(JSON.stringify(require('../profile-options')));
   else if(route==='/api/athletes')data=[student];else if(route==='/api/reports')data=[];else if(route==='/api/my-profile')data=student;
   else if(route.startsWith('/api/learning/')){
     if(store.failLoad&&!opt.method)return {ok:false,json:async()=>({error:'Unavailable'})};
     if(store.failSave&&opt.method==='PUT')return {ok:false,json:async()=>({error:'Save failed'})};
     const id=route.split('/').at(-1);
     if(opt.method==='PUT')store.moduleProgress[id]={...JSON.parse(opt.body),updatedAt:'2026-09-27'};
     data={progress:store.moduleProgress[id]||{}};
   }else if(route==='/api/realtime-session')return {ok:true,headers:{get:()=> '480'},text:async()=> 'answer'};
   else throw new Error('Unexpected route '+route);
   return {ok:true,json:async()=>structuredClone(data)};
 }});
 ctx.requestVoiceConsent=(mode,agree)=>agree();
 vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1].replace('boot().catch(()=>{if(new URLSearchParams(location.search).get("signin")==="1")backToLogin()});',''),ctx);
 return {elements,store,ctx,run:code=>vm.runInContext(code,ctx)};
}
test('unlimited usage is readable without null counters or reset promises',async()=>{
 const f=fixture();f.store.usage={learn:{unlimited:true,limit:null,remaining:null},mock:{unlimited:true,limit:null,remaining:null},reports:{unlimited:true,limit:null,remaining:null}};
 await f.run('boot()');await f.run('refreshVoiceUsage()');
 for(const id of ['lessonVoiceUsage','mockVoiceUsage','reportUsage']){assert.match(f.elements.get(id).textContent,/Unlimited/);assert.doesNotMatch(f.elements.get(id).textContent,/null|Resets|left today/);}
});
test('student dashboard uses latest feedback and omits staff-only columns',()=>{
 const f=fixture();f.run(`me={id:'u1',role:'athlete'};athletes=[{id:'s1',userId:'u1',name:'Test',mocks:2,currentScore:0,mainConcern:'New student — not yet assessed'}];reports=[{id:'old',athleteId:'s1',createdAt:'2026-01-01',overall:45},{id:'new',athleteId:'s1',createdAt:'2026-02-01',overall:75,feedback:'Clear study plans',nextStep:'Check your funding details'}];renderAll()`);
 assert.match(f.elements.get('dashCards').innerHTML,/75\/100/);
 assert.match(f.elements.get('dashCards').innerHTML,/Building confidence/);
 assert.match(f.elements.get('athleteTable').innerHTML,/Clear study plans/);
 assert.match(f.elements.get('athleteTable').innerHTML,/Check your funding details/);
 assert.doesNotMatch(f.elements.get('athleteTable').innerHTML,/Human sessions|New student|<table>/);
 f.run(`reports=[];renderAll()`);assert.match(f.elements.get('dashCards').innerHTML,/Start your first practice/);assert.doesNotMatch(f.elements.get('dashCards').innerHTML,/0\/100/);
 f.run(`reports=[{id:'r',athleteId:'s1',overall:null}];renderAll()`);assert.match(f.elements.get('dashCards').innerHTML,/More answers needed/);
});
test('owner dashboard escapes account details and clears password after role changes',async()=>{
 const f=fixture();f.store.user={id:'u1',name:'Owner',role:'owner'};
 f.store.ownerData={counts:{accounts:2,students:1,reports:0},users:[f.store.user,{id:'u2',name:'<img src=x>',email:'<script>@example.com',role:'athlete'}],audit:[]};
 await f.run('boot()');assert.equal(f.elements.get('role').textContent,'Owner');
 assert.ok(f.run("navItems().some(x=>x[1]==='owner')"));
 assert.match(f.elements.get('ownerAccounts').innerHTML,/Owner \(protected\)/);
 assert.doesNotMatch(f.elements.get('ownerAccounts').innerHTML,/<img|<script>/);
 f.run("openOwnerEdit('role','u2')");
 f.elements.set('ownerNewRole',{value:'coach'});
 await f.run('submitOwnerEdit()');assert.equal(f.store.requests.some(r=>r.url==='/api/owner/role'),false);
 f.elements.get('ownerPassword').value='current-password';await f.run('submitOwnerEdit()');
 assert.equal(JSON.parse(f.store.requests.find(r=>r.url==='/api/owner/role').body).userId,'u2');
 assert.equal(f.elements.get('ownerPassword').value,'');
});
test('student navigation excludes owner tools and does not fetch accounts',async()=>{
 const f=fixture();await f.run('boot()');await f.run('loadOwner()');
 assert.equal(f.run("navItems().some(x=>x[1]==='owner')"),false);
 assert.equal(f.store.requests.some(r=>r.url.startsWith('/api/owner/')),false);
});
test('overview hides lesson details until selection and allows return without losing saved completion',async()=>{
 const f=fixture();await f.run('boot()');
 assert.equal(f.elements.get('lessonDetails').classList.contains('hidden'),true);
 assert.match(f.elements.get('learningVoiceUsage').textContent,/10 of 12 tutoring starts left/);
 await f.run("selectLearningModule('funding')");
 assert.equal(f.elements.get('lessonDetails').classList.contains('hidden'),false);
 f.elements.get('learn_reflected').checked=true;await f.run('saveLesson(true)');
 assert.equal(f.store.moduleProgress.funding.completed,true);
 f.run('closeLearningModule()');assert.equal(f.elements.get('lessonDetails').classList.contains('hidden'),true);
 await f.run("selectLearningModule('funding')");assert.equal(f.run('lessonCompleted'),true);
});
test('simple lesson flow keeps notes collapsed, preserves saved notes, and completes into next module',async()=>{
 const f=fixture();f.store.moduleProgress['study-purpose']={subjectReason:'My saved reason',draftAnswer:'My saved answer'};
 await f.run('boot()');await f.run("selectLearningModule('study-purpose')");
 assert.equal(f.elements.get('optionalNotes').open,false);
 assert.equal(f.elements.get('learn_subjectReason').value,'My saved reason');
 await f.run('completeAndContinue()');
 assert.equal(f.run('activeLessonId'),'academic-journey');
 assert.equal(f.store.moduleProgress['study-purpose'].completed,true);
 assert.equal(f.store.moduleProgress['study-purpose'].reflected,true);
 assert.equal(f.store.moduleProgress['study-purpose'].draftAnswer,'My saved answer');
 assert.doesNotMatch(html,/Your preparation notes|4\. Your turn|id="nextModuleBtn"/);
});
test('completion does not advance on save failure; final module opens mock without starting a paid session',async()=>{
 const f=fixture();await f.run('boot()');await f.run("selectLearningModule('funding')");f.store.failSave=true;
 await f.run('completeAndContinue()');assert.equal(f.run('activeLessonId'),'funding');
 assert.match(f.elements.get('lessonCompletionStatus').textContent,/Save failed/);
 f.store.failSave=false;await f.run("selectLearningModule('interview-practice')");await f.run('completeAndContinue()');
 assert.equal(f.store.moduleProgress['interview-practice'].completed,true);
 assert.equal(f.elements.get('interview').classList.contains('on'),true);
 assert.equal(f.store.requests.some(r=>r.url.startsWith('/api/realtime-session')),false);
});
test('report practice opens the matched lesson and clears on module change',async()=>{
 const f=fixture();await f.run('boot()');
 f.run(`reports=[{id:'r1',athleteId:'s1',practiceTargets:[{lessonId:'funding',title:'Your funding',focus:'Clarify tuition coverage'}]}]`);
 await f.run("openReportPractice('r1',0)");
 assert.equal(f.run('activeLessonId'),'funding');assert.match(f.elements.get('practiceFocusText').textContent,/Clarify tuition coverage/);
 assert.equal(f.run('reportPracticeQuery()'),'&reportId=r1&focus=0');
 await f.run('startLearningTutor()');
 assert.ok(f.store.requests.some(request=>request.url.includes('mode=learn&lesson=funding&reportId=r1&focus=0')));
 await f.run("selectLearningModule('study-purpose')");assert.equal(f.run('reportPracticeQuery()'),'');assert.equal(f.run('lessonPractice'),null);
});
test('report practice escapes feedback and rejects unavailable student targets',async()=>{
 const f=fixture();await f.run('boot()');
 assert.doesNotMatch(f.run(`reportPractice({id:'r',practiceTargets:[{focus:'<img onerror=alert(1)>',title:'<script>',lessonId:'funding'}]})`),/<img|<script>/);
 f.run(`reports=[{id:'r2',athleteId:'missing',practiceTargets:[{lessonId:'funding'}]}]`);
 await f.run("openReportPractice('r2',0)");assert.equal(f.run('lessonPractice'),null);
});
test('public entry is a welcome page without shared credentials',()=>{
 assert.match(html,/<div id="welcome" class="welcome">/);
 assert.match(html,/<div id="login" class="login hidden">/);
 for(const id of ['email','password']){
   const input=html.match(new RegExp('<input id="'+id+'"[^>]*>'))[0];
   assert.doesNotMatch(input,/\bvalue=/);
 }
 assert.doesNotMatch(html,/demo123|efe\.sam@scholarbook\.net|Create Athlete Account/);
 const f=fixture();f.run('showRegistration()');
 assert.equal(f.elements.get('welcome').classList.contains('hidden'),true);
 assert.equal(f.elements.get('registration').classList.contains('hidden'),false);
 f.run('backToLogin()');assert.equal(f.elements.get('login').classList.contains('hidden'),false);
 f.elements.get('password').value='temporary';f.run('showWelcome()');
 assert.equal(f.elements.get('password').value,'');
 assert.equal(f.elements.get('welcome').classList.contains('hidden'),false);
 assert.equal(f.elements.get('login').classList.contains('hidden'),true);
});
test('authenticated boot hides all public pages',async()=>{
 const f=fixture();await f.run('boot()');
 for(const id of ['welcome','login','registration'])assert.equal(f.elements.get(id).classList.contains('hidden'),true);
 assert.equal(f.elements.get('app').classList.contains('hidden'),false);
});
test('password change shows errors, then clears secrets and asks for a new sign-in',async()=>{
 const f=fixture();await f.run('boot()');
 assert.ok(f.run("navItems().some(x=>x[1]==='account')"));
 f.elements.get('currentPassword').value='old-password-long';f.elements.get('newPassword').value='new-password-long';f.elements.get('confirmPassword').value='mismatch';
 await f.run('changePassword()');assert.equal(f.store.requests.some(r=>r.url==='/api/change-password'),false);
 f.elements.get('confirmPassword').value='new-password-long';f.store.failPassword=true;
 await f.run('changePassword()');assert.equal(f.elements.get('passwordMessage').textContent,'Current password is incorrect.');
 assert.equal(f.elements.get('changePasswordBtn').disabled,false);
 f.store.failPassword=false;await f.run('changePassword()');
 for(const id of ['currentPassword','newPassword','confirmPassword'])assert.equal(f.elements.get(id).value,'');
 assert.equal(f.elements.get('app').classList.contains('hidden'),true);
 assert.equal(f.elements.get('login').classList.contains('hidden'),false);
 assert.match(f.elements.get('loginErr').textContent,/Password changed/);
});
test('students land at home and saved notes/completion reload',async()=>{
 const f=fixture();await f.run('boot()');assert.equal(f.elements.get('dashboard').classList.contains('on'),true);
 for(const name of ['subjectReason','studyOpportunity','futureUse','draftAnswer'])f.elements.get('learn_'+name).value='My '+name;
 f.elements.get('learn_reflected').checked=true;assert.equal(await f.run('saveLesson(true)'),true);
 f.elements.get('learn_draftAnswer').value='unsaved';await f.run('loadLesson()');assert.equal(f.elements.get('learn_draftAnswer').value,'My draftAnswer');assert.equal(f.elements.get('lessonBadge').textContent,'Completed');
});
test('tutor routes separately, preserves mock transcript, and navigation stops microphone',async()=>{
 const f=fixture();await f.run('boot()');f.run('show("learning");addLine("athlete","Mock answer","mock")');await f.run('startLearningTutor()');
 assert.match(f.store.requests.find(r=>r.url.includes('realtime-session')).url,/mode=learn&lesson=study-purpose/);
 f.run('addLine("assistant","<img src=x>")');assert.equal(f.run('transcript.length'),1);assert.equal(f.run('learningTranscript.length'),1);
 assert.equal(f.elements.get('learn_transcript').children[0].children[1].textContent,'<img src=x>');
 f.run('show("interview")');assert.equal(f.store.tracks[0].stopped,true);assert.equal(f.run('voice'),null);
});
test('load failure keeps controls disabled until retry succeeds',async()=>{
 const f=fixture();f.store.failLoad=true;await f.run('boot()');assert.equal(f.elements.get('learn_startBtn').disabled,true);assert.equal(f.elements.get('learn_subjectReason').disabled,true);assert.equal(f.elements.get('retryLessonBtn').classList.contains('hidden'),false);
 f.store.failLoad=false;await f.run('loadLesson()');assert.equal(f.elements.get('learn_startBtn').disabled,false);assert.equal(f.elements.get('learn_subjectReason').disabled,false);
});
test('navigation during save cannot start a hidden tutor session',async()=>{
 const f=fixture();await f.run('boot()');const pending=f.run('startLearningTutor()');f.run('show("dashboard")');await pending;assert.equal(f.store.tracks.length,0);
});
test('profile, dashboard and report data cannot create HTML or inline handlers',async()=>{
 const f=fixture();await f.run('boot()');
 const payload=`</textarea><img src=x onerror=alert(1)>"'&`;
 f.ctx.payload=payload;
 f.ctx.choices=JSON.parse(JSON.stringify(require('../profile-options')));
 await f.run('api=async(url)=>url==="/api/profile-options"?choices:({postGradPlan:payload,university:payload});renderProfile()');
 const profile=f.elements.get('profileForm').innerHTML;
 assert.doesNotMatch(profile,/<img/);assert.match(profile,/&lt;\/textarea&gt;/);assert.match(profile,/&quot;/);
 f.run(`athletes=[{id:'s1',name:payload,interviewDate:payload,mainConcern:payload}];me={role:'coach'};reports=[{id:payload,athleteId:'s1',overall:45,mockNumber:1,feedback:payload,biggestWeakness:payload,nextStep:payload,humanReview:{reviewer:payload,note:payload,score:45}}];renderAll()`);
 for(const id of ['athleteTable','managerTable','reportsList']){
   const markup=f.elements.get(id).innerHTML;
   assert.doesNotMatch(markup,/<img|onclick=/);assert.match(markup,/&lt;img/);
 }
 assert.match(f.elements.get('reportsList').innerHTML,/data-report-id="&lt;/);
});
test('structured reports show actionable sections and escape every list item',async()=>{
 const f=fixture();await f.run('boot()');
 f.run(`reports=[{id:'r1',athleteId:'s1',formatVersion:2,overall:60,feedback:'A short summary',biggestWeakness:'Clarify funding',strengths:['<img src=x onerror=alert(1)>'],clarifications:['Explain the amount'],nextSteps:['Check your award','Explain the gap','Practise aloud']}];renderReports()`);
 const markup=f.elements.get('reportsList').innerHTML;
 for(const heading of ['What went well','Points to clarify','Your next steps','Practice readiness'])assert.ok(markup.includes(heading));
 assert.match(markup,/<ol>/);assert.doesNotMatch(markup,/<img/);assert.match(markup,/&lt;img/);
 f.run('reports[0].strengths=[];renderReports()');assert.match(f.elements.get('reportsList').innerHTML,/not enough evidence/);
});
test('older reports retain all feedback without inventing structured strengths',async()=>{
 const f=fixture();await f.run('boot()');
 f.run(`reports=[{id:'old',overall:42,feedback:'Original full feedback',biggestWeakness:'Original concern',nextStep:'Original action'}];renderReports()`);
 const markup=f.elements.get('reportsList').innerHTML;
 for(const text of ['Original full feedback','Original concern','Original action'])assert.ok(markup.includes(text));
 assert.doesNotMatch(markup,/Your next steps|What went well/);
});

test('expired protected requests clear private state and stop an active microphone',async()=>{
 const f=fixture();await f.run('boot()');await f.run('startVoice()');
 f.run('addLine("athlete","Private answer");lessonDirty=true');
 f.elements.get('learn_draftAnswer').value='Private draft';
 f.ctx.fetch=async()=>({ok:false,status:401,json:async()=>({error:'Unauthorized'})});
 await assert.rejects(f.run('api("/api/reports")'),/Please sign in again/);
 assert.equal(f.store.tracks[0].stopped,true);assert.equal(f.run('voice'),null);
 assert.equal(f.run('me'),null);assert.equal(f.run('transcript.length'),0);
 assert.equal(f.elements.get('learn_draftAnswer').value,'');
 assert.equal(f.elements.get('app').classList.contains('hidden'),true);
 assert.equal(f.elements.get('login').classList.contains('hidden'),false);
 assert.match(f.elements.get('loginErr').textContent,/Saved work is still available/);
});
test('voice endpoint expiration returns to sign-in and closes the microphone',async()=>{
 const f=fixture();await f.run('boot()');
 f.ctx.fetch=async()=>({ok:false,status:401,text:async()=>JSON.stringify({error:'Unauthorized'})});
 await f.run('startVoice()');
 assert.equal(f.store.tracks[0].stopped,true);assert.equal(f.run('voice'),null);
 assert.equal(f.elements.get('login').classList.contains('hidden'),false);
 assert.match(f.elements.get('loginErr').textContent,/session ended/);
});
test('initial anonymous visit, invalid credentials and incorrect current password do not expire a session',async()=>{
 const f=fixture();
 f.ctx.fetch=async()=>({ok:false,status:401,json:async()=>({error:'Unauthorized'})});
 await assert.rejects(f.run('boot()'),/Unauthorized/);
 assert.equal(f.elements.get('loginErr').textContent,'');
 f.ctx.fetch=async()=>({ok:false,status:401,json:async()=>({error:'Invalid email or password',reference:'auth2-123456abcdef'})});
 await f.run('login()');assert.match(f.elements.get('loginErr').textContent,/Invalid email or password.*auth2-/);
 f.run('me={id:"u1"}');
 f.ctx.fetch=async()=>({ok:false,status:401,json:async()=>({error:'Current password is incorrect.'})});
 await assert.rejects(f.run('api("/api/change-password")'),/Current password is incorrect/);
 assert.equal(f.run('me.id'),'u1');
});
test('late success and late unauthorized responses cannot affect a replacement session',async()=>{
 for(const status of [200,401]){
 const f=fixture();await f.run('boot()');let resolve;
 f.ctx.fetch=()=>new Promise(r=>resolve=r);
 const pending=f.run('api("/api/reports")');
 f.run('returnToSignIn();me={id:"u2"};sessionVersion++');
 resolve({ok:status===200,status,json:async()=>status===200?[{id:'old-private-report'}]:{error:'Unauthorized'}});
 await assert.rejects(pending,/session changed/);
 assert.equal(f.run('me.id'),'u2');
 }
});


test('modules keep separate progress, resume the next lesson and pass selected module to tutor',async()=>{
 const f=fixture();await f.run('boot()');
 for(const name of ['subjectReason','studyOpportunity','futureUse','draftAnswer'])f.elements.get('learn_'+name).value='Study note';
 f.elements.get('learn_reflected').checked=true;await f.run('saveLesson(true)');
 await f.run('continueLearning()');assert.equal(f.run('activeLessonId'),'academic-journey');
 assert.equal(f.elements.get('learn_draftAnswer').value,'');
 f.elements.get('learn_draftAnswer').value='Academic note';await f.run('saveLesson()');
 await f.run('selectLearningModule("study-purpose")');assert.equal(f.elements.get('learn_draftAnswer').value,'Study note');
 assert.match(f.elements.get('courseProgress').textContent,/1 of 6/);
 await f.run('selectLearningModule("academic-journey")');await f.run('startLearningTutor()');
 assert.match(f.store.requests.find(r=>r.url.includes('realtime-session')).url,/lesson=academic-journey/);
 f.run('stopVoice()');
});
test('module switch respects unsaved notes and stops an active tutor',async()=>{
 const f=fixture();await f.run('boot()');f.run('lessonEdited()');f.ctx.confirm=()=>false;
 await f.run('selectLearningModule("funding")');assert.equal(f.run('activeLessonId'),'study-purpose');
 f.ctx.confirm=()=>true;f.run('show("learning")');await f.run('startLearningTutor()');await f.run('selectLearningModule("funding")');
 assert.equal(f.store.tracks[0].stopped,true);assert.equal(f.run('activeLessonId'),'funding');
});

test('student labels and study-level choices preserve legacy profile values safely',async()=>{
 const f=fixture();await f.run('boot()');
 assert.equal(f.elements.get('role').textContent,'Student');
 assert.match(f.elements.get('athleteTable').innerHTML,/Latest feedback/);
 assert.match(f.elements.get('managerTable').innerHTML,/<th>Student<\/th>/);
 const options=f.run('levelOptions("Graduate")');
 for(const name of ['High school','Undergraduate','Master’s','PhD / Doctorate'])assert.ok(options.includes(name));
 assert.match(options,/value="Graduate" selected/);
 f.ctx.oldValue='<img src=x>';
 assert.doesNotMatch(f.run('levelOptions(oldValue)'),/<img/);
});

test('lesson cards show a profile-specific structure and example as safe text',async()=>{
 const f=fixture();await f.run('boot()');
 assert.match(f.elements.get('moduleExample').textContent,/Example University/);
 assert.match(f.elements.get('moduleExample').textContent,/Biology/);
 assert.ok(f.elements.get('moduleStructure').textContent.length>0);
 f.run(`athletes=[{id:'s1',academicLevel:'PhD',university:'<img src=x>',major:'Water systems'}];renderCourse()`);
 assert.match(f.elements.get('moduleExample').textContent,/PhD in Water systems/);
 assert.equal(f.elements.get('moduleExample').innerHTML,'');
 f.run(`athletes=[{id:'s1',academicLevel:'High school',university:'Secondary School'}];renderCourse()`);
 assert.match(f.elements.get('moduleExample').textContent,/secondary education/);
 assert.doesNotMatch(f.elements.get('moduleExample').textContent,/Water systems|PhD/);
});

test('redesigned overview uses saved progress and the next incomplete lesson',async()=>{
 const f=fixture();await f.run('boot()');
 assert.equal(f.elements.get('learningGreeting').textContent,'Your learning path');
 f.run(`courseSaved={'study-purpose':{completed:true},'academic-journey':{completed:true}};renderCourse()`);
 assert.equal(f.elements.get('courseMeter').value,2);
 assert.equal(f.elements.get('featuredModuleTitle').textContent,'Your funding');
 assert.equal(f.elements.get('featuredModuleNumber').textContent,'Module 3 of 6');
 f.run(`courseSaved={};renderCourse()`);assert.equal(f.elements.get('courseMeter').value,0);
 assert.equal(f.elements.get('featuredModuleTitle').textContent,'Your study plans');
});

test('password visibility is optional and resets when leaving sign in',()=>{
 const f=fixture();f.run('backToLogin()');f.elements.get('password').value='test-only';
 f.run('toggleLoginPassword()');assert.equal(f.elements.get('password').type,'text');
 f.run('showWelcome()');assert.equal(f.elements.get('password').value,'');assert.equal(f.elements.get('password').type,'password');
});

test('incomplete reports show mode and uncovered topics without a misleading numeric score',async()=>{
 const f=fixture();await f.run('boot()');
 f.run(`reports=[{id:'r1',athleteId:'s1',formatVersion:3,difficulty:'intensive',overall:null,coverage:{assessed:5,required:7},notCovered:['Previous applications and travel','<img src=x>'],feedback:'Your answers covered five areas.',biggestWeakness:'Explain your school choice.',strengths:[],clarifications:['Explain your school choice.'],nextSteps:['Research one course at your school.']}];renderReports()`);
 const markup=f.elements.get('reportsList').innerHTML;assert.match(markup,/Intensive/);assert.match(markup,/Not enough information to score/);assert.match(markup,/Not covered — not counted against you/);assert.doesNotMatch(markup,/null\/100|High Concern|<img src=x>/);assert.match(markup,/&lt;img/);
});
test('partial report and dashboard label the score without a full readiness badge',async()=>{
 const f=fixture();await f.run('boot()');
 f.run(`reports=[{id:'r1',athleteId:'s1',formatVersion:3,overall:null,partialScore:75,scoreType:'partial',scoreExplanation:'Unanswered topics are excluded.',coverage:{assessed:6,required:7},notCovered:['Future plans'],feedback:'Useful answers.',strengths:[],clarifications:[],nextSteps:[],assessments:[{label:'School choice',status:'assessed',score:7,feedback:'Give a specific reason.'}]}];renderAll()`);
 const markup=f.elements.get('reportsList').innerHTML;
 assert.match(markup,/Partial practice score/);assert.match(markup,/75\/100/);assert.match(markup,/How your score was calculated/);
 assert.doesNotMatch(markup,/Almost Ready|High Concern/);assert.match(f.elements.get('dashCards').innerHTML,/75\/100<small[^>]*>\(partial\)/);
});
test('all-seven report leads with earned score and shows assessed-only quality in the breakdown',async()=>{
 const f=fixture();await f.run('boot()');
 f.run(`reports=[{id:'r1',athleteId:'s1',formatVersion:3,scoringMethod:'all-seven-v1',overall:14,partialScore:null,answeredTopicScore:50,earnedPoints:10,possiblePoints:70,scoreType:'partial',coverage:{assessed:2,required:7},notCovered:['Future plans'],feedback:'Useful answers.',strengths:[],clarifications:[],nextSteps:[],assessments:[{label:'Academic history',status:'assessed',score:6,feedback:'Clarify the training.'},{label:'Funding',status:'assessed',score:4,feedback:'Name the provider.'}]}];renderAll()`);
 const markup=f.elements.get('reportsList').innerHTML;
 assert.match(markup,/Overall preparation/);assert.match(markup,/14\/100/);
 assert.match(markup,/Interview incomplete · 2 of 7/);assert.match(markup,/10 \/ 70/);
 assert.match(markup,/Answered-topic quality: 50\/100/);
 assert.match(markup,/Not assessed — no points earned yet/);
 assert.doesNotMatch(markup,/High Concern|not counted against you|Partial practice score/);
 assert.match(f.elements.get('dashCards').innerHTML,/14\/100<small[^>]*>\(incomplete\)/);
});

test('owner directory paginates and filters accounts, assignments and activity independently',async()=>{
 const f=fixture();f.store.user={id:'owner',name:'Owner',role:'owner'};
 f.store.ownerData={counts:{accounts:26,students:25,reports:2},users:[f.store.user,...Array.from({length:25},(_,i)=>({id:'u'+i,name:'Student '+i,email:'person'+i+'@example.invalid',role:'athlete'}))],students:[{id:'s1',name:'Assigned',staffIds:['coach']},{id:'s2',name:'Unassigned',staffIds:[]}],audit:[]};
 await f.run('boot()');assert.match(f.elements.get('ownerRange').textContent,/1–10 of 26/);
 f.run('ownerPage=3;renderOwnerDirectory()');assert.match(f.elements.get('ownerRange').textContent,/21–26/);
 f.elements.get('ownerSearch').value='person24@';f.run('renderOwnerDirectory()');assert.match(f.elements.get('ownerRange').textContent,/1–1 of 1/);
 f.run("setOwnerTab('assignments')");f.elements.get('ownerFilter').value='unassigned';f.run('renderOwnerDirectory()');assert.match(f.elements.get('ownerAssignments').innerHTML,/Unassigned/);assert.doesNotMatch(f.elements.get('ownerAssignments').innerHTML,/>Assigned</);
 f.run("setOwnerTab('activity')");assert.match(f.elements.get('ownerAudit').innerHTML,/No results/);assert.equal(f.elements.get('ownerNext').disabled,true);
 f.run("openOwnerEdit('role','owner')");assert.equal(f.elements.get('ownerEdit').open,undefined);
});
test('owner assignment dialog submits checked staff and clears the confirmation password',async()=>{
 const f=fixture();f.store.user={id:'owner',name:'Owner',role:'owner'};
 f.store.ownerData={counts:{accounts:2,students:1,reports:0},users:[f.store.user,{id:'coach',name:'Coach',email:'coach@example.invalid',role:'coach'}],students:[{id:'s1',name:'Student',staffIds:[]}],audit:[]};
 await f.run('boot()');f.run("openOwnerEdit('assignment','s1')");
 f.elements.get('ownerEditFields').querySelectorAll=()=>[{value:'coach'}];f.elements.get('ownerPassword').value='current-password';
 await f.run('submitOwnerEdit()');
 const request=f.store.requests.find(r=>r.url==='/api/owner/student-access');assert.deepEqual(JSON.parse(request.body),{studentId:'s1',staffIds:['coach'],currentPassword:'current-password'});assert.equal(f.elements.get('ownerPassword').value,'');
});

test('student home shows the next step from saved progress and separates partial history',async()=>{
 const f=fixture();await f.run('boot()');
 assert.equal(f.elements.get('dashboard').classList.contains('on'),true);
 assert.match(f.elements.get('studentHome').innerHTML,/Continue preparing/);
 f.run(`athletes[0].profileStatus='Incomplete';renderStudentHome()`);
 assert.match(f.elements.get('studentHome').innerHTML,/Complete my profile/);
 f.run(`athletes[0].profileStatus='Complete';curriculum.forEach(m=>courseSaved[m.id]={completed:true});renderStudentHome()`);
 assert.match(f.elements.get('studentHome').innerHTML,/Start mock practice/);
 f.run(`reports=[{id:'p',athleteId:'s1',mockNumber:2,createdAt:'2026-10-22',overall:14,scoreType:'partial',scoringMethod:'all-seven-v1',coverage:{assessed:2,required:7}},{id:'f',athleteId:'s1',mockNumber:1,createdAt:'2026-10-21',overall:70,scoreType:'complete',coverage:{assessed:7,required:7}}];renderStudentHome()`);
 assert.match(f.elements.get('studentHistory').innerHTML,/Partial/);assert.match(f.elements.get('studentHistory').innerHTML,/Full/);assert.match(f.elements.get('studentHistory').innerHTML,/All seven areas/);
 assert.match(f.elements.get('studentHome').innerHTML,/Review my feedback/);
 f.run(`courseLoadState='error';renderStudentHome()`);assert.match(f.elements.get('studentHome').innerHTML,/Progress unavailable/);
 assert.equal(f.run('navItems().slice(0,4).map(x=>x[0]).join(",")'),'Home,Learning,Mock Interview,Reports');
});
test('report next steps lead with three actions while retaining additional guidance',()=>{
 const f=fixture();f.ctx.report={formatVersion:3,strengths:['Strength'],clarifications:['Clarification'],nextSteps:['One','Two','Three','Four'],feedback:'Feedback',biggestWeakness:'Focus'};
 const html=f.run('reportSections(report)');assert.ok(html.indexOf('Your next steps')<html.indexOf('What went well'));assert.match(html,/More next steps/);assert.match(html,/Four/);
});

test('practice history coverage uses assessed counts even when an attempt has no score',async()=>{
 const f=fixture();await f.run('boot()');
 for(const [assessed,required,label] of [[0,7,'Not assessed'],[5,7,'Partial'],[6,7,'Partial'],[7,7,'Full'],[2,3,'Partial']]){
  f.run(`renderStudentHistory([{mockNumber:1,createdAt:'2026-10-23',overall:null,coverage:{assessed:${assessed},required:${required}}}])`);
  assert.match(f.elements.get('studentHistory').innerHTML,new RegExp('>'+label+'</span>'));
 }
 f.run("renderStudentHistory([{mockNumber:1,createdAt:'2026-10-23',overall:null}])");
 assert.match(f.elements.get('studentHistory').innerHTML,/Coverage not recorded/);
 f.run("reports=[{athleteId:'s1',overall:null}];renderAll()");
 assert.match(f.elements.get('dashCards').innerHTML,/Not scored/);
});

test('opening a lesson hides the module overview and closing restores it',async()=>{
 const f=fixture();await f.run('boot()');
 f.run('lessonOpen=true;renderCourse()');
 assert.equal(f.elements.get('learningOverview').classList.contains('hidden'),true);
 f.run('closeLearningModule()');
 assert.equal(f.elements.get('learningOverview').classList.contains('hidden'),false);
});
