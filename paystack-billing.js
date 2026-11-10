'use strict';
const {randomBytes,createHmac,timingSafeEqual}=require('node:crypto');
const fail=(status,message)=>Object.assign(new Error(message),{status,publicMessage:message});
function configuration(env){
  if(!env.BILLING_MODE||env.BILLING_MODE==='disabled')return null;
  if(env.BILLING_MODE!=='test'||!/^sk_test_[A-Za-z0-9]+$/.test(env.PAYSTACK_SECRET_KEY||''))throw Error('Paystack billing requires a test secret key and test mode');
  const url=new URL(env.BILLING_ORIGIN);
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('BILLING_ORIGIN must be an HTTPS origin');
  const users=new Set((env.BILLING_TEST_USER_IDS||'').split(',').map(s=>s.trim()).filter(Boolean));
  if(!users.size)throw Error('Explicit test accounts required');
  const plans=JSON.parse(env.PAYSTACK_TEST_PLANS||'{}');
  if(!plans||Array.isArray(plans)||!Object.keys(plans).length)throw Error('Test prices required');
  for(const [id,p] of Object.entries(plans)){
    if(!/^[a-z][a-z0-9_-]{0,39}$/.test(id)||!p||!Number.isSafeInteger(p.amount)||p.amount<=0||!['NGN','USD'].includes(p.currency))throw Error('Invalid test price');
  }
  const webhookSecret=env.PAYSTACK_WEBHOOK_SECRET;
  if(webhookSecret&&!/^whsec_/.test(webhookSecret))throw Error('Invalid webhook signing secret');
  return {origin:url.origin,users,plans,secret:env.PAYSTACK_SECRET_KEY,webhookSecret};
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
  async function init(){
    if(!config)return;
    await pool.query(`CREATE TABLE IF NOT EXISTS paystack_test_checkouts (
      user_id TEXT PRIMARY KEY, reference TEXT UNIQUE NOT NULL, plan_id TEXT NOT NULL,
      email TEXT NOT NULL, amount BIGINT NOT NULL CHECK(amount>0), currency TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'reserved', checkout_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS paystack_test_payments (
      reference TEXT PRIMARY KEY REFERENCES paystack_test_checkouts(reference),
      paid_at TIMESTAMPTZ NOT NULL, verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  }
  function authorize(user){
    if(!config)throw fail(404,'Billing testing is disabled.');
    if(!config.users.has(user.id))throw fail(403,'Billing testing is not enabled for this account.');
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
    const rows=(await pool.query(`SELECT c.plan_id,c.state,p.paid_at FROM paystack_test_checkouts c
      LEFT JOIN paystack_test_payments p USING(reference) WHERE c.user_id=$1`,[user.id])).rows;
    return {provider:'paystack',mode:'test',grantsAccess:false,recurring:false,
      plans:Object.entries(config.plans).map(([id,p])=>({id,amount:p.amount,currency:p.currency})),
      payments:rows.map(row=>({plan_id:row.plan_id,status:row.paid_at?'verified':row.state})),subscriptions:[]};
  }
  async function checkout(user,planId){
    authorize(user);
    if(typeof planId!=='string'||!Object.hasOwn(config.plans,planId))throw fail(400,'Unknown test plan.');
    const email=typeof user.email==='string'?user.email.trim().toLowerCase():'';
    if(!email||email.length>254||!email.includes('@'))throw fail(400,'An account email is required.');
    const plan=config.plans[planId];
    // Persist one reference per account before the provider call. Do not generate
    // a second reference after a timeout: the first call may have succeeded.
    await pool.query(`INSERT INTO paystack_test_checkouts(user_id,reference,plan_id,email,amount,currency)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id) DO NOTHING`,
      [user.id,'va-test-'+randomBytes(24).toString('hex'),planId,email,plan.amount,plan.currency]);
    const row=(await pool.query('SELECT * FROM paystack_test_checkouts WHERE user_id=$1',[user.id])).rows[0];
    if(row.plan_id!==planId)throw fail(409,'This account already has a different test checkout.');
    if(row.state==='paid')throw fail(409,'This test checkout is already paid.');
    if(row.checkout_url)return {url:checkoutUrl(row.checkout_url)};
    const claimed=await pool.query(`UPDATE paystack_test_checkouts SET state='initializing',updated_at=NOW()
      WHERE user_id=$1 AND state='reserved' RETURNING reference`,[user.id]);
    if(!claimed.rows.length)throw fail(409,'This test checkout needs status verification before another attempt.');
    try{
      const result=await api('/transaction/initialize',{email:row.email,amount:String(row.amount),currency:row.currency,
        reference:row.reference,callback_url:config.origin+'/billing-test.html',channels:['card'],
        metadata:{visaatlas_user_id:user.id,visaatlas_plan_id:row.plan_id}});
      if(result.reference!==row.reference)throw fail(502,'Invalid payment provider reference.');
      const url=checkoutUrl(result.authorization_url);
      await pool.query(`UPDATE paystack_test_checkouts SET checkout_url=$2,
        state=CASE WHEN state='paid' THEN state ELSE 'open' END,updated_at=NOW() WHERE user_id=$1`,[user.id,url]);
      return {url};
    }catch(error){
      await pool.query("UPDATE paystack_test_checkouts SET state='uncertain',updated_at=NOW() WHERE user_id=$1 AND state='initializing'",[user.id]);
      throw error;
    }
  }
  async function verifyRow(row){
    if((await pool.query('SELECT reference FROM paystack_test_payments WHERE reference=$1',[row.reference])).rows.length)return;
    const payment=await api('/transaction/verify/'+encodeURIComponent(row.reference));
    const customerEmail=payment.customer?.email;
    if(payment.domain!=='test'||payment.reference!==row.reference||!Number.isSafeInteger(payment.amount)||payment.amount!==Number(row.amount)||payment.currency!==row.currency||typeof customerEmail!=='string'||customerEmail.trim().toLowerCase()!==row.email)throw fail(409,'Payment verification did not match this checkout.');
    if(payment.status!=='success')return;
    const paidAt=Date.parse(payment.paid_at);
    if(!Number.isFinite(paidAt))throw fail(502,'Payment date is unavailable.');
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      await c.query('SELECT user_id FROM paystack_test_checkouts WHERE reference=$1 FOR UPDATE',[row.reference]);
      await c.query('INSERT INTO paystack_test_payments(reference,paid_at) VALUES($1,$2) ON CONFLICT DO NOTHING',[row.reference,new Date(paidAt).toISOString()]);
      await c.query("UPDATE paystack_test_checkouts SET state='paid',updated_at=NOW() WHERE reference=$1",[row.reference]);
      await c.query('COMMIT');
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
  async function verify(user){
    authorize(user);
    const row=(await pool.query('SELECT * FROM paystack_test_checkouts WHERE user_id=$1',[user.id])).rows[0];
    if(row)await verifyRow(row);
    return status(user);
  }
  async function webhook(raw,headers){
    if(!config)throw fail(404,'Billing testing is disabled.');
    if(!signatureValid(raw,headers,config))throw fail(401,'Invalid webhook signature.');
    let event;try{event=JSON.parse(raw.toString('utf8'));}catch{throw fail(400,'Invalid webhook.');}
    if(event?.event!=='charge.success')return;
    const reference=event.data?.reference;
    if(typeof reference!=='string'||!/^va-test-[a-f0-9]{48}$/.test(reference))return;
    if(event.data.domain!=='test')throw fail(400,'Live events are disabled.');
    const row=(await pool.query('SELECT * FROM paystack_test_checkouts WHERE reference=$1',[reference])).rows[0];
    if(row)await verifyRow(row);
  }
  return {init,authorize,origin,status,checkout,verify,webhook};
}
module.exports={createBilling,configuration,signatureValid,checkoutUrl};
