// The dead, built properly: shaped bodies on a full skeleton (hips, spine, chest, neck, head and jaw; shoulders,
// elbows and wrists; hips, knees and ankles), rotting skin and torn clothing drawn as physically based surfaces, and the
// clothes and kit of who each one was. There are no imported character models in the game, so the skeleton is built
// here and every animation is worked out in code from it: idle, walk, run, attack, flinch, stagger, death.
import * as THREE from 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/three.module.js';
import { surface, vfbm, vfbm2, vnoise, rustIron, P as SP } from '../ptex.js';

const PI = Math.PI;
const sat = x => x < 0 ? 0 : x > 1 ? 1 : x;
const sst = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

// ---------- surfaces (drawn once, on the first zombie) ----------
function skinFn(seed) {
  return (u, v) => {
    const big = vfbm(u, v, 4, 4, seed), mid = vfbm(u, v, 16, 3, seed + 1), fine = vnoise(u, v, 180, seed + 2);
    const vein = sst(0.045, 0.0, Math.abs(vfbm(u, v, 9, 3, seed + 3))) * sst(-0.2, 0.3, big);
    const bruise = sst(0.1, 0.5, big), wound = sst(0.52, 0.6, vfbm(u, v, 6, 3, seed + 4));
    let r = 0.86 + mid * 0.08, g = 0.88 + mid * 0.08, b = 0.84 + mid * 0.06;
    r = mix(r, 0.6, bruise * 0.6); g = mix(g, 0.58, bruise * 0.5); b = mix(b, 0.66, bruise * 0.45);
    r *= 1 - vein * 0.4; g *= 1 - vein * 0.45; b *= 1 - vein * 0.25;
    r = mix(r, 0.5, wound); g = mix(g, 0.1, wound); b = mix(b, 0.08, wound);
    SP.h = 0.5 + mid * 0.05 + fine * 0.02 - wound * 0.16 + vein * 0.02;
    SP.r = r; SP.g = g; SP.b = b; SP.ro = mix(0.66, 0.28, wound) + fine * 0.05; SP.me = 0;
  };
}
// charred to the bone: black crust split by cracks that still glow, grey ash in patches
const crackAt = (u, v, seed) => sst(0.05, 0.0, Math.abs(vfbm(u, v, 7, 3, seed))) * sst(-0.3, 0.2, vfbm(u, v, 3, 2, seed + 5));
function burntFn(seed) {
  return (u, v) => {
    const mid = vfbm(u, v, 14, 3, seed + 1), fine = vnoise(u, v, 200, seed + 2), ash = sst(0.2, 0.5, vfbm(u, v, 5, 3, seed + 3)), cr = crackAt(u, v, seed);
    let c = 0.09 + mid * 0.04 + fine * 0.02; c = mix(c, 0.42, ash * 0.6);
    SP.h = 0.5 + mid * 0.08 - cr * 0.25 + fine * 0.03; SP.r = mix(c, 0.5, cr); SP.g = mix(c * 0.95, 0.12, cr); SP.b = mix(c * 0.9, 0.04, cr);
    SP.ro = mix(0.9, 0.6, cr); SP.me = 0;
  };
}
function clothFn(seed, dirt) {
  return (u, v) => {
    const wu = Math.sin(u * PI * 2 * 90) * 0.5 + 0.5, wv = Math.sin(v * PI * 2 * 90) * 0.5 + 0.5, weave = (u * 90 + v * 90) % 2 < 1 ? wu : wv;
    const stain = sst(0.15, 0.55, vfbm(u, v, 5, 4, seed)) * dirt, blood = sst(0.5, 0.58, vfbm(u, v, 7, 3, seed + 7)) * 0.8, fine = vnoise(u, v, 160, seed + 2);
    let r = 0.88 + weave * 0.08 + fine * 0.04, g = r, b = r;
    r = mix(r, 0.5, stain); g = mix(g, 0.44, stain); b = mix(b, 0.36, stain);
    r = mix(r, 0.36, blood); g = mix(g, 0.06, blood); b = mix(b, 0.05, blood);
    SP.h = 0.5 + weave * 0.05 + fine * 0.02; SP.r = r; SP.g = g; SP.b = b; SP.ro = 0.88 - blood * 0.3; SP.me = 0;
  };
}
function leatherFn(seed) {
  return (u, v) => {
    const big = vfbm(u, v, 5, 4, seed), crease = sst(0.06, 0.0, Math.abs(vfbm2(u, v, 24, 6, 3, seed + 1))), fine = vnoise(u, v, 220, seed + 2);
    const scuff = sst(0.3, 0.6, big);
    const c = 0.82 + big * 0.1 + fine * 0.04 - crease * 0.25;
    SP.h = 0.5 - crease * 0.2 + fine * 0.02; SP.r = mix(c, c * 1.15, scuff); SP.g = mix(c, c * 1.08, scuff); SP.b = c; SP.ro = mix(0.5, 0.8, scuff) + crease * 0.1; SP.me = 0;
  };
}
// a canvas whose green channel is fn(u, v) in 0..1: tears in the clothes, glowing cracks
function maskCanvas(S, fn) {
  const cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d'), im = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const k = sat(fn(x / S, y / S)) * 255, i = (y * S + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = k; im.data[i + 3] = 255; }
  g.putImageData(im, 0, 0); return cv;
}
let TEX = null;
function textures() {
  if (TEX) return TEX;
  const t = (c, srgb) => { const x = new THREE.CanvasTexture(c); x.wrapS = x.wrapT = THREE.RepeatWrapping; x.anisotropy = 4; if (srgb) x.colorSpace = THREE.SRGBColorSpace; return x; };
  const set = s => ({ map: t(s.color, true), normalMap: t(s.normal), roughnessMap: t(s.orm) });
  TEX = {
    skin: set(surface(256, skinFn(51), 6)), burnt: set(surface(256, burntFn(53), 8)),
    cloth: set(surface(256, clothFn(55, 0.8), 3)), leather: set(surface(256, leatherFn(57), 5)), metal: set(surface(256, rustIron({ seed: 59, rust: 0.5 }), 5)),
    // where the cloth is torn through: ragged holes, more of them low down and at the edges
    tear: t(maskCanvas(128, (u, v) => sst(0.5, 0.44, vfbm(u, v, 6, 4, 61) + (1 - v) * 0.1))),
    tearBad: t(maskCanvas(128, (u, v) => sst(0.32, 0.25, vfbm(u, v, 6, 4, 63) + (1 - v) * 0.15))),
    embers: t(maskCanvas(256, (u, v) => crackAt(u, v, 53))),
  };
  return TEX;
}
// materials are shared by every zombie that wears the same thing
const MATS = new Map();
export const EMBER = { k: 1 };
function mat(kind, color, o = {}) {
  const key = kind + ':' + color + ':' + JSON.stringify(o);
  if (MATS.has(key)) return MATS.get(key);
  const X = textures();
  let m;
  if (kind === 'skin') m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 1, metalness: 0 }, X.skin, o));
  else if (kind === 'burnt') { m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 1, metalness: 0, emissive: 0xff4a10, emissiveMap: X.embers, emissiveIntensity: 1.2 }, X.burnt, o)); m.userData.ember = true; }
  else if (kind === 'cloth' || kind === 'rag') m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 1, metalness: 0, alphaMap: kind === 'rag' ? X.tearBad : X.tear, alphaTest: 0.5, side: THREE.DoubleSide }, X.cloth, o));
  else if (kind === 'fabric') m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 1, metalness: 0 }, X.cloth, o));
  else if (kind === 'leather') m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 1, metalness: 0 }, X.leather, o));
  else if (kind === 'metal') m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 1, metalness: 1, metalnessMap: X.metal.roughnessMap }, X.metal, o));
  else m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.7, metalness: 0 }, o));
  MATS.set(key, m); return m;
}
export function emberMats() { const out = []; for (const m of MATS.values()) if (m.userData.ember) out.push(m); return out; }

