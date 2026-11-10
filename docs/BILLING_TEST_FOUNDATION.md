# Payment sandbox foundation — not launch ready

Billing is disabled by default. This change cannot accept live payments: it rejects
live keys, live events and live prices. It never grants practice access. Existing
practice behavior remains unchanged. Do not advertise paid plans as available.

## Paystack test checkout (default provider)

Use an isolated staging deployment and database. Saving a key alone does not
enable billing. Configure:

- `BILLING_PROVIDER=paystack`
- `BILLING_MODE=test` (disabled by default; live mode is rejected)
- `PAYSTACK_SECRET_KEY`: test secret, stored only in hosting secret configuration
- `BILLING_ORIGIN`: exact HTTPS staging origin
- `BILLING_TEST_USER_IDS`: comma-separated verified test-account IDs
- `PAYSTACK_TEST_PLANS`: JSON mapping IDs to integer minor-unit amounts and uppercase
  currency. Synthetic example only: `{"starter":{"amount":10000,"currency":"NGN"}}`.
  This means NGN 100, not a proposed sale price. USD requires provider account support.
- `PAYSTACK_WEBHOOK_SECRET`: optional endpoint signing secret beginning `whsec_`.
  When configured, timestamped `paystack-signature` signatures are required and
  legacy signatures are rejected. Otherwise legacy `x-paystack-signature` is
  verified using the test API secret. Configure the matching provider scheme.

Set the test webhook endpoint to `/api/billing/webhook`. Sign in as an allowed,
email-verified account and open `/billing-test.html`. Use Paystack test credentials.
The refresh button calls authenticated `POST /api/billing/verify` with an empty
JSON object. The server obtains the reference from its own checkout record.

Paystack currently performs a **one-time test payment**, not a subscription. It
never grants paid practice access. A successful redirect is not payment proof.
Signed charge notifications trigger independent server verification of test domain,
reference, amount, currency and customer email. Payment records commit atomically
and duplicate notifications cannot create duplicate payment records.

One checkout reference is reserved durably per test account. Repeated clicks reuse
the checkout. After a provider timeout, no second reference is issued automatically;
refresh can reconcile a successful payment. Failed or unresolved attempts require
operator investigation and, if appropriate, an isolated test-data reset. This is
intentionally not a production purchase/retry lifecycle. Renewals, cancellation,
refunds, disputes, usage enforcement and account entitlement remain unimplemented.

Paystack automated tests use mocked HTTP and embedded PostgreSQL, including real
HMAC verification, forged/stale signatures, repeated checkout, uncertain requests,
mismatched payment details, provider failures, duplicate events and rollback/retry.
Actual Paystack sandbox checkout and multi-process PostgreSQL tests are still
required before deployment approval. Do not assume Stripe sandbox tests validate
the Paystack integration.

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

## Security and consistency

- Authenticated checkout, explicit test-account allowlist, verified email check,
  exact Origin check, bounded request bodies and per-process request throttling.
- The browser supplies only a plan ID. It cannot set amount, customer, user ID or
  return URL. Customer ownership comes from the server session.
- Durable attempt IDs provide idempotency across request failures. PostgreSQL row
  locks serialize checkout per user. Open checkouts are reused and existing
  subscriptions block another purchase.
- Raw body signature verification with the Stripe SDK and five-minute timestamp
  tolerance. Invalid signatures and live events are rejected.
- Subscription state is fetched from Stripe after locking the customer row.
  Reordered notifications cannot restore an old snapshot. Event deduplication and
  subscription writes commit in one transaction; failed writes allow retry.
- Only customer references, subscription status/periods and event IDs are stored.
  No card numbers, CVVs, full webhook payloads or secret keys are stored here.
- Test tables are intentionally separate from access-control and usage tables.

## Validation performed

`npm ci && npm run test:billing` runs Node tests using embedded PostgreSQL (PGlite)
and a mocked Stripe transport, with real SDK signature verification. Tests cover
configuration, authorization, origin validation, price validation, repeated
checkout, active-subscription blocking, timeout retry keys, invalid/stale/live
events, duplicate delivery, stale events, rollback/retry and ownership isolation.
PGlite tests do not establish multi-process PostgreSQL concurrency correctness.

## Required before a paid launch

1. Confirm final prices, tutor/mock allowances, daily caps, billing-period reset
   rules, failed-session refunds and treatment of existing/free/Scholarbook users.
2. Implement atomic server-side usage reservations and settlement, server-enforced
   remaining minutes, disconnect recovery and billing-period rollover. Cover all
   voice and report-practice paths and concurrent requests.
3. Implement paid entitlement rules using verified paid invoices, cancellations,
   failed renewals, delayed payment methods, refunds and disputes. Subscription
   `active` alone is not sufficient proof of a paid invoice.
4. Add customer cancellation/renewal management, accurate allowance displays,
   refund/support terms, and appropriate account export/deletion handling.
5. Test against actual Stripe sandbox and staging PostgreSQL: checkout success,
   decline, authentication challenge, renewals, cancellation, delayed events,
   retries, concurrent tabs/processes and redeployment during provider calls.
6. Add reconciliation and alerting, distributed throttling, bounded webhook
   processing/queueing and durable recovery for attempts older than Stripe's
   idempotency retention. Network calls currently hold a test-account DB lock.
7. Review hosting secrets/access, backups and restore, operational ownership and
   rollback. Validate the full production security posture separately.
8. Enable live mode only through a separately reviewed implementation and explicit
   launch decision. This foundation deliberately has no live-mode switch.

References: https://docs.stripe.com/webhooks and
https://docs.stripe.com/billing/subscriptions/webhooks.

Paystack references: https://paystack.com/docs/payments/verify-payments/ and
https://paystack.com/docs/payments/webhooks/.
