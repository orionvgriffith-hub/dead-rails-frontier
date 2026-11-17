// World layout for a 32 km territory. The railway, towns, sites, rivers, lakes and landmarks are fixed data laid out
// here; the ground itself is a pure function of position (sampleAt), worked out tile by tile only around whoever is
// looking (terrain.js streams the tiles). Anywhere a tile isn't loaded, the same function answers directly.
import * as THREE from 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/three.module.js';
import { makeNoise, fbm, ridged, smoothstep, clamp, lerp } from './noise.js';
import { biomeWeights } from './biomes.js';

export const WORLD = 32768, HALF = 16384, TILE = 256, TS = 96, TV = TS + 1, CELL = TILE / TS;
export const SWAMP_WL = -3; // standing water level across the marshes
const nA = makeNoise(11), nB = makeNoise(23), nC = makeNoise(37), nD = makeNoise(51), nE = makeNoise(73);
const nF = makeNoise(101), nG = makeNoise(131), nH = makeNoise(151), nI = makeNoise(171), nJ = makeNoise(191), nK = makeNoise(211);
const cn = makeNoise(808), cn2 = makeNoise(202);

// ---------------- spatial buckets ----------------
const bk = (i, j) => i * 65536 + j;
function buckets(size) { return { size, m: new Map() }; }
function bucketAdd(B, x, z, R, item) {
  const s = B.size;
  for (let i = Math.floor((x - R) / s); i <= Math.floor((x + R) / s); i++)
    for (let j = Math.floor((z - R) / s); j <= Math.floor((z + R) / s); j++) { const k = bk(i, j); let L = B.m.get(k); if (!L) B.m.set(k, L = []); L.push(item); }
}
const bucketGet = (B, x, z) => B.m.get(bk(Math.floor(x / B.size), Math.floor(z / B.size)));

// ---------------- Rail route ----------------
// west to east: the marshes, the forest, the original desert valley (unchanged), the badlands and the snowy mountains.
// The three points between (80, 230) and (380, -60) sit on one line, giving a dead straight run for Cinder Flats.
export const ROUTE_V = 2; // bumped whenever the line changes, so a saved train position is never misread
const ROUTE = [
  [-15300, 500], [-14600, 300], [-13800, -100], [-13000, -200], [-12200, 200], [-11400, 700], [-10600, 900], [-9800, 600], [-9100, 0],
  [-8300, -700], [-7400, -1100], [-6500, -900], [-5700, -350], [-4900, 160], [-4100, 380], [-3300, 200], [-2600, -120],
  [-2000, -300], [-1600, -420], [-1200, -330], [-850, -60], [-560, 190], [-250, 320], [80, 230], [155, 157.5], [230, 85], [305, 12.5],
  [380, -60], [700, -300], [1000, -300], [1250, -180], [1500, 60], [1750, 330], [2000, 480],
  [2500, 560], [3200, 450], [3900, 100], [4600, -300], [5400, -500], [6200, -300], [7000, 150], [7800, 500], [8600, 400],
  [9400, -100], [10200, -600], [11000, -800], [11800, -500], [12600, 0], [13400, 300], [14200, 100], [15000, -300], [15400, -500],
];
const curve = new THREE.CatmullRomCurve3(ROUTE.map(p => new THREE.Vector3(p[0], 0, p[1])), false, 'centripetal');
curve.arcLengthDivisions = 24000; // even spacing along 34 km of track
const RL = curve.getLength();
const RN = Math.round(RL / 2);
const pts = curve.getSpacedPoints(RN);
export const rail = {
  L: RL, N: RN, ds: RL / RN,
  x: new Float32Array(RN + 1), z: new Float32Array(RN + 1), y: new Float32Array(RN + 1),
  tx: new Float32Array(RN + 1), tz: new Float32Array(RN + 1), ground: new Float32Array(RN + 1),
};
for (let k = 0; k <= RN; k++) { rail.x[k] = pts[k].x; rail.z[k] = pts[k].z; }
for (let k = 0; k <= RN; k++) {
  const a = Math.max(0, k - 1), b = Math.min(RN, k + 1);
  let dx = rail.x[b] - rail.x[a], dz = rail.z[b] - rail.z[a]; const l = Math.hypot(dx, dz) || 1;
  rail.tx[k] = dx / l; rail.tz[k] = dz / l;
}
export function railIndexByX(x) { for (let k = 0; k <= RN; k++) if (rail.x[k] >= x) return k; return RN; }
export function railAt(s) {
  const f = clamp(s / rail.ds, 0, RN - 0.0001), k = Math.floor(f), t = f - k;
  return {
    x: lerp(rail.x[k], rail.x[k + 1], t), z: lerp(rail.z[k], rail.z[k + 1], t), y: lerp(rail.y[k], rail.y[k + 1], t),
    tx: lerp(rail.tx[k], rail.tx[k + 1], t), tz: lerp(rail.tz[k], rail.tz[k + 1], t),
  };
}
// nearest rail sample: every 4th sample is bucketed, then the hit is refined. Results in RAIL_K / RAIL_D.
const RB = 64, railB = new Map();
for (let k = 0; k <= RN; k += 4) { const key = bk(Math.floor(rail.x[k] / RB), Math.floor(rail.z[k] / RB)); let L = railB.get(key); if (!L) railB.set(key, L = []); L.push(k); }
let RAIL_K = -1, RAIL_D = 1e9;
function railNear(x, z) {
  const i = Math.floor(x / RB), j = Math.floor(z / RB); let best = 1e18, bkk = -1;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const L = railB.get(bk(i + a, j + b)); if (!L) continue;
    for (let q = 0; q < L.length; q++) { const k = L[q], dx = x - rail.x[k], dz = z - rail.z[k], d = dx * dx + dz * dz; if (d < best) { best = d; bkk = k; } }
  }
  if (bkk < 0) { RAIL_K = -1; RAIL_D = 1e9; return -1; }
  for (let k = Math.max(0, bkk - 4); k <= Math.min(RN, bkk + 4); k++) { const dx = x - rail.x[k], dz = z - rail.z[k], d = dx * dx + dz * dz; if (d < best) { best = d; bkk = k; } }
  RAIL_K = bkk; RAIL_D = Math.sqrt(best); return bkk;
}

