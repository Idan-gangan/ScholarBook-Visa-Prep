# Password changes and rollout

After deployment, sign in with the password that already works. Open **Account security**, enter the current password, and choose a new 15–128 character password. Saving signs out every session for that account. Sign in again with the new password.

## Storage and migration

- New passwords use Node's asynchronous scrypt with a random 16-byte salt, N=32768, r=8, p=3 (OWASP's 32 MiB alternative). At most two derivations run per process and sixteen wait.
- Startup creates `user_credentials` and copies existing hashes from `app_state.users` without overwriting an existing credential. Only after those inserts finish does it remove the old hash fields from `app_state`. Student profiles, reports, transcripts and learning records stay in place.
- Existing SHA-256 credentials upgrade after a successful login. Inactive accounts still have legacy hashes until they sign in or receive an operator reset; this is not a bulk conversion.
- Updates use an atomic hash/version comparison. Credential versions invalidate sessions, including sessions in another process. Unrelated JSON profile/report writes cannot overwrite this table.
- `COACH_EMAIL` and `COACH_PASSWORD` now create a coach only when that email has no existing account. They do not change an existing password or promote an existing student. Routine password changes happen in the app. Changing Render variables alone no longer resets an existing account.

## Deploy and recovery

Take a PostgreSQL backup before this database migration. Confirm the deployment succeeds, existing login works, and an in-app change accepts only the new password. Redeploy once to confirm the new password persists.

Do not roll back to code that expects password hashes in `app_state.users`: this migration moves them. A code rollback needs a coordinated credential migration, or restore a matching database backup with appropriate care for newer user data. Prefer a forward fix.

The sign-in page offers **Forgot your password?**. Set `RESEND_API_KEY` and `RESEND_FROM` on Render; the sender must belong to your verified Resend domain. The configured sender is `VisaAtlas <noreply@notify.visaatlasprep.com>`. Secrets belong only in environment settings, never source files, screenshots or logs.

Recovery links default to `https://visaatlasprep.com`. For another deployment, set `APP_BASE_URL` to its HTTPS origin (no path, query, credentials or fragment). Links never use the request Host header. Reset tokens are 256-bit HMAC outputs derived from a random job UUID and a server secret, are stored only as SHA-256 digests, expire 30 minutes after the first delivery attempt, and bind to the credential version captured at request time. An atomic version-checked password update makes every outstanding link for that version unusable and invalidates all old sessions. A reset does not sign the user in automatically.

The token travels in the email link's fragment, not its query string. The recovery page removes the fragment from browser history immediately, uses no third-party assets, and sends the token only in the reset POST body. Do not enable request-body logging or email click tracking for recovery messages.

Requests are acknowledged only after committing to PostgreSQL. Known, unknown and ambiguous emails receive the same accepted response; lookup and admission never depend on provider response time. A 60-second cooldown applies to each normalized email across instances. Repeated requests do not extend that wait, and pending requests coalesce into one job. The old three-per-hour and thirty-total-per-hour windows are retired: their legacy table is left intact but unused. Missing configuration returns 503; cooldowns return 429 with seconds remaining.

The queue stores at most 1,000 pending jobs, with explicit 503 backpressure when full. Queued email addresses are private operational data and are removed upon completion or expiry. A worker starts automatically with the server. A PostgreSQL session advisory lock serializes dispatch across instances, with a persisted one-second send interval. If the process crashes, the connection lock releases and another worker resumes the durable job. Five attempts are allowed within a 30-minute queue lifetime. Temporary network/server errors retry with backoff; HTTP 429 respects numeric Retry-After. Confirmed provider quota/authentication failures pause sending and new admissions for five minutes. Permanent rejects and exhausted jobs are removed and logged. Provider outages lasting beyond the queue lifetime require a new user request.

Retries reuse the exact sender, URL, token and Resend idempotency key. Tokens are derived with domain-separated HMAC-SHA256 using `PASSWORD_RESET_SECRET` if supplied (at least 32 random characters); otherwise the existing `RESEND_API_KEY` is the secret, so no new setting is required for this rollout. Rotating that derivation secret cancels prepared but unsent jobs rather than changing an idempotent payload. Already delivered tokens remain valid until consumed, superseded or expired. Set a dedicated secret before enabling key rotation as an operational practice. Reset tokens and full email bodies are never stored in the queue.

Diagnostics distinguish account mismatch, provider acceptance/rejection, network failure, quota/configuration problems and expired/failed jobs. They use the existing once-per-process logger and never include emails, tokens, keys or raw provider bodies. Provider acceptance is not proof of delivery: inspect Resend for suppression/bounce/delivery status.

Capacity caveat: the integration test admits and drains 500 independent jobs with mocked transport and an accelerated clock. It is not an end-to-end production load test. The conservative one-send-per-second dispatcher takes at least about eight minutes to drain a simultaneous 500-email burst; provider latency or throttling can add time. The Resend Free plan permits 100 transactional emails per UTC day and 3,000 per month, so it cannot deliver 500 resets in one day. Check Settings → Usage and plan capacity before a real rollout. The queue does not bypass provider quotas. Its bounds and cooldown provide basic abuse control, not full bot protection; broader launch requires traffic monitoring and verified edge abuse controls.

Provider references (checked October 4, 2026):
- https://resend.com/docs/api-reference/rate-limit
- https://resend.com/docs/knowledge-base/account-quotas-and-limits
- https://resend.com/docs/dashboard/emails/idempotency-keys

After deploying, use a test account you control to request one reset. Confirm delivery, successful sign-in with the new password, rejection of the old password, and rejection when reusing the link. Resend's email status helps diagnose delivery failures. No production email is sent by automated tests. If the mailbox is inaccessible, account recovery still needs an authorized operator; never bypass mailbox ownership based only on a claimed email address.

## Limits and checks

Sessions still live in memory and deployments sign everyone out. Sessions expire after eight hours. Cookies use HttpOnly, SameSite=Lax and Secure on Render/production. Auth attempts are limited to ten per minute per normalized email (or user for password changes), per process; this is not a distributed abuse-prevention system. JSON bodies are capped at 1 MiB. The password-change endpoint requires JSON and the current password.

Run `node --check server.js` and `node --test test/*.test.cjs`. Run `TEST_DATABASE_URL=... node --test test/postgres-state.cjs test/postgres-recovery.cjs` against a disposable PostgreSQL database. Integration tests isolate their schemas and verify expiry, competing reset links, credential-version invalidation, provider failure, shared cooldowns, 500 durable jobs, restart/idempotency behavior and preservation of application data. Email delivery is mocked.

References: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html and https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback
