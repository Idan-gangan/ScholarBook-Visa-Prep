const {test}=require('node:test'),assert=require('node:assert/strict');
const {createOperations}=require('../operations');
const {studentExport}=require('../privacy-export');
test('monitor stores only allowed operation labels and aggregate counts, never paths or payloads',async()=>{
 const calls=[],logs=[];const monitor=createOperations({query:async(...args)=>{calls.push(args);return {rows:[]};}},{log:x=>logs.push(x)});
 await monitor.record('/api/evaluate',502);await monitor.record('/unknown?token=secret',500);await monitor.record('/api/register-athlete',400);
 const inserts=calls.filter(c=>c[0].startsWith('INSERT'));
 assert.deepEqual(inserts.map(c=>c[1]),[['report_generation',0,0,1],['registration',0,1,0]]);
 assert.doesNotMatch(JSON.stringify(calls),/secret|unknown/);assert.ok(logs.includes('[operations] SERVICE_FAILURE report_generation'));
});
test('monitor failures do not escape into request handling',async()=>{
 const logs=[];await createOperations({query:async()=>{throw Error('secret connection string');}},{log:x=>logs.push(x)}).record('/api/evaluate',500);
 assert.deepEqual(logs,['[operations] METRICS_WRITE_FAILED']);
});
test('export excludes authentication and unrelated authored records',()=>{
 const user={id:'u1',name:'Student',passwordHash:'secret',emailVerification:{hash:'token'}};
 const db={athletes:[{id:'s1',userId:'u1',staffIds:['coach']},{id:'s2',userId:'u2'}],transcripts:[{athleteId:'s2',userId:'u1',text:'other student'}]};
 const result=studentExport(db,user,[]);assert.equal(result.transcripts.length,0);assert.doesNotMatch(JSON.stringify(result),/secret|token|coach|other student/);
});
