# Stripe sandbox foundation — not launch ready

Billing is disabled by default. This change cannot accept live payments: it rejects
live keys, live events and live prices. It never grants practice access. Existing
practice behavior remains unchanged. Do not advertise paid plans as available.

## Configure an isolated test deployment

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
