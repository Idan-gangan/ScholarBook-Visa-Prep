# VisaAtlas learning course

Six modules share their content between the browser and learning tutor in `public/curriculum.js`:

| Module | Mock topic coverage |
| --- | --- |
| Your study plans | U.S. choice, university comparison, major and learning goals |
| Your academic journey | School/degree dates, results, activities, gaps, graduate progression and changes of field |
| Your funding | Award process, exact coverage, total costs, remaining expenses, sponsor and sources of funds |
| Your future plans | Actual goals and the degree's role; uncertainty without invented promises |
| Your circumstances | Refusals and real changes, school changes, start dates/late arrival, relevant sport/recruitment history |
| Interview practice | Direct answers, varied follow-ups, consistency, clarification and weak-area review |

Coverage was compared with the mock prompt and Nigeria/Nairobi question topics. This content teaches communication and preparation; it does not introduce immigration policy advice or approval predictions.

Each module has an explanation, teaching points, an example, three guided notes, practice questions, a draft and reflection. Text lessons are available without starting voice. Voice starts retain the existing account-wide daily limit and eight-minute tutor cap. The selected module is validated server-side and supplied to the tutor. Instructions require concise teaching before optional practice, skip irrelevant branches, and distinguish unknown facts from negative answers. Generated speech still needs a live listening check.

Progress continues to use the existing `(student_id, lesson_id)` key. The original `study-purpose` ID and note fields remain intact, so saved work is preserved; completion of that original lesson represents one of six modules. New modules use separate rows. No migration or environment change is needed. Staff/student authorization remains the same.

Validation: run `node --test test/*.test.cjs`. Tests cover separate module saves/reloads, continuing to the first unfinished module, selected tutor context, unknown module rejection, cross-student access, unsaved-note confirmation and microphone shutdown on module changes.

After deployment, check desktop and mobile layout, complete/reload a module, and listen to one short tutor session in Academic journey or Funding. Confirm it teaches the selected content and moves to its next point when asked. No live provider session or production data is used by automated tests.

## All F-1 study levels

Registration and profiles offer High school, Undergraduate, Master’s, PhD / Doctorate, and Other. Existing free-text values are retained. Legacy undergraduate year names resolve to undergraduate; ambiguous Graduate values remain unspecified until clarified.

The shared curriculum provides level-specific guidance in all six modules and high-school/PhD practice questions. The same academic-path instructions are sent to the tutor, mock interviewer, and report evaluator. Student-facing roles and labels use Student. Internal athlete role values, endpoint names, IDs, and stored data remain compatible; no migration is needed. Athletics remains optional and must be established by the profile or conversation. No eligibility rules are introduced.

After deployment, select High school or PhD / Doctorate in My Profile, save, and check the matching lesson questions and a fresh voice session. Live generated responses still require verification.

## Teaching with examples

The voice tutor now pairs each teaching point with a short first-person example before optional practice. Examples use supplied facts or explicit placeholders; level-specific patterns cover high school, undergraduate, master’s, PhD, and relevant athletic funding. An incomplete attempt gets specific feedback and a revised example before moving on. “Next” continues teaching without requiring an answer. Target turns are 35–65 words so the explanation and example fit together. Live generated speech still needs a listening check for brevity, factual grounding, and useful feedback; automated tests verify session instruction wiring, not model compliance.
