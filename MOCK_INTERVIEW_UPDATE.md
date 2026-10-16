# Mock interview and practice allowances

This update separates learning from assessment. Tutoring keeps its teaching instructions. Mock interviews ask one concise question at a time, follow up on actual answers, and defer coaching, corrections and scoring until the report. The mock prompt identifies the system as AI and prohibits impersonating a real official or announcing a visa decision. It aims for 8–12 substantive questions, within the existing 12-minute session cap. The student ends the session when the interviewer closes; the time cap also ends it automatically.

## Daily allowances

| Account | Tutor starts | Mock starts | New reports |
| --- | ---: | ---: | ---: |
| Standard | 12 | 6 | 6 |
| Owner-enabled tester | 18 | 18 | 6 |

Tutor sessions remain capped at eight minutes. Connection attempts still use one start even if the provider fails. Microphone permission rejection occurs before server admission and does not consume a start. All counters reset at midnight UTC; the UI shows the reset in the user's local time. Lessons, notes and existing reports remain accessible after the allowance is exhausted.

Report generation allows up to 12 provider attempts for a maximum of six saved reports daily. Failed attempts can be retried without consuming the successful-report allowance. Concurrent generations for an account are blocked by a database lease. Saving a report and incrementing its completed counter share the application-state transaction. A stale lease cannot save a new report.

## Session-bound reports

A successful mock connection gets a random server-issued session ID, bound to the authenticated account and selected student. Tutoring does not issue mock IDs. The browser requires the voice conversation to stop before generating a report and prevents starting another session while a report is processing. The first report request freezes that mock's submitted transcript. Subsequent requests reuse the saved report, even if the client changes the transcript. Existing report reading is unaffected. Typed transcript entry has been removed from the interview screen.

These controls bind reports to mock sessions; they do not independently authenticate the content of browser-submitted speech transcripts. Ending an interview early can still produce feedback on the answers actually captured. This is not proof of completing a full interview.

## Interview screen

A fictional AI-generated portrait and a playback indicator accompany the existing audio conversation. The indicator follows actual output-audio playback events and resets on disconnect. Reduced-motion preferences disable its animation. It is a still portrait, not animated video, a real official, or a camera recording. Microphone access remains audio-only.

Asset: `public/assets/ai-interviewer.webp`. Generated using the image-generation tool and converted to WebP for the website. Art direction: fictional adult professional interviewer, calm neutral expression, navy jacket and light-blue shirt, soft blue-white office background; no official seals, flags, badges or text.

## Rollout

- Startup creates `voice_mode_usage`, keyed by account and mode. The previous shared `voice_daily_usage` is retained but no longer used. Existing shared starts cannot be reliably divided by mode, so the first deployment begins fresh separate voice allowances.
- Startup adds `completed` to `evaluation_daily_usage`. Existing attempt counts remain; the new completed counter starts at zero. This can allow extra reports on the migration day.
- Account roles, profile data, learning progress, reports and transcripts are preserved.
- Session metadata and frozen report transcripts use the existing protected `app_state` store. Records older than 30 days are pruned when new mocks start; saved reports remain accessible through Readiness Reports. This pruning does not change existing transcript-storage retention.
- Deploy server and browser changes together. An old browser session has no mock ID: reload the page and start a new mock. Previously saved reports remain accessible.
- No new API keys or environment variables are required.

## Validation

109 automated tests pass, including separate voice quotas, session binding, report deduplication, failed-generation retries, access controls and playback state. Browser checks pass at 1440px and 390px with decoded portrait assets and no horizontal overflow. Browser checks use mocked API responses.

The disposable-PostgreSQL integration test in `test/postgres-state.cjs` is updated for the new SQL but was not run here because no disposable PostgreSQL service was available. Run it only with an explicit disposable `TEST_DATABASE_URL`. Live provider speech, instruction adherence and real connection behaviour were not tested. Before general release, test one tutor lesson, a mock including a request for coaching, report generation/reopening, and the exhausted-allowance states with test accounts.
