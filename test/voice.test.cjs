const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../public/index.html'),'utf8');
const code=html.slice(html.indexOf('// Voice lifecycle:'),html.indexOf('async function generateReport()'));
function setup(mode='manual'){
 const els=new Map(),sent=[],track={enabled:false,stop(){this.stopped=true}};
 const ctx=vm.createContext({console,AbortController,JSON,navigator:{},RTCPeerConnection:function(){},$:id=>{if(!els.has(id))els.set(id,{value:id==='voiceMode'?mode:'athlete1',replaceChildren(){}});return els.get(id)},addLine(){},fetch(){}});
 vm.runInContext('let pc=null,dc=null,stream=null,transcript=[];'+code,ctx);
 ctx.channel={readyState:'open',send:s=>sent.push(JSON.parse(s)),close(){}};ctx.mic={getAudioTracks:()=>[track],getTracks:()=>[track]};
 vm.runInContext(`voice={mode:'${mode}',connected:true,busy:false,playing:false,waiting:false};dc=channel;stream=mic`,ctx);
 return {ctx,sent,track,els,run:s=>vm.runInContext(s,ctx),event:e=>{ctx.ev=e;vm.runInContext('voiceEvent(voice,ev)',ctx)}};
}
test('manual answers only submit after Finish and commit acknowledgment; duplicate events cannot overlap',()=>{
 const s=setup();s.run('voiceReady(voice)');assert.equal(s.track.enabled,false);
 s.run('toggleAnswer()');assert.equal(s.track.enabled,true);assert.equal(s.sent.at(-1).type,'input_audio_buffer.clear');
 s.run('toggleAnswer();toggleAnswer()');assert.equal(s.track.enabled,false);assert.equal(s.sent.filter(e=>e.type==='input_audio_buffer.commit').length,1);
 assert.equal(s.sent.filter(e=>e.type==='response.create').length,0);
 s.event({type:'input_audio_buffer.committed'});s.event({type:'input_audio_buffer.committed'});
 assert.equal(s.sent.filter(e=>e.type==='response.create').length,1);
});
test('background commits during generation/playback do not trigger another question',()=>{
 const s=setup('hands-free');s.run('voiceRespond(voice)');
 s.event({type:'input_audio_buffer.committed'});
 s.event({type:'response.done',response:{output:[{content:[{type:'audio'}]}]}});
 assert.equal(s.track.enabled,false);s.event({type:'input_audio_buffer.committed'});
 assert.equal(s.sent.length,1);s.event({type:'output_audio_buffer.stopped'});assert.equal(s.track.enabled,true);
 s.event({type:'input_audio_buffer.committed'});assert.equal(s.sent.length,2);
});
test('playback ending before response.done still waits for generation',()=>{
 const s=setup('hands-free');s.run('voiceRespond(voice)');s.event({type:'output_audio_buffer.started'});s.event({type:'output_audio_buffer.stopped'});assert.equal(s.track.enabled,false);
 s.event({type:'response.done',response:{output:[{content:[{type:'audio'}]}]}});assert.equal(s.track.enabled,true);
});
test('empty audio allows retry; other errors clean up and remain visible',()=>{
 const s=setup();s.run('voice.waiting=true');s.event({type:'error',error:{code:'input_audio_buffer_commit_empty'}});assert.equal(s.els.get('answerBtn').disabled,false);
 s.event({type:'error',error:{message:'test failure'}});assert.equal(s.track.stopped,true);assert.match(s.els.get('voiceStatus').textContent,/test failure/);
});
test('ending during microphone permission stops late media and ignores stale events',async()=>{
 const s=setup();let resolve;s.ctx.navigator.mediaDevices={getUserMedia:()=>new Promise(r=>resolve=r)};
 s.run('stopVoice()');const pending=s.run('startVoice()');s.run('stopVoice()');resolve(s.ctx.mic);await pending;
 assert.equal(s.track.stopped,true);assert.equal(s.run('voice'),null);
});
test('session disables automatic replies and defaults to manual mode',()=>{
 const server=fs.readFileSync(require('node:path').join(__dirname,'../server.js'),'utf8');
 assert.match(server,/create_response:false/);assert.match(server,/interrupt_response:false/);assert.match(server,/noise_reduction:\{type:"far_field"\}/);assert.match(server,/\} : null/);
});
test('complete browser script parses',()=>{new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1])});
