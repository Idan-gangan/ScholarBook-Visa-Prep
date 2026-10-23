'use strict';
// Trusted deployment shell only. Never expose this operation as a signup route.
const crypto = require('node:crypto');
const {hashPassword} = require('../passwords');
const {audit} = require('../owner-access');

function options(args) {
  const [ownerEmail, slug, name] = args;
  if (args.length !== 3 || !/^\S+@\S+\.\S+$/.test(ownerEmail || '') ||
      !/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug || '') || !name?.trim() || name.length > 100) {
    throw new Error('Usage: node scripts/create-demo.cjs OWNER_EMAIL DEMO_SLUG "Display name"');
  }
  return {ownerEmail: ownerEmail.trim().toLowerCase(), email: slug + '.demo@example.invalid', name: name.trim() + ' (Demo)'};
}

async function provision(pool, input) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const state = await client.query('SELECT data FROM app_state WHERE id = 1 FOR UPDATE');
    const db = state.rows[0]?.data;
    if (!Array.isArray(db?.users) || !Array.isArray(db?.athletes)) throw new Error('Application state not found.');
    const owners = db.users.filter(u => u.role === 'owner' && String(u.email).trim().toLowerCase() === input.ownerEmail);
    if (owners.length !== 1) throw new Error('An existing, unique owner account is required.');
    const owner = owners[0];
    const credential = await client.query('SELECT user_id FROM user_credentials WHERE user_id=$1 FOR UPDATE', [owner.id]);
    if (credential.rows.length !== 1) throw new Error('Owner credential not found.');
    if (db.users.some(u => String(u.email).trim().toLowerCase() === input.email)) throw new Error('Demo login already exists. Nothing was changed.');
    const password = crypto.randomBytes(24).toString('base64url');
    const userId = 'u_' + crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const user = {id:userId, name:input.name, email:input.email, role:'athlete', demoAccount:true,
      verificationRequired:false, provisionedBy:owner.id, provisionedAt:createdAt};
    // Explicit administrative demo exemption; do not claim the reserved mailbox was verified.
    const student = {id:'a_' + crypto.randomUUID(), userId, name:input.name, email:input.email,
      demoAccount:true, staffIds:[], country:'Germany', university:'Example University (fictional demo)',
      major:'Business Administration', academicLevel:'Undergraduate', studyStatus:'Not started yet',
      phoneCountry:'US', phone:'+12025550123', interviewCountry:'Germany', interviewCity:'Not booked yet',
      interviewLocation:'Germany — Not booked yet', sport:'Not a student-athlete', fundingSources:'Family / guardian',
      scholarship:'None', scholarshipCoverage:'None', remainingSponsor:'Family (fictional demo)',
      previousRefusal:'No', previousAttempts:0, previousTravel:'No',
      postGradPlan:'Demo scenario: return to Germany and work in business after graduation.',
      profileStatus:'Complete', createdAt, sessions:0, mocks:0, initialScore:0, currentScore:0,
      mainConcern:'Fictional demo profile. Edit these sample details before practising a different scenario.'};
    await client.query('INSERT INTO user_credentials (user_id,password_hash) VALUES ($1,$2)', [userId, await hashPassword(password)]);
    db.users.push(user);
    db.athletes.push(student);
    audit(db, owner.id, user, 'none', 'deployment-shell-demo-created');
    await client.query('UPDATE app_state SET data=$1 WHERE id=1', [db]);
    await client.query('COMMIT');
    return {name:user.name, email:user.email, password};
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const input = options(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Run in the deployed service shell.');
  const {Pool} = require('pg');
  const pool = new Pool({connectionString:process.env.DATABASE_URL});
  try {
    const account = await provision(pool, input);
    console.log('Demo created. Save these credentials privately; the password is not recoverable.');
    console.log('Name: ' + account.name + '\nLogin: ' + account.email + '\nPassword: ' + account.password);
    console.log('Student access only. Profile details are fictional. No invitation email was sent.');
  } finally { await pool.end(); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = {options, provision};
