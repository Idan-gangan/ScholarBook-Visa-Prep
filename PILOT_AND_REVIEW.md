# VisaAtlas pilot and operational review

## Six testers

The assignments below are proposed fictional test scenarios, not claims about the testers' real education, funding or visa history. Keep each scenario consistent. Use each tester's own email and private password; do not share logins. Accounts have not been created because email addresses have not been supplied.

| Tester | Assigned fictional scenario | Particular checks |
| --- | --- | --- |
| Ezuruike Augustine | Incoming undergraduate athlete with an athletic scholarship | Incoming tense, sport context, confirmed scholarship coverage |
| Ruqqayah Kemi Mustapha | Incoming master's student, family funding, changing subject | Previous bachelor's education and reasons for the new program |
| Pamela Peter | Incoming PhD student with research/teaching assistantship | Research interests, academic fit and funding details |
| Sarah Lori | High-school study scenario with family funding | High-school wording rather than university assumptions |
| Oseiwe Ahusimenre Salami | Undergraduate transfer, partial scholarship and one previous refusal | Transfer status, remaining costs, refusal follow-ups |
| Purpose Excellence | Incoming non-athlete undergraduate, undecided future plans | No invented career plan, no athletic assumptions, honest uncertainty |

## Each tester's complete run

1. Register and verify email. Check delivery/spam, resend and a mistaken email correction.
2. Complete My Profile. Select home/calling/interview countries; verify flags and calling codes. Enter the appointment city or Not booked yet. Save, reload and verify values persist.
3. Open each of the six learning modules. Check the reading and examples fit the assigned study level.
4. Start a tutor session. Cancel the voice notice once: no microphone request or connection should start. Try again, accept, allow microphone access, ask a question, practise and end the session.
5. Finish a lesson with blank optional notes, then with saved notes. Verify completion and notes after signing back in.
6. Take a Standard mock. Check the AI identity disclosure, clear turn-taking and follow-ups tied to actual answers. No coaching during the mock. Try an unclear answer and an audio-check question; the interviewer should clarify rather than invent a name, date or fact.
7. End the mock and choose View my feedback. Confirm the report reflects what was said. Unasked topics should not be marked incorrect. Incomplete evidence may produce no numeric score.
8. Open Readiness Reports, use a practice link and check Dashboard.
9. Repeat the mock with different answers. Try Challenging and Intensive. Check natural variation and appropriate additional follow-ups, not just a shuffled fixed script.
10. Sign out/in, recover the password, and check saved data. Use phone and desktop where available.
11. Report bugs with device/browser, page, steps, expected/actual result and a redacted screenshot. Do not send passwords or verification/reset links.

Stop and contact the owner if another student's information appears. Use only operator-approved synthetic accounts for cross-account testing.

## Professional feedback review

Efe-Sam and designated visa-preparation reviewers should independently review sample transcripts and reports across all four study levels, athletes/non-athletes and refusal histories. Compare feedback to actual answers, flag unsupported claims, transcription mistakes, penalties for unasked questions, biased language and any visa-outcome promises. Record disagreements and corrections before claiming the scoring is validated.

## Findings from source review (17 October 2026)

- PostgreSQL persistence and separate credentials are implemented.
- The original demo password could pass the generic legacy hash verifier. This patch explicitly rejects it for both legacy and scrypt credentials. No production login attempts were made.
- No application audio/video recording-file storage path was found. Audio still leaves the browser for OpenAI processing.
- Mock transcripts persist at session end and during report generation; tutor conversation text is not saved by the tutor flow, but user-saved notes are.
- Students have own-record checks. All four staff roles have broad access. Narrow per-coach assignments are not implemented.
- Audit entries cover role/voice-access changes, capped at 1,000, rather than all account and data-access activity.
- The added voice notice asks for confirmation each session before microphone access. No consent record is persisted and API clients can bypass this UI notice.
- Automated retention/deletion policies, verified backups/restores, hosting encryption and provider retention configuration were not established by this review.

## Owner/admin actions still required

- Review live legacy accounts and reset legitimate ones or disable unwanted ones using a controlled account-management process; preserve student data. Do not assume deleting README text disables credentials.
- Confirm the deployed application rejects the published demo password. Do not test guessed passwords or other people's real credentials.
- Name the exact GitHub username to remove. An administrator must remove that collaborator and make the repository private, then verify Render's integration access.
- Supply tester emails if assisted account creation is still wanted. Self-registration is preferable for exercising onboarding.
- Decide and publish the data-retention/deletion policy and a contact for deletion requests. Review processor settings and contracts separately.
- Record actual pilot outcomes and reviewer sign-off. This checklist is preparation, not evidence that the pilot or live security review has passed.
