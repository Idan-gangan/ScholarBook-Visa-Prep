# Launch readiness — 26 October 2026

This is an evidence checklist, not a certification. The new guardian control is not live until this branch is merged and deployed.

## Checked in this change

- Live homepage and registration UI inspected in a desktop cloud browser. Under-13 selection disables registration; teen selection exposes a separate guardian email field. No live account or email was created.
- Owner-only guardian withdrawal: password recheck, explicit verification attestation and WITHDRAW confirmation; recorded minors only; no student records deleted. Credential version increment invalidates sessions across instances. Admission checks reject suspended users under the application state lock.
- Active voice/report work blocks withdrawal with an explicit retry message. Support must not claim completion until success.
- Existing local suite plus withdrawal unit tests pass. CI now includes the standalone PostgreSQL voice-admission test previously omitted from the workflow.

## Required before broad launch

| Gate | Remaining evidence / decision |
|---|---|
| End-to-end student journey | Run a disposable student from registration and inbox verification through all six lessons, voice tutor, mock interview, report, recovery, export and deletion. Repeat voice on a real iPhone/Safari and desktop. Public-page checks and unit tests do not replace this. |
| Guardian journey | Test delivery/approval/decline, then verified withdrawal with a dedicated test minor account; verify old session and fresh sign-in rejection. Test export/deletion through the support procedure for a suspended account. Do not use a real child’s account. |
| Existing accounts | Review legacy and staff-created accounts that have no recorded age/Terms declaration; never invent or backfill consent. |
| Retention | Owner selected 24 months of student inactivity on October 26, 2026; use a 30-day warning and cancel deletion on renewed activity. Activity tracking, warning delivery and safe cleanup still need implementation. Support-ticket retention remains undecided. Automatic deletion remains off; no active data removed. |
| Minor-user requirements | Qualified review for actual launch countries, including whether email attestation suffices, appropriate notices and guardian rights. Code changes do not establish this. |
| Provider settings | Confirm provider retention/sharing/regions and contractual arrangements in actual Render, OpenAI, Resend and email accounts. Record evidence without credentials. |
| AI continuity | Prior conversation reports $100 monthly enforced cap and auto-reload off; current credit has not been rechecked in this change. Ensure sufficient credit; a cap does not supply credit. |
| Capacity | Controlled staging load test against expected concurrent users, with fake data and mocked AI/email; do not load-test the production service or incur AI costs without a defined test budget. No claim of 500 simultaneous users. |
| Payments | No payment system or paid student offering introduced. Agree prices, usage allowances, cancellation/refund rules before charging students. |
| Launch scope | Start with an invited pilot after the above relevant checks. A broad all-age, multi-country launch requires the unresolved privacy decisions. |

## Previously reported operational evidence

Earlier work reported successful production recovery into a separate copy, basic record checks, copy cleanup, `/healthz` enabled, and a $100 OpenAI cap. Those account settings were not independently reverified in this code change. Do not treat an old credit balance as current.

## Rollback

Do not remove the suspension checks after any real withdrawal without preserving enforcement. A rollback to older code would ignore `accessSuspended`. Keep an incident record and ensure restored backups reapply withdrawals and deletions before reopening access.
