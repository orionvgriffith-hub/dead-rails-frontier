// Shared-world link between open tabs of the game in one browser. Every change to shared state (loot containers,
// train storage, ground items, death bags, train fuel and seat) goes through request() and is applied only by the
// host tab, through the same authority the online server runs (authority.js). The train itself is simulated by
// whoever is driving (or the host when nobody is) and streamed to everyone else. Player inventories stay with their
// owner. A posse (posse.js) carries the same messages between computers instead of tabs; online play through the
// server swaps this for OnlineNet (online.js), which has the same shape.
import { Grid, newId } from './grid.js';
import { World } from './authority.js';

const WORLD_KEY = 'drw.world.v1';

export class Net {
  constructor(opts) {
    this.o = opts; this.name = opts.name; this.online = false;
    // a posse (posse.js) replaces the link between tabs; a rider in someone else's world is their guest
    this.link = opts.link || null; this.role = opts.role || null; this.guest = this.role === 'join';
    this.id = newId('n'); this.joined = Date.now() + Math.random();
    this.isHost = false; this.hostId = null;
    this.world = new World({
      genLoot: cid => opts.genLoot(cid), present: id => id === this.id || this.peers.has(id),
      emit: m => this.send(Object.assign({ from: this.id }, m)),
      onChange: (kind, key, data) => {
        if (kind === 'cont') this.o.onContainer && this.o.onContainer(key);
        else if (kind === 'ground') this.o.onGround && this.o.onGround(key);
        else this.o.onTrain && this.o.onTrain(data);
        this.dirty();
      },
    });
    this.peers = new Map(); this.pending = new Map(); this.rid = 0;
    this.bc = !this.link && ('BroadcastChannel' in window) ? new BroadcastChannel('dead-rails-world') : null;
    if (this.link) this.link.listen(m => this.onMsg(m));
    if (this.bc) this.bc.onmessage = e => this.onMsg(e.data);
    this.saveT = null;
  }
  get state() { return this.world.state; }
  set state(s) { this.world.state = s; }
  send(m) { if (this.link) this.link.send(m); else if (this.bc) this.bc.postMessage(m); }

