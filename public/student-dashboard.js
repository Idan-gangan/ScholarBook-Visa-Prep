/* Student dashboard decisions are derived from saved evidence, not browser-only checkboxes. */
(function(root){
 'use strict';
 const finite=value=>typeof value==='number'&&Number.isFinite(value);
 const dateKey=(value=new Date())=>{
   const d=value instanceof Date?value:new Date(value);
   if(!Number.isFinite(d.getTime()))return '';
   return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
 };
 const reportDate=report=>dateKey(report?.createdAt);
 function coverage(report){
   const assessed=report?.coverage?.assessed,required=report?.coverage?.required;
   const known=Number.isInteger(assessed)&&Number.isInteger(required)&&required>0&&assessed>=0&&assessed<=required;
   const full=known&&assessed===required&&!report?.incomplete&&!['partial','insufficient'].includes(report?.scoreType);
   const partial=known&&assessed>0&&!full;
   return {known,full,partial,assessed:known?assessed:null,required:known?required:null,
     label:known?(assessed===0?'Not assessed':full?'Full coverage':'Partial coverage'):'Coverage unavailable'};
 }
 function scoreMeta(report){
   if(!report)return {value:null,label:'No attempts yet',detail:'Start a mock to receive feedback',coverage:coverage(null)};
   const c=coverage(report),raw=c.full?report.overall:c.partial?(finite(report.practiceScore)?report.practiceScore:finite(report.partialScore)?report.partialScore:null):null;
   const value=finite(raw)?Math.round(raw):null;
   return {value,label:value===null?'Not scored':value+'/100',
     detail:c.full?'All required areas assessed':c.partial?'Assessed areas only':c.assessed===0?'No areas assessed':'Coverage not recorded',
     coverage:c};
 }
 function comparable(a,b){
   if(!a||!b)return false;
   const x=scoreMeta(a),y=scoreMeta(b);
   return x.value!==null&&y.value!==null&&x.coverage.known&&y.coverage.known&&
     x.coverage.assessed===y.coverage.assessed&&x.coverage.required===y.coverage.required&&
     x.coverage.full===y.coverage.full&&
     (a.difficulty||'standard')===(b.difficulty||'standard')&&
     typeof a.scoringMethod==='string'&&a.scoringMethod.length>0&&a.scoringMethod===b.scoringMethod&&
     typeof a.difficulty==='string'&&a.difficulty.length>0&&a.difficulty===b.difficulty&&
     a.scoreType===b.scoreType;
 }
 function comparison(history){
   const latest=history?.[0];if(!latest)return null;
   const prior=history.slice(1).find(old=>comparable(latest,old));
   if(!prior)return null;
   return {delta:scoreMeta(latest).value-scoreMeta(prior).value,previous:scoreMeta(prior).value,previousId:prior.id};
 }
 function dailyTasks({profileComplete=false,profileMissing=[],courseLoaded=false,modulesDone=0,modulesTotal=6,history=[],daysUntil=null,learningCompletedToday=false,now=new Date()}={}){
   const today=dateKey(now),latest=history[0],tasks=[];
   const push=(task)=>{if(!tasks.some(existing=>existing.id===task.id))tasks.push(task);};
   if(!profileComplete){
     const pending=Array.isArray(profileMissing)?profileMissing.filter(v=>typeof v==='string'&&v.trim()):[];
     const missingNote=pending.length?'Still needed: '+pending.slice(0,2).join(' · ')+(pending.length>2?' · +'+(pending.length-2)+' more':'')+'.':'Add your school, funding and study plans so practice can be tailored to your situation.';
     push({id:'profile',title:'Complete your study profile',description:missingNote,action:'profile',actionLabel:'Complete profile',done:false});
   }
   const mockToday=history.some(r=>reportDate(r)===today);
   const mock={id:'mock',title:'Practise a mock interview',description:daysUntil!==null&&daysUntil<=7&&daysUntil>=0?'Your interview is approaching. Practise clear, accurate answers across the required areas.':'Use a mock to check which topics need more practice.',action:'interview',actionLabel:'Start a mock',doneLabel:'Mock report saved today',done:mockToday};
   const focus=latest?.practiceTargets?.find((target)=>target&&typeof target.focus==='string'&&target.focus.trim()&&target.lessonId);
   // A saved report retry is useful even while the student finishes their profile.
   if(focus){
     const index=latest.practiceTargets.indexOf(focus);
     const attempted=latest.practiceAttempts?.some(a=>a.focus===index&&dateKey(a.createdAt)===today);
     push({id:'focus',title:focus.title||'Strengthen a weak area',description:focus.focus,action:'focus',actionLabel:'Practise this answer',doneLabel:'Answer retry saved today',reportId:latest.id,focusIndex:index,done:!!attempted});
   }
   if(daysUntil!==null&&daysUntil>=0&&daysUntil<=7&&profileComplete)push(mock);
   if(courseLoaded&&modulesDone<modulesTotal)push({id:'learning',title:'Continue your next learning module',description:modulesDone+' of '+modulesTotal+' modules completed. Learn the topic and practise in your own words.',action:'learning',actionLabel:'Continue lesson',doneLabel:'Lesson completed today',done:!!learningCompletedToday});
   else if(!courseLoaded)push({id:'learning',title:'Open your learning path',description:'Load your saved modules and pick up where you left off.',action:'learning',actionLabel:'Open learning',done:false});
   if(profileComplete&&!(daysUntil!==null&&daysUntil>=0&&daysUntil<=7))push(mock);
   // Opening a report is not stored as completed work. Never count this informational
   // suggestion in the denominator when there is no measurable retry target.
   if(latest&&!focus)push({id:'reports',title:'Review your latest feedback',description:'Read your corrections and choose one answer to improve. This review is suggested, not counted as completed practice.',action:'reports',actionLabel:'Review feedback',done:false,trackable:false});
   return tasks.slice(0,3);
 }
 const api={coverage,scoreMeta,comparable,comparison,dailyTasks,dateKey};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VisaAtlasStudentDashboard=api;
})(typeof window==='undefined'?globalThis:window);
