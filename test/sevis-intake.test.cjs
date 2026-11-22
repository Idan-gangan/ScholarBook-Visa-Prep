'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const {createSevisIntake,decodeFile,validateDetails}=require('../sevis-intake');
const key=crypto.randomBytes(32).toString('hex');
const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
const jpeg=Buffer.from([255,216,255,224,...Array(32).fill(42),255,217]);
const baseDetails=(token,email)=>({token,email,surname:'Onyia',givenName:'Jeffrey Miracle',
 sevisId:'N0038074737',dob:'2006-05-03',school:'Cumberland University',phone:'+2348012345678',
 address:{line1:'1 Example Avenue',line2:'',city:'Abuja',state:'FCT',postal:'900001',country:'Nigeria'},
 isAdult:true,consent:true,i20:{type:'application/pdf',base64:pdf.toString('base64')},
 passport:{type:'image/jpeg',base64:jpeg.toString('base64')}});
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 const pool={query:(q,p)=>db.query(q,p),connect:async()=>({query:(q,p)=>db.query(q,p),release(){}})};
 const s=createSevisIntake(pool,{env:{SEVIS_INTAKE_ENABLED:'true',SEVIS_INTAKE_ENCRYPTION_KEY:key,SEVIS_INTAKE_ORIGIN:'https://visaatlasprep.com'}});
 await s.init();return {db,s};
}
test('security gate disables intake without configured encryption and rejects weak secrets',async()=>{
 const d=createSevisIntake({}, {env:{SEVIS_INTAKE_ENABLED:'false'}});
 assert.equal(d.enabled,false);
 await assert.rejects(d.createInvite({clientEmail:'a@example.test',ownerId:'owner'}),{status:503});
 assert.throws(()=>createSevisIntake({},{env:{SEVIS_INTAKE_ENABLED:'true',SEVIS_INTAKE_ENCRYPTION_KEY:'weak'}}),/32 random bytes/);
});
test('validates I-20, date of birth, email matching, minor consent, and file format',()=>{
 const b=baseDetails('unused','jeffrey@example.test');
 assert.equal(validateDetails(b,'jeffrey@example.test').surname,'Onyia');
 for(const patch of [{sevisId:'N123'},{email:'other@example.test'},{dob:'2025-02-10'},
  {dob:'2001-02-30'},{isAdult:false},{consent:false},{address:{}}]){
  assert.throws(()=>validateDetails({...b,...patch},'jeffrey@example.test'),e=>e.status>=400);
 }
 assert.deepEqual(decodeFile(b.i20,'i20'),pdf);
 assert.deepEqual(decodeFile(b.passport,'passport'),jpeg);
 assert.throws(()=>decodeFile({...b.i20,type:'text/html'},'i20'),{status:400});
 assert.throws(()=>decodeFile({type:'application/pdf',base64:Buffer.from('<html>hi</html>').toString('base64')},'i20'),{status:400});
 assert.throws(()=>decodeFile({type:'image/jpeg',base64:Buffer.from('<svg onload="alert(1)">').toString('base64')},'passport'),{status:400});
 assert.throws(()=>decodeFile({...b.i20,base64:Buffer.alloc(4*1024*1024+1).toString('base64')},'i20'),{status:400});
});
test('one-use link, encrypted files/PII, owner retrieval, expiry, revoke, delete',async t=>{
 const {db,s}=await fixture(t);
 const invite=await s.createInvite({clientEmail:'jeffrey@example.test',ownerId:'owner'});
 assert.match(invite.token,/^[a-f0-9]{64}$/);
 assert.equal((await s.check(invite.token)).email,'jeffrey@example.test');
 assert.throws(()=>s.checkOrigin('https://other.example'),{status:403});
 s.checkOrigin('https://visaatlasprep.com');
 await assert.rejects(s.submit(baseDetails(invite.token,'wrong@example.test')),{status:400});
 const first=await s.submit(baseDetails(invite.token,'jeffrey@example.test'));
 assert.equal(first.received,true);
 await assert.rejects(s.check(invite.token),{status:404});
 await assert.rejects(s.submit(baseDetails(invite.token,'jeffrey@example.test')),{status:404});
 const row=(await db.query('SELECT sealed_details,i20_cipher,passport_cipher FROM sevis_intake_submissions WHERE id=$1',[first.caseReference])).rows[0];
 assert.ok(row);
 assert.ok(!Buffer.from(row.sealed_details).includes(Buffer.from('Onyia')));
 assert.ok(!Buffer.from(row.i20_cipher).includes(Buffer.from('%PDF-')));
 assert.ok(!Buffer.from(row.passport_cipher).equals(jpeg));
 const details=await s.ownerDetails(first.caseReference);
 assert.equal(details.sevisId,'N0038074737');
 assert.equal(details.address.state,'FCT');
 assert.deepEqual((await s.ownerFile(first.caseReference,'i20')).content,pdf);
 assert.deepEqual((await s.ownerFile(first.caseReference,'passport')).content,jpeg);
 assert.equal((await s.ownerList())[0].submittedAt!=null,true);
 assert.equal((await s.ownerDelete(first.caseReference)).deleted,true);
 await assert.rejects(s.ownerDetails(first.caseReference),{status:404});
 const next=await s.createInvite({clientEmail:'a@example.test',ownerId:'owner'});
 assert.equal((await s.ownerRevoke(next.id)).revoked,true);
 await assert.rejects(s.check(next.token),{status:404});
 const third=await s.createInvite({clientEmail:'c@example.test',ownerId:'owner'});
 await db.query("UPDATE sevis_intake_invites SET expires_at=NOW()-INTERVAL '1 minute' WHERE id=$1",[third.id]);
 await assert.rejects(s.check(third.token),{status:404});
});
test('30-day active case retention removes encrypted documents and disables further retrieval',async t=>{
 const {s,db}=await fixture(t);
 const x=await s.createInvite({clientEmail:'client@example.test',ownerId:'owner'});
 const result=await s.submit(baseDetails(x.token,'client@example.test'));
 await db.query("UPDATE sevis_intake_submissions SET submitted_at=NOW()-INTERVAL '31 days' WHERE id=$1",[result.caseReference]);
 await s.purge();
 await assert.rejects(s.ownerFile(result.caseReference,'passport'),{status:404});
 assert.equal((await db.query('SELECT count(*)::int AS n FROM sevis_intake_submissions')).rows[0].n,0);
});