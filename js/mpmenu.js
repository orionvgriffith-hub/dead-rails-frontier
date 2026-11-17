// The multiplayer menu on the title card: quick join, the public server list, private servers and invitation codes,
// creating a server, and (in game, from the pause menu) the session panel with the code and the owner's tools.
// Joining goes through online.js; the game itself starts through hooks.play(room).
import * as Online from './game/online.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PENDING = 'drw.pendingJoin';
const DIFF_NAME = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
let H = null, panel = null, view = null, list = [], busy = false, serverUp = false;

export function initMultiplayer(hooks) {
  H = hooks;
  panel = document.createElement('div'); panel.id = 'mpPanel'; panel.className = 'mlayer';
  panel.innerHTML = '<div class="wood plank mpcard"><div class="rivets"></div><button class="mpx" data-a="close" aria-label="Close">×</button><div class="mpbody"></div></div>';
  document.body.appendChild(panel);
  panel.addEventListener('click', onClick);
  panel.addEventListener('input', e => { if (e.target.closest('[data-f]') && view === 'public') renderList(); });
  panel.addEventListener('change', e => { if (e.target.closest('[data-f]') && view === 'public') renderList(); });
  panel.addEventListener('keydown', e => { if (e.code === 'Enter' && e.target.id === 'mpCode') panel.querySelector('[data-a="joinCode"]').click(); });
  addEventListener('keydown', e => { if (panelOpen() && e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); } }, true);
  document.querySelector('#intro .mpmenu').addEventListener('click', e => {
    const b = e.target.closest('[data-mp]'); if (!b) return; H.click();
    const k = b.dataset.mp;
    if (k === 'quick') return go({ how: 'quick' });
    if (k === 'rejoin') return go({ how: 'rejoin' });
    open(k);
  });
  status();
}

