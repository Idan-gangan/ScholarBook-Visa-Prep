# Report generation controls

Each account can start six report attempts per UTC day. A persistent PostgreSQL row enforces the quota and one active request per account across browser tabs, processes and restarts. Failed admitted attempts count. Invalid transcripts, authorization failures, active-request rejections and ordinary completed-report retries do not consume an attempt. A rare concurrent cache hit after reservation may consume one attempt but does not call the provider.

A successful report is keyed by requesting account, student, model and normalized transcript (timestamps ignored). Repeating it returns the saved report. Changed profile data alone does not regenerate that transcript; complete a new interview for updated feedback. If the provider succeeds but saving fails, a later retry can call it again; this is not exactly-once billing.

The provider request has a 90-second timeout and a 4,096 output-token cap, including reasoning tokens. Incomplete responses produce an error rather than a partial report. Transcript input is limited to 200 turns and 40,000 characters and must contain a student answer. Extra transcript fields are dropped before sending. The provider storage flag is false. There are no automatic retries.

A crashed worker's admission lease expires after 180 seconds. Releases are matched to an opaque token so an older worker cannot release a newer lease. Lease expiry is a recovery mechanism, not an absolute guarantee against overlap if processing stalls past expiry. Client abort/timeouts do not guarantee cancellation of provider-side computation or charges.

New table: evaluation_daily_usage, created during startup. No existing data is deleted. The report button explains daily limits; duplicate clicks in the same page are ignored while processing. Existing voice limits are unchanged.

## Verification

Local route tests cover quota exhaustion, transcript limits, cached retries, busy rejection, timeout recovery and provider request settings. The PostgreSQL CI test races 20 reservations through two pools, checks one admission, exhausts quota, verifies persistence across limiter recreation, simulates the UTC date change and lease expiry, and checks stale-token release fencing. Require CI to pass before merge. No paid provider calls were made; report quality under the new token cap still needs a live smoke test.

## What this does not promise

This is not a dollar budget cap. There is no global spending ceiling, email verification to prevent multiple-account abuse, usage-cost dashboard or provider-billing reconciliation yet. Quotas apply to staff as well as students. Input character limits are not token counts. The model and its pricing remain unchanged.

API reference: https://developers.openai.com/api/reference/cli/resources/responses/methods/create
