/* A mobile-first view of existing Owner operations & cost diagnostics.
   No new API requests, permissions, stored state, or billing claims. */
(function () {
  'use strict';
  const labels = Object.freeze({
    account_deletion:'Account deletion', data_export:'Data export',
    email_verification:'Email verification', guardian_email:'Guardian email',
    guardian_permission:'Guardian permission', registration:'Registration',
    verification_send:'Verification email sent', voice_start:'Voice session started',
    password_recovery:'Password recovery', practice_feedback:'Practice feedback',
    report_generation:'Report generation', review:'Report review',
    learn:'Learning tutor', mock:'Mock interview', practice:'Practice feedback',
    report:'Report generation'
  });
  let snapshot = null;
  const $ = id => document.getElementById(id);
  const escape = x => String(x??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
  const count = value => {
    const n=Number(value);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };
  const fmt = n => count(n).toLocaleString('en-US');
  const money = n => '$'+count(n).toFixed(2);
  const readable = type => labels[type] || String(type||'Other activity').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  const dateLabel = date => {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return date;
    const parsed=new Date(date+'T00:00:00Z');
    return isNaN(parsed.getTime())?date:parsed.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
  };
  const dateOf = row => String(row.day||'').slice(0,10);
  function renderOperations(){
    const target=$('ownerOperationMobileCards');
    if(!target || !snapshot)return;
    const selected=$('ownerOperationMobileFilter')?.value || 'all';
    const rows=(Array.isArray(snapshot.days)?snapshot.days:[]).filter(r=>{
      if(selected==='rejected')return count(r.rejected)>0;
      if(selected==='failures')return count(r.failures)>0;
      if(selected==='successful')return count(r.successes)>0;
      return true;
    });
    const grouped = new Map();
    for(const row of rows){
      const day=dateOf(row)||'Unknown date';
      if(!grouped.has(day))grouped.set(day,[]);
      grouped.get(day).push(row);
    }
    const blocks=[...grouped].sort((a,b)=>b[0].localeCompare(a[0])).map(([day,entries],i)=>{
      const requests=entries.reduce((n,r)=>n+count(r.requests),0);
      const rejected=entries.reduce((n,r)=>n+count(r.rejected),0);
      const failures=entries.reduce((n,r)=>n+count(r.failures),0);
      const summary='<span class="owner-mobile-daydate">'+escape(dateLabel(day))+'</span><span class="owner-mobile-daytotals">'+fmt(requests)+' requests'+(rejected?' · '+fmt(rejected)+' rejected':'')+(failures?' · '+fmt(failures)+' errors':'')+'</span>';
      const items=entries.slice().sort((a,b)=>count(b.failures)-count(a.failures)||count(b.rejected)-count(a.rejected)||String(a.operation).localeCompare(String(b.operation))).map(r=>{
        const code=String(r.operation||'');
        return '<article class="owner-mobile-operation">'+
          '<div class="owner-mobile-operation-head"><strong>'+escape(readable(code))+'</strong><small>'+escape(code)+'</small></div>'+
          '<div class="owner-mobile-metrics">'+
            '<div><span>Requests</span><strong>'+fmt(r.requests)+'</strong></div>'+
            '<div><span>Successful</span><strong>'+fmt(r.successes)+'</strong></div>'+
            '<div class="'+(count(r.rejected)?'owner-metric-notice':'')+'"><span>Rejected</span><strong>'+fmt(r.rejected)+'</strong></div>'+
            '<div class="'+(count(r.failures)?'owner-metric-error':'')+'"><span>Service errors</span><strong>'+fmt(r.failures)+'</strong></div>'+
          '</div></article>';
      }).join('');
      return '<details class="owner-mobile-day"'+(i===0?' open':'')+'><summary>'+summary+'</summary>'+items+'</details>';
    }).join('');
    target.innerHTML=blocks || '<div class="owner-mobile-empty">No operations match this filter for the last seven UTC dates.</div>';
  }
  function renderCosts(){
    const target=$('ownerCostsMobile');
    if(!target || !snapshot)return;
    const costs=Array.isArray(snapshot.costs)?snapshot.costs:[];
    if(!costs.length){
      target.innerHTML='<p class="owner-mobile-empty">No cost samples recorded yet. Missing samples do not indicate free usage.</p>';
      return;
    }
    target.innerHTML=costs.map(row=>{
      const code=String(row.category||'');
      const isPriced=row.estimated_usd!=null;
      const isVoice=code==='learn'||code==='mock';
      const minutes=row.elapsed_seconds==null?'Not recorded':(count(row.elapsed_seconds)/60).toFixed(1)+' min';
      const tokens=row.source==='provider_response'
        ?'<div class="owner-mobile-tokenrow"><strong>Provider-reported tokens</strong><span>Input '+fmt(row.input_tokens)+' · Cached '+fmt(row.cached_tokens)+' · Output '+fmt(row.output_tokens)+'</span></div>'
        :'';
      return '<article class="owner-mobile-costcard">'+
        '<div class="owner-mobile-costhead"><strong>'+escape(readable(code))+'</strong><span class="owner-mobile-costbadge">'+(isPriced?'Partial voice estimate':'Not priced')+'</span></div>'+
        '<div class="owner-mobile-costbig">'+(isPriced?money(row.estimated_usd):'—')+'</div>'+
        '<div class="owner-mobile-metrics">'+
          '<div><span>Attempts</span><strong>'+fmt(row.attempts)+'</strong></div>'+
          '<div><span>Usage samples</span><strong>'+fmt(row.samples)+'</strong></div>'+
          '<div><span>Priced voice samples</span><strong>'+fmt(row.priced_samples)+'</strong></div>'+
          '<div><span>Observed connection time</span><strong>'+escape(minutes)+'</strong></div>'+
        '</div>'+tokens+
        '<p class="owner-mobile-costnote">'+(isPriced?'An estimate based on recorded voice samples, not the final charge.':isVoice?'Voice usage has not been priced for these attempts.':'Provider tokens may be recorded, but dollar cost has not been configured.')+'</p>'+
      '</article>';
    }).join('');
  }
  window.renderOwnerMobileDiagnostics = function(data){
    snapshot = data || null;
    renderOperations();
    renderCosts();
  };
  window.setOwnerOperationMobileFilter = function(){
    renderOperations();
  };
  window.clearOwnerMobileDiagnostics = function(){
    snapshot = null;
    if($('ownerOperationMobileCards'))$('ownerOperationMobileCards').replaceChildren();
    if($('ownerCostsMobile'))$('ownerCostsMobile').replaceChildren();
    if($('ownerOperationMobileFilter'))$('ownerOperationMobileFilter').value='all';
  };
})();
