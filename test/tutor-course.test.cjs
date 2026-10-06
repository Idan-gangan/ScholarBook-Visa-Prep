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
