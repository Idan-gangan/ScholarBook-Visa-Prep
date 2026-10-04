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
