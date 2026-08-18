import { firebaseConfig, firebaseEnabled } from './config.js';
import {addLocalDays,buildDailyPlan,classifyQuestion,dueIds,fcKey,localDateKey,queueBuckets,speedStats,subjectStats,updateSrs} from './learning-core.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const STORAGE_KEY='fc-quiz-state-v2',SESSION_KEY='fc-quiz-session-v2',THEME_KEY='fc-quiz-theme';
const ASSET_BASE='./';
const THEMES=['room','day','paper','night','lab','ink','or','term'];
const STATUS=[['new','沒做過'],['wrong','做錯過'],['flagged','已標記'],['figure','有附圖'],['bonus','送分／複選']];
let questions=[],state=loadState(),session=null,timer=null,currentUser=null,firebase=null,touchStartX=0;
let filters={years:new Set(),sessions:new Set(),subjects:new Set(),specialties:new Set(),statuses:new Set()};
let settings={count:20,reveal:'instant',random:true,weak:false,timed:false};
function defaultState(){return{attempts:[],wrong:{},exams:[],conquered:{},flags:{},notes:{},srs:{},examDate:'',dailyCompletions:{},theme:'room'}}
function loadState(){try{return{...defaultState(),...JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}}catch{return defaultState()}}
function saveState(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));syncToCloud()}
function saveSession(){sessionStorage.setItem(SESSION_KEY,JSON.stringify(session))}
function escapeHtml(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(el.t);el.t=setTimeout(()=>el.classList.remove('show'),2200)}
function shuffle(a){a=[...a];for(let i=a.length-1;i;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function isCorrect(q,a){return Boolean(a&&q.answer.includes(a))}
function formatTime(s){return`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`}
function figureUrl(path){return`${ASSET_BASE}${path}`}
function paperLabel(q){return`${q.year}-${q.session} · ${q.subject} · ${q.number}`}
function setTheme(theme,persist=true){if(!THEMES.includes(theme))theme='room';document.documentElement.dataset.t=theme;$('.ui').dataset.t=theme;$$('[data-set]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.set===theme));document.querySelector('meta[name=theme-color]').content=getComputedStyle($('.ui')).getPropertyValue('--paper').trim();if(persist){state.theme=theme;localStorage.setItem(THEME_KEY,theme);saveState()}}
async function boot(){setTheme(localStorage.getItem(THEME_KEY)||state.theme||'room',false);bindEvents();try{const r=await fetch(`${ASSET_BASE}questions.json`);if(!r.ok)throw Error(`HTTP ${r.status}`);questions=await r.json();if(questions.length!==3840)throw Error(`題庫只有 ${questions.length} 題`);initFilters();renderHome();showView('homeView');restoreSession();registerServiceWorker();initFirebase()}catch(e){$('#loadingView').innerHTML=`<b>題庫載入失敗</b><span class="tiny">${escapeHtml(e.message)}</span>`}}
function bindEvents(){
  $$('[data-set]').forEach(b=>b.onclick=()=>setTheme(b.dataset.set));$$('[data-go-home]').forEach(b=>b.onclick=goHome);
  $$('[data-select]').forEach(b=>b.onclick=()=>toggleAll(b.dataset.select));$$('[data-reveal]').forEach(b=>b.onclick=()=>{settings.reveal=b.dataset.reveal;renderControls()});$$('[data-setting]').forEach(b=>b.onclick=()=>{settings[b.dataset.setting]=!settings[b.dataset.setting];renderControls()});
  $('#countSlider').oninput=e=>{settings.count=Number(e.target.value);renderControls()};$('#startButton').onclick=startPractice;$('#mockButton').onclick=openMock;$('#startMockButton').onclick=startMock;$('#wrongButton').onclick=startWrong;$('#analysisButton').onclick=renderAnalysis;$('#startReviewButton').onclick=startDueReview;$('#startPlanButton').onclick=startDailyPlan;$('#examDateButton').onclick=openExamDate;$('#saveExamDate').onclick=saveExamDate;
  $('#searchButton').onclick=()=>{$('#searchDialog').showModal();$('#searchInput').focus()};$('#searchInput').oninput=renderSearch;$$('dialog [data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
  $('#accountButton').onclick=()=>$('#accountDialog').showModal();$('#googleButton').onclick=()=>authenticate('google');$('#appleButton').onclick=()=>authenticate('apple');$('#signOutButton').onclick=signOut;
  $('#exitQuiz').onclick=confirmExit;$('#prevButton').onclick=()=>navigate(-1);$('#nextButton').onclick=nextAction;$('#submitButton').onclick=submitSession;(function(){const nav=$('#qnav'),btn=$('#qnavToggle');
 if(!nav||!btn)return;
 const apply=v=>{nav.classList.toggle('collapsed',v);btn.textContent=v?'展開':'收合';
   btn.setAttribute('aria-expanded',String(!v));localStorage.setItem('fc-qnav',v?'1':'0')};
 apply(localStorage.getItem('fc-qnav')==='1');
 btn.onclick=()=>apply(!nav.classList.contains('collapsed'));
})();
$('#flagButton').onclick=toggleFlag;$('#noteButton').onclick=openNote;$('#saveNote').onclick=saveNote;$('#reviewButton').onclick=startReview;
  $('#installNote button').onclick=()=>{$('#installNote').remove();localStorage.setItem('fc-install-note','dismissed')};$('#closeImage').onclick=()=>$('#imageDialog').close();$('#imageDialog').onclick=e=>{if(e.target===$('#imageDialog'))e.currentTarget.close()};
  document.addEventListener('keydown',keyboard);$('#questionCard').addEventListener('touchstart',e=>touchStartX=e.changedTouches[0].screenX,{passive:true});$('#questionCard').addEventListener('touchend',e=>{const d=e.changedTouches[0].screenX-touchStartX;if(Math.abs(d)>75)navigate(d>0?-1:1)},{passive:true});
}
function initFilters(){['year','session','subject'].forEach(key=>{const prop=key==='year'?'years':key==='session'?'sessions':'subjects';filters[prop]=new Set(questions.map(q=>q[key]))});filters.specialties=new Set(questions.map(q=>q.specialty||'未分類'));renderFilters()}
function chip(group,value,label,count,on=true){return`<button class="chip ${on?'on':''}${count===0?' dim':''}" data-group="${group}" data-value="${escapeHtml(value)}"><i>✓</i>${escapeHtml(label)}${count==null?'':`<em>${count.toLocaleString()}</em>`}</button>`}
function renderFilters(){
  const any=(set,v)=>!set.size||set.has(v);const counts=(key,val)=>{const skip={year:'years',session:'sessions',subject:'subjects',specialty:'specialties'}[key];return questions.filter(q=>(skip==='years'||any(filters.years,q.year))&&(skip==='sessions'||any(filters.sessions,q.session))&&(skip==='subjects'||any(filters.subjects,q.subject))&&(skip==='specialties'||any(filters.specialties,q.specialty||'未分類'))&&(key==='specialty'?(q.specialty||'未分類')===val:q[key]===val)).length};
  $('#yearChips').innerHTML=[...new Set(questions.map(q=>q.year))].sort().map(v=>chip('years',v,v,counts('year',v),filters.years.has(v))).join('');
  $('#sessionChips').innerHTML=[1,2].map(v=>chip('sessions',v,`第 ${v===1?'一':'二'}次`,counts('session',v),filters.sessions.has(v))).join('');
  $('#subjectChips').innerHTML=[...new Set(questions.map(q=>q.subject))].map(v=>chip('subjects',v,v,counts('subject',v),filters.subjects.has(v))).join('');
  const specialties=[...new Set(questions.map(q=>q.specialty).filter(Boolean))].sort().concat(questions.some(q=>!q.specialty)?['未分類']:[]);$('#specialtyChips').innerHTML=specialties.length?specialties.map(v=>chip('specialties',v,v,counts('specialty',v),filters.specialties.has(v))).join(''):'<span class="tiny">尚未分類；資料補上後會自動啟用。</span>';
  $('#statusChips').innerHTML=STATUS.map(([v,l])=>chip('statuses',v,l,statusPool(v).length,filters.statuses.has(v))).join('');$$('.chip').forEach(b=>b.onclick=()=>toggleChip(b));updateMatch();try{renderHero()}catch(e){}
}
function specialtySubjects(sp){const r=new Set();for(const q of questions)if(q.specialty===sp)r.add(q.subject);return r}
function specialtySubject(sp){const r=specialtySubjects(sp);return r.size===1?[...r][0]:null}
function toggleChip(b){const group=b.dataset.group,set=filters[group],raw=b.dataset.value,value=['years','sessions'].includes(group)?Number(raw):raw;set.has(value)?set.delete(value):set.add(value);renderFilters()}
function toggleAll(group){const prop={years:'year',sessions:'session',subjects:'subject',specialties:'specialty'}[group],values=[...new Set(questions.map(q=>q[prop]).filter(v=>v!=null))];filters[group]=filters[group].size===values.length?new Set():new Set(values);renderFilters()}
function statusPool(status){const attempted=new Set(state.attempts.map(a=>a.id));return questions.filter(q=>status==='new'?!attempted.has(q.id):status==='wrong'?Boolean(state.wrong[q.id]):status==='flagged'?Boolean(state.flags[q.id]):status==='figure'?q.figures.length>0:q.answer.length>1)}
function filteredQuestions(){const attempted=new Set(state.attempts.map(a=>a.id));const any=(set,v)=>!set.size||set.has(v);return questions.filter(q=>any(filters.years,q.year)&&any(filters.sessions,q.session)&&any(filters.subjects,q.subject)&&any(filters.specialties,q.specialty||'未分類')&&[...filters.statuses].every(s=>s==='new'?!attempted.has(q.id):s==='wrong'?Boolean(state.wrong[q.id]):s==='flagged'?Boolean(state.flags[q.id]):s==='figure'?q.figures.length>0:q.answer.length>1))}
function names(set,all,label){return set.size===all.length?'全部':set.size?([...set].join('、')):'未選'}
function emptyReason(){
 // 交集為 0 時指出是哪一組把題目篩光了，並提供一鍵修正
 const base=q=>filters.years.has(q.year)&&filters.sessions.has(q.session);
 if(!questions.some(base))return['沒有選到任何年度或梯次','years'];
 const bySub=questions.filter(q=>base(q)&&filters.subjects.has(q.subject));
 if(!bySub.length)return['選到的年度／梯次底下沒有這些考卷','subjects'];
 if(filters.specialties.size){
  const want=[...filters.specialties];
  const miss=want.filter(sp=>!bySub.some(q=>q.specialty===sp));
  if(miss.length===want.length)return[`「${want[0]}」的題目不在目前選到的考卷或年度裡`,'specialties'];
 }
 if(!filters.specialties.size)return['一個科別都沒有選到','specialties'];
 if(!filters.subjects.size)return['一個考卷都沒有選到','subjects'];
 if(filters.statuses.size)return['目前的狀態條件（沒做過／做錯過…）沒有符合的題目','statuses'];
 return ['目前的條件組合沒有題目','specialties'];
}
function updateMatch(){const pool=filteredQuestions(),max=Math.max(1,pool.length);$('#matchCount').textContent=pool.length.toLocaleString();
 const hint=$('#emptyHint');
 if(hint){const on=pool.length===0;hint.hidden=!on;
  if(on){const[msg,grp]=emptyReason();
   hint.innerHTML=`<b>符合 0 題</b>　${escapeHtml(msg)}。<button type="button" data-fix="${grp}">放寬這組條件</button>`;
   const fix=hint.querySelector('[data-fix]');
   if(fix)fix.onclick=()=>{const g=fix.dataset.fix;
    if(g==='statuses')filters.statuses.clear();
    else if(g==='specialties')filters.specialties=new Set(questions.map(q=>q.specialty||'未分類'));
    else if(g==='subjects')filters.subjects=new Set(questions.map(q=>q.subject));
    else if(g==='years'){filters.years=new Set(questions.map(q=>q.year));filters.sessions=new Set(questions.map(q=>q.session))}
    renderFilters()};
  }}
$('#countSlider').max=max;settings.count=Math.min(settings.count,max);renderControls()}
function renderControls(){const pool=filteredQuestions(),max=Math.max(1,pool.length);const values=[10,20,40,80,max];$('#quickCounts').innerHTML=values.map((v,i)=>`<button data-count="${v}" class="${settings.count===v?'on':''}${pool.length&&v>max?' dim':''}">${i===4?'全部':v}</button>`).join('');$$('[data-count]').forEach(b=>b.onclick=()=>{settings.count=Math.min(Number(b.dataset.count)||20,Math.max(1,filteredQuestions().length))||Number(b.dataset.count);renderControls()});$('#countSlider').value=Math.min(settings.count,max);$('#countLabel').textContent=`${Math.min(settings.count,pool.length)} 題`;$$('[data-reveal]').forEach(b=>b.classList.toggle('on',b.dataset.reveal===settings.reveal));$$('[data-setting]').forEach(b=>b.classList.toggle('on',settings[b.dataset.setting]));const ys=[...new Set(questions.map(q=>q.year))],ss=[1,2],subs=[...new Set(questions.map(q=>q.subject))];$('#setupSummary').innerHTML=`<div><span>年度</span><b>${names(filters.years,ys,'年度')}</b></div><div><span>梯次</span><b>${names(filters.sessions,ss,'梯次')}</b></div><div><span>考卷</span><b>${names(filters.subjects,subs,'考卷')}</b></div><div><span>科別</span><b>${filters.specialties.size?`${filters.specialties.size} 科`:'尚未分類'}</b></div><div><span>狀態</span><b>${filters.statuses.size?[...filters.statuses].map(s=>STATUS.find(x=>x[0]===s)[1]).join('、'):'不限'}</b></div><div><span>題數</span><b>${Math.min(settings.count,pool.length)} 題</b></div>`}
function renderHome(){renderFilters();renderLearningHome();if(localStorage.getItem('fc-install-note')==='dismissed')$('#installNote')?.remove()}
function renderLearningHome(){const b=queueBuckets(state.srs),cells=[['today','今天'],['tomorrow','明天'],['3','3 天'],['7','7 天'],['21','21 天']];$('#srsQueue').innerHTML=cells.map(([k,label])=>`<div><b>${b[k]}</b><small class="tiny">${label}</small></div>`).join('');$('#startReviewButton').disabled=!b.today;if(!state.examDate){$('#countdownDays').textContent='—';$('#countdownCopy').textContent='設定日期後自動安排每日進度';$('#homePlan').innerHTML='<p class="tiny">尚未設定考試日期。</p>';$('#startPlanButton').disabled=true;return}const p=currentPlan(),done=state.dailyCompletions[p.today];$('#countdownDays').textContent=p.remainingDays;$('#countdownCopy').textContent=`天 · 還有 ${p.unseen.toLocaleString()} 題沒做過`;$('#homePlan').innerHTML=`<div class="prow"><span class="dt">複習</span><span>今天到期</span><b class="mono">${p.review} 題</b></div><div class="prow"><span class="dt">主攻</span><span>${escapeHtml(p.weak)}</span><b class="mono">${p.attack} 題</b></div><div class="prow"><span class="dt">維持</span><span>${escapeHtml(p.strong)} 隨機</span><b class="mono">${p.maintain} 題</b></div>`;$('#startPlanButton').disabled=Boolean(done)||!p.total;$('#startPlanButton').textContent=done?'今天的配額已完成 ✓':`開始今天的 ${p.total} 題 →`;renderHero()}
function currentPlan(){return buildDailyPlan({questions,attempts:state.attempts,srs:state.srs,examDate:state.examDate})}
function renderHero(){
 const p=currentPlan(),done=state.attempts.length,
  correct=state.attempts.filter(a=>a.correct).length,
  due=dueIds(state.srs).length;
 const set=(id,v)=>{const e=$('#'+id);if(e)e.textContent=v};
 set('heroDone',done.toLocaleString());
 set('heroRate',done?Math.round(correct/done*100)+'%':'—');
 set('heroDue',due);
 set('heroQuota',state.examDate?p.total:'—');
 set('heroDays',state.examDate?p.remainingDays:'—');
 set('heroExam',state.examDate?state.examDate+'　更改':'設定考試日期');
 set('heroLine', !state.examDate?'今天，往及格再近一點。'
   : due?`今天有 ${due} 題該回來複習了。`
   : done? `已累積 ${done.toLocaleString()} 題，繼續。` : '從第一題開始吧。');
 const ex=$('#heroExam'); if(ex)ex.onclick=openExamDate;
 const go=$('#heroGo');
 if(go)go.onclick=()=>{const b=$('#startPlanButton');
   if(state.examDate&&b&&!b.disabled)b.click(); else $('#randomButton')?.click()};
}function openExamDate(){$('#examDateInput').min=addLocalDays(localDateKey(),1);$('#examDateInput').value=state.examDate||'';$('#examDateDialog').showModal()}function saveExamDate(){const v=$('#examDateInput').value;if(!v||v<=localDateKey())return toast('請選擇未來的日期');state.examDate=v;saveState();$('#examDateDialog').close();renderLearningHome();toast('讀書計畫已重算')}
function showView(id){['loadingView','homeView','quizView','resultView','analysisView'].forEach(v=>$('#'+v).classList.toggle('hidden',v!==id));window.scrollTo(0,0)}
function weightedSample(pool,count){const rates={};state.attempts.forEach(a=>{const k=a.specialty||a.subject;(rates[k]??={n:0,c:0}).n++;if(a.correct)rates[k].c++});const bag=pool.map(q=>({q,w:1+(rates[q.specialty||q.subject]?1-rates[q.specialty||q.subject].c/rates[q.specialty||q.subject].n:0)}));const out=[];while(bag.length&&out.length<count){let total=bag.reduce((s,x)=>s+x.w,0),r=Math.random()*total,i=0;for(;i<bag.length;i++){r-=bag[i].w;if(r<=0)break}out.push(bag.splice(Math.min(i,bag.length-1),1)[0].q)}return out}
function startPractice(){let pool=filteredQuestions();if(!pool.length)return toast('目前篩選沒有符合題目');const count=Math.min(settings.count,pool.length);pool=settings.weak?weightedSample(pool,count):settings.random?shuffle(pool).slice(0,count):pool.slice(0,count);startSession(pool,'practice','自訂練習',settings.reveal==='end')}
function startWrong(){const pool=questions.filter(q=>state.wrong[q.id]&&!state.conquered[q.id]);if(!pool.length)return toast('目前沒有待複習的錯題');startSession(shuffle(pool).slice(0,Math.min(20,pool.length)),'wrong','錯題複習',false)}
function startDueReview(){const ids=new Set(dueIds(state.srs)),pool=questions.filter(q=>ids.has(q.id));if(!pool.length)return toast('今天沒有到期題目');startSession(pool,'srs','今日間隔複習',false)}
function startDailyPlan(){if(!state.examDate)return openExamDate();const p=currentPlan(),review=new Set(p.reviewIds),seen=new Set(review),unseen=questions.filter(q=>!state.attempts.some(a=>a.id===q.id)&&!seen.has(q.id)),by=k=>unseen.filter(q=>(q.specialty||q.subject||'尚未分類')===k),attack=shuffle(by(p.weak)).slice(0,p.attack);attack.forEach(q=>seen.add(q.id));let maintain=shuffle(by(p.strong).filter(q=>!seen.has(q.id))).slice(0,p.maintain),need=p.attack+p.maintain-attack.length-maintain.length;if(need>0)maintain=maintain.concat(shuffle(unseen.filter(q=>!seen.has(q.id)&&!attack.includes(q))).slice(0,need));const pool=[...questions.filter(q=>review.has(q.id)),...attack,...maintain];if(!pool.length)return toast('今天沒有待完成題目');startSession(pool,'plan','今天的讀書計畫',false)}
function openMock(){const keys=[...new Set(questions.map(q=>`${q.year}-${q.session}|${q.subject}`))].sort((a,b)=>b.localeCompare(a,'zh-Hant',{numeric:true}));$('#mockPaper').innerHTML=keys.map(k=>`<option value="${k}">${k.replace('|',' · ')}</option>`).join('');$('#mockDialog').showModal()}
function startMock(){const [paper,subject]=$('#mockPaper').value.split('|'),[year,sessionNo]=paper.split('-').map(Number),pool=questions.filter(q=>q.year===year&&q.session===sessionNo&&q.subject===subject).sort((a,b)=>a.number-b.number);if(pool.length!==80)return toast(`這份試卷有 ${pool.length} 題`);$('#mockDialog').close();startSession(pool,'mock',`${paper} · ${subject}`,true)}
function startSession(pool,mode,title,batch){session={ids:pool.map(q=>q.id),index:0,answers:{},flags:{...state.flags},times:{},enteredAt:Date.now(),startedAt:Date.now(),mode,title,batch,submitted:false,review:false};saveSession();showView('quizView');startTimer();renderQuestion()}
function currentQuestion(){return questions.find(q=>q.id===session.ids[session.index])}function sessionQuestions(){return session.ids.map(id=>questions.find(q=>q.id===id)).filter(Boolean)}
function commitQuestionTime(){if(!session?.enteredAt)return;const q=currentQuestion();session.times[q.id]=(session.times[q.id]||0)+Math.max(0,Math.round((Date.now()-session.enteredAt)/1000));session.enteredAt=Date.now()}
function renderQuestion(){const q=currentQuestion();if(!q)return;const selected=session.answers[q.id],reveal=session.review||(!session.batch&&Boolean(selected));$('#quizTitle').textContent=session.title;$('#quizSubtitle').textContent=session.review?'逐題檢討':session.batch?'全部寫完再看':'作答後立即核對';$('#questionNumber').textContent=paperLabel(q);$('#questionStem').textContent=q.stem;$('#specialtyTag').classList.toggle('hidden',!q.specialty);$('#specialtyTag').textContent=q.specialty||'';$('#figureTag').classList.toggle('hidden',!q.figures.length);$('#flagButton').textContent=session.flags[q.id]?'⚑ 已標記':'⚑ 稍後再看';$('#noteButton').textContent=state.notes[q.id]?'✎ 已有註記':'✎ 加註記';$('#questionFigures').innerHTML=q.figures.map((src,i)=>`<button class="figure-button" data-src="${escapeHtml(figureUrl(src))}"><img src="${escapeHtml(figureUrl(src))}" alt="第 ${i+1} 張題目附圖"></button>`).join('');$$('.figure-button').forEach(b=>b.onclick=()=>openImage(b.dataset.src));$('#options').innerHTML=Object.entries(q.options).map(([k,v])=>{const c=['option'];if(selected===k)c.push('selected');if(reveal&&q.answer.includes(k))c.push('correct');if(reveal&&selected===k&&!q.answer.includes(k))c.push('wrong');return`<button class="${c.join(' ')}" data-answer="${k}" ${session.review?'disabled':''}><span class="letter">${k}</span><span>${escapeHtml(v)}</span></button>`}).join('');$$('[data-answer]').forEach(b=>b.onclick=()=>selectAnswer(b.dataset.answer));renderFeedback(q,reveal,selected);renderQgrid();$('#prevButton').disabled=session.index===0;$('#nextButton').textContent=session.review?(session.index===session.ids.length-1?'回成績':'下一題 →'):(session.index===session.ids.length-1?'完成練習':'下一題 →');$('#nextButton').disabled=!session.review&&!selected;saveSession()}
function renderQgrid(){const answered=Object.keys(session.answers).length;$('#progressText').textContent=`${answered} / ${session.ids.length}`;$('#qgrid').innerHTML=session.ids.map((id,i)=>`<button class="${i===session.index?'n':session.flags[id]?'f':session.answers[id]?'d':''}" data-jump="${i}">${i+1}</button>`).join('');$$('[data-jump]').forEach(b=>b.onclick=()=>jump(Number(b.dataset.jump)))}
function selectAnswer(letter){if(session.review)return;const q=currentQuestion();session.answers[q.id]=letter;if(!session.batch&&!session.recorded?.[q.id]){session.recorded??={};session.recorded[q.id]=true;commitQuestionTime();recordAttempt(q,letter,session.times[q.id])}renderQuestion()}
function renderFeedback(q,reveal,selected){const el=$('#feedback');if(!reveal){el.classList.add('hidden');return}const correct=isCorrect(q,selected),exp=q.explanation;let details=exp&&typeof exp==='object'?`<ul class="explanation-list">${Object.keys(q.options).map(k=>`<li><b>${k}.</b> ${escapeHtml(exp[k]||'詳解撰寫中')}</li>`).join('')}</ul>`:'<p>詳解撰寫中</p>';const ref=q.fc_ref?formatFcRef(q.fc_ref):'',note=state.notes[q.id]?`<p class="note-copy"><b>我的註記</b><br>${escapeHtml(state.notes[q.id])}</p>`:'';el.innerHTML=`<h2 class="${correct?'correct-copy':'wrong-copy'}">${correct?'答對了':'這題答錯了'}</h2><p>正確答案：<b>${q.answer.join('／')}</b></p>${q.answer_note?`<p><b>官方更正：</b>${escapeHtml(q.answer_note)}</p>`:''}${details}${ref}${note}${renderConceptLinks(q)}`;el.classList.remove('hidden')}
function renderConceptLinks(q){const key=fcKey(q.fc_ref);if(!key)return'';const related=questions.filter(x=>x.id!==q.id&&fcKey(x.fc_ref)===key),years=new Set([q,...related].map(x=>x.year));if(!related.length)return'';const done=new Map(state.attempts.map(a=>[a.id,a]));return`<section class="concept-links"><span class="lbl">這個考點 ${years.size} 年考過 ${related.length+1} 次</span><div class="link">${related.slice(0,8).map(x=>`<div class="lrow"><span>${escapeHtml(paperLabel(x))}　${escapeHtml(x.stem.slice(0,35))}</span><em>${done.has(x.id)?(done.get(x.id).correct?'你答對了':'曾答錯'):'還沒做過'}</em></div>`).join('')}</div></section>`}
function formatFcRef(ref){const volume=ref.volume||ref.book||ref['冊別']||'',chapter=ref.chapter||ref['章節']||ref.specialty||'',page=ref.page||ref['頁次']||'';return`<div class="ref"><span class="lbl">FC 原文</span><br><b>${escapeHtml(volume)} · ${escapeHtml(chapter)} · <span class="fc-page" title="長按可複製">p.${escapeHtml(page)}</span></b></div>`}
function jump(index){commitQuestionTime();session.index=index;session.enteredAt=Date.now();renderQuestion()}function navigate(d){const n=session.index+d;if(n>=0&&n<session.ids.length)jump(n)}
function nextAction(){if(session.review){return session.index===session.ids.length-1?showResults():navigate(1)}if(!session.answers[currentQuestion().id])return toast('請先選擇答案');session.index===session.ids.length-1?submitSession():navigate(1)}
function toggleFlag(){const id=currentQuestion().id;session.flags[id]=!session.flags[id];state.flags[id]=session.flags[id];if(!state.flags[id])delete state.flags[id];saveState();renderQuestion()}
function openNote(){const q=currentQuestion();$('#noteTitle').textContent=paperLabel(q);$('#noteText').value=state.notes[q.id]||'';$('#noteDialog').showModal()}function saveNote(){const id=currentQuestion().id,text=$('#noteText').value.trim();if(text)state.notes[id]=text;else delete state.notes[id];saveState();$('#noteDialog').close();renderQuestion();toast('註記已儲存')}
function submitSession(){if(!session||session.submitted)return;commitQuestionTime();const pool=sessionQuestions(),unanswered=pool.filter(q=>!session.answers[q.id]).length;if(unanswered&&!confirm(`還有 ${unanswered} 題未作答，確定交卷？`))return;if(session.batch)pool.forEach(q=>{if(session.answers[q.id])recordAttempt(q,session.answers[q.id],session.times[q.id]||0)});session.submitted=true;session.elapsed=Math.round((Date.now()-session.startedAt)/1000);stopTimer();const correct=pool.filter(q=>isCorrect(q,session.answers[q.id])).length;if(session.mode==='mock'){state.exams.push({id:crypto.randomUUID(),title:session.title,date:new Date().toISOString(),score:Math.round(correct/pool.length*100),correct,total:pool.length,seconds:session.elapsed});saveState()}saveSession();showResults()}
function recordAttempt(q,selected,seconds){const a={id:q.id,selected,correct:isCorrect(q,selected),at:new Date().toISOString(),seconds,year:q.year,subject:q.subject,specialty:q.specialty,type:classifyQuestion(q)};state.attempts.push(a);const next=updateSrs(state.srs[q.id],a.correct,localDateKey(),{selected,seconds,at:a.at});if(next)state.srs[q.id]=next;if(!a.correct){state.wrong[q.id]=(state.wrong[q.id]||0)+1;delete state.conquered[q.id]}else if(next?.graduated){state.conquered[q.id]=true;delete state.wrong[q.id]}saveState()}
function showResults(){const pool=sessionQuestions(),correct=pool.filter(q=>isCorrect(q,session.answers[q.id])).length,score=Math.round(correct/pool.length*100);if(session.mode==='plan'&&pool.every(q=>session.answers[q.id])){state.dailyCompletions[localDateKey()]={completedAt:new Date().toISOString(),total:pool.length};saveState()}$('#scoreNumber').textContent=score;$('#scoreTitle').textContent=session.mode==='plan'?'今天的配額完成 ✓':score>=80?'表現很穩，繼續保持！':score>=60?'已經接近目標，再複習一下。':'先從錯題找出弱點。';$('#scoreSummary').textContent=`答對 ${correct} 題，共 ${pool.length} 題。`;$('#resultStats').innerHTML=`<div class="hc"><b>${correct}</b><small>答對</small></div><div class="hc"><b>${pool.length-correct}</b><small>答錯／未答</small></div><div class="hc"><b>${formatTime(session.elapsed||0)}</b><small>用時</small></div>`;showView('resultView')}
function startReview(){session.review=true;session.index=0;session.enteredAt=Date.now();showView('quizView');renderQuestion()}function confirmExit(){if(confirm('確定結束本次作答？'))goHome()}function goHome(){stopTimer();session=null;sessionStorage.removeItem(SESSION_KEY);renderHome();showView('homeView')}
function startTimer(){stopTimer();timer=setInterval(()=>{if(!session)return;$('#timer').textContent=formatTime(Math.round((Date.now()-session.startedAt)/1000));const qsec=(session.times[currentQuestion().id]||0)+Math.round((Date.now()-session.enteredAt)/1000);$('#questionTimer').textContent=`本題 ${formatTime(qsec)}`;if(settings.timed&&qsec>=90&&!session.answers[currentQuestion().id]){toast('本題已達 90 秒');settings.timed=false}},1000)}function stopTimer(){clearInterval(timer);timer=null}
function keyboard(e){if(!$('#quizView').classList.contains('hidden')&&!['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)){const key=e.key.toLowerCase();if(['a','b','c','d','e'].includes(key)){e.preventDefault();selectAnswer(key.toUpperCase())}else if(e.key==='ArrowLeft'){e.preventDefault();navigate(-1)}else if(e.key==='ArrowRight'){e.preventDefault();navigate(1)}else if(key==='f'){e.preventDefault();toggleFlag()}else if(e.code==='Space'){e.preventDefault();nextAction()}}}
function renderSearch(){const term=$('#searchInput').value.trim().toLocaleLowerCase();if(!term){$('#searchResults').innerHTML='<p class="tiny">輸入關鍵字開始搜尋。</p>';return}const hits=questions.filter(q=>(q.stem+' '+Object.values(q.options).join(' ')).toLocaleLowerCase().includes(term));$('#searchResults').innerHTML=`<span class="tiny">命中 ${hits.length} 題</span>${hits.slice(0,100).map(q=>`<button class="lrow" data-search-id="${q.id}"><span>${escapeHtml(q.stem)}</span><em class="mono">${paperLabel(q)}</em></button>`).join('')}`;$$('[data-search-id]').forEach(b=>b.onclick=()=>{$('#searchDialog').close();startSession([questions.find(q=>q.id===b.dataset.searchId)],'search','搜尋結果',false)})}
function renderAnalysis(){const attempts=state.attempts,correct=attempts.filter(a=>a.correct).length,rate=attempts.length?Math.round(correct/attempts.length*100):0,speeds=speedStats(attempts,new Map(questions.map(q=>[q.id,q]))),subjects=subjectStats(attempts),speedRows=speeds.map(x=>`<div class="lrow ${x.slowButAccurate?'needs-speed':''}"><span>${x.label}${x.slowButAccurate?' · 要練速度':''}</span><em class="mono">平均 ${x.average}s　正確率 ${x.rate}%　${x.n} 題</em></div>`).join(''),subjectRows=subjects.length?subjects.map(x=>`<div class="lrow"><span>${escapeHtml(x.name)}</span><em class="mono">平均 ${x.average}s　正確率 ${x.rate}%</em></div>`).join(''):'<p class="tiny">完成題目後顯示。</p>';$('#analysisContent').innerHTML=`<div class="heat"><div class="metric"><b>${attempts.length}</b><span>累積作答</span></div><div class="metric"><b>${rate}%</b><span>累積正確率</span></div><div class="metric"><b>${attempts.length?Math.round(attempts.reduce((s,a)=>s+(a.seconds||0),0)/attempts.length):0}s</b><span>平均每題</span></div></div><div class="analysis-card"><span class="lbl">作答速度 · 國考目標每題 90 秒</span><div class="link">${speedRows}</div><p class="tiny">有附圖＝影像；無圖且題幹 ≥ 120 字＝長題幹；其餘＝一般。正確率 ≥ 60% 且平均超過 90 秒會標示要練速度。</p></div><div class="analysis-card"><span class="lbl">單科平均作答時間 · 最弱的先出現</span><div class="link">${subjectRows}</div></div>`;showView('analysisView')}
function openImage(src){$('#largeImage').src=src;$('#imageDialog').showModal()}
function restoreSession(){try{const saved=JSON.parse(sessionStorage.getItem(SESSION_KEY));if(saved?.ids?.length&&confirm('找到尚未完成的練習，要繼續嗎？')){session=saved;session.enteredAt=Date.now();showView('quizView');startTimer();renderQuestion()}else sessionStorage.removeItem(SESSION_KEY)}catch{sessionStorage.removeItem(SESSION_KEY)}}
function registerServiceWorker(){if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{})}
async function initFirebase(){ $('#firebaseNotice').textContent=firebaseEnabled?'用 Google 或 Apple 登入，主題與進度會跨裝置同步。':'Firebase 尚未設定，目前使用訪客模式。';if(!firebaseEnabled){['#googleButton','#appleButton'].forEach(k=>{const b=$(k);if(b)b.disabled=true});return}try{const [{initializeApp},{getAuth,onAuthStateChanged,GoogleAuthProvider,OAuthProvider,signInWithPopup,signInWithRedirect,getRedirectResult,signOut:fbSignOut},{getFirestore,doc,setDoc,getDoc}]=await Promise.all([import('https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js'),import('https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js'),import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js')]);const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);firebase={auth,db,doc,setDoc,getDoc,GoogleAuthProvider,OAuthProvider,signInWithPopup,signInWithRedirect,fbSignOut};onAuthStateChanged(auth,handleUser);getRedirectResult(auth).catch(()=>{})}catch(e){$('#authMessage').textContent='Firebase 初始化失敗：'+(e&&(e.code||e.message)||'未知錯誤');console.error('[firebase init]',e)}}
async function handleUser(user){currentUser=user;$('#accountButton').textContent=user?user.email:'訪客';$('#signOutButton').classList.toggle('hidden',!user);$('#signInButton').classList.toggle('hidden',!!user);$('#signUpButton').classList.toggle('hidden',!!user);if(user)await mergeCloud()}
async function authenticate(kind){
 if(!firebase)return;
 const msg=$('#authMessage'); if(msg)msg.textContent='';
 let provider;
 if(kind==='google'){provider=new firebase.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'})}
 else{provider=new firebase.OAuthProvider('apple.com');provider.addScope('email');provider.addScope('name')}
 try{
  await firebase.signInWithPopup(firebase.auth,provider);
  $('#accountDialog').close();
 }catch(e){
  // iPad Safari 常擋彈出視窗；改用整頁轉址，回來後由 getRedirectResult 收尾
  if(['auth/popup-blocked','auth/popup-closed-by-user','auth/cancelled-popup-request','auth/operation-not-supported-in-this-environment'].includes(e.code)){
   try{ await firebase.signInWithRedirect(firebase.auth,provider); return }catch(e2){ if(msg)msg.textContent=authError(e2) }
  }else if(msg) msg.textContent=authError(e);
 }
}
function authError(e){
 const c=e&&e.code||'';
 if(c==='auth/unauthorized-domain')return '這個網域還沒加進 Firebase 的授權清單（Authentication → Settings → 已授權網域）。';
 if(c==='auth/operation-not-allowed')return '這個登入方式在 Firebase 尚未啟用。';
 if(c==='auth/account-exists-with-different-credential')return '這個 Email 已用另一種方式登入過，請改用原本那種。';
 return c||'登入失敗';
}
async function signOut(){if(firebase)await firebase.fbSignOut(firebase.auth);$('#accountDialog').close()}
async function syncToCloud(){if(currentUser&&firebase)try{await firebase.setDoc(firebase.doc(firebase.db,'users',currentUser.uid),{...state,updatedAt:new Date().toISOString()},{merge:true})}catch{toast('雲端同步失敗，本機資料已保留')}}
async function mergeCloud(){try{const snap=await firebase.getDoc(firebase.doc(firebase.db,'users',currentUser.uid));if(snap.exists()){const cloud=snap.data();state={...state,...cloud,attempts:dedupe([...state.attempts,...(cloud.attempts||[])],a=>a.id+'|'+a.at),exams:dedupe([...state.exams,...(cloud.exams||[])],e=>e.id),wrong:{...(cloud.wrong||{}),...state.wrong},flags:{...(cloud.flags||{}),...state.flags},notes:{...(cloud.notes||{}),...state.notes},srs:{...(cloud.srs||{}),...state.srs},dailyCompletions:{...(cloud.dailyCompletions||{}),...state.dailyCompletions}};saveState();setTheme(state.theme,false);renderHome()}await syncToCloud()}catch{toast('讀取雲端資料失敗')}}function dedupe(a,key){const s=new Set;return a.filter(x=>{const k=key(x);if(s.has(k))return false;s.add(k);return true})}
boot();