// ---------- shapes (built once each, shared) ----------
const GEO = new Map();
const geo = (k, f) => { if (!GEO.has(k)) GEO.set(k, f()); return GEO.get(k); };
// a body of revolution from [radius, y] pairs listed bottom to top, closed at both ends
function lathe(pts, seg = 12) { return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.0008, r), y)), seg); }
// a limb hanging down from its joint: r0 at the top, r1 at the bottom, with the muscle's swell a third of the way down
function limbGeo(r0, r1, len, bulge = 0.12) {
  const pts = [[0.0008, -len]];
  for (let i = 6; i >= 0; i--) { const k = i / 6; pts.push([mix(r0, r1, k) * (1 + bulge * Math.sin(Math.min(1, k * 1.6) * PI)), -k * len]); }
  pts.push([0.0008, 0]); return lathe(pts, 10);
}
function merge(list) {
  let n = 0; const parts = list.map(g => g.index ? g.toNonIndexed() : g); for (const g of parts) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2); let o = 0;
  for (const g of parts) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) U.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3)); out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  out.computeBoundingSphere(); return out;
}
const at = (g, x, y, z, rx = 0, ry = 0, rz = 0, s = null) => { if (s) g.scale(s[0], s[1], s[2]); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g; };
// the skull: a long cranium, sunken eye sockets and cheeks, a nose half rotted away, the jaw separate below
function headGeo() {
  const g = new THREE.SphereGeometry(0.115, 18, 14), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); const d = v.clone().normalize();
    let r = 1;
    for (const sx of [-1, 1]) { const ex = d.x * sx - 0.36, ey = d.y - 0.12, ez = d.z - 0.85, e2 = ex * ex * 3 + ey * ey * 6 + ez * ez * 2; r -= 0.1 * Math.exp(-e2 * 14); }
    if (d.z > 0.75 && Math.abs(d.x) < 0.14 && d.y > -0.25 && d.y < 0.12) r += 0.09 * (1 - Math.abs(d.x) / 0.14) * sst(0.75, 0.95, d.z);
    if (d.y < 0) { r -= Math.abs(d.x) > 0.5 && d.z > 0.1 ? 0.06 * -d.y : 0; }
    if (d.y > 0.2 && d.z < -0.2) r += 0.04;
    v.copy(d).multiplyScalar(0.115 * r);
    v.x *= 0.86; v.y *= 1.08; v.z *= d.y < -0.2 ? 0.92 : 1.02;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals(); return g;
}
function handGeo(claw) {
  const parts = [at(new THREE.BoxGeometry(0.075, 0.085, 0.028), 0, -0.045, 0)];
  for (let i = 0; i < 4; i++) {
    const x = -0.027 + i * 0.018, l = i === 0 || i === 3 ? 0.045 : 0.055;
    parts.push(at(new THREE.CylinderGeometry(0.0085, 0.008, l, 5), x, -0.088 - l / 2, 0));
    parts.push(at(new THREE.CylinderGeometry(0.0078, 0.004, 0.04, 5), x, -0.088 - l - 0.012, 0.016, claw ? 0.9 : 0.4));
  }
  parts.push(at(new THREE.CylinderGeometry(0.01, 0.007, 0.05, 5), -0.042, -0.04, 0.012, 0, 0, -0.7));
  return merge(parts);
}
function bootGeo(heel) {
  const parts = [at(new THREE.BoxGeometry(0.1, 0.075, 0.25), 0, -0.04, 0.055), at(new THREE.SphereGeometry(0.06, 10, 6, 0, PI * 2, 0, PI / 2), 0, -0.005, 0.15, 0, 0, 0, [0.85, 0.55, 1.2])];
  if (heel) parts.push(at(new THREE.BoxGeometry(0.07, 0.05, 0.06), 0, -0.085, -0.04));
  return merge(parts);
}
function starGeo(r) {
  const s = new THREE.Shape();
  for (let i = 0; i <= 10; i++) { const a = i / 10 * PI * 2 + PI / 2, rr = i % 2 ? r * 0.45 : r; if (i) s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  return new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: false });
}

// ---------- the body ----------
// builds: proportions and bulk. normal, thin (runners), brute (huge upper body), bloat
const BUILD = {
  normal: { w: 1, arm: 1, leg: 1, hunch: 0 },
  thin: { w: 0.86, arm: 0.85, leg: 0.9, hunch: 0 },
  brute: { w: 1.38, arm: 1.7, leg: 1.3, hunch: 0.25 },
  bloat: { w: 1.25, arm: 1.05, leg: 1.1, hunch: 0 },
};
function part(parent, g, m, tag = 'body', o = {}) {
  const x = new THREE.Mesh(g, m); x.castShadow = o.shadow !== false; x.receiveShadow = false; x.userData.zpart = tag;
  if (o.detail) x.userData.detail = true;
  if (o.p) x.position.set(o.p[0], o.p[1], o.p[2]); if (o.r) x.rotation.set(o.r[0], o.r[1], o.r[2]); if (o.s) x.scale.set(o.s[0], o.s[1], o.s[2]);
  parent.add(x); return x;
}
const grp = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

