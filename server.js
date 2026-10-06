
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {hashPassword,verifyPassword,validPassword,legacyHash}=require('./passwords');
const { Pool } = require("pg");
const { studyLevelInstructions, LESSONS, LESSON_ID, canAccessStudent, normalizeProgress, tutorInstructions } = require("./learning");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const {POLICY,createVoiceLimits}=require('./voice-limits');
const voiceLimits=createVoiceLimits(pool,OPENAI_API_KEY);
const {EVALUATION_POLICY,normalizeTranscript,createEvaluationLimits}=require("./evaluation-limits");
const evaluationLimits=createEvaluationLimits(pool);
const {createPasswordRecovery}=require('./password-recovery');
const passwordRecovery=createPasswordRecovery(pool,{env:process.env,diagnostic:authDiagnostic});
const EVALUATION_MODEL = process.env.EVALUATION_MODEL || "gpt-5.6";
const PUBLIC = path.join(__dirname, "public");
const DATA_FILE = path.join(__dirname, "data", "db.json");
const sessions = new Map();
const authAttempts = new Map();
function allowAuth(key){
  const now=Date.now();
  for(const [k,v] of authAttempts)if(v.until<=now)authAttempts.delete(k);
  let entry=authAttempts.get(key);
  if(!entry){if(authAttempts.size>=2000)return false;entry={count:0,until:now+60000};authAttempts.set(key,entry);}
  return ++entry.count<=10;
}
function sessionCookie(token,clear=false){return `sb_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${clear?0:28800}${process.env.NODE_ENV==='production'||process.env.RENDER==='true'?'; Secure':''}`;}
function startSession(userId,version){for(const [key,s] of sessions)if(s.expires<=Date.now())sessions.delete(key);const token=crypto.randomBytes(24).toString('hex');sessions.set(token,{userId,version,expires:Date.now()+8*60*60*1000});return token;}
async function credential(userId){return (await pool.query('SELECT password_hash, version FROM user_credentials WHERE user_id=$1',[userId])).rows[0];}
async function insertCredential(userId,hash){await pool.query('INSERT INTO user_credentials (user_id,password_hash) VALUES ($1,$2) ON CONFLICT (user_id) DO NOTHING',[userId,hash]);}
async function replaceCredential(userId,previous,hash){return (await pool.query('UPDATE user_credentials SET password_hash=$1, version=version+1 WHERE user_id=$2 AND password_hash=$3 AND version=$4 RETURNING version',[hash,userId,previous.password_hash,previous.version])).rows[0];}
// Fixed diagnostic codes only: never log emails, submitted passwords, hashes or tokens.
// Emit each failure category once per process to avoid flooding logs on repeated attempts.
const authDiagnostics = new Set();
let loginTraceCount = 0;
function authDiagnostic(code){
  if(authDiagnostics.has(code)) return;
  authDiagnostics.add(code);
  console.warn("[auth] " + code);
}
function normalizeEmail(value){ return typeof value === "string" ? value.trim().toLowerCase() : ""; }
const KNOWLEDGE_DIR = path.join(__dirname, "knowledge");

