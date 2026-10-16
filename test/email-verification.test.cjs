const {test}=require('node:test'),assert=require('node:assert/strict');
const {createEmailVerification,needsVerification}=require('../email-verification');
function fixture(){
 let db={users:[{id:'u',email:'student@example.test',verificationRequired:true}],athletes:[{userId:'u',email:'student@example.test'}]},time=100000000,queue=Promise.resolve(),failSend=false;
 const sent=[];
 const mutateDb=fn=>{const job=queue.then(async()=>{const copy=structuredClone(db);const out=await fn(copy,{});db=copy;return out;});queue=job.catch(()=>{});return job;};
 const service=createEmailVerification({mutateDb,now:()=>time,env:{RESEND_API_KEY:'test-key',RESEND_FROM:'VisaAtlas <test@example.test>',APP_BASE_URL:'https://example.test'},send:async(url,options)=>{sent.push(JSON.parse(options.body));return {ok:!failSend};}});
 const token=()=>sent.at(-1).text.match(/#token=([a-f0-9]{64})/)[1];
 return {service,sent,token,db:()=>db,advance:()=>time+=61000,expire:()=>time+=86400001,fail:()=>failSend=true,mutateDb};
}
test('verification uses a hashed expiring token, cannot replay, and does not elevate roles',async()=>{
 const f=fixture();await f.service.request('u');const token=f.token();
 assert.equal(JSON.stringify(f.db()).includes(token),false);
 assert.equal(needsVerification(f.db().users[0]),true);
 await f.service.verify(token);assert.equal(needsVerification(f.db().users[0]),false);
 assert.equal(f.db().users[0].emailVerification,undefined);
 await assert.rejects(f.service.verify(token));
 assert.equal(needsVerification({id:'legacy',role:'athlete'}),false);
});
test('resend invalidates earlier links and persistent cooldown blocks concurrent sends',async()=>{
 const f=fixture();const results=await Promise.allSettled([f.service.request('u'),f.service.request('u')]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);const old=f.token();
 f.advance();await f.service.request('u');await assert.rejects(f.service.verify(old));
 f.expire();await assert.rejects(f.service.verify(f.token()));
});
test('changing an unverified address invalidates old token and cannot take an existing email',async()=>{
 const f=fixture();await f.service.request('u');const old=f.token();f.advance();let checked=false;
 await f.service.request('u',{newEmail:'New@example.test',beforeChange:async()=>{checked=true;}});
 assert.equal(checked,true);assert.equal(f.db().users[0].email,'new@example.test');assert.equal(f.db().athletes[0].email,'new@example.test');
 await assert.rejects(f.service.verify(old));
 f.advance();await f.mutateDb(db=>db.users.push({id:'other',email:'taken@example.test'}));
 await assert.rejects(f.service.request('u',{newEmail:'taken@example.test'}));
 assert.equal(f.db().users[0].email,'new@example.test');
});
test('delivery failure and missing configuration do not verify accounts or leak provider details',async()=>{
 const f=fixture();f.fail();await assert.rejects(f.service.request('u'),/could not be sent/);assert.equal(needsVerification(f.db().users[0]),true);
 const service=createEmailVerification({mutateDb:f.mutateDb,env:{}});
 await assert.rejects(service.request('u'),/not available/);
 await assert.rejects(f.service.verify('bad'));
});
test('country calling codes and optional phone normalization cover multiple regions',()=>{
 const {countries,normalizePhone}=require('../profile-options');
 assert.ok(countries.length>200);
 for(const [code,dial] of [['NG','+234'],['KE','+254'],['US','+1'],['DE','+49'],['IN','+91']])assert.equal(countries.find(c=>c.code===code).callingCode,dial);
 assert.equal(normalizePhone(''),'');assert.equal(normalizePhone('07031234567','NG'),'+2347031234567');
 assert.throws(()=>normalizePhone('123','NG'));
});
