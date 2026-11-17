// Settings: saved values, quality presets, and the menus (settings with five tabs, pause, confirmation dialogs),
// plus tutorial hints, sound captions and readable notices. Every control writes straight into S and is saved.
import { t, setLang, translatePage, LANGS } from './i18n.js';
import * as In from './input.js';

const KEY = 'drw.settings.v1', HINTS_KEY = 'drw.hints.seen.v1';
export const DEFAULTS = {
  lang: (navigator.language || 'en').slice(0, 2), fullscreen: false, showFps: false, showNames: true, sens: 1, fov: 75, invertY: false, uiScale: 1, subtitles: false,
  preset: 'high', resScale: 1, shadows: 'high', textures: 'high', viewDist: 1, aa: 'msaa', ao: true, motionBlur: 'off', vsync: true, fpsCap: 0, particles: 'high', envDetail: 'high',
  vMaster: 80, vMusic: 40, vEnv: 80, vTrain: 85, vWeapons: 80, vEnemy: 80, vUi: 70, mute: false,
  shake: 'full', dmgInd: true, hints: true, autoPickup: 'off', tooltips: true, crosshair: true, difficulty: 'normal', enemies: 'normal', tutorial: true,
};
if (!LANGS.some(([k]) => k === DEFAULTS.lang)) DEFAULTS.lang = 'en';
export const PRESETS = {
  low: { resScale: 0.6, shadows: 'off', textures: 'low', viewDist: 0.6, aa: 'off', ao: false, motionBlur: 'off', particles: 'low', envDetail: 'low' },
  medium: { resScale: 0.8, shadows: 'low', textures: 'medium', viewDist: 0.8, aa: 'fxaa', ao: false, motionBlur: 'off', particles: 'medium', envDetail: 'medium' },
  high: { resScale: 1, shadows: 'high', textures: 'high', viewDist: 1, aa: 'msaa', ao: true, motionBlur: 'off', particles: 'high', envDetail: 'high' },
  ultra: { resScale: 'native', shadows: 'ultra', textures: 'ultra', viewDist: 1.4, aa: 'msaa', ao: true, motionBlur: 'low', particles: 'high', envDetail: 'ultra' },
};
const PRESET_KEYS = Object.keys(PRESETS.high);
export const S = Object.assign({}, DEFAULTS);
try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); for (const k in DEFAULTS) if (s && k in s && typeof s[k] === typeof DEFAULTS[k] || (k === 'resScale' && s && s[k] !== undefined)) S[k] = s[k]; } catch (e) {}
setLang(S.lang);
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const listeners = [];
export function onChange(fn) { listeners.push(fn); }
function emit(keys) { save(); for (const f of listeners) f(keys); }
function matchPreset() { for (const p in PRESETS) if (PRESET_KEYS.every(k => PRESETS[p][k] === S[k])) return p; return 'custom'; }
export function set(k, v) {
  if (k === 'preset') { if (!PRESETS[v]) return; Object.assign(S, PRESETS[v]); S.preset = v; emit([...PRESET_KEYS, 'preset']); render(); return; }
  S[k] = v;
  const keys = [k];
  if (PRESET_KEYS.includes(k)) { const p = matchPreset(); if (p !== S.preset) { S.preset = p; keys.push('preset'); } }
  emit(keys);
}
export const resolutionRatio = v => v === 'native' ? Math.min(devicePixelRatio || 1, 2) : +v;

// ---------------- DOM helpers ----------------
const $ = id => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let hooks = { click() {}, test() {}, mainMenu() {}, quit() {}, resume() {}, opened() {} };

const ICON = {
  general: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>',
  graphics: '<svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="12" rx="1"/><path d="M8 20h8M12 16.5V20M6.5 13l3.5-4 3 3 2-2 2.5 3"/></svg>',
  audio: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  controls: '<svg viewBox="0 0 24 24"><rect x="2.5" y="6.5" width="19" height="11" rx="1.5"/><path d="M6 10h1.5M9.5 10H11M13 10h1.5M16.5 10H18M7 14h10"/></svg>',
  gameplay: '<svg viewBox="0 0 24 24"><path d="M12 2.8l2.3 5.7 6.1.4-4.7 3.9 1.5 5.9L12 15.5l-5.2 3.2 1.5-5.9-4.7-3.9 6.1-.4z"/></svg>',
};

