'use strict';
const list=document.querySelector('#payments'),status=document.querySelector('#status'),more=document.querySelector('#more'),reload=document.querySelector('#reload');
let cursor=null,busy=false;
const date=value=>value?new Date(value).toLocaleString():'—';
function node(tag,text,className){const element=document.createElement(tag);element.textContent=text;if(className)element.className=className;return element;}
function render(row){
  const card=node('article','', 'payment'),header=node('header','');
  header.append(node('h2',row.email),node('span',row.verified_at?'Verified test payment':'Not verified · '+row.state,'badge'));card.append(header);
  const details=node('dl','');
  const access=!row.expires_at?'No access included':new Date(row.expires_at)<=new Date()?'Expired':Number(row.sessions_used)>=Number(row.session_limit)?'Sessions used up':'Active';
  for(const [label,value] of [
    ['Amount',new Intl.NumberFormat('en-US',{style:'currency',currency:row.currency}).format(row.amount/100)],
    ['Plan',row.plan_id],['Paid at',date(row.paid_at)],['Access',access],['Expires',date(row.expires_at)],
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
    for(const row of data.payments)list.append(render(row));
    cursor=data.next;more.hidden=!cursor;
    status.textContent=data.mode==='disabled'?'Billing is disabled.':list.children.length?`${list.children.length} test payment records shown.`:'No test payments recorded yet.';
  }catch(error){status.textContent=error.message;}finally{busy=false;reload.disabled=more.disabled=false;}
}
reload.onclick=()=>load();more.onclick=()=>load(true);load();
