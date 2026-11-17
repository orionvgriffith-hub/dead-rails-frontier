// Physically based surface textures, worked out in the page: exactly tiling value and cell noise, height fields turned
// into normal maps, and the five ground layers (sand, hardpan, gravel, rock, meadow) the terrain shader blends.
// Everything is drawn from height first, so colour, relief, roughness and crevice shading always agree
import * as THREE from 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/three.module.js';

// ---------- tiling noise ----------
// integer hash of a lattice point; the lattice wraps every p cells, so a texture built on it tiles with no seam
function hash(x, y, s) {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16;
  return (n >>> 0) / 4294967295;
}
const wrap = (i, p) => ((i % p) + p) % p;
// smooth value noise in [-1, 1] at (u, v) in texture space [0, 1), p lattice cells across
export function vnoise(u, v, p, s = 0) {
  const x = u * p, y = v * p, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const x0 = wrap(xi, p), x1 = wrap(xi + 1, p), y0 = wrap(yi, p), y1 = wrap(yi + 1, p);
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, s), b = hash(x1, y0, s), c = hash(x0, y1, s), d = hash(x1, y1, s);
  return (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * 2 - 1;
}
export function vfbm(u, v, p, oct, s = 0) {
  let a = 0.5, f = 1, t = 0, w = 0;
  for (let i = 0; i < oct; i++) { t += a * vnoise(u, v, p * f, s + i * 17); w += a; a *= 0.5; f *= 2; }
  return t / w;
}
// the same with separate lattice counts across and down, for streaks and grain that still tile
export function vnoise2(u, v, pu, pv, s = 0) {
  const x = u * pu, y = v * pv, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const x0 = wrap(xi, pu), x1 = wrap(xi + 1, pu), y0 = wrap(yi, pv), y1 = wrap(yi + 1, pv);
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, s), b = hash(x1, y0, s), c = hash(x0, y1, s), d = hash(x1, y1, s);
  return (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * 2 - 1;
}
export function vfbm2(u, v, pu, pv, oct, s = 0) {
  let a = 0.5, f = 1, t = 0, w = 0;
  for (let i = 0; i < oct; i++) { t += a * vnoise2(u, v, pu * f, pv * f, s + i * 17); w += a; a *= 0.5; f *= 2; }
  return t / w;
}
// cell noise: distance to the nearest and second nearest scattered point, plus the nearest cell's own random value
const mkCell = () => ({ f1: 0, f2: 0, id: 0, dx: 0, dy: 0 });
const CA = mkCell(), CB = mkCell(), CC = mkCell();
export function cells(u, v, p, s = 0, jitter = 0.9, out = CA) {
  const x = u * p, y = v * p, xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0, dx = 0, dy = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = wrap(xi + i, p), cy = wrap(yi + j, p);
    const px = xi + i + 0.5 + (hash(cx, cy, s) - 0.5) * jitter, py = yi + j + 0.5 + (hash(cx, cy, s + 7) - 0.5) * jitter;
    const ex = x - px, ey = y - py, d = Math.sqrt(ex * ex + ey * ey);
    if (d < f1) { f2 = f1; f1 = d; id = hash(cx, cy, s + 13); dx = ex; dy = ey; } else if (d < f2) f2 = d;
  }
  out.f1 = f1; out.f2 = f2; out.id = id; out.dx = dx; out.dy = dy;
  return out;
}
const sat = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mixv = (a, b, t) => a + (b - a) * t;

