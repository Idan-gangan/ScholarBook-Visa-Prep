# Transactional state updates

All app_state read/modify/write paths now use a dedicated PostgreSQL client, BEGIN, SELECT FOR UPDATE, UPDATE and COMMIT. Errors trigger ROLLBACK; clients are released. This serializes writers across server processes, not just within one Node process.

Registration checks email uniqueness inside the lock and inserts credentials in the same transaction. Bootstrap coach creation uses the same transaction. Password hashing happens before acquiring the lock. Report generation calls the provider before locking, then reloads current state and rechecks student access. Report numbering and mock counts are computed from that current state. Profile saves, human reviews and transcript saves also use the shared writer.

No schema or data migration is required. Learning progress, password replacement and voice usage already use separate SQL writes and remain separate.

## Verification and deployment

49 local tests pass, including overlapping profiles, delayed concurrent evaluations, duplicate registrations, rollback and client release. Local tests model database locking. The State reliability workflow additionally tests 20 concurrent mutations through two real PostgreSQL pools and transaction rollback against disposable PostgreSQL 18. Require that workflow to pass before merging. Never point TEST_DATABASE_URL at production.

During deployment, older running code can still make unsafe writes. Avoid student activity until the old deployment has stopped. After deployment, check registration, profile save, transcript save and report generation. No destructive migration or restore is needed. Rolling back to old code reintroduces lost-update risk.

## Limits

This is a correctness fix, not a scalability claim: every mutation still locks and rewrites one shared JSON document. A later migration should normalize student and report records, enforce database email uniqueness, and add report request idempotency. Slow AI requests do not hold this lock. No production database was accessed during development.
