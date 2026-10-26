# VisaAtlas operating procedures

## Current status and owner decisions

The code supplies a database-aware `/healthz`, owner-only seven-day operation counts, an `AI_ENABLED=false` emergency pause, and student data export. CI tests a **synthetic** PostgreSQL dump/restore. These do not prove production backups, automatic alerts, or billing caps are enabled. Production database provider, plan, recovery window and last successful backup must be verified in the hosting account.

No paid service or new storage provider has been purchased. No inactive student records are automatically deleted by this change. Existing guardian permission expiry and provider retention remain as disclosed.

## 1. Production backup verification and recovery

1. In Render, identify the actual database used by the web service, without copying its connection secret into chat. If DATABASE_URL points to a different provider, use that provider's backup console.
2. Record database name, provider, region, plan, backup enabled status, last success and recovery window in the private operations log. Paid web hosting alone does not establish paid database backup coverage.
3. If Render Postgres is paid, inspect its Recovery page and verify a recent recovery point. Free databases do not have the same managed backup coverage. A paid upgrade requires the owner's spending decision.
4. Restore a selected recovery point into a **separate** test database. Do not overwrite production or change its connection string during a drill. A restored copy contains private information: restrict access, disable outbound emails and AI calls, and never expose it as a public test site.
5. Check users, profile relationships, learning notes, reports, credential rows and authentication flows with an approved test account. Record date, backup age, restore duration and result, without student content or secrets. Do not send real reset/guardian emails from restored data.
6. Before any real recovery cutover, freeze writes, preserve the current state, compare recovery time to the incident, and reapply deletions/permission withdrawals since the backup. Restoring a backup must not silently reinstate deleted accounts or revoked permission. Retain a separate restricted incident/deletion log sufficient for this review; this repository is not that log.
7. Remove the restored test database after review through the provider's approved deletion process. Do not retain downloaded backups on laptops or commit them to GitHub.

CI's `backup-restore-drill.sh` uses synthetic account/report/note/credential data inside the disposable postgres service, dumps it, removes only its test schema, restores it, and verifies values. It validates the technique, not production recovery coverage.

Official reference: https://render.com/docs/postgresql-backups

## 2. Monitoring and AI cost controls

- Set the Render web service health-check path to `/healthz`. It returns 200 only when PostgreSQL answers within the query timeout, otherwise a generic 503. It exposes no configuration or credentials. Database connection/pool acquisition can still add latency; configure an external monitor timeout.
- Enable provider deployment/service alerts for the owner's chosen destination. An external uptime monitor must be separately configured for outage notifications; the app cannot notify anyone while it is down.
- Owner dashboard → Service health and usage shows counts of successful requests, rejected requests (4xx), and service failures (5xx) for selected operations over seven UTC dates. Aggregate counts retain 31 UTC dates (today plus 30 prior dates). They contain no names, emails, tokens, audio, transcripts or request bodies. Writes are best-effort, so counts are not a billing ledger.
- `[operations] SERVICE_FAILURE` and `METRICS_WRITE_FAILED` are fixed log codes. Configure host log alerts if supported. This change does not subscribe anyone to an alert service.
- Voice starts and report requests are useful activity signals, **not dollars**. Check the actual OpenAI project Usage and Limits screens. Determine monthly budget and alert recipients with the owner. Verify whether each setting is an alert threshold or an enforced spending cap in that account; do not assume an alert blocks charges.
- Emergency: set `AI_ENABLED=false` in the web service environment and deploy/restart. This rejects NEW tutor/mock connections and report requests while saved work remains accessible. Existing voice calls continue until ended or their normal limit. Set `AI_ENABLED=true` (or remove the flag) to resume. This switch is not a dollar budget.
- If email failures rise, inspect Resend's delivery events without publishing recipient addresses. HTTP counters cannot detect a later bounce or every swallowed/background send failure.

## 3. Privacy request handling

Support inbox: support@visaatlasprep.com. Account security provides password-confirmed student export and deletion. Never ask for the user's password or identity documents in email/chat.

For each request, keep a private support ticket with receipt date, request type, minimum account reference, verification result, owner, next action, applicable response deadline, completion date and a short outcome. Do not copy transcripts or full exports into the ticket.

- **Copy/access:** direct signed-in students to Download my data. For additional records, verify ownership via the registered account/email and review whether third-party information needs redaction. Deliver securely; do not send exports to a new address based only on an email request.
- **Correction:** direct students to My Profile. Handle records they cannot edit only after verification, documenting the correction without unnecessary old personal content.
- **Deletion:** direct students to Delete my account. For support-assisted requests, verify the requester and use a reviewed account-specific deletion procedure. Do not mark complete merely because a ticket was opened. Track provider/support-message requests separately from active database deletion.
- **Guardian withdrawal:** promptly acknowledge, match the request to the guardian permission record, and verify control of the recorded guardian email through a fresh confirmation. A matching typed address alone is not verification. Do not disclose student details before verification. Once verified, stop future processing/access for the affected minor through a reviewed admin change, invalidate active sessions, and arrange deletion or a justified retention exception. Use Owner dashboard → Accounts → Guardian withdrawal for a student with recorded permission. Confirm the verified request, type WITHDRAW, and enter your current owner password. This invalidates sessions and pauses student sign-in and new student activity. An active voice session/report blocks the action: ask the student to end it, wait for completion, and retry; do not report withdrawal as completed before success. Records are preserved. Legacy accounts without recorded permission and data deletion/export for suspended users still require a separately reviewed support operation. Staff must stop using the student’s records for preparation after withdrawal; owner access remains available for handling privacy requests. Explain what was done and what remains in provider backups/logs.
- **Under-13 report:** treat as urgent, verify enough to identify the account, stop further use through a reviewed admin change, and arrange removal. Do not ask the child for extra personal documents to investigate.
- **Incident:** restrict the affected access, preserve minimum useful evidence, investigate scope, and determine notification duties for the affected jurisdictions. Avoid broad promises about deadlines not yet verified.

## Retention decisions to approve before automation

Proposed operating choices, NOT a published promise or enabled deletion job:
- Inactive student accounts: consider review after 12 months without activity, give 30 days' notice, and offer export before deletion. This needs a reliable last-activity field, notification delivery, guardian handling and a tested cleanup job.
- Support correspondence and completed privacy tickets: choose a documented period appropriate to the actual purpose and applicable obligations; do not store indefinitely by default.
- Backups: use the verified provider recovery window; avoid extra unmanaged copies. Document when deleted data ages out and how deletions are reapplied after recovery.
- Guardian pending requests: their links expire after 24 hours; current code purges expired requests lazily during later permission API activity. Do not describe this as guaranteed deletion exactly at 24 hours.

References reviewed: Render backup documentation and the existing LEGAL_REVIEW.md sources. These procedures do not establish complete legal compliance. Confirm market-specific deadlines and retention exceptions for actual requests.
