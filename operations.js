const ROUTES=new Map([
 ['/api/register-athlete','registration'],['/api/verify-email','email_verification'],['/api/resend-verification','verification_send'],['/api/guardian-request','guardian_email'],['/api/guardian-permission','guardian_permission'],['/api/forgot-password','password_recovery'],['/api/realtime-session','voice_start'],['/api/evaluate','report_generation'],['/api/practice-answer','practice_feedback'],['/api/delete-account','account_deletion'],['/api/export-account','data_export']
]);
function createOperations(pool,{log=console.warn,now=Date.now}={}){
 const costs=require('./cost-diagnostics').createCostDiagnostics(pool,{log});
 let cleanupAt=0;
 async function init(){await pool.query(`CREATE TABLE IF NOT EXISTS operation_daily (
 day DATE NOT NULL, operation TEXT NOT NULL, requests INTEGER NOT NULL DEFAULT 0,
 successes INTEGER NOT NULL DEFAULT 0, rejected INTEGER NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(day,operation))`);await costs.init();}
 async function record(path,status){
 const operation=ROUTES.get(path);if(!operation)return;
 try{
 await pool.query(`INSERT INTO operation_daily(day,operation,requests,successes,rejected,failures)
 VALUES((NOW() AT TIME ZONE 'UTC')::date,$1,1,$2,$3,$4)
 ON CONFLICT(day,operation) DO UPDATE SET requests=operation_daily.requests+1,successes=operation_daily.successes+EXCLUDED.successes,rejected=operation_daily.rejected+EXCLUDED.rejected,failures=operation_daily.failures+EXCLUDED.failures`,[operation,status<400?1:0,status>=400&&status<500?1:0,status>=500?1:0]);
 if(status>=500)log('[operations] SERVICE_FAILURE '+operation);
 if(now()>cleanupAt){cleanupAt=now()+3600000;await pool.query("DELETE FROM operation_daily WHERE day < (NOW() AT TIME ZONE 'UTC')::date - 30");}
 }catch{log('[operations] METRICS_WRITE_FAILED');}
 }
 async function summary(){return (await pool.query("SELECT day,operation,requests,successes,rejected,failures FROM operation_daily WHERE day >= (NOW() AT TIME ZONE 'UTC')::date - 6 ORDER BY day DESC,operation")).rows;}
 return {init,record,summary,costs};
}
module.exports={createOperations};
