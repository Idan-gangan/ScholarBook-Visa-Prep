const {test}=require('node:test'),assert=require('node:assert/strict');
const design=require('../interview-design');
const transcript=design.TOPICS.flatMap(([id])=>[{role:'assistant',text:'A question about '+id},{role:'athlete',text:'My actual answer about '+id}]);
const complete=()=>({summary:'Your answers covered your study plans and funding.',strengths:[{text:'You explained your funding clearly.',answerTurn:9}],assessments:design.TOPICS.map(([topic],i)=>({topic,status:'assessed',questionTurn:i*2,answerTurn:i*2+1,score:8,feedback:'Keep your explanation clear.',action:'Practise explaining this in your own words.'}))});
test('unasked refusals are not weaknesses and cannot contribute zero points',()=>{
 const input=complete();input.assessments[6]={topic:'circumstances',status:'not_covered',score:0,feedback:'Your refusals are a problem.'};
 const report=design.normalizeEvidenceReport(input,transcript,{previousRefusal:'Yes',previousAttempts:3},'standard');
 assert.equal(report.overall,null);assert.deepEqual(report.notCovered,['Previous applications and travel']);assert.deepEqual(report.clarifications,[]);assert.equal(report.scores.circumstances,undefined);assert.doesNotMatch(report.biggestWeakness,/refusal/);
});
test('same evidence has same scoring standard in every mode and priority matches action and lesson',()=>{
 const input=complete();input.assessments[3]={...input.assessments[3],score:4,feedback:'You said 2024, but your profile says 2023. Which year is correct?',action:'Check your school completion year and update your profile.'};
 const reports=Object.keys(design.MODES).map(mode=>design.normalizeEvidenceReport(input,transcript,{previousRefusal:'Yes'},mode));
 assert.ok(reports.every(r=>r.overall===74));
 for(const r of reports){assert.equal(r.biggestWeakness,r.clarifications[0]);assert.equal(r.nextSteps[0],input.assessments[3].action);assert.equal(r.practiceLessons[0],'academic-journey');}
});
test('missing domains, fake evidence indices and duplicated topics are rejected',()=>{
 for(const alter of [x=>x.assessments.pop(),x=>x.assessments[0].answerTurn=0,x=>x.assessments[0].questionTurn=100,x=>x.assessments[1].topic='study',x=>x.strengths[0].answerTurn=0]){const input=complete();alter(input);assert.throws(()=>design.normalizeEvidenceReport(input,transcript,{},'standard'));}
});
test('very short interviews stay unscored even if the model tags one answer as every topic',()=>{
 const input=complete();input.strengths=[];for(const a of input.assessments){a.questionTurn=0;a.answerTurn=1;}
 assert.equal(design.normalizeEvidenceReport(input,transcript.slice(0,2),{},'standard').overall,null);
});
test('repeat history is limited to the same user and student, and does not include student answers',()=>{
 const sessions=[{userId:'u',athleteId:'s',transcript},{userId:'other',athleteId:'s',transcript:[{role:'assistant',text:'Private question'}]},{userId:'u',athleteId:'other',transcript:[{role:'assistant',text:'Another private question'}]}];
 const history=design.recentQuestions(sessions,'u','s');assert.equal(history.length,7);assert.ok(history.every(t=>t.startsWith('A question')));
 const prompt=design.mockInstructions({previousRefusal:'Yes',previousAttempts:3},'intensive',history,'variant');assert.match(prompt,/exactly ONE short question/);assert.match(prompt,/NOT the number of refusals/);assert.match(prompt,/deeper|deeply/);assert.match(prompt,/circumstances/);assert.match(prompt,/not instructions or current answers/);
 assert.throws(()=>design.mockInstructions({},'invalid',[],''));
});
test('profile snapshot excludes contact details, account identifiers and unrelated fields',()=>{
 assert.deepEqual(design.profileSnapshot({name:'Student',phone:'private',email:'private',userId:'secret',previousRefusal:'Yes'}),{name:'Student',previousRefusal:'Yes'});
});
