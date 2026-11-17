// Procedural canvas textures and shared materials
import * as THREE from 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/three.module.js';
import { makeNoise, fbm, mulberry32, clamp } from './noise.js';
import { surface, boards, rustIron, ashlar, bricks, shingles, ballast, barkFn } from './ptex.js';
import { stoneMaterial, plantMaterial, weathered } from './terrainmat.js';

const tn = makeNoise(991), tn2 = makeNoise(417);
let ANISO = 4;
export function setAniso(a) { ANISO = a; }

function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function toTex(c, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.anisotropy = ANISO; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function pixels(size, fn) {
  const c = canvas(size), ctx = c.getContext('2d'), img = ctx.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const o = (y * size + x) * 4, [r, g, b] = fn(x / size, y / size, x, y);
    d[o] = clamp(r, 0, 255); d[o + 1] = clamp(g, 0, 255); d[o + 2] = clamp(b, 0, 255); d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); return c;
}
// tileable noise via torus mapping
function tnoise(n, u, v, f, oct = 3) {
  const a = u * Math.PI * 2, b = v * Math.PI * 2, R = f / (Math.PI * 2);
  // 4D torus isn't available in 2D simplex; blend 2 offset samples for approximate tiling
  const x = Math.cos(a) * R, y = Math.sin(a) * R, z = Math.cos(b) * R, w = Math.sin(b) * R;
  return fbm(n, x + z * 0.7 + 11, y + w * 0.7 - 7, oct) * 0.6 + fbm(n, z - x * 0.4 + 3, w - y * 0.4 + 5, oct) * 0.4;
}

function planks(base, opts = {}) {
  const S = 512, boards = opts.boards || 6, rnd = mulberry32(opts.seed || 1);
  const shades = Array.from({ length: boards }, () => 0.82 + rnd() * 0.3);
  const peel = opts.peel || 0;
  return pixels(S, (u, v, x, y) => {
    const bi = Math.floor(u * boards), bu = u * boards - bi;
    const grain = Math.sin((u * boards * 7 + tnoise(tn, u, v, 3, 2) * 3) * 6.28 + v * 4) * 0.5 + 0.5;
    const fine = tnoise(tn2, u * 1, v, 40, 2);
    let s = shades[bi] * (0.86 + grain * 0.12 + fine * 0.18);
    const gap = bu < 0.035 || bu > 0.975 ? 0.35 : 1;
    const nail = (Math.abs(bu - 0.5) < 0.03 && (Math.abs(v * 4 % 1 - 0.1) < 0.012)) ? 0.4 : 1;
    let r = base[0] * s, g = base[1] * s, b = base[2] * s;
    if (peel) {
      const p = tnoise(tn, u, v, 9, 3);
      if (p > 0.08) { const k = 0.62; r = r * k + 120 * (1 - k) * 0.9; g = g * k + 100 * (1 - k) * 0.9; b = b * k + 80 * (1 - k) * 0.9; }
    }
    const end = (v * (opts.endRows || 2)) % 1 < 0.008 ? 0.5 : 1;
    const k = gap * nail * end;
    return [r * k, g * k, b * k];
  });
}

export const TEX = {};
export const MAT = {};

