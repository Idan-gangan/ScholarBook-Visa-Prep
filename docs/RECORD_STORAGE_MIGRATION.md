# Record storage integration — development only

Status: feature-gated compatibility integration, NOT approved for production activation.

The legacy mode remains the default. RECORD_STORAGE=enabled selects separate ordered collection records. All mutateDb callbacks retain a single transaction with credential, lesson and voice SQL operations. Reads use a repeatable-read snapshot. Each changed record is written separately; unchanged records are skipped. Session user lookup uses a primary-key query.

Current limitation: compatibility load/mutate still reconstruct the whole state and serialize writes. This is not the per-student prototype's full performance result. Remaining endpoint-specific readers and writers, full enabled-mode HTTP tests and a repeat capacity run are release gates. Existing tests passing in default mode do not certify enabled mode.

## Preservation

All array collections (including guardian requests, reviews, mock sessions and audit history) and scalar metadata are round-tripped. Credential, learning-progress, password-recovery, voice, usage and operations SQL tables remain in place. Import fails on duplicate keys or a parity mismatch and rolls back. No expiry or retention deletion is introduced.

## Isolated rehearsal

Use a disposable local PostgreSQL database. scripts/migrate-record-store.cjs accepts only TEST_DATABASE_URL on localhost with a visaatlas_ database name. Never point benchmark/rehearsal tools at production. The integration test uses synthetic state in an isolated schema and verifies parity, concurrent writes, atomic rollback with credentials, deletion and exporting the latest normalized state back into legacy app_state.

## Future production sequence — not yet authorized for activation

1. Finish enabled-mode endpoint tests, scoped reads/writes and representative benchmark. Resolve all parity or access failures.
2. Take and verify a fresh backup. Stop incoming traffic AND all background writers across every instance. No mixed legacy/new writers are permitted.
3. Under maintenance, migrate a copy, compare all counts and record contents, then rehearse the exact production migration with a reviewed production-capable tool. Current script intentionally cannot connect remotely.
4. Switch all instances together. Verify login, permissions, learning, voice/report lifecycle, reviews, export, guardian withdrawal and deletion before reopening.
5. Rollback must stop all writers and copy LATEST record-store contents back to app_state before reverting the mode. Simply disabling the flag exposes stale state and could restore deleted accounts. Keep other relational tables synchronized by using the same database transaction history; never restore only app_state from an old backup.

No production flag, schema or data has been changed by this branch.
