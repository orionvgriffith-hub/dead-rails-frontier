// Towns, stations and isolated landmark sites
import * as THREE from 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/three.module.js';
import { TOWNS, SITES, townToWorld, heightAt, rail, railAt, gridSample, roadW, SWAMP_WL } from './world.js';
import { dominantBiome, DESERT, FOREST, SWAMP, BADLANDS, SNOW } from './biomes.js';
import { registerLoot, registerHeat } from './game/registry.js';
import { railNearest } from './rail.js';
import { Builder, CIRCLES } from './builder.js';
import { MAT } from './textures.js';
import { building, waterTower, DEFAULTS } from './buildings.js';
import { sign, Y0, chest, safe, locker, stove } from './parts.js';
import { addProp } from './props.js';
import { buildDepot } from './depot.js';
import { specialSites, storyProps } from './special.js';
import { makeNoise } from './noise.js';

const PI = Math.PI;
export const ANIMATED = [];
export const LAMP_SPOTS = [];
const VANE = new THREE.MeshStandardMaterial({ color: 0x8a8078, metalness: 0.5, roughness: 0.6 });
const PAINTS = ['woodGrey', 'woodGrey', 'woodRed', 'woodWhite', 'woodOchre', 'woodBlue', 'woodGreen'];
// each region builds its own way: log-dark timber in the forest, weathered grey and green in the bayou, adobe-warm
// ochre and red in the badlands, dark timber under heavy snow-laden roofs in the mountains
const STYLE = [
  { paints: PAINTS, roofs: ['tin', 'shingle'] },
  { paints: ['woodDark', 'woodDark', 'woodGrey', 'woodRed', 'woodGreen'], roofs: ['shingle', 'shingle', 'tin'] },
  { paints: ['woodGrey', 'woodGrey', 'woodGreen', 'woodBlue', 'woodWhite'], roofs: ['tin', 'tin', 'shingle'] },
  { paints: ['woodOchre', 'woodOchre', 'woodRed', 'brick', 'woodGrey'], roofs: ['tin', 'shingle'] },
  { paints: ['woodDark', 'woodDark', 'woodRed', 'woodGrey', 'woodWhite'], roofs: ['snowroof'] },
];
const styleOf = t => STYLE[t.biome ?? DESERT];
const paintFor = (t, rnd) => { const p = styleOf(t).paints; return p[Math.floor(rnd() * p.length)]; };
const roofFor = (t, rnd) => { const r = styleOf(t).roofs; return r[Math.floor(rnd() * r.length)]; };
const T4 = (x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));
function scaleUV(g, su, sv) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return g; }
const heading = (tx, tz) => Math.atan2(-tz, tx);

function P(type, x, z, ry, s = 1, o) { addProp(type, x, heightAt(x, z), z, ry, s, o); }

function tankTop(B, legH) {
  B.geom('woodGrey', scaleUV(new THREE.CylinderGeometry(3.1, 3.1, 4.2, 28, 1, true), 19.5, 4.2), T4(0, legH + 2.3, 0));
  B.geom('woodDark', new THREE.CircleGeometry(3.1, 28), T4(0, legH + 0.21, 0, -PI / 2));
  for (const y of [0.6, 1.6, 2.6, 3.6]) B.geom('iron', new THREE.TorusGeometry(3.14, 0.03, 4, 32), T4(0, legH + 0.2 + y, 0, PI / 2));
  B.geom('shingle', scaleUV(new THREE.ConeGeometry(3.5, 1.9, 28, 1, true), 11, 2), T4(0, legH + 5.35, 0));
  B.box('woodDark', 0, legH + 1.2, 3.9, 0.4, 0.3, 2.6, { rx: -0.35, col: false });
  B.box('iron', 0, legH - 0.6, 4.8, 0.05, 2.6, 0.05, { col: false });
  for (let y = 0.4; y < legH + 4; y += 0.4) B.box('woodDark', -2.3, y, 2.3, 0.5, 0.05, 0.05, { ry: PI / 4, col: false });
}
function placeWaterTower(B, x, y, z, ry) {
  B.begin(x, y, z, ry); const { legH } = waterTower(B); tankTop(B, legH);
}
// water tower beside the track at (a, b), slid away from the line if a curve brings the track too close
function towerAt(B, t, a, b) {
  for (let i = 0; i < 12; i++, b += 1.5) {
    const [x, z] = townToWorld(t, a, b);
    if (footprintClear(x, z, 0, 6.8, 6.8, 0, 3.6) || i === 11) { placeWaterTower(B, x, t.h, z, Math.atan2(-t.nx, -t.nz)); return; }
  }
}

// does a footprint (centre x,z, facing ry, size w×d, plus porch depth in front) keep off the rails and the trails?
export function footprintClear(x, z, ry, w, d, front = 0, railGap = 4.2) {
  const c = Math.cos(ry), s = Math.sin(ry);
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
    const lx = -w / 2 - 0.5 + (w + 1) * i / 4, lz = -d / 2 - 0.5 + (d + 1 + front) * j / 4;
    const px = x + c * lx + s * lz, pz = z - s * lx + c * lz;
    const rn = railNearest(px, pz);
    if (rn && Math.abs(rn.lat) < railGap && Math.abs(rn.along) < 3) return false;
    if (gridSample(roadW, px, pz) > 0.3) return false;
  }
  return true;
}
// build a site building, nudging it off any trail that crosses its spot
let CUR_SITE = null;
function siteBuilding(B, x, y, z, ry, spec, rnd) {
  if (!spec.roofMat && CUR_SITE) spec.roofMat = roofFor(CUR_SITE, rnd);
  const d0 = DEFAULTS[spec.type], w = spec.w || d0.w, d = spec.d || d0.d;
  for (let r = 0; r <= 24; r += 3) {
    for (let k = 0; k < (r ? 8 : 1); k++) {
      const a = k / 8 * PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (footprintClear(px, pz, ry, w, d, 3)) { B.begin(px, y, pz, ry); return building(B, spec, rnd); }
    }
  }
  B.begin(x, y, z, ry); return building(B, spec, rnd);
}

function place(B, t, spec, a, b, facing, rnd) {
  if (!spec.roofMat) spec.roofMat = roofFor(t, rnd);
  let x, z; const dx = t.nx * facing, dz = t.nz * facing;
  const ry = Math.atan2(dx, dz), porch = spec.porch === 'none' || (DEFAULTS[spec.type] || {}).porch === 'none' ? 1.5 : 4.6;
  // buildings beside the track slide away from it; street buildings that would sit on a trail or the line are left out
  for (let i = 0; ; i++) {
    [x, z] = townToWorld(t, a, b);
    if (footprintClear(x, z, ry, spec.w, spec.d, porch)) break;
    if (!spec.nearTrack) return null;
    if (i >= 10) break;
    b += 1.5;
  }
  B.begin(x, t.h, z, ry);
  const ctx = building(B, spec, rnd);
  // porch dressing
  const fz = spec.d / 2 + 1.6;
  const loc = (lx, lz) => [x + Math.cos(ry) * lx + Math.sin(ry) * lz, z - Math.sin(ry) * lx + Math.cos(ry) * lz];
  if (rnd() < 0.7) { const [px, pz] = loc(spec.w / 2 - 0.6, fz); addProp('barrel', px, t.h + Y0 - 0.02, pz, rnd() * 6); }
  if (rnd() < 0.5) { const [px, pz] = loc(-spec.w / 2 + 0.7, fz - 0.3); addProp('crate', px, t.h + Y0 - 0.02, pz, ry + rnd() * 0.4); }
  if (rnd() < 0.4) { const [px, pz] = loc(spec.w / 2 - 0.8, fz + 2.6); P('trough', px, pz, ry); }
  if (rnd() < 0.35) { const [px, pz] = loc(0.8, fz + 0.8); addProp('lantern', px, t.h + Y0 + 2.5, pz, 0); LAMP_SPOTS.push([px, t.h + Y0 + 2.4, pz]); }
  return ctx;
}

// what sets each town apart beyond its street list: how well it's kept (glass, paint, how many places are falling in),
// which buildings got brick fronts when money came, what colour the curtains are, and any works out back
const CHARACTER = {
  'Dry Gulch': { kept: 0.8, brick: ['bank', 'sheriff'], curtain: 0x8a2a2a },
  'Coyote Bend': { kept: 0.6, brick: ['bank'], curtain: 0x6a5a2a },
  'Bitter Springs': { kept: 0.25 },
  'Elk Hollow': { kept: 0.7, curtain: 0x2a4a3a },
  'Timberline Mill': { kept: 0.45 },
  'Bayou Landing': { kept: 0.35, curtain: 0xd8ccb0 },
  Redstone: { kept: 0.35, mill: true },
  'Copper Canyon': { kept: 0.65, brick: ['bank', 'hotel'], curtain: 0x8a4a2a, mill: true },
  Silverpeak: { kept: 0.85, brick: ['bank', 'hotel', 'clinic'], curtain: 0x3a2a5a, mill: true },
};
const CHAR_DEFAULT = { kept: 0.5 };
const charOf = t => CHARACTER[t.name] || CHAR_DEFAULT;
// trades that keep the doors open: these are mostly intact even in a run-down town
const TRADES = new Set(['saloon', 'store', 'hotel', 'bank', 'sheriff', 'shop', 'smithy', 'clinic']);
function damageFor(t, type, rnd) {
  const k = charOf(t).kept, p0 = TRADES.has(type) ? 0.3 + 0.6 * k : 0.15 + 0.5 * k, p1 = p0 + (1 - p0) * 0.65, r = rnd();
  return r < p0 ? 0 : r < p1 ? 1 : 2;
}

function fillRow(B, t, list, a0, a1, bFront, facing, rnd) {
  let a = a0;
  const ch = charOf(t);
  for (const item of list) {
    const [type, label] = item.split(':');
    const d0 = DEFAULTS[type];
    const spec = { type, w: d0.w + (rnd() - 0.5) * 1.2, d: d0.d + (rnd() - 0.5) * 1.5, damage: damageFor(t, type, rnd), kept: ch.kept };
    if (type === 'church') spec.damage = Math.min(1, spec.damage);
    if (!d0.paint) spec.paint = paintFor(t, rnd);
    if (ch.brick && ch.brick.includes(type) && spec.damage < 2) spec.paint = 'brick';
    if (ch.curtain) spec.curtain = ch.curtain;
    if (label) spec.sign = label;
    if (type === 'barn') { spec.w = 10; spec.d = 13; }
    if (a + spec.w > a1) break;
    const b = bFront - facing * spec.d / 2;
    place(B, t, spec, a + spec.w / 2, b, facing, rnd);
    a += spec.w + 0.8 + rnd() * 3.5;
  }
}

function platform(B, t, s0, s1) {
  const side = t.side;
  for (let s = s0; s < s1; s += 6) {
    const p = railAt(s + 3); B.begin(p.x, t.h, p.z, heading(p.tx, p.tz));
    B.box('stone', 0, 0.37, side * 4.45, 6.02, 0.74, 4.1);
    B.box('woodDark', 0, 0.76, side * 2.5, 6.02, 0.06, 0.3, { col: false });
  }
  for (const s of [s0 - 1.5, s1 + 1.5]) { const p = railAt(s); B.begin(p.x, t.h, p.z, heading(p.tx, p.tz)); B.box('stone', 0, 0.2, side * 4.45, 3, 0.4, 4.1); }
  for (const [s, f] of [[s0 + 2, 0], [s1 - 2, 0]]) {
    const p = railAt(s); B.begin(p.x, t.h, p.z, heading(p.tx, p.tz) + (side > 0 ? 0 : PI));
    for (const x of [-1.6, 1.6]) B.box('woodDark', x, 0.75 + 1.2, 5.6, 0.12, 2.4, 0.12);
    sign(B, t.name.toUpperCase(), 0, 0.75 + 2.1, 5.62, 3.0, 0.55, 0, { bg: '#e9dcc0', fg: '#2a1c12' });
  }
}

