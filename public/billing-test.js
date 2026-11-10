'use strict';
const message=document.querySelector('#message'), plans=document.querySelector('#plans');
async function api(path,options){const r=await fetch(path,options);const data=await r.json();if(!r.ok)throw Error(data.error||'Billing is unavailable.');return data;}
async function refresh(verify=false){
  plans.replaceChildren();
  try{
    const data=await api(verify?'/api/billing/verify':'/api/billing/status',verify?{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}:undefined);
    document.querySelector('#refresh').onclick=()=>refresh(data.provider==='paystack');
    const records=data.payments||data.subscriptions;
    message.textContent=records.length?records.map(s=>`${s.plan_id||'Unrecognized plan'}: ${s.status}${s.cancel_at_period_end?' (cancels at period end)':''}`).join('\n'):'No verified test payment yet. Refresh status after completing checkout.';
    for(const plan of data.plans){
      const button=document.createElement('button');button.textContent=`Test ${plan.id} — ${new Intl.NumberFormat('en-US',{style:'currency',currency:plan.currency}).format(plan.amount/100)}${data.recurring===false?' (one-time test)':'/month'}`;
      button.onclick=async()=>{
        for(const b of plans.children)b.disabled=true;
        try{
          const result=await api('/api/billing/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({planId:plan.id})});
          if(result.retry){message.textContent='Previous checkout closed. Choose your plan again to start a new test.';return;}
          const url=new URL(result.url);if(url.protocol!=='https:'||url.hostname!==(data.provider==='paystack'?'checkout.paystack.com':'checkout.stripe.com')||url.username||url.password||url.port)throw Error('Unexpected checkout destination.');
          location.assign(url.href);
        }catch(e){message.textContent=e.message;}finally{for(const b of plans.children)b.disabled=false;}
      };plans.append(button);
    }
  }catch(e){message.textContent=e.message;}
}
document.querySelector('#refresh').onclick=()=>refresh();
refresh();