  // ---------- startup + host election ----------
  // a posse has its host fixed: they made the room. A rider waits to hear from them, and never takes over
  start() {
    if (this.role === 'host') { this.becomeHost(); setInterval(() => this.tick(), 1000); return Promise.resolve(); }
    if (this.role === 'join') {
      return new Promise(res => {
        this.send({ k: 'hello', id: this.id, name: this.name, joined: this.joined });
        const t0 = Date.now(), wait = setInterval(() => { if (this.hostId || Date.now() - t0 > 8000) { clearInterval(wait); res(); } }, 100);
        setInterval(() => this.tick(), 1000);
      });
    }
    return new Promise(res => {
      if (!this.bc) { this.becomeHost(); return res(); }
      this.send({ k: 'hello', id: this.id, name: this.name, joined: this.joined });
      setTimeout(() => {
        if (!this.hostId) {
          const earliest = [...this.peers.values()].concat([{ id: this.id, joined: this.joined }]).sort((a, b) => a.joined - b.joined)[0];
          if (earliest.id === this.id) this.becomeHost();
        }
        res();
      }, 450);
      setInterval(() => this.tick(), 1000);
    });
  }
  becomeHost() {
    const wasClient = !this.isHost && this.hostId && this.hostId !== this.id;
    this.isHost = true; this.hostId = this.id;
    if (!wasClient) {
      try { const s = JSON.parse(localStorage.getItem(WORLD_KEY) || 'null'); if (s && s.containers) this.state = Object.assign(this.state, s, { train: Object.assign(this.state.train, s.train || {}, { driver: null }) }); } catch (e) {}
    }
    this.send({ k: 'here', id: this.id, name: this.name, joined: this.joined, host: true });
    this.o.onHostChange && this.o.onHostChange(true);
  }
  tick() {
    const now = Date.now();
    this.send({ k: 'here', id: this.id, name: this.name, joined: this.joined, host: this.isHost });
    for (const [id, p] of this.peers) if (now - p.last > 5000) { this.peers.delete(id); this.o.onPeerLeave && this.o.onPeerLeave(id); if (id === this.hostId) this.hostId = null; if (this.isHost && this.state.train.driver === id) this.world.setTrain({ driver: null }); }
    if (!this.hostId && !this.role) {
      const earliest = [...this.peers.values()].concat([{ id: this.id, joined: this.joined }]).sort((a, b) => a.joined - b.joined)[0];
      if (earliest.id === this.id) this.becomeHost();
    }
  }
  onMsg(m) {
    if (m.id === this.id || m.from === this.id) return;
    const peer = m.id && this.peers.get(m.id);
    if (m.k === 'hello' || m.k === 'here') {
      if (!peer) { this.peers.set(m.id, { id: m.id, name: m.name, joined: m.joined, last: Date.now() }); this.o.onPeerJoin && this.o.onPeerJoin(m.id, m.name); }
      else { peer.last = Date.now(); peer.name = m.name; }
      if (m.k === 'here' && m.host) {
        if (this.role === 'host') return; // the posse's host stays the host
        if (this.isHost && m.id !== this.id) {
          // two hosts (e.g. after a split): the earlier one keeps the world
          if (m.joined < this.joined) { this.isHost = false; this.hostId = m.id; this.o.onHostChange && this.o.onHostChange(false); }
          else return;
        } else this.hostId = m.id;
      }
      if (m.k === 'hello') {
        this.send({ k: 'here', id: this.id, name: this.name, joined: this.joined, host: this.isHost });
        if (this.isHost) this.send({ k: 'snap', from: this.id, to: m.id, state: this.state });
      }
      return;
    }
    if (peer) peer.last = Date.now();
    switch (m.k) {
      case 'snap': if (m.to === this.id) { this.state = m.state; this.o.onSnapshot && this.o.onSnapshot(); } break;
      case 'req': if (this.isHost) { const res = this.world.apply(m.op, m.id); this.send({ k: 'res', from: this.id, to: m.id, rid: m.rid, res }); } break;
      case 'res': if (m.to === this.id && this.pending.has(m.rid)) { const p = this.pending.get(m.rid); this.pending.delete(m.rid); clearTimeout(p.t); p.res(m.res); } break;
      case 'cont': if (m.data) this.state.containers[m.cid] = m.data; else delete this.state.containers[m.cid]; this.o.onContainer && this.o.onContainer(m.cid); break;
      case 'ground': if (m.data) this.state.ground[m.gid] = m.data; else delete this.state.ground[m.gid]; this.o.onGround && this.o.onGround(m.gid); break;
      case 'train': Object.assign(this.state.train, m.data); this.o.onTrain && this.o.onTrain(m.data); break;
      case 'pose': if (peer) { peer.pose = m.p; this.o.onPose && this.o.onPose(m.id, peer.name, m.p); } break;
      case 'bye': this.peers.delete(m.id); this.o.onPeerLeave && this.o.onPeerLeave(m.id); if (m.id === this.hostId) { this.hostId = null; this.tick(); } break;
      case 'chat': this.o.onChat && this.o.onChat(m.name, m.text); break;
      default: this.o.onMsg && this.o.onMsg(m); break; // train pose, sound effects
    }
  }
  leave() { this.save(); this.send({ k: 'bye', id: this.id }); }

  // ---------- requests ----------
  request(op) {
    if (this.isHost) return Promise.resolve(this.world.apply(op, this.id));
    return new Promise(res => {
      const rid = ++this.rid;
      const t = setTimeout(() => { this.pending.delete(rid); res({ ok: false, err: 'timeout', op }); }, 3000);
      this.pending.set(rid, { res, t });
      this.send({ k: 'req', id: this.id, rid, op });
    });
  }
  pose(p) { this.send({ k: 'pose', id: this.id, p }); }
  broadcast(k, d) { this.send({ k, from: this.id, d }); }
  container(cid) { const c = this.state.containers[cid]; return c ? Grid.from(c) : null; }
  meta(cid) { return this.state.containers[cid] || null; }

  // saved straight away, so a reload can never bring back an item that was already moved
  dirty() { this.save(); }
  save() { if (!this.isHost) return; try { localStorage.setItem(WORLD_KEY, JSON.stringify({ containers: this.state.containers, ground: this.state.ground, train: { fuel: this.state.train.fuel, cond: this.state.train.cond, s: this.state.train.s, rv: this.state.train.rv, up: this.state.train.up, def: this.state.train.def } })); } catch (e) {} }
  chat(text) { this.send({ k: 'chat', id: this.id, name: this.name, text }); }
}
