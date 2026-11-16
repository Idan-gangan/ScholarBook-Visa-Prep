const crypto=require('node:crypto');
const fail=m=>Object.assign(new Error(m),{status:400,publicMessage:m});
// Prevent obvious contact information and links from becoming publicly visible instantly.
// Owner review remains available for abuse that automated checks miss.
const exposesContact=value=>/(?:https?:\/\/|www\.|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i.test(value)||/(?:\+?\d[\d .()\-]{7,}\d)/.test(value);
function submit(db,userId,b){
 const u=db.users.find(u=>u.id===userId);
 if(!u||u.accessSuspended||u.role!=='athlete')throw fail('A student account is required.');
 if(!u.emailVerifiedAt)throw fail('Verify your account email before posting a review.');
 if(u.ageEligibility?.ageBand==='13-17'||u.ageEligibility?.ageBand==='under13'||b.adult!==true)throw fail('Public reviews are currently available to adults only. Younger students can send private feedback to support.');
 if(b.publicReview!==true)throw fail('Confirm that this is a public review.');
 if(!Number.isInteger(b.rating)||b.rating<1||b.rating>5)throw fail('Choose 1–5 stars.');
 if(typeof b.displayName!=='string'||!b.displayName.trim()||b.displayName.trim().length>60||typeof b.text!=='string'||b.text.trim().length<10||b.text.trim().length>2000)throw fail('Enter a display name (up to 60 characters) and a review (10–2,000 characters).');
 if(exposesContact(b.displayName)||exposesContact(b.text))throw fail('Remove links, email addresses, phone numbers and other contact details before publishing your review.');
 db.reviews??=[];let r=db.reviews.find(r=>r.userId===userId);
 if(r&&Date.now()-Date.parse(r.updatedAt)<60000)throw fail('Wait one minute before updating your review.');
 if(!r){r={id:crypto.randomUUID(),userId,createdAt:new Date().toISOString()};db.reviews.push(r);}
 // A rejected review must be re-approved, or the author could republish removed abuse.
 const status=r.status==='rejected'?'pending':'published';
 Object.assign(r,{rating:b.rating,displayName:b.displayName.trim(),text:b.text.trim(),status,updatedAt:new Date().toISOString(),publishedAt:status==='published'?new Date().toISOString():null,publicationAcceptedAt:new Date().toISOString(),noticeVersion:'2026-11-11'});delete r.reason;return {ok:true,status:r.status};
}
function moderate(db,actorId,b){
 if(!db.users.some(u=>u.id===actorId&&u.role==='owner'&&!u.accessSuspended))throw fail('Owner access required.');
 const r=(db.reviews||[]).find(r=>r.id===b.id);if(!r)throw fail('Review not found.');
 if(!['published','rejected'].includes(b.status))throw fail('Invalid decision.');
 if(b.status==='rejected'&&!['spam','abuse','personal-information','unrelated','duplicate'].includes(b.reason))throw fail('Choose a content-policy reason. Negative ratings alone are not a reason.');
 r.status=b.status;r.reason=b.status==='rejected'?b.reason:null;r.moderatedAt=new Date().toISOString();r.moderatedBy=actorId;return {ok:true};
}
function publicReviews(db){const list=(db.reviews||[]).filter(r=>r.status==='published'&&db.users.some(u=>u.id===r.userId&&!u.accessSuspended));return {count:list.length,average:list.length?list.reduce((n,r)=>n+r.rating,0)/list.length:null,reviews:list.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100).map(({displayName,rating,text,createdAt})=>({displayName,rating,text,createdAt}))};}
module.exports={submit,moderate,publicReviews};
