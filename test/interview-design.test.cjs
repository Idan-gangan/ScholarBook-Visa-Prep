const {test}=require('node:test'),assert=require('node:assert/strict');
const design=require('../interview-design');
const transcript=design.TOPICS.flatMap(([id])=>[{role:'assistant',text:'A question about '+id},{role:'athlete',text:'My actual answer about '+id}]);
const complete=()=>({summary:'Your answers covered your study plans and funding.',strengths:[{text:'You explained your funding clearly.',answerTurn:9}],assessments:design.TOPICS.map(([topic],i)=>({topic,status:'assessed',questionTurn:i*2,answerTurn:i*2+1,score:8,feedback:'Keep your explanation clear.',action:'Practise explaining this in your own words.'}))});
test('every mock mode opens with VisaAtlas identity and waits for an audio check',()=>{
 for(const mode of Object.keys(design.MODES)){
  const prompt=design.mockInstructions({},mode,[], 'test');
  assert.match(prompt,/Hello, I'm your AI mock interviewer for VisaAtlas/);
  assert.match(prompt,/Can you hear me clearly/);
  assert.match(prompt,/STOP and WAIT/);
  assert.match(prompt,/Only after confirmation, ask ONE/);
  assert.match(prompt,/Do not assume confirmation from silence/);
  assert.match(prompt,/Never invent or guess a name/);
  assert.match(design.evaluationPrompt({},[],mode),/Audio checks, greetings and troubleshooting are NOT interview answers/);
 }
});
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
test('repeat plans avoid the last three opening topics and isolate student history',()=>{
 const sessions=[];
 for(let i=0;i<12;i++){
  const plan=design.sessionPlan({previousRefusal:'Yes'},sessions,'u','s','fixed');
  assert.ok(!sessions.slice(-3).some(s=>s.plan.openingTopic===plan.openingTopic));
  assert.equal(new Set(plan.topicRoute).size,7);assert.equal(plan.topicRoute[0],plan.openingTopic);
  sessions.push({userId:'u',athleteId:'s',plan});
 }
 assert.deepEqual(design.sessionPlan({},sessions,'other','s','fixed'),design.sessionPlan({},[],'other','s','fixed'));
});
test('incomplete reports withhold the overall score and retain answer quality separately',()=>{
 const input=complete();input.assessments[5]={topic:'future',status:'not_covered'};
 const r=design.normalizeEvidenceReport(input,transcript,{previousRefusal:'Yes'},'intensive');
 assert.equal(r.overall,null);assert.equal(r.answeredTopicScore,80);assert.equal(r.scoreType,'partial');
 assert.deepEqual(r.coverage,{assessed:6,required:7});assert.deepEqual(r.notCovered,['Future plans']);
 assert.equal(r.scores.future,undefined);assert.match(r.scoreExplanation,/unasked topics are not wrong answers/);
});
test('six academic points plus four funding points earns 14 out of 100 across seven areas',()=>{
 const input=complete();input.strengths=[];
 input.assessments=input.assessments.map(a=>['education','funding'].includes(a.topic)?{...a,score:a.topic==='education'?6:4}:{topic:a.topic,status:'not_covered'});
 const r=design.normalizeEvidenceReport(input,transcript,{},'standard');
 assert.equal(r.overall,null);assert.equal(r.earnedPoints,10);assert.equal(r.possiblePoints,70);
 assert.equal(r.answeredTopicScore,50);assert.equal(r.partialScore,null);
 assert.equal(r.scoreType,'partial');assert.equal(r.readiness,'Interview incomplete');
 assert.deepEqual(r.coverage,{assessed:2,required:7});assert.equal(r.notCovered.length,5);
 assert.equal(r.scores.future,undefined);
 assert.equal(design.requiredTopics({previousRefusal:'No',previousAttempts:0}).length,7);
 const full=design.normalizeEvidenceReport(complete(),transcript,{},'standard');
 assert.equal(full.overall,80);assert.equal(full.answeredTopicScore,80);assert.equal(full.scoreType,'complete');
});
test('partial evidence never becomes an overall score',()=>{
 const input=complete();input.strengths=[];
 input.assessments=input.assessments.map(a=>({topic:a.topic,status:'not_covered'}));
 input.assessments[0]=complete().assessments[0];
 assert.equal(design.normalizeEvidenceReport(input,transcript,{},'standard').partialScore,null);
 input.assessments[1]=complete().assessments[1];
 assert.equal(design.normalizeEvidenceReport(input,transcript,{},'standard').overall,null);
});
test('explicit strengths never become clarifications even with a middling topic score',()=>{
 const input=complete();input.assessments[2]={...input.assessments[2],score:6,feedbackKind:'strength',feedback:'You identified penetration testing as your interest.'};
 const r=design.normalizeEvidenceReport(input,transcript,{},'standard');
 assert.ok(r.strengths.includes(input.assessments[2].feedback));assert.deepEqual(r.clarifications,[]);
});
test('early-stop regression: education activities cannot survive a rejected travel classification',()=>{
 const input=complete();
 input.assessments[6]={...input.assessments[6],questionTurn:6,answerTurn:7,score:8,feedback:'You described running and earning a Cisco certificate.'};
 const turns=transcript.map(t=>({...t}));
 turns[6].text='What have you been doing since you finished high school?';
 turns[7].text='I have been running, studying and earning a Cisco cybersecurity certificate.';
 const review={reviews:input.assessments.map(a=>({topic:a.topic,questionTurn:a.questionTurn,answerTurn:a.answerTurn,supported:a.topic!=='circumstances'}))};
 const filtered=design.applyEvidenceReview(input,review);
 const report=design.normalizeEvidenceReport(filtered,turns,{previousRefusal:'Yes'},'standard');
 assert.equal(report.overall,null);assert.equal(report.answeredTopicScore,80);
 assert.deepEqual(report.coverage,{assessed:6,required:7});
 assert.equal(report.scores.circumstances,undefined);assert.equal(report.scores.education,8);
 assert.deepEqual(report.notCovered,['Previous applications and travel']);
 assert.ok(!report.strengths.includes(input.assessments[6].feedback));
 // The review is blind to proposed scores and profile claims, but sees context.
 const prompt=design.evidenceReviewPrompt(input,turns);
 assert.doesNotMatch(prompt,/"score":/);assert.match(prompt,/Cisco/);
 assert.match(prompt,/NOT visa applications or travel history/);
});
test('topic review fails closed on missing, duplicate, mismatched or nonboolean decisions',()=>{
 const input=complete();
 const make=()=>({reviews:input.assessments.map(a=>({topic:a.topic,questionTurn:a.questionTurn,answerTurn:a.answerTurn,supported:true}))});
 for(const mutate of [r=>r.reviews.pop(),r=>r.reviews[0].supported='yes',r=>r.reviews[0].answerTurn=99,r=>r.reviews[1]=r.reviews[0]]){
  const review=make();mutate(review);assert.throws(()=>design.applyEvidenceReview(input,review),/Invalid topic evidence review/);
 }
 assert.deepEqual(design.applyEvidenceReview(input,make()),input);
});
test('rejected evidence cannot produce a score, clarification or isolated strength',()=>{
 const input=complete();
 const review={reviews:input.assessments.map(a=>({topic:a.topic,questionTurn:a.questionTurn,answerTurn:a.answerTurn,supported:false}))};
 const report=design.normalizeEvidenceReport(design.applyEvidenceReview(input,review),transcript,{},'standard');
 assert.equal(report.overall,null);assert.equal(report.partialScore,null);
 assert.deepEqual(report.strengths,[]);assert.deepEqual(report.clarifications,[]);
 assert.equal(report.coverage.assessed,0);
});
