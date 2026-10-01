const crypto = require('node:crypto');
// OWASP scrypt alternative: 32 MiB, r=8, p=3. Bound work on small instances.
const options = {N:32768, r:8, p:3, maxmem:64*1024*1024};
let active=0;
const queue=[];
async function derive(password,salt){
  if(active>=2){
    if(queue.length>=16) throw Object.assign(new Error('Sign-in is busy. Please try again shortly.'),{status:429});
    await new Promise(resolve=>queue.push(resolve));
  }else active++;
  try{return await new Promise((resolve,reject)=>crypto.scrypt(password,salt,32,options,(error,key)=>error?reject(error):resolve(key)));}
  finally{if(queue.length)queue.shift()();else active--;}
}
function validPassword(value){return typeof value==='string' && value.length>=15 && value.length<=128 && !/[\r\n]/.test(value);}
function legacyHash(value){return typeof value==='string' && /^[a-f0-9]{64}$/.test(value);}
async function hashPassword(password){
  const salt=crypto.randomBytes(16);
  return 'scrypt$32768$8$3$'+salt.toString('hex')+'$'+(await derive(password,salt)).toString('hex');
}
async function verifyPassword(password,hash){
  if(typeof password!=='string' || password.length>4096 || typeof hash!=='string')return false;
  if(legacyHash(hash))return crypto.timingSafeEqual(crypto.createHash('sha256').update(password).digest(),Buffer.from(hash,'hex'));
  const match=/^scrypt\$32768\$8\$3\$([a-f0-9]{32})\$([a-f0-9]{64})$/.exec(hash);
  return !!match && crypto.timingSafeEqual(await derive(password,Buffer.from(match[1],'hex')),Buffer.from(match[2],'hex'));
}
module.exports={hashPassword,verifyPassword,validPassword,legacyHash};
