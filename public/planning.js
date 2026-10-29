(function(root){
 const validDate=value=>typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
 function daysUntil(value,now=new Date()){
  if(!validDate(value))return null;
  const today=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
  return Math.round((Date.parse(value+'T00:00:00Z')-today)/86400000);
 }
 function practicePlan(reports){
  const latest=reports.slice().sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0];
  if(!latest)return {task:null,topics:[]};
  const topics=(latest.practiceTargets||[]).map((target,focus)=>{
   const evidence=latest.evidence?.find(e=>e.feedback===target.focus);
   const attempts=(latest.practiceAttempts||[]).filter(a=>a.focus===focus);
   const last=method=>attempts.filter(a=>(a.method==='spoken-transcript-retry-v1')===method).slice(-1)[0];
   return {reportId:latest.id,...target,index:focus,evidence,written:last(false),spoken:last(true)};
  });
  return {topics,task:topics.find(t=>t.lessonId)||null};
 }
 const api={validDate,daysUntil,practicePlan};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VisaAtlasPlanning=api;
})(typeof window==='undefined'?globalThis:window);