// ---------------- schema ----------------
const opt = (...ks) => ks.map(k => [k, 'o_' + k]);
function resOptions() {
  const dpr = Math.min(devicePixelRatio || 1, 2), list = [['native', null, dpr]];
  for (const r of [1, 0.9, 0.8, 0.7, 0.6, 0.5]) if (r < dpr - 0.01) list.push([r, null, r]);
  return list.map(([v, , r]) => [v, null, `${v === 'native' ? t('o_native') + ' · ' : ''}${Math.round(innerWidth * r)} × ${Math.round(innerHeight * r)}`]);
}
const TABS = [
  { id: 'general', rows: [
    { k: 'lang', type: 'select', opts: () => LANGS.map(([k, n]) => [k, null, n]), confirm: true },
    { k: 'fullscreen', type: 'toggle' }, { k: 'showFps', type: 'toggle' }, { k: 'showNames', type: 'toggle' },
    { k: 'sens', type: 'range', min: 0.2, max: 3, step: 0.05, fmt: v => v.toFixed(2) + '×' },
    { k: 'fov', type: 'range', min: 60, max: 100, step: 1, fmt: v => v + '°' },
    { k: 'invertY', type: 'toggle' },
    { k: 'uiScale', type: 'range', min: 0.75, max: 1.5, step: 0.05, fmt: v => Math.round(v * 100) + '%', confirm: true },
    { k: 'subtitles', type: 'toggle', desc: true },
  ] },
  { id: 'graphics', rows: [
    { k: 'preset', type: 'seg', opts: () => opt('low', 'medium', 'high', 'ultra'), extra: () => S.preset === 'custom' ? t('o_custom') : '' },
    { k: 'resScale', type: 'select', opts: resOptions, confirm: true, desc: true },
    { k: 'shadows', type: 'seg', opts: () => opt('off', 'low', 'medium', 'high', 'ultra') },
    { k: 'textures', type: 'seg', opts: () => opt('low', 'medium', 'high', 'ultra') },
    { k: 'viewDist', type: 'range', min: 0.5, max: 1.5, step: 0.1, fmt: v => Math.round(v * 100) + '%' },
    { k: 'aa', type: 'seg', opts: () => opt('off', 'fxaa', 'msaa'), desc: true },
    { k: 'ao', type: 'toggle' },
    { k: 'motionBlur', type: 'seg', opts: () => opt('off', 'low', 'high') },
    { k: 'vsync', type: 'toggle', desc: true },
    { k: 'fpsCap', type: 'seg', opts: () => [[0, 'o_unlimited'], [30, null, '30'], [60, null, '60'], [120, null, '120']] },
    { k: 'particles', type: 'seg', opts: () => opt('low', 'medium', 'high'), desc: true },
    { k: 'envDetail', type: 'seg', opts: () => opt('low', 'medium', 'high', 'ultra'), desc: true },
  ] },
  { id: 'audio', rows: [
    ...['vMaster', 'vMusic', 'vEnv', 'vTrain', 'vWeapons', 'vEnemy', 'vUi'].map(k => ({ k, type: 'range', min: 0, max: 100, step: 1, fmt: v => v + '%', test: k === 'vMaster' ? null : k, desc: k === 'vWeapons' })),
    { k: 'mute', type: 'toggle' },
  ] },
  { id: 'controls', custom: true },
  { id: 'gameplay', rows: [
    { k: 'shake', type: 'seg', opts: () => opt('off', 'low', 'full') }, { k: 'dmgInd', type: 'toggle' }, { k: 'hints', type: 'toggle', desc: true },
    { k: 'autoPickup', type: 'seg', opts: () => opt('off', 'valuables', 'all'), desc: true }, { k: 'tooltips', type: 'toggle' }, { k: 'crosshair', type: 'toggle' },
    { k: 'difficulty', type: 'seg', opts: () => opt('easy', 'normal', 'hard'), desc: true }, { k: 'enemies', type: 'seg', opts: () => opt('off', 'few', 'normal', 'many'), desc: true }, { k: 'tutorial', type: 'toggle', button: ['resetHints', () => { seen.clear(); saveSeen(); hooks.click(); flash(t('resetHints') + ' ✓'); }] },
  ] },
];

