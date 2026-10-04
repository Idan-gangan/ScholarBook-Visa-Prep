const crypto=require('node:crypto');
const {hashPassword,validPassword}=require('./passwords');
const MESSAGE='If an account matches that email, we’ll send a password-reset link. Check your inbox and spam folder.';
const INVALID='This reset link is invalid or has expired. Request a new link.';
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const fail=(status,message)=>Object.assign(new Error(message),{status,publicMessage:message});

function createPasswordRecovery(pool,{env=process.env,send=globalThis.fetch,diagnostic=()=>{}}={}){
  let active=0;
  function config(){
    if(!env.RESEND_API_KEY || !env.RESEND_FROM)throw fail(503,'Password recovery is temporarily unavailable. Please try again later.');
    const origin=new URL(env.APP_BASE_URL || 'https://visaatlasprep.com');
    if(origin.protocol!=='https:' || origin.username || origin.password || origin.pathname!=='/' || origin.search || origin.hash)throw fail(503,'Password recovery is temporarily unavailable. Please try again later.');
    return {origin:origin.origin,key:env.RESEND_API_KEY,from:env.RESEND_FROM};
  }
  async function init(){
    await pool.query(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES user_credentials(user_id) ON DELETE CASCADE,
      credential_version INTEGER NOT NULL,expires_at TIMESTAMPTZ NOT NULL
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS password_reset_limits (
      bucket TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires_at TIMESTAMPTZ NOT NULL
    )`);
  }
  // Shared limits survive restarts and serialize across server instances.
  async function reserve(email){
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      for(const [bucket,limit] of [['global',30],['email:'+digest(email),3]]){
        const result=await client.query(`INSERT INTO password_reset_limits(bucket,attempts,expires_at)
          VALUES($1,1,NOW()+INTERVAL '1 hour') ON CONFLICT(bucket) DO UPDATE SET
          attempts=CASE WHEN password_reset_limits.expires_at<=NOW() THEN 1 ELSE password_reset_limits.attempts+1 END,
          expires_at=CASE WHEN password_reset_limits.expires_at<=NOW() THEN NOW()+INTERVAL '1 hour' ELSE password_reset_limits.expires_at END
          WHERE password_reset_limits.expires_at<=NOW() OR password_reset_limits.attempts<$2 RETURNING bucket`,[bucket,limit]);
        if(!result.rowCount){await client.query('ROLLBACK');return false;}
      }
      await client.query('COMMIT');return true;
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  async function issue(email,settings=config()){
    if(!await reserve(email))return;
    await pool.query('DELETE FROM password_reset_tokens WHERE expires_at<=NOW()');
    await pool.query("DELETE FROM password_reset_limits WHERE expires_at<=NOW() AND bucket<>'global'");
    const found=await pool.query(`SELECT c.user_id,c.version FROM app_state s,
      jsonb_array_elements(s.data->'users') u JOIN user_credentials c ON c.user_id=u->>'id'
      WHERE s.id=1 AND lower(trim(u->>'email'))=$1`,[email]);
    // Ambiguous identities must never receive a recovery link.
    if(found.rows.length!==1)return;
    const saved=found.rows[0],token=crypto.randomBytes(32).toString('hex'),tokenHash=digest(token);
    await pool.query(`INSERT INTO password_reset_tokens(token_hash,user_id,credential_version,expires_at)
      VALUES($1,$2,$3,NOW()+INTERVAL '30 minutes')`,[tokenHash,saved.user_id,saved.version]);
    const link=settings.origin+'/password-recovery.html#token='+token;
    try{
      const response=await send('https://api.resend.com/emails',{
        method:'POST',signal:AbortSignal.timeout(10000),
        headers:{Authorization:'Bearer '+settings.key,'Content-Type':'application/json','Idempotency-Key':'reset-'+tokenHash},
        body:JSON.stringify({from:settings.from,to:[email],subject:'Reset your VisaAtlas password',
          text:'Use this link to reset your VisaAtlas password:\n\n'+link+'\n\nThis link expires in 30 minutes and can be used once. If you did not request it, you can ignore this email. Your password has not changed.'})
      });
      if(!response.ok)throw new Error('send failed');
    }catch(error){
      await pool.query('DELETE FROM password_reset_tokens WHERE token_hash=$1',[tokenHash]);
      throw fail(503,'Password recovery is temporarily unavailable. Please try again later.');
    }
  }
  function request(value){
    const email=typeof value==='string'?value.trim().toLowerCase():'';
    if(email.length>160 || !/^\S+@\S+\.\S+$/.test(email))throw fail(400,'Enter a valid email address.');
    const settings=config();
    // Respond before account lookup/provider I/O so the response cannot reveal membership.
    // Bound in-process work; database limits also apply to every instance.
    if(active<5){
      active++;
      setImmediate(()=>{issue(email,settings).catch(()=>diagnostic('PASSWORD_RECOVERY_SEND_FAILED')).finally(()=>active--);});
    }
    return {ok:true,message:MESSAGE};
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
  return {init,request,reset,issue};
}
module.exports={createPasswordRecovery,MESSAGE,INVALID};
