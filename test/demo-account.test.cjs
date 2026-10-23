const test = require('node:test');
const assert = require('node:assert/strict');
const {options, provision} = require('../scripts/create-demo.cjs');
const {verifyPassword} = require('../passwords');
const {missing} = require('../public/profile-requirements');
const {normalizePhone} = require('../profile-options');
const {canAccessStudent} = require('../learning');

function fixture({existing=false, owner=true, fail=false}={}) {
  const original = {users:[{id:'owner',email:'owner@example.invalid',role:owner?'owner':'athlete'}],athletes:[]};
  if(existing) original.users.push({id:'existing',email:'philipp.demo@example.invalid',role:'athlete'});
  let db=structuredClone(original), committed, hash, released=false;
  const calls=[];
  const client={async query(sql,args){
    calls.push(sql);
    if(sql.startsWith('SELECT data'))return {rows:[{data:db}]};
    if(sql.startsWith('SELECT user_id'))return {rows:[{user_id:'owner'}]};
    if(sql.startsWith('INSERT'))hash=args[1];
    if(sql.startsWith('UPDATE') && fail)throw new Error('Simulated write failure');
    if(sql==='COMMIT')committed=structuredClone(db);
    if(sql==='ROLLBACK')db=structuredClone(original);
    return {rows:[]};
  },release(){released=true;}};
  return {pool:{async connect(){return client;}}, calls, get db(){return committed || db;},get hash(){return hash;},get released(){return released;}};
}
const input=()=>options(['owner@example.invalid','philipp','Philipp Baar']);
test('demo is student-only, ready for practice, hashed and audited after commit',async()=>{
  const f=fixture(), result=await provision(f.pool,input());
  assert.equal(result.email,'philipp.demo@example.invalid');
  assert.equal(result.password.length,32);
  assert.ok(await verifyPassword(result.password,f.hash));
  assert.ok(!JSON.stringify(f.db).includes(result.password));
  const user=f.db.users[1], student=f.db.athletes[0];
  assert.equal(user.role,'athlete');
  assert.equal(user.verificationRequired,false);
  assert.equal(user.emailVerifiedAt,undefined);
  assert.deepEqual(missing(student),[]);
  assert.equal(normalizePhone(student.phone,student.phoneCountry),student.phone);
  assert.ok(canAccessStudent(user,student));
  assert.equal(canAccessStudent(user,{userId:'someone-else'}),false);
  assert.equal(f.db.securityAudit[0].actorId,'owner');
  assert.equal(f.calls.at(-1),'COMMIT');
  assert.ok(f.released);
});
test('duplicate demo never resets an existing account',async()=>{
  const f=fixture({existing:true});
  await assert.rejects(provision(f.pool,input()),/already exists/);
  assert.ok(!f.calls.some(s=>s.startsWith('INSERT')));
  assert.equal(f.calls.at(-1),'ROLLBACK');
});
test('requires an existing owner and rolls back failed writes',async()=>{
  const f=fixture({owner:false});
  await assert.rejects(provision(f.pool,input()),/owner/);
  const failed=fixture({fail:true});
  await assert.rejects(provision(failed.pool,input()),/write failure/);
  assert.equal(failed.db.users.length,1);
  assert.equal(failed.calls.at(-1),'ROLLBACK');
  assert.ok(failed.released);
});
test('command accepts a name and reserved demo alias, not arbitrary mailbox',()=>{
  assert.equal(input().name,'Philipp Baar (Demo)');
  assert.throws(()=>options(['owner@example.invalid','person@gmail.com','Name']),/Usage/);
  assert.throws(()=>options(['owner@example.invalid','philipp','']),/Usage/);
});
