const {test}=require('node:test'),assert=require('node:assert/strict');
const {compare}=require('../scripts/compare-provider-costs.cjs');
const ledger={basis:'provider_usage_calculated_not_invoice',currency:'USD',start:'2026-11-13T00:00:00.000Z',end:'2026-11-14T00:00:00.000Z',rows:[{events:2,priced_events:1,calculated_usd:'0.100000000001'}],gaps:{incomplete_voice_sessions:1}};
const billing={start:ledger.start,end:ledger.end,currency:'USD',project:'dedicated-project',complete:true,total_usd:'0.3'};
test('comparison keeps decimal precision, gaps, and never assigns the difference to students',()=>{const r=compare(ledger,billing);assert.equal(r.unexplainedDifference,'0.199999999999');assert.equal(r.unpricedEvents,1);assert.equal(r.status,'comparison_only');assert.equal(r.gaps.incomplete_voice_sessions,1);});
test('rejects mismatched period, incomplete billing, missing project and invalid amounts',()=>{for(const patch of [{end:'2026-11-15'},{complete:false},{project:''},{currency:'NGN'},{total_usd:'NaN'},{total_usd:'-1'}])assert.throws(()=>compare(ledger,{...billing,...patch}));});
