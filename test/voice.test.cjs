const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const code=html.slice(html.indexOf('// Voice lifecycle:'),html.indexOf('async function generateReport()'));
function setup(){
 const els=new Map(),sent=[],lines=[],timers=new Map();let next=0;
 const track={enabled:false,stop(){this.stopped=true}};
 const ctx=vm.createContext({console,AbortController,JSON,confirm:()=>true,refreshVoiceUsage(){},navigator:{},RTCPeerConnection:function(){},setTimeout:fn=>{timers.set(++next,fn);return next},clearTimeout:id=>timers.delete(id),$:id=>{if(!els.has(id))els.set(id,{value:'athlete1',dataset:{},replaceChildren(){}});return els.get(id)},addLine:(role,text)=>lines.push({role,text}),api:async()=>({ok:true}),fetch(){}});
 ctx.requestVoiceConsent=(mode,agree)=>agree();
 vm.runInContext('let pc=null,dc=null,stream=null,transcript=[];'+code,ctx);
 ctx.channel={readyState:'open',send:s=>sent.push(JSON.parse(s)),close(){}};ctx.mic={getAudioTracks:()=>[track],getTracks:()=>[track]};
 vm.runInContext('voice={connected:true,busy:false,playing:false,waiting:false,pendingItem:null};dc=channel;stream=mic',ctx);
 const run=s=>vm.runInContext(s,ctx);
 return {ctx,sent,track,els,lines,timers,run,event:e=>{ctx.ev=e;run('voiceEvent(voice,ev)')},responses:()=>sent.filter(e=>e.type==='response.create').length};
}
const commit=id=>({type:'input_audio_buffer.committed',item_id:id});
test('declining either voice notice leaves microphone and connection untouched',async()=>{
 for(const mode of ['learn','mock']){
  const s=setup();s.run('stopVoice()');let requestedMode='';
  s.ctx.requestVoiceConsent=selected=>{requestedMode=selected};
  s.ctx.navigator.mediaDevices={getUserMedia:()=>{throw new Error('Must not request microphone')}};
  await s.run('startVoice("'+mode+'")');
  assert.equal(s.run('voice'),null);
  assert.equal(requestedMode,mode);
 }
});
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
 assert.equal(s.timers.size,3);
 assert.equal(s.els.get('voiceClock').textContent,'12:00');
 const deadline=s.timers.get(s.run('voice.limitTimer'));deadline();
 assert.equal(s.run('voice'),null);assert.equal(s.track.stopped,true);
 assert.equal(s.run('transcript[0].text'),'keep this answer');assert.equal(s.timers.size,0);
 assert.match(s.els.get('voiceStatus').textContent,/time limit reached/);
});
test('browser script parses and manual answer controls are removed',()=>{
 new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);assert.doesNotMatch(html,/answerBtn|voiceMode|toggleAnswer|Tap to answer|Finish answer/);
});


test('portrait speaking indicator follows playback events and resets on stop',()=>{
 const s=setup();s.run("voice.mode='mock';voiceRespond(voice)");assert.equal(s.els.get('interviewerStage').dataset.state,'thinking');
 s.event({type:'output_audio_buffer.started'});assert.equal(s.els.get('interviewerStage').dataset.state,'speaking');
 s.event({type:'response.done',response:{output:[{content:[{type:'audio'}]}]}});assert.equal(s.els.get('interviewerStage').dataset.state,'speaking');
 s.event({type:'output_audio_buffer.stopped'});assert.equal(s.els.get('interviewerStage').dataset.state,'listening');
 s.run('stopVoice()');assert.equal(s.els.get('interviewerStage').dataset.state,'ended');
});

test('mock closing waits until both response generation and playback finish, then stops microphone',()=>{
 for(const order of ['audio-first','response-first']){
  const s=setup();s.run("voice.mode='mock';voiceRespond(voice)");
  s.event({type:'output_audio_buffer.started'});
  s.event({type:'response.output_audio_transcript.done',transcript:require('../interview-design').CLOSE});
  assert.notEqual(s.run('voice'),null);assert.equal(s.track.enabled,false);
  const done={type:'response.done',response:{output:[{content:[{type:'audio'}]}]}},stopped={type:'output_audio_buffer.stopped'};
  s.event(order==='audio-first'?stopped:done);assert.notEqual(s.run('voice'),null);
  s.event(order==='audio-first'?done:stopped);assert.equal(s.run('voice'),null);assert.equal(s.track.stopped,true);
 }
});
test('tutor transcript cannot trigger the mock closing behaviour',()=>{
 const s=setup();s.run("voice.mode='learn';voiceRespond(voice)");s.event({type:'response.output_audio_transcript.done',transcript:require('../interview-design').CLOSE});assert.notEqual(s.run('voice'),null);assert.equal(s.run('voice.closing'),undefined);
});

test('ending while connection is being created closes the late server call without reconnecting media',async()=>{
 const s=setup();s.run('stopVoice()');
 let resolve,requested=false;const ended=[],token='b'.repeat(48);
 s.ctx.api=async(url,options)=>{ended.push({url,body:JSON.parse(options.body)});return {ok:true};};
 s.ctx.navigator.mediaDevices={getUserMedia:async()=>s.ctx.mic};
 s.ctx.document={createElement:()=>({pause(){}})};
 s.ctx.RTCPeerConnection=class{addTrack(){}createDataChannel(){return {addEventListener(){},close(){}}}async createOffer(){return {sdp:'v=0'}}async setLocalDescription(){}async setRemoteDescription(){throw Error('Stopped session must not connect');}close(){}};
 s.ctx.fetch=()=>{requested=true;return new Promise(r=>resolve=r);};
 const pending=s.run('startVoice()');
 while(!requested)await new Promise(r=>setImmediate(r));
 s.run('stopVoice()');
 resolve({ok:true,text:async()=> 'answer',headers:{get:name=>name==='X-Voice-Token'?token:'720'}});
 await pending;
 assert.equal(s.track.stopped,true);assert.equal(s.run('voice'),null);
 assert.deepEqual(ended,[{url:'/api/voice/end',body:{token}}]);assert.equal(s.timers.size,0);
});