// ---------------- Towns ----------------
export const TOWNS = [
  { name: 'Gator Point', x: -14900, side: -1, kind: 'stop', len: 60 },
  { name: 'Blackwater Station', x: -13200, side: 1, kind: 'station', len: 90 },
  { name: 'Bayou Landing', x: -11300, side: -1, kind: 'small', len: 150 },
  { name: 'Cedar Creek Crossing', x: -9000, side: 1, kind: 'station', len: 90 },
  { name: 'Elk Hollow', x: -7700, side: -1, kind: 'large', len: 220 },
  { name: 'Timberline Mill', x: -5800, side: 1, kind: 'small', len: 150 },
  { name: 'Juniper Flats', x: -3400, side: -1, kind: 'stop', len: 60 },
  { name: 'Mile 3 Water Stop', x: -1780, side: 1, kind: 'stop', len: 60 },
  { name: 'Dry Gulch', x: -1230, side: 1, kind: 'large', len: 250 },
  { name: 'Bitter Springs', x: -180, side: -1, kind: 'small', len: 150 },
  { name: 'Cinder Flats Station', x: 230, side: 1, kind: 'depot', len: 110 },
  { name: 'Coyote Bend', x: 560, side: 1, kind: 'large', len: 240 },
  { name: "Dead Man's Pass", x: 1130, side: -1, kind: 'station', len: 90 },
  { name: 'Section House No. 9', x: 1640, side: -1, kind: 'stop', len: 60 },
  { name: 'Redstone', x: 3900, side: 1, kind: 'small', len: 150 },
  { name: 'Hoodoo Gulch Station', x: 5600, side: -1, kind: 'station', len: 90 },
  { name: 'Copper Canyon', x: 7200, side: 1, kind: 'large', len: 220 },
  { name: 'Pinecrest Junction', x: 8800, side: -1, kind: 'station', len: 90 },
  { name: 'Frostbite Summit', x: 10600, side: 1, kind: 'station', len: 90 },
  { name: 'Silverpeak', x: 12300, side: -1, kind: 'large', len: 220 },
  { name: 'Glacier Point', x: 14900, side: 1, kind: 'stop', len: 60 },
];
for (const t of TOWNS) {
  const k = railIndexByX(t.x); t.k = k;
  t.tx = rail.tx[k]; t.tz = rail.tz[k];
  t.nx = -t.tz * t.side; t.nz = t.tx * t.side;
  t.ox = rail.x[k]; t.oz = rail.z[k];
  t.streetB = t.kind === 'large' ? 42 : t.kind === 'small' ? 36 : 0;
  if (t.kind === 'large' || t.kind === 'small') { t.b0 = 3; t.b1 = t.streetB + (t.kind === 'large' ? 62 : 36); t.a0 = -t.len / 2 - 14; t.a1 = t.len / 2 + 14; }
  else if (t.kind === 'depot') { t.b0 = -48; t.b1 = 62; t.a0 = -t.len / 2 - 22; t.a1 = t.len / 2 + 22; }
  else { t.b0 = 3; t.b1 = 30; t.a0 = -t.len / 2; t.a1 = t.len / 2; }
  t.cx = t.ox + t.nx * (t.b0 + t.b1) / 2; t.cz = t.oz + t.nz * (t.b0 + t.b1) / 2;
}
export function townToWorld(t, a, b) { return [t.ox + t.tx * a + t.nx * b, t.oz + t.tz * a + t.nz * b]; }

// ---------------- Sites away from the line ----------------
// hidden: no trail leads there, you have to find it
export const SITES = [
  // the original desert
  { name: 'Boot Hill', x: -1150, z: -120, r: 34, kind: 'cemetery' },
  { name: 'Hollow Ranch', x: 220, z: -820, r: 70, kind: 'ranch' },
  { name: "Settlers' Rest", x: -300, z: 950, r: 46, kind: 'wagons' },
  { name: "Devil's Arch", x: 900, z: 760, r: 60, kind: 'arch' },
  { name: 'Lost Dutchman Mine', x: 840, z: -1010, r: 52, kind: 'mine' },
  { name: 'Widow Creek Homestead', x: -1660, z: 980, r: 32, kind: 'homestead' },
  { name: 'Buzzard Flats Graveyard', x: -2800, z: 2300, r: 34, kind: 'cemetery', sign: 'BUZZARD FLATS' },
  { name: 'Lost Wagon Train', x: 2700, z: -2500, r: 46, kind: 'wagons' },
  // forest and woodland
  { name: "Trapper's Cabin", x: -6100, z: -2700, r: 30, kind: 'cabin' },
  { name: 'Hunting Camp', x: -8200, z: 1900, r: 32, kind: 'huntcamp' },
  { name: 'Bear Cave', x: -5200, z: 2500, r: 36, kind: 'cave', hidden: true },
  { name: 'Old Logging Camp', x: -4500, z: -1900, r: 50, kind: 'loggingcamp' },
  { name: 'Lone Pine Lookout', x: -8800, z: -2700, r: 24, kind: 'lookout' },
  // swamp and marshland
  { name: 'Drowned Chapel', x: -12600, z: 1700, r: 40, kind: 'swampchurch' },
  { name: "Moonshiner's Shack", x: -10800, z: -1700, r: 30, kind: 'shack', hidden: true },
  { name: 'Cypress Hollow', x: -14200, z: -1900, r: 46, kind: 'stilthouses' },
  { name: 'Sunken Bridge', x: -12000, z: -1300, r: 40, kind: 'brokenbridge' },
  { name: 'The Old Cypress', x: -13600, z: 2600, r: 30, kind: 'giantTree', hidden: true },
  // rocky badlands
  { name: 'Rattler Mine', x: 4700, z: -2300, r: 52, kind: 'mine' },
  { name: 'Hoodoo Garden', x: 6000, z: 1900, r: 70, kind: 'hoodoos' },
  { name: 'Old Kettle Tunnel', x: 6800, z: -2100, r: 30, kind: 'oldtunnel' },
  { name: "Prospector's Cache", x: 3600, z: 2600, r: 20, kind: 'treasure', hidden: true },
  { name: 'Bone Canyon', x: 7700, z: 2600, r: 40, kind: 'fossils', hidden: true },
  { name: 'Signal Hill Bunker', x: 5200, z: 3600, r: 26, kind: 'bunker', hidden: true },
  // snowy mountains
  { name: 'Ashcroft Observatory', x: 11000, z: 2300, r: 34, kind: 'observatory' },
  { name: 'Frozen Falls', x: 12900, z: -2300, r: 40, kind: 'frozenfalls' },
  { name: 'Ice Cave', x: 9800, z: -2400, r: 36, kind: 'icecave', hidden: true },
  { name: "Miner's Shelter", x: 13700, z: 1500, r: 24, kind: 'shelter' },
  { name: 'Avalanche Camp', x: 10300, z: 1500, r: 30, kind: 'huntcamp', snow: true },
  { name: 'Ghost Freight', x: 8200, z: 1500, r: 40, kind: 'wreck', hidden: true },
  // the wider territory: places off the beaten track in every region
  { name: 'Sandhill', x: -1500, z: -3600, r: 70, kind: 'ghosttown' },
  { name: 'Butterfield Stage Station', x: 600, z: 3900, r: 50, kind: 'stagestation' },
  { name: 'The Sand Sea', x: -600, z: -5600, r: 34, kind: 'dunes' },
  { name: 'Widowmaker Diggings', x: 1300, z: -3300, r: 30, kind: 'adit' },
  { name: 'Echo Cavern', x: -420, z: 2250, r: 30, kind: 'cave', hidden: true },
  { name: 'Hemlock Hollow', x: -6800, z: 3300, r: 56, kind: 'cabins' },
  { name: 'Windfall Ridge', x: -8600, z: -4200, r: 40, kind: 'windfall' },
  { name: 'Silver Bell', x: 12100, z: 3600, r: 80, kind: 'minetown' },
  { name: 'Granite Gap Mine', x: 9000, z: -4500, r: 30, kind: 'adit', snow: true },
  // special places: each has its own layout, enemies and (most) a boss guarding what the cure needs
  { name: 'Fortune', x: -2500, z: -1650, r: 75, kind: 'bank', special: true },
  { name: 'Our Lady of Sorrows', x: -3700, z: 2500, r: 60, kind: 'cathedral', special: true },
  { name: "Black Jack's Hideout", x: 7100, z: -3400, r: 62, kind: 'outlawcamp', special: true, boss: true },
  { name: 'Rattlesnake Gang Camp', x: 1500, z: 2900, r: 46, kind: 'outlawcamp', special: true },
  { name: 'Hollis Farm', x: -5300, z: -1500, r: 56, kind: 'barn', special: true },
  { name: 'Redwater Ranch', x: 2600, z: -1500, r: 50, kind: 'barn', special: true },
  { name: 'Whitfield Stud', x: -7000, z: -3300, r: 56, kind: 'barn', special: true },
  { name: 'Volt Research Station', x: 10000, z: -3800, r: 52, kind: 'teslalab', special: true },
  { name: 'Ichor Oil Works', x: 5000, z: -4200, r: 90, kind: 'refinery', special: true },
  { name: 'The Pale Catacombs', x: -11500, z: -3600, r: 40, kind: 'catacombs', special: true, hidden: true },
  { name: 'Hartwell Institute', x: 14600, z: 1700, r: 48, kind: 'institute', special: true },
];
// terrain landmarks: buttes are flat-topped, peaks are mountains
const BUTTES = [
  { name: 'Red Butte', x: -1350, z: 660, r: 95, h: 115 },
  { name: 'The Needle', x: 310, z: 640, r: 26, h: 90 },
  { name: 'Table Rock', x: -180, z: -1330, r: 120, h: 62 },
  { name: 'Great Spire', x: 5100, z: 1200, r: 42, h: 150 },
  { name: 'Red Castle Mesa', x: 7600, z: -1300, r: 190, h: 88 },
  { name: 'Elk Ridge', x: -4900, z: 3700, r: 520, h: 230, peak: true },
  { name: 'Mount Ashcroft', x: 13200, z: 3400, r: 900, h: 720, peak: true },
  { name: 'Widowmaker Peak', x: 14000, z: -2900, r: 700, h: 620, peak: true },
];
export const LANDMARKS = BUTTES;
export const LAKES = [
  { name: 'Mirror Lake', x: -8000, z: -2300, r: 230 },
  { name: 'Beaver Pond', x: -5000, z: 1250, r: 110 },
  { name: 'Frozen Lake Tahoma', x: 9600, z: 2400, r: 270, frozen: true },
  { name: 'Crystal Lake', x: 13800, z: -1100, r: 200, frozen: true },
  { name: 'Lake Kestrel', x: 11600, z: -4300, r: 240, frozen: true },
];
// dry: the original desert wash. water / frozen: real rivers with a graded bed that always runs downhill
export const RIVERS = [
  { name: 'Dry riverbed', kind: 'dry', pts: [[-900, -2150], [-720, -1250], [-860, -620], [-580, -40], [-660, 600], [-420, 1300], [-600, 2150]] },
  { name: 'Elk River', kind: 'water', w: 9, depth: 6, pts: [[-6100, -5200], [-6500, -3600], [-6300, -2000], [-6800, -700], [-6700, 600], [-7200, 1900], [-6900, 3400], [-7400, 5200]] },
  { name: 'Cedar Creek', kind: 'water', w: 5, depth: 4, pts: [[-9800, -3200], [-9500, -1800], [-9300, -600], [-9450, 700], [-9100, 2100], [-9400, 3400]] },
  { name: 'Silver River', kind: 'frozen', w: 9, depth: 6, pts: [[11200, -4800], [11500, -3000], [11300, -1600], [11600, -200], [11400, 1300], [11900, 2800], [11700, 4600]] },
];

