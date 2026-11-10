import { PAIRS, SPECIALS } from './data.js';
import { defaultState, cardMemo, chooseCard, priority, recordAnswer, updateMemo, parseBackup, loadState, saveState, createBackup, setDefaultMemos, clearDefaultMemos, hasDefaultMemos, importMemoChoices } from './repetition.js';
import { eligiblePair, generateMemo, CORNERS, EDGES } from './cube.js';
import { renderPiece, renderSpecial } from './cube-view.js';
import { lettersAnswerMatches, specialAnswerMatches } from './answers.js';
import { decryptDefaults } from './vault.js';
import { DEFAULT_MEMO_VAULT } from './default-memos.js';
import { parseMemoChoices, makeMemoTemplate } from './choices.js';

const ALL_CARDS = [...PAIRS, ...SPECIALS];
const byId = new Map(ALL_CARDS.map(card => [card.id, card]));
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const secondsText = n => Number.isFinite(n) ? `${n.toFixed(2)} s` : '—';
const mean = list => list.length ? list.reduce((a,b) => a+b,0)/list.length : null;
const dateText = value => new Date(value).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
const title = card => card.kind === 'pair' ? card.pair : `${card.piece} ${card.kind === 'flip' ? 'flip' : card.direction}`;
const kindTitle = kind => kind === 'corners' ? 'Corners' : 'Edges';
const scopeName = scope => ({all:'All letter pairs',both:'Corners + edges',corners:'Corners',edges:'Edges'}[scope]);
const options = (items,value) => items.map(([id,label])=>`<option value="${id}"${id===value?' selected':''}>${label}</option>`).join('');
let state = defaultState();
let page = 'recall', phase = 'ready', currentCard = null, pieceKind = 'corners', previousId = null;
let startedAt = 0, elapsed = 0, promptGeneration = 0, session = [], saveChain = Promise.resolve(), saveError = '';
let memo = null, memoPhase = 'ready', memoResult = null, memoStartedAt = 0, memoSeconds = 0;
let search = '', libraryType = 'all', libraryPage = 0, queueOnly = false, editing = null, noticeTimer;
let wakeLock = null, wakeLockPending = false;
let unlockError = '', unlockBusy = false;

