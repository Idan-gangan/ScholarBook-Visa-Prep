# Visible practice language choices

Draft implementation; not deployed.

Learning displays a prominent “Learn in your language” card. Mock setup displays
“Choose your practice language” with separate interview and feedback selectors.
Initial choices: English, French, Spanish, Portuguese, Arabic and Swahili, with
native-language names. Navigation and static lessons remain English. The interface
explains that embassy language availability is not guaranteed.

The server accepts only allowlisted language codes, defaults legacy clients and
sessions to English, and binds interview/feedback languages to the mock session.
Reports reuse that saved choice, including retries. Voice controls lock during a
session. Mock closing detection uses the corresponding localized sentence.
Feedback must retain JSON identifiers and assess meaning in the practice language,
not imply an English proficiency assessment.

Validation (2026-10-28): 211 unit/API/UI tests pass with
`node --test test/*.test.cjs`. Includes provider prompt propagation, immutable
report language selection, localized voice closures, print-export authorization,
HTML escaping, and conversation direction. UI test fixtures now stop their voice
timers after each test rather than leaving the test process running.

Chromium QA with synthetic API fixtures: complete Learning, Mock Interview and
Reports screens at 320, 390, 768 and 1280 pixels; no horizontal overflow or page
JavaScript errors. Six options and touch-sized controls verified. Arabic and mixed
script text rendered with automatic direction. Arabic print output was generated
with Chromium and visually inspected. This is not an actual iOS Safari test.

Found and fixed: PDFKit's word wrapping scrambled Arabic word order. Arabic reports
now open an authenticated, uncached print-ready page; browser Print / Save as PDF
preserves bidi shaping. The legacy /pdf URL also serves this page for Arabic.
Other languages retain their ordinary PDF download. Headings, standard score
messages and navigation remain English; generated narrative uses the chosen language.

Remaining release gate: actual microphone/provider testing for tutor and mock in
all six languages, including recognition, closing and generated feedback. No API
key or connected test deployment is available in this workspace. Synthetic tests
verify wiring, not pronunciation or real-provider behavior. No production AI calls,
merge or deployment performed. Session durations, pricing and allowances unchanged.
