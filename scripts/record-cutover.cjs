// Production maintenance helper. Default is read-only; never prints credentials or records.
const {Pool}=require('pg'),store=require('../record-store');
const action=process.argv[2]||'status';
if(!['status','migrate','rollback'].includes(action))throw Error('Use status, migrate or rollback');
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL required');
if(action!=='status'&&process.env.RECORD_STORAGE_MAINTENANCE!=='confirmed')throw Error('Stop incoming traffic and all state writers, verify a backup, then explicitly confirm maintenance');
const pool=new Pool({connectionString:process.env.DATABASE_URL});
(async()=>{
 const active=(await pool.query(`SELECT
 (SELECT COUNT(*) FROM voice_admission WHERE call_id IS NOT NULL OR (token IS NOT NULL AND pending_until>NOW()))+
 (SELECT COUNT(*) FROM voice_call_limits)+
 (SELECT COUNT(*) FROM evaluation_daily_usage WHERE lease_token IS NOT NULL AND lease_until>NOW())+
 (SELECT COUNT(*) FROM password_reset_queue) AS active_jobs`)).rows[0];
 const status=(await pool.query("SELECT jsonb_array_length(data->'users') AS legacy_accounts,jsonb_array_length(data->'reports') AS legacy_reports,to_regclass('record_store_meta') IS NOT NULL AS migrated FROM app_state WHERE id=1")).rows[0];
 console.log(JSON.stringify({...status,activeJobs:Number(active.active_jobs)}));
 if(action==='status')return;
 if(Number(active.active_jobs)!==0)throw Error('Active voice, report or recovery jobs remain; cutover refused');
 const c=await pool.connect();try{await store[action](c);}finally{c.release();}
 console.log(action+' completed; keep maintenance enabled until the intended storage mode is running and checked');
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
