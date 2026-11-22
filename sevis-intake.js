'use strict';
const crypto=require('node:crypto');
const err=(status,message)=>Object.assign(new Error(message),{status,publicMessage:message});
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const TOKEN=/^[a-f0-9]{64}$/,ID=/^sevis_[a-f0-9]{32}$/,EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_I20=4*1024*1024,MAX_PASSPORT=3*1024*1024,MAX_CASES=100,MAX_STORED=40;
const field=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=n?v.trim():null;
const email=v=>typeof v==='string'&&v.length<=254?v.trim().toLowerCase():'';
function decodeFile(doc,kind){
 if(!doc||typeof doc!=='object'||Array.isArray(doc)||Object.keys(doc).some(k=>!['type','base64'].includes(k)))throw err(400,'Upload both required documents.');
 const type=doc.type,max=kind==='i20'?MAX_I20:MAX_PASSPORT;
 if((kind==='i20'?type!=='application/pdf':!['image/jpeg','image/png'].includes(type))||typeof doc.base64!=='string')
  throw err(400,'Unsupported document format.');
 if(doc.base64.length>Math.ceil(max/3)*4+8||doc.base64.length<20||!/^[A-Za-z0-9+/]+={0,2}$/.test(doc.base64))
  throw err(400,'Document is missing or exceeds the upload limit.');
 const data=Buffer.from(doc.base64,'base64');
 if(!data.length||data.length>max||data.toString('base64')!==doc.base64)throw err(400,'Invalid or oversized document.');
 if(kind==='i20'&&data.subarray(0,5).toString()!=='%PDF-')throw err(400,'Form I-20 must be a PDF.');
 if(kind==='passport'){
  const jpeg=type==='image/jpeg'&&data[0]===255&&data[1]===216&&data[data.length-2]===255&&data[data.length-1]===217;
  const png=type==='image/png'&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(!jpeg&&!png)throw err(400,'Passport must be a valid JPG or PNG image.');
 }
 return data;
}
function validateDetails(body,invitedEmail){
 if(!body||typeof body!=='object'||Array.isArray(body))throw err(400,'Incomplete student information.');
 const allowed=['token','surname','givenName','sevisId','dob','school','address','email','phone','isAdult','consent','i20','passport'];
 if(Object.keys(body).some(k=>!allowed.includes(k)))throw err(400,'Invalid form fields.');
 const surname=field(body.surname,100),givenName=field(body.givenName,130),school=field(body.school,170),
  sevisId=field(body.sevisId,12)?.toUpperCase(),emailAddress=email(body.email),phone=field(body.phone,35);
 if(!surname||!givenName||!school||!/^N\d{10}$/.test(sevisId||'')||!EMAIL.test(emailAddress)||emailAddress!==invitedEmail||!phone)
  throw err(400,'Check your I-20 details, contact information, and invited email.');
 const a=body.address;
 if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!['line1','line2','city','state','postal','country'].includes(k)))
  throw err(400,'Please provide your complete address.');
 const address={line1:field(a.line1,160),line2:a.line2?field(a.line2,160):'',city:field(a.city,100),
  state:field(a.state,100),postal:a.postal?field(a.postal,25):'',country:field(a.country,100)};
 if(!address.line1||!address.city||!address.state||!address.country)throw err(400,'Please provide your complete mailing address.');
 const dob=field(body.dob,10);
 if(!dob||!/^\d{4}-\d{2}-\d{2}$/.test(dob)||Number.isNaN(Date.parse(dob))||new Date(dob).toISOString().slice(0,10)!==dob)
  throw err(400,'Please enter a valid birth date.');
 const now=new Date(),eighteen=new Date(Date.UTC(now.getUTCFullYear()-18,now.getUTCMonth(),now.getUTCDate()));
 if(new Date(dob)>eighteen||body.isAdult!==true)throw err(403,'This form is for adults. Contact support for guardian-assisted intake.');
 if(body.consent!==true)throw err(400,'Please agree to the document-processing notice.');
 return {surname,givenName,school,sevisId,dob,email:emailAddress,phone,address,consentAt:new Date().toISOString()};
}
function createSevisIntake(pool,{env=process.env}={}){
 const enabled=env.SEVIS_INTAKE_ENABLED==='true';let key=null;
 if(enabled){
  const secret=env.SEVIS_INTAKE_ENCRYPTION_KEY;
  if(typeof secret!=='string'||!/^[a-fA-F0-9]{64}$/.test(secret))throw Error('SEVIS_INTAKE_ENCRYPTION_KEY must be 32 random bytes encoded as 64 hex characters.');
  key=Buffer.from(secret,'hex');
 }
 const origin=env.SEVIS_INTAKE_ORIGIN||'https://visaatlasprep.com';
 function guard(){if(!enabled)throw err(503,'Secure SEVIS intake is not available yet. Please contact VisaAtlas Support.');}
 function checkOrigin(v){if(v!==origin)throw err(403,'Invalid request origin.');}
 function seal(value,context){
  const raw=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value),'utf8');
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from(context));
  return Buffer.concat([iv,cipher.update(raw),cipher.final(),cipher.getAuthTag()]);
 }
 function unseal(data,context){
  const bytes=Buffer.from(data),iv=bytes.subarray(0,12),tag=bytes.subarray(bytes.length-16);
  const cipher=crypto.createDecipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from(context));cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(bytes.subarray(12,-16)),cipher.final()]);
 }
 async function init(){
  if(!enabled)return;
  await pool.query(['CREATE TABLE IF NOT EXISTS sevis_intake_invites (',
   'id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,client_email TEXT NOT NULL,created_by TEXT NOT NULL,',
   'created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),expires_at TIMESTAMPTZ NOT NULL,',
   'used_at TIMESTAMPTZ,revoked_at TIMESTAMPTZ)'].join(' '));
  await pool.query(['CREATE TABLE IF NOT EXISTS sevis_intake_submissions (',
   'id TEXT PRIMARY KEY,invite_id TEXT NOT NULL UNIQUE REFERENCES sevis_intake_invites(id),',
   'sealed_details BYTEA NOT NULL,i20_cipher BYTEA NOT NULL,passport_cipher BYTEA NOT NULL,',
   'passport_type TEXT NOT NULL,i20_size INTEGER NOT NULL,passport_size INTEGER NOT NULL,',
   'submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW())'].join(' '));
  await pool.query('CREATE INDEX IF NOT EXISTS sevis_intake_date ON sevis_intake_submissions(submitted_at)');
  await purge();
 }
 async function purge(){
  if(!enabled)return;
  await pool.query("DELETE FROM sevis_intake_submissions WHERE submitted_at<NOW()-INTERVAL '30 days'");
  await pool.query("DELETE FROM sevis_intake_invites i WHERE i.created_at<NOW()-INTERVAL '90 days' AND NOT EXISTS(SELECT 1 FROM sevis_intake_submissions s WHERE s.invite_id=i.id)");
 }
 async function createInvite({clientEmail,ownerId}){
  guard();const normalized=email(clientEmail);
  if(!EMAIL.test(normalized)||!ownerId)throw err(400,'Enter a valid student email.');
  await purge();
  const n=Number((await pool.query('SELECT COUNT(*)::int AS n FROM sevis_intake_invites WHERE expires_at>NOW() AND used_at IS NULL AND revoked_at IS NULL')).rows[0].n);
  if(n>=MAX_CASES)throw err(429,'The secure intake queue is full. Please contact support.');
  const token=crypto.randomBytes(32).toString('hex'),id='sevis_'+crypto.randomBytes(16).toString('hex');
  const row=(await pool.query("INSERT INTO sevis_intake_invites(id,token_hash,client_email,created_by,expires_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL '7 days') RETURNING expires_at",[id,digest(token),normalized,ownerId])).rows[0];
  return {id,token,expiresAt:row.expires_at,email:normalized};
 }
 async function check(token){
  guard();if(typeof token!=='string'||!TOKEN.test(token))throw err(404,'This secure link has expired or is invalid.');
  const row=(await pool.query('SELECT client_email,expires_at FROM sevis_intake_invites WHERE token_hash=$1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at>NOW()',[digest(token)])).rows[0];
  if(!row)throw err(404,'This secure link has expired, was used, or is invalid.');
  return {valid:true,email:row.client_email,expiresAt:row.expires_at,maxI20Bytes:MAX_I20,maxPassportBytes:MAX_PASSPORT};
 }
 async function submit(body){
  guard();const token=body?.token;
  if(typeof token!=='string'||!TOKEN.test(token))throw err(404,'This secure link has expired or is invalid.');
  const c=await pool.connect();
  try{
   await c.query('BEGIN');
   const invite=(await c.query('SELECT id,client_email FROM sevis_intake_invites WHERE token_hash=$1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at>NOW() FOR UPDATE',[digest(token)])).rows[0];
   if(!invite)throw err(404,'This secure link has expired, was used, or is invalid.');
   const existing=Number((await c.query('SELECT COUNT(*)::int AS n FROM sevis_intake_submissions')).rows[0].n);
   if(existing>=MAX_STORED)throw err(503,'Secure document storage is temporarily full. Please contact VisaAtlas Support.');
   const details=validateDetails(body,invite.client_email);
   const i20=decodeFile(body.i20,'i20'),passport=decodeFile(body.passport,'passport');
   const id='sevis_'+crypto.randomBytes(16).toString('hex');
   await c.query('INSERT INTO sevis_intake_submissions(id,invite_id,sealed_details,i20_cipher,passport_cipher,passport_type,i20_size,passport_size) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [id,invite.id,seal(details,id+':details'),seal(i20,id+':i20'),seal(passport,id+':passport'),
     body.passport.type,i20.length,passport.length]);
   await c.query('UPDATE sevis_intake_invites SET used_at=NOW() WHERE id=$1',[invite.id]);
   await c.query('COMMIT');return {received:true,caseReference:id};
  }catch(e){try{await c.query('ROLLBACK');}catch{}throw e;}finally{c.release();}
 }
 async function ownerList(){
  guard();await purge();
  const rows=(await pool.query(['SELECT i.id,i.client_email,i.created_at,i.expires_at,i.used_at,i.revoked_at,',
   's.id AS submission_id,s.submitted_at,s.i20_size,s.passport_size,s.passport_type FROM sevis_intake_invites i',
   'LEFT JOIN sevis_intake_submissions s ON s.invite_id=i.id ORDER BY i.created_at DESC LIMIT 100'].join(' '))).rows;
  return rows.map(r=>({inviteId:r.id,email:r.client_email,createdAt:r.created_at,expiresAt:r.expires_at,
   usedAt:r.used_at,revokedAt:r.revoked_at,caseId:r.submission_id,submittedAt:r.submitted_at,
   i20Size:r.i20_size,passportSize:r.passport_size,passportType:r.passport_type}));
 }
 async function ownerDetails(caseId){
  guard();if(!ID.test(caseId||''))throw err(400,'Invalid case reference.');
  const row=(await pool.query('SELECT sealed_details FROM sevis_intake_submissions WHERE id=$1',[caseId])).rows[0];
  if(!row)throw err(404,'Case not found or documents have expired.');
  return JSON.parse(unseal(row.sealed_details,caseId+':details').toString('utf8'));
 }
 async function ownerFile(caseId,which){
  guard();if(!ID.test(caseId||'')||!['i20','passport'].includes(which))throw err(400,'Invalid document request.');
  const row=(await pool.query('SELECT i20_cipher,passport_cipher,passport_type FROM sevis_intake_submissions WHERE id=$1',[caseId])).rows[0];
  if(!row)throw err(404,'Document not found or has expired.');
  const content=unseal(row[which==='i20'?'i20_cipher':'passport_cipher'],caseId+':'+which);
  const type=which==='i20'?'application/pdf':row.passport_type,ext=which==='i20'?'pdf':type==='image/png'?'png':'jpg';
  return {content,type,filename:'VisaAtlas-'+which+'-'+caseId+'.'+ext};
 }
 async function ownerDelete(caseId){
  guard();if(!ID.test(caseId||''))throw err(400,'Invalid case reference.');
  const result=await pool.query('DELETE FROM sevis_intake_submissions WHERE id=$1 RETURNING id',[caseId]);
  if(!result.rows.length)throw err(404,'Case not found.');
  return {deleted:true};
 }
 async function ownerRevoke(inviteId){
  guard();if(!ID.test(inviteId||''))throw err(400,'Invalid invitation.');
  const row=(await pool.query('UPDATE sevis_intake_invites SET revoked_at=NOW() WHERE id=$1 AND used_at IS NULL AND revoked_at IS NULL RETURNING id',[inviteId])).rows[0];
  if(!row)throw err(409,'Invitation already used or revoked.');
  return {revoked:true};
 }
 return {enabled,origin,checkOrigin,init,purge,createInvite,check,submit,ownerList,ownerDetails,ownerFile,ownerDelete,ownerRevoke};
}
module.exports={createSevisIntake,validateDetails,decodeFile};