// ---------- height to normal and crevice shading ----------
// strength: how steep a step of 1 in height across one pixel looks. Writes normal xy (0..255) into out at stride 4
function deriveNormals(H, S, strength, out, offN = 0, offAO = -1) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const xm = (x + S - 1) % S, xp = (x + 1) % S, ym = (y + S - 1) % S, yp = (y + 1) % S, i = y * S + x;
    const dx = (H[y * S + xp] - H[y * S + xm]) * 0.5 * strength, dy = (H[yp * S + x] - H[ym * S + x]) * 0.5 * strength;
    const l = Math.sqrt(dx * dx + dy * dy + 1), o = i * 4;
    out[o + offN] = (-dx / l * 0.5 + 0.5) * 255; out[o + offN + 1] = (-dy / l * 0.5 + 0.5) * 255;
    if (offAO >= 0) {
      // crevices: lower than the ring of ground around them
      let ring = 0; for (let k = 0; k < 8; k++) { const a = k * 0.785, rx = Math.round(Math.cos(a) * 3), ry = Math.round(Math.sin(a) * 3); ring += H[((y + ry + S) % S) * S + ((x + rx + S) % S)]; }
      out[o + offAO] = sat(1 - Math.max(0, ring / 8 - H[i]) * 3.2) * 255;
    }
  }
}
function canvasFrom(S, fill) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S); fill(img.data); g.putImageData(img, 0, 0); return c;
}
const toLin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