function station(B, t, rnd, w = 13) {
  const d = 7, b = 6.7 + d / 2;
  const ctx = place(B, t, { type: 'station', w, d, damage: rnd() < 0.5 ? 1 : 0, nearTrack: true }, 0, b, -1, rnd);
  sign(B, t.name.toUpperCase(), 0, 3.45, d / 2 + 0.06, Math.min(6, w * 0.45), 0.6, 0, { bg: '#2c3a2a', fg: '#efe2c4' });
  // timetable board + bench under canopy
  B.box('woodDark', 3.2, 1.8, d / 2 + 0.1, 1.2, 1.4, 0.05, { col: false });
  B.box('paper', 3.2, 1.8, d / 2 + 0.13, 1.0, 1.2, 0.01, { col: false });
  const s0 = t.k * rail.ds - 24, s1 = t.k * rail.ds + 24;
  platform(B, t, s0, s1);
  const [lx, lz] = townToWorld(t, -3, 6.2); addProp('lantern', lx, t.h + 2.9, lz, 0); LAMP_SPOTS.push([lx, t.h + 2.8, lz]);
  const [lx2, lz2] = townToWorld(t, 3, 6.2); addProp('lantern', lx2, t.h + 2.9, lz2, 0);
  for (const a of [-8, 8]) { const [x, z] = townToWorld(t, a, 5); addProp('crate', x, t.h + 0.75, z, rnd() * 3); }
  const [bx, bz] = townToWorld(t, 10, 5.2); addProp('barrel', bx, t.h + 0.75, bz, 1);
  return ctx;
}

function scatterTownProps(t, rnd) {
  const L = t.len;
  for (let i = 0; i < Math.round(L / 9); i++) {
    const a = (rnd() - 0.5) * L, b = t.streetB + (rnd() - 0.5) * 12;
    const [x, z] = townToWorld(t, a, b), r = rnd();
    const type = r < 0.08 ? 'wagon' : r < 0.18 ? 'cart' : r < 0.35 ? 'barrel' : r < 0.45 ? 'crate' : r < 0.55 ? 'wheel' : r < 0.65 ? 'hay' : r < 0.75 ? 'sack' : r < 0.85 ? 'rockFlat' : 'grass';
    if ((type === 'wagon' || type === 'cart') && Math.abs(b - t.streetB) > 4) continue;
    P(type, x, z, rnd() * 6.28, type === 'rockFlat' ? 0.4 : 1);
  }
  for (let i = 0; i < 40; i++) { const [x, z] = townToWorld(t, (rnd() - 0.5) * L * 1.1, t.b0 + rnd() * (t.b1 - t.b0)); P(rnd() < 0.6 ? 'grass' : 'bush', x, z, rnd() * 6, 0.6 + rnd() * 0.6); }
  const [sx, sz] = townToWorld(t, t.crossA - 3, t.streetB - 6); P('signpost', sx, sz, rnd() * 6);
}

function corral(t, a, b, w, d, rnd) {
  for (const [ea, eb, len, ang] of [[0, -d / 2, w, 0], [0, d / 2, w, 0], [-w / 2, 0, d, PI / 2], [w / 2, 0, d, PI / 2]]) {
    const n = Math.round(len / 2.7);
    for (let i = 0; i < n; i++) {
      if (eb === d / 2 && i === Math.floor(n / 2)) continue;
      const off = -len / 2 + (i + 0.5) * len / n;
      const [x, z] = ang === 0 ? townToWorld(t, a + off, b + eb) : townToWorld(t, a + ea, b + off);
      const ry = Math.atan2(-(ang === 0 ? t.tz : t.nz), ang === 0 ? t.tx : t.nx);
      P(rnd() < 0.25 ? 'fenceBroken' : 'fence', x, z, ry);
    }
  }
  for (let i = 0; i < 3; i++) { const [x, z] = townToWorld(t, a + (rnd() - 0.5) * w * 0.6, b + (rnd() - 0.5) * d * 0.6); P(rnd() < 0.5 ? 'hay' : 'trough', x, z, rnd() * 6); }
}

// a stamp mill behind the mining towns: a tall shed on a stone footing with the stamp battery inside,
// an ore bin on a trestle at the back, a smokestack, and grey tailings spilling down the side
function stampMill(B, t, a, b, rnd) {
  const ry = Math.atan2(-t.nx, -t.nz); // the doors face the street
  const [x, z] = townToWorld(t, a, b);
  if (!footprintClear(x, z, ry, 12, 24, 2)) return;
  B.begin(x, heightAt(x, z), z, ry);
  B.box('stone', 0, -1.0, -2, 11, 2.8, 17);
  building(B, { type: 'warehouse', w: 10, d: 12, wallH: 6.2, sign: 'STAMP MILL', damage: charOf(t).kept < 0.4 ? 1 : 0, kept: charOf(t).kept, paint: 'woodGrey', roofMat: 'tin', noFurnish: true }, rnd);
  const y = Y0;
  // the battery: five iron stems in a timber frame, dropping into a mortar box, lifted by cams on a shaft
  for (const sx of [-1.7, 1.7]) B.box('woodDark', sx, y + 2.4, -3, 0.35, 4.8, 0.35);
  B.box('woodDark', 0, y + 4.7, -3, 3.8, 0.3, 0.4, { col: false });
  B.box('iron', 0, y + 0.45, -3, 3.4, 0.9, 1.0);
  for (let i = 0; i < 5; i++) {
    const sx = -1.2 + i * 0.6, lift = rnd() * 0.25;
    B.box('iron', sx, y + 2.6 + lift, -3, 0.1, 3.2, 0.1, { col: false });
    B.box('iron', sx, y + 3.1 + lift, -3.12, 0.22, 0.14, 0.22, { col: false });
  }
  B.box('iron', 0, y + 3.9, -3.4, 4.0, 0.18, 0.18, { col: false });
  B.box('woodDark', 2.2, y + 3.9, -3.4, 0.2, 1.6, 1.6, { col: false });
  // amalgamation tables sloping out from the mortar, and a feed hopper behind it
  B.box('metal', 0, y + 0.95, -1.6, 2.8, 0.06, 1.8, { rx: 0.14 });
  B.box('woodGrey', 0, y + 1.8, -4.6, 2.4, 1.2, 1.2, { rx: -0.2 });
  for (let i = 0; i < 6; i++) B.box('stone', -1.5 + rnd() * 3, y + 0.12, 2 + rnd() * 3, 0.3 + rnd() * 0.3, 0.2, 0.3, { ry: rnd() * 3, col: false });
  // ore bin on a trestle behind the mill, with a chute through the back wall
  const bz = -9.2;
  for (const sx of [-2.4, 2.4]) for (const sz of [-1.2, 1.2]) B.box('woodDark', sx, 1.6, bz + sz, 0.3, 3.6, 0.3);
  B.box('woodGrey', 0, 4.6, bz, 5.6, 2.4, 3.0);
  B.box('woodDark', 0, 5.85, bz, 5.9, 0.12, 3.3, { col: false });
  B.box('woodGrey', 0, 4.0, bz + 2.2, 1.0, 0.12, 2.0, { rx: 0.5, col: false });
  for (const sx of [-2.4, 2.4]) B.box('woodDark', sx, 2.2, bz, 0.12, 0.12, 2.6, { rx: 0.9, col: false });
  // smokestack for the boiler
  B.geom('iron', new THREE.CylinderGeometry(0.4, 0.45, 15, 10), new THREE.Matrix4().makeTranslation(3.6, 7.9, -4.5));
  B.addCollider(3.15, 0, -4.95, 4.05, 15, -4.05);
  // tailings
  B.box('stone', 7.8, 0.25, 1.5, 6, 0.6, 7, { ry: 0.25, rz: 0.08, col: false, c: 0xb8ab94 });
  B.box('stone', 9.5, 0.1, 3.5, 4, 0.4, 4, { ry: 0.7, rz: 0.05, col: false, c: 0xa89c86 });
  // ore cars on a short spur out front, timbers and drums lying about
  const [mx, mz] = townToWorld(t, a + 2, b - 9); P('minecart', mx, mz, ry + PI / 2);
  const [sx, sz] = townToWorld(t, a - 1, b - 9); P('sleepers', sx, sz, ry + PI / 2);
  for (let i = 0; i < 4; i++) { const [px, pz] = townToWorld(t, a - 6 + rnd() * 3, b - 6 + rnd() * 6); P(rnd() < 0.5 ? 'barrel' : 'crate', px, pz, rnd() * 6); }
  const [lx, lz] = townToWorld(t, a + 5, b - 7); addProp('lantern', lx, heightAt(lx, lz) + 2.6, lz, 0); LAMP_SPOTS.push([lx, heightAt(lx, lz) + 2.5, lz]);
}

// street lists run in order until the row is full, so the trades come before the houses and barns
const ROWS = {
  'Dry Gulch': {
    near: ['saloon:THE LUCKY STRIKE', 'store:GENERAL STORE', 'shop:BARBER', 'sheriff:SHERIFF', 'bank:BANK', 'shop:ASSAY OFFICE', 'shop:TELEGRAPH', 'house'],
    far: ['hotel:GRAND HOTEL', 'shop:GUNSMITH', 'clinic:DOCTOR', 'shop:UNDERTAKER', 'smithy:BLACKSMITH', 'store:FEED & SEED', 'church', 'shop:TAILOR', 'barn'],
    back: 9,
  },
  'Coyote Bend': {
    near: ['hotel:PALACE HOTEL', 'shop:DRY GOODS', 'saloon:SALOON', 'shop:UNDERTAKER', 'sheriff:MARSHAL', 'house', 'store:MERCANTILE'],
    far: ['church', 'shop:DRESSMAKER', 'shop:DENTIST', 'saloon:THE GOLDEN SPUR', 'bank:BANK', 'shop:GUNSMITH', 'smithy:SMITH & FARRIER', 'house'],
    back: 8,
  },
  'Bitter Springs': { near: ['saloon:SALOON', 'shop:POST OFFICE', 'house'], far: ['store:GENERAL STORE', 'house', 'church', 'house'], back: 0 },
  'Elk Hollow': {
    near: ['saloon:THE TIMBER WOLF', 'store:TRADING POST', 'shop:SAWMILL OFFICE', 'sheriff:SHERIFF', 'hotel:ELK LODGE', 'shop:FURRIER'],
    far: ['church', 'store:LUMBER & HARDWARE', 'smithy:BLACKSMITH', 'bank:BANK', 'clinic:DOCTOR', 'house', 'barn'],
    back: 8,
  },
  'Timberline Mill': { near: ['saloon:THE AXE & SAW', 'shop:MILL OFFICE', 'house'], far: ['store:GENERAL STORE', 'barn', 'house', 'house'], back: 3 },
  'Bayou Landing': { near: ['saloon:THE CROOKED HERON', 'shop:BAIT & TACKLE', 'house'], far: ['store:BAYOU MERCANTILE', 'church', 'house', 'house'], back: 2 },
  Redstone: { near: ['saloon:THE DUSTY ROSE', 'shop:ASSAYER', 'house'], far: ['store:MINERS SUPPLY', 'house', 'church', 'house'], back: 2 },
  'Copper Canyon': {
    near: ['hotel:COPPER QUEEN HOTEL', 'saloon:SALOON', 'shop:ASSAY OFFICE', 'sheriff:MARSHAL', 'store:MINING SUPPLY', 'shop:POWDER & FUSE'],
    far: ['bank:BANK', 'clinic:COMPANY DOCTOR', 'shop:SMELTER OFFICE', 'saloon:THE RED DOG', 'smithy:BLACKSMITH', 'church', 'shop:GUNSMITH', 'house'],
    back: 7,
  },
  Silverpeak: {
    near: ['hotel:GRAND ALPINE HOTEL', 'store:SNOWY GENERAL STORE', 'saloon:THE SILVER BELL', 'shop:OUTFITTER', 'sheriff:SHERIFF', 'shop:ASSAY OFFICE'],
    far: ['church', 'clinic:HOSPITAL', 'bank:BANK', 'shop:FURS & WOOLENS', 'smithy:BLACKSMITH', 'shop:TAILOR', 'house', 'barn'],
    back: 7,
  },
};
const ROWS_DEFAULT = { near: ['saloon:SALOON', 'store:GENERAL STORE', 'house'], far: ['house', 'church', 'house'], back: 2 };

