'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {createPartnerAccess}=require('../partner-access');
const {createBilling}=require('../billing-provider');
const student={id:'student-1',role:'athlete',email:'athlete@example.test',emailVerifiedAt:'2026-11-21T00:00:00Z'};
const token=n=>String(n).padStart(48,'0');
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());const query=(s,p)=>db.query(s,p);
 const pool={query,connect:async()=>({query,release(){}})};
 const p=createPartnerAccess(pool,{enabled:true});await p.init();await p.init();
 return {db,p,pool};
}
test('partner grant requires verified student, internal invoice reference, and owner identity',async t=>{
 const f=await fixture(t);
 await assert.rejects(f.p.grant({user:{...student,emailVerifiedAt:null},actorId:'owner',invoiceReference:'SCH-001'}),{status:400});
 await assert.rejects(f.p.grant({user:{...student,role:'manager'},actorId:'owner',invoiceReference:'SCH-001'}),{status:400});
 await assert.rejects(f.p.grant({user:student,actorId:'',invoiceReference:'SCH-001'}),{status:403});
 await assert.rejects(f.p.grant({user:student,actorId:'owner',invoiceReference:''}),{status:400});
 assert.equal((await f.p.list()).length,0);
});
test('private 12 mock / 8 tutor quota, persistence, immutable expiry, idempotent starts and revocation',async t=>{
 const f=await fixture(t);
 const first=await f.p.grant({user:student,actorId:'owner',invoiceReference:'SCH-001'});
 assert.equal(new Date(first.expires_at)-new Date(first.starts_at),30*86400000);
 let state=await f.p.status(student);
 assert.equal(state.sponsored,true);assert.equal(state.partner,'Scholarbook');
 assert.equal(state.modes.mock.remaining,12);assert.equal(state.modes.learn.remaining,8);
 await assert.rejects(f.p.grant({user:student,actorId:'owner',invoiceReference:'SCH-001'}),{status:409});
 for(let i=0;i<12;i++){
  await f.p.reserve(student,token(i+1),'mock');
  await f.p.reserve(student,token(i+1),'mock');
  await f.p.commit(student,token(i+1));await f.p.commit(student,token(i+1));
 }
 state=await f.p.status(student);
 assert.equal(state.modes.mock.remaining,0);assert.equal(state.modes.learn.remaining,8);
 await assert.rejects(f.p.reserve(student,token(30),'mock'),{status:402});
 await f.p.reserve(student,token(31),'learn');
 await f.p.release(student,token(31));
 await assert.rejects(f.p.reserve(student,token(31),'learn'),{status:409});
 await f.p.reserve(student,token(32),'learn');
 await f.p.commit(student,token(32));
 assert.equal((await f.p.status(student)).modes.learn.remaining,7);
 await f.p.revoke({grantId:first.id,actorId:'owner'});
 assert.equal(await f.p.status(student),null);
 assert.equal((await f.p.list())[0].revoked_by,'owner');
 await assert.rejects(f.p.revoke({grantId:first.id,actorId:'owner'}),{status:409});
 assert.equal(await f.p.reserve(student,token(99),'learn'),false);
 const second=await f.p.grant({user:student,actorId:'owner',invoiceReference:'SCH-002'});
 assert.notEqual(second.id,first.id);
 assert.equal((await f.p.status(student)).modes.mock.remaining,12);
});
test('partner usage rejects wrong owners and modes and never spends another account quota',async t=>{
 const f=await fixture(t);await f.p.grant({user:student,actorId:'owner',invoiceReference:'SCH-001'});
 const other={...student,id:'student-2'};
 assert.equal(await f.p.reserve(other,token(1),'mock'),false);
 await assert.rejects(f.p.reserve(student,token(1),'not-a-mode'),{status:400});
 await f.p.reserve(student,token(1),'mock');
 await f.p.commit(student,token(1));
 assert.equal((await f.p.status(student)).modes.mock.remaining,11);
 await f.p.removeUser(student.id);
 assert.equal(await f.p.status(student),null);
});
test('billing-provider integrates partner grant without Paystack rows or fake charges',async t=>{
 const db=new PGlite();t.after(()=>db.close());const query=(s,p)=>db.query(s,p),pool={query,connect:async()=>({query,release(){}})};
 const env={BILLING_MODE:'live',BILLING_PROVIDER:'paystack',PAYSTACK_SECRET_KEY:'sk_live_fixture',
  BILLING_LIVE_USD_READY:'confirmed',BILLING_ORIGIN:'https://example.test'};
 const billing=createBilling(pool,{env});await billing.init();
 await billing.partnerAccess.grant({user:student,actorId:'owner',invoiceReference:'SCH-100'});
 let status=await billing.status(student);assert.equal(status.access.sponsored,true);
 assert.equal(status.access.modes.mock.remaining,12);
 await assert.rejects(billing.checkout(student,'starter'),{status:409});
 const paystack=(await db.query('SELECT COUNT(*)::int AS n FROM paystack_live_payments')).rows[0].n;
 assert.equal(paystack,0);
 await billing.access.reserve(student,token(1),'mock');await billing.access.commit(student,token(1));
 status=await billing.status(student);
 assert.equal(status.access.modes.mock.remaining,11);assert.equal(status.access.modes.learn.remaining,8);
 const trial=(await db.query('SELECT COUNT(*)::int AS n FROM mock_trial_usage')).rows[0].n;
 assert.equal(trial,0);
});