export function makeBody(T) {
  const L = T.look || [], B = BUILD[T.build || (L.includes('bloat') ? 'bloat' : 'normal')], has = k => L.includes(k);
  const burnt = has('burnt'), ice = has('ice'), human = !!T.human;
  const skinM = burnt ? mat('burnt', 0xffffff) : human ? mat('basic', T.skin, { roughness: 0.6 }) : mat('skin', T.skin, ice ? { roughness: 0.6 } : {});
  const coat = has('duster') || has('suit') || has('labcoat') || has('robe') || has('coat');
  const shirtM = mat(burnt ? 'rag' : has('tidy') || human ? 'fabric' : 'cloth', burnt ? 0x2a1c14 : T.shirt);
  const pantsM = has('overalls') ? mat('fabric', 0x3a4a6a) : mat(burnt ? 'rag' : 'fabric', T.pants);
  const bootM = mat('leather', has('spurs') || has('chaps') ? 0x5a3a22 : 0x3a2a1c);
  const g = new THREE.Group(), root = grp(g, 0, 0, 0); root.scale.setScalar(T.scale);
  const legless = has('legless');
  const hips = grp(root, 0, legless ? 0.3 : 0.95, 0);
  part(hips, geo('pelvis' + B.w, () => at(lathe([[0.0008, -0.1], [0.11, -0.1], [0.135, -0.03], [0.14, 0.04], [0.12, 0.08], [0.0008, 0.08]]), 0, 0, 0, 0, 0, 0, [B.w, 1, 0.7 * B.w])), pantsM);
  const spine = grp(hips, 0, 0.06, 0), chest = grp(spine, 0, 0.3, 0);
  const torsoG = k => geo('torso' + B.w + k, () => at(lathe([[0.0008, -0.32], [0.13, -0.32], [0.128, -0.2], [0.148, -0.05], [0.17, 0.08], [0.178, 0.17], [0.152, 0.23], [0.07, 0.26], [0.0008, 0.27]], 14), 0, 0, 0, 0, 0, 0, [B.w * k, 1, 0.62 * B.w * k]));
  part(chest, torsoG(1), skinM);
  if (!burnt || has('rags')) part(chest, torsoG(1.045), shirtM, 'body', { shadow: false });
  if (has('bloat')) part(chest, geo('belly', () => new THREE.SphereGeometry(0.2, 14, 10)), mat('skin', 0x8a9a5a), 'body', { p: [0, -0.15, 0.1], s: [1.1, 0.95, 1] });
  if (has('vest')) part(chest, geo('vest' + B.w, () => at(lathe([[0.0008, -0.22], [0.15, -0.22], [0.165, -0.05], [0.186, 0.1], [0.19, 0.17], [0.16, 0.22], [0.0008, 0.22]], 14), 0, 0, 0, 0, 0, 0, [B.w * 1.06, 1, 0.64 * B.w * 1.06])), mat('leather', has('sheriffHat') ? 0x2a1e16 : 0x4a3222), 'body', { shadow: false });
  if (has('overalls')) { part(chest, geo('bib', () => new THREE.BoxGeometry(0.2, 0.24, 0.01)), pantsM, 'body', { p: [0, -0.1, 0.112 * B.w], shadow: false }); for (const sx of [-1, 1]) part(chest, geo('strap', () => new THREE.BoxGeometry(0.03, 0.34, 0.01)), pantsM, 'body', { p: [sx * 0.07, 0.06, 0.11 * B.w], r: [-0.25, 0, 0], shadow: false, detail: true }); }
  if (has('suspenders')) for (const sx of [-1, 1]) part(chest, geo('susp', () => new THREE.BoxGeometry(0.02, 0.5, 0.01)), mat('leather', 0x3a2618), 'body', { p: [sx * 0.07, -0.04, 0.113 * B.w], shadow: false, detail: true });
  if (has('badge')) part(chest, geo('star', () => starGeo(0.032)), mat('basic', 0xd8b048, { metalness: 1, roughness: 0.3 }), 'body', { p: [-0.08, 0.08, 0.117 * B.w * 1.06], shadow: false, detail: true });
  if (has('armour')) {
    const plate = mat('metal', 0xb0aaa0);
    part(chest, geo('cuirass' + B.w, () => at(lathe([[0.0008, -0.2], [0.16, -0.2], [0.168, -0.05], [0.19, 0.08], [0.194, 0.16], [0.165, 0.23], [0.0008, 0.235]], 14), 0, 0, 0, 0, 0, 0, [B.w * 1.08, 1, 0.68 * B.w * 1.08])), plate, 'armour');
    part(chest, geo('fauld', () => new THREE.CylinderGeometry(0.17, 0.2, 0.14, 12, 1, true)), plate, 'armour', { p: [0, -0.28, 0], s: [B.w, 1, 0.7 * B.w] });
  }
  if (has('spikes')) for (let i = 0; i < 5; i++) part(chest, geo('spike', () => new THREE.ConeGeometry(0.035, 0.2, 5)), mat('basic', ice ? 0xcfe8f4 : 0xd8d0b8, { roughness: 0.4 }), 'body', { p: [(i - 2) * 0.07, 0.05 + (i % 2) * 0.06, -0.1 * B.w], r: [-1.0, 0, 0], detail: true });
  if (ice) for (let i = 0; i < 6; i++) part(chest, geo('icicle', () => new THREE.ConeGeometry(0.025, 0.16, 5)), mat('basic', 0xd8eef8, { roughness: 0.1, transparent: true, opacity: 0.8 }), 'body', { p: [(i % 3 - 1) * 0.1, 0.17 - (i > 2 ? 0.25 : 0), (i > 2 ? 0.1 : -0.1) * B.w], r: [PI, 0, 0], detail: true, shadow: false });
  if (has('moss')) part(chest, geo('moss', () => new THREE.SphereGeometry(0.1, 8, 6, 0, PI * 2, 0, PI / 2)), mat('basic', 0x3e5a2a, { roughness: 1 }), 'body', { p: [-0.06, 0.15, 0.04], s: [1.3, 0.4, 1.2], detail: true });
  if (has('bones')) for (let i = 0; i < 4; i++) part(chest, geo('rib', () => new THREE.TorusGeometry(0.11, 0.008, 4, 12, PI)), mat('basic', 0xe8e0cc), 'body', { p: [0, -0.05 + i * 0.06, 0.04], r: [0, 0, 0], s: [1, 1, 0.6], detail: true });
  if (has('tar')) for (let i = 0; i < 5; i++) part(chest, geo('tarblob', () => new THREE.SphereGeometry(0.07, 8, 6)), mat('basic', 0x0a080a, { roughness: 0.05, metalness: 0.4 }), 'body', { p: [(i - 2) * 0.07, -0.15 + (i % 3) * 0.12, 0.1], s: [1, 1.4, 0.6] });
  if (has('stone')) part(chest, geo('stoneback', () => new THREE.DodecahedronGeometry(0.22, 0)), mat('basic', 0x8a8478, { roughness: 1, flatShading: true }), 'body', { p: [0, 0.12, -0.08], s: [1.4, 0.8, 0.9] });
  if (has('spark')) g.userData.spark = part(chest, geo('spark', () => new THREE.SphereGeometry(0.04, 8, 6)), mat('basic', 0x9ad8ff, { emissive: 0x6ad8ff, emissiveIntensity: 2 }), 'body', { p: [0, 0.1, 0.12], shadow: false });
  if (has('chain')) part(chest, geo('chain', () => new THREE.TorusGeometry(0.06, 0.004, 4, 12, PI)), mat('basic', 0xe0b040, { metalness: 1, roughness: 0.3 }), 'body', { p: [0.06, -0.12, 0.11], r: [0, 0, PI], detail: true });
  if (has('labcoat') || has('suit') || has('robe') || has('duster') || has('coat')) {
    const cm = has('labcoat') ? mat('cloth', 0xe8e8e0) : has('suit') ? mat('fabric', 0x101014) : has('robe') ? mat('cloth', 0x2a2428) : mat('cloth', has('sheriffHat') ? 0x3a2a1e : 0x5a4632);
    part(chest, torsoG(1.08), cm, 'body', { shadow: false });
    // the skirts of a long coat, hanging from the waist, ragged at the hem
    part(hips, geo('skirt' + B.w + (has('robe') ? 'r' : ''), () => at(new THREE.CylinderGeometry(0.15, has('robe') ? 0.3 : 0.25, has('robe') ? 0.85 : 0.62, 14, 1, true), 0, has('robe') ? -0.42 : -0.33, 0, 0, 0, 0, [B.w, 1, 0.78 * B.w])), cm, 'body', { shadow: false });
  }
  if (has('belt') || has('holster') || has('gun')) {
    part(hips, geo('belt' + B.w, () => at(new THREE.TorusGeometry(0.14, 0.018, 4, 16), 0, 0.03, 0, PI / 2, 0, 0, [B.w, B.w * 0.72, 1])), mat('leather', 0x2a1a10), 'body', { shadow: false });
    if (has('holster') || has('gun')) { part(hips, geo('holster', () => new THREE.BoxGeometry(0.05, 0.14, 0.07)), mat('leather', 0x4a2e1a), 'body', { p: [0.15 * B.w, -0.06, 0.02], r: [0, 0, 0.12], detail: true }); part(hips, geo('grip', () => new THREE.BoxGeometry(0.025, 0.06, 0.03)), mat('basic', 0x6a4a2a), 'body', { p: [0.155 * B.w, 0.03, 0.03], r: [0.3, 0, 0], detail: true }); }
  }

  // neck, head, jaw, eyes
  const neck = grp(chest, 0, 0.24, 0.01);
  part(neck, geo('neck', () => at(limbGeo(0.05, 0.045, 0.1, 0), 0, 0.1, 0)), skinM, 'head');
  const head = grp(neck, 0, 0.16, 0.015);
  part(head, geo('head', headGeo), skinM, 'head');
  const jaw = grp(head, 0, -0.05, -0.02);
  part(jaw, geo('jaw', () => at(new THREE.CylinderGeometry(0.065, 0.045, 0.045, 10), 0, -0.03, 0.06, 0, 0, 0, [1, 1, 1.1])), skinM, 'head');
  part(jaw, geo('teethLo', () => new THREE.BoxGeometry(0.075, 0.018, 0.012)), mat('basic', 0xc8b890, { roughness: 0.4 }), 'head', { p: [0, -0.005, 0.105], detail: true, shadow: false });
  part(head, geo('teethUp', () => new THREE.BoxGeometry(0.075, 0.016, 0.012)), mat('basic', 0xc8b890, { roughness: 0.4 }), 'head', { p: [0, -0.052, 0.098], detail: true, shadow: false });
  const eyeM = human ? mat('basic', 0x1a1008, { roughness: 0.2 }) : ice || has('spark') ? mat('basic', 0x9ae4ff, { emissive: 0x6ac8ff, emissiveIntensity: 2.2 }) : burnt ? mat('basic', 0xff7020, { emissive: 0xff5010, emissiveIntensity: 2.5 }) : mat('basic', 0xd8d8b0, { emissive: 0xd0c060, emissiveIntensity: 0.9, roughness: 0.2 });
  part(head, geo('eyes', () => merge([at(new THREE.SphereGeometry(0.016, 8, 6), -0.036, 0.012, 0.085), at(new THREE.SphereGeometry(0.016, 8, 6), 0.036, 0.012, 0.085)])), eyeM, 'head', { detail: true, shadow: false });
  if (has('hair')) part(head, geo('hair', () => at(new THREE.SphereGeometry(0.122, 14, 8, 0, PI * 2, 0, PI * 0.45), 0, 0.012, -0.01, -0.25, 0, 0, [0.9, 1.05, 1.06])), mat('cloth', 0x2a2018, { roughness: 1 }), 'head', { shadow: false });
  // hats and helmets: hats are 'gear' (shots pass through the brim), helmets turn blows
  const hatM = mat('leather', has('sheriffHat') ? 0x1e1814 : 0x6a4a2c, { side: THREE.DoubleSide });
  if (has('hat') || has('sheriffHat')) part(head, geo('hat' + (has('sheriffHat') ? 's' : 'c'), () => {
    const tall = has('sheriffHat') ? 0.15 : 0.11, curl = has('sheriffHat') ? 0.01 : 0.035;
    return at(lathe([[0.215, 0.01 + curl], [0.19, 0.003], [0.13, 0], [0.1, 0.005], [0.098, tall * 0.6], [0.088, tall], [0.03, tall - 0.01], [0.0008, tall - 0.02]], 18), 0, 0.075, 0, -0.12, 0, 0, [1, 1, 1.1]);
  }), hatM, 'gear');
  if (has('tophat')) part(head, geo('tophat', () => at(lathe([[0.17, 0.0], [0.09, 0.0], [0.09, 0.22], [0.0008, 0.22]], 16), 0, 0.075, 0)), mat('fabric', 0x101012, { side: THREE.DoubleSide }), 'gear');
  if (has('helmet')) {
    part(head, geo('minerHelm', () => at(lathe([[0.17, -0.01], [0.16, 0.0], [0.125, 0.0], [0.125, 0.04], [0.11, 0.1], [0.06, 0.135], [0.0008, 0.14]], 16), 0, 0.055, 0)), mat('leather', 0x5a4a30, { roughness: 0.5, side: THREE.DoubleSide }), 'armour');
    part(head, geo('lamp', () => at(new THREE.CylinderGeometry(0.025, 0.03, 0.04, 10), 0, 0.12, 0.12, PI / 2, 0, 0)), mat('basic', 0xffe0a0, { emissive: 0xffc060, emissiveIntensity: 2 }), 'head', { detail: true, shadow: false });
  }
  if (has('armour')) {
    // a morion: a tall comb, a brim swept up into points front and back
    part(head, geo('morion', () => at(lathe([[0.2, 0.035], [0.17, 0.0], [0.125, 0.005], [0.122, 0.07], [0.09, 0.14], [0.0008, 0.16]], 16), 0, 0.06, 0, 0, 0, 0, [0.9, 1, 1.25])), mat('metal', 0xb8b2a8, { side: THREE.DoubleSide }), 'armour');
    part(head, geo('comb', () => new THREE.CylinderGeometry(0.08, 0.08, 0.006, 16, 1, false, 0, PI)), mat('metal', 0xb8b2a8), 'armour', { p: [0, 0.2, 0], r: [0, PI / 2, PI / 2], detail: true });
  }
  if (has('bandana')) part(neck, geo('bandana', () => at(new THREE.ConeGeometry(0.09, 0.12, 10, 1, true), 0, 0.03, 0.03, PI, 0, 0, [1, 1, 1])), mat('cloth', 0x8a2a20), 'body', { shadow: false });
  if (has('scarf')) part(neck, geo('scarf', () => at(new THREE.TorusGeometry(0.06, 0.028, 6, 12), 0, 0.03, 0, PI / 2, 0, 0)), mat('fabric', 0x7a3a3a), 'body', { shadow: false });
  if (has('goggles')) part(head, geo('goggles', () => merge([at(new THREE.CylinderGeometry(0.024, 0.024, 0.02, 10), -0.036, 0.015, 0.09, PI / 2, 0, 0), at(new THREE.CylinderGeometry(0.024, 0.024, 0.02, 10), 0.036, 0.015, 0.09, PI / 2, 0, 0)])), mat('metal', 0x5a5650), 'head', { detail: true });
  if (has('visor')) part(head, geo('visor', () => new THREE.CylinderGeometry(0.13, 0.13, 0.008, 14, 1, false, -PI / 2, PI)), mat('basic', 0x3a7a4a, { transparent: true, opacity: 0.7 }), 'gear', { p: [0, 0.07, 0.02], detail: true });
  if (ice) for (let i = 0; i < 3; i++) part(head, geo('icicle', () => new THREE.ConeGeometry(0.025, 0.16, 5)), mat('basic', 0xd8eef8, { roughness: 0.1, transparent: true, opacity: 0.8 }), 'head', { p: [(i - 1) * 0.05, -0.08, 0.06], r: [PI, 0, 0], s: [0.6, 0.5, 0.6], detail: true, shadow: false });

  // arms: shoulder, elbow, wrist
  const arms = [], legs = [];
  const sleeveM = coat ? (has('suit') ? mat('fabric', 0x101014) : has('labcoat') ? mat('cloth', 0xe8e8e0) : mat('cloth', has('sheriffHat') ? 0x3a2a1e : 0x5a4632)) : shirtM;
  for (const sx of [-1, 1]) {
    const sh = grp(chest, sx * 0.19 * B.w, 0.17, 0);
    part(sh, geo('uarm' + B.arm, () => limbGeo(0.052 * B.arm, 0.042 * B.arm, 0.29)), sleeveM);
    if (has('armour')) part(sh, geo('pauldron' + B.arm, () => new THREE.SphereGeometry(0.075 * B.arm, 10, 6, 0, PI * 2, 0, PI / 2)), mat('metal', 0xb0aaa0), 'armour', { p: [sx * 0.015, 0.0, 0], r: [0, 0, -sx * 0.5] });
    if (ice) part(sh, geo('icicle', () => new THREE.ConeGeometry(0.025, 0.16, 5)), mat('basic', 0xd8eef8, { roughness: 0.1, transparent: true, opacity: 0.8 }), 'body', { p: [0, -0.2, -0.05], r: [PI, 0, 0], detail: true, shadow: false });
    const el = grp(sh, 0, -0.29, 0);
    part(el, geo('farm' + B.arm, () => limbGeo(0.043 * B.arm, 0.032 * B.arm, 0.26)), coat || has('armour') ? sleeveM : skinM);
    const wr = grp(el, 0, -0.26, 0);
    part(wr, geo('hand' + B.arm + (T.claws ? 'c' : ''), () => { const h = handGeo(!human); if (B.arm !== 1) h.scale(B.arm * 0.85, B.arm * 0.85, B.arm * 0.85); return h; }), has('armour') ? mat('leather', 0x3a2a1c) : skinM);
    arms.push({ sh, el, wr });
    // legs: hip, knee, ankle. The crawler's end in torn stumps at the knee
    const hp = grp(hips, sx * 0.095 * B.w, -0.04, 0);
    const thighM = has('chaps') ? mat('leather', 0x6a4428) : pantsM;
    part(hp, geo('thigh' + B.leg, () => limbGeo(0.078 * B.leg, 0.054 * B.leg, 0.45, 0.08)), thighM);
    const kn = grp(hp, 0, -0.45, 0);
    let an = null;
    if (legless) part(kn, geo('stump', () => new THREE.SphereGeometry(0.05, 8, 6)), mat('skin', 0x6a1a12), 'body', { s: [1, 0.6, 1] });
    else {
      part(kn, geo('shin' + B.leg, () => limbGeo(0.054 * B.leg, 0.04 * B.leg, 0.43, 0.06)), has('chaps') ? thighM : pantsM);
      an = grp(kn, 0, -0.43, 0);
      part(an, geo('boot' + (has('spurs') || has('chaps') ? 'h' : ''), () => bootGeo(has('spurs') || has('chaps'))), bootM, 'body', { p: [0, 0, 0] });
      if (has('spurs')) part(an, geo('spur', () => new THREE.TorusGeometry(0.018, 0.003, 4, 10)), mat('metal', 0x9a9690), 'body', { p: [0, -0.04, -0.09], r: [0, PI / 2, 0], detail: true, shadow: false });
    }
    legs.push({ hp, kn, an });
  }
  // what they carry in the right hand
  const rh = arms[1].wr;
  if (has('pick')) { part(rh, geo('haft', () => new THREE.CylinderGeometry(0.014, 0.014, 0.75, 6)), mat('leather', 0x6a4a2a), 'gear', { p: [0, -0.06, 0.2], r: [PI / 2, 0, 0] }); part(rh, geo('pickhead', () => at(new THREE.CylinderGeometry(0.01, 0.018, 0.42, 6), 0, 0, 0, 0, 0, PI / 2)), mat('metal', 0x6a6660), 'gear', { p: [0, -0.06, 0.56] }); }
  if (has('axe')) { part(rh, geo('haft', () => new THREE.CylinderGeometry(0.014, 0.014, 0.75, 6)), mat('leather', 0x6a4a2a), 'gear', { p: [0, -0.06, 0.2], r: [PI / 2, 0, 0] }); part(rh, geo('axehead', () => new THREE.BoxGeometry(0.02, 0.16, 0.12)), mat('metal', 0x8a8680, { roughness: 0.4 }), 'gear', { p: [0, 0.0, 0.54] }); }
  if (has('gun') && human) part(rh, geo('revolver', () => merge([new THREE.BoxGeometry(0.03, 0.05, 0.08), at(new THREE.CylinderGeometry(0.009, 0.009, 0.16, 6), 0, 0.012, 0.11, PI / 2, 0, 0)])), mat('metal', 0x2a2826, { roughness: 0.4 }), 'gear', { p: [0, -0.1, 0.04] });
  if (has('weed')) for (const a of arms) part(a.el, geo('weed', () => new THREE.BoxGeometry(0.03, 0.4, 0.01)), mat('basic', 0x4a6a3a), 'body', { p: [0, -0.18, 0.05], detail: true, shadow: false });

  const detail = []; g.traverse(m => { if (m.isMesh && m.userData.detail) detail.push(m); });
  g.userData.rig = { root, hips, spine, chest, neck, head, jaw, arms, legs, detail, legless, hunch: B.hunch, hipY: hips.position.y };
  return g;
}

