'use strict';
// Trusted deployment-shell operation only. No HTTP endpoint or automatic signup promotion.
const {Pool} = require('pg');
const {selectOwnerTarget, audit} = require('../owner-access');
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Run in the deployed service shell.');
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/set-owner.cjs EXISTING_ACCOUNT_EMAIL');
  const pool = new Pool({connectionString: process.env.DATABASE_URL});
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const result = await client.query('SELECT data FROM app_state WHERE id = 1 FOR UPDATE');
    if (!result.rows[0]) throw new Error('Application state not found.');
    const db = result.rows[0].data;
    const target = selectOwnerTarget(db, process.argv[2]);
    // Require an existing credential; never create an account or reset its password.
    const credential = await client.query('SELECT user_id FROM user_credentials WHERE user_id=$1 FOR UPDATE', [target.id]);
    if (credential.rows.length !== 1) throw new Error('Existing account credential not found.');
    if (target.role !== 'owner') {
      const previousRole = target.role;
      target.role = 'owner';
      audit(db, 'deployment-shell', target, previousRole, 'owner-activation');
      await client.query('UPDATE user_credentials SET version=version+1 WHERE user_id=$1', [target.id]);
      await client.query('UPDATE app_state SET data=$1 WHERE id=1', [db]);
    }
    await client.query('COMMIT');
    console.log('Owner ready: ' + target.email + '. Sign out and sign in again. Password and student records preserved.');
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    throw error;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}
main().catch(error => {console.error(error.message);process.exitCode = 1;});
