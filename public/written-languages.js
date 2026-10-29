/* Stored translations: no model calls, no translation of user-authored notes. */
(function(root){
 'use strict';
 const codes=['fr','es','pt','ar','sw'];
 const catalogs=typeof module==='object'&&module.exports?Object.fromEntries(codes.map(c=>[c,require('./locales/'+c+'.json')])):root.VisaAtlasWrittenCatalogs;
 const base=typeof module==='object'&&module.exports?require('./curriculum'):root.VisaAtlasCurriculum;
 const englishFormats={progress:'{0} of {1} modules completed',module:'Module {0} of {1}',coverage:'{0} of {1} areas assessed',score:'{0} points earned out of {1} across all seven areas, converted to a score out of 100.',quality:'Answered-topic quality: {0}/100. This average covers assessed areas only.',date:'Practice date: {0}',mock:'Mock #{0}',adjusted:'Adjusted score: {0}/100',reviewer:'Reviewer: {0}'};
 function language(code){return codes.includes(code)?code:'en'}
 function format(code,key,...values){const template=catalogs?.[language(code)]?.formats[key]||englishFormats[key]||key;return template.replace(/\{(\d+)\}/g,(_,i)=>String(values[i]??''))}
 function text(code,value){
  const source=String(value??''),c=catalogs?.[language(code)];if(!c)return source;
  const s=source.trim();if(Object.hasOwn(c.strings,s))return source.replace(s,c.strings[s]);
  let m;
  if((m=s.match(/^Saved written practice \((\d+)\)$/)))return text(code,'Saved written practice')+' ('+m[1]+')';
  if((m=s.match(/^(\d+) of (\d+) modules completed$/)))return format(code,'progress',m[1],m[2]);
  if((m=s.match(/^Module (\d+) of (\d+)$/)))return format(code,'module',m[1],m[2]);
  if((m=s.match(/^(?:MODULE|Module) (\d+)$/)))return text(code,'Module')+' '+m[1];
  if((m=s.match(/^(?:Coverage: )?(\d+) (?:of|\/) (\d+) (?:relevant )?areas assessed\.?$/)))return format(code,'coverage',m[1],m[2]);
  if((m=s.match(/^(\d+) points earned out of (\d+) across all seven areas, converted to a score out of 100\. (.*)$/)))return format(code,'score',m[1],m[2])+' '+text(code,m[3]);
  if((m=s.match(/^(\d+) \/ (\d+) points across all seven areas(?:, converted to a score out of 100\.| × 100\. Not assessed means no points earned yet; it does not mean a wrong answer\.|\. Unassessed areas earn no points yet; this does not mean a wrong answer\.)$/)))return format(code,'score',m[1],m[2])+' '+text(code,'Not assessed means no points earned yet; it does not mean a wrong answer.');
  if((m=s.match(/^Answered-topic quality: ([\d.]+)\/100\. This average covers assessed areas only\.$/)))return format(code,'quality',m[1]);
  if((m=s.match(/^Interview incomplete · (\d+) of 7 areas assessed$/)))return text(code,'Interview incomplete')+' · '+format(code,'coverage',m[1],7);
  if((m=s.match(/^Practice date: (.*)$/)))return format(code,'date',m[1]);
  if((m=s.match(/^Mock #(.*?) \| (.*)$/)))return format(code,'mock',text(code,m[1]))+' | '+text(code,m[2]);
  if((m=s.match(/^Mock #(.*)$/)))return format(code,'mock',m[1]);
  if((m=s.match(/^(?:Coach-adjusted score|Adjusted score): ([\d.]+)\/100$/)))return format(code,'adjusted',m[1]);
  if((m=s.match(/^Reviewer: (.*)$/)))return format(code,'reviewer',m[1]);
  if(s==='Overall preparation - incomplete interview'||s==='Overall preparation — incomplete interview')return text(code,'Overall preparation')+' — '+text(code,'Interview incomplete');
  if(s==='Not assessed - no points earned yet')return text(code,'Not assessed — no points earned yet');
  if(s==='VisaAtlas | Private practice feedback')return 'VisaAtlas | '+text(code,'Private practice feedback');
  // Report lesson links retain stable IDs; only their visible titles change.
  const lesson=base.findIndex(l=>l.title===s);if(lesson>=0)return c.lessons[lesson].title;
  for(const sep of [' · ',' — ',':']){if(s.includes(sep)){const parts=s.split(sep);if(parts.some(p=>Object.hasOwn(c.strings,p)))return parts.map(p=>text(code,p)).join(sep)}}
  return source;
 }
 function lessons(code){const c=catalogs?.[language(code)];return c?base.map((l,i)=>({...l,...c.lessons[i],id:l.id})):base}
 function forStudent(code,student,id){
  const c=catalogs?.[language(code)];if(!c)return base.forStudent(student,id);
  const original=base.forStudent(student,id),lesson=lessons(code).find(l=>l.id===id);
  const points=[...lesson.points];if(c.levels[original.level])points.unshift(c.levels[original.level]);
  if(id==='circumstances'){
   if(!original.refusal)points.splice(points.indexOf(lesson.points[0]),1);
   if(!original.athletic)points.splice(points.indexOf(lesson.points[2]),1);
  }
  let questions=[...lesson.questions];if(id==='circumstances'&&!original.athletic)questions.pop();
  return {...original,intro:lesson.intro,structure:lesson.structure,points,questions,example:lesson.example,exampleNotice:text(code,'This is an example template, not a statement about you. Replace brackets with confirmed facts; do not memorize it.')};
 }
 // Only call on application-owned copy; transcripts and editable fields are excluded.
 const originals=new WeakMap();
 function translateDOM(element,code){
  if(!element||typeof document==='undefined'||!document.createTreeWalker)return;
  const walker=document.createTreeWalker(element,4);let node;
  while((node=walker.nextNode())){
   if(node.parentElement?.closest('textarea,input,select,script,style,[data-no-translate],#learn_transcript,#transcript'))continue;
   let record=originals.get(node);if(!record||node.nodeValue!==record.last)record={source:node.nodeValue};
   record.last=text(code,record.source);node.nodeValue=record.last;originals.set(node,record);
  }
  element.lang=language(code);element.dir=language(code)==='ar'?'rtl':'ltr';
 }
 const api={codes,language,text,format,lessons,forStudent,translateDOM};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.VisaAtlasWritten=api;
})(typeof window==='undefined'?globalThis:window);