export function buildMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.92, metalness: 0 }, o));
  // physically based surfaces: every one drawn from a height field, so its colour, relief (normal map), roughness and
  // crevice shading agree. Colour maps keep their old names, so everything that already uses them keeps working
  const pbr = (name, fn, size, rep, relief, extra = {}) => {
    const s = surface(size, fn, relief);
    TEX[name] = toTex(s.color, rep); TEX[name + 'N'] = toTex(s.normal, rep, false); TEX[name + 'R'] = toTex(s.orm, rep, false);
    const o = Object.assign({ map: TEX[name], normalMap: TEX[name + 'N'], roughnessMap: TEX[name + 'R'], roughness: 1, metalness: 0 }, extra);
    if (extra.metal) { delete o.metal; o.metalnessMap = TEX[name + 'R']; o.metalness = 1; }
    return std(o);
  };
  const lin = c => c.map(v => v / 255);
  MAT.woodGrey = pbr('woodGrey', boards({ base: lin([150, 128, 106]), seed: 2 }), 512, 0.5, 7);
  MAT.woodRed = pbr('woodRed', boards({ base: lin([150, 62, 44]), seed: 3, peel: 1 }), 512, 0.5, 7);
  MAT.woodWhite = pbr('woodWhite', boards({ base: lin([214, 204, 186]), seed: 4, peel: 1 }), 512, 0.5, 7);
  MAT.woodOchre = pbr('woodOchre', boards({ base: lin([186, 140, 78]), seed: 5, peel: 1 }), 512, 0.5, 7);
  MAT.woodBlue = pbr('woodBlue', boards({ base: lin([104, 124, 132]), seed: 6, peel: 1 }), 512, 0.5, 7);
  MAT.woodGreen = pbr('woodGreen', boards({ base: lin([108, 120, 86]), seed: 8, peel: 1 }), 512, 0.5, 7);
  MAT.woodDark = pbr('woodDark', boards({ base: lin([108, 76, 52]), seed: 7 }), 512, 0.7, 7);
  MAT.floor = pbr('floor', boards({ base: lin([132, 100, 70]), seed: 9, boards: 8, endRows: 3 }), 512, 0.5, 6);
  MAT.shingle = pbr('shingle', shingles(), 512, 0.5, 9);
  // corrugated tin, rusting from the bottom of every sheet down the ribs
  MAT.tin = pbr('tin', rustIron({ seed: 11, rust: 0.6, streak: 0.5, corrugate: 14 }), 512, 0.4, 10, { metal: true, side: THREE.DoubleSide });
  MAT.brick = pbr('brick', bricks(), 512, 0.8, 8);
  MAT.stone = pbr('stone', ashlar({ base: lin([168, 140, 112]) }), 512, 0.35, 9);
  MAT.metal = pbr('metal', rustIron({ seed: 13, rust: 0.5 }), 256, 1, 6, { metal: true });
  // rail heads polished bright by the wheels, their sides brown with rust
  MAT.rail = pbr('railSteel', rustIron({ seed: 17, rust: 0.25 }), 256, 1, 3, { metal: true, color: 0xc8beb4 });
  TEX.cloth = toTex(pixels(256, (u, v) => { const ch = (Math.floor(u * 8) + Math.floor(v * 8)) % 2; const n = tnoise(tn, u, v, 12, 2) * 30; return ch ? [170 + n, 150 + n, 125 + n] : [130 + n, 96 + n, 80 + n]; }), 1);
  MAT.cloth = std({ map: TEX.cloth });
  MAT.mattress = std({ color: 0xb8a68c });
  MAT.black = new THREE.MeshBasicMaterial({ color: 0x050403 });
  MAT.glass = new THREE.MeshStandardMaterial({ color: 0x8a9a96, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false });
  MAT.paper = std({ color: 0xd8c8a0 });
  MAT.bottle = std({ color: 0x4a5a2a, roughness: 0.3, metalness: 0.1 });
  MAT.hay = std({ color: 0xc8a560, map: TEX.cloth });
  MAT.lamp = new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0xffa040, emissiveIntensity: 0 });
  MAT.iron = std({ color: 0x2e2a28, metalness: 0.7, roughness: 0.55 });

  // terrain detail: neutral-bright sand grain so vertex colours dominate
  TEX.sand = toTex(pixels(512, (u, v) => {
    const n = tnoise(tn, u, v, 18, 3), f = tnoise(tn2, u, v, 90, 2);
    const ripple = Math.sin((v + tnoise(tn, u, v, 4, 2) * 0.15) * Math.PI * 2 * 22) * 0.5 + 0.5;
    const s = 215 + n * 30 + f * 22 + ripple * 10;
    return [s, s * 0.98, s * 0.95];
  }), 1 / 6);
  const HS = 512, hm = new Float32Array(HS * HS);
  for (let y = 0; y < HS; y++) for (let x = 0; x < HS; x++) {
    const a = x / HS, b = y / HS;
    hm[y * HS + x] = tnoise(tn, a, b, 18, 3) * 0.6 + Math.sin((b + tnoise(tn, a, b, 4, 2) * 0.15) * Math.PI * 2 * 22) * 0.25 + tnoise(tn2, a, b, 90, 2) * 0.4;
  }
  const hh = (x, y) => hm[((y + HS) % HS) * HS + ((x + HS) % HS)];
  const sandN = pixels(512, (u, v, x, y) => {
    const dx = (hh(x + 1, y) - hh(x - 1, y)) * 0.5, dy = (hh(x, y + 1) - hh(x, y - 1)) * 0.5;
    const nx = -dx * 18, ny = -dy * 18, l = Math.hypot(nx, ny, 1);
    return [(nx / l * 0.5 + 0.5) * 255, (ny / l * 0.5 + 0.5) * 255, (1 / l * 0.5 + 0.5) * 255];
  });
  TEX.sandN = toTex(sandN, 1 / 6, false);
  TEX.gravel = toTex(pixels(512, (u, v, x, y) => {
    const r = mulberry32(((Math.floor(x / 5) * 977) ^ (Math.floor(y / 5) * 131)) + 7)();
    const n = tnoise(tn, u, v, 60, 2);
    const s = 0.55 + r * 0.45 + n * 0.25;
    return [135 * s, 122 * s, 108 * s];
  }), 0.6);
  MAT.ballast = pbr('ballastStone', ballast(0), 512, 0.6, 10);
  MAT.sleeper = pbr('sleeperWood', boards({ base: lin([96, 74, 56]), seed: 12, boards: 1, endRows: 1 }), 256, 1, 8);
  // the colder and wetter regions: snow lying on roofs and ballast, ice, bark and leaves for the great trees
  TEX.snow = toTex(pixels(256, (u, v) => { const n = tnoise(tn, u, v, 10, 3), f = tnoise(tn2, u, v, 50, 2); const s = 228 + n * 22 + f * 10; return [s * 0.96, s * 0.98, s]; }), 0.4);
  MAT.snowroof = std({ map: TEX.snow, bumpMap: TEX.shingle, bumpScale: 0.5, roughness: 0.85, side: THREE.DoubleSide });
  TEX.gravelSnow = toTex(pixels(512, (u, v, x, y) => {
    const r = mulberry32(((Math.floor(x / 5) * 977) ^ (Math.floor(y / 5) * 131)) + 7)();
    const n = tnoise(tn, u, v, 60, 2), cover = clamp(tnoise(tn2, u, v, 9, 3) * 2.2 + 0.55, 0, 1);
    const s = 0.55 + r * 0.45 + n * 0.25;
    return [135 * s * (1 - cover) + 222 * cover, 122 * s * (1 - cover) + 228 * cover, 108 * s * (1 - cover) + 236 * cover];
  }), 0.6);
  MAT.ballastSnow = pbr('ballastSnowStone', ballast(1), 512, 0.6, 10);
  MAT.ice = new THREE.MeshStandardMaterial({ color: 0xbfdcec, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.82, vertexColors: true });
  TEX.bark = toTex(pixels(256, (u, v) => { const n = tnoise(tn, u * 6, v, 6, 3), g = Math.abs(Math.sin(u * Math.PI * 2 * 9 + n * 3)); const s = 0.55 + g * 0.35 + n * 0.2; return [96 * s, 78 * s, 60 * s]; }), 0.3);
  MAT.bark = pbr('barkWood', barkFn(), 256, 0.3, 12);
  MAT.leaves = std({ color: 0x4e6a3a, roughness: 1, flatShading: true });

  // vertex coloured variants for instanced props: weathered timber, rock projected from the world so no two boulders
  // match, rusting iron, and plants that move in the wind
  MAT.propWood = std({ map: TEX.woodGrey, normalMap: TEX.woodGreyN, roughnessMap: TEX.woodGreyR, roughness: 1, vertexColors: true });
  MAT.propPlain = std({ vertexColors: true, map: TEX.sand, roughness: 0.95 });
  MAT.propStone = stoneMaterial();
  MAT.propMetal = std({ vertexColors: true, map: TEX.metal, normalMap: TEX.metalN, roughnessMap: TEX.metalR, metalnessMap: TEX.metalR, roughness: 1, metalness: 1 });
  MAT.propPlant = plantMaterial();
  MAT.propPlantWood = plantMaterial({ map: TEX.barkWood, normalMap: TEX.barkWoodN, roughness: 0.95, side: THREE.FrontSide });
  MAT.propLamp = MAT.lamp;
  // builder geometry carries baked interior shading in vertex colours
  for (const k of ['woodGrey', 'woodRed', 'woodWhite', 'woodOchre', 'woodBlue', 'woodGreen', 'woodDark', 'floor', 'shingle', 'tin', 'brick', 'stone', 'metal', 'cloth', 'mattress', 'paper', 'bottle', 'hay', 'iron', 'black', 'snowroof', 'bark', 'leaves'])
    MAT[k].vertexColors = true;
  // the weather lies on everything out of doors: the building materials are gated by their baked interior shading, so
  // floors, furniture and the insides of walls stay dry and free of snow
  for (const k of ['woodGrey', 'woodRed', 'woodWhite', 'woodOchre', 'woodBlue', 'woodGreen', 'woodDark', 'shingle', 'tin', 'brick', 'stone', 'metal', 'iron']) weathered(MAT[k], { gate: true });
  for (const k of ['propWood', 'propPlain', 'propStone', 'propMetal', 'propPlant', 'propPlantWood', 'ballast', 'sleeper', 'rail', 'bark', 'leaves']) if (MAT[k]) weathered(MAT[k]);
  return MAT;
}

