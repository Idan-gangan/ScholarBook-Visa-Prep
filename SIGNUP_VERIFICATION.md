# Short signup and email verification rollout

Signup asks only for name, email and password. New users can read lessons and save their profile before verification; starting voice practice and generating reports require a verified address. Existing accounts retain access and are not silently marked verified.

## Deployment requirements

- Run npm install / npm ci for the pinned libphonenumber-js dependency.
- Set RESEND_API_KEY and RESEND_FROM to the existing, verified Resend sender configuration. Never put secrets in source code.
- Set APP_BASE_URL to the canonical HTTPS site origin (no path, query or fragment), for example https://visaatlasprep.com.
- No schema migration is needed: verification state and mail limits use the existing transactional PostgreSQL app_state store.

Links expire after 24 hours, are single-use and are replaced by a resend. Only token hashes are stored. A user can request at most 3 emails per hour with a 60-second cooldown; the service-wide cap is 100/hour. These limits also count failed delivery attempts. An email outage does not delete a newly created account; users can sign in and resend later. Correcting an unverified address requires the current password.

## Profile behavior

Country and calling-code lists cover phone-supported countries/territories. Flag rendering depends on device support. Phone is optional and new/changed values are normalized; unchanged legacy numbers remain intact. Interview country is searchable; city is editable with Nigeria/Kenya suggestions, not a worldwide embassy directory or appointment-availability check. Existing custom locations remain supported.

Funding allows multiple sources. Previous education questions are optional and adapt to the intended degree. Attendance status distinguishes incoming students from students already studying. Users can leave unknown details blank and return later. Do not infer scholarship coverage, sporting achievements or future plans from a category.

## Before merging / live acceptance

1. Run node --test test/*.test.cjs. The separate postgres-state.cjs and postgres-recovery.cjs suites require an explicit disposable TEST_DATABASE_URL; never point these at production.
2. Check registration, verification banner and profile on desktop and mobile.
3. Test with an inbox you control: receive the email, open the link, press Verify email, return and refresh verification status. Check spam too.
4. Confirm expired/replaced links fail, the newest link succeeds once, and email correction uses the new address.
5. Confirm existing accounts still sign in. Confirm a new unverified account cannot start voice or generate a report and can do so after verification.

Local automated tests use mocked email delivery; they do not demonstrate production deliverability. Real-inbox verification remains a deployment acceptance step. Do not advertise email verification as live until that step passes.
