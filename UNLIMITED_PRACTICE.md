# Unlimited daily practice

All accounts now have unlimited daily tutoring starts, mock starts, successful reports and report-generation attempts. Existing daily usage counters are retained for observation, but do not block admission. API responses use `unlimited: true` and `null` for limit/remaining values, never a large fake allowance.

Tutoring retains its 480-second session duration; mock interviews retain 720 seconds. Provider token limits, transcript limits, timeouts and server-side call-expiry cleanup remain. Reports retain a database-backed single in-flight lease per account and cached completed-report behavior. Authentication/access checks remain. There is no new server-side concurrent voice-session limit in this change.

Owner tester controls are no longer displayed because everyone has the same unlimited daily allowance. Legacy tester flags/endpoints remain compatible but do not change the unlimited policy. No data deletion or schema migration is required.

This removes daily spending ceilings: more use can increase AI charges without a daily account cap. Monitor provider billing and usage. Provider service/rate limits can still interrupt requests.

Validation includes repeated starts/reports beyond previous caps and preservation of usage counts. Disposable PostgreSQL integration and live-provider voice testing must be run separately; unit tests mock database behavior.
