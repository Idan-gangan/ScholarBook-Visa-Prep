# VisaAtlas quality review — 2 October 2026

Reviewed main cae7f1f123cac7eb8e7061d2a3e40fdca5a114f4. This is a source review, not a production penetration test or capacity certification.

## Implemented in this patch

- Escape untrusted profile, dashboard, report and human-review fields before HTML insertion. Student options use DOM text; report actions use data attributes and event listeners rather than interpolated JavaScript.
- Accept only explicit evaluation fields from the model. Ownership, identifiers, timestamps, report numbering and human review remain server-controlled. Reject invalid overall scores and feedback; discard invalid rubric scores.
- Remove raw evaluation output and internal exception details from client errors.
- Add MIME-sniffing and framing protections and a same-origin referrer policy to JSON/static responses; revalidate static content.
- Add regression tests covering hostile saved text, forged report ownership and error disclosure.

## Next priorities and acceptance gates

1. **Prevent lost database updates.** Registration, profiles, transcripts and reports currently rewrite shared app_state JSON. In particular, evaluation reads state before a remote model request and later saves that old snapshot. Migrate to transactional per-entity writes with unique email constraints and report idempotency. Verify simultaneous registrations, profile saves and evaluations preserve every unrelated change using real PostgreSQL. Rehearse migration and recovery on a database copy before production.
2. **Bound all AI spending.** Voice start limits do not bound evaluation requests or total spending. Add persistent evaluation quotas, per-account concurrent-request limits, provider timeouts, output limits and usage accounting. Test duplicate requests, provider failures and restarts. A usage dashboard should distinguish estimated cost from billed cost.
3. **Automate release checks.** Repair the stale dependency lockfile, use reproducible installation, run tests on pull requests, and add real PostgreSQL integration tests. Add browser coverage for registration, profile editing, report review and mobile navigation. Current tests use mocked database/provider/DOM surfaces.
4. **Account lifecycle and permissions.** Add verified email and expiring single-use password recovery, durable revocable sessions, explicit role allowlists, and cross-account authorization tests for every data route. Never use a shared coach login for regular staff access.
5. **Teaching quality.** Expand lessons for undergraduate/graduate, athlete/non-athlete, full/partial/self funding and previous refusals. Assess factual grounding and helpfulness with reviewed examples. Keep tutoring concise and distinct from mock interviewing; feedback must not imply a visa approval prediction. Tutor wording and live duration checks remain deferred until tomorrow as requested.
6. **Product usability.** Simplify the one-student selector, clarify required registration fields and save states, provide meaningful empty/error states, and verify keyboard/screen-reader/mobile behavior. Measure onboarding completion and task success before redesigning screens.
7. **Operations and privacy.** Add health monitoring, request IDs and alerts without logging secrets or full student conversations. Define deletion/retention and export behavior. Test restoring a backup into an isolated database. Load-test before promising any simultaneous-user capacity; a paid Render plan alone is not evidence of capacity.

## Verification boundaries

The local suite passes 45 tests, including three added regression tests. No real provider calls, production database mutation, browser penetration test or load test was performed. This patch does not resolve database concurrency, account recovery, comprehensive AI budget enforcement or all possible security issues. Review and deploy it before claiming these changes are live.
