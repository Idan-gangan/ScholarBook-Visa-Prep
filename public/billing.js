'use strict';
const message=document.querySelector('#message'), plans=document.querySelector('#plans');
async function api(path,options){const r=await fetch(path,options);const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error||'Billing is unavailable.'),{status:r.status});return data;}
async function refresh(verify=false){
  plans.replaceChildren();
  document.querySelector('#billing-signin').hidden=true;
  try{
    const data=await api(verify?'/api/billing/verify':'/api/billing/status',verify?{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}:undefined);
    if(data.mode!=='live')throw Error('Paid checkout is not open yet. No payment has been taken.');
    document.querySelector('#refresh').onclick=()=>refresh(data.provider==='paystack');
    const access=data.access;
    const accessText=document.querySelector('#access');
    accessText.textContent=access?.enforced?(access.active?`${access.modes?`${access.modes.mock.remaining} mock interviews and ${access.modes.learn.remaining} tutor sessions remaining`:`${access.remaining} of ${access.limit} shared sessions remaining`}. Expires ${new Date(access.expiresAt).toLocaleString()}.`:'Choose a plan to activate your practice allowance.'):'No practice allowance is active.';
    const records=data.payments||data.subscriptions;
    message.textContent=records.length?records.map(s=>`${s.plan_id||'Unrecognized plan'}: ${s.status}${s.cancel_at_period_end?' (cancels at period end)':''}`).join('\n'):'Your access activates after your payment is verified.';
    for(const plan of data.plans){
      const button=document.createElement('button');button.textContent=`${plan.id === 'starter' ? 'Buy Starter' : plan.id === 'standard' ? 'Buy Standard' : plan.id} — ${new Intl.NumberFormat('en-US',{style:'currency',currency:plan.currency}).format(plan.amount/100)}${data.recurring===false?' (one payment)':'/month'}`;
      if(plan.access)button.textContent+=` · ${plan.access.mock!==undefined?`${plan.access.mock} mock interviews + ${plan.access.learn} tutor sessions`:`${plan.access.sessions} shared tutor/mock sessions`} over ${plan.access.days} days`;
      button.disabled=data.paymentReview===true || (access?.active===true && access.remaining>0);
      button.onclick=async()=>{
        for(const b of plans.children)b.disabled=true;
        try{
          const result=await api('/api/billing/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({planId:plan.id})});
          if(result.retry){message.textContent='Previous checkout closed. Choose your plan again to start again.';return;}
          const url=new URL(result.url);if(url.protocol!=='https:'||url.hostname!==(data.provider==='paystack'?'checkout.paystack.com':'checkout.stripe.com')||url.username||url.password||url.port)throw Error('Unexpected checkout destination.');
          location.assign(url.href);
        }catch(e){message.textContent=e.message;}finally{for(const b of plans.children)b.disabled=data.paymentReview===true || (access?.active===true && access.remaining>0);}
      };plans.append(button);
    }
  }catch(e){document.querySelector('#billing-signin').hidden=e.status!==401;message.textContent=e.status===401?'Sign in or create an account to continue to checkout.':e.message;document.querySelector('#access').textContent='Your plan could not be loaded. Sign in and refresh, or contact support.';}
}
document.querySelector('#refresh').onclick=()=>refresh();
refresh();