// a lit fire: warms whoever stands close, lights the night, flickers in the wind
const FLAME = (() => {
  const c = document.createElement('canvas'); c.width = 32; c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(16, 46, 2, 16, 40, 30); gr.addColorStop(0, 'rgba(255,240,180,1)'); gr.addColorStop(0.35, 'rgba(255,150,40,0.9)'); gr.addColorStop(1, 'rgba(200,40,0,0)');
  g.fillStyle = gr; g.beginPath(); g.ellipse(16, 40, 13, 24, 0, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
export function lightFire(scene, x, y, z, k = 1) {
  addProp('campfire', x, y, z, Math.random() * 6, k);
  const m = new THREE.SpriteMaterial({ map: FLAME, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const sp = new THREE.Sprite(m); sp.position.set(x, y + 0.55 * k, z); sp.scale.set(0.9 * k, 1.3 * k, 1); scene.add(sp);
  const ph = Math.random() * 10;
  ANIMATED.push(t => { const f = 0.85 + 0.15 * Math.sin(t * 13 + ph) * Math.sin(t * 7.7 + ph); sp.scale.set(0.9 * k * f, 1.3 * k * (0.9 + 0.2 * f), 1); m.opacity = 0.75 + 0.25 * f; });
  LAMP_SPOTS.push([x, y + 0.7, z]);
  return registerHeat(x, y, z, 3.6 * k, 28, 'fire');
}

export function buildSettlements(scene, rnd) {
  const B = new Builder();
  const out = [];
  Object.assign(SITE_BUILD, specialSites({ P, ANIMATED, LAMP_SPOTS, lightFire, trees, siteBuilding }, scene));
  for (const t of TOWNS) {
    t.biome = dominantBiome(t.cx, t.cz);
    if (t.kind === 'large' || t.kind === 'small') {
      const rows = ROWS[t.name] || ROWS_DEFAULT;
      station(B, t, rnd);
      towerAt(B, t, -t.len / 2 + 6, 9.2);
      if (t.kind === 'large') {
        place(B, t, { type: 'warehouse', w: 12, d: 18, damage: 1, paint: 'woodGrey', nearTrack: true }, t.len / 2 - 10, 8 + 9, -1, rnd);
        fillRow(B, t, rows.near, -t.len / 2 + 16, t.len / 2 - 22, t.streetB - 9, 1, rnd);
      } else fillRow(B, t, rows.near, -t.len / 2 + 14, t.len / 2, t.streetB - 9, 1, rnd);
      fillRow(B, t, rows.far, -t.len / 2 + 2, t.len / 2 + 10, t.streetB + 9, -1, rnd);
      let a = -t.len / 2 + 10;
      for (let i = 0; i < rows.back; i++) {
        const spec = { type: 'house', w: 6 + rnd() * 2, d: 6.5 + rnd() * 2, damage: damageFor(t, 'house', rnd), kept: charOf(t).kept, curtain: charOf(t).curtain, paint: paintFor(t, rnd) };
        const f = rnd() < 0.5 ? 1 : -1;
        place(B, t, spec, a + spec.w / 2, t.streetB + 40 + rnd() * 8, f, rnd);
        a += spec.w + 8 + rnd() * 14; if (a > t.len / 2) break;
      }
      if (t.kind === 'large') corral(t, t.len / 2 - 14, t.streetB + 46, 22, 16, rnd);
      if (charOf(t).mill) stampMill(B, t, t.kind === 'large' ? -t.len / 4 : t.len / 2 - 2, t.streetB + (t.kind === 'large' ? 63 : 30), rnd);
      scatterTownProps(t, rnd);
      townDressing(B, t, rnd, scene);
    } else if (t.kind === 'depot') {
      buildDepot(B, t, rnd, { LAMP_SPOTS, ANIMATED, scene });
    } else if (t.kind === 'station') {
      station(B, t, rnd, 11);
      towerAt(B, t, -30, 9.2);
      place(B, t, { type: 'warehouse', w: 9, d: 12, damage: 2, paint: 'woodRed', wallH: 3.6, nearTrack: true }, 28, 8 + 6, -1, rnd);
      place(B, t, { type: 'shed', w: 4.5, d: 4, damage: 1, paint: 'woodGrey' }, -12, 22, -1, rnd);
      place(B, t, { type: 'house', w: 6, d: 6, damage: 2, paint: paintFor(t, rnd) }, 10, 24, -1, rnd);
      for (let i = 0; i < 8; i++) { const [x, z] = townToWorld(t, (rnd() - 0.5) * 70, 7 + rnd() * 20); P(rnd() < 0.5 ? 'crate' : 'barrel', x, z, rnd() * 6); }
      const [x, z] = townToWorld(t, -18, 8); P('sleepers', x, z, Math.atan2(-t.tz, t.tx));
      townDressing(B, t, rnd, scene);
    } else {
      // water stop / section house: small maintenance outposts
      towerAt(B, t, -12, 9.2);
      place(B, t, { type: 'house', w: 7, d: 6.5, damage: 1, paint: t.biome === DESERT ? 'woodOchre' : paintFor(t, rnd), sign: undefined }, 10, 16, -1, rnd);
      place(B, t, { type: 'shed', w: 5, d: 4.2, damage: 0, paint: 'woodRed', nearTrack: true }, 22, 12, -1, rnd);
      const [sx, sz] = townToWorld(t, 22, 9.4); sign(B, t.name.toUpperCase(), 0, 2.2, 2.2, 3.2, 0.42, 0);
      for (const [type, a, b] of [['sleepers', 0, 8], ['railStack', 4, 11], ['sleepers', -24, 8], ['barrel', 14, 8], ['barrel', 15, 8.5], ['crate', 16, 9], ['shovel', 20, 9.5], ['pickaxe', 21, 9.8]]) {
        const [x, z] = townToWorld(t, a, b); P(type, x, z, Math.atan2(-t.tz, t.tx));
      }
      if (t.biome !== DESERT) townDressing(B, t, rnd, scene);
    }
    const grp = B.build(); scene.add(grp); out.push(grp);
  }
  storyProps(B, TOWNS, townToWorld); { const g = B.build(); scene.add(g); }
  for (const s of SITES) {
    s.biome = dominantBiome(s.x, s.z); CUR_SITE = s;
    SITE_BUILD[s.kind](B, s, rnd, scene);
    const g = B.build(); scene.add(g); out.push(g);
  }
  CUR_SITE = null;
  return out;
}

// what each region leaves lying about a town: firewood and a fire pit in the cold, boardwalks over the bayou mud,
// ore carts in mining country
function townDressing(B, t, rnd, scene) {
  const L = Math.max(60, t.len), at = (a, b) => townToWorld(t, a, b);
  if (t.biome === SNOW || t.biome === FOREST) {
    for (let i = 0; i < 3; i++) { const [x, z] = at(-L / 2 + rnd() * L, (t.streetB || 18) + 14 + rnd() * 10); P('woodpile', x, z, rnd() * 6); }
    const [fx, fz] = at(t.crossA + 12, (t.streetB || 16) + 4); lightFire(scene, fx, heightAt(fx, fz), fz, 1.2);
    for (let i = 0; i < 6; i++) { const [x, z] = at(-L / 2 - 20 + rnd() * (L + 40), (t.b1 || 30) + 6 + rnd() * 14); P(t.biome === SNOW ? 'pineSnow' : 'pine', x, z, rnd() * 6, 0.8 + rnd() * 0.5); }
  }
  if (t.biome === SWAMP) {
    for (let a = -L / 2; a < L / 2; a += 3.2) { const [x, z] = at(a, (t.streetB || 16) + 0.5); P('boardwalk', x, z, Math.atan2(-t.tz, t.tx), 1); }
    for (let i = 0; i < 6; i++) { const [x, z] = at(-L / 2 + rnd() * L, (t.b1 || 30) + 4 + rnd() * 12); P(rnd() < 0.5 ? 'cypress' : 'snag', x, z, rnd() * 6, 0.8 + rnd() * 0.4); }
    const [fx, fz] = at(t.crossA + 12, (t.streetB || 16) + 5); lightFire(scene, fx, heightAt(fx, fz), fz, 1);
  }
  if (t.biome === BADLANDS) {
    for (let i = 0; i < 3; i++) { const [x, z] = at(-L / 2 + rnd() * L, (t.streetB || 18) + 12 + rnd() * 8); P(rnd() < 0.6 ? 'minecart' : 'orevein', x, z, rnd() * 6); }
    for (let i = 0; i < 4; i++) { const [x, z] = at(-L / 2 - 30 + rnd() * (L + 60), (t.b1 || 30) + 20 + rnd() * 30); P(rnd() < 0.5 ? 'hoodoo' : 'redBoulder', x, z, rnd() * 6, 0.8 + rnd() * 0.7); }
  }
}

function ring(s, r, n, fn) { for (let i = 0; i < n; i++) { const a = i / n * PI * 2; fn(s.x + Math.cos(a) * r, s.z + Math.sin(a) * r, a, i); } }

function windmill(B, scene, x, y, z, ry) {
  B.begin(x, y, z, ry);
  const H = 9;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box('woodDark', sx * 0.75, H / 2, sz * 0.75, 0.14, H + 0.3, 0.14, { rx: -sz * 0.08, rz: sx * 0.08, col: false });
  for (let y2 = 1.5; y2 < H; y2 += 2) for (const s of [-1, 1]) { const w = 1.5 - y2 * 0.14; B.box('woodGrey', 0, y2, s * (w / 2 + 0.03), w + 0.2, 0.08, 0.06, { col: false }); B.box('woodGrey', s * (w / 2 + 0.03), y2, 0, 0.06, 0.08, w + 0.2, { col: false }); }
  B.box('woodDark', 0, H + 0.1, 0, 0.9, 0.12, 0.9, { col: false });
  B.addCollider(-0.9, 0, -0.9, 0.9, H, 0.9);
  B.box('metal', 0, H + 0.5, -0.9, 0.04, 0.9, 1.8, { col: false });
  const rotor = new THREE.Group();
  const vanes = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.5, 0.34), VANE); m.position.set(0, 1.1, 0);
    const pivot = new THREE.Group(); pivot.rotation.x = i / 16 * PI * 2; m.rotation.y = 0.35; pivot.add(m); vanes.add(pivot);
  }
  const ringM = new THREE.Mesh(new THREE.TorusGeometry(1.85, 0.03, 4, 32), VANE); ringM.rotation.y = PI / 2; vanes.add(ringM);
  rotor.add(vanes);
  const world = new THREE.Vector3(0, H + 0.6, 0.6).applyMatrix4(B.base);
  rotor.position.copy(world); rotor.rotation.y = ry; scene.add(rotor);
  vanes.traverse(o => { if (o.isMesh) o.castShadow = true; });
  ANIMATED.push((t, dt, wind) => { vanes.rotation.x += dt * (1.2 + wind * 2); });
}

const SITE_BUILD = {
  cemetery(B, s, rnd) {
    ring(s, s.r - 2, 34, (x, z, a, i) => { if (i !== 0) P(rnd() < 0.2 ? 'fenceBroken' : 'fence', x, z, -a + PI / 2); });
    for (let r = -3; r <= 3; r++) for (let c = -4; c <= 4; c++) {
      if (rnd() < 0.25) continue;
      const x = s.x + c * 2.6 + (rnd() - 0.5) * 0.6, z = s.z + r * 3.4 + (rnd() - 0.5) * 0.5;
      P(rnd() < 0.65 ? 'cross' : 'tombstone', x, z, (rnd() - 0.5) * 0.3, 1, { tilt: (rnd() - 0.5) * 0.25 });
    }
    const gx = s.x + s.r - 2, gz = s.z;
    B.begin(gx, s.h, gz, -PI / 2);
    for (const x of [-1.6, 1.6]) B.box('woodDark', x, 1.8, 0, 0.18, 3.6, 0.18);
    sign(B, s.sign || 'BOOT HILL', 0, 3.3, 0.1, 3.0, 0.55, 0, { bg: '#2a1c12', fg: '#e4d4b4' });
    P('deadTree', s.x - 8, s.z - 12, 1, 1.3); P('deadTree', s.x + 10, s.z + 9, 2.4, 1.0);
    P('skull', gx + 1.5, gz + 3, 1);
  },
  ranch(B, s, rnd, scene) {
    siteBuilding(B, s.x - 18, s.h, s.z, PI / 2, { type: 'house', w: 9, d: 7.5, damage: 1, paint: 'woodWhite' }, rnd);
    siteBuilding(B, s.x + 22, s.h, s.z - 14, -PI / 2, { type: 'barn', w: 12, d: 16, damage: 2 }, rnd);
    siteBuilding(B, s.x + 4, s.h, s.z - 28, 0, { type: 'shed', damage: 1, paint: 'woodGrey' }, rnd);
    windmill(B, scene, s.x + 2, s.h, s.z + 16, 0.7);
    ring({ x: s.x + 24, z: s.z + 22 }, 14, 30, (x, z, a, i) => { if (i % 9 !== 4) P(rnd() < 0.3 ? 'fenceBroken' : 'fence', x, z, -a + PI / 2); });
    for (const [type, dx, dz] of [['trough', 6, 16], ['hay', 15, -2], ['hay', 16.5, -1.5], ['hay', 15.5, -0.5], ['wagon', -4, -14], ['barrel', -12, 5], ['barrel', -12.6, 5.8], ['cart', 30, 20], ['deadTree', -30, 18], ['skull', 24, 22], ['bones', 27, 26]])
      P(type, s.x + dx, s.z + dz, rnd() * 6);
  },
  wagons(B, s, rnd) {
    ring(s, 16, 7, (x, z, a) => P('wagon', x, z, -a + PI / 2 + (rnd() - 0.5) * 0.3));
    for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28; P('rockFlat', s.x + Math.cos(a) * 1.4, s.z + Math.sin(a) * 1.4, a, 0.35); }
    for (let i = 0; i < 6; i++) P(rnd() < 0.5 ? 'bones' : 'skull', s.x + (rnd() - 0.5) * 20, s.z + (rnd() - 0.5) * 20, rnd() * 6);
    for (let i = 0; i < 8; i++) P(['crate', 'barrel', 'sack', 'wheel'][i % 4], s.x + (rnd() - 0.5) * 24, s.z + (rnd() - 0.5) * 24, rnd() * 6);
    for (let i = 0; i < 4; i++) P('cross', s.x + 24 + i * 2.2, s.z - 6, 0.1, 1, { tilt: (rnd() - 0.5) * 0.3 });
  },
  arch(B, s, rnd) {
    const n = makeNoise(4242), g = new THREE.TorusGeometry(26, 6, 14, 60, PI), p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const d = 1 + 0.16 * n(v.x * 0.08, v.y * 0.08 + v.z * 0.05); const k = 1 + 0.25 * n(v.x * 0.03 + 4, v.z * 0.2); p.setXYZ(i, v.x * (0.98 + 0.04 * d), v.y * d, v.z * k * d); }
    g.computeVertexNormals();
    scaleUV(g, 12, 3);
    B.begin(s.x, s.h - 4, s.z, 0.6, false);
    B.geom('stone', g, T4(0, 0, 0));
    for (const sx of [-26, 26]) B.geom('stone', new THREE.CylinderGeometry(7, 10, 8, 10), T4(sx, 0, 0));
    for (const sx of [-26, 26]) { const [wx, wz] = [s.x + Math.cos(0.6) * sx, s.z - Math.sin(0.6) * sx]; CIRCLES.push({ x: wx, z: wz, r: 8, top: s.h + 40 }); }
    for (let i = 0; i < 10; i++) P('boulder', s.x + (rnd() - 0.5) * 90, s.z + (rnd() - 0.5) * 90, rnd() * 6, 0.5 + rnd() * 0.8);
    P('signpost', s.x + 30, s.z + 30, 0.4);
  },
  mine(B, s, rnd) {
    B.begin(s.x, s.h, s.z, 0.3);
    const H = 14;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box('woodDark', sx * 2.3, H / 2, sz * 2.3, 0.35, H + 0.4, 0.35, { rx: -sz * 0.1, rz: sx * 0.1, col: false });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.addCollider(sx * 3 - 0.3, 0, sz * 3 - 0.3, sx * 3 + 0.3, 3, sz * 3 + 0.3);
    for (let y = 2; y < H; y += 3) { const w = 6 - y * 0.27; for (const s2 of [-1, 1]) { B.box('woodGrey', 0, y, s2 * w / 2, w + 0.3, 0.18, 0.18, { col: false }); B.box('woodGrey', s2 * w / 2, y, 0, 0.18, 0.18, w + 0.3, { col: false }); } }
    B.box('woodDark', 0, H, 0, 3.2, 0.3, 3.2, { col: false });
    B.geom('iron', new THREE.TorusGeometry(1.4, 0.1, 6, 24), T4(0, H + 1.4, 0));
    for (let i = 0; i < 6; i++) B.box('iron', 0, H + 1.4, 0, 0.06, 2.8, 0.06, { rx: i * PI / 6, col: false });
    B.box('woodDark', 0, H + 0.7, 0, 0.3, 1.4, 0.3, { col: false });
    B.box('woodDark', 0, 0.3, 0, 3.6, 0.6, 3.6, { col: false });
    B.box('black', 0, 0.62, 0, 2.6, 0.02, 2.6, { col: false });
    B.addCollider(-1.8, 0, -1.8, 1.8, 1.2, 1.8);
    B.box('woodDark', -1.8, 0.6, 0, 0.1, 1.2, 3.6); B.box('woodDark', 1.8, 0.6, 0, 0.1, 1.2, 3.6); B.box('woodDark', 0, 0.6, -1.8, 3.6, 1.2, 0.1);
    B.box('woodGrey', 8, 2.5, -3, 4, 3, 4); B.box('woodGrey', 8, 4.2, -1.2, 4.2, 0.1, 3, { rx: 0.5, col: false });
    for (const sx of [6.2, 9.8]) for (const sz of [-4.8, -1.2]) B.box('woodDark', sx, 0.5, sz, 0.25, 1.0, 0.25);
    siteBuilding(B, s.x - 22, s.h, s.z + 10, 1.2, { type: 'shed', w: 5.5, d: 4.5, damage: 2, paint: 'woodGrey' }, rnd);
    B.begin(s.x, s.h, s.z, 0.3, false);
    B.geom('stone', rock(new THREE.ConeGeometry(14, 7, 14, 3), 31), T4(-6, 2.5, -22));
    B.geom('stone', rock(new THREE.ConeGeometry(9, 4.5, 12, 3), 32), T4(14, 1.6, -18));
    CIRCLES.push({ x: s.x - 6, z: s.z - 22, r: 10, top: s.h + 7 });
    for (let i = 0; i < 18; i++) { B.box('woodDark', 0.6 + i * 0.9, 0.06, 4.5, 0.18, 0.1, 1.5, { col: false }); }
    for (const z of [3.95, 5.05]) B.box('iron', 8.6, 0.16, z, 16.5, 0.08, 0.06, { col: false });
    for (const [type, dx, dz] of [['minecart', 8, 4.5], ['minecart', 15, 4.5], ['pickaxe', -3, 4], ['shovel', -4, 5], ['lantern', 2.5, 2.5], ['crate', -6, -6], ['crate', -6.8, -5.2], ['barrel', -5, -7.5], ['rock', 4, -8], ['bones', 20, 12]])
      P(type, s.x + dx * Math.cos(0.3) + dz * Math.sin(0.3), s.z - dx * Math.sin(0.3) + dz * Math.cos(0.3), rnd() * 6);
  },
  homestead(B, s, rnd) {
    siteBuilding(B, s.x, s.h, s.z, 2.1, { type: 'house', w: 6.5, d: 6, damage: 2, paint: 'woodGrey' }, rnd);
    B.begin(s.x + 12, s.h, s.z - 6, 0);
    B.geom('stone', new THREE.CylinderGeometry(1.0, 1.1, 0.9, 14, 1, true), T4(0, 0.45, 0));
    B.geom('black', new THREE.CircleGeometry(0.95, 14), T4(0, 0.3, 0, -PI / 2));
    B.addCollider(-1.1, 0, -1.1, 1.1, 0.9, 1.1);
    for (const x of [-1, 1]) B.box('woodDark', x, 1.4, 0, 0.12, 2.0, 0.12, { col: false });
    B.box('woodDark', 0, 2.3, 0, 2.3, 0.12, 0.12, { col: false }); B.box('shingle', 0, 2.75, 0.5, 2.6, 0.05, 1.3, { rx: 0.6, col: false }); B.box('shingle', 0, 2.75, -0.5, 2.6, 0.05, 1.3, { rx: -0.6, col: false });
    ring({ x: s.x + 2, z: s.z + 2 }, 20, 26, (x, z, a, i) => { if (i % 5 !== 2) P(rnd() < 0.4 ? 'fenceBroken' : 'fence', x, z, -a + PI / 2); });
    for (const [type, dx, dz] of [['deadTree', -9, 8], ['cart', 8, 8], ['barrel', 4, -4], ['wheel', 6, 5], ['skull', -4, -8], ['cross', -14, -10]]) P(type, s.x + dx, s.z + dz, rnd() * 6);
  },
};
function rock(g, seed) {
  const n = makeNoise(seed), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 1 + 0.25 * n(v.x * 0.3, v.z * 0.3 + v.y * 0.2); p.setXYZ(i, v.x * k, v.y * (0.9 + 0.2 * k), v.z * k); }
  g.computeVertexNormals(); return scaleUV(g, 6, 2);
}

