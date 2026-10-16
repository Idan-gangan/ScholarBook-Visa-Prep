// Searchable native-input picker with real SVG flags (including on Windows).
(()=>{
 function enhance(countries){
  for(const [id,phone] of [['p_country',false],['p_phoneCountry',true],['p_interviewCountry',false]]){
   const original=document.getElementById(id);if(!original)continue;
   const box=document.createElement('div');box.className='country-picker';
   const flag=document.createElement('img');flag.width=28;flag.height=21;flag.alt='';flag.hidden=true;
   const input=document.createElement('input');input.type='search';input.autocomplete='off';input.placeholder=phone?'Search country or calling code':'Search countries';input.id=id+'_search';
   const list=document.createElement('div');list.className='country-results';list.hidden=true;list.id=id+'_results';list.setAttribute('role','group');list.setAttribute('aria-label','Country choices');
   input.setAttribute('aria-controls',list.id);input.setAttribute('aria-expanded','false');
   original.before(box);box.append(flag,input,list);original.hidden=true;original.removeAttribute('list');
   const label=document.querySelector('label[for="'+id+'"]');if(label)label.htmlFor=input.id;
   const display=c=>phone?c.name+' ('+c.callingCode+')':c.name;
   const selected=()=>countries.find(c=>(phone?c.code:c.name)===original.value);
   function sync(){const c=selected();input.value=c?display(c):original.value;flag.hidden=!c;if(c)flag.src='/flags/'+c.code.toLowerCase()+'.svg';}
   function close(){list.hidden=true;input.setAttribute('aria-expanded','false');}
   function choose(c){original.value=phone?c.code:c.name;original.dispatchEvent(new Event('change',{bubbles:true}));sync();input.focus();close();}
   function render(){
    const q=input.value.toLowerCase();list.replaceChildren();
    const matches=countries.filter(c=>!q||display(c).toLowerCase().includes(q)||c.code.toLowerCase()===q);
    for(const c of matches){const button=document.createElement('button');button.type='button';const icon=document.createElement('img');icon.src='/flags/'+c.code.toLowerCase()+'.svg';icon.width=28;icon.height=21;icon.alt='';button.append(icon,document.createTextNode(display(c)));button.onclick=()=>choose(c);list.append(button);}
    if(!matches.length)list.textContent='No matching country. Try another name or calling code.';
    list.hidden=false;input.setAttribute('aria-expanded','true');
   }
   input.onfocus=()=>{input.select();render()};
   input.oninput=()=>{original.value='';flag.hidden=true;original.dispatchEvent(new Event('change',{bubbles:true}));render()};
   input.onkeydown=e=>{if(e.key==='Escape')close();if(e.key==='ArrowDown'){e.preventDefault();list.querySelector('button')?.focus()}if(e.key==='Enter'){e.preventDefault();const exact=countries.find(c=>display(c).toLowerCase()===input.value.toLowerCase()||c.name.toLowerCase()===input.value.toLowerCase());if(exact)choose(exact)}};
   list.onkeydown=e=>{const buttons=Array.from(list.querySelectorAll('button'));const at=buttons.indexOf(document.activeElement);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();buttons[(at+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus()}if(e.key==='Escape'){close();input.focus();close()}};
   box.addEventListener('focusout',e=>{if(!box.contains(e.relatedTarget))close()});
   original.addEventListener('change',()=>{if(document.activeElement!==input)sync()});sync();
  }
 }
 window.VisaAtlasCountries={enhance};
})();
