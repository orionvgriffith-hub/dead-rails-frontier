// One survival session: the authoritative shared world (authority.js in strict mode), the players in it, and who
// may come in. Public sessions are listed; private and friends sessions are hidden and need the invitation code,
// checked here on the server. Clients only ever ask: the room decides, then tells everyone what changed.
//
// Messages are all on one channel, 'm', as { k: kind, ... }, the same shapes the game's tab link uses.
//   from the client: req { rid, op } · pose { p } · b { k, d } (train pose, sound effects) · chat { text } · own { op }
//   to the client:   welcome · res · cont · ground · train · poses · join · bye · away · back · lead · chat · code
import colyseus from 'colyseus';
import { World } from '../js/game/authority.js';
import { dominantBiome, BIOME } from '../js/biomes.js';
import { Bucket, num, int, cleanText, makeCode, normCode } from './limits.js';

const { Room, ServerError } = colyseus;
const Refuse = (code, msg) => (ServerError ? new ServerError(code, msg) : new Error(msg));

export const CODES = new Map(); // invitation code -> room id, for the rooms alive on this server
const VIS = { public: 'Public survival', private: 'Private survival', friends: 'Friends session' };
const DIFFS = ['easy', 'normal', 'hard'];
const REACH = 9;          // metres from a player's last position that they can open or drop something at
const SEND_NEAR = 600;    // other players within this get every pose update; further ones once a second
const MAX_SPEED = 95;     // m/s: a galloping horse or the train at full tilt, with room to spare
const JUMPS = 20e3;       // one long jump (map travel, a respawn) allowed every this many ms
const RECONNECT_S = 30;   // how long a dropped player's place is kept

export class SurvivalRoom extends Room {
  onCreate(o) {
    const vis = VIS[o.visibility] ? o.visibility : 'public';
    this.maxClients = int(o.maxPlayers, 2, 8, 6);
    this.owner = typeof o.profile === 'string' ? o.profile.slice(0, 64) : null;
    this.code = vis === 'public' ? null : makeCode(CODES); if (this.code) CODES.set(this.code, this.roomId);
    this.allowed = new Set(this.owner ? [this.owner] : []); // profiles that have been let in, so a rejoin needs no code
    this.banned = new Set();
    this.players = new Map(); // sessionId -> { name, profile, x, y, z, pose, poseT, jumpT, joined, away, buckets }
    this.tickN = 0;
    this.world = new World({
      strict: true,
      emit: m => this.broadcast('m', m),
      present: id => this.players.has(id),
      reach: (id, x, z) => { const p = this.players.get(id); return !!p && p.poseT > 0 && Math.hypot(p.x - x, p.z - z) < REACH; },
    });
    this.setMetadata({
      name: cleanText(o.serverName, 32) || 'Frontier camp', visibility: vis, mode: VIS[vis],
      difficulty: DIFFS.includes(o.difficulty) ? o.difficulty : 'normal',
      region: process.env.REGION || 'Local', biome: 'Desert', km: 0, started: Date.now(),
    });
    if (vis !== 'public') this.setPrivate(true);

    this.onMessage('m', (client, m) => this.receive(client, m));
    this.setSimulationInterval(() => this.tick(), 100);
  }

  // who may come in: the invitation code for a private session (unless you've been in before), never if removed
  onAuth(client, o) {
    const profile = typeof o.profile === 'string' && /^[A-Za-z0-9_-]{12,64}$/.test(o.profile) ? o.profile : null;
    if (!profile) throw Refuse(400, 'Missing player profile');
    if (this.banned.has(profile)) throw Refuse(403, 'The owner removed you from this server');
    if (this.metadata.visibility !== 'public' && !this.allowed.has(profile) && (!this.code || normCode(o.code) !== this.code)) throw Refuse(403, 'That invitation code is not right');
    return { profile, name: cleanText(o.name, 18) || 'Drifter' };
  }

