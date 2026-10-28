(function(root){
 'use strict';
 const languages=Object.freeze([
  {code:'en',name:'English',label:'English',close:'Thank you. This mock interview is complete. Your feedback is ready to generate.'},
  {code:'fr',name:'French',label:'Français — French',close:'Merci. Cet entretien blanc est terminé. Vous pouvez maintenant générer votre rapport.'},
  {code:'es',name:'Spanish',label:'Español — Spanish',close:'Gracias. Esta entrevista de práctica ha terminado. Ya puedes generar tu informe.'},
  {code:'pt',name:'Portuguese',label:'Português — Portuguese',close:'Obrigado. Esta entrevista de prática terminou. Já pode gerar o seu relatório.'},
  {code:'ar',name:'Arabic',label:'العربية — Arabic',close:'شكرا لك. انتهت هذه المقابلة التدريبية. يمكنك الآن إنشاء تقرير الملاحظات.'},
  {code:'sw',name:'Swahili',label:'Kiswahili — Swahili',close:'Asante. Mahojiano haya ya mazoezi yamekamilika. Unaweza sasa kuunda ripoti yako.'}
 ].map(Object.freeze));
 function get(code){return languages.find(item=>item.code===(code||'en'))||null;}
 function requireLanguage(code){const language=get(code);if(!language)throw Object.assign(new Error('Choose a language from the practice language list.'),{status:400,publicMessage:'Choose a language from the practice language list.'});return language;}
 function voiceInstructions(prompt,code,mode){
  const language=requireLanguage(code);
  prompt=prompt.replace('Use simple English in EVERY mode.','Use simple '+language.name+' in EVERY mode.');
  if(mode==='mock')prompt=prompt.split(languages[0].close).join(language.close);
  return prompt+'\nPRACTICE LANGUAGE: '+language.name+'. Speak in this language from the first greeting, including the introduction and audio check. Translate example questions naturally. Keep VisaAtlas and proper names unchanged. Understand answers in this language or English; never infer language from nationality. Use the same topics, difficulty and scoring standards. '+(mode==='mock'?'Use this exact closing in the selected language: "'+language.close+'". If asked for an explanation in another language, briefly translate the question without giving an answer or coaching. Then return to the selected interview language.':'Explain and give examples in the selected language; you may explain in another language when the student explicitly requests it.');
 }
 function feedbackInstructions(code,practiceCode){return '\nFEEDBACK LANGUAGE: '+requireLanguage(code).name+'. Write all narrative feedback, strengths, clarifications, summary and next actions in this language. Keep JSON keys, enum values, topic identifiers and lesson IDs exactly as specified. The interview practice language was '+requireLanguage(practiceCode).name+'. Assess clarity in that language; do not label this an English-proficiency assessment or penalize a student for using the selected language. Preserve all scoring rules.';}
 function normalize(text){return String(text||'').normalize('NFKC').toLowerCase().replace(/[\p{P}\p{M}\p{Z}\s]/gu,'');}
 function isClosing(text,code){const language=get(code);return !!language&&normalize(text).includes(normalize(language.close));}
 const api={languages,get,requireLanguage,voiceInstructions,feedbackInstructions,isClosing};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.VisaAtlasLanguages=api;
})(typeof window==='undefined'?globalThis:window);
