// Voice recordings: each page or question keeps two takes per reader. Audio stays in this browser (IndexedDB).
import * as S from './store.js';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let cb = { toast: () => {}, reviewRefresh: () => {} };
export const init = c => { cb = { ...cb, ...c }; };

let db = null, session = null, clock = null, playing = null, slotPref = 1;
const fmt = n => { const s = Math.floor(n || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const key = (o, b, t, s) => [o, b, t, s].join('::');

/* ---------- storage ---------- */
function openDb() {
  if (db) return Promise.resolve(db);
  return new Promise((res, rej) => {
    if (!window.indexedDB) { rej(new Error('storage')); return; }
    const r = indexedDB.open('rigorup-readers-recordings-v2', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('recordings');
    r.onsuccess = () => { db = r.result; res(db); };
    r.onerror = () => rej(r.error);
  });
}
async function idb(mode, fn) {
  const d = await openDb();
  return new Promise((res, rej) => { const tx = d.transaction('recordings', mode); const req = fn(tx.objectStore('recordings')); tx.oncomplete = () => res(req?.result); tx.onerror = () => rej(tx.error); });
}
const put = (k, blob) => idb('readwrite', s => s.put(blob, k));
const load = k => idb('readonly', s => s.get(k));
const del = k => idb('readwrite', s => s.delete(k));
const metas = (p, book, target) => p.recordings?.[book]?.[target] || {};
export function count(p) { return Object.values(p.recordings || {}).reduce((n, b) => n + Object.values(b).reduce((m, t) => m + Object.keys(t).length, 0), 0); }
export async function purge(p) {
  for (const [book, targets] of Object.entries(p.recordings || {})) for (const [t, slots] of Object.entries(targets)) for (const s of Object.keys(slots)) { try { await del(key(p.id, book, t, s)); } catch { /* ignore */ } }
}

/* ---------- recorder panel ---------- */
const elapsed = s => (s.elapsedMs || 0) + (s.recorder?.state === 'recording' ? Date.now() - s.segmentStarted : 0);
function activeHtml() {
  const s = session;
  if (s.state === 'pending') return '<div class="rec-status"><strong>Allow the microphone.</strong> <button class="rec-mini" data-rec="cancel" title="Cancel" aria-label="Cancel">×</button></div>';
  if (s.state === 'countdown') return `<div class="rec-status"><div class="record-countdown" aria-live="assertive">${s.countdown}</div><small>Fresh take starts in…</small><button class="rec-mini" data-rec="cancel">×<small>Cancel</small></button></div>`;
  const paused = s.recorder?.state === 'paused';
  return `<div class="rec-status"><div class="active-rec-row"><span class="record-indicator ${paused ? 'paused' : 'blinking'}" aria-label="${paused ? 'Recording paused' : 'Recording active'}">●</span><strong data-rec-timer>${fmt(elapsed(s) / 1000)}</strong><span class="note">${paused ? 'Paused' : 'Recording'}</span></div>
  <div class="active-rec-buttons"><button class="rec-mini" data-rec="pause" aria-label="${paused ? 'Resume recording' : 'Pause recording'}">${paused ? '▶' : 'Ⅱ'}<small>${paused ? 'Resume' : 'Pause'}</small></button><button class="rec-mini" data-rec="reset" aria-label="Discard this take and restart after 3, 2, 1">↺<small>Reset</small></button><button class="rec-mini rec-save" data-rec="stop" aria-label="Stop and save recording">■<small>Save</small></button><button class="rec-mini" data-rec="cancel" aria-label="Discard this unsaved take">×<small>Discard</small></button></div></div>`;
}
export function html(book, target, title) {
  const p = S.profile(); if (!p) return '';
  const act = !!session && session.book === book && session.target === target;
  const all = metas(p, book, target), m = all[slotPref];
  const tabs = [1, 2].map(n => `<button class="tab ${slotPref === n ? 'active' : ''}" data-rec="slot" data-slot="${n}" ${act ? 'disabled' : ''}>Take ${n} ${all[n] ? '✓' : ''}</button>`).join('');
  const idle = `<div class="compact-start"><button class="rec-mini rec-red" data-rec="record" aria-label="Record voice">●<small>Record</small></button><label class="rec-mini upload-mini" title="Upload an MP3">↑<small>MP3</small><input type="file" accept=".mp3,audio/mpeg" class="hide" data-rec-upload="1"></label>${m ? '<button class="rec-mini" data-rec="play" aria-label="Listen to saved take">▶<small>Listen</small></button>' : ''}</div><div class="rec-status" aria-live="polite"></div>
  ${m ? `<div class="row compact-saved"><small class="saved-tag">✓ Saved · ${m.duration ? fmt(m.duration) : 'MP3'}</small><button class="nav" data-rec="download" aria-label="Download saved take">↓</button><button class="nav" data-rec="remove">Remove</button></div>` : ''}`;
  return `<section class="compact-recorder"><h3>${esc(title || 'Record my reading')}</h3><div class="take-tabs" role="group" aria-label="Recording take">${tabs}</div>${act ? activeHtml() : idle}<p class="note">Saved on this device only.</p></section>`;
}
export function mount() { const box = $('#rec-box'); if (box) box.innerHTML = html(box.dataset.book, box.dataset.target, box.dataset.title); }

/* ---------- recording ---------- */
function begin(s) {
  const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
  const mime = types.find(t => MediaRecorder.isTypeSupported?.(t));
  const rec = mime ? new MediaRecorder(s.stream, { mimeType: mime }) : new MediaRecorder(s.stream);
  Object.assign(s, { state: 'recording', recorder: rec, chunks: [], elapsedMs: 0, segmentStarted: Date.now(), discard: false, restart: false, countdown: null });
  rec.ondataavailable = e => { if (e.data.size) s.chunks.push(e.data); };
  rec.onerror = () => { stop(true); cb.toast('The microphone stopped. Please try again.'); };
  rec.onstop = async () => {
    clearInterval(clock);
    if (s.restart) { countdown(s); return; }
    s.stream.getTracks().forEach(t => t.stop());
    if (session === s) session = null;
    if (s.discard) { mount(); cb.toast('Unsaved take discarded. Saved takes are safe.'); return; }
    try { await save(s, new Blob(s.chunks, { type: rec.mimeType || mime || 'audio/webm' }), 'record', s.elapsedMs / 1000); }
    catch { mount(); cb.toast('Could not save this take. Check browser storage and try again.'); }
  };
  rec.start(); mount();
  clock = setInterval(() => { const t = $('[data-rec-timer]'); if (t) t.textContent = fmt(elapsed(s) / 1000); if (elapsed(s) >= 600000) stop(false); }, 250);
}
function countdown(s) {
  s.chunks = []; s.elapsedMs = 0; s.countdown = 3; s.state = 'countdown'; mount();
  const tick = () => {
    if (session !== s || s.cancelled) return;
    s.countdown--;
    if (s.countdown === 0) { try { begin(s); } catch { stop(true); cb.toast('Please start a new recording.'); } return; }
    mount(); s.timer = setTimeout(tick, 1000);
  };
  s.timer = setTimeout(tick, 1000);
}
async function start() {
  if (session) return;
  stopPlayback();
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { cb.toast('Recording is not available here. Upload an MP3 instead.'); return; }
  const box = $('#rec-box'); if (!box) return;
  const s = { owner: S.profile().id, book: box.dataset.book, target: box.dataset.target, slot: slotPref, state: 'pending' };
  session = s; mount();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (s.cancelled || session !== s) { stream.getTracks().forEach(t => t.stop()); return; }
    s.stream = stream; begin(s);
  } catch (e) {
    s.stream?.getTracks().forEach(t => t.stop());
    if (session === s) session = null;
    mount();
    cb.toast(e.name === 'NotAllowedError' ? 'Allow your browser to use the microphone, or upload an MP3.' : 'Microphone unavailable. Try again or upload an MP3.');
  }
}
function pause() {
  const s = session; if (!s?.recorder || s.state !== 'recording') return;
  if (s.recorder.state === 'recording') { s.elapsedMs += Date.now() - s.segmentStarted; s.recorder.pause(); }
  else if (s.recorder.state === 'paused') { s.segmentStarted = Date.now(); s.recorder.resume(); }
  mount();
}
function reset() { const s = session; if (!s?.recorder) return; s.restart = true; s.discard = true; if (s.recorder.state !== 'inactive') s.recorder.stop(); }
function stop(discard = false) {
  const s = session; if (!s) return;
  if (s.state === 'pending' || s.state === 'countdown') {
    s.cancelled = true; clearTimeout(s.timer); s.stream?.getTracks().forEach(t => t.stop()); session = null; mount(); return;
  }
  s.discard = discard; s.restart = false;
  if (s.recorder.state === 'recording') s.elapsedMs += Date.now() - s.segmentStarted;
  if (s.recorder.state !== 'inactive') s.recorder.stop();
}
export const abort = () => { if (session) stop(true); };
export const isRecording = () => !!session;

async function save(s, blob, source, duration) {
  if (!blob.size) throw new Error('empty');
  await put(key(s.owner, s.book, s.target, s.slot), blob);
  const p = S.get().profiles.find(x => x.id === s.owner); if (!p) throw new Error('profile');
  p.recordings = p.recordings || {}; p.recordings[s.book] = p.recordings[s.book] || {}; p.recordings[s.book][s.target] = p.recordings[s.book][s.target] || {};
  p.recordings[s.book][s.target][s.slot] = { createdAt: Date.now(), duration: duration || null, bytes: blob.size, mime: blob.type, source };
  S.save(); mount(); cb.reviewRefresh(); cb.toast('✓ Your reading is saved!');
}

/* ---------- playback, download, remove ---------- */
function stopPlayback() { if (!playing) return; playing.audio.pause(); URL.revokeObjectURL(playing.url); playing.audio.remove(); playing = null; }
async function play(owner, book, target, slot, host) {
  stopPlayback();
  try {
    const blob = await load(key(owner, book, target, slot));
    if (!blob) { cb.toast('This recording is not on this device.'); return; }
    const url = URL.createObjectURL(blob), audio = document.createElement('audio');
    audio.controls = true; audio.src = url; audio.setAttribute('aria-label', 'Play saved reading take ' + slot);
    playing = { audio, url }; host?.append(audio); await audio.play();
  } catch { cb.toast('This recording could not play.'); }
}
async function download(owner, book, target, slot) {
  try {
    const blob = await load(key(owner, book, target, slot));
    if (!blob) { cb.toast('Recording file unavailable on this device.'); return; }
    const ext = blob.type.includes('mpeg') ? 'mp3' : blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
    const idx = S.get().profiles.findIndex(x => x.id === owner) + 1;
    const u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = `reading-record-${idx}-${book}-${target}-take-${slot}.${ext}`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000);
  } catch { cb.toast('Could not download the recording.'); }
}
async function remove(owner, book, target, slot) {
  stopPlayback();
  try {
    await del(key(owner, book, target, slot));
    const p = S.get().profiles.find(x => x.id === owner), t = p?.recordings?.[book]?.[target];
    if (t) { delete t[slot]; if (!Object.keys(t).length) delete p.recordings[book][target]; if (!Object.keys(p.recordings[book]).length) delete p.recordings[book]; }
    S.save(); mount(); cb.reviewRefresh(); cb.toast('Recording removed. This slot is ready again.');
  } catch { cb.toast('Could not remove the recording. Please try again.'); }
}
function targetTitle(t) { return t.startsWith('page-') ? 'Story page ' + Number(t.slice(5)) : (t[0] === 'r' ? 'Reading question ' : 'Math question ') + t.slice(1); }
export function reviewHtml(owner, bookTitles = {}) {
  const books = Object.entries(owner?.recordings || {});
  if (!books.length) return '<p>No saved takes yet. In a book, tap Record and then Save. Each page and question keeps two takes.</p>';
  return books.map(([book, targets]) => `<h3 style="margin-top:20px">${esc(bookTitles[book] || book)}</h3>` + Object.keys(targets).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(t =>
    `<div class="recorder-panel"><strong>${esc(targetTitle(t))}</strong><div class="recording-slots">${Object.entries(targets[t]).map(([slot, m]) =>
      `<div class="recording-slot"><div class="row between"><strong>Take ${esc(slot)}</strong><span class="saved-tag">✓ Saved</span></div><p class="recording-meta">${m.source === 'upload' ? 'Uploaded MP3' : 'Voice recording'} · ${m.duration ? fmt(m.duration) : 'Duration unavailable'}<br>${new Date(m.createdAt).toLocaleString()}</p>
      <div class="row"><button class="button secondary small" data-rrec="play" data-owner="${esc(owner.id)}" data-book="${esc(book)}" data-target="${esc(t)}" data-slot="${esc(slot)}">▶ Listen</button><button class="nav" data-rrec="download" data-owner="${esc(owner.id)}" data-book="${esc(book)}" data-target="${esc(t)}" data-slot="${esc(slot)}">↓ Download</button><button class="nav" data-rrec="remove" data-owner="${esc(owner.id)}" data-book="${esc(book)}" data-target="${esc(t)}" data-slot="${esc(slot)}">Remove</button></div><div class="rec-status"></div></div>`).join('')}</div></div>`).join('')).join('');
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('button,[data-go]');
  if (session && b && !['stop', 'cancel', 'pause', 'reset'].includes(b.dataset.rec) && !b.closest('.display-controls')) {
    e.preventDefault(); e.stopImmediatePropagation(); cb.toast('Tap Save first.'); return;
  }
  const d = b?.dataset; if (!d) return;
  if (d.rrec) {
    e.preventDefault(); e.stopImmediatePropagation();
    const slot = Number(d.slot);
    if (d.rrec === 'play') play(d.owner, d.book, d.target, slot, b.closest('.recording-slot')?.querySelector('.rec-status'));
    if (d.rrec === 'download') download(d.owner, d.book, d.target, slot);
    if (d.rrec === 'remove') remove(d.owner, d.book, d.target, slot);
    return;
  }
  if (!d.rec) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const box = $('#rec-box'), owner = S.profile()?.id, book = box?.dataset.book, target = box?.dataset.target;
  if (d.rec === 'slot') { slotPref = Number(d.slot); mount(); }
  if (d.rec === 'record') start();
  if (d.rec === 'pause') pause();
  if (d.rec === 'reset') reset();
  if (d.rec === 'stop') stop(false);
  if (d.rec === 'cancel') stop(true);
  if (d.rec === 'play') play(owner, book, target, slotPref, box.querySelector('.rec-status'));
  if (d.rec === 'download') download(owner, book, target, slotPref);
  if (d.rec === 'remove') remove(owner, book, target, slotPref);
}, true);
document.addEventListener('change', async e => {
  const el = e.target; if (!el.dataset.recUpload) return;
  if (session) { cb.toast('Save your recording first.'); return; }
  const file = el.files?.[0], box = $('#rec-box'); if (!file || !box) return;
  if (!/\.mp3$/i.test(file.name) && file.type !== 'audio/mpeg') { cb.toast('Choose an MP3 audio file.'); return; }
  if (file.size > 25 * 1024 * 1024) { cb.toast('That file is too big. Please keep it under 25 MB.'); return; }
  try {
    const duration = await new Promise(res => {
      const a = new Audio(), url = URL.createObjectURL(file); let fin = false;
      const f = n => { if (fin) return; fin = true; URL.revokeObjectURL(url); res(Number.isFinite(n) ? n : null); };
      a.onloadedmetadata = () => f(a.duration); a.onerror = () => f(null); a.src = url; setTimeout(() => f(null), 5000);
    });
    await save({ owner: S.profile().id, book: box.dataset.book, target: box.dataset.target, slot: slotPref }, file, 'upload', duration);
  } catch { cb.toast('Could not save the MP3. Check browser storage and try again.'); }
});
addEventListener('beforeunload', e => { if (session) { e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.hidden && session && session.state === 'recording') stop(false); });
