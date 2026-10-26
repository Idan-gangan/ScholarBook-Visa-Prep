const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('public/index.html','utf8');
const prefix=html.slice(html.indexOf('async function boot(){'),html.indexOf(' athletes=await api',html.indexOf('async function boot(){')))+'}';
test('authenticated review sign-in returns directly to fixed review page',async()=>{let redirected;const c={URLSearchParams,location:{search:'?signin=1&next=review',replace:v=>redirected=v},api:async()=>({id:'s'})};vm.createContext(c);await vm.runInContext(prefix+';boot()',c);assert.equal(redirected,'/share-review.html');});
test('untrusted redirect destinations are ignored',async()=>{let redirected;const c={URLSearchParams,location:{search:'?next=https://example.test',replace:v=>redirected=v},api:async()=>({id:'s'})};vm.createContext(c);await vm.runInContext(prefix+';boot()',c);assert.equal(redirected,undefined);});
