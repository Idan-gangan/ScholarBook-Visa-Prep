const crypto=require('node:crypto');
const {hashPassword,validPassword}=require('./passwords');
const {createRecoveryQueue,MESSAGE}=require('./password-recovery-queue');
const INVALID='This reset link is invalid or has expired. Request a new link.';
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const fail=(status,message)=>Object.assign(new Error(message),{status,publicMessage:message});
function createPasswordRecovery(pool,{env=process.env,send=globalThis.fetch,diagnostic=()=>{}}={}){
  function config(){
    const unavailable=()=>fail(503,'Password recovery is temporarily unavailable. Please try again later.');
    if(!env.RESEND_API_KEY || !env.RESEND_FROM)throw unavailable();
    let origin;try{origin=new URL(env.APP_BASE_URL || 'https://visaatlasprep.com');}catch{throw unavailable();}
    if(origin.protocol!=='https:' || origin.username || origin.password || origin.pathname!=='/' || origin.search || origin.hash)throw unavailable();
    if(env.PASSWORD_RESET_SECRET && env.PASSWORD_RESET_SECRET.length<32)throw unavailable();
    return {origin:origin.origin,key:env.RESEND_API_KEY,from:env.RESEND_FROM,secret:env.PASSWORD_RESET_SECRET || env.RESEND_API_KEY};
  }
  const queue=createRecoveryQueue(pool,{config,send,diagnostic});
  async function init(){
    await pool.query(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES user_credentials(user_id) ON DELETE CASCADE,
      credential_version INTEGER NOT NULL,expires_at TIMESTAMPTZ NOT NULL
    )`);
    await queue.init();
  }
  async function reset(body){
    if(!body || typeof body.token!=='string' || !/^[a-f0-9]{64}$/.test(body.token))throw fail(400,INVALID);
    if(!validPassword(body.newPassword))throw fail(400,'Use a password of 15–128 characters with no line breaks.');
    if(body.newPassword!==body.confirmPassword)throw fail(400,'New passwords do not match.');
    const tokenHash=digest(body.token);
    const valid=await pool.query(`SELECT t.user_id FROM password_reset_tokens t JOIN user_credentials c ON c.user_id=t.user_id
      WHERE t.token_hash=$1 AND t.expires_at>NOW() AND c.version=t.credential_version`,[tokenHash]);
    if(!valid.rowCount)throw fail(400,INVALID);
    const hash=await hashPassword(body.newPassword);
    // Credential version is checked again atomically after hashing. Concurrent uses,
    // other reset links and password changes can only win once for this version.
    const changed=await pool.query(`UPDATE user_credentials c SET password_hash=$2,version=c.version+1
      FROM password_reset_tokens t WHERE t.token_hash=$1 AND t.user_id=c.user_id
      AND t.expires_at>NOW() AND c.version=t.credential_version RETURNING c.user_id`,[tokenHash,hash]);
    if(!changed.rowCount)throw fail(400,INVALID);
    return changed.rows[0].user_id;
  }
  return {init,request:queue.request,reset,processOne:queue.processOne,start:queue.start,stop:queue.stop};
}
module.exports={createPasswordRecovery,MESSAGE,INVALID};
