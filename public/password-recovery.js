'use strict';
(()=>{
  const $=id=>document.getElementById(id);
  const fragment=new URLSearchParams(location.hash.slice(1));
  let token=fragment.get('token')||'';
  const resetMode=fragment.has('token');
  // The fragment never reaches the server. Clear it from the address bar/history
  // before any form submission; keep it only in this page's memory.
  history.replaceState(null,'',location.pathname);
  if(resetMode){
    $('requestForm').hidden=true;
    $('title').textContent='Choose a new password';
    $('description').textContent='Reset your password, then sign in again on your devices.';
    $('requestAgain').hidden=false;
    if(/^[a-f0-9]{64}$/.test(token))$('resetForm').hidden=false;
    else{$('status').textContent='This reset link is invalid. Request a new link.';$('status').className='error';}
  }
  async function submit(form,url,body){
    const button=form.querySelector('button');button.disabled=true;
    $('status').className='';$('status').textContent='Please wait…';
    try{
      const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'Something went wrong. Please try again.');
      return result;
    }catch(error){
      $('status').className='error';
      $('status').textContent=error.name==='TimeoutError'||error.name==='TypeError'?'Could not reach the server. Please try again.':error.message;
      return null;
    }finally{button.disabled=false;}
  }
  $('requestForm').addEventListener('submit',async event=>{
    event.preventDefault();
    const result=await submit(event.currentTarget,'/api/forgot-password',{email:$('email').value});
    if(result)$('status').textContent=result.message;
  });
  $('resetForm').addEventListener('submit',async event=>{
    event.preventDefault();
    if($('newPassword').value!==$('confirmPassword').value){$('status').className='error';$('status').textContent='New passwords do not match.';return;}
    const result=await submit(event.currentTarget,'/api/reset-password',{token,newPassword:$('newPassword').value,confirmPassword:$('confirmPassword').value});
    if(result){
      token='';$('resetForm').reset();$('resetForm').hidden=true;$('requestAgain').hidden=true;
      $('title').textContent='Password reset';$('description').textContent='Your new password is ready.';
      $('status').textContent='Your previous sign-ins have ended. Use your new password to sign in.';
    }
  });
})();
