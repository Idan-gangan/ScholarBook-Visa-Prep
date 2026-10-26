const {test}=require('node:test'),assert=require('node:assert/strict');
const {withdrawGuardianPermission}=require('../owner-access');
function fixture(){return {users:[{id:'owner',role:'owner'},{id:'teen',role:'athlete',ageEligibility:{ageBand:'13-17',guardian:{email:'parent@example.test',confirmedAt:'2026-10-25'}}},{id:'other',role:'athlete'}],reports:[{athleteId:'student',text:'preserve'}]};}
const body={userId:'teen',verifiedGuardian:true,confirmation:'WITHDRAW'};
test('withdrawal requires owner, verified request and explicit confirmation; protects other users',async()=>{
 const db=fixture(),client={query:async()=>({rows:[]})};
 for(const [actor,input] of [['other',body],['owner',{...body,verifiedGuardian:false}],['owner',{...body,confirmation:'yes'}],['owner',{...body,userId:'owner'}],['owner',{...body,userId:'other'}]])await assert.rejects(withdrawGuardianPermission(db,client,actor,input));
 assert.equal(db.users[1].accessSuspended,undefined);
});
test('withdrawal preserves records, invalidates credentials once, and records actor and time',async()=>{
 const db=fixture(),queries=[],client={query:async(sql,args)=>{queries.push([sql,args]);return {rows:[]};}};
 await withdrawGuardianPermission(db,client,'owner',body);
 assert.equal(db.users[1].accessSuspended,true);assert.ok(db.users[1].ageEligibility.guardian.withdrawnAt);
 assert.equal(db.users[2].accessSuspended,undefined);assert.equal(db.reports.length,1);
 assert.equal(db.securityAudit[0].actorId,'owner');assert.equal(db.securityAudit[0].action,'guardian-withdrawal');
 assert.deepEqual(queries[1][1],['teen']);
 await withdrawGuardianPermission(db,client,'owner',body);assert.equal(queries.length,2);
});
test('active voice or evaluation rejects withdrawal without partial state changes',async()=>{
 const db=fixture(),before=structuredClone(db);
 await assert.rejects(withdrawGuardianPermission(db,{query:async()=>({rows:[{}]})},'owner',body),/still active/);
 assert.deepEqual(db,before);
});
