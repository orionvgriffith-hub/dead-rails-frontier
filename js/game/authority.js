// The shared world's authority: loot containers, train storage, items on the ground, death bags, and the train's
// fuel, condition, upgrades, defences and driver's seat. Every change arrives as a request (apply) and goes out as a
// message through emit. The same code runs in a browser tab hosting other tabs, and on the multiplayer server, where
// strict mode also refuses anything a client shouldn't be able to decide: container sizes and contents come from the
// rules rather than the request, items must exist in the catalogue, and a container has to be within reach to open.
import { Grid, newId } from './grid.js';
import { ITEMS } from './itemdata.js';
import { applyDef, CARRIAGE_TYPES, KINDS, starterLoot, genLootFor } from './rules.js';

export const OPS = ['open', 'take', 'put', 'move', 'split', 'takeCash', 'sort', 'drop', 'pickup', 'bag', 'stoke', 'burn', 'def', 'upgrade', 'seat'];
const TRAIN_BY_CID = Object.fromEntries(Object.values(CARRIAGE_TYPES).map(c => [c.cid, c]));
const num = (v, lo, hi, d = 0) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const str = (v, max) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);

export class World {
  // emit(msg): send a change to everyone. present(id): is that player still here. reach(id, x, z): can that player
  // touch something at x,z. genLoot(cid): what an unopened container holds (local mode). onChange(kind, key, data)
  constructor(o) {
    this.o = o; this.strict = !!o.strict;
    this.state = { containers: {}, ground: {}, train: { fuel: 60, cond: 100, driver: null, s: null, rv: 0, up: {} } };
  }
  emit(m) { this.o.emit && this.o.emit(m); }
  changed(kind, key, data) { this.o.onChange && this.o.onChange(kind, key, data); }

  existsAnywhere(itemId) {
    for (const k in this.state.containers) if ((this.state.containers[k].items || []).some(i => i.id === itemId)) return true;
    for (const k in this.state.ground) if (this.state.ground[k].item && this.state.ground[k].item.id === itemId) return true;
    return false;
  }
  setContainer(cid, grid, extra) {
    if (!grid) { delete this.state.containers[cid]; this.emit({ k: 'cont', cid, data: null }); }
    else { const prev = this.state.containers[cid] || {}; const data = Object.assign({ kind: prev.kind, title: prev.title, searched: prev.searched, cash: prev.cash || 0 }, extra || {}, grid.toJSON()); this.state.containers[cid] = data; this.emit({ k: 'cont', cid, data }); }
    this.changed('cont', cid);
  }
  setGround(gid, data) {
    if (data) this.state.ground[gid] = data; else delete this.state.ground[gid];
    this.emit({ k: 'ground', gid, data: data || null });
    this.changed('ground', gid);
  }
  setTrain(d) { Object.assign(this.state.train, d); this.emit({ k: 'train', data: d }); this.changed('train', null, d); }
  removeBag(cid) {
    for (const k in this.state.ground) if (this.state.ground[k].bag === cid) this.setGround(k, null);
    this.setContainer(cid, null);
  }

  // an item handed over by a client: only catalogue items, in sensible amounts
  item(it) {
    if (!it || typeof it !== 'object') return null;
    const d = ITEMS[it.t]; if (!d) return null;
    const id = str(it.id, 48); if (!id) return null;
    const n = Math.floor(num(it.n, 1, d.stack, 1));
    return { id, t: it.t, n, x: 0, y: 0, r: it.r ? 1 : 0 };
  }
  // what a container is, from the rules (strict) or as the request describes it (a tab hosting other tabs)
  describe(op, from) {
    const cid = str(op.cid, 80); if (!cid) return null;
    if (TRAIN_BY_CID[cid]) { const C = TRAIN_BY_CID[cid]; return { cid, w: C.w, h: C.h, kind: 'train', title: C.title, loot: true }; }
    if (cid.startsWith('loot:')) {
      const sp = op.spot;
      if (this.strict) {
        if (!sp || 'loot:' + sp.id !== cid || !KINDS[sp.kind]) return null;
        if (this.o.reach && !this.o.reach(from, num(sp.x, -1e5, 1e5), num(sp.z, -1e5, 1e5))) return null;
        const K = KINDS[sp.kind]; return { cid, w: K.w, h: K.h, kind: sp.kind, title: K.title, loot: true, spot: sp };
      }
    } else if (this.strict) return null; // bags already exist; nothing else may be created
    return { cid, w: Math.floor(num(op.w, 1, 12, 4)), h: Math.floor(num(op.h, 1, 10, 3)), kind: op.kind, title: str(op.title, 60) || 'Storage', loot: !!op.loot, spot: op.spot };
  }
  loot(info) {
    const s = starterLoot(info.cid); if (s) return s;
    if (this.strict) return info.spot ? genLootFor({ id: String(info.spot.id), kind: info.spot.kind, x: num(info.spot.x, -1e5, 1e5), z: num(info.spot.z, -1e5, 1e5) }) : { items: [], cash: 0 };
    return this.o.genLoot ? this.o.genLoot(info.cid) : { items: [], cash: 0 };
  }

