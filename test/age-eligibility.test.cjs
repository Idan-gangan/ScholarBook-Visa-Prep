const {test}=require('node:test'),assert=require('node:assert/strict');
const {checkAge,consumePermission,createGuardianPermissions,NOTICE_VERSION}=require('../age-eligibility');
function fixture(){
 let db={users:[],athletes:[]},time=Date.now(),queue=Promise.resolve(),fail=false;const sent=[];
 const mutateDb=fn=>{const result=queue.then(async()=>{const copy=structuredClone(db);const out=await fn(copy,{});db=copy;return out;});queue=result.catch(()=>{});return result;};
 const service=createGuardianPermissions({mutateDb,now:()=>time,env:{RESEND_API_KEY:'test',RESEND_FROM:'test@example.test',APP_BASE_URL:'https://example.test'},send:async(url,opt)=>{sent.push(JSON.parse(opt.body));return {ok:!fail};}});
 const body={ageBand:'13-17',email:'student@example.test',guardianEmail:'parent@example.test'};
 const token=()=>sent.at(-1).text.match(/#token=([a-f0-9]{64})/)[1];
 const approve=()=>service.respond({token:token(),action:'approve',isGuardian:true,permission:true,noticeVersion:NOTICE_VERSION});
 return {service,body,token,approve,sent,db:()=>db,mutateDb,consume:id=>mutateDb(db=>consumePermission(db,{ageBand:'13-17',guardianRequest:id},body.email,time)),advance:n=>time+=n,fail:()=>fail=true};
}
test('age gate rejects missing, malformed and under-13 ages; adult declaration needs no guardian',()=>{
 for(const ageBand of [undefined,null,13,'under13','17',{},[]])assert.throws(()=>checkAge({ageBand}));
 const record=consumePermission({}, {ageBand:'18+'},'test@example.test');assert.equal(record.ageBand,'18+');assert.equal(record.guardian,undefined);
});
test('teen registration requires an unexpired, email-bound, approved request and consumes it once',async()=>{
 const f=fixture(),request=await f.service.request(f.body);
 assert.equal(f.db().users.length,0);assert.equal(f.db().athletes.length,0);
 assert.equal(JSON.stringify(f.db()).includes(f.token()),false);assert.equal(JSON.stringify(f.db()).includes(request.requestId),false);
 await assert.rejects(f.consume(request.requestId),/permission is missing/);
 await assert.rejects(f.service.respond({token:f.token(),action:'approve',isGuardian:'true',permission:true,noticeVersion:NOTICE_VERSION}));
 await f.approve();
 assert.throws(()=>consumePermission(f.db(),{ageBand:'13-17',guardianRequest:request.requestId},'other@example.test'),/missing/);
 const results=await Promise.allSettled([f.consume(request.requestId),f.consume(request.requestId)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const record=results.find(r=>r.status==='fulfilled').value;
 assert.equal(record.guardian.email,'parent@example.test');assert.equal(record.guardian.noticeVersion,NOTICE_VERSION);
 assert.equal(f.db().guardianPermissions.length,0);
 await assert.rejects(f.approve(),/invalid/);
});
test('decline and expiry prevent account creation; approval requires current notice and both declarations',async()=>{
 const f=fixture(),r=await f.service.request(f.body);
 for(const extra of [{isGuardian:false,permission:true,noticeVersion:NOTICE_VERSION},{isGuardian:true,permission:false,noticeVersion:NOTICE_VERSION},{isGuardian:true,permission:true,noticeVersion:'old'}])await assert.rejects(f.service.respond({token:f.token(),action:'approve',...extra}));
 await f.service.respond({token:f.token(),action:'decline'});await assert.rejects(f.consume(r.requestId));
 f.advance(61000);const second=await f.service.request(f.body);await f.approve();f.advance(86400001);await assert.rejects(f.consume(second.requestId));
});
test('mail failures do not enable permission and persistent limits bound repeated requests',async()=>{
 const f=fixture();await assert.rejects(f.service.request({...f.body,ageBand:'under13'}));
 await assert.rejects(f.service.request({...f.body,guardianEmail:f.body.email}));assert.equal(f.sent.length,0);
 f.fail();await assert.rejects(f.service.request(f.body));assert.equal(f.db().guardianPermissions.length,0);
 await assert.rejects(f.service.request(f.body),/wait/);
});
test('failed account transaction restores consumed permission for retry',async()=>{
 const f=fixture(),r=await f.service.request(f.body);await f.approve();
 await assert.rejects(f.mutateDb(db=>{consumePermission(db,{ageBand:'13-17',guardianRequest:r.requestId},f.body.email);throw Error('rollback');}));
 assert.equal(f.db().guardianPermissions.length,1);assert.ok((await f.consume(r.requestId)).guardian);
});
