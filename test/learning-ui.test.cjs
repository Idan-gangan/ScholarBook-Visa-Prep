const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
function fixture(){
 const elements=new Map();
 function element(){const classes=new Set();return {value:'',textContent:'',innerHTML:'',disabled:false,checked:false,children:[],dataset:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)},addEventListener(){},append(...items){this.children.push(...items)},appendChild(item){this.children.push(item)},replaceChildren(...items){this.children=items;if(items[0]?.value)this.value=items[0].value},pause(){}}}
 for(const match of html.matchAll(/id="([^"]+)"/g))elements.set(match[1],element());
 const document={getElementById:id=>{if(!elements.has(id))throw new Error('Missing DOM element '+id);return elements.get(id)},querySelectorAll:selector=>selector==='.screen'?['learning','dashboard','interview','profile','reports','manager'].map(id=>elements.get(id)):[],createElement:()=>element(),createTextNode:text=>({textContent:text})};
 const student={id:'s1',userId:'u1',name:'Test Student',university:'Example University',major:'Biology',currentScore:0};
 const store={progress:{},requests:[],tracks:[],failLoad:false};
 const ctx=vm.createContext({document,console,AbortController,URL,Date,JSON,Set,setTimeout,clearTimeout,Option:function(text,value){return {text,value}},window:{addEventListener(){}},location:{reload(){}},confirm:()=>true,navigator:{mediaDevices:{getUserMedia:async()=>{const track={enabled:true,stop(){this.stopped=true}};store.tracks.push(track);return {getTracks:()=>[track],getAudioTracks:()=>[track]}}}},RTCPeerConnection:class{addTrack(){}createDataChannel(){return {readyState:'open',addEventListener(){},send(){},close(){}}}async createOffer(){return {sdp:'offer'}}async setLocalDescription(){}async setRemoteDescription(){}close(){}},fetch:async(url,opt={})=>{
   store.requests.push({url,...opt});let data;const route=new URL(url,'http://local').pathname;
   if(route==='/api/me')data={id:'u1',name:'Test Student',role:'athlete'};
   else if(route==='/api/athletes')data=[student];else if(route==='/api/reports')data=[];else if(route==='/api/my-profile')data=student;
   else if(route==='/api/learning/study-purpose'){
     if(store.failLoad&&!opt.method)return {ok:false,json:async()=>({error:'Unavailable'})};
     if(opt.method==='PUT')store.progress={...JSON.parse(opt.body),updatedAt:'2026-09-27'};
     data={progress:store.progress};
   }else if(route==='/api/realtime-session')return {ok:true,text:async()=> 'answer'};
   else throw new Error('Unexpected route '+route);
   return {ok:true,json:async()=>structuredClone(data)};
 }});
 vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1].replace('boot().catch(()=>{});',''),ctx);
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