  onJoin(client, o, auth) {
    // the same profile already here (a second tab, or a connection that hasn't timed out yet): that one goes
    for (const [id, p] of this.players) if (p.profile === auth.profile) { const old = this.clients.find(c => c.sessionId === id); this.drop(id); if (old) old.leave(4001); }
    this.allowed.add(auth.profile);
    let name = auth.name; const taken = new Set([...this.players.values()].map(p => p.name));
    if (taken.has(name)) { let k = 2; while (taken.has(`${auth.name} ${k}`)) k++; name = `${auth.name} ${k}`; }
    const P = {
      name, profile: auth.profile, x: 0, y: 0, z: 0, pose: null, poseT: 0, jumpT: 0, joined: Date.now(), away: false,
      buckets: { req: new Bucket(25, 40), pose: new Bucket(25, 30), b: new Bucket(20, 30), chat: new Bucket(1, 4), own: new Bucket(2, 4) },
    };
    this.players.set(client.sessionId, P);
    this.welcome(client, false);
    this.broadcast('m', { k: 'join', id: client.sessionId, name }, { except: client });
    this.updateLead();
  }
  welcome(client, resume) {
    const P = this.players.get(client.sessionId), isOwner = P.profile === this.owner;
    client.send('m', {
      k: 'welcome', resume, id: client.sessionId, name: P.name, state: this.world.state, lead: this.lead || null,
      peers: [...this.players].filter(([id]) => id !== client.sessionId).map(([id, p]) => ({ id, name: p.name, away: p.away })),
      info: Object.assign({ id: this.roomId, max: this.maxClients, owner: isOwner }, this.metadata, { code: isOwner ? this.code : null }),
    });
  }

  async onLeave(client, consented) {
    const id = client.sessionId, P = this.players.get(id); if (!P) return;
    if (!consented) {
      // dropped, not quit: keep their place for a while
      P.away = true; this.broadcast('m', { k: 'away', id }); this.updateLead();
      try {
        const back = await this.allowReconnection(client, RECONNECT_S);
        P.away = false; this.broadcast('m', { k: 'back', id }, { except: back || client }); this.welcome(back || client, true); this.updateLead();
        return;
      } catch (e) { /* didn't come back in time */ }
    }
    this.drop(id);
  }
  drop(id) {
    if (!this.players.delete(id)) return;
    if (this.world.state.train.driver === id) this.world.setTrain({ driver: null });
    this.broadcast('m', { k: 'bye', id }); this.updateLead();
  }
  onDispose() { if (this.code) CODES.delete(this.code); }
  meta(d) { this.setMetadata(Object.assign({}, this.metadata, d)); } // the listing keeps every field

  // the lead simulates the train while nobody drives it: the longest-standing player who's connected
  updateLead() {
    let best = null;
    for (const [id, p] of this.players) if (!p.away && (!best || p.joined < this.players.get(best).joined)) best = id;
    if (best !== this.lead) { this.lead = best; this.broadcast('m', { k: 'lead', id: best }); }
  }

  receive(client, m) {
    const id = client.sessionId, P = this.players.get(id);
    if (!P || !m || typeof m !== 'object' || !P.buckets[m.k]) return;
    if (!P.buckets[m.k].take()) { if (m.k === 'req') client.send('m', { k: 'res', rid: m.rid, res: { ok: false, err: 'slow down' } }); return; }
    switch (m.k) {
      case 'req': {
        const res = this.world.apply(m.op, id);
        client.send('m', { k: 'res', rid: m.rid, res });
        break;
      }
      case 'pose': this.pose(P, m.p); break;
      case 'b': {
        // train motion only from whoever is allowed to drive it; sound effects from anyone, as plain names
        const S = this.world.state.train;
        if (m.kk === 'tpose') {
          const auth = S.driver ? S.driver === id : this.lead === id; if (!auth || !m.d) return;
          const d = { s: num(m.d.s, -1e7, 1e7), v: num(m.d.v, -60, 60), throttle: num(m.d.throttle, -1, 1), brake: num(m.d.brake, 0, 1), rv: int(m.d.rv, 0, 1e6, 0) };
          S.s = d.s; S.rv = d.rv;
          this.broadcast('m', { k: 'tpose', from: id, d }, { except: client });
        } else if (m.kk === 'fx' && typeof m.d === 'string' && /^[a-z]{1,16}$/.test(m.d)) this.broadcast('m', { k: 'fx', from: id, d: m.d }, { except: client });
        break;
      }
      case 'chat': { const text = cleanText(m.text, 200); if (text) this.broadcast('m', { k: 'chat', id, name: P.name, text }); break; }
      case 'own': this.ownerCommand(client, P, m.op); break;
    }
  }

