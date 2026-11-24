// Isolated prototype. Not imported by the live server.
async function init(client){await client.query(`
 CREATE TABLE scaled_users(id text PRIMARY KEY,data jsonb NOT NULL);
 CREATE TABLE scaled_profiles(id text PRIMARY KEY,user_id text NOT NULL REFERENCES scaled_users(id) ON DELETE CASCADE,data jsonb NOT NULL);
 CREATE INDEX scaled_profile_user ON scaled_profiles(user_id);
 CREATE TABLE scaled_reports(id text PRIMARY KEY,student_id text NOT NULL REFERENCES scaled_profiles(id) ON DELETE CASCADE,data jsonb NOT NULL);
 CREATE INDEX scaled_report_student ON scaled_reports(student_id);
 CREATE TABLE scaled_transcripts(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,student_id text NOT NULL REFERENCES scaled_profiles(id) ON DELETE CASCADE,data jsonb NOT NULL);
 CREATE INDEX scaled_transcript_student ON scaled_transcripts(student_id);
`);}
async function importState(client,state){
 await client.query('BEGIN');try{
 for(const [table,rows,sql] of [
 ['users',state.users,'INSERT INTO scaled_users SELECT x->>\'id\',x FROM jsonb_array_elements($1::jsonb) x'],
 ['profiles',state.athletes,'INSERT INTO scaled_profiles SELECT x->>\'id\',x->>\'userId\',x FROM jsonb_array_elements($1::jsonb) x'],
 ['reports',state.reports,'INSERT INTO scaled_reports SELECT x->>\'id\',x->>\'athleteId\',x FROM jsonb_array_elements($1::jsonb) x'],
 ['transcripts',state.transcripts,'INSERT INTO scaled_transcripts(student_id,data) SELECT x->>\'athleteId\',x FROM jsonb_array_elements($1::jsonb) x']])await client.query(sql,[JSON.stringify(rows||[])]);
 await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}
}
async function student(client,actorId,studentId){
 // Re-evaluate current role and assignment in the same query as the read.
 const result=await client.query(`SELECT p.data AS profile,
 COALESCE((SELECT jsonb_agg(r.data) FROM scaled_reports r WHERE r.student_id=p.id),'[]'::jsonb) AS reports,
 COALESCE((SELECT jsonb_agg(t.data) FROM scaled_transcripts t WHERE t.student_id=p.id),'[]'::jsonb) AS transcripts
 FROM scaled_profiles p JOIN scaled_users u ON u.id=$1 WHERE p.id=$2 AND NOT COALESCE((u.data->>'accessSuspended')::boolean,false)
 AND ((u.data->>'role'='athlete' AND p.user_id=u.id) OR u.data->>'role'='owner'
 OR (u.data->>'role' IN ('coach','supervisor','manager') AND COALESCE(p.data->'staffIds','[]'::jsonb) ? u.id))`,[actorId,studentId]);
 return result.rows[0]||null;
}
async function saveNote(client,userId,note){const r=await client.query(`UPDATE scaled_profiles p SET data=jsonb_set(p.data,'{testNote}',to_jsonb($2::text)) FROM scaled_users u WHERE u.id=$1 AND p.user_id=u.id AND u.data->>'role'='athlete' AND NOT COALESCE((u.data->>'accessSuspended')::boolean,false) RETURNING p.id`,[userId,note]);return r.rowCount;}
module.exports={init,importState,student,saveNote};
