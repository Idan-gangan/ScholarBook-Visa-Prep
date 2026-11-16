'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {price,textUsage,transcriptionUsage,createProviderCosts}=require('../provider-costs');
const {createObserver}=require('../provider-cost-observer');
const at=Date.parse('2026-11-15T00:00:00Z');
const u={inputAudio:100,inputText:50,cachedAudio:40,cachedText:10,outputAudio:20,outputText:10};
test('versioned rates separate cache reads, both write lifetimes, audio and transcription',()=>{
 assert.equal(price('voice','gpt-realtime-2.1',u,at),.00362);
 const t=textUsage({input_tokens:12000,output_tokens:100,input_tokens_details:{cached_tokens:4000,cache_write_tokens:7000,cache_write_tokens_details:{ttl_30m_tokens:3000,ttl_12h_tokens:4000}}});
 assert.equal(price('text','gpt-5.6-sol',t,at),.0626);
 assert.equal(price('transcription','gpt-transcribe',transcriptionUsage({type:'duration',seconds:60}),at),.0045);
 assert.equal(price('text','gpt-5.6-sol',{...t,inputTokens:300000},at),((300000-11000)*8+4000*.8+3000*10+4000*20+100*30)/1e6);
});
test('missing cache detail, unknown model, expired rates and unsupported tier never become zero costs',()=>{
 const t=textUsage({input_tokens:100,output_tokens:20,input_tokens_details:{cached_tokens:10}});
 assert.equal(price('text','gpt-5.6-sol',t,at),null);
 assert.equal(price('voice','unknown',u,at),null);
 assert.equal(price('voice','gpt-realtime-2.1',u,Date.parse('2026-12-01')),null);
 assert.equal(price('voice','gpt-realtime-2.1',u,at,'priority'),null);
 assert.equal(transcriptionUsage({type:'duration',seconds:-1}),null);
 assert.equal(textUsage({input_tokens:10,output_tokens:20,input_tokens_details:{cached_tokens:10,cache_write_tokens:1}}),null);
});
test('provider events retain counters only, include failed/cancelled response usage and pending transcription',async()=>{
 const rows=[],ledger=createProviderCosts({query:async(sql,args)=>{rows.push(args);return {rows:[]}}});
 await ledger.event('hashed-sample',{type:'response.done',response:{id:'resp-private',status:'cancelled',output:['private transcript'],usage:{input_tokens:150,output_tokens:30,input_token_details:{audio_tokens:100,text_tokens:50,cached_tokens:50,cached_tokens_details:{audio_tokens:40,text_tokens:10}},output_token_details:{audio_tokens:20,text_tokens:10}}}},{voice:'gpt-realtime-2.1'});
 await ledger.event('hashed-sample',{type:'input_audio_buffer.committed',item_id:'private-item'},{transcription:'gpt-transcribe'});
 await ledger.event('hashed-sample',{type:'conversation.item.input_audio_transcription.completed',item_id:'private-item',content_index:0,transcript:'private transcript',usage:{type:'duration',seconds:12}},{transcription:'gpt-transcribe'});
 assert.equal(rows[1][0],rows[2][0]);assert.equal(rows[1][4],null);
 assert.doesNotMatch(JSON.stringify(rows),/private|cancelled/);
 assert.equal(JSON.parse(rows[2][4]).seconds,12);
});
class Socket extends EventEmitter{
 constructor(url,options){super();Socket.last=this;this.url=url;this.options=options;queueMicrotask(()=>this.emit('open'));}
 terminate(){this.emit('close',1006);}
}
const tick=()=>new Promise(r=>setTimeout(r,10));
test('server sideband waits for connection, strips speech, and records interrupted connection gaps',async()=>{
 const events=[],states=[],ledger={begin:async()=>{},event:async(...args)=>events.push(args),state:async(...args)=>states.push(args)};
 const obs=createObserver({ledger,apiKey:'private-key',Socket,log:()=>{}});
 await obs.attach('u','t','https://api.openai.com/v1/realtime/calls/rtc_abc');
 assert.equal(Socket.last.url,'wss://api.openai.com/v1/realtime?call_id=rtc_abc');
 assert.equal(Socket.last.options.headers.Authorization,'Bearer private-key');
 Socket.last.emit('message',Buffer.from(JSON.stringify({type:'response.done',response:{id:'r',usage:{},output:['secret speech']}})));
 Socket.last.emit('close',1006);await tick();
 assert.equal(events.length,1);assert.doesNotMatch(JSON.stringify(events),/secret speech|private-key/);
 assert.equal(states.at(-1)[1],'interrupted');assert.equal(states.at(-1)[2],true);
});
test('database retries do not change event identity and a clean close drains pending writes',async()=>{
 let attempts=0;const states=[];
 const ledger={begin:async()=>{},state:async(...a)=>states.push(a),event:async()=>{attempts++;if(attempts===1)throw Error('transient');}};
 const obs=createObserver({ledger,apiKey:'k',Socket,log:()=>{}});await obs.attach('u','t','/v1/realtime/calls/rtc_test');
 Socket.last.emit('message',Buffer.from(JSON.stringify({type:'response.created',response:{id:'r'}})));Socket.last.emit('close',1000);
 await new Promise(r=>setTimeout(r,150));assert.equal(attempts,2);assert.equal(states.at(-1)[1],'closed');
});
test('cost export is owner protected, and voice observers attach before SDP delivery',()=>{
 const s=require('node:fs').readFileSync(require.resolve('../server.js'),'utf8');
 assert.ok(s.indexOf("if(!isOwner(u))")<s.indexOf("url.pathname==='/api/owner/cost-export'"));
 assert.ok(s.indexOf('await costObserver.attach')<s.indexOf('res.end(answer)'));
});
