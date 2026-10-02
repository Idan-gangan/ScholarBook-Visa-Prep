const {test}=require('node:test');
const assert=require('node:assert/strict');
const {POLICY,createVoiceLimits}=require('../voice-limits');
function fixture(){
 const daily=new Map(),calls=new Map(),requests=[];let failHangup=false,failTrack=false,day=1;
 const pool={query:async(sql,args=[])=>{
   if(sql.startsWith('CREATE TABLE'))return {rows:[]};
   if(sql.startsWith('INSERT INTO voice_daily_usage')){
     assert.match(sql,/ON CONFLICT \(user_id\) DO UPDATE/);assert.match(sql,/RETURNING starts/);
     const previous=daily.get(args[0]),n=previous?.day===day?previous.starts+1:1;
     if(n>6)return {rows:[]};daily.set(args[0],{day,starts:n});return {rows:[{starts:n}]};
   }
   if(sql.startsWith('INSERT INTO voice_call_limits')){if(failTrack)throw Error('DB unavailable');calls.set(args[0],args[1]);return {rows:[]};}
   if(sql.startsWith('SELECT call_id')){assert.match(sql,/expires_at<=NOW\(\)/);return {rows:[...calls.keys()].map(call_id=>({call_id}))};}
   if(sql.startsWith('DELETE FROM voice_call_limits')){calls.delete(args[0]);return {rows:[]};}
   throw Error(sql);
 }};
 const request=async(url,options)=>{requests.push({url,options});return {ok:!failHangup,status:failHangup?503:200}};
 const make=()=>createVoiceLimits(pool,'test-key',request);
 return {make,daily,calls,requests,nextDay:()=>day++,failHangup:value=>failHangup=value,failTrack:()=>failTrack=true};
}
test('six starts are shared across modes and new limiter instances; next UTC day resets',async()=>{
 const f=fixture();await f.make().init();
 const results=await Promise.all(Array.from({length:8},()=>f.make().reserve('u1')));
 assert.equal(results.filter(Boolean).length,6);assert.equal(await f.make().reserve('u1'),false);
 assert.equal(await f.make().reserve('u2'),true);f.nextDay();assert.equal(await f.make().reserve('u1'),true);
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
