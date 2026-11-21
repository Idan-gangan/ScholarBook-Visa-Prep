'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const {createBilling}=require('../paystack-billing');
const {createMockTrial,trialEmailIdentity}=require('../mock-trial');

const env={BILLING_MODE:'live',BILLING_LIVE_USD_READY:'confirmed',
 PAYSTACK_SECRET_KEY:'sk_live_fixture',BILLING_ORIGIN:'https://example.test'};
const student={id:'student-one',email:'student@example.test'};
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 const query=(sql,params)=>db.query(sql,params);
 const pool={query,connect:async()=>({query,release(){}})};
 const provider=new Map();
 const request=async(url,options)=>{
  if(url.endsWith('/transaction/initialize')){
   const data=JSON.parse(options.body);
   provider.set(data.reference,{domain:'live',reference:data.reference,amount:Number(data.amount),
    currency:data.currency,customer:{email:data.email},status:'pending',paid_at:new Date().toISOString()});
   return {ok:true,json:async()=>({status:true,data:{reference:data.reference,
    authorization_url:'https://checkout.paystack.com/'+data.reference}})};
  }
  const ref=decodeURIComponent(url.split('/').at(-1));
  const payment=provider.get(ref);
  if(!payment)throw Error('No provider record');
  return {ok:true,json:async()=>({status:true,data:payment})};
 };
 const billing=createBilling(pool,{env,request});
 await billing.init();
 const signed=reference=>{
  const raw=Buffer.from(JSON.stringify({event:'charge.success',data:{domain:'live',reference}}));
  return [raw,{'x-paystack-signature':createHmac('sha512',env.PAYSTACK_SECRET_KEY).update(raw).digest('hex')}];
 };
 return {db,pool,billing,provider,signed};
}
test('failed payment can be recovered and the student may switch plans without losing history',async t=>{
 const f=await fixture(t);
 await f.billing.checkout(student,'starter');
 const old=[...f.provider.keys()][0];
 await assert.rejects(f.billing.checkout(student,'standard'),{status:409});
 f.provider.get(old).status='failed';
 assert.deepEqual(await f.billing.recover(student),{retry:true});
 const result=await f.billing.checkout(student,'standard');
 assert.match(result.url,/checkout\.paystack\.com/);
 assert.notEqual([...f.provider.keys()][1],old);
 const rows=(await f.db.query('SELECT plan_id,state FROM paystack_live_checkouts ORDER BY created_at')).rows;
 assert.ok(rows.some(r=>r.plan_id==='starter'&&r.state==='closed'));
 assert.ok(rows.some(r=>r.plan_id==='standard'&&r.state==='open'));
});
test('pending and uncertain payments cannot be discarded or charged a second time',async t=>{
 const f=await fixture(t);
 const original=await f.billing.checkout(student,'starter');
 await assert.rejects(f.billing.recover(student),{status:409});
 assert.deepEqual(await f.billing.checkout(student,'starter'),original);
 assert.equal(f.provider.size,1);
});
test('late successful payment on a previously closed checkout is held for support review',async t=>{
 const f=await fixture(t);
 await f.billing.checkout(student,'starter');
 const old=[...f.provider.keys()][0];
 f.provider.get(old).status='abandoned';
 await f.billing.recover(student);
 await f.billing.checkout(student,'standard');
 f.provider.get(old).status='success';
 await f.billing.webhook(...f.signed(old));
 assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM billing_live_entitlements')).rows[0].n,0);
 const status=await f.billing.status(student);
 assert.equal(status.paymentReview,true);
 assert.equal(status.payments.find(p=>p.reference===old).status,'on hold — contact support');
 await assert.rejects(f.billing.checkout(student,'starter'),{status:409});
});
test('hashed Gmail variants share one active trial, without storing plain addresses',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 const pool={query:(s,p)=>db.query(s,p)};
 const trial=createMockTrial(pool,{enabled:true,secret:'private-test-secret'});
 await trial.init();
 await trial.grant(pool,'user-one','John.Smith+visa@gmail.com');
 await trial.grant(pool,'user-two','johnsmith@googlemail.com');
 await trial.grant(pool,'user-three','another@gmail.com');
 assert.equal((await trial.status('user-one')).remaining,2);
 assert.equal(await trial.status('user-two'),null);
 assert.equal((await trial.status('user-three')).remaining,2);
 const accounts=(await db.query('SELECT identity_hash FROM mock_trial_accounts')).rows;
 assert.equal(accounts.length,2);
 assert.ok(accounts.every(r=>/^[a-f0-9]{64}$/.test(r.identity_hash)));
 assert.equal(trialEmailIdentity('John.Smith+visa@gmail.com','private-test-secret'),
   trialEmailIdentity('johnsmith@googlemail.com','private-test-secret'));
 assert.notEqual(trialEmailIdentity('alex+test@outlook.com','private-test-secret'),
   trialEmailIdentity('alex@outlook.com','private-test-secret'));
});
