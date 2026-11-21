'use strict';
const {randomBytes,createHmac,timingSafeEqual}=require('node:crypto');
const {createAccess,validateAccess}=require('./billing-access');
const {tablesFor}=require('./billing-tables');
const fail=(status,message)=>Object.assign(new Error(message),{status,publicMessage:message});
function configuration(env){
  if(!env.BILLING_MODE||env.BILLING_MODE==='disabled')return null;
  const mode=env.BILLING_MODE;
  if(!['test','live'].includes(mode)||!new RegExp('^sk_'+mode+'_[A-Za-z0-9]+$').test(env.PAYSTACK_SECRET_KEY||''))throw Error('Paystack billing mode and secret key must match');
  if(mode==='live'&&env.BILLING_LIVE_USD_READY!=='confirmed')throw Error('Confirm Paystack USD activation before enabling live billing');
  const url=new URL(env.BILLING_ORIGIN);
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('BILLING_ORIGIN must be an HTTPS origin');
  const users=new Set((env[mode==='live'?'BILLING_LIVE_USER_IDS':'BILLING_TEST_USER_IDS']||'').split(',').map(s=>s.trim()).filter(Boolean));
  if(mode==='test'&&!users.size)throw Error('Explicit test accounts required');
  const plans=mode==='live'?{starter:{amount:2900,currency:'USD',access:{days:30,sessions:12,mock:6,learn:6}},standard:{amount:4900,currency:'USD',access:{days:30,sessions:20,mock:12,learn:8}}}:JSON.parse(env.PAYSTACK_TEST_PLANS||'{}');
  if(!plans||Array.isArray(plans)||!Object.keys(plans).length)throw Error('Test prices required');
  for(const [id,p] of Object.entries(plans)){
    if(!/^[a-z][a-z0-9_-]{0,39}$/.test(id)||!p||!Number.isSafeInteger(p.amount)||p.amount<=0||!['NGN','USD'].includes(p.currency))throw Error('Invalid test price');
  }
  if(env.BILLING_TEST_ACCESS && !['disabled','enabled'].includes(env.BILLING_TEST_ACCESS))throw Error('Invalid test access setting');
  const testAccess=mode==='live'||env.BILLING_TEST_ACCESS==='enabled';
  for(const p of Object.values(plans)){if(p.access!==undefined)validateAccess(p.access);if(testAccess&&!p.access)throw Error('Every access test plan needs an allowance');}
  const webhookSecret=env.PAYSTACK_WEBHOOK_SECRET;
  if(webhookSecret&&!/^whsec_/.test(webhookSecret))throw Error('Invalid webhook signing secret');
  return {mode,origin:url.origin,users,plans,secret:env.PAYSTACK_SECRET_KEY,webhookSecret,testAccess};
}
function signatureValid(raw,headers,config,now=Math.floor(Date.now()/1000)){
  if(!Buffer.isBuffer(raw))return false;
  const matches=(value,digest)=>typeof value==='string'&&/^[a-f0-9]{128}$/.test(value)&&timingSafeEqual(digest,Buffer.from(value,'hex'));
  if(config.webhookSecret){
    // Once configured, never fall back to the timestamp-free legacy header.
    const header=headers['paystack-signature'];
    if(typeof header!=='string'||header.length>4096)return false;
    const parts=header.split(',').map(s=>s.trim());
    const times=parts.filter(s=>s.startsWith('t='));
    if(times.length!==1||!/^t=\d+$/.test(times[0]))return false;
    const stamp=times[0].slice(2),seconds=Number(stamp);
    if(!Number.isSafeInteger(seconds)||Math.abs(now-seconds)>300)return false;
    const digest=createHmac('sha512',config.webhookSecret).update(stamp+'.').update(raw).digest();
    return parts.filter(s=>s.startsWith('v1=')).some(s=>matches(s.slice(s.indexOf(':')+1),digest));
  }
  return matches(headers['x-paystack-signature'],createHmac('sha512',config.secret).update(raw).digest());
}
function checkoutUrl(value){
  let url;try{url=new URL(value);}catch{throw fail(502,'Invalid payment provider response.');}
  if(url.protocol!=='https:'||url.hostname!=='checkout.paystack.com'||url.port||url.username||url.password)throw fail(502,'Invalid payment provider response.');
  return url.href;
}
function createBilling(pool,{env=process.env,request=fetch}={}){
  const config=configuration(env);
  const tables=tablesFor(config?.mode||'test');
  const access=createAccess(pool,{enabled:!!config?.testAccess,users:config?.users||new Set(),mode:config?.mode||'test'});
  async function init(){
    if(!config)return;
    await pool.query(`CREATE TABLE IF NOT EXISTS ${tables.checkouts} (
      user_id TEXT PRIMARY KEY, reference TEXT UNIQUE NOT NULL, plan_id TEXT NOT NULL,
      email TEXT NOT NULL, amount BIGINT NOT NULL CHECK(amount>0), currency TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'reserved', checkout_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    // Keep the reference unique/FK target; allow a later purchase after expiry.
    await pool.query(`ALTER TABLE ${tables.checkouts} ADD COLUMN IF NOT EXISTS access_snapshot JSONB`);
    await pool.query(`ALTER TABLE ${tables.checkouts} DROP CONSTRAINT IF EXISTS ${tables.checkouts}_pkey`);
    // Keep failed checkout records without blocking a replacement.
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${tables.pending}_active ON ${tables.checkouts}(user_id)
      WHERE state IN ('reserved','initializing','open','uncertain')`);
    await pool.query(`DROP INDEX IF EXISTS ${tables.pending}`);
    await pool.query(`CREATE TABLE IF NOT EXISTS ${tables.payments} (
      reference TEXT PRIMARY KEY REFERENCES ${tables.checkouts}(reference),
      paid_at TIMESTAMPTZ NOT NULL, verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await access.init();
  }
  function authorize(user){
    if(!config)throw fail(404,'Billing is disabled.');
    if(!user||typeof user.id!=='string'||!user.id)throw fail(401,'Sign in to manage your plan.');
    if(config.mode==='test'&&!config.users.has(user.id))throw fail(403,'Billing testing is not enabled for this account.');
  }
  function origin(value){if(!config||value!==config.origin)throw fail(403,'Invalid request origin.');}
  async function api(path,body){
    let response,payload;
    try{
      response=await request('https://api.paystack.co'+path,{
        method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(10000),
        headers:{Authorization:'Bearer '+config.secret,'Content-Type':'application/json'},
        ...(body?{body:JSON.stringify(body)}:{})});
      payload=await response.json();
    }catch{throw fail(502,'Payment provider unavailable. Please try status refresh later.');}
    if(!response.ok||payload.status!==true||!payload.data)throw fail(502,'Payment provider could not complete this request.');
    return payload.data;
  }
  async function status(user){
    authorize(user);
    const rows=(await pool.query(`SELECT c.plan_id,c.state,p.paid_at,c.amount,c.currency,c.reference,h.reason AS hold_reason FROM ${tables.checkouts} c
      LEFT JOIN ${tables.payments} p USING(reference) LEFT JOIN ${tables.holds} h USING(reference)
      WHERE c.user_id=$1 ORDER BY c.created_at DESC LIMIT 50`,[user.id])).rows;
    return {provider:'paystack',mode:config.mode,grantsAccess:!!config.testAccess,recurring:false,access:await access.status(user),
      plans:Object.entries(config.plans).map(([id,p])=>({id,amount:p.amount,currency:p.currency,access:config.testAccess?p.access:null})),
      paymentReview:rows.some(row=>row.hold_reason),
      payments:rows.map(row=>({plan_id:row.plan_id,status:row.hold_reason?'on hold — contact support':row.paid_at?'verified':row.state,amount:Number(row.amount),currency:row.currency,paidAt:row.paid_at,reference:row.reference})),subscriptions:[]};
  }
  async function checkout(user,planId){
    authorize(user);
    if(typeof planId!=='string'||!Object.hasOwn(config.plans,planId))throw fail(400,'Unknown plan.');
    const email=typeof user.email==='string'?user.email.trim().toLowerCase():'';
    if(!email||email.length>254||!email.includes('@'))throw fail(400,'An account email is required.');
    const plan=config.plans[planId];
    // Serialize checkout creation per account; never replace an uncertain reference.
    const c=await pool.connect();let row;
    try{
      await c.query('BEGIN');
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))",['billing:'+user.id]);
      if((await c.query(`SELECT 1 FROM ${tables.holds} h JOIN ${tables.checkouts} c USING(reference) WHERE c.user_id=$1 LIMIT 1`,[user.id])).rows.length)throw fail(409,'A payment needs review. Please contact support before purchasing again.');
      const active=await access.active(user.id,c);
      if(active && Number((await c.query(`SELECT COUNT(*)::int AS n FROM ${tables.usage} WHERE reference=$1 AND state <> 'released'`,[active.reference])).rows[0].n)<Number(active.session_limit))throw fail(409,'Your plan still has available sessions. Buy again after using them or after expiry.');
      row=(await c.query(`SELECT * FROM ${tables.checkouts} WHERE user_id=$1 AND state IN ('reserved','initializing','open','uncertain')`,[user.id])).rows[0];
      if(!row){
        // Checkout-only mode retains the original one-payment-per-account policy.
        if(!config.testAccess && (await c.query(`SELECT 1 FROM ${tables.checkouts} WHERE user_id=$1 AND state='paid'`,[user.id])).rows.length)throw fail(409,'This checkout is already paid.');
        row=(await c.query(`INSERT INTO ${tables.checkouts}(user_id,reference,plan_id,email,amount,currency,access_snapshot)
          VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [user.id,'va-'+config.mode+'-'+randomBytes(24).toString('hex'),planId,email,plan.amount,plan.currency,config.testAccess?JSON.stringify(plan.access):null])).rows[0];
      }
      await c.query('COMMIT');
    }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
    if(row.plan_id!==planId)throw fail(409,'This account already has a different checkout.');
    if(row.state==='paid')throw fail(409,'This checkout is already paid.');
    if(row.checkout_url)return {url:checkoutUrl(row.checkout_url)};
    const claimed=await pool.query(`UPDATE ${tables.checkouts} SET state='initializing',updated_at=NOW()
      WHERE reference=$1 AND state='reserved' RETURNING reference`,[row.reference]);
    if(!claimed.rows.length)throw fail(409,'This checkout needs status verification before another attempt.');
    try{
      const result=await api('/transaction/initialize',{email:row.email,amount:String(row.amount),currency:row.currency,
        reference:row.reference,callback_url:config.origin+(config.mode==='live'?'/billing.html':'/billing-test.html'),channels:['card'],
        metadata:{visaatlas_user_id:user.id,visaatlas_plan_id:row.plan_id}});
      if(result.reference!==row.reference)throw fail(502,'Invalid payment provider reference.');
      const url=checkoutUrl(result.authorization_url);
      await pool.query(`UPDATE ${tables.checkouts} SET checkout_url=$2,
        state=CASE WHEN state='paid' THEN state ELSE 'open' END,updated_at=NOW() WHERE reference=$1`,[row.reference,url]);
      return {url};
    }catch(error){
      await pool.query(`UPDATE ${tables.checkouts} SET state='uncertain',updated_at=NOW() WHERE reference=$1 AND state='initializing'`,[row.reference]);
      throw error;
    }
  }
  async function recover(user){
    authorize(user);
    const row=(await pool.query(`SELECT * FROM ${tables.checkouts} WHERE user_id=$1
      AND state IN ('reserved','initializing','open','uncertain') ORDER BY created_at DESC LIMIT 1`,[user.id])).rows[0];
    if(!row)return {retry:true};
    // Never replace an in-flight or uninitialized reference that Paystack may accept.
    if(['reserved','initializing'].includes(row.state))throw fail(409,'Checkout is still starting. Refresh payment status shortly; contact support if it remains stuck.');
    const providerStatus=await verifyRow(row);
    if(providerStatus==='success')return {retry:false,verified:true};
    if(!['failed','abandoned'].includes(providerStatus))throw fail(409,'Payment is still pending or cannot be safely closed. Use the existing checkout or contact support.');
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['billing:'+user.id]);
      const current=(await c.query(`SELECT * FROM ${tables.checkouts} WHERE reference=$1 FOR UPDATE`,[row.reference])).rows[0];
      if(!current||!['open','uncertain'].includes(current.state))throw fail(409,'Checkout changed. Refresh your payment status.');
      if((await c.query(`SELECT 1 FROM ${tables.payments} WHERE reference=$1`,[row.reference])).rows.length)throw fail(409,'A payment was just verified. Refresh your plan.');
      await c.query(`UPDATE ${tables.checkouts} SET state='closed',updated_at=NOW() WHERE reference=$1`,[row.reference]);
      await c.query('COMMIT');
    }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
    return {retry:true};
  }
  async function verifyRow(row){
    if((await pool.query(`SELECT reference FROM ${tables.payments} WHERE reference=$1`,[row.reference])).rows.length)return 'success';
    const payment=await api('/transaction/verify/'+encodeURIComponent(row.reference));
    const customerEmail=payment.customer?.email;
    if(payment.domain!==config.mode||payment.reference!==row.reference||!Number.isSafeInteger(payment.amount)||payment.amount!==Number(row.amount)||payment.currency!==row.currency||typeof customerEmail!=='string'||customerEmail.trim().toLowerCase()!==row.email)throw fail(409,'Payment verification did not match this checkout.');
    if(payment.status!=='success')return payment.status;
    const paidAt=Date.parse(payment.paid_at);
    if(!Number.isFinite(paidAt))throw fail(502,'Payment date is unavailable.');
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      const current=(await c.query(`SELECT * FROM ${tables.checkouts} WHERE reference=$1 FOR UPDATE`,[row.reference])).rows[0];
      // An old hosted link may receive a late payment after a recovery.
      const replaced=current?.state==='closed' &&
        (await c.query(`SELECT 1 FROM ${tables.checkouts} WHERE user_id=$1 AND reference<>$2 LIMIT 1`,[row.user_id,row.reference])).rows.length>0;
      await c.query(`INSERT INTO ${tables.payments}(reference,paid_at) VALUES($1,$2) ON CONFLICT DO NOTHING`,[row.reference,new Date(paidAt).toISOString()]);
      await c.query(`UPDATE ${tables.checkouts} SET state='paid',updated_at=NOW() WHERE reference=$1`,[row.reference]);
      if(replaced)await c.query(`INSERT INTO ${tables.holds}(reference,reason) VALUES($1,$2) ON CONFLICT DO NOTHING`,
        [row.reference,'late_payment_after_checkout_recovery']);
      else await access.grant(c,row,new Date(paidAt).toISOString());
      await c.query('COMMIT');
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
    return 'success';
  }
  async function verify(user){
    authorize(user);
    const row=(await pool.query(`SELECT * FROM ${tables.checkouts} WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`,[user.id])).rows[0];
    if(row)await verifyRow(row);
    return status(user);
  }
  async function webhook(raw,headers){
    if(!config)throw fail(404,'Billing is disabled.');
    if(!signatureValid(raw,headers,config))throw fail(401,'Invalid webhook signature.');
    let event;try{event=JSON.parse(raw.toString('utf8'));}catch{throw fail(400,'Invalid webhook.');}
    if(['refund.processed','charge.dispute.create','charge.dispute.remind','charge.dispute.resolve'].includes(event?.event)){
      const reference=event.data?.transaction_reference||event.data?.transaction?.reference;
      if(typeof reference!=='string'||!new RegExp('^va-'+config.mode+'-[a-f0-9]{48}$').test(reference))return;
      const domain=event.data?.domain||event.data?.transaction?.domain;
      if(domain&&domain!==config.mode)throw fail(400,'Payment environment does not match.');
      // Persist the hold even if a refund/dispute arrives before charge.success.
      // Resolution requires owner review; an out-of-order success cannot restore access.
      await pool.query(`INSERT INTO ${tables.holds}(reference,reason)
        SELECT reference,$2 FROM ${tables.checkouts} WHERE reference=$1
        ON CONFLICT(reference) DO NOTHING`,[reference,event.event]);
      return;
    }
    if(event?.event!=='charge.success')return;
    const reference=event.data?.reference;
    if(typeof reference!=='string'||!new RegExp('^va-'+config.mode+'-[a-f0-9]{48}$').test(reference))return;
    if(event.data.domain!==config.mode)throw fail(400,'Payment environment does not match.');
    const row=(await pool.query(`SELECT * FROM ${tables.checkouts} WHERE reference=$1`,[reference])).rows[0];
    if(row)await verifyRow(row);
  }
  async function history(user,{before}={}){
    if(user?.role!=='owner')throw fail(403,'Owner access required.');
    if(!config)return {mode:'disabled',payments:[],next:null};
    if(before!==undefined && (typeof before!=='string'||!new RegExp('^va-'+config.mode+'-[a-f0-9]{48}$').test(before)))throw fail(400,'Invalid payment cursor.');
    const rows=(await pool.query(`SELECT c.reference,c.user_id,c.email,c.plan_id,c.amount,c.currency,c.state,c.created_at,
      p.paid_at,p.verified_at,e.starts_at,e.expires_at,e.session_limit,e.mode_limits,h.reason AS hold_reason,
      (SELECT COUNT(*)::int FROM ${tables.usage} u WHERE u.reference=c.reference AND u.state <> 'released') AS sessions_used,
      (SELECT COUNT(*)::int FROM ${tables.usage} u WHERE u.reference=c.reference AND u.mode='mock' AND u.state <> 'released') AS mock_used,
      (SELECT COUNT(*)::int FROM ${tables.usage} u WHERE u.reference=c.reference AND u.mode='learn' AND u.state <> 'released') AS learn_used
      FROM ${tables.checkouts} c LEFT JOIN ${tables.payments} p USING(reference)
      LEFT JOIN ${tables.entitlements} e USING(reference)
      LEFT JOIN ${tables.holds} h USING(reference)
      WHERE ($1::text IS NULL OR (c.created_at,c.reference)<(SELECT created_at,reference FROM ${tables.checkouts} WHERE reference=$1))
      ORDER BY c.created_at DESC,c.reference DESC LIMIT 51`,[before||null])).rows;
    return {mode:config.mode,payments:rows.slice(0,50).map(r=>({...r,amount:Number(r.amount)})),next:rows.length>50?rows[49].reference:null};
  }
  return {init,authorize,origin,status,checkout,recover,verify,webhook,access,history};
}
module.exports={createBilling,configuration,signatureValid,checkoutUrl};