// ---------- the ground layers ----------
// each layer function fills height (0..1, larger is higher), colour (sRGB 0..1) and roughness for one pixel
const L = { h: 0, r: 0, g: 0, b: 0, ro: 0.9 };
const LAYERS = [
  // 0 sand: wind ripples curving over a fine grain, the odd pebble lying on top
  (u, v) => {
    const warp = vfbm(u, v, 3, 3, 5) * 0.9, rip = Math.sin((v * 26 + u * 4 + warp * 3) * Math.PI * 2);
    const ripple = Math.pow(rip * 0.5 + 0.5, 1.6) * (0.55 + 0.45 * vfbm(u, v, 4, 2, 9));
    const grain = vnoise(u, v, 256, 3) * 0.5 + vnoise(u, v, 128, 4) * 0.5;
    const c = cells(u, v, 40, 21, 1); const peb = c.id > 0.9 ? sstep(0.34, 0.12, c.f1) : 0;
    L.h = ripple * 0.55 + grain * 0.06 + peb * 0.5 + vfbm(u, v, 6, 3, 2) * 0.1;
    const s = 0.86 + grain * 0.06 + vfbm(u, v, 5, 3, 11) * 0.08 - (1 - ripple) * 0.05;
    L.r = s; L.g = s * 0.965; L.b = s * 0.91;
    if (peb > 0) { const k = peb * 0.8, pv = 0.55 + c.id * 0.4; L.r = mixv(L.r, pv * 0.85, k); L.g = mixv(L.g, pv * 0.76, k); L.b = mixv(L.b, pv * 0.66, k); }
    L.ro = 0.95 - peb * 0.12;
  },
  // 1 hardpan: sun-baked earth broken into plates by cracks, grit and small stones over it
  (u, v) => {
    const wu = u + vfbm(u, v, 4, 2, 31) * 0.03, wv = v + vfbm(u, v, 4, 2, 37) * 0.03;
    const c = cells(wu, wv, 7, 41, 1), edge = c.f2 - c.f1, crack = sstep(0.085, 0.0, edge), plate = c.id;
    const c2 = cells(u, v, 22, 43, 1, CB), crack2 = sstep(0.05, 0.0, c2.f2 - c2.f1) * 0.45;
    const grit = vnoise(u, v, 200, 45);
    const st = cells(u, v, 28, 47, 1, CC), stone = st.id > 0.82 ? sstep(0.3, 0.1, st.f1) : 0;
    const curl = sstep(0.0, 0.25, edge) * 0.12; // plate edges lift a little as they dry
    L.h = 0.55 - crack * 0.5 - crack2 * 0.2 + curl + grit * 0.03 + stone * 0.35 + plate * 0.04;
    const s = 0.82 + plate * 0.1 + grit * 0.04 + vfbm(u, v, 5, 3, 49) * 0.08 - crack * 0.38 - crack2 * 0.12;
    L.r = s; L.g = s * 0.93; L.b = s * 0.84;
    if (stone > 0) { const pv = 0.55 + st.id * 0.35; L.r = mixv(L.r, pv * 0.9, stone); L.g = mixv(L.g, pv * 0.82, stone); L.b = mixv(L.b, pv * 0.74, stone); }
    L.ro = 0.9 - stone * 0.08 + crack * 0.05;
  },
  // 2 gravel: packed rounded stones of mixed rock, dark gaps of grit between them
  (u, v) => {
    const c = cells(u, v, 18, 61, 0.95), id = c.id, r = 0.42 + id * 0.12, f = c.f1 / r;
    const dome = f < 1 ? Math.sqrt(1 - f * f) : 0;
    const c2 = cells(u, v, 41, 63, 0.95, CB), d2 = c2.f1 / 0.44, dome2 = d2 < 1 ? Math.sqrt(1 - d2 * d2) * 0.6 : 0;
    const grit = vnoise(u, v, 256, 65) * 0.5 + 0.5;
    const top = Math.max(dome, dome2);
    L.h = top * 0.85 + grit * 0.08 + vnoise(u, v, 90, 67) * 0.04 * top;
    const which = dome >= dome2 ? id : c2.id, k = sstep(0.0, 0.25, top);
    // grey, tan, rust-red and pale stones
    const pal = which < 0.35 ? [0.62, 0.6, 0.57] : which < 0.65 ? [0.72, 0.62, 0.5] : which < 0.85 ? [0.6, 0.42, 0.33] : [0.82, 0.78, 0.7];
    const sp = 0.85 + vnoise(u, v, 160, 69) * 0.15;
    L.r = mixv(0.3 + grit * 0.1, pal[0] * sp, k); L.g = mixv(0.26 + grit * 0.09, pal[1] * sp, k); L.b = mixv(0.22 + grit * 0.08, pal[2] * sp, k);
    L.ro = mixv(0.95, 0.68 + which * 0.18, k);
  },
  // 3 rock: bedded sandstone, layers of differing hardness weathered back unevenly and broken by joints
  (u, v) => {
    const wv = v + vfbm(u, v, 3, 3, 71) * 0.05;
    const bed = wv * 9, layer = Math.floor(bed), fr = bed - layer, hard = hash(wrap(layer, 9), 0, 73);
    const lip = sstep(0.0, 0.12, fr) * sstep(1.0, 0.82, fr);
    const j = cells(u, wv, 5, 75, 0.8), joint = sstep(0.06, 0.0, j.f2 - j.f1);
    const grain = vnoise(u, v, 220, 77) * 0.5 + vnoise(u, v, 70, 78) * 0.5;
    const pit = vfbm(u, v, 12, 3, 79);
    L.h = 0.35 + hard * 0.3 * lip + lip * 0.15 - joint * 0.35 + grain * 0.05 + pit * 0.12;
    const s = 0.78 + hard * 0.16 + grain * 0.05 + pit * 0.08 - joint * 0.3 - (1 - lip) * 0.12;
    const red = 0.94 + vfbm(u, v, 2, 2, 81) * 0.06;
    L.r = s * red; L.g = s * 0.92; L.b = s * 0.84;
    // desert varnish: dark streaks running down from the ledges
    const varnish = sstep(0.35, 0.8, vfbm2(u, v, 24, 2, 2, 83) * 0.5 + 0.5) * 0.22;
    L.r -= varnish * 0.8; L.g -= varnish * 0.85; L.b -= varnish * 0.85;
    L.ro = 0.82 - hard * 0.08 + joint * 0.1;
  },
  // 4 meadow: short grass and leaf litter over earth, for the greener regions
  (u, v) => {
    let blade = 0;
    for (let k = 0; k < 3; k++) { const c = cells(u, v, 34 + k * 19, 91 + k, 1); const a = c.id * 6.28, ax = Math.cos(a), ay = Math.sin(a); const along = c.dx * ax + c.dy * ay, across = Math.abs(c.dx * ay - c.dy * ax); blade = Math.max(blade, sstep(0.09, 0.0, across) * sstep(0.5, 0.0, Math.abs(along)) * (0.6 + c.id * 0.4)); }
    const earth = vfbm(u, v, 10, 3, 95);
    const litter = cells(u, v, 16, 97, 1, CB); const leaf = litter.id > 0.75 ? sstep(0.28, 0.1, litter.f1) : 0;
    L.h = blade * 0.7 + earth * 0.1 + leaf * 0.25;
    const s = 0.7 + blade * 0.25 + earth * 0.06;
    L.r = s * 0.95; L.g = s; L.b = s * 0.82;
    if (leaf > 0) { L.r = mixv(L.r, 0.78, leaf * 0.6); L.g = mixv(L.g, 0.66, leaf * 0.6); L.b = mixv(L.b, 0.46, leaf * 0.6); }
    L.ro = 0.92;
  },
];
// metres one repeat of each layer covers on the ground; the shader also samples each at a broader second scale
export const LAYER_SCALE = [3.6, 4.5, 1.9, 7.5, 2.6];
const LAYER_RELIEF = [5, 7, 9, 8, 5];

