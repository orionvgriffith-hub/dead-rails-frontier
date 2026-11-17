// Online play through the multiplayer server (server/): finding it, the public server list, invitation codes, and
// OnlineNet, the server connection. OnlineNet has the same shape as Net (net.js, the link between tabs), so the game
// doesn't care which one it has. The server decides every shared change; this side only asks and listens.
import { Grid } from './grid.js';

const PROFILE_KEY = 'drw.profile', SERVER_KEY = 'drw.server', LAST_KEY = 'drw.lastSession', MINE_KEY = 'drw.myServers';
const store = {
  get: (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};

// this browser's player id: random, kept, and used by the server to recognise you (rejoining, owning a server)
export function profileId() {
  let p = store.get(PROFILE_KEY);
  if (typeof p !== 'string' || !/^[A-Za-z0-9_-]{12,64}$/.test(p)) {
    const b = new Uint8Array(18); crypto.getRandomValues(b);
    p = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    store.set(PROFILE_KEY, p);
  }
  return p;
}

// ---------- the server ----------
// where it is: a saved address, or the site the game was loaded from (the server serves the game)
export function serverAddress() { return store.get(SERVER_KEY) || window.GAME_SERVER || (/^https?:$/.test(location.protocol) ? location.origin : ''); } // GAME_SERVER: js/config.js
export function setServerAddress(a) { a = (a || '').trim().replace(/\/+$/, ''); if (a && !/^https?:\/\//.test(a)) a = 'https://' + a; store.set(SERVER_KEY, a || null); return a; }

let client = null, clientBase = null, probe = null;
const timeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
async function api(path, body) {
  const base = serverAddress(); if (!base) throw new Error('No server address');
  const r = await timeout(fetch(base + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}), 6000, 'The server did not answer');
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.err || `Server error ${r.status}`);
  return j;
}
// is there a game server at the address? (cached until the address changes)
export function checkServer(force) {
  const base = serverAddress();
  if (!force && probe && probe.base === base) return probe.p;
  const p = base ? api('/api/health').then(j => j && j.game === 'dead-rails-frontier').catch(() => false) : Promise.resolve(false);
  probe = { base, p }; return p;
}
// the Colyseus browser client, loaded from the server itself, or from a public CDN when the server can't send it
const CLIENT_CDN = 'https://cdn.jsdelivr.net/npm/colyseus.js@0.15/dist/colyseus.js';
function loadClient() {
  const base = serverAddress();
  if (client && clientBase === base) return Promise.resolve(client);
  return new Promise((res, rej) => {
    const make = () => { client = new window.Colyseus.Client(base.replace(/^http/, 'ws')); clientBase = base; res(client); };
    if (window.Colyseus) return make();
    const load = (src, next) => {
      const s = document.createElement('script'); s.src = src; s.async = true;
      s.onload = () => (window.Colyseus ? make() : next());
      s.onerror = next;
      document.head.appendChild(s);
    };
    load(base + '/colyseus.js', () => load(CLIENT_CDN, () => rej(new Error('Could not load the multiplayer client'))));
  });
}

export const listServers = () => api('/api/servers');
export const lookupCode = code => api('/api/code', { code });

// why a join failed, in words
function why(e) {
  const m = (e && (e.message || e)) + '';
  if (/full|locked/i.test(m)) return 'That server is full';
  if (/not found|no rooms|invalid room|expired/i.test(m)) return 'That server has closed';
  return m || 'Could not join';
}
// joining: { how: 'create', name, visibility, maxPlayers, difficulty } · { how: 'id', id, code } · { how: 'code', code }
// · { how: 'quick' } (the fullest public server with room, or a new one) · { how: 'rejoin' }
export async function join(opts, name) {
  const c = await loadClient(), base = { name, profile: profileId() };
  let room;
  try {
    if (opts.how === 'create') room = await c.create('survival', Object.assign(base, { serverName: opts.serverName, visibility: opts.visibility, maxPlayers: opts.maxPlayers, difficulty: opts.difficulty }));
    else if (opts.how === 'code') { const { id } = await lookupCode(opts.code); room = await c.joinById(id, Object.assign(base, { code: opts.code })); }
    else if (opts.how === 'id') room = await c.joinById(opts.id, Object.assign(base, { code: opts.code }));
    else if (opts.how === 'rejoin') {
      const last = store.get(LAST_KEY); if (!last) throw new Error('No earlier session');
      try { room = await c.reconnect(last.token); } catch (e) { room = await c.joinById(last.id, base); }
    } else {
      const list = (await listServers()).filter(s => !s.locked && s.players < s.max).sort((a, b) => b.players - a.players);
      room = list.length ? await c.joinById(list[0].id, base) : await c.create('survival', Object.assign(base, { visibility: 'public', serverName: `${name}'s camp` }));
    }
  } catch (e) { throw new Error(why(e)); }
  return room;
}
// a new server's options (its name travels as serverName: `name` is always the player's)
export function createOptions(o) { return { how: 'create', visibility: o.visibility, maxPlayers: o.maxPlayers, difficulty: o.difficulty, serverName: o.name }; }

// the last session (to rejoin after a reload or a dropped connection) and the private servers you made
export const lastSession = () => { const l = store.get(LAST_KEY); return l && Date.now() - l.t < 6 * 3600e3 ? l : null; };
export const myServers = () => (store.get(MINE_KEY) || []).filter(s => Date.now() - s.t < 7 * 86400e3);
function remember(room, info) {
  store.set(LAST_KEY, { token: room.reconnectionToken, id: room.roomId, name: info.name, t: Date.now() });
  if (info.owner && info.code) store.set(MINE_KEY, [{ id: room.roomId, name: info.name, code: info.code, t: Date.now() }].concat(myServers().filter(s => s.id !== room.roomId)).slice(0, 8));
}

// ---------- the connection ----------
export class OnlineNet {
  constructor(room, opts) {
    this.o = opts; this.name = opts.name; this.online = true;
    this.id = room.sessionId; this.isHost = false; this.hostId = null; this.info = {};
    this.state = { containers: {}, ground: {}, train: { fuel: 60, cond: 100, driver: null, s: null, rv: 0, up: {} } };
    this.peers = new Map(); this.pending = new Map(); this.rid = 0; this.leaving = false;
    this.onNotice = null; this.onInfo = null; this.onDisconnect = null;
    this.ready = new Promise((res, rej) => { this.readyRes = res; this.readyRej = rej; });
    this.bind(room);
  }
  bind(room) {
    this.room = room;
    room.onMessage('m', m => this.onMsg(m));
    room.onLeave(code => this.lost(code));
    room.onError((code, msg) => this.notice(msg || 'Server error'));
  }
  start() { return timeout(this.ready, 10000, 'The server did not send the world'); }
  notice(t) { this.onNotice && this.onNotice(t); }
  onMsg(m) {
    if (!m || typeof m !== 'object') return;
    const peer = m.id && this.peers.get(m.id);
    switch (m.k) {
      case 'welcome': {
        this.id = m.id; this.name = m.name; this.state = m.state; this.info = m.info || {};
        const now = new Set(m.peers.map(p => p.id));
        for (const id of [...this.peers.keys()]) if (!now.has(id)) { this.peers.delete(id); this.o.onPeerLeave && this.o.onPeerLeave(id); }
        for (const p of m.peers) if (!this.peers.has(p.id)) { this.peers.set(p.id, { id: p.id, name: p.name, away: p.away }); if (m.resume) this.o.onPeerJoin && this.o.onPeerJoin(p.id, p.name); }
        this.setLead(m.lead);
        remember(this.room, this.info);
        if (m.resume) { this.o.onSnapshot && this.o.onSnapshot(); this.notice('Reconnected'); }
        this.onInfo && this.onInfo(this.info);
        this.readyRes();
        break;
      }
      case 'res': if (this.pending.has(m.rid)) { const p = this.pending.get(m.rid); this.pending.delete(m.rid); clearTimeout(p.t); p.res(m.res); } break;
      case 'cont': if (m.data) this.state.containers[m.cid] = m.data; else delete this.state.containers[m.cid]; this.o.onContainer && this.o.onContainer(m.cid); break;
      case 'ground': if (m.data) this.state.ground[m.gid] = m.data; else delete this.state.ground[m.gid]; this.o.onGround && this.o.onGround(m.gid); break;
      case 'train': Object.assign(this.state.train, m.data); this.o.onTrain && this.o.onTrain(m.data); break;
      case 'poses':
        for (const [id, name, p] of m.l) { let q = this.peers.get(id); if (!q) this.peers.set(id, q = { id, name }); q.pose = p; this.o.onPose && this.o.onPose(id, name, p); }
        break;
      case 'join': if (!peer) { this.peers.set(m.id, { id: m.id, name: m.name }); this.o.onPeerJoin && this.o.onPeerJoin(m.id, m.name); } break;
      case 'bye': if (this.peers.delete(m.id)) this.o.onPeerLeave && this.o.onPeerLeave(m.id); break;
      case 'away': if (peer) { peer.away = true; this.notice(`${peer.name} lost their connection`); } break;
      case 'back': if (peer) { peer.away = false; this.notice(`${peer.name} is back`); } break;
      case 'lead': this.setLead(m.id); break;
      case 'chat': this.o.onChat && this.o.onChat(m.name, m.text); break;
      case 'code': this.info.code = m.code; if (m.visibility) this.info.visibility = m.visibility; remember(this.room, this.info); this.onInfo && this.onInfo(this.info); break;
      case 'locked': this.info.locked = m.on; this.onInfo && this.onInfo(this.info); break;
      default: this.o.onMsg && this.o.onMsg(m); break; // train pose, sound effects
    }
  }
  setLead(id) { const was = this.isHost; this.hostId = id; this.isHost = id === this.id; if (was !== this.isHost || id) this.o.onHostChange && this.o.onHostChange(this.isHost); }
  // the connection dropped: the server keeps your place for half a minute, so try to get back in
  async lost(code) {
    for (const [, p] of this.pending) { clearTimeout(p.t); p.res({ ok: false, err: 'offline' }); } this.pending.clear();
    if (this.leaving) return;
    if (code === 4003) return this.gone('The owner removed you from this server');
    if (code === 4001) return this.gone('You joined this server from somewhere else');
    if (code === 1000 || code === 4000 || code === 4201) return this.gone('The server closed');
    this.notice('Lost the connection, trying to get back in…');
    for (let i = 0; i < 9 && !this.leaving; i++) {
      await new Promise(r => setTimeout(r, 2500));
      try { const room = await client.reconnect(this.room.reconnectionToken); this.bind(room); return; } catch (e) {}
    }
    this.gone('Could not get back to the server');
  }
  gone(msg) { if (!this.leaving) { this.leaving = true; this.onDisconnect ? this.onDisconnect(msg) : this.notice(msg); } }

  request(op) {
    return new Promise(res => {
      const rid = ++this.rid;
      const t = setTimeout(() => { this.pending.delete(rid); res({ ok: false, err: 'timeout', op }); }, 5000);
      this.pending.set(rid, { res, t });
      try { this.room.send('m', { k: 'req', rid, op }); } catch (e) { clearTimeout(t); this.pending.delete(rid); res({ ok: false, err: 'offline' }); }
    });
  }
  send(m) { try { this.room.send('m', m); } catch (e) {} }
  pose(p) { this.send({ k: 'pose', p }); }
  broadcast(k, d) { this.send({ k: 'b', kk: k, d }); }
  chat(text) { this.send({ k: 'chat', text }); }
  own(op) { this.send({ k: 'own', op }); }
  container(cid) { const c = this.state.containers[cid]; return c ? Grid.from(c) : null; }
  meta(cid) { return this.state.containers[cid] || null; }
  save() {} // the server holds the world
  dirty() {}
  leave() { if (this.leaving) return; this.leaving = true; store.set(LAST_KEY, null); try { this.room.leave(true); } catch (e) {} }
}