// is the server there? (the online buttons wait for it)
async function status(force) {
  const el = $('mpStatus'); el.className = 'mpstatus'; el.textContent = 'Looking for the game server…';
  serverUp = await Online.checkServer(force);
  const addr = Online.serverAddress();
  document.querySelectorAll('#intro [data-mp]').forEach(b => { if (b.dataset.mp !== 'friends') b.disabled = !serverUp; });
  const last = Online.lastSession(), rj = document.querySelector('#intro [data-mp="rejoin"]');
  rj.hidden = !(serverUp && last); if (last) rj.textContent = `Rejoin ${last.name || 'last server'}`;
  if (serverUp) { el.classList.add('up'); el.innerHTML = `Online · <b>${esc(addr.replace(/^https?:\/\//, ''))}</b> <a href="#" data-mpaddr>change</a>`; }
  else { el.classList.add('down'); el.innerHTML = `Online play needs the game server${addr ? ` (none at <b>${esc(addr.replace(/^https?:\/\//, ''))}</b>)` : ''}. Playing here still works on your own or with other tabs. <a href="#" data-mpaddr>Server address…</a>`; }
  el.querySelector('[data-mpaddr]').onclick = e => { e.preventDefault(); H.click(); open('address'); };
}

function open(v) { view = v; panel.classList.add('on'); H.opened && H.opened(); render(); }
function close() { panel.classList.remove('on'); view = null; H.closed && H.closed(); }
export const panelOpen = () => !!panel && panel.classList.contains('on');
export function openSession() { open('session'); }

const body = () => panel.querySelector('.mpbody');
const head = (eyebrow, title) => `<div class="eyebrow">${eyebrow}</div><h2>${title}</h2>`;
const err = m => { const e = panel.querySelector('.mperr'); if (e) { e.textContent = m || ''; e.hidden = !m; } };
const field = (label, html) => `<label class="mpfield"><span>${label}</span>${html}</label>`;
const seg = (name, opts, cur) => `<div class="mpseg" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${v === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`;
const segVal = name => { const b = panel.querySelector(`[data-seg="${name}"] .on`); return b && b.dataset.v; };

function render() {
  const B = body();
  if (view === 'public') {
    B.innerHTML = head('Open to all riders', 'Public <em>servers</em>') + `
      <div class="mpfilters">
        <input data-f="q" id="mpSearch" placeholder="Search by name" maxlength="32" autocomplete="off" spellcheck="false">
        <select data-f="d" id="mpDiff"><option value="">Any difficulty</option><option value="easy">Easy</option><option value="normal">Normal</option><option value="hard">Hard</option></select>
        <select data-f="s" id="mpSort"><option value="space">Most room</option><option value="players">Most riders</option><option value="name">Name</option></select>
        <button class="mbtn small" data-a="refresh">Refresh</button>
      </div>
      <div class="mplist"><div class="mpempty">Fetching servers…</div></div>
      <p class="mperr" hidden></p>
      <div class="mrow"><button class="mbtn small" data-a="view" data-v="create">Create server</button><span class="mpnote">Only servers running right now are shown.</span></div>`;
    refresh();
  } else if (view === 'create' || view === 'createPrivate' || view === 'createFriends') {
    const vis = view === 'createPrivate' ? 'private' : view === 'createFriends' ? 'friends' : 'public';
    B.innerHTML = head('Strike camp', 'Create <em>server</em>') + `
      ${field('Server name', `<input id="mpName" maxlength="32" autocomplete="off" spellcheck="false" value="${esc((H.name() || 'Drifter') + "'s camp")}">`)}
      ${field('Who can join', seg('vis', [['public', 'Public'], ['private', 'Private'], ['friends', 'Friends']], vis))}
      <p class="mpnote" id="mpVisNote"></p>
      ${field('Riders', seg('max', [2, 3, 4, 6, 8].map(n => [String(n), String(n)]), '4'))}
      ${field('Difficulty', seg('diff', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], 'normal'))}
      <p class="mperr" hidden></p>
      <div class="mrow"><button class="mbtn primary" data-a="create">Create and ride in</button></div>`;
    visNote();
  } else if (view === 'private') {
    const mine = Online.myServers();
    B.innerHTML = head('By invitation', 'Private <em>servers</em>') + `
      <p class="mpnote">Private servers never appear in the public list. Anyone you give the code to can join; once you've been in, you can come back without it.</p>
      <div class="mplist small">${mine.length ? mine.map(s => `<div class="mprow"><div class="mpn">${esc(s.name)}<small>Code ${esc(s.code)}</small></div><button class="mbtn small" data-a="joinMine" data-id="${esc(s.id)}" data-code="${esc(s.code)}">Rejoin</button></div>`).join('') : '<div class="mpempty">You haven\'t made a private server in this browser yet.</div>'}</div>
      <p class="mperr" hidden></p>
      <div class="mrow"><button class="mbtn primary" data-a="view" data-v="createPrivate">Create private server</button><button class="mbtn" data-a="view" data-v="code">Join with code</button></div>`;
  } else if (view === 'code') {
    B.innerHTML = head('Invitation', 'Join with <em>code</em>') + `
      ${field('Invitation code', '<input id="mpCode" class="mpcode" maxlength="7" autocomplete="off" spellcheck="false" placeholder="ABC234">')}
      <p class="mperr" hidden></p>
      <div class="mrow"><button class="mbtn primary" data-a="joinCode">Join</button></div>`;
    setTimeout(() => { const i = $('mpCode'); if (i) i.focus(); }, 30);
  } else if (view === 'friends') {
    B.innerHTML = head('Riding together', '<em>Friends</em>') + `
      <p class="mpnote">Friend lists and parties (invite, ready up, travel together) aren't built yet; they're the next stage. Until then, a <b>Friends session</b> does the job: create one, send your friends its code, and they join with it.</p>
      <div class="mrow"><button class="mbtn primary" data-a="view" data-v="createFriends" ${serverUp ? '' : 'disabled'}>Create friends session</button><button class="mbtn" data-a="view" data-v="code" ${serverUp ? '' : 'disabled'}>Join with code</button></div>`;
  } else if (view === 'address') {
    B.innerHTML = head('Connection', 'Game <em>server</em>') + `
      <p class="mpnote">The server normally serves the game itself, so this is found automatically. If you opened the game from somewhere else, enter the server's address.</p>
      ${field('Server address', `<input id="mpAddr" autocomplete="off" spellcheck="false" placeholder="https://your-server.example.com" value="${esc(Online.serverAddress())}">`)}
      <p class="mperr" hidden></p>
      <div class="mrow"><button class="mbtn primary" data-a="saveAddr">Save and check</button></div>`;
  } else if (view === 'session') renderSession();
}
function visNote() {
  const n = $('mpVisNote'); if (!n) return;
  n.textContent = { public: 'Listed for everyone; anyone can join while there is room.', private: 'Hidden from the list. Riders need the code, checked by the server.', friends: 'Hidden, for your friends: you get the code to send them, and you can remove anyone.' }[segVal('vis')];
}

async function refresh() {
  const L = panel.querySelector('.mplist'); if (!L) return;
  try { list = await Online.listServers(); err(''); } catch (e) { list = []; err(e.message); }
  renderList();
}
function renderList() {
  const L = panel.querySelector('.mplist'); if (!L || view !== 'public') return;
  const q = ($('mpSearch').value || '').toLowerCase(), d = $('mpDiff').value, s = $('mpSort').value;
  let rows = list.filter(r => (!q || (r.name || '').toLowerCase().includes(q)) && (!d || r.difficulty === d));
  rows.sort(s === 'name' ? (a, b) => (a.name || '').localeCompare(b.name || '') : s === 'players' ? (a, b) => b.players - a.players : (a, b) => (b.max - b.players) - (a.max - a.players));
  if (!rows.length) { L.innerHTML = `<div class="mpempty">${list.length ? 'No servers match.' : 'No public servers are running. Create one and others can join you.'}</div>`; return; }
  L.innerHTML = `<div class="mprow mphead"><div class="mpn">Server</div><div>Riders</div><div>Where</div><div>Difficulty</div><div>Travelled</div><div>Region</div><div></div></div>` + rows.map(r => {
    const full = r.players >= r.max, st = r.locked ? 'Locked' : full ? 'Full' : 'Open';
    return `<div class="mprow"><div class="mpn">${esc(r.name)}<small class="st ${st.toLowerCase()}">${st}</small></div><div>${r.players}/${r.max}</div><div>${esc(r.biome)}</div><div>${esc(DIFF_NAME[r.difficulty] || r.difficulty)}</div><div>${(+r.km || 0).toFixed(1)} km</div><div>${esc(r.region)}</div><div><button class="mbtn small" data-a="joinId" data-id="${esc(r.id)}" ${full || r.locked ? 'disabled' : ''}>Join</button></div></div>`;
  }).join('');
}

// in game: this server, its code, and the owner's tools
function renderSession() {
  const net = H.online(), B = body();
  if (!net) { B.innerHTML = head('Server', 'Not <em>online</em>') + '<p class="mpnote">You are playing on your own (or with other tabs in this browser).</p>'; return; }
  const I = net.info || {}, owner = !!I.owner;
  const players = [[net.id, net.name, false]].concat([...net.peers.values()].map(p => [p.id, p.name, !!p.away]));
  B.innerHTML = head(esc(I.mode || 'Server'), esc(I.name || 'Server')) + `
    <div class="mpinfo"><span>${esc(DIFF_NAME[I.difficulty] || '')}</span><span>${players.length}/${I.max || '?'} riders</span><span>${esc(I.region || '')}</span>${I.locked ? '<span>Locked</span>' : ''}</div>
    ${I.code ? `<div class="mpcodebox"><span>Invitation code</span><b>${esc(I.code)}</b><button class="mbtn small" data-a="copyCode">Copy</button>${owner ? '<button class="mbtn small" data-a="newCode">New code</button>' : ''}</div>` : ''}
    ${owner ? `${field('Who can join', seg('svis', [['public', 'Public'], ['private', 'Private'], ['friends', 'Friends']], I.visibility || 'public'))}
      <div class="mrow"><button class="mbtn small" data-a="lock">${I.locked ? 'Let new riders in' : 'Lock (no new riders)'}</button></div>` : ''}
    <div class="mplist small">${players.map(([id, nm, away]) => `<div class="mprow"><div class="mpn">${esc(nm)}${id === net.id ? ' <small>you</small>' : ''}${away ? ' <small class="st full">reconnecting</small>' : ''}${id === net.hostId ? ' <small>keeps the train</small>' : ''}</div>${owner && id !== net.id ? `<button class="mbtn small" data-a="kick" data-id="${esc(id)}">Remove</button>` : ''}</div>`).join('')}</div>
    <div class="mrow"><button class="mbtn" data-a="leave">Leave server</button></div>`;
}
export function refreshSession() { if (view === 'session') renderSession(); }

async function onClick(e) {
  if (e.target === panel) return close();
  const sb = e.target.closest('[data-seg] button');
  if (sb) {
    H.click(); sb.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === sb));
    if (sb.parentNode.dataset.seg === 'vis') visNote();
    if (sb.parentNode.dataset.seg === 'svis') H.online() && H.online().own({ op: 'visibility', v: sb.dataset.v });
    return;
  }
  const b = e.target.closest('[data-a]'); if (!b || b.disabled) return; H.click();
  const a = b.dataset.a, net = H.online && H.online();
  if (a === 'close') close();
  else if (a === 'view') { view = b.dataset.v; render(); }
  else if (a === 'refresh') refresh();
  else if (a === 'joinId') go({ how: 'id', id: b.dataset.id });
  else if (a === 'joinMine') go({ how: 'id', id: b.dataset.id, code: b.dataset.code });
  else if (a === 'joinCode') { const c = ($('mpCode').value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (c.length !== 6) return err('Codes are six letters and numbers'); go({ how: 'code', code: c }); }
  else if (a === 'create') go(Online.createOptions({ name: ($('mpName').value || '').trim(), visibility: segVal('vis'), maxPlayers: +segVal('max'), difficulty: segVal('diff') }));
  else if (a === 'saveAddr') { Online.setServerAddress($('mpAddr').value); const ok = await Online.checkServer(true); await status(true); if (ok) close(); else err('No game server answered at that address'); }
  else if (a === 'copyCode') { try { await navigator.clipboard.writeText(net.info.code); b.textContent = 'Copied'; } catch (x) { b.textContent = net.info.code; } }
  else if (a === 'newCode') net.own({ op: 'code' });
  else if (a === 'lock') net.own({ op: 'lock', on: !net.info.locked });
  else if (a === 'kick') { net.own({ op: 'kick', id: b.dataset.id }); setTimeout(renderSession, 400); }
  else if (a === 'leave') { net.leave(); location.reload(); }
}

// join, then start the game in that session. Already riding? The page reloads and joins straight after
async function go(opts) {
  if (busy) return;
  if (H.started()) { try { sessionStorage.setItem(PENDING, JSON.stringify(opts)); } catch (e) {} H.saveAndReload(); return; }
  busy = true; err(''); setBusy(true);
  try {
    const room = await Online.join(opts, H.name());
    close(); await H.play(room);
  } catch (e) {
    if (!panelOpen()) open(opts.how === 'code' ? 'code' : opts.how === 'id' ? 'public' : 'create');
    setTimeout(() => err(e.message || 'Could not join'), 60);
  }
  busy = false; setBusy(false);
}
function setBusy(on) { document.querySelectorAll('#intro .mpmenu button, #mpPanel .mbtn').forEach(b => b.classList.toggle('wait', on)); }
// after a reload for a join
export function resumePending() {
  let o = null; try { o = JSON.parse(sessionStorage.getItem(PENDING) || 'null'); sessionStorage.removeItem(PENDING); } catch (e) {}
  if (o) Online.checkServer().then(up => { if (up) go(o); });
}
// the connection is gone for good
export function disconnected(msg) {
  open('gone');
  body().innerHTML = head('Connection', 'Disconnected') + `<p class="mpnote">${esc(msg)}.</p><div class="mrow"><button class="mbtn primary" data-a="reload">Back to the menu</button></div>`;
  body().querySelector('[data-a="reload"]').onclick = () => location.reload();
}
