// Railway: ballast, sleepers, steel rails, trestle bridges, signals, telegraph line
import * as THREE from 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/three.module.js';
import { rail, railAt, heightAt, TOWNS } from './world.js';
import { Builder } from './builder.js';
import { MAT } from './textures.js';
import { addProp } from './props.js';
import { mulberry32 } from './noise.js';
import { dominantBiome, SNOW } from './biomes.js';

const GAUGE = 1.435, RAIL_HALF = GAUGE / 2 + 0.036;
export const RAIL_TOP = 0.31; // above ballast top (rail.y)
const heading = (tx, tz) => Math.atan2(-tz, tx);
const SEGS = [];

// sweep a 2D profile [(u,v)] along rail samples k0..k1
function sweep(k0, k1, prof, closed, mat, yOff = 0, uOff = 0) {
  if (closed) prof = prof.slice().reverse(); // closed profiles are given CCW
  const np = prof.length, ns = k1 - k0 + 1, pos = [], uv = [], idx = [];
  let plen = [0];
  for (let i = 1; i < np + (closed ? 1 : 0); i++) { const a = prof[i - 1], b = prof[i % np]; plen.push(plen[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const cols = closed ? np + 1 : np;
  for (let k = k0; k <= k1; k++) {
    const nx = -rail.tz[k], nz = rail.tx[k], s = k * rail.ds;
    for (let i = 0; i < cols; i++) {
      const p = prof[i % np], u = p[0] + uOff;
      pos.push(rail.x[k] + nx * u, rail.y[k] + p[1] + yOff, rail.z[k] + nz * u);
      uv.push(plen[i], s);
    }
  }
  for (let j = 0; j < ns - 1; j++) for (let i = 0; i < cols - 1; i++) {
    const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(1), 3));
  g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = true;
  return m;
}
const RAIL_PROF = [[-0.07, 0], [0.07, 0], [0.07, 0.025], [0.012, 0.04], [0.012, 0.115], [0.036, 0.125], [0.036, 0.155], [-0.036, 0.155], [-0.036, 0.125], [-0.012, 0.115], [-0.012, 0.04], [-0.07, 0.025]];

// ---- nearest rail sample lookup ----
const NB = 32, buckets = new Map();
const bkey = (i, j) => i * 7919 + j;
for (let k = 0; k <= rail.N; k++) { const key = bkey(Math.floor(rail.x[k] / NB), Math.floor(rail.z[k] / NB)); if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(k); }
export function railNearest(x, z) {
  const i = Math.floor(x / NB), j = Math.floor(z / NB); let best = 1e9, bk = -1;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const L = buckets.get(bkey(i + a, j + b)); if (!L) continue;
    for (const k of L) { const dx = x - rail.x[k], dz = z - rail.z[k], d = dx * dx + dz * dz; if (d < best) { best = d; bk = k; } }
  }
  if (bk < 0) return null;
  const dx = x - rail.x[bk], dz = z - rail.z[bk];
  return { k: bk, lat: dx * -rail.tz[bk] + dz * rail.tx[bk], along: dx * rail.tx[bk] + dz * rail.tz[bk], y: rail.y[bk], bridge: BRIDGE[bk] === 1 };
}

export const BRIDGE = new Uint8Array(rail.N + 1);
export const BRIDGES = [];
// the scanned track is laid in 3.30 m pieces everywhere except on trestles; the hand-built rails and sleepers fill only those gaps
export const SCAN_LEN = 3.30, SCAN_SEGS = [];
const COVER = new Uint8Array(rail.N + 1);

export function buildRailway(scene) {
  const N = rail.N;
  // bridge detection
  for (let k = 0; k <= N; k++) if (rail.ground[k] < rail.y[k] - 1.3) for (let q = Math.max(0, k - 3); q <= Math.min(N, k + 3); q++) BRIDGE[q] = 1;
  let k = 0;
  while (k <= N) { if (BRIDGE[k]) { const s = k; while (k <= N && BRIDGE[k]) k++; BRIDGES.push([s, k - 1]); } else k++; }
  for (let s = SCAN_LEN / 2; s < rail.L - SCAN_LEN / 2; s += SCAN_LEN) {
    const k0 = Math.floor((s - SCAN_LEN / 2) / rail.ds), k1 = Math.ceil((s + SCAN_LEN / 2) / rail.ds);
    let ok = true; for (let q = k0; q <= k1; q++) if (BRIDGE[q]) { ok = false; break; }
    if (!ok) continue;
    SCAN_SEGS.push(s); for (let q = k0 + 1; q < k1; q++) COVER[q] = 1;
  }

  const group = new THREE.Group(); scene.add(group);
  const CH = 150;
  // ballast in chunks, skipping bridges
  const ballast = [[-3.1, -0.95], [-1.8, 0.04], [1.8, 0.04], [3.1, -0.95]];
  for (let a = 0; a < N; a += CH) {
    let s = a; const e = Math.min(N, a + CH);
    while (s < e) {
      while (s < e && BRIDGE[s]) s++;
      let t = s; while (t < e && !BRIDGE[t + 1]) t++;
      if (t > s) { const mid = (s + t) >> 1, snowy = dominantBiome(rail.x[mid], rail.z[mid]) === SNOW;
        const m = sweep(s, Math.min(t + 1, N), ballast, false, snowy ? MAT.ballastSnow : MAT.ballast); m.castShadow = false; group.add(m); SEGS.push(m); }
      s = t + 1;
    }
  }
  // hand-built rails only where the scan does not cover (trestles and the very ends)
  for (let q = 0; q <= N;) {
    if (COVER[q]) { q++; continue; }
    const r0 = q; while (q <= N && !COVER[q]) q++;
    const a = Math.max(0, r0 - 1), e = Math.min(N, q);
    if (e > a) for (const side of [-1, 1]) group.add(sweep(a, e, RAIL_PROF, true, MAT.rail, 0.16, side * GAUGE / 2 + side * 0.036));
  }
  // sleepers
  const rnd = mulberry32(5);
  const sgeo = new THREE.BoxGeometry(0.24, 0.16, 2.6);
  const per = Math.ceil(rail.L / 0.6 / 12);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
  let im = null, n = 0;
  for (let s = 0.3; s < rail.L - 0.3; s += 0.6) {
    if (COVER[Math.round(s / rail.ds)]) continue;
    if (!im || n >= per) { im = new THREE.InstancedMesh(sgeo, MAT.sleeper, per); im.count = 0; im.castShadow = true; im.receiveShadow = true; group.add(im); n = 0; }
    const p = railAt(s), lat = (rnd() - 0.5) * 0.06;
    M.compose(V.set(p.x - p.tz * lat, p.y + 0.08, p.z + p.tx * lat), Q.setFromEuler(E.set(0, heading(p.tx, p.tz) + (rnd() - 0.5) * 0.04, 0)), S);
    im.setMatrixAt(n, M); const v = 0.75 + rnd() * 0.4; im.setColorAt(n, col.setRGB(v, v, v)); n++; im.count = n;
  }
  group.children.forEach(c => { if (c.isInstancedMesh) { c.instanceMatrix.needsUpdate = true; c.computeBoundingSphere(); } });

  // trestle bridges
  for (const [b0, b1] of BRIDGES) buildTrestle(group, b0, b1, rnd);
  // buffer stops
  for (const [kk, dir] of [[2, -1], [N - 2, 1]]) {
    const B = new Builder(); B.begin(rail.x[kk], rail.y[kk], rail.z[kk], heading(rail.tx[kk], rail.tz[kk]));
    for (const zz of [-0.72, 0.72]) { B.box('woodDark', dir * 0.6, 0.6, zz, 0.3, 1.2, 0.3); B.box('woodDark', 0, 0.45, zz, 1.4, 0.2, 0.2, { rz: dir * 0.6, col: false }); }
    B.box('woodRed', dir * 0.45, 0.95, 0, 0.35, 0.4, 2.6);
    group.add(B.build());
  }
  // telegraph line
  const wires = [];
  let prev = null;
  for (let s = 20; s < rail.L - 20; s += 52) {
    const p = railAt(s), k2 = Math.round(s / rail.ds);
    let near = TOWNS[0], bd = 1e9; for (const t of TOWNS) { const d = Math.abs(t.k - k2); if (d < bd) { bd = d; near = t; } }
    const side = -near.side, nx = -p.tz * side, nz = p.tx * side, off = BRIDGE[k2] ? 2.6 : 7.5;
    const x = p.x + nx * off, z = p.z + nz * off, gy = BRIDGE[k2] ? p.y + 0.2 : heightAt(x, z);
    const ry = heading(p.tx, p.tz);
    addProp('pole', x, gy - 0.2, z, ry, 1, { tilt: (rnd() - 0.5) * 0.08 });
    const ins = [];
    for (const [yy, zz] of [[7.47, -0.8], [7.47, 0.8], [6.87, -0.35], [6.87, 0.35]]) ins.push([x + zz * -p.tz, gy - 0.2 + yy, z + zz * p.tx]);
    if (prev && rnd() > 0.04) for (let w = 0; w < 4; w++) {
      if (w > 1 && rnd() < 0.2) continue;
      const a = prev[w], b = ins[w];
      for (let q = 0; q < 8; q++) {
        const t0 = q / 8, t1 = (q + 1) / 8, sag = 0.9;
        wires.push(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0 - sag * 4 * t0 * (1 - t0), a[2] + (b[2] - a[2]) * t0);
        wires.push(a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1 - sag * 4 * t1 * (1 - t1), a[2] + (b[2] - a[2]) * t1);
      }
    }
    prev = ins;
  }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  group.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x2a2420, transparent: true, opacity: 0.75 })));

  // mileposts, whistle posts
  for (let s = 250, i = 1; s < rail.L - 50; s += 500, i++) {
    const p = railAt(s), x = p.x - p.tz * 3.6, z = p.z + p.tx * 3.6, kk = Math.round(s / rail.ds);
    if (!BRIDGE[kk]) addProp('milepost', x, heightAt(x, z), z, heading(p.tx, p.tz));
  }
  // signals and crossings at each town
  for (const t of TOWNS) {
    for (const a of [-(t.len / 2 + 110), t.len / 2 + 110]) {
      const s = t.k * rail.ds + a; if (s < 10 || s > rail.L - 10) continue;
      buildSignal(group, s, -t.side, a > 0);
    }
    buildCrossing(group, t.k * rail.ds + t.crossA, rnd);
  }
  return group;
}