// ---------------- build the menus ----------------
let root, pauseEl, setEl, dlgEl, noteEl, capEl, hintEl, curTab = 'general', from = 'pause';
export function initMenus(h) {
  hooks = Object.assign(hooks, h);
  root = el('div'); root.id = 'menus'; document.body.appendChild(root);
  pauseEl = el('div', 'mlayer'); pauseEl.id = 'pauseMenu';
  pauseEl.innerHTML = `<div class="wood plank">
    <div class="rivets"></div><div class="eyebrow" data-i18n="paused"></div><h2>Dead Rails <em>Desert</em></h2>
    <p class="pstate"></p>
    <div class="pbtns">${['resume', 'restart', 'settings', 'controls', 'mainMenu', 'quit'].map(k => `<button class="mbtn${k === 'resume' ? ' primary' : ''}" data-p="${k}" data-i18n="${k}"></button>`).join('')}<button class="mbtn" data-p="server" hidden>Players &amp; invites</button></div></div>`;
  pauseEl.addEventListener('click', e => {
    const b = e.target.closest('[data-p]'); if (!b) return; hooks.click();
    const k = b.dataset.p;
    if (k === 'resume') closePause(true);
    if (k === 'settings') openSettings('general', 'pause');
    if (k === 'controls') openSettings('controls', 'pause');
    if (k === 'mainMenu') dialog({ body: t('confirm_menu'), buttons: [[t('no')], [t('yes'), () => { closePause(false); hooks.mainMenu(); }, true]] });
    if (k === 'quit') dialog({ body: t('confirm_quit'), buttons: [[t('no')], [t('yes'), () => { closePause(false); hooks.quit(); }, true]] });
    if (k === 'restart') restartDialog();
    if (k === 'server') { closePause(false); hooks.serverPanel && hooks.serverPanel(); }
  });
  setEl = el('div', 'mlayer'); setEl.id = 'settingsMenu';
  dlgEl = el('div', 'mlayer'); dlgEl.id = 'dialog';
  noteEl = el('div', 'mlayer'); noteEl.id = 'noteView';
  root.append(pauseEl, setEl, noteEl, dlgEl);
  capEl = el('div'); capEl.id = 'captions'; hintEl = el('div', 'wood'); hintEl.id = 'hintBox';
  document.getElementById('hud').append(capEl, hintEl);
  hintEl.addEventListener('click', () => hintEl.classList.remove('on'));
  noteEl.addEventListener('click', e => { if (e.target === noteEl || e.target.closest('[data-close]')) closeNote(); });
  // Esc steps back out of whichever menu is on top
  addEventListener('keydown', e => {
    if (capturing) return;
    if (!menuOpen()) return;
    if (e.code === 'Escape' || (e.code === In.binds.pause && !dlgEl.classList.contains('on'))) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (dlgEl.classList.contains('on')) dlgCancel();
      else if (noteEl.classList.contains('on')) closeNote();
      else if (setEl.classList.contains('on')) closeSettings();
      else if (pauseEl.classList.contains('on')) closePause(true);
    } else e.stopImmediatePropagation();
  }, true);
  translatePage();
}
export const menuOpen = () => !!root && [pauseEl, setEl, dlgEl, noteEl].some(x => x.classList.contains('on'));
export const pauseOpen = () => !!pauseEl && (pauseEl.classList.contains('on') || setEl.classList.contains('on') && from === 'pause');
export function openPause(multiplayer) {
  pauseEl.querySelector('.pstate').textContent = multiplayer ? t('paused_mp') : t('paused_sp');
  pauseEl.querySelector('[data-p="server"]').hidden = !(hooks.online && hooks.online());
  pauseEl.classList.add('on'); hooks.opened();
}
export function closePause(resume) { pauseEl.classList.remove('on'); setEl.classList.remove('on'); if (resume) hooks.resume(); }
export function openSettings(tab = 'general', f = 'pause') { from = f; curTab = tab; setEl.classList.add('on'); render(); hooks.opened(); }
export function closeSettings() {
  setEl.classList.remove('on'); cancelCapture();
  if (from === 'main') hooks.backToMain && hooks.backToMain();
}

let flashT = 0;
function flash(msg) { const f = setEl.querySelector('.saved'); if (!f) return; f.textContent = msg; f.classList.add('flash'); clearTimeout(flashT); flashT = setTimeout(() => { f.textContent = t('saved'); f.classList.remove('flash'); }, 1400); }