// ---------- the new regions' places ----------
// local (lx, lz) around a site centre, turned by ry, to world x,z (same handedness as Builder.begin)
const LW = (s, ry, lx, lz) => [s.x + Math.cos(ry) * lx + Math.sin(ry) * lz, s.z - Math.sin(ry) * lx + Math.cos(ry) * lz];
const treeFor = s => s.biome === SNOW || s.snow ? 'pineSnow' : s.biome === SWAMP ? 'cypress' : s.biome === BADLANDS ? 'deadTree' : 'pine';
const rockFor = s => s.biome === SNOW || s.snow ? 'snowRock' : s.biome === BADLANDS ? 'redBoulder' : s.biome === FOREST ? 'mossRock' : 'rock';
function trees(s, rnd, n, r0, r1, type = treeFor(s)) {
  for (let i = 0; i < n; i++) { const a = rnd() * PI * 2, r = r0 + rnd() * (r1 - r0); P(type, s.x + Math.cos(a) * r, s.z + Math.sin(a) * r, rnd() * 6, 0.8 + rnd() * 0.5); }
}
// a dug or natural passage running into the hill along local +z: walls, roof, a back wall, and rock heaped over it
function cavern(B, s, ry, o = {}) {
  const len = o.len || 16, w = o.w || 5, h = o.h || 4, mat = o.mat || 'stone', rk = o.rock || 'stone';
  B.begin(s.x, s.h, s.z, ry);
  for (const sx of [-1, 1]) B.box(mat, sx * (w / 2 + 0.6), h / 2, len / 2, 1.2, h, len);
  B.box(mat, 0, h + 0.4, len / 2, w + 2.4, 0.8, len);
  B.box(mat, 0, h / 2, len + 0.6, w + 2.4, h + 0.8, 1.2);
  B.box('black', 0, 0.02, len / 2, w, 0.04, len, { col: false }); // trodden floor, darker than the ground outside
  B.begin(s.x, s.h, s.z, ry, false);
  for (const sx of [-1, 1]) B.geom(rk, rock(new THREE.ConeGeometry(len * 0.55, h * 2.6, 12, 3), 60 + sx), T4(sx * (w / 2 + len * 0.42), h * 1.1, len * 0.5));
  B.geom(rk, rock(new THREE.SphereGeometry(1, 14, 8), 63), new THREE.Matrix4().compose(new THREE.Vector3(0, h + 0.8 + len * 0.22, len * 0.55), new THREE.Quaternion(), new THREE.Vector3(w / 2 + 4, len * 0.24, len * 0.62)));
  for (const sx of [-1, 1]) { const [x, z] = LW(s, ry, sx * (w / 2 + len * 0.42), len * 0.5); CIRCLES.push({ x, z, r: len * 0.42, top: s.h + h * 2.4 }); }
  if (o.portal) {
    B.begin(s.x, s.h, s.z, ry);
    for (const sx of [-1, 1]) B.box('woodDark', sx * (w / 2 - 0.2), h / 2, 0.2, 0.4, h, 0.4);
    B.box('woodDark', 0, h - 0.2, 0.2, w + 0.4, 0.45, 0.45);
    for (let z = 3; z < len; z += 4) { for (const sx of [-1, 1]) B.box('woodDark', sx * (w / 2 - 0.15), h / 2, z, 0.3, h, 0.3, { col: false }); B.box('woodDark', 0, h - 0.15, z, w, 0.3, 0.3, { col: false }); }
  }
}
// a raised deck over the marsh, its top at the given height, standing on piles
function deck(B, x, y, z, ry, w, d) {
  B.begin(x, y, z, ry);
  B.box('woodGrey', 0, -0.12, 0, w, 0.24, d);
  const steps = L => { const n = Math.max(1, Math.round((L - 0.6) / 2.6)), o = []; for (let i = 0; i <= n; i++) o.push(-L / 2 + 0.3 + (L - 0.6) * i / n); return o; };
  for (const a of steps(w)) for (const b of steps(d)) B.box('woodDark', a, -1.6, b, 0.28, 3, 0.28, { col: false });
}
function stairsUp(B, x0, z0, ry, y0, y1, w = 1.2) {
  B.begin(x0, y0, z0, ry);
  const n = Math.ceil((y1 - y0) / 0.28), rise = (y1 - y0) / n;
  for (let i = 0; i < n; i++) B.box('woodDark', 0, rise * (i + 0.5), i * 0.32, w, rise, 0.34);
}
function rack(B, x, y, z, ry) { // hide-drying frame
  B.begin(x, y, z, ry);
  for (const sx of [-1, 1]) B.box('woodDark', sx * 1.1, 1.0, 0, 0.1, 2, 0.1, { col: false });
  B.box('woodDark', 0, 1.95, 0, 2.4, 0.08, 0.08, { col: false });
  B.box('cloth', 0, 1.3, 0.02, 1.6, 1.2, 0.03, { col: false, c: 0x9a7650 });
}

