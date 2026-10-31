/* Progressive enhancement for the student account. Owner and staff screens are unchanged. */
(function(root){
 'use strict';
 let installed=false;
 const model=()=>root.VisaAtlasStudentDashboard;
 const elem=id=>document.getElementById(id);
 const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const quoteDate=d=>Number.isFinite(Date.parse(d))?new Date(d).toLocaleDateString():'Date unavailable';
 const student=()=>typeof me!=='undefined'&&me?.role==='athlete';
 const getOwn=()=>athletes.find(a=>a.userId===me?.id);
 const getHistory=()=>{const own=getOwn();return own?reports.filter(r=>r.athleteId===own.id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)):[];};
 const buttonAction=(action)=>{if(action==='focus')return;studentNext(action);};
 function closeMenu(){
   const app=elem('app'),toggle=elem('studentMenuToggle');
   app.classList.remove('student-menu-open');if(toggle){toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Open student menu');}
 }
 function ensureNavigation(){
   const app=elem('app'),header=app.querySelector('.top');
   if(!student()){app.classList.remove('student-mode','student-menu-open');return;}
   app.classList.add('student-mode');
   if(elem('studentMenuToggle'))return;
   const toggle=document.createElement('button');
   toggle.id='studentMenuToggle';toggle.type='button';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','nav');toggle.setAttribute('aria-label','Open student menu');
   toggle.textContent='☰ Menu';
   header.insertBefore(toggle,header.querySelector('.account-summary'));
   const backdrop=document.createElement('button');backdrop.id='studentMenuBackdrop';backdrop.type='button';backdrop.className='student-menu-backdrop';backdrop.setAttribute('aria-label','Close navigation menu');app.insertBefore(backdrop,app.querySelector('.layout'));
   const nav=document.createElement('nav');nav.id='studentBottomNav';nav.className='student-bottom-nav';nav.setAttribute('aria-label','Mobile student navigation');
   for(const [title,id] of [['Home','dashboard'],['Learn','learning'],['Practice','interview'],['Reports','reports'],['Profile','profile']]){
     const btn=document.createElement('button');btn.type='button';btn.dataset.studentScreen=id;
     btn.setAttribute('aria-label',title);btn.innerHTML=navIcon(id)+'<span>'+title+'</span>';btn.addEventListener('click',()=>show(id));nav.append(btn);
   }
   app.append(nav);
   toggle.addEventListener('click',()=>{
     const open=!app.classList.contains('student-menu-open');
     app.classList.toggle('student-menu-open',open);
     toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Close student menu':'Open student menu');
     if(open)document.documentElement.style.setProperty('--student-nav-top',Math.ceil(header.getBoundingClientRect().bottom+8)+'px');
   });
   backdrop.addEventListener('click',closeMenu);
   document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();});
   const logoutButton=document.createElement('button');logoutButton.className='nav';logoutButton.type='button';logoutButton.textContent='Log out';logoutButton.addEventListener('click',()=>root.logout());elem('nav').append(logoutButton);
 }
 function refreshNavigation(screen){
   if(!student())return;
   closeMenu();
   elem('studentBottomNav')?.querySelectorAll('[data-student-screen]').forEach(btn=>{
     const active=btn.dataset.studentScreen===screen;
     btn.classList.toggle('on',active);
     if(active)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current');
   });
 }
 function renderHistory(){
   if(!student())return;
   const history=getHistory(),cmp=model().comparison(history);
   const modes={standard:'Standard',challenging:'Challenging',intensive:'Intensive'};
   const cards=history.slice(0,3).map((report,index)=>{
     const score=model().scoreMeta(report),c=score.coverage;
     const delta=index===0&&cmp?(cmp.delta===0?'No change':(cmp.delta>0?'+':'')+cmp.delta+' points'):'';
     return '<details class="history-card"><summary><span class="history-card-main"><strong>Mock #'+safe(report.mockNumber||history.length-index)+'</strong><small>'+safe(quoteDate(report.createdAt))+' · '+safe(modes[report.difficulty]||'Mode not recorded')+'</small></span><span class="history-score"><strong>'+safe(score.label)+'</strong><small>'+safe(c.partial?'Assessed answers only':c.label)+'</small></span></summary><div class="history-details"><p><strong>Coverage:</strong> '+(c.known?safe(c.assessed+' / '+c.required)+' assessed areas':'Not recorded')+'. '+safe(score.detail)+'.'+(c.partial?' This is not a full interview-readiness score.':'')+'</p>'+(delta?'<p>'+safe(delta)+' compared with a matching previous attempt.</p>':'')+'<p>'+safe(report.biggestWeakness||report.nextSteps?.[0]||'Review your feedback to find your next step.')+'</p><button class="btn secondary" type="button" data-history-open>View feedback</button></div></details>';
   }).join('');
   elem('studentHistory').innerHTML='<section class="card practice-history"><div class="history-heading"><div><span class="eyebrow">YOUR PRACTICE HISTORY</span><h2>Recent practice</h2></div><button class="btn secondary" type="button" data-history-open>View all reports →</button></div>'+(cards?'<details class="student-history-disclosure"><summary>View latest '+cards.match(/<details class="history-card"/g)?.length+' mock attempts</summary><p class="small muted">Compare scores only with the same interview mode, coverage and scoring method.</p><div class="history-card-list">'+cards+'</div></details>':'<div class="history-empty"><h3>Your first attempt is a starting point</h3><p>Saved mock interviews will appear here after you practise.</p></div>')+'</section>';
   elem('studentHistory').querySelectorAll('[data-history-open]').forEach(btn=>btn.addEventListener('click',()=>show('reports')));
 }
 function renderToday(history,complete,loaded,done,days){
   const area=elem('dailyPractice');area.classList.remove('hidden');
   const own=getOwn(),profileMissing=root.VisaAtlasProfile&&own?root.VisaAtlasProfile.missing(own):[];
   const tasks=model().dailyTasks({profileComplete:complete,profileMissing,courseLoaded:loaded,modulesDone:done,modulesTotal:curriculum.length,history,daysUntil:days,learningCompletedToday:curriculum.some(m=>courseSaved[m.id]?.completed&&model().dateKey(courseSaved[m.id]?.updatedAt)===model().dateKey())});
   const trackable=tasks.filter(t=>t.trackable!==false);
   const completed=trackable.filter(t=>t.done).length;
   const optional=tasks.some(t=>t.trackable===false);
   area.innerHTML='<div class="daily-plan-head"><div><span class="eyebrow">YOUR PERSONAL PLAN</span><h2>Your practice for today</h2><p>Complete saved activities to improve your preparation. Tasks refresh when progress is saved.</p></div><span class="pill blue">'+completed+' / '+trackable.length+' saved activities</span></div><div class="daily-task-list">'+tasks.map((t,i)=>'<article class="daily-task '+(t.done?'is-done':'')+'"><span class="daily-task-icon" aria-hidden="true">'+(t.done?'✓':i+1)+'</span><div><h3>'+safe(t.title)+'</h3><p>'+safe(t.description)+'</p>'+(t.trackable===false?'<small class="daily-task-optional">Suggested reading · not counted in today’s progress</small>':'')+'</div>'+(t.done?'<span class="daily-complete">✓ '+safe(t.doneLabel||'Activity saved today')+'</span>':'<button type="button" class="btn secondary" data-task="'+i+'">'+safe(t.actionLabel||'Open task')+' →</button>')+'</article>').join('')+'</div><p class="small muted">Completion uses saved evidence; suggested reading is separate.'+(optional?' Reading alone is not tracked.':'')+' Practice scores do not predict visa approval.</p>';
   area.querySelectorAll('[data-task]').forEach(btn=>btn.addEventListener('click',()=>{
     const task=tasks[Number(btn.dataset.task)];if(!task)return;
     if(task.action==='focus'&&task.reportId)openReportPractice(task.reportId,task.focusIndex);
     else buttonAction(task.action);
   }));
 }
 function renderHome(){
   if(!student())return;
   ensureNavigation();
   const own=getOwn(),history=getHistory();
   const missing=root.VisaAtlasProfile&&own?root.VisaAtlasProfile.missing(own):[];
   const complete=!!own&&own.profileStatus!=='Incomplete'&&!missing.length;
   const loaded=courseLoadState==='ready',done=curriculum.filter(m=>courseSaved[m.id]?.completed).length,days=root.VisaAtlasPlanning.daysUntil(own?.interviewDate||'');
   const next=!complete?'profile':!loaded||done<curriculum.length?'learning':history.length?'reports':'interview';
   const titles={profile:'Build a preparation plan that fits you',learning:'Keep moving toward your next interview',reports:'Turn feedback into stronger answers',interview:'Put your preparation into practice'};
   const info={profile:'Finish your study details to unlock tailored questions.',learning:'Continue your lessons and practise in your own words.',reports:'Use detailed feedback to strengthen specific answers.',interview:'Try a mock and use the feedback to improve.'};
   const actions={profile:'Complete profile',learning:'Continue learning',reports:'Review feedback',interview:'Start a mock'};
   const date=days===null?'No interview date saved':days===0?'Your interview is today':days<0?'Your interview date needs updating':days===1?'1 day until your interview':days+' days until your interview';
   elem('studentHome').innerHTML='<section class="student-hero"><div class="student-hero-intro"><span class="eyebrow">YOUR F-1 PREPARATION</span><p class="home-greeting">Welcome back, '+safe(String(me.name||'Student').trim().split(/\s+/)[0])+'</p><h2>'+titles[next]+'</h2><p class="student-hero-copy">'+info[next]+'</p><div class="student-hero-meta"><span class="student-date-line">'+safe(date)+'</span>'+(complete?'<span class="student-profile-ready">✓ Profile complete</span>':'')+'</div><div><button class="btn primary" type="button" data-home-start>'+actions[next]+' →</button></div></div><div class="home-course"><span class="eyebrow">LEARNING PROGRESS</span><div class="home-course-stat"><strong>'+(loaded?done+' / '+curriculum.length:'—')+'</strong><span>'+(loaded?'modules completed':courseLoadState==='error'?'Progress unavailable':'Loading saved progress…')+'</span></div><progress max="'+curriculum.length+'" value="'+(loaded?done:0)+'" aria-label="Learning modules completed"></progress><small>Learning completion is different from interview scoring.</small></div></section>';
   elem('studentHome').querySelector('[data-home-start]')?.addEventListener('click',()=>studentNext(next));
   renderToday(history,complete,loaded,done,days);
   renderHistory();
   const planner=elem('studentPlanner');elem('studentHistory').after(planner);
   if(elem('dashboard')?.classList.contains('on'))refreshNavigation('dashboard');
 }
 function refreshOverview(){
   if(!student())return;
   const own=getOwn(),history=getHistory(),report=history[0],s=model().scoreMeta(report),coverage=s.coverage;
   const matched=model().comparison(history);
   const comparisonNote=matched?(matched.previous+' → '+s.value+' ('+(matched.delta>0?'+':'')+matched.delta+' points) · same mode, coverage and scoring method'):'';
   const metrics=[[(coverage.partial?'Assessed-answer score':'Latest practice score'),s.label,coverage.partial?'Only '+coverage.assessed+' of '+coverage.required+' areas assessed · not full readiness':s.detail],['Mock interviews',own?.mocks||history.length,'Attempts recorded'],['Feedback reports',history.length,'Reports available'],['Assessment coverage',coverage.known?coverage.assessed+' / '+coverage.required:'—',coverage.label]];
   elem('dashCards').innerHTML=metrics.map(([label,val,detail],i)=>'<div class="card"><div class="muted small">'+safe(label)+'</div><div class="kpi">'+safe(val)+'</div><small class="score-qualifier muted">'+safe(detail)+'</small>'+(i===0&&comparisonNote?'<span class="student-score-trend" aria-label="Score change in comparable interview attempts">'+safe(comparisonNote)+'</span>':'')+'</div>').join('');
   const priority=report?.biggestWeakness||report?.nextSteps?.[0]||report?.nextStep||'Start with one lesson, then practise with a mock interview.';
   const correction=report?.nextSteps?.[0]||report?.nextStep||'Review your answers, and practise one specific point.';
   const list=arr=>'<ul class="student-feedback-list">'+arr.slice(0,2).map(x=>'<li>'+safe(x)+'</li>').join('')+'</ul>';
   elem('athleteTable').innerHTML='<div class="student-action-grid"><section class="card student-action-card student-action-primary"><span class="eyebrow">YOUR NEXT STEP</span><h2>'+(report?'Turn feedback into progress':'Build your first answers')+'</h2><p>'+safe(priority)+'</p><button class="btn" type="button" data-go="learning">Continue learning →</button> <button class="btn" type="button" data-go="interview">Start a mock</button></section><section class="card student-action-card"><span class="eyebrow">LATEST FEEDBACK</span><h2>Improve one answer at a time</h2>'+(report?'<p><strong>Try next:</strong> '+safe(correction)+'</p><details class="student-feedback-detail"><summary>What went well and what to clarify</summary>'+(report.strengths?.length?'<h3 class="small">What went well</h3>'+list(report.strengths):'')+(report.clarifications?.length?'<h3 class="small">Points to clarify</h3>'+list(report.clarifications):'')+'</details>':'<p>Specific corrections appear here after your first saved mock.</p>')+'<button class="btn secondary" type="button" data-go="reports">View full feedback →</button></section></div>';
   elem('athleteTable').querySelectorAll('[data-go]').forEach(btn=>btn.addEventListener('click',()=>studentNext(btn.dataset.go)));
 }
 function install(){
   if(installed)return;installed=true;
   const oldHome=root.renderStudentHome,oldAll=root.renderAll,oldShow=root.show;
   if(typeof oldHome!=='function'||typeof oldAll!=='function'||typeof oldShow!=='function')throw Error('Student dashboard requires the current app functions.');
   root.renderStudentHome=function(){oldHome();if(student())renderHome();};
   root.renderAll=function(){oldAll();if(student())refreshOverview();};
   root.show=function(id,...args){oldShow(id,...args);if(student()&&elem(id)?.classList.contains('on')){refreshNavigation(id);if(root.scrollY>0)root.scrollTo(0,0);}};
 }
 root.VisaAtlasStudentDashboardV2={install};
})(window);