// two texture arrays: albedo + height, and normal xy + roughness + crevice shading. mean: average linear colour of each
// layer, so the shader can use the detail as a pure modulation of the ground's own colour
export function buildGroundLayers(S = 512) {
  const n = LAYERS.length, A = new Uint8Array(S * S * 4 * n), N = new Uint8Array(S * S * 4 * n), mean = [];
  const H = new Float32Array(S * S), tmp = new Uint8Array(S * S * 4);
  for (let l = 0; l < n; l++) {
    const f = LAYERS[l], base = S * S * 4 * l; let mr = 0, mg = 0, mb = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      f(x / S, y / S); const i = y * S + x, o = base + i * 4;
      H[i] = sat(L.h);
      A[o] = sat(L.r) * 255; A[o + 1] = sat(L.g) * 255; A[o + 2] = sat(L.b) * 255; A[o + 3] = H[i] * 255;
      N[o + 2] = sat(L.ro) * 255;
      mr += toLin(sat(L.r)); mg += toLin(sat(L.g)); mb += toLin(sat(L.b));
    }
    deriveNormals(H, S, LAYER_RELIEF[l] * S / 512, tmp, 0, 3);
    for (let i = 0; i < S * S; i++) { const o = base + i * 4; N[o] = tmp[i * 4]; N[o + 1] = tmp[i * 4 + 1]; N[o + 3] = tmp[i * 4 + 3]; }
    const k = S * S; mean.push(new THREE.Vector3(mr / k, mg / k, mb / k));
  }
  const mk = (data, srgb) => {
    const t = new THREE.DataArrayTexture(data, S, S, n);
    t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true; return t;
  };
  return { albedo: mk(A, true), normal: mk(N, false), mean, scale: LAYER_SCALE, layers: n };
}

// ---------- surfaces for buildings, props and the train ----------
// a set of three canvases from one height field: colour (sRGB), normal map, and roughness/metalness (G and B, as three
// reads them). fn(u, v) fills P with h, r, g, b, ro, me
export const P = { h: 0, r: 0, g: 0, b: 0, ro: 0.9, me: 0 };
export function surface(S, fn, relief = 6) {
  const H = new Float32Array(S * S), C = new Float32Array(S * S * 3), R = new Float32Array(S * S * 2);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    P.me = 0; fn(x / S, y / S); const i = y * S + x;
    H[i] = P.h; C[i * 3] = P.r; C[i * 3 + 1] = P.g; C[i * 3 + 2] = P.b; R[i * 2] = P.ro; R[i * 2 + 1] = P.me;
  }
  const nrm = new Uint8Array(S * S * 4); deriveNormals(H, S, relief * S / 512, nrm, 0, 3);
  const color = canvasFrom(S, d => { for (let i = 0; i < S * S; i++) { const ao = 0.55 + 0.45 * nrm[i * 4 + 3] / 255; d[i * 4] = sat(C[i * 3] * ao) * 255; d[i * 4 + 1] = sat(C[i * 3 + 1] * ao) * 255; d[i * 4 + 2] = sat(C[i * 3 + 2] * ao) * 255; d[i * 4 + 3] = 255; } });
  // canvas textures are flipped on upload, so green (the v slope) is stored inverted to come out right
  const normal = canvasFrom(S, d => { for (let i = 0; i < S * S; i++) { d[i * 4] = nrm[i * 4]; d[i * 4 + 1] = 255 - nrm[i * 4 + 1]; d[i * 4 + 2] = 255; d[i * 4 + 3] = 255; } });
  const orm = canvasFrom(S, d => { for (let i = 0; i < S * S; i++) { d[i * 4] = 255; d[i * 4 + 1] = sat(R[i * 2]) * 255; d[i * 4 + 2] = sat(R[i * 2 + 1]) * 255; d[i * 4 + 3] = 255; } });
  return { color, normal, orm };
}

