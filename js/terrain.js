// Streams the ground: detailed tiles in a square around the camera (two levels of detail each, with skirts that hide
// the seams), coarse far tiles out to the horizon, and water and ice wherever the ground dips below a water line.
// Nothing out of range is built, and anything left behind is thrown away.
import * as THREE from 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/three.module.js';
import * as W from './world.js';
import { terrainMaterial, waterMaterial, setTerrainLite } from './terrainmat.js';

const FT = 2048, FSEG = 64, FCELL = FT / FSEG, FV = FSEG + 1;
export const LOD_PAD = Math.SQRT1_2 * W.TILE;
const WATER_SWAMP = [0.25, 0.28, 0.19], WATER_CLEAR = [0.2, 0.31, 0.33], ICE = [0.8, 0.87, 0.94];

// far tiles are not drawn where the detailed tiles already cover the ground
function addCutout(mat, rectU) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.nearRect = rectU;
    sh.vertexShader = 'varying vec2 vFarXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFarXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = 'uniform vec4 nearRect;\nvarying vec2 vFarXZ;\n' + sh.fragmentShader.replace('void main() {',
      'void main() {\n  if (vFarXZ.x > nearRect.x && vFarXZ.x < nearRect.z && vFarXZ.y > nearRect.y && vFarXZ.y < nearRect.w) discard;');
  };
  mat.customProgramCacheKey = () => 'far-cutout';
  return mat;
}

