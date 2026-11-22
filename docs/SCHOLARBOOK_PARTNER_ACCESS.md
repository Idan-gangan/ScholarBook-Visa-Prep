# Scholarbook Sponsored Access — Draft B2B Launch

Status: proposal for Owner review, not yet deployed. No change to public prices.

## Package
- Partner: Scholarbook (private)
- 30 calendar days from Owner activation
- 12 AI mock interviews and 8 voice tutor sessions
- Up to 8 minutes per voice session
- No automatic renewal or rollover
- Public retail Starter/Standard remain separate

## Operations
1. Confirm Scholarbook's signed commercial agreement and authorized package quantity.
2. Scholarbook athlete registers their own VisaAtlas Student account and verifies email. Never share passwords.
3. Owner opens `/owner-partners.html` (linked from Owner dashboard), selects the registered student, enters internal invoice/agreement reference and Owner password, and grants access.
4. Student receives sponsored practice access and does **not** need to use Paystack.
5. Owner checks package usage and expiry, may revoke access for a justified reason, and may grant a new package after previous access expires or has been revoked.
6. Track Scholarbook invoices and cash receipts *outside* Paystack; these private allocations are NOT proof of payment or collected revenue.

## Access controls and separation
- Only the authenticated Owner can list and assign partner access.
- API requires current Owner password and the same allowed origin for every grant/revoke.
- Only verified, active Student accounts can receive grants.
- No self-service signup link, public promo code, free unlimited allocation, forged Paystack checkout, or elevated athlete roles.
- Partner grants, usage and revocations are separate PostgreSQL tables, with server-side session reservation and transactional quota checks.
- Paid Paystack entitlement still takes precedence until it expires; the Owner API refuses a second active plan.
- Partner quota is enforced before the ordinary live Paystack trial or individual subscription quota.
- Refund/dispute behavior remains unchanged for individual Paystack transactions. A Scholarbook commercial dispute requires Owner to revoke sponsored access separately.

## Rollout gate
- Confirm commercial package, invoicing and per-athlete billing policy with Scholarbook.
- Review terms for privacy, data sharing, guardian consent where appropriate, and who is allowed to view interviews/reports.
- Run billing tests, Node tests, PostgreSQL integration and browser E2E tests on staging.
- Confirm existing retail checkout, one-time payment activation, and free mock eligibility are unaffected.
- Test an authorized Scholarbook sample student on staging: register, verify, grant once, run a mock and tutor, decrement separate allowances, block overuse, revoke and renew after expiry.
- Do not bulk-grant production athletes until Owner approves deployment and confirms who is invoicing whom.

Known v1 limitation: Partner staff are not given read or admin privileges. Reports remain in each student's account and owner system. A dedicated Scholarbook staff portal with appropriate data sharing consent should be a separately reviewed project.