// ---------- animation ----------
// every frame the joints are posed from the zombie's state: its gait blended between standing, walking and running,
// with attacks, flinches, staggers and alarm laid over the top. Gaits are what make each kind move differently
const GAIT = {
  shamble: { lean: 0.12, stride: 0.5, armUp: 1.2, bob: 0.03, freq: 1.0, drag: 0.35, sway: 0.08 },
  sprint: { lean: 0.5, stride: 0.95, armUp: 0.6, bob: 0.05, freq: 1.25, drag: 0, sway: 0.04, pump: 1 },
  lumber: { lean: 0.3, stride: 0.45, armUp: 0.3, bob: 0.06, freq: 0.75, drag: 0.1, sway: 0.16, wide: 0.12 },
  march: { lean: 0.02, stride: 0.55, armUp: 0.2, bob: 0.02, freq: 0.95, drag: 0, sway: 0.03, stiff: 1 },
  stiff: { lean: 0.08, stride: 0.35, armUp: 1.0, bob: 0.02, freq: 0.8, drag: 0.5, sway: 0.05, jerk: 1 },
  flail: { lean: 0.2, stride: 0.6, armUp: 0.8, bob: 0.04, freq: 1.15, drag: 0.15, sway: 0.1, flail: 1 },
  swagger: { lean: 0.06, stride: 0.55, armUp: 0.9, bob: 0.03, freq: 0.95, drag: 0.2, sway: 0.12, bow: 0.12 },
  stride: { lean: 0.05, stride: 0.65, armUp: 0.7, bob: 0.025, freq: 0.9, drag: 0, sway: 0.05 },
  hunch: { lean: 0.42, stride: 0.45, armUp: 0.7, bob: 0.03, freq: 0.95, drag: 0.25, sway: 0.08 },
  crawl: { crawl: 1, freq: 1.1 },
};
export function gaitOf(T) { return GAIT[T.gait] || GAIT.shamble; }
const sn = Math.sin;
// e: { rig, T, ph, t, state, wind, windT, flinch, flinchDir, stagger, alert, hidden }, sp: ground speed
export function pose(e, dt, sp, rising) {
  const r = e.rig, T = e.T, G = gaitOf(T), A = r.arms, Lg = r.legs;
  const run = Math.min(1, sp / Math.max(1, T.run)), walk = Math.min(1, sp / Math.max(0.3, T.walk));
  e.ph = (e.ph || 0) + dt * (2.0 + sp * 2.0) * G.freq;
  let ph = e.ph;
  if (G.jerk) ph = Math.floor(ph * 3) / 3 + sst(0, 1, (ph * 3) % 1) / 3; // frozen joints move in fits
  const s = sn(ph), c = Math.cos(ph), t = e.t, chase = e.state === 'chase';
  const twitch = G.flail ? sn(t * 23) * sn(t * 7.3) : 0;
  // breathing and swaying while standing
  const idle = 1 - Math.min(1, walk);
  const breathe = sn(t * 1.6) * 0.03 * idle;

  if (G.crawl) {
    // dragging itself along on its arms: the body low and face down, one arm reaching while the other pulls
    r.root.rotation.x = 1.3; r.hips.position.y = r.hipY - 0.12 + Math.abs(s) * 0.03;
    r.spine.rotation.set(-0.15 + s * 0.05, s * 0.12, 0); r.chest.rotation.set(-0.15, s * 0.08, 0);
    r.neck.rotation.set(-0.9 + sn(t * 1.3) * 0.1, sn(t * 0.7) * 0.25, 0);
    const k = Math.min(1, walk + 0.2);
    A[0].sh.rotation.set(-2.6 + s * 0.6 * k, 0, -0.25); A[0].el.rotation.set(-0.6 - Math.max(0, -s) * 0.9 * k, 0, 0);
    A[1].sh.rotation.set(-2.6 - s * 0.6 * k, 0, 0.25); A[1].el.rotation.set(-0.6 - Math.max(0, s) * 0.9 * k, 0, 0);
    for (const a of A) a.wr.rotation.set(-0.5, 0, 0);
    for (const l of Lg) { l.hp.rotation.set(0.1 + sn(ph * 0.5) * 0.08, 0, 0); l.kn.rotation.set(0.2, 0, 0); }
    if (e.windT > 0) { const w = attackCurve(e); r.spine.rotation.x -= w * 0.5; A[0].sh.rotation.x = -3.0 * w + A[0].sh.rotation.x * (1 - w); A[1].sh.rotation.x = -3.0 * w + A[1].sh.rotation.x * (1 - w); r.jaw.rotation.x = w * 0.6; }
    else r.jaw.rotation.x = 0.25 + sn(t * 3) * 0.1;
    if (e.flinch > 0) r.chest.rotation.x += e.flinch * 2;
    return;
  }
  // legs: hip swing, knee bend on the forward swing, the foot kept roughly level
  const stride = (G.stride + run * 0.45) * walk, bow = G.bow || 0, wide = G.wide || 0;
  for (let i = 0; i < 2; i++) {
    const sg = i ? -1 : 1, ls = sn(ph + (i ? PI : 0)), lc = Math.cos(ph + (i ? PI : 0));
    const drag = i === 1 ? G.drag : 0; // one bad leg that drags behind
    const sw = ls * stride * (1 - drag * 0.6);
    const knee = Math.max(0, lc) * (0.5 + run * 0.9) * walk * (G.stiff ? 0.35 : 1) * (1 - drag * 0.7) + idle * 0.06;
    Lg[i].hp.rotation.set(-sw, 0, sg * (bow + wide) * 0.8 + sg * 0.02);
    Lg[i].kn.rotation.set(knee, 0, -sg * bow * 0.6);
    if (Lg[i].an) Lg[i].an.rotation.set(sw * 0.5 - knee * 0.4 + drag * 0.3 * walk, 0, 0);
  }
  const hunch = r.hunch + G.lean * (0.6 + run * 0.6) + (chase ? 0.06 : 0);
  r.hips.position.y = r.hipY - Math.abs(c) * G.bob * walk - run * 0.05 - (e.hidden ? 0.42 : 0);
  r.root.rotation.x = 0; r.root.position.z = 0;
  r.spine.rotation.set(hunch * 0.55 + breathe, sn(ph) * 0.08 * walk, sn(ph * 0.5 + 0.3) * G.sway * 0.5 + twitch * 0.08);
  r.chest.rotation.set(hunch * 0.45 - breathe * 0.5, -sn(ph) * 0.1 * walk, sn(ph * 0.5) * G.sway * 0.4);
  // the head lolls and twitches; on alert it snaps round to look
  const look = e.lookYaw || 0;
  r.neck.rotation.set(-hunch * 0.6 + sn(t * 1.3) * 0.07 + (e.hidden ? 0.4 : 0), look * 0.6 + sn(t * 0.6) * 0.15 * idle, sn(t * 0.7) * 0.22 + twitch * 0.25);
  r.head.rotation.set(sn(t * 2.1) * 0.04, look * 0.4, sn(t * 1.1 + 2) * 0.1);
  r.jaw.rotation.x = 0.12 + Math.max(0, sn(t * 2.7)) * 0.18 + (chase ? 0.15 : 0);
  // arms: reaching out when hunting, hanging and swinging otherwise; runners pump them
  const reach = chase ? G.armUp : G.armUp * 0.35;
  for (let i = 0; i < 2; i++) {
    const sg = i ? -1 : 1, as = sn(ph + (i ? 0 : PI));
    let sx = -reach - as * (G.pump ? 0.9 * run : 0.2) * walk + sn(t * 0.9 + i) * 0.05, el = -(G.pump ? 1.3 * run + 0.3 : 0.25 + reach * 0.2);
    if (G.flail) { sx += sn(t * (5 + i * 2.3)) * 0.6; el -= Math.abs(sn(t * 4 + i)) * 0.6; }
    if (G.stiff) el = -0.1;
    A[i].sh.rotation.set(sx, 0, sg * (0.1 + wide + (G.pump ? 0.05 : 0.12 * reach)));
    A[i].el.rotation.set(el, 0, 0);
    A[i].wr.rotation.set(-0.2 + (chase ? -0.3 : 0), 0, 0);
  }
  // a cowboy keeps his gun hand by the holster; a miner carries his pick on the shoulder while he walks
  if (T.gait === 'swagger' && !chase) { A[1].sh.rotation.set(0.1 + sn(ph) * 0.15 * walk, 0, -0.2); A[1].el.rotation.set(-0.5, 0, 0); }
  if ((T.attack === 'swing') && !chase && !e.windT) { A[1].sh.rotation.set(-2.4, 0, -0.3); A[1].el.rotation.set(-1.6, 0, 0); }
  // attacks: wind-up then the blow, each kind its own
  if (e.windT > 0) {
    const w = attackCurve(e), k = e.windK || 0;
    if (T.attack === 'slam') {
      // both fists high overhead, then down together
      const up = k < 0.7 ? k / 0.7 : 1 - (k - 0.7) / 0.3;
      for (const a of A) { a.sh.rotation.x = mix(a.sh.rotation.x, -3.0 * up + (1 - up) * -0.6, w); a.el.rotation.x = mix(a.el.rotation.x, -0.4, w); }
      r.spine.rotation.x += (k > 0.7 ? 0.6 : -0.25) * w;
    } else if (T.attack === 'swing' || T.attack === 'punch') {
      const up = k < 0.6 ? k / 0.6 : 1 - (k - 0.6) / 0.4;
      A[1].sh.rotation.set(mix(A[1].sh.rotation.x, T.attack === 'punch' ? -1.4 - up * 0.2 : -2.9 * up - 0.6 * (1 - up), w), 0, T.attack === 'punch' ? -0.5 * up : -0.2);
      A[1].el.rotation.x = mix(A[1].el.rotation.x, T.attack === 'punch' ? -1.8 * up : -0.6, w);
      r.chest.rotation.y += (T.attack === 'punch' ? 0.5 * up - 0.3 * (1 - up) : -0.2) * w;
      r.spine.rotation.x += (k > 0.6 ? 0.3 : -0.1) * w;
    } else if (T.attack === 'lunge') {
      r.spine.rotation.x += 0.4 * w; r.root.position.z = 0.35 * w * (k > 0.5 ? 1 : k * 2);
      for (const a of A) { a.sh.rotation.x = mix(a.sh.rotation.x, -1.8, w); a.el.rotation.x = -0.2; }
      r.jaw.rotation.x = 0.55 * w;
    } else {
      // claw and bite: both hands rake down, the head darts in with the jaw wide
      const up = k < 0.55 ? k / 0.55 : 1 - (k - 0.55) / 0.45;
      A[0].sh.rotation.x = mix(A[0].sh.rotation.x, -2.4 * up - 0.9 * (1 - up), w); A[1].sh.rotation.x = mix(A[1].sh.rotation.x, -2.1 * up - 1.1 * (1 - up), w);
      r.spine.rotation.x += (k > 0.55 ? 0.3 : -0.1) * w; r.neck.rotation.x += 0.3 * w * (k > 0.55 ? 1 : 0); r.jaw.rotation.x = mix(r.jaw.rotation.x, 0.6, w);
    }
  }
  // getting hit: thrown back from the blow; staggering: reeling, arms out for balance, legs buckling
  if (e.flinch > 0) { const f = e.flinch / 0.22; r.spine.rotation.x -= 0.45 * f; r.neck.rotation.x -= 0.5 * f; r.chest.rotation.z += (e.flinchSide || 0) * 0.3 * f; }
  if (e.stagger > 0) {
    const k = Math.min(1, e.stagger / 0.3), w = sn(t * 9);
    r.spine.rotation.x -= 0.35 * k; r.spine.rotation.z += w * 0.2 * k;
    for (let i = 0; i < 2; i++) { A[i].sh.rotation.set(-0.6 + w * 0.3, 0, (i ? -1 : 1) * 0.9 * k); A[i].el.rotation.x = -0.4; }
    Lg[0].kn.rotation.x += 0.35 * k; r.hips.position.y -= 0.08 * k;
  }
  if (rising) { for (const a of A) { a.sh.rotation.x = -2.7 + sn(t * 6) * 0.25; a.el.rotation.x = -0.3; } r.spine.rotation.x = 0.3; }
}
// 0..1 how far into the strike the zombie is, eased so the blow snaps through
function attackCurve(e) { const k = e.windK || 0; return k < 0.1 ? k / 0.1 : 1; }

