const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../public/owner-student-analytics.js'),'utf8');
function fixture(role='owner',records=[]){
 const ids=['ownerStudentAnalytics','ownerStudentAnalyticsStatus','ownerStudentAnalyticsSummary',
 'ownerStudentAnalyticsList','ownerStudentAnalyticsSearch','ownerStudentAnalyticsFilter',
 'ownerStudentAnalyticsSort','ownerStudentAnalyticsRange','ownerStudentAnalyticsNotes',
 'ownerStudentAnalyticsPrev','ownerStudentAnalyticsNext'];
 const nodes=Object.fromEntries(ids.map(id=>[id,{innerHTML:'',textContent:'',value:'',disabled:false,replaceChildren(){this.innerHTML='';},scrollIntoView(){this.scrolled=true;}}]));
 nodes.ownerStudentAnalyticsFilter.value='all';
 nodes.ownerStudentAnalyticsSort.value='recent';
 const responses=[],window={};
 const ctx=vm.createContext({
   document:{getElementById:id=>nodes[id]||null},window,me:{role},
   api:async route=>{responses.push(route);return {asOf:'2026-10-30T10:00:00.000Z',costTrackingAvailable:true,summary:{profiles:records.length,active7d:1,followUp14d:0,improving:1},notes:{activity:'Saved records only',improvement:'Comparable scores only',costs:'Partial cost data'},students:records};},
   Date,Number,String,console
 });
 vm.runInContext(code,ctx);
 return {nodes,window,responses,ctx};
}
const row=(i,overrides={})=>({
 studentId:'s'+i,name:'Student '+i,email:'student'+i+'@example.invalid',
 activityStatus:'recent',lastRecordedActivity:'2026-10-29T12:00:00.000Z',recentRecordedActivity:true,needsFollowUp:false,
 completedModules:2,savedModules:3,mockStarts:2,studentLedMocks:1,staffLedMocks:1,reports:1,completeReports:1,
 latestFullScore:75,scoreChange:12,improving:true,
 cost:{voiceAttempts:2,voiceSamples:2,pricedVoiceSamples:1,partialVoiceUsd:0.615,unpricedVoiceAttempts:1,textAttempts:2,inputTokens:500,outputTokens:200},
 ...overrides
});
test('Owner analytics fetches protected data and renders status, partial costs and activity',async()=>{
 const {nodes,window,responses}=fixture('owner',[row(1)]);await window.loadOwnerStudentAnalytics();
 assert.deepEqual(responses,['/api/owner/student-analytics']);
 assert.match(nodes.ownerStudentAnalyticsList.innerHTML,/Student 1/);
 assert.match(nodes.ownerStudentAnalyticsList.innerHTML,/Recent activity/);
 assert.match(nodes.ownerStudentAnalyticsList.innerHTML,/\$0\.61 partial estimate/);
 assert.match(nodes.ownerStudentAnalyticsList.innerHTML,/\+12 points/);
 assert.match(nodes.ownerStudentAnalyticsList.innerHTML,/1 of 2 voice starts priced/);
 assert.match(nodes.ownerStudentAnalyticsSummary.innerHTML,/Improving/);
});
test('student and staff roles cannot issue an Owner analytics request',async()=>{
 for(const role of ['athlete','coach','manager','supervisor']){
   const {window,responses}=fixture(role,[row(1)]);
   await window.loadOwnerStudentAnalytics();
   assert.deepEqual(responses,[]);
 }
});
test('search and filter work without leaking markup or other rows',async()=>{
 const {nodes,window}=fixture('owner',[row(1,{name:'<img src=x>',email:'careful@example.invalid'}),row(2,{improving:false})]);
 await window.loadOwnerStudentAnalytics();
 assert.doesNotMatch(nodes.ownerStudentAnalyticsList.innerHTML,/<img /);
 assert.match(nodes.ownerStudentAnalyticsList.innerHTML,/&lt;img/);
 nodes.ownerStudentAnalyticsSearch.value='student2';
 window.ownerStudentAnalyticsFilterChanged();
 assert.match(nodes.ownerStudentAnalyticsList.innerHTML,/Student 2/);
 assert.doesNotMatch(nodes.ownerStudentAnalyticsList.innerHTML,/&lt;img/);
 nodes.ownerStudentAnalyticsSearch.value='';
 nodes.ownerStudentAnalyticsFilter.value='improving';
 window.ownerStudentAnalyticsFilterChanged();
 assert.doesNotMatch(nodes.ownerStudentAnalyticsList.innerHTML,/Student 2/);
});
test('paginate 10 cards per page and clear after sign-out',async()=>{
 const {nodes,window}=fixture('owner',Array.from({length:23},(_,i)=>row(i)));
 await window.loadOwnerStudentAnalytics();
 assert.match(nodes.ownerStudentAnalyticsRange.textContent,/1–10 of 23/);
 window.ownerStudentAnalyticsPage(1);
 assert.match(nodes.ownerStudentAnalyticsRange.textContent,/11–20 of 23/);
 window.clearOwnerStudentAnalytics();
 assert.equal(nodes.ownerStudentAnalyticsList.innerHTML,'');
 assert.equal(nodes.ownerStudentAnalyticsRange.textContent,'');
});
test('missing costs are explicitly unknown and do not masquerade as free',async()=>{
 const {nodes,window}=fixture('owner',[row(1,{latestFullScore:null,scoreChange:null,cost:{voiceAttempts:0,pricedVoiceSamples:0,partialVoiceUsd:null}})]);
 await window.loadOwnerStudentAnalytics();
 assert.match(nodes.ownerStudentAnalyticsList.innerHTML,/No priced voice samples/);
 assert.match(nodes.ownerStudentAnalyticsList.innerHTML,/Not yet comparable/);
 assert.doesNotMatch(nodes.ownerStudentAnalyticsList.innerHTML,/\$0\.00/);
});
test('Owner analytics integration remains in Owner screen and its route is under Owner auth guard',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 const owner=html.indexOf('<section id="owner"');
 const analytics=html.indexOf('id="ownerStudentAnalytics"');
 const account=html.indexOf('<section id="account"');
 assert.ok(analytics>owner && analytics<account);
 assert.ok(server.indexOf("if(!isOwner(u))return json(res,403")<server.indexOf("url.pathname==='/api/owner/student-analytics'"));
 assert.match(html,/owner-student-analytics\.js/);
});
