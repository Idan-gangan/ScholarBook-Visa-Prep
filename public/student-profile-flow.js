/* Progressive profile editor. Moves existing fields without recreating them or changing their save payload. */
(function(root){
 'use strict';
 const names=['Study plans','Funding and sport','Interview details','Background and future plans'];
 const pick=id=>document.getElementById(id);
 let stage=0,dirty=false,ready=false,saving=false;
 const create=(tag,className)=>{const el=document.createElement(tag);if(className)el.className=className;return el;};
 function section(number,title,description){
   const el=create('section','profile-stage wide');
   el.dataset.stage=String(number);
   const header=create('div','profile-stage-heading');
   const eyebrow=create('span','profile-stage-eyebrow');eyebrow.textContent='STEP '+(number+1)+' OF 4';
   const h=create('h2');h.textContent=title;
   const p=create('p');p.textContent=description;
   header.append(eyebrow,h,p);el.append(header);
   return el;
 }
 function hint(stageEl,text){
   const p=create('p','profile-help');p.textContent=text;stageEl.append(p);
 }
 function moveAll(from,to){for(const node of [...from.children])to.append(node);}
 function moveChildren(from,to,children){for(const node of children)to.append(node);}
 function updateSport(){
   const input=pick('p_sport'),other=pick('p_sportOther');
   if(!input||!other)return;
   const wrapper=other.closest('.field');
   if(wrapper)wrapper.hidden=input.value!=='Other';
   other.required=input.value==='Other';
 }
 function snapshot(){
   const values={};
   const form=pick('profileForm');
   if(!form)return values;
   for(const el of form.querySelectorAll('[id^="p_"]')){
     if(el.id)values[el.id.slice(2)]=el.value||'';
   }
   values.fundingSources=[...form.querySelectorAll('input[name="fundingSource"]:checked')].map(x=>x.value).join('; ');
   values.coverageItems=[...form.querySelectorAll('input[name="coverageItem"]:checked')].map(x=>x.value).join('; ');
   return values;
 }
 function progress(){
   const summary=pick('profileCompletionText'),saveState=pick('profileSaveState');
   if(!summary||!saveState)return;
   const missing=root.VisaAtlasProfile?.missing(snapshot())||[];
   summary.textContent=missing.length
      ?missing.length+' required detail'+(missing.length===1?'':'s')+' still needed for a full mock interview. You can save an incomplete profile.'
      :'Required details are complete. Review everything before your mock interview.';
   saveState.textContent=dirty?'Unsaved changes':'No unsaved changes';
   saveState.classList.toggle('unsaved',dirty);
 }
 function switchTo(index,{scroll=true}={}){
   if(!ready)return;
   stage=Math.min(3,Math.max(0,Number(index)||0));
   const form=pick('profileForm');
   for(const part of form.querySelectorAll(':scope > .profile-stage'))part.hidden=Number(part.dataset.stage)!==stage;
   for(let i=0;i<4;i++){
     const nav=pick('profileNav'+i);
     if(!nav)continue;
     nav.classList.toggle('active',i===stage);
     if(i===stage)nav.setAttribute('aria-current','step');
     else nav.removeAttribute('aria-current');
   }
   const title=pick('profileStepTitle');if(title)title.textContent='Step '+(stage+1)+' of 4 · '+names[stage];
   const prev=pick('profilePrevStep');if(prev)prev.hidden=stage===0;
   const next=pick('profileNextStep');if(next)next.hidden=stage===3;
   if(scroll)pick('profileJourney')?.scrollIntoView?.({behavior:'smooth',block:'start'});
 }
 function setup(){
   const form=pick('profileForm');
   if(!form || typeof form.querySelector!=='function'||typeof form.append!=='function')return false;
   const current=[...form.children];
   const education=form.querySelector('#educationHistory');
   const funding=current.find(x=>x.querySelector?.('h2')?.textContent==='Your funding');
   const contact=current.find(x=>x.tagName==='SECTION' && x.querySelector?.('h2')?.textContent==='Contact and interview details');
   if(!education||!funding||!contact)return false;
   const fundingIndex=current.indexOf(funding);
   const contactIndex=current.indexOf(contact);
   if(fundingIndex<0||contactIndex<=fundingIndex)return false;
   const stage0=section(0,'Your study plans','Your school, course and education history.');
   const stage1=section(1,'Funding and sport','Choose confirmed support and explain any remaining costs.');
   const stage2=section(2,'Contact and interview','Use your real phone and consulate details. You can say Not booked yet.');
   const stage3=section(3,'Your background and goals','Explain your previous applications and your genuine plans after studying.');
   const general=current.slice(0,fundingIndex);
   const finance=current.slice(fundingIndex,contactIndex);
   const grid0=create('div','formgrid');moveChildren(form,grid0,general);stage0.append(grid0);
   const grid1=create('div','formgrid');moveChildren(form,grid1,finance);stage1.append(grid1);
   hint(stage1,'If a scholarship covers every confirmed expense, state that no costs remain. Otherwise, say who pays the balance. Only select items your award actually covers.');
   const inner=contact.querySelector('.formgrid');
   if(!inner)return false;
   const backgroundStart=[...inner.children].findIndex(x=>x.querySelector?.('#p_previousRefusal'));
   if(backgroundStart<0)return false;
   const contactChildren=[...inner.children].slice(0,backgroundStart);
   const backgroundChildren=[...inner.children].slice(backgroundStart);
   const grid2=create('div','formgrid');moveChildren(inner,grid2,contactChildren);stage2.append(grid2);
   const grid3=create('div','formgrid');moveChildren(inner,grid3,backgroundChildren);stage3.append(grid3);
   hint(stage3,'For future plans, enter a real goal or write “I’m still deciding.” A placeholder like “nil” does not give the interviewer useful context.');
   contact.remove();
   form.append(stage0,stage1,stage2,stage3);
   for(const input of form.querySelectorAll('input,select,textarea')){
     input.addEventListener('input',changed);
     input.addEventListener('change',changed);
   }
   pick('p_sport')?.addEventListener('change',updateSport);
   updateSport();
   ready=true;dirty=false;stage=0;switchTo(0,{scroll:false});progress();
   const status=pick('profileStatus');if(status)status.textContent='';
   return true;
 }
 function changed(){dirty=true;updateSport();progress();}
 function markSaved(){dirty=false;progress();}
 function reset(){dirty=false;ready=false;stage=0;saving=false;}
 async function next(){
   if(!ready)return;
   if(saving)return;
   saving=true;
   const next=pick('profileNextStep');if(next)next.disabled=true;
   try{
     if(typeof root.saveProfile==='function'){
       const success=await root.saveProfile();
       if(success!==false)switchTo(stage+1);
     }
   }finally{saving=false;if(next)next.disabled=false;}
 }
 root.VisaAtlasStudentProfile={setup,next,previous:()=>switchTo(stage-1),go:switchTo,markSaved,reset,hasUnsaved:()=>dirty,snapshot,progress,getStep:()=>stage};
})(window);