// sign boards with painted lettering
const signCache = new Map();
export function signMaterial(text, opts = {}) {
  const key = text + JSON.stringify(opts);
  if (signCache.has(key)) return signCache.get(key);
  const w = 1024, h = 256, c = canvas(w, h), ctx = c.getContext('2d');
  const bg = opts.bg || '#3b2a1c', fg = opts.fg || '#e9dcc0';
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, i * h / 4, w, 3); }
  for (let i = 0; i < 1600; i++) { ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,240,210'},${Math.random() * 0.08})`; ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * 60, 2); }
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let size = opts.size || 150;
  ctx.font = `bold ${size}px "Rockwell", "Copperplate", "Georgia", serif`;
  while (ctx.measureText(text).width > w * 0.9 && size > 30) { size -= 6; ctx.font = `bold ${size}px "Rockwell", "Copperplate", "Georgia", serif`; }
  ctx.globalAlpha = 0.88; ctx.fillText(text, w / 2, h / 2 + 6);
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 260; i++) { ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.6})`; ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 7, 0, 7); ctx.fill(); }
  ctx.globalCompositeOperation = 'destination-over'; ctx.globalAlpha = 1; ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const t = toTex(c, 1); t.repeat.set(1, 1);
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
  signCache.set(key, m); return m;
}

// texture quality: every shared texture keeps its full-size canvas and is swapped for a smaller copy when asked
const FULL = new WeakMap();
export function setTextureQuality(level, maxAniso = 8) {
  const size = { low: 128, medium: 256, high: 1e9, ultra: 1e9 }[level] || 1e9;
  const aniso = { low: 1, medium: 2, high: Math.min(8, maxAniso), ultra: maxAniso }[level] || 4;
  ANISO = aniso;
  for (const k in TEX) {
    const t = TEX[k]; if (!t || !t.image) continue;
    if (!FULL.has(t)) FULL.set(t, t.image);
    const src = FULL.get(t), s = Math.min(src.width, size);
    let img = src;
    if (s < src.width) { img = canvas(s, Math.max(1, Math.round(src.height * s / src.width))); img.getContext('2d').drawImage(src, 0, 0, img.width, img.height); }
    if (t.image !== img || t.anisotropy !== aniso) { t.image = img; t.anisotropy = aniso; t.needsUpdate = true; }
  }
}
