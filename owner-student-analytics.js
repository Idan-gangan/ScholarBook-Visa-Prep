'use strict';
// Read-only Owner analytics. Do not expose reports, answers, transcripts, or raw cost identifiers.
const crypto=require('node:crypto');
const DAY=86400000;
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const studentKey=id=>digest('student:'+id);
const groupKey=id=>digest(id);
const validTime=value=>{
  const n=Date.parse(value);
  return Number.isFinite(n)?n:null;
};
const finite=n=>{
  const v=Number(n);
  return Number.isFinite(v)&&v>=0?v:0;
};
const keyed=(collection,key)=> {
  const map=new Map();
  for(const row of collection||[]){
    if(!row || typeof row[key]!=='string')continue;
    if(!map.has(row[key]))map.set(row[key],[]);
    map.get(row[key]).push(row);
  }
  return map;
};
const latest=(a,b)=>a===null?b:b===null?a:Math.max(a,b);
const dateIso=t=>t===null?null:new Date(t).toISOString();
// Map only known reports and retained sessions to legacy hashed diagnostic grouping IDs.
function historicalGroups({students=[],reports=[],mockSessions=[]}){
  const allowed=new Set(students.map(s=>s.id));
  const mapping=new Map();
  for(const session of mockSessions){
    if(!allowed.has(session.athleteId)||typeof session.id!=='string')continue;
    mapping.set(groupKey(session.id),session.athleteId);
  }
  for(const report of reports){
    if(!allowed.has(report.athleteId))continue;
    const sessionId=report.mockSessionId||report.id;
    if(typeof sessionId==='string')mapping.set(groupKey(sessionId),report.athleteId);
  }
  return mapping;
}
function buildAnalytics({students=[],users=[],reports=[],mockSessions=[],learning=[],costs={keyed:[],legacy:[]},now=Date.now()}){
  const userById=new Map(users.map(u=>[u.id,u]));
  const allowed=new Map(students.filter(s=>typeof s.id==='string').map(s=>[s.id,s]));
  const reportsByStudent=keyed(reports.filter(r=>allowed.has(r.athleteId)),'athleteId');
  const sessionsByStudent=keyed(mockSessions.filter(s=>allowed.has(s.athleteId)),'athleteId');
  const learningByStudent=new Map((learning||[]).filter(x=>allowed.has(x.student_id)).map(x=>[x.student_id,x]));
  const groupLookup=historicalGroups({students,reports,mockSessions});
  const keyLookup=new Map(students.map(s=>[studentKey(s.id),s.id]));
  const costByStudent=new Map();
  const accum=(id,row)=>{
    if(!id || !allowed.has(id))return;
    if(!costByStudent.has(id))costByStudent.set(id,{voiceAttempts:0,voiceSamples:0,pricedVoiceSamples:0,partialVoiceUsd:0,voiceMinutes:0,textAttempts:0,textSamples:0,inputTokens:0,outputTokens:0,cachedTokens:0});
    const result=costByStudent.get(id),kind=String(row.category||''),attempts=finite(row.attempts),samples=finite(row.samples);
    if(['learn','mock'].includes(kind)){
      result.voiceAttempts+=attempts;
      result.voiceSamples+=samples;
      result.pricedVoiceSamples+=finite(row.priced_samples);
      result.partialVoiceUsd+=finite(row.estimated_usd);
      result.voiceMinutes+=finite(row.elapsed_seconds)/60;
    }else if(['report','review','practice'].includes(kind)){
      result.textAttempts+=attempts;
      result.textSamples+=samples;
      result.inputTokens+=finite(row.input_tokens);
      result.cachedTokens+=finite(row.cached_tokens);
      result.outputTokens+=finite(row.output_tokens);
    }
  };
  for(const row of costs?.keyed||[])accum(keyLookup.get(row.student_key),row);
  for(const row of costs?.legacy||[])accum(groupLookup.get(row.group_key),row);
  const rows=[...allowed.values()].map(student=>{
    const rs=(reportsByStudent.get(student.id)||[]).slice().sort((a,b)=>(validTime(a.createdAt)||0)-(validTime(b.createdAt)||0));
    const sessions=sessionsByStudent.get(student.id)||[];
    const learningRow=learningByStudent.get(student.id);
    const scored=rs.filter(r=>r.scoreType==='complete' && typeof r.scoringMethod==='string' && r.scoringMethod && Number.isFinite(r.overall) && r.overall>=0 && r.overall<=100 && !r.incomplete);
    const last=scored.at(-1);
    const previous=last&&scored.slice(0,-1).reverse().find(r=>r.scoringMethod===last.scoringMethod);
    const delta=previous?Math.round((last.overall-previous.overall)*10)/10:null;
    const score=last?last.overall:null;
    const owned=sessions.filter(s=>s.userId===student.userId);
    const assisted=sessions.length-owned.length;
    const registered=validTime(student.createdAt);
    let lastActivity=null;
    for(const r of rs)lastActivity=latest(lastActivity,validTime(r.createdAt));
    for(const s of sessions)lastActivity=latest(lastActivity,validTime(s.createdAt));
    if(learningRow)lastActivity=latest(lastActivity,validTime(learningRow.last_progress_at));
    // A future timestamp must not make someone appear active indefinitely.
    if(lastActivity!==null && lastActivity>now+5*60000)lastActivity=null;
    const active=lastActivity!==null && lastActivity>=now-7*DAY;
    const dormant=(lastActivity!==null&&lastActivity<now-14*DAY) ||
      (lastActivity===null&&registered!==null&&registered<now-14*DAY);
    const cost=costByStudent.get(student.id)||{voiceAttempts:0,voiceSamples:0,pricedVoiceSamples:0,partialVoiceUsd:0,voiceMinutes:0,textAttempts:0,textSamples:0,inputTokens:0,outputTokens:0,cachedTokens:0};
    const costView={
      voiceAttempts:cost.voiceAttempts,voiceSamples:cost.voiceSamples,pricedVoiceSamples:cost.pricedVoiceSamples,
      partialVoiceUsd:cost.pricedVoiceSamples?Math.round(cost.partialVoiceUsd*10000)/10000:null,
      observedVoiceMinutes:Math.round(cost.voiceMinutes*10)/10,
      unpricedVoiceAttempts:Math.max(0,cost.voiceAttempts-cost.pricedVoiceSamples),
      textAttempts:cost.textAttempts,textSamples:cost.textSamples,
      inputTokens:cost.inputTokens,cachedTokens:cost.cachedTokens,outputTokens:cost.outputTokens
    };
    return {
      studentId:student.id,name:student.name||'Student',email:student.email||userById.get(student.userId)?.email||'',
      createdAt:registered===null?null:dateIso(registered),
      lastRecordedActivity:dateIso(lastActivity),
      recentRecordedActivity:active,needsFollowUp:dormant,
      activityStatus:active?'recent':dormant?'follow-up':lastActivity?'earlier':'no-recorded-activity',
      completedModules:finite(learningRow?.completed_modules),savedModules:finite(learningRow?.saved_modules),
      mockStarts:sessions.length,studentLedMocks:owned.length,staffLedMocks:assisted,
      reports:rs.length,completeReports:scored.length,latestFullScore:score,
      scoreDate:last?last.createdAt:null,scoreMethod:last?last.scoringMethod:null,
      scoreChange:delta,improving:delta!==null&&delta>0,
      lastReportAt:rs.length?rs.at(-1).createdAt:null,
      assignedStaff:(student.staffIds||[]).length,
      cost:costView
    };
  });
  rows.sort((a,b)=>(validTime(b.lastRecordedActivity)||0)-(validTime(a.lastRecordedActivity)||0)||a.name.localeCompare(b.name));
  return {
    asOf:new Date(now).toISOString(),
    summary:{
      profiles:rows.length,
      active7d:rows.filter(s=>s.recentRecordedActivity).length,
      followUp14d:rows.filter(s=>s.needsFollowUp).length,
      improving:rows.filter(s=>s.improving).length,
      withFullScore:rows.filter(s=>s.latestFullScore!==null).length,
      costAttributed:rows.filter(s=>s.cost.voiceAttempts+s.cost.textAttempts>0).length
    },
    notes:{
      activity:'Activity is based on saved learning changes, mock starts and reports. Staff-assisted activity may appear; it does not prove the student personally logged in.',
      improvement:'Improvement compares the last two complete scored mocks using the same scoring method. Partial or incomplete interviews are not compared.',
      costs:'Only sampled voice estimates and text token usage are available. Historical tutor sessions may be unattributable. Text, hosting, transcription and other charges remain unpriced. Costs cover at most 30 days.'
    },
    students:rows
  };
}
module.exports={buildAnalytics,historicalGroups,studentKey,groupKey};