// ---------------- corridors: distance to the line, real rivers and lakes (64 m grid) ----------------
// mountains are held back from these so the railway, rivers and lakes always sit in a valley
const CR = 64, CRO = HALF + 4096, CRN = Math.ceil(2 * CRO / CR) + 1, CMAX = 1000;
const corridor = new Float32Array(CRN * CRN).fill(CMAX);
function stampCorridor(px, pz, R) {
  const i0 = Math.max(0, Math.floor((px - R + CRO) / CR)), i1 = Math.min(CRN - 1, Math.ceil((px + R + CRO) / CR));
  const j0 = Math.max(0, Math.floor((pz - R + CRO) / CR)), j1 = Math.min(CRN - 1, Math.ceil((pz + R + CRO) / CR));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const d = Math.hypot(-CRO + i * CR - px, -CRO + j * CR - pz), o = j * CRN + i;
    if (d < corridor[o]) corridor[o] = d;
  }
}
function corridorDist(x, z) {
  const fx = clamp((x + CRO) / CR, 0, CRN - 1.001), fz = clamp((z + CRO) / CR, 0, CRN - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, o = j * CRN + i;
  return lerp(lerp(corridor[o], corridor[o + 1], u), lerp(corridor[o + CRN], corridor[o + CRN + 1], u), v);
}
for (let k = 0; k <= RN; k += 16) stampCorridor(rail.x[k], rail.z[k], 900);

// ---------------- rivers: spaced points, bucketed ----------------
const RVX = [], RVZ = [], RVR = [], RVI = [];
const RVB = buckets(96);
for (let r = 0; r < RIVERS.length; r++) {
  const R = RIVERS[r];
  const c = new THREE.CatmullRomCurve3(R.pts.map(p => new THREE.Vector3(p[0], 0, p[1])), false, 'centripetal');
  c.arcLengthDivisions = 4000;
  const n = Math.round(c.getLength() / 6), sp = c.getSpacedPoints(n);
  R.x = new Float32Array(n + 1); R.z = new Float32Array(n + 1); R.bed = new Float32Array(n + 1); R.n = n;
  for (let i = 0; i <= n; i++) {
    R.x[i] = sp[i].x; R.z[i] = sp[i].z;
    const q = RVX.length; RVX.push(sp[i].x); RVZ.push(sp[i].z); RVR.push(r); RVI.push(i);
    bucketAdd(RVB, sp[i].x, sp[i].z, 0, q);
    if (R.kind !== 'dry' && i % 3 === 0) stampCorridor(sp[i].x, sp[i].z, 900);
  }
}
let RIV_D = 1e9, RIV_Q = -1;
function riverNear(x, z) {
  const s = RVB.size, i = Math.floor(x / s), j = Math.floor(z / s); let best = 1e18, bq = -1;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const L = RVB.m.get(bk(i + a, j + b)); if (!L) continue;
    for (let n = 0; n < L.length; n++) { const q = L[n], dx = x - RVX[q], dz = z - RVZ[q], d = dx * dx + dz * dz; if (d < best) { best = d; bq = q; } }
  }
  RIV_Q = bq; RIV_D = bq < 0 ? 1e9 : Math.sqrt(best);
}
for (const L of LAKES) for (let a = 0; a < 16; a++) for (const f of [0, 0.5, 1]) stampCorridor(L.x + Math.cos(a / 16 * 6.283) * L.r * f, L.z + Math.sin(a / 16 * 6.283) * L.r * f, 900);

// ---------------- town and site damping (big landforms keep away) ----------------
const DAMPB = buckets(512);
for (const t of TOWNS) { const r = t.len / 2 + 40; bucketAdd(DAMPB, t.cx, t.cz, r + 350, { x: t.cx, z: t.cz, r }); }
for (const s of SITES) { const r = s.r + 20; bucketAdd(DAMPB, s.x, s.z, r + 350, { x: s.x, z: s.z, r }); }
function dampAt(x, z) {
  let sd = 1; const L = bucketGet(DAMPB, x, z); if (!L) return 1;
  for (let i = 0; i < L.length; i++) { const s = L[i], dx = x - s.x, dz = z - s.z, d2 = dx * dx + dz * dz, R = s.r + 350; if (d2 < R * R) sd = Math.min(sd, smoothstep(s.r, R, Math.sqrt(d2))); }
  return sd;
}
const LANDB = buckets(512);
for (const b of BUTTES) bucketAdd(LANDB, b.x, b.z, b.peak ? b.r : b.r * 1.8, b);

