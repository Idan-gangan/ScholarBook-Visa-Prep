/* Owner commercial scorecard: verified Paystack records only. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format((Number(v)||0)/100);
const number=v=>new Intl.NumberFormat('en-US').format(Number(v)||0);
const card=(label,value,note)=>'<div class="owner-commercial-cell"><span>'+safe(label)+'</span><strong>'+safe(value)+'</strong><small>'+safe(note)+'</small></div>';
let serial=0;
function paint(data){
 const summary=$('ownerCommercialSummary'),status=$('ownerCommercialStatus'),detail=$('ownerCommercialDetail');
 if(!summary||!status||!detail)return;
 if(data.mode!=='live'){
   summary.replaceChildren();status.textContent='Live payments overview is unavailable in this billing mode.';
   detail.textContent='Test billing is not real sales or bank revenue.';return;
 }
 summary.innerHTML=[
   card('Student accounts',number(data.studentAccounts),'Registered students, not unique people'),
   card('New student profiles · 7 days',number(data.newStudentProfiles7d),'New profile records, not unique visitors'),
   card('Free trial accounts',number(data.trialAccounts),'One mock interview per eligible account'),
   card('Free mocks used',number(data.trialMockSessionsUsed),'Trial mock starts consumed'),
   card('Active paid accounts',number(data.activePaidAccounts),'Verified payments with unexpired access'),
   card('Verified payments',number(data.verifiedPayments),'Successful, non-held Paystack records'),
   card('Verified USD · last 30 days',money(data.verifiedUsd30dCents),'Gross charged amounts; not payouts'),
   card('Verified USD · all time',money(data.verifiedUsdCents),'Gross amounts; not recognized revenue'),
   card('Trial-to-paid overlap',data.trialOverlapRate===null?'Not available':Number(data.trialOverlapRate).toFixed(1)+'%',number(data.trialAccountsWithPayment)+' trial accounts also have a verified payment')
 ].join('');
 const concerns=[];
 if(Number(data.openCheckouts)>0)concerns.push(number(data.openCheckouts)+' unresolved checkout(s)');
 if(Number(data.onHoldPayments)>0)concerns.push(number(data.onHoldPayments)+' payment(s) on hold');
 detail.textContent=concerns.length?'Payment attention: '+concerns.join('; ')+'. Review the payments ledger.':'No unresolved payment holds or checkouts recorded.';
 const timestamp=Date.parse(data.asOf);
 status.textContent='Updated '+(Number.isFinite(timestamp)?new Date(timestamp).toLocaleString():'recently')+
   '. Gross verified checkouts are not payouts. Costs, provider bills, refunds, taxes, and payment fees are not reconciled; profit and margin are not calculated.';
}
window.loadOwnerCommercial=async function(){
 if(typeof me==='undefined'||me?.role!=='owner')return;
 const local=++serial,status=$('ownerCommercialStatus');
 if(status)status.textContent='Loading verified payment records…';
 try{const result=await api('/api/owner/commercial');
   if(local===serial&&me?.role==='owner')paint(result);
 }catch(error){if(local===serial&&status)status.textContent='Commercial overview could not load. '+(error?.message||'Please refresh.');}
};
window.clearOwnerCommercial=function(){
 serial++;
 $('ownerCommercialSummary')?.replaceChildren?.();
 if($('ownerCommercialStatus'))$('ownerCommercialStatus').textContent='Refresh to view verified Paystack records.';
 if($('ownerCommercialDetail'))$('ownerCommercialDetail').textContent='';
};
})();