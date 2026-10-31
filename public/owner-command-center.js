/* Owner Command Center: display-only metrics from existing owner-authorized endpoints. */
(function(){
  'use strict';
  const money=n=>'$'+n.toFixed(2);
  const number=n=>Number(n||0).toLocaleString();
  const safe=s=>typeof escapeHtml==='function'?escapeHtml(String(s)):String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function card(label,value,sub){
    return '<div class="owner-insight-stat"><span>'+safe(label)+'</span><strong>'+safe(value)+'</strong><small>'+safe(sub)+'</small></div>';
  }
  window.renderOwnerAttention=function(data){
    const target=document.getElementById('ownerAttention');
    if(!target || !data)return;
    const students=Array.isArray(data.students)?data.students:[];
    const users=Array.isArray(data.users)?data.users:[];
    const unassigned=students.filter(s=>!(s.staffIds||[]).length).length;
    const suspended=users.filter(u=>u.accessSuspended===true).length;
    const urgent=suspended
      ?'<div class="owner-attention-item owner-attention-urgent"><span class="owner-attention-dot"></span><div><strong>'+number(suspended)+' paused account'+(suspended===1?'':'s')+'</strong><small>Check access status and any confirmed support requests.</small></div><button type="button" class="btn secondary" onclick="setOwnerTab(\'accounts\')">Review accounts</button></div>'
      :'<div class="owner-attention-item"><span class="owner-attention-ok" aria-hidden="true">✓</span><div><strong>No urgent account alerts</strong><small>No account access is currently marked as paused.</small></div></div>';
    const coverage='<div class="owner-coverage"><div><span class="owner-eyebrow">OPTIONAL TEAM COVERAGE</span><strong>'+number(unassigned)+' student'+(unassigned===1?'':'s')+' without assigned staff</strong><small>These students are not necessarily in trouble. As Owner, you can still manage every student. Assign staff only when you want to delegate support.</small></div><button type="button" class="btn secondary" onclick="setOwnerTab(\'assignments\')">Manage assignments</button></div>';
    target.innerHTML='<div class="owner-insight-title"><div><span class="owner-eyebrow">ACCOUNT HEALTH</span><h2>Needs your attention</h2></div><span class="owner-count">'+number(suspended)+' urgent alert'+(suspended===1?'':'s')+'</span></div>'+urgent+coverage;
  };
  window.renderOwnerInsights=function(data){
    const target=document.getElementById('ownerInsights');
    if(!target || !data)return;
    const costs=Array.isArray(data.costs)?data.costs:[];
    const days=Array.isArray(data.days)?data.days:[];
    const voice=costs.filter(r=>r.estimated_usd!=null);
    const priced=voice.reduce((sum,r)=>sum+(Number(r.estimated_usd)||0),0);
    const voiceMinutes=voice.reduce((sum,r)=>sum+(Number(r.elapsed_seconds)||0),0)/60;
    const pricedSamples=voice.reduce((sum,r)=>sum+(Number(r.priced_samples)||0),0);
    const totalSamples=costs.reduce((sum,r)=>sum+(Number(r.samples)||0),0);
    const totalAttempts=costs.reduce((sum,r)=>sum+(Number(r.attempts)||0),0);
    const recent=days.reduce((a,r)=>{a.requests+=Number(r.requests)||0;a.success+=Number(r.successes)||0;a.rejected+=Number(r.rejected)||0;a.failures+=Number(r.failures)||0;return a;},{requests:0,success:0,rejected:0,failures:0});
    const grouped={};
    days.forEach(row=>{const key=String(row.day||'').slice(0,10);if(!key)return;grouped[key]=(grouped[key]||0)+(Number(row.requests)||0)});
    const chart=Object.keys(grouped).sort().slice(-7).map(k=>({date:k,value:grouped[k]}));
    const maximum=Math.max(1,...chart.map(x=>x.value));
    const bars=chart.length?chart.map(x=>'<div class="owner-chart-col" title="'+safe(x.date+': '+number(x.value)+' requests')+'"><span class="owner-chart-value">'+number(x.value)+'</span><div class="owner-chart-track"><div class="owner-chart-bar" style="height:'+Math.max(3,Math.round(x.value/maximum*100))+'%"></div></div><small>'+safe(x.date.slice(5))+'</small></div>').join(''):'<p class="muted">Activity data has not been recorded yet.</p>';
    const missing=costs.filter(r=>Number(r.attempts)>Number(r.priced_samples) || r.estimated_usd==null);
    const caveat=missing.length?'Incomplete pricing: '+missing.length+' usage categor'+(missing.length===1?'y':'ies')+' still have unpriced or missing samples.':'Voice pricing is sampled, not a complete invoice.';
    target.innerHTML='<div class="owner-insights-main">'+
      '<div class="owner-insight-title"><div><span class="owner-eyebrow">PERFORMANCE SNAPSHOT</span><h2>Platform pulse</h2><p>Seven-day service activity and sampled AI spending from the last 30 days.</p></div><span class="owner-status-pill '+(data.aiEnabled?'':'paused')+'">'+(data.aiEnabled?'● AI enabled':'● AI paused')+'</span></div>'+
      '<div class="owner-insight-stats">'+
       card('Service requests · 7 days',number(recent.requests),'All tracked operation types')+
       card('Successful requests',number(recent.success),'Rejected: '+number(recent.rejected))+
       card('Service failures',number(recent.failures),'Investigate if this rises')+
       card('Partial voice estimate',money(priced),'Not your final bill')+
      '</div>'+
      '<div class="owner-chart"><div class="owner-chart-head"><strong>Request activity</strong><small>By UTC date · 7-day log</small></div><div class="owner-chart-grid" role="img" aria-label="Service requests grouped by day">'+bars+'</div></div>'+
      '<div class="owner-insight-footer"><span>'+number(voiceMinutes.toFixed(1))+' observed voice minutes · '+number(pricedSamples)+' priced voice samples</span><span>'+number(totalSamples)+' usage samples across '+number(totalAttempts)+' attempts</span></div>'+
      '<p class="owner-cost-warning"><strong>Cost visibility:</strong> '+safe(caveat)+' These estimates exclude some text, transcription, hosting, payment and provider charges. Verify against your invoices before setting prices.</p>'+
     '</div>';
  };
})();