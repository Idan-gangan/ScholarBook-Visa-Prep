const PDFDocument=require('pdfkit');
const {TOPICS}=require('./interview-design');
const text=value=>String(value??'');
function createReportPdf(report,student){
 return new Promise((resolve,reject)=>{
  const doc=new PDFDocument({size:'A4',margins:{top:55,bottom:55,left:48,right:48},bufferPages:true,info:{Title:'VisaAtlas practice report',Author:'VisaAtlas'}});
  const chunks=[];doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
  doc.registerFont('Regular',require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf'));
  doc.registerFont('Bold',require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf'));doc.font('Regular');
  const width=doc.page.width-96;
  function room(height=65){if(doc.y+height>doc.page.height-65)doc.addPage();}
  function paragraph(value){if(!value)return;doc.font('Regular').fontSize(10).fillColor('#344b60').text(text(value),{width,lineGap:4});doc.moveDown(.65);}
  function heading(value){room();doc.font('Bold').fontSize(13).fillColor('#12334f').text(text(value),{width});doc.moveDown(.45);}
  function list(title,values){if(!Array.isArray(values)||!values.length)return;heading(title);values.forEach((value,i)=>paragraph((i+1)+'. '+text(value)));}
  doc.font('Bold').fontSize(25).fillColor('#12334f').text('VisaAtlas');
  doc.font('Regular').fontSize(11).fillColor('#416d97').text('F-1 INTERVIEW PRACTICE REPORT');doc.moveDown(1.2);
  heading(student.name||'Student');
  const date=new Date(report.createdAt);
  paragraph('Mock #'+text(report.mockNumber??'Not recorded')+' | '+({standard:'Standard',challenging:'Challenging',intensive:'Intensive'}[report.difficulty]||'Mode not recorded'));
  paragraph('Practice date: '+(Number.isFinite(date.getTime())?date.toISOString().slice(0,10)+' (UTC)':'Not recorded'));
  const score=Number.isFinite(report.overall)?report.overall:Number.isFinite(report.partialScore)?report.partialScore:null;
  const partial=report.scoreType==='partial'||Number.isFinite(report.partialScore);
  const label=report.scoringMethod==='all-seven-v1'?'Overall preparation':Number.isFinite(report.partialScore)?'Partial practice score':'Practice score';
  doc.font('Bold').fontSize(28).fillColor('#194e7a').text(score===null?'Not scored':score+'/100');
  paragraph(label+(partial?' - incomplete interview':''));
  if(Number.isInteger(report.coverage?.assessed)&&Number.isInteger(report.coverage?.required))paragraph('Coverage: '+report.coverage.assessed+' of '+report.coverage.required+' areas assessed.');
  paragraph('Practice feedback only. This is not a prediction or guarantee of visa approval.');
  paragraph(report.scoreExplanation);
  heading('Interview feedback');paragraph(report.feedback||'No written feedback was recorded.');
  if(report.biggestWeakness){heading('Focus first');paragraph(report.biggestWeakness);}
  list('Your next steps',report.nextSteps?.length?report.nextSteps:report.nextStep?[report.nextStep]:[]);
  list('What went well',report.strengths);list('Points to clarify',report.clarifications);
  heading('Topic coverage and scores');
  if(!Array.isArray(report.assessments))paragraph('Detailed topic assessments were not recorded for this historical report.');
  else for(const [topic,label] of TOPICS){
   const item=report.assessments.find(a=>a.topic===topic||a.label===label);
   room(75);doc.font('Bold').fontSize(10).fillColor('#12334f').text(label,{width});doc.moveDown(.2);
   paragraph(item?.status==='assessed'?(Number.isFinite(item.score)?item.score+'/10':'Assessed - score not recorded')+(item.feedback?' - '+text(item.feedback):''):'Not assessed'+(report.scoringMethod==='all-seven-v1'?' - no points earned yet':''));
  }
  if(report.scoringMethod==='all-seven-v1'){
   heading('Scoring basis');
   if(Number.isFinite(report.earnedPoints)&&Number.isFinite(report.possiblePoints))paragraph(report.earnedPoints+' / '+report.possiblePoints+' points across all seven areas, converted to a score out of 100.');
   paragraph('Not assessed means no points earned yet; it does not mean a wrong answer.');
   if(Number.isFinite(report.answeredTopicScore))paragraph('Answered-topic quality: '+report.answeredTopicScore+'/100. This average covers assessed areas only.');
  }else if(Array.isArray(report.assessments))paragraph('Scoring basis: assessed topic scores only. Unanswered topics are excluded.');
  if(report.humanReview){heading('Human review');paragraph('Reviewer: '+text(report.humanReview.reviewer));if(Number.isFinite(report.humanReview.score))paragraph('Coach-adjusted score: '+report.humanReview.score+'/100');paragraph(report.humanReview.note);}
  const pages=doc.bufferedPageRange();
  for(let i=pages.start;i<pages.start+pages.count;i++){
   doc.switchToPage(i);doc.font('Regular').fontSize(8).fillColor('#607488');
   doc.text('VisaAtlas | Private practice feedback',48,doc.page.height-36,{lineBreak:false});
   doc.text((i+1)+' / '+pages.count,doc.page.width-90,doc.page.height-36,{lineBreak:false});
  }
  doc.end();
 });
}
module.exports={createReportPdf};

// Browser printing supplies Unicode bidi layout for Arabic and mixed-script text.
// Keep this authenticated and uncached, just like the binary PDF export.
function createReportHtml(report,student){
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const p=value=>value?`<p dir="auto">${esc(value)}</p>`:'';
 const section=(title,value)=>value?`<section><h2>${esc(title)}</h2>${p(value)}</section>`:'';
 const list=(title,values)=>Array.isArray(values)&&values.length?`<section><h2>${esc(title)}</h2><ol>${values.map(x=>`<li dir="auto">${esc(x)}</li>`).join('')}</ol></section>`:'';
 const score=Number.isFinite(report.overall)?report.overall:Number.isFinite(report.partialScore)?report.partialScore:null;
 const date=new Date(report.createdAt);
 const topics=TOPICS.map(([id,label])=>{const item=report.assessments?.find(a=>a.topic===id||a.label===label);return `<section><h3>${esc(label)}</h3>${p(item?.status==='assessed'?(Number.isFinite(item.score)?item.score+'/10':'Assessed'):'Not assessed')}${item?.status==='assessed'?p(item.feedback):''}</section>`;}).join('');
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>VisaAtlas practice report</title><style>
 body{font:16px/1.6 Arial,sans-serif;color:#17334c;max-width:800px;margin:24px auto;padding:0 22px}h1{font-size:30px}h2{font-size:20px}h3{font-size:17px}p,li{overflow-wrap:anywhere;unicode-bidi:plaintext}section{break-inside:avoid}li{margin-bottom:10px}button{font:inherit;padding:12px 18px;cursor:pointer}.tools{padding:16px;background:#eef3ff}.score{font-size:28px;font-weight:bold}@page{size:A4;margin:18mm}@media print{body{max-width:none;margin:0;padding:0;font-size:11pt}.tools{display:none}h1,h2,h3{break-after:avoid}}
 </style><script src="/report-print.js" defer></script></head><body><div class="tools"><button id="printReport" type="button">Print / save as PDF</button><p>Choose Save as PDF in the print dialog. On iPhone, use Share → Print to preview and save the report.</p></div><h1>VisaAtlas</h1><p>F-1 INTERVIEW PRACTICE REPORT</p><h2 dir="auto">${esc(student.name||'Student')}</h2>${p('Mock #'+(report.mockNumber??'Not recorded')+' | '+({standard:'Standard',challenging:'Challenging',intensive:'Intensive'}[report.difficulty]||'Mode not recorded'))}${p('Practice date: '+(Number.isFinite(date.getTime())?date.toISOString().slice(0,10)+' (UTC)':'Not recorded'))}<p class="score">${score===null?'Not scored':esc(score)+'/100'}</p>${p(report.scoreType==='partial'?'Overall preparation — incomplete interview':'Practice preparation score')}${p('Practice feedback only. This is not a prediction or guarantee of visa approval.')}${p(report.scoreExplanation)}${section('Interview feedback',report.feedback)}${section('Focus first',report.biggestWeakness)}${list('Your next steps',report.nextSteps?.length?report.nextSteps:report.nextStep?[report.nextStep]:[])}${list('What went well',report.strengths)}${list('Points to clarify',report.clarifications)}<h2>Topic coverage and scores</h2>${p(report.coverage?report.coverage.assessed+' of '+report.coverage.required+' areas assessed.':'')}${topics}${section('Scoring basis',report.scoringMethod==='all-seven-v1'?`${report.earnedPoints} / ${report.possiblePoints} points across all seven areas. Unassessed areas earn no points yet; this does not mean a wrong answer.`:'Assessed topic scores only; unanswered topics are excluded.')}${report.humanReview?section('Human review — '+report.humanReview.reviewer,report.humanReview.note)+p(Number.isFinite(report.humanReview.score)?'Coach-adjusted score: '+report.humanReview.score+'/100':''):''}<footer>VisaAtlas | Private practice feedback</footer></body></html>`;
}
module.exports.createReportHtml=createReportHtml;
