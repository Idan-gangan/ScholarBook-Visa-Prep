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
module.exports = {assignStudent, isStaff, isOwner, changeRole, selectOwnerTarget, audit};
