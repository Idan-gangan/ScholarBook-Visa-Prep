'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const {createBilling,configuration,signatureValid,checkoutUrl}=require('./paystack-billing');
const env={BILLING_MODE:'test',PAYSTACK_SECRET_KEY:'sk_test_fixture',BILLING_ORIGIN:'https://example.test',BILLING_TEST_USER_IDS:'u1,u2',PAYSTACK_TEST_PLANS:JSON.stringify({starter:{amount:10000,currency:'NGN'}})};
const user={id:'u1',email:'owner@example.test'};
async function fixture(t,patch={}){
  const db=new PGlite();t.after(()=>db.close());const query=(s,p)=>db.query(s,p);
  const pool={query,connect:async()=>({query,release(){}})};
  const calls=[];let initialized,paymentChanges={},initializeFailure=false,verificationFailure=false;
  const request=async(url,options)=>{
    calls.push({url,options});
    assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer sk_test_fixture');
    if(url.endsWith('/initialize')){
      initialized=JSON.parse(options.body);
      if(initializeFailure)throw Error('secret response must not escape');
      return {ok:true,json:async()=>({status:true,data:{reference:initialized.reference,authorization_url:'https://checkout.paystack.com/test'}})};
    }
    if(verificationFailure)throw Error('upstream unavailable');
    return {ok:true,json:async()=>({status:true,data:{domain:'test',reference:initialized.reference,amount:Number(initialized.amount),currency:initialized.currency,status:'success',customer:{email:initialized.email},paid_at:'2026-11-09T12:00:00Z',...paymentChanges}})};
  };
  const billing=createBilling(pool,{env:{...env,...patch},request});await billing.init();await billing.init();
  function signed(extra={}){
    const raw=Buffer.from(JSON.stringify({event:'charge.success',data:{reference:initialized.reference,domain:'test',...extra}}));
    return [raw,{'x-paystack-signature':createHmac('sha512',env.PAYSTACK_SECRET_KEY).update(raw).digest('hex')}];
  }
  return {db,pool,billing,calls,signed,setPayment:p=>{paymentChanges=p;},failInitialize:()=>{initializeFailure=true;},failVerify:v=>{verificationFailure=v;}};
}
test('Paystack configuration rejects live mode, live keys, missing allowlist and bad prices',()=>{
  assert.equal(configuration({PAYSTACK_SECRET_KEY:'sk_test_fixture'}),null);
  for(const patch of [{BILLING_MODE:'live'},{PAYSTACK_SECRET_KEY:'sk_live_fixture'},{BILLING_TEST_USER_IDS:''},{BILLING_ORIGIN:'http://example.test'},{PAYSTACK_TEST_PLANS:'{}'},{PAYSTACK_TEST_PLANS:'null'},{PAYSTACK_TEST_PLANS:JSON.stringify({x:{amount:-1,currency:'NGN'}})}])assert.throws(()=>configuration({...env,...patch}));
});
test('Paystack signed webhook supports timestamp signatures and rejects downgrade/replay',()=>{
  const raw=Buffer.from('{"event":"charge.success"}');const secret='whsec_fixture';const config={secret:env.PAYSTACK_SECRET_KEY,webhookSecret:secret};
  const hash=t=>createHmac('sha512',secret).update(t+'.').update(raw).digest('hex');
  assert.equal(signatureValid(raw,{'paystack-signature':`t=1000,v1=whk_a:${hash(1000)}`},config,1000),true);
  assert.equal(signatureValid(raw,{'paystack-signature':`t=1000,v1=whk_a:${hash(1000)}`},config,1400),false);
  assert.equal(signatureValid(raw,{'paystack-signature':`t=1000,t=1000,v1=whk_a:${hash(1000)}`},config,1000),false);
  assert.equal(signatureValid(raw,{'x-paystack-signature':createHmac('sha512',config.secret).update(raw).digest('hex')},config,1000),false);
});
test('Paystack checkout destinations reject lookalike hosts, plaintext and credentials',()=>{
  assert.equal(checkoutUrl('https://checkout.paystack.com/test'),'https://checkout.paystack.com/test');
  for(const url of ['http://checkout.paystack.com/test','https://checkout.paystack.com.evil.test','https://evil@checkout.paystack.com/test','javascript:alert(1)'])assert.throws(()=>checkoutUrl(url));
});
test('Paystack authorizes only test accounts and exact origin; browser cannot select another customer',async t=>{
  const f=await fixture(t);
  assert.throws(()=>f.billing.authorize({id:'other'}),{status:403});
  assert.throws(()=>f.billing.origin('https://evil.test'),{status:403});
  f.billing.origin(env.BILLING_ORIGIN);
  await assert.rejects(f.billing.checkout(user,'__proto__'),{status:400});
  await f.billing.checkout(user,'starter');
  const body=JSON.parse(f.calls[0].options.body);
  assert.equal(body.amount,'10000');assert.equal(body.email,user.email);assert.equal(body.currency,'NGN');
  assert.equal(body.callback_url,env.BILLING_ORIGIN+'/billing-test.html');
  assert.equal((await f.billing.status(user)).grantsAccess,false);
  assert.deepEqual((await f.billing.status({id:'u2'})).payments,[]);
});
test('Paystack repeated clicks reuse one reference and checkout',async t=>{
  const f=await fixture(t);const first=await f.billing.checkout(user,'starter');
  assert.deepEqual(await f.billing.checkout(user,'starter'),first);
  assert.equal(f.calls.length,1);
});
test('Paystack timeout does not create a second checkout; verification can recover',async t=>{
  const f=await fixture(t);f.failInitialize();
  await assert.rejects(f.billing.checkout(user,'starter'),e=>e.status===502&&!e.message.includes('secret response'));
  await assert.rejects(f.billing.checkout(user,'starter'),{status:409});
  assert.equal(f.calls.length,1);
  assert.equal((await f.billing.verify(user)).payments[0].status,'verified');
  await assert.rejects(f.billing.checkout(user,'starter'),{status:409});
});
test('Paystack rejects missing/forged/altered signatures before contacting API',async t=>{
  const f=await fixture(t);await f.billing.checkout(user,'starter');const [raw,headers]=f.signed();
  await assert.rejects(f.billing.webhook(raw,{}),{status:401});
  await assert.rejects(f.billing.webhook(Buffer.concat([raw,Buffer.from(' ')]),headers),{status:401});
  assert.equal(f.calls.length,1);
});
test('Paystack verifies once for replayed successful events and never grants access',async t=>{
  const f=await fixture(t);await f.billing.checkout(user,'starter');
  await f.billing.webhook(...f.signed());await f.billing.webhook(...f.signed());
  assert.equal(f.calls.length,2);
  const state=await f.billing.verify(user);assert.equal(state.payments[0].status,'verified');assert.equal(state.grantsAccess,false);
  assert.equal((await f.db.query('SELECT * FROM paystack_test_payments')).rows.length,1);
});
test('Paystack independently rejects mismatched amount, currency, customer, domain and reference',async t=>{
  const f=await fixture(t);await f.billing.checkout(user,'starter');
  for(const patch of [{amount:1},{amount:'10000'},{currency:'USD'},{customer:{email:'another@example.test'}},{domain:'live'},{reference:'another-reference'}]){
    f.setPayment(patch);await assert.rejects(f.billing.verify(user),{status:409});
  }
  assert.equal((await f.db.query('SELECT * FROM paystack_test_payments')).rows.length,0);
});
test('Paystack failed and pending payments never become verified',async t=>{
  const f=await fixture(t);await f.billing.checkout(user,'starter');
  for(const status of ['pending','failed','abandoned','processing']){
    f.setPayment({status});assert.equal((await f.billing.verify(user)).payments[0].status,'open');
  }
});
test('Paystack database failure rolls back both payment and state; webhook retry succeeds',async t=>{
  const f=await fixture(t);await f.billing.checkout(user,'starter');const connect=f.pool.connect;
  f.pool.connect=async()=>{const c=await connect();const q=c.query;c.query=(s,p)=>s.includes("SET state='paid'")?Promise.reject(Error('disk failure')):q(s,p);return c;};
  await assert.rejects(f.billing.webhook(...f.signed()),/disk failure/);
  assert.equal((await f.db.query('SELECT * FROM paystack_test_payments')).rows.length,0);
  f.pool.connect=connect;await f.billing.webhook(...f.signed());
  assert.equal((await f.billing.status(user)).payments[0].status,'verified');
});
test('Paystack provider outages preserve retries; live and unknown webhook references do not update state',async t=>{
  const f=await fixture(t);await f.billing.checkout(user,'starter');f.failVerify(true);
  await assert.rejects(f.billing.webhook(...f.signed()),{status:502});f.failVerify(false);
  await assert.rejects(f.billing.webhook(...f.signed({domain:'live'})),{status:400});
  await f.billing.webhook(...f.signed({reference:'va-test-'+'0'.repeat(48)}));
  assert.equal((await f.billing.status(user)).payments[0].status,'open');
  await f.billing.webhook(...f.signed());assert.equal((await f.billing.status(user)).payments[0].status,'verified');
});
const accessEnv={BILLING_TEST_ACCESS:'enabled',PAYSTACK_TEST_PLANS:JSON.stringify({starter:{amount:10000,currency:'NGN',access:{days:30,sessions:2}}})};
const token=n=>String(n).padStart(48,'0');
test('test access configuration rejects missing, fractional and unbounded allowances',()=>{
  for(const access of [null,{days:31,sessions:20},{days:30,sessions:0},{days:30,sessions:1.5},{days:30,sessions:1001},{days:30,sessions:20,unlimited:true}])assert.throws(()=>configuration({...env,BILLING_TEST_ACCESS:'enabled',PAYSTACK_TEST_PLANS:JSON.stringify({test:{amount:100,currency:'NGN',access}})}));
  assert.throws(()=>configuration({...env,BILLING_TEST_ACCESS:'enabled'}));
});
test('payment grants exactly one immutable 30-day sandbox allowance; duplicates never reset usage',async t=>{
  const f=await fixture(t,accessEnv);await f.billing.checkout(user,'starter');
  const now=new Date();f.setPayment({paid_at:now.toISOString()});
  await assert.rejects(f.billing.access.reserve(user,token(1),'learn'),{status:402});
  await f.billing.webhook(...f.signed());
  let access=await f.billing.access.status(user);assert.equal(access.remaining,2);
  assert.equal(new Date(access.expiresAt)-new Date(access.startsAt),30*86400000);
  await f.billing.access.reserve(user,token(1),'learn');await f.billing.access.commit(user,token(1));
  await f.billing.webhook(...f.signed());await f.billing.verify(user);
  access=await f.billing.access.status(user);assert.equal(access.remaining,1);
  assert.equal((await f.db.query('SELECT * FROM billing_test_entitlements')).rows.length,1);
  await assert.rejects(f.billing.checkout(user,'starter'),{status:409});
  assert.deepEqual(await f.billing.access.status({id:'not-allowlisted'}),{enforced:false});
});
test('shared tutor/mock quota is enforced, failed starts refunded, successful ends never refunded',async t=>{
  const f=await fixture(t,accessEnv);await f.billing.checkout(user,'starter');f.setPayment({paid_at:new Date().toISOString()});await f.billing.verify(user);
  await f.billing.access.reserve(user,token(1),'learn');
  await f.billing.access.reserve(user,token(1),'learn');assert.equal((await f.billing.access.status(user)).remaining,1);
  await assert.rejects(f.billing.access.reserve({id:'u2'},token(1),'learn'),{status:402});
  await f.billing.access.release({id:'u2'},token(1));assert.equal((await f.billing.access.status(user)).remaining,1);
  await f.billing.access.release(user,token(1));assert.equal((await f.billing.access.status(user)).remaining,2);
  await assert.rejects(f.billing.access.reserve(user,token(1),'learn'),{status:409});
  await f.billing.access.reserve(user,token(2),'learn');await f.billing.access.commit(user,token(2));
  await f.billing.access.release(user,token(2));assert.equal((await f.billing.access.status(user)).remaining,1);
  await f.billing.access.reserve(user,token(3),'mock');await f.billing.access.commit(user,token(3));
  await assert.rejects(f.billing.access.reserve(user,token(4),'mock'),{status:402});
});
test('expired plans block new starts and feedback; renewal keeps old ledger and grants fresh allowance',async t=>{
  const f=await fixture(t,accessEnv);await f.billing.checkout(user,'starter');
  f.setPayment({paid_at:new Date(Date.now()-31*86400000).toISOString()});await f.billing.verify(user);
  assert.equal((await f.billing.access.status(user)).active,false);
  await assert.rejects(f.billing.access.reserve(user,token(1),'learn'),{status:402});
  await assert.rejects(f.billing.access.requireActive(user),{status:402});
  await f.billing.checkout(user,'starter');f.setPayment({paid_at:new Date().toISOString()});await f.billing.verify(user);
  assert.equal((await f.billing.access.status(user)).remaining,2);
  assert.equal((await f.db.query('SELECT * FROM paystack_test_payments')).rows.length,2);
});
test('failed/pending/forged/live/mismatched payment never creates access',async t=>{
  const f=await fixture(t,accessEnv);await f.billing.checkout(user,'starter');
  for(const status of ['pending','failed','abandoned','processing','reversed']){f.setPayment({status});await f.billing.verify(user);}
  f.setPayment({amount:1});await assert.rejects(f.billing.verify(user),{status:409});
  await assert.rejects(f.billing.webhook(...f.signed({domain:'live'})),{status:400});
  const [raw]=f.signed();await assert.rejects(f.billing.webhook(raw,{}),{status:401});
  assert.equal((await f.db.query('SELECT * FROM billing_test_entitlements')).rows.length,0);
});
test('grant storage failure rolls back payment; retry grants once with checkout snapshot',async t=>{
  const f=await fixture(t,accessEnv);await f.billing.checkout(user,'starter');f.setPayment({paid_at:new Date().toISOString()});
  const connect=f.pool.connect;f.pool.connect=async()=>{const c=await connect(),q=c.query;c.query=(s,p)=>s.startsWith('INSERT INTO billing_test_entitlements')?Promise.reject(Error('grant failed')):q(s,p);return c;};
  await assert.rejects(f.billing.verify(user),/grant failed/);
  assert.equal((await f.db.query('SELECT * FROM paystack_test_payments')).rows.length,0);
  f.pool.connect=connect;await f.billing.verify(user);assert.equal((await f.billing.access.status(user)).remaining,2);
});
test('legacy paid checkout is never silently upgraded when test access is enabled later',async t=>{
  const f=await fixture(t);await f.billing.checkout(user,'starter');await f.billing.verify(user);
  const upgraded=createBilling(f.pool,{env:{...env,...accessEnv},request:()=>{throw Error('unexpected provider request');}});await upgraded.init();
  await upgraded.verify(user);assert.equal((await upgraded.access.status(user)).active,false);
});
test('owner history is protected, paginated and contains only explicit safe fields',async t=>{
  const f=await fixture(t,accessEnv);await f.billing.checkout(user,'starter');f.setPayment({paid_at:new Date().toISOString()});await f.billing.verify(user);
  for(const role of ['athlete','coach','supervisor','manager',undefined])await assert.rejects(f.billing.history({id:'u1',role}),{status:403});
  const result=await f.billing.history({role:'owner'});assert.equal(result.mode,'test');assert.equal(result.payments[0].session_limit,2);assert.equal(result.payments[0].email,user.email);
  assert.doesNotMatch(JSON.stringify(result),/sk_test|checkout_url|authorization|password/);
  await assert.rejects(f.billing.history({role:'owner'},{before:'invalid'}),{status:400});
  assert.deepEqual((await f.billing.history({role:'owner'},{before:result.payments[0].reference})).payments,[]);
});