function loadEmbassyKnowledge(interviewLocation = "") {
  try {
    const location = String(interviewLocation || "").toLowerCase();

    if (location.includes("nairobi") || location.includes("kenya")) {
      const file = path.join(KNOWLEDGE_DIR, "nairobi.json");
      return JSON.parse(fs.readFileSync(file, "utf8"));
    }
if (
  location.includes("nigeria") ||
  location.includes("lagos") ||
  location.includes("abuja")
) {
  const file = path.join(KNOWLEDGE_DIR, "nigeria.json");
  console.log("Nigeria intelligence loaded for:", interviewLocation);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
    return null;
  } catch (err) {
    console.error("Could not load embassy knowledge:", err);
    return null;
  }
}
function sha(v){ return crypto.createHash("sha256").update(v).digest("hex"); }


const RESPONSE_HEADERS={"X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Referrer-Policy":"same-origin"};
function json(res, code, obj){
  res.writeHead(code, {...RESPONSE_HEADERS,"Content-Type":"application/json","Cache-Control":"no-store"});
  res.end(JSON.stringify(obj));
}
function readBody(req,maxBytes=1024*1024){
  return new Promise((resolve,reject)=>{
    let chunks=[],bytes=0,tooLarge=false;
    req.on('data',c=>{bytes+=c.length;if(bytes>maxBytes){chunks=[];if(!tooLarge){tooLarge=true;reject(Object.assign(new Error('Request is too large.'),{status:413}));}}else if(!tooLarge)chunks.push(c);});
    req.on("end",()=>{if(!tooLarge)resolve(Buffer.concat(chunks));});
    req.on("error",reject);
  });
}async function initDb(){
  await pool.query(`CREATE TABLE IF NOT EXISTS user_credentials (
    user_id TEXT PRIMARY KEY, password_hash TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS learning_progress (
    student_id TEXT NOT NULL,
    lesson_id TEXT NOT NULL,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (student_id, lesson_id)
  )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY,
      data JSONB NOT NULL
    )
  `);

  await pool.query(
    `INSERT INTO app_state (id, data)
     VALUES (1, $1::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(JSON.parse(fs.readFileSync(DATA_FILE, "utf8")))]
  );
  // A separate credential row prevents unrelated profile/report writes undoing a password change.
  const existing = await loadDb();
  for(const user of existing.users || []){
    if(user.passwordHash) await insertCredential(user.id,user.passwordHash);
  }
  await pool.query(`UPDATE app_state SET data=jsonb_set(data,'{users}',
    COALESCE((SELECT jsonb_agg(u - 'passwordHash') FROM jsonb_array_elements(data->'users') u),'[]'::jsonb)) WHERE id=1`);
  const coachEmail = normalizeEmail(process.env.COACH_EMAIL);
const coachPassword = process.env.COACH_PASSWORD || "";
authDiagnostic(coachEmail ? "COACH_EMAIL_PRESENT" : "COACH_EMAIL_MISSING");
authDiagnostic(coachPassword ? "COACH_PASSWORD_PRESENT" : "COACH_PASSWORD_MISSING");
if(coachPassword){
  authDiagnostic(/[\r\n]/.test(coachPassword) ? "COACH_PASSWORD_HAS_LINE_BREAK" : "COACH_PASSWORD_NO_LINE_BREAK");
  authDiagnostic(coachPassword !== coachPassword.trim() ? "COACH_PASSWORD_HAS_EDGE_WHITESPACE" : "COACH_PASSWORD_NO_EDGE_WHITESPACE");
}

if (coachEmail && coachPassword) {
  const existingCoach=(await loadDb()).users.find(u=>normalizeEmail(u.email)===coachEmail);
  if(existingCoach){authDiagnostic('COACH_EXISTING_PASSWORD_PRESERVED');return;}
  if(!validPassword(coachPassword))throw new Error('Initial COACH_PASSWORD must contain 15–128 characters and no line breaks.');
  const hash=await hashPassword(coachPassword);
  await mutateDb(async(db,client)=>{
    if(db.users.some(u=>normalizeEmail(u.email)===coachEmail))return;
    const coach={id:makeId('u'),name:'Efe-Sam Agalivie',email:coachEmail,role:'coach'};
    await client.query('INSERT INTO user_credentials (user_id,password_hash) VALUES ($1,$2) ON CONFLICT (user_id) DO NOTHING',[coach.id,hash]);
    db.users.push(coach);
  });
  authDiagnostic('COACH_ACCOUNT_READY');
}
}
async function loadDb(){
 const result=await pool.query("SELECT data FROM app_state WHERE id = 1");
 return result.rows[0]?.data || {users:[],athletes:[],reports:[],transcripts:[]};
}
// All state writers use one short database transaction, shared across app instances.
// Hashing and provider calls must finish before entering this critical section.
async function mutateDb(change){
 const client=await pool.connect();
 try{
   await client.query('BEGIN');
   const result=await client.query('SELECT data FROM app_state WHERE id = 1 FOR UPDATE');
   if(!result.rows[0])throw new Error('Application state is missing');
   const db=result.rows[0].data;
   const value=await change(db,client);
   await client.query('UPDATE app_state SET data = $1 WHERE id = 1',[db]);
   await client.query('COMMIT');
   return value;
 }catch(error){
   try{await client.query('ROLLBACK');}catch(rollbackError){console.error('State rollback failed',rollbackError);}
   throw error;
 }finally{client.release();}
}
function stateError(status,message){return Object.assign(new Error(message),{status,publicMessage:message});}

function parseCookies(req){
  return Object.fromEntries((req.headers.cookie||"").split(";").filter(Boolean).map(x=>{
    const i=x.indexOf("="); return [x.slice(0,i).trim(), decodeURIComponent(x.slice(i+1))];
  }));
}
async function getUser(req){
  const token=parseCookies(req).sb_session;
  if(!token || !sessions.has(token)) return null;
  const db= await loadDb();
  const session=sessions.get(token);
  if(session.expires<=Date.now()){sessions.delete(token);return null;}
  const saved=await credential(session.userId);
  if(!saved || saved.version!==session.version){sessions.delete(token);return null;}
  return db.users.find(u=>u.id===session.userId) || null;
}
async function requireUser(req,res){
  const u=await getUser(req); if(!u){json(res,401,{error:"Unauthorized"}); return null;} return u;
}
function contentType(file){
  const ext=path.extname(file);
  return ({".html":"text/html",".css":"text/css",".js":"application/javascript",".json":"application/json",".svg":"image/svg+xml"}[ext]||"application/octet-stream");
}
function serveStatic(req,res){
  let rel=req.url.split("?")[0];
  if(rel==="/") rel="/index.html";
  const file=path.join(PUBLIC, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));
  if(!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){
    res.writeHead(404); return res.end("Not found");
  }
  const recovery=path.basename(file).startsWith('password-recovery.');
  res.writeHead(200,{...RESPONSE_HEADERS,"Content-Type":contentType(file),"Cache-Control":recovery?'no-store':'no-cache',...(recovery?{'Referrer-Policy':'no-referrer'}:{})}); fs.createReadStream(file).pipe(res);
}
function makeId(prefix){ return prefix+"_"+crypto.randomBytes(6).toString("hex"); }
function clean(v,max=200){ return String(v??"").trim().slice(0,max); }

function outputText(resp){
  if(typeof resp.output_text==="string") return resp.output_text;
  const chunks=[];
  for(const item of (resp.output||[])){
    for(const c of (item.content||[])){
      if(c.type==="output_text" && c.text) chunks.push(c.text);
    }
  }
  return chunks.join("\n");
}

const server=http.createServer(async (req,res)=>{
  try{
    const url=new URL(req.url, `http://${req.headers.host}`);

    if(req.method==='POST' && ['/api/forgot-password','/api/reset-password'].includes(url.pathname)){
      if(!(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))return json(res,415,{error:'JSON required.'});
      try{
        let body;
        try{body=JSON.parse((await readBody(req,4096)).toString());}catch(error){return json(res,error.status===413?413:400,{error:'Invalid request.'});}
        if(!body || typeof body!=='object' || Array.isArray(body))return json(res,400,{error:'Invalid request.'});
        if(url.pathname==='/api/forgot-password')return json(res,200,await passwordRecovery.request(body.email));
        if(!allowAuth('reset:'+sha(typeof body.token==='string'?body.token:'')))return json(res,429,{error:'Too many attempts. Please try again in one minute.'});
        const userId=await passwordRecovery.reset(body);
        for(const [token,session] of sessions)if(session.userId===userId)sessions.delete(token);
        return json(res,200,{ok:true});
      }catch(error){
        if(error.publicMessage)return json(res,error.status,{error:error.publicMessage,...(error.retryAfter?{retryAfter:error.retryAfter}:{})});
        if(error.status===429)return json(res,429,{error:'Too many attempts. Please try again shortly.'});
        authDiagnostic('PASSWORD_RECOVERY_FAILED');
        return json(res,503,{error:'Password recovery is temporarily unavailable. Please try again later.'});
      }
    }


    if(req.method==="POST" && url.pathname==="/api/register-athlete"){
      const body=JSON.parse((await readBody(req)).toString()||"{}");
      const required=["name","email","password","country","university","major"];
      const missing=required.filter(k=>!clean(body[k]));
      if(missing.length) return json(res,400,{error:"Please complete: "+missing.map(k=>({university:"school / university",major:"subjects / program / research area"}[k]||k)).join(", ")});
      if(!validPassword(body.password)) return json(res,400,{error:"Use a password of 15–128 characters with no line breaks."});
      const email=clean(body.email,160).toLowerCase();
      if(!allowAuth('register:'+sha(email)))return json(res,429,{error:'Too many attempts. Please try again in one minute.'});
      if(!/^\S+@\S+\.\S+$/.test(email)) return json(res,400,{error:"Enter a valid email address."});
      const hash=await hashPassword(body.password);
      const userId=makeId("u"); const athleteId=makeId("a");
      await mutateDb(async(db,client)=>{
      if(db.users.some(u=>normalizeEmail(u.email)===email))throw stateError(409,"An account with this email already exists.");
      await client.query('INSERT INTO user_credentials (user_id,password_hash) VALUES ($1,$2) ON CONFLICT (user_id) DO NOTHING',[userId,hash]);
      db.users.push({id:userId,name:clean(body.name,120),email,role:"athlete"});
      db.athletes.push({
        id:athleteId,userId,name:clean(body.name,120),email,
        phone:clean(body.phone,40),country:clean(body.country,80),
        interviewLocation:clean(body.interviewLocation,120),university:clean(body.university,160),
        major:clean(body.major,160),academicLevel:clean(body.academicLevel,80),sport:clean(body.sport,120),
        scholarship:clean(body.scholarshipType,120),scholarshipCoverage:clean(body.scholarshipCoverage,240),
        previousRefusal:clean(body.previousRefusal,20),previousAttempts:Number(body.previousAttempts||0),
        previousTravel:clean(body.previousTravel,20),remainingSponsor:clean(body.remainingSponsor,160),
        postGradPlan:clean(body.postGradPlan,500),profileStatus:"Complete",createdAt:new Date().toISOString(),
        sessions:0,mocks:0,initialScore:0,currentScore:0,mainConcern:"New student — not yet assessed"
      });
      });
      const token=startSession(userId,0);
      res.writeHead(201,{"Content-Type":"application/json","Cache-Control":"no-store","Set-Cookie":sessionCookie(token)});
      return res.end(JSON.stringify({ok:true,user:{id:userId,name:clean(body.name,120),role:"athlete",email}}));
    }

    if(req.method==="POST" && url.pathname==="/api/login"){
      const body=JSON.parse((await readBody(req)).toString()||"{}");
      const db=await loadDb();
      const email=normalizeEmail(body.email);
      if(!allowAuth('login:'+sha(email)))return json(res,429,{error:'Too many attempts. Please try again in one minute.'});
      const user=email ? db.users.find(u=>normalizeEmail(u.email)===email) : null;
      let saved=user?await credential(user.id):null;
      if(!user || !saved || !await verifyPassword(body.password,saved.password_hash)){
        const reference="auth2-"+crypto.randomBytes(6).toString("hex");
        // Bounded, non-secret correlation: no credential values or fingerprints.
        if(loginTraceCount++ < 100) console.warn("[auth] LOGIN_REJECTED reference="+reference);
        authDiagnostic(user ? "LOGIN_PASSWORD_MISMATCH" : "LOGIN_ACCOUNT_NOT_FOUND");
        if(email && email===normalizeEmail(process.env.COACH_EMAIL)){
          authDiagnostic("LOGIN_TARGETS_CONFIGURED_COACH");
        }
        return json(res,401,{error:"Invalid email or password",reference});
      }
      if(legacyHash(saved.password_hash)){
        const next=await replaceCredential(user.id,saved,await hashPassword(body.password));
        if(!next)return json(res,409,{error:'Account changed during sign-in. Please sign in again.'});
        saved.version=next.version;
      }
      const token=startSession(user.id,saved.version);
      res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store","Set-Cookie":sessionCookie(token)});
      return res.end(JSON.stringify({ok:true,user:{id:user.id,name:user.name,role:user.role,email:user.email}}));
    }

    if(req.method==='POST' && url.pathname==='/api/change-password'){
      const u=await requireUser(req,res);if(!u)return;
      if(!allowAuth('change:'+u.id))return json(res,429,{error:'Too many attempts. Please try again in one minute.'});
      // JSON-only protects this cookie-authenticated endpoint from cross-site form submissions.
      if(!(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))return json(res,415,{error:'JSON required.'});
      const body=JSON.parse((await readBody(req)).toString()||'{}');
      if(!validPassword(body.newPassword))return json(res,400,{error:'Use a password of 15–128 characters with no line breaks.'});
      if(body.newPassword!==body.confirmPassword)return json(res,400,{error:'New passwords do not match.'});
      if(body.newPassword===body.currentPassword)return json(res,400,{error:'Choose a different new password.'});
      const saved=await credential(u.id);
      if(!saved || !await verifyPassword(body.currentPassword,saved.password_hash))return json(res,400,{error:'Current password is incorrect.'});
      const changed=await replaceCredential(u.id,saved,await hashPassword(body.newPassword));
      if(!changed)return json(res,409,{error:'Password changed in another session. Please sign in again.'});
      for(const [token,session] of sessions)if(session.userId===u.id)sessions.delete(token);
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':sessionCookie('',true)});
      return res.end(JSON.stringify({ok:true}));
    }

    if(req.method==="POST" && url.pathname==="/api/logout"){
      const token=parseCookies(req).sb_session; if(token) sessions.delete(token);
      res.writeHead(200,{"Content-Type":"application/json","Set-Cookie":sessionCookie('',true)});
      return res.end(JSON.stringify({ok:true}));
    }

    if(req.method==="GET" && url.pathname==="/api/me"){
      const u=await requireUser(req,res); if(!u) return;
      return json(res,200,{id:u.id,name:u.name,role:u.role,email:u.email});
    }


    if(req.method==="GET" && url.pathname==="/api/my-profile"){
      const u=await requireUser(req,res); if(!u) return;
      if(u.role!=="athlete") return json(res,403,{error:"Student access required"});
      const db=await loadDb(); const athlete=db.athletes.find(a=>a.userId===u.id);
      if(!athlete) return json(res,404,{error:"Student profile not found"});
      return json(res,200,athlete);
    }

    if(req.method==="PUT" && url.pathname==="/api/my-profile"){
      const u=await requireUser(req,res); if(!u) return;
      if(u.role!=="athlete") return json(res,403,{error:"Student access required"});
      const body=JSON.parse((await readBody(req)).toString()||"{}");
      const updated=await mutateDb(async(db)=>{
      const athlete=db.athletes.find(a=>a.userId===u.id);
      if(!athlete)throw stateError(404,"Student profile not found");
      const fields={phone:40,country:80,interviewLocation:120,university:160,major:160,academicLevel:80,sport:120,scholarship:120,scholarshipCoverage:240,previousRefusal:20,previousTravel:20,remainingSponsor:160,postGradPlan:500};
      for(const [k,max] of Object.entries(fields)) if(k in body) athlete[k]=clean(body[k],max);
      if("previousAttempts" in body) athlete.previousAttempts=Math.max(0,Number(body.previousAttempts||0));
      athlete.updatedAt=new Date().toISOString(); return athlete;
      });
      return json(res,200,updated);
    }

    if(req.method==="GET" && url.pathname==="/api/athletes"){
      const u=await requireUser(req,res); if(!u) return;
      const db=await loadDb();
      let athletes=db.athletes;
      if(u.role==="athlete") athletes=athletes.filter(a=>a.userId===u.id);
      return json(res,200,athletes);
    }

    if(req.method==="GET" && url.pathname==="/api/reports"){
      const u=await requireUser(req,res); if(!u) return;
      const db=await loadDb();
      let reports=db.reports;
      if(u.role==="athlete"){
        const athlete=db.athletes.find(a=>a.userId===u.id);
        reports=reports.filter(r=>r.athleteId===athlete?.id);
      }
      return json(res,200,reports);
    }

    if(req.method==="POST" && url.pathname==="/api/human-review"){
      const u=await requireUser(req,res); if(!u) return;
      if(!["coach","supervisor"].includes(u.role)) return json(res,403,{error:"Coach or supervisor access required"});
      const body=JSON.parse((await readBody(req)).toString()||"{}");
      const updated=await mutateDb(async(db)=>{
      const report=db.reports.find(r=>r.id===body.reportId);
      if(!report)throw stateError(404,"Report not found");
      report.humanReview={score:Number(body.score),note:String(body.note||""),reviewer:u.name,reviewedAt:new Date().toISOString()};
      return report;
      });
      return json(res,200,updated);
    }

    if(req.method==="POST" && url.pathname==="/api/save-transcript"){
      const u=await requireUser(req,res); if(!u) return;
      const body=JSON.parse((await readBody(req)).toString()||"{}");
      await mutateDb(async(db)=>{
      const athlete=db.athletes.find(a=>a.id===body.athleteId);
      if(!canAccessStudent(u,athlete)) throw stateError(403,"You cannot save a transcript for this student.");
      db.transcripts.push({
        id:"tr_"+crypto.randomBytes(6).toString("hex"),
        athleteId:athlete.id,
        userId:u.id,
        transcript:Array.isArray(body.transcript)?body.transcript:[],
        createdAt:new Date().toISOString()
      });
      });
      return json(res,200,{ok:true});
    }

    if(req.method==="POST" && url.pathname==="/api/evaluate"){
      const u=await requireUser(req,res); if(!u) return;
      const body=JSON.parse((await readBody(req)).toString()||"{}");
      const db=await loadDb();
      const athlete=db.athletes.find(a=>a.id===body.athleteId);
      if(!canAccessStudent(u,athlete)) return json(res,403,{error:"You cannot generate a report for this student."});
      if(!OPENAI_API_KEY) return json(res,503,{error:"OPENAI_API_KEY is not configured on the server."});

      let interview;
      try{interview=normalizeTranscript(body.transcript);}catch(error){return json(res,400,{error:error.message});}
      const evaluationKey=sha(JSON.stringify([u.id,athlete.id,EVALUATION_MODEL,interview]));
      const previous=db.reports.find(report=>report.evaluationKey===evaluationKey);
      if(previous)return json(res,200,previous);
      const lease=await evaluationLimits.reserve(u.id);
      if(!lease)return json(res,429,{error:"A report is already processing, or you have used today's six report attempts. Daily limits reset at midnight UTC."});
      try{
      // Recheck after admission in case another request finished between the first lookup and reservation.
      const cached=(await loadDb()).reports.find(report=>report.evaluationKey===evaluationKey);
      if(cached)return json(res,200,cached);
      const rubric = {
        purpose_of_study:15, university_knowledge:15, major_knowledge:15, scholarship_finances:15,
        post_graduation_plans:15, application_knowledge:10, communication:10, consistency_honesty:5
      };

      const prompt = `You are evaluating an F-1 student visa MOCK INTERVIEW for preparation quality only.
Never predict visa approval and never state an approval probability. Score only interview readiness.
${studyLevelInstructions(athlete)}

Embassy-specific preparation context:
${JSON.stringify(loadEmbassyKnowledge(athlete.interviewLocation))}

Use the rubric above to evaluate the student's interview readiness. Give specific feedback based on the student's actual answers, academic background, scholarship and funding, and post-graduation plans. Use the embassy-specific context when relevant, but do not treat reported interview patterns as official embassy rules. Do not invent current embassy trends, applicant facts, or visa approval probabilities. If no location-specific knowledge is available, use general F-1 preparation guidance only.
Student profile:
${JSON.stringify(athlete,null,2)}

Transcript:
${JSON.stringify(interview,null,2)}

Rubric maximums:
${JSON.stringify(rubric)}

Return ONLY strict JSON matching:
{
 "scores":{"purpose_of_study":0,"university_knowledge":0,"major_knowledge":0,"scholarship_finances":0,"post_graduation_plans":0,"application_knowledge":0,"communication":0,"consistency_honesty":0},
 "overall":0,
 "readiness":"Ready|Almost Ready|Needs Significant Prep|High Concern",
 "summary":"One short sentence summarizing this practice interview.",
 "priority":"The single most useful point to clarify next.",
 "strengths":["One specific strength supported by an answer."],
 "clarifications":["One point needing clarification, tied to an actual answer."],
 "nextSteps":["First concrete practice action.","Second concrete practice action.","Third concrete practice action."]
}
Keep the entire written feedback under 180 words. Write directly to the student using "you" and plain language.
Return 0–3 strengths, 1–3 clarifications, and exactly 3 nextSteps. Each item must be one short sentence, at most 30 words and 240 characters. summary and priority must each be at most 240 characters.
Tie feedback to actual answers. If evidence is too limited to identify a strength, return an empty strengths array; never invent praise. Distinguish "not discussed" from "incorrect". If a transcript phrase looks mistranscribed, ask for clarification rather than treating it as an established fact. Do not penalize accent or require native-speaker grammar; assess whether meaning is clear. Do not invent facts, motivations, funding, or post-study plans for the student, and never tell them to replace their genuine intentions with a preferred answer. Do not give legal determinations or visa approval predictions.
Use only information in the supplied profile and transcript. Do not reward invented facts or memorized-sounding certainty.`;

      const r=await fetch("https://api.openai.com/v1/responses",{
        method:"POST",
        headers:{
          "Authorization":`Bearer ${OPENAI_API_KEY}`,
          "Content-Type":"application/json",
          "OpenAI-Safety-Identifier":sha(u.id).slice(0,32)
        },
        signal:AbortSignal.timeout(EVALUATION_POLICY.timeoutMs),
        body:JSON.stringify({model:EVALUATION_MODEL,input:prompt,max_output_tokens:EVALUATION_POLICY.outputTokens,store:false})
      });
      const api=await r.json();
      if(!r.ok)return json(res,502,{error:"Report generation is temporarily unavailable. Please try again later."});
      if(api.status==="incomplete")return json(res,502,{error:"The report could not finish within its output limit. Please try again later."});
      let text=outputText(api).trim().replace(/^```json\s*/,"").replace(/```$/,"").trim();
      let result;
      try{ result=JSON.parse(text); }catch(e){ return json(res,502,{error:"Evaluation could not be completed. Please try again."}); }

      const structured=result && ("summary" in Object(result) || "nextSteps" in Object(result));
      if(structured){
        const short=value=>typeof value==='string'&&value.trim().length>0&&value.length<=240&&value.trim().split(/\s+/).length<=30;
        const list=(value,min,max)=>Array.isArray(value)&&value.length>=min&&value.length<=max&&value.every(short);
        if(!short(result.summary)||!short(result.priority)||!list(result.strengths,0,3)||!list(result.clarifications,1,3)||!list(result.nextSteps,3,3)){
          return json(res,502,{error:"The report format was incomplete. Please try again later."});
        }
        // Retain legacy text fields for older clients without rewriting saved reports.
        result.feedback=result.summary;result.biggestWeakness=result.priority;result.nextStep=result.nextSteps.join(' ');
      }
      if(!result || typeof result!=="object" || !Number.isFinite(result.overall) || result.overall<0 || result.overall>100 ||
         ["biggestWeakness","feedback","nextStep"].some(k=>typeof result[k]!=="string" || result[k].length>10000)){
        return json(res,502,{error:"Evaluation could not be completed. Please try again."});
      }
      // Provider output can describe feedback, but cannot choose ownership or identifiers.
      const safeScores={};
      for(const [key,max] of Object.entries(rubric)){
        const value=result.scores?.[key];
        if(Number.isFinite(value)&&value>=0&&value<=max)safeScores[key]=value;
      }
      const savedReport=await mutateDb(async(current)=>{
      const currentAthlete=current.athletes.find(a=>a.id===athlete.id);
      if(!canAccessStudent(u,currentAthlete))throw stateError(403,"You cannot generate a report for this student.");
      const report={
        id:"rp_"+crypto.randomBytes(6).toString("hex"),
        athleteId:athlete.id,evaluationKey,
        mockNumber:(current.reports.filter(x=>x.athleteId===athlete.id).length+1),
        createdAt:new Date().toISOString(),
        scores:safeScores,overall:result.overall,
        readiness:result.overall>=85?"Ready":result.overall>=70?"Almost Ready":result.overall>=55?"Needs Significant Prep":"High Concern",
        biggestWeakness:result.biggestWeakness,feedback:result.feedback,nextStep:result.nextStep,
        ...(structured?{formatVersion:2,strengths:result.strengths,clarifications:result.clarifications,nextSteps:result.nextSteps}:{}),
        humanReview:null
      };
      current.reports.push(report);
      currentAthlete.currentScore=result.overall;
      currentAthlete.mocks=(currentAthlete.mocks||0)+1;
      return report;
      });
      return json(res,200,savedReport);
      }catch(error){
        if(error.name==='TimeoutError'||error.name==='AbortError')return json(res,504,{error:"Report generation timed out. Please try again later."});
        throw error;
      }finally{
        try{await evaluationLimits.release(u.id,lease);}catch{console.error('[evaluation] LEASE_RELEASE_FAILED');}
      }
    }

    if(url.pathname.startsWith("/api/learning/") && ["GET", "PUT"].includes(req.method)){
      const lessonId=url.pathname.slice("/api/learning/".length);
      if(!LESSONS.some(lesson=>lesson.id===lessonId))return json(res,404,{error:"Unknown lesson"});
      const u=await requireUser(req,res); if(!u) return;
      const db=await loadDb();
      const student=db.athletes.find(a=>a.id===url.searchParams.get("athleteId"));
      if(!canAccessStudent(u,student)) return json(res,403,{error:"You cannot access this student's learning."});
      if(req.method === "GET"){
        const result=await pool.query("SELECT data FROM learning_progress WHERE student_id=$1 AND lesson_id=$2",[student.id,lessonId]);
        return json(res,200,{progress:result.rows[0]?.data || {}});
      }
      let progress;
      try{progress=normalizeProgress(JSON.parse((await readBody(req)).toString()||"{}"))}
      catch(error){return json(res,400,{error:error.message})}
      progress.updatedAt=new Date().toISOString();
      await pool.query(`INSERT INTO learning_progress (student_id,lesson_id,data) VALUES ($1,$2,$3::jsonb)
        ON CONFLICT (student_id,lesson_id) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()`,[student.id,lessonId,JSON.stringify(progress)]);
      return json(res,200,{progress});
    }

    if(req.method==="POST" && url.pathname==="/api/realtime-session"){
      const u=await requireUser(req,res); if(!u) return;
      if(!OPENAI_API_KEY) return json(res,503,{error:"OPENAI_API_KEY is not configured on the server."});
      const athleteId=url.searchParams.get("athleteId");
      const db=await loadDb();
      const athlete=db.athletes.find(a=>a.id===athleteId);
      if(!athlete) return json(res,404,{error:"Student not found"});
      if(!canAccessStudent(u,athlete)) return json(res,403,{error:"You cannot start a session for this student."});
      const mode=url.searchParams.get("mode") || "mock";
      if(!["mock","learn"].includes(mode)) return json(res,400,{error:"Unknown session mode"});
      if(mode==="learn" && !LESSONS.some(lesson=>lesson.id===url.searchParams.get("lesson"))) return json(res,400,{error:"Unknown lesson"});
      const sdp=(await readBody(req)).toString();
      if(!sdp.startsWith('v=0') || sdp.length>64000)return json(res,400,{error:'Invalid voice connection offer.'});
      if(!await voiceLimits.reserve(u.id))return json(res,429,{error:'Daily voice limit reached (6 starts per account). Try again after midnight UTC. Your learning notes remain available.'});
const embassyKnowledge = loadEmbassyKnowledge(athlete.interviewLocation);
      let instructions=`You are a realistic but fair F-1 student visa mock interviewer for VisaAtlas.
You are speaking with ${athlete.name}.
${studyLevelInstructions(athlete)}
Known profile: school=${athlete.university}; major=${athlete.major}; sport=${athlete.sport}; scholarship=${athlete.scholarship}; interview location=${athlete.interviewLocation}.
Embassy-specific preparation context:
${embassyKnowledge ? JSON.stringify(embassyKnowledge) : "No location-specific knowledge available. Use general F-1 preparation guidance only."}

Use this context to guide the mock interview, not as official embassy policy. Ask natural follow-up questions based on the student's profile and answers. Adapt questions to the student's academic level and interview timing. Do not invent location-specific facts or treat reported interview patterns as guarantees.
Conduct a natural spoken mock interview. Ask ONE question at a time. Listen to the answer, then ask a relevant follow-up based on what was actually said.
Cover purpose of study, university choice, major knowledge, scholarship/finances, post-graduation plans, and application knowledge.
Do not coach during the interview. Do not tell the student what answer to give.
Do not predict whether a visa will be approved and do not give a visa approval percentage.
If an answer sounds memorized, vague, inconsistent, or unsupported, probe naturally.
Keep each interviewer turn concise, usually one question.
Start by greeting the student and asking why they are going to the United States.`;

      if(mode==="learn"){
        const saved=await pool.query("SELECT data FROM learning_progress WHERE student_id=$1 AND lesson_id=$2",[athlete.id,url.searchParams.get("lesson")]);
        instructions=tutorInstructions(athlete,saved.rows[0]?.data || {},url.searchParams.get("lesson"));
      }
      const fd=new FormData();
      fd.set("sdp",sdp);
      fd.set("session",JSON.stringify({
        type:"realtime",
        model:"gpt-realtime-2.1",
        max_output_tokens:POLICY[mode].tokens,
        instructions,
        audio:{
          input:{
  transcription:{model:"gpt-transcribe"},
  noise_reduction:{type:"far_field"},
  turn_detection:{
    type:"server_vad",
    threshold:0.75,
    prefix_padding_ms:300,
    silence_duration_ms:1400,
    create_response:false,
    interrupt_response:false
  }
},
          output:{voice:"marin"}
        }
      }));

      const rr=await fetch("https://api.openai.com/v1/realtime/calls",{
        method:"POST",
        headers:{
          "Authorization":`Bearer ${OPENAI_API_KEY}`,
          "OpenAI-Safety-Identifier":sha(u.id).slice(0,32)
        },
        body:fd,
        signal:AbortSignal.timeout(30000)
      });
      const answer=await rr.text();
      if(!rr.ok)return json(res,502,{error:'The voice service could not connect. Please try again later.'});
      const seconds=await voiceLimits.track(rr.headers.get('location'),mode);
      res.writeHead(rr.status,{"Content-Type":"application/sdp","Cache-Control":"no-store","X-Voice-Limit-Seconds":String(seconds)});
      return res.end(answer);
    }

    return serveStatic(req,res);
  }catch(err){
    if(err.status===429||err.status===413)return json(res,err.status,{error:err.message});
    if(err.publicMessage)return json(res,err.status,{error:err.publicMessage});
    console.error(err);
    return json(res,500,{error:"Server error"});
  }
});
initDb().then(()=>passwordRecovery.init()).then(()=>voiceLimits.init()).then(()=>evaluationLimits.init()).then(() => {
  voiceLimits.start();
  passwordRecovery.start();
  server.listen(PORT, () => console.log(`VisaAtlas demo running on http://localhost:${PORT}`));
}).catch(err => {
  console.error("Database initialization failed:", err);
  process.exit(1);
});
