'use strict';
/**
 * Owner-only commercial snapshot. Values come from the verified, live Paystack
 * ledger. This is NOT revenue recognition, payouts, refunds or a profit report.
 * Never use the test ledger for a production business KPI.
 */
const {tablesFor}=require('./billing-tables');
const count=v=>Math.max(0,Number(v)||0);
async function commercialOverview(pool,{mode='disabled',studentAccounts=0,studentProfiles=0}={}){
  const base={asOf:new Date().toISOString(),mode,studentAccounts:count(studentAccounts),
    studentProfiles:count(studentProfiles),verifiedPayments:0,verifiedPayers:0,
    verifiedUsdCents:0,verifiedUsd30dCents:0,activePaidAccounts:0,
    onHoldPayments:0,openCheckouts:0,starterPurchases:0,standardPurchases:0,
    trialAccounts:0,trialMockSessionsUsed:0,trialAccountsWithPayment:0,
    trialOverlapRate:null,financialsComplete:false};
  if(mode!=='live')return base;
  const t=tablesFor('live');
  const summary=(await pool.query(`
    WITH ledger AS (
      SELECT c.user_id,c.plan_id,c.amount,c.currency,c.state,
             p.verified_at, h.reason AS hold_reason,
             e.expires_at
      FROM ${t.checkouts} c
      LEFT JOIN ${t.payments} p ON p.reference=c.reference
      LEFT JOIN ${t.holds} h ON h.reference=c.reference
      LEFT JOIN ${t.entitlements} e ON e.reference=c.reference
    )
    SELECT
      COUNT(*) FILTER (WHERE verified_at IS NOT NULL AND hold_reason IS NULL)::int AS verified_payments,
      COUNT(DISTINCT user_id) FILTER (WHERE verified_at IS NOT NULL AND hold_reason IS NULL)::int AS verified_payers,
      COALESCE(SUM(amount) FILTER (WHERE verified_at IS NOT NULL AND hold_reason IS NULL AND currency='USD'),0)::bigint AS verified_usd_cents,
      COALESCE(SUM(amount) FILTER (WHERE verified_at >= NOW()-INTERVAL '30 days'
        AND hold_reason IS NULL AND currency='USD'),0)::bigint AS verified_usd_30d_cents,
      COUNT(DISTINCT user_id) FILTER (WHERE verified_at IS NOT NULL
        AND hold_reason IS NULL AND expires_at > NOW())::int AS active_paid_accounts,
      COUNT(*) FILTER (WHERE verified_at IS NOT NULL AND hold_reason IS NOT NULL)::int AS on_hold_payments,
      COUNT(*) FILTER (WHERE state IN ('reserved','initializing','open','uncertain'))::int AS open_checkouts,
      COUNT(*) FILTER (WHERE verified_at IS NOT NULL AND hold_reason IS NULL
        AND plan_id='starter')::int AS starter_purchases,
      COUNT(*) FILTER (WHERE verified_at IS NOT NULL AND hold_reason IS NULL
        AND plan_id='standard')::int AS standard_purchases
    FROM ledger
  `)).rows[0]||{};
  const trials=(await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM mock_trial_accounts) AS trial_accounts,
      (SELECT COUNT(*)::int FROM mock_trial_usage WHERE state='consumed') AS trial_mock_sessions_used,
      (SELECT COUNT(DISTINCT a.user_id)::int FROM mock_trial_accounts a
       JOIN ${t.checkouts} c ON c.user_id=a.user_id
       JOIN ${t.payments} p ON p.reference=c.reference
       LEFT JOIN ${t.holds} h ON h.reference=c.reference
       WHERE h.reference IS NULL) AS trial_accounts_with_payment
  `)).rows[0]||{};
  const result={...base,
    verifiedPayments:count(summary.verified_payments),
    verifiedPayers:count(summary.verified_payers),
    verifiedUsdCents:count(summary.verified_usd_cents),
    verifiedUsd30dCents:count(summary.verified_usd_30d_cents),
    activePaidAccounts:count(summary.active_paid_accounts),
    onHoldPayments:count(summary.on_hold_payments),
    openCheckouts:count(summary.open_checkouts),
    starterPurchases:count(summary.starter_purchases),
    standardPurchases:count(summary.standard_purchases),
    trialAccounts:count(trials.trial_accounts),
    trialMockSessionsUsed:count(trials.trial_mock_sessions_used),
    trialAccountsWithPayment:count(trials.trial_accounts_with_payment)
  };
  // An observed overlap, not proof the free trial caused the purchase.
  result.trialOverlapRate=result.trialAccounts?
    Math.round(result.trialAccountsWithPayment/result.trialAccounts*1000)/10:null;
  return result;
}
module.exports={commercialOverview};
