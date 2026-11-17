// Grid containers: placement, rotation, stacking, splitting, weight. Pure data (shared by every container).
import { ITEMS } from './itemdata.js';

let seq = 0;
export function newId(tag = 'p') { return `${tag}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
export const dims = it => { const d = ITEMS[it.t]; return it.r ? [d.h, d.w] : [d.w, d.h]; };

export class Grid {
  constructor(id, w, h, items = []) { this.id = id; this.w = w; this.h = h; this.items = items; }
  static from(o) { return new Grid(o.id, o.w, o.h, (o.items || []).map(i => Object.assign({}, i))); }
  toJSON() { return { id: this.id, w: this.w, h: this.h, items: this.items.map(i => ({ id: i.id, t: i.t, n: i.n, x: i.x, y: i.y, r: i.r ? 1 : 0 })) }; }
  get(id) { return this.items.find(i => i.id === id) || null; }
  at(x, y) { for (const it of this.items) { const [w, h] = dims(it); if (x >= it.x && x < it.x + w && y >= it.y && y < it.y + h) return it; } return null; }
  fits(t, x, y, r, ignore) {
    const d = ITEMS[t], w = r ? d.h : d.w, h = r ? d.w : d.h;
    if (x < 0 || y < 0 || x + w > this.w || y + h > this.h) return false;
    for (const it of this.items) {
      if (it.id === ignore) continue;
      const [iw, ih] = dims(it);
      if (x < it.x + iw && x + w > it.x && y < it.y + ih && y + h > it.y) return false;
    }
    return true;
  }
  findSpace(t, ignore) {
    for (const r of [0, 1]) for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.fits(t, x, y, r, ignore)) return { x, y, r };
    return null;
  }
  place(it, x, y, r) { if (!this.fits(it.t, x, y, r, it.id)) return false; this.remove(it.id); Object.assign(it, { x, y, r: r ? 1 : 0 }); this.items.push(it); return true; }
  remove(id) { const k = this.items.findIndex(i => i.id === id); if (k < 0) return null; return this.items.splice(k, 1)[0]; }
  // top up existing stacks first, then use free space; returns what didn't fit (or null)
  addMerge(it) {
    const d = ITEMS[it.t];
    if (d.stack > 1) for (const s of this.items) {
      if (it.n <= 0) break;
      if (s.t === it.t && s.n < d.stack) { const k = Math.min(d.stack - s.n, it.n); s.n += k; it.n -= k; }
    }
    if (it.n <= 0) return null;
    const sp = this.findSpace(it.t);
    if (!sp) return it;
    this.place(it, sp.x, sp.y, sp.r); return null;
  }
  // drop `it` onto the stack `target` (same type): returns leftover count
  mergeInto(target, it) { const d = ITEMS[it.t], k = Math.min(d.stack - target.n, it.n); target.n += k; it.n -= k; return it.n; }
  count(t) { let n = 0; for (const i of this.items) if (i.t === t) n += i.n; return n; }
  // take `n` of type `t` from anywhere in the grid
  consume(t, n = 1) {
    if (this.count(t) < n) return false;
    for (const i of [...this.items].sort((a, b) => a.n - b.n)) {
      if (i.t !== t || n <= 0) continue;
      const k = Math.min(i.n, n); i.n -= k; n -= k; if (i.n <= 0) this.remove(i.id);
    }
    return true;
  }
  weight() { let w = 0; for (const i of this.items) w += ITEMS[i.t].weight * i.n; return w; }
  value() { let v = 0; for (const i of this.items) v += ITEMS[i.t].value * i.n; return v; }
  // repack largest-first; keeps every item, so it can never lose or duplicate anything
  sort() {
    const before = this.toJSON().items;
    const all = this.items.splice(0).sort((a, b) => { const A = ITEMS[a.t], B = ITEMS[b.t]; return (B.w * B.h - A.w * A.h) || A.cat.localeCompare(B.cat) || a.t.localeCompare(b.t) || b.n - a.n; });
    // merge partial stacks of the same type first
    const merged = [];
    for (const it of all) { const top = merged.find(m => m.t === it.t && m.n < ITEMS[it.t].stack); if (top) { const left = this.mergeInto(top, it); if (left > 0) merged.push(it); } else merged.push(it); }
    const failed = [];
    for (const it of merged) { const sp = this.findSpace(it.t); if (sp) this.place(it, sp.x, sp.y, sp.r); else failed.push(it); }
    // greedy packing can occasionally fail: put everything back exactly as it was
    if (failed.length) { this.items = before.map(i => Object.assign({}, i)); return false; }
    return true;
  }
}
