const crypto=require('node:crypto');
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
const fail=(status,message)=>Object.assign(new Error(message),{status,publicMessage:message});
const NOTICE_VERSION='2026-10-25-v1';
const email=value=>typeof value==='string'?value.trim().toLowerCase():'';
function checkAge(body){
 if(body?.ageBand==='under13')throw fail(403,'VisaAtlas is not available to children under 13.');
 if(!['13-17','18+'].includes(body?.ageBand))throw fail(400,'Select your age group.');
}
function consumePermission(db,body,studentEmail,now=Date.now()){
 checkAge(body);
 const record={ageBand:body.ageBand,declaredAt:new Date(now).toISOString(),method:'self-declared-age-band'};
 if(body.ageBand==='18+')return record;
 if(typeof body.guardianRequest!=='string'||!/^[a-f0-9]{64}$/.test(body.guardianRequest))throw fail(403,'Ask your parent or guardian to confirm permission before creating your account.');
 const key=digest(body.guardianRequest);
 const permission=(db.guardianPermissions||[]).find(p=>p.requestHash===key&&p.studentEmail===studentEmail&&p.expiresAt>now&&p.confirmedAt&&p.delivered);
 if(!permission)throw fail(403,'Guardian permission is missing or expired. Ask your guardian to open the email and confirm, or request a new link.');
 record.guardian={email:permission.guardianEmail,confirmedAt:permission.confirmedAt,noticeVersion:NOTICE_VERSION,method:'email-and-guardian-attestation'};
 db.guardianPermissions=db.guardianPermissions.filter(p=>p.studentEmail!==studentEmail);
 return record;
}
function createGuardianPermissions({mutateDb,env=process.env,send=globalThis.fetch,now=Date.now}){
 function cleanExpired(db){db.guardianPermissions=(db.guardianPermissions||[]).filter(p=>p.expiresAt>now());db.guardianMailLog=(db.guardianMailLog||[]).filter(p=>p.at>now()-3600000);}
 async function request(body){
 checkAge(body);if(body.ageBand!=='13-17')throw fail(400,'Guardian permission is for students aged 13–17.');
 const studentEmail=email(body.email),guardianEmail=email(body.guardianEmail);
 if([studentEmail,guardianEmail].some(v=>v.length>160||!/^\S+@\S+\.\S+$/.test(v)))throw fail(400,'Enter valid student and guardian email addresses.');
 if(studentEmail===guardianEmail)throw fail(400,'Use a separate email address belonging to your parent or guardian.');
 let origin;try{const url=new URL(env.APP_BASE_URL||'https://visaatlasprep.com');if(url.protocol==='https:'&&url.pathname==='/'&&!url.username&&!url.password&&!url.search&&!url.hash)origin=url.origin;}catch{}
 if(!origin||!env.RESEND_API_KEY||!env.RESEND_FROM)throw fail(503,'Guardian email is temporarily unavailable. Please try again later.');
 const token=crypto.randomBytes(32).toString('hex'),requestId=crypto.randomBytes(32).toString('hex'),time=now();
 await mutateDb(async db=>{
 cleanExpired(db);const s=digest(studentEmail),g=digest(guardianEmail),log=db.guardianMailLog;
 if(log.length>=100||log.filter(x=>x.studentKey===s||x.guardianKey===g).length>=3||log.some(x=>(x.studentKey===s||x.guardianKey===g)&&x.at>time-60000))throw fail(429,'Please wait before requesting another guardian email. Up to 3 requests per hour are allowed.');
 log.push({studentKey:s,guardianKey:g,at:time});
 db.guardianPermissions.push({requestHash:digest(requestId),tokenHash:digest(token),studentEmail,guardianEmail,expiresAt:time+86400000,delivered:false});
 });
 try{
 const response=await send('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'guardian-'+digest(token)},signal:AbortSignal.timeout(10000),body:JSON.stringify({from:env.RESEND_FROM,to:[guardianEmail],subject:'Review a VisaAtlas guardian permission request',text:'A student using '+studentEmail+' has indicated they are aged 13–17 and asked for your permission to create a VisaAtlas account. No student account has been created by this request.\n\nReview the learning, AI voice, saved-record and staff-access information, then approve only if you are their parent or legal guardian. You can decline on the same page.\n\n'+origin+'/guardian-permission.html#token='+token+'\n\nThis link expires in 24 hours. If you do not recognise this request, ignore it or decline it. Support: support@visaatlasprep.com'})});
 if(!response.ok)throw Error('delivery');
 await mutateDb(async db=>{const p=(db.guardianPermissions||[]).find(p=>p.requestHash===digest(requestId));if(p)p.delivered=true;});
 }catch{await mutateDb(async db=>{db.guardianPermissions=(db.guardianPermissions||[]).filter(p=>p.requestHash!==digest(requestId));});throw fail(503,'The guardian email could not be sent. Wait a minute and try again.');}
 return {ok:true,requestId,message:'Email sent to your guardian. Keep this page open. After they confirm, finish creating your account. The request expires in 24 hours.'};
 }
 async function respond(body){
 if(typeof body?.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))throw fail(400,'This link is invalid or expired.');
 return mutateDb(async db=>{
 cleanExpired(db);const p=db.guardianPermissions.find(p=>p.tokenHash===digest(body.token)&&p.delivered);
 if(!p)throw fail(400,'This link is invalid, already used, or expired.');
 if(body.action==='view')return {email:p.studentEmail,confirmed:!!p.confirmedAt};
 if(body.action==='decline'){db.guardianPermissions=db.guardianPermissions.filter(x=>x!==p);return {ok:true};}
 if(body.action!=='approve'||body.isGuardian!==true||body.permission!==true||body.noticeVersion!==NOTICE_VERSION)throw fail(400,'Review the notice and confirm both statements before giving permission.');
 if(p.confirmedAt)throw fail(400,'Permission has already been recorded.');
 p.confirmedAt=new Date(now()).toISOString();return {ok:true};
 });
 }
 return {request,respond};
}
module.exports={checkAge,consumePermission,createGuardianPermissions,NOTICE_VERSION};
