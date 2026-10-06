const {test}=require('node:test');
const assert=require('node:assert/strict');
const {LESSONS,tutorInstructions}=require('../learning');

test('every starting module supplies all teaching outlines for spoken topic switches',()=>{
 for(const start of LESSONS){
  const prompt=tutorInstructions({major:'Cybersecurity',academicLevel:"Bachelor's"},{},start.id);
  assert.ok(prompt.includes('Selected module: '+start.title));
  for(const module of LESSONS){
   for(const point of module.points)assert.ok(prompt.includes(point),`${start.id} missing ${module.id} teaching point`);
   for(const question of module.questions)assert.ok(prompt.includes(question));
  }
 }
});
test('context preserves explicit zero and false values and separates missing profile details',()=>{
 const prompt=tutorInstructions({previousAttempts:0,previousRefusal:false,sport:'',name:'Student'});
 const context=JSON.parse(prompt.slice(prompt.lastIndexOf('\n')+1));
 assert.equal(context.profile.previousAttempts,0);
 assert.equal(context.profile.previousRefusal,false);
 assert.equal(context.profile.sport,'Not provided');
 assert.equal(context.profile.major,'Not provided');
});

test('academic routing supports four levels without guessing an ambiguous graduate degree',()=>{
 for(const [value,expected] of [['High school','high-school'],['Secondary school','high-school'],['Undergraduate','undergraduate'],['Freshman / First year','undergraduate'],['Master’s','masters'],['PhD / Doctorate','phd'],['Ph.D.','phd'],['Graduate','unspecified'],['','unspecified']]){
  assert.equal(LESSONS.resolveLevel(value),expected);
  const prompt=tutorInstructions({academicLevel:value,sport:''});
  assert.ok(prompt.includes('Preparation path: '+expected));
  for(const topic of LESSONS.levelTopics[expected])assert.ok(prompt.includes(topic));
 }
});

test('lesson examples use the selected profile and the appropriate education level',()=>{
 for(const [academicLevel,expected] of [['High school','secondary education'],['Undergraduate','bachelor’s'],['Master’s','master’s'],['PhD','PhD']]){
  const card=LESSONS.forStudent({academicLevel,university:'Student School',major:'Chemistry'},'study-purpose');
  assert.ok(card.example.includes(expected));assert.ok(card.example.includes('Student School'));
  assert.doesNotMatch(card.example,/Texas Tech|cybersecurity|scholarship/i);
  assert.ok(tutorInstructions({academicLevel,university:'Student School',major:'Chemistry'}).includes(JSON.stringify(card)));
 }
 const missing=LESSONS.forStudent({},'study-purpose');
 assert.match(missing.example,/\[school\]/);assert.match(missing.example,/\[subject or research field\]/);
 assert.doesNotMatch(missing.example,/bachelor|master|PhD|scholarship/);
});

test('funding guidance preserves actual coverage and does not manufacture an award',()=>{
 const full=LESSONS.forStudent({sport:'Track and field',scholarship:'Athletic scholarship',scholarshipCoverage:'Tuition and housing'},'funding');
 assert.equal(full.athletic,true);assert.match(full.example,/Tuition and housing/);
 assert.doesNotMatch(full.example,/travel|summer|fully funded/);
 const partial=LESSONS.forStudent({scholarship:'Partial merit award',scholarshipCoverage:'Half of tuition',remainingSponsor:'My parents'},'funding');
 assert.match(partial.example,/Half of tuition/);assert.match(partial.example,/My parents/);assert.equal(partial.athletic,false);
 const family=LESSONS.forStudent({scholarship:'None',remainingSponsor:'My mother'},'funding');
 assert.match(family.example,/My mother/);assert.doesNotMatch(family.example,/scholarship/);
 assert.equal(family.questions.some(q=>q.includes('scholarship')),false);
 const unknown=LESSONS.forStudent({},'funding');assert.match(unknown.example,/\[actual funding source\]/);
 assert.doesNotMatch(unknown.example,/My parents|self-funded/);
});

test('circumstance branches require supplied history, never the legacy athlete role',()=>{
 for(const sport of ['', 'None', 'N/A', 'Not applicable', false, 0]){
  const card=LESSONS.forStudent({role:'athlete',sport,previousRefusal:'No',previousAttempts:0},'circumstances');
  assert.equal(card.athletic,false);assert.equal(card.refusal,false);
  assert.equal(card.questions.some(q=>/recruited|previous application/.test(q)),false);
 }
 const card=LESSONS.forStudent({scholarship:'Athletic award',previousRefusal:'Yes'},'circumstances');
 assert.equal(card.athletic,true);assert.equal(card.refusal,true);
 assert.ok(card.questions.some(q=>q.includes('recruited')));assert.ok(card.questions.some(q=>q.includes('previous application')));
 assert.match(card.example,/\[actual change, if any\]/);
 const high=LESSONS.forStudent({academicLevel:'High school'},'academic-journey');
 assert.match(high.example,/currently in \[grade\]/);assert.doesNotMatch(high.example,/completed.*degree/);
 assert.throws(()=>LESSONS.forStudent({},'invalid'),/Unknown lesson/);
});