// ---------------- natural ground, region by region ----------------
const S0 = { w: new Float32Array(5), m: 0, rav: 0 };
function mountainMaskDesert(x, z, sd, rd) {
  const ax = Math.abs(x);
  // the original valley walls north and south of Dry Gulch, fading out beyond the old map
  let m = smoothstep(1000, 1650, Math.abs(z - 100 + 150 * Math.sin(x * 0.0012))) * (1 - smoothstep(2300, 3400, ax)) * (1 - smoothstep(3600, 5200, Math.abs(z - 100)));
  const rx = x - 1180 - 90 * Math.sin(z * 0.0021);
  let ridge = 1 - smoothstep(120, 430, Math.abs(rx));
  ridge *= lerp(0.24, 1, smoothstep(120, 650, Math.abs(z + 230))) * (1 - smoothstep(4500, 7500, Math.abs(z)));
  m = Math.max(m, ridge);
  const rdamp = smoothstep(120, 420, rd);
  m = Math.max(m, smoothstep(0.24, 0.5, fbm(nC, x * 0.00045 + 3.1, z * 0.00045 - 1.7, 3)) * 0.85 * sd * rdamp);
  return m;
}
// the Sand Sea: a field of tall dunes south of the line; 1 in the middle, 0 outside
export function duneSea(x, z) { return 1 - smoothstep(1300, 2700, Math.hypot(x + 600, z + 5600)); }
function desertH(x, z, sd, rd) {
  const rdamp = smoothstep(70, 280, rd);
  const m = mountainMaskDesert(x, z, sd, rd);
  // beyond the original map the dunes grow and canyons appear
  const outer = smoothstep(2600, 4200, Math.max(Math.abs(x), Math.abs(z)));
  let h = fbm(nA, x * 0.0008, z * 0.0008, 4) * 30 + fbm(nB, x * 0.005, z * 0.005, 3) * 2.5;
  const dm = smoothstep(0.0, 0.3, fbm(nD, x * 0.0006 + 7.3, z * 0.0006 - 2.1, 2)) * (1 - m) * lerp(0.35, 1, rdamp) * lerp(0.2, 1, sd);
  if (dm > 0.002) {
    const u = x * 0.8 + z * 0.6, v = z * 0.8 - x * 0.6;
    const r = ridged(nE, u * 0.0055, v * 0.0022, 3);
    h += dm * r * r * lerp(16, 34, outer);
  }
  const mv = fbm(nE, x * 0.0010 - 5.2, z * 0.0010 + 9.1, 3);
  const mf = sd * rdamp * (1 - m);
  if (mf > 0.001) h += mf * (smoothstep(0.26, 0.30, mv) * 42 + smoothstep(0.36, 0.39, mv) * 22);
  if (outer > 0.001) {
    const c = Math.abs(fbm(nK, x * 0.0012 + 4.4, z * 0.0012 - 8.1, 3));
    h -= (1 - smoothstep(0.015, 0.06, c)) * 30 * outer * smoothstep(150, 420, rd) * sd;
  }
  if (m > 0.001) {
    const r = ridged(nC, x * 0.0014 + 1.3, z * 0.0014 - 4.2, 6); h += Math.pow(m, 1.4) * (35 + 250 * r);
    // crags, and gullies cut down the faces by flash floods
    const mp = Math.pow(m, 1.8), gully = 1 - smoothstep(0.0, 0.07, Math.abs(fbm(nJ, x * 0.0045, z * 0.0011 + x * 0.0009, 2)));
    h += mp * (ridged(nI, x * 0.0065 + 2.2, z * 0.0065, 3) * 26 - gully * 14 * r);
  }
  // the Sand Sea: long crested dunes up to forty metres, with smaller ones riding on their backs
  const sea = duneSea(x, z) * (1 - m) * rdamp;
  if (sea > 0.001) {
    const u = x * 0.8 + z * 0.6, v = z * 0.8 - x * 0.6, big = ridged(nE, u * 0.0042 + 3.3, v * 0.0016, 3), small = ridged(nD, u * 0.016, v * 0.007 + 1.1, 2);
    h += sea * (big * big * 40 + small * small * 5 + 4);
  }
  // the floor: low swells and hummocks a few feet high, kept off the track bed
  h += fbm(nB, x * 0.031 + 7, z * 0.031 - 3, 3) * 0.9 * rdamp + fbm(nG, x * 0.011, z * 0.011, 2) * 1.6 * rdamp;
  S0.m = m; return h;
}
function forestH(x, z, sd, rd) {
  const rdamp = smoothstep(80, 320, rd);
  let h = 24 + fbm(nF, x * 0.0009, z * 0.0009, 4) * 34 * lerp(0.3, 1, rdamp) * lerp(0.4, 1, sd) + fbm(nG, x * 0.006, z * 0.006, 2) * 2.2;
  // wooded ridges away from the line
  const mr = smoothstep(0.15, 0.5, fbm(nH, x * 0.0004 - 2.2, z * 0.0004 + 6.1, 3)) * smoothstep(250, 700, rd) * sd;
  if (mr > 0.001) h += mr * (40 + 140 * ridged(nI, x * 0.0013, z * 0.0013, 4));
  S0.m = mr * 0.8; return h;
}
function swampH(x, z) {
  // hovering around the water line: low islands, channels and open water
  const h = SWAMP_WL + 0.35 + fbm(nJ, x * 0.0032, z * 0.0032, 3) * 3.0 + fbm(nG, x * 0.0007 + 4, z * 0.0007 - 2, 2) * 2.6 + fbm(nB, x * 0.02, z * 0.02, 2) * 0.35;
  S0.m = 0; return h;
}
function badlandsH(x, z, sd, rd) {
  const rdamp = smoothstep(90, 340, rd);
  let h = 52 + fbm(nA, x * 0.0007 + 9, z * 0.0007 - 3, 3) * 18;
  // stepped mesas with sheer sides
  const v = fbm(nK, x * 0.00085 + 1.7, z * 0.00085 + 4.4, 4);
  const mesa = (smoothstep(0.08, 0.12, v) * 38 + smoothstep(0.26, 0.29, v) * 34 + smoothstep(0.42, 0.44, v) * 26) * rdamp * sd;
  h += mesa;
  // ravines cut deep and narrow; the line crosses a few of them on trestles
  const c = Math.abs(fbm(nI, x * 0.0011 - 6.2, z * 0.0011 + 2.9, 3));
  const rav = (1 - smoothstep(0.012, 0.045, c)) * lerp(0.55, 1, smoothstep(60, 300, rd)) * lerp(0.3, 1, sd);
  h -= rav * 30;
  // rocky ridges far from the track
  const mr = smoothstep(0.2, 0.55, fbm(nH, x * 0.0005 + 3, z * 0.0005 - 7, 3)) * smoothstep(300, 800, rd) * sd;
  if (mr > 0.001) h += mr * (30 + 170 * ridged(nC, x * 0.0016 + 2, z * 0.0016, 4));
  // small swells on the flats, and vertical fluting where rain has run down the mesa walls
  h += fbm(nB, x * 0.029 - 4, z * 0.029 + 6, 3) * 1.0 * rdamp;
  if (mesa > 1) h += (ridged(nJ, x * 0.02 + z * 0.004, z * 0.02 - x * 0.004, 2) - 0.5) * 3.5 * smoothstep(1, 30, mesa) * rdamp;
  S0.m = Math.max(mr, smoothstep(10, 60, mesa) * 0.5); S0.rav = rav;
  return h;
}
function snowH(x, z, sd, rd) {
  // a broad valley floor for the line; the peaks rise beyond it
  const corr = smoothstep(140, 700, rd);
  let h = 128 + fbm(nF, x * 0.0008 - 4, z * 0.0008 + 2, 4) * 26 * lerp(0.35, 1, smoothstep(80, 300, rd)) * lerp(0.4, 1, sd) + fbm(nG, x * 0.005, z * 0.005, 2) * 2;
  const m = corr * sd * smoothstep(0.1, 0.45, fbm(nH, x * 0.00035 + 8, z * 0.00035 + 1, 2) + 0.35);
  if (m > 0.001) h += m * (50 + 560 * Math.pow(ridged(nC, x * 0.0009 + 5.1, z * 0.0009 - 2.3, 5), 1.5));
  S0.m = m; return h;
}
// natural ground before any river, lake, track bed or town site is cut into it. Leaves the weights in S0.w, the
// mountain mask in S0.m and how much of a ravine this is in S0.rav
export function naturalH(x, z) {
  const w = biomeWeights(x, z, S0.w);
  const rd = corridorDist(x, z), sd = dampAt(x, z);
  let h = 0, m = 0, rav = 0;
  if (w[0] > 0.001) { h += w[0] * desertH(x, z, sd, rd); m += w[0] * S0.m; }
  if (w[1] > 0.001) { h += w[1] * forestH(x, z, sd, rd); m += w[1] * S0.m; }
  if (w[2] > 0.001) { h += w[2] * swampH(x, z); }
  if (w[3] > 0.001) { S0.rav = 0; h += w[3] * badlandsH(x, z, sd, rd); m += w[3] * S0.m; rav = w[3] * S0.rav; }
  if (w[4] > 0.001) { h += w[4] * snowH(x, z, sd, rd); m += w[4] * S0.m; }
  const L = bucketGet(LANDB, x, z);
  if (L) for (let i = 0; i < L.length; i++) {
    const b = L[i], d = Math.hypot(x - b.x, z - b.z);
    if (b.peak) { if (d < b.r) { const t = 1 - d / b.r, s = t * t * (3 - 2 * t); h += b.h * s * (0.8 + 0.35 * ridged(nE, x * 0.003 + 1, z * 0.003 - 2, 3)); m = Math.max(m, s); } }
    else if (d < b.r * 1.8) { const rr = b.r * (1 + 0.16 * nB(x * 0.012, z * 0.012)); h += b.h * smoothstep(rr * 1.22, rr * 0.92, d) + b.h * 0.15 * smoothstep(rr * 1.7, rr * 1.1, d); }
  }
  // the edge of the territory: a wall of mountains, held low where the line runs out to its end
  const edge = smoothstep(HALF - 3400, HALF - 300, Math.max(Math.abs(x), Math.abs(z)));
  if (edge > 0.001) { h += edge * lerp(0.05, 1, smoothstep(250, 900, rd)) * (120 + 520 * ridged(nE, x * 0.0011 + 3, z * 0.0011 - 8, 5)); m = Math.max(m, edge * smoothstep(250, 900, rd)); }
  // no standing water outside the marshes
  if (w[2] > 0.001) h = Math.max(h, SWAMP_WL + 0.5 * smoothstep(0.45, 0.3, w[2]));
  S0.m = clamp(m, 0, 1); S0.rav = rav;
  return h;
}

