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

This change does not provide email-based forgotten-password recovery. If the current password is lost, an authorized database operator must reset the account using a freshly generated scrypt hash in `user_credentials` and increment its version. Never paste passwords or hashes in issue comments or logs. A future verified-email recovery flow can remove that manual step.

## Limits and checks

Sessions still live in memory and deployments sign everyone out. Sessions expire after eight hours. Cookies use HttpOnly, SameSite=Lax and Secure on Render/production. Auth attempts are limited to ten per minute per normalized email (or user for password changes), per process; this is not a distributed abuse-prevention system. JSON bodies are capped at 1 MiB. The password-change endpoint requires JSON and the current password.

Run `node --check server.js` and `node --test test/*.test.cjs`. Tests use real scrypt with mocked PostgreSQL/HTTP and a simulated DOM; they do not replace a live database migration or browser smoke test.

References: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html and https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback
