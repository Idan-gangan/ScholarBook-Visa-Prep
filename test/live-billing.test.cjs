'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite'),{createHmac}=require('node:crypto');
const {createBilling,configuration}=require('../paystack-billing');
const env={BILLING_MODE:'live',BILLING_LIVE_USD_READY:'confirmed',PAYSTACK_SECRET_KEY:'sk_live_fixture',BILLING_ORIGIN:'https://example.test',BILLING_LIVE_USER_IDS:'u1,u2'};
const user={id:'u1',email:'student@example.test'};
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());const query=(s,p)=>db.query(s,p),pool={query,connect:async()=>({query,release(){}})};
 let initialized,changes={};const calls=[];
 const request=async(url,options)=>{calls.push(url);if(url.endsWith('/initialize')){initialized=JSON.parse(options.body);return {ok:true,json:async()=>({status:true,data:{reference:initialized.reference,authorization_url:'https://checkout.paystack.com/fixture'}})}};
 return {ok:true,json:async()=>({status:true,data:{domain:'live',reference:initialized.reference,amount:Number(initialized.amount),currency:'USD',customer:{email:user.email},status:'success',paid_at:new Date().toISOString(),...changes}})};};
 const billing=createBilling(pool,{env,request});await billing.init();await billing.init();
 function event(name='charge.success',patch={}){const data=name==='charge.success'?{reference:initialized.reference,domain:'live',...patch}:{transaction_reference:initialized.reference,domain:'live',...patch};const raw=Buffer.from(JSON.stringify({event:name,data}));return [raw,{'x-paystack-signature':createHmac('sha512',env.PAYSTACK_SECRET_KEY).update(raw).digest('hex')}];}
 return {db,pool,billing,calls,event,set:p=>changes=p,get initialized(){return initialized}};
}
test('live launch requires matching keys and USD confirmation but no pilot allowlist',()=>{
 for(const patch of [{PAYSTACK_SECRET_KEY:'sk_test_fixture'},{BILLING_LIVE_USD_READY:''}])assert.throws(()=>configuration({...env,...patch}));
 const c=configuration({...env,PAYSTACK_TEST_PLANS:'{"starter":{"amount":1}}'});assert.deepEqual(c.plans,{starter:{amount:2900,currency:'USD',access:{days:30,sessions:12,mock:6,learn:6}},standard:{amount:4900,currency:'USD',access:{days:30,sessions:20,mock:12,learn:8}}});
});
test('live payment uses separate ledger, fixed $29 terms, exactly 6 mock and 6 tutor starts and depleted-plan repurchase',async t=>{
 const f=await fixture(t);assert.doesNotThrow(()=>f.billing.authorize({id:'other'}));
 await assert.rejects(f.billing.access.reserve(user,'a'.repeat(48),'mock'),{status:402});
 await f.billing.checkout(user,'starter');assert.equal(f.initialized.amount,'2900');assert.equal(f.initialized.currency,'USD');assert.equal(f.initialized.callback_url,'https://example.test/billing.html');
 await f.billing.webhook(...f.event());await f.billing.webhook(...f.event());
 assert.equal((await f.billing.status(user)).mode,'live');assert.equal((await f.billing.access.status(user)).remaining,12);
 await assert.rejects(f.billing.checkout(user,'starter'),{status:409});
 for(let i=0;i<12;i++){const token=i.toString(16).padStart(48,'0');await f.billing.access.reserve(user,token,i%2?'mock':'learn');await f.billing.access.commit(user,token);}
 await assert.rejects(f.billing.access.reserve(user,'b'.repeat(48),'mock'),{status:402});
 await f.billing.webhook(...f.event());assert.equal((await f.billing.access.status(user)).remaining,0);
 const old=f.initialized.reference;await f.billing.checkout(user,'starter');assert.notEqual(f.initialized.reference,old);await f.billing.webhook(...f.event());assert.equal((await f.billing.access.status(user)).remaining,12);
 assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM paystack_live_payments')).rows[0].n,2);
 assert.equal((await f.db.query("SELECT to_regclass('paystack_test_payments') AS name")).rows[0].name,null);
});
test('test events and mismatched provider values cannot grant live access',async t=>{
 const f=await fixture(t);await f.billing.checkout(user,'starter');
 await assert.rejects(f.billing.webhook(...f.event('charge.success',{domain:'test'})),{status:400});
 for(const patch of [{domain:'test'},{amount:100},{currency:'NGN'},{customer:{email:'other@example.test'}}]){f.set(patch);await assert.rejects(f.billing.verify(user),{status:409});}
 assert.equal((await f.billing.access.status(user)).remaining,0);
});
test('refund before success remains on hold after verification and duplicate events',async t=>{
 const f=await fixture(t);await f.billing.checkout(user,'starter');
 await f.billing.webhook(...f.event('refund.processed'));await f.billing.webhook(...f.event());
 await f.billing.webhook(...f.event());assert.equal((await f.billing.access.status(user)).active,false);
 await assert.rejects(f.billing.access.reserve(user,'c'.repeat(48),'learn'),{status:402});
 assert.equal((await f.billing.history({role:'owner'})).payments[0].hold_reason,'refund.processed');
});
test('dispute prevents further starts and failed starts release only their reservation',async t=>{
 const f=await fixture(t);await f.billing.checkout(user,'starter');await f.billing.webhook(...f.event());
 const token='d'.repeat(48);await f.billing.access.reserve(user,token,'mock');await f.billing.access.release(user,token);assert.equal((await f.billing.access.status(user)).remaining,12);
 await f.billing.webhook(...f.event('charge.dispute.create',{transaction_reference:undefined,transaction:{reference:f.initialized.reference,domain:'live'}}));
 assert.equal((await f.billing.access.status(user)).active,false);
});

