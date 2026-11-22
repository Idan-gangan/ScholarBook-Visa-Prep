'use strict';
(function(){
 const $=id=>document.getElementById(id);
 const status=message=>{$('status').textContent=message;};
 let secretLink='';
 async function api(path,body,raw=false){
  const response=await fetch(path,{method:body===undefined?'GET':'POST',
   credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json'},
   body:body===undefined?undefined:JSON.stringify(body)});
  if(!response.ok){const value=await response.json().catch(()=>({}));throw Error(value.error||'Unable to complete request.');}
  return raw?response.blob():response.json();
 }
 function password(){
  const value=$('ownerPassword').value;
  if(!value){status('Enter your current Owner password to continue.');throw Error('Owner password required.');}
  return value;
 }
 function element(tag,text,cls){
  const node=document.createElement(tag);if(text!==undefined)node.textContent=String(text);
  if(cls)node.className=cls;return node;
 }
 async function load(){
  try{
   const data=await api('/api/owner/sevis/list');
   if(!data.enabled){
    status('Secure intake is not enabled. Configure encryption and complete security review before inviting students.');
    $('create').disabled=true;return;
   }
   status('Secure intake is available. Create an invitation to collect a student’s documents.');
   $('create').disabled=false;const target=$('requests');target.replaceChildren();
   if(!data.cases?.length){target.append(element('p','No invitations created yet.'));return;}
   for(const row of data.cases){
    const card=element('article',undefined,'item');
    const meta=element('div');
    meta.append(element('strong',row.email));
    const state=row.caseId?'Received':row.revokedAt?'Revoked':row.usedAt?'Used':new Date(row.expiresAt)<new Date()?'Expired':'Awaiting student';
    meta.append(element('p',state,'small'));
    meta.append(element('p','Created '+new Date(row.createdAt).toLocaleString()+(row.submittedAt?' · Submitted '+new Date(row.submittedAt).toLocaleString():''),'small'));
    const actions=element('div',undefined,'actions');
    function action(name,callback,danger=false){
     const b=element('button',name,'smallbtn'+(danger?' danger':''));b.type='button';b.onclick=callback;actions.append(b);
    }
    if(row.caseId){
     action('Review details',()=>review(row.caseId));
     action('Download I-20',()=>download(row.caseId,'i20'));
     action('Download passport',()=>download(row.caseId,'passport'));
     action('Delete case',()=>remove(row.caseId,'delete'),true);
    }else if(state==='Awaiting student')action('Revoke link',()=>remove(row.inviteId,'revoke'),true);
    card.append(meta,actions);target.append(card);
   }
  }catch(error){status(error.message);}
 }
 async function create(){
  const clientEmail=$('inviteEmail').value.trim();
  if(!clientEmail){status('Enter the client email address.');return;}
  let pass;try{pass=password();}catch{return;}
  const b=$('create');b.disabled=true;
  try{
   const data=await api('/api/owner/sevis/invite',{clientEmail,currentPassword:pass});
   secretLink=location.origin+'/sevis-intake.html#invite='+data.token;
   $('inviteLink').textContent=secretLink;$('linkBox').style.display='block';
   $('inviteEmail').value='';$('ownerPassword').value='';
   status('Private link created for '+data.email+'. Share it only with the intended client.');
   await load();
  }catch(error){status(error.message);}
  finally{b.disabled=false;}
 }
 async function copy(){
  if(!secretLink)return;
  try{await navigator.clipboard.writeText(secretLink);status('Invitation link copied securely.');}
  catch{status('Unable to copy automatically. Copy the displayed link manually.');}
 }
 async function review(caseId){
  let pass;try{pass=password();}catch{return;}
  try{
   const value=await api('/api/owner/sevis/details',{caseId,currentPassword:pass});
   $('ownerPassword').value='';const d=value.details,target=$('details');
   target.replaceChildren();const dl=element('dl');
   const rows=[['Full name',d.givenName+' '+d.surname],['SEVIS ID',d.sevisId],
    ['Birth date',d.dob],['School',d.school],['Email',d.email],['Phone',d.phone],
    ['Address',Object.values(d.address).filter(Boolean).join(', ')],
    ['Consent recorded',d.consentAt]];
   for(const [k,v] of rows){dl.append(element('dt',k),element('dd',v));}
   target.append(dl);$('detailsSection').hidden=false;
   $('detailsSection').scrollIntoView({behavior:'smooth',block:'start'});
   status('Sensitive case details retrieved for Owner review. Keep these private.');
  }catch(error){status(error.message);}
 }
 async function download(caseId,which){
  let pass;try{pass=password();}catch{return;}
  try{
   const blob=await api('/api/owner/sevis/file',{caseId,which,currentPassword:pass},true);
   $('ownerPassword').value='';
   const extension=which==='i20'?'pdf':blob.type==='image/png'?'png':'jpg';
   const filename='VisaAtlas-'+which+'-'+caseId+'.'+extension;
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;
   document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
   status('Secure download created. Protect and delete local copies when no longer needed.');
  }catch(error){status(error.message);}
 }
 async function remove(id,operation){
  let pass;try{pass=password();}catch{return;}
  const message=operation==='delete'?'Permanently delete the client files from active storage?':'Revoke this unused invitation?';
  if(!confirm(message))return;
  try{
   await api('/api/owner/sevis/'+operation,{[operation==='delete'?'caseId':'inviteId']:id,confirmation:'DELETE',currentPassword:pass});
   $('ownerPassword').value='';$('detailsSection').hidden=true;await load();
   status(operation==='delete'?'Client files deleted from active storage.':'Invitation revoked.');
  }catch(error){status(error.message);}
 }
 $('create').addEventListener('click',create);
 $('copy').addEventListener('click',copy);
 $('refresh').addEventListener('click',load);
 load();
})();