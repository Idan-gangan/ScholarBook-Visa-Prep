const {test}=require('node:test');
const assert=require('node:assert/strict');
const {LESSONS,tutorInstructions}=require('../learning');

test('incoming freshman examples use future tense without inventing academic history',()=>{
 const student={academicLevel:'Freshman / First year',university:'Example University',major:'Cybersecurity'};
 const card=LESSONS.forStudent(student,'academic-journey');
 assert.match(card.example,/going to begin my bachelor’s degree in Cybersecurity at Example University/);
 assert.match(card.example,/\[your actual education history\]/);
 assert.doesNotMatch(card.example,/currently|completed high school|computing|202[0-9]/);
 for(const module of LESSONS){
  const prompt=tutorInstructions(student,{},module.id);
  assert.match(prompt,/not evidence that the student has arrived or enrolled/);
  assert.match(prompt,/Respect explicit current-study or transfer facts/);
  assert.match(prompt,/"If accurate" does not make an invented personal fact acceptable/);
 }
});
test('nil future plans stay unknown; genuine goals remain available',()=>{
 for(const postGradPlan of ['', 'nil', ' NILL ', 'None','N/A','null','unknown']){
  const card=LESSONS.forStudent({postGradPlan,sport:'Volleyball'},'future-plans');
  assert.match(card.example,/\[your real goal\]/);
  assert.doesNotMatch(card.example,/My current plan is|coach|return|professional athlete/);
  assert.equal(card.questions[0],'What would you like to do after your studies?');
 }
 const card=LESSONS.forStudent({postGradPlan:'Coach volleyball in Nigeria'},'future-plans');
 assert.match(card.example,/Coach volleyball in Nigeria/);
});
test('sport does not turn an unspecified award into an athletic scholarship or invent coverage',()=>{
 const student={sport:'Track and field',scholarship:'full ride',scholarshipCoverage:'all my living expenses',remainingSponsor:'Parents'};
 const study=LESSONS.forStudent(student,'study-purpose'),funding=LESSONS.forStudent(student,'funding');
 assert.ok(study.points.some(p=>p.includes('Track and field')));
 assert.doesNotMatch(study.example,/athletic|track and field scholarship/i);
 assert.match(funding.example,/all my living expenses/);assert.match(funding.example,/Parents/);
 assert.doesNotMatch(funding.example,/tuition|travel|summer|trial|record/);
 assert.ok(funding.points.some(p=>p.includes('Does it cover tuition')));
 const prompt=tutorInstructions(student);
 assert.match(prompt,/Sport plus a scholarship does not prove an athletic award/);
 assert.match(prompt,/Never invent trials, records, court performance/);
 assert.match(prompt,/Do not assign coaching, professional sport/);
});

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