test('each category is enforced independently and standard grants the purchased 12/8 limits',async t=>{
 const f=await fixture(t);await f.billing.checkout(user,'standard');assert.equal(f.initialized.amount,'4900');await f.billing.webhook(...f.event());
 for(let i=0;i<12;i++){const token=i.toString(16).padStart(48,'0');await f.billing.access.reserve(user,token,'mock');await f.billing.access.commit(user,token);}
 await assert.rejects(f.billing.access.reserve(user,'e'.repeat(48),'mock'),{status:402});
 let access=await f.billing.access.status(user);assert.equal(access.modes.mock.remaining,0);assert.equal(access.modes.learn.remaining,8);
 await assert.rejects(f.billing.checkout(user,'starter'),{status:409});
 await f.billing.access.reserve(user,'f'.repeat(48),'learn');await f.billing.access.release(user,'f'.repeat(48));assert.equal((await f.billing.access.status(user)).modes.learn.remaining,8);
 await f.billing.webhook(...f.event());assert.equal((await f.billing.access.status(user)).modes.mock.remaining,0);
 const history=(await f.billing.history({role:'owner'})).payments[0];assert.equal(history.mock_used,12);assert.equal(history.learn_used,0);
});
test('legacy purchased shared allowances keep their original terms after schema migration',async t=>{
 const f=await fixture(t);await f.billing.checkout(user,'starter');
 await f.db.query('UPDATE paystack_live_checkouts SET access_snapshot=$1',[JSON.stringify({days:30,sessions:20})]);
 await f.billing.webhook(...f.event());await f.billing.init();
 for(let i=0;i<20;i++){const token=i.toString(16).padStart(48,'0');await f.billing.access.reserve(user,token,'mock');await f.billing.access.commit(user,token);}
 assert.equal((await f.billing.access.status(user)).remaining,0);assert.equal((await f.billing.access.status(user)).modes,undefined);
});
test('invalid category configurations are rejected',()=>{
 const {validateAccess}=require('../billing-access');
 for(const limits of [{mock:6},{mock:6,learn:5},{mock:0,learn:12},{mock:6.5,learn:5.5}])assert.throws(()=>validateAccess({days:30,sessions:12,...limits}));
});

test('public live billing enforces purchase for accounts outside the former pilot and keeps users isolated',async t=>{
 const f=await fixture(t),newUser={id:'new-student',email:'new@example.test'};
 assert.doesNotThrow(()=>configuration({...env,BILLING_LIVE_USER_IDS:''}));
 assert.throws(()=>f.billing.authorize(null),{status:401});
 assert.throws(()=>f.billing.authorize({id:''}),{status:401});
 assert.equal((await f.billing.status(newUser)).access.enforced,true);
 await assert.rejects(f.billing.access.requireActive(newUser),{status:402});
 await assert.rejects(f.billing.access.reserve(newUser,'9'.repeat(48),'mock'),{status:402});
 await f.billing.checkout(newUser,'starter');
 f.set({customer:{email:newUser.email}});
 await f.billing.webhook(...f.event());
 assert.equal((await f.billing.status(newUser)).access.remaining,12);
 assert.equal((await f.billing.status(user)).access.active,false);
 await f.billing.access.reserve(newUser,'9'.repeat(48),'mock');
 await f.billing.access.commit(newUser,'9'.repeat(48));
 assert.equal((await f.billing.status(newUser)).access.modes.mock.remaining,5);
 await assert.rejects(f.billing.access.reserve(user,'8'.repeat(48),'mock'),{status:402});
});

