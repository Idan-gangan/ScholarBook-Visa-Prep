const crypto=require('node:crypto');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const unavailable=()=>Object.assign(new Error('Email delivery is temporarily unavailable. Please try again shortly.'),{status:503,publicMessage:'Email delivery is temporarily unavailable. Please try again shortly.'});
const MESSAGE='If an account matches that email, your reset email is queued. Check your inbox and spam folder. Allow a few minutes during busy periods.';

function createRecoveryQueue(pool,{config,send,diagnostic}){
  let timer=null,busy=false,lastCleanup=0;
  async function init(){
    // New tables deliberately retire the previous hour-long request windows.
    await pool.query(`CREATE TABLE IF NOT EXISTS password_reset_cooldowns (
      email_key TEXT PRIMARY KEY,available_at TIMESTAMPTZ NOT NULL
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS password_reset_queue (
      id TEXT PRIMARY KEY,email_key TEXT UNIQUE NOT NULL,email TEXT NOT NULL,user_id TEXT,credential_version INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      attempts INTEGER NOT NULL DEFAULT 0,prepared JSONB
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS password_reset_dispatch (
      id INTEGER PRIMARY KEY,next_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),blocked_until TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await pool.query('INSERT INTO password_reset_dispatch(id) VALUES(1) ON CONFLICT DO NOTHING');
    await pool.query('CREATE INDEX IF NOT EXISTS password_reset_queue_ready ON password_reset_queue(available_at,created_at)');
  }
  async function request(value){
    const email=typeof value==='string'?value.trim().toLowerCase():'';
    if(email.length>160 || !/^\S+@\S+\.\S+$/.test(email))throw Object.assign(new Error('Enter a valid email address.'),{status:400,publicMessage:'Enter a valid email address.'});
    config();
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      // Short admission transaction bounds backlog atomically across instances.
      await client.query('SELECT pg_advisory_xact_lock(172343992,1)');
      const blocked=await client.query('SELECT 1 FROM password_reset_dispatch WHERE id=1 AND blocked_until>NOW()');
      if(blocked.rowCount)throw unavailable();
      const key=digest(email);
      const allowed=await client.query(`INSERT INTO password_reset_cooldowns(email_key,available_at)
        VALUES($1,NOW()+INTERVAL '60 seconds') ON CONFLICT(email_key) DO UPDATE SET available_at=EXCLUDED.available_at
        WHERE password_reset_cooldowns.available_at<=NOW() RETURNING email_key`,[key]);
      if(!allowed.rowCount){
        const wait=await client.query(`SELECT GREATEST(1,CEIL(EXTRACT(EPOCH FROM (available_at-NOW()))))::integer AS seconds
          FROM password_reset_cooldowns WHERE email_key=$1`,[key]);
        const seconds=wait.rows[0].seconds;
        throw Object.assign(new Error('cooldown'),{status:429,publicMessage:`Please wait ${seconds} seconds before requesting another reset link.`,retryAfter:seconds});
      }
      const pending=await client.query('SELECT 1 FROM password_reset_queue WHERE email_key=$1',[key]);
      if(!pending.rowCount){
        const count=await client.query('SELECT COUNT(*)::integer AS total FROM password_reset_queue');
        if(count.rows[0].total>=1000)throw Object.assign(unavailable(),{publicMessage:'Email delivery is busy. Please try again in a few minutes.'});
        const accounts=await client.query(`SELECT c.user_id,c.version FROM app_state s,
          jsonb_array_elements(s.data->'users') u JOIN user_credentials c ON c.user_id=u->>'id'
          WHERE s.id=1 AND lower(trim(u->>'email'))=$1`,[email]);
        const account=accounts.rows.length===1?accounts.rows[0]:null;
        // Unknown/ambiguous addresses follow the same durable admission path.
        // Bind known accounts now so later password changes cancel pending work.
        await client.query('INSERT INTO password_reset_queue(id,email_key,email,user_id,credential_version) VALUES($1,$2,$3,$4,$5)',[crypto.randomUUID(),key,email,account?.user_id??null,account?.version??null]);
      }
      await client.query('COMMIT');
      return {ok:true,message:MESSAGE,retryAfter:60};
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  function tokenFor(id,settings){
    // Domain-separated HMAC permits identical retries without storing a reset
    // token or email body in plaintext. Rotating this secret cancels unsent jobs.
    return crypto.createHmac('sha256',settings.secret).update('VisaAtlas/password-reset/v1:'+id).digest('hex');
  }
  async function processOne(){
    if(busy)return false;
    busy=true;
    let client,locked=false;
    try{
      const settings=config();
      client=await pool.connect();
      // Session lock spans provider I/O. It releases automatically on a crashed
      // process/connection, leaving the durable job available for retry.
      locked=(await client.query('SELECT pg_try_advisory_lock(172343991,1) AS locked')).rows[0].locked;
      if(!locked)return false;
      if(Date.now()-lastCleanup>60000){
        const expired=await client.query("DELETE FROM password_reset_queue WHERE created_at<NOW()-INTERVAL '30 minutes' OR attempts>=5");
        if(expired.rowCount)diagnostic('PASSWORD_RECOVERY_JOB_EXPIRED');
        await client.query('DELETE FROM password_reset_tokens WHERE expires_at<=NOW()');
        await client.query("DELETE FROM password_reset_cooldowns WHERE available_at<NOW()-INTERVAL '1 day'");
        lastCleanup=Date.now();
      }
      const ready=await client.query('SELECT 1 FROM password_reset_dispatch WHERE id=1 AND next_at<=NOW() AND blocked_until<=NOW()');
      if(!ready.rowCount)return false;
      let job=(await client.query("SELECT * FROM password_reset_queue WHERE available_at<=NOW() AND attempts<5 AND created_at>=NOW()-INTERVAL '30 minutes' ORDER BY created_at,id LIMIT 1")).rows[0];
      if(!job)return false;
      const token=tokenFor(job.id,settings);
      if(!job.prepared){
        const found=await client.query(`SELECT c.user_id,c.version FROM app_state s,
          jsonb_array_elements(s.data->'users') u JOIN user_credentials c ON c.user_id=u->>'id'
          WHERE s.id=1 AND lower(trim(u->>'email'))=$1 AND c.user_id=$2 AND c.version=$3`,[job.email,job.user_id,job.credential_version]);
        if(found.rows.length!==1){
          diagnostic('PASSWORD_RECOVERY_ACCOUNT_UNMATCHED');
          await client.query('DELETE FROM password_reset_queue WHERE id=$1',[job.id]);return true;
        }
        const saved=found.rows[0];
        job.prepared={userId:saved.user_id,version:saved.version,tokenHash:digest(token),from:settings.from,origin:settings.origin};
        await client.query('BEGIN');
        try{
          await client.query(`INSERT INTO password_reset_tokens(token_hash,user_id,credential_version,expires_at)
            VALUES($1,$2,$3,NOW()+INTERVAL '30 minutes')`,[job.prepared.tokenHash,saved.user_id,saved.version]);
          await client.query('UPDATE password_reset_queue SET prepared=$2 WHERE id=$1',[job.id,job.prepared]);
          await client.query('COMMIT');
        }catch(error){await client.query('ROLLBACK');throw error;}
      }
      const p=job.prepared;
      const valid=await client.query(`SELECT 1 FROM password_reset_tokens t JOIN user_credentials c ON c.user_id=t.user_id
        WHERE t.token_hash=$1 AND t.expires_at>NOW() AND t.credential_version=c.version`,[p.tokenHash]);
      if(p.tokenHash!==digest(token) || !valid.rowCount){
        diagnostic('PASSWORD_RECOVERY_STALE_JOB');
        await client.query('DELETE FROM password_reset_queue WHERE id=$1',[job.id]);return true;
      }
      await client.query("UPDATE password_reset_queue SET attempts=attempts+1,available_at=NOW()+INTERVAL '30 seconds' WHERE id=$1",[job.id]);
      await client.query("UPDATE password_reset_dispatch SET next_at=clock_timestamp()+INTERVAL '1 second' WHERE id=1");
      const link=p.origin+'/password-recovery.html#token='+token;
      let response;
      try{
        response=await send('https://api.resend.com/emails',{
          method:'POST',signal:AbortSignal.timeout(10000),
          headers:{Authorization:'Bearer '+settings.key,'Content-Type':'application/json','Idempotency-Key':'reset-'+job.id},
          body:JSON.stringify({from:p.from,to:[job.email],subject:'Reset your VisaAtlas password',
            text:'Use this link to reset your VisaAtlas password:\n\n'+link+'\n\nThis link expires in 30 minutes and can be used once. If you did not request it, you can ignore this email. Your password has not changed.'})
        });
      }catch(error){diagnostic(error.name==='TimeoutError'?'PASSWORD_RECOVERY_PROVIDER_TIMEOUT':'PASSWORD_RECOVERY_PROVIDER_NETWORK');}
      if(response?.ok){
        diagnostic('PASSWORD_RECOVERY_PROVIDER_ACCEPTED');
        await client.query('DELETE FROM password_reset_queue WHERE id=$1',[job.id]);return true;
      }
      const status=response?.status;
      if(response)diagnostic('PASSWORD_RECOVERY_PROVIDER_HTTP_'+([400,401,403,404,409,422,429,500,502,503,504].includes(status)?status:'OTHER'));
      let quota=false;
      if(status===429){
        // Read only an allowlisted error name; never log provider bodies.
        try{const body=await response.json();quota=['daily_quota_exceeded','monthly_quota_exceeded'].includes(body.name);}catch{}
      }
      if(quota || status===401 || status===403){
        diagnostic(quota?'PASSWORD_RECOVERY_PROVIDER_QUOTA':'PASSWORD_RECOVERY_PROVIDER_CONFIGURATION');
        await client.query("UPDATE password_reset_dispatch SET blocked_until=NOW()+INTERVAL '5 minutes' WHERE id=1");
      }
      const retryable=!response || status===429 || status===409 || status>=500 || status===401 || status===403;
      if(!retryable || job.attempts+1>=5){
        diagnostic('PASSWORD_RECOVERY_JOB_FAILED');
        await client.query('DELETE FROM password_reset_queue WHERE id=$1',[job.id]);
      }else{
        const header=response?.headers?.get('retry-after');
        const delay=header && /^\d+$/.test(header)?Number(header):30*2**job.attempts;
        const seconds=Math.min(1800,Math.max(30,delay));
        await client.query("UPDATE password_reset_queue SET available_at=NOW()+$2*INTERVAL '1 second' WHERE id=$1",[job.id,seconds]);
        if(status===429)await client.query("UPDATE password_reset_dispatch SET next_at=NOW()+$1*INTERVAL '1 second' WHERE id=1",[seconds]);
      }
      return true;
    }finally{
      if(client){
        let broken=false;
        if(locked){try{await client.query('SELECT pg_advisory_unlock(172343991,1)');}catch{broken=true;}}
        client.release(broken);
      }
      busy=false;
    }
  }
  function start(){
    if(timer)return;
    const tick=()=>processOne().catch(()=>diagnostic('PASSWORD_RECOVERY_WORKER_FAILED'));
    timer=setInterval(tick,250);timer.unref();void tick();
  }
  function stop(){if(timer)clearInterval(timer);timer=null;}
  return {init,request,processOne,start,stop};
}
module.exports={createRecoveryQueue,MESSAGE};
