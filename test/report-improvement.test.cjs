const {test}=require('node:test'),assert=require('node:assert/strict');
const m=require('../report-improvement');
const report={id:'r1',athleteId:'s1',mockSessionId:'m1',overall:9,scoreType:'partial',coverage:{assessed:2,required:7},answeredTopicScore:30,clarifications:['Explain your funding.'],practiceLessons:['funding'],assessments:[{topic:'funding',label:'Funding',status:'assessed',questionTurn:0,answerTurn:1,feedback:'Explain your funding.',action:'State who pays.'}]};
const sessions=[{id:'m1',athleteId:'s1',transcript:[{role:'assistant',text:'Who pays?'},{role:'athlete',text:'My family.'}]}];
test('historical incomplete reports never expose overall score; originals remain intact',()=>{
 const before=structuredClone(report),view=m.present(report,sessions);
 assert.equal(view.overall,null);assert.equal(view.answeredTopicScore,30);assert.equal(view.incomplete,true);assert.deepEqual(report,before);
 assert.equal(view.practiceScore,30);assert.match(view.scoreExplanation,/only on assessed answers/);
 assert.equal(m.present({...report,scoreType:'complete',coverage:{assessed:7,required:7},overall:80}).overall,80);
});
test('evidence binds to matching student, session and actual role-checked turn indices',()=>{
 assert.equal(m.targetFor(report,sessions,0).answer,'My family.');
 assert.equal(m.targetFor(report,[{...sessions[0],athleteId:'other'}],0),null);
 assert.equal(m.targetFor(report,[],0),null);
 assert.equal(m.targetFor({...report,assessments:[{...report.assessments[0],answerTurn:0}]},sessions,0),null);
 assert.equal(m.targetFor(report,sessions,3),null);
});
test('retry validation bounds content and rejects forged feedback and malformed model results',()=>{
 const a=m.answerInput({reportId:'r1',focus:0,answer:'  My father pays tuition. ',outcome:'improved'});
 assert.equal(a.answer,'My father pays tuition.');assert.equal(a.outcome,undefined);
 assert.equal(a.key,m.answerInput({reportId:'r1',focus:0,answer:a.answer}).key);
 assert.notEqual(a.key,m.answerInput({reportId:'r1',focus:1,answer:a.answer}).key);
 for(const answer of ['',3,'a'.repeat(2001)])assert.throws(()=>m.answerInput({reportId:'r1',focus:0,answer}));
 for(const outcome of ['approved','passed',100])assert.throws(()=>m.normalize({outcome,feedback:'Fine',nextStep:'Next'}));
 assert.throws(()=>m.normalize({outcome:'improved',feedback:'a'.repeat(501),nextStep:'Next'}));
 assert.deepEqual(m.normalize({outcome:'unclear',feedback:' Cannot compare. ',nextStep:'Clarify the costs.',overall:100}),{outcome:'unclear',feedback:'Cannot compare.',nextStep:'Clarify the costs.'});
 assert.match(m.prompt(m.targetFor(report,sessions,0),a.answer),/Do not assess pronunciation/);
});
test('print export shows assessed practice score without penalizing unasked areas',()=>{
 const html=require('../report-pdf').createReportHtml(report,{name:'Test'});
 assert.ok(html.includes('class="score">30/100'));assert.ok(!html.includes('Interview incomplete'));
 assert.ok(!html.includes('>9/100<'));
 assert.ok(html.includes('30/100'));
});
test('new report evidence remains available after source mock retention expires',()=>{
 const saved={...report,answerEvidence:m.present(report,sessions).evidence};
 assert.equal(m.targetFor(saved,[],0).answer,'My family.');
});

test('practice score uses assessed score and never invents a score for missing evidence',()=>{
 assert.equal(m.present({...report,answeredTopicScore:68,coverage:{assessed:5,required:7}}).practiceScore,68);
 assert.equal(m.present({...report,answeredTopicScore:null}).practiceScore,null);
 assert.equal(m.present({...report,scoreType:'complete',coverage:{assessed:7,required:7},overall:80}).practiceScore,80);
});