// the fall: four ways to die. fwd/back topple from the hips, buckle drops to the knees first, crawlers sprawl flat
export function deathPose(e, t, kind) {
  const r = e.rig, A = r.arms, Lg = r.legs, f = sst(0, 0.9, t), g = sst(0, 0.5, t);
  if (r.legless || kind === 'sprawl') {
    r.root.rotation.x = mix(1.3, 1.52, f); r.hips.position.y = mix(r.hipY - 0.12, 0.14, f);
    for (const a of A) { a.sh.rotation.x = mix(a.sh.rotation.x, -2.9, f); a.el.rotation.x = mix(a.el.rotation.x, 0, f); }
    r.neck.rotation.x = mix(r.neck.rotation.x, -0.2, f); r.jaw.rotation.x = 0.5;
    return;
  }
  if (kind === 'buckle') {
    // knees go first, then the body pitches forward onto the ground
    const k1 = sst(0, 0.45, t), k2 = sst(0.35, 1.1, t);
    for (const l of Lg) { l.hp.rotation.x = mix(0, -1.4, k1) * (1 - k2) + -0.2 * k2; l.kn.rotation.x = mix(0, 2.2, k1) * (1 - k2 * 0.7); }
    r.hips.position.y = mix(r.hipY, 0.42, k1) - k2 * 0.25;
    r.root.rotation.x = 1.45 * k2; r.root.position.y = 0;
    r.spine.rotation.x = mix(0.3, 0.05, k2); r.neck.rotation.x = mix(0.5, -0.3, k2);
    for (const a of A) { a.sh.rotation.x = mix(-0.2, -2.6, k2); a.el.rotation.x = -0.3; }
    r.jaw.rotation.x = 0.55; return;
  }
  const dir = kind === 'back' ? -1 : 1;
  r.root.rotation.x = dir * f * f * PI / 2 * 0.96; r.root.position.y = f * 0.12;
  r.spine.rotation.x = mix(r.spine.rotation.x, dir * -0.15, g); r.neck.rotation.x = mix(r.neck.rotation.x, dir * -0.4, g);
  for (let i = 0; i < 2; i++) {
    A[i].sh.rotation.x = mix(A[i].sh.rotation.x, dir > 0 ? -2.6 : -0.3, g); A[i].sh.rotation.z = (i ? -1 : 1) * mix(0.1, 0.9, g); A[i].el.rotation.x = mix(A[i].el.rotation.x, -0.5, g);
    Lg[i].hp.rotation.x = mix(Lg[i].hp.rotation.x, i ? 0.2 * dir : -0.3 * dir, g); Lg[i].kn.rotation.x = mix(Lg[i].kn.rotation.x, i ? 0.6 : 0.1, g);
  }
  r.jaw.rotation.x = 0.5 * g;
}
