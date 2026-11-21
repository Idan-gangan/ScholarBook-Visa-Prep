'use strict';
const {createHmac}=require('node:crypto');
const fail=(status,message)=>Object.assign(new Error(message),{status,publicMessage:message});
// Trial access is separate from verified payments and purchased allowances.
// Only Gmail has universally known dot/plus alias semantics; do not
// assume other mail providers treat addresses as interchangeable.
function trialEmailIdentity(email,secret){
  if(typeof email!=='string'||!secret)return null;
  const parts=email.trim().toLowerCase().split('@');
  if(parts.length!==2||!parts[0]||!parts[1])return null;
  let [local,domain]=parts;
  if(domain==='gmail.com'||domain==='googlemail.com'){
    domain='gmail.com';
    local=local.split('+')[0].replace(/\./g,'');
  }
  return createHmac('sha256',secret).update(local+'@'+domain).digest('hex');
}
function createMockTrial(pool,{enabled=false,secret=''}={}){
  async function init(){
    if(!enabled)return;
    await pool.query(`CREATE TABLE IF NOT EXISTS mock_trial_accounts (
      user_id TEXT PRIMARY KEY,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await pool.query('ALTER TABLE mock_trial_accounts ADD COLUMN IF NOT EXISTS identity_hash TEXT');
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS mock_trial_identity_unique ON mock_trial_accounts(identity_hash) WHERE identity_hash IS NOT NULL');
    await pool.query(`CREATE TABLE IF NOT EXISTS mock_trial_usage (
      token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES mock_trial_accounts(user_id),
      state TEXT NOT NULL CHECK(state IN ('reserved','consumed','released')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await pool.query('CREATE INDEX IF NOT EXISTS mock_trial_usage_user ON mock_trial_usage(user_id)');
  }
  async function grant(client,userId,email){
    if(!enabled)return;
    const identity=trialEmailIdentity(email,secret);
    // A verified mailbox may qualify for only one active trial. Aliases do not
    // silently receive another allowance. This does not prove unique identity.
    await client.query('INSERT INTO mock_trial_accounts(user_id,identity_hash) VALUES($1,$2) ON CONFLICT DO NOTHING',[userId,identity]);
  }
  async function status(userId){
    if(!enabled)return null;
    const account=(await pool.query('SELECT user_id FROM mock_trial_accounts WHERE user_id=$1',[userId])).rows[0];
    if(!account)return null;
    const used=Number((await pool.query("SELECT COUNT(*)::int AS used FROM mock_trial_usage WHERE user_id=$1 AND state<>'released'",[userId])).rows[0].used);
    return {limit:2,used,remaining:Math.max(0,2-used)};
  }
  async function reserve(client,userId,token,mode){
    if(!enabled||mode!=='mock')throw fail(402,'Choose a paid plan to start this session. The free trial includes mock interviews only.');
    const account=(await client.query('SELECT user_id FROM mock_trial_accounts WHERE user_id=$1 FOR UPDATE',[userId])).rows[0];
    if(!account)throw fail(402,'An active practice plan is required. Open the billing page.');
    const previous=(await client.query('SELECT user_id,state FROM mock_trial_usage WHERE token=$1',[token])).rows[0];
    if(previous){
      if(previous.user_id!==userId||previous.state==='released')throw fail(409,'Practice reservation cannot be reused.');
      return;
    }
    const used=Number((await client.query("SELECT COUNT(*)::int AS used FROM mock_trial_usage WHERE user_id=$1 AND state<>'released'",[userId])).rows[0].used);
    if(used>=2)throw fail(402,'You have used your two free mock interviews. Choose a plan to keep practising.');
    await client.query("INSERT INTO mock_trial_usage(token,user_id,state) VALUES($1,$2,'reserved')",[token,userId]);
  }
  async function commit(userId,token){
    if(!enabled)return false;
    return !!(await pool.query("UPDATE mock_trial_usage SET state='consumed' WHERE user_id=$1 AND token=$2 AND state IN ('reserved','consumed') RETURNING token",[userId,token])).rows.length;
  }
  async function release(userId,token){
    if(enabled)await pool.query("UPDATE mock_trial_usage SET state='released' WHERE user_id=$1 AND token=$2 AND state='reserved'",[userId,token]);
  }
  async function remove(client,userId){
    if(!enabled)return;
    await client.query('DELETE FROM mock_trial_usage WHERE user_id=$1',[userId]);
    await client.query('DELETE FROM mock_trial_accounts WHERE user_id=$1',[userId]);
  }
  return {init,grant,status,reserve,commit,release,remove};
}
module.exports={createMockTrial,trialEmailIdentity};