function render() {
  if (!setEl || !setEl.classList.contains('on')) return;
  const scroll = setEl.querySelector('.sbody') ? setEl.querySelector('.sbody').scrollTop : 0;
  setEl.innerHTML = `<div class="wood spanel"><div class="rivets"></div>
    <header><div><div class="eyebrow">${esc(t('settings'))}</div><h2>${esc(t('tab_' + curTab))}</h2></div><span class="saved">${esc(t('saved'))}</span><button class="mbtn small" data-close>${esc(from === 'main' ? t('back') : t('close'))}</button></header>
    <nav>${TABS.map(T => `<button class="stab${T.id === curTab ? ' on' : ''}" data-tab="${T.id}">${ICON[T.id]}<span>${esc(t('tab_' + T.id))}</span></button>`).join('')}</nav>
    <div class="sbody"></div></div>`;
  const body = setEl.querySelector('.sbody'), tab = TABS.find(T => T.id === curTab);
  if (tab.custom) renderControls(body); else for (const r of tab.rows) body.appendChild(row(r));
  body.scrollTop = scroll;
  setEl.querySelector('[data-close]').onclick = () => { hooks.click(); closeSettings(); };
  for (const b of setEl.querySelectorAll('[data-tab]')) b.onclick = () => { hooks.click(); cancelCapture(); curTab = b.dataset.tab; render(); setEl.querySelector('.sbody').scrollTop = 0; };
}
function row(r) {
  const line = el('div', 'srow'), info = el('div', 'sinfo');
  info.innerHTML = `<b>${esc(t('s_' + r.k))}</b>${r.desc ? `<small>${esc(t(r.k === 'vWeapons' ? 'd_vWeapons' : 'd_' + r.k))}</small>` : ''}`;
  const ctl = el('div', 'sctl'); line.append(info, ctl);
  const commit = v => {
    if (r.k === 'preset') { set('preset', v); hooks.click(); return; }
    const old = S[r.k]; if (old === v) return;
    set(r.k, v); hooks.click();
    if (r.confirm) confirmRevert(() => { set(r.k, old); render(); });
    if (r.type !== 'range') render();
  };
  if (r.type === 'toggle') {
    const b = el('button', 'switch' + (S[r.k] ? ' on' : ''), `<i></i><span>${esc(t(S[r.k] ? 'o_on' : 'o_off'))}</span>`);
    b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', S[r.k] ? 'true' : 'false'); b.onclick = () => commit(!S[r.k]); ctl.appendChild(b);
  } else if (r.type === 'seg') {
    const g = el('div', 'seg');
    for (const [v, key, txt] of r.opts()) { const b = el('button', String(S[r.k]) === String(v) ? 'on' : '', esc(txt || t(key))); b.onclick = () => commit(v); g.appendChild(b); }
    ctl.appendChild(g);
    if (r.extra && r.extra()) ctl.appendChild(el('span', 'tag', esc(r.extra())));
  } else if (r.type === 'select') {
    const s = el('select'); s.setAttribute('aria-label', t('s_' + r.k));
    const same = v => r.k === 'resScale' ? Math.abs(resolutionRatio(S[r.k]) - resolutionRatio(v)) < 0.01 : String(S[r.k]) === String(v);
    for (const [v, key, txt] of r.opts()) { const o = el('option', null, esc(txt || t(key))); o.value = String(v); if (same(v) && ![...s.options].some(x => x.selected)) o.selected = true; s.appendChild(o); }
    if (![...s.options].some(o => o.selected)) { const o = el('option', null, '—'); o.selected = true; o.disabled = true; s.prepend(o); }
    s.onchange = () => { const v = s.value; commit(v === 'native' || isNaN(+v) ? v : +v); };
    ctl.appendChild(s);
  } else if (r.type === 'range') {
    const inp = el('input'); Object.assign(inp, { type: 'range', min: r.min, max: r.max, step: r.step, value: S[r.k] });
    inp.setAttribute('aria-label', t('s_' + r.k));
    const out = el('output', null, r.fmt(S[r.k]));
    inp.oninput = () => { const v = +inp.value; out.textContent = r.fmt(v); set(r.k, v); };
    let before = S[r.k];
    inp.onpointerdown = () => { before = S[r.k]; };
    inp.onchange = () => { hooks.click(); if (r.confirm && before !== S[r.k]) { const o = before; confirmRevert(() => { set(r.k, o); render(); }); } };
    ctl.append(inp, out);
    if (r.test) { const b = el('button', 'mbtn small', esc(t('test'))); b.onclick = () => hooks.test(r.test); ctl.appendChild(b); }
  }
  if (r.button) { const b = el('button', 'mbtn small', esc(t(r.button[0]))); b.onclick = r.button[1]; ctl.appendChild(b); }
  return line;
}

