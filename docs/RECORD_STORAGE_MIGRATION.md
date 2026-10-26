# Record storage rollout

The new mode is opt-in (`RECORD_STORAGE=enabled`). Merging this branch does not switch storage. No live schema or mode has been changed by this branch.

## Implemented

Indexed account lookup by ID/email; permission-filtered student/report lists; student working sets for profile updates, lessons, voice admission, mock creation and report persistence; collection-scoped registration, reviews, verification and guardian operations. Recovery workers query the selected storage mode. Existing account deletion/export and owner operations retain complete transactional state where cross-collection consistency matters. Unchanged records are not rewritten.

All writers still use one database lock as a compatibility barrier. Heavy owner/account operations can delay ordinary writes. This is an intentional consistency tradeoff, not unlimited scaling. Sessions are process-local; this change does not enable multi-instance sessions.

## Validation

GitHub Actions run 40279731142 passed 194 existing tests and 12 PostgreSQL tests, including an actual HTTP server in record mode: registration/login, profile, learning, voice lifecycle and report/PDF with stubbed provider responses, report retry, reviews/moderation, staff assignment/revocation, guardian withdrawal, export, recovery for an account created after migration, active-call deletion refusal, and final account deletion.

Migration equality, credential rollback, latest-state rollback export and backup/restore checks passed. Synthetic integrated adapter measurements (five DB connections, 80% student reads / 20% profile writes) at 100 simultaneous operations:

| Stored accounts | p95 operation latency | Failures |
| --- | --- | --- |
| 200 | 78.5 ms | 0 |
| 1,000 | 48.6 ms | 0 |
| 10,000 | 51.6 ms | 0 |

These are short bursts on GitHub runner hardware, not sustained traffic on Render and not simultaneous real voice interviews. Production CPU/memory, AI quotas, cost and realistic session mixes remain separate constraints. Do not advertise these numbers as a supported concurrent-user limit.

## Cutover

1. Deploy code in default legacy mode; verify health and the exact deployment SHA.
2. Verify a fresh recoverable database backup. Enable Render maintenance, allow in-flight requests to drain, and stop all background state writers. No mixed legacy/new writers are permitted.
3. `node scripts/record-cutover.cjs status` is read-only. Ensure no active voice/report/recovery jobs remain. The migration helper refuses mutation while any remain.
4. During verified maintenance only, run `RECORD_STORAGE_MAINTENANCE=confirmed node scripts/record-cutover.cjs migrate`. This copies data into new tables in one transaction and requires exact content equality before commit. Original app_state remains intact as the pre-cutover baseline. Failure rolls back the new tables.
5. Set `RECORD_STORAGE=enabled` and deploy all instances together. Verify database counts, health, sign-in and important journeys before disabling maintenance. Take a post-cutover backup.
6. Monitor errors, latency, memory and database/AI usage during a limited rollout; raise traffic only from measured results.

## Rollback

Stop traffic and all writers again. Never simply disable the flag after accepting new writes: the old app_state is stale and could resurrect deleted accounts. Run `RECORD_STORAGE_MAINTENANCE=confirmed node scripts/record-cutover.cjs rollback` to export the LATEST record state into app_state transactionally; then unset the mode and redeploy. Other relational tables remain in place. Never restore only an old app_state snapshot while keeping newer credentials or deletion state.

The local rehearsal helper remains restricted to disposable localhost databases. No retention deletion is introduced. Every existing collection and metadata property is preserved, including reviews, guardian records, mock sessions and audit history.
