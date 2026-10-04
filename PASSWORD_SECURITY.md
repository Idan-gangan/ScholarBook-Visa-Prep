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

Recovery links default to `https://visaatlasprep.com`. For another deployment, set `APP_BASE_URL` to its HTTPS origin (no path, query, credentials or fragment). Links never use the request Host header. Reset tokens have 256 random bits, are stored only as SHA-256 digests, expire in 30 minutes, and bind to the credential version. An atomic version-checked password update makes every outstanding link for that version unusable and invalidates all old sessions. A reset does not sign the user in automatically.

The token travels in the email link's fragment, not its query string. The recovery page removes the fragment from browser history immediately, uses no third-party assets, and sends the token only in the reset POST body. Do not enable request-body logging or email click tracking for recovery messages.

Requests return the same message before account lookup, including for unknown emails and quota exhaustion. Sending runs asynchronously with a maximum of five in-flight jobs per process; a restart before delivery can lose a job, so users can retry. PostgreSQL quotas cap attempts at three per normalized email per hour and thirty total per hour across instances/restarts. Quota windows begin with the first attempt. Failed sends consume quota and invalidate that link. Provider errors log fixed diagnostic codes, without emails, tokens or provider bodies. Missing email configuration returns a general availability error. This deliberately small launch quota should be revisited as usage grows.

After deploying, use a test account you control to request one reset. Confirm delivery, successful sign-in with the new password, rejection of the old password, and rejection when reusing the link. Resend's email status helps diagnose delivery failures. No production email is sent by automated tests. If the mailbox is inaccessible, account recovery still needs an authorized operator; never bypass mailbox ownership based only on a claimed email address.

## Limits and checks

Sessions still live in memory and deployments sign everyone out. Sessions expire after eight hours. Cookies use HttpOnly, SameSite=Lax and Secure on Render/production. Auth attempts are limited to ten per minute per normalized email (or user for password changes), per process; this is not a distributed abuse-prevention system. JSON bodies are capped at 1 MiB. The password-change endpoint requires JSON and the current password.

Run `node --check server.js` and `node --test test/*.test.cjs`. Run `TEST_DATABASE_URL=... node --test test/postgres-state.cjs test/postgres-recovery.cjs` against a disposable PostgreSQL database. Integration tests isolate their schemas and verify expiry, competing reset links, credential-version invalidation, provider failure, shared quotas and preservation of application data. Email delivery is mocked.

References: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html and https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback
