const {test}=require('node:test');
const assert=require('node:assert/strict');
const {POLICY,createVoiceLimits}=require('../voice-limits');
function fixture(){
 const daily=new Map(),calls=new Map(),requests=[];let failHangup=false,failTrack=false,day=1;
 const pool={query:async(sql,args=[])=>{
   if(sql.startsWith('CREATE TABLE'))return {rows:[]};
   if(sql.startsWith('INSERT INTO voice_mode_usage')){
     assert.match(sql,/ON CONFLICT \(user_id,mode\) DO UPDATE/);assert.match(sql,/RETURNING starts/);
     const previous=daily.get(args[0]+':'+args[2]),n=previous?.day===day?previous.starts+1:1;
     if(args[1]!==null&&n>args[1])return {rows:[]};daily.set(args[0]+':'+args[2],{day,starts:n});return {rows:[{starts:n}]};
   }
   if(sql.startsWith('SELECT starts FROM voice_mode_usage')){const row=daily.get(args[0]+':'+args[1]);return {rows:row?.day===day?[row]:[]};}
   if(sql.startsWith('INSERT INTO voice_call_limits')){if(failTrack)throw Error('DB unavailable');calls.set(args[0],args[1]);return {rows:[]};}
   if(sql.startsWith('SELECT call_id')){assert.match(sql,/expires_at<=NOW\(\)/);return {rows:[...calls.keys()].map(call_id=>({call_id}))};}
   if(sql.startsWith('DELETE FROM voice_call_limits')){calls.delete(args[0]);return {rows:[]};}
   throw Error(sql);
 }};
 const request=async(url,options)=>{requests.push({url,options});return {ok:!failHangup,status:failHangup?503:200}};
 const make=()=>createVoiceLimits(pool,'test-key',request);
 return {make,daily,calls,requests,nextDay:()=>day++,failHangup:value=>failHangup=value,failTrack:()=>failTrack=true};
}
test('eight mock starts persist across limiter instances; tutoring has twelve separate starts and UTC rollover resets',async()=>{
 const f=fixture();await f.make().init();
 const results=await Promise.all(Array.from({length:10},()=>f.make().reserve('u1',8)));
 assert.equal(results.filter(Boolean).length,8);assert.equal(await f.make().reserve('u1',8),false);
 const tutors=await Promise.all(Array.from({length:14},()=>f.make().reserve('u1',12,'learn')));assert.equal(tutors.filter(Boolean).length,12);assert.equal((await f.make().status('u1',8,'mock')).used,8);
 assert.equal(await f.make().reserve('u2'),true);f.nextDay();assert.equal(await f.make().reserve('u1',8),true);
});
test('tester allowance is capped at 18 and changing access does not erase usage',async()=>{
 const f=fixture(),limiter=f.make();
 const results=await Promise.all(Array.from({length:20},()=>limiter.reserve('tester',18)));
 assert.equal(results.filter(Boolean).length,18);
 assert.deepEqual((({limit,used,remaining})=>({limit,used,remaining}))(await limiter.status('tester',18)),{limit:18,used:18,remaining:0});
 assert.equal(await limiter.reserve('tester',8),false);
 assert.equal((await limiter.status('tester',8)).remaining,0);
 await assert.rejects(limiter.reserve('tester',100));
 f.nextDay();assert.equal((await limiter.status('tester',18)).remaining,18);
 const {dailyLimit}=require('../voice-limits');
 assert.equal(dailyLimit({role:'owner'}),null);assert.equal(dailyLimit({voiceTester:true}),null);assert.equal(dailyLimit({voiceTester:'true'}),null);
});
test('server stores mode-specific deadlines and can expire a call after restart',async()=>{
 const f=fixture();assert.equal(await f.make().track('https://api.openai.com/v1/realtime/calls/rtc_one','learn'),480);
 assert.equal(await f.make().track('/v1/realtime/calls/rtc_two','mock'),720);
 assert.equal(f.calls.get('rtc_one'),480);assert.equal(f.calls.get('rtc_two'),720);
 await f.make().sweep();assert.equal(f.calls.size,0);assert.equal(f.requests.length,2);
 assert.ok(f.requests.every(r=>r.options.method==='POST'&&r.url.endsWith('/hangup')));
});
test('failed hangups retain deadlines for retry; malformed call IDs cannot inject a URL',async()=>{
 const f=fixture();await f.make().track('/v1/realtime/calls/rtc_one','learn');f.failHangup(true);
 await f.make().sweep();assert.equal(f.calls.size,1);f.failHangup(false);await f.make().sweep();assert.equal(f.calls.size,0);
 await assert.rejects(f.make().track('/v1/realtime/calls/../../secrets','learn'));
 await assert.rejects(f.make().track(null,'learn'));
});
test('persistence failure hangs up the call rather than allowing an untracked session',async()=>{
 const f=fixture();f.failTrack();await assert.rejects(f.make().track('/v1/realtime/calls/rtc_one','learn'));
 assert.equal(f.requests.length,1);assert.equal(f.calls.size,0);
 assert.equal(POLICY.learn.tokens,1024);assert.equal(POLICY.mock.tokens,512);
});


test('all roles have unlimited default voice starts while usage is tracked',async()=>{
 const f=fixture();for(let i=0;i<40;i++)assert.equal(await f.make().reserve('unlimited'),true);
 const usage=await f.make().status('unlimited');assert.equal(usage.used,40);assert.equal(usage.unlimited,true);assert.equal(usage.remaining,null);assert.equal(usage.limit,null);
 for(const role of ['athlete','coach','owner'])for(const mode of ['learn','mock'])assert.equal(require('../voice-limits').dailyLimit({role},mode),null);
});

