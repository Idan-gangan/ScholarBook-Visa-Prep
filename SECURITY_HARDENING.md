# Staff access and voice admission

## Deployment and owner setup

This change denies staff access by default. Existing coaches, supervisors and
managers have no student assignments until the owner grants them. Before merging,
make sure an owner account is available.

After deployment, sign in as owner, open Owner dashboard → Student assignments,
select the staff for each student, enter the owner's current password and save.
The owner retains access to every student. Students retain access to their own
profile and reports. Changing a staff member's role clears their assignments.
Assignment changes are recorded in the existing permission audit.

Assignments are enforced on student/report lists, learning, transcripts, report
generation, voice starts and human review. A manager still cannot add human reviews.
Removing access applies to subsequent requests; it cannot erase information
someone has already viewed or downloaded.

## Voice behavior

Unlimited repeat practice remains available, with one active tutor OR mock voice
session per account and at least ten seconds between starts. PostgreSQL stores
admission, including setup reservations, so another tab, process or application
restart cannot normally bypass the guard.

End conversation now requests a server-side hangup as well as stopping local
media. Tokens are scoped to the signed-in account. Old end requests cannot clear a
new reservation. Failed hangups keep the account locked; the existing deadline
sweep retries. Setup reservations without tracked calls expire after 90 seconds.
Tracked orphan calls continue blocking new admission until cleanup succeeds.

The existing 8-minute tutor and 12-minute mock deadlines remain. Abrupt tab closure,
network failure or logout during cleanup may leave the account blocked until the
server deadline sweep completes. Calls already running before deployment do not
have the new account association and may overlap briefly during rollout.

The migration adds voice_admission and an optional user_id column/index on
voice_call_limits automatically at startup; no existing records are deleted.

## Verification and remaining work

Run the ordinary suite with:
    node --test test/*.test.cjs

The optional real PostgreSQL test requires an explicitly disposable database:
    TEST_DATABASE_URL=... node --test test/postgres-voice.cjs

The SQL admission scenarios were also exercised against an embedded PostgreSQL
engine (PGlite). This does not replace testing against the deployed database or a
multi-process production deployment.

Remaining work includes stronger signup/login abuse controls, staff MFA,
browser/request hardening, retention/deletion policy, and verification of hosting
permissions, database exposure, spending alerts and backup restoration. This
change is not a security certification or a complete bot/spending defense.
