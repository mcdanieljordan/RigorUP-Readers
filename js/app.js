// RigorUP Readers: screens and behavior. Books are data (books/<id>/book.json); this file never changes per book.
import * as S from './store.js';
import { reward, SECOND_TRY_LB, firstTryPercent, levelFor, BADGES } from './engine.js';
import * as Rep from './reports.js';
import * as Rec from './recordings.js';
import * as Guide from './readingstrip.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Color styles the reader can choose. Names describe the look, not who it is for.
const PALETTES = [
  ['sunset', 'Rainbow Sunset', '#ffac78', '#b8a2e6'],
  ['starry', 'Starry Night', '#11112b', '#7fe7ff'],
  ['space', 'Space Explorer', '#38bdf8', '#f97316'],
  ['jungle', 'Jungle Adventure', '#4ade80', '#fb923c'],
  ['pink', 'Pink Sparkle', '#f9a8d4', '#c026d3'],
  ['lavender', 'Lavender Dream', '#c4b5fd', '#a5f3fc']
];
let LIB = { stories: [] }, CREATURES = [];
const BOOKS = {};
let R = { route: '', a: '', b: '' };        // current route parts
let renderToken = 0;
let dex = { filter: 'all', search: '', type: 'all', selected: null };
let reportBookId = null;
let qs = { id: null, choice: null, started: false, base: 0, t0: 0, ticker: null };

/* ---------- loading ---------- */
const allVersions = () => LIB.stories.flatMap(s => s.versions.map(v => ({ ...v, story: s })));
async function loadBook(id) {
  if (BOOKS[id]) return BOOKS[id];
  const v = allVersions().find(v => v.id === id);
  if (!v) throw new Error('unknown book');
  const b = await fetch(v.path).then(r => { if (!r.ok) throw new Error('load'); return r.json(); });
  b._base = v.path.replace(/[^/]*$/, '');
  BOOKS[id] = b;
  return b;
}
async function boot() {
  try {
    const [lib, cr] = await Promise.all([
      fetch('data/library.json').then(r => r.json()),
      fetch('data/creatures.json').then(r => r.json())
    ]);
    LIB = lib; CREATURES = cr;
  } catch {
    $('#app').innerHTML = '<div class="panel"><h2>The library could not load.</h2><p>Please refresh to try again.</p></div>';
    return;
  }
  addEventListener('hashchange', render);
  render();
}

/* ---------- small helpers ---------- */
const placeholder = (n, label = 'Picture coming soon') => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe2b0"/><stop offset="1" stop-color="#f6b9cf"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/><g fill="#b9753f" opacity=".22"><circle cx="220" cy="190" r="90"/><circle cx="1340" cy="260" r="120"/><circle cx="420" cy="700" r="110"/><circle cx="1180" cy="720" r="80"/></g><text x="800" y="450" font-family="sans-serif" font-size="110" font-weight="700" text-anchor="middle" fill="#6a4a2a">${n ? 'Page ' + n : 'RigorUP Readers'}</text><text x="800" y="545" font-family="sans-serif" font-size="46" text-anchor="middle" fill="#6a4a2a">${label}</text></svg>`);
const creaturePlaceholder = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><ellipse cx="100" cy="112" rx="58" ry="72" fill="#8fe3ea"/><ellipse cx="100" cy="112" rx="58" ry="72" fill="none" stroke="#e8fbff" stroke-width="6"/><circle cx="78" cy="96" r="9" fill="#10243a"/><circle cx="122" cy="96" r="9" fill="#10243a"/><path d="M80 132q20 18 40 0" fill="none" stroke="#10243a" stroke-width="7" stroke-linecap="round"/></svg>');
document.addEventListener('error', e => {
  const t = e.target;
  if (t.tagName === 'IMG' && t.dataset.ph !== undefined && !t.dataset.fell) { t.dataset.fell = '1'; t.src = t.dataset.ph === 'creature' ? creaturePlaceholder : placeholder(t.dataset.ph); }
}, true);

const done = (prog, q) => !!prog.attempts[q.id]?.done;
const finished = (book, prog) => prog.read.includes(book.pages.length - 1);
const countDone = (book, prog, type) => book.questions.filter(q => (!type || q.type === type) && done(prog, q)).length;
const countOf = (book, type) => book.questions.filter(q => !type || q.type === type).length;
const canShowAnswers = prog => S.settings().answers === 'now' || (S.settings().answers === 'finish' && prog.completed);
const anyCompleted = () => Object.values(S.profile().books).some(b => b.completed);
const unlocked = (book, prog, q) => {
  if (q.type === 'number') return true;
  if (S.settings().placement === 'after') return finished(book, prog);
  return finished(book, prog) || (q.page ?? 0) <= prog.page + 1;
};
const nextDue = (book, prog, type) => book.questions.find(q => q.type === type && !done(prog, q) && unlocked(book, prog, q));
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

function toast(t) {
  const el = $('#toast'); el.textContent = t; el.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 3500);
}
function celebrate(message) {
  toast(message);
  if (!S.settings().motion) return;
  const chars = ['✨', '🌈', '💎', '⭐'];
  for (let i = 0; i < 28; i++) {
    const e = document.createElement('span');
    e.className = 'particle'; e.textContent = chars[i % chars.length];
    e.style.setProperty('--x', (Math.random() * 700 - 350) + 'px');
    e.style.setProperty('--y', (Math.random() * 600 - 300) + 'px');
    e.style.setProperty('--r', (Math.random() * 600 - 300) + 'deg');
    $('#particles').append(e); setTimeout(() => e.remove(), 1400);
  }
}
function giveBadge(id) {
  if (!S.addBadge(id)) return;
  const b = BADGES.find(x => x[0] === id);
  setTimeout(() => toast(b[3] + ' Achievement unlocked: ' + b[1]), 1200);
}