function buildTrestle(group, b0, b1, rnd) {
  // stringers and guard timbers
  for (const u of [-0.75, 0.75]) group.add(sweep(b0, b1, [[-0.16, -0.5], [0.16, -0.5], [0.16, 0], [-0.16, 0]], true, MAT.woodDark, 0, u));
  for (const u of [-1.35, 1.35]) group.add(sweep(b0, b1, [[-0.1, 0.16], [0.1, 0.16], [0.1, 0.34], [-0.1, 0.34]], true, MAT.woodDark, 0, u));
  const s0 = b0 * rail.ds, s1 = b1 * rail.ds;
  for (let s = s0; s <= s1 + 0.01; s += 4.5) {
    const p = railAt(s), B = new Builder();
    B.begin(p.x, p.y, p.z, heading(p.tx, p.tz));
    let g = 1e9; for (const u of [-2, 0, 2]) g = Math.min(g, heightAt(p.x - p.tz * u, p.z + p.tx * u));
    const top = -0.5, bot = g - p.y - 0.6, h = top - bot;
    B.box('woodDark', 0, top - 0.15, 0, 0.35, 0.3, 4.8);
    B.addCollider(-2.3, -0.6, -1.4, 2.3, 0.18, 1.4);
    if (h > 0.3) {
      for (const [z, lean] of [[-1.9, -0.07], [-0.65, 0], [0.65, 0], [1.9, 0.07]]) B.box('woodDark', 0, (top + bot) / 2 - 0.15, z + lean * h / 2, 0.3, h, 0.3, { rx: lean, col: false });
      for (let y = top - 0.3; y > bot + 1; y -= 3.6) {
        const ys = Math.min(3.4, y - bot);
        B.box('woodGrey', 0.2, y - ys / 2, 0, 0.08, Math.hypot(ys, 4), 0.2, { rx: Math.atan2(4, ys), col: false });
        B.box('woodGrey', -0.2, y - ys / 2, 0, 0.08, Math.hypot(ys, 4), 0.2, { rx: -Math.atan2(4, ys), col: false });
        B.box('woodDark', 0, y - ys, 0, 0.22, 0.22, 4.4 + 0.14 * (top - y + ys), { col: false });
      }
      B.box('woodDark', 0, bot + 0.2, 0, 0.5, 0.4, 5.2, { col: false });
    }
    group.add(B.build());
  }
}

