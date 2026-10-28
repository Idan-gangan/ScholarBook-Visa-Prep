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

Validation: 86 focused tests pass (voice lifecycle, translated closures, prompt
validation, interview design, learning UI and language request propagation).
Before release: visually inspect desktop/mobile controls, run actual tutor and
mock sessions in each language, verify recognition and closing, and review narrative
feedback and downloaded PDFs (especially Arabic shaping/direction). Browser QA in
this environment was blocked by unavailable Chromium and a failed browser download.
No production AI calls or deployment were performed. Session durations, pricing and
usage allowances are unchanged by this branch.