Object.assign(SITE_BUILD, {
  cabin(B, s, rnd, scene) {
    siteBuilding(B, s.x, s.h, s.z, 0.6, { type: 'house', w: 6.5, d: 6, damage: 0, paint: 'woodDark' }, rnd);
    const [fx, fz] = LW(s, 0.6, 2, 9); lightFire(scene, fx, heightAt(fx, fz), fz);
    for (const [t, a, b] of [['woodpile', -5, 1], ['woodpile', -5, -1.4], ['stump', 4, 7], ['log', 6, 10], ['barrel', 3.8, 3.6], ['crate', -3, 4.2]]) { const [x, z] = LW(s, 0.6, a, b); P(t, x, z, rnd() * 6); }
    rack(B, ...((p => [p[0], heightAt(p[0], p[1]), p[1]])(LW(s, 0.6, 6, 2))), 0.6 + PI / 2);
    trees(s, rnd, 14, 14, 28);
  },
  huntcamp(B, s, rnd, scene) {
    lightFire(scene, s.x, s.h, s.z, 1.1);
    ring(s, 7, 3, (x, z, a) => P('tent', x, z, -a - PI / 2));
    ring(s, 3.2, 4, (x, z, a, i) => P(i % 2 ? 'log' : 'stump', x, z, -a + PI / 2, 0.8));
    for (let i = 0; i < 2; i++) { const a = 2.4 + i * 0.6; rack(B, s.x + Math.cos(a) * 10, s.h, s.z + Math.sin(a) * 10, -a); }
    B.begin(s.x, s.h, s.z, 0.4); chest(B, -9, 0, 3, 1.2);
    for (const [t, a, b] of [['woodpile', 10, -3], ['crate', 9, 3], ['barrel', 9.5, 4.2], ['sack', 8.6, 2.2], ['bones', -4, -10], ['skull', -3, -11], ['lantern', 0, 5]]) P(t, s.x + a, s.z + b, rnd() * 6);
    trees(s, rnd, 16, 16, 30);
    if (s.snow) for (let i = 0; i < 6; i++) P('snowBoulder', s.x + (rnd() - 0.5) * 50, s.z + (rnd() - 0.5) * 50, rnd() * 6, 0.6 + rnd() * 0.6);
  },
  cave(B, s, rnd, scene) {
    const ry = rnd() * PI * 2;
    cavern(B, s, ry, { len: 18, w: 6, h: 4.4, mat: 'stone' });
    B.begin(s.x, s.h, s.z, ry); chest(B, 1.2, 0, 15.6, PI);
    for (const [t, a, b] of [['bones', -1, 9], ['bones', 1.5, 12], ['skull', -1.8, 14], ['bones', 0.5, 4], ['lantern', -2.2, 16]]) { const [x, z] = LW(s, ry, a, b); P(t, x, z, rnd() * 6); }
    for (let i = 0; i < 8; i++) { const [x, z] = LW(s, ry, (rnd() - 0.5) * 30, -4 - rnd() * 16); P(rockFor(s), x, z, rnd() * 6, 0.5 + rnd() * 0.8); }
    trees(s, rnd, 10, 22, 40);
  },
  loggingcamp(B, s, rnd, scene) {
    siteBuilding(B, s.x - 16, s.h, s.z - 6, PI / 2, { type: 'house', w: 7, d: 12, damage: 1, paint: 'woodDark', sign: 'BUNKHOUSE' }, rnd);
    siteBuilding(B, s.x + 18, s.h, s.z + 14, -PI / 2, { type: 'shed', w: 5, d: 4.5, damage: 2, paint: 'woodGrey' }, rnd);
    // the saw shed: an open roof on posts over a log carriage and a great round blade
    B.begin(s.x + 6, s.h, s.z - 8, 0.2);
    for (const sx of [-4, 4]) for (const sz of [-7, 0, 7]) B.box('woodDark', sx, 2, sz, 0.3, 4, 0.3);
    B.box('shingle', 0, 4.2, 0, 9.5, 0.12, 15.5, { col: false });
    B.box('woodGrey', 0, 0.6, 0, 1.6, 1.2, 14);
    B.geom('iron', new THREE.CylinderGeometry(1.3, 1.3, 0.04, 32), T4(0, 1.3, 0, 0, 0, PI / 2));
    for (let i = 0; i < 4; i++) P('log', s.x + 6 + (rnd() - 0.5) * 2, s.z - 12 + i * 0.9, 0.2 + PI / 2, 1.2);
    // log stacks and the cut-over hillside
    for (let k = 0; k < 3; k++) for (let i = 0; i < 6; i++) P('log', s.x - 4 + k * 5, s.z + 18 + (i % 3) * 0.8, 0, 1.3, { tilt: 0 });
    for (let i = 0; i < 26; i++) { const a = rnd() * PI * 2, r = 20 + rnd() * 26; P('stump', s.x + Math.cos(a) * r, s.z + Math.sin(a) * r, rnd() * 6, 0.9 + rnd() * 0.5); }
    for (const [t, a, b] of [['woodpile', -8, 10], ['woodpile', -6, 12], ['wagon', 14, -2], ['barrel', -10, -14], ['crate', -11, -15], ['sleepers', 2, 20], ['lantern', -12, -1]]) P(t, s.x + a, s.z + b, rnd() * 6);
    const [fx, fz] = [s.x - 6, s.z + 2]; lightFire(scene, fx, heightAt(fx, fz), fz);
    trees(s, rnd, 20, 46, 70);
  },
  lookout(B, s, rnd) {
    const ry = rnd() * PI, H = 9;
    B.begin(s.x, s.h, s.z, ry);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box('woodDark', sx * 1.8, H / 2, sz * 1.8, 0.3, H, 0.3);
    for (let y = 1.5; y < H; y += 2.5) for (const sg of [-1, 1]) { B.box('woodGrey', 0, y, sg * 1.8, 3.9, 0.15, 0.12, { col: false }); B.box('woodGrey', sg * 1.8, y, 0, 0.12, 0.15, 3.9, { col: false }); }
    B.box('woodGrey', 0, H + 0.1, 0, 4.6, 0.2, 4.6);
    for (const [x, z, w, d] of [[0, 2.25, 4.6, 0.1], [-2.25, 0, 0.1, 4.6], [2.25, 0, 0.1, 4.6]]) B.box('woodGrey', x, H + 0.7, z, w, 1, d);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box('woodDark', sx * 2.2, H + 1.8, sz * 2.2, 0.15, 3.2, 0.15, { col: false });
    B.box(s.biome === SNOW ? 'snowroof' : 'shingle', 0, H + 3.45, 0, 5.4, 0.15, 5.4, { col: false });
    chest(B, 1.2, H + 0.2, 1.4, 0);
    B.box('iron', -1.4, H + 1.1, 1.6, 0.4, 0.4, 0.4, { col: false }); // the fire-spotter's lamp box
    stairsUp(B, ...LW(s, ry, 0, -2.3 - Math.ceil((H + 0.2) / 0.28) * 0.32), ry, s.h, s.h + H + 0.2, 0.9);
    trees(s, rnd, 16, 10, 30);
  },
  swampchurch(B, s, rnd) {
    const ry = 0.9, top = SWAMP_WL + 0.35;
    deck(B, s.x, top, s.z, ry, 12, 22);
    B.begin(s.x, top - Y0, s.z, ry);
    building(B, { type: 'church', w: 8, d: 16, damage: 2, paint: 'woodGrey', roofMat: 'tin' }, rnd);
    for (let i = 0; i < 9; i++) { const [x, z] = LW(s, ry, -2 + i * 0.4, 11 + i * 3.1); P('boardwalk', x, z, ry, 1); }
    for (let i = 0; i < 10; i++) { const [x, z] = LW(s, ry, (rnd() - 0.5) * 26, -14 - rnd() * 12); P('cross', x, z, rnd() - 0.5, 1, { tilt: (rnd() - 0.5) * 0.6 }); }
    trees(s, rnd, 14, 18, 40, 'cypress');
    for (let i = 0; i < 10; i++) P('lily', s.x + (rnd() - 0.5) * 50, s.z + (rnd() - 0.5) * 50, rnd() * 6);
  },
  shack(B, s, rnd, scene) {
    siteBuilding(B, s.x, s.h, s.z, 2.4, { type: 'shed', w: 5.5, d: 5, damage: 1, paint: 'woodGrey' }, rnd);
    // the still: copper pot over a fire box, a coil and a run of jugs
    B.begin(s.x + 6, s.h, s.z + 5, 0.3);
    B.box('stone', 0, 0.4, 0, 1.6, 0.8, 1.6);
    B.geom('metal', new THREE.CylinderGeometry(0.7, 0.8, 1.2, 16), T4(0, 1.4, 0), 0xc07840);
    B.geom('metal', new THREE.SphereGeometry(0.72, 16, 8, 0, PI * 2, 0, PI / 2), T4(0, 2, 0), 0xc07840);
    B.geom('metal', new THREE.TorusGeometry(0.4, 0.05, 6, 16), T4(1.4, 1.2, 0, PI / 2), 0xc07840);
    B.box('woodDark', 1.4, 0.5, 0, 0.9, 1, 0.9);
    for (let i = 0; i < 6; i++) B.geom('bottle', new THREE.CylinderGeometry(0.12, 0.16, 0.38, 10), T4(-1.5 + (i % 3) * 0.35, 0.19, 1.4 + Math.floor(i / 3) * 0.35), 0xb8a888);
    const [fx, fz] = [s.x + 6, s.z + 5]; registerHeat(fx, s.h, fz, 2.5, 18, 'fire'); LAMP_SPOTS.push([fx, s.h + 0.5, fz]);
    B.begin(s.x, s.h, s.z, 2.4); chest(B, 4, 0, -4, 0.4);
    for (const [t, a, b] of [['barrel', 8, 2], ['barrel', 8.6, 2.9], ['barrel', 7.6, 3.2], ['crate', -5, 3], ['sack', -5.5, 4], ['woodpile', 3, -6], ['lantern', 5, 2.5]]) P(t, s.x + a, s.z + b, rnd() * 6);
    trees(s, rnd, 16, 10, 26);
  },
  stilthouses(B, s, rnd, scene) {
    const top = SWAMP_WL + 0.35, spots = [[-14, -8, 0.2], [10, -12, -0.3], [-8, 14, 2.9], [16, 10, 3.6]];
    for (const [a, b, ry] of spots) {
      deck(B, s.x + a, top, s.z + b, ry, 9, 9.5);
      B.begin(s.x + a, top - Y0, s.z + b, ry);
      building(B, { type: 'house', w: 6.5, d: 6.5, damage: rnd() < 0.5 ? 1 : 2, paint: rnd() < 0.5 ? 'woodGrey' : 'woodGreen', roofMat: 'tin' }, rnd);
    }
    // boardwalks joining each house to the middle platform
    deck(B, s.x, top, s.z, 0.5, 8, 8);
    lightFire(scene, s.x, top, s.z, 0.9);
    for (const [a, b] of spots) {
      const L = Math.hypot(a, b) - 9, ang = Math.atan2(a, b);
      deck(B, s.x + a * 0.5, top - 0.02, s.z + b * 0.5, ang, 1.8, Math.max(2, L));
    }
    for (const [t, a, b] of [['barrel', 1.5, 2.5], ['crate', -2.5, 2], ['sack', -2, -2.6], ['lantern', 2.4, -2]]) addProp(t, s.x + a, top, s.z + b, rnd() * 6);
    trees(s, rnd, 18, 24, 50, 'cypress');
    for (let i = 0; i < 16; i++) P(rnd() < 0.5 ? 'lily' : 'reeds', s.x + (rnd() - 0.5) * 70, s.z + (rnd() - 0.5) * 70, rnd() * 6);
  },
  brokenbridge(B, s, rnd) {
    const ry = 0.4, top = SWAMP_WL + 2.6;
    for (const [z0, z1] of [[-42, -5], [7, 42]]) {
      B.begin(s.x, top, s.z, ry);
      B.box('woodGrey', 0, -0.15, (z0 + z1) / 2, 4.2, 0.3, z1 - z0);
      for (const sx of [-1, 1]) B.box('woodDark', sx * 2, 0.55, (z0 + z1) / 2, 0.15, 1.1, z1 - z0);
      for (let z = z0 + 1; z < z1; z += 5) for (const sx of [-1.7, 1.7]) B.box('woodDark', sx, -3, z, 0.35, 6, 0.35, { col: false });
    }
    // the fallen span, broken and tipped into the water
    B.begin(s.x, top, s.z, ry, false);
    B.box('woodGrey', 0.4, -1.6, 1, 4.2, 0.3, 12, { rx: 0.42, rz: 0.12 });
    B.box('woodDark', -1.4, -2.4, 3, 0.35, 0.35, 9, { rx: 0.6, rz: 0.3 });
    for (const b of [-46, 46]) { const [x, z] = LW(s, ry, 2.6, b); P('signpost', x, z, ry); }
    const [wx, wz] = LW(s, ry, 0.3, -12); addProp('wagon', wx, top, wz, ry + 0.2);
    for (const [t, a, b] of [['crate', 1, -9], ['barrel', -1.2, -16], ['crate', 2, 5], ['barrel', -2, 3]]) { const [x, z] = LW(s, ry, a, b); P(t, x, z, rnd() * 6); }
    trees(s, rnd, 14, 20, 46, 'cypress');
  },
  giantTree(B, s, rnd) {
    B.begin(s.x, s.h, s.z, 0, false);
    B.geom('bark', rock(new THREE.CylinderGeometry(2.2, 3.4, 34, 14, 6), 71), T4(0, 17, 0));
    B.geom('bark', rock(new THREE.ConeGeometry(7, 5, 14, 2, true), 72), T4(0, 2.2, 0));
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * PI * 2 + rnd() * 0.5, y = 20 + rnd() * 12, L = 9 + rnd() * 6;
      B.geom('bark', new THREE.CylinderGeometry(0.4, 0.8, L, 8), T4(Math.cos(a) * L * 0.42, y + L * 0.2, Math.sin(a) * L * 0.42, 0, -a, PI / 2 - 0.5));
      B.geom('leaves', rock(new THREE.SphereGeometry(5 + rnd() * 2, 10, 6), 80 + i), new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * L * 0.85, y + L * 0.45, Math.sin(a) * L * 0.85), new THREE.Quaternion(), new THREE.Vector3(1, 0.45, 1)));
    }
    B.geom('leaves', rock(new THREE.SphereGeometry(9, 12, 8), 79), new THREE.Matrix4().compose(new THREE.Vector3(0, 36, 0), new THREE.Quaternion(), new THREE.Vector3(1, 0.4, 1)));
    CIRCLES.push({ x: s.x, z: s.z, r: 3.4, top: s.h + 34 });
    // a hollow between the roots where someone left their savings
    B.begin(s.x, s.h, s.z, 0.8); B.box('black', 0, 1, 3.3, 1.6, 2, 0.3, { col: false }); chest(B, 0, 0, 4, PI);
    for (let i = 0; i < 12; i++) P(rnd() < 0.5 ? 'fern' : 'mushroom', s.x + (rnd() - 0.5) * 18, s.z + (rnd() - 0.5) * 18, rnd() * 6);
    P('skull', s.x + 4, s.z + 5, 1); P('lantern', s.x - 1, s.z + 4.6, 0);
  },
  hoodoos(B, s, rnd) {
    for (let i = 0; i < 26; i++) { const a = rnd() * PI * 2, r = 6 + rnd() * (s.r - 6); P('hoodoo', s.x + Math.cos(a) * r, s.z + Math.sin(a) * r, rnd() * 6, 1.4 + rnd() * 2.4); }
    for (let i = 0; i < 14; i++) P('redBoulder', s.x + (rnd() - 0.5) * s.r * 2, s.z + (rnd() - 0.5) * s.r * 2, rnd() * 6, 0.6 + rnd() * 1.2);
    for (let i = 0; i < 3; i++) P('orevein', s.x + (rnd() - 0.5) * s.r, s.z + (rnd() - 0.5) * s.r, rnd() * 6);
    B.begin(s.x, s.h, s.z, 1.1); chest(B, 2, 0, 0, 0.3);
    for (const [t, a, b] of [['bones', 3, 2], ['skull', 4, 1.5], ['pickaxe', 1, -2], ['wagon', -14, 10], ['wheel', -12, 8]]) P(t, s.x + a, s.z + b, rnd() * 6);
    P('signpost', s.x + s.r - 4, s.z, 0.4);
  },
  oldtunnel(B, s, rnd) {
    const ry = rnd() * PI * 2;
    cavern(B, s, ry, { len: 24, w: 5.4, h: 5, mat: 'stone', rock: 'stone', portal: true });
    B.begin(s.x, s.h, s.z, ry);
    sign(B, 'KETTLE TUNNEL', 0, 5.6, -0.1, 4.2, 0.6, PI, { bg: '#2a1c12', fg: '#e4d4b4' });
    for (let z = -12; z < 22; z += 0.9) B.box('woodDark', 0, 0.05, z, 2.4, 0.1, 0.22, { col: false });
    for (const x of [-0.75, 0.75]) B.box('iron', x, 0.14, 5, 0.07, 0.08, 34, { col: false });
    B.box('stone', 0, 2, 20.5, 5.4, 4, 1.2); // the cave-in that closed it
    locker(B, 2, 0, 18, -PI / 2);
    for (const [t, a, b] of [['minecart', 0, 8], ['minecart', 0, -8], ['lantern', -2.2, 2], ['crate', 2, 12], ['barrel', -2, 14], ['pickaxe', -1.8, 16], ['rock', 1, 19], ['rock', -1.2, 19.2], ['railStack', 6, -6]]) { const [x, z] = LW(s, ry, a, b); P(t, x, z, ry + rnd() * 0.4); }
  },
  treasure(B, s, rnd) {
    B.begin(s.x, s.h, s.z, rnd() * 6);
    B.geom('black', new THREE.CircleGeometry(1.4, 16), T4(0, 0.03, 0, -PI / 2));
    for (const a of [PI / 4, -PI / 4]) B.box('woodRed', 3, 0.03, 0, 2.4, 0.04, 0.3, { ry: a, col: false });
    safe(B, 0, -0.35, 0, 0.5);
    for (const [t, a, b] of [['shovel', 1.6, 0.8], ['pickaxe', -1.4, 1.2], ['skull', 2, -1.4], ['bones', 2.4, -2], ['redBoulder', -4, -3], ['lantern', 1, 2]]) P(t, s.x + a, s.z + b, rnd() * 6, t === 'redBoulder' ? 1.8 : 1);
  },
  fossils(B, s, rnd) {
    // half-dug bones of something enormous lying in the canyon floor
    const ry = rnd() * PI * 2;
    B.begin(s.x, s.h, s.z, ry, false);
    for (let i = 0; i < 16; i++) {
      const z = -12 + i * 1.6, r = 2.6 * Math.sin(Math.min(1, (i + 1) / 12) * PI * 0.9) + 0.6;
      B.geom('paper', new THREE.SphereGeometry(0.35, 8, 6), T4(0, 0.6 + r * 0.15, z));
      if (i > 1 && i < 12) for (const sx of [-1, 1]) B.geom('paper', new THREE.TorusGeometry(r, 0.12, 5, 12, PI * 0.55), T4(0, 0.3, z, 0, PI / 2, sx > 0 ? PI * 0.2 : PI * 0.25 + PI * 0.55));
    }
    B.geom('paper', rock(new THREE.ConeGeometry(1.4, 4, 8, 2), 91), T4(0, 0.8, 15, PI / 2));
    B.geom('black', new THREE.CircleGeometry(9, 20), T4(0, 0.02, 0, -PI / 2), 0x4a2a1a);
    const [tx, tz] = LW(s, ry, 8, -6); P('tent', tx, tz, ry);
    for (const [t, a, b] of [['pickaxe', 4, 2], ['shovel', -4, -2], ['crate', 9, -1], ['crate', 9.8, -1.8], ['lantern', 7, -2], ['orevein', -12, 6], ['orevein', 12, 10]]) { const [x, z] = LW(s, ry, a, b); P(t, x, z, rnd() * 6); }
    B.begin(s.x, s.h, s.z, ry); chest(B, 10, 0, 1, -PI / 2);
    for (let i = 0; i < 8; i++) P('redBoulder', s.x + (rnd() - 0.5) * 60, s.z + (rnd() - 0.5) * 60, rnd() * 6, 0.8 + rnd());
  },
  bunker(B, s, rnd) {
    const ry = rnd() * PI * 2, w = 8, d = 7, h = 2.7;
    B.begin(s.x, s.h, s.z, ry);
    B.box('stone', 0, h + 0.3, 0, w + 1, 0.6, d + 1);
    B.box('stone', 0, h / 2, -d / 2 - 0.25, w + 1, h, 0.5);
    for (const sx of [-1, 1]) B.box('stone', sx * (w / 2 + 0.25), h / 2, 0, 0.5, h, d);
    for (const sx of [-1, 1]) B.box('stone', sx * (w / 4 + 0.7), h / 2, d / 2 + 0.25, w / 2 - 0.4 + 1, h, 0.5);
    B.box('floor', 0, 0.05, 0, w, 0.1, d, { col: false });
    for (let i = 0; i < 3; i++) locker(B, -w / 2 + 0.6 + i * 0.8, 0.1, -d / 2 + 0.4, 0);
    safe(B, w / 2 - 0.7, 0.1, -d / 2 + 0.6, 0);
    B.box('woodDark', 2, 0.8, 1, 1.6, 0.06, 0.8); B.box('woodDark', 2, 0.4, 1, 1.4, 0.8, 0.1, { col: false });
    for (let i = 0; i < 9; i++) { const [x, z] = LW(s, ry, -3 + (i % 5) * 1.5, d / 2 + 3 + Math.floor(i / 5) * 0.6); P('sack', x, z, ry, 1.2); }
    for (const [t, a, b] of [['crate', 5.6, 4], ['crate', 6, 5], ['barrel', -6, 4], ['lantern', 0, 0.4]]) { const [x, z] = LW(s, ry, a, b); P(t, x, z, rnd() * 6); }
    const [hx, hz] = LW(s, ry, 0, 0); registerHeat(hx, s.h, hz, 3.6, 10, 'shelter');
  },
  observatory(B, s, rnd, scene) {
    const R = 5.2, n = 18, top = 3.6, ry = rnd() * PI * 2;
    B.begin(s.x, s.h, s.z, ry);
    for (let i = 0; i < n; i++) {
      if (i === 0 || i === 1) continue; // the doorway
      const a = (i + 0.5) / n * PI * 2, x = Math.cos(a) * R, z = Math.sin(a) * R, seg = 2 * R * Math.tan(PI / n) + 0.1;
      B.box('stone', x, top / 2, z, 0.5, top, seg, { ry: -a });
      B.addCollider(x - 0.6, 0, z - 0.6, x + 0.6, top, z + 0.6);
    }
    B.box('floor', 0, 0.05, 0, R * 1.9, 0.1, R * 1.9, { col: false });
    B.geom('metal', new THREE.SphereGeometry(R + 0.3, 24, 10, 0, PI * 2, 0, PI / 2), T4(0, top, 0), 0xa8b0b4);
    B.box('black', 0, top + R * 0.7, 0, 1.1, 0.1, R * 1.4, { rx: -0.4, col: false });
    B.geom('metal', new THREE.CylinderGeometry(0.35, 0.5, 4.4, 14), T4(0, 2.4, 0, -0.7), 0x6a5a40);
    B.box('iron', 0, 0.6, 0, 1, 1.2, 1);
    stove(B, -3.4, 0.1, -1.8, top + 1.4); chest(B, 3.4, 0.1, -1.6, -PI / 2);
    B.box('woodDark', 1.5, 0.85, 3.4, 2, 0.06, 0.9);
    registerHeat(...((p => [p[0], s.h, p[1]])(LW(s, ry, 0, 0))), R - 0.4, 16, 'shelter');
    const [lx, lz] = LW(s, ry, 0, 0); LAMP_SPOTS.push([lx, s.h + 2.6, lz]);
    for (const [t, a, b] of [['woodpile', -8, 2], ['snowcache', 7, 4], ['crate', 7, -4], ['signpost', R + 6, 1]]) { const [x, z] = LW(s, ry, a, b); P(t, x, z, rnd() * 6); }
    trees(s, rnd, 8, 16, 30, 'pineSnow');
  },
  frozenfalls(B, s, rnd) {
    const ry = rnd() * PI * 2;
    B.begin(s.x, s.h, s.z, ry, false);
    for (let i = -3; i <= 3; i++) B.geom('stone', rock(new THREE.ConeGeometry(7, 26 - Math.abs(i) * 2, 10, 4), 100 + i), T4(i * 8, 11, -16 - Math.abs(i) * 2));
    for (let i = -3; i <= 3; i++) { const [x, z] = LW(s, ry, i * 8, -16 - Math.abs(i) * 2); CIRCLES.push({ x, z, r: 6, top: s.h + 24 }); }
    // the fall itself, frozen in long ribbons down the rock and a pool of ice at its foot
    for (let i = 0; i < 14; i++) { const x = -6 + i * 0.95 + (rnd() - 0.5) * 0.6, L = 8 + rnd() * 10; B.geom('ice', new THREE.ConeGeometry(0.55 + rnd() * 0.5, L, 8), T4(x, 20 - L / 2, -9.4 - rnd() * 0.6, PI)); }
    B.geom('ice', rock(new THREE.BoxGeometry(12, 18, 2, 6, 8, 1), 111), T4(0, 11, -10.4));
    B.geom('ice', new THREE.CylinderGeometry(11, 11, 0.3, 28), T4(0, 0.1, -2));
    for (let i = 0; i < 10; i++) { const [x, z] = LW(s, ry, (rnd() - 0.5) * 24, -6 + (rnd() - 0.5) * 12); P('iceShard', x, z, rnd() * 6, 0.8 + rnd()); }
    for (let i = 0; i < 10; i++) { const [x, z] = LW(s, ry, (rnd() - 0.5) * 60, 8 + rnd() * 20); P('snowBoulder', x, z, rnd() * 6, 0.6 + rnd()); }
    B.begin(s.x, s.h, s.z, ry); chest(B, 9, 0, -6, 0.4);
    for (const [t, a, b] of [['bones', 8, -4], ['skull', 7.4, -3.4], ['pickaxe', 9.5, -4.6], ['snowcache', -10, 2]]) { const [x, z] = LW(s, ry, a, b); P(t, x, z, rnd() * 6); }
    trees(s, rnd, 10, 22, 40, 'pineSnow');
  },
  icecave(B, s, rnd) {
    const ry = rnd() * PI * 2;
    cavern(B, s, ry, { len: 20, w: 6, h: 4.6, mat: 'ice', rock: 'stone' });
    for (let i = 0; i < 9; i++) { const [x, z] = LW(s, ry, (rnd() < 0.5 ? -1 : 1) * (1.6 + rnd() * 1.2), 3 + rnd() * 15); P('iceShard', x, z, rnd() * 6, 0.6 + rnd() * 0.5); }
    B.begin(s.x, s.h, s.z, ry, false);
    for (let i = 0; i < 12; i++) B.geom('ice', new THREE.ConeGeometry(0.2 + rnd() * 0.2, 0.8 + rnd() * 1.4, 6), T4((rnd() - 0.5) * 5, 4.2, 2 + rnd() * 16, PI));
    B.begin(s.x, s.h, s.z, ry); chest(B, -1.6, 0, 18, PI); chest(B, 1.8, 0, 17.4, PI + 0.3);
    for (const [t, a, b] of [['snowcache', 0, 10], ['bones', 1, 6], ['skull', 0.6, 13], ['lantern', -2.4, 17]]) { const [x, z] = LW(s, ry, a, b); P(t, x, z, rnd() * 6); }
    for (let i = 0; i < 8; i++) { const [x, z] = LW(s, ry, (rnd() - 0.5) * 30, -4 - rnd() * 14); P('snowBoulder', x, z, rnd() * 6, 0.5 + rnd() * 0.8); }
  },
  shelter(B, s, rnd) {
    const ry = rnd() * PI * 2;
    B.begin(s.x, s.h, s.z, ry);
    const w = 5, d = 5, h = 2.5;
    B.box('stone', 0, h / 2, -d / 2, w, h, 0.5); B.box('stone', -w / 2, h / 2, 0, 0.5, h, d); B.box('stone', w / 2, h / 2, 0, 0.5, h, d);
    for (const sx of [-1, 1]) B.box('stone', sx * (w / 4 + 0.45), h / 2, d / 2, w / 2 - 0.9, h, 0.5);
    B.box('snowroof', 0, h + 0.2, 0, w + 1, 0.4, d + 1);
    B.box('floor', 0, 0.05, 0, w - 0.4, 0.1, d - 0.4, { col: false });
    stove(B, -1.4, 0.1, -1.6, h + 0.8); chest(B, 1.4, 0.1, -1.7, 0);
    B.box('woodDark', 1.4, 0.35, 1, 1.8, 0.4, 0.8);
    sign(B, "MINER'S SHELTER", 0, h - 0.3, d / 2 + 0.28, 2.6, 0.4, 0);
    const [hx, hz] = LW(s, ry, 0, 0); registerHeat(hx, s.h, hz, 2.4, 18, 'shelter'); LAMP_SPOTS.push([hx, s.h + 1.8, hz]);
    for (const [t, a, b] of [['woodpile', -3.6, 2], ['woodpile', -3.6, 0.4], ['snowcache', 3.6, 3], ['lantern', 1.4, 2.8]]) { const [x, z] = LW(s, ry, a, b); P(t, x, z, rnd() * 6); }
    trees(s, rnd, 6, 12, 26, 'pineSnow');
  },
  wreck(B, s, rnd) {
    // a freight that left the rails long ago: engine on its side, boxcars strewn behind it
    const ry = rnd() * PI * 2;
    B.begin(s.x, s.h, s.z, ry, false);
    B.geom('iron', new THREE.CylinderGeometry(1.1, 1.1, 8, 18), T4(0, 1.15, 0, PI / 2, 0, 0.35));
    B.box('iron', 0.3, 1.6, -5.2, 2.6, 2.8, 2.8, { rz: 1.2 });
    B.geom('iron', new THREE.CylinderGeometry(0.35, 0.5, 1.6, 10), T4(-1.6, 1, 3, 0, 0, 1.3));
    for (const zz of [-2.5, 0, 2.5]) B.geom('iron', new THREE.CylinderGeometry(0.75, 0.75, 0.15, 16), T4(1.3, 1.3, zz, 0, 0, PI / 2 - 0.35));
    B.begin(s.x, s.h, s.z, ry); B.addCollider(-1.4, 0, -6.6, 1.6, 2.4, 4.2);
    const cars = [[3, -16, 0.5, 0.3], [-4, -27, -0.6, 1.4], [6, -36, 1.1, 0.1]];
    for (const [a, b, yaw, roll] of cars) {
      B.begin(...((p => [p[0], s.h, p[1]])(LW(s, ry, a, b))), ry + yaw, false);
      B.box(rnd() < 0.5 ? 'woodRed' : 'woodGrey', 0, 1.6, 0, 2.8, 2.8, 9, { rz: roll });
      B.begin(...((p => [p[0], s.h, p[1]])(LW(s, ry, a, b))), ry + yaw); B.addCollider(-1.7, 0, -4.6, 1.7, 2.6, 4.6);
      chest(B, 2.6, 0, 1.2, PI / 2);
    }
    for (let i = 0; i < 14; i++) { const [x, z] = LW(s, ry, (rnd() - 0.5) * 22, -6 - rnd() * 36); P(['crate', 'barrel', 'sack', 'wheel', 'railStack', 'sleepers', 'bones'][i % 7], x, z, rnd() * 6); }
    P('skull', s.x + 3, s.z + 2, 1);
  },
});

