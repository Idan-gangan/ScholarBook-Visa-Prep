# Owner access

This release introduces a dedicated `owner` role. Public registration still creates only Students (`athlete` internally). No public endpoint can create an Owner or elevate a Student without an existing Owner's authenticated authorization and current password.

## Activate the confirmed existing account

After merging and waiting for the Render deployment to become Live, open the web service's **Shell** and run:

```sh
node scripts/set-owner.cjs aefesam@gmail.com
```

Use the service shell with its existing `DATABASE_URL`; never paste the database URL or password into chat. The command requires exactly one matching existing account and its existing credential. It refuses if a different Owner already exists. It does not create accounts, change passwords, delete profiles, or change other users' permissions. It invalidates the promoted account's old sessions. Repeating it for the same Owner is safe.

Sign out and sign back in at https://visaatlasprep.com. The header should show **Owner** and the initial screen should be **Owner dashboard**. If Shell is unavailable, stop and arrange an authorized database-admin execution; do not add a public bootstrap route.

## Included permissions

- Owner dashboard: account list, counts, and recent permission audit history.
- Change an existing non-owner account between Student, Coach, Supervisor and Manager after confirming the Owner's current password. A staff-only account without a student profile cannot be changed to Student.
- View all students and reports; use all students' learning modules and saved notes; conduct mock/tutor sessions; add human reviews.
- Retain access to the Owner's pre-existing personal student profile and history.
- Roles are checked on the server, not just by hiding navigation. Unknown roles cannot list all student records.
- Role changes preserve student records, invalidate the target's sessions across instances using credential versions, and record an audit event. The last 1,000 permission events are retained, with the latest 100 shown in the dashboard.

## Explicit boundaries

- Owner is not unlimited API usage: existing voice/report cost controls remain.
- The Owner can enable **Tester: 18 starts/day** for an existing account in the Daily voice access column, using their current password. Standard access is 6 starts/day. Lessons and mock interviews share that allowance and reset at midnight UTC. This does not grant staff permissions, reset used starts, or change the 8-minute lesson / 12-minute mock session limits. Extra usage can increase AI costs. Disable tester access when testing ends.
- This does not expose passwords, API keys, database credentials, billing or Render/GitHub controls.
- This release does not add arbitrary platform configuration, account deletion, document access, or ownership transfer. Changing Owner ownership requires a separate deliberate administrative procedure.
- There is no MFA in this release. Use a unique strong Owner password, keep account recovery under your control, and do not share the Owner login. Grant staff roles only to trusted users: staff access currently spans all student records.

## Verification

Run `node --test test/*.test.cjs`. Check unauthenticated/Student/staff rejection on `/api/owner/accounts` and `/api/owner/role`, current-password requirements, owner protection, session invalidation, escaping, audit records, preservation of student profiles, and existing learning/mock regression tests.

The one-time activation is not performed by a GitHub merge. It must be run by an authorized operator against the deployed service after the new code is live.
