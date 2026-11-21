const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../public/billing.js'),'utf8');
function fixture(search,status=200){
 const el=()=>({children:[],classList:{add(){}},setAttribute(){},replaceChildren(){this.children=[]},append(x){this.children.push(x)}});
 const elements=Object.fromEntries(['#message','#plans','#billing-signin','#billing-signin a','#access','#refresh'].map(k=>[k,el()]));
 const calls=[];const context=vm.createContext({URL,URLSearchParams,Intl,location:{search,assign(){}},document:{querySelector:k=>elements[k],createElement:()=>({...el(),dataset:{}})},fetch:async(url,options)=>{calls.push({url,options});return {ok:status===200,status,json:async()=>({mode:'live',provider:'paystack',recurring:false,access:{enforced:true,active:false},payments:[],plans:[{id:'starter',amount:2900,currency:'USD'},{id:'standard',amount:4900,currency:'USD'}]})}}});
 vm.runInContext(source.replace(/refresh\(\);\s*$/,''),context);
 return {elements,calls,refresh:()=>vm.runInContext('refresh()',context)};
}
test('selected plan survives sign-in and is shown first without initiating a payment',async()=>{
 const f=fixture('?plan=standard');await f.refresh();
 assert.equal(f.elements['#billing-signin a'].href,'/?signin=1&next=billing&plan=standard');
 assert.equal(f.elements['#plans'].children[0].dataset.plan,'standard');
 assert.match(f.elements['#plans'].children[0].textContent,/Selected: Buy Standard/);
 assert.deepEqual(f.calls.map(x=>x.url),['/api/billing/status']);
});
test('unknown plan cannot become a redirect or selected checkout',async()=>{
 const f=fixture('?plan=https://evil.example');await f.refresh();
 assert.equal(f.elements['#billing-signin a'].href,undefined);
 assert.equal(f.elements['#plans'].children[0].dataset.plan,'starter');
 assert.doesNotMatch(f.elements['#plans'].children[0].textContent,/Selected/);
});
test('signed-out selected-plan visit shows sign-in action without a checkout request',async()=>{
 const f=fixture('?plan=starter',401);await f.refresh();
 assert.equal(f.elements['#billing-signin'].hidden,false);
 assert.equal(f.elements['#plans'].children.length,0);
 assert.equal(f.elements['#billing-signin a'].href,'/?signin=1&next=billing&plan=starter');
});
