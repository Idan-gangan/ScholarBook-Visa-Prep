const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
const version=source.match(/const TERMS_VERSION = "([^"]+)"/)[1];
const route=source.slice(source.indexOf('    if(req.method==="POST" && url.pathname==="/api/register-athlete")'),source.indexOf('    if(req.method==="POST" && url.pathname==="/api/login")'));
async function register(extra){
 const db={users:[],athletes:[]};let writes=0,hashes=0,response;
 const body={name:'Test Student',email:'test@example.test',password:'A sufficiently long password',...extra};
 const res={writeHead(status){response={status};},end(value){response.body=JSON.parse(value);}};
 await vm.runInNewContext('(async()=>{'+route+'})()',{
 req:{method:'POST'},url:{pathname:'/api/register-athlete'},res,TERMS_VERSION:version,
 readBody:async()=>Buffer.from(JSON.stringify(body)),json:(_res,status,body)=>response={status,body},
 clean:(value,max=1000)=>String(value||'').trim().slice(0,max),validPassword:()=>true,
 allowAuth:()=>true,sha:value=>value,hashPassword:async()=>{hashes++;return 'hash';},
 makeId:prefix=>prefix+'1',normalizeEmail:value=>value.toLowerCase(),
 mutateDb:async fn=>{writes++;await fn(db,{query:async()=>{}});},
 stateError:(status,message)=>Object.assign(new Error(message),{status}),startSession:()=> 'session',
 emailVerification:{request:async()=>({message:'Check your email'})},sessionCookie:()=> 'cookie',
 });
 return {db,writes,hashes,response};
}
test('registration rejects missing, false and non-boolean acceptance before any account writes',async()=>{
 for(const termsAccepted of [undefined,false,'true',1,{},[]]){
  const result=await register({termsAccepted,termsVersion:version});
  assert.equal(result.response.status,400);assert.equal(result.writes,0);assert.equal(result.hashes,0);
 }
});
test('registration rejects missing or stale terms versions',async()=>{
 for(const termsVersion of [undefined,'2020-01-01']){
  const result=await register({termsAccepted:true,termsVersion});
  assert.equal(result.response.status,400);assert.equal(result.writes,0);
 }
});
test('accepted registration saves the version and server time with the user, ignoring forged metadata',async()=>{
 const before=Date.now();
 const result=await register({termsAccepted:true,termsVersion:version,acceptedAt:'1990-01-01',termsAcceptance:{version:'fake',acceptedAt:'1990-01-01'}});
 assert.equal(result.response.status,201);assert.equal(result.db.users.length,1);assert.equal(result.db.athletes.length,1);
 const record=result.db.users[0].termsAcceptance;
 assert.equal(record.version,version);assert.equal(record.source,'self-registration');
 assert.ok(Date.parse(record.acceptedAt)>=before && Date.parse(record.acceptedAt)<=Date.now());
});
test('registration UI requires an initially unchecked checkbox with matching version and linked policies',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 const input=html.match(/<input id="r_terms"[^>]+>/)[0];
 assert.match(input,/type="checkbox"/);assert.match(input,/\brequired\b/);assert.doesNotMatch(input,/\bchecked\b/);
 assert.ok(input.includes('data-terms-version="'+version+'"'));assert.match(html,/<label for="r_terms">/);
 assert.match(html,/termsAccepted:\$\("r_terms"\).checked/);
});
