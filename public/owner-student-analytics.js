/* VisaAtlas Owner-only Student Analytics view. All counts come from a protected API. */
(function(){
 'use strict';
 let snapshot=null,page=1,loading=false,refreshSerial=0;
 const $=id=>document.getElementById(id);
 const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=v=>Number(v||0).toLocaleString('en-US');
 const date=s=>{
   if(!s)return 'No recorded activity';
   const d=new Date(s);
   return Number.isNaN(d.valueOf())?'Unknown date':d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
 };
 const money=v=>'$'+Number(v||0).toFixed(2);
 const stateInfo=s=>{
   if(s.activityStatus==='recent')return ['Recent activity','recent'];
   if(s.activityStatus==='follow-up')return ['Follow-up suggested','followup'];
   if(s.activityStatus==='earlier')return ['Earlier activity','quiet'];
   return ['No practice recorded','quiet'];
 };
 const card=(label,value,note)=>'<div class="owner-analytics-kpi"><span>'+safe(label)+'</span><strong>'+safe(value)+'</strong><small>'+safe(note)+'</small></div>';
 const metric=(label,value)=>'<div class="owner-analytics-metric"><span>'+safe(label)+'</span><strong>'+safe(value)+'</strong></div>';
 function render(){
   if(!snapshot)return;
   const sum=snapshot.summary||{};
   const summary=$('ownerStudentAnalyticsSummary');
   if(summary)summary.innerHTML=[
      card('Profiles',num(sum.profiles),'Students in this workspace'),
      card('Recent activity',num(sum.active7d),'Saved learning or mock activity · 7 days'),
      card('Follow-up suggested',num(sum.followUp14d),'No recent recorded practice · 14+ days'),
      card('Improving',num(sum.improving),'Comparable completed mock scores')
   ].join('');
   const term=($('ownerStudentAnalyticsSearch')?.value||'').trim().toLowerCase();
   const filter=$('ownerStudentAnalyticsFilter')?.value||'all';
   const order=$('ownerStudentAnalyticsSort')?.value||'recent';
   let rows=(snapshot.students||[]).filter(s=>{
      if(term && ![s.name,s.email].some(t=>String(t||'').toLowerCase().includes(term)))return false;
      if(filter==='active'&&!s.recentRecordedActivity)return false;
      if(filter==='follow-up'&&!s.needsFollowUp)return false;
      if(filter==='improving'&&!s.improving)return false;
      if(filter==='no-score'&&s.latestFullScore!==null)return false;
      if(filter==='unpriced'&&!(s.cost?.voiceAttempts>0 && s.cost?.unpricedVoiceAttempts>0))return false;
      return true;
   }).slice();
   const recent=iso=>iso&&Number.isFinite(Date.parse(iso))?Date.parse(iso):0;
   if(order==='name')rows.sort((a,b)=>String(a.name).localeCompare(String(b.name)));
   if(order==='activity')rows.sort((a,b)=>recent(a.lastRecordedActivity)-recent(b.lastRecordedActivity));
   if(order==='score')rows.sort((a,b)=>(b.scoreChange??-9999)-(a.scoreChange??-9999));
   if(order==='recent')rows.sort((a,b)=>recent(b.lastRecordedActivity)-recent(a.lastRecordedActivity));
   const total=rows.length,perPage=10,maxPage=Math.max(1,Math.ceil(total/perPage));
   page=Math.max(1,Math.min(page,maxPage));
   const view=rows.slice((page-1)*perPage,page*perPage);
   const output=$('ownerStudentAnalyticsList');
   if(output)output.innerHTML=view.length?view.map(s=>{
      const status=stateInfo(s);
      const score=s.latestFullScore===null?'Not yet comparable':Math.round(s.latestFullScore)+' / 100';
      const trend=s.scoreChange===null?'Not enough comparable scores':(s.scoreChange>0?'+':'')+s.scoreChange+' points';
      const cost=snapshot.costTrackingAvailable===false?'Temporarily unavailable':s.cost?.pricedVoiceSamples?money(s.cost.partialVoiceUsd)+' partial estimate':'No priced voice samples';
      const covered=s.cost?.voiceAttempts?num(s.cost.pricedVoiceSamples)+' of '+num(s.cost.voiceAttempts)+' voice starts priced':'No linked voice starts';
      const tokenCount=num((s.cost?.inputTokens||0)+(s.cost?.outputTokens||0));
      return '<article class="owner-analytics-student">'+
       '<div class="owner-analytics-person"><div><h3>'+safe(s.name)+'</h3><p>'+safe(s.email)+'</p></div><span class="owner-analytics-state '+status[1]+'">'+safe(status[0])+'</span></div>'+
       '<div class="owner-analytics-metrics">'+
         metric('Last recorded practice',date(s.lastRecordedActivity))+
         metric('Learning modules completed',num(s.completedModules)+' / 6')+
         metric('Mock sessions started',num(s.mockStarts))+
         metric('Readiness reports',num(s.reports))+
         metric('Latest complete mock score',score)+
         metric('Comparable score change',trend)+
         metric('Partial voice cost · last 30 days',cost)+
         metric('Cost sampling coverage',covered)+
       '</div>'+
       '<details class="owner-analytics-extra"><summary>More details and interpretation</summary>'+
        '<p><strong>Practice records:</strong> '+num(s.studentLedMocks)+' student-led mock starts; '+num(s.staffLedMocks)+' staff-assisted mock starts; '+num(s.savedModules)+' saved learning modules. Recorded learning changes may also have been made by staff.</p>'+
        '<p><strong>Report comparisons:</strong> '+num(s.completeReports)+' complete comparable-method reports. '+(s.scoreChange===null?'At least two complete reports using the same scoring method are needed for a reliable change.':'Change compares the last two complete reports with the same scoring method.')+'</p>'+
        '<p><strong>Unpriced usage:</strong> '+num(s.cost?.unpricedVoiceAttempts)+' voice starts not fully priced, '+num(s.cost?.textAttempts)+' text/model attempts, '+tokenCount+' observed text tokens. Text, transcription, hosting, payments and unmatched historical tutor samples are not included in the voice estimate.</p>'+
        '<p>This is practice progress, not a prediction of visa approval or a judgement about the student.</p>'+
       '</details>'+
       '</article>';
   }).join(''):'<p class="owner-analytics-empty">No students match these filters. Try clearing the search or choosing another view.</p>';
   const range=$('ownerStudentAnalyticsRange');
   if(range)range.textContent=total?(1+(page-1)*perPage)+'–'+Math.min(page*perPage,total)+' of '+total+' students':'0 students';
   const back=$('ownerStudentAnalyticsPrev'),next=$('ownerStudentAnalyticsNext');
   if(back)back.disabled=page<=1;
   if(next)next.disabled=page>=maxPage;
   const note=$('ownerStudentAnalyticsNotes');
   if(note)note.textContent=[snapshot.notes?.activity,snapshot.notes?.improvement,snapshot.notes?.costs].filter(Boolean).join(' ');
 }
 window.ownerStudentAnalyticsFilterChanged=function(){page=1;render();};
 window.ownerStudentAnalyticsPage=function(delta){page+=delta;render();$('ownerStudentAnalytics')?.scrollIntoView?.({behavior:'smooth',block:'start'});};
 window.loadOwnerStudentAnalytics=async function(){
   // Defense in depth: server also enforces the Owner role.
   if(typeof me==='undefined'||me?.role!=='owner'||loading)return;
   loading=true;
   const serial=++refreshSerial,output=$('ownerStudentAnalyticsStatus');
   if(output)output.textContent='Refreshing student analytics…';
   try{
     const result=await api('/api/owner/student-analytics');
     if(serial!==refreshSerial||me?.role!=='owner')return;
     snapshot=result;render();
     if(output)output.textContent='Updated '+date(result.asOf)+' · Includes saved data, not real-time student presence.';
   }catch{
     if(output)output.textContent='Student analytics could not be loaded. You can refresh this section without affecting other Owner tools.';
   }finally{loading=false;}
 };
 window.openOwnerStudentAnalytics=function(){
   if(typeof me==='undefined'||me?.role!=='owner')return;
   $('ownerStudentAnalytics')?.scrollIntoView?.({behavior:'smooth',block:'start'});
   if(!snapshot)void window.loadOwnerStudentAnalytics();
 };
 window.clearOwnerStudentAnalytics=function(){
   refreshSerial++;snapshot=null;page=1;loading=false;
   for(const id of ['ownerStudentAnalyticsSummary','ownerStudentAnalyticsList'])$(id)?.replaceChildren?.();
   if($('ownerStudentAnalyticsStatus'))$('ownerStudentAnalyticsStatus').textContent='';
   if($('ownerStudentAnalyticsSearch'))$('ownerStudentAnalyticsSearch').value='';
   if($('ownerStudentAnalyticsFilter'))$('ownerStudentAnalyticsFilter').value='all';
   if($('ownerStudentAnalyticsSort'))$('ownerStudentAnalyticsSort').value='recent';
   if($('ownerStudentAnalyticsRange'))$('ownerStudentAnalyticsRange').textContent='';
 };
})();