  // a player's position: only plausible movement is accepted (a long jump now and then, for map travel or respawn)
  pose(P, p) {
    if (!p || typeof p !== 'object') return;
    const x = num(p.x, -1e5, 1e5, P.x), y = num(p.y, -1e3, 1e4, P.y), z = num(p.z, -1e5, 1e5, P.z), now = Date.now();
    if (P.poseT) {
      const dt = (now - P.poseT) / 1000, d = Math.hypot(x - P.x, z - P.z);
      if (d > MAX_SPEED * dt + 6) {
        if (now - P.jumpT < JUMPS) return; // too fast and too often: keep the last good position
        P.jumpT = now;
      }
    }
    const tl = Array.isArray(p.tl) && p.tl.length === 3 ? p.tl.map(v => num(v, -50, 50)) : undefined;
    const horse = p.horse && typeof p.horse === 'object' && JSON.stringify(p.horse).length < 400 ? p.horse : null;
    P.x = x; P.y = y; P.z = z; P.poseT = now;
    P.pose = { x, y, z, yaw: num(p.yaw, -1e3, 1e3), seated: !!p.seated, dead: !!p.dead, tb: p.tb == null ? null : int(p.tb, 0, 8, 0), tl, horse };
  }

  ownerCommand(client, P, op) {
    if (P.profile !== this.owner || !op || typeof op !== 'object') return;
    if (op.op === 'kick' && typeof op.id === 'string' && op.id !== client.sessionId) {
      const T = this.players.get(op.id); if (!T) return;
      this.banned.add(T.profile); this.allowed.delete(T.profile);
      const c = this.clients.find(c => c.sessionId === op.id); this.drop(op.id); if (c) c.leave(4003);
    } else if (op.op === 'code' && this.code) {
      // a new code: the old one stops working (people already in can still come back)
      CODES.delete(this.code); this.code = makeCode(CODES); CODES.set(this.code, this.roomId);
      client.send('m', { k: 'code', code: this.code });
    } else if (op.op === 'lock') { if (op.on) this.lock(); else this.unlock(); client.send('m', { k: 'locked', on: !!op.on }); }
    else if (op.op === 'visibility' && VIS[op.v]) {
      this.meta({ visibility: op.v, mode: VIS[op.v] }); this.setPrivate(op.v !== 'public');
      if (op.v !== 'public' && !this.code) { this.code = makeCode(CODES); CODES.set(this.code, this.roomId); }
      client.send('m', { k: 'code', code: op.v === 'public' ? null : this.code, visibility: op.v });
    }
  }

  // ten times a second: everyone's position to everyone else (nearby players every time, distant ones once a second),
  // and the listing's region and distance travelled every few seconds
  tick() {
    this.tickN++;
    const all = [...this.players].filter(([, p]) => p.pose && !p.away);
    for (const c of this.clients) {
      const me = this.players.get(c.sessionId); if (!me) continue;
      const l = [];
      for (const [id, p] of all) {
        if (id === c.sessionId) continue;
        if (this.tickN % 10 && Math.hypot(p.x - me.x, p.z - me.z) > SEND_NEAR) continue;
        l.push([id, p.name, p.pose]);
      }
      if (l.length) c.send('m', { k: 'poses', l });
    }
    if (this.tickN % 50 === 0) {
      const lead = this.lead && this.players.get(this.lead), S = this.world.state.train;
      const biome = lead && lead.poseT ? BIOME[dominantBiome(lead.x, lead.z)].name : this.metadata.biome;
      const km = Math.round(Math.abs(S.s || 0) / 100) / 10;
      if (biome !== this.metadata.biome || km !== this.metadata.km) this.meta({ biome, km });
    }
  }
}
