/* Diagnostic counters only. Never send speech, prompts, or profile data. */
(function(root){
 const keys=['inputAudio','inputText','cachedAudio','cachedText','outputAudio','outputText'];
 const count=n=>Number.isSafeInteger(n)&&n>=0&&n<=10000000;
 function responseUsage(u){
  const i=u?.input_token_details,o=u?.output_token_details,c=i?.cached_tokens_details;
  if(!i||!o||!count(u.input_tokens)||!count(u.output_tokens))return null;
  const v={inputAudio:i.audio_tokens,inputText:i.text_tokens,cachedAudio:c?.audio_tokens??(i.cached_tokens===0?0:undefined),cachedText:c?.text_tokens??(i.cached_tokens===0?0:undefined),outputAudio:o.audio_tokens,outputText:o.text_tokens};
  if(!keys.every(k=>count(v[k]))||v.cachedAudio>v.inputAudio||v.cachedText>v.inputText||v.inputAudio+v.inputText!==u.input_tokens||v.outputAudio+v.outputText!==u.output_tokens||v.cachedAudio+v.cachedText!==i.cached_tokens)return null;
  return v;
 }
 function create(){
  const seen=new Set(),totals=Object.fromEntries(keys.map(k=>[k,0]));let responses=0,missing=0;
  return {add(r){if(!r||typeof r.id!=='string'||!r.id||r.id.length>200){missing++;return}if(seen.has(r.id))return;if(seen.size>=256){missing++;return}seen.add(r.id);const u=responseUsage(r.usage);if(!u){missing++;return}responses++;for(const k of keys)totals[k]+=u[k]},sample(){return {...totals,responses,missing}}};
 }
 const api={create,responseUsage,keys};if(typeof module==='object'&&module.exports)module.exports=api;else root.VisaAtlasVoiceCost=api;
})(typeof window==='undefined'?globalThis:window);
