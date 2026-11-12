'use strict';
const fail=(status,message)=>Object.assign(new Error(message),{status,publicMessage:message});
function validateAccess(value){
  if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).some(k=>!['days','sessions'].includes(k))||value.days!==30||!Number.isInteger(value.sessions)||value.sessions<1||value.sessions>1000)throw Error('Access requires 30 days and 1–1000 total sessions');
}
// Isolated sandbox ledger. No production entitlement can be created here.
function createAccess(pool,{enabled=false,users=new Set()}={}){
  const applies=user=>enabled&&users.has(user?.id);
  async function init(){
    await pool.query(`CREATE TABLE IF NOT EXISTS billing_test_entitlements (
      reference TEXT PRIMARY KEY REFERENCES paystack_test_payments(reference),user_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,starts_at TIMESTAMPTZ NOT NULL,expires_at TIMESTAMPTZ NOT NULL,
      session_limit INTEGER NOT NULL CHECK(session_limit>0),CHECK(expires_at>starts_at))`);
    await pool.query('CREATE INDEX IF NOT EXISTS billing_test_access_user ON billing_test_entitlements(user_id,expires_at)');
    await pool.query(`CREATE TABLE IF NOT EXISTS billing_test_usage (
      token TEXT PRIMARY KEY,reference TEXT NOT NULL REFERENCES billing_test_entitlements(reference),
      user_id TEXT NOT NULL,mode TEXT NOT NULL CHECK(mode IN ('learn','mock')),
      state TEXT NOT NULL CHECK(state IN ('reserved','consumed','released')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await pool.query('CREATE INDEX IF NOT EXISTS billing_test_usage_reference ON billing_test_usage(reference)');
  }
  async function active(userId,client=pool,lock=false){
    return (await client.query(`SELECT * FROM billing_test_entitlements WHERE user_id=$1
      AND starts_at<=clock_timestamp() AND expires_at>clock_timestamp()
      ORDER BY expires_at DESC LIMIT 1${lock?' FOR UPDATE':''}`,[userId])).rows[0]||null;
  }
  async function grant(client,row,paidAt){
    // Immutable checkout terms, never today's changed plan configuration.
    if(!row.access_snapshot)return;
    validateAccess(row.access_snapshot);
    await client.query(`INSERT INTO billing_test_entitlements(reference,user_id,plan_id,starts_at,expires_at,session_limit)
      VALUES($1,$2,$3,$4::timestamptz,$4::timestamptz+($5 * INTERVAL '24 hours'),$6)
      ON CONFLICT(reference) DO NOTHING`,[row.reference,row.user_id,row.plan_id,paidAt,row.access_snapshot.days,row.access_snapshot.sessions]);
  }
  async function status(user){
    if(!applies(user))return {enforced:false};
    const row=await active(user.id);
    if(!row)return {enforced:true,active:false,remaining:0};
    const used=Number((await pool.query("SELECT COUNT(*)::int AS used FROM billing_test_usage WHERE reference=$1 AND state <> 'released'",[row.reference])).rows[0].used);
    return {enforced:true,active:true,planId:row.plan_id,startsAt:row.starts_at,expiresAt:row.expires_at,limit:row.session_limit,used,remaining:Math.max(0,row.session_limit-used)};
  }
  async function requireActive(user){
    if(applies(user)&&!await active(user.id))throw fail(402,'An active test plan is required. Open the billing test page.');
  }
  async function reserve(user,token,mode){
    if(!applies(user))return;
    if(!['learn','mock'].includes(mode)||typeof token!=='string'||!/^[a-f0-9]{48}$/.test(token))throw fail(400,'Invalid practice reservation.');
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      const row=await active(user.id,c,true);
      if(!row)throw fail(402,'An active test plan is required. Open the billing test page.');
      // Row locking serializes the last remaining session across processes.
      const previous=(await c.query('SELECT user_id,reference,mode,state FROM billing_test_usage WHERE token=$1',[token])).rows[0];
      if(previous){
        if(previous.user_id!==user.id||previous.reference!==row.reference||previous.mode!==mode||previous.state==='released')throw fail(409,'Practice reservation cannot be reused.');
      }else{
        const used=Number((await c.query("SELECT COUNT(*)::int AS used FROM billing_test_usage WHERE reference=$1 AND state <> 'released'",[row.reference])).rows[0].used);
        if(used>=row.session_limit)throw fail(402,'You have used all sessions in this test plan.');
        // Check again after any wait for the row lock.
        const stillActive=(await c.query('SELECT 1 FROM billing_test_entitlements WHERE reference=$1 AND expires_at>clock_timestamp()',[row.reference])).rows.length;
        if(!stillActive)throw fail(402,'Your test plan has expired.');
        await c.query("INSERT INTO billing_test_usage(token,reference,user_id,mode,state) VALUES($1,$2,$3,$4,'reserved')",[token,row.reference,user.id,mode]);
      }
      await c.query('COMMIT');
    }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
  }
  async function commit(user,token){
    if(!applies(user))return;
    const result=await pool.query(`UPDATE billing_test_usage SET state='consumed',updated_at=NOW()
      WHERE user_id=$1 AND token=$2 AND state IN ('reserved','consumed') RETURNING token`,[user.id,token]);
    if(!result.rows.length)throw fail(409,'Practice reservation unavailable.');
  }
  async function release(user,token){
    if(!applies(user))return;
    // Only the server's failed-start cleanup invokes this, after ending the call.
    // A browser ending a successful session never refunds its usage.
    await pool.query("UPDATE billing_test_usage SET state='released',updated_at=NOW() WHERE user_id=$1 AND token=$2 AND state='reserved'",[user.id,token]);
  }
  return {init,active,grant,status,requireActive,reserve,commit,release,applies};
}
module.exports={createAccess,validateAccess};
