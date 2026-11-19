'use strict';
// Offline comparison only. Never allocates an unexplained difference to students.
const fs=require('node:fs');
function compare(ledger,billing){
 if(ledger.basis!=='provider_usage_calculated_not_invoice'||ledger.currency!=='USD'||!Array.isArray(ledger.rows))throw Error('Expected a VisaAtlas provider cost export.');
 if(billing.currency!=='USD'||billing.start!==ledger.start||billing.end!==ledger.end||billing.complete!==true||typeof billing.project!=='string'||!billing.project.trim())throw Error('Billing statement must specify the same UTC period, USD, project and complete=true.');
 const amount=v=>{if(typeof v!=='string'||!/^\d+(\.\d{1,12})?$/.test(v))throw Error('Amounts must be nonnegative decimal strings, at most 12 decimal places.');const [a,b='']=v.split('.');return BigInt(a)*1000000000000n+BigInt(b.padEnd(12,'0'));};
 const format=n=>{const sign=n<0n?'-':'';n=n<0n?-n:n;return sign+(n/1000000000000n)+'.'+(n%1000000000000n).toString().padStart(12,'0');};
 let subtotal=0n,unpriced=0;
 for(const row of ledger.rows){
  if(!Number.isSafeInteger(row.events)||!Number.isSafeInteger(row.priced_events)||row.priced_events<0||row.events<row.priced_events)throw Error('Invalid coverage counts.');
  if(row.priced_events>0)subtotal+=amount(row.calculated_usd);
  unpriced+=row.events-row.priced_events;
 }
 const billed=amount(billing.total_usd);
 return {start:ledger.start,end:ledger.end,project:billing.project,currency:'USD',recordedSubtotal:format(subtotal),providerTotal:format(billed),unexplainedDifference:format(billed-subtotal),unpricedEvents:unpriced,gaps:ledger.gaps,status:'comparison_only',note:'Project scope and statement completeness require independent verification. Matching totals do not prove exact per-student costs. Differences are not allocated to students.'};
}
module.exports={compare};
if(require.main===module){try{const [a,b]=process.argv.slice(2);if(!a||!b)throw Error('Usage: node scripts/compare-provider-costs.cjs ledger.json billing.json');console.log(JSON.stringify(compare(JSON.parse(fs.readFileSync(a,'utf8')),JSON.parse(fs.readFileSync(b,'utf8'))),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
