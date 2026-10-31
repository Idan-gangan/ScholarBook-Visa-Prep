(function(root){
 const filled=v=>typeof v==='string'&&v.trim().length>0;
 const meaningfulFuturePlan=v=>filled(v)&&!/^(?:nil+|n\/a|none|no|not applicable|unknown|0|tbd)$/i.test(v.trim());
 function missing(p={}){
  const result=[];
  for(const [key,label] of Object.entries({country:'Home country',university:'Full school / university name',major:'Program',academicLevel:'Study level',studyStatus:'School attendance status',phoneCountry:'Phone calling country',phone:'Phone number',interviewCountry:'Interview country',interviewCity:'Interview city or Not booked yet',postGradPlan:'Future plans or I’m still deciding'}))if(!(key==='postGradPlan'?meaningfulFuturePlan(p[key]):filled(p[key])))result.push(label);
  for(const [key,label] of [['previousRefusal','Previous U.S. visa refusal'],['previousTravel','Previous U.S. travel']])if(!['Yes','No'].includes(p[key]))result.push(label+' (Yes or No)');
  if(p.previousAttempts===''||p.previousAttempts==null||!Number.isInteger(Number(p.previousAttempts))||Number(p.previousAttempts)<0)result.push('Number of previous applications');
  else if(p.previousRefusal==='Yes'&&Number(p.previousAttempts)===0)result.push('At least one previous application for a previous refusal');
  if(!filled(p.fundingSources))result.push('Funding source or Not decided yet');
  if(String(p.fundingSources||'').includes('Athletic scholarship')&&(!filled(p.sport)||p.sport==='Not a student-athlete'))result.push('Sport for athletic scholarship');
  if(p.sport==='Other'&&!filled(p.sportOther))result.push('Name of your sport');
  return result;
 }
 const api={missing};if(typeof module==='object'&&module.exports)module.exports=api;else root.VisaAtlasProfile=api;
})(typeof window==='object'?window:globalThis);
