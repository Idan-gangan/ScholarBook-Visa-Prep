'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const Stripe=require('stripe');
const {createBilling,configuration,checkPrice}=require('./billing');
const env={BILLING_MODE:'test',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',BILLING_ORIGIN:'https://example.test',BILLING_TEST_USER_IDS:'u1,u2',BILLING_TEST_PLANS:JSON.stringify({starter:{priceId:'price_fixture',amount:2900,currency:'usd'}})};
const price={id:'price_fixture',livemode:false,active:true,type:'recurring',recurring:{interval:'month',interval_count:1,usage_type:'licensed'},unit_amount:2900,currency:'usd'};
const user={id:'u1'};
test('configuration fails closed; production keys and malformed prices rejected',()=>{
  assert.equal(configuration({}),null);
  for(const changes of [{BILLING_MODE:'live'},{STRIPE_SECRET_KEY:'sk_live_x'},{BILLING_ORIGIN:'http://example.test'},{BILLING_TEST_USER_IDS:''},{BILLING_TEST_PLANS:'{}'}])assert.throws(()=>configuration({...env,...changes}));
  checkPrice(price,{amount:2900,currency:'usd'});
  for(const changes of [{livemode:true},{active:false},{unit_amount:1},{currency:'eur'},{recurring:{interval:'year'}}])assert.throws(()=>checkPrice({...price,...changes},{amount:2900,currency:'usd'}));
});
async function fixture(t){
  const db=new PGlite();t.after(()=>db.close());
  const query=(s,p)=>db.query(s,p);
  const pool={query,connect:async()=>({query,release(){}})};
  const calls=[];
  let subscription={id:'sub_fixture',customer:'cus_fixture',livemode:false,status:'active',items:{data:[{quantity:1,price,current_period_start:100,current_period_end:200}]},cancel_at_period_end:false};
  const stripe={webhooks:Stripe.webhooks,prices:{retrieve:async()=>price},customers:{create:async()=>({id:'cus_fixture',livemode:false})},subscriptions:{list:async()=>({data:[],has_more:false}),retrieve:async()=>{calls.push('subscription');return subscription;}},checkout:{sessions:{create:async(params,options)=>{calls.push({params,options});return {id:'cs_fixture',url:'https://checkout.stripe.com/test',livemode:false};},retrieve:async()=>({status:'open',url:'https://checkout.stripe.com/test'})}}};
  const billing=createBilling(pool,{env,stripe});await billing.init();await billing.init();
  function signed(id='evt_fixture',type='customer.subscription.updated',extra={}){
    const payload=JSON.stringify({id,type,livemode:false,data:{object:{id:'sub_fixture',customer:'cus_fixture'}},...extra});
    return [Buffer.from(payload),Stripe.webhooks.generateTestHeaderString({payload,secret:env.STRIPE_WEBHOOK_SECRET})];
  }
  return {db,pool,stripe,billing,calls,signed,setSubscription:s=>{subscription={...subscription,...s};}};
}
test('test account authorization, CSRF and server price selection',async t=>{
  const f=await fixture(t);
  assert.throws(()=>f.billing.authorize({id:'intruder'}),{status:403});
  for(const origin of [undefined,'https://evil.test','https://example.test.evil'])assert.throws(()=>f.billing.origin(origin),{status:403});
  f.billing.origin(env.BILLING_ORIGIN);
  await assert.rejects(f.billing.checkout(user,'unknown'),{status:400});
  await f.billing.checkout(user,'starter');
  const call=f.calls.find(c=>c.params);
  assert.deepEqual(call.params.line_items,[{price:'price_fixture',quantity:1}]);
  assert.equal(call.params.customer,'cus_fixture');
  assert.equal((await f.billing.status(user)).grantsAccess,false);
  assert.equal((await f.billing.status({id:'u2'})).subscriptions.length,0);
});
test('repeated checkout reuses open session; active subscriptions block another purchase',async t=>{
  const f=await fixture(t);
  const first=await f.billing.checkout(user,'starter');
  assert.deepEqual(await f.billing.checkout(user,'starter'),first);
  assert.equal(f.calls.filter(c=>c.params).length,1);
  f.stripe.subscriptions.list=async()=>({data:[{status:'active'}],has_more:false});
  await assert.rejects(f.billing.checkout(user,'starter'),{status:409});
});
test('provider timeout preserves durable idempotency key for retry',async t=>{
  const f=await fixture(t);const keys=[];
  const create=f.stripe.checkout.sessions.create;
  f.stripe.checkout.sessions.create=async(p,o)=>{keys.push(o.idempotencyKey);throw Error('timeout');};
  await assert.rejects(f.billing.checkout(user,'starter'),/timeout/);
  f.stripe.checkout.sessions.create=async(p,o)=>{keys.push(o.idempotencyKey);return create(p,o);};
  await f.billing.checkout(user,'starter');assert.equal(keys[0],keys[1]);
});
test('forged, altered, stale and live webhooks cannot update billing records',async t=>{
  const f=await fixture(t);await f.billing.checkout(user,'starter');
  const [raw,signature]=f.signed();
  await assert.rejects(f.billing.webhook(raw,'bad'),{status:400});
  await assert.rejects(f.billing.webhook(Buffer.from(raw.toString().replace('active','fake')+' '),signature),{status:400});
  const old=Stripe.webhooks.generateTestHeaderString({payload:raw.toString(),secret:env.STRIPE_WEBHOOK_SECRET,timestamp:1});
  await assert.rejects(f.billing.webhook(raw,old),{status:400});
  await assert.rejects(f.billing.webhook(...f.signed('evt_live',undefined,{livemode:true})),{status:400});
  assert.equal((await f.billing.status(user)).subscriptions.length,0);
});
test('duplicate notifications applied once; delayed events retrieve current subscription',async t=>{
  const f=await fixture(t);await f.billing.checkout(user,'starter');
  await f.billing.webhook(...f.signed());await f.billing.webhook(...f.signed());
  assert.equal(f.calls.filter(c=>c==='subscription').length,1);
  f.setSubscription({status:'canceled'});
  await f.billing.webhook(...f.signed('evt_old','customer.subscription.created'));
  assert.equal((await f.billing.status(user)).subscriptions[0].status,'canceled');
  assert.equal((await f.billing.status({id:'u2'})).subscriptions.length,0);
});
test('database failure rolls back subscription and dedup marker; retry succeeds',async t=>{
  const f=await fixture(t);await f.billing.checkout(user,'starter');
  const connect=f.pool.connect;
  f.pool.connect=async()=>{const c=await connect();const q=c.query;c.query=(s,p)=>s.startsWith('INSERT INTO billing_test_events')?Promise.reject(Error('disk failure')):q(s,p);return c;};
  await assert.rejects(f.billing.webhook(...f.signed()),/disk failure/);
  assert.equal((await f.billing.status(user)).subscriptions.length,0);
  f.pool.connect=connect;await f.billing.webhook(...f.signed());
  assert.equal((await f.billing.status(user)).subscriptions.length,1);
});
test('unknown customers are ignored and cross-customer subscriptions rejected',async t=>{
  const f=await fixture(t);await f.billing.webhook(...f.signed());
  assert.equal(f.calls.length,0);
  await f.billing.checkout(user,'starter');f.setSubscription({customer:'cus_other'});
  await assert.rejects(f.billing.webhook(...f.signed()),/ownership mismatch/);
  assert.equal((await f.billing.status(user)).subscriptions.length,0);
});
