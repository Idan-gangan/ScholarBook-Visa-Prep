const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPasswordRecovery,MESSAGE}=require('../password-recovery');
const env={RESEND_API_KEY:'test-only',RESEND_FROM:'Test <test@example.com>'};
test('recovery rejects malformed input and missing configuration before database work',async()=>{
  const pool={query(){throw new Error('unexpected database call')}};
  const service=createPasswordRecovery(pool,{env});
  for(const email of [null,{},'bad','a'.repeat(161)+'@example.com'])assert.throws(()=>service.request(email),{status:400});
  assert.throws(()=>createPasswordRecovery(pool,{env:{}}).request('a@example.com'),{status:503});
  for(const origin of ['http://example.com','https://example.com/path','https://user@example.com']){
    assert.throws(()=>createPasswordRecovery(pool,{env:{...env,APP_BASE_URL:origin}}).request('a@example.com'),{status:503});
  }
  for(const token of ['',{},'z'.repeat(64),'a'.repeat(65)])await assert.rejects(service.reset({token}),{status:400});
  await assert.rejects(service.reset({token:'a'.repeat(64),newPassword:'short',confirmPassword:'short'}),{status:400});
  await assert.rejects(service.reset({token:'a'.repeat(64),newPassword:'long enough password',confirmPassword:'different'}),{status:400});
});
test('request responds uniformly before lookup and background failures use only fixed diagnostics',async()=>{
  const logs=[];let calls=0;
  const pool={async connect(){calls++;throw new Error('sensitive provider details')}};
  const service=createPasswordRecovery(pool,{env,diagnostic:code=>logs.push(code)});
  assert.deepEqual(service.request('known@example.com'),{ok:true,message:MESSAGE});
  assert.deepEqual(service.request('unknown@example.com'),{ok:true,message:MESSAGE});
  assert.equal(calls,0);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,2);assert.deepEqual(logs,['PASSWORD_RECOVERY_SEND_FAILED','PASSWORD_RECOVERY_SEND_FAILED']);
});
