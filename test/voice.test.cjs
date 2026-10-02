const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const code=html.slice(html.indexOf('// Voice lifecycle:'),html.indexOf('async function generateReport()'));
function setup(){
 const els=new Map(),sent=[],lines=[],timers=new Map();let next=0;
 const track={enabled:false,stop(){this.stopped=true}};
 const ctx=vm.createContext({console,AbortController,JSON,navigator:{},RTCPeerConnection:function(){},setTimeout:fn=>{timers.set(++next,fn);return next},clearTimeout:id=>timers.delete(id),$:id=>{if(!els.has(id))els.set(id,{value:'athlete1',replaceChildren(){}});return els.get(id)},addLine:(role,text)=>lines.push({role,text}),fetch(){}});
 vm.runInContext('let pc=null,dc=null,stream=null,transcript=[];'+code,ctx);
 ctx.channel={readyState:'open',send:s=>sent.push(JSON.parse(s)),close(){}};ctx.mic={getAudioTracks:()=>[track],getTracks:()=>[track]};
 vm.runInContext('voice={connected:true,busy:false,playing:false,waiting:false,pendingItem:null};dc=channel;stream=mic',ctx);
 const run=s=>vm.runInContext(s,ctx);
 return {ctx,sent,track,els,lines,timers,run,event:e=>{ctx.ev=e;run('voiceEvent(voice,ev)')},responses:()=>sent.filter(e=>e.type==='response.create').length};
}
const commit=id=>({type:'input_audio_buffer.committed',item_id:id});
const transcript=(id,text)=>({type:'conversation.item.input_audio_transcription.completed',item_id:id,transcript:text});
test('hands-free accepts an answer automatically once, after transcription',()=>{
 const s=setup();s.run('voiceReady(voice)');assert.equal(s.track.enabled,true);
 s.event(commit('a'));assert.equal(s.track.enabled,false);assert.equal(s.responses(),0);
 s.event(transcript('a','Yes'));s.event(transcript('a','Yes'));s.event(commit('a'));
 assert.equal(s.responses(),1);assert.equal(s.lines.length,1);assert.equal(s.timers.size,0);
 assert.equal(s.sent.some(e=>e.type==='conversation.item.delete'&&e.item_id==='a'),false);
});
test('empty and punctuation-only audio resume listening without advancing',()=>{
 const s=setup();for(const [id,text] of [['a',''],['b',' ... ']]){s.event(commit(id));s.event(transcript(id,text));assert.equal(s.track.enabled,true)}
 assert.equal(s.responses(),0);assert.equal(s.lines.length,0);
});
test('short numeric and non-English answers are not discarded',()=>{
 for(const text of ['No','2','نعم','是']){const s=setup();s.event(commit('a'));s.event(transcript('a',text));assert.equal(s.responses(),1)}
});
test('background commits during generation/playback are discarded and never reported',()=>{
 const s=setup();s.run('voiceRespond(voice)');s.event(commit('noise1'));s.event(transcript('noise1','television'));
 s.event({type:'response.done',response:{output:[{content:[{type:'audio'}]}]}});
 assert.equal(s.track.enabled,false);s.event(commit('noise2'));s.event(transcript('noise2','other speaker'));
 assert.equal(s.responses(),1);assert.equal(s.lines.length,0);
 s.event({type:'output_audio_buffer.stopped'});assert.equal(s.track.enabled,true);
});
test('playback ending before response.done still waits for generation',()=>{
 const s=setup();s.run('voiceRespond(voice)');s.event({type:'output_audio_buffer.started'});s.event({type:'output_audio_buffer.stopped'});assert.equal(s.track.enabled,false);
 s.event({type:'response.done',response:{output:[{content:[{type:'audio'}]}]}});assert.equal(s.track.enabled,true);
});
test('failed/missing transcription recovers without another question or late response',()=>{
 const s=setup();s.event(commit('a'));s.event({type:'conversation.item.input_audio_transcription.failed',item_id:'a'});assert.equal(s.track.enabled,true);
 s.event(commit('b'));[...s.timers.values()][0]();assert.equal(s.track.enabled,true);s.event(transcript('b','late'));assert.equal(s.responses(),0);
});
test('errors stop media and remain visible',()=>{
 const s=setup();s.event({type:'error',error:{message:'test failure'}});assert.equal(s.track.stopped,true);assert.match(s.els.get('voiceStatus').textContent,/test failure/);
});
test('ending during microphone permission stops late media',async()=>{
 const s=setup();let resolve;s.ctx.navigator.mediaDevices={getUserMedia:()=>new Promise(r=>resolve=r)};
 s.run('stopVoice()');const pending=s.run('startVoice()');s.run('stopVoice()');resolve(s.ctx.mic);await pending;
 assert.equal(s.track.stopped,true);assert.equal(s.run('voice'),null);
});
test('ending during pending transcription clears timeout',()=>{
 const s=setup();s.event(commit('a'));s.run('stopVoice()');assert.equal(s.timers.size,0);
});
test('ending clears both session limit and warning timers',()=>{
 const s=setup();s.run('voice.limitTimer=setTimeout(()=>{},480000);voice.warningTimer=setTimeout(()=>{},420000)');
 assert.equal(s.timers.size,2);s.run('stopVoice()');assert.equal(s.timers.size,0);
});
test('session deadline stops media while preserving the captured transcript',async()=>{
 const s=setup();s.run('stopVoice();transcript=[{text:"keep this answer"}]');
 s.ctx.navigator.mediaDevices={getUserMedia:async()=>s.ctx.mic};
 s.ctx.document={createElement:()=>({pause(){}})};
 s.ctx.RTCPeerConnection=class{addTrack(){}createDataChannel(){return {addEventListener(){},close(){}}}async createOffer(){return {sdp:'v=0'}}async setLocalDescription(){}async setRemoteDescription(){}close(){}};
 s.ctx.fetch=async()=>({ok:true,text:async()=> 'answer',headers:{get:()=> '720'}});
 await s.run('startVoice()');s.run('transcript.push({text:"keep this answer"})');
 assert.equal(s.timers.size,2);
 const deadline=[...s.timers.values()][0];deadline();
 assert.equal(s.run('voice'),null);assert.equal(s.track.stopped,true);
 assert.equal(s.run('transcript[0].text'),'keep this answer');assert.equal(s.timers.size,0);
 assert.match(s.els.get('voiceStatus').textContent,/time limit reached/);
});
test('browser script parses and manual answer controls are removed',()=>{
 new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);assert.doesNotMatch(html,/answerBtn|voiceMode|toggleAnswer|Tap to answer|Finish answer/);
});
