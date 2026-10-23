const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validDate,daysUntil}=require('../public/planning');
test('interview dates reject impossible or malformed dates',()=>{
 for(const value of ['2026-02-30','2025-02-29','2026-13-01','2026-1-01','',null,{},'2026-10-23T00:00:00Z'])assert.equal(validDate(value),false);
 assert.equal(validDate('2028-02-29'),true);
});
test('countdown compares calendar dates without time-of-day rounding',()=>{
 const now=new Date(2026,9,23,23,59);
 assert.equal(daysUntil('2026-10-23',now),0);
 assert.equal(daysUntil('2026-10-24',now),1);
 assert.equal(daysUntil('2026-10-22',now),-1);
 assert.equal(daysUntil('',now),null);
});
