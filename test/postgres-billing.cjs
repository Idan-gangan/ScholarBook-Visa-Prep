// Disposable PostgreSQL only. Two independent pools exercise real row locks.
const {test}=require('node:test'),assert=require('node:assert/strict'),{Pool}=require('pg');
const {createBilling}=require('../paystack-billing');
const {createHmac,randomBytes}=require('node:crypto');
if(!process.env.TEST_DATABASE_URL)throw Error('TEST_DATABASE_URL is required');
test('concurrent checkout, notification replay and last-session admission across PostgreSQL pools',async()=>{
  const schema='billing_test_'+randomBytes(8).toString('hex');
  const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pools=[];
  try{
    await admin.query('CREATE SCHEMA '+schema);
    for(let i=0;i<2;i++)pools.push(new Pool({connectionString:process.env.TEST_DATABASE_URL,options:'-c search_path='+schema}));
    const env={BILLING_MODE:'test',PAYSTACK_SECRET_KEY:'sk_test_fixture',BILLING_ORIGIN:'https://example.test',BILLING_TEST_USER_IDS:'u1',BILLING_TEST_ACCESS:'enabled',PAYSTACK_TEST_PLANS:JSON.stringify({test:{amount:10000,currency:'NGN',access:{days:30,sessions:1}}})};
    const user={id:'u1',email:'test@example.test'};let body,initializations=0;
    const request=async(url,options)=>{
      if(url.endsWith('/initialize')){initializations++;body=JSON.parse(options.body);return {ok:true,json:async()=>({status:true,data:{reference:body.reference,authorization_url:'https://checkout.paystack.com/fixture'}})};}
      return {ok:true,json:async()=>({status:true,data:{reference:body.reference,domain:'test',amount:10000,currency:'NGN',customer:{email:user.email},status:'success',paid_at:new Date().toISOString()}})};
    };
    const a=createBilling(pools[0],{env,request}),b=createBilling(pools[1],{env,request});await a.init();await b.init();
    const checkouts=await Promise.allSettled(Array.from({length:12},(_,i)=>(i%2?a:b).checkout(user,'test')));
    assert.ok(checkouts.some(r=>r.status==='fulfilled'));assert.equal(initializations,1);
    assert.equal((await pools[0].query('SELECT * FROM paystack_test_checkouts')).rows.length,1);
    const raw=Buffer.from(JSON.stringify({event:'charge.success',data:{reference:body.reference,domain:'test'}}));
    const headers={'x-paystack-signature':createHmac('sha512',env.PAYSTACK_SECRET_KEY).update(raw).digest('hex')};
    await Promise.all(Array.from({length:12},(_,i)=>(i%2?a:b).webhook(raw,headers)));
    assert.equal((await pools[0].query('SELECT * FROM billing_test_entitlements')).rows.length,1);
    const starts=await Promise.allSettled(Array.from({length:12},(_,i)=>(i%2?a:b).access.reserve(user,String(i).padStart(48,'0'),i%2?'mock':'learn')));
    assert.equal(starts.filter(r=>r.status==='fulfilled').length,1);
    assert.equal((await a.access.status(user)).remaining,0);
    assert.equal((await b.history({role:'owner'})).payments[0].sessions_used,1);
  }finally{
    await Promise.all(pools.map(p=>p.end()));await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end();
  }
});