// ---------------- controls tab ----------------
let capturing = null;
function renderControls(body) {
  body.appendChild(el('p', 'chint', esc(t('c_hint')) + '<br><small>' + esc(t('c_esc')) + '</small>'));
  const groups = ['move', 'act', 'menu', 'train', 'world'];
  for (const g of groups) {
    body.appendChild(el('h3', 'cgroup', esc(t('g_' + g))));
    for (const a of In.ACTIONS.filter(x => x.group === g)) {
      const line = el('div', 'srow crow'), name = el('div', 'sinfo', `<b>${esc(t('a_' + a.id))}</b>`), ctl = el('div', 'sctl');
      const b = el('button', 'keycap' + (In.binds[a.id] !== a.def ? ' changed' : ''), esc(In.label(a.id))); b.dataset.act = a.id;
      b.onclick = e => { e.stopPropagation(); hooks.click(); startCapture(a.id, b, line); };
      ctl.appendChild(b); line.append(name, ctl); body.appendChild(line);
    }
  }
  const r = el('div', 'cfoot'), reset = el('button', 'mbtn', esc(t('c_reset')));
  reset.disabled = In.isDefault();
  reset.onclick = () => { hooks.click(); dialog({ body: t('confirm_reset'), buttons: [[t('no')], [t('yes'), () => { In.resetAll(); render(); }, true]] }); };
  r.appendChild(reset); body.appendChild(r);
}
function startCapture(id, btn, line) {
  cancelCapture();
  capturing = { id, btn, line };
  btn.classList.add('listening'); btn.textContent = t('c_press');
  const finish = code => {
    stop();
    if (code === null) { render(); return; }
    if (In.RESERVED.has(code)) { showMsg(line, t('c_reserved')); return; }
    const clash = In.conflicts(id, code);
    if (!clash.length) { In.setBind(id, code); render(); return; }
    const other = clash[0], old = In.binds[id];
    // swapping is only offered if the other action can take this one's old key without a new clash
    const canSwap = clash.length === 1 && !In.ACTIONS.some(b => b.id !== other && b.id !== id && In.binds[b.id] === old && In.BY_ID[b.id].ctx.some(c => In.BY_ID[other].ctx.includes(c)));
    showMsg(line, t('c_conflict', { key: In.keyName(code), action: t('a_' + other) }), canSwap ? [[t('c_swap'), () => { In.swap(id, code, other); render(); }], [t('c_cancel'), () => render()]] : [[t('c_cancel'), () => render()]]);
  };
  const onKey = e => { e.preventDefault(); e.stopImmediatePropagation(); finish(e.code === 'Escape' ? null : e.code); };
  // left-clicking anywhere but the key cap cancels; any other button (or left on the cap itself) becomes the binding
  const onMouse = e => { e.preventDefault(); e.stopImmediatePropagation(); finish(e.button === 0 && e.target !== btn ? null : 'Mouse' + e.button); };
  const onCtx = e => e.preventDefault();
  const stop = () => { removeEventListener('keydown', onKey, true); removeEventListener('mousedown', onMouse, true); removeEventListener('contextmenu', onCtx, true); capturing = null; };
  capturing.stop = stop;
  setTimeout(() => { if (!capturing || capturing.btn !== btn) return; capturing.armed = true; addEventListener('keydown', onKey, true); addEventListener('mousedown', onMouse, true); addEventListener('contextmenu', onCtx, true); }, 0);
}
function cancelCapture() { if (capturing && capturing.stop) capturing.stop(); capturing = null; }
function showMsg(line, msg, buttons = []) {
  const m = el('div', 'cmsg', `<span>${esc(msg)}</span>`);
  for (const [lab, fn] of buttons) { const b = el('button', 'mbtn small', esc(lab)); b.onclick = () => { hooks.click(); fn(); }; m.appendChild(b); }
  line.after(m);
  const b = line.querySelector('.keycap'); if (b) { b.classList.remove('listening'); b.textContent = In.label(line.querySelector('.keycap').dataset.act); }
  if (!buttons.length) setTimeout(() => m.remove(), 2500);
}

