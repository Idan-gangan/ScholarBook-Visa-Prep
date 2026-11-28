'use strict';

// All table names here are fixed to the production Paystack ledger.
const checkouts = 'paystack_live_checkouts';
const payments = 'paystack_live_payments';
const eligible = `
  c.state = 'open'
  AND c.created_at > NOW() - interval '7 days'
  AND c.reminder_sent_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM paystack_live_checkouts newer
    WHERE newer.user_id=c.user_id AND newer.created_at>c.created_at)
  AND NOT EXISTS (SELECT 1 FROM paystack_live_checkouts prior
    WHERE prior.user_id=c.user_id AND prior.reminder_sent_at > NOW()-interval '7 days')
  AND NOT EXISTS (SELECT 1 FROM paystack_live_checkouts other JOIN paystack_live_payments p USING(reference)
    WHERE other.user_id=c.user_id AND p.verified_at >= c.created_at)
  AND NOT EXISTS (SELECT 1 FROM paystack_live_checkouts other JOIN billing_live_holds h USING(reference)
    WHERE other.user_id=c.user_id)`;

async function init(pool) {
  // Set the default separately so existing customers are never backfilled.
  await pool.query(`ALTER TABLE ${checkouts} ADD COLUMN IF NOT EXISTS reminder_eligible_at timestamptz,
    ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz`);
  await pool.query(`ALTER TABLE ${checkouts} ALTER COLUMN reminder_eligible_at SET DEFAULT (NOW()+interval '1 hour')`);
}

async function run(pool, {status, skipAccount, env, origin, request=fetch}) {
  if (!env.RESEND_FROM || !env.RESEND_API_KEY) return;
  // Move each candidate's next check forward atomically across worker instances.
  const {rows} = await pool.query(`WITH due AS (SELECT c.reference FROM ${checkouts} c WHERE ${eligible} AND c.reminder_eligible_at <= NOW()
    ORDER BY c.reminder_eligible_at LIMIT 10 FOR UPDATE SKIP LOCKED)
    UPDATE ${checkouts} c SET reminder_eligible_at=NOW()+interval '30 minutes' FROM due
    WHERE c.reference=due.reference RETURNING c.*`);
  for (const row of rows) {
    try {
      if (await skipAccount({id:row.user_id, email:row.email})) continue;
      if (!['failed','abandoned'].includes(await status(row))) continue;
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        const current=await client.query(`SELECT c.reference FROM ${checkouts} c
          WHERE c.reference=$1 AND ${eligible} FOR UPDATE`,[row.reference]);
        if (current.rows.length) {
          const link=new URL('/billing.html',origin).href;
          const response=await request('https://api.resend.com/emails',{
            method:'POST',signal:AbortSignal.timeout(10000),
            headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'checkout-reminder-'+row.reference},
            body:JSON.stringify({from:env.RESEND_FROM,to:[row.email],subject:'Need help finishing your VisaAtlas checkout?',
              text:'Hi,\n\nYour VisaAtlas '+row.plan_id+' checkout was left unfinished. If you still want the plan, sign in to review your payment status. Choose “Recover failed checkout / change plan” to retry.\n\n'+link+'\n\nIf your bank shows a charge, reply before trying again. If you no longer want the plan, no action is needed.\n\nVisaAtlas Support'})
          });
          if (!response.ok) throw Error('Email delivery failed');
          await client.query(`UPDATE ${checkouts} SET reminder_sent_at=NOW() WHERE reference=$1`,[row.reference]);
        }
        await client.query('COMMIT');
      } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
    } catch {console.error('[checkout-reminders] Candidate processing failed');}
  }
}

async function summary(pool) {
  // Attribute only the first verified purchase of the same plan after the reminder.
  const {rows}=await pool.query(`SELECT count(*)::int AS sent,count(sale.reference)::int AS recovered,
    coalesce(sum(sale.amount),0)::bigint AS cents FROM ${checkouts} c LEFT JOIN LATERAL (
      SELECT x.reference,x.amount FROM ${checkouts} x JOIN ${payments} p USING(reference)
      WHERE x.user_id=c.user_id AND x.plan_id=c.plan_id AND p.paid_at>=c.reminder_sent_at
      AND p.paid_at<c.reminder_sent_at+interval '7 days'
      AND NOT EXISTS(SELECT 1 FROM billing_live_holds h WHERE h.reference=x.reference)
      ORDER BY p.paid_at,x.reference LIMIT 1
    ) sale ON true WHERE c.reminder_sent_at IS NOT NULL`);
  return rows[0];
}

module.exports={init,run,summary};
