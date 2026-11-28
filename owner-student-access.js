'use strict';
async function studentAccess(pool,users){
  const {rows}=await pool.query(`WITH packages AS (
    SELECT e.user_id,e.reference AS id,e.starts_at,e.expires_at,'Paid' AS kind,
      (e.mode_limits->>'mock')::int AS mock_limit,e.session_limit,
      EXISTS(SELECT 1 FROM billing_live_holds h WHERE h.reference=e.reference) AS blocked
    FROM billing_live_entitlements e
    UNION ALL SELECT user_id,id,starts_at,expires_at,'Partner',mock_limit,mock_limit+learn_limit,revoked_at IS NOT NULL
    FROM partner_access_grants
  ), ranked AS (
    SELECT *,starts_at<=now() AND expires_at>now() AND NOT blocked AS active FROM packages
  ), latest AS (
    SELECT DISTINCT ON(user_id) * FROM ranked ORDER BY user_id,active DESC,(kind='Partner' AND active) DESC,expires_at DESC
  ), usage AS (
    SELECT reference AS id,mode FROM billing_live_usage WHERE state<>'released'
    UNION ALL SELECT grant_id,mode FROM partner_access_usage WHERE state<>'released'
  ), payment AS (
    SELECT DISTINCT ON(user_id) user_id,CASE WHEN h.reference IS NOT NULL THEN 'On hold'
      WHEN p.reference IS NOT NULL THEN 'Verified' ELSE 'Unverified' END AS status
    FROM paystack_live_checkouts c LEFT JOIN paystack_live_payments p USING(reference)
    LEFT JOIN billing_live_holds h USING(reference) ORDER BY user_id,c.created_at DESC,c.reference
  )
  SELECT u.id AS user_id,CASE WHEN l.active THEN l.kind WHEN l.blocked THEN 'Inactive'
    WHEN l.expires_at<=now() THEN 'Expired' ELSE 'Free' END AS account_type,
    coalesce(p.status,'No payment recorded') AS payment_status,l.expires_at,
    (SELECT count(*)::int FROM usage WHERE id=l.id AND mode='learn') AS tutor_used,
    CASE WHEN l.active THEN greatest(0,coalesce(l.mock_limit,l.session_limit)-
      (SELECT count(*)::int FROM usage WHERE id=l.id AND (mode='mock' OR l.mock_limit IS NULL)))
      WHEN EXISTS(SELECT 1 FROM mock_trial_accounts a WHERE a.user_id=u.id) THEN greatest(0,1-
      (SELECT count(*)::int FROM mock_trial_usage t WHERE t.user_id=u.id AND t.state<>'released'))
      ELSE NULL END AS mocks_remaining
  FROM unnest($1::text[]) AS u(id) LEFT JOIN latest l ON l.user_id=u.id LEFT JOIN payment p ON p.user_id=u.id`,[users]);
  return new Map(rows.map(row=>[row.user_id,row]));
}
module.exports={studentAccess};
