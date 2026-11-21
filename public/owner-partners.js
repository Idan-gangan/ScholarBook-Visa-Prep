'use strict';
const $=id=>document.getElementById(id);
let roster=[],grants=[];
async function request(path,options){
 const r=await fetch(path,{credentials:'same-origin',...options});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(data.error||'The request could not be completed.');
 return data;
}
const status=message=>{$('status').textContent=message;};
function cell(tr,value){
 const td=document.createElement('td');td.textContent=String(value??'—');tr.append(td);return td;
}
function render(){
 const select=$('student');select.replaceChildren();
 const empty=document.createElement('option');empty.value='';empty.textContent='Choose a verified student';select.append(empty);
 for(const u of roster){
  const option=document.createElement('option');option.value=u.id;option.textContent=u.name+' · '+u.email;
  select.append(option);
 }
 const body=$('grants');body.replaceChildren();
 const emails=new Map(roster.map(u=>[u.id,u.name+' · '+u.email]));
 if(!grants.length){
  const tr=document.createElement('tr');const td=cell(tr,'No Scholarbook sponsored packages yet.');td.colSpan=7;body.append(tr);
 }
 for(const row of grants){
  const tr=document.createElement('tr');
  const active=!row.revoked_at && Date.parse(row.expires_at)>Date.now();
  cell(tr,emails.get(row.user_id)||row.user_id);
  cell(tr,row.invoice_reference);
  cell(tr,new Date(row.expires_at).toLocaleDateString());
  cell(tr,row.mock_used+' / '+row.mock_limit);
  cell(tr,row.learn_used+' / '+row.learn_limit);
  cell(tr,row.revoked_at?'Revoked':active?'Active':'Expired');
  const action=cell(tr,'');
  if(active){
   const button=document.createElement('button');button.type='button';button.className='danger';button.textContent='Revoke';button.onclick=()=>revoke(row.id);
   action.append(button);
  }
  body.append(tr);
 }
 $('grant').disabled=false;
}
async function reload(){
 $('grant').disabled=true;
 try{
  const data=await request('/api/owner/partners');
  roster=data.users||[];grants=data.grants||[];
  render();
  status('Ready. Only verified Student accounts can be assigned.');
 }catch(e){status(e.message);$('student').replaceChildren();$('grants').textContent='Owner access required.';}
}
async function grant(){
 const userId=$('student').value,invoiceReference=$('invoice').value.trim(),currentPassword=$('password').value;
 if(!userId||!invoiceReference||!currentPassword){status('Choose a student, enter the agreement reference and provide your current Owner password.');return;}
 $('grant').disabled=true;
 try{
  await request('/api/owner/partners/grant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,invoiceReference,currentPassword})});
  $('password').value='';$('invoice').value='';
  await reload();status('Scholarbook package granted. The student can sign in and use their sessions.');
 }catch(e){status(e.message);$('grant').disabled=false;}
}
async function revoke(grantId){
 const currentPassword=$('password').value;
 if(!currentPassword){status('Enter your current Owner password above before revoking access.');return;}
 if(!confirm('Revoke this Scholarbook package? The student will lose sponsored access to unused sessions.'))return;
 try{
  await request('/api/owner/partners/revoke',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({grantId,confirmation:'REVOKE',currentPassword})});
  $('password').value='';await reload();status('Sponsored access revoked.');
 }catch(e){status(e.message);}
}
$('grant').addEventListener('click',grant);
$('refresh').addEventListener('click',reload);
reload();