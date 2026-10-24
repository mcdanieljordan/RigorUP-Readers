// Reading strip: a movable one-line window that hides the rest of the page so a reader can focus.
import * as S from './store.js';
const $ = (s, r = document) => r.querySelector(s);
export const COLORS = { amber: '#ffc857', green: '#75dcb0', blue: '#80cbed', violet: '#c3a0ee' };
let ptr = null;

function opts() {
  const s = S.settings(); s.guide = s.guide || { on: false, color: 'amber', y: 0.8, height: 40 };
  const g = s.guide;
  if (!COLORS[g.color]) g.color = 'amber';
  if (!Number.isFinite(g.y)) g.y = 0.8;
  if (![28, 40, 56].includes(g.height)) g.height = 40;
  return g;
}
export function markup() {
  const g = opts();
  return `<div id="readingGuide" class="reading-guide ${g.on ? '' : 'hide'}" style="--guide-color:${COLORS[g.color]}"><div class="guide-mask guide-mask-top"></div><div class="guide-mask guide-mask-bottom"></div><div id="guideBand" class="guide-band" role="slider" tabindex="0" aria-label="Reading line. Drag either end or use the up and down arrow keys to move it." aria-orientation="vertical" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(g.y * 100)}"><span class="guide-handle left" aria-hidden="true">⋮⋮</span><span class="guide-handle right" aria-hidden="true">⋮⋮</span></div></div>`;
}
export function controls() {
  const g = opts();
  return `<section class="guide-controls"><h3>Reading strip</h3><button class="button secondary small" id="guideToggle" data-guide="toggle" aria-pressed="${!!g.on}">${g.on ? 'Turn strip off' : 'Show one line'}</button>
  <div class="guide-colors" role="group" aria-label="Reading strip color">${Object.entries(COLORS).map(([id, c]) => `<button class="guide-color ${g.color === id ? 'selected' : ''}" style="--swatch:${c}" data-guide="color" data-color="${id}" aria-label="${id} reading strip" aria-pressed="${g.color === id}"><span></span></button>`).join('')}</div>
  <label class="note" for="guideHeight">Line height</label><select id="guideHeight"><option value="28" ${g.height === 28 ? 'selected' : ''}>Narrow</option><option value="40" ${g.height === 40 ? 'selected' : ''}>Medium</option><option value="56" ${g.height === 56 ? 'selected' : ''}>Wide</option></select>
  <p class="note">Drag either end to line it up.</p></section>`;
}
export function mount() {
  const host = $('#guideHost'), band = $('#guideBand'), g = opts(), guide = $('#readingGuide');
  if (!host || !band || !guide) return;
  const height = host.getBoundingClientRect().height; if (height <= 0) return;
  const line = Math.min(g.height, height), half = line / 2;
  g.y = Math.max(half / height, Math.min(1 - half / height, g.y));
  const top = g.y * height - half;
  band.style.top = top + 'px'; band.style.height = line + 'px';
  band.setAttribute('aria-valuenow', String(Math.round(g.y * 100)));
  guide.style.setProperty('--guide-color', COLORS[g.color]); guide.classList.toggle('hide', !g.on);
  $('.guide-mask-top', guide).style.height = top + 'px';
  const bottom = $('.guide-mask-bottom', guide); bottom.style.top = (top + line) + 'px'; bottom.style.height = Math.max(0, height - top - line) + 'px';
}
function setFromPointer(y) {
  const host = $('#guideHost'); if (!host) return;
  const b = host.getBoundingClientRect(); if (!b.height) return;
  opts().y = (y - b.top) / b.height; mount();
}
document.addEventListener('pointerdown', e => {
  const band = e.target.closest('#guideBand'); if (!band || !opts().on) return;
  e.preventDefault();
  const r = band.getBoundingClientRect();
  ptr = { id: e.pointerId, offset: e.clientY - (r.top + r.height / 2) };
  try { band.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  band.classList.add('dragging');
});
document.addEventListener('pointermove', e => { if (!ptr || e.pointerId !== ptr.id) return; e.preventDefault(); setFromPointer(e.clientY - ptr.offset); }, { passive: false });
function end(e) { if (!ptr || e.pointerId !== ptr.id) return; ptr = null; $('#guideBand')?.classList.remove('dragging'); S.save(); }
document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
document.addEventListener('keydown', e => {
  if (e.target.id !== 'guideBand' || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault(); e.stopPropagation();
  const g = opts(), h = $('#guideHost').getBoundingClientRect().height;
  if (e.key === 'Home') g.y = 0; else if (e.key === 'End') g.y = 1; else g.y += (e.key === 'ArrowUp' ? -1 : 1) * (e.shiftKey ? 20 : 5) / h;
  mount(); S.save();
}, true);
document.addEventListener('click', e => {
  const b = e.target.closest('[data-guide]'); if (!b) return;
  const g = opts();
  if (b.dataset.guide === 'toggle') { g.on = !g.on; b.textContent = g.on ? 'Turn strip off' : 'Show one line'; b.setAttribute('aria-pressed', String(g.on)); }
  if (b.dataset.guide === 'color') {
    g.color = b.dataset.color;
    document.querySelectorAll('[data-guide="color"]').forEach(el => { el.classList.toggle('selected', el === b); el.setAttribute('aria-pressed', String(el === b)); });
  }
  mount(); S.save();
});
document.addEventListener('change', e => { if (e.target.id === 'guideHeight') { opts().height = Number(e.target.value); mount(); S.save(); } });
document.addEventListener('load', e => { if (e.target.tagName === 'IMG' && e.target.closest('#guideHost')) mount(); }, true);
addEventListener('resize', mount);