function buildSignal(group, s, side, far) {
  const p = railAt(s), u = 3.3 * side, x = p.x - p.tz * u, z = p.z + p.tx * u;
  const B = new Builder(); B.begin(x, heightAt(x, z), z, heading(p.tx, p.tz) + (far ? Math.PI : 0));
  B.box('woodDark', 0, 0.3, 0, 0.9, 0.6, 0.9);
  B.box('woodWhite', 0, 3.6, 0, 0.22, 6.6, 0.22);
  B.box('woodRed', 0.1, 6.2, -0.55 * side, 0.05, 0.28, 1.3, { rx: -0.6 * side, col: false });
  B.box('woodWhite', 0.13, 6.2, -0.8 * side, 0.02, 0.29, 0.12, { rx: -0.6 * side, col: false });
  B.box('iron', 0.15, 5.7, 0, 0.3, 0.4, 0.3, { col: false });
  for (let y = 0.6; y < 5.6; y += 0.35) B.box('iron', -0.22, y, 0, 0.04, 0.04, 0.35, { col: false });
  B.box('iron', -0.22, 3.1, 0.17, 0.04, 5.0, 0.03, { col: false }); B.box('iron', -0.22, 3.1, -0.17, 0.04, 5.0, 0.03, { col: false });
  group.add(B.build());
}

function buildCrossing(group, s, rnd) {
  const p = railAt(s), B = new Builder(); B.begin(p.x, p.y, p.z, heading(p.tx, p.tz));
  for (const z of [-1.25, -0.95, -0.4, 0, 0.4, 0.95, 1.25, -1.6, 1.6]) B.box('woodGrey', 0, 0.22 - Math.max(0, Math.abs(z) - 1.3) * 0.25, z, 6.0, 0.12, 0.26);
  B.addCollider(-3, -0.5, -1.8, 3, 0.28, 1.8);
  group.add(B.build());
  for (const side of [-1, 1]) {
    const x = p.x + p.tx * side * 4.2 - p.tz * side * 4.5, z = p.z + p.tz * side * 4.2 + p.tx * side * 4.5;
    addProp('crossbuck', x, heightAt(x, z), z, heading(p.tx, p.tz) + Math.PI / 2, 1, { tilt: (rnd() - 0.5) * 0.1 });
  }
}