// ---------------- dialogs ----------------
let dlgCancel = () => {};
export function dialog({ body, buttons, countdown }) {
  dlgEl.innerHTML = `<div class="wood dlg"><div class="rivets"></div><p>${esc(body)}</p><p class="count"></p><div class="dbtns"></div></div>`;
  const box = dlgEl.querySelector('.dbtns'); let timer = 0;
  const close = () => { clearInterval(timer); dlgEl.classList.remove('on'); };
  buttons.forEach(([lab, fn, primary]) => { const b = el('button', 'mbtn' + (primary ? ' primary' : ''), esc(lab)); b.onclick = () => { hooks.click(); close(); fn && fn(); }; box.appendChild(b); });
  dlgCancel = () => { close(); const c = buttons[0][1]; c && c(); };
  if (countdown) {
    let n = countdown.n; const c = dlgEl.querySelector('.count'); c.textContent = t('confirm_count', { n });
    timer = setInterval(() => { n--; c.textContent = t('confirm_count', { n }); if (n <= 0) { close(); countdown.expire(); } }, 1000);
  }
  dlgEl.classList.add('on');
  const p = dlgEl.querySelector('.primary') || dlgEl.querySelector('button'); if (p) p.focus();
}
function confirmRevert(revert) {
  setTimeout(() => dialog({ body: t('confirm_display'), countdown: { n: 10, expire: revert }, buttons: [[t('revert'), revert], [t('keep'), null, true]] }), 60);
}

// ---------------- readable notices ----------------
export function readNote(title, bodyText) {
  noteEl.innerHTML = `<div class="paper note"><div class="eyebrow">${esc(t('read'))}</div><h3>${esc(title)}</h3><pre>${esc(bodyText)}</pre><button class="mbtn small" data-close>${esc(t('close'))}</button></div>`;
  noteEl.classList.add('on'); hooks.opened();
}
export function closeNote() { noteEl.classList.remove('on'); if (hooks.noteClosed) hooks.noteClosed(); }
export const noteOpen = () => !!noteEl && noteEl.classList.contains('on');

// ---------------- captions ----------------
const lastCap = new Map();
export function caption(key) {
  if (!S.subtitles || !capEl) return;
  const now = performance.now(); if (now - (lastCap.get(key) || 0) < 1500) return; lastCap.set(key, now);
  const c = el('div', 'cap', esc(t(key))); capEl.appendChild(c);
  while (capEl.children.length > 3) capEl.firstChild.remove();
  setTimeout(() => c.classList.add('out'), 3200); setTimeout(() => c.remove(), 4000);
}

// ---------------- tutorial hints ----------------
const seen = new Set((() => { try { return JSON.parse(localStorage.getItem(HINTS_KEY) || '[]'); } catch (e) { return []; } })());
const saveSeen = () => { try { localStorage.setItem(HINTS_KEY, JSON.stringify([...seen])); } catch (e) {} };
let hintT = 0, hintShown = 0;
export function hint(id) {
  if (!S.tutorial || seen.has(id) || !hintEl || performance.now() - hintShown < 7000) return false;
  seen.add(id); saveSeen(); hintShown = performance.now();
  const html = t('h_' + id).split(/(\{\w+\})/).map(p => /^\{\w+\}$/.test(p) ? `<kbd>${esc(In.label(p.slice(1, -1)))}</kbd>` : esc(p)).join('');
  hintEl.innerHTML = `<b>${esc(t('hintTitle'))}</b><span>${html}</span>`;
  hintEl.classList.add('on'); clearTimeout(hintT); hintT = setTimeout(() => hintEl.classList.remove('on'), 11000);
  return true;
}

// re-label the page and the open menus after a language change
export function relabel() { setLang(S.lang); translatePage(); render(); if (pauseEl && pauseEl.classList.contains('on')) pauseEl.querySelector('.pstate').textContent = t(hooks.multiplayer && hooks.multiplayer() ? 'paused_mp' : 'paused_sp'); }
export { t };
// Restart: reload the game where you left off, or start over from Dry Gulch with nothing (settings and keys are kept).
// Starting over is done on the next load, before anything reads the saves, so nothing written on the way out survives.
export function restartDialog() {
  dialog({ body: t('confirm_restart'), buttons: [[t('no')], [t('restart_keep'), () => location.reload()], [t('restart_wipe'), () => dialog({ body: t('confirm_wipe'), buttons: [[t('no')], [t('yes'), () => { try { sessionStorage.setItem('drw.wipe', '1'); } catch (e) {} location.reload(); }, true]] }), true]] });
}
