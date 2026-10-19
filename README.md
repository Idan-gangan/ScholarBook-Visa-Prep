# VisaAtlas

VisaAtlas helps students prepare for U.S. F-1 visa interviews through six learning modules, voice tutoring, adaptive mock interviews and readiness feedback. Website: https://visaatlasprep.com

Readiness feedback measures practice performance, not visa eligibility, approval probability or a guaranteed outcome. The service is running a tester pilot; this README is not a production-security certification.

## Student experience

1. Register with a name, accessible email and a private password of 15–128 characters.
2. Verify the email before voice practice and reports.
3. Save the study profile. Required mock-interview fields are defined in public/profile-requirements.js.
4. Work through six modules. Notes are optional. The tutor uses the supplied profile and lesson context.
5. Start a Standard, Challenging or Intensive voice mock. Questions should follow the student's answers; coaching belongs after the interview.
6. End the mock, select View my feedback, review the saved readiness report, and revisit suggested lessons.

Profiles support high-school, undergraduate, master's and PhD paths, including incoming students and transfers. Athletic context is used when relevant.

## Current implementation

- Node.js HTTP server with PostgreSQL via pg. app_state holds core JSONB state; credentials, learning progress, usage and recovery jobs use additional tables.
- The bundled data/db.json is a seed for a new database, not the live persistence store. Existing state is not replaced on startup.
- Scrypt password hashes, legacy credential migration, password recovery, email verification, ownership checks and Owner-controlled roles.
- Published original demo password is rejected by password verification. This is not evidence that live demo accounts have been inspected or deleted. Recover legitimate accounts through password reset; do not restore shared passwords.
- Sessions are kept in server memory and expire after eight hours. Restarting signs users out; multi-instance session handling has not been implemented.
- Browser microphone audio uses WebRTC with OpenAI. API keys stay on the server.
- Daily tutoring, mock and report attempts are unlimited. Session limits remain eight minutes for tutoring and twelve for mocks. Report generation has a single in-flight lease per account.
- Reports use the configured evaluation model and saved mock transcript. Areas not assessed should not be penalized or presented as established weaknesses.

## Voice and data handling

Before each voice session, the UI explains the mode's processing and requests confirmation before accessing the microphone. Cancel starts no voice connection. This is a client-side notice, not a persisted consent record or server-enforced consent policy.

Audio is sent to OpenAI for live processing/transcription. No application audio/video recording or recording-file storage path was found in this code review. This does not make a claim about provider-side retention.

Tutoring conversation text is held in the browser and is not saved by the tutoring flow. Notes explicitly saved by the student are stored. Mock-session transcripts are saved when an answered session ends; report generation also saves a transcript and report. Student profiles, reports and learning progress persist in PostgreSQL. The evaluation request sets store:false; this must not be described as a guarantee of zero provider retention.

Students are restricted to their own records. Owner, Coach, Supervisor and Manager are staff roles with broad student access. Owner assigns roles; Coach and Supervisor can also add human reviews. Role and voice-access changes have bounded audit entries. These are not comprehensive logs of every read, login or administrative action.

Do not submit passport numbers, DS-160 contents or private financial documents. A documented retention/deletion process, operator privacy policy, provider settings review and hosting encryption/backups verification remain operational work. See PILOT_AND_REVIEW.md.

## Development and deployment

See DEPLOY.md for configuration. No shared demo login is provided.

Install dependencies with npm ci and start with npm start after configuring a disposable PostgreSQL database for local development. The package requires Node.js >=20; choose a currently supported release compatible with the hosting environment.

Unit checks: node --test test/*.test.cjs

These tests use mocks for database/provider behavior. test/postgres-state.cjs and test/postgres-recovery.cjs require an explicitly configured disposable TEST_DATABASE_URL; never point integration tests at the production database.

## Remaining acceptance work

- Confirm the deployed version rejects the published demo password; review and disable unneeded legacy accounts without deleting legitimate student data.
- Verify email delivery, mobile microphone permission/cancellation, saved profiles, reports and account isolation on staging and deployed devices.
- Run the six-tester plan and professional scoring review in PILOT_AND_REVIEW.md.
- Decide the retention/deletion policy and whether durable consent records and narrower staff assignments are required; implement and verify those decisions.
- Check database backups/restoration, hosting and provider configuration, concurrency and usage costs before making scale claims.
- Remove unwanted GitHub collaborators and restrict repository visibility through an authorized administrator; verify Render still has repository access.

Historical markdown files describe earlier milestones and may contain superseded quotas or setup details. Current code and this README take precedence.