/* ---------- page chrome ---------- */
function applyDisplay() {
  const s = S.settings();
  document.body.dataset.theme = s.theme;
  document.body.dataset.palette = PALETTES.some(x => x[0] === s.palette) ? s.palette : 'sunset';
  document.body.dataset.text = s.textSize;
  document.body.classList.toggle('reduced', !s.motion);
}
function header() {
  const p = S.profile(), s = S.settings();
  const nav = [['', '⌂', 'Shelf'], ['dex', '◈', 'FakeDex'], ['badges', '🏅', 'Badges']];
  $('#header').innerHTML = `<div class="brand" tabindex="0" role="link" data-go="#/"><span class="brand-mark">✦</span><span>RigorUP Readers<small>STORIES THAT GROW WITH YOU</small></span></div>
  <nav class="topnav" aria-label="Main navigation">${p ? nav.map(([r, i, n]) => `<button class="nav ${R.route === r || (r === '' && ['book', 'read', 'q', 'done'].includes(R.route)) ? 'active' : ''}" data-go="#/${r}">${i} ${n}</button>`).join('') : ''}
  <button class="nav" data-act="parent">⚙ Grown-ups</button>
  ${p ? `<button class="nav" data-go="#/who" aria-label="Switch reader">👤 ${esc(p.name)}</button><div class="wallet" aria-label="${p.balance} Lit Bucks"><span class="coin">LB</span>${p.balance}</div>` : ''}</nav>
  <div class="display-controls"><span class="layout-label">Display:</span>
    <div role="group" aria-label="Page theme"><button class="tab ${s.theme === 'light' ? 'active' : ''}" data-act="theme" data-v="light" aria-pressed="${s.theme === 'light'}">☀ Light</button><button class="tab ${s.theme === 'dark' ? 'active' : ''}" data-act="theme" data-v="dark" aria-pressed="${s.theme === 'dark'}">☾ Dark</button></div>
    <div role="group" aria-label="Color style">${PALETTES.map(([id, name, c1, c2]) => `<button class="swatch ${s.palette === id ? 'active' : ''}" data-act="palette" data-v="${id}" aria-pressed="${s.palette === id}" aria-label="${name} colors" title="${name}" style="--sw1:${c1};--sw2:${c2}"></button>`).join('')}<span class="note palette-name">${esc(PALETTES.find(x => x[0] === s.palette)?.[1] || 'Rainbow Sunset')}</span></div>
    <div role="group" aria-label="Text size">${[['small', 'A'], ['medium', 'A'], ['large', 'A']].map(([v, l], i) => `<button class="tab size-${v} ${s.textSize === v ? 'active' : ''}" data-act="textsize" data-v="${v}" aria-pressed="${s.textSize === v}" aria-label="${v} text">${l}${'+'.repeat(i)}</button>`).join('')}</div>
  </div>`;
}
const footer = () => `<footer class="footer"><span>Little steps. Bright discoveries. Big imagination.</span><button class="nav" data-act="credits">Creature credits</button></footer>`;

