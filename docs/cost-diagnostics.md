# Cost measurement pilot

This release adds diagnostics only. It does not enable checkout, change access,
replace the voice model, or impose the proposed 120-minute allowance.

Owner > Service health and usage > Refresh service activity shows the latest
30 days. Empty data means no samples yet, not zero operating cost.

Voice response.done counters are deduplicated in the browser. Numeric totals are
sent with the existing authenticated end-session request. They can be altered by
a client, lost on abrupt closure, or omit an in-flight final response. They are
never suitable for charging customers. The server records connected starts,
caps observed connection duration at eight minutes, and finalizes each sample
once. Missing or inconsistent token details leave the dollar estimate unknown.
Input cached audio/text are subtracted before applying uncached rates.

Realtime 2.1 reference rates checked 2026-10-28 (USD/million): audio input 32,
audio output 64, text input 4, text output 24, cached input audio/text 0.40.
https://developers.openai.com/api/docs/pricing
https://developers.openai.com/api/docs/guides/voice-latency-cost

These are partial voice estimates: transcription, report generation, hosting,
payment fees, tax and support are excluded. Report and evidence-review response
usage is recorded directly from the provider before content validation, so paid
malformed/incomplete responses remain visible. Model names and input/cached/output
tokens are retained; dollar rates for the configured report model are deliberately
not guessed. Network failures with no returned usage cannot be priced here.

Rows contain hashes of session/response identifiers, category, model, numeric
usage and timestamps, never names, raw user IDs, prompts, audio, transcripts or
session tokens. New records also contain a one-way SHA-256 hash of the random
student profile ID for Owner-only student-level cost sampling. Mock voice and
report records share a hashed session grouping; older linked mock sessions may
be assigned to a student using retained reports, but earlier tutor usage cannot
reliably be reconstructed. These sampled costs are never suitable for charging
students or described as a complete bill.

Old rows are cleaned on subsequent recordings after 30 days; backups follow the
existing database backup policy. Verified account deletion also purges new
student-linked rows and older linked mock/report diagnostic groups. Metrics
writes fail without failing practice. The diagnostics read endpoint is part of
the existing owner-only operations route. The student analytics endpoint uses
existing saved learning and report records and returns aggregate progress and
cost coverage without notes, transcripts, prompts or raw responses.

## Pilot decision

Collect normal completed tutor and mock sessions, including reports, across the
supported languages and different speaking patterns. Inspect sample coverage;
do not divide partial estimates by all session starts. Reconcile with the OpenAI
project's actual usage/cost export for the same UTC period and model. Exclude
unrelated testing. Obtain the report model's verified rates before a full estimate.

Then calculate a high-use 120-minute package with the observed tutor/mock mix and
report count, plus payment fees, hosting allocation, support and a retry buffer.
$29/30 days and the Scholarbook discount remain proposals until this calculation
is complete. No profitability figure is asserted by this release.