// river beds: lowest ground across the channel, smoothed, and never rising downstream
for (const R of RIVERS) {
  if (R.kind === 'dry') { R.u = i => i / R.n; continue; }
  const bed = new Float32Array(R.n + 1);
  for (let i = 0; i <= R.n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(R.n, i + 1), tx = R.x[b] - R.x[a], tz = R.z[b] - R.z[a], l = Math.hypot(tx, tz) || 1, nx = -tz / l, nz = tx / l;
    bed[i] = Math.min(naturalH(R.x[i], R.z[i]), naturalH(R.x[i] + nx * 25, R.z[i] + nz * 25), naturalH(R.x[i] - nx * 25, R.z[i] - nz * 25)) - R.depth;
  }
  let p = bed; for (let k = 0; k < 2; k++) p = smoothArr(p, 30);
  for (let i = 1; i <= R.n; i++) p[i] = Math.min(p[i], p[i - 1]);
  R.bed = p;
}
for (const L of LAKES) {
  let lo = naturalH(L.x, L.z);
  for (let a = 0; a < 12; a++) lo = Math.min(lo, naturalH(L.x + Math.cos(a / 12 * 6.283) * L.r, L.z + Math.sin(a / 12 * 6.283) * L.r));
  L.level = lo - 1;
}
const LAKEB = buckets(256);
for (const L of LAKES) bucketAdd(LAKEB, L.x, L.z, L.r + 130, L);

function smoothArr(a, r) {
  const n = a.length, out = new Float32Array(n), pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + a[i];
  for (let i = 0; i < n; i++) { const lo = Math.max(0, i - r), hi = Math.min(n - 1, i + r); out[i] = (pre[hi + 1] - pre[lo]) / (hi - lo + 1); }
  return out;
}

// ---------------- Rail elevation profile ----------------
// follows the smoothed ground, stays above the marsh water, is flat through every town and never steeper than 3%
(function () {
  let p = new Float32Array(RN + 1);
  const floor = new Float32Array(RN + 1).fill(-1e9);
  for (let k = 0; k <= RN; k++) { p[k] = naturalH(rail.x[k], rail.z[k]); if (S0.w[2] > 0.2) { floor[k] = SWAMP_WL + 2.2; p[k] = Math.max(p[k], floor[k]); } }
  for (let i = 0; i < 3; i++) p = smoothArr(p, 75);
  for (let k = 0; k <= RN; k++) p[k] = Math.max(p[k], floor[k]);
  const pin = new Uint8Array(RN + 1);
  for (const t of TOWNS) { const h = p[t.k]; t.h0 = h; const hk = Math.round((t.len / 2 + 40) / rail.ds); for (let k = Math.max(0, t.k - hk); k <= Math.min(RN, t.k + hk); k++) { p[k] = h; pin[k] = 1; } }
  const g = 0.03 * rail.ds;
  for (let it = 0; it < 4; it++) {
    for (let k = 1; k <= RN; k++) if (!pin[k]) p[k] = clamp(p[k], p[k - 1] - g, p[k - 1] + g);
    for (let k = RN - 1; k >= 0; k--) if (!pin[k]) p[k] = clamp(p[k], p[k + 1] - g, p[k + 1] + g);
  }
  p = smoothArr(p, 20);
  for (const t of TOWNS) { const hk = Math.round((t.len / 2 + 14) / rail.ds); for (let k = Math.max(0, t.k - hk); k <= Math.min(RN, t.k + hk); k++) p[k] = t.h0; }
  rail.y.set(p);
  for (const t of TOWNS) t.h = t.h0 - 0.45;
})();
for (const s of SITES) {
  s.h = naturalH(s.x, s.z);
  // in the marshes: the shack stands on an island, the stilt villages stand in shallow water
  if (['stilthouses', 'swampchurch', 'brokenbridge'].includes(s.kind)) s.h = SWAMP_WL - 0.9;
  else if (S0.w[2] > 0.2) s.h = Math.max(s.h, SWAMP_WL + 0.6);
}