// what the ground is made of at one vertex, for the terrain shader: x rock, y gravel, z hardpan / beaten earth, w damp
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function surfAt(t, q, out, o) {
  const ny = t.NRM[q * 3 + 1], mt = t.MT[q] / 255, bw = t.BW, desert = bw[q * 5] / 255, bad = bw[q * 5 + 3] / 255, snow = bw[q * 5 + 4] / 255;
  // bare rock on steep faces, and on the shoulders of mountains a little sooner
  let wr = smooth(0.86, 0.66, ny) + mt * smooth(0.97, 0.82, ny) * 0.55;
  // ballast and gravel: the track bed, dry washes, ravine floors and stony badland flats
  let wg = 1 - smooth(2.8, 4.8, t.RD[q]);
  if (t.RK[q] === 1) wg = Math.max(wg, (1 - smooth(5, 13, t.RV[q])) * 0.85);
  if (t.RK[q] >= 2) wg = Math.max(wg, (1 - smooth(4, 14, t.RV[q])) * 0.5);
  wg = Math.max(wg, (t.RAV[q] / 255) * 0.7, bad * 0.25 * smooth(0.99, 0.9, ny));
  // hardpan and beaten earth: roads, town ground, paths, the cracked flats of the desert floor
  let wd = Math.max(t.RW[q] * 0.95, smooth(0.4, 0.9, t.PW[q]) * 0.8, (1 - smooth(4.8, 9, t.RD[q])) * 0.55);
  wd = Math.max(wd, desert * 0.18 + bad * 0.3);
  wr *= 1 - snow * 0.35; wd *= 1 - snow * 0.8;
  // damp: ground just above water, darker and with a sheen
  const wl = t.WL[q], dh = wl > -1e3 ? t.H[q] - wl : 99, wet = wl > -1e3 ? 1 - smooth(0.0, 1.6, dh) : 0;
  // rock takes its share first, then gravel, then earth; whatever is left is the region's own ground
  wr = Math.min(1, wr); wg = Math.min(wg, 1 - wr); wd = Math.min(wd, 1 - wr - wg);
  out[o * 4] = wr; out[o * 4 + 1] = wg; out[o * 4 + 2] = wd; out[o * 4 + 3] = wet;
}
function tileGeometry(t, step) {
  const TV = W.TV, n = W.TS / step, verts = (n + 1) * (n + 1), skirt = 4 * (n + 1);
  const pos = new Float32Array((verts + skirt) * 3), nor = new Float32Array((verts + skirt) * 3), col = new Float32Array((verts + skirt) * 3), uv = new Float32Array((verts + skirt) * 2), srf = new Float32Array((verts + skirt) * 4);
  const idx = [], cx = t.x0 + W.TILE / 2, cz = t.z0 + W.TILE / 2;
  const put = (o, i, j, drop) => {
    const q = j * TV + i, x = t.x0 + i * W.CELL, z = t.z0 + j * W.CELL;
    pos[o * 3] = x - cx; pos[o * 3 + 1] = t.H[q] - drop; pos[o * 3 + 2] = z - cz;
    nor[o * 3] = t.NRM[q * 3]; nor[o * 3 + 1] = t.NRM[q * 3 + 1]; nor[o * 3 + 2] = t.NRM[q * 3 + 2];
    col[o * 3] = t.COL[q * 3]; col[o * 3 + 1] = t.COL[q * 3 + 1]; col[o * 3 + 2] = t.COL[q * 3 + 2];
    uv[o * 2] = x; uv[o * 2 + 1] = z;
    surfAt(t, q, srf, o);
  };
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) put(j * (n + 1) + i, i * step, j * step, 0);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  // skirts hide cracks between neighbouring tiles at different levels of detail
  let o = verts;
  const edges = [[q => q, () => 0], [q => q, () => n], [() => 0, q => q], [() => n, q => q]];
  for (let e = 0; e < 4; e++) {
    const start = o;
    for (let q = 0; q <= n; q++) put(o++, edges[e][0](q) * step, edges[e][1](q) * step, 12);
    for (let q = 0; q < n; q++) {
      const i0 = edges[e][0](q), j0 = edges[e][1](q), i1 = edges[e][0](q + 1), j1 = edges[e][1](q + 1);
      const a = j0 * (n + 1) + i0, b = j1 * (n + 1) + i1, sa = start + q, sb = start + q + 1;
      idx.push(a, sa, b, b, sa, sb, a, b, sa, b, sb, sa);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('surf', new THREE.BufferAttribute(srf, 4));
  g.setIndex(idx); g.computeBoundingSphere();
  return g;
}

// water and ice over a grid: a vertex under water sits on the water line, a dry one dips 0.6 m under the ground so the
// surface meets the shore. H, WL, ICE, swampW are per-vertex arrays of a (n+1)² grid spaced `cell` apart
function waterGeometry(n, cell, x0, z0, cx, cz, H, WL, ICEA, swampW, frozen) {
  const V = n + 1, wet = new Uint8Array(V * V);
  for (let q = 0; q < V * V; q++) wet[q] = WL[q] > H[q] ? 1 : 0;
  const pos = [], col = [], idx = [], map = new Int32Array(V * V).fill(-1);
  const vert = q => {
    if (map[q] >= 0) return map[q];
    const i = q % V, j = (q - i) / V;
    map[q] = pos.length / 3;
    pos.push(x0 + i * cell - cx, wet[q] ? WL[q] : H[q] - 0.6, z0 + j * cell - cz);
    const c = frozen ? ICE : swampW[q] > 0.3 ? WATER_SWAMP : WATER_CLEAR; col.push(c[0], c[1], c[2]);
    return map[q];
  };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
    if (!(wet[a] || wet[b] || wet[c] || wet[d])) continue;
    const ice = (wet[a] && ICEA[a]) || (wet[b] && ICEA[b]) || (wet[c] && ICEA[c]) || (wet[d] && ICEA[d]) ? 1 : 0;
    if (ice !== (frozen ? 1 : 0)) continue;
    idx.push(vert(a), vert(c), vert(b), vert(b), vert(c), vert(d));
  }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}

// openings dug into the ground (stairwells down to the laboratory and the catacombs): the detailed ground is not drawn
// inside these rectangles [x0, z0, x1, z1]. Up to 8
export const HOLES = [];
const holesU = { value: Array.from({ length: 8 }, () => new THREE.Vector4(1, 1, -1, -1)) };
export function addHole(x0, z0, x1, z1) { const i = HOLES.length; if (i >= 8) return; HOLES.push([x0, z0, x1, z1]); holesU.value[i].set(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)); }
function addHoles(mat, key) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.holes = holesU;
    sh.vertexShader = 'varying vec2 vHoleXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vHoleXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = 'uniform vec4 holes[8];\nvarying vec2 vHoleXZ;\n' + sh.fragmentShader.replace('void main() {',
      'void main() {\n  for (int i = 0; i < 8; i++) { vec4 h = holes[i]; if (vHoleXZ.x > h.x && vHoleXZ.x < h.z && vHoleXZ.y > h.y && vHoleXZ.y < h.w) discard; }');
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

