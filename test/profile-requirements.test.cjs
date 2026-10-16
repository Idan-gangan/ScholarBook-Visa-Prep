const {test}=require('node:test');const assert=require('node:assert/strict');
const {missing}=require('../public/profile-requirements');
const complete={country:'Nigeria',university:'Example University',major:'Biology',academicLevel:'Undergraduate',studyStatus:'Not started yet',phoneCountry:'NG',phone:'+2348031234567',interviewCountry:'Nigeria',interviewCity:'Not booked yet',postGradPlan:'I’m still deciding',previousRefusal:'No',previousTravel:'No',previousAttempts:0,fundingSources:'Family / guardian'};
test('required fields accept honest uncertainty and reject missing history',()=>{
 assert.deepEqual(missing(complete),[]);
 for(const key of Object.keys(complete))assert.ok(missing({...complete,[key]:''}).length,key);
 assert.ok(missing({...complete,previousRefusal:'Yes'}).some(x=>x.includes('At least one')));
 assert.ok(missing({...complete,previousAttempts:1.2}).length);
});
test('athletic scholarship needs a real sport; non-athletes need none',()=>{
 assert.ok(missing({...complete,fundingSources:'Athletic scholarship'}).some(x=>x.includes('Sport')));
 assert.deepEqual(missing({...complete,fundingSources:'Athletic scholarship',sport:'Track and field'}),[]);
 assert.ok(missing({...complete,sport:'Other'}).length);
 assert.deepEqual(missing({...complete,sport:'Other',sportOther:'Triathlon'}),[]);
});
test('worldwide posts have provenance, valid country mappings and honest unavailable-data markers',()=>{
 const data=require('../interview-posts.json'),countries=require('../profile-options').countries;
 assert.equal(data.posts.length,241);assert.match(data.source,/travel.state.gov/);
 assert.equal(new Set(data.posts.map(p=>p.city)).size,data.posts.length);
 for(const p of data.posts){assert.ok(countries.some(c=>c.code===p.countryCode),p.city);assert.equal(typeof p.studentWaitReported,'boolean')}
 assert.equal(data.posts.find(p=>p.city==='Lagos').countryCode,'NG');
 assert.equal(data.posts.find(p=>p.city==='Abuja').studentWaitReported,false);
});
