// Native country menus avoid mobile focus/click races in autocomplete results.
(()=>{
 function enhance(countries){
  for(const [id,phone] of [['p_country',false],['p_phoneCountry',true],['p_interviewCountry',false]]){
   const original=document.getElementById(id);if(!original)continue;
   const box=document.createElement('div');box.className='country-picker';
   const flag=document.createElement('img');flag.width=28;flag.height=21;flag.alt='';flag.hidden=true;
   const menu=document.createElement('select');menu.id=id+'_choice';
   function option(value,label){const el=document.createElement('option');el.value=value;el.textContent=label;menu.append(el);}
   option('',phone?'Choose calling country':'Choose country');
   for(const c of countries)option(phone?c.code:c.name,phone?c.name+' ('+c.callingCode+')':c.name);
   // Preserve previously saved values even if the catalog has changed.
   if(original.value&&!countries.some(c=>(phone?c.code:c.name)===original.value))option(original.value,original.value);
   original.before(box);box.append(flag,menu);original.hidden=true;original.removeAttribute('list');
   const label=document.querySelector('label[for="'+id+'"]');if(label)label.htmlFor=menu.id;
   function sync(){
    menu.value=original.value;
    const country=countries.find(c=>(phone?c.code:c.name)===original.value);
    flag.hidden=!country;if(country)flag.src='/flags/'+country.code.toLowerCase()+'.svg';
   }
   menu.addEventListener('change',()=>{
    if(original.value===menu.value)return;
    original.value=menu.value;
    original.dispatchEvent(new Event('change',{bubbles:true}));
    sync();
   });
   original.addEventListener('change',sync);sync();
  }
 }
 window.VisaAtlasCountries={enhance};
})();