// ---------------- town & site pads ----------------
const PADB = buckets(256);
for (const t of TOWNS) {
  const B = 42, ac = (t.a0 + t.a1) / 2, bc = (t.b0 + t.b1) / 2, [cx, cz] = townToWorld(t, ac, bc);
  bucketAdd(PADB, cx, cz, Math.hypot(t.a1 - t.a0, t.b1 - t.b0) / 2 + B, { h: t.h, w: (x, z) => {
    const dx = x - t.ox, dz = z - t.oz, a = dx * t.tx + dz * t.tz, b = dx * t.nx + dz * t.nz;
    const ea = Math.max(t.a0 - a, 0, a - t.a1), eb = Math.max(t.b0 - b, 0, b - t.b1);
    return 1 - smoothstep(0, B, Math.hypot(ea, eb));
  } });
}
for (const s of SITES) bucketAdd(PADB, s.x, s.z, s.r + 45, { h: s.h, w: (x, z) => 1 - smoothstep(s.r, s.r + 45, Math.hypot(x - s.x, z - s.z)) });

// ---------------- roads & trails ----------------
export const ROADS = [];
(function buildRoads() {
  for (const t of TOWNS) {
    const a = t.kind === 'large' || t.kind === 'small' ? t.a0 - 4 : t.a0 - 10;
    ROADS.push({ pts: [townToWorld(t, a, -420), townToWorld(t, a, 420)], town: t, a });
    t.crossA = a;
  }
  // trails leave each site from its edge and join the nearest town's crossing road outside the town
  const link = (s, town) => {
    const dx = s.x - town.ox, dz = s.z - town.oz, bs = dx * town.nx + dz * town.nz;
    const bE = Math.max(-120, Math.min(town.b1 + 50, bs));
    const [ex, ez] = townToWorld(town, town.crossA, bE);
    let ux = ex - s.x, uz = ez - s.z; const L = Math.hypot(ux, uz) || 1; ux /= L; uz /= L;
    const sx = s.x + ux * (s.r + 5), sz = s.z + uz * (s.r + 5);
    const mx = (sx + ex) / 2 + (ez - sz) * 0.1, mz = (sz + ez) / 2 + (sx - ex) * 0.1;
    ROADS.push({ pts: [[sx, sz], [mx, mz], [ex, ez]] });
  };
  const byName = n => TOWNS.find(t => t.name === n);
  link(SITES[0], byName('Dry Gulch')); link(SITES[1], byName('Coyote Bend')); link(SITES[2], byName('Bitter Springs'));
  link(SITES[3], byName('Coyote Bend')); link(SITES[4], byName("Dead Man's Pass")); link(SITES[5], byName('Dry Gulch'));
  for (const s of SITES.slice(6)) {
    if (s.hidden) continue;
    let best = TOWNS[0], bd = 1e18; for (const t of TOWNS) { const d = (t.cx - s.x) ** 2 + (t.cz - s.z) ** 2; if (d < bd) { bd = d; best = t; } }
    link(s, best);
  }
  // Cinder Flats: the station yard's entrance road curls off the crossing road into the forecourt
  const cf = byName('Cinder Flats Station');
  ROADS.push({ pts: [townToWorld(cf, cf.crossA, 74), townToWorld(cf, -48, 58), townToWorld(cf, -6, 44), townToWorld(cf, 6, 42)] });
})();
const ROADB = buckets(64), RDX = [], RDZ = [];
for (const r of ROADS) {
  for (let p = 0; p < r.pts.length - 1; p++) {
    const [ax, az] = r.pts[p], [bx, bz] = r.pts[p + 1], L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 3);
    for (let q = 0; q <= n; q++) {
      const t = q / n, px = lerp(ax, bx, t) + 6 * nA(q * 0.02 + p, 3.3), pz = lerp(az, bz, t) + 6 * nA(4.1, q * 0.02 + p);
      bucketAdd(ROADB, px, pz, 0, RDX.length); RDX.push(px); RDZ.push(pz);
    }
  }
}
function roadNear(x, z) {
  const s = ROADB.size, i = Math.floor(x / s), j = Math.floor(z / s); let best = 1e18;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const L = ROADB.m.get(bk(i + a, j + b)); if (!L) continue;
    for (let n = 0; n < L.length; n++) { const q = L[n], dx = x - RDX[q], dz = z - RDZ[q], d = dx * dx + dz * dz; if (d < best) best = d; }
  }
  return Math.sqrt(best);
}

// ---------------- the full ground at one point ----------------
// S holds the answer for the last point asked: h ground height, wl water surface (-1e4 if dry), ice 1 when it is
// frozen, rd distance to the rails, rv distance to a river and its kind, pw town/site pad weight, rw road weight,
// mt mountain mask 0..255, w biome weights
export const S = { h: 0, wl: -1e4, ice: 0, rd: 100, rv: 100, rvKind: 0, pw: 0, rw: 0, mt: 0, rav: 0, w: new Float32Array(5) };
const RIVER_KIND = { dry: 1, water: 2, frozen: 3 };
export function sampleAt(x, z) {
  let h = naturalH(x, z);
  const w = S0.w, m = S0.m;
  S.w.set(w); S.mt = Math.round(m * 255); S.rav = S0.rav; S.wl = -1e4; S.ice = 0;
  if (w[2] > 0.25) S.wl = SWAMP_WL;
  // rivers
  riverNear(x, z); S.rv = Math.min(100, RIV_D); S.rvKind = 0;
  if (RIV_Q >= 0 && RIV_D < 100) {
    const R = RIVERS[RVR[RIV_Q]], i = RVI[RIV_Q], d = RIV_D;
    S.rvKind = RIVER_KIND[R.kind];
    if (R.kind === 'dry') {
      if (d < 70) {
        const u = i / R.n, depth = (6 + 26 * m) * smoothstep(0, 0.045, u) * smoothstep(1, 0.955, u), bank = 16 + depth * 0.35;
        h -= depth * (1 - smoothstep(9, 9 + bank, d));
      }
    } else {
      const bed = R.bed[i], Rr = Math.min(90, R.w + 6 + Math.max(R.depth, h - bed) * 1.2);
      if (d < Rr && h > bed) { const t = smoothstep(R.w - 1, Rr, d); h = bed + (h - bed) * t; }
      const half = (R.w - 1) + 0.4 * (Rr - R.w + 1);
      if (d < half) { S.wl = Math.max(S.wl, bed + 1.1); if (R.kind === 'frozen') S.ice = 1; }
    }
  }
  // lakes: carved basins with a shelving shore and a low lip where the ground falls away
  const LK = bucketGet(LAKEB, x, z);
  if (LK) for (let n = 0; n < LK.length; n++) {
    const L = LK[n], d = Math.hypot(x - L.x, z - L.z);
    if (d > L.r + 130) continue;
    const t = d / L.r;
    if (t < 1) h = Math.min(h, L.level - 0.4 - 5.5 * (1 - t * t) + 0.7 * smoothstep(0.85, 1, t));
    else h = Math.min(h, L.level + 0.3 + (d - L.r) * 0.45);
    if (t >= 1) h = Math.max(h, L.level + 0.3 - Math.max(0, d - L.r * 1.3) * 0.45);
    if (t < 1.3) { S.wl = Math.max(S.wl, L.level); if (L.frozen) S.ice = 1; }
  }
  // the track bed: cuttings and embankments; deep gaps and rivers are left for trestles
  railNear(x, z); S.rd = Math.min(100, RAIL_D);
  if (RAIL_K >= 0 && RAIL_D < 48) {
    const target = rail.y[RAIL_K] - 0.45;
    let wg = 1 - smoothstep(5.5, 44, RAIL_D);
    if (h < target) wg *= smoothstep(26, 52, S.rv) * smoothstep(9, 5, target - h);
    h = lerp(h, target, wg);
  }
  // town and site pads
  let pw = 0, pt = 0; const PL = bucketGet(PADB, x, z);
  if (PL) for (let n = 0; n < PL.length; n++) { const v = PL[n].w(x, z); if (v > pw) { pw = v; pt = PL[n].h; } }
  if (pw > 0) h = lerp(h, pt, pw);
  S.pw = pw;
  S.rw = 1 - smoothstep(2.2, 5.5, roadNear(x, z));
  S.h = h;
  return S;
}

