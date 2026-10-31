const {test}=require('node:test'),assert=require('node:assert/strict');
const {buildAnalytics,studentKey,groupKey,historicalGroups}=require('../owner-student-analytics');
const NOW=Date.parse('2026-10-30T20:00:00Z');
const at=(daysAgo)=>new Date(NOW-daysAgo*86400000).toISOString();
const owner={id:'owner',role:'owner',email:'owner@example.invalid'};
const students=[
 {id:'s1',userId:'u1',name:'First Student',email:'first@example.invalid',createdAt:at(60),staffIds:['owner']},
 {id:'s2',userId:'u2',name:'Second Student',email:'second@example.invalid',createdAt:at(40),staffIds:[]},
 {id:'s3',userId:'u3',name:'New Student',email:'new@example.invalid',createdAt:at(2)},
 {id:'s4',userId:'u4',name:'Unknown Student',email:'unknown@example.invalid'}
];
const users=[owner,...students.map(s=>({id:s.userId,role:'athlete'}))];
const reports=[
 {id:'r1',athleteId:'s1',mockSessionId:'mock1',createdAt:at(20),overall:60,scoreType:'complete',scoringMethod:'coverage-separated-v2'},
 {id:'r2',athleteId:'s1',mockSessionId:'mock2',createdAt:at(3),overall:76,scoreType:'complete',scoringMethod:'coverage-separated-v2',secretTranscript:'Never include this'},
 {id:'r3',athleteId:'s1',mockSessionId:'mock3',createdAt:at(1),overall:null,answeredTopicScore:95,scoreType:'partial',scoringMethod:'coverage-separated-v2'},
 {id:'r4',athleteId:'s2',mockSessionId:'mock4',createdAt:at(18),overall:80,scoreType:'complete',scoringMethod:'old-method'},
 {id:'r5',athleteId:'s2',mockSessionId:'mock5',createdAt:at(17),overall:90,scoreType:'complete',scoringMethod:'coverage-separated-v2'},
 {id:'r6',athleteId:'s2',createdAt:at(16),overall:30}
];
const sessions=[
 {id:'mock2',athleteId:'s1',userId:'u1',createdAt:at(3)},
 {id:'mock3',athleteId:'s1',userId:'owner',createdAt:at(1)},
 {id:'mock4',athleteId:'s2',userId:'u2',createdAt:at(18)}
];
const learning=[
 {student_id:'s1',completed_modules:3,saved_modules:5,last_progress_at:at(2)},
 {student_id:'s2',completed_modules:1,saved_modules:2,last_progress_at:at(22)}
];
const keyedCost={student_key:studentKey('s1'),category:'learn',attempts:2,samples:2,priced_samples:1,estimated_usd:'0.700',elapsed_seconds:'210'};
const legacyCost={group_key:groupKey('mock2'),category:'mock',attempts:1,samples:1,priced_samples:1,estimated_usd:'0.850',elapsed_seconds:'240'};
const textCost={student_key:studentKey('s1'),category:'report',attempts:2,samples:2,priced_samples:0,input_tokens:'800',cached_tokens:'100',output_tokens:'1200'};
function build(costs={keyed:[keyedCost,textCost],legacy:[legacyCost]}){
 return buildAnalytics({students,users,reports,mockSessions:sessions,learning,costs,now:NOW});
}
test('student analytics identifies activity, dormant profiles and staff-led mock starts without assuming logins',()=>{
 const x=build(),lookup=Object.fromEntries(x.students.map(s=>[s.studentId,s]));
 assert.equal(x.summary.profiles,4);
 assert.equal(x.summary.active7d,1);
 assert.equal(x.summary.followUp14d,1);
 assert.equal(lookup.s1.mockStarts,2);
 assert.equal(lookup.s1.studentLedMocks,1);
 assert.equal(lookup.s1.staffLedMocks,1);
 assert.equal(lookup.s1.completedModules,3);
 assert.equal(lookup.s2.needsFollowUp,true);
 assert.equal(lookup.s3.needsFollowUp,false);
 assert.equal(lookup.s3.activityStatus,'no-recorded-activity');
 assert.equal(lookup.s4.needsFollowUp,false);
 assert.match(x.notes.activity,/does not prove/);
});
test('improvement uses only full reports with matching scoring method and ignores partial score',()=>{
 const x=build();const lookup=Object.fromEntries(x.students.map(s=>[s.studentId,s]));
 assert.equal(lookup.s1.latestFullScore,76);
 assert.equal(lookup.s1.scoreChange,16);
 assert.equal(lookup.s1.improving,true);
 assert.equal(lookup.s2.latestFullScore,90);
 assert.equal(lookup.s2.scoreChange,null);
 assert.equal(lookup.s2.improving,false);
 assert.equal(x.summary.improving,1);
 assert.equal(x.summary.withFullScore,2);
 assert.match(x.notes.improvement,/same scoring method/);
});
test('new keyed and historical mock costs are attributed without double-counting, but unpriced text remains unknown',()=>{
 const x=build(),first=x.students.find(s=>s.studentId==='s1'),second=x.students.find(s=>s.studentId==='s2');
 assert.equal(first.cost.voiceAttempts,3);
 assert.equal(first.cost.pricedVoiceSamples,2);
 assert.equal(first.cost.unpricedVoiceAttempts,1);
 assert.equal(first.cost.partialVoiceUsd,1.55);
 assert.equal(first.cost.observedVoiceMinutes,7.5);
 assert.equal(first.cost.textAttempts,2);
 assert.equal(first.cost.inputTokens,800);
 assert.equal(first.cost.outputTokens,1200);
 assert.equal(second.cost.partialVoiceUsd,null);
 assert.equal(x.summary.costAttributed,1);
 assert.doesNotMatch(JSON.stringify(x),/Never include this/);
});
test('unknown older usage does not become zero-dollar cost or attach to unrelated student',()=>{
 const x=build({keyed:[],legacy:[
   {group_key:groupKey('not-a-real-session'),category:'mock',attempts:7,priced_samples:7,estimated_usd:200}
 ]});
 for(const student of x.students)assert.equal(student.cost.partialVoiceUsd,null);
 assert.equal(x.summary.costAttributed,0);
});
test('hashed identifiers are fixed length and historical mappings only include current students',()=>{
 assert.match(studentKey('s1'),/^[a-f0-9]{64}$/);
 assert.notEqual(studentKey('s1'),studentKey('s2'));
 const mappings=historicalGroups({students,reports,mockSessions:sessions.concat({id:'unrelated',athleteId:'not-real'})});
 assert.equal(mappings.get(groupKey('mock2')),'s1');
 assert.equal(mappings.has(groupKey('unrelated')),false);
});
test('profiles with invalid timestamps are not falsely labelled recently active',()=>{
 const x=buildAnalytics({
  students:[{id:'invalid',name:'X',createdAt:'not a date'}],
  users:[],reports:[{id:'r',athleteId:'invalid',createdAt:'not a date'}],
  mockSessions:[],learning:[],costs:{keyed:[],legacy:[]},now:NOW
 });
 assert.equal(x.summary.active7d,0);
 assert.equal(x.summary.followUp14d,0);
 assert.equal(x.students[0].lastRecordedActivity,null);
});
