// All saved progress lives here. Today it saves in this browser (localStorage).
// Every other file goes through these functions, so a cloud database can replace
// this one file later without touching the screens.
const KEY = 'rigorup-readers-v2';

const blank = () => ({
  version: 2, active: null, profiles: [], pin: '',
  settings: { placement: 'during', answers: 'now', timer: 'standard', motion: true, theme: 'light', palette: 'sunset', textSize: 'medium', showText: false }
});

let state;
try { state = JSON.parse(localStorage.getItem(KEY)) || blank(); } catch { state = blank(); }
state.settings = { ...blank().settings, ...state.settings };

export const get = () => state;
export const settings = () => state.settings;
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
  catch { return false; }
}
export const profile = () => state.profiles.find(p => p.id === state.active) || null;

export function newProfile(name) {
  const p = {
    id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name: (name || '').trim().slice(0, 24) || 'Reader ' + (state.profiles.length + 1),
    balance: 0, lifetime: 0, owned: [], badges: [], books: {}
  };
  state.profiles.push(p); state.active = p.id; save(); return p;
}
export function switchProfile(id) { if (state.profiles.some(p => p.id === id)) { state.active = id; save(); } }
export function removeProfile(id) {
  state.profiles = state.profiles.filter(p => p.id !== id);
  if (state.active === id) state.active = state.profiles[0]?.id || null;
  save();
}

// Progress for one book version, created on first use.
export function progress(bookId) {
  const p = profile();
  p.books[bookId] = p.books[bookId] || { page: 0, read: [], attempts: {}, completed: false };
  return p.books[bookId];
}

export function addBadge(id) {
  const p = profile();
  if (!p || p.badges.includes(id)) return false;
  p.badges.push(id); save(); return true;
}

export function exportBackup() { return JSON.stringify(state, null, 2); }
export function importBackup(text) {
  const v = JSON.parse(text);
  if (v.version !== 2 || !Array.isArray(v.profiles) || v.profiles.length > 30 || !v.settings) throw new Error('bad backup');
  for (const p of v.profiles) {
    if (typeof p.id !== 'string' || typeof p.name !== 'string' || p.name.length > 24 ||
        !Number.isFinite(p.balance) || p.balance < 0 || !Array.isArray(p.owned) || !p.books || typeof p.books !== 'object')
      throw new Error('bad profile');
  }
  state = v; state.settings = { ...blank().settings, ...state.settings };
  if (!state.profiles.some(p => p.id === state.active)) state.active = state.profiles[0]?.id || null;
  save();
}
