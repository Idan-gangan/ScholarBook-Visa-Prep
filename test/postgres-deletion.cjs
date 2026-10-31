// Disposable database only. Each test uses its own schema and removes it afterwards.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Pool}=require('pg'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {deleteStudentAccount}=require('../account-deletion');
const {createCostDiagnostics}=require('../cost-diagnostics');
const {studentKey,groupKey}=require('../owner-student-analytics');
if(!process.env.TEST_DATABASE_URL)throw new Error('TEST_DATABASE_URL is required');
test('deletion is atomic, clears student data and tokens, preserves another account, and rejects active work',async()=>{
 const schema='deletion_'+require('node:crypto').randomBytes(8).toString('hex');
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL});let pool;
 try{
 await admin.query(`CREATE SCHEMA ${schema}`);
 pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`});
 await pool.query(`CREATE TABLE app_state(id integer PRIMARY KEY,data jsonb NOT NULL);
 CREATE TABLE user_credentials(user_id text PRIMARY KEY,password_hash text NOT NULL,version integer NOT NULL DEFAULT 0);
 CREATE TABLE learning_progress(student_id text,lesson_id text,data jsonb);
 CREATE TABLE password_reset_tokens(token_hash text,user_id text REFERENCES user_credentials(user_id) ON DELETE CASCADE);
 CREATE TABLE voice_admission(user_id text,token text,call_id text,pending_until timestamptz);
 CREATE TABLE voice_call_limits(user_id text,call_id text);
 CREATE TABLE evaluation_daily_usage(user_id text,lease_token text,lease_until timestamptz);
 CREATE TABLE voice_mode_usage(user_id text);
 CREATE TABLE password_reset_queue(user_id text,email_key text);
 CREATE TABLE password_reset_cooldowns(email_key text);`);
 const db={users:[{id:'u1',role:'athlete',email:'test@example.test',termsAcceptance:{version:'test'}},{id:'u2',role:'athlete'}],athletes:[{id:'s1',userId:'u1'},{id:'s2',userId:'u2'}],reports:[{id:'report-one',athleteId:'s1',mockSessionId:'mock1'},{id:'report-two',athleteId:'s2',mockSessionId:'mock2'}],transcripts:[{athleteId:'s1'},{athleteId:'s2'}],mockSessions:[{id:'mock1',athleteId:'s1',userId:'u1'},{id:'mock2',athleteId:'s2',userId:'u2'}],securityAudit:[{targetId:'s1'},{targetId:'u1'},{targetId:'u2'}]};
 await pool.query('INSERT INTO app_state VALUES (1,$1)',[db]);
 const costs=createCostDiagnostics(pool);await costs.init();
 await costs.voiceStart('u1','sample-one','learn',undefined,'s1');
 await costs.voiceStart('u2','sample-two','learn',undefined,'s2');
 await costs.report('mock1','report','test-model',{id:'legacy-response',usage:{input_tokens:10,output_tokens:4,input_tokens_details:{cached_tokens:0}}});
 assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM ai_cost_samples')).rows[0].n,3);
 for(const id of ['u1','u2']){
 await pool.query('INSERT INTO user_credentials VALUES ($1,\'hash\',0)',[id]);
 await pool.query('INSERT INTO password_reset_tokens VALUES ($1,$1)',[id]);
 for(const table of ['voice_admission','voice_call_limits','evaluation_daily_usage','voice_mode_usage'])await pool.query(`INSERT INTO ${table}(user_id) VALUES ($1)`,[id]);
 }
 const emailKey=require('node:crypto').createHash('sha256').update('test@example.test').digest('hex');
 await pool.query("INSERT INTO password_reset_queue VALUES ('u1',$1),('u2','other')",[emailKey]);
 await pool.query("INSERT INTO password_reset_cooldowns VALUES ($1),('other')",[emailKey]);
 await pool.query("INSERT INTO learning_progress VALUES ('s1','lesson','{}'),('s2','lesson','{}')");
 const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 const mutate=vm.runInNewContext(source.slice(source.indexOf('async function mutateDb('),source.indexOf('function stateError('))+';mutateDb',{pool,console});
 const remove=()=>mutate((db,client)=>deleteStudentAccount(db,client,'u1',{password_hash:'hash',version:0}));
 await assert.rejects(remove(),/End any voice/); // tracked call row blocks even without admission
 await pool.query("DELETE FROM voice_call_limits WHERE user_id='u1'");
 await pool.query("UPDATE evaluation_daily_usage SET lease_token='busy',lease_until=NOW()+interval '1 minute' WHERE user_id='u1'");
 await assert.rejects(remove(),/End any voice/);
 await pool.query("UPDATE evaluation_daily_usage SET lease_token=NULL WHERE user_id='u1'");
 await assert.rejects(mutate((db,client)=>deleteStudentAccount(db,client,'u1',{password_hash:'old',version:0})),/password changed/);
 await assert.rejects(mutate(async(db,client)=>{await deleteStudentAccount(db,client,'u1',{password_hash:'hash',version:0});throw new Error('simulated failure');}),/simulated failure/);
 assert.equal((await pool.query('SELECT * FROM user_credentials')).rows.length,2);
 assert.equal((await pool.query('SELECT * FROM password_reset_tokens')).rows.length,2);
 await remove();
 const remaining=(await pool.query('SELECT data FROM app_state')).rows[0].data;
 for(const key of ['users','athletes','reports','transcripts','mockSessions','securityAudit'])assert.equal(remaining[key].length,1,key);
 assert.equal(remaining.users[0].id,'u2');assert.equal(remaining.securityAudit[0].targetId,'u2');
 for(const table of ['user_credentials','password_reset_tokens','voice_admission','voice_call_limits','evaluation_daily_usage','voice_mode_usage']){
 const rows=(await pool.query(`SELECT user_id FROM ${table}`)).rows;
 assert.deepEqual(rows,[{user_id:'u2'}],table);
 }
 assert.deepEqual((await pool.query('SELECT email_key FROM password_reset_queue')).rows,[{email_key:'other'}]);
 assert.deepEqual((await pool.query('SELECT email_key FROM password_reset_cooldowns')).rows,[{email_key:'other'}]);
 assert.deepEqual((await pool.query('SELECT student_id FROM learning_progress')).rows,[{student_id:'s2'}]);
 const diagnosticRows=(await pool.query('SELECT student_key,group_key FROM ai_cost_samples')).rows;
 assert.equal(diagnosticRows.length,1,'Only another student\'s attributable diagnostics remain');
 assert.equal(diagnosticRows[0].student_key,studentKey('s2'));
 assert.equal(diagnosticRows.some(row=>row.group_key===groupKey('mock1')),false);
 }finally{if(pool)await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