test('new registration trial gives exactly two mock starts, is idempotent, and never grants tutor or payment access',async t=>{
 const f=await fixture(t),a=f.billing.access;
 await a.grantTrial(f.pool,user.id);await a.grantTrial(f.pool,user.id);
 assert.deepEqual((await a.status(user)).trial,{limit:2,used:0,remaining:2});
 await assert.rejects(a.reserve(user,'a'.repeat(48),'learn'),{status:402});
 await assert.rejects(a.requireActive(user),{status:402});
 await assert.rejects(a.reserve({id:'other'},'a'.repeat(48),'mock'),{status:402});
 for(const token of ['a'.repeat(48),'b'.repeat(48)]){
  await a.reserve(user,token,'mock');await a.reserve(user,token,'mock');
  await a.commit(user,token);await a.commit(user,token);await a.release(user,token);
 }
 assert.equal((await a.status(user)).trial.remaining,0);
 await assert.rejects(a.reserve(user,'c'.repeat(48),'mock'),{status:402});
 await a.grantTrial(f.pool,user.id);assert.equal((await a.status(user)).trial.remaining,0);
 assert.equal((await f.billing.history({role:'owner'})).payments.length,0);
 await f.billing.checkout(user,'starter');await f.billing.webhook(...f.event());
 assert.equal((await a.status(user)).modes.mock.remaining,6);
});
test('trial failed starts are refunded, consumed starts are not; purchased allowance takes priority',async t=>{
 const f=await fixture(t),a=f.billing.access,token='c'.repeat(48);
 await a.grantTrial(f.pool,user.id);await a.reserve(user,token,'mock');await a.release(user,token);
 assert.equal((await a.status(user)).trial.remaining,2);
 await assert.rejects(a.reserve(user,token,'mock'),{status:409});
 const pending='d'.repeat(48);await a.reserve(user,pending,'mock');
 await f.billing.checkout(user,'starter');await f.billing.webhook(...f.event());
 await a.commit(user,pending);assert.equal((await a.status(user)).remaining,12);
 await a.reserve(user,'e'.repeat(48),'mock');await a.commit(user,'e'.repeat(48));
 assert.equal((await a.status(user)).modes.mock.remaining,5);
 await a.removeTrial(f.pool,user.id);
 assert.equal((await f.db.query('SELECT * FROM mock_trial_usage')).rows.length,0);
});


test('existing students receive a one-time trial on status or direct start without resetting used sessions',async t=>{
 const f=await fixture(t),a=f.billing.access,old={id:'old-student',role:'athlete'},direct={id:'direct-student',role:'athlete'};
 assert.equal((await a.status(old)).trial.remaining,2);
 for(const token of ['1'.repeat(48),'2'.repeat(48)]){
  await a.reserve(old,token,'mock');await a.commit(old,token);
 }
 assert.equal((await a.status(old)).trial.remaining,0);
 await a.init();assert.equal((await a.status(old)).trial.remaining,0);
 await assert.rejects(a.reserve(old,'3'.repeat(48),'mock'),{status:402});
 await a.reserve(direct,'4'.repeat(48),'mock');await a.commit(direct,'4'.repeat(48));
 assert.equal((await a.status(direct)).trial.remaining,1);
 await assert.rejects(a.reserve(direct,'5'.repeat(48),'learn'),{status:402});
 for(const role of ['owner','coach'])assert.equal((await a.status({id:role,role})).trial,null);
 assert.equal((await a.status({id:'paused',role:'athlete',accessSuspended:true})).trial,null);
});
test('existing paid students keep their full paid allowance when the trial is provisioned',async t=>{
 const f=await fixture(t);await f.billing.checkout(user,'starter');await f.billing.webhook(...f.event());
 const access=await f.billing.access.status({...user,role:'athlete'});
 assert.equal(access.remaining,12);assert.equal(access.modes.mock.remaining,6);
 assert.equal((await f.db.query('SELECT * FROM mock_trial_accounts WHERE user_id=$1',[user.id])).rows.length,1);
});
