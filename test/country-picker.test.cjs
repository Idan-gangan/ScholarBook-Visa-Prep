const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function fixture(saved={}){
 const nodes={},labels={};
 class Element extends EventTarget{
  constructor(tag){super();this.tagName=tag;this.children=[];this.value='';}
  append(...children){this.children.push(...children);}
  before(box){this.box=box;}
  removeAttribute(){}
 }
 for(const id of ['p_country','p_phoneCountry','p_interviewCountry']){
  nodes[id]=new Element('input');nodes[id].value=saved[id]||'';labels[id]={};
 }
 const document={getElementById:id=>nodes[id],createElement:tag=>new Element(tag),querySelector:selector=>labels[selector.match(/"([^"]+)"/)[1]]};
 const window={};vm.runInNewContext(fs.readFileSync(require.resolve('../public/country-picker.js'),'utf8'),{document,window,Event});
 const countries=[{code:'NG',name:'Nigeria',callingCode:'+234'},{code:'KE',name:'Kenya',callingCode:'+254'}];
 window.VisaAtlasCountries.enhance(countries);
 return {nodes,labels,menu:id=>nodes[id].box.children[1]};
}
test('native selections update the exact fields read by Save Profile',()=>{
 const f=fixture();let changes=0;f.nodes.p_interviewCountry.addEventListener('change',()=>changes++);
 for(const [id,value] of [['p_country','Nigeria'],['p_phoneCountry','NG'],['p_interviewCountry','Nigeria']]){
  const menu=f.menu(id);assert.equal(menu.tagName,'select');menu.value=value;menu.dispatchEvent(new Event('change'));
  assert.equal(f.nodes[id].value,value);assert.equal(f.labels[id].htmlFor,menu.id);
  assert.equal(f.nodes[id].box.children[0].src,'/flags/ng.svg');
 }
 assert.equal(changes,1);
 // Re-selecting the same country must not clear an already entered interview city.
 f.menu('p_interviewCountry').dispatchEvent(new Event('change'));assert.equal(changes,1);
 f.menu('p_interviewCountry').value='Kenya';f.menu('p_interviewCountry').dispatchEvent(new Event('change'));assert.equal(changes,2);
 assert.ok(f.menu('p_phoneCountry').children.some(o=>o.textContent==='Nigeria (+234)'));
 const restored=fixture(Object.fromEntries(Object.entries(f.nodes).map(([id,node])=>[id,node.value])));
 assert.equal(restored.menu('p_phoneCountry').value,'NG');assert.equal(restored.menu('p_interviewCountry').value,'Kenya');
});
test('blank and legacy values are preserved without silently choosing a country',()=>{
 const f=fixture({p_country:'Legacy country'});
 assert.equal(f.menu('p_country').value,'Legacy country');
 assert.ok(f.menu('p_country').children.some(o=>o.value==='Legacy country'));
 assert.equal(f.menu('p_phoneCountry').value,'');assert.equal(f.nodes.p_phoneCountry.box.children[0].hidden,true);
});
