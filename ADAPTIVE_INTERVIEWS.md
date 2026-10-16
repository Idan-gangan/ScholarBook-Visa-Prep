# Adaptive mock interviews and evidence reports

Standard is the default. Challenging and Intensive increase follow-up depth, not language complexity or scoring standards. All modes remain interview-only: teaching and corrections belong in tutoring or post-interview feedback.

New sessions capture the interview-relevant profile at start. They receive the same student's last three saved sessions' interviewer questions (at most 24), with a variation cue. No previous answers are used for grading. Questions may still repeat when necessary; variation and topic coverage are model instructions, not guarantees.

The interviewer is instructed to cover relevant main topics, follow current answers, distinguish application counts from refusal counts, and neutrally clarify inconsistencies. It ends with a fixed closing sentence. The browser waits for response completion and audio playback to finish, stops the microphone, and focuses View my feedback. Manual stop remains available.

Ending a mock saves its first submitted transcript without generating a paid report. Existing session ownership/access checks apply. Saved transcripts remain subject to the existing mock-session retention cleanup. No phone or email is added to the interview snapshot.

Version 3 reports require transcript turn references for assessed topics and strengths. Invalid references/schema fail validation. Semantic relevance still depends on model judgment and needs real-session evaluation. Unasked topics are marked Not covered and do not become weaknesses. An overall score requires all relevant main topics and at least four distinct student answer turns; otherwise the UI says Not enough information to score. Priority, next step and practice lesson derive from the same assessed point.

Version 3 uses equal topic scoring with common anchors across modes. These scores are not directly comparable with the older report rubric. Existing reports and sessions already started under the legacy evaluator retain their previous behavior. No quota or database-schema change is introduced here.

Desktop/mobile browser smoke checks were attempted but could not run because local Chromium failed graphics initialization. Visual verification remains outstanding.

Validation: 120 automated tests cover evidence validation, null scores, mode selection, profile snapshots, session ownership, recent-question scoping and both audio/response completion orderings. Live-provider conversations have not been tested; after deployment, test each mode, early termination, repeat sessions, previous-refusal profiles, inconsistent dates/funding and voice transcription errors before broad rollout.
