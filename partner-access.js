'use strict';
// Owner-granted, non-Paystack sponsored practice. No fake provider transactions.
const {randomBytes}=require('node:crypto');
const PACKAGES=Object.freeze({scholarbook:Object.freeze({days:30,mock:12,learn:8})});
const fail=(status,message)=>Object.assign(new Error(message),{status,publicMessage:message});
const validToken=token=>typeof token==='string'&&/^[a-f0-9]{48}$/.test(token);
function createPartnerAccess(pool,{enabled=false}={}){
  async function init(){
    if(!enabled)return;
    await pool.query(`CREATE TABLE IF NOT EXISTS partner_access_grants (
      id TEXT PRIMARY KEY, partner TEXT NOT NULL CHECK(partner='scholarbook'),
      user_id TEXT NOT NULL, starts_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL, mock_limit INTEGER NOT NULL CHECK(mock_limit>0),
      learn_limit INTEGER NOT NULL CHECK(learn_limit>0),
      invoice_reference TEXT NOT NULL, created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ, revoked_by TEXT,
      CHECK(expires_at>starts_at))`);
    await pool.query('CREATE INDEX IF NOT EXISTS partner_grants_user ON partner_access_grants(user_id,expires_at)');
    await pool.query(`CREATE TABLE IF NOT EXISTS partner_access_usage (
      token TEXT PRIMARY KEY, grant_id TEXT NOT NULL REFERENCES partner_access_grants(id),
      user_id TEXT NOT NULL, mode TEXT NOT NULL CHECK(mode IN ('mock','learn')),
      state TEXT NOT NULL CHECK(state IN ('reserved','consumed','released')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await pool.query('CREATE INDEX IF NOT EXISTS partner_usage_grant ON partner_access_usage(grant_id)');
  }
  async function current(userId,db=pool,lock=false){
    if(!enabled)return null;
    return (await db.query(`SELECT * FROM partner_access_grants
      WHERE user_id=$1 AND starts_at<=clock_timestamp() AND expires_at>clock_timestamp()
      AND revoked_at IS NULL ORDER BY starts_at DESC,id DESC LIMIT 1${lock?' FOR UPDATE':''}`,[userId])).rows[0]||null;
  }
  async function summary(row,db=pool){
    if(!row)return null;
    const counts=(await db.query(`SELECT mode,COUNT(*)::int AS n FROM partner_access_usage
      WHERE grant_id=$1 AND state<>'released' GROUP BY mode`,[row.id])).rows;
    const used=mode=>Number(counts.find(x=>x.mode===mode)?.n||0);
    const mock=used('mock'),learn=used('learn');
    return {enforced:true,active:true,sponsored:true,partner:'Scholarbook',planId:'scholarbook',
      startsAt:row.starts_at,expiresAt:row.expires_at,limit:row.mock_limit+row.learn_limit,
      used:mock+learn,remaining:Math.max(0,row.mock_limit+row.learn_limit-mock-learn),
      modes:{mock:{limit:row.mock_limit,used:mock,remaining:Math.max(0,row.mock_limit-mock)},
        learn:{limit:row.learn_limit,used:learn,remaining:Math.max(0,row.learn_limit-learn)}}};
  }
  async function status(user){
    if(!enabled||!user?.id||user.role!=='athlete'||user.accessSuspended)return null;
    return summary(await current(user.id));
  }
  async function list(){
    if(!enabled)return [];
    const result=await pool.query(`SELECT g.id,g.partner,g.user_id,g.starts_at,g.expires_at,g.mock_limit,g.learn_limit,
      g.invoice_reference,g.created_at,g.created_by,g.revoked_at,g.revoked_by,
      COUNT(u.token) FILTER(WHERE u.mode='mock' AND u.state<>'released')::int AS mock_used,
      COUNT(u.token) FILTER(WHERE u.mode='learn' AND u.state<>'released')::int AS learn_used
      FROM partner_access_grants g LEFT JOIN partner_access_usage u ON u.grant_id=g.id
      GROUP BY g.id ORDER BY g.created_at DESC LIMIT 200`);
    return result.rows;
  }
  async function grant({user,actorId,invoiceReference}){
    if(!enabled)throw fail(409,'Partner access is disabled.');
    if(!user?.id||user.role!=='athlete'||user.accessSuspended||!user.emailVerifiedAt)
      throw fail(400,'Select an active, email-verified Student account.');
    if(typeof actorId!=='string'||!actorId)throw fail(403,'Owner authorization required.');
    if(typeof invoiceReference!=='string'||!/^[A-Za-z0-9][A-Za-z0-9 _./-]{2,79}$/.test(invoiceReference))
      throw fail(400,'Enter an internal invoice or agreement reference (3–80 characters).');
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['partner:'+user.id]);
      if(await current(user.id,c))throw fail(409,'This student already has an active sponsored package.');
      const pkg=PACKAGES.scholarbook,id='partner_'+randomBytes(24).toString('hex');
      const result=await c.query(`INSERT INTO partner_access_grants
        (id,partner,user_id,starts_at,expires_at,mock_limit,learn_limit,invoice_reference,created_by)
        VALUES($1,'scholarbook',$2,NOW(),NOW()+INTERVAL '30 days',$3,$4,$5,$6)
        RETURNING id,user_id,starts_at,expires_at,mock_limit,learn_limit`,
        [id,user.id,pkg.mock,pkg.learn,invoiceReference.trim(),actorId]);
      await c.query('COMMIT');
      return result.rows[0];
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
  async function revoke({grantId,actorId}){
    if(!enabled)throw fail(409,'Partner access is disabled.');
    if(typeof grantId!=='string'||!/^partner_[a-f0-9]{48}$/.test(grantId))
      throw fail(400,'Invalid sponsored package.');
    if(typeof actorId!=='string'||!actorId)throw fail(403,'Owner authorization required.');
    const result=await pool.query(`UPDATE partner_access_grants
      SET revoked_at=NOW(),revoked_by=$2 WHERE id=$1 AND revoked_at IS NULL
      RETURNING id,user_id,revoked_at`,[grantId,actorId]);
    if(!result.rows.length)throw fail(409,'Sponsored package is missing or already revoked.');
    return result.rows[0];
  }
  async function reserve(user,token,mode){
    if(!enabled||user?.role!=='athlete'||user.accessSuspended)return false;
    if(!validToken(token)||!['mock','learn'].includes(mode))throw fail(400,'Invalid practice reservation.');
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      const row=await current(user.id,c,true);
      if(!row){await c.query('COMMIT');return false;}
      const old=(await c.query('SELECT user_id,grant_id,mode,state FROM partner_access_usage WHERE token=$1',[token])).rows[0];
      if(old){
        if(old.user_id!==user.id||old.grant_id!==row.id||old.mode!==mode||old.state==='released')throw fail(409,'Practice reservation cannot be reused.');
      }else{
        const used=Number((await c.query(`SELECT COUNT(*)::int AS n FROM partner_access_usage
          WHERE grant_id=$1 AND mode=$2 AND state<>'released'`,[row.id,mode])).rows[0].n);
        if(used>=row[mode==='mock'?'mock_limit':'learn_limit'])
          throw fail(402,mode==='mock'?'Scholarbook mock interviews are exhausted.':'Scholarbook tutor sessions are exhausted.');
        const active=(await c.query(`SELECT 1 FROM partner_access_grants
          WHERE id=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp()`,[row.id])).rows.length;
        if(!active)throw fail(402,'Scholarbook access has expired.');
        await c.query(`INSERT INTO partner_access_usage(token,grant_id,user_id,mode,state)
          VALUES($1,$2,$3,$4,'reserved')`,[token,row.id,user.id,mode]);
      }
      await c.query('COMMIT');return true;
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
  async function commit(user,token){
    if(!enabled||!validToken(token))return false;
    const result=await pool.query(`UPDATE partner_access_usage SET state='consumed',updated_at=NOW()
      WHERE user_id=$1 AND token=$2 AND state IN ('reserved','consumed') RETURNING token`,[user.id,token]);
    if(result.rows.length)return true;
    const old=(await pool.query('SELECT 1 FROM partner_access_usage WHERE token=$1 AND user_id=$2',[token,user.id])).rows.length;
    if(old)throw fail(409,'Partner reservation already released.');
    return false;
  }
  async function release(user,token){
    if(!enabled||!validToken(token))return false;
    const result=await pool.query(`UPDATE partner_access_usage SET state='released',updated_at=NOW()
      WHERE user_id=$1 AND token=$2 AND state='reserved' RETURNING token`,[user.id,token]);
    return !!result.rows.length;
  }
  async function removeUser(userId,client=pool){
    if(!enabled)return;
    // Sponsored records are not payment-provider receipts; delete personal grant
    // and usage rows during verified account deletion, inside the same transaction.
    await client.query('DELETE FROM partner_access_usage WHERE user_id=$1',[userId]);
    await client.query('DELETE FROM partner_access_grants WHERE user_id=$1',[userId]);
  }
  return {init,status,list,grant,revoke,reserve,commit,release,removeUser};
}
module.exports={createPartnerAccess,PACKAGES};