// ---------------- ground colour ----------------
const C = {
  sand: [0.86, 0.69, 0.49], sand2: [0.78, 0.58, 0.39], red: [0.66, 0.36, 0.22], rock: [0.48, 0.32, 0.24], pale: [0.9, 0.82, 0.68],
  dirt: [0.64, 0.5, 0.36], road: [0.58, 0.46, 0.34], bed: [0.55, 0.5, 0.45], dark: [0.36, 0.25, 0.2], strata: [0.74, 0.5, 0.33],
  grass: [0.36, 0.43, 0.23], grass2: [0.45, 0.47, 0.27], needles: [0.3, 0.3, 0.2], fdirt: [0.42, 0.35, 0.25], frock: [0.45, 0.43, 0.4],
  moss: [0.33, 0.37, 0.21], mud: [0.31, 0.27, 0.19], wet: [0.21, 0.21, 0.15],
  b1: [0.82, 0.52, 0.32], b2: [0.64, 0.31, 0.2], b3: [0.88, 0.72, 0.52], b4: [0.56, 0.36, 0.28], bfloor: [0.66, 0.47, 0.33],
  snow: [0.93, 0.95, 0.98], snow2: [0.8, 0.85, 0.92], srock: [0.42, 0.42, 0.45], trod: [0.76, 0.76, 0.78],
  bank: [0.45, 0.4, 0.33], ice: [0.82, 0.88, 0.94], canopy: [0.17, 0.24, 0.14], canopySnow: [0.36, 0.42, 0.38],
};
const BANDS = [C.b1, C.b2, C.b3, C.b4, C.b1, C.b3];
const _c = [0, 0, 0], _o = [0, 0, 0];
const set = (c, a) => { c[0] = a[0]; c[1] = a[1]; c[2] = a[2]; };
const mix = (c, a, t) => { if (t <= 0) return; c[0] += (a[0] - c[0]) * t; c[1] += (a[1] - c[1]) * t; c[2] += (a[2] - c[2]) * t; };
// slope: 1 - normal.y. Writes the colour into out (array of 3)
// far: seen from kilometres away, where no trees are drawn, so woodland is darkened to read as forest
export function groundColor(s, slope, x, z, out, far = false) {
  const h = s.h, w = s.w, m = s.mt / 255, n1 = cn(x * 0.004, z * 0.004), n2 = cn2(x * 0.03, z * 0.03);
  const cliff = smoothstep(0.12, 0.35, slope);
  _o[0] = _o[1] = _o[2] = 0;
  const add = k => { _o[0] += _c[0] * k; _o[1] += _c[1] * k; _o[2] += _c[2] * k; };
  if (w[0] > 0.004) {
    set(_c, C.sand); mix(_c, C.sand2, smoothstep(-0.3, 0.5, n1) * 0.8); mix(_c, C.red, smoothstep(0.05, 0.35, m) * 0.6);
    const sea = duneSea(x, z); if (sea > 0) { mix(_c, C.pale, sea * 0.3); mix(_c, C.sand, sea * 0.4); } // clean wind-sorted sand in the dune sea
    const strata = 0.5 + 0.5 * Math.sin(h * 0.55 + n1 * 3);
    if (cliff > 0) { mix(_c, strata > 0.6 ? C.red : strata > 0.3 ? C.rock : C.strata, cliff); mix(_c, C.dark, cliff * smoothstep(0.4, 0.7, slope) * 0.6); }
    mix(_c, C.rock, smoothstep(140, 280, h) * 0.5);
    add(w[0]);
  }
  if (w[1] > 0.004) {
    set(_c, C.grass); mix(_c, C.grass2, smoothstep(-0.3, 0.5, n1) * 0.7); mix(_c, C.needles, smoothstep(0.0, 0.6, n2) * 0.45);
    mix(_c, C.fdirt, smoothstep(0.08, 0.2, slope) * 0.6); mix(_c, C.frock, cliff * 0.9);
    if (far) mix(_c, C.canopy, 0.7 * (1 - cliff));
    add(w[1]);
  }
  if (w[2] > 0.004) {
    set(_c, C.moss); mix(_c, C.mud, smoothstep(-0.2, 0.4, n1) * 0.8); mix(_c, C.wet, (1 - smoothstep(0, 1.4, h - SWAMP_WL)) * 0.85);
    add(w[2]);
  }
  if (w[3] > 0.004) {
    const bi = Math.floor(h * 0.16 + n1 * 1.6 + 40) % BANDS.length;
    set(_c, BANDS[bi]); mix(_c, C.bfloor, (1 - cliff) * 0.45); mix(_c, C.dark, cliff * smoothstep(0.45, 0.75, slope) * 0.5);
    mix(_c, C.bfloor, smoothstep(0.2, 0.7, s.rav || 0) * 0.5);
    add(w[3]);
  }
  if (w[4] > 0.004) {
    set(_c, C.snow); mix(_c, C.snow2, smoothstep(-0.3, 0.6, n1) * 0.55); mix(_c, C.srock, smoothstep(0.32, 0.55, slope));
    if (far) mix(_c, C.canopySnow, 0.45 * (1 - smoothstep(380, 520, h)) * (1 - cliff));
    add(w[4]);
  }
  // high ground keeps its snow in every region
  const cap = smoothstep(470, 590, h + n1 * 60) * (1 - smoothstep(0.38, 0.6, slope) * 0.7);
  mix(_o, C.snow, cap);
  const sn = w[4], wet = w[1] + w[2];
  if (s.rvKind === 1 && s.rv < 30) mix(_o, C.pale, (1 - smoothstep(8, 26, s.rv)) * 0.85);
  if (s.rvKind >= 2 && s.rv < 30) mix(_o, sn > 0.5 ? C.trod : C.bank, (1 - smoothstep(10, 26, s.rv)) * 0.7);
  if (s.pw > 0) { set(_c, C.dirt); mix(_c, C.fdirt, wet); mix(_c, C.trod, sn); mix(_o, _c, smoothstep(0.55, 0.95, s.pw) * 0.7); }
  if (s.rw > 0) { set(_c, C.road); mix(_c, C.fdirt, wet); mix(_c, C.trod, sn); mix(_o, _c, s.rw * 0.8); }
  if (s.rd < 8) mix(_o, C.bed, (1 - smoothstep(3, 7.5, s.rd)) * 0.6);
  const v = 0.93 + n2 * 0.07;
  out[0] = _o[0] * v; out[1] = _o[1] * v; out[2] = _o[2] * v;
  return out;
}

