# Voice cost safeguards

This release keeps the current model and automatic speech/noise handling.

- Teaching prompt: 2–3 sentences, normally 25–45 words; direct follow-ups 1–2 sentences. This is guidance, not a guaranteed word count.
- Default Realtime response output limit: 1,024 tokens for teaching, 512 for mock questions. Audio tokens are not words; verify natural speech is not cut off in live testing.
- Voice duration: 8 minutes for learning, 12 minutes for mocks. Browser warns one minute before stopping and leaves transcripts in the page for review/report generation. Notes still need saving.
- Six voice-start attempts per signed-in account per UTC day, shared between learning and mocks. Staff have the same limit across students. Failed upstream attempts count; invalid/unauthorized requests do not. No automatic retries create additional calls.
- Atomic PostgreSQL admission counter survives refresh, restart and multiple app processes. This is per account, not per person: new-account abuse is not solved here.
- Call IDs/deadlines persist separately. A server sweep every 15 seconds requests provider hangup for expired calls, including after restart; failures remain queued for retry. No transcript/audio is saved in these tables. Already closed calls are removed after provider success/404/410.

## Deployment

Two additive tables (`voice_daily_usage`, `voice_call_limits`) are created at startup; existing student data and credentials are unchanged. No new dependencies, API keys or environment changes. A database backup is still recommended before deployment.

## Verification

Run `node --check server.js`, `node --check voice-limits.js`, and `node --test test/*.cjs`.
Automated tests use simulated DOM, HTTP/provider and database behavior, not live PostgreSQL or paid voice calls.
After deployment, test a short lesson, a mock, warning/deadline behavior, natural sentence endings, and a seventh start on a dedicated test account. Check that expired-call rows are cleared and no CALL_EXPIRY_RETRY/CALL_EXPIRY_CHECK_FAILED logs persist. Use a test environment to verify expiry after restart without disrupting students.

## Boundaries

This is NOT a hard dollar budget. The browser directly holds a WebRTC data channel and could override session defaults. Token limits here are defaults, not tamper-proof per-response enforcement. Server hangup depends on the application, database and provider being available; an outage, backlog, or a crash between upstream call creation and persistence can delay termination. A provider timeout or missing call ID can leave a call whose ID the app cannot recover. Never claim an exact maximum bill from these controls.

Report-generation costs are unchanged. Future work: account verification/abuse controls, authoritative usage metering, overall spending enforcement and Realtime sideband monitoring. Keep provider spending alerts enabled separately. Avoid rolling back while calls are active, since older code will not sweep stored deadlines.

API references checked: https://developers.openai.com/api/reference/resources/realtime/subresources/calls/methods/create and https://developers.openai.com/api/reference/python/resources/realtime/subresources/calls/methods/hangup .
