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
