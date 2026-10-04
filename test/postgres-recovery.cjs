// Isolated schema in an explicitly disposable PostgreSQL database. No real email.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {Pool}=require('pg');
const {createPasswordRecovery}=require('../password-recovery');
const {verifyPassword}=require('../passwords');
if(!process.env.TEST_DATABASE_URL)throw new Error('TEST_DATABASE_URL is required');
test('recovery sends exact trusted links, expires safely, consumes once across pools and preserves profile state',async()=>{
  const schema='recovery_test_'+crypto.randomBytes(8).toString('hex');
  const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL});
  const pools=[],emails=[],diagnostics=[];
  const env={RESEND_API_KEY:'test-only',RESEND_FROM:'VisaAtlas <noreply@notify.visaatlasprep.com>'};
  try{
    await admin.query(`CREATE SCHEMA ${schema}`);
    for(let i=0;i<2;i++)pools.push(new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`}));
    const pool=pools[0];
    await pool.query('CREATE TABLE user_credentials(user_id TEXT PRIMARY KEY,password_hash TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0); CREATE TABLE app_state(id INTEGER PRIMARY KEY,data JSONB NOT NULL)');
    await pool.query("INSERT INTO user_credentials VALUES ('u1','original',0),('u2','other',0)");
    const state={users:[{id:'u1',email:'Student@Example.com'},{id:'u2',email:'other@example.com'}],reports:[{id:'keep'}],athletes:[{id:'a1',notes:'keep'}]};
    await pool.query('INSERT INTO app_state VALUES(1,$1)',[state]);
    let failSend=false;
    const send=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');emails.push(JSON.parse(options.body));return {ok:!failSend,status:failSend?403:200};};
    const services=pools.map(pool=>createPasswordRecovery(pool,{env,send,diagnostic:code=>diagnostics.push(code)}));
    const service=services[0];await service.init();
    const tokenFrom=mail=>new URL(mail.text.match(/https:\/\/\S+/)[0]).hash.slice(7);
    const issue=async email=>{await service.issue(email);return tokenFrom(emails.at(-1));};
    const reset=(token,password='A long replacement passphrase')=>({token,newPassword:password,confirmPassword:password});
    await service.issue('unknown@example.com');assert.equal(emails.length,0);
    const first=await issue('student@example.com');
    assert.equal(emails[0].from,env.RESEND_FROM);assert.deepEqual(emails[0].to,['student@example.com']);
    assert.match(emails[0].text,/https:\/\/visaatlasprep.com\/password-recovery.html#token=[a-f0-9]{64}/);
    assert.ok(!(await pool.query('SELECT * FROM password_reset_tokens')).rows.some(row=>JSON.stringify(row).includes(first)));
    await pool.query("UPDATE password_reset_tokens SET expires_at=NOW()-INTERVAL '1 second'");
    await assert.rejects(service.reset(reset(first)),{status:400});
    const a=await issue('student@example.com'),b=await issue('student@example.com');
    const outcomes=await Promise.allSettled([service.reset(reset(a)),services[1].reset(reset(b))]);
    assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
    const credential=(await pool.query("SELECT * FROM user_credentials WHERE user_id='u1'")).rows[0];
    assert.equal(credential.version,1);assert.equal(await verifyPassword('A long replacement passphrase',credential.password_hash),true);
    await assert.rejects(service.reset(reset(a)),{status:400});await assert.rejects(service.reset(reset(b)),{status:400});
    assert.equal((await pool.query("SELECT password_hash FROM user_credentials WHERE user_id='u2'")).rows[0].password_hash,'other');
    assert.deepEqual((await pool.query('SELECT data FROM app_state')).rows[0].data,state);
    // Per-email quota survives creating a new service, and another user still works.
    const count=emails.length;await assert.rejects(services[1].issue('student@example.com'),{status:429});assert.equal(emails.length,count);
    const other=await issue('other@example.com');
    await pool.query("UPDATE user_credentials SET version=version+1 WHERE user_id='u2'");
    await assert.rejects(service.reset(reset(other)),{status:400});
    failSend=true;
    await assert.rejects(service.issue('other@example.com'),{status:503});
    const failed=tokenFrom(emails.at(-1));await assert.rejects(service.reset(reset(failed)),{status:400});
    assert.ok(diagnostics.includes('PASSWORD_RECOVERY_PROVIDER_HTTP_403'));
    assert.ok(diagnostics.includes('PASSWORD_RECOVERY_PROVIDER_ACCEPTED'));
    assert.ok(diagnostics.includes('PASSWORD_RECOVERY_ACCOUNT_UNMATCHED'));
    assert.ok(diagnostics.every(code=>/^PASSWORD_RECOVERY_[A-Z0-9_]+$/.test(code)));
    // Reset global quota window; simultaneous workers cannot exceed 30 sends/attempts.
    failSend=false;await pool.query('DELETE FROM password_reset_limits');
    const attempts=await Promise.allSettled(Array.from({length:40},(_,i)=>services[i%2].issue('unknown'+i+'@example.com')));
    assert.equal(attempts.filter(x=>x.status==='fulfilled').length,30);
    assert.equal(attempts.filter(x=>x.status==='rejected' && x.reason.status===429).length,10);
    assert.equal((await pool.query("SELECT attempts FROM password_reset_limits WHERE bucket='global'")).rows[0].attempts,30);
    const before=emails.length;await assert.rejects(service.request('other@example.com'),{status:429});assert.equal(emails.length,before);
    // Regression: requests before registration still count, but no longer silently succeed.
    await pool.query('DELETE FROM password_reset_limits');
    for(let i=0;i<3;i++)await service.issue('new@example.com');
    await pool.query("INSERT INTO user_credentials VALUES ('new','original',0)");
    const updated={...state,users:[...state.users,{id:'new',email:'new@example.com'}]};
    await pool.query('UPDATE app_state SET data=$1 WHERE id=1',[updated]);
    await assert.rejects(services[1].request('new@example.com'),error=>error.status===429 && /Try again in/.test(error.publicMessage));
    assert.equal(emails.length,before);
    await pool.query("UPDATE password_reset_limits SET expires_at=NOW()-INTERVAL '1 second'");
    await services[1].issue('new@example.com');
    assert.equal(emails.length,before+1);assert.deepEqual(emails.at(-1).to,['new@example.com']);
  }finally{
    await Promise.all(pools.map(pool=>pool.end()));
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();
  }
});
