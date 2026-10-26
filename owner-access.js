'use strict';
const STAFF_ROLES = ['owner', 'coach', 'supervisor', 'manager'];
const ASSIGNABLE_ROLES = ['athlete', 'coach', 'supervisor', 'manager'];
const isStaff = user => !!user && STAFF_ROLES.includes(user.role);
const isOwner = user => !!user && user.role === 'owner';
const fail = (status, message) => Object.assign(new Error(message), {status, publicMessage: message});
function audit(db, actorId, target, previousRole, action) {
  db.securityAudit = [...(db.securityAudit || []), {
    action, actorId, targetId: target.id, previousRole, role: target.role,
    at: new Date().toISOString()
  }].slice(-1000);
}
function changeRole(db, actorId, targetId, role) {
  if (!isOwner(db.users.find(user => user.id === actorId))) throw fail(403, 'Owner access required.');
  if (!ASSIGNABLE_ROLES.includes(role)) throw fail(400, 'Invalid role. Owner access cannot be assigned here.');
  const target = db.users.find(user => user.id === targetId);
  if (!target) throw fail(404, 'Account not found.');
  if (target.id === actorId || isOwner(target)) throw fail(403, 'Owner accounts are protected from role changes.');
  if (role === 'athlete' && !db.athletes.some(student => student.userId === target.id)) {
    throw fail(400, 'This account has no student profile. Keep its staff role.');
  }
  const previousRole = target.role;
  target.role = role;
  if(previousRole!==role)for(const student of db.athletes)if(Array.isArray(student.staffIds))student.staffIds=student.staffIds.filter(id=>id!==target.id);
  audit(db, actorId, target, previousRole, 'role-change');
  return {id: target.id, name: target.name, email: target.email, role: target.role};
}
function selectOwnerTarget(db, email) {
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!/^\S+@\S+\.\S+$/.test(normalized)) throw fail(400, 'Supply the exact existing account email.');
  const matches = db.users.filter(user => String(user.email || '').trim().toLowerCase() === normalized);
  if (matches.length !== 1) throw fail(409, 'Expected exactly one existing account. No changes made.');
  if (db.users.some(user => isOwner(user) && user.id !== matches[0].id)) {
    throw fail(409, 'Another owner already exists. Ownership transfer requires a separate review.');
  }
  return matches[0];
}
function assignStudent(db, actorId, studentId, staffIds) {
  if(!isOwner(db.users.find(u=>u.id===actorId)))throw fail(403,'Owner access required.');
  const student=db.athletes.find(s=>s.id===studentId);
  if(!student)throw fail(404,'Student not found.');
  if(!Array.isArray(staffIds)||staffIds.length>100||staffIds.some(id=>typeof id!=='string'||!db.users.some(u=>u.id===id&&['coach','supervisor','manager'].includes(u.role))))throw fail(400,'Choose valid staff accounts.');
  const previous=student.staffIds||[];
  student.staffIds=[...new Set(staffIds)];
  db.securityAudit=[...(db.securityAudit||[]),{action:'student-assignment',actorId,targetId:student.id,previousRole:previous.join(', ')||'No staff',role:student.staffIds.join(', ')||'No staff',at:new Date().toISOString()}].slice(-1000);
  return {id:student.id,staffIds:student.staffIds};
}
async function withdrawGuardianPermission(db, client, actorId, body) {
  if (!isOwner(db.users.find(user => user.id === actorId))) throw fail(403, 'Owner access required.');
  if (body.verifiedGuardian !== true || body.confirmation !== 'WITHDRAW') throw fail(400, 'Verify the guardian request and type WITHDRAW.');
  const target = db.users.find(user => user.id === body.userId);
  if (!target || target.role !== 'athlete' || target.ageEligibility?.ageBand !== '13-17' || !target.ageEligibility.guardian) throw fail(400, 'This student has no recorded guardian permission. Contact support for legacy accounts.');
  if (target.accessSuspended) return {id:target.id, accessSuspended:true};
  // Admission also holds the app_state lock, so no new AI session can race this check.
  const active = await client.query(`SELECT 1 FROM voice_admission WHERE user_id=$1 AND (call_id IS NOT NULL OR (token IS NOT NULL AND pending_until>NOW()))
    UNION ALL SELECT 1 FROM voice_call_limits WHERE user_id=$1
    UNION ALL SELECT 1 FROM evaluation_daily_usage WHERE user_id=$1 AND lease_token IS NOT NULL AND lease_until>NOW() LIMIT 1`, [target.id]);
  if (active.rows.length) throw fail(409, 'A voice session or report is still active. Ask the student to end it, then retry after processing finishes. Permission has not yet been withdrawn.');
  target.accessSuspended = true;
  target.ageEligibility.guardian.withdrawnAt = new Date().toISOString();
  await client.query('UPDATE user_credentials SET version=version+1 WHERE user_id=$1', [target.id]);
  audit(db, actorId, target, target.role, 'guardian-withdrawal');
  return {id:target.id, accessSuspended:true};
}
module.exports = {withdrawGuardianPermission,assignStudent, isStaff, isOwner, changeRole, selectOwnerTarget, audit};
