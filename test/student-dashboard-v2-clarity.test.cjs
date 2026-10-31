const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const model=require('../public/student-dashboard');
const raw=fs.readFileSync(path.join(__dirname,'../public/student-dashboard-v2.js'),'utf8');
const instrumented=raw.replace(' root.VisaAtlasStudentDashboardV2={install};',' root.__dashboardTest={renderToday,refreshOverview,renderHistory};\n root.VisaAtlasStudentDashboardV2={install};');
assert.notEqual(instrumented,raw,'test functions must be instrumented');
function fixture(history=[]){
 const nodes=new Map();
 function element(id){
   if(!nodes.has(id)){
    nodes.set(id,{id,innerHTML:'',dataset:{},classList:{remove(){},add(){},contains(){return true}},querySelectorAll(){return []},querySelector(){return null}});
   }
   return nodes.get(id);
 }
 const window={VisaAtlasStudentDashboard:model};
 const globals={
   window,document:{getElementById:element},
   me:{id:'u1',role:'athlete'},athletes:[{id:'s1',userId:'u1',name:'Sample Student',mocks:history.length}],
   reports:history,courseSaved:{},courseLoadState:'ready',curriculum:Array.from({length:6},(_,i)=>({id:String(i)})),
   Date,Number,String,console,studentNext(){},show(){}
 };
 vm.runInNewContext(instrumented,globals);
 return {window,globals,nodes,element};
}
test('student overview labels partial interview feedback as assessed answers rather than full readiness',()=>{
 const latest={id:'r1',athleteId:'s1',createdAt:'2026-10-26',scoreType:'partial',incomplete:true,practiceScore:62,overall:null,coverage:{assessed:6,required:7},biggestWeakness:'Explain why cybersecurity interests you',nextSteps:['Choose a specific cybersecurity field'],strengths:['Clear future plans'],clarifications:['Clarify your interests']};
 const f=fixture([latest]);f.window.__dashboardTest.refreshOverview();
 const markup=f.element('dashCards').innerHTML;
 assert.match(markup,/Assessed-answer score/);
 assert.match(markup,/62\/100/);
 assert.match(markup,/Only 6 of 7 areas assessed/);
 assert.match(markup,/not full readiness/);
 const feedback=f.element('athleteTable').innerHTML;
 assert.match(feedback,/<details class="student-feedback-detail">/);
 assert.match(feedback,/What went well and what to clarify/);
 assert.doesNotMatch(feedback,/<p><strong>Focus first:<\/strong>/);
});
test('daily counter excludes suggested reading and distinguishes completed saved evidence',()=>{
 const f=fixture();
 f.window.__dashboardTest.renderToday([{id:'r1',createdAt:'2026-10-27',practiceTargets:[]}],false,true,1,31);
 const markup=f.element('dailyPractice').innerHTML;
 assert.match(markup,/0 \/ 2 saved activities/);
 assert.match(markup,/Suggested reading · not counted in today’s progress/);
 assert.match(markup,/Completion uses saved evidence/);
 assert.doesNotMatch(markup,/0 \/ 3 done/);
});
test('an independently saved retry counts as progress even when profile is unfinished',()=>{
 const now=new Date();
 const report={id:'r1',createdAt:'2026-10-27',practiceTargets:[{lessonId:'funding',focus:'Explain family funding',title:'Funding'}],practiceAttempts:[{focus:0,createdAt:now.toISOString()}]};
 const f=fixture([report]);
 f.window.__dashboardTest.renderToday([report],false,true,1,31);
 const markup=f.element('dailyPractice').innerHTML;
 assert.match(markup,/1 \/ 3 saved activities/);
 assert.match(markup,/Answer retry saved today/);
 assert.doesNotMatch(markup,/Suggested reading · not counted/);
});
test('history explains that partially assessed answers are not a full visa interview assessment',()=>{
 const report={id:'r1',athleteId:'s1',mockNumber:8,createdAt:'2026-10-26',scoreType:'partial',incomplete:true,practiceScore:62,coverage:{assessed:6,required:7},difficulty:'standard'};
 const f=fixture([report]);f.window.__dashboardTest.renderHistory();
 const markup=f.element('studentHistory').innerHTML;
 assert.match(markup,/Assessed answers only/);
 assert.match(markup,/not a full interview-readiness score/);
 assert.match(markup,/6 \/ 7 assessed areas/);
 assert.match(markup,/student-history-disclosure/);
 assert.match(markup,/Review recent mock attempts/);
 assert.match(markup,/62\/100/);
});

test('daily actions have specific labels and identify exact missing profile fields',()=>{
 const f=fixture([{id:'r1',createdAt:'2026-10-27',practiceTargets:[{title:'Study plans',focus:'Choose a topic',lessonId:'study-purpose'}]}]);
 f.window.VisaAtlasProfile={missing:()=>['Program','Phone number','Future plans']};
 f.window.__dashboardTest.renderToday(f.globals.reports,false,true,1,31);
 const html=f.element('dailyPractice').innerHTML;
 assert.match(html,/Complete profile →/);
 assert.match(html,/Practise this answer →/);
 assert.match(html,/Continue lesson →/);
 assert.match(html,/Still needed: Program · Phone number · \+1 more/);
 assert.doesNotMatch(html,/>Start →</);
});
test('a verified comparable 60 to 62 change is shown with matching coverage and model metadata',()=>{
 const earlier={id:'older',athleteId:'s1',createdAt:'2026-10-22',scoreType:'partial',incomplete:true,practiceScore:60,coverage:{assessed:6,required:7},difficulty:'standard',scoringMethod:'coverage-separated-v2'};
 const newest={...earlier,id:'newer',practiceScore:62,createdAt:'2026-10-26'};
 const f=fixture([earlier,newest]);
 f.window.__dashboardTest.refreshOverview();
 const html=f.element('dashCards').innerHTML;
 assert.match(html,/student-score-trend/);
 assert.match(html,/60 → 62 \(\+2 points\)/);
 assert.match(html,/same mode, coverage and scoring method/);
});
test('progress score comparison is omitted when modes, coverage or methods differ',()=>{
 const old={id:'older',athleteId:'s1',createdAt:'2026-10-22',scoreType:'partial',incomplete:true,practiceScore:60,coverage:{assessed:6,required:7},difficulty:'challenging',scoringMethod:'old-model'};
 const newest={...old,id:'newer',practiceScore:62,createdAt:'2026-10-26',difficulty:'standard',scoringMethod:'coverage-separated-v2'};
 const f=fixture([newest,old]);
 f.window.__dashboardTest.refreshOverview();
 assert.doesNotMatch(f.element('dashCards').innerHTML,/student-score-trend/);
 assert.match(f.element('dashCards').innerHTML,/not full readiness/);
});
test('date editor and checklist remain accessible behind a collapsed planning section',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 assert.match(html,/<details id="studentPlannerTools" class="student-planner-tools">/);
 assert.match(html,/Manage interview date and checklist/);
 assert.match(html,/id="interviewCountdown"/);
 assert.match(html,/id="plannedInterviewDate"/);
 assert.match(html,/id="checklistDetails"/);
});
