const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPasswordRecovery,MESSAGE}=require('../password-recovery');
const env={RESEND_API_KEY:'test-only',RESEND_FROM:'Test <test@example.com>'};
test('recovery rejects malformed input and missing configuration before database work',async()=>{
  const pool={query(){throw new Error('unexpected database call')}};
  const service=createPasswordRecovery(pool,{env});
  for(const email of [null,{},'bad','a'.repeat(161)+'@example.com'])await assert.rejects(service.request(email),{status:400});
  await assert.rejects(createPasswordRecovery(pool,{env:{}}).request('a@example.com'),{status:503});
  for(const origin of ['http://example.com','https://example.com/path','https://user@example.com']){
    await assert.rejects(createPasswordRecovery(pool,{env:{...env,APP_BASE_URL:origin}}).request('a@example.com'),{status:503});
  }
  for(const token of ['',{},'z'.repeat(64),'a'.repeat(65)])await assert.rejects(service.reset({token}),{status:400});
  await assert.rejects(service.reset({token:'a'.repeat(64),newPassword:'short',confirmPassword:'short'}),{status:400});
  await assert.rejects(service.reset({token:'a'.repeat(64),newPassword:'long enough password',confirmPassword:'different'}),{status:400});
});
test('request checks admission first but acknowledges before account lookup; background errors stay private',async()=>{
  const logs=[];let lookups=0;
  const pool={async connect(){return {async query(){return {rowCount:1,rows:[]}},release(){}}},async query(){lookups++;throw new Error('sensitive provider details')}};
  const service=createPasswordRecovery(pool,{env,diagnostic:code=>logs.push(code)});
  assert.deepEqual(await service.request('known@example.com'),{ok:true,message:MESSAGE});
  assert.deepEqual(await service.request('unknown@example.com'),{ok:true,message:MESSAGE});
  assert.equal(lookups,0);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(lookups,2);assert.deepEqual(logs,['PASSWORD_RECOVERY_SEND_FAILED','PASSWORD_RECOVERY_SEND_FAILED']);
});
test('quota rejection includes remaining wait and never starts account lookup or delivery',async()=>{
  const pool={async connect(){return {async query(sql){
    if(sql.startsWith('INSERT'))return {rowCount:0,rows:[]};
    if(sql.startsWith('SELECT'))return {rows:[{retry_after:125}]};
    return {rows:[]};
  },release(){}}},async query(){throw new Error('lookup must not run')}};
  const service=createPasswordRecovery(pool,{env});
  for(let i=0;i<7;i++)await assert.rejects(service.request('a@example.com'),error=>error.status===429 && error.publicMessage.includes('3 minute(s)'));
});
test('busy service rejects instead of falsely acknowledging; admission failures release capacity',async()=>{
  const pool={async connect(){return {async query(){return {rowCount:1,rows:[]}},release(){}}},async query(){throw new Error('test lookup failure')}};
  const service=createPasswordRecovery(pool,{env});
  const admitted=Array.from({length:5},()=>service.request('a@example.com'));
  await assert.rejects(service.request('a@example.com'),{status:503});
  await Promise.all(admitted);await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await service.request('a@example.com')).ok,true);
  await new Promise(resolve=>setImmediate(resolve));
  const failing=createPasswordRecovery({async connect(){throw new Error('database unavailable')}},{env});
  for(let i=0;i<7;i++)await assert.rejects(failing.request('a@example.com'),/database unavailable/);
});
