const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const requirements=require('../public/profile-requirements');
const flow=fs.readFileSync(path.join(__dirname,'../public/student-profile-flow.js'),'utf8');

function fixture(){
 const byId=new Map(),elements=[];
 function make(tag='div',id='',className='',textContent=''){
  const node={
   tagName:tag.toUpperCase(),id,className,textContent,value:'',hidden:false,
   children:[],parent:null,events:{},dataset:{},attributes:{},style:{},
   get classList(){return {add:name=>{const set=new Set(node.className.split(/\s+/).filter(Boolean));set.add(name);node.className=[...set].join(' ');},
     remove:name=>{node.className=node.className.split(/\s+/).filter(x=>x!==name).join(' ');},
     toggle:(name,on)=>{const set=new Set(node.className.split(/\s+/).filter(Boolean));const should=on===undefined?!set.has(name):on;if(should)set.add(name);else set.delete(name);node.className=[...set].join(' ');},
     contains:name=>node.className.split(/\s+/).includes(name)};},
   append(...nodes){for(const child of nodes){if(child.parent)child.parent.children=child.parent.children.filter(x=>x!==child);node.children.push(child);child.parent=node;}},
   remove(){if(node.parent){node.parent.children=node.parent.children.filter(x=>x!==node);node.parent=null;}},
   setAttribute(k,v){node.attributes[k]=v;},removeAttribute(k){delete node.attributes[k];},
   addEventListener(type,fn){(node.events[type]??=[]).push(fn);},
   emit(type){for(const fn of node.events[type]||[])fn({target:node});},
   closest(selector){let cur=node;while(cur){if(matches(cur,selector))return cur;cur=cur.parent;}return null;},
   querySelector(selector){return node.querySelectorAll(selector)[0]||null;},
   querySelectorAll(selector){
    const result=[];
    if(selector===':scope > .profile-stage')return node.children.filter(x=>matches(x,'.profile-stage'));
    function walk(n){for(const child of n.children){if(matches(child,selector))result.push(child);walk(child);}}
    walk(node);return result;
   },
   scrollIntoView(){node.scrolled=true;}
  };
  if(id)byId.set(id,node);
  elements.push(node);
  return node;
 }
 function matches(node,selector){
   if(selector[0]==='#')return node.id===selector.slice(1);
   if(selector[0]==='.')return node.className.split(/\s+/).includes(selector.slice(1));
   if(selector==='[id^="p_"]')return node.id.startsWith('p_');
   if(selector==='input,select,textarea')return ['INPUT','SELECT','TEXTAREA'].includes(node.tagName);
   if(selector==='input[name="fundingSource"]:checked')return node.tagName==='INPUT'&&node.name==='fundingSource'&&node.checked;
   if(selector==='input[name="coverageItem"]:checked')return node.tagName==='INPUT'&&node.name==='coverageItem'&&node.checked;
   return node.tagName.toLowerCase()===selector.toLowerCase();
 }
 const document={createElement:tag=>make(tag),getElementById:id=>byId.get(id)||null};
 const form=make('div','profileForm','formgrid');
 function field(id,tag='input',value=''){
   const container=make('div','','field'),input=make(tag,id);
   input.value=value;container.append(input);return container;
 }
 const dataList=make('datalist','countryChoices');
 const intro=make('div','','wide');intro.append(make('h2','','','Your study plans'));
 const education=make('div','educationHistory','wide');education.append(make('h3','','','Your high-school education'));
 const funding=make('div','','wide');funding.append(make('h2','','','Your funding'));
 const fundingSource=make('input');fundingSource.name='fundingSource';fundingSource.checked=true;fundingSource.value='Athletic scholarship';funding.append(fundingSource);
 const coverage=make('div','','wide');coverage.append(make('h3','','','What does your scholarship cover?'));
 const sport=field('p_sport','select','Track and field');
 const otherSport=field('p_sportOther','input','');
 const contact=make('section','','wide');
 contact.append(make('h2','','','Contact and interview details'));
 const contactGrid=make('div','','formgrid');
 contactGrid.append(field('p_phone','input','5551234'),field('p_interviewCountry','input','Nigeria'),field('p_previousRefusal','select','Yes'),field('p_previousAttempts','input','3'),field('p_postGradPlan','textarea','nil'));
 contact.append(contactGrid);
 form.append(dataList,intro,field('p_country','input','Nigeria'),field('p_university','input','Example University'),education,funding,sport,otherSport,coverage,contact);
 for(const id of ['profileStepTitle','profileCompletionText','profileSaveState','profileStatus','profileJourney',
   'profileNav0','profileNav1','profileNav2','profileNav3','profilePrevStep','profileNextStep'])make('div',id);
 const window={VisaAtlasProfile:requirements};
 vm.runInNewContext(flow,{document,window,Number,Set});
 return {window,form,byId,contact,contactGrid,field,document};
}
test('profile sections reuse the original input nodes rather than recreating them',()=>{
 const f=fixture(),sport=f.byId.get('p_sport'),phone=f.byId.get('p_phone');
 assert.equal(f.window.VisaAtlasStudentProfile.setup(),true);
 const stages=f.form.querySelectorAll(':scope > .profile-stage');
 assert.equal(stages.length,4);
 assert.equal(f.byId.get('p_sport'),sport);
 assert.equal(f.byId.get('p_phone'),phone);
 assert.equal(sport.closest('.profile-stage').dataset.stage,'1');
 assert.equal(phone.closest('.profile-stage').dataset.stage,'2');
 assert.equal(f.byId.get('p_previousRefusal').closest('.profile-stage').dataset.stage,'3');
 assert.equal(f.contact.parent,null);
 assert.equal(stages.filter(s=>!s.hidden).length,1);
});
test('switching steps preserves entered values, shows conditional sport and exposes unsaved status',()=>{
 const f=fixture(),api=f.window.VisaAtlasStudentProfile;
 assert.equal(api.setup(),true);
 api.go(1,{scroll:false});
 assert.equal(api.getStep(),1);
 assert.equal(f.byId.get('profileNav1').attributes['aria-current'],'step');
 assert.equal(f.byId.get('p_sportOther').parent.hidden,true);
 f.byId.get('p_sport').value='Other';f.byId.get('p_sport').emit('change');
 assert.equal(f.byId.get('p_sportOther').parent.hidden,false);
 assert.equal(f.byId.get('p_sportOther').required,true);
 assert.equal(api.hasUnsaved(),true);
 api.go(3,{scroll:false});
 assert.equal(f.byId.get('p_country').value,'Nigeria');
 assert.match(f.byId.get('profileSaveState').textContent,/Unsaved changes/);
 api.markSaved();assert.equal(api.hasUnsaved(),false);
 assert.match(f.byId.get('profileSaveState').textContent,/No unsaved changes/);
 api.reset();assert.equal(api.hasUnsaved(),false);
});
test('saved profile can be incomplete; unsupported future-plan placeholders are flagged',()=>{
 const f=fixture(),api=f.window.VisaAtlasStudentProfile;
 api.setup();
 assert.equal(api.snapshot().fundingSources,'Athletic scholarship');
 assert.ok(requirements.missing({postGradPlan:'nill'}).includes('Future plans or I’m still deciding'));
 for(const placeholder of ['nil','nill','n/a','none','TBD'])assert.ok(requirements.missing({postGradPlan:placeholder}).includes('Future plans or I’m still deciding'));
 for(const real of ['I’m still deciding','I want to work in cybersecurity'])assert.ok(!requirements.missing({postGradPlan:real}).includes('Future plans or I’m still deciding'));
});
test('profile flow is wired to the existing save endpoint and limited to student profile',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 assert.match(html,/student-profile-flow\.css/);
 assert.match(html,/student-profile-flow\.js/);
 assert.match(html,/profileNav3/);
 assert.match(html,/profileSaveAndNext\(\)/);
 assert.match(html,/window\.VisaAtlasStudentProfile\?\.setup\(\)/);
 assert.match(html,/window\.VisaAtlasStudentProfile\?\.markSaved\(\)/);
 assert.match(html,/window\.VisaAtlasStudentProfile\?\.hasUnsaved\(\)/);
 assert.match(html,/api\("\/api\/my-profile",\{method:"PUT"/);
});
