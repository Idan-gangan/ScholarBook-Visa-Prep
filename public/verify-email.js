(()=>{
 const token=new URLSearchParams(location.hash.slice(1)).get('token');
 history.replaceState(null,'',location.pathname);
 const button=document.getElementById('confirm'),status=document.getElementById('status');
 if(!token){button.disabled=true;status.textContent='No verification link found. Sign in to request a new email.';return;}
 button.onclick=async()=>{
  button.disabled=true;status.textContent='Verifying…';
  try{
   const r=await fetch('/api/verify-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
   const data=await r.json();if(!r.ok)throw Error(data.error||'Verification failed.');
   status.textContent='Email verified. Opening VisaAtlas…';
   location.replace('/?signin=1');
  }catch(e){status.textContent=e.message;button.disabled=false;}
 };
})();
