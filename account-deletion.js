'use strict';
const fail=(status,message)=>Object.assign(new Error(message),{status,publicMessage:message});
// Called inside mutateDb's app_state transaction. Never accept a target ID from the request.
async function deleteStudentAccount(db,client,userId,verifiedCredential){
 const user=db.users.find(u=>u.id===userId);
 if(!user)throw fail(401,'Unauthorized');
 if(user.role!=='athlete')throw fail(403,'For staff or owner account removal, contact support.');
 // Serialize with password-reset request admission so a stale request cannot recreate queued account data.
 await client.query('SELECT pg_advisory_xact_lock(172343992,1)');
 const saved=(await client.query('SELECT password_hash, version FROM user_credentials WHERE user_id=$1 FOR UPDATE',[userId])).rows[0];
 if(!saved||saved.password_hash!==verifiedCredential.password_hash||saved.version!==verifiedCredential.version)throw fail(409,'Your password changed. Sign in again before deleting your account.');
 const active=await client.query(`SELECT 1 FROM voice_admission WHERE user_id=$1 AND (call_id IS NOT NULL OR (token IS NOT NULL AND pending_until>NOW()))
 UNION ALL SELECT 1 FROM voice_call_limits WHERE user_id=$1
 UNION ALL SELECT 1 FROM evaluation_daily_usage WHERE user_id=$1 AND lease_token IS NOT NULL AND lease_until>NOW() LIMIT 1`,[userId]);
 if(active.rows.length)throw fail(409,'End any voice session and wait for report generation to finish, then try again.');
 const studentIds=db.athletes.filter(a=>a.userId===userId).map(a=>a.id);
 const belongs=record=>record.userId===userId||studentIds.includes(record.athleteId);
 for(const key of ['reports','transcripts','mockSessions'])if(Array.isArray(db[key]))db[key]=db[key].filter(r=>!belongs(r));
 db.athletes=db.athletes.filter(a=>a.userId!==userId);
 for(const student of db.athletes)if(Array.isArray(student.staffIds))student.staffIds=student.staffIds.filter(id=>id!==userId);
 if(Array.isArray(db.securityAudit))db.securityAudit=db.securityAudit.filter(r=>r.actorId!==userId&&r.targetId!==userId&&!studentIds.includes(r.targetId)&&!studentIds.includes(r.studentId));
 db.users=db.users.filter(u=>u.id!==userId);
 const email=typeof user.email==='string'?user.email.trim().toLowerCase():'';
 if(email){
  const key=require('node:crypto').createHash('sha256').update(email).digest('hex');
  await client.query('DELETE FROM password_reset_queue WHERE user_id=$1 OR email_key=$2',[userId,key]);
  await client.query('DELETE FROM password_reset_cooldowns WHERE email_key=$1',[key]);
 }
 await client.query('DELETE FROM learning_progress WHERE student_id = ANY($1::text[])',[studentIds]);
 for(const table of ['password_reset_tokens','voice_mode_usage','voice_admission','voice_call_limits','evaluation_daily_usage','user_credentials'])await client.query(`DELETE FROM ${table} WHERE user_id=$1`,[userId]);
}
module.exports={deleteStudentAccount};
