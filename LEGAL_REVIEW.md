# Privacy and Terms publication review

These pages are proposed policy copy for owner and qualified legal review, not a claim of legal compliance. They deliberately avoid invented company registration, address, refund terms, blanket waivers, arbitration, or a jurisdiction clause.

Remaining operational review:
- Confirm the legal operator: pages identify VisaAtlas and founder Efe-Sam Agalivie, without asserting incorporation. Add a business contact address if required for applicable audiences; do not use a personal address without approval.
- Approve the proposed minimum age (13) and parent/guardian permission for under-18 users. New self-registration has a self-declared age band; under-13 requests are blocked. Ages 13–17 require a separate guardian email approval and explicit authority/permission declarations before account creation. Email access does not verify adult age or the parental relationship. Existing and staff-created accounts are not backfilled. Assess stronger age/relationship assurance for target jurisdictions before representing this as verified parental consent. Do not claim that posting this text provides child-privacy compliance; review Kenya/Nigeria and other target-country requirements too.
- Establish a data request/deletion process and retention schedule, including PostgreSQL app_state, learning_progress, credentials, mock sessions, transcripts, reports, audit/usage records, provider state, logs, backups and the support mailbox. Pages accurately say there is no general automatic deletion schedule. Student self-service deletion removes active application records; provider and backup retention still require operational review. No unverified deletion deadline is promised.
- Verify production database host/regions, Render logs/backups, OpenAI data-sharing and retention settings (Realtime and Responses), Resend retention, and any trackers added outside the repository. No claim of zero provider retention or no model training is made.
- Review applicable lawful bases, international-transfer mechanisms, local representatives and rights notices with counsel for actual audiences. These cannot be established from application source alone.
- Approve the operational commitments: support handles rights requests and material policy changes are communicated. New self-registration requires an unchecked Terms checkbox. The server validates explicit acceptance and the current Terms version, then records version, server timestamp and source with the user in the account transaction. Existing users and staff-created accounts are not backfilled. This is not age verification or voice consent.
- Pricing/refund/cancellation policies remain to be defined before any paid offering. The Namecheap mailbox subscription is not a student pricing plan.

Verified from code: 8-hour essential sb_session cookie; password hashing; role/assignment access; OpenAI audio/profile processing; saved mock transcripts/reports; tutor conversation not persisted; saved notes persisted; Resend verification/recovery; PostgreSQL storage. Namecheap support inbox was verified in setup.

Sources consulted October 25, 2026:
- https://www.ftc.gov/business-guidance/privacy-security
- https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions
- https://developers.openai.com/api/docs/guides/your-data

Validation: run existing learning UI and voice consent tests and check public policy links. Terms acceptance tests cover rejected requests and saved acceptance records.

Guardian flow: temporary email requests expire after 24 hours, are lazily purged on permission API use, and consumed requests are removed during registration. Approval version: 2026-10-25-v1. Permission withdrawal remains a verified support process, with a password-confirmed owner control to suspend accounts with recorded guardian permission. It is not guardian self-service, automatic deletion, or independent relationship verification. Do not claim automated withdrawal or complete child-privacy compliance. Sources: https://www.odpc.go.ke/wp-content/uploads/2025/11/ODPC-%E2%80%93-Guidance-Note-for-Processing-Childrens-Data.pdf and https://cert.gov.ng/ngcert/resources/Nigeria_Data_Protection_Act_2023.pdf
