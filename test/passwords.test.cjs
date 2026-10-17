const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {hashPassword,verifyPassword,validPassword}=require('../passwords');
test('published demo password is rejected for legacy and modern stored hashes',async()=>{
 const exposed='demo123';
 assert.equal(await verifyPassword(exposed,crypto.createHash('sha256').update(exposed).digest('hex')),false);
 assert.equal(await verifyPassword(exposed,await hashPassword(exposed)),false);
});
test('scrypt uses distinct salts, exact Unicode input and rejects corrupted hashes',async()=>{
 const value='Long passphrase — 世界 ';
 const a=await hashPassword(value),b=await hashPassword(value);
 assert.notEqual(a,b);
 assert.equal(await verifyPassword(value,a),true);
 assert.equal(await verifyPassword(value.trim(),a),false);
 assert.equal(await verifyPassword('wrong',a),false);
 for(const hash of ['',a.replace('$32768$','$999999999$'),a+'bad',null])assert.equal(await verifyPassword(value,hash),false);
 assert.equal(await verifyPassword({},a),false);
 assert.equal(await verifyPassword('a'.repeat(4097),a),false);
 const legacy=crypto.createHash('sha256').update(value).digest('hex');
 assert.equal(await verifyPassword(value,legacy),true);
});
test('new passwords accept long passphrases without trimming and reject line breaks',()=>{
 assert.equal(validPassword('a'.repeat(15)),true);assert.equal(validPassword('a'.repeat(128)),true);
 for(const value of ['short','a'.repeat(129),'long-password-with\nnewline',null,{}])assert.equal(validPassword(value),false);
});