// hooks.onTile(t) when a detailed tile appears, hooks.onDrop(t) when it is thrown away
export function createTerrain(scene, hooks = {}) {
  const rectU = { value: new THREE.Vector4(1, 1, -1, -1) };
  // sand, hardpan, gravel, rock and meadow blended per pixel (see terrainmat.js); far tiles use a cheaper version
  const mat = terrainMaterial({ holes: holesU, mode: 'near' });
  const matMid = terrainMaterial({ holes: holesU, mode: 'mid' });
  const matFar = terrainMaterial({ cutout: rectU, mode: 'far' });
  const water = waterMaterial(), ice = waterMaterial({ ice: true });
  const waterFar = waterMaterial({ cutout: rectU }), iceFar = waterMaterial({ cutout: rectU, ice: true });

  let R = 3, viewK = 1, active = null, want = null;
  const far = new Map(), jobs = [];
  let job = null;

  // ---------- near tiles ----------
  function buildMeshes(t) {
    const grp = new THREE.Group(), cx = t.x0 + W.TILE / 2, cz = t.z0 + W.TILE / 2;
    grp.position.set(cx, 0, cz);
    const lod = new THREE.LOD();
    const hi = new THREE.Mesh(tileGeometry(t, 1), mat); hi.receiveShadow = true;
    const mid = new THREE.Mesh(tileGeometry(t, 3), matMid); mid.receiveShadow = true;
    lod.addLevel(hi, 0); lod.addLevel(mid, 420 * viewK + LOD_PAD);
    grp.add(lod);
    if (t.wet) {
      const sw = new Float32Array(W.TV * W.TV); for (let q = 0; q < sw.length; q++) sw[q] = t.BW[q * 5 + 2] / 255;
      for (const frozen of [false, true]) {
        const g = waterGeometry(W.TS, W.CELL, t.x0, t.z0, cx, cz, t.H, t.WL, t.ICE, sw, frozen);
        if (g) { const m = new THREE.Mesh(g, frozen ? ice : water); m.receiveShadow = true; grp.add(m); }
      }
    }
    grp.updateMatrixWorld(true);
    scene.add(grp); t.group = grp; t.lod = lod;
    t.img = mapImage(t);
    if (hooks.onTile) hooks.onTile(t);
  }
  // a small picture of the tile for the minimap
  function mapImage(t) {
    const S = 48, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d'), img = g.createImageData(S, S), k = W.TS / S;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const q = Math.round(j * k) * W.TV + Math.round(i * k), sh = 1 + (t.NRM[q * 3] - t.NRM[q * 3 + 2]) * 0.9;
      const wet = t.WL[q] > t.H[q], o = (j * S + i) * 4;
      const c = wet ? (t.ICE[q] ? ICE : t.BW[q * 5 + 2] > 76 ? WATER_SWAMP : WATER_CLEAR) : [t.COL[q * 3], t.COL[q * 3 + 1], t.COL[q * 3 + 2]];
      img.data[o] = Math.min(255, c[0] * 255 * sh); img.data[o + 1] = Math.min(255, c[1] * 255 * sh); img.data[o + 2] = Math.min(255, c[2] * 255 * sh); img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0); return cv;
  }
  function disposeGroup(grp) {
    if (!grp) return;
    scene.remove(grp);
    grp.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
  function dropTile(t) { if (t.group && hooks.onDrop) hooks.onDrop(t); disposeGroup(t.group); t.group = null; t.dead = true; W.TILES.delete(W.tkey(t.i, t.j)); }

  // ---------- far tiles ----------
  function* farJob(f) {
    const N = FV + 2, Hb = new Float32Array(N * N), H = new Float32Array(FV * FV), WL = new Float32Array(FV * FV), IC = new Uint8Array(FV * FV), SW = new Float32Array(FV * FV);
    const col = new Float32Array(FV * FV * 3), keep = [];
    for (let jj = 0; jj < N; jj++) {
      const z = f.z0 + (jj - 1) * FCELL;
      for (let ii = 0; ii < N; ii++) {
        const x = f.x0 + (ii - 1) * FCELL, s = W.sampleAt(x, z);
        Hb[jj * N + ii] = s.h;
        if (ii >= 1 && ii <= FV && jj >= 1 && jj <= FV) {
          const o = (jj - 1) * FV + (ii - 1);
          H[o] = s.h; WL[o] = s.wl; IC[o] = s.ice; SW[o] = s.w[2];
          keep[o] = { h: s.h, w: Float32Array.from(s.w), mt: s.mt, rv: s.rv, rvKind: s.rvKind, pw: s.pw, rw: s.rw, rd: s.rd, rav: s.rav };
        }
      }
      if (jj % 3 === 2) yield;
    }
    const pos = new Float32Array(FV * FV * 3), nor = new Float32Array(FV * FV * 3), c3 = [0, 0, 0], cx = f.x0 + FT / 2, cz = f.z0 + FT / 2;
    let wet = false;
    for (let j = 0; j < FV; j++) for (let i = 0; i < FV; i++) {
      const b = (j + 1) * N + (i + 1), o = j * FV + i;
      let nx = Hb[b - 1] - Hb[b + 1], ny = 2 * FCELL, nz = Hb[b - N] - Hb[b + N]; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      pos[o * 3] = f.x0 + i * FCELL - cx; pos[o * 3 + 1] = H[o] - 1.0; pos[o * 3 + 2] = f.z0 + j * FCELL - cz;
      nor[o * 3] = nx; nor[o * 3 + 1] = ny; nor[o * 3 + 2] = nz;
      W.groundColor(keep[o], 1 - ny, f.x0 + i * FCELL, f.z0 + j * FCELL, c3, true);
      col[o * 3] = c3[0]; col[o * 3 + 1] = c3[1]; col[o * 3 + 2] = c3[2];
      if (WL[o] > H[o]) wet = true;
    }
    yield;
    const idx = [];
    for (let j = 0; j < FSEG; j++) for (let i = 0; i < FSEG; i++) { const a = j * FV + i, b = a + 1, c = a + FV, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx); g.computeBoundingSphere();
    const grp = new THREE.Group(); grp.position.set(cx, 0, cz);
    grp.add(new THREE.Mesh(g, matFar));
    if (wet) for (const frozen of [false, true]) {
      const H2 = H.map(v => v - 1.0), WL2 = WL.map(v => v - 1.0);
      const wg = waterGeometry(FSEG, FCELL, f.x0, f.z0, cx, cz, H2, WL2, IC, SW, frozen);
      if (wg) grp.add(new THREE.Mesh(wg, frozen ? iceFar : waterFar));
    }
    if (f.dead) { grp.traverse(o => { if (o.geometry) o.geometry.dispose(); }); return; }
    scene.add(grp); f.group = grp; f.ready = true;
  }

  // ---------- scheduling ----------
  function farRange() { return 7600 * viewK; }
  function nearJob(maxR) {
    let best = null, bd = 1e18;
    if (want) for (let dj = -maxR; dj <= maxR; dj++) for (let di = -maxR; di <= maxR; di++) {
      const i = want.i + di, j = want.j + dj, k = W.tkey(i, j);
      let t = W.TILES.get(k);
      if (t && t.group) continue;
      const d = di * di + dj * dj;
      if (d < bd) { bd = d; best = { i, j, k, t }; }
    }
    if (!best) return null;
    let t = best.t;
    if (!t) { t = W.newTile(best.i, best.j); W.TILES.set(best.k, t); }
    if (!t.ready) { if (!t.gen) t.gen = W.tileJob(t); return { gen: t.gen, done: () => { t.gen = null; } }; }
    return { gen: (function* () { if (!t.dead) buildMeshes(t); })(), done: () => {} };
  }
  function farJobNear(cam, fr) {
    let fb = null, bd = 1e18;
    const fi0 = Math.floor((cam.x + W.HALF) / FT), fj0 = Math.floor((cam.z + W.HALF) / FT), n = Math.ceil(fr / FT) + 1;
    for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) {
      const i = fi0 + di, j = fj0 + dj, f = far.get(W.tkey(i, j));
      if (f && (f.ready || f.gen)) continue;
      const x0 = -W.HALF + i * FT, z0 = -W.HALF + j * FT;
      const dx = Math.max(x0 - cam.x, 0, cam.x - x0 - FT), dz = Math.max(z0 - cam.z, 0, cam.z - z0 - FT), d = Math.hypot(dx, dz);
      if (d > fr) continue;
      if (d < bd) { bd = d; fb = { i, j, x0, z0 }; }
    }
    if (fb) {
      const f = { i: fb.i, j: fb.j, x0: fb.x0, z0: fb.z0, ready: false };
      far.set(W.tkey(fb.i, fb.j), f); f.gen = farJob(f);
      return { gen: f.gen, done: () => { f.gen = null; } };
    }
    return null;
  }
  // the ground underfoot first, then the near horizon, then the rest of the detailed square, then the far horizon
  function nextJob(cam) {
    return nearJob(1) || farJobNear(cam, 2600 * viewK) || nearJob(R) || farJobNear(cam, farRange());
  }
  function cull(cam) {
    // detailed tiles: keep the wanted square and the one being shown; drop the rest
    const keep = (t, sq) => sq && Math.abs(t.i - sq.i) <= R + 1 && Math.abs(t.j - sq.j) <= R + 1;
    for (const t of [...W.TILES.values()]) if (!keep(t, want) && !keep(t, active) && !t.gen) dropTile(t);
    const fr = farRange() + FT * 1.5;
    for (const [k, f] of far) {
      if (f.gen) continue;
      const cx = f.x0 + FT / 2, cz = f.z0 + FT / 2;
      if (Math.hypot(cx - cam.x, cz - cam.z) > fr) { disposeGroup(f.group); f.dead = true; far.delete(k); }
    }
  }
  function squareDone(sq) {
    for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) { const t = W.TILES.get(W.tkey(sq.i + di, sq.j + dj)); if (!t || !t.group) return false; }
    return true;
  }
  let cullT = 0;
  return {
    update(cam, budget = 6) {
      const [ci, cj] = W.tileOf(cam.x, cam.z);
      if (!want || want.i !== ci || want.j !== cj) want = { i: ci, j: cj };
      const t0 = performance.now();
      while (performance.now() - t0 < budget) {
        if (!job) job = nextJob(cam);
        if (!job) break;
        const r = job.gen.next();
        if (r.done) { job.done(); job = null; }
      }
      if (want && (!active || active.i !== want.i || active.j !== want.j) && squareDone(want)) {
        active = { i: want.i, j: want.j };
        rectU.value.set(-W.HALF + (active.i - R) * W.TILE, -W.HALF + (active.j - R) * W.TILE, -W.HALF + (active.i + R + 1) * W.TILE, -W.HALF + (active.j + R + 1) * W.TILE);
      }
      if ((cullT += 1) % 30 === 0) cull(cam);
    },
    // detailed ground is in place around this point
    readyAt(x, z) {
      const [i, j] = W.tileOf(x, z);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const t = W.TILES.get(W.tkey(i + di, j + dj)); if (!t || !t.group) return false; }
      return true;
    },
    // share of the start-up work done (detailed square plus nearby far tiles)
    progress(cam) {
      if (!want) return 0;
      let n = 0, d = 0;
      for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) { n++; const t = W.TILES.get(W.tkey(want.i + di, want.j + dj)); if (t && t.group) d++; }
      return d / n;
    },
    get busy() { return !!job; },
    setView(k) {
      viewK = k; R = k < 0.75 ? 2 : k > 1.15 ? 4 : 3;
      for (const t of W.TILES.values()) if (t.lod && t.lod.levels.length === 2) t.lod.levels[1].distance = 420 * viewK + LOD_PAD;
    },
    get radius() { return R; },
    // lower texture settings: the near ground drops the three-way rock projection
    setLite(lite) { setTerrainLite([mat], lite); },
  };
}