// ---------------- streamed tiles ----------------
// tile i covers x from -HALF + i*TILE; each holds the ground and every field gameplay needs, at the mesh's resolution
export const TILES = new Map();
export const tkey = (i, j) => i * 65536 + j;
export const tileOf = (x, z) => [Math.floor((x + HALF) / TILE), Math.floor((z + HALF) / TILE)];
export function newTile(i, j) { return { i, j, x0: -HALF + i * TILE, z0: -HALF + j * TILE, ready: false }; }
// a generator: does a few rows per step so the frame rate holds while the land is worked out
export function* tileJob(t) {
  const N = TV + 2, Hb = new Float32Array(N * N), n = TV * TV;
  t.H = new Float32Array(n); t.RD = new Float32Array(n); t.RV = new Float32Array(n); t.PW = new Float32Array(n); t.RW = new Float32Array(n);
  t.WL = new Float32Array(n); t.MT = new Uint8Array(n); t.ICE = new Uint8Array(n); t.BW = new Uint8Array(n * 5); t.RK = new Uint8Array(n); t.RAV = new Uint8Array(n);
  t.NRM = new Float32Array(n * 3); t.COL = new Float32Array(n * 3);
  let wet = false, minH = 1e9, maxH = -1e9, swamp = 0;
  for (let jj = 0; jj < N; jj++) {
    const z = t.z0 + (jj - 1) * CELL;
    for (let ii = 0; ii < N; ii++) {
      const x = t.x0 + (ii - 1) * CELL;
      sampleAt(x, z);
      Hb[jj * N + ii] = S.h;
      if (ii >= 1 && ii <= TV && jj >= 1 && jj <= TV) {
        const o = (jj - 1) * TV + (ii - 1);
        t.H[o] = S.h; t.RD[o] = S.rd; t.RV[o] = S.rv; t.PW[o] = S.pw; t.RW[o] = S.rw; t.WL[o] = S.wl; t.MT[o] = S.mt; t.ICE[o] = S.ice; t.RK[o] = S.rvKind;
        t.RAV[o] = Math.round(clamp(S0.rav, 0, 1) * 255);
        for (let b = 0; b < 5; b++) t.BW[o * 5 + b] = Math.round(S.w[b] * 255);
        if (S.wl > S.h) wet = true;
        if (S.h < minH) minH = S.h; if (S.h > maxH) maxH = S.h;
        swamp += S.w[2];
      }
    }
    if (jj % 4 === 3) yield;
  }
  // normals from the bordered grid, then colours
  const s = { h: 0, w: new Float32Array(5), mt: 0, rv: 0, rvKind: 0, pw: 0, rw: 0, rd: 0, rav: 0 }, col = [0, 0, 0];
  for (let j = 0; j < TV; j++) {
    for (let i = 0; i < TV; i++) {
      const b = (j + 1) * N + (i + 1);
      let nx = Hb[b - 1] - Hb[b + 1], ny = 2 * CELL, nz = Hb[b - N] - Hb[b + N]; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const o = j * TV + i; t.NRM[o * 3] = nx; t.NRM[o * 3 + 1] = ny; t.NRM[o * 3 + 2] = nz;
      s.h = t.H[o]; for (let q = 0; q < 5; q++) s.w[q] = t.BW[o * 5 + q] / 255; s.mt = t.MT[o]; s.rv = t.RV[o]; s.rvKind = t.RK[o]; s.pw = t.PW[o]; s.rw = t.RW[o]; s.rd = t.RD[o]; s.rav = t.RAV[o] / 255;
      groundColor(s, 1 - ny, t.x0 + i * CELL, t.z0 + j * CELL, col);
      t.COL[o * 3] = col[0]; t.COL[o * 3 + 1] = col[1]; t.COL[o * 3 + 2] = col[2];
    }
    if (j % 24 === 23) yield;
  }
  t.wet = wet; t.minH = minH; t.maxH = maxH; t.swamp = swamp / n;
  t.ready = true;
}
function tileAt(x, z) {
  const t = TILES.get(tkey(Math.floor((x + HALF) / TILE), Math.floor((z + HALF) / TILE)));
  return t && t.ready ? t : null;
}
export function heightAt(x, z) {
  const t = tileAt(x, z);
  if (t) {
    const u0 = (x - t.x0) / CELL, v0 = (z - t.z0) / CELL;
    let i = Math.floor(u0), j = Math.floor(v0); if (i > TS - 1) i = TS - 1; if (j > TS - 1) j = TS - 1; if (i < 0) i = 0; if (j < 0) j = 0;
    const u = u0 - i, v = v0 - j, o = j * TV + i, H = t.H;
    // same triangle split as the mesh (diagonal from (i, j+1) to (i+1, j))
    if (u + v < 1) return H[o] + (H[o + 1] - H[o]) * u + (H[o + TV] - H[o]) * v;
    return H[o + TV + 1] + (H[o + TV] - H[o + TV + 1]) * (1 - u) + (H[o + 1] - H[o + TV + 1]) * (1 - v);
  }
  return sampleAt(x, z).h;
}
// field names for gridSample (kept from the old fixed grid so towns and stations read them the same way)
export const railD = 'RD', riverD = 'RV', padW = 'PW', roadW = 'RW', mtn = 'MT', waterL = 'WL', iceF = 'ICE';
const POINT = { RD: 'rd', RV: 'rv', PW: 'pw', RW: 'rw', MT: 'mt', WL: 'wl', ICE: 'ice' };
export function gridSample(field, x, z) {
  const t = tileAt(x, z);
  if (t) { const i = clamp(Math.round((x - t.x0) / CELL), 0, TS), j = clamp(Math.round((z - t.z0) / CELL), 0, TS); return t[field][j * TV + i]; }
  const s = sampleAt(x, z); return field === 'RAV' ? s.rav * 255 : s[POINT[field]];
}
// biome weights at a point (into out)
export function biomeAt(x, z, out = new Float32Array(5)) {
  const t = tileAt(x, z);
  if (t) { const i = clamp(Math.round((x - t.x0) / CELL), 0, TS), j = clamp(Math.round((z - t.z0) / CELL), 0, TS), o = (j * TV + i) * 5; for (let b = 0; b < 5; b++) out[b] = t.BW[o + b] / 255; return out; }
  return biomeWeights(x, z, out);
}
export function slopeAt(x, z) {
  const e = 2;
  const dx = heightAt(x + e, z) - heightAt(x - e, z), dz = heightAt(x, z + e) - heightAt(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

// ground level all along the line, for finding where trestles are needed (a few rows per call)
export async function computeRailGround(progress) {
  for (let k = 0; k <= RN; k++) {
    rail.ground[k] = sampleAt(rail.x[k], rail.z[k]).h;
    if (k % 1500 === 0) { progress && progress(k / RN); await new Promise(r => requestAnimationFrame(r)); }
  }
}