/* ---------- router ---------- */
async function render() {
  const token = ++renderToken;
  Rec.abort(); pauseTimer(); closeModal(true);
  const [route = '', a = '', b = ''] = location.hash.replace(/^#\/?/, '').split('/');
  R = { route, a, b };
  applyDisplay(); header();
  const app = $('#app');
  if (!S.profile()) { app.innerHTML = welcome(); return; }
  let html;
  try {
    if (route === '') html = shelf();
    else if (route === 'book') html = storyHome(a);
    else if (route === 'read') html = await readerView(a);
    else if (route === 'q') html = await questionView(a, b);
    else if (route === 'done') html = await resultsView(a);
    else if (route === 'dex') html = dexView();
    else if (route === 'badges') html = badgesView();
    else if (route === 'who') html = whoView();
    else html = shelf();
  } catch {
    html = '<div class="panel"><h2>That page is not available.</h2><p>Let’s go back to the shelf.</p><a class="button" href="#/">Back to the shelf</a></div>';
  }
  if (token !== renderToken) return;
  app.innerHTML = html + footer();
  if (route === 'q') updateReward();
  Rec.mount(); Guide.mount();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

/* ---------- screens ---------- */
function welcome() {
  return `<section class="panel narrow"><span class="eyebrow">Welcome</span><h1>Let’s start <span class="gradient">reading.</span></h1>
  <p>Pick a nickname. Please do not use a full name. Your progress saves on this device only.</p>
  <label for="nick">Nickname (optional)</label><input id="nick" type="text" maxlength="24" autocomplete="off" placeholder="Reader 1">
  <div class="row" style="margin-top:22px"><button class="button" data-act="start">Start →</button></div></section>`;
}
function whoView() {
  const st = S.get();
  return `<span class="eyebrow">Who is reading?</span><h1>Choose a <span class="gradient">reader.</span></h1>
  <div class="grid three">${st.profiles.map(p => `<button class="panel profile-card ${p.id === st.active ? 'selected' : ''}" data-act="pick" data-v="${p.id}"><strong>${esc(p.name)}</strong><span class="muted">${p.balance} LB · ${p.owned.length} creatures</span></button>`).join('')}</div>
  <div class="panel narrow" style="margin-top:22px"><h3>Add a reader</h3><label for="nick">Nickname (optional)</label><input id="nick" type="text" maxlength="24" autocomplete="off" placeholder="Reader ${st.profiles.length + 1}"><div class="row" style="margin-top:16px"><button class="button" data-act="addreader">Add reader →</button></div></div>`;
}

function shelf() {
  const p = S.profile(), lv = levelFor(p.lifetime);
  return `<section class="hero"><div><span class="ribbon">📖 READ • DISCOVER • COLLECT</span><h1>A little mystery.<br>A <span class="gradient">big adventure.</span></h1>
  <p>Choose a story, read at your own pace, answer questions to earn Lit Bucks, and collect amazing creatures.</p>
  <div class="learning-overview"><span class="badge">LEVEL ${lv.number} · ${lv.name}</span><p>${(n => n + (n === 1 ? ' book' : ' books'))(Object.values(p.books).filter(b => b.completed).length)} finished · ${p.owned.length + (p.owned.length === 1 ? ' creature' : ' creatures')} collected</p><div class="levelbar"><i style="width:${lv.progress}%"></i></div></div></div>
  <div class="hero-art"><img class="hero-book" data-ph="" src="${LIB.stories[0]?.cover || ''}" alt="" ></div></section>
  <div class="row between"><h2>Your bookshelf</h2></div>
  <div class="grid three">${LIB.stories.map(storyCard).join('')}</div>`;
}
function storyCard(s) {
  const p = S.profile();
  const pct = s.versions.map(v => { const pr = p.books[v.id]; return pr ? Math.round(100 * Object.values(pr.attempts).filter(a => a.done).length / (v.questions || 1)) : 0; });
  const best = Math.max(0, ...pct), doneAny = s.versions.some(v => p.books[v.id]?.completed);
  return `<a class="story-card panel" href="#/book/${s.id}"><img data-ph="" src="${s.cover}" alt=""><div class="story-card-body"><h3>${esc(s.title)}</h3><p class="muted">${esc(s.blurb)}</p>
  <div class="row">${s.versions.map(v => `<span class="badge">${esc(v.level)}</span>`).join('')}${doneAny ? '<span class="badge done-badge">✓ Finished</span>' : ''}</div>
  <div class="progress" aria-label="${best}% of questions answered"><i style="width:${best}%"></i></div></div></a>`;
}

function storyHome(storyId) {
  const s = LIB.stories.find(x => x.id === storyId); if (!s) throw new Error('no story');
  const p = S.profile();
  const vid = R.b || p.lastVersion?.[storyId] || s.versions[0].id;
  const v = s.versions.find(x => x.id === vid) || s.versions[0];
  const pr = p.books[v.id] || { read: [], attempts: {}, completed: false, page: 0 };
  const rDone = Object.entries(pr.attempts).filter(([id, a]) => a.done && id.startsWith('r')).length;
  const mDone = Object.entries(pr.attempts).filter(([id, a]) => a.done && id.startsWith('m')).length;
  return `<div class="row between"><div><span class="eyebrow">Story ${esc(s.id)}</span><h1 style="font-size:clamp(30px,4vw,50px)">${esc(s.title)}</h1></div><a class="button ghost small" href="#/">← Shelf</a></div>
  ${s.versions.length > 1 ? `<div class="tabs" role="group" aria-label="Reading level" style="margin:10px 0 18px">${s.versions.map(x => `<button class="tab ${x.id === v.id ? 'active' : ''}" data-go="#/book/${s.id}/${x.id}">${esc(x.label || x.level)}</button>`).join('')}</div>` : ''}
  <div class="grid three">
   <article class="mission"><h3>📖 Read the story</h3><p>${pr.read.length}/${v.pages} pages visited</p><button class="button" data-act="open" data-v="${v.id}" data-kind="read">${pr.read.length ? 'Continue' : 'Start reading'} →</button></article>
   <article class="mission"><h3>🔎 Reading questions</h3><p>${rDone}/${v.readingQuestions ?? '?'} answered</p><button class="button secondary" data-act="open" data-v="${v.id}" data-kind="choice">Continue →</button></article>
   <article class="mission"><h3>🔢 Math questions</h3><p>${mDone}/${v.mathQuestions ?? '?'} answered</p><button class="button secondary" data-act="open" data-v="${v.id}" data-kind="number">Continue →</button></article>
  </div>
  ${(v.printables || []).length ? `<div class="panel" style="margin-top:18px"><h3>🖨 Printables</h3><div class="row">${v.printables.map(f => `<a class="button secondary" href="${v.path.replace(/[^/]*$/, '')}${esc(f.file)}" target="_blank" rel="noopener">${esc(f.label)}</a>`).join('')}</div></div>` : ''}
  ${pr.completed ? `<div class="row" style="margin-top:22px"><a class="button" href="#/done/${v.id}">See my results →</a><a class="button secondary" href="#/dex">Meet my creatures ◈</a></div>` : ''}`;
}

async function readerView(id) {
  const book = await loadBook(id), prog = S.progress(id), p = S.profile();
  p.lastVersion = { ...(p.lastVersion || {}), [book.story]: id };
  if (prog.page > book.pages.length - 1) prog.page = 0;
  markRead(prog);
  const n = prog.page + 1, total = book.pages.length, page = book.pages[prog.page], last = prog.page === total - 1;
  const clue = S.settings().placement === 'during' && book.questions.some(q => q.type === 'choice' && !done(prog, q) && (q.page ?? 0) <= n);
  const alt = book.textInImage ? page.text : 'Illustration for page ' + n;
  const text = book.textInImage
    ? `<details class="story-text-toggle" ${S.settings().showText ? 'open' : ''}><summary>Show story text</summary><p class="read-text">${esc(page.text)}</p></details>`
    : `<p class="read-text live">${esc(page.text)}</p>`;
  return `<div class="row between reader-title"><h2>${esc(book.title)}</h2><span class="badge">PAGE ${n} OF ${total}</span></div>
  <section class="reading-page"><div id="guideHost" class="guide-host"><div class="book-frame"><img class="book-image" data-ph="${n}" src="${book._base + page.image}" alt="${esc(alt)}"></div>${text}${Guide.markup()}</div>
  <div class="page-controls"><button class="button secondary" data-act="prev" ${prog.page === 0 ? 'disabled' : ''}>← Back</button>
  ${clue ? '<button class="button secondary" data-act="clue">Try a clue question</button>' : ''}
  <button class="button" data-act="next">${last ? 'Finish reading ✓' : 'Next →'}</button></div>
  <div class="reader-tools"><div id="rec-box" data-book="${esc(book.id)}" data-target="page-${String(n).padStart(2, '0')}" data-title="Record my reading of page ${n}"></div>${Guide.controls()}</div></section>`;
}
function markRead(prog) { if (!prog.read.includes(prog.page)) { prog.read.push(prog.page); S.save(); } }

async function nextPage() {
  const book = BOOKS[R.a], prog = S.progress(book.id);
  markRead(prog);
  if (prog.page === book.pages.length - 1) {
    giveBadge('reader');
    const q = book.questions.find(x => x.type === 'choice' && !done(prog, x));
    if (q) return go(`#/q/${book.id}/${q.id}`);
    toast('Book finished! Your math mission is ready.');
    return go('#/book/' + book.story);
  }
  const due = nextDue(book, prog, 'choice');
  if (S.settings().placement === 'during' && due) return go(`#/q/${book.id}/${due.id}`);
  prog.page++; markRead(prog); S.save(); render();
}

/* ---------- questions ---------- */
async function questionView(bookId, qid) {
  const book = await loadBook(bookId), q = book.questions.find(x => x.id === qid);
  if (!q) throw new Error('no question');
  const prog = S.progress(bookId);
  if (q.type === 'choice' && !unlocked(book, prog, q)) {
    toast(S.settings().placement === 'after' ? 'Finish the book first. Your questions will wait!' : 'Read a little further to discover this clue.');
    location.replace('#/read/' + bookId); return '';
  }
  let a = prog.attempts[q.id];
  if (!a) { a = prog.attempts[q.id] = { type: q.type, tries: 0, done: false, firstCorrect: false, elapsed: 0, openedAt: Date.now() }; S.save(); }
  qs = { id: q.id, choice: null, started: false, base: 0, t0: 0, ticker: null };
  const isMath = q.type === 'number', show = canShowAnswers(prog);
  const num = book.questions.filter(x => x.type === q.type).indexOf(q) + 1, of = countOf(book, q.type);
  const answerText = isMath ? String(q.answer) : q.choices[q.answer];
  return `<div class="question-wrap"><div class="row between"><span class="badge">${isMath ? '🔢 ' + esc(q.group || 'Math') : '📖 RAINBOW CLUES'} · ${num}/${of}</span><button class="nav" data-go="#/book/${book.story}">Save &amp; take a break</button></div>
  <div class="panel" style="margin-top:18px"><span class="eyebrow">${a.done ? 'Question complete' : a.tries ? 'Your brave second try' : 'A little challenge'}</span><h2>${esc(q.prompt)}</h2>
  ${!a.done ? `<div class="reward-panel"><div class="row between"><strong id="rewardText">${a.tries ? 'Correct on this try: ' + SECOND_TRY_LB + ' LB' : 'Tap Ready when you are ready'}</strong><button id="ready" class="button small" data-act="ready">Ready ▶</button></div><div class="reward-track"><i id="rewardBar" style="width:100%"></i></div><small class="muted">${S.settings().timer === 'off' ? 'Relaxed mode. No countdown.' : 'The reward slows down as it gets smaller. There is always time to think.'}</small></div>` : ''}
  ${a.tries && !a.done ? `<div class="feedback hint"><strong>✨ One more try. You can do this!</strong><p>${esc(q.hint)}</p></div>` : ''}
  ${isMath ? mathTools(q, a) + `<div class="numpad">${Array.from({ length: (q.max ?? 10) + 1 }, (_, i) => `<button data-choice="${i}" class="${show && a.done && i === q.answer ? 'right' : ''}" ${a.done ? 'disabled' : ''}>${i}</button>`).join('')}</div>`
    : `<div class="choices">${q.choices.map((c, i) => `<button class="choice ${show && a.done && i === q.answer ? 'right' : ''}" data-choice="${i}" ${a.done ? 'disabled' : ''}><span class="choice-letter">${'ABCD'[i]}</span>${esc(c)}</button>`).join('')}</div>`}
  ${!a.done ? `<button class="button" id="submit" data-act="submit" disabled>${a.tries ? 'Try again' : 'Check my answer'} →</button>`
    : `<div class="feedback ${a.correct ? '' : 'hint'}"><strong>${a.correct ? '🌟 ' + (a.firstCorrect ? 'You got it!' : 'Your second try worked!') + ' +' + a.lb + ' LB' : '💛 You stayed with a tricky question.'}</strong><p>${show ? esc(q.explanation) : 'Your answer is saved. Your grown-up can review it with you.'}</p>${show ? `<p><strong>Answer: ${esc(answerText)}</strong></p>` : ''}</div><button class="button" style="margin-top:20px" data-act="qnext">Continue →</button>`}
  </div><div class="panel q-rec"><div id="rec-box" data-book="${esc(book.id)}" data-target="${esc(q.id)}" data-title="Explain my thinking out loud"></div></div></div>`;
}
function mathTools(q, a) {
  const h = q.helper; if (!h) return '';
  const objs = Array.from({ length: h.a }, (_, i) => `<button class="object" ${h.op === 'sub' ? `data-counter="${i}"` : ''} aria-label="${esc(h.noun)} ${i + 1}">${h.emoji}</button>`).join('')
    + (h.op === 'add' ? `<span style="padding:10px">+</span>${Array.from({ length: h.b }, () => `<span class="object">${h.emoji}</span>`).join('')}` : '');
  return `<div class="math-tools"><button class="nav" data-act="counters">${a.tools ? 'Hide' : 'Show'} counting helpers</button><div id="counters" class="${a.tools ? '' : 'hide'}"><p class="note">${h.op === 'add' ? 'Count both groups.' : 'Tap objects to cross them out. Count what stays.'}</p><div class="objects">${objs}</div></div></div>`;
}
function curAttempt() { const prog = S.progress(R.a); return { prog, a: prog.attempts[qs.id], q: BOOKS[R.a].questions.find(x => x.id === qs.id) }; }
function startTimer() {
  const { a } = curAttempt(); if (!a || a.done || qs.started) return;
  qs.started = true; qs.base = a.elapsed || 0; qs.t0 = performance.now();
  $('#ready')?.classList.add('hide');
  qs.ticker = setInterval(() => { a.elapsed = qs.base + (performance.now() - qs.t0) / 1000; updateReward(); S.save(); }, 500);
  updateReward();
}
function pauseTimer() {
  clearInterval(qs.ticker);
  if (qs.started && qs.id && R.route === 'q') {
    try { const { a } = curAttempt(); if (a && !a.done) { a.elapsed = qs.base + (performance.now() - qs.t0) / 1000; S.save(); } } catch { /* ignore */ }
  }
  qs.started = false;
}
function updateReward() {
  if (R.route !== 'q' || !qs.id) return;
  const { a } = curAttempt(); if (!a || a.done) return;
  const lb = a.tries ? SECOND_TRY_LB : reward(qs.started ? qs.base + (performance.now() - qs.t0) / 1000 : a.elapsed || 0, S.settings().timer);
  const t = $('#rewardText'); if (t) t.textContent = `Answer correctly now: ${lb} LB`;
  const b = $('#rewardBar'); if (b) b.style.width = (a.tries ? 15 : (lb / 20) * 100) + '%';
}
function submit() {
  if (qs.choice === null) return;
  const { prog, a, q } = curAttempt(), book = BOOKS[R.a];
  if (a.done) return;
  startTimer(); pauseTimer();
  const isMath = q.type === 'number';
  const label = isMath ? String(qs.choice) : q.choices[qs.choice];
  const correct = isMath ? Number(qs.choice) === q.answer : Number(qs.choice) === q.answer;
  a.tries++; a.answers = [...(a.answers || []), label]; a.correct = correct; a.firstCorrect = a.tries === 1 && correct;
  const prior = (a.responses || []).reduce((n, r) => n + (r.seconds || 0), 0);
  if (correct) {
    a.done = true; a.lb = a.tries === 1 ? reward(a.elapsed, S.settings().timer) : SECOND_TRY_LB;
    const p = S.profile(); p.balance += a.lb; p.lifetime += a.lb;
    giveBadge('first'); if (a.tries === 2) giveBadge('retry');
    celebrate(a.tries === 1 ? 'Brilliant thinking! +' + a.lb + ' LB' : 'You used your hint and grew! +' + SECOND_TRY_LB + ' LB');
  } else if (a.tries >= 2) { a.done = true; a.lb = 0; toast('A tricky one. Your effort matters. Keep growing.'); }
  else toast('Take a breath. Let’s try one small step.');
  (a.responses = a.responses || []).push({ answer: label, correct, seconds: Math.max(0, a.elapsed - prior), lb: a.done ? a.lb : 0, at: Date.now(), timer: S.settings().timer });
  if (!correct && a.tries === 1) a.hintUsed = true;
  a.updatedAt = Date.now();
  const maths = book.questions.filter(x => x.type === 'number');
  if (maths.length && maths.every(x => done(prog, x))) giveBadge('math');
  if (!prog.completed && book.questions.every(x => done(prog, x))) {
    prog.completed = true; const gift = book.completionGift ?? 40;
    const p = S.profile(); p.balance += gift; p.lifetime += gift;
    giveBadge('finish');
    if (Object.values(p.books).filter(b => b.completed).length >= 2) giveBadge('shelf');
    setTimeout(() => celebrate('Adventure complete! +' + gift + ' LB'), 1800);
  }
  S.save(); render();
}
function nextQuestion() {
  const { prog, q } = curAttempt(), book = BOOKS[R.a];
  if (prog.completed) return go('#/done/' + book.id);
  const next = nextDue(book, prog, q.type);
  if (next) return go(`#/q/${book.id}/${next.id}`);
  go(q.type === 'choice' && !finished(book, prog) ? '#/read/' + book.id : '#/book/' + book.story);
}
async function openKind(bookId, kind) {
  const book = await loadBook(bookId), prog = S.progress(bookId);
  if (kind === 'read') return go('#/read/' + bookId);
  const q = book.questions.find(x => x.type === kind && !done(prog, x) && unlocked(book, prog, x));
  if (q) return go(`#/q/${bookId}/${q.id}`);
  const any = book.questions.find(x => x.type === kind && !done(prog, x));
  if (any) { toast(S.settings().placement === 'after' ? 'Finish the book first. Your questions will wait!' : 'Keep reading to discover the next clue.'); return go('#/read/' + bookId); }
  toast('You answered every one of these. Great work!');
}

/* ---------- results, dex, badges ---------- */
async function resultsView(bookId) {
  const book = await loadBook(bookId), prog = S.progress(bookId), p = S.profile();
  const a = Object.values(prog.attempts).filter(x => x.done), retry = a.filter(x => x.correct && !x.firstCorrect).length;
  return `<div class="question-wrap"><div class="eyebrow">${prog.completed ? 'Mystery solved!' : 'Your adventure so far'}</div><h1>Your rainbow <span class="gradient">is growing.</span></h1>
  <p class="muted">${prog.completed ? 'You stayed with the adventure. That is something to celebrate!' : 'Finish your missions to complete the story.'}</p>
  <div class="grid three"><div class="panel"><div class="stat">${firstTryPercent(prog.attempts)}%</div><small>First-try accuracy</small></div><div class="panel"><div class="stat">${retry}</div><small>Successful second tries</small></div><div class="panel"><div class="stat">${p.balance}</div><small>Lit Bucks to spend</small></div></div>
  <div class="panel" style="margin-top:20px"><h2>Little steps made a difference.</h2><p>${a.filter(x => !x.correct).length ? 'Some questions were tricky. Look back at the story, count with objects, or review with your grown-up.' : 'Your careful thinking shines. Tell your grown-up your favorite discovery.'}</p>
  <p class="note">${a.length}/${book.questions.length} questions completed. Retries show growth and do not change first-try accuracy.</p>
  <div class="row"><a class="button" href="#/dex">Meet my creatures ◈</a><a class="button secondary" href="#/">Choose another story</a></div></div></div>`;
}

function dexView() {
  const p = S.profile(); if (!CREATURES.length) return '<p>Creature catalog is loading.</p>';
  const c = CREATURES.find(y => y.id === dex.selected) || CREATURES[0]; dex.selected = c.id;
  const owned = p.owned.includes(c.id), can = anyCompleted();
  const list = CREATURES.filter(y => (dex.filter === 'all' || (dex.filter === 'captured' && p.owned.includes(y.id)) || (dex.filter === 'new' && !p.owned.includes(y.id)) || (dex.filter === 'affordable' && !p.owned.includes(y.id) && y.cost <= p.balance))
    && (!dex.search || y.name.toLowerCase().includes(dex.search.toLowerCase())) && (dex.type === 'all' || y.type === dex.type));
  return `<div class="row between" style="margin-bottom:20px"><div><span class="eyebrow">Creature discovery system</span><h1 style="font-size:clamp(34px,4vw,45px)">The <span class="gradient">FakeDex.</span></h1></div><span class="ribbon">${p.owned.length} / ${CREATURES.length} companions discovered</span></div>
  <div class="dex-shell"><div class="dex-heading"><span class="lens"></span><span class="led"></span><strong class="display" style="letter-spacing:2px">FAKEDEX <small class="muted">/ HOLO EDITION</small></strong></div>
  <div class="dex-layout"><aside class="dex-preview"><div class="holo-panel"><div class="holo-label">LIVE HOLOGRAPHIC PREVIEW</div><div class="holo-stage"><img class="holo-creature" data-ph="creature" src="${c.image}" alt="Holographic preview of ${esc(c.name)}"></div>
   <div class="row between"><span class="badge">#${String(c.number).padStart(3, '0')}</span><span class="badge">${esc(c.rarity)}</span></div><h2 style="margin-top:15px">${esc(c.name)}</h2><p class="muted" style="font-size:14px">${esc(c.description)}</p>
   <div class="row between"><span class="muted">${esc(c.type)} energy</span><span class="price">${c.cost} LB</span></div>
   <button class="button" style="width:100%;margin-top:18px" data-capture="${c.id}" ${owned || !can || p.balance < c.cost ? 'disabled' : ''}>${owned ? '✓ In your collection' : !can ? 'Finish a book to capture' : p.balance < c.cost ? 'Save ' + (c.cost - p.balance) + ' more LB' : '◈ Capture for ' + c.cost + ' LB'}</button></div></aside>
  <section><div class="tabs" style="margin-bottom:14px">${[['all', 'All'], ['captured', 'Captured'], ['new', 'Not Yet'], ['affordable', 'Affordable']].map(([id, n]) => `<button class="tab ${dex.filter === id ? 'active' : ''}" data-filter="${id}">${n}</button>`).join('')}</div>
   <div class="row" style="flex-wrap:nowrap"><input type="text" id="dexsearch" aria-label="Search creatures" placeholder="⌕ Search creatures…" value="${esc(dex.search)}"><select id="dextype" aria-label="Creature energy type" style="max-width:150px"><option value="all">All energy</option>${[...new Set(CREATURES.map(x => x.type))].map(t => `<option value="${t}" ${dex.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
   <div class="row between" style="margin-top:15px;font-size:12px"><span class="muted">COLLECTION SYNC</span><strong>${p.owned.length}/${CREATURES.length}</strong></div><div class="progress" style="margin:9px 0 17px"><i style="width:${(p.owned.length / CREATURES.length) * 100}%"></i></div>
   <div class="creature-grid">${list.map(y => `<button class="creature-card ${p.owned.includes(y.id) ? '' : 'locked'} ${dex.selected === y.id ? 'selected' : ''}" data-creature="${y.id}" aria-label="Preview ${esc(y.name)}, ${y.cost} Lit Bucks">${p.owned.includes(y.id) ? '<span class="captured-dot">●</span>' : ''}<small>#${String(y.number).padStart(3, '0')}</small><img data-ph="creature" src="${y.image}" alt=""><strong>${p.owned.includes(y.id) ? esc(y.name) : '???'}</strong><small class="price">${y.cost} LB · ${esc(y.rarity)}</small></button>`).join('') || '<p class="muted">No creatures match yet. Try another filter.</p>'}</div></section></div></div>`;
}
function capture(id) {
  const c = CREATURES.find(y => y.id === id), p = S.profile();
  if (!c || !anyCompleted() || p.owned.includes(id) || p.balance < c.cost) return;
  p.balance -= c.cost; p.owned.push(id); S.save(); giveBadge('capture'); render();
  setTimeout(() => { $('.holo-creature')?.classList.add('capture-flash'); celebrate(c.name + ' joined your collection!'); }, 30);
}
function badgesView() {
  const p = S.profile();
  return `<div class="eyebrow">Proof of your brave little steps</div><h1>Your <span class="gradient">achievements.</span></h1><p class="muted">Learning is more than getting everything right. Celebrate trying, growing, and discovering.</p>
  <div class="grid three">${BADGES.map(([id, n, d, e]) => `<div class="badge-card ${p.badges.includes(id) ? '' : 'locked'}"><span>${e}</span><h3>${n}</h3><p class="muted">${d}</p><span class="badge">${p.badges.includes(id) ? 'UNLOCKED' : 'KEEP EXPLORING'}</span></div>`).join('')}</div>`;
}

/* ---------- grown-ups area ---------- */
function modal(content, wide = false) {
  $('#overlay').innerHTML = `<div class="modal-backdrop"><section class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="RigorUP Readers dialog"><button class="close" aria-label="Close dialog" data-act="close">×</button>${content}</section></div>`;
  setTimeout(() => ($('#overlay input') || $('#overlay button'))?.focus(), 20);
}
function closeModal(quiet) { if ($('#overlay').innerHTML) $('#overlay').innerHTML = ''; }
function parentGate() {
  if (!S.get().pin) return parentPanel();
  modal(`<span class="eyebrow">Grown-up space</span><h2>Parent PIN</h2><label for="pin">Enter your PIN</label><input id="pin" type="password" inputmode="numeric" maxlength="8"><button class="button" style="margin-top:20px" data-act="unlock">Open grown-up settings</button><p class="note">This PIN is a convenience gate on this device, not an account password.</p>`);
}
function settingsFields(s) {
  const sel = (id, label, opts) => `<div><label for="${id}">${label}</label><select id="${id}" data-setting="${id}">${opts.map(([v, n]) => `<option value="${v}" ${s[id] === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`;
  return `<div class="grid two">${sel('placement', 'When do questions appear?', [['during', 'Along the way'], ['after', 'After the whole book']])}${sel('answers', 'When can kids see answers?', [['now', 'Check your answer now'], ['finish', 'After the adventure'], ['parent', 'Hide answers (grown-up only)']])}${sel('timer', 'Reward countdown', [['standard', 'Standard (slows as LB drops)'], ['extra', 'Extra time (twice as long)'], ['off', 'Relaxed (timer off)']])}</div>
  <div class="checks"><input type="checkbox" id="motion" data-setting="motion" ${s.motion ? 'checked' : ''}><label for="motion">Animations and holographic motion</label></div>
  <div class="checks"><input type="checkbox" id="showText" data-setting="showText" ${s.showText ? 'checked' : ''}><label for="showText">Always show story text under pictures (books with text inside the picture)</label></div>`;
}
function parentPanel() {
  modal(`<span class="eyebrow">Grown-up space</span><h2>Settings and answers</h2>
  <div class="row"><button class="button secondary" data-act="key">Answer key</button><button class="button secondary" data-act="report">Learning report</button><button class="button secondary" data-act="review">Voice recordings</button></div><hr>
  <h3>Reading settings</h3>${settingsFields(S.settings())}
  <label for="newPin">${S.get().pin ? 'Change' : 'Set'} parent PIN (optional, 4 to 8 digits)</label><input id="newPin" type="password" inputmode="numeric" maxlength="8">
  <div class="row" style="margin:18px 0"><button class="button" data-act="savepin">Save PIN</button></div><hr>
  <h3>Readers on this device</h3><div class="row">${S.get().profiles.map(p => `<span class="badge">${esc(p.name)}</span><button class="nav" data-act="rmreader" data-v="${p.id}">Remove ${esc(p.name)}</button>`).join('')}</div>
  <div class="panel" style="margin-top:20px"><h3>Keep a copy</h3><p>Progress saves in this browser only. Export a backup before changing devices or clearing browser data.</p>
  <div class="row"><button class="button ghost small" data-act="export">Export progress backup</button><label class="button ghost small" style="margin:0;cursor:pointer">Import backup<input id="importBackup" type="file" accept="application/json" class="hide"></label></div></div>`, true);
}
async function answerKey() {
  const p = S.profile();
  const books = await Promise.all(allVersions().map(v => loadBook(v.id)));
  modal(`<span class="eyebrow">Parent answer guide</span><h2>Answers and learning progress</h2><div class="row"><button class="button secondary small" data-act="parent">← Settings</button><button class="button secondary small" data-act="print">Print</button></div>
  ${books.map(b => { const pr = p?.books[b.id]; return `<h3 style="margin-top:22px">${esc(b.title)} · ${esc(b.level)}</h3><div class="scroll"><table><thead><tr><th>Question</th><th>Answer and explanation</th><th>Progress</th></tr></thead><tbody>${b.questions.map(q => { const a = pr?.attempts[q.id]; return `<tr><td><strong>${q.type === 'number' ? 'Math' : 'Reading'} ${esc(q.id.slice(1))}</strong><br>${esc(q.prompt)}</td><td><strong>${esc(q.type === 'number' ? q.answer : q.choices[q.answer])}</strong><br>${esc(q.explanation)}</td><td>${!a?.done ? 'Not completed' : a.firstCorrect ? '✓ First try' : a.correct ? '✓ Second try' : 'Review together'}${a?.done && !a.correct ? '<br>Try: ' + esc(q.hint) : ''}</td></tr>`; }).join('')}</tbody></table></div>`; }).join('')}`, true);
}
async function reportView(ownerId, bookId) {
  const st = S.get(), owner = st.profiles.find(x => x.id === ownerId) || S.profile();
  if (!owner) return;
  const books = await Promise.all(allVersions().map(v => loadBook(v.id)));
  const book = books.find(b => b.id === bookId) || books.find(b => owner.books[b.id]) || books[0];
  const prog = owner.books[book.id] || { read: [], attempts: {}, completed: false, page: 0 };
  const recordingCount = Object.values(owner.recordings?.[book.id] || {}).reduce((n, t) => n + Object.keys(t).length, 0);
  modal(Rep.reportHtml({ profiles: st.profiles, owner, books, book, prog, recordingCount }), true);
}
async function reviewView(ownerId) {
  const st = S.get(), owner = st.profiles.find(x => x.id === ownerId) || S.profile();
  if (!owner) return;
  const books = await Promise.all(allVersions().map(v => loadBook(v.id)));
  const titles = Object.fromEntries(books.map(b => [b.id, b.title + ' · ' + b.level]));
  modal(`<span class="eyebrow">Voice recordings</span><h2>Saved reading takes</h2><div class="row"><button class="button secondary small" data-act="parent">← Settings</button>
  <select id="reviewReader" aria-label="Select reader" style="max-width:220px">${st.profiles.map(x => `<option value="${esc(x.id)}" ${x.id === owner.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
  <p class="note">Recordings stay on this device. They are not included in the progress backup.</p>${Rec.reviewHtml(owner, titles)}`, true);
}
function credits() {
  modal(`<div class="eyebrow">Made with imagination and open art</div><h2>Creature credits</h2><p>Creature artwork comes from Tuxemon. FakeDex rarity, prices, and child-friendly descriptions are customized for this adventure. <a href="ATTRIBUTIONS.md" target="_blank" rel="noopener">Complete upstream artist attributions</a>.</p>
  <div class="scroll"><table><thead><tr><th>Creature</th><th>Artwork credit</th></tr></thead><tbody>${CREATURES.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.credit)}</td></tr>`).join('')}</tbody></table></div>`);
}
function download(name, text, type = 'text/plain') {
  const u = URL.createObjectURL(new Blob([text], { type })), a = document.createElement('a');
  a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000);
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('button,[data-go]'); if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.go) { go(d.go); return; }
  if (d.choice !== undefined) {
    if (curAttempt().a?.done) return;
    qs.choice = d.choice;
    document.querySelectorAll('[data-choice]').forEach(el => { const on = el.dataset.choice === d.choice; el.classList.toggle('selected', on); el.setAttribute('aria-pressed', on); });
    const s = $('#submit'); if (s) s.disabled = false;
    startTimer(); return;
  }
  if (d.capture) return capture(d.capture);
  if (d.creature) { dex.selected = d.creature; render(); return; }
  if (d.filter) { dex.filter = d.filter; render(); return; }
  if (d.counter !== undefined) { b.classList.toggle('crossed'); return; }
  const acts = {
    start: () => { S.newProfile($('#nick')?.value); render(); },
    addreader: () => { S.newProfile($('#nick')?.value); go('#/'); },
    pick: () => { S.switchProfile(d.v); go('#/'); },
    theme: () => { S.settings().theme = d.v; S.save(); applyDisplay(); header(); },
    palette: () => { S.settings().palette = d.v; S.save(); applyDisplay(); header(); },
    textsize: () => { S.settings().textSize = d.v; S.save(); applyDisplay(); header(); },
    open: () => openKind(d.v, d.kind),
    prev: () => { const p = S.progress(R.a); p.page = Math.max(0, p.page - 1); markRead(p); S.save(); render(); },
    next: nextPage,
    clue: () => { const book = BOOKS[R.a], prog = S.progress(R.a), q = nextDue(book, prog, 'choice'); if (q) go(`#/q/${R.a}/${q.id}`); },
    ready: startTimer,
    submit,
    qnext: nextQuestion,
    counters: () => { const { a } = curAttempt(); a.tools = !a.tools; if (a.tools) a.usedCounters = true; S.save(); $('#counters').classList.toggle('hide', !a.tools); b.textContent = (a.tools ? 'Hide' : 'Show') + ' counting helpers'; },
    parent: parentGate,
    unlock: () => ($('#pin').value === S.get().pin ? parentPanel() : toast('Try your parent PIN again.')),
    savepin: () => { const v = $('#newPin').value; if (v && !/^\d{4,8}$/.test(v)) return toast('Use 4 to 8 digits for the PIN.'); if (v) { S.get().pin = v; S.save(); toast('PIN saved.'); } },
    key: answerKey,
    report: () => reportView(S.profile()?.id, reportBookId),
    review: () => reviewView(S.profile()?.id),
    printreport: () => window.print(),
    csv: async () => {
      const owner = S.get().profiles.find(x => x.id === $('#reportReader')?.value) || S.profile();
      const book = await loadBook($('#reportBook')?.value);
      download(`RigorUP-${book.id}-${owner.name.replace(/[^\w-]+/g, '_')}-results.csv`, Rep.resultsCsv(owner, book, owner.books[book.id]), 'text/csv;charset=utf-8');
    },
    print: () => window.print(),
    credits,
    close: () => closeModal(),
    export: () => download('RigorUP-Readers-Progress.json', S.exportBackup(), 'application/json'),
    rmreader: async () => { const p = S.get().profiles.find(x => x.id === d.v); if (p && confirm('Remove ' + p.name + ' and all of their progress and recordings?')) { await Rec.purge(p); S.removeProfile(d.v); closeModal(); render(); } }
  };
  acts[d.act]?.();
});
document.addEventListener('change', async e => {
  const el = e.target;
  if (el.dataset.setting) { S.settings()[el.dataset.setting] = el.type === 'checkbox' ? el.checked : el.value; S.save(); applyDisplay(); }
  if (el.id === 'dextype') { dex.type = el.value; render(); }
  if (el.id === 'reportReader') reportView(el.value, $('#reportBook')?.value);
  if (el.id === 'reportBook') { reportBookId = el.value; reportView($('#reportReader')?.value, el.value); }
  if (el.id === 'reviewReader') reviewView(el.value);
  if (el.id === 'importBackup') {
    try { S.importBackup(await el.files[0].text()); closeModal(); go('#/'); toast('Progress restored.'); }
    catch { toast('That file is not a valid RigorUP Readers backup.'); }
  }
});
document.addEventListener('input', e => {
  if (e.target.id === 'dexsearch') {
    const cur = e.target.selectionStart; dex.search = e.target.value;
    $('#app').innerHTML = dexView() + footer();
    const i = $('#dexsearch'); i.focus(); i.setSelectionRange(cur, cur);
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'Enter' && e.target.matches('[data-go]')) go(e.target.dataset.go);
  if (e.key === 'Enter' && e.target.id === 'nick') $('[data-act="start"],[data-act="addreader"]')?.click();
  if (R.route === 'read' && !$('#overlay').innerHTML && !e.target.matches('input,select,textarea')) {
    if (e.key === 'ArrowRight') $('[data-act="next"]')?.click();
    if (e.key === 'ArrowLeft') $('[data-act="prev"]')?.click();
  }
});
addEventListener('pagehide', () => { pauseTimer(); S.save(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseTimer(); });

Rec.init({ toast, reviewRefresh: () => { const sel = $('#reviewReader'); if (sel) reviewView(sel.value); } });
boot();
