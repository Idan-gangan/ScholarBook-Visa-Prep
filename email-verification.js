const crypto=require('node:crypto');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const fail=(status,message)=>Object.assign(new Error(message),{status,publicMessage:message});
const needsVerification=user=>user?.verificationRequired===true && !user.emailVerifiedAt;
function createEmailVerification({mutateDb,env=process.env,send=globalThis.fetch,now=Date.now}){
 function config(){
  let url;try{url=new URL(env.APP_BASE_URL||'https://visaatlasprep.com')}catch{}
  if(!env.RESEND_API_KEY||!env.RESEND_FROM||!url||url.protocol!=='https:'||url.pathname!=='/'||url.username||url.password||url.search||url.hash)throw fail(503,'Email delivery is not available. Please try again later.');
  return {origin:url.origin,key:env.RESEND_API_KEY,from:env.RESEND_FROM};
 }
 async function request(userId,{newEmail,beforeChange}={}){
  const cfg=config(),token=crypto.randomBytes(32).toString('hex'),time=now();
  const destination=await mutateDb(async(db,client)=>{
   const user=db.users.find(u=>u.id===userId);
   if(!needsVerification(user))throw fail(400,'This account does not need email verification.');
   const email=newEmail===undefined?user.email:String(newEmail).trim().toLowerCase();
   if(email.length>160||!/^\S+@\S+\.\S+$/.test(email))throw fail(400,'Enter a valid email address.');
   if(newEmail!==undefined){
    await beforeChange?.(client);
    if(db.users.some(u=>u.id!==userId&&String(u.email).toLowerCase()===email))throw fail(409,'This email cannot be used.');
   }
   // Persistent limits under the app-state lock: multiple tabs/instances cannot bypass them.
   db.verificationMailLog=(db.verificationMailLog||[]).filter(x=>x.at>time-3600000);
   const log=db.verificationMailLog,key=digest(email);
   if(log.some(x=>x.userId===userId&&x.at>time-60000)||log.filter(x=>x.userId===userId||x.key===key).length>=3||log.length>=100)throw fail(429,'Please wait before requesting another verification email. You can request up to 3 per hour.');
   log.push({userId,key,at:time});
   user.email=email;user.emailVerification={hash:digest(token),email,expiresAt:time+86400000};
   const profile=db.athletes.find(a=>a.userId===userId);if(profile)profile.email=email;
   return email;
  });
  const link=cfg.origin+'/verify-email.html#token='+token;
  try{
   const response=await send('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+cfg.key,'Content-Type':'application/json','Idempotency-Key':'verify-'+digest(token)},signal:AbortSignal.timeout(10000),body:JSON.stringify({from:cfg.from,to:[destination],subject:'Verify your VisaAtlas email',text:'Confirm that this email belongs to you to use VisaAtlas voice practice and reports.\n\n'+link+'\n\nThis link expires in 24 hours. If you did not create this account, ignore this email.'})});
   if(!response.ok)throw new Error('delivery');
  }catch{throw fail(503,'Your account is saved, but the verification email could not be sent. Wait a minute, then use Resend email.');}
  return {ok:true,message:'Verification email sent. Check your inbox and spam folder. The link expires in 24 hours.'};
 }
 async function verify(token){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw fail(400,'This link is invalid or expired. Request a new email.');
  return mutateDb(async db=>{
   const user=db.users.find(u=>u.emailVerification?.hash===digest(token));
   if(!user||!needsVerification(user)||user.emailVerification.email!==user.email||user.emailVerification.expiresAt<=now())throw fail(400,'This link is invalid or expired. Request a new email.');
   user.emailVerifiedAt=new Date(now()).toISOString();delete user.emailVerification;
   return {ok:true};
  });
 }
 return {request,verify};
}
module.exports={createEmailVerification,needsVerification};