// weathered boards: tight grain bending round knots, checks along the grain, sun-silvered tops, peeling paint, nails
export function boards(opts = {}) {
  const n = opts.boards || 6, base = opts.base || [0.6, 0.5, 0.42], peel = opts.peel || 0, seed = opts.seed || 1, rows = opts.endRows || 2;
  return (u, v) => {
    const bi = Math.floor(u * n), bu = u * n - bi, s0 = hash(bi, 0, seed);
    const vv = v + s0 * 0.37, row = Math.floor(vv * rows), rv = vv * rows - row;
    // knots: one or two per board length, the grain flowing round them
    const kc = hash(bi, row, seed + 3), kx = 0.25 + kc * 0.5, ky = hash(bi, row, seed + 5);
    const kdx = (bu - kx) * 3.2, kdy = (rv - ky) * 1.0, kd = Math.sqrt(kdx * kdx + kdy * kdy), knot = kc > 0.45 ? sstep(0.16, 0.05, kd) : 0;
    const bend = kc > 0.45 ? Math.exp(-kd * 6) * 0.35 * Math.sign(kdx || 1) : 0;
    const gx = bu + bend + vfbm(u, v, 3, 2, seed + 7) * 0.06 + s0;
    const ring = Math.sin(gx * 46 + Math.sin(v * 6.283 * 3 + s0 * 9) * 1.2) * 0.5 + 0.5;
    const fine = vnoise(u * 1, v, 380, seed + 9) * 0.5 + 0.5;
    // checks: thin splits along the grain
    const chk = sstep(0.025, 0.0, Math.abs(vnoise(u, v, n * 9, seed + 11))) * sstep(0.2, 0.6, vnoise(u, v, 6, seed + 13) * 0.5 + 0.5);
    const gap = sstep(0.045, 0.012, Math.min(bu, 1 - bu)), end = sstep(0.012, 0.0, Math.min(rv, 1 - rv));
    const nail = (Math.abs(bu - 0.5) < 0.045 && (Math.abs(rv - 0.08) < 0.018 || Math.abs(rv - 0.92) < 0.018)) ? 1 : 0;
    const weather = sstep(-0.2, 0.6, vfbm(u, v, 4, 3, seed + 15));
    L.h = 0.6 + ring * 0.12 * (0.5 + weather) + fine * 0.05 - chk * 0.4 - gap * 0.6 - end * 0.4 - knot * 0.08 + nail * 0.05;
    const shade = (0.84 + s0 * 0.22) * (0.88 + ring * 0.12 + fine * 0.06) * (1 - knot * 0.45) * (1 - chk * 0.5) * (1 - gap * 0.7) * (1 - end * 0.5);
    let r = base[0] * shade, g = base[1] * shade, b = base[2] * shade;
    // sun-bleached silver
    const grey = (r + g + b) / 3 * 1.06, sv = weather * 0.45; r = mixv(r, grey, sv); g = mixv(g, grey, sv); b = mixv(b, grey * 1.02, sv);
    let ro = 0.78 + weather * 0.12 + chk * 0.1;
    if (peel) {
      const pn = vfbm(u, v, 7, 4, seed + 17) + vnoise(u, v, 60, seed + 19) * 0.15;
      if (pn < 0.12) { // paint gone: grey timber underneath, the edge of the paint a little proud
        const t = sstep(0.12, 0.05, pn), wood = 0.46 * (0.85 + ring * 0.15);
        r = mixv(r, wood * 1.02, t); g = mixv(g, wood * 0.95, t); b = mixv(b, wood * 0.86, t); L.h -= t * 0.08; ro = mixv(0.6, 0.9, t);
      } else ro = 0.62 + weather * 0.15;
    }
    if (nail) { r = 0.16; g = 0.13; b = 0.11; ro = 0.5; }
    const rust = nail ? 0 : sstep(0.06, 0.0, Math.abs(bu - 0.5) - 0.02) * (sstep(0.06, 0.0, Math.abs(rv - 0.08) - 0.03) + sstep(0.06, 0.0, Math.abs(rv - 0.92) - 0.03)) * 0.35;
    P.h = L.h; P.r = mixv(r, 0.38, rust); P.g = mixv(g, 0.2, rust); P.b = mixv(b, 0.12, rust); P.ro = ro; P.me = 0;
  };
}
// iron going to rust: bare metal where handled, orange bloom and dark scale elsewhere, pitted
export function rustIron(opts = {}) {
  const seed = opts.seed || 3, amt = opts.rust ?? 0.55, streak = opts.streak || 0, corr = opts.corrugate || 0;
  return (u, v) => {
    const big = vfbm(u, v, 3, 4, seed), mid = vfbm(u, v, 12, 3, seed + 2), fine = vnoise(u, v, 300, seed + 4);
    const st = streak ? vfbm2(u, v, 40, 2, 3, seed + 6) * streak : 0;
    const rust = sstep(0.12 - amt * 0.5, 0.35 - amt * 0.5, big + mid * 0.35 + st);
    const scale = sstep(0.25, 0.6, mid) * rust, pit = sstep(0.7, 0.95, fine * 0.5 + 0.5) * rust;
    const wave = corr ? Math.sin(u * Math.PI * 2 * corr) * 0.5 + 0.5 : 0;
    P.h = (corr ? wave * 0.9 : 0.5) + rust * 0.06 + scale * 0.05 - pit * 0.12 + fine * 0.01;
    const bare = 0.5 + mid * 0.06 + fine * 0.03;
    const rr = 0.42 + mid * 0.1, rg = 0.2 + mid * 0.05, rb = 0.1;
    P.r = mixv(bare, mixv(rr, 0.22, scale), rust); P.g = mixv(bare * 0.98, mixv(rg, 0.13, scale), rust); P.b = mixv(bare * 0.95, mixv(rb, 0.09, scale), rust);
    P.ro = mixv(0.38 + fine * 0.06, 0.9, rust); P.me = mixv(0.9, 0.05, rust);
  };
}
// coursed stone: blocks of differing size, tooled faces, chipped arrises and recessed mortar
export function ashlar(opts = {}) {
  const rows = opts.rows || 5, seed = opts.seed || 5, base = opts.base || [0.66, 0.56, 0.45];
  return (u, v) => {
    const r = Math.floor(v * rows), rv = v * rows - r, w = 2 + Math.floor(hash(r, 0, seed) * 2);
    const off = hash(r, 1, seed), cu = u * w + off, c = Math.floor(cu), ru = cu - c, id = hash(wrap(c, w), r, seed + 3);
    const e = Math.min(ru, 1 - ru) / w * rows, ev = Math.min(rv, 1 - rv), edge = Math.min(e, ev);
    const chip = vfbm(u, v, 24, 2, seed + 5) * 0.03;
    const mortar = sstep(0.05 + chip, 0.025 + chip, edge);
    const face = vfbm(u, v, 30, 3, seed + 7), tool = vnoise(u, v, 160, seed + 9);
    P.h = (1 - mortar) * (0.75 + face * 0.1 + tool * 0.03 + sstep(0.0, 0.12, edge) * 0.08) + mortar * 0.25;
    const s = (0.82 + id * 0.25) * (0.92 + face * 0.1 + tool * 0.04);
    P.r = mixv(base[0] * s, 0.62, mortar); P.g = mixv(base[1] * s, 0.58, mortar); P.b = mixv(base[2] * s, 0.52, mortar); P.ro = mixv(0.85, 0.95, mortar);
  };
}
export function bricks(opts = {}) {
  const seed = opts.seed || 7;
  return (u, v) => {
    const r = Math.floor(v * 16), rv = v * 16 - r, off = r % 2 ? 0.5 / 8 : 0, cu = (u + off) * 8, c = Math.floor(cu), ru = cu - c, id = hash(wrap(c, 8), r, seed);
    const edge = Math.min(Math.min(ru, 1 - ru) * 0.5, Math.min(rv, 1 - rv)), chip = vnoise(u, v, 90, seed + 1) * 0.02;
    const mortar = sstep(0.07 + chip, 0.04 + chip, edge), face = vfbm(u, v, 40, 2, seed + 3);
    P.h = (1 - mortar) * (0.8 + face * 0.08) + mortar * 0.3;
    const s = (0.78 + id * 0.28) * (0.92 + face * 0.12), burnt = id > 0.86 ? 0.65 : 1;
    P.r = mixv(0.62 * s * burnt, 0.6, mortar); P.g = mixv(0.32 * s * burnt, 0.56, mortar); P.b = mixv(0.22 * s * burnt, 0.5, mortar); P.ro = mixv(0.82, 0.95, mortar);
  };
}
export function shingles() {
  return (u, v) => {
    const r = Math.floor(v * 10), rv = v * 10 - r, off = r % 2 ? 0.5 / 7 : 0, cu = (u + off) * 7, c = Math.floor(cu), ru = cu - c, id = hash(wrap(c, 7), r, 31);
    const gap = sstep(0.05, 0.015, Math.min(ru, 1 - ru)), butt = sstep(0.85, 1.0, rv);
    const grain = Math.sin((ru * 18 + vnoise(u, v, 12, 33) * 2) * 6.283) * 0.5 + 0.5, w = vfbm(u, v, 6, 3, 35);
    P.h = rv * 0.5 + grain * 0.06 - gap * 0.5 + butt * 0.05 + (id - 0.5) * 0.1;
    const s = (0.7 + id * 0.35) * (0.9 + grain * 0.1) * (1 - gap * 0.6) * (1 - (1 - rv) * 0.25);
    const grey = 0.5 + w * 0.1;
    P.r = mixv(0.42 * s, grey * s, 0.4); P.g = mixv(0.34 * s, grey * s * 0.96, 0.4); P.b = mixv(0.27 * s, grey * s * 0.9, 0.4); P.ro = 0.88;
  };
}
export function ballast(snow = 0) {
  return (u, v) => {
    const c = cells(u, v, 26, 101, 0.95), id = c.id, rr = 0.5 + id * 0.1, f = c.f1 / rr;
    // broken stone: faceted domes rather than round pebbles
    const facet = Math.abs(Math.sin(Math.atan2(c.dy, c.dx) * 3 + id * 6)) * 0.25;
    const top = f < 1 ? sat(1 - f * (0.8 + facet)) : 0;
    const grit = vnoise(u, v, 300, 103) * 0.5 + 0.5;
    P.h = top * 0.9 + grit * 0.06;
    const s = 0.5 + id * 0.35 + grit * 0.05, k = sstep(0.0, 0.2, top);
    P.r = mixv(0.22, 0.62 * s * 1.05, k); P.g = mixv(0.2, 0.58 * s, k); P.b = mixv(0.18, 0.53 * s, k); P.ro = mixv(0.95, 0.75, k);
    if (snow) { const cover = sstep(-0.1, 0.4, vfbm(u, v, 6, 3, 105)) * sstep(0.1, 0.5, 1 - top * 0.5); P.r = mixv(P.r, 0.9, cover); P.g = mixv(P.g, 0.92, cover); P.b = mixv(P.b, 0.96, cover); P.ro = mixv(P.ro, 0.7, cover); P.h += cover * 0.3; }
  };
}
export function barkFn() {
  return (u, v) => {
    const fis = Math.abs(vfbm2(u, v, 14, 2, 3, 111)), ridge = sstep(0.0, 0.18, fis);
    const fine = vnoise(u, v, 200, 113);
    P.h = ridge * 0.8 + fine * 0.05;
    const s = 0.45 + ridge * 0.3 + fine * 0.04;
    P.r = s * 0.62; P.g = s * 0.5; P.b = s * 0.4; P.ro = 0.92;
  };
}
export function toTexture(c, repeat, srgb, aniso) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
