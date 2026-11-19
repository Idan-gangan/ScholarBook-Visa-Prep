# Starter pilot launch

## Commercial terms

Starter: one-time USD 29.00, 6 mock + 6 tutor starts. Standard (including the Scholarbook offer): one-time USD 49.00, 12 mock + 8 tutor starts. Each package lasts 30 days from the verified
provider payment timestamp. Each voice session lasts up to 8 minutes. Mock
reports are included. No automatic renewal or rollover. Repurchase is permitted
after expiry or depletion. The backend fixes these terms; a browser cannot
choose a price, currency, customer or allowance.

## Rollout scope

This is an explicitly invited pilot, not a site-wide paywall. Only IDs in
`BILLING_LIVE_USER_IDS` are charged and metered; existing non-pilot access is
unchanged. Maximum 25 IDs. Do not remove an unpaid or exhausted pilot account
from this list to manage support: doing so removes its pilot metering.

Test and live checkouts, payments, holds, entitlements and usage are physically
separate tables. Switching modes never promotes a sandbox payment. Duplicate
verified events cannot reset allowance. All access writes use transactions.

## Required configuration (do not commit values)

- `BILLING_PROVIDER=paystack`
- `BILLING_MODE=live`
- `PAYSTACK_SECRET_KEY`: live secret, entered directly in Render secret settings
- `BILLING_ORIGIN=https://visaatlasprep.com`
- `BILLING_LIVE_USD_READY=confirmed`: only after USD collection is actually enabled
- `BILLING_LIVE_USER_IDS`: comma-separated verified account IDs, up to 25
- `PAYSTACK_WEBHOOK_SECRET`: optional separate signing secret if configured in
  Paystack; when set, legacy signatures are rejected, so this must match.

Webhook URL: `https://visaatlasprep.com/api/billing/webhook`.
Customer URL: `https://visaatlasprep.com/billing.html`.
Owner payment URL: `https://visaatlasprep.com/owner-payments.html`.

Confirm account activation, international/USD permissions, settlement account,
fee settings and customer refund terms before enabling checkout. Do not infer USD
activation from a successful NGN sandbox payment. Absorb fees if advertising an
exact USD 29 checkout; bank conversion charges are separate.

## Before live activation

1. Run `npm run test:billing` and `node --test test/*.test.cjs`.
2. Run the repository PostgreSQL CI suite including `test/postgres-billing.cjs` (test and live ledger races).
3. Deploy this branch to staging using TEST keys and TEST mode. Verify authentic
   checkout/webhook, session depletion, failed-start cleanup, owner history and
   provider diagnostics. Live mode must not be enabled in staging.
4. Check a database backup and preserve the current deployment identifier.
5. Confirm the commercial and refund terms, eligible pilot accounts and currency.
6. Deploy production, then configure live credentials privately. Complete one
   authorized real purchase and verify the provider record, exact amount/currency,
   single entitlement with the purchased separate mock/tutor limits, owner history and delivered webhook before
   inviting the remaining pilot customers. Automated fixtures do not prove live
   provider delivery or settlement.

## Refund/dispute and failure behavior

Signed processed-refund/dispute events put the referenced allowance on hold.
The hold survives success replays and events arriving out of order. Partial
refunds also require review; dispute resolution does not automatically restore
access. The owner view identifies held payments. No refund is initiated by this
code. Review the verified provider outcome before an operator restores access.
Current in-progress voice calls finish under their existing eight-minute limit;
holds block later starts. Failed hangups retry, so eight minutes is not a hard
upper bound on provider spend during an outage.

Uncertain initialization is retained, never replaced blindly with another charge.
The customer can refresh verification or contact support. Recovery of an
unrecoverable checkout and abandoned voice reservations remains operator-managed.
Never delete a reference or release usage without checking provider state first.

Disabling `BILLING_MODE` also disables billing admission enforcement; it is NOT a
safe paid-access emergency switch. Pause AI with `AI_ENABLED=false` when necessary
and keep billing verification available to reconcile payments. Do not roll back
to code that uses the old one-checkout-per-user primary-key schema.

## Cost evidence

Provider-side diagnostics are included but require staging validation and an
independent provider billing reconciliation. They do not recover missing history.
See `provider-cost-tracking.md`. Rates expire after November 30, 2026; counters
remain recorded but unpriced until the rate table is reviewed. The USD 16 AI
budget per fully used package is a planning assumption, not a spending cap.

## External setup still required

This code does not establish Paystack USD activation, live credentials, account
settlement eligibility, refund terms, or a verified live transaction. Those are
launch dependencies, not implied by passing tests.

Separate allowances are immutable checkout snapshots. Existing shared allowances retain their original terms. Reading modules consumes no voice allowance. Repurchase is available after both allowances are exhausted or the plan expires; exhausting only one category does not permit repurchase. Sandbox plans may opt into separate limits using access.mock and access.learn, whose sum must equal access.sessions.
