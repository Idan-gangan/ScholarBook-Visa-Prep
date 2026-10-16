# Required interview profile and country selectors

Signup remains name/email/password. Students may save partial profiles and continue learning, but mock voice admission now checks required fields before reserving a voice start or calling the provider. This applies to existing profiles too: their saved data is preserved, but they may need to fill missing fields before their next mock. Existing reports remain readable.

Required: home country, school/program/level, attendance status, phone/calling country, interview country/city, refusal and travel Yes/No answers, prior application count, funding source and future-plan response. Honest uncertainty is supported through Not booked yet, Not decided yet and a written “I’m still deciding”. Athletic-scholarship profiles require a sport. Other sport requires its name. High-school/previous education completion details remain optional.

The duplicate custom interview-location control is removed. Older saved locations are shown in the one city field for confirmation; nothing is discarded merely by opening the profile. Saving derives the legacy interviewLocation context from country/city. Changing interview country clears the unsaved city to avoid mismatches. Invalid application counts are rejected, not converted silently to zero.

Country selectors use locally served flag-icons 7.6.0 SVG assets (MIT package license) rather than emoji. Search accepts names, country codes and phone codes; keyboard users can use Tab, arrows, Enter and Escape. No external flag CDN receives student requests. Run npm ci when deploying.

interview-posts.json contains the 241 named rows from the U.S. Department of State Global Visa Wait Times table retrieved 2026-10-16 (source dated 2026-09-17), with country/territory mappings. It is a snapshot of that table, not a complete diplomatic-office directory or a guarantee of F-1 services. NA student wait data is labelled unavailable, not interpreted as proof of closure or availability. Students may type their confirmed appointment city if absent. Check the official source periodically and update the snapshot when posts change.

Coverage checkboxes record only user-confirmed award items; free-text award details and legacy values remain. The tutor sees both and must clarify conflicts, not infer travel or other coverage from “everything”.

Validation: node --test test/*.test.cjs. Browser checks should verify flags load, Nigeria/Kenya country-to-city filtering, old-location preservation, no duplicate field, partial saves, mock blocking before microphone/quota, and desktop/mobile layout. Separate PostgreSQL integration tests still require a disposable TEST_DATABASE_URL.
