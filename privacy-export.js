function studentExport(db,user,progress){
 const profiles=db.athletes.filter(a=>a.userId===user.id),ids=new Set(profiles.map(p=>p.id));
 const records=key=>(db[key]||[]).filter(r=>ids.has(r.athleteId));
 const {id,name,email,role,emailVerifiedAt,termsAcceptance,ageEligibility}=user;
 return {format:'VisaAtlas account export v1',exportedAt:new Date().toISOString(),account:{id,name,email,role,emailVerifiedAt,termsAcceptance,ageEligibility},
 profiles:profiles.map(({staffIds,...profile})=>profile),learningProgress:progress,
 reports:records('reports').map(({evaluationKey,...report})=>report),
 transcripts:records('transcripts'),mockSessions:records('mockSessions')};
}
module.exports={studentExport};
