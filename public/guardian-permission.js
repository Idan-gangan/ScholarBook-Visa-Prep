(async()=>{
 const token=new URLSearchParams(location.hash.slice(1)).get('token');
 history.replaceState(null,'',location.pathname);
 const $=id=>document.getElementById(id);let busy=false;
 async function request(body){const r=await fetch('/api/guardian-permission',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,...body})});const data=await r.json();if(!r.ok)throw Error(data.error||'Request failed. Please try again.');return data;}
 if(!token){$('student').textContent='Open the link in your guardian permission email.';return;}
 try{const data=await request({action:'view'});$('student').textContent='Student email: '+data.email;
 if(data.confirmed){$('status').textContent='Permission has already been recorded. The student can finish registration before the request expires.';return;}
 $('permissionFields').disabled=false;
 }catch(error){$('student').textContent=error.message;return;}
 async function respond(action){if(busy)return;busy=true;$('permissionFields').disabled=true;$('status').textContent='Saving your response…';
 try{await request({action,isGuardian:$('isGuardian').checked,permission:$('permission').checked,noticeVersion:'2026-10-25-v1'});$('status').textContent=action==='approve'?'Permission recorded. Tell the student to finish creating their account in the registration page they left open.':'Request declined. This request can no longer be used to create an account.';}
 catch(error){$('status').textContent=error.message;$('permissionFields').disabled=false;}
 finally{busy=false;}}
 $('permissionForm').onsubmit=event=>{event.preventDefault();respond('approve');};
 $('decline').onclick=()=>respond('decline');
})();
