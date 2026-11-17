// Key bindings: every action the player can rebind, saved in this browser, with conflict checking.
// A binding is a KeyboardEvent.code ('KeyW', 'Space', ...) or a mouse button ('Mouse0' left, 'Mouse1' middle, 'Mouse2' right).
// Contexts say when an action listens: on foot, at the train controls, or with the inventory open. Two actions may
// share a key only if they never listen at the same time (W walks on foot and opens the throttle in the cab).
const F = 'foot', TR = 'train', UI = 'ui';
export const ACTIONS = [
  { id: 'forward', group: 'move', def: 'KeyW', ctx: [F] },
  { id: 'back', group: 'move', def: 'KeyS', ctx: [F] },
  { id: 'left', group: 'move', def: 'KeyA', ctx: [F] },
  { id: 'right', group: 'move', def: 'KeyD', ctx: [F] },
  { id: 'jump', group: 'move', def: 'Space', ctx: [F] },
  { id: 'sprint', group: 'move', def: 'ShiftLeft', ctx: [F] },
  { id: 'crouch', group: 'move', def: 'KeyC', ctx: [F] },
  { id: 'interact', group: 'act', def: 'KeyE', ctx: [F, TR, UI] },
  { id: 'primary', group: 'act', def: 'Mouse0', ctx: [F] },
  { id: 'secondary', group: 'act', def: 'Mouse2', ctx: [F] },
  { id: 'reload', group: 'act', def: 'KeyR', ctx: [F] },
  { id: 'flashlight', group: 'act', def: 'KeyF', ctx: [F, TR] },
  { id: 'callHorse', group: 'act', def: 'KeyX', ctx: [F] },
  ...[1, 2, 3, 4, 5, 6].map(n => ({ id: 'hot' + n, group: 'act', def: 'Digit' + n, ctx: [F, UI], n })),
  { id: 'inventory', group: 'menu', def: 'KeyI', ctx: [F, TR, UI] },
  { id: 'playerInv', group: 'menu', def: 'Tab', ctx: [F, TR, UI] },
  { id: 'pause', group: 'menu', def: 'Escape', ctx: [F, TR, UI] },
  { id: 'map', group: 'menu', def: 'KeyM', ctx: [F, TR] },
  { id: 'help', group: 'menu', def: 'KeyH', ctx: [F, TR] },
  { id: 'rotate', group: 'menu', def: 'KeyR', ctx: [UI] },
  { id: 'throttleUp', group: 'train', def: 'KeyW', ctx: [TR] },
  { id: 'throttleDown', group: 'train', def: 'KeyS', ctx: [TR] },
  { id: 'brake', group: 'train', def: 'Space', ctx: [TR] },
  { id: 'whistle', group: 'train', def: 'KeyQ', ctx: [TR] },
  { id: 'bell', group: 'train', def: 'KeyB', ctx: [TR] },
  { id: 'view', group: 'train', def: 'KeyV', ctx: [TR] },
  { id: 'flight', group: 'world', def: 'KeyY', ctx: [F] },
  { id: 'timeLapse', group: 'world', def: 'KeyT', ctx: [F, TR] },
  { id: 'hourBack', group: 'world', def: 'BracketLeft', ctx: [F, TR] },
  { id: 'hourFwd', group: 'world', def: 'BracketRight', ctx: [F, TR] },
  { id: 'night', group: 'world', def: 'KeyN', ctx: [F, TR] },
];
export const BY_ID = Object.fromEntries(ACTIONS.map(a => [a.id, a]));
const KEY = 'drw.bindings.v1';
export const binds = {};
function load() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) {}
  for (const a of ACTIONS) binds[a.id] = typeof saved[a.id] === 'string' ? saved[a.id] : a.def;
  // a saved set that somehow conflicts falls back to the defaults rather than leaving two actions on one key
  for (const a of ACTIONS) if (conflicts(a.id, binds[a.id]).length) { for (const b of ACTIONS) binds[b.id] = b.def; break; }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(binds)); } catch (e) {} }

const overlap = (a, b) => a.ctx.some(c => b.ctx.includes(c));
// which other actions would clash if `id` were bound to `code`
export function conflicts(id, code) { const A = BY_ID[id]; return ACTIONS.filter(b => b.id !== id && binds[b.id] === code && overlap(A, b)).map(b => b.id); }
export function setBind(id, code) { binds[id] = code; save(); }
// give `id` the key and hand its old key to whoever had it (only offered when that's itself conflict-free)
export function swap(id, code, other) { const old = binds[id]; binds[id] = code; binds[other] = old; save(); }
export function resetAll() { for (const a of ACTIONS) binds[a.id] = a.def; save(); }
export const isDefault = () => ACTIONS.every(a => binds[a.id] === a.def);
// actions bound to `code` that listen in context `ctx`
export function actionsFor(code, ctx) { return ACTIONS.filter(a => binds[a.id] === code && a.ctx.includes(ctx)).map(a => a.id); }

const NAMES = { Space: 'Space', Escape: 'Esc', Tab: 'Tab', Enter: 'Enter', Backspace: 'Backspace', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Left Alt', AltRight: 'Right Alt', MetaLeft: 'Left ⌘', MetaRight: 'Right ⌘', CapsLock: 'Caps Lock',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', BracketLeft: '[', BracketRight: ']', Backquote: '`', Minus: '-', Equal: '=', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
  Mouse0: 'Left mouse', Mouse1: 'Middle mouse', Mouse2: 'Right mouse', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5' };
export function keyName(code) {
  if (!code) return '—';
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}
export const label = id => keyName(binds[id]);
// keys the browser or the page reserves
export const RESERVED = new Set(['F5', 'F11', 'F12', 'MetaLeft', 'MetaRight']);

load();
