/* Shared lesson content for the learning page and tutor. */
(function(root){
const lessons=[
  {
    "id": "study-purpose",
    "title": "Your study plans",
    "summary": "Connect your country, university, and course choices.",
    "intro": "Questions about the U.S., your university, and your major ask you to explain the reasons behind your study plan.",
    "points": [
      "Connect your subject to a genuine interest or experience and a skill you want to develop.",
      "Explain why studying in the U.S. fits that goal. A broad claim about quality needs a specific, researched connection.",
      "Compare your actual school options. Use a verified course or program feature to explain your choice; do not invent rankings or facilities."
    ],
    "prompts": [
      "What interests you about your subject?",
      "What U.S. study opportunity and school feature have you checked?",
      "How does this choice connect to your learning goals?"
    ],
    "questions": [
      "Why do you want to study in the United States?",
      "Why this university rather than your other options?",
      "Why did you choose this major?"
    ],
    "example": "A useful explanation connects interest → learning opportunity → goal. “The education is good” needs a specific connection to your own plan."
  },
  {
    "id": "academic-journey",
    "title": "Your academic journey",
    "summary": "Explain your education, grades, gaps, and next step.",
    "intro": "Academic-history questions explore how your previous education and activities connect to the program you chose.",
    "points": [
      "Build a short timeline: when you finished school or your degree, what you studied, and what you have done since.",
      "Describe your grades accurately. If asked about a weak result or study gap, explain the real circumstances and relevant activities without inventing improvements.",
      "For graduate study, connect your bachelor’s degree and experience to the new program. If changing fields, explain the actual reason and preparation."
    ],
    "prompts": [
      "What is your education timeline and academic background?",
      "What have you done since finishing, including any gaps?",
      "Why is this program the next step, including any change of field?"
    ],
    "questions": [
      "When did you finish high school or your previous degree?",
      "What have you been doing since graduation?",
      "How does this program connect to your previous studies?"
    ],
    "example": "For a timeline, use: qualification and date → actual activities since then → reason for the next step. Dates and results should match your records."
  },
  {
    "id": "funding",
    "title": "Your funding",
    "summary": "Understand costs, scholarships, and sponsor support.",
    "intro": "Funding questions ask how your tuition and living expenses will be paid and what remains uncovered.",
    "points": [
      "Review your school’s cost figures and award documents. Separate tuition, housing, living expenses, and other listed costs; use a consistent time period.",
      "For a scholarship, explain how you obtained it and exactly what it covers. “Full scholarship” should not replace checking the award’s actual terms.",
      "For remaining costs, explain who pays, your relationship, their actual work or source of funds, and the support arranged. If details are missing, identify what you need to confirm."
    ],
    "prompts": [
      "What are the documented costs and exact award coverage, if any?",
      "How did you obtain the award or arrange your funding?",
      "Who pays any remaining costs, and what do you know about that support?"
    ],
    "questions": [
      "Who is paying for your education?",
      "How did you receive your scholarship and what does it cover?",
      "How will the remaining tuition and living expenses be paid?"
    ],
    "example": "Hypothetical calculation: if annual costs are 30,000 and a confirmed award covers 20,000, explain the remaining 10,000. These figures are an example, never your personal facts."
  },
  {
    "id": "future-plans",
    "title": "Your future plans",
    "summary": "Connect the degree to your genuine goals.",
    "intro": "Future-plan questions ask how you expect to use your education after graduation.",
    "points": [
      "Connect skills from the degree to an actual career interest or next step. Explain the connection rather than listing an impressive job title.",
      "Separate a confirmed arrangement from an aspiration. Developing plans can be described honestly as developing.",
      "Keep your explanation consistent with your study choices and actual intentions. Do not invent an employer, family obligation, or promise to return home."
    ],
    "prompts": [
      "What are your actual goals after graduation?",
      "Which skills from this degree would support those goals?",
      "What is decided, and what is still developing?"
    ],
    "questions": [
      "What are your plans after graduation?",
      "How will this degree help with those plans?",
      "What would you like to do after completing your studies?"
    ],
    "example": "Connect a goal to a skill you expect to learn. Describe an ambition as an ambition; do not present it as a guaranteed job."
  },
  {
    "id": "circumstances",
    "title": "Your circumstances",
    "summary": "Prepare for relevant follow-ups about your history.",
    "intro": "Some follow-ups depend on your own history. Review the topics that apply, and mark the others “Not applicable.”",
    "points": [
      "Previous refusals: accurately describe your application history and only changes that really occurred. A new school or document does not guarantee a different decision.",
      "School changes and timing: explain your actual reason for changing schools. Know your program start date and any confirmed deferral or late-arrival arrangement; check unknown details with the school.",
      "Athletics, when relevant: describe your sport, event, results, recruitment process, and schools that genuinely recruited you. Explain how study and sport fit together. Non-athletes can skip this topic."
    ],
    "prompts": [
      "What previous application history and real changes apply, if any?",
      "Have your school or start-date arrangements changed?",
      "If relevant, what are your athletic and recruitment facts? Otherwise write “Not applicable.”"
    ],
    "questions": [
      "What has changed since your previous application?",
      "Why did you change universities?",
      "When does your program start?",
      "How were you recruited, and which schools recruited you?"
    ],
    "example": "Describe a change using: what happened → what changed → what is now confirmed. If nothing changed, do not create a story."
  },
  {
    "id": "interview-practice",
    "title": "Interview practice",
    "summary": "Bring the topics together before your mock.",
    "intro": "Interview practice helps you explain your own plans clearly when questions arrive in different orders.",
    "points": [
      "Listen for the exact question and answer it directly first. Add a relevant detail, then pause instead of delivering a memorized speech.",
      "Practise switching between study plans, academics, funding, and future goals. A differently worded follow-up should still match your actual facts.",
      "Ask for clarification if you did not understand. If you do not know a detail, say so and identify what needs checking. Use mock feedback to choose what to revisit."
    ],
    "prompts": [
      "Which study, funding, and timeline facts can you explain clearly?",
      "Which topic still needs research or practice?",
      "What will you focus on during your mock interview?"
    ],
    "questions": [
      "Why this program?",
      "Who covers your living expenses?",
      "What have you done since your last studies?",
      "How does the degree support your plans?"
    ],
    "example": "Practise a direct answer plus one relevant supporting detail. Clear, truthful explanations matter more than sounding polished or rehearsed."
  }
];
if(typeof module!=="undefined" && module.exports)module.exports=lessons;
else root.VisaAtlasCurriculum=lessons;
})(typeof window!=="undefined"?window:globalThis);
