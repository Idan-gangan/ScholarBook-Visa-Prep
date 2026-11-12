'use strict';
// Sandbox foundation only. These records NEVER grant production access.
const Stripe = require('stripe');
const {randomUUID} = require('node:crypto');
const API_VERSION = '2026-10-28.endive';
const fail = (status, message) => Object.assign(new Error(message), {status, publicMessage:message});
function configuration(env) {
  if (!env.BILLING_MODE || env.BILLING_MODE === 'disabled') return null;
  if (env.BILLING_MODE !== 'test') throw Error('Billing supports test mode only');
  if (!/^sk_test_/.test(env.STRIPE_SECRET_KEY || '')) throw Error('A Stripe test key is required');
  if (!/^whsec_/.test(env.STRIPE_WEBHOOK_SECRET || '')) throw Error('Webhook signing secret required');
  const origin = new URL(env.BILLING_ORIGIN);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw Error('BILLING_ORIGIN must be an HTTPS origin');
  const users = new Set((env.BILLING_TEST_USER_IDS || '').split(',').map(s=>s.trim()).filter(Boolean));
  if (!users.size) throw Error('Explicit billing test accounts required');
  const plans = JSON.parse(env.BILLING_TEST_PLANS || '{}');
  if (!Object.keys(plans).length) throw Error('Test plan configuration required');
  const prices = new Set();
  for (const [id,p] of Object.entries(plans)) {
    if (!/^[a-z][a-z0-9_-]{0,39}$/.test(id) || !p || !/^price_[A-Za-z0-9]+$/.test(p.priceId) || prices.has(p.priceId) || !Number.isSafeInteger(p.amount) || p.amount <= 0 || p.currency !== 'usd') throw Error('Invalid test plan');
    prices.add(p.priceId);
  }
  return {origin:origin.origin,users,plans,secret:env.STRIPE_WEBHOOK_SECRET};
}
function checkPrice(price, plan) {
  if (price.livemode !== false || !price.active || price.type !== 'recurring' || price.recurring?.interval !== 'month' || price.recurring.interval_count !== 1 || price.recurring.usage_type !== 'licensed' || price.unit_amount !== plan.amount || price.currency !== plan.currency) throw fail(503,'Test price configuration does not match.');
}
function createBilling(pool, {env=process.env, stripe:provided}={}) {
  const config = configuration(env);
  const stripe = config && (provided || new Stripe(env.STRIPE_SECRET_KEY,{apiVersion:API_VERSION,timeout:10000,maxNetworkRetries:1}));
  async function transaction(fn) {
    const c=await pool.connect();
    try {await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}
    catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
  async function init() {
    if(!config)return;
    await pool.query(`CREATE TABLE IF NOT EXISTS billing_test_accounts (
      user_id TEXT PRIMARY KEY, customer_id TEXT UNIQUE,
      attempt_id TEXT NOT NULL, checkout_id TEXT, checkout_plan TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS billing_test_subscriptions (
      subscription_id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES billing_test_accounts(user_id),
      status TEXT NOT NULL, plan_id TEXT, period_start BIGINT, period_end BIGINT,
      cancel_at_period_end BOOLEAN NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS billing_test_events (
      event_id TEXT PRIMARY KEY, processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  }
  function authorize(user) {
    if(!config)throw fail(404,'Billing testing is disabled.');
    if(!config.users.has(user.id))throw fail(403,'Billing testing is not enabled for this account.');
  }
  function origin(value) {if(!config || value!==config.origin)throw fail(403,'Invalid request origin.');}
  async function status(user) {
    authorize(user);
    return {mode:'test', grantsAccess:false,
      plans:Object.entries(config.plans).map(([id,p])=>({id,amount:p.amount,currency:p.currency})),
      subscriptions:(await pool.query('SELECT status,plan_id,period_end,cancel_at_period_end FROM billing_test_subscriptions WHERE user_id=$1',[user.id])).rows};
  }
  async function checkout(user,planId) {
    authorize(user);
    if(!Object.hasOwn(config.plans,planId))throw fail(400,'Unknown test plan.');
    const plan=config.plans[planId];
    checkPrice(await stripe.prices.retrieve(plan.priceId),plan);
    // Persist the idempotency key before calling Stripe: a timeout or DB rollback
    // must not create a second checkout on retry.
    await pool.query('INSERT INTO billing_test_accounts (user_id,attempt_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[user.id,randomUUID()]);
    return transaction(async c=>{
      const account=(await c.query('SELECT * FROM billing_test_accounts WHERE user_id=$1 FOR UPDATE',[user.id])).rows[0];
      if(!account.customer_id) {
        const customer=await stripe.customers.create({metadata:{visaatlas_user_id:user.id}},{idempotencyKey:'va-test-customer-'+account.attempt_id});
        if(customer.livemode!==false)throw Error('Unexpected live customer');
        account.customer_id=customer.id;
        await c.query('UPDATE billing_test_accounts SET customer_id=$2 WHERE user_id=$1',[user.id,customer.id]);
      }
      const existing=await stripe.subscriptions.list({customer:account.customer_id,status:'all',limit:100});
      if(existing.has_more || existing.data.some(s=>!['canceled','incomplete_expired'].includes(s.status)))throw fail(409,'This test account already has a subscription.');
      if(account.checkout_id) {
        const previous=await stripe.checkout.sessions.retrieve(account.checkout_id);
        if(previous.status==='open') {
          if(account.checkout_plan!==planId)throw fail(409,'Finish or let the existing test checkout expire before changing plans.');
          return {url:previous.url};
        }
        // Commit a new durable attempt separately; caller retries after this response.
        await c.query('UPDATE billing_test_accounts SET attempt_id=$2,checkout_id=NULL,checkout_plan=NULL WHERE user_id=$1',[user.id,randomUUID()]);
        return {retry:true};
      }
      const session=await stripe.checkout.sessions.create({
        mode:'subscription',customer:account.customer_id,
        line_items:[{price:plan.priceId,quantity:1}],
        client_reference_id:user.id,
        subscription_data:{metadata:{visaatlas_user_id:user.id}},
        success_url:config.origin+'/billing-test.html?returned=1',
        cancel_url:config.origin+'/billing-test.html',
      },{idempotencyKey:'va-test-checkout-'+account.attempt_id});
      if(session.livemode!==false)throw Error('Unexpected live checkout');
      await c.query('UPDATE billing_test_accounts SET checkout_id=$2,checkout_plan=$3,updated_at=NOW() WHERE user_id=$1',[user.id,session.id,planId]);
      return {url:session.url};
    });
  }
  async function webhook(raw,signature) {
    if(!config)throw fail(404,'Billing testing is disabled.');
    let event;
    try{event=stripe.webhooks.constructEvent(raw,signature,config.secret,300);}catch{throw fail(400,'Invalid webhook signature.');}
    if(event.livemode!==false)throw fail(400,'Live events are disabled.');
    const supported=['checkout.session.completed','checkout.session.async_payment_succeeded','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed','invoice.paid','invoice.payment_failed'];
    if(!supported.includes(event.type))return;
    const object=event.data.object;
    const customerId=typeof object.customer==='string'?object.customer:object.customer?.id;
    const sub=event.type.startsWith('customer.subscription.')?object.id:(object.subscription || object.parent?.subscription_details?.subscription);
    const subscriptionId=typeof sub==='string'?sub:sub?.id;
    if(!subscriptionId || !customerId)return;
    await transaction(async c=>{
      // All updates for a customer serialize BEFORE reading fresh Stripe state,
      // so delayed events cannot overwrite a newer subscription with old data.
      const account=(await c.query('SELECT * FROM billing_test_accounts WHERE customer_id=$1 FOR UPDATE',[customerId])).rows[0];
      if(!account)return;
      if((await c.query('SELECT event_id FROM billing_test_events WHERE event_id=$1',[event.id])).rows.length)return;
      const subscription=await stripe.subscriptions.retrieve(subscriptionId);
      if(subscription.livemode!==false || subscription.customer!==customerId)throw Error('Subscription ownership mismatch');
      const items=subscription.items.data;
      const item=items.length===1?items[0]:null;
      const planId=item?.quantity===1?Object.keys(config.plans).find(id=>config.plans[id].priceId===item.price.id):null;
      await c.query(`INSERT INTO billing_test_subscriptions (subscription_id,user_id,status,plan_id,period_start,period_end,cancel_at_period_end)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(subscription_id) DO UPDATE SET
        status=EXCLUDED.status,plan_id=EXCLUDED.plan_id,period_start=EXCLUDED.period_start,
        period_end=EXCLUDED.period_end,cancel_at_period_end=EXCLUDED.cancel_at_period_end,updated_at=NOW()`,
        [subscription.id,account.user_id,subscription.status,planId||null,item?.current_period_start||null,item?.current_period_end||null,subscription.cancel_at_period_end===true]);
      await c.query('INSERT INTO billing_test_events (event_id) VALUES ($1)',[event.id]);
    });
  }
  return {init,authorize,origin,status,checkout,webhook};
}
module.exports={createBilling,configuration,checkPrice,API_VERSION};
