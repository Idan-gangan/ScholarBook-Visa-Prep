'use strict';
const list=document.querySelector('#payments'),status=document.querySelector('#status'),more=document.querySelector('#more'),reload=document.querySelector('#reload');
let cursor=null,busy=false,mode='test';
const date=value=>value?new Date(value).toLocaleString():'—';
function node(tag,text,className){const element=document.createElement(tag);element.textContent=text;if(className)element.className=className;return element;}
function render(row){
  const card=node('article','', 'payment'),header=node('header','');
  header.append(node('h2',row.email),node('span',row.verified_at?(mode==='live'?'Verified payment':'Verified test payment'):'Not verified · '+row.state,'badge'));card.append(header);
  const details=node('dl','');
  const access=row.hold_reason?'On hold — contact support':!row.expires_at?'No access included':new Date(row.expires_at)<=new Date()?'Expired':Number(row.sessions_used)>=Number(row.session_limit)?'Sessions used up':'Active';
  for(const [label,value] of [
    ['Amount',new Intl.NumberFormat('en-US',{style:'currency',currency:row.currency}).format(row.amount/100)],
    ['Plan',row.plan_id],['Paid at',date(row.paid_at)],['Access',access],['Expires',date(row.expires_at)],
    ['Mock interviews used',row.mode_limits?`${row.mock_used} / ${row.mode_limits.mock}`:'—'],
    ['Tutor sessions used',row.mode_limits?`${row.learn_used} / ${row.mode_limits.learn}`:'—'],
    ['Sessions used',row.session_limit?`${row.sessions_used} / ${row.session_limit}`:'—'],
    ['Reference',row.reference],['Account ID',row.user_id],['Verified at',date(row.verified_at)]
  ]){const group=node('div','');group.append(node('dt',label),node('dd',value));details.append(group);}
  card.append(details);return card;
}
async function load(append=false){
  if(busy)return;busy=true;reload.disabled=more.disabled=true;status.textContent='Loading payments…';
  if(!append){cursor=null;list.replaceChildren();more.hidden=true;}
  try{
    const response=await fetch('/api/owner/payments'+(append&&cursor?'?before='+encodeURIComponent(cursor):''),{cache:'no-store'});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to load payments.');
    mode=data.mode;
    document.querySelector('#paymentNotice').textContent=mode==='live'?'Verified live payments are shown here. Payment verification is not confirmation of bank payout.':'Sandbox records only. These are simulated payments, not revenue or bank payouts.';
    if(data.recovery){
      const {sent,recovered,cents}=data.recovery;
      const amount=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(cents)/100);
      document.querySelector('#paymentNotice').textContent+=
        ' Checkout reminders sent: '+sent+'. Verified same-plan sales within seven days of a reminder: '+recovered+' ('+amount+').';
    }
    for(const row of data.payments)list.append(render(row));
    cursor=data.next;more.hidden=!cursor;
    status.textContent=data.mode==='disabled'?'Billing is disabled.':list.children.length?`${list.children.length} ${mode==='live'?'live':'test'} payment records shown.`:'No payments recorded yet.';
  }catch(error){status.textContent=error.message;}finally{busy=false;reload.disabled=more.disabled=false;}
}
reload.onclick=()=>load();more.onclick=()=>load(true);load();
