#!/usr/bin/env bash
# Synthetic CI-only drill. Never accepts a production database connection string.
set -euo pipefail
if [[ "${CI:-}" != "true" || -z "${TEST_POSTGRES_CONTAINER:-}" ]]; then
  echo 'Run only in CI with the disposable PostgreSQL service container.' >&2; exit 1
fi
container="$TEST_POSTGRES_CONTAINER"
psql_test() { docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d visaatlas_test "$@"; }
psql_test <<'SQL'
CREATE SCHEMA backup_drill;
CREATE TABLE backup_drill.app_state(id integer PRIMARY KEY,data jsonb NOT NULL);
CREATE TABLE backup_drill.learning_progress(student_id text,lesson_id text,data jsonb);
CREATE TABLE backup_drill.user_credentials(user_id text PRIMARY KEY,password_hash text);
INSERT INTO backup_drill.app_state VALUES(1,'{"users":[{"id":"synthetic-user"}],"athletes":[{"id":"synthetic-student","userId":"synthetic-user"}],"reports":[{"athleteId":"synthetic-student","feedback":"synthetic feedback"}]}');
INSERT INTO backup_drill.learning_progress VALUES('synthetic-student','study-purpose','{"draftAnswer":"synthetic note"}');
INSERT INTO backup_drill.user_credentials VALUES('synthetic-user','not-a-real-password-hash');
SQL
docker exec "$container" pg_dump -U postgres -d visaatlas_test --format=custom --schema=backup_drill --file=/tmp/visaatlas-drill.dump
psql_test -c 'DROP SCHEMA backup_drill CASCADE'
docker exec "$container" pg_restore -U postgres -d visaatlas_test --exit-on-error --no-owner /tmp/visaatlas-drill.dump
psql_test <<'SQL'
DO $$ BEGIN
 IF (SELECT data->'users'->0->>'id' FROM backup_drill.app_state WHERE id=1) IS DISTINCT FROM 'synthetic-user' THEN RAISE EXCEPTION 'account restore failed'; END IF;
 IF (SELECT data->'reports'->0->>'feedback' FROM backup_drill.app_state WHERE id=1) IS DISTINCT FROM 'synthetic feedback' THEN RAISE EXCEPTION 'report restore failed'; END IF;
 IF (SELECT data->>'draftAnswer' FROM backup_drill.learning_progress WHERE student_id='synthetic-student') IS DISTINCT FROM 'synthetic note' THEN RAISE EXCEPTION 'note restore failed'; END IF;
 IF (SELECT password_hash FROM backup_drill.user_credentials WHERE user_id='synthetic-user') IS DISTINCT FROM 'not-a-real-password-hash' THEN RAISE EXCEPTION 'credential restore failed'; END IF;
END $$;
DROP SCHEMA backup_drill CASCADE;
SQL
docker exec "$container" rm /tmp/visaatlas-drill.dump
echo 'Synthetic database backup and restore verified. Production backups are not verified by this test.'