  apply(op, from) {
    if (!op || typeof op !== 'object' || !OPS.includes(op.type)) return { ok: false, err: 'unknown op' };
    const S = this.state, C = cid => S.containers[cid] ? Grid.from(S.containers[cid]) : null;
    switch (op.type) {
      case 'open': {
        let c = S.containers[op.cid];
        if (!c && op.kind === 'bag') return { ok: false, err: 'gone' }; // bags only exist once someone has died
        if (!c) {
          const info = this.describe(op, from); if (!info) return { ok: false, err: 'refused' };
          const g = new Grid(info.cid, info.w, info.h);
          const L = info.loot ? this.loot(info) : { items: [], cash: 0 };
          for (const it of L.items) { const left = g.addMerge(it); if (left) break; }
          this.setContainer(info.cid, g, { kind: info.kind, title: info.title, searched: true, cash: L.cash || 0 });
          c = S.containers[info.cid];
        } else if (!c.searched) { c.searched = true; this.setContainer(op.cid, Grid.from(c)); }
        return { ok: true, data: S.containers[op.cid] };
      }
      case 'take': {
        const g = C(op.cid); if (!g) return { ok: false, err: 'gone' };
        const it = g.get(op.iid); if (!it) return { ok: false, err: 'gone' };
        let out;
        const n = Math.floor(num(op.n, 0, it.n));
        if (n && n < it.n) { it.n -= n; out = { id: newId('h'), t: it.t, n, x: 0, y: 0, r: it.r }; }
        else { g.remove(it.id); out = it; }
        this.setContainer(op.cid, g);
        if (S.containers[op.cid].kind === 'bag' && !g.items.length) this.removeBag(op.cid);
        return { ok: true, item: out };
      }
      case 'put': {
        const g = C(op.cid); if (!g) return { ok: false, err: 'gone' };
        const it = this.strict ? this.item(op.item) : Object.assign({}, op.item);
        if (!it) return { ok: false, err: 'bad item' };
        if (this.existsAnywhere(it.id)) return { ok: false, err: 'duplicate' };
        if (op.mergeId) {
          const tgt = g.get(op.mergeId);
          if (!tgt || tgt.t !== it.t) return { ok: false, err: 'nomerge' };
          const left = g.mergeInto(tgt, it);
          this.setContainer(op.cid, g);
          return { ok: true, left: left > 0 ? it : null };
        }
        if (op.x == null) { const left = g.addMerge(it); this.setContainer(op.cid, g); return { ok: true, left }; }
        if (!g.place(it, Math.floor(num(op.x, 0, g.w - 1)), Math.floor(num(op.y, 0, g.h - 1)), op.r ? 1 : 0)) return { ok: false, err: 'nospace' };
        this.setContainer(op.cid, g); return { ok: true, left: null };
      }
      case 'move': {
        const g = C(op.cid); if (!g) return { ok: false }; const it = g.get(op.iid); if (!it) return { ok: false };
        if (op.mergeId) { const tgt = g.get(op.mergeId); if (!tgt || tgt.t !== it.t || tgt.id === it.id) return { ok: false }; const left = g.mergeInto(tgt, it); if (left <= 0) g.remove(it.id); this.setContainer(op.cid, g); return { ok: true }; }
        if (!g.place(it, Math.floor(num(op.x, 0, g.w - 1)), Math.floor(num(op.y, 0, g.h - 1)), op.r ? 1 : 0)) return { ok: false };
        this.setContainer(op.cid, g); return { ok: true };
      }
      case 'split': {
        const g = C(op.cid); if (!g) return { ok: false }; const it = g.get(op.iid); const n = Math.floor(num(op.n, 0, 1e4));
        if (!it || n >= it.n || n < 1) return { ok: false };
        const sp = g.findSpace(it.t); if (!sp) return { ok: false, err: 'nospace' };
        it.n -= n; const ni = { id: newId('h'), t: it.t, n, x: 0, y: 0, r: 0 }; g.place(ni, sp.x, sp.y, sp.r);
        this.setContainer(op.cid, g); return { ok: true };
      }
      case 'takeCash': { const c = S.containers[op.cid]; if (!c) return { ok: false }; const amt = c.cash || 0; if (!amt) return { ok: true, cash: 0 }; this.setContainer(op.cid, Grid.from(c), { cash: 0 }); return { ok: true, cash: amt }; }
      case 'sort': { const g = C(op.cid); if (!g) return { ok: false }; const ok = g.sort(); this.setContainer(op.cid, g); return { ok }; }
      case 'drop': {
        const it = this.strict ? this.item(op.item) : Object.assign({}, op.item);
        if (!it) return { ok: false, err: 'bad item' };
        if (this.existsAnywhere(it.id)) return { ok: false, err: 'duplicate' };
        const x = num(op.x, -1e5, 1e5), y = num(op.y, -1e3, 1e4), z = num(op.z, -1e5, 1e5);
        if (this.strict && this.o.reach && op.tb == null && !this.o.reach(from, x, z)) return { ok: false, err: 'refused' }; // on the train it is placed in the car's own space
        const gid = newId('g'); this.setGround(gid, { gid, item: it, x, y, z, ry: num(op.ry, -10, 10), tb: op.tb ?? null }); return { ok: true, gid };
      }
      case 'pickup': {
        const gd = S.ground[op.gid]; if (!gd || !gd.item) return { ok: false, err: 'gone' };
        if (this.strict && this.o.reach && gd.tb == null && !this.o.reach(from, gd.x, gd.z)) return { ok: false, err: 'refused' };
        this.setGround(op.gid, null); return { ok: true, item: gd.item };
      }
      case 'bag': {
        const gid = newId('g'), cid = 'bag:' + gid, g = new Grid(cid, 10, 8);
        for (const raw of Array.isArray(op.items) ? op.items.slice(0, 80) : []) { const it = this.strict ? this.item(raw) : Object.assign({}, raw); if (!it || this.existsAnywhere(it.id)) continue; g.addMerge(it); }
        const title = str(op.title, 60) || 'Belongings';
        this.setContainer(cid, g, { kind: 'bag', title, searched: true, cash: Math.floor(num(op.cash, 0, 1e6)) });
        this.setGround(gid, { gid, bag: cid, x: num(op.x, -1e5, 1e5), y: num(op.y, -1e3, 1e4), z: num(op.z, -1e5, 1e5), ry: 0, title, tb: op.tb ?? null });
        return { ok: true, cid };
      }
      case 'stoke': { if (S.train.fuel >= 100) return { ok: false, err: 'full' }; const f = Math.min(100, S.train.fuel + num(op.amount, 0, this.strict ? 60 : 100)); this.setTrain({ fuel: f }); return { ok: true, fuel: f }; }
      case 'burn': { const f = Math.max(0, S.train.fuel - num(op.amount, 0, 5)); this.setTrain({ fuel: f }); return { ok: true, fuel: f }; }
      case 'def': { const r = applyDef(S, op); if (r.ok) this.setTrain({ def: r.def }); return r; }
      case 'upgrade': { if (typeof op.up !== 'string' || op.up.length > 20) return { ok: false }; const up = Object.assign({}, S.train.up || {}); if (up[op.up]) return { ok: false, err: 'fitted' }; up[op.up] = 1; this.setTrain({ up }); return { ok: true, up }; }
      case 'seat': {
        const present = id => (this.o.present ? this.o.present(id) : true);
        if (op.claim) { if (S.train.driver && S.train.driver !== from && present(S.train.driver)) return { ok: false, err: 'taken' }; this.setTrain({ driver: from }); return { ok: true }; }
        if (S.train.driver === from) this.setTrain({ driver: null }); return { ok: true };
      }
    }
    return { ok: false, err: 'unknown op' };
  }
}
