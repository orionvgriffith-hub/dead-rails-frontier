// Geometry merging builder + static collision registry
import * as THREE from 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/three.module.js';
import { MAT } from './textures.js';

export const COLLIDERS = [];   // oriented groups of local AABBs (buildings, bridges, platforms)
export const CIRCLES = [];     // simple round blockers (rocks, trees, posts)

const FACES = [
  [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]], 2, 1],
  [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], 2, 1],
  [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]], 0, 2],
  [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], 0, 2],
  [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], 0, 1],
  [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]], 0, 1],
];
const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _n = new THREE.Vector3();
const _nm = new THREE.Matrix3(), _c = new THREE.Color();

export class Builder {
  constructor() { this.parts = {}; this.base = new THREE.Matrix4(); this.col = null; }
  begin(x, y, z, ry = 0, collide = true) {
    this.base.makeRotationY(ry).setPosition(x, y, z);
    this.ry = ry;
    if (collide) {
      this.col = { inv: this.base.clone().invert(), boxes: [], cx: x, cz: z, r: 0, y };
      COLLIDERS.push(this.col);
    } else this.col = null;
    return this;
  }
  part(mat) { return this.parts[mat] || (this.parts[mat] = { p: [], n: [], u: [], c: [] }); }
  // axis box centred at (cx,cy,cz) in object space
  box(mat, cx, cy, cz, w, h, d, o = {}) {
    if (w <= 0.001 || h <= 0.001 || d <= 0.001) return;
    const P = this.part(mat);
    const rot = o.rx || o.ry || o.rz;
    _r.makeRotationFromEuler(_e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'));
    _m.copy(this.base).multiply(_r.setPosition(cx, cy, cz));
    _nm.setFromMatrix4(_m);
    const hx = w / 2, hy = h / 2, hz = d / 2, S = [hx, hy, hz];
    const col = o.c ? _c.set(o.c) : null;
    const cr = col ? col.r : 1, cg = col ? col.g : 1, cb = col ? col.b : 1;
    const off = [cx * 0.37 + cz * 0.61, cy * 0.5, cz * 0.37 - cx * 0.21];
    for (let f = 0; f < 6; f++) {
      const [nrm, cs, ua, va] = FACES[f];
      _n.set(nrm[0], nrm[1], nrm[2]).applyMatrix3(_nm).normalize();
      const q = [];
      for (let k = 0; k < 4; k++) {
        const lx = cs[k][0] * hx, ly = cs[k][1] * hy, lz = cs[k][2] * hz;
        _v.set(lx, ly, lz).applyMatrix4(_r);
        const dk = this.shade(_v.x, _v.y, _v.z);
        _v.applyMatrix4(this.base);
        const L = [lx, ly, lz];
        q.push([_v.x, _v.y, _v.z, L[ua] + off[ua], L[va] + off[va], dk]);
      }
      for (const idx of [0, 1, 2, 0, 2, 3]) {
        const a = q[idx]; P.p.push(a[0], a[1], a[2]); P.n.push(_n.x, _n.y, _n.z);
        if (o.uvRot) P.u.push(a[4], a[3]); else P.u.push(a[3], a[4]);
        P.c.push(cr * a[5], cg * a[5], cb * a[5]);
      }
    }
    if (this.col && !rot && o.col !== false) {
      const b = [cx - hx, cy - hy, cz - hz, cx + hx, cy + hy, cz + hz];
      this.col.boxes.push(b);
      this.col.r = Math.max(this.col.r, Math.hypot(Math.abs(cx) + hx, Math.abs(cz) + hz));
    }
  }
  // darken vertices inside the current building footprint (cheap baked interior occlusion)
  shade(x, y, z) {
    const d = this.dark; if (!d) return 1;
    if (Math.abs(x) < d.hx - 0.02 && Math.abs(z) < d.hz - 0.02 && y < d.top) {
      const e = Math.min(d.hx - Math.abs(x), d.hz - Math.abs(z));
      return 0.42 + 0.18 * Math.max(0, 1 - e / 1.5) + 0.1 * Math.min(1, y / 3);
    }
    return 1;
  }
  // arbitrary three geometry with local matrix
  geom(mat, g, local, color) {
    const P = this.part(mat);
    const geo = g.index ? g.toNonIndexed() : g;
    _r.identity(); if (local) _r.copy(local);
    _m.copy(this.base).multiply(_r);
    _nm.setFromMatrix4(_m);
    const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
    const col = color ? _c.set(color) : null;
    const cr = col ? col.r : 1, cg = col ? col.g : 1, cb = col ? col.b : 1;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(_r);
      const dk = this.shade(_v.x, _v.y, _v.z);
      _v.applyMatrix4(this.base); P.p.push(_v.x, _v.y, _v.z);
      _n.fromBufferAttribute(nor, i).applyMatrix3(_nm).normalize(); P.n.push(_n.x, _n.y, _n.z);
      if (uv) P.u.push(uv.getX(i), uv.getY(i)); else P.u.push(0, 0);
      P.c.push(cr * dk, cg * dk, cb * dk);
    }
    if (geo !== g) geo.dispose(); g.dispose();
  }
  addCollider(minx, miny, minz, maxx, maxy, maxz) {
    if (!this.col) return;
    this.col.boxes.push([minx, miny, minz, maxx, maxy, maxz]);
    this.col.r = Math.max(this.col.r, Math.hypot(Math.max(Math.abs(minx), Math.abs(maxx)), Math.max(Math.abs(minz), Math.abs(maxz))));
  }
  toGeometries() {
    const out = [];
    for (const k in this.parts) {
      const P = this.parts[k]; if (!P.p.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(P.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(P.u, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(P.c, 3));
      g.computeBoundingSphere();
      out.push([k, g]);
    }
    return out;
  }
  build(shadows = true) {
    const grp = new THREE.Group();
    for (const [k, g] of this.toGeometries()) {
      const m = new THREE.Mesh(g, MAT[k] || (this.custom && this.custom[k]) || MAT.woodGrey);
      m.castShadow = shadows; m.receiveShadow = true; grp.add(m);
    }
    this.parts = {};
    return grp;
  }
}

// --------- spatial lookup for collision ----------
const GRID = 48, cells = new Map();
const key = (i, j) => i * 10007 + j;
function cellsOf(x, z, r, fn) {
  const i0 = Math.floor((x - r) / GRID), i1 = Math.floor((x + r) / GRID), j0 = Math.floor((z - r) / GRID), j1 = Math.floor((z + r) / GRID);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) fn(key(i, j));
}
const put = (obj, x, z, r) => cellsOf(x, z, r, k => { if (!cells.has(k)) cells.set(k, []); cells.get(k).push(obj); });
export function indexColliders() {
  cells.clear();
  for (const c of COLLIDERS) if (c.boxes.length) put(c, c.cx, c.cz, c.r + 1);
  for (const c of CIRCLES) put(c, c.x, c.z, c.r + 1);
}
// rocks and trees on streamed ground come and go with their tile
export function addCircles(list) { for (const c of list) put(c, c.x, c.z, c.r + 1); }
export function removeCircles(list) {
  const gone = new Set(list);
  for (const c of list) cellsOf(c.x, c.z, c.r + 1, k => { const L = cells.get(k); if (!L) return; const f = L.filter(o => !gone.has(o)); if (f.length) cells.set(k, f); else cells.delete(k); });
}
export function nearby(x, z) {
  return cells.get(key(Math.floor(x / GRID), Math.floor(z / GRID))) || [];
}
