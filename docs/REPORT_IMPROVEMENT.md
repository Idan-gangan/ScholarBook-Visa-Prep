# Evidence and focused practice

## Student behavior

Incomplete reports now display coverage and, when sufficient evidence exists,
answered-topic quality. They do not display an overall interview score. Complete
reports retain the same seven-topic arithmetic. New reports use
`coverage-separated-v2`; old stored scores are not migrated. API presentation,
dashboard/history, PDF and print views hide historical incomplete overall scores.

Reports show the original question and transcribed answer behind an assessment.
New reports preserve these excerpts with the report so the 30-day mock-session
cleanup does not remove their evidence. Historical reports use their source mock
when still available. No evidence is invented for older reports without a source.

For a supported improvement point, students can submit a written answer to the
same question. The AI compares only that point with the original answer and
returns improved / needs work / unclear, an explanation and one next action.
This is written practice, not spoken-delivery assessment, mastery certification,
or a visa prediction. The original report's scores never change. Students can
also open the existing voice tutor lesson. Written attempts are saved with their
report and included in account export/deletion; PDF downloads remain the original
mock assessment. The web report shows the written practice history separately.

## Controls

- Student-only, own-report authorization, verified-email gate and AI pause switch.
- Evidence chosen by server from the report and matching student's source session.
- 10–2,000 characters; at most ten saved attempts per question (three focuses).
- One shared evaluation lease per user, 45-second provider timeout, bounded output.
- Exact answer retries reuse a saved result; duplicate requests never append twice.
- Permission/suspension checks again inside the final transaction.
- Invalid/truncated provider output is not saved; lease is released for retry.
- AI usage recorded as `practice`, without logging answers or prompts in diagnostics.
- All student/model text escaped; original excerpts and retry text are not machine
  translated by the page. Feedback follows the report's selected language.

## Validation / limits

Run `node --test test/*.test.cjs`. CI also runs existing PostgreSQL persistence,
concurrency, record-storage, capacity and synthetic backup/restore checks. Added
coverage includes incomplete/full scoring, legacy presentation, evidence isolation,
malformed results, duplicate/concurrent retries, saved-attempt bounds, unauthorized
access, AI pause, failed-output retry, and hostile text rendering.

AI comparison quality still requires human review of representative real-language
examples; mocked-provider tests establish application behavior, not teaching quality.
No checkout, paid allowance, automatic renewal, model switch or pricing change is
part of this release. Full spoken reassessment and automatic daily plans are later
work. The new written comparison is deliberately labeled rather than presented as
an improvement in the original mock score.
