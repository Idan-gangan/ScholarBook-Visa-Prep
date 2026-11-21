'use strict';
const {tablesFor}=require('./billing-tables');
const fail=(status,message)=>Object.assign(new Error(message),{status,publicMessage:message});
function validateAccess(value){
  if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).some(k=>!['days','sessions','mock','learn'].includes(k))||value.days!==30||!Number.isInteger(value.sessions)||value.sessions<1||value.sessions>1000)throw Error('Access requires 30 days and 1–1000 total sessions');
  if(value.mock!==undefined||value.learn!==undefined){
    if(!Number.isInteger(value.mock)||value.mock<1||!Number.isInteger(value.learn)||value.learn<1||value.mock+value.learn!==value.sessions)throw Error('Separate mock and tutor limits must be positive and sum to total sessions');
  }
}
// Live and test allowances use physically separate ledgers.
function createAccess(pool,{enabled=false,users=new Set(),mode='test'}={}){
  const tables=tablesFor(mode);
  const trial=require('./mock-trial').createMockTrial(pool,{enabled:enabled&&mode==='live'});
  const applies=user=>enabled&&typeof user?.id==='string'&&!!user.id&&(mode==='live'||users.has(user.id));
  async function init(){
    await trial.init();
    await pool.query(`CREATE TABLE IF NOT EXISTS ${tables.holds} (
      reference TEXT PRIMARY KEY REFERENCES ${tables.checkouts}(reference),
      reason TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS ${tables.entitlements} (
      reference TEXT PRIMARY KEY REFERENCES ${tables.payments}(reference),user_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,starts_at TIMESTAMPTZ NOT NULL,expires_at TIMESTAMPTZ NOT NULL,
      session_limit INTEGER NOT NULL CHECK(session_limit>0),CHECK(expires_at>starts_at))`);
    await pool.query(`ALTER TABLE ${tables.entitlements} ADD COLUMN IF NOT EXISTS mode_limits JSONB`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ${tables.entitlements}_user ON ${tables.entitlements}(user_id,expires_at)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS ${tables.usage} (
      token TEXT PRIMARY KEY,reference TEXT NOT NULL REFERENCES ${tables.entitlements}(reference),
      user_id TEXT NOT NULL,mode TEXT NOT NULL CHECK(mode IN ('learn','mock')),
      state TEXT NOT NULL CHECK(state IN ('reserved','consumed','released')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ${tables.usage}_reference ON ${tables.usage}(reference)`);
  }
  async function active(userId,client=pool,lock=false){
    return (await client.query(`SELECT * FROM ${tables.entitlements} WHERE user_id=$1
      AND starts_at<=clock_timestamp() AND expires_at>clock_timestamp()
      AND NOT EXISTS (SELECT 1 FROM ${tables.holds} h WHERE h.reference=${tables.entitlements}.reference)
      ORDER BY expires_at DESC LIMIT 1${lock?' FOR UPDATE':''}`,[userId])).rows[0]||null;
  }
  async function grant(client,row,paidAt){
    // Immutable checkout terms, never today's changed plan configuration.
    if(!row.access_snapshot)return;
    validateAccess(row.access_snapshot);
    await client.query(`INSERT INTO ${tables.entitlements}(reference,user_id,plan_id,starts_at,expires_at,session_limit,mode_limits)
      VALUES($1,$2,$3,$4::timestamptz,$4::timestamptz+($5 * INTERVAL '24 hours'),$6,$7)
      ON CONFLICT(reference) DO NOTHING`,[row.reference,row.user_id,row.plan_id,paidAt,row.access_snapshot.days,row.access_snapshot.sessions,row.access_snapshot.mock===undefined?null:JSON.stringify({mock:row.access_snapshot.mock,learn:row.access_snapshot.learn})]);
  }
  async function ensureTrial(user,client=pool){
    // Existing student accounts receive the same one-time allowance as new registrations.
    // The insert never resets reservations or completed sessions.
    if(user.role==='athlete'&&!user.accessSuspended)await trial.grant(client,user.id);
  }
  async function status(user){
    if(!applies(user))return {enforced:false};
    await ensureTrial(user);
    const row=await active(user.id);
    if(!row)return {enforced:true,active:false,remaining:0,trial:await trial.status(user.id)};
    const used=Number((await pool.query(`SELECT COUNT(*)::int AS used FROM ${tables.usage} WHERE reference=$1 AND state <> 'released'`,[row.reference])).rows[0].used);
    let modes;
    if(row.mode_limits){
      const counts=(await pool.query(`SELECT mode,COUNT(*)::int AS used FROM ${tables.usage} WHERE reference=$1 AND state <> 'released' GROUP BY mode`,[row.reference])).rows;
      modes=Object.fromEntries(['mock','learn'].map(mode=>{const used=Number(counts.find(r=>r.mode===mode)?.used||0),limit=row.mode_limits[mode];return [mode,{limit,used,remaining:Math.max(0,limit-used)}];}));
    }
    return {modes,enforced:true,active:true,planId:row.plan_id,startsAt:row.starts_at,expiresAt:row.expires_at,limit:row.session_limit,used,remaining:Math.max(0,row.session_limit-used)};
  }
  async function requireActive(user){
    if(applies(user)&&!await active(user.id))throw fail(402,'An active practice plan is required. Open the billing page.');
  }
  async function reserve(user,token,mode){
    if(!applies(user))return;
    if(!['learn','mock'].includes(mode)||typeof token!=='string'||!/^[a-f0-9]{48}$/.test(token))throw fail(400,'Invalid practice reservation.');
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      await ensureTrial(user,c);
      const row=await active(user.id,c,true);
      if(!row){await trial.reserve(c,user.id,token,mode);await c.query('COMMIT');return;}
      // Row locking serializes the last remaining session across processes.
      const previous=(await c.query(`SELECT user_id,reference,mode,state FROM ${tables.usage} WHERE token=$1`,[token])).rows[0];
      if(previous){
        if(previous.user_id!==user.id||previous.reference!==row.reference||previous.mode!==mode||previous.state==='released')throw fail(409,'Practice reservation cannot be reused.');
      }else{
        const used=Number((await c.query(`SELECT COUNT(*)::int AS used FROM ${tables.usage} WHERE reference=$1 AND state <> 'released'`,[row.reference])).rows[0].used);
        if(used>=row.session_limit)throw fail(402,'You have used all sessions in your plan.');
        if(row.mode_limits){
          const modeUsed=Number((await c.query(`SELECT COUNT(*)::int AS used FROM ${tables.usage} WHERE reference=$1 AND mode=$2 AND state <> 'released'`,[row.reference,mode])).rows[0].used);
          if(modeUsed>=row.mode_limits[mode])throw fail(402,`You have used all ${mode==='mock'?'mock interview':'tutor'} sessions in your plan.`);
        }
        // Check again after any wait for the row lock.
        const stillActive=(await c.query(`SELECT 1 FROM ${tables.entitlements} WHERE reference=$1 AND expires_at>clock_timestamp()`,[row.reference])).rows.length;
        if(!stillActive)throw fail(402,'Your practice plan has expired.');
        await c.query(`INSERT INTO ${tables.usage}(token,reference,user_id,mode,state) VALUES($1,$2,$3,$4,'reserved')`,[token,row.reference,user.id,mode]);
      }
      await c.query('COMMIT');
    }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
  }
  async function commit(user,token){
    if(!applies(user))return;
    const result=await pool.query(`UPDATE ${tables.usage} SET state='consumed',updated_at=NOW()
      WHERE user_id=$1 AND token=$2 AND state IN ('reserved','consumed') RETURNING token`,[user.id,token]);
    if(!result.rows.length&&!await trial.commit(user.id,token))throw fail(409,'Practice reservation unavailable.');
  }
  async function release(user,token){
    if(!applies(user))return;
    await trial.release(user.id,token);
    // Only the server's failed-start cleanup invokes this, after ending the call.
    // A browser ending a successful session never refunds its usage.
    await pool.query(`UPDATE ${tables.usage} SET state='released',updated_at=NOW() WHERE user_id=$1 AND token=$2 AND state='reserved'`,[user.id,token]);
  }
  return {init,active,grant,status,requireActive,reserve,commit,release,applies,grantTrial:trial.grant,removeTrial:trial.remove};
}
module.exports={createAccess,validateAccess};
