
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const EVALUATION_MODEL = process.env.EVALUATION_MODEL || "gpt-5.6";
const PUBLIC = path.join(__dirname, "public");
const DATA_FILE = path.join(__dirname, "data", "db.json");
const sessions = new Map();

function sha(v){ return crypto.createHash("sha256").update(v).digest("hex"); }


function json(res, code, obj){
  res.writeHead(code, {"Content-Type":"application/json","Cache-Control":"no-store"});
  res.end(JSON.stringify(obj));
}
function readBody(req){
  return new Promise((resolve,reject)=>{
    let chunks=[]; req.on("data",c=>chunks.push(c)); req.on("end",()=>resolve(Buffer.concat(chunks)));
    req.on("error",reject);
  });
}async function initDb(){
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
  const coachEmail = (process.env.COACH_EMAIL || "").trim().toLowerCase();
const coachPassword = process.env.COACH_PASSWORD || "";

if (coachEmail && coachPassword) {
  const db = await loadDb();
  db.users = Array.isArray(db.users) ? db.users : [];

  let coach = db.users.find(
    u => (u.email || "").toLowerCase() === coachEmail
  );

  if (!coach) {
    coach = {
      id: "u_" + crypto.randomBytes(6).toString("hex"),
      name: "Efe-Sam Agalivie",
      email: coachEmail
    };
    db.users.push(coach);
  }

  coach.name = "Efe-Sam Agalivie";
  coach.role = "coach";
  coach.passwordHash = sha(coachPassword);

  await saveDb(db);
}
}
async function loadDb(){
const result = await pool.query("SELECT data FROM app_state WHERE id = 1");
 return result.rows[0]?.data || { users: [], athletes: [], reports: [], transcripts: [] };
}
async function saveDb(db){
  await pool.query("UPDATE app_state SET data = $1 WHERE id = 1", [db]);
}
function parseCookies(req){
  return Object.fromEntries((req.headers.cookie||"").split(";").filter(Boolean).map(x=>{
    const i=x.indexOf("="); return [x.slice(0,i).trim(), decodeURIComponent(x.slice(i+1))];
  }));
}
async function getUser(req){
  const token=parseCookies(req).sb_session;
  if(!token || !sessions.has(token)) return null;
  const db= await loadDb();
  return db.users.find(u=>u.id===sessions.get(token)) || null;
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
  res.writeHead(200,{"Content-Type":contentType(file)}); fs.createReadStream(file).pipe(res);
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


    if(req.method==="POST" && url.pathname==="/api/register-athlete"){
      const body=JSON.parse((await readBody(req)).toString()||"{}");
      const required=["name","email","password","country","sport","university","major"];
      const missing=required.filter(k=>!clean(body[k]));
      if(missing.length) return json(res,400,{error:"Please complete: "+missing.join(", ")});
      if(clean(body.password).length<8) return json(res,400,{error:"Password must be at least 8 characters."});
      const email=clean(body.email,160).toLowerCase();
      if(!/^\S+@\S+\.\S+$/.test(email)) return json(res,400,{error:"Enter a valid email address."});
      const db=await loadDb();
      if(db.users.some(u=>u.email.toLowerCase()===email)) return json(res,409,{error:"An account with this email already exists."});
      const userId=makeId("u"); const athleteId=makeId("a");
      db.users.push({id:userId,name:clean(body.name,120),email,role:"athlete",passwordHash:sha(body.password)});
      db.athletes.push({
        id:athleteId,userId,name:clean(body.name,120),email,
        phone:clean(body.phone,40),country:clean(body.country,80),
        interviewLocation:clean(body.interviewLocation,120),university:clean(body.university,160),
        major:clean(body.major,160),academicLevel:clean(body.academicLevel,80),sport:clean(body.sport,120),
        scholarship:clean(body.scholarshipType,120),scholarshipCoverage:clean(body.scholarshipCoverage,240),
        previousRefusal:clean(body.previousRefusal,20),previousAttempts:Number(body.previousAttempts||0),
        previousTravel:clean(body.previousTravel,20),remainingSponsor:clean(body.remainingSponsor,160),
        postGradPlan:clean(body.postGradPlan,500),profileStatus:"Complete",createdAt:new Date().toISOString(),
        sessions:0,mocks:0,initialScore:0,currentScore:0,mainConcern:"New athlete — not yet assessed"
      });
      await saveDb(db);
      const token=crypto.randomBytes(24).toString("hex"); sessions.set(token,userId);
      res.writeHead(201,{"Content-Type":"application/json","Set-Cookie":`sb_session=${token}; HttpOnly; SameSite=Lax; Path=/`});
      return res.end(JSON.stringify({ok:true,user:{id:userId,name:clean(body.name,120),role:"athlete",email}}));
    }

    if(req.method==="POST" && url.pathname==="/api/login"){
      const body=JSON.parse((await readBody(req)).toString()||"{}");
      const db=await loadDb();
      const user=db.users.find(u=>u.email.toLowerCase()===(body.email||"").toLowerCase());
      if(!user || user.passwordHash!==sha(body.password||"")) return json(res,401,{error:"Invalid email or password"});
      const token=crypto.randomBytes(24).toString("hex"); sessions.set(token,user.id);
      res.writeHead(200,{"Content-Type":"application/json","Set-Cookie":`sb_session=${token}; HttpOnly; SameSite=Lax; Path=/`});
      return res.end(JSON.stringify({ok:true,user:{id:user.id,name:user.name,role:user.role,email:user.email}}));
    }

    if(req.method==="POST" && url.pathname==="/api/logout"){
      const token=parseCookies(req).sb_session; if(token) sessions.delete(token);
      res.writeHead(200,{"Content-Type":"application/json","Set-Cookie":"sb_session=; HttpOnly; Max-Age=0; SameSite=Lax; Path=/"});
      return res.end(JSON.stringify({ok:true}));
    }

    if(req.method==="GET" && url.pathname==="/api/me"){
      const u=await requireUser(req,res); if(!u) return;
      return json(res,200,{id:u.id,name:u.name,role:u.role,email:u.email});
    }


    if(req.method==="GET" && url.pathname==="/api/my-profile"){
      const u=await requireUser(req,res); if(!u) return;
      if(u.role!=="athlete") return json(res,403,{error:"Athlete access required"});
      const db=await loadDb(); const athlete=db.athletes.find(a=>a.userId===u.id);
      if(!athlete) return json(res,404,{error:"Athlete profile not found"});
      return json(res,200,athlete);
    }

    if(req.method==="PUT" && url.pathname==="/api/my-profile"){
      const u=await requireUser(req,res); if(!u) return;
      if(u.role!=="athlete") return json(res,403,{error:"Athlete access required"});
      const body=JSON.parse((await readBody(req)).toString()||"{}");
      const db=await loadDb(); const athlete=db.athletes.find(a=>a.userId===u.id);
      if(!athlete) return json(res,404,{error:"Athlete profile not found"});
      const fields={phone:40,country:80,interviewLocation:120,university:160,major:160,academicLevel:80,sport:120,scholarship:120,scholarshipCoverage:240,previousRefusal:20,previousTravel:20,remainingSponsor:160,postGradPlan:500};
      for(const [k,max] of Object.entries(fields)) if(k in body) athlete[k]=clean(body[k],max);
      if("previousAttempts" in body) athlete.previousAttempts=Math.max(0,Number(body.previousAttempts||0));
      athlete.updatedAt=new Date().toISOString(); await saveDb(db); return json(res,200,athlete);
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
      const db=await  loadDb();
      const report=db.reports.find(r=>r.id===body.reportId);
      if(!report) return json(res,404,{error:"Report not found"});
      report.humanReview={score:Number(body.score),note:String(body.note||""),reviewer:u.name,reviewedAt:new Date().toISOString()};
      await saveDb(db); return json(res,200,report);
    }

    if(req.method==="POST" && url.pathname==="/api/save-transcript"){
      const u=await requireUser(req,res); if(!u) return;
      const body=JSON.parse((await readBody(req)).toString()||"{}");
      const db=await loadDb();
      db.transcripts.push({
        id:"tr_"+crypto.randomBytes(6).toString("hex"),
        athleteId:body.athleteId,
        userId:u.id,
        transcript:Array.isArray(body.transcript)?body.transcript:[],
        createdAt:new Date().toISOString()
      });
      await saveDb(db); return json(res,200,{ok:true});
    }

    if(req.method==="POST" && url.pathname==="/api/evaluate"){
      const u=await requireUser(req,res); if(!u) return;
      if(!OPENAI_API_KEY) return json(res,503,{error:"OPENAI_API_KEY is not configured on the server."});
      const body=JSON.parse((await readBody(req)).toString()||"{}");
      const db=await loadDb();
      const athlete=db.athletes.find(a=>a.id===body.athleteId);
      if(!athlete) return json(res,404,{error:"Athlete not found"});

      const rubric = {
        purpose_of_study:15, university_knowledge:15, major_knowledge:15, scholarship_finances:15,
        post_graduation_plans:15, application_knowledge:10, communication:10, consistency_honesty:5
      };

      const prompt = `You are evaluating an F-1 student visa MOCK INTERVIEW for preparation quality only.
Never predict visa approval and never state an approval probability. Score only interview readiness.
Athlete profile:
${JSON.stringify(athlete,null,2)}

Transcript:
${JSON.stringify(body.transcript||[],null,2)}

Rubric maximums:
${JSON.stringify(rubric)}

Return ONLY strict JSON matching:
{
 "scores":{"purpose_of_study":0,"university_knowledge":0,"major_knowledge":0,"scholarship_finances":0,"post_graduation_plans":0,"application_knowledge":0,"communication":0,"consistency_honesty":0},
 "overall":0,
 "readiness":"Ready|Almost Ready|Needs Significant Prep|High Concern",
 "biggestWeakness":"...",
 "feedback":"...",
 "nextStep":"..."
}
Use only information in the supplied profile and transcript. Do not reward invented facts or memorized-sounding certainty.`;

      const r=await fetch("https://api.openai.com/v1/responses",{
        method:"POST",
        headers:{
          "Authorization":`Bearer ${OPENAI_API_KEY}`,
          "Content-Type":"application/json",
          "OpenAI-Safety-Identifier":sha(u.id).slice(0,32)
        },
        body:JSON.stringify({model:EVALUATION_MODEL,input:prompt})
      });
      const api=await r.json();
      if(!r.ok) return json(res,r.status,{error:api.error?.message||"OpenAI evaluation failed"});
      let text=outputText(api).trim().replace(/^```json\s*/,"").replace(/```$/,"").trim();
      let result;
      try{ result=JSON.parse(text); }catch(e){ return json(res,502,{error:"Model returned non-JSON evaluation",raw:text}); }

      const report={
        id:"rp_"+crypto.randomBytes(6).toString("hex"),
        athleteId:athlete.id,
        mockNumber:(db.reports.filter(x=>x.athleteId===athlete.id).length+1),
        createdAt:new Date().toISOString(),
        ...result,
        humanReview:null
      };
      db.reports.push(report);
      athlete.currentScore=Number(result.overall||0);
      athlete.mocks=(athlete.mocks||0)+1;
      await saveDb(db);
      return json(res,200,report);
    }

    if(req.method==="POST" && url.pathname==="/api/realtime-session"){
      const u=await requireUser(req,res); if(!u) return;
      if(!OPENAI_API_KEY) return json(res,503,{error:"OPENAI_API_KEY is not configured on the server."});
      const athleteId=url.searchParams.get("athleteId");
      const db=await loadDb();
      const athlete=db.athletes.find(a=>a.id===athleteId);
      if(!athlete) return json(res,404,{error:"Athlete not found"});
      const sdp=(await readBody(req)).toString();

      const instructions=`You are a realistic but fair F-1 student visa mock interviewer for ScholarBook Visa Prep.
You are speaking with ${athlete.name}.
Known profile: university=${athlete.university}; major=${athlete.major}; sport=${athlete.sport}; scholarship=${athlete.scholarship}; interview location=${athlete.interviewLocation}.
Conduct a natural spoken mock interview. Ask ONE question at a time. Listen to the answer, then ask a relevant follow-up based on what was actually said.
Cover purpose of study, university choice, major knowledge, scholarship/finances, post-graduation plans, and application knowledge.
Do not coach during the interview. Do not tell the athlete what answer to give.
Do not predict whether a visa will be approved and do not give a visa approval percentage.
If an answer sounds memorized, vague, inconsistent, or unsupported, probe naturally.
Keep each interviewer turn concise, usually one question.
Start by greeting the athlete and asking why they are going to the United States.`;

      const fd=new FormData();
      fd.set("sdp",sdp);
      fd.set("session",JSON.stringify({
        type:"realtime",
        model:"gpt-realtime-2.1",
        instructions,
        audio:{
          input:{transcription:{model:"gpt-transcribe"}},
          output:{voice:"marin"}
        }
      }));

      const rr=await fetch("https://api.openai.com/v1/realtime/calls",{
        method:"POST",
        headers:{
          "Authorization":`Bearer ${OPENAI_API_KEY}`,
          "OpenAI-Safety-Identifier":sha(u.id).slice(0,32)
        },
        body:fd
      });
      const answer=await rr.text();
      res.writeHead(rr.status,{"Content-Type":"application/sdp"});
      return res.end(answer);
    }

    return serveStatic(req,res);
  }catch(err){
    console.error(err);
    return json(res,500,{error:"Server error",detail:String(err.message||err)});
  }
});
initDb().then(() => {
  server.listen(PORT, () => console.log(`ScholarBook Visa Prep demo running on http://localhost:${PORT}`));
}).catch(err => {
  console.error("Database initialization failed:", err);
  process.exit(1);
});