// ---------- the wider territory ----------
// a sign on two posts at the edge of a place
function gateSign(B, s, ry, lx, lz, text) {
  const [x, z] = LW(s, ry, lx, lz); B.begin(x, heightAt(x, z), z, ry);
  for (const sx of [-1.7, 1.7]) B.box('woodDark', sx, 1.8, 0, 0.18, 3.6, 0.18);
  sign(B, text, 0, 3.2, 0.1, 3.2, 0.55, 0, { bg: '#2a1c12', fg: '#e4d4b4' });
}
// a street of buildings facing each other along local x; list: [type, spec extras] for each lot
function street(B, s, ry, list, rnd, o = {}) {
  const gap = o.gap || 13, half = o.half || 14, n = list.length, x0 = -((Math.ceil(n / 2) - 1) * gap) / 2;
  list.forEach(([type, extra], i) => {
    const side = i % 2 ? 1 : -1, lx = x0 + Math.floor(i / 2) * gap + (rnd() - 0.5) * 2, [x, z] = LW(s, ry, lx, side * half);
    // a lot on the + side faces -z (towards the street), on the - side faces +z
    const spec = Object.assign({ type, damage: o.damage ?? 2 }, o.paint && !DEFAULTS[type].paint ? { paint: o.paint(rnd) } : {}, extra);
    siteBuilding(B, x, s.h, z, ry + (side > 0 ? PI : 0) + (rnd() - 0.5) * 0.06, spec, rnd);
  });
}
const atL = (s, ry, a, b) => LW(s, ry, a, b);
function scatterL(s, ry, rnd, list, spread = [30, 20], off = [0, 0]) {
  for (const t of list) { const [x, z] = atL(s, ry, off[0] + (rnd() - 0.5) * spread[0] * 2, off[1] + (rnd() - 0.5) * spread[1] * 2); P(t, x, z, rnd() * 6, 0.85 + rnd() * 0.3); }
}
Object.assign(SITE_BUILD, {
  // a desert town the railroad passed by: its people gone, the sand coming in through the doors
  ghosttown(B, s, rnd) {
    const ry = rnd() * PI;
    street(B, s, ry, [['saloon', { sign: 'SALOON' }], ['store', { sign: 'ASSAY OFFICE' }], ['house', {}], ['shop', { sign: 'BARBER' }], ['church', { damage: 1 }], ['house', {}], ['shed', {}], ['hotel', { sign: 'HOTEL' }]], rnd, { paint: r => ['woodGrey', 'woodGrey', 'woodOchre', 'woodWhite', 'woodRed'][Math.floor(r() * 5)] });
    gateSign(B, s, ry, -62, 0, 'SANDHILL   POP. 0');
    // sand banked against the walls and drifted down the street
    for (let i = 0; i < 26; i++) { const [x, z] = atL(s, ry, (rnd() - 0.5) * 110, (rnd() < 0.5 ? -1 : 1) * (4 + rnd() * 18)); P('drift', x, z, ry + (rnd() - 0.5) * 0.6, 0.7 + rnd() * 1.2); }
    scatterL(s, ry, rnd, ['wagon', 'cart', 'wheel', 'wheel', 'barrel', 'barrel', 'crate', 'crate', 'trough', 'bones', 'skull', 'deadTree', 'deadTree', 'sack', 'scrapheap'], [52, 8]);
    for (let i = 0; i < 16; i++) { const [x, z] = atL(s, ry, -50 + i * 6.2, 30 + (rnd() - 0.5) * 2); if (rnd() > 0.2) P(rnd() < 0.5 ? 'fenceBroken' : 'fence', x, z, ry + (rnd() - 0.5) * 0.2); }
    // its graveyard, on the rise behind the church
    for (let i = 0; i < 9; i++) { const [x, z] = atL(s, ry, 40 + (i % 3) * 2.6, -42 - Math.floor(i / 3) * 3.4); P(rnd() < 0.7 ? 'cross' : 'tombstone', x, z, ry, 1, { tilt: (rnd() - 0.5) * 0.3 }); }
  },
  // a relay station on the old overland mail road, kept just long enough for the railroad to finish it
  stagestation(B, s, rnd) {
    const ry = rnd() * PI * 2;
    { const [x, z] = atL(s, ry, -10, 0); siteBuilding(B, x, s.h, z, ry, { type: 'house', w: 10, d: 7, damage: 1, paint: 'woodOchre', sign: 'OVERLAND MAIL' }, rnd); }
    { const [x, z] = atL(s, ry, 16, -6); siteBuilding(B, x, s.h, z, ry + PI / 2, { type: 'barn', w: 10, d: 14, damage: 1 }, rnd); }
    ring((p => ({ x: p[0], z: p[1] }))(atL(s, ry, 16, 20)), 11, 24, (x, z, a, i) => { if (i % 8 !== 3) P(rnd() < 0.3 ? 'fenceBroken' : 'fence', x, z, -a + PI / 2); });
    gateSign(B, s, ry, -2, 24, 'BUTTERFIELD STAGE');
    for (const [t, a, b] of [['wagon', 2, 12], ['wagon', -22, 10], ['trough', 6, 6], ['trough', 16, 12], ['hay', 22, -16], ['hay', 23.4, -15], ['barrel', -16, -5], ['barrel', -16.8, -4.2], ['crate', -4, -6], ['sack', -3, -6.6], ['wheel', 9, 14], ['signpost', 0, 30], ['deadTree', 30, -20]]) { const [x, z] = atL(s, ry, a, b); P(t, x, z, ry + (rnd() - 0.5) * 0.8); }
  },
  // the Sand Sea: dune crests to the horizon, and the little the desert hasn't swallowed yet
  dunes(B, s, rnd) {
    const ry = rnd() * PI * 2;
    // a wagon half under the sand, a shed roof-deep in it
    { const [x, z] = atL(s, ry, 4, 2); addProp('wagon', x, heightAt(x, z) - 0.7, z, ry, 1, { tilt: 0.18 }); }
    { const [x, z] = atL(s, ry, -14, -8); siteBuilding(B, x, s.h - 1.7, z, ry + 0.4, { type: 'shed', damage: 2, paint: 'woodGrey' }, rnd); }
    for (let i = 0; i < 18; i++) { const [x, z] = atL(s, ry, (rnd() - 0.5) * 60, (rnd() - 0.5) * 60); P('drift', x, z, ry + (rnd() - 0.5) * 0.5, 0.9 + rnd() * 1.6); }
    scatterL(s, ry, rnd, ['bones', 'bones', 'skull', 'skull', 'wheel', 'barrel', 'sack', 'cross', 'cross'], [24, 24]);
    { const [x, z] = atL(s, ry, 8, -4); B.begin(x, heightAt(x, z), z, ry); chest(B, 0, -0.25, 0, 0.3); }
  },
  // a mine driven straight into the mountain: timbered portal, rails out to the tailings, the shack the crew slept in
  adit(B, s, rnd) {
    const ry = rnd() * PI * 2, snow = s.snow || s.biome === SNOW;
    cavern(B, s, ry, { len: 22, w: 4.4, h: 3.8, mat: 'stone', rock: 'stone', portal: true });
    B.begin(s.x, s.h, s.z, ry);
    // track from the face out over the tailings heap
    for (let i = 0; i < 26; i++) B.box('woodDark', 0, 0.06, 20 - i * 1.1, 1.5, 0.1, 0.2, { col: false });
    for (const x of [-0.55, 0.55]) B.box('iron', x, 0.16, 6, 0.06, 0.08, 29, { col: false });
    chest(B, 1.2, 0, 19, PI);
    B.begin(s.x, s.h, s.z, ry, false);
    B.geom('stone', rock(new THREE.ConeGeometry(11, 5, 14, 3), 71), T4(5, 1.4, -14));
    { const [x, z] = atL(s, ry, 5, -14); CIRCLES.push({ x, z, r: 8, top: s.h + 5 }); }
    { const [x, z] = atL(s, ry, -12, -6); siteBuilding(B, x, s.h, z, ry + PI / 2, { type: 'shed', w: 5, d: 4.5, damage: 1, paint: 'woodGrey' }, rnd); }
    gateSign(B, s, ry, 5, -3, s.name.toUpperCase());
    for (const [t, a, b] of [['minecart', 0, 3], ['minecart', 0, -4.5], ['pickaxe', -2.5, 2], ['shovel', -2.8, 2.8], ['lantern', 2.2, 1.2], ['crate', -7, 1], ['crate', -7.6, 1.8], ['barrel', -6.5, -1], ['sleepers', 7, 4], ['railStack', 8, -1], ['orevein', 9, 6]]) { const [x, z] = atL(s, ry, a, b); P(t, x, z, ry + (rnd() - 0.5) * 0.4); }
    for (let i = 0; i < 10; i++) { const [x, z] = atL(s, ry, (rnd() - 0.5) * 40, -6 - rnd() * 22); P(snow ? 'snowBoulder' : rockFor(s), x, z, rnd() * 6, 0.4 + rnd() * 0.7); }
    if (snow || s.biome === FOREST) trees(s, rnd, 12, 22, 44, snow ? 'pineSnow' : 'pine');
  },
  // a woodland settlement: cabins round a clearing, smoke from one chimney, a garden fenced against the deer
  cabins(B, s, rnd, scene) {
    const n = 4;
    for (let i = 0; i < n; i++) {
      const a = i / n * PI * 2 + rnd() * 0.4, x = s.x + Math.cos(a) * 19, z = s.z + Math.sin(a) * 19;
      siteBuilding(B, x, s.h, z, Math.atan2(-Math.cos(a), -Math.sin(a)), { type: i === 3 ? 'shed' : 'house', w: 6 + rnd(), d: 5.5 + rnd(), damage: i === 2 ? 2 : i, paint: 'woodDark' }, rnd);
    }
    lightFire(scene, s.x, s.h, s.z, 1.1);
    ring(s, 3.4, 5, (x, z, a, i) => P(i % 2 ? 'log' : 'stump', x, z, -a + PI / 2, 0.75));
    ring({ x: s.x + 30, z: s.z - 4 }, 8, 18, (x, z, a, i) => { if (i !== 5) P(rnd() < 0.25 ? 'fenceBroken' : 'fence', x, z, -a + PI / 2); });
    for (let i = 0; i < 2; i++) rack(B, s.x - 28 + i * 3.4, heightAt(s.x - 28, s.z + 8), s.z + 8, 0.2);
    for (const [t, a, b] of [['woodpile', 8, 9], ['woodpile', -9, -8], ['woodpile', 10, -10], ['barrel', -6, 11], ['crate', -7, 12], ['herbpatch', 30, -4], ['herbpatch', 32, -2], ['wagon', -30, -14], ['shovel', 27, 2], ['lantern', 2, 4]]) P(t, s.x + a, s.z + b, rnd() * 6);
    trees(s, rnd, 34, 40, 78, s.biome === SNOW ? 'pineSnow' : 'pine');
    for (let i = 0; i < 8; i++) { const a = rnd() * PI * 2, r = 30 + rnd() * 30; P(rnd() < 0.5 ? 'log' : 'stump', s.x + Math.cos(a) * r, s.z + Math.sin(a) * r, rnd() * 6); }
  },
  // a ridge flattened by a storm: hundreds of trees down in rows, the ranger's cabin spared at the edge
  windfall(B, s, rnd) {
    const fall = rnd() * PI * 2;
    { const [x, z] = atL(s, fall, -16, 0); siteBuilding(B, x, s.h, z, fall + PI / 2, { type: 'house', w: 6.5, d: 6, damage: 1, paint: 'woodDark', sign: 'FOREST RANGER' }, rnd); }
    for (let i = 0; i < 70; i++) {
      const a = rnd() * PI * 2, r = 10 + Math.sqrt(rnd()) * 110, x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
      // all thrown the same way by the wind, give or take
      P('log', x, z, fall + (rnd() - 0.5) * 0.5, 0.9 + rnd() * 0.6);
      if (rnd() < 0.5) P('stump', x - Math.sin(fall) * 2.6, z - Math.cos(fall) * 2.6, rnd() * 6, 0.9 + rnd() * 0.4);
    }
    for (let i = 0; i < 12; i++) { const a = rnd() * PI * 2, r = 30 + rnd() * 90; P('snag', s.x + Math.cos(a) * r, s.z + Math.sin(a) * r, rnd() * 6, 0.8 + rnd() * 0.4); }
    trees(s, rnd, 30, 125, 170);
    for (const [t, a, b] of [['woodpile', -22, 6], ['woodpile', -22, 8], ['crate', -10, 4], ['barrel', -11, 5], ['lantern', -12, 2], ['signpost', -4, -8]]) { const [x, z] = atL(s, fall, a, b); P(t, x, z, rnd() * 6); }
  },
  // a silver camp high in the snow: headframe, mill, a street of empty houses, a drift driven into the mountain behind
  minetown(B, s, rnd) {
    const ry = rnd() * PI;
    street(B, s, ry, [['saloon', { sign: 'SILVER DOLLAR' }], ['store', { sign: 'COMPANY STORE' }], ['house', {}], ['hotel', { sign: 'MINERS HOTEL' }], ['house', {}], ['shed', {}], ['house', {}], ['warehouse', { sign: 'ASSAY' }]], rnd, { damage: 1, gap: 15, half: 15 });
    gateSign(B, s, ry, -72, 0, 'SILVER BELL');
    { const [x, z] = atL(s, ry, 8, 46); SITE_BUILD.mine(B, Object.assign({}, s, { x, z }), rnd); }
    { const [x, z] = atL(s, ry, -46, 58); SITE_BUILD.adit(B, Object.assign({}, s, { x, z, name: 'Bell Drift No. 2', snow: true }), rnd); }
    for (let i = 0; i < 18; i++) { const [x, z] = atL(s, ry, (rnd() - 0.5) * 120, (rnd() < 0.5 ? -1 : 1) * (4 + rnd() * 6)); P(['minecart', 'barrel', 'crate', 'sleepers', 'railStack', 'woodpile', 'snowcache', 'wheel', 'sack'][i % 9], x, z, ry + (rnd() - 0.5) * 0.8); }
    for (let i = 0; i < 14; i++) { const [x, z] = atL(s, ry, (rnd() - 0.5) * 150, -30 - rnd() * 30); P(rnd() < 0.4 ? 'stump' : 'snowRock', x, z, rnd() * 6); }
    trees(s, rnd, 40, 95, 150, 'pineSnow');
  },
});
