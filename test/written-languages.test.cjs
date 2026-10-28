const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const written=require('../public/written-languages');
const base=require('../public/curriculum');
const {createReportHtml,createReportPdf}=require('../report-pdf');
test('stored catalogs cover every module and match the shipped browser bundle',()=>{
 const context={window:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../public/written-catalogs'),'utf8'),context);
 for(const code of written.codes){
  const catalog=require('../public/locales/'+code+'.json');
  assert.deepEqual(JSON.parse(JSON.stringify(context.window.VisaAtlasWrittenCatalogs[code])),catalog);
  assert.deepEqual(written.lessons(code).map(x=>x.id),base.map(x=>x.id));
  for(const lesson of written.lessons(code)){
   for(const key of ['title','summary','intro','structure','example'])assert.ok(lesson[key].length>5,code+' '+key);
   for(const key of ['points','prompts','questions'])assert.ok(lesson[key].length>=3);
  }
  for(const other of written.codes)assert.deepEqual(Object.keys(catalog.strings).sort(),Object.keys(require('../public/locales/'+other+'.json').strings).sort());
 }
 assert.equal(written.lessons('unknown'),base);
});
test('localized guidance preserves profile flags without inventing personal examples',()=>{
 for(const code of written.codes){
  const student={academicLevel:'Undergraduate',previousRefusal:'No'};
  const before=JSON.stringify(student),g=written.forStudent(code,student,'circumstances');
  assert.equal(JSON.stringify(student),before);
  assert.equal(g.refusal,base.forStudent(student,'circumstances').refusal);
  assert.equal(g.athletic,base.forStudent(student,'circumstances').athletic);
  assert.ok(g.exampleNotice);assert.ok(g.questions.length>=2);
 }
});
test('report language follows saved report, escapes content, preserves names and reviewer notes',async()=>{
 for(const code of [...written.codes,'en']){
  const report={feedbackLanguage:code,createdAt:'2026-10-28',mockNumber:1,overall:9,scoreType:'partial',feedback:'<script>untrusted</script>',coverage:{assessed:2,required:7},humanReview:{reviewer:'Student',note:'Interview feedback'}};
  const html=createReportHtml(report,{name:'Student'});
  assert.ok(html.includes('lang="'+code+'"'));
  assert.ok(html.includes('dir="'+(code==='ar'?'rtl':'ltr')+'"'));
  assert.ok(html.includes(written.text(code,'Topic coverage and scores')));
  assert.ok(html.includes('&lt;script&gt;untrusted&lt;/script&gt;'));
  assert.ok(html.includes('<h2 dir="auto">Student</h2>'));
  assert.ok(html.includes('<p dir="auto">Interview feedback</p>'));
  if(code!=='ar')assert.equal((await createReportPdf(report,{name:'Student'})).subarray(0,4).toString(),'%PDF');
 }
});
