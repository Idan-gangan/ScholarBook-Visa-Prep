'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/owner-commercial.js'),'utf8');
function fixture(userRole='owner',data={}){
 const nodes=new Map(['ownerCommercialSummary','ownerCommercialStatus','ownerCommercialDetail'].map(id=>[id,{innerHTML:'',textContent:'',replaceChildren(){this.innerHTML='';}}]));
 const calls=[],window={};
 const ctx={window,document:{getElementById:id=>nodes.get(id)||null},
  me:{role:userRole},
  api:async route=>{calls.push(route);return data;},
  Intl,Date,Number,String};
 vm.runInNewContext(source,ctx);
 return {nodes,window,calls,ctx};
}
test('Owner business panel displays ledger data and treats incomplete costs as unknown',async()=>{
 const f=fixture('owner',{mode:'live',asOf:'2026-11-21T09:00:00Z',
  studentAccounts:100,trialAccounts:10,trialMockSessionsUsed:11,
  activePaidAccounts:2,verifiedPayments:3,verifiedUsd30dCents:7800,verifiedUsdCents:11200,
  trialOverlapRate:20,trialAccountsWithPayment:2,openCheckouts:1,onHoldPayments:1});
 await f.window.loadOwnerCommercial();
 assert.deepEqual(f.calls,['/api/owner/commercial']);
 assert.match(f.nodes.get('ownerCommercialSummary').innerHTML,/\$78\.00/);
 assert.match(f.nodes.get('ownerCommercialSummary').innerHTML,/Active paid accounts/);
 assert.match(f.nodes.get('ownerCommercialSummary').innerHTML,/20\.0%/);
 assert.match(f.nodes.get('ownerCommercialDetail').textContent,/1 unresolved checkout/);
 assert.match(f.nodes.get('ownerCommercialStatus').textContent,/profit and margin are not calculated/);
});
test('Owner commercial request is never sent for a student',async()=>{
 const f=fixture('athlete');
 await f.window.loadOwnerCommercial();
 assert.equal(f.calls.length,0);
});
test('Test mode never claims actual sales and logout clears private metrics',async()=>{
 const f=fixture('owner',{mode:'test',studentAccounts:9});
 await f.window.loadOwnerCommercial();
 assert.match(f.nodes.get('ownerCommercialStatus').textContent,/unavailable/);
 assert.doesNotMatch(f.nodes.get('ownerCommercialSummary').innerHTML,/\$\d/);
 f.nodes.get('ownerCommercialSummary').innerHTML='should be cleared';
 f.window.clearOwnerCommercial();
 assert.equal(f.nodes.get('ownerCommercialSummary').innerHTML,'');
});