window.blindMemoQA = () => ({ state: structuredClone(state), currentCard, phase, page, memoPhase, memo });
window.cornerlabTimerActive = () => phase === 'question' || memoPhase === 'question';
function timerEvent() {
  const active=window.cornerlabTimerActive();
  window.dispatchEvent(new CustomEvent('cornerlab-timer-state',{detail:{active}}));
  if(!active&&wakeLock){wakeLock.release().catch(()=>{});wakeLock=null;}
  if(active&&!wakeLock&&!wakeLockPending&&navigator.wakeLock?.request){
    wakeLockPending=true;
    navigator.wakeLock.request('screen').then(lock=>{
      if(!window.cornerlabTimerActive()){lock.release().catch(()=>{});return;}
      wakeLock=lock;lock.addEventListener('release',()=>{if(wakeLock===lock)wakeLock=null;});
    }).catch(()=>{}).finally(()=>{wakeLockPending=false;});
  }
}
function notice(message) { $('#notice').textContent=message; clearTimeout(noticeTimer); noticeTimer=setTimeout(()=>{$('#notice').textContent='';},4500); }
function persist() {
  const snapshot = structuredClone(state);
  const task = saveChain.catch(()=>{}).then(()=>saveState(snapshot));
  saveChain = task;
  task.then(()=>{saveError=''; const label=$('.local-label'); if(label)label.textContent='Saved on this device'; const warning=$('#save-error'); if(warning)warning.remove();}).catch(error=>{
    saveError=`Progress could not be saved: ${error.message}. Export a backup from Settings.`;
    if(!$('#save-error')) $('#app').insertAdjacentHTML('afterbegin',`<p id="save-error" class="inline-warning" role="alert">${esc(saveError)}</p>`);
    notice('Save failed. Please export a backup.');
  });
  return task;
}
function header() {
  return `<header class="app-header"><div class="brand"><img src="icon.svg" alt=""><div><strong>Blind Memo Lab</strong><small>Find the image. Keep the memory.</small></div></div><nav aria-label="Main navigation">${[['recall','Recall'],['memo','Full memo'],['library','Memos'],['progress','Progress'],['settings','Settings']].map(([id,label])=>`<button data-page="${id}" class="${page===id?'active':''}"${page===id?' aria-current="page"':''}>${label}</button>`).join('')}</nav><span class="local-label">Saved on this device</span></header>`;
}
function intro(eyebrow,heading,description,extra='') { return `<div class="page-intro"><div><div class="eyebrow">${eyebrow}</div><h1>${heading}</h1><p>${description}</p></div>${extra}</div>`; }
function render() {
  $('#app').innerHTML=`${saveError?`<p id="save-error" class="inline-warning" role="alert">${esc(saveError)}</p>`:''}${header()}<input id="choices-file" type="file" accept="application/json,text/csv,.json,.csv" hidden><main>${({recall:recallPage,memo:memoPage,library:libraryPageView,progress:progressPage,settings:settingsPage}[page])()}</main>`;
  timerEvent();
}
function defaultsPanel() {
  if(hasDefaultMemos())return `<section class="defaults-panel unlocked"><div><strong>Private defaults unlocked</strong><span>Available for this session. Your password is never saved.</span></div><button class="small quiet" data-action="lock-defaults">Lock defaults</button></section>`;
  const content=`<section class="panel defaults-panel"><div><h2>Choose your memo words</h2><p>The supplied defaults are encrypted. Unlock them with the password, or add and import your own choices.</p><div class="wide-actions"><button class="small" data-action="add-own-memos">Add my own</button><button class="small" data-action="import-choices">Import JSON / CSV</button><button class="small quiet" data-action="choices-template">Download template</button></div></div><form id="unlock-form"><label>Password for private defaults<input id="defaults-password" type="password" autocomplete="current-password" maxlength="1024" required${unlockBusy?' disabled':''}></label><button class="primary" type="submit"${unlockBusy?' disabled':''}>${unlockBusy?'Unlocking…':'Unlock defaults'}</button><p class="hint">Unlock again after reopening the app.</p>${unlockError?`<p class="inline-warning" role="alert">${esc(unlockError)}</p>`:''}</form></section>`;
  return page==='recall'&&Object.values(state.memos).some(value=>value.trim())?`<details class="private-options"><summary>Using your own memos · Private defaults locked</summary>${content}</details>`:content;
}
function scopeChoices(value,all=true) { return options([...(all?[['all','All letter pairs']]:[]),['corners','Corners'],['edges','Edges'],['both','Corners + edges']],value); }
function selectedKinds() { return state.settings.scope==='both'?['corners','edges']:[state.settings.scope]; }
function cardKinds(card) {
  if(card.kind!=='pair')return [card.kind==='flip'?'edges':'corners'];
  return ['corners','edges'].filter(kind=>eligiblePair(card.pair,kind));
}
function candidates() {
  return ALL_CARDS.filter(card=>{
    if(!cardMemo(card,state).trim())return false;
    if(state.settings.onlyChanges&&!state.changeQueue[card.id])return false;
    if(state.settings.scope==='all')return card.kind==='pair';
    if(card.kind!=='pair'&&!state.settings.includeSpecials)return false;
    return cardKinds(card).some(kind=>selectedKinds().includes(kind));
  });
}
function sessionStrip() {
  const good=session.filter(item=>item.rating==='good');
  return `<div class="session-strip"><div class="session-stat"><strong>${session.length}</strong><span>Reviewed this session</span></div><div class="session-stat"><strong>${secondsText(mean(session.map(item=>item.seconds)))}</strong><span>Average recall</span></div><div class="session-stat"><strong>${session.length?Math.round(good.length/session.length*100)+'%':'—'}</strong><span>Rated Good</span></div></div>`;
}
function recallPage() {
  return intro('Letter-pair practice','Make the connection.','Think of your memo. Press Space as soon as it comes to you, then rate your recall.',`<span class="tag">${candidates().length} options in this selection</span>`)+defaultsPanel()+`<div class="workspace"><section><div class="panel prompt-panel"><div class="prompt-top"><span>${esc(scopeName(state.settings.scope))}${state.settings.onlyChanges?' · Change list':''}</span><span class="timer" id="recall-clock">${phase==='review'?secondsText(elapsed):phase==='question'?'Recalling…':'Untimed until you start'}</span></div>${recallStage()}</div>${sessionStrip()}<p class="footnote">Good lowers a pair’s weight. Wrong and Change raise it. Slower recall gets a smaller reduction, and pairs return as time passes.</p></section><aside class="panel side-panel"><h2>Your practice</h2><div class="controls"><label>Train<select data-setting="scope">${scopeChoices(state.settings.scope)}</select></label><label>Show<select data-setting="presentation"${state.settings.scope==='all'?' disabled':''}>${options([['letters','Letters'],['pieces','Cube pieces']],state.settings.scope==='all'?'letters':state.settings.presentation)}</select></label><label class="check-label full"><input type="checkbox" data-setting="includeSpecials"${state.settings.includeSpecials?' checked':''}${state.settings.scope==='all'?' disabled':''}> Include flips and twists</label><label class="check-label full"><input type="checkbox" data-setting="onlyChanges"${state.settings.onlyChanges?' checked':''}> Practise only my Change list</label></div><p class="side-note">${state.settings.scope==='all'?'All 576 letter pairs, including double letters. Choose corners or edges to practise piece recognition.':'White up, green front. The UBL corner and DF edge buffers are excluded. Double letters practise single-target parity memos.'}</p><button class="quiet small" data-action="open-queue" style="width:100%;margin-top:17px">Change list <span aria-label="items">(${Object.keys(state.changeQueue).length})</span></button></aside></div>`;
}
function recallStage() {
  if(phase==='ready')return `<div class="prompt-stage"><div class="start-symbol" aria-hidden="true">Aa</div><h2>A little faster each time.</h2><p>Your words, your letter scheme.<br>Recall the image before revealing the answer.</p></div><button class="primary prompt-action" id="recall-start" data-action="recall-start"${candidates().length?'':' disabled'}>Start recall <span class="key">Space</span></button>${!candidates().length?'<p class="hint">No memo choices match. Unlock the private defaults, add your own words, or change your practice selection.</p>':''}`;
  if(phase==='question')return `<div class="prompt-stage">${promptVisual(currentCard)}<p style="margin:24px 0 0">${currentCard.kind==='pair'?'Bring your memo to mind.':currentCard.kind==='flip'?'Which memo solves this flipped edge?':'Which memo solves this twisted corner?'}</p></div><button class="primary prompt-action" id="recall-reveal" data-action="recall-reveal">I have my memo <span class="key">Space</span></button><button class="cancel-link" data-action="cancel-recall">Cancel <span class="key">Esc</span></button>`;
  return `<div class="prompt-stage"><span class="answer-pair">${esc(title(currentCard))}${currentCard.kind==='pair'&&state.settings.presentation==='pieces'&&state.settings.scope!=='all'?` · ${kindTitle(pieceKind)}`:''}</span><div class="reveal-memo">${esc(cardMemo(currentCard,state))||'No memo yet — add one below.'}</div><span class="hint">${secondsText(elapsed)} to recall${currentCard.kind==='twist'?' · Direction to twist to solve':''}</span></div><div class="ratings"><button class="rating good" data-rating="good">Good <span class="key">1</span><small>Show less often</small></button><button class="rating wrong" data-rating="wrong">Wrong <span class="key">2</span><small>Practise sooner</small></button><button class="rating change" data-rating="change">Change <span class="key">3</span><small>Wrong + add to list</small></button></div><div class="after-answer"><span class="hint">Rate before the next pair.</span><button data-action="edit-current">Edit memo</button></div>`;
}
function promptVisual(card) {
  if(card.kind!=='pair')return `<div class="special-cube">${renderSpecial(card)}</div>`;
  if(state.settings.presentation==='letters'||state.settings.scope==='all')return `<div class="letter-pair">${esc(card.pair)}</div>`;
  return `<div class="piece-pair" aria-label="Two target pieces, read from left to right">${[...card.pair].map(letter=>renderPiece(letter,{kind:pieceKind,hideLetter:true})).join('')}</div><span class="hint">${kindTitle(pieceKind)} · Read the outlined stickers left to right</span>`;
}
function cancelRecall() { promptGeneration++;phase='ready';currentCard=null;timerEvent(); }
function nextRecall() {
  const card=chooseCard(candidates(),state.records,{excludeId:previousId,settings:state.settings});
  if(!card){cancelRecall();render();return;}
  currentCard=card;previousId=card.id;phase='question';elapsed=0;
  const kinds=cardKinds(card).filter(kind=>state.settings.scope==='both'||kind===state.settings.scope);
  pieceKind=kinds[Math.floor(Math.random()*kinds.length)]||'corners';
  const generation=++promptGeneration;render();
  // Set the origin after the browser has painted the actual prompt.
  startedAt=0;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{if(generation===promptGeneration&&phase==='question')startedAt=performance.now();}));
}
function revealRecall() {
  if(phase!=='question'||!startedAt)return;
  elapsed=Math.max(.001,(performance.now()-startedAt)/1000);phase='review';render();
}
async function rate(rating) {
  if(phase!=='review')return;
  const seconds=elapsed;
  state=recordAnswer(state,currentCard,{rating,seconds,now:Date.now(),scope:state.settings.scope,presentation:currentCard.kind==='pair'?state.settings.presentation:'pieces'});
  session.push({rating,seconds});persist();
  if(rating==='change')notice(`${title(currentCard)} added to your Change list.`);
  nextRecall();
}
function memoPage() {
  const active=memoPhase!=='ready';
  const showPieces=memoPhase==='question'||memoPhase==='result';
  return intro('Sequence practice','Hold the whole memo.','Read each row from left to right. Build your memo, stop the clock, then enter the letters to check it.')+`<div class="workspace"><section class="panel memo-board"><div class="prompt-top"><span>${esc(scopeName(state.settings.memoScope))} · Real cube state</span><span id="memo-clock" class="timer">${memoPhase==='question'?'Memorising…':active?secondsText(memoSeconds):'Ready when you are'}</span></div>${!active?`<div class="prompt-stage"><div class="start-symbol" aria-hidden="true">•••</div><h2>One cube. One sequence.</h2><p>Rows show target pieces with the relevant sticker outlined. Flips and twists appear on a transparent cube.</p></div><button class="primary prompt-action" data-action="memo-start" id="memo-start">Start a full memo <span class="key">Space</span></button>`:`${showPieces?`<div style="margin-top:26px">${['corners','edges'].filter(kind=>state.settings.memoScope==='both'||state.settings.memoScope===kind).map(kind=>memoRow(kind)).join('')}</div>`:''}${memoPhase==='question'?`<button class="primary prompt-action" data-action="memo-stop" id="memo-stop">Memo ready — stop clock <span class="key">Space</span></button><button class="cancel-link" data-action="memo-cancel">Cancel <span class="key">Esc</span></button>`:memoAnswerForm()}`}</section><aside class="panel side-panel"><h2>Sequence settings</h2><div class="controls"><label class="full">Train<select data-setting="memoScope">${scopeChoices(state.settings.memoScope,false)}</select></label></div><p class="side-note">Corner buffer: <strong>A · UBL</strong><br>Edge buffer: <strong>U · DF</strong><br>White up, green front.</p><p class="hint" style="margin-top:16px">A final unpaired target can use its double-letter memo. Enter either the raw targets or that final doubled letter.</p><details class="support-details"><summary>Loops, orientation and parity</summary><p>Corner loop breaks: P C L T H F N.<br>Edge loop breaks: A C L J T R B D V X W.</p><p>Each outlined piece is one trace target. In-place flipped or twisted pieces follow the trace row. Buffers are handled implicitly.</p><p>The letters are the actual sticker trace. Your M2 execution adjustments are separate. With odd parity, your correction is D′ L2 D M2 D′ L2 D.</p><p>CW and CCW always describe the twist to solve the corner.</p></details></aside></div>`;
}
function memoRow(kind) {
  const row=memo[kind];
  return `<section class="memo-row"><h2>${kindTitle(kind)}<span class="hint">${row.steps.length} targets${row.specials.length?` + ${row.specials.length} orientation fixes`:''}</span></h2><div class="memo-pieces">${row.steps.map((step,i)=>`<div class="memo-step">${renderPiece(step.letter,{kind,hideLetter:true})}<span class="step-number">${i+1}</span></div>`).join('')}${row.specials.map(item=>`<div class="memo-step special">${renderSpecial(item)}<span class="step-label">${kind==='corners'?'Twist to solve':'Flipped edge'}</span></div>`).join('')}</div>${!row.steps.length&&!row.specials.length?'<p class="hint">Already solved.</p>':''}</section>`;
}
function memoAnswerForm() {
  if(memoPhase==='result')return `<div class="memo-result${memoResult.correct?'':' wrong'}"><strong>${memoResult.correct?'Correct sequence.':'Sequence needs another look.'}</strong><br>${secondsText(memoSeconds)} · ${memo.parity?'Odd parity':'Even parity'}${['corners','edges'].filter(kind=>state.settings.memoScope==='both'||state.settings.memoScope===kind).map(kind=>`<p style="margin:12px 0 0"><strong>${kindTitle(kind)}:</strong> <code>${esc(memo[kind].letters)||'None'}</code>${memo[kind].specials.length?`<br>${kind==='corners'?'Twists':'Flips'}: ${esc(expectedSpecials(kind))}`:''}<br><span class="hint">Your letters: ${esc(memoResult.answer[kind])||'None'}${memo[kind].specials.length?` · Your fixes: ${esc(memoResult.answer[kind+'Special'])||'None'}`:''}</span></p>`).join('')}</div><div class="wide-actions"><button class="primary" data-action="memo-start">Next cube <span class="key">Space</span></button></div><details class="support-details"><summary>Cube scramble</summary><p>${esc(memo.scramble)}</p></details>`;
  return `<form id="memo-answer-form"><p class="hint" style="margin-top:22px">Clock stopped. The pieces are hidden until you check your answer. Enter the letters you memorised. Spaces and punctuation between letters are ignored.</p><div class="memo-answers">${['corners','edges'].filter(kind=>state.settings.memoScope==='both'||state.settings.memoScope===kind).map(kind=>`<div class="answer-group"><label>${kindTitle(kind)} letters<input id="answer-${kind}" name="${kind}" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="e.g. AB CD E"></label>${memo[kind].specials.length?`<label>${kind==='corners'?'Twists to solve (letter pairs or piece + direction)':'Flips (letter pairs or piece names)'}<input name="${kind}Special" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${kind==='corners'?'e.g. SH or DBL CW':'e.g. DE or UL'}"></label>`:''}</div>`).join('')}</div><button class="primary" type="submit">Check sequence</button></form>`;
}
function startMemo() {
  cancelRecall();memo=generateMemo({scope:state.settings.memoScope});memoPhase='question';memoResult=null;memoSeconds=0;render();
  const generation=++promptGeneration;memoStartedAt=0;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{if(generation===promptGeneration&&memoPhase==='question')memoStartedAt=performance.now();}));
}
function stopMemo() {
  if(!memoStartedAt)return;
  memoSeconds=Math.max(.001,(performance.now()-memoStartedAt)/1000);memoPhase='answer';render();
  $('[name="corners"], [name="edges"]')?.focus();
}
function expectedSpecials(kind) {return memo[kind].specials.map(item=>`${item.piece}${kind==='corners'?' '+item.direction:''}`).join(', ');}
function checkMemo(form) {
  if(memoPhase!=='answer')return;
  const data=new FormData(form),answer={},details={};let correct=true;
  for(const kind of ['corners','edges'].filter(kind=>state.settings.memoScope==='both'||state.settings.memoScope===kind)){
    const text=String(data.get(kind)||'').toUpperCase();answer[kind]=text;
    details[kind]=lettersAnswerMatches(memo[kind].letters,text);
    if(memo[kind].specials.length){answer[kind+'Special']=String(data.get(kind+'Special')||'');details[kind]=details[kind]&&specialAnswerMatches(memo[kind].specials,answer[kind+'Special']);}
    correct=correct&&details[kind];
  }
  memoResult={correct,answer,details};
  state.memoHistory.push({id:globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2),createdAt:new Date().toISOString(),seconds:memoSeconds,scope:state.settings.memoScope,scramble:memo.scramble,corners:memo.corners.letters,edges:memo.edges.letters,specials:{corners:memo.corners.specials,edges:memo.edges.specials},correct,answer});
  memoPhase='result';persist();render();
}
function matchingCards() {
  const term=search.trim().toLowerCase();
  return ALL_CARDS.filter(card=>(!queueOnly||state.changeQueue[card.id])&&(libraryType==='all'||card.kind===libraryType)&&(!term||`${title(card)} ${cardMemo(card,state)}`.toLowerCase().includes(term)));
}
function libraryPageView() {
  const matches=matchingCards(),count=36;libraryPage=Math.min(libraryPage,Math.max(0,Math.ceil(matches.length/count)-1));
  const slice=matches.slice(libraryPage*count,(libraryPage+1)*count);
  return intro('Your memo library',queueOnly?'Find a better image.':'Words that stay with you.',queueOnly?'Change marks a missed recall and keeps the pair here until you choose “Save & resolve”.':'Add or edit any pair, flipped edge or twisted corner. Your choices stay on this device.')+`<div class="filters"><label class="search">Search pairs or memos<input type="search" id="library-search" value="${esc(search)}" placeholder="AB, a word, or UFR…"></label><label>Type<select id="library-type">${options([['all','All types'],['pair','Letter pairs'],['flip','Edge flips'],['twist','Corner twists']],libraryType)}</select></label><button data-action="toggle-queue" class="${queueOnly?'primary':'quiet'}">${queueOnly?'Show all memos':`Change list (${Object.keys(state.changeQueue).length})`}</button></div><div id="library-results"><div class="library-grid">${slice.map(card=>libraryCard(card)).join('')}</div>${!matches.length?'<div class="empty">No matching memos.</div>':''}<div class="pagination"><span>${matches.length?libraryPage*count+1:0}–${Math.min((libraryPage+1)*count,matches.length)} of ${matches.length}</span><div><button class="small" data-action="library-prev"${libraryPage?'':' disabled'}>Previous</button> <button class="small" data-action="library-next"${(libraryPage+1)*count<matches.length?'':' disabled'}>Next</button></div></div></div>`;
}
function libraryCard(card) {
  const record=state.records[card.id],queued=state.changeQueue[card.id];
  return `<article class="memo-item" data-card-id="${esc(card.id)}"><header><strong>${esc(title(card))}</strong>${queued?'<span class="badge-change">Change list</span>':''}</header>${editing===card.id?`<label>Memo<textarea id="memo-edit" data-memo-id="${esc(card.id)}">${esc(cardMemo(card,state))}</textarea></label><p class="hint" style="margin:10px 0">Private default: ${hasDefaultMemos()?esc(cardMemo(card,{memos:{}})):'Locked'}</p><div class="actions"><button class="primary" data-action="save-memo" data-id="${esc(card.id)}">Save${queued?' & resolve':''}</button><button data-action="cancel-edit">Cancel</button></div>`:`<div class="memo-text">${esc(cardMemo(card,state))||'<span class="hint">No memo yet</span>'}</div><div class="meta">${record?`${record.attempts} reviews · ${secondsText(record.meanSeconds)} average · weight ${record.weight.toFixed(2)}`:'Not yet tested'}${card.kind==='twist'?'<br>Direction to twist to solve':''}</div><div class="actions"><button data-action="edit-memo" data-id="${esc(card.id)}">Edit memo</button>${queued?`<button data-action="resolve-memo" data-id="${esc(card.id)}">Keep memo & resolve</button>`:`<button class="quiet" data-action="queue-memo" data-id="${esc(card.id)}">Add to Change list</button>`}</div>`}</article>`;
}
function progressPage() {
  const h=state.history,m=state.memoHistory,reviewed=Object.keys(state.records).length,good=h.filter(item=>item.rating==='good').length;
  const hardest=ALL_CARDS.filter(card=>state.records[card.id]).sort((a,b)=>priority(b,state.records[b.id],Date.now(),state.settings)-priority(a,state.records[a.id],Date.now(),state.settings)).slice(0,10);
  return intro('Your progress','A clearer path to recall.','Review your timings and the options most likely to return. Each device keeps its own history.')+`<div class="overview"><div class="panel"><strong>${h.length}</strong><span>Total recalls</span></div><div class="panel"><strong>${reviewed} / ${ALL_CARDS.length}</strong><span>Options practised</span></div><div class="panel"><strong>${secondsText(mean(h.map(item=>item.seconds)))}</strong><span>Average recall</span></div><div class="panel"><strong>${h.length?Math.round(good/h.length*100)+'%':'—'}</strong><span>Rated Good</span></div></div><div class="two-columns"><section class="panel"><h2>Where to focus</h2><div class="table-wrap"><table class="history-table"><thead><tr><th>Option</th><th>Memo</th><th>Last recall</th><th>Weight</th></tr></thead><tbody>${hardest.map(card=>`<tr><td>${esc(title(card))}</td><td>${esc(cardMemo(card,state))}</td><td>${secondsText(state.records[card.id].lastSeconds)}</td><td>${state.records[card.id].weight.toFixed(2)}</td></tr>`).join('')}</tbody></table>${!hardest.length?'<p class="empty">Your first recalls will appear here.</p>':''}</div></section><section class="panel"><h2>Full memo runs</h2><p class="hint">${m.length} runs · ${m.filter(item=>item.correct).length} correct · ${secondsText(mean(m.filter(item=>item.correct).map(item=>item.seconds)))} average when correct</p><div class="table-wrap"><table class="history-table"><thead><tr><th>Date</th><th>Train</th><th>Time</th><th>Check</th></tr></thead><tbody>${m.slice(-15).reverse().map(item=>`<tr><td>${dateText(item.createdAt)}</td><td>${esc(scopeName(item.scope))}</td><td>${secondsText(item.seconds)}</td><td>${item.correct?'Correct':'Wrong'}</td></tr>`).join('')}</tbody></table></div></section></div><section class="panel" style="margin-top:24px"><h2>Recent recalls</h2><div class="table-wrap"><table class="history-table"><thead><tr><th>Date</th><th>Option</th><th>Memo at the time</th><th>Time</th><th>Rating</th></tr></thead><tbody>${h.slice(-60).reverse().map(item=>`<tr><td>${dateText(item.createdAt||item.at)}</td><td>${esc(byId.has(item.cardId)?title(byId.get(item.cardId)):item.cardId)}</td><td>${esc(item.memo)}</td><td>${secondsText(item.seconds)}</td><td>${esc(item.rating)}</td></tr>`).join('')}</tbody></table></div></section>`;
}
function settingsPage() {
  return intro('Set up your practice','A scheme that feels familiar.','Your memo words, timings and practice weights are saved locally. Export a backup to move them between Mac and iPhone.')+`${defaultsPanel()}<div class="settings-grid"><section class="panel"><h2>Repetition</h2><label>Comfortable recall time (seconds)<input type="number" min="0.2" max="60" step="0.1" data-setting="targetSeconds" value="${state.settings.targetSeconds}"></label><p>Fast Good responses reduce weight more and lengthen the interval. Wrong and Change raise weight and shorten the interval. The selection weight also rises with time since the last test, so familiar pairs return.</p><p>Every option keeps its own weight, response-time average, interval, last-tested time and review history. The sampler avoids an immediate repeat when another option is available.</p><p>Change also adds the option to a persistent editing list. Editing a memo keeps its history and makes the new wording due for practice.</p></section><section class="panel"><h2>Backups</h2><p>Backups include your edited memos, Change list, weights, settings, recall results and full-memo runs. Mac and browser storage are separate.</p><div class="wide-actions"><button class="primary" data-action="export-backup">Export full backup</button><button data-action="import-backup">Import backup</button></div><input id="backup-file" type="file" accept="application/json,.json" hidden><p class="hint" style="margin-top:20px">${window.cornerlabNative?'Saved by the Mac app in Application Support / Blind Memo Lab.':'Saved in this browser. On iPhone, add this app to your Home Screen and wait for “Ready offline”.'}</p><p class="hint">${state.history.length} recalls · ${state.memoHistory.length} full memo runs · ${Object.keys(state.memos).length} edited memos</p></section><section class="panel"><h2>Letter scheme</h2><p>White up. Green front. Letters run clockwise around each face, starting at its upper left when looking straight at that face. Corner A is UBL; edge U is DF.</p><table class="conventions-table"><thead><tr><th>Face</th><th>Colour</th><th>Letters</th></tr></thead><tbody>${[['U','White','A B C D'],['L','Orange','E F G H'],['F','Green','I J K L'],['R','Red','M N O P'],['B','Blue','Q R S T'],['D','Yellow','U V W X']].map(row=>`<tr>${row.map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table><details class="support-details"><summary>All sticker positions</summary><table class="conventions-table"><thead><tr><th>Piece</th><th>Corner letters</th></tr></thead><tbody>${CORNERS.map(item=>`<tr><td>${esc(item.name)}</td><td>${esc(Array.isArray(item.letters)?item.letters.join(' / '):item.letters)}</td></tr>`).join('')}</tbody></table><table class="conventions-table"><thead><tr><th>Piece</th><th>Edge letters</th></tr></thead><tbody>${EDGES.map(item=>`<tr><td>${esc(item.name)}</td><td>${esc(Array.isArray(item.letters)?item.letters.join(' / '):item.letters)}</td></tr>`).join('')}</tbody></table></details></section><section class="panel"><h2>Buffers and solving conventions</h2><p><strong>Old Pochmann corners:</strong> UBL (orange / blue / white), tracing from A.<br>Loop-break preference: P C L T H F N.</p><p><strong>M2 edges:</strong> DF (yellow / green), tracing from U on the down face.<br>Loop-break preference: A C L J T R B D V X W.</p><p>All stickers on either buffer are excluded from piece-pair recognition. Same-piece pairs are excluded except double letters for single-letter parity memos.</p><p><strong>Parity correction:</strong> D′ L2 D M2 D′ L2 D.<br>The memo row shows the sticker trace before any M2 execution substitutions.</p><p><strong>Corner twists:</strong> CW / CCW means the direction to twist to solve the piece. Each orientation has its own editable memo. Private defaults are available only after unlocking.</p></section></div>`;
}
function goPage(next) {
  cancelRecall();if(memoPhase==='question'){memoPhase='ready';memo=null;}page=next;render();window.scrollTo(0,0);
}
function openCard(card) { cancelRecall();page='library';queueOnly=false;search=title(card);libraryPage=0;editing=card.id;render();$('#memo-edit')?.focus(); }
async function exportBackup() {
  const backup=createBackup(state);
  if(window.cornerlabNative){await window.cornerlabNative.exportData(backup);return;}
  download(`blind-memo-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(backup,null,2),'application/json');
}
function download(name,content,type) {const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function importBackup(raw) {
  const next=parseBackup(raw);
  if(!confirm(`Replace this app’s saved progress with ${next.history.length} recalls, ${next.memoHistory.length} full memo runs and ${Object.keys(next.memos).length} edited memos from this backup? Export your current backup first if you want to keep it.`))return;
  state=next;session=[];memo=null;memoPhase='ready';cancelRecall();render();await persist();notice('Backup imported.');
}

document.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  try{
    if(button.dataset.page){goPage(button.dataset.page);return;}
    if(button.dataset.rating){await rate(button.dataset.rating);return;}
    const id=button.dataset.id,action=button.dataset.action;
    if(action==='recall-start')nextRecall();
    else if(action==='recall-reveal')revealRecall();
    else if(action==='cancel-recall'){cancelRecall();render();}
    else if(action==='edit-current')openCard(currentCard);
    else if(action==='open-queue'){queueOnly=true;search='';libraryPage=0;goPage('library');}
    else if(action==='toggle-queue'){queueOnly=!queueOnly;libraryPage=0;editing=null;render();}
    else if(action==='library-prev'){libraryPage--;render();}
    else if(action==='library-next'){libraryPage++;render();}
    else if(action==='edit-memo'){editing=id;render();$('#memo-edit')?.focus();}
    else if(action==='cancel-edit'){editing=null;render();}
    else if(action==='save-memo'){
      const value=$('#memo-edit').value.trim();if(!value){notice('Please enter a memo before saving.');return;}
      state=updateMemo(state,id,value,{resolveChange:Boolean(state.changeQueue[id])});editing=null;persist();render();notice('Memo saved.');
    }
    else if(action==='resolve-memo'){state=updateMemo(state,id,cardMemo(byId.get(id),state),{resolveChange:true});persist();render();}
    else if(action==='queue-memo'){const now=Date.now();state.changeQueue[id]={addedAt:now,lastMarkedAt:now,count:1};persist();render();}
    else if(action==='memo-start')startMemo();
    else if(action==='memo-stop')stopMemo();
    else if(action==='memo-cancel'){memoPhase='ready';memo=null;promptGeneration++;render();}
    else if(action==='export-backup')await exportBackup();
    else if(action==='lock-defaults'){clearDefaultMemos();cancelRecall();render();notice('Private defaults locked. Custom choices and personal history remain on this device.');}
    else if(action==='add-own-memos'){queueOnly=false;search='';libraryPage=0;goPage('library');}
    else if(action==='import-choices')$('#choices-file').click();
    else if(action==='choices-template')download('blind-memo-choices-template.json',JSON.stringify(makeMemoTemplate(),null,2),'application/json');
    else if(action==='import-backup'){if(window.cornerlabNative){const raw=await window.cornerlabNative.importData();if(raw)await importBackup(raw);}else $('#backup-file').click();}
    else if(action==='retry-load')await boot();
  }catch(error){notice(error.message||'Unable to complete this action.');}
});
document.addEventListener('change',async event=>{
  const input=event.target;
  try{
    if(input.dataset.setting){
      const key=input.dataset.setting;let value=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value;
      if(key==='targetSeconds'&&(!Number.isFinite(value)||value<.2||value>60)){notice('Choose a recall time between 0.2 and 60 seconds.');input.value=state.settings.targetSeconds;return;}
      state.settings[key]=value;if(key==='scope'&&value==='all')state.settings.presentation='letters';
      cancelRecall();if(memoPhase==='question'||key==='memoScope'){memoPhase='ready';memo=null;}persist();render();
    }
    else if(input.id==='library-type'){libraryType=input.value;libraryPage=0;render();}
    else if(input.id==='backup-file'&&input.files[0])await importBackup(await input.files[0].text());
    else if(input.id==='choices-file'&&input.files[0]){
      const choices=parseMemoChoices(await input.files[0].text(),{filename:input.files[0].name});
      state=importMemoChoices(state,choices);cancelRecall();render();await persist();notice(`${Object.keys(choices).length} memo choices imported.`);
    }
  }catch(error){notice(error.message);input.value='';}
});
document.addEventListener('input',event=>{
  if(event.target.id!=='library-search')return;
  const position=event.target.selectionStart;search=event.target.value;libraryPage=0;editing=null;
  const view=document.createElement('div');view.innerHTML=libraryPageView();$('#library-results').replaceWith(view.querySelector('#library-results'));
  $('#library-search')?.setSelectionRange(position,position);
});
document.addEventListener('submit',async event=>{
  if(event.target.id==='memo-answer-form'){event.preventDefault();checkMemo(event.target);}
  if(event.target.id==='unlock-form'){
    event.preventDefault();if(unlockBusy)return;
    let password=$('#defaults-password').value;$('#defaults-password').value='';
    unlockError='';unlockBusy=true;render();
    try{const choices=await decryptDefaults(DEFAULT_MEMO_VAULT,password);password='';setDefaultMemos(choices);cancelRecall();notice('Private defaults unlocked for this session.');}
    catch(error){unlockError=error.message;}
    finally{password='';unlockBusy=false;render();if(unlockError)$('#defaults-password')?.focus();}
  }
});
document.addEventListener('keydown',event=>{
  if(event.repeat||event.ctrlKey||event.altKey||event.metaKey||event.target.closest('input,textarea,select,[contenteditable=true],summary'))return;
  if(event.code==='Space'&&(page==='recall'||page==='memo')){
    event.preventDefault();
    if(page==='recall'){if(phase==='ready')nextRecall();else if(phase==='question')revealRecall();}
    else if(memoPhase==='ready'||memoPhase==='result')startMemo();else if(memoPhase==='question')stopMemo();
  }
  else if(page==='recall'&&phase==='review'&&['1','2','3'].includes(event.key)){event.preventDefault();rate({'1':'good','2':'wrong','3':'change'}[event.key]).catch(error=>notice(error.message));}
  else if(event.key==='Escape'&&(phase==='question'||memoPhase==='question')){cancelRecall();memoPhase='ready';memo=null;render();notice('Timing cancelled.');}
});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden'&&(phase==='question'||memoPhase==='question')){cancelRecall();memoPhase='ready';memo=null;render();notice('Timing cancelled while the app was in the background.');}
});
async function boot() {
  try{state=await loadState();render();document.body.dataset.ready='true';}
  catch(error){$('#app').innerHTML=`<main><h1>Your saved data could not be opened.</h1><p class="inline-warning">${esc(error.message)}</p><p>Please keep your backup. Existing saved data has not been replaced.</p><button class="primary" data-action="retry-load">Try again</button></main>`;}
}
await boot();
