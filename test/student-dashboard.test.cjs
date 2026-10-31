const {test}=require('node:test');
const assert=require('node:assert/strict');
const {coverage,scoreMeta,comparable,comparison,dailyTasks,dateKey}=require('../public/student-dashboard');
const full={id:'1',createdAt:'2026-10-25T12:00:00Z',difficulty:'standard',scoringMethod:'coverage-separated-v2',scoreType:'complete',overall:82,coverage:{assessed:7,required:7}};
const partial={...full,id:'2',scoreType:'partial',incomplete:true,practiceScore:62,coverage:{assessed:6,required:7}};
test('partial interview scores clearly indicate assessed areas only',()=>{
 assert.equal(coverage(partial).full,false);
 assert.equal(coverage(partial).label,'Partial coverage');
 assert.equal(scoreMeta(partial).value,62);
 assert.equal(scoreMeta(partial).detail,'Assessed areas only');
 assert.equal(scoreMeta({...partial,practiceScore:undefined,partialScore:undefined}).label,'Not scored');
 assert.equal(coverage({...full,coverage:{assessed:0,required:7}}).label,'Not assessed');
});
test('full interview requires complete coverage and a valid score',()=>{
 assert.equal(scoreMeta(full).value,82);
 assert.equal(scoreMeta(full).detail,'All required areas assessed');
 assert.equal(coverage({...full,incomplete:true}).full,false);
 assert.equal(coverage({...full,coverage:{assessed:8,required:7}}).known,false);
 assert.equal(scoreMeta(undefined).label,'No attempts yet');
});
test('comparison only uses equal mode, coverage and scoring method',()=>{
 const recent={...partial,id:'recent',createdAt:'2026-10-26T12:00:00Z'};
 const old={...partial,id:'old',practiceScore:60,createdAt:'2026-10-25T12:00:00Z'};
 assert.equal(comparable(recent,old),true);
 assert.equal(comparison([recent,old]).delta,2);
 assert.equal(comparable(recent,{...old,difficulty:'intensive'}),false);
 assert.equal(comparable(recent,{...old,coverage:{assessed:3,required:7}}),false);
 assert.equal(comparable(recent,{...old,scoringMethod:'all-seven-v1'}),false);
 assert.equal(comparison([recent,full]),null);
});
test('personalised tasks prioritize missing profile and preserve student progress',()=>{
 const tasks=dailyTasks({profileComplete:false,courseLoaded:true,modulesDone:1,history:[partial]});
 assert.equal(tasks[0].id,'profile');
 assert.ok(tasks.some(t=>t.id==='learning'));
 assert.ok(!tasks.some(t=>t.id==='mock'));
});
test('urgent interviews and targeted practice get specific tasks',()=>{
 const tasks=dailyTasks({profileComplete:true,courseLoaded:true,modulesDone:1,daysUntil:3,history:[{...partial,practiceTargets:[{title:'Funding',focus:'Explain where the remaining funds come from',lessonId:'funding'}]}]});
 assert.equal(tasks[0].id,'focus');
 assert.ok(tasks.some(t=>t.id==='mock'));
 assert.ok(tasks.every(t=>t.title&&t.description));
});
test('saved mock and module completion are detected for today',()=>{
 const now=new Date();
 const latest={...partial,createdAt:now.toISOString()};
 const tasks=dailyTasks({profileComplete:true,courseLoaded:true,modulesDone:2,learningCompletedToday:true,daysUntil:2,history:[latest],now});
 assert.equal(tasks.find(t=>t.id==='mock')?.done,true);
 assert.equal(tasks.find(t=>t.id==='learning')?.done,true);
 assert.equal(dateKey(now),dateKey(latest.createdAt));
});
