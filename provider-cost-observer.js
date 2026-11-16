'use strict';
const WebSocket=require('ws');
const {hash}=require('./provider-costs');
// Read-only sideband. Never send instructions or tool events; never log message bodies.
function createObserver({ledger,apiKey,Socket=WebSocket,log=console.warn,timeoutMs=510000}){
 const observers=new Map();
 async function attach(userId,token,location){
  const match=/\/realtime\/calls\/([A-Za-z0-9_-]+)$/.exec(location||'');
  if(!match)throw Error('Missing call identifier');
  const sample=hash(userId+':'+token);
  await ledger.begin(sample);
  let queue=Promise.resolve(),pending=0,gap=false,closed=false,timer,ws;
  const models={voice:'gpt-realtime-2.1',transcription:'gpt-transcribe'};
  const enqueue=fn=>{
   if(pending>=512){gap=true;log('[cost] PROVIDER_QUEUE_FULL');return;}
   pending++;
   queue=queue.then(async()=>{
    for(let i=0;i<3;i++)try{await fn();return;}catch{if(i===2){gap=true;log('[cost] PROVIDER_WRITE_FAILED');}else await new Promise(r=>setTimeout(r,100*(i+1)));}
   }).finally(()=>pending--);
  };
  const finish=(code)=>{
   if(closed)return;closed=true;clearTimeout(timer);observers.delete(sample);
   if(code!==1000)gap=true;
   enqueue(()=>ledger.state(sample,gap?'interrupted':'closed',gap));
  };
  try{
   ws=new Socket('wss://api.openai.com/v1/realtime?call_id='+encodeURIComponent(match[1]),{
    headers:{Authorization:'Bearer '+apiKey},handshakeTimeout:8000,maxPayload:2*1024*1024,perMessageDeflate:false
   });
   observers.set(sample,ws);
   ws.on('message',raw=>{
    try{
     const event=JSON.parse(raw.toString());
     if(event.type==='session.created'||event.type==='session.updated'){
      if(typeof event.session?.model==='string')models.voice=event.session.model;
      const model=event.session?.audio?.input?.transcription?.model;
      if(typeof model==='string')models.transcription=model;
     }
     if(['response.created','input_audio_buffer.committed','response.done','conversation.item.input_audio_transcription.completed','conversation.item.input_audio_transcription.failed'].includes(event.type)){
      // Discard text/audio immediately: queued closures retain only usage and identifiers.
      const clean={type:event.type,item_id:event.item_id,content_index:event.content_index,usage:event.usage,
       response:event.response?{id:event.response.id,model:event.response.model,service_tier:event.response.service_tier,usage:event.response.usage}:undefined};
      const snapshot={...models};enqueue(()=>ledger.event(sample,clean,snapshot));
     }
    }catch{gap=true;log('[cost] PROVIDER_EVENT_INVALID');}
   });
   ws.on('error',()=>{gap=true;log('[cost] PROVIDER_CONNECTION_FAILED');});
   ws.on('close',finish);
   timer=setTimeout(()=>{gap=true;ws.terminate();finish(1006);},timeoutMs);timer.unref?.();
   await new Promise((resolve,reject)=>{
    ws.once('open',()=>{enqueue(()=>ledger.state(sample,'observing'));resolve();});ws.once('error',()=>reject(Error('Cost observer unavailable')));
    ws.once('close',()=>reject(Error('Cost observer closed')));
   });
  }catch{
   gap=true;ws?.terminate();finish(1006);
   await queue;throw Error('Cost observer unavailable');
  }
 }
 function stop(){for(const ws of observers.values())ws.terminate();}
 return {attach,stop};
}
module.exports={createObserver};
