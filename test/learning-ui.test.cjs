const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
function fixture(){
 const elements=new Map();
 function element(){const classes=new Set();return {value:'',textContent:'',innerHTML:'',disabled:false,checked:false,children:[],dataset:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)},querySelectorAll(){return []},setAttribute(){},addEventListener(){},append(...items){this.children.push(...items)},appendChild(item){this.children.push(item)},replaceChildren(...items){this.children=items;if(items[0]?.value)this.value=items[0].value},pause(){}}}
 for(const match of html.matchAll(/id="([^"]+)"/g))elements.set(match[1],element());
 const document={getElementById:id=>{if(!elements.has(id))throw new Error('Missing DOM element '+id);return elements.get(id)},querySelector:selector=>{if(!elements.has(selector))elements.set(selector,element());return elements.get(selector)},querySelectorAll:selector=>selector==='.screen'?['learning','dashboard','interview','profile','reports','manager'].map(id=>elements.get(id)):[],createElement:()=>element(),createTextNode:text=>({textContent:text})};
 const student={id:'s1',userId:'u1',name:'Test Student',university:'Example University',major:'Biology',currentScore:0};
 const store={progress:{},moduleProgress:{},requests:[],tracks:[],failLoad:false,failPassword:false};
 const ctx=vm.createContext({document,console,AbortController,URL,Date,JSON,Set,setTimeout,clearTimeout,Option:function(text,value){return {text,value}},window:{VisaAtlasCurriculum:require("../public/curriculum"),addEventListener(){}},location:{reload(){}},confirm:()=>true,navigator:{mediaDevices:{getUserMedia:async()=>{const track={enabled:true,stop(){this.stopped=true}};store.tracks.push(track);return {getTracks:()=>[track],getAudioTracks:()=>[track]}}}},RTCPeerConnection:class{addTrack(){}createDataChannel(){return {readyState:'open',addEventListener(){},send(){},close(){}}}async createOffer(){return {sdp:'offer'}}async setLocalDescription(){}async setRemoteDescription(){}close(){}},fetch:async(url,opt={})=>{
   store.requests.push({url,...opt});let data;const route=new URL(url,'http://local').pathname;
   if(route==='/api/change-password'){if(store.failPassword)return {ok:false,json:async()=>({error:'Current password is incorrect.'})};data={ok:true};}
   else if(route==='/api/me')data={id:'u1',name:'Test Student',role:'athlete'};
   else if(route==='/api/athletes')data=[student];else if(route==='/api/reports')data=[];else if(route==='/api/my-profile')data=student;
   else if(route.startsWith('/api/learning/')){
     if(store.failLoad&&!opt.method)return {ok:false,json:async()=>({error:'Unavailable'})};
     const id=route.split('/').at(-1);
     if(opt.method==='PUT')store.moduleProgress[id]={...JSON.parse(opt.body),updatedAt:'2026-09-27'};
     data={progress:store.moduleProgress[id]||{}};
   }else if(route==='/api/realtime-session')return {ok:true,headers:{get:()=> '480'},text:async()=> 'answer'};
   else throw new Error('Unexpected route '+route);
   return {ok:true,json:async()=>structuredClone(data)};
 }});
 vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1].replace('boot().catch(()=>{if(new URLSearchParams(location.search).get("signin")==="1")backToLogin()});',''),ctx);
 return {elements,store,ctx,run:code=>vm.runInContext(code,ctx)};
}
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
test('students land in learning and saved notes/completion reload',async()=>{
 const f=fixture();await f.run('boot()');assert.equal(f.elements.get('learning').classList.contains('on'),true);
 for(const name of ['subjectReason','studyOpportunity','futureUse','draftAnswer'])f.elements.get('learn_'+name).value='My '+name;
 f.elements.get('learn_reflected').checked=true;assert.equal(await f.run('saveLesson(true)'),true);
 f.elements.get('learn_draftAnswer').value='unsaved';await f.run('loadLesson()');assert.equal(f.elements.get('learn_draftAnswer').value,'My draftAnswer');assert.equal(f.elements.get('lessonBadge').textContent,'Completed');
});
test('tutor routes separately, preserves mock transcript, and navigation stops microphone',async()=>{
 const f=fixture();await f.run('boot()');f.run('addLine("athlete","Mock answer","mock")');await f.run('startLearningTutor()');
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
 await f.run('api=async()=>({postGradPlan:payload,university:payload});renderProfile()');
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
 for(const heading of ['What went well','Points to clarify','Your next three steps','Practice readiness'])assert.ok(markup.includes(heading));
 assert.match(markup,/<ol>/);assert.doesNotMatch(markup,/<img/);assert.match(markup,/&lt;img/);
 f.run('reports[0].strengths=[];renderReports()');assert.match(f.elements.get('reportsList').innerHTML,/not enough evidence/);
});
test('older reports retain all feedback without inventing structured strengths',async()=>{
 const f=fixture();await f.run('boot()');
 f.run(`reports=[{id:'old',overall:42,feedback:'Original full feedback',biggestWeakness:'Original concern',nextStep:'Original action'}];renderReports()`);
 const markup=f.elements.get('reportsList').innerHTML;
 for(const text of ['Original full feedback','Original concern','Original action'])assert.ok(markup.includes(text));
 assert.doesNotMatch(markup,/Your next three steps|What went well/);
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
 f.ctx.confirm=()=>true;await f.run('startLearningTutor()');await f.run('selectLearningModule("funding")');
 assert.equal(f.store.tracks[0].stopped,true);assert.equal(f.run('activeLessonId'),'funding');
});

test('student labels and study-level choices preserve legacy profile values safely',async()=>{
 const f=fixture();await f.run('boot()');
 assert.equal(f.elements.get('role').textContent,'Student');
 assert.match(f.elements.get('athleteTable').innerHTML,/<th>Student<\/th>/);
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
 assert.equal(f.elements.get('learningGreeting').textContent,'Welcome back, Test');
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
