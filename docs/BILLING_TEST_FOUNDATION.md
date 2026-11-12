# Payment sandbox and access testing — not a paid launch

Live mode, live API keys and live events remain rejected. Production access is never
issued by this module. Prices and allowances are configurable; examples below are
synthetic test values, not approved sale prices.

## Paystack configuration

Use an isolated staging service and database:

- `BILLING_PROVIDER=paystack`
- `BILLING_MODE=test` (disabled by default)
- `PAYSTACK_SECRET_KEY`: real test secret in hosting secrets only
- `BILLING_ORIGIN`: exact HTTPS staging origin
- `BILLING_TEST_USER_IDS`: comma-separated verified test-account IDs
- `PAYSTACK_TEST_PLANS`: e.g. `{"test":{"amount":10000,"currency":"NGN","access":{"days":30,"sessions":2}}}`
- `BILLING_TEST_ACCESS=enabled`: opt-in sandbox enforcement for allowlisted users
  only. Omit or set `disabled` to retain checkout-only testing. Every configured
  plan must have an allowance when enabled; days must be 30, sessions integer 1–1000.
- `PAYSTACK_WEBHOOK_SECRET`: optional `whsec_` secret for modern timestamped
  signatures. Otherwise verify legacy `x-paystack-signature` with the test API key.

Set Paystack's test webhook URL to the staging origin plus `/api/billing/webhook`.
Open `/billing-test.html` signed in as an allowlisted, verified user. A redirect
alone grants nothing. The Refresh payment status button performs independent server
verification; ordinary page loading only reads recorded status. For a webhook-only
smoke test, complete a new test payment without pressing Refresh payment status.

## Payment and access contract

The browser supplies only a plan ID. Server-selected amount, currency, email and
access terms are stored before contacting Paystack. Signed charge.success events
and authenticated status refresh both independently verify test domain, reference,
amount, currency, email and successful status. A single transaction writes the
verified payment, paid checkout state and entitlement. Duplicate delivery cannot
create another entitlement or reset usage. Later plan edits cannot change an
existing checkout's stored terms. Old checkout-only payments never gain allowances
retroactively.

A sandbox plan provides a pooled tutor/mock session allowance for exactly 30 days
from Paystack's paid timestamp. A session may finish its existing 8-minute cap if
started before expiry. New voice starts require unexpired access and a remaining
session. Written answer-feedback retries require active access; generating the
report for an already issued mock session and viewing saved reports remain possible
after expiry. Existing report retry protections still apply. Written retries are
not deducted from the pooled voice-session quota in this sandbox design.

Voice start reserves a slot under a PostgreSQL row lock before calling the AI
provider. Successful admission consumes it before the SDP answer is returned.
Normal user hangup does not refund it. A failed start releases a still-reserved slot
only after server cleanup ends the call. A crash or uncertain delivery can retain a
reservation/consumed slot conservatively; there is no automatic refund of uncertain
usage. Operator recovery is required for those cases before a production launch.

A user may renew after expiry with a new one-time test checkout. Active plans block
additional purchases (including exhausted but unexpired plans); early renewal,
upgrades, stacking and recurring charges are not implemented. One unresolved checkout
per user is retained durably. Failed/provider-timeout attempts cannot silently
create a second reference; investigate uncertain attempts before reset/recovery.

Only allowlisted accounts are gated. This is NOT a production paywall; existing
non-test users retain their current practice behavior.

## Owner visibility

`/owner-payments.html`, linked from the Owner dashboard, reads owner-only
`GET /api/owner/payments`. Students and staff cannot read the records. Cursor-based
pagination returns 50 rows at a time. Records show customer email/account ID, plan,
amount/currency, payment and verification timestamps, reference, expiry and session
usage. All rows are explicitly marked sandbox. No card numbers, secret keys, raw
provider payloads or password hashes appear in this response. Paystack's merchant
notification emails remain separate; no custom email sender is added here.

## Migration and rollback

Startup preserves the existing test payment rows and adds access snapshot and
isolated entitlement/usage tables. The original checkout user primary key is
replaced by a unique partial index on unresolved checkouts, permitting renewal
history. References remain unique and foreign-key protected. Repeated migrations
are safe. Test this against the staging DB only.

Do not roll back to the old checkout implementation after this migration: it uses
ON CONFLICT(user_id), which no longer has an unconditional unique constraint.
To stop billing safely, set BILLING_MODE=disabled on this version and deploy.
Disabling test access restores preexisting practice behavior; disabling billing is
not a production fail-closed paywall. Preserve records for investigation.

## Validation and remaining launch work

Automated tests cover independent verification, signature forgery, provider failure,
rollback/retry, duplicate notifications, immutable allowances, legacy compatibility,
quota enforcement, failure refunds, expiry/renewal and owner permissions. The real
PostgreSQL test `test/postgres-billing.cjs` uses two pools to race checkout creation,
notification delivery and the final session slot. Run only with a disposable
`TEST_DATABASE_URL`; it creates and drops its own random schema. CI also retains
application, database, capacity and backup/restore checks.

The original staging checkout and automatic webhook verification were exercised
successfully on November 11, 2026. The new access/owner UI still needs an authenticated
staging smoke test after deployment.

Before real payments: approve pricing/allowances and existing-user treatment;
implement live-mode isolation, refund/dispute revocation, reconciliation/alerts,
uncertain-session recovery, purchase recovery, privacy export/deletion and retention,
customer renewal management and appropriate distributed rate limits. Confirm
international/USD account capabilities separately. Do not merge or enable live
payments on the strength of this sandbox work alone.

Paystack references: https://paystack.com/docs/payments/verify-payments/ and
https://paystack.com/docs/payments/webhooks/.

## Retained Stripe sandbox adapter

Set `BILLING_PROVIDER=stripe` explicitly to use this adapter.

## Configure an isolated Stripe test deployment

Use a separate staging database and Stripe sandbox. Keep secrets in hosting secret
configuration, never in Git, browser code, screenshots or chat messages.

- `BILLING_MODE=test` (omit or set `disabled` to disable)
- `STRIPE_SECRET_KEY`: sandbox secret beginning `sk_test_`
- `STRIPE_WEBHOOK_SECRET`: endpoint signing secret beginning `whsec_`
- `BILLING_ORIGIN`: exact HTTPS staging origin, without a path
- `BILLING_TEST_USER_IDS`: comma-separated account IDs explicitly allowed to test
- `BILLING_TEST_PLANS`: JSON object mapping plan IDs to Stripe price IDs, expected
  amount in cents and currency. Example shape only:
  `{"starter":{"priceId":"price_REPLACE","amount":2900,"currency":"usd"}}`.
  No actual prices or allowance decisions are configured by this change.

Each configured Stripe price must be active, USD, monthly, licensed and match the
server's expected amount. Create a snapshot webhook endpoint using API version
`2026-10-28.endive`, matching the pinned SDK, at `/api/billing/webhook`.
Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`customer.subscription.created`, `customer.subscription.updated`,
`customer.subscription.deleted`, `customer.subscription.paused`,
`customer.subscription.resumed`, `invoice.paid`, `invoice.payment_failed`.

Sign in as a designated, verified test account and visit `/billing-test.html`.
Use Stripe test payment credentials only. Status refresh reads stored webhook
results; a successful redirect never grants access. Cancel sandbox subscriptions
through Stripe while testing; customer self-service is not yet implemented.
