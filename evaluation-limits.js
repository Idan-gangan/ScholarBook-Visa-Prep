const crypto=require('node:crypto');
const EVALUATION_POLICY=Object.freeze({daily:null,attempts:null,timeoutMs:90000,leaseSeconds:180,outputTokens:4096,maxCharacters:40000,maxTurns:200});
function normalizeTranscript(value){
 if(!Array.isArray(value)||value.length<1||value.length>EVALUATION_POLICY.maxTurns)throw new Error('Provide a short interview transcript before generating a report.');
 let characters=0;
 const lines=value.map(line=>{
   if(!line||!['athlete','assistant'].includes(line.role)||typeof line.text!=='string')throw new Error('The interview transcript contains an invalid entry.');
   const text=line.text.trim();characters+=text.length;
   if(!text||characters>EVALUATION_POLICY.maxCharacters)throw new Error('The interview transcript is empty or too long.');
   return {role:line.role,text};
 });
 if(!lines.some(line=>line.role==='athlete'))throw new Error('Capture a student answer before generating a report.');
 return lines;
}
function createEvaluationLimits(pool){
 async function init(){
   await pool.query(`CREATE TABLE IF NOT EXISTS evaluation_daily_usage (
     user_id TEXT PRIMARY KEY, usage_day DATE NOT NULL, attempts INTEGER NOT NULL,
     lease_token TEXT, lease_until TIMESTAMPTZ)`);
   await pool.query("ALTER TABLE evaluation_daily_usage ADD COLUMN IF NOT EXISTS completed INTEGER NOT NULL DEFAULT 0");
 }
 async function status(userId){
   const result=await pool.query("SELECT attempts,completed FROM evaluation_daily_usage WHERE user_id=$1 AND usage_day=(NOW() AT TIME ZONE 'UTC')::date",[userId]);
   const row=result.rows[0]||{},used=Number(row.completed||0),attempts=Number(row.attempts||0);
   const reset=new Date();reset.setUTCHours(24,0,0,0);
   return {limit:null,unlimited:true,used,attempts,remaining:null,attemptsRemaining:null,resetsAt:reset.toISOString()};
 }
 async function reserve(userId){
   const token=crypto.randomBytes(16).toString('hex');
   const result=await pool.query(`INSERT INTO evaluation_daily_usage (user_id,usage_day,attempts,lease_token,lease_until)
     VALUES ($1,(NOW() AT TIME ZONE 'UTC')::date,1,$2,NOW()+($3 * INTERVAL '1 second'))
     ON CONFLICT (user_id) DO UPDATE SET usage_day=EXCLUDED.usage_day,
       attempts=CASE WHEN evaluation_daily_usage.usage_day=EXCLUDED.usage_day THEN evaluation_daily_usage.attempts+1 ELSE 1 END,
       completed=CASE WHEN evaluation_daily_usage.usage_day=EXCLUDED.usage_day THEN evaluation_daily_usage.completed ELSE 0 END,
       lease_token=EXCLUDED.lease_token,lease_until=EXCLUDED.lease_until
     WHERE (evaluation_daily_usage.lease_until IS NULL OR evaluation_daily_usage.lease_until<=NOW())
       AND (evaluation_daily_usage.usage_day<>EXCLUDED.usage_day OR (($4::integer IS NULL OR evaluation_daily_usage.attempts<$4) AND ($5::integer IS NULL OR evaluation_daily_usage.completed<$5)))
     RETURNING attempts`,[userId,token,EVALUATION_POLICY.leaseSeconds,EVALUATION_POLICY.attempts,EVALUATION_POLICY.daily]);
   return result.rows.length?token:null;
 }
 async function complete(userId,token,client){
   // Called in the same transaction as saving the report. A stale generation
   // cannot save a report after another request has acquired its expired lease.
   const result=await client.query('UPDATE evaluation_daily_usage SET completed=completed+1,lease_token=NULL,lease_until=NULL WHERE user_id=$1 AND lease_token=$2 RETURNING user_id',[userId,token]);
   if(!result.rows.length)throw new Error('Report generation lease expired');
 }
 async function release(userId,token){
   await pool.query('UPDATE evaluation_daily_usage SET lease_token=NULL,lease_until=NULL WHERE user_id=$1 AND lease_token=$2',[userId,token]);
 }
 return {init,status,reserve,complete,release};
}
module.exports={EVALUATION_POLICY,normalizeTranscript,createEvaluationLimits};
