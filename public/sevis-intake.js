'use strict';
(function(){
 const $=id=>document.getElementById(id),status=$('status');
 const params=new URLSearchParams(location.hash.replace(/^#/,''));
 const token=params.get('invite');
 const form=$('form'),send=$('submit');
 let email=null;
 function report(message){status.textContent=message;}
 async function request(url,body){
  const r=await fetch(url,{method:'POST',credentials:'same-origin',cache:'no-store',
   headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.error||'The request could not be processed.');
  return data;
 }
 async function start(){
  if(!token||!/^[a-f0-9]{64}$/.test(token)){report('This secure link is missing. Please request a new invitation from VisaAtlas Support.');return;}
  try{
   const data=await request('/api/sevis/intake/check',{token});
   email=data.email; $('email').value=email;
   form.style.display='block';
   report('Invitation verified. Please complete all required fields and upload your documents.');
  }catch(e){report(e.message);}
 }
 function fileBase64(file,max,allowed){
  return new Promise((resolve,reject)=>{
   if(!file||file.size===0||file.size>max||!allowed.includes(file.type))
    return reject(new Error('Please select the correct file format and size.'));
   const reader=new FileReader();
   reader.onerror=()=>reject(new Error('Unable to read the selected file.'));
   reader.onload=()=>resolve({type:file.type,base64:String(reader.result).split(',')[1]||''});
   reader.readAsDataURL(file);
  });
 }
 const val=id=>$(id).value.trim();
 form.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!form.reportValidity())return;
  if(!email){report('The secure invitation is not ready.');return;}
  const i20=$('i20').files[0],passport=$('passport').files[0];
  if(!i20||!passport){report('Please attach both required files.');return;}
  send.disabled=true;send.textContent='Securing and submitting documents…';report('Validating and securely submitting your files…');
  try{
   const [i20Doc,passportDoc]=await Promise.all([
    fileBase64(i20,4*1024*1024,['application/pdf']),
    fileBase64(passport,3*1024*1024,['image/jpeg','image/png'])
   ]);
   const body={token, surname:val('surname'),givenName:val('givenName'),dob:val('dob'),
    sevisId:val('sevisId').toUpperCase(),school:val('school'),email,phone:val('phone'),
    address:{line1:val('line1'),line2:val('line2'),city:val('city'),
      state:val('state'),postal:val('postal'),country:val('country')},
    isAdult:$('isAdult').checked,consent:$('consent').checked,i20:i20Doc,passport:passportDoc};
   const result=await request('/api/sevis/intake/submit',body);
   form.reset();form.remove();$('done').style.display='block';
   $('reference').textContent='Private reference: '+result.caseReference;
   history.replaceState(null,'',location.pathname);
   report('Submission successful. Your documents were received.');
  }catch(error){report(error.message);send.disabled=false;send.textContent='Submit securely to VisaAtlas';}
 });
 start();
})();