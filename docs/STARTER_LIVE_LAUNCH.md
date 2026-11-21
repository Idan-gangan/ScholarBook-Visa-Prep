# Starter pilot launch

## Commercial terms

Starter: one-time USD 29.00, 6 mock + 6 tutor starts. Standard (including the Scholarbook offer): one-time USD 49.00, 12 mock + 8 tutor starts. Each package lasts 30 days from the verified
provider payment timestamp. Each voice session lasts up to 8 minutes. Mock
reports are included. No automatic renewal or rollover. Repurchase is permitted
after expiry or depletion. The backend fixes these terms; a browser cannot
choose a price, currency, customer or allowance.

## Rollout scope

Live billing is open to every signed-in, email-verified account. All accounts
need a verified paid plan to start paid practice, including existing non-pilot
accounts. Reading and account management remain available. The legacy
`BILLING_LIVE_USER_IDS` variable no longer restricts checkout or metering.
Test billing remains restricted to `BILLING_TEST_USER_IDS`.

Test and live checkouts, payments, holds, entitlements and usage are physically
separate tables. Switching modes never promotes a sandbox payment. Duplicate
verified events cannot reset allowance. All access writes use transactions.

## Required configuration (do not commit values)

- `BILLING_PROVIDER=paystack`
- `BILLING_MODE=live`
- `PAYSTACK_SECRET_KEY`: live secret, entered directly in Render secret settings
- `BILLING_ORIGIN=https://visaatlasprep.com`
- `BILLING_LIVE_USD_READY=confirmed`: only after USD collection is actually enabled
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
The customer can refresh verification or contact support. A new recovery action
checks Paystack's verified transaction status before closing an `open` or `uncertain`
checkout and permits selecting another plan only if Paystack reports `failed` or
`abandoned`. Pending, processing, ambiguous, and in-flight initialization are
not cleared. Old references remain in the payment ledger; a late successful
payment after checkout closure is recorded and placed on hold for owner review,
not automatically granted as a second entitlement. Abandoned voice reservations
and irrecoverable transactions remain operator-managed. Never delete a reference
or release usage without checking provider state first.

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

## Release-gate checks added November 21, 2026

- New and legacy accounts display two no-card mock interviews; Gmail aliases receive a single hashed trial identity for new grants. This is only one abuse-control layer, not full person-level or bot prevention. Historical NULL identities are not backfilled. Account deletion retains a keyed mailbox hash for 180 days to suppress repeat trials, including legacy accounts whose hash was NULL. Expired suppression records are cleaned lazily on grant. A durable global limit of 100 free session starts per UTC day bounds multi-mailbox abuse; failed starts count toward this budget but release personal allowances. Paid sessions are unaffected. Rotate TRIAL_IDENTITY_SECRET only with a migration plan; the current fallback uses the Paystack secret, so rotating that key can invalidate identity matching.
- Registration requires the November 21 Terms version; privacy and Terms describe hosted Paystack data handling. Owner and qualified legal review are still required.
- Tutor and mock pages offer an optional browser-local microphone test; test Safari on iPhone with permission granted, denied, headphones, interruptions, background noise, and screen lock. Passing unit tests does not establish real Realtime audio quality.
- Run the GitHub PR test workflow, `npm run test:billing`, `node --test test/*.test.cjs`, and disposable PostgreSQL integration; explicitly test unsuccessful, abandoned, pending and late payment webhooks before merging.
- Production uses the Render `scholarbook-visa-prep-db` PostgreSQL service; database availability has been verified by read-only query, but managed backup recovery point and restore success are NOT verified. Confirm recovery and alert destinations with the owner before opening broad access.
- A temporary free staging PostgreSQL database expires November 27, 2026; preserve needed test evidence and plan a replacement, without touching production data.
- No real live Paystack transaction, settlement, or automatic entitlement grant has been verified by these source and database checks. Authorize exactly one controlled real payment after staging succeeds; compare Paystack transaction, verified amount/currency, billing ledger, entitlement, owner history, and session quota before marketing paid plans.
