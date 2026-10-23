# Daily voice cost safeguards

Current policy: each signed-in account can attempt two tutor starts and one mock start per UTC day. Each tutor lasts up to 8 minutes and each mock up to 12 minutes. All roles, including owners, staff and demo accounts, share this policy; legacy tester flags do not bypass it. Staff usage is counted across their assigned students.

Start attempts count once admitted, including provider failures and sessions ended early. Invalid requests, unauthorized requests, concurrent-session rejections and requests rejected by the daily quota do not consume a start. One active voice session per account and the 10-second start cooldown still apply. There are no automatic voice retries.

Report generation is limited to three attempts per account per UTC day, including failed generations. Saved reports can still be opened or downloaded; requests for an already saved report return it without a new generation. One report attempt may include both evaluation and evidence review provider calls.

Quotas reset at 00:00 UTC. Atomic PostgreSQL counters persist across refreshes, restarts and multiple processes. Existing usage for the current UTC day counts immediately after deployment, so an account already above the new quota must wait for reset. Lessons and saved reports remain accessible.

## Deployment and verification

No dependency, secret or schema changes are required for this policy update. Existing usage and admission tables are reused. The model and per-response token settings are unchanged.

Run:
- `node --test test/*.test.cjs`
- `TEST_DATABASE_URL=<disposable database> node --test test/postgres-state.cjs test/postgres-voice.cjs`

The unit suite uses simulated database/provider behavior. The integration suite exercises concurrent quotas, persisted usage, UTC rollover and admission recovery against disposable PostgreSQL. Do not run integration tests against production.

After deployment, use a dedicated account to verify visible counters, two tutor starts, one mock start, blocked excess attempts, and continued access to saved reports. Short/failed starts count; they cannot be reused for further testing until reset.

## Cost boundaries

These are usage limits, not a hard dollar budget. Compared with six full 8-minute tutors and five full 12-minute mocks, the nominal daily voice allowance drops from 108 to 28 minutes (about 74%). Actual savings depend on usage, audio/text tokens, conversation history and provider pricing.

The existing server sweep requests hangup every 15 seconds for expired calls. Outages, failed hangups, untracked provider calls and cleanup delays can exceed nominal durations. Browser session defaults are not tamper-proof per-response cost enforcement. There is no global monetary ceiling or authoritative billing reconciliation. Multiple-account abuse and total user growth can still increase spending.

Older unlimited-practice documentation describes historical behavior and is superseded by this policy.
