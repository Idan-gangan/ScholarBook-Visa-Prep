# Privacy and Terms publication review

These pages are proposed policy copy for owner and qualified legal review, not a claim of legal compliance. They deliberately avoid invented company registration, address, refund terms, blanket waivers, arbitration, or a jurisdiction clause.

Before merging:
- Confirm the legal operator: pages identify VisaAtlas and founder Efe-Sam Agalivie, without asserting incorporation. Add a business contact address if required for applicable audiences; do not use a personal address without approval.
- Approve the proposed minimum age (13) and parent/guardian permission for under-18 users. Registration currently has no age screening or guardian workflow. Do not claim that posting this text provides child-privacy compliance; review Kenya/Nigeria and other target-country requirements too.
- Establish a data request/deletion process and retention schedule, including PostgreSQL app_state, learning_progress, credentials, mock sessions, transcripts, reports, audit/usage records, provider state, logs, backups and the support mailbox. Pages accurately say there is no general automatic deletion schedule or self-service delete button. No unverified deletion deadline is promised.
- Verify production database host/regions, Render logs/backups, OpenAI data-sharing and retention settings (Realtime and Responses), Resend retention, and any trackers added outside the repository. No claim of zero provider retention or no model training is made.
- Review applicable lawful bases, international-transfer mechanisms, local representatives and rights notices with counsel for actual audiences. These cannot be established from application source alone.
- Approve the operational commitments: support handles rights requests and material policy changes are communicated. No automated consent/version audit was added; registration links provide notice, not a recorded clickwrap agreement.
- Pricing/refund/cancellation policies remain to be defined before any paid offering. The Namecheap mailbox subscription is not a student pricing plan.

Verified from code: 8-hour essential sb_session cookie; password hashing; role/assignment access; OpenAI audio/profile processing; saved mock transcripts/reports; tutor conversation not persisted; saved notes persisted; Resend verification/recovery; PostgreSQL storage. Namecheap support inbox was verified in setup.

Sources consulted October 25, 2026:
- https://www.ftc.gov/business-guidance/privacy-security
- https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions
- https://developers.openai.com/api/docs/guides/your-data

Validation: run existing learning UI and voice consent tests and check public policy links. No server/authentication behaviour is changed by this PR.
