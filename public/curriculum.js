/* Shared lesson content for the learning page and tutor. */
(function(root){
const lessons=[
  {
    "id": "study-purpose",
    "title": "Your study plans",
    "summary": "Explain what you want to study and why.",
    "intro": "You may be asked why you chose the U.S., your school, or your course.",
    "points": [
      "Say what interests you about your subject. You can mention a class, an experience, or something you want to learn.",
      "Why the U.S., and why is it the right choice for you? Give one reason based on what you have learned about your course or school.",
      "Explain why you chose this school. Mention a course, project, or other feature you have checked. Only compare schools you actually considered."
    ],
    "prompts": [
      "Why does this subject interest you?",
      "What do you like about this school or course?",
      "What would you like to learn?"
    ],
    "questions": [
      "Why do you want to study in the United States?",
      "Why this school rather than your other options?",
      "Why did you choose these studies?"
    ],
    "example": "Start with what you want to study and where. Then give your real reason for choosing it."
  },
  {
    "id": "academic-journey",
    "title": "Your academic journey",
    "summary": "Talk about your studies and what you have done since.",
    "intro": "These questions are about your education so far and why you want to continue studying.",
    "points": [
      "Say what you studied and when. Then explain what you have done since.",
      "Be honest about your grades. If there was a break in your studies, explain what happened and what you did during that time.",
      "For graduate study, explain how your earlier degree or experience relates to your new course. If you are changing subjects, say why."
    ],
    "prompts": [
      "What have you studied, and when?",
      "What have you done since then?",
      "Why do you want to take this course now?"
    ],
    "questions": [
      "When did you finish high school or your previous degree?",
      "What have you been doing since graduation?",
      "How does this program connect to your previous studies?"
    ],
    "example": "Say what you studied, when you finished, and what you did next. Check that your dates and grades match your records."
  },
  {
    "id": "funding",
    "title": "Your funding",
    "summary": "Explain who pays and what their support covers.",
    "intro": "You may be asked who will pay your school fees and living costs.",
    "points": [
      "Check the costs listed by your school. Include school fees, housing, food, and other expenses. Compare amounts for the same period, such as one year.",
      "For a scholarship, say how you received it and what it pays for. Check your award letter before saying it covers everything.",
      "Explain who will pay any costs left over. Say how you know them and where the money comes from. Check any details you do not know."
    ],
    "prompts": [
      "How much will it cost, and what does your funding cover?",
      "How did you get your scholarship or other support?",
      "Who will pay any costs left over?"
    ],
    "questions": [
      "Who is paying for your education?",
      "How did you receive your scholarship and what does it cover?",
      "How will the remaining tuition and living expenses be paid?"
    ],
    "example": "For example only: if one year costs 30,000 and a scholarship pays 20,000, you still need 10,000. Use your own confirmed amounts."
  },
  {
    "id": "future-plans",
    "title": "Your future plans",
    "summary": "Talk about what you want to do after your studies.",
    "intro": "These questions ask how your studies will help with your plans for the future.",
    "points": [
      "Say what you want to do after studying and how your course can help.",
      "Explain what you have already arranged and what you are still hoping to do. It is okay if some plans are not decided yet.",
      "Use your real plans. Do not invent a job offer, family duty, or promise to return home."
    ],
    "prompts": [
      "What would you like to do after your studies?",
      "How will your course help you do that?",
      "What have you decided, and what are you still considering?"
    ],
    "questions": [
      "What are your plans after graduation?",
      "How will this degree help with those plans?",
      "What would you like to do after completing your studies?"
    ],
    "example": "Explain your goal and what you hope to learn. A job you want is different from a job you have already been offered."
  },
  {
    "id": "circumstances",
    "title": "Your circumstances",
    "summary": "Talk about past applications or changes in your plans.",
    "intro": "Only practise the topics that apply to you. You can skip the others.",
    "points": [
      "Previous refusals: explain what happened and what has changed, if anything. A new school or document does not guarantee approval.",
      "School changes and timing: say why you changed schools, if you did. Know your start date. If it changed, check the new arrangements with your school.",
      "Athletics, when relevant: talk about your sport, results, and how you were recruited. Explain how you will combine school and sport. Skip this if it does not apply."
    ],
    "prompts": [
      "Have you applied before? What has changed, if anything?",
      "Have your school or start date changed?",
      "If you play a sport, how were you recruited?"
    ],
    "questions": [
      "What has changed since your previous application?",
      "Why did you change universities?",
      "When does your program start?",
      "How were you recruited, and which schools recruited you?"
    ],
    "example": "Explain what happened, what changed, and what is confirmed now. If nothing changed, say so."
  },
  {
    "id": "interview-practice",
    "title": "Interview practice",
    "summary": "Practise short answers before your mock interview.",
    "intro": "Practise explaining your plans even when questions come in a different order.",
    "points": [
      "Listen to the question. Answer it first, add one useful detail, then pause. You do not need a memorized speech.",
      "Practise questions about your studies, funding, and future plans. Use the same facts even when a question is worded differently.",
      "If you do not understand, ask the person to repeat or explain. If you do not know a detail, say so. Use your mock feedback to choose what to practise next."
    ],
    "prompts": [
      "Which questions can you answer clearly?",
      "What do you still need to check or practise?",
      "What do you want to improve in your mock interview?"
    ],
    "questions": [
      "Why this program?",
      "Who covers your living expenses?",
      "What have you done since your last studies?",
      "How does the degree support your plans?"
    ],
    "example": "Give a short, honest answer and one useful detail. Use words you would normally say."
  }
];
// These paths describe preparation topics, not visa eligibility rules.
lessons.studyLevels = ['High school', 'Undergraduate', "Master’s", 'PhD / Doctorate', 'Other'];
lessons.resolveLevel = function(value){
 const v=String(value||'').toLowerCase();
 if(/high.?school|secondary/.test(v))return 'high-school';
 if(/ph\.?d|doctor/.test(v))return 'phd';
 if(/master|msc|mba|m\.s\.|m\.a\./.test(v))return 'masters';
 if(/undergrad|bachelor|freshman|sophomore|junior|senior|first year|second year|third year|fourth year/.test(v))return 'undergraduate';
 return 'unspecified';
};
lessons.levelTopics = {
 'high-school': [
  'Why did you choose this school? Talk about the subjects you want to learn. You do not need a university major for high school.',
  'Describe your current grade, subjects, recent results, and why you are moving to this school. Do not assume you have already finished high school.',
  'Explain who will pay school fees and living costs. Know the actual parent, guardian, or other sponsor arrangement and what is still being confirmed.',
  'Talk about what interests you and what you might study next. It is okay if you have not chosen a career or university yet.',
  'Review confirmed accommodation, responsible adult or school support arrangements, and your school start date. Do not invent a guardian or treat these topics as an eligibility checklist.',
  'Practise explaining your school choice, subjects, funding, and living arrangements in age-appropriate language.'
 ],
 'undergraduate': [
  'Say what you want to study, why it interests you, and why you chose this school.',
  'Explain your secondary education and any college study, results, gaps, or transfer history that actually apply.',
  'Separate confirmed scholarships from remaining tuition and living costs, and explain the actual funding source.',
  'Explain what you hope to do after your degree. Say which plans are confirmed and which are still ideas.',
  'Review relevant transfers, previous applications, timing, and athletics only when they apply.',
  'Practise connecting your major, school, academic history, costs, and future plans.'
 ],
 'masters': [
  'What do you want to learn in your master’s? Explain why you chose this course. Use details you checked about the school.',
  'Connect your bachelor’s degree and any work or research experience to the master’s program. Explain a change of field honestly.',
  'Explain your actual funding package, including any confirmed scholarship or assistantship, its terms, and remaining costs.',
  'Explain how what you learn could help with your work or further study. Only mention a job offer if you have one.',
  'If relevant, explain why you are returning to study or changing subjects. Check your past applications and course start date.',
  'Practise explaining why a master’s now, how it builds on your background, and how it is funded.'
 ],
 'phd': [
  'What do you want to research, and why a PhD? Explain what you checked about this course or supervisor. Say if a supervisor is only someone you hope to work with.',
  'Talk about studies, projects, or research you have done. Explain how they prepared you. Only mention degrees and published work you actually have.',
  'Say what your funding covers and how long it lasts. Explain any work required for it and who pays costs left over. Do not assume every PhD is fully funded.',
  'What would you like to do after your PhD? You might want to research, teach, or work elsewhere. Explain your own plan; it is okay if some details are undecided.',
  'Review any confirmed supervisor or research arrangements, changes of field, previous applications, and program timing. Do not invent a research topic or lab acceptance.',
  'Practise explaining your research in plain language, why the program fits, your relevant experience, and the actual funding terms.'
 ],
 'unspecified': []
};
lessons.levelQuestions = {
 'high-school': [
  ['Why this school?', 'Which subjects interest you?', 'Why do you want to study in the U.S.?'],
  ['What grade and subjects are you studying?', 'How have you been doing at school?', 'Why are you moving to this school?'],
  ['Who will pay your school fees?', 'How will your living costs be covered?', 'What funding has been confirmed?'],
  ['What would you like to learn?', 'What further education are you considering?', 'Which plans are still developing?'],
  ['Where will you live?', 'What adult or school support has been arranged?', 'When does your school start?'],
  ['Why this school?', 'Who is supporting your education?', 'What are your living arrangements?']
 ],
 'phd': [
  ['What do you want to research?', 'Why this PhD program?', 'What did you find out about this program or supervisor?'],
  ['How has your prior study prepared you?', 'What research or projects have you actually done?', 'Why doctoral study now?'],
  ['What does your funding cover?', 'How long does it last, and what must you do to keep it?', 'Who pays any costs left over?'],
  ['How does doctoral training support your goals?', 'What research or career directions interest you?', 'Which plans remain uncertain?'],
  ['What research arrangements are confirmed?', 'Have your field or school plans changed?', 'When does your program start?'],
  ['Explain your research interests in plain language.', 'Why is this program a good fit?', 'How is your doctoral study funded?']
 ]
};
// Shared by the lesson cards and voice tutor: unknown facts stay unknown.
lessons.forStudent = function(student, lessonId){
 const lesson=lessons.find(item=>item.id===lessonId);
 if(!lesson)throw new Error('Unknown lesson');
 const value=key=>{
  const raw=student[key];
  const text=raw==null?'':String(raw).trim();
  return /^(?:|no|none|nil|nill|null|false|0|n\/a|not applicable|not provided|unknown)$/i.test(text)?'':text;
 };
 const level=lessons.resolveLevel(student.academicLevel), index=lessons.indexOf(lesson);
 const school=value('university')||'[school]', subject=value('major')||'[subject or research field]';
 const sport=value('sport'), award=value('scholarship'), coverage=value('scholarshipCoverage'), sponsor=value('remainingSponsor');
 const athletic=!!sport || /\b(athletic|sport|track and field)\b/i.test(award);
 const refusal= /^(yes|true)$/i.test(String(student.previousRefusal||'').trim()) || Number(student.previousAttempts)>0;
 let points=[...(lessons.levelTopics[level][index]?[lessons.levelTopics[level][index]]:[]),...lesson.points];
 let questions=[...(lessons.levelQuestions[level]?.[index]||lesson.questions)];
 let structure='', example='';
 if(lessonId==='study-purpose'){
  structure='Say what you will study and where. If asked why the U.S., explain your own reason for choosing it.';
  const study=level==='high-school'?'continue my secondary education':level==='undergraduate'?`study for a bachelor’s degree in ${subject}`:level==='masters'?`study for a master’s degree in ${subject}`:level==='phd'?`study for a PhD in ${subject}`:`study ${subject}`;
  example=`I’m going to ${school} to ${study}.`;
  if(value('studyStatus')==='Already studying there')example=`I’m studying ${subject} at ${school}.`;
  if(award)example+=` I have been offered ${award}.`;
  if(sport)points.push(`Your profile lists ${sport}. You can mention it when explaining your school choice. Only say you will join a team or have a sports scholarship if you know that is confirmed.`);
 }else if(lessonId==='academic-journey'){
  structure='Say what you studied, when, and what you did next. Use your real dates and results.';
  example=level==='high-school'?`I’m currently in [grade], studying [subjects], and plan to continue at ${school}.`:`I completed [qualification] in [year]. Since then, I have [actual activity], and my next step is studying ${subject} at ${school}.`;
  if(/\b(freshman|first[ -]year)\b/i.test(value('academicLevel'))){
   example=`I’m going to begin my bachelor’s degree in ${subject} at ${school}. Before this, I [your actual education history].`;
   points.push('First year describes the level you plan to start. Only say you are currently studying there if you have already started.');
  }
  if(value('studyStatus')==='Already studying there')example=`I’m studying ${subject} at ${school}. Before this, I [your actual education history].`;
  if(value('priorEducationStatus')&&value('priorEducationYear'))points.push(`You recorded ${value('priorEducationStatus').toLowerCase()} for your previous education, with year ${value('priorEducationYear')}. If you are still studying, describe this as an expected completion year.`);
  if(level==='high-school')points=[lessons.levelTopics[level][index],'Describe your current subjects and recent results accurately.','Explain any actual gap or school change without assuming you have finished secondary school.'];
  else if(level!=='masters'&&level!=='phd')points=points.filter(p=>!p.startsWith('For graduate study'));
  else if(level==='phd')points=points.filter(p=>!p.startsWith('For graduate study'));
 }else if(lessonId==='funding'){
  structure='Say who pays, what they cover, and who pays any costs left over. Check the amounts and conditions.';
  if(value('fundingSources'))points.push(`Your recorded funding sources are: ${value('fundingSources')}. Explain what each contributes; do not assume equal shares or full coverage.`);
  example=award?`My funding includes ${award}. ${coverage?`It covers ${coverage}.`:'I need to check exactly what it covers.'}`:coverage?`My funding covers ${coverage}. I need to confirm the funding source and any remaining costs.`:sponsor?`${sponsor} will help with remaining costs. I need to confirm the full funding arrangement and amounts.`:'My education will be paid for by [actual funding source], covering [confirmed costs].';
  if((award||coverage)&&sponsor)example+=` ${sponsor} will support the remaining costs.`;
  if(!award&&!coverage){points=points.filter(p=>!p.startsWith('For a scholarship'));questions=questions.filter(q=>!q.includes('scholarship'));}
  points.push('Check whether your funding pays for travel, summer expenses, and insurance. Do not assume these are included.');
  if(award)points.push('How did you receive this award? Explain the real process. Playing a sport does not by itself mean your scholarship is athletic.');
  if(/full[ -]?(ride|scholarship)|fully funded/i.test(award))points.push('Check what “full” means in your award. Does it cover tuition as well as living costs? Explain any costs left over without guessing.');
 }else if(lessonId==='future-plans'){
  structure='Say what you want to do next and how your studies will help. Explain what is planned and what is already arranged.';
  example=value('postGradPlan')?`My current plan is: ${value('postGradPlan')}. My course will help me learn [skills for that goal].`:level==='high-school'?'After secondary school, I’m considering [your study plans or interests]. I’m still exploring the specific path.':'After my studies, I hope to [your real goal], using [relevant skills].';
  if(!value('postGradPlan')){points.push('You have not supplied a future plan yet. What would you like to do after your studies? It is okay if you are still deciding.');questions.unshift('What would you like to do after your studies?');}
  if(sport)points.push(`If ${sport} is part of your future plans, explain how. Coaching, competing, or sports development are possibilities to discuss, not goals we assume you have.`);
 }else if(lessonId==='circumstances'){
  structure='Choose a topic that applies to you. Say what happened, what changed, and what you know now.';
  points=points.filter(p=>(refusal||!p.startsWith('Previous refusals:'))&&(athletic||!p.startsWith('Athletics,')));
  questions=questions.filter(q=>(refusal||!q.includes('previous application'))&&(athletic||!q.includes('recruited')));
  example=refusal?'Since my previous application, [actual change, if any]. The confirmed details are [facts].':`My program at ${school} starts on [confirmed date].`;
  if(!refusal)points.push('Only discuss a previous refusal if you have had one.');
 }else{
  structure='Answer the question, add one useful detail, then pause. Ask if you do not understand.';
  example=`I chose ${school} because [your real reason]. One feature I checked is [relevant school or program detail].`;
 }
 return {id:lessonId,level,athletic,refusal,intro:lesson.intro,points,questions,structure,example,exampleNotice:'This example uses details you entered. Replace anything in brackets with your own facts. Use it to practise, not to memorize.'};
};
if(typeof module!=="undefined" && module.exports)module.exports=lessons;
else root.VisaAtlasCurriculum=lessons;
})(typeof window!=="undefined"?window:globalThis);
