// Prop library: individually modelled props, merged per type, instanced per world cell
import * as THREE from 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/three.module.js';
import { Builder, CIRCLES } from './builder.js';
import { MAT } from './textures.js';
import { makeNoise, mulberry32 } from './noise.js';
import { registerLoot } from './game/registry.js';
const LOOTABLE = { crate: 'crate', barrel: 'barrel', sack: 'sack', wagon: 'wagon', cart: 'cart', minecart: 'minecart', woodpile: 'woodpile', orevein: 'orevein', herbpatch: 'herbs', snowcache: 'snowcache', scrapheap: 'scrap' };

const PI = Math.PI, M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3();
const pn = makeNoise(5150);
const PROPS = [];
// type -> {col: blocking radius, dist: max view distance, shadow}
const INFO = {
  barrel: { col: 0.32, dist: 450, shadow: true }, crate: { col: 0.45, dist: 450, shadow: true }, sack: { dist: 220 }, hay: { col: 0.5, dist: 450, shadow: true },
  trough: { col: 0.6, dist: 450, shadow: true }, wagon: { col: 1.5, dist: 900, shadow: true }, cart: { col: 0.9, dist: 600, shadow: true }, wheel: { dist: 300 },
  fence: { dist: 450, shadow: true }, fenceBroken: { dist: 450, shadow: true }, bones: { dist: 200 }, skull: { dist: 200 },
  rock: { col: 0.8, dist: 600 }, rockFlat: { dist: 350 }, boulder: { col: 2.6, dist: 2200, shadow: true },
  deadTree: { col: 0.3, dist: 1400, shadow: true }, bush: { dist: 450 }, yucca: { dist: 420, shadow: true }, ocotillo: { col: 0.2, dist: 900, shadow: true }, sage: { dist: 380, shadow: true }, grass: { dist: 140 }, saguaro: { col: 0.35, dist: 1600, shadow: true },
  pear: { dist: 300 }, lantern: { dist: 500 }, shovel: { dist: 160 }, pickaxe: { dist: 160 }, post: { col: 0.15, dist: 600, shadow: true },
  cross: { col: 0.1, dist: 500, shadow: true }, tombstone: { col: 0.35, dist: 500, shadow: true }, pole: { col: 0.18, dist: 1500, shadow: true },
  minecart: { col: 0.8, dist: 500, shadow: true }, signpost: { col: 0.15, dist: 600, shadow: true }, crossbuck: { col: 0.15, dist: 700, shadow: true },
  sleepers: { col: 1.2, dist: 500, shadow: true }, railStack: { col: 1.2, dist: 500, shadow: true }, milepost: { dist: 400 },
  drift: { dist: 700 }, ruin: { col: 2.4, dist: 900, shadow: true }, portal: { col: 2.2, dist: 900, shadow: true },
  // trees and plants of the other regions
  pine: { col: 0.35, dist: 1500, shadow: true }, pineSnow: { col: 0.35, dist: 1500, shadow: true }, oak: { col: 0.5, dist: 1500, shadow: true },
  cypress: { col: 0.45, dist: 1400, shadow: true }, snag: { col: 0.3, dist: 1100, shadow: true }, birch: { col: 0.25, dist: 1200, shadow: true },
  fern: { dist: 180 }, mushroom: { dist: 120 }, reeds: { dist: 260 }, lily: { dist: 200 }, flowers: { dist: 160 }, stump: { col: 0.35, dist: 350 },
  log: { col: 0.5, dist: 450, shadow: true }, mossRock: { col: 0.8, dist: 600 }, hoodoo: { col: 1.6, dist: 2000, shadow: true }, redBoulder: { col: 2.6, dist: 2200, shadow: true },
  snowRock: { col: 0.8, dist: 600 }, snowBoulder: { col: 2.6, dist: 2200, shadow: true }, iceShard: { col: 0.6, dist: 600, shadow: true },
  campfire: { col: 0.6, dist: 500 }, tent: { col: 1.4, dist: 700, shadow: true }, boardwalk: { dist: 600 }, stilts: { col: 0.2, dist: 600 },
  // resource nodes (searched like containers)
  woodpile: { col: 0.8, dist: 500, shadow: true }, orevein: { col: 1.0, dist: 600, shadow: true }, herbpatch: { dist: 260 }, snowcache: { col: 0.6, dist: 400, shadow: true }, scrapheap: { col: 1.0, dist: 500, shadow: true },
};
export function addProp(type, x, y, z, ry = 0, s = 1, o) {
  PROPS.push({ type, x, y, z, ry, s, tilt: o && o.tilt || 0 });
  if (LOOTABLE[type]) registerLoot(LOOTABLE[type], x, y, z, ry, { s });
}

// ---------- geometry ----------
const C = { wood: 0x9c8670, dark: 0x6e5440, iron: 0x3a3430, rust: 0x7a4a30, bone: 0xe6dcc6, hay: 0xd9b56a, burlap: 0xb39a72 };
function lathe(B, k, prof, seg, col, m) { B.geom(k, new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), seg), m, col); }
const T4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz)).clone();
function rockGeo(seed, detail, flat) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, n = makeNoise(seed);
  for (let i = 0; i < p.count; i++) {
    V.fromBufferAttribute(p, i);
    // broad lumps, then smaller knobs and fractures so the outline breaks up like real weathered stone
    const d = 1 + 0.35 * n(V.x * 1.3 + seed, V.y * 1.3 + V.z) + 0.15 * n(V.z * 3, V.x * 3 - seed) + (detail > 1 ? 0.07 * n(V.x * 7 + V.y * 3, V.z * 7 - seed) - 0.05 * Math.abs(n(V.y * 5 + seed, V.x * 5 + V.z * 2)) : 0);
    V.multiplyScalar(d); V.y *= flat; if (V.y < -0.25) V.y = -0.25 - (V.y + 0.25) * 0.2;
    p.setXYZ(i, V.x, V.y, V.z);
  }
  g.computeVertexNormals(); return g;
}
function wheel(B, x, y, z, rx, ry, r = 0.55) {
  const m = T4(x, y, z, rx, ry, 0);
  B.geom('pw', new THREE.TorusGeometry(r, 0.05, 5, 18), m, C.dark);
  B.geom('pm', new THREE.TorusGeometry(r + 0.03, 0.02, 4, 18), m, C.iron);
  for (let i = 0; i < 6; i++) B.geom('pw', new THREE.BoxGeometry(0.04, r * 2, 0.04), m.clone().multiply(T4(0, 0, 0, 0, 0, i * PI / 6)), C.dark);
  B.geom('pw', new THREE.CylinderGeometry(0.1, 0.1, 0.18, 8), m.clone().multiply(T4(0, 0, 0, PI / 2, 0, 0)), C.dark);
}
function ribbed(r, h, seg = 16) {
  const g = new THREE.CylinderGeometry(r * 0.9, r, h, seg, 4), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { V.fromBufferAttribute(p, i); const a = Math.atan2(V.z, V.x), k = 1 + 0.08 * Math.cos(a * 8); p.setXYZ(i, V.x * k, V.y, V.z * k); }
  g.computeVertexNormals(); return g;
}
const MAKERS = {
  barrel(B) {
    const prof = []; for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push([0.27 + 0.05 * Math.sin(PI * t), t * 0.9]); } prof.push([0, 0.9]);
    lathe(B, 'pw', prof, 14, C.wood);
    for (const y of [0.1, 0.32, 0.58, 0.8]) B.geom('pm', new THREE.TorusGeometry(0.29 + 0.04 * Math.sin(PI * y / 0.9), 0.014, 4, 16), T4(0, y, 0, PI / 2), C.rust);
  },
  crate(B) {
    B.box('pw', 0, 0.4, 0, 0.78, 0.78, 0.78, { c: C.wood });
    for (const [x, z, w, d] of [[0, 0.4, 0.82, 0.06], [0, -0.4, 0.82, 0.06], [0.4, 0, 0.06, 0.82], [-0.4, 0, 0.06, 0.82]]) {
      B.box('pw', x, 0.04, z, w, 0.08, d, { c: C.dark }); B.box('pw', x, 0.76, z, w, 0.08, d, { c: C.dark });
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box('pw', sx * 0.4, 0.4, sz * 0.4, 0.07, 0.8, 0.07, { c: C.dark });
    B.box('pw', 0, 0.4, 0.405, 0.06, 1.05, 0.02, { rz: 0.78, c: C.dark });
  },
  sack(B) { B.geom('pp', new THREE.SphereGeometry(0.3, 8, 6), T4(0, 0.2, 0, 0, 0, 0, 1, 0.7, 0.8), C.burlap); B.geom('pp', new THREE.ConeGeometry(0.12, 0.22, 6), T4(0, 0.45, 0, 0.3), C.burlap); },
  hay(B) { B.box('pp', 0, 0.28, 0, 1.0, 0.55, 0.6, { c: C.hay }); for (const x of [-0.25, 0.25]) B.box('pp', x, 0.28, 0, 0.03, 0.57, 0.62, { c: 0x7a6040 }); },
  trough(B) {
    B.box('pw', 0, 0.08, 0, 2.0, 0.12, 0.7, { c: C.dark });
    for (const s of [-1, 1]) { B.box('pw', 0, 0.35, s * 0.33, 2.0, 0.5, 0.06, { c: C.wood }); B.box('pw', s * 0.97, 0.35, 0, 0.06, 0.5, 0.7, { c: C.wood }); }
    B.box('pp', 0, 0.16, 0, 1.86, 0.04, 0.58, { c: 0x5a4a32 });
  },
  wagon(B) {
    B.box('pw', 0, 0.95, 0, 3.4, 0.1, 1.3, { rz: 0.12, c: C.wood });
    for (const s of [-1, 1]) B.box('pw', 0.1, 1.2, s * 0.62, 3.2, 0.45, 0.06, { rz: 0.12, c: C.wood });
    B.box('pw', -1.65, 1.0, 0, 0.06, 0.45, 1.3, { rz: 0.12, c: C.wood });
    wheel(B, 1.2, 0.62, 0.72, 0, 0, 0.62); wheel(B, -1.1, 0.5, 0.72, 0, 0, 0.5); wheel(B, 1.2, 0.62, -0.72, 0, 0, 0.62);
    wheel(B, -1.8, 0.06, -1.4, PI / 2, 0.4, 0.5);
    B.box('pw', 2.6, 0.3, 0, 2.2, 0.08, 0.08, { rz: -0.25, c: C.dark });
    for (let i = 0; i < 5; i++) B.geom('pw', new THREE.TorusGeometry(0.62, 0.025, 4, 10, PI * 0.95), T4(-1.0 + i * 0.6, 1.25, 0, 0, PI / 2, 0.12), C.dark);
    B.geom('pp', new THREE.PlaneGeometry(1.4, 1.2), T4(0.6, 1.6, 0.0, -0.4, PI / 2, 0.2), 0xc9b99a);
  },
  cart(B) {
    B.box('pw', 0, 0.75, 0, 1.6, 0.08, 1.1, { rz: -0.25, c: C.wood });
    for (const s of [-1, 1]) B.box('pw', 0, 0.95, s * 0.53, 1.6, 0.35, 0.05, { rz: -0.25, c: C.wood });
    wheel(B, 0.1, 0.55, 0.65, 0, 0, 0.55); wheel(B, 0.1, 0.55, -0.65, 0, 0, 0.55);
    for (const s of [-1, 1]) B.box('pw', -1.3, 0.3, s * 0.35, 1.6, 0.06, 0.06, { rz: -0.35, c: C.dark });
  },
  wheel(B) { wheel(B, 0, 0.62, 0, 0, 0, 0.6); },
  fence(B) {
    for (const x of [-1.25, 1.25]) B.box('pw', x, 0.6, 0, 0.14, 1.25, 0.14, { c: C.dark });
    B.box('pw', 0, 0.95, 0.05, 2.7, 0.12, 0.04, { c: C.wood }); B.box('pw', 0, 0.5, 0.05, 2.7, 0.12, 0.04, { rz: 0.02, c: C.wood });
  },
  fenceBroken(B) {
    B.box('pw', -1.25, 0.6, 0, 0.14, 1.25, 0.14, { c: C.dark }); B.box('pw', 1.25, 0.35, 0, 0.14, 0.7, 0.14, { rz: 0.3, c: C.dark });
    B.box('pw', -0.1, 0.62, 0.05, 2.6, 0.12, 0.04, { rz: -0.28, c: C.wood }); B.box('pw', 0.6, 0.05, 0.4, 1.4, 0.1, 0.04, { ry: 0.6, rx: 1.5, c: C.wood });
  },
  bones(B) {
    for (let i = 0; i < 6; i++) B.geom('pp', new THREE.TorusGeometry(0.32 - i * 0.02, 0.025, 4, 8, PI), T4(i * 0.13 - 0.3, 0.02, 0, 0, PI / 2 + 0.05 * i, 0.15), C.bone);
    B.box('pp', -0.05, 0.05, 0, 0.9, 0.05, 0.05, { c: C.bone });
    B.geom('pp', new THREE.SphereGeometry(0.13, 7, 5), T4(0.62, 0.1, 0.15, 0, 0, 0, 1.4, 0.8, 0.9), C.bone);
    for (const [x, z, r] of [[0.3, 0.5, 0.4], [-0.6, -0.45, 1.2], [0.1, -0.6, 2.4]]) B.box('pp', x, 0.03, z, 0.5, 0.045, 0.045, { ry: r, c: C.bone });
  },
  skull(B) {
    B.geom('pp', new THREE.SphereGeometry(0.15, 8, 6), T4(0, 0.1, 0, 0, 0, 0, 1, 0.75, 1.5), C.bone);
    for (const s of [-1, 1]) B.geom('pp', new THREE.ConeGeometry(0.035, 0.4, 5), T4(s * 0.22, 0.16, -0.1, 0, 0, s * -1.2), C.bone);
  },
  rock(B) { B.geom('ps', rockGeo(3, 2, 0.65), T4(0, 0.25, 0, 0, 0, 0, 1, 1, 1), 0xb48a66); },
  rockFlat(B) { B.geom('ps', rockGeo(9, 2, 0.3), T4(0, 0.05, 0, 0, 0, 0, 1.4, 1, 1), 0xa47a58); },
  boulder(B) { B.geom('ps', rockGeo(17, 3, 0.75), T4(0, 0.6, 0, 0, 0, 0, 2.8, 2.6, 2.4), 0xa86c48); B.geom('ps', rockGeo(21, 1, 0.7), T4(2.2, 0.2, 1.2, 0, 1, 0, 1.2, 1, 1), 0x9a6a4a); },
  // a dead juniper or mesquite: a twisting, split trunk, bare limbs that fork and kink, stubs where branches broke off
  deadTree(B) {
    const rnd = mulberry32(7);
    const limb = (m, len, r, depth) => {
      // each limb in three kinked segments, tapering
      let cur = m.clone(), rr = r;
      for (let s = 0; s < 3; s++) {
        const sl = len / 3, r1 = rr * 0.78;
        B.geom('pw', new THREE.CylinderGeometry(r1, rr, sl * 1.04, 6), cur.clone().multiply(T4(0, sl / 2, 0)), 0x7a6a5c);
        cur = cur.clone().multiply(T4(0, sl, 0, (rnd() - 0.5) * 0.45, rnd() * 1.2, (rnd() - 0.5) * 0.45)); rr = r1;
      }
      if (depth === 0) { if (rnd() < 0.6) B.geom('pw', new THREE.ConeGeometry(rr, len * 0.35, 5), cur.clone().multiply(T4(0, len * 0.17, 0)), 0x7a6a5c); return; }
      const n = depth > 1 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const at = 0.45 + rnd() * 0.5, mm = m.clone().multiply(T4(0, len * at, 0, 0.55 + rnd() * 0.55, i * 2.3 + rnd(), 0));
        limb(mm, len * (0.5 + rnd() * 0.22), r * 0.58, depth - 1);
      }
      if (rnd() < 0.5) B.geom('pw', new THREE.CylinderGeometry(r * 0.35, r * 0.45, 0.3, 5), m.clone().multiply(T4(0, len * (0.2 + rnd() * 0.3), 0, 1.3, rnd() * 6, 0)).multiply(T4(0, 0.15, 0)), 0x6a5a4c);
    };
    // the trunk splits low into two leaders
    limb(T4(0, -0.2, 0, 0.12, 0, 0.08), 2.1, 0.26, 2);
    limb(T4(0.05, 0.9, 0, -0.35, 1.7, 0.2), 2.6, 0.17, 2);
    // roots spreading over the ground
    for (let i = 0; i < 4; i++) { const a = i * 1.6 + rnd(); B.geom('pw', new THREE.ConeGeometry(0.12, 1.0, 5), T4(Math.cos(a) * 0.4, 0.05, Math.sin(a) * 0.4, 0, -a, PI / 2 - 0.25), 0x6a5a4c); }
  },
  // soapweed yucca: a ball of stiff narrow blades, a dry flower stalk standing out of it
  yucca(B) {
    const rnd = mulberry32(211);
    for (let i = 0; i < 46; i++) {
      const a = rnd() * 6.28, tilt = 0.15 + rnd() * 1.15, l = 0.6 + rnd() * 0.35;
      B.geom('pp', new THREE.ConeGeometry(0.022, l, 3), T4(0, 0.18, 0, 0, a, 0).multiply(T4(0, 0, 0, tilt, 0, 0)).multiply(T4(0, l / 2, 0)), rnd() < 0.7 ? 0x6e7a4e : 0x8a8456);
    }
    for (let i = 0; i < 12; i++) { const a = rnd() * 6.28; B.geom('pp', new THREE.ConeGeometry(0.02, 0.5, 3), T4(0, 0.08, 0, 0, a, 0).multiply(T4(0, 0, 0, 1.5, 0, 0)).multiply(T4(0, 0.25, 0)), 0x9a8a62); }
    if (rnd() < 0.9) { B.geom('pw', new THREE.CylinderGeometry(0.012, 0.022, 1.6, 4), T4(0.05, 1.0, 0, 0.06, 0, 0.04), 0x8a7a5a); for (let i = 0; i < 8; i++) B.geom('pp', new THREE.SphereGeometry(0.035, 4, 3), T4(0.07 + (rnd() - 0.5) * 0.08, 1.4 + i * 0.07, (rnd() - 0.5) * 0.08), 0xb8a478); }
  },
  // ocotillo: a fan of long whip-like canes from one root, tipped red after rain
  ocotillo(B) {
    const rnd = mulberry32(223);
    for (let i = 0; i < 13; i++) {
      const a = rnd() * 6.28, tilt = 0.12 + rnd() * 0.32, l = 2.6 + rnd() * 2.2;
      const m = T4(0, 0, 0, 0, a, 0).multiply(T4(0, 0, 0, tilt, 0, 0));
      B.geom('pw', new THREE.CylinderGeometry(0.018, 0.04, l, 5), m.clone().multiply(T4(0, l / 2, 0)), 0x6a6250);
      if (rnd() < 0.55) B.geom('pp', new THREE.ConeGeometry(0.035, 0.28, 4), m.clone().multiply(T4(0, l + 0.12, 0)), 0xb0402a);
      // the canes carry short spines and tiny leaves along their length
      for (let k = 1; k < 5; k++) B.geom('pp', new THREE.IcosahedronGeometry(0.05, 0), m.clone().multiply(T4(0, l * k / 5, 0, 0, 0, 0, 1, 2.2, 1)), 0x6f7a44);
    }
  },
  // sagebrush and creosote: a low woody mound of grey-green, twiggy underneath
  sage(B) {
    const rnd = mulberry32(229);
    for (let i = 0; i < 9; i++) B.box('pw', 0, 0.25, 0, 0.025, 0.6, 0.025, { rx: (rnd() - 0.5) * 1.3, rz: (rnd() - 0.5) * 1.3, ry: rnd() * 3, c: 0x5e5244, col: false });
    for (let i = 0; i < 22; i++) {
      const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 0.55, y = 0.22 + rnd() * 0.38 - r * 0.25;
      B.geom('pp', new THREE.IcosahedronGeometry(0.13 + rnd() * 0.12, 0), T4(Math.cos(a) * r, y, Math.sin(a) * r, rnd() * 3, rnd() * 3, rnd() * 3, 1, 0.7, 1), [0x8a9070, 0x9a9a78, 0x7a8462, 0xa8a080][i % 4]);
    }
  },
  bush(B) {
    const rnd = mulberry32(13);
    for (let i = 0; i < 9; i++) {
      const a = rnd() * 6.28, r = rnd() * 0.5;
      B.geom('pp', new THREE.IcosahedronGeometry(0.35 + rnd() * 0.25, 0), T4(Math.cos(a) * r, 0.25 + rnd() * 0.3, Math.sin(a) * r, rnd(), rnd(), rnd(), 1, 0.7, 1), rnd() < 0.5 ? 0x8a8458 : 0x9a8460);
    }
    for (let i = 0; i < 8; i++) B.box('pw', 0, 0.3, 0, 0.03, 0.8, 0.03, { rx: (rnd() - 0.5) * 1.6, rz: (rnd() - 0.5) * 1.6, c: 0x5a4a3a, col: false });
  },
  grass(B) {
    const rnd = mulberry32(31);
    for (let i = 0; i < 7; i++) B.geom('pp', new THREE.ConeGeometry(0.03, 0.5 + rnd() * 0.4, 3), T4((rnd() - 0.5) * 0.3, 0.3, (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.8, 0, (rnd() - 0.5) * 0.8), rnd() < 0.5 ? 0xc8b078 : 0xa89860);
  },
  saguaro(B) {
    const g = 0x5f7a4a;
    B.geom('pp', ribbed(0.3, 5.2), T4(0, 2.6, 0), g); B.geom('pp', new THREE.SphereGeometry(0.27, 10, 6), T4(0, 5.2, 0, 0, 0, 0, 1, 0.8, 1), g);
    for (const [s, h, l] of [[1, 2.2, 1.6], [-1, 2.9, 1.2]]) {
      B.geom('pp', ribbed(0.2, 0.7, 12), T4(s * 0.45, h, 0, 0, 0, s * PI / 2), g);
      B.geom('pp', ribbed(0.2, l, 12), T4(s * 0.8, h + l / 2, 0), g);
      B.geom('pp', new THREE.SphereGeometry(0.19, 8, 5), T4(s * 0.8, h + l, 0), g);
      B.geom('pp', new THREE.SphereGeometry(0.21, 8, 5), T4(s * 0.78, h, 0), g);
    }
  },
  pear(B) {
    const rnd = mulberry32(41);
    for (let i = 0; i < 7; i++) B.geom('pp', new THREE.SphereGeometry(0.22, 8, 5), T4((rnd() - 0.5) * 0.7, 0.2 + rnd() * 0.5, (rnd() - 0.5) * 0.7, rnd(), rnd() * 3, rnd() - 0.5, 1, 1.2, 0.3), 0x6f8a52);
  },
  lantern(B) {
    B.box('pm', 0, 0.02, 0, 0.18, 0.04, 0.18, { c: C.iron }); B.box('pm', 0, 0.3, 0, 0.18, 0.04, 0.18, { c: C.iron });
    B.box('lamp', 0, 0.16, 0, 0.13, 0.24, 0.13); B.geom('pm', new THREE.TorusGeometry(0.06, 0.008, 3, 8, PI), T4(0, 0.33, 0), C.iron);
  },
  shovel(B) { B.box('pw', 0, 0.75, 0, 0.04, 1.3, 0.04, { rz: 0.2, c: C.wood }); B.box('pm', -0.13, 0.1, 0, 0.22, 0.28, 0.02, { rz: 0.2, c: C.rust }); },
  pickaxe(B) { B.box('pw', 0, 0.05, 0, 0.9, 0.04, 0.04, { c: C.wood }); B.geom('pm', new THREE.TorusGeometry(0.3, 0.02, 3, 8, 1.6), T4(0.45, 0.03, 0, PI / 2, 0, 0.75), C.iron); },
  post(B) { B.box('pw', 0, 0.6, 0, 0.14, 1.3, 0.14, { c: C.dark }); },
  cross(B) { B.box('pw', 0, 0.55, 0, 0.08, 1.2, 0.05, { c: C.wood }); B.box('pw', 0, 0.85, 0, 0.55, 0.08, 0.05, { c: C.wood }); B.box('pp', 0, 0.02, 0.5, 0.6, 0.12, 1.6, { c: 0x9a7a58 }); },
  tombstone(B) { B.box('ps', 0, 0.35, 0, 0.55, 0.7, 0.14, { c: 0xb0a490 }); B.geom('ps', new THREE.CylinderGeometry(0.275, 0.275, 0.14, 10, 1, false, 0, PI), T4(0, 0.7, 0, PI / 2, 0, PI / 2), 0xb0a490); B.box('pp', 0, 0.02, 0.6, 0.6, 0.1, 1.6, { c: 0x9a7a58 }); },
  pole(B) {
    B.geom('pw', new THREE.CylinderGeometry(0.11, 0.15, 8.2, 7), T4(0, 4.0, 0), 0x6e5a48);
    for (const y of [7.5, 6.9]) { B.box('pw', 0, y, 0, 0.1, 0.12, 1.8, { c: C.dark }); for (const z of [-0.8, -0.35, 0.35, 0.8]) B.geom('pp', new THREE.CylinderGeometry(0.04, 0.05, 0.12, 6), T4(0, y + 0.12, z), 0x4a8a7a); }
  },
  minecart(B) {
    B.geom('pm', new THREE.CylinderGeometry(0.75, 0.55, 0.7, 4, 1, true), T4(0, 0.75, 0, 0, PI / 4, 0, 1.3, 1, 0.8), C.rust);
    B.box('pm', 0, 0.42, 0, 1.0, 0.05, 0.75, { c: C.rust });
    for (const sx of [-0.45, 0.45]) for (const sz of [-0.42, 0.42]) B.geom('pm', new THREE.CylinderGeometry(0.17, 0.17, 0.06, 10), T4(sx, 0.17, sz, PI / 2), C.iron);
  },
  signpost(B) { B.box('pw', 0, 1.1, 0, 0.12, 2.2, 0.12, { c: C.dark }); B.box('pw', 0.35, 1.8, 0, 1.1, 0.28, 0.04, { rz: 0.05, c: C.wood }); B.box('pw', -0.3, 1.45, 0.05, 0.9, 0.26, 0.04, { ry: 0.6, rz: -0.08, c: C.wood }); },
  crossbuck(B) { B.box('pw', 0, 1.6, 0, 0.14, 3.2, 0.14, { c: 0xd0c4b0 }); for (const r of [0.6, -0.6]) B.box('pw', 0, 2.7, 0.09, 1.6, 0.22, 0.04, { rz: r, c: 0xe0d6c4 }); },
  sleepers(B) { for (let y = 0; y < 4; y++) for (let i = 0; i < 4; i++) B.box('pw', (i - 1.5) * 0.3 + (y % 2) * 0.1, 0.09 + y * 0.17, 0, 0.26, 0.16, 2.6, { ry: (y % 2) * 0.05, c: 0x6a5440 }); },
  railStack(B) { for (let i = 0; i < 5; i++) B.box('pm', (i - 2) * 0.2, 0.08 + (i % 2) * 0.13, 0, 0.08, 0.15, 6, { c: C.rust }); for (const z of [-2, 2]) B.box('pw', 0, 0.04, z, 1.2, 0.08, 0.2, { c: C.dark }); },
  milepost(B) { B.box('pw', 0, 0.6, 0, 0.2, 1.2, 0.2, { c: 0xd8ccb4 }); B.box('pw', 0, 1.22, 0, 0.24, 0.06, 0.24, { c: 0x3a2a20 }); },
  // sand blown into a long low bank, steeper on the lee side
  drift(B) { B.geom('pp', new THREE.SphereGeometry(1, 14, 6, 0, PI * 2, 0, PI / 2), T4(0, -0.05, 0, 0, 0, 0, 3.2, 0.55, 1.5), 0xd9b88e); B.geom('pp', new THREE.SphereGeometry(1, 10, 5, 0, PI * 2, 0, PI / 2), T4(1.6, -0.05, 0.4, 0, 0.5, 0, 1.6, 0.35, 0.9), 0xd4b086); },
  // a homesteader's shack fallen in: two walls standing, one leaning, the roof down across the floor
  ruin(B) {
    const rnd = mulberry32(241), W = 4.2, D = 5;
    B.box('pw', 0, 0.08, 0, W, 0.16, D, { c: 0x7a6650 });
    B.box('pw', 0, 1.15, -D / 2, W, 2.3, 0.12, { c: 0x8a7660 });
    B.box('pw', -W / 2, 0.9, 0, 0.12, 1.8, D, { c: 0x7e6a56 });
    for (let i = 0; i < 5; i++) B.box('pw', -W / 2 + 0.06, 1.9 + rnd() * 0.3, -D / 2 + 0.5 + i, 0.1, 0.4 + rnd() * 0.5, 0.18, { c: 0x7e6a56, col: false });
    B.box('pw', W / 2 + 0.3, 0.75, 0.4, 0.12, 1.9, D * 0.8, { rz: -0.55, c: 0x8a7660, col: false });
    B.box('pw', 0.2, 0.9, 0.6, W + 0.6, 0.08, D * 0.75, { rx: 0.08, rz: 0.36, c: 0x6a5a4a, col: false });
    B.box('pw', -0.6, 2.25, -D / 2 + 0.05, 1.0, 0.1, 0.12, { c: 0x5e4c3a });
    B.geom('pm', new THREE.CylinderGeometry(0.09, 0.09, 1.6, 8), T4(1.2, 0.5, -1.6, 0, 0, 1.3), 0x3a3430);
    B.box('pm', 1.3, 0.35, -1.7, 0.6, 0.7, 0.5, { c: 0x2e2a28 });
    for (let i = 0; i < 9; i++) B.box('pw', (rnd() - 0.5) * 7, 0.05 + rnd() * 0.1, (rnd() - 0.5) * 7, 0.2, 0.04, 1 + rnd() * 2, { ry: rnd() * PI, rz: (rnd() - 0.5) * 0.3, c: 0x7a6650, col: false });
  },
  // a prospect hole driven into a slope: timber sets, a black mouth, rock heaped round it; faces +z, the hill behind
  portal(B) {
    B.geom('ps', rockGeo(251, 2, 0.8), T4(0, 1.2, -2.6, 0, 0, 0, 3.6, 2.6, 2.8), 0x8a7a6a);
    for (const s of [-1, 1]) B.geom('ps', rockGeo(252 + s, 1, 0.7), T4(s * 2.2, 0.6, -0.6, 0, s, 0, 1.4, 1.3, 1.3), 0x7e6e60);
    B.box('pp', 0, 1.05, -0.35, 1.7, 2.1, 0.6, { c: 0x080605 });
    for (const s of [-1, 1]) B.box('pw', s * 0.95, 1.1, 0.02, 0.24, 2.2, 0.24, { c: 0x5a4632 });
    B.box('pw', 0, 2.25, 0.02, 2.3, 0.26, 0.3, { c: 0x5a4632 });
    B.box('pw', 0.6, 0.6, 0.12, 1.6, 0.14, 0.05, { rz: 0.7, c: 0x7a6650 }); B.box('pw', -0.3, 1.5, 0.14, 1.8, 0.14, 0.05, { rz: -0.4, c: 0x7a6650 });
    B.geom('ps', rockGeo(255, 1, 0.35), T4(0.4, 0.05, 2.6, 0, 0, 0, 2.6, 1, 2.0), 0x9a8a78);
  },
  // ---- forest ----
  pine(B) { conifer(B, 0x3c5a34, 0x2f4a2a, false); },
  pineSnow(B) { conifer(B, 0x3a5236, 0x2c4430, true); },
  oak(B) {
    const rnd = mulberry32(57);
    B.geom('pw', new THREE.CylinderGeometry(0.32, 0.5, 4.2, 8), T4(0, 2.1, 0, 0.03, 0, 0.02), 0x5a4632);
    for (const [a, l] of [[0.6, 2.4], [2.4, 2.2], [4.2, 2.6]]) B.geom('pw', new THREE.CylinderGeometry(0.12, 0.22, l, 6), T4(Math.cos(a) * 0.8, 4.2, Math.sin(a) * 0.8, Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7), 0x5a4632);
    for (let i = 0; i < 9; i++) { const a = rnd() * 6.28, r = 1 + rnd() * 2.2; B.geom('pp', new THREE.IcosahedronGeometry(1.5 + rnd() * 0.8, 1), T4(Math.cos(a) * r, 5.4 + rnd() * 1.8, Math.sin(a) * r, rnd(), rnd(), 0, 1, 0.75, 1), rnd() < 0.5 ? 0x4e6a34 : 0x5d7a3c); }
  },
  birch(B) {
    B.geom('pw', new THREE.CylinderGeometry(0.12, 0.17, 7, 7), T4(0, 3.5, 0), 0xd8d4c8);
    for (const y of [1.5, 2.6, 3.8, 5.1]) B.box('pw', 0, y, 0.15, 0.2, 0.06, 0.05, { c: 0x2a2622, col: false });
    const rnd = mulberry32(61); for (let i = 0; i < 6; i++) B.geom('pp', new THREE.IcosahedronGeometry(0.9 + rnd() * 0.4, 1), T4((rnd() - 0.5) * 1.6, 5.6 + rnd() * 1.6, (rnd() - 0.5) * 1.6, 0, 0, 0, 1, 1.2, 1), rnd() < 0.5 ? 0x8a9a44 : 0xa8a84a);
  },
  fern(B) { const rnd = mulberry32(71); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28 + rnd() * 0.3; B.geom('pp', new THREE.PlaneGeometry(0.22, 0.9), T4(Math.cos(a) * 0.3, 0.32, Math.sin(a) * 0.3, 0.9, -a + PI / 2, 0), 0x4a6a32); } },
  mushroom(B) { for (const [x, z, s] of [[0, 0, 1], [0.2, 0.12, 0.7], [-0.15, 0.18, 0.55]]) { B.geom('pp', new THREE.CylinderGeometry(0.03 * s, 0.04 * s, 0.14 * s, 6), T4(x, 0.07 * s, z), 0xe8dcc4); B.geom('pp', new THREE.SphereGeometry(0.09 * s, 8, 4, 0, PI * 2, 0, PI / 2), T4(x, 0.14 * s, z), 0xa8301e); } },
  flowers(B) { const rnd = mulberry32(83); for (let i = 0; i < 9; i++) { const x = (rnd() - 0.5) * 0.8, z = (rnd() - 0.5) * 0.8; B.geom('pp', new THREE.ConeGeometry(0.012, 0.35, 3), T4(x, 0.17, z), 0x5a7a3a); B.geom('pp', new THREE.SphereGeometry(0.045, 5, 4), T4(x, 0.36, z), [0xd8c040, 0xb05aa0, 0xe8e0d0, 0xd86a30][i % 4]); } },
  stump(B) { B.geom('pw', new THREE.CylinderGeometry(0.42, 0.55, 0.55, 9), T4(0, 0.27, 0), 0x6a5240); B.geom('pp', new THREE.CircleGeometry(0.42, 9), T4(0, 0.551, 0, -PI / 2), 0xb89a70); },
  log(B) { B.geom('pw', new THREE.CylinderGeometry(0.32, 0.36, 5.2, 9), T4(0, 0.32, 0, 0, 0, PI / 2), 0x5e4a38); for (const x of [-2.6, 2.6]) B.geom('pp', new THREE.CircleGeometry(0.33, 9), T4(x, 0.32, 0, 0, Math.sign(x) * PI / 2, 0), 0xa88a62); },
  mossRock(B) { B.geom('ps', rockGeo(5, 1, 0.6), T4(0, 0.3, 0, 0, 0, 0, 1.1, 1, 1), 0x7a7a6a); B.geom('pp', rockGeo(6, 1, 0.25), T4(0.1, 0.62, 0, 0, 0, 0, 0.9, 0.5, 0.8), 0x4e6a30); },
  // ---- swamp ----
  cypress(B) {
    B.geom('pw', new THREE.CylinderGeometry(0.28, 1.0, 1.6, 9), T4(0, 0.6, 0), 0x5a4a3a);
    B.geom('pw', new THREE.CylinderGeometry(0.2, 0.3, 9, 7), T4(0, 5.6, 0), 0x5a4a3a);
    const rnd = mulberry32(93);
    for (let i = 0; i < 5; i++) { const a = rnd() * 6.28, y = 6.5 + i * 0.9; B.geom('pp', new THREE.CylinderGeometry(1.6 - i * 0.15, 1.8 - i * 0.15, 0.6, 9), T4(Math.cos(a) * 0.4, y, Math.sin(a) * 0.4), 0x4a5a32); }
    for (let i = 0; i < 10; i++) { const a = rnd() * 6.28, r = 0.8 + rnd() * 1.1; B.geom('pp', new THREE.PlaneGeometry(0.25, 1.6 + rnd()), T4(Math.cos(a) * r, 5.6 + rnd() * 2, Math.sin(a) * r, 0, a, 0), 0x8a9468); }
    for (let i = 0; i < 4; i++) { const a = i * 1.6; B.geom('pw', new THREE.ConeGeometry(0.12, 0.6, 5), T4(Math.cos(a) * 1.6, 0.2, Math.sin(a) * 1.6), 0x5a4a3a); }
  },
  snag(B) {
    const rnd = mulberry32(97);
    B.geom('pw', new THREE.CylinderGeometry(0.12, 0.3, 6.5, 6), T4(0, 3.2, 0, 0.06, 0, 0.04), 0x4a4238);
    for (let i = 0; i < 4; i++) B.geom('pw', new THREE.CylinderGeometry(0.04, 0.09, 1.8, 5), T4(0, 2.5 + i * 0.9, 0, 0.9, i * 1.7 + rnd(), 0).multiply(T4(0, 0.9, 0)), 0x4a4238);
    for (let i = 0; i < 6; i++) B.geom('pp', new THREE.PlaneGeometry(0.2, 1.2), T4((rnd() - 0.5) * 1.2, 3.8 + rnd() * 2, (rnd() - 0.5) * 1.2, 0, rnd() * 3, 0), 0x8a9468);
  },
  reeds(B) { const rnd = mulberry32(101); for (let i = 0; i < 14; i++) { const x = (rnd() - 0.5) * 1.2, z = (rnd() - 0.5) * 1.2, h = 1.1 + rnd() * 0.9; B.geom('pp', new THREE.ConeGeometry(0.02, h, 3), T4(x, h / 2, z, (rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3), 0x7a8a4a); if (i % 3 === 0) B.geom('pp', new THREE.CylinderGeometry(0.035, 0.035, 0.2, 5), T4(x, h * 0.85, z), 0x5a3a22); } },
  lily(B) { const rnd = mulberry32(103); for (let i = 0; i < 6; i++) B.geom('pp', new THREE.CircleGeometry(0.22 + rnd() * 0.12, 8, 0.3, PI * 1.8), T4((rnd() - 0.5) * 1.5, 0.03, (rnd() - 0.5) * 1.5, -PI / 2, 0, rnd() * 6), 0x4a6a30); B.geom('pp', new THREE.SphereGeometry(0.06, 6, 4), T4(0.1, 0.07, 0.1), 0xe8e0e8); },
  boardwalk(B) { for (let i = 0; i < 6; i++) B.box('pw', (i - 2.5) * 0.52, 0.5, 0, 0.46, 0.06, 1.6, { c: 0x7a6650, ry: (i % 3 - 1) * 0.03 }); for (const x of [-1.5, 1.5]) for (const z of [-0.75, 0.75]) B.box('pw', x, -0.2, z, 0.14, 1.5, 0.14, { c: 0x4a3c2e }); },
  // ---- badlands ----
  hoodoo(B) {
    const rnd = mulberry32(107); let y = 0;
    for (let i = 0; i < 5; i++) { const r = 1.6 - i * 0.18 + (rnd() - 0.5) * 0.4, h = 1.6 + rnd() * 1.4; B.geom('ps', rockGeo(110 + i, 1, 1), T4((rnd() - 0.5) * 0.3, y + h / 2, (rnd() - 0.5) * 0.3, 0, rnd() * 3, 0, r, h / 2, r), [0xb86a40, 0xd89a68, 0xa85a38, 0xc88a5a, 0x9a5236][i]); y += h * 0.85; }
    B.geom('ps', rockGeo(120, 1, 0.5), T4(0, y + 0.3, 0, 0, 0, 0, 1.9, 0.8, 1.9), 0x7a4a30);
  },
  redBoulder(B) { B.geom('ps', rockGeo(131, 3, 0.75), T4(0, 0.6, 0, 0, 0, 0, 2.8, 2.4, 2.4), 0xb05a34); B.geom('ps', rockGeo(133, 1, 0.7), T4(2.1, 0.2, 1.1, 0, 1, 0, 1.2, 1, 1), 0xc87048); },
  // ---- snow ----
  snowRock(B) { B.geom('ps', rockGeo(141, 1, 0.65), T4(0, 0.25, 0), 0x7a7a80); B.geom('pp', rockGeo(142, 1, 0.3), T4(0, 0.52, 0, 0, 0, 0, 0.95, 0.6, 0.95), 0xf2f4f8); },
  snowBoulder(B) { B.geom('ps', rockGeo(151, 2, 0.75), T4(0, 0.6, 0, 0, 0, 0, 2.8, 2.4, 2.4), 0x6e6e76); B.geom('pp', rockGeo(152, 1, 0.3), T4(0, 2.1, 0, 0, 0, 0, 2.5, 0.9, 2.2), 0xf2f4f8); },
  iceShard(B) { const rnd = mulberry32(157); for (let i = 0; i < 5; i++) B.geom('pp', new THREE.ConeGeometry(0.25 + rnd() * 0.2, 1.4 + rnd() * 1.6, 5), T4((rnd() - 0.5) * 1.2, 0.7, (rnd() - 0.5) * 1.2, (rnd() - 0.5) * 0.5, 0, (rnd() - 0.5) * 0.5), 0xbcd8ec); },
  // ---- camps ----
  campfire(B) {
    for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28; B.geom('ps', rockGeo(160 + i, 0, 0.7), T4(Math.cos(a) * 0.6, 0.08, Math.sin(a) * 0.6, 0, 0, 0, 0.18, 0.15, 0.18), 0x6a645c); }
    for (let i = 0; i < 4; i++) B.geom('pw', new THREE.CylinderGeometry(0.05, 0.06, 0.8, 5), T4(0, 0.22, 0, 1.1, i * 1.57, 0), 0x3a2a1e);
    B.geom('pp', new THREE.CircleGeometry(0.4, 9), T4(0, 0.03, 0, -PI / 2), 0x1c1814);
  },
  tent(B) {
    for (const s of [-1, 1]) B.box('pp', 0, 0.85, s * 0.62, 2.6, 0.04, 1.9, { rx: s * 0.72, c: 0xcab894 });
    B.box('pw', 0, 1.55, 0, 2.8, 0.06, 0.06, { c: 0x4a3828 });
    for (const x of [-1.35, 1.35]) B.box('pw', x, 0.78, 0, 0.06, 1.55, 0.06, { c: 0x4a3828 });
  },
  stilts(B) { B.box('pw', 0, 0.2, 0, 0.18, 2.4, 0.18, { c: 0x4a3c2e }); },
  // ---- resource nodes ----
  woodpile(B) {
    for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - r; i++) B.geom('pw', new THREE.CylinderGeometry(0.15, 0.15, 1.4, 7), T4(0, 0.15 + r * 0.27, (i - (3 - r) / 2) * 0.31, 0, 0, PI / 2), 0x7a5a3a);
    B.box('pw', -0.75, 0.4, 0, 0.08, 0.8, 1.4, { c: 0x4a3828 }); B.box('pw', 0.75, 0.4, 0, 0.08, 0.8, 1.4, { c: 0x4a3828 });
  },
  orevein(B) {
    B.geom('ps', rockGeo(171, 2, 0.8), T4(0, 0.5, 0, 0, 0, 0, 1.4, 1.2, 1.2), 0x6a5a50);
    const rnd = mulberry32(173); for (let i = 0; i < 9; i++) B.geom('pm', new THREE.OctahedronGeometry(0.1 + rnd() * 0.08, 0), T4((rnd() - 0.5) * 1.6, 0.4 + rnd() * 0.8, (rnd() - 0.5) * 1.4, rnd(), rnd(), 0), [0xc88a4a, 0x5ab8a8, 0xd8c060][i % 3]);
  },
  herbpatch(B) { const rnd = mulberry32(181); for (let i = 0; i < 10; i++) { const x = (rnd() - 0.5) * 0.9, z = (rnd() - 0.5) * 0.9; B.geom('pp', new THREE.IcosahedronGeometry(0.12 + rnd() * 0.08, 0), T4(x, 0.12, z, 0, 0, 0, 1, 1.6, 1), 0x6a8a3a); if (i % 3 === 0) B.geom('pp', new THREE.SphereGeometry(0.04, 5, 4), T4(x, 0.3, z), 0xe8d8f0); } B.box('pp', 0, 0.01, 0, 0.12, 0.6, 0.12, { c: 0x5a7a30, ry: 0.4 }); },
  snowcache(B) { B.box('pw', 0, 0.3, 0, 0.9, 0.6, 0.7, { c: C.wood }); B.box('pw', 0, 0.62, 0, 0.95, 0.06, 0.75, { c: C.dark }); B.geom('pp', rockGeo(191, 1, 0.35), T4(0, 0.65, 0, 0, 0, 0, 0.75, 0.5, 0.6), 0xf2f4f8); B.box('pw', 0.2, 1.0, 0.1, 0.05, 1.6, 0.05, { rz: 0.2, c: 0xa8301e }); },
  scrapheap(B) { const rnd = mulberry32(199); for (let i = 0; i < 8; i++) B.box('pm', (rnd() - 0.5) * 1.4, 0.1 + rnd() * 0.3, (rnd() - 0.5) * 1.2, 0.3 + rnd() * 0.7, 0.04, 0.3 + rnd() * 0.5, { rx: rnd() - 0.5, ry: rnd() * 3, rz: rnd() - 0.5, c: i % 2 ? C.rust : 0x8a8a8a }); wheel(B, 0.4, 0.3, -0.3, 1.3, 0.3, 0.45); },
};
function conifer(B, c1, c2, snow) {
  B.geom('pw', new THREE.CylinderGeometry(0.14, 0.28, 2.6, 7), T4(0, 1.3, 0), 0x5a4232);
  for (let i = 0; i < 4; i++) {
    const r = 2.3 - i * 0.48, y = 2.0 + i * 1.75;
    B.geom('pp', new THREE.ConeGeometry(r, 2.8, 9), T4(0, y + 1.4, 0, 0, i * 0.7, 0), i % 2 ? c1 : c2);
    if (snow) B.geom('pp', new THREE.ConeGeometry(r * 0.82, 1.1, 9), T4(0, y + 2.25, 0, 0, i * 0.7 + 0.3, 0), 0xf2f4f8);
  }
}
const MATKEY = { pw: 'propWood', pp: 'propPlain', ps: 'propStone', pm: 'propMetal', lamp: 'lamp' };

// living things sway: plant parts get the wind-blown materials, the rest keep the plain ones
const PLANTS = new Set(['bush', 'grass', 'saguaro', 'pear', 'yucca', 'ocotillo', 'sage', 'pine', 'pineSnow', 'oak', 'birch', 'fern', 'flowers', 'reeds', 'cypress', 'snag', 'herbpatch', 'deadTree']);
const PLANT_KEY = { pp: 'propPlant', pw: 'propPlantWood' };
const geoCache = {};
function protoFor(type) {
  if (geoCache[type]) return geoCache[type];
  const B = new Builder(); B.begin(0, 0, 0, 0, false);
  MAKERS[type](B);
  const key = k => (PLANTS.has(type) && PLANT_KEY[k]) || MATKEY[k];
  return (geoCache[type] = B.toGeometries().map(([k, g]) => [MAT[key(k)] || MAT.propPlain, g]));
}

// ---------- nature on streamed ground: generated per tile, the same every time, thrown away with the tile ----------
// each region scatters its own plants and rocks; across a border both regions place things, each thinning out with
// its share, so the change is gradual. t holds the tile's ground fields from world.js
const PER_TILE = [270, 560, 330, 250, 320]; // tries per tile for desert, forest, swamp, badlands, snow
const fz = makeNoise(2718);
function pickDesert(r, g, m, x, z) {
  if (r < 0.14) return ['rock', 0.4, 1.6]; if (r < 0.2) return g < 0.6 ? ['rockFlat', 0.6, 1.8] : null;
  if (r < 0.22) return m > 0.2 || g > 0.35 || r < 0.203 ? ['boulder', 0.6, 2.2] : null;
  if (g > 0.6) return null;
  if (r < 0.3) return m < 0.7 ? ['bush', 0.6, 1.4] : null; if (r < 0.43) return m < 0.6 ? ['sage', 0.6, 1.5] : null; if (r < 0.7) return ['grass', 0.7, 1.4];
  if (r < 0.72) return ['deadTree', 0.7, 1.4]; if (r < 0.755) return g < 0.35 && m < 0.35 ? ['saguaro', 0.6, 1.3] : null;
  if (r < 0.77) return ['pear', 0.7, 1.4]; if (r < 0.785) return g < 0.4 ? ['yucca', 0.7, 1.4] : null; if (r < 0.79) return ['bones', 0.9, 1.2]; if (r < 0.793) return ['skull', 1, 1.3];
  if (r < 0.7945) return ['scrapheap', 0.9, 1.1]; if (r < 0.81) return g < 0.45 ? ['ocotillo', 0.7, 1.3] : null;
  return null;
}
function pickForest(r, g, m, x, z, h) {
  const open = fz(x * 0.004, z * 0.004) + 0.4 * fz(x * 0.017 + 9, z * 0.017); // clearings where this is low
  if (g > 0.9) return r < 0.2 ? ['mossRock', 0.6, 1.6] : null;
  if (open < -0.32) { if (r < 0.45) return ['grass', 0.8, 1.5]; if (r < 0.58) return ['flowers', 0.8, 1.2]; if (r < 0.61) return ['stump', 0.8, 1.2]; if (r < 0.63) return ['oak', 0.9, 1.3]; if (r < 0.634) return ['herbpatch', 1, 1]; return null; }
  if (r < 0.46) return h > 420 ? ['pineSnow', 0.8, 1.4] : ['pine', 0.75, 1.45];
  if (r < 0.54) return g < 0.3 && h < 160 ? ['oak', 0.8, 1.35] : ['pine', 0.8, 1.3];
  if (r < 0.58) return ['birch', 0.8, 1.2]; if (r < 0.7) return ['fern', 0.8, 1.5]; if (r < 0.77) return ['bush', 0.7, 1.3];
  if (r < 0.79) return ['stump', 0.7, 1.3]; if (r < 0.81) return ['log', 0.7, 1.1]; if (r < 0.83) return ['mushroom', 0.8, 1.6]; if (r < 0.86) return ['mossRock', 0.5, 1.4];
  if (r < 0.863) return ['woodpile', 1, 1]; if (r < 0.867) return ['herbpatch', 1, 1];
  return null;
}
function pickSwamp(r, g, m, x, z, h, depth) {
  if (depth > 1.4) return r < 0.06 ? ['snag', 0.7, 1.2] : null;
  if (depth > 0.05) { if (r < 0.22) return ['cypress', 0.7, 1.3]; if (r < 0.5) return ['reeds', 0.8, 1.4]; if (r < 0.7) return ['lily', 0.8, 1.4]; if (r < 0.76) return ['snag', 0.7, 1.3]; return null; }
  if (r < 0.14) return ['cypress', 0.7, 1.3]; if (r < 0.28) return ['snag', 0.7, 1.4]; if (r < 0.46) return ['reeds', 0.8, 1.4];
  if (r < 0.6) return ['bush', 0.7, 1.4]; if (r < 0.7) return ['fern', 0.8, 1.4]; if (r < 0.75) return ['mushroom', 0.8, 1.6]; if (r < 0.78) return ['log', 0.7, 1.1];
  if (r < 0.786) return ['herbpatch', 1, 1]; if (r < 0.789) return ['scrapheap', 0.9, 1.1];
  return null;
}
function pickBadlands(r, g, m, x, z) {
  if (r < 0.16) return ['rock', 0.5, 1.8]; if (r < 0.22) return ['redBoulder', 0.5, 1.6]; if (r < 0.245) return g < 0.25 ? ['hoodoo', 0.7, 1.6] : ['redBoulder', 0.6, 1.4];
  if (r < 0.255) return g > 0.25 ? ['orevein', 0.9, 1.2] : null;
  if (g > 0.6) return null;
  if (r < 0.3) return ['bush', 0.5, 1.1]; if (r < 0.38) return ['sage', 0.5, 1.2]; if (r < 0.52) return ['grass', 0.6, 1.2]; if (r < 0.525) return ['ocotillo', 0.6, 1.2]; if (r < 0.54) return ['deadTree', 0.6, 1.1]; if (r < 0.56) return ['pear', 0.6, 1.1];
  if (r < 0.565) return ['bones', 0.9, 1.2]; if (r < 0.568) return ['skull', 1, 1.2]; if (r < 0.571) return ['scrapheap', 0.9, 1.1];
  return null;
}
function pickSnow(r, g, m, x, z, h) {
  const tl = h > 540 ? 0.12 : 1; // above the tree line only a few stunted pines
  if (r < 0.38 * tl) return ['pineSnow', 0.7, 1.45]; if (r < 0.38) return null;
  if (r < 0.48) return ['snowRock', 0.5, 1.6]; if (r < 0.51) return ['snowBoulder', 0.6, 1.8];
  if (g > 0.7) return null;
  if (r < 0.53) return ['stump', 0.7, 1.2]; if (r < 0.55) return ['log', 0.7, 1.1]; if (r < 0.57) return ['deadTree', 0.7, 1.2]; if (r < 0.585) return ['iceShard', 0.6, 1.2];
  if (r < 0.588) return ['snowcache', 1, 1]; if (r < 0.591) return ['woodpile', 1, 1]; if (r < 0.594) return g > 0.2 ? ['orevein', 0.9, 1.2] : null;
  return null;
}
const PICK = [pickDesert, pickForest, pickSwamp, pickBadlands, pickSnow];
const ON_WATER = new Set(['lily']), IN_WATER = new Set(['cypress', 'reeds', 'snag', 'lily']);

// builds the tile's instanced props and blockers; returns what has to be removed when the tile goes
export function buildTileProps(t, scene) {
  const TV = 97, CL = 256 / 96, rnd = mulberry32((t.i * 73856093) ^ (t.j * 19349663) ^ 0x5bd1e995);
  const list = [], mean = [0, 0, 0, 0, 0];
  for (let q = 0; q < TV * TV; q += 37) for (let b = 0; b < 5; b++) mean[b] += t.BW[q * 5 + b];
  const nS = Math.ceil(TV * TV / 37);
  for (let b = 0; b < 5; b++) {
    const tries = Math.round(PER_TILE[b] * mean[b] / nS / 255);
    for (let n = 0; n < tries; n++) {
      const u = rnd() * 96, v = rnd() * 96, i = Math.round(u), j = Math.round(v), o = j * TV + i;
      if (rnd() * 255 > t.BW[o * 5 + b]) continue; // thins out towards the edge of the region
      if (t.RD[o] < 9 || t.PW[o] > 0.3 || t.RW[o] > 0.2) continue;
      const ny = t.NRM[o * 3 + 1], g = Math.sqrt(Math.max(0, 1 / (ny * ny) - 1)), m = t.MT[o] / 255;
      const x = t.x0 + u * CL, z = t.z0 + v * CL, h = t.H[o], depth = t.WL[o] - h;
      const pk = PICK[b](rnd(), g, m, x, z, h, depth);
      if (!pk) continue;
      const [type, s0, s1] = pk;
      if (depth > 0.05 && !IN_WATER.has(type)) continue;
      if (t.ICE[o] && depth > 0) continue;
      const y = ON_WATER.has(type) ? t.WL[o] : heightAtTile(t, x, z);
      list.push({ type, x, y, z, ry: rnd() * PI * 2, s: s0 + rnd() * (s1 - s0), tilt: 0 });
    }
  }
  finds(t, list, mean);
  const grp = new THREE.Group(), circles = [], col = new THREE.Color(), groups = new Map();
  for (const p of list) {
    if (!groups.has(p.type)) groups.set(p.type, []);
    groups.get(p.type).push(p);
    const info = INFO[p.type];
    if (info && info.col) circles.push({ x: p.x, z: p.z, r: info.col * p.s, top: p.y + (TALL.has(p.type) ? 12 : 2) * p.s });
    if (LOOTABLE[p.type]) registerLoot(LOOTABLE[p.type], p.x, p.y, p.z, p.ry, { s: 1 });
  }
  const meshes = [];
  for (const [type, L] of groups) {
    const info = INFO[type] || { dist: 500 };
    for (const [mat, geo] of protoFor(type)) {
      const im = new THREE.InstancedMesh(geo, mat, L.length);
      L.forEach((p, k) => {
        M.compose(V.set(p.x - t.x0, p.y, p.z - t.z0), Q.setFromEuler(E.set(p.tilt, p.ry, 0)), S.set(p.s, p.s, p.s));
        im.setMatrixAt(k, M);
        const vv = 0.85 + rnd() * 0.3; im.setColorAt(k, col.setRGB(vv, vv * (0.97 + rnd() * 0.05), vv * (0.94 + rnd() * 0.08)));
      });
      im.castShadow = !!info.shadow; im.receiveShadow = true; im.computeBoundingSphere();
      im.userData.dist = info.dist; im.userData.small = SMALL.has(type);
      grp.add(im); meshes.push(im);
    }
  }
  grp.position.set(t.x0, 0, t.z0);
  scene.add(grp);
  TILE_PROPS.add(grp);
  grp.userData.cx = t.x0 + 128; grp.userData.cz = t.z0 + 128;
  return { group: grp, circles };
}
// ---------- finds: small scenes scattered across the whole territory, different on every patch of ground ----------
// a camp someone left in a hurry, a wagon that never arrived, a fence round nothing any more, a telegraph line the
// railroad replaced, a shack fallen in, a grave by the trail, a cache under rocks, a prospect hole in a hillside, and
// the leavings of the section gangs along the line. Each tile rolls its own, from its own seed, so a place is always the
// same when you come back to it but no two are alike
const FIND_RATE = [0.2, 0.16, 0.1, 0.22, 0.16]; // per tile, by region
function finds(t, list, mean) {
  const TV = 97, CL = 256 / 96, rnd = mulberry32((t.i * 2654435761) ^ (t.j * 40503) ^ 0x2c1b3c6d);
  let bi = 0; for (let b = 1; b < 5; b++) if (mean[b] > mean[bi]) bi = b;
  const at = (u, v) => { const i = Math.min(96, Math.max(0, Math.round(u))), j = Math.min(96, Math.max(0, Math.round(v))); return j * TV + i; };
  const slopeAt = o => { const ny = t.NRM[o * 3 + 1]; return Math.sqrt(Math.max(0, 1 / (ny * ny) - 1)); };
  const dry = o => t.WL[o] < t.H[o] - 0.2;
  // put down one prop at local (u, v) cells, offset in metres (dx, dz) turned by ry
  const put = (type, u, v, ry, dx, dz, yaw, s = 1, tilt = 0, sink = 0) => {
    const c = Math.cos(ry), sn = Math.sin(ry), lx = u * CL + c * dx + sn * dz, lz = v * CL - sn * dx + c * dz;
    if (lx < 1 || lz < 1 || lx > 255 || lz > 255) return;
    const o = at(lx / CL, lz / CL); if (!dry(o) || t.PW[o] > 0.3) return;
    const x = t.x0 + lx, z = t.z0 + lz;
    list.push({ type, x, y: heightAtTile(t, x, z) - sink, z, ry: yaw, s, tilt });
  };
  const snow = bi === 4, forest = bi === 1 || bi === 2, tree = snow ? 'pineSnow' : forest ? 'pine' : 'deadTree', rockT = snow ? 'snowRock' : bi === 3 ? 'redBoulder' : forest ? 'mossRock' : 'rock';

  // the main find for this tile
  if (rnd() < FIND_RATE[bi] * 1.0) {
    for (let tries = 0; tries < 6; tries++) {
      const u = 10 + rnd() * 76, v = 10 + rnd() * 76, o = at(u, v), g = slopeAt(o), m = t.MT[o] / 255;
      if (!dry(o) || t.RD[o] < 40 || t.PW[o] > 0.05 || t.RW[o] > 0.05) continue;
      const ry = rnd() * PI * 2, k = rnd();
      // a hillside in rough country: a prospect hole, facing down the slope
      if (g > 0.45 && g < 1.4 && (m > 0.2 || bi === 3)) {
        const yaw = Math.atan2(t.NRM[o * 3], t.NRM[o * 3 + 2]);
        put('portal', u, v, 0, 0, 0, yaw, 1, 0, 0.6);
        put('minecart', u, v, yaw, 0.3, 4, yaw + 0.3); put('pickaxe', u, v, yaw, -1.6, 3, rnd() * 6); put('lantern', u, v, yaw, 1.4, 1.2, 0);
        if (rnd() < 0.6) put('crate', u, v, yaw, -2.2, 4.5, rnd() * 6);
        if (rnd() < 0.5) put('ruin', u, v, yaw, 9 + rnd() * 4, 8, yaw + 1.2 + rnd());
        for (let i = 0; i < 4; i++) put(rockT, u, v, yaw, (rnd() - 0.5) * 10, 3 + rnd() * 6, rnd() * 6, 0.4 + rnd() * 0.5);
        break;
      }
      if (g > 0.3) continue;
      if (k < 0.24) { // a camp: cold fire, bedrolls or a tent, a seat or two, what they left
        put('campfire', u, v, ry, 0, 0, rnd() * 6);
        if (rnd() < 0.7) put('tent', u, v, ry, 0, 5, ry + PI);
        if (rnd() < 0.4) put('tent', u, v, ry, 4.5, 3, ry + PI * 0.75);
        put(rnd() < 0.5 ? 'log' : 'stump', u, v, ry, -2.4, 0.4, ry + PI / 2, 0.55);
        put('stump', u, v, ry, 1.8, -1.8, 0, 0.7);
        for (const ty of ['crate', 'sack', 'woodpile', 'lantern', 'bones'].filter(() => rnd() < 0.55)) put(ty, u, v, ry, (rnd() - 0.5) * 7, -2 - rnd() * 3, rnd() * 6);
        if (snow) put('snowcache', u, v, ry, -4, -3, rnd() * 6);
      } else if (k < 0.42) { // a wagon that never arrived
        put('wagon', u, v, ry, 0, 0, ry, 1, (rnd() - 0.5) * 0.3, 0.15);
        put('wheel', u, v, ry, 2.5, -1.8, rnd() * 6, 1, 1.5);
        for (const ty of ['crate', 'crate', 'barrel', 'sack', 'wheel', 'bones', 'skull'].filter(() => rnd() < 0.55)) put(ty, u, v, ry, (rnd() - 0.5) * 9, (rnd() - 0.5) * 9, rnd() * 6);
        if (rnd() < 0.45) for (let i = 0; i < 1 + Math.floor(rnd() * 3); i++) put('cross', u, v, ry, -6 - i * 1.8, 4, ry, 1, (rnd() - 0.5) * 0.3);
        if (!snow && rnd() < 0.5) put('drift', u, v, ry, 1.2, 1.6, ry, 0.8);
      } else if (k < 0.58) { // a fence line round a field nobody works any more
        const n = 6 + Math.floor(rnd() * 12), bend = (rnd() - 0.5) * 0.1;
        let a = ry, px = 0, pz = 0;
        for (let i = 0; i < n; i++) {
          if (rnd() > 0.15) put(rnd() < 0.35 ? 'fenceBroken' : 'fence', u, v, 0, px, pz, a, 1, rnd() < 0.08 ? 1.2 : 0);
          px += Math.cos(a) * 2.7; pz -= Math.sin(a) * 2.7; a += bend;
          if (i === Math.floor(n / 2) && rnd() < 0.5) a += PI / 2; // round a corner
        }
        if (rnd() < 0.5) put('signpost', u, v, ry, -2, 1.5, ry);
      } else if (k < 0.7 && !forest) { // a telegraph line the railroad made redundant: poles leaning, some down
        const n = 3 + Math.floor(rnd() * 4);
        for (let i = 0; i < n; i++) { const down = rnd() < 0.3; put('pole', u, v, ry, i * 38, (rnd() - 0.5) * 2, ry + (rnd() - 0.5) * 0.2, 1, down ? 1.45 + rnd() * 0.1 : (rnd() - 0.5) * 0.25); }
      } else if (k < 0.84) { // a shack fallen in, with the homestead's leavings around it
        put('ruin', u, v, ry, 0, 0, ry);
        for (const ty of ['barrel', 'wheel', 'crate', 'fenceBroken', 'fenceBroken', 'trough'].filter(() => rnd() < 0.5)) put(ty, u, v, ry, (rnd() - 0.5) * 14, 4 + rnd() * 6, rnd() * 6);
        put(tree, u, v, ry, -7, -5, rnd() * 6, 0.9 + rnd() * 0.4);
        if (rnd() < 0.4) put('cross', u, v, ry, 6, -6, ry, 1, 0.15);
      } else if (k < 0.92) { // a lone grave by the trail, or two
        const n = 1 + Math.floor(rnd() * 3);
        for (let i = 0; i < n; i++) put(rnd() < 0.8 ? 'cross' : 'tombstone', u, v, ry, i * 1.6, 0, ry, 1, (rnd() - 0.5) * 0.35);
        put(rockT, u, v, ry, -2, 1.6, rnd() * 6, 0.4);
        if (rnd() < 0.5) put('skull', u, v, ry, 2, 1.4, rnd() * 6);
      } else { // a cache tucked under rocks: worth a look
        for (let i = 0; i < 3; i++) { const a = i * 2.1 + rnd(); put(rockT, u, v, ry, Math.cos(a) * 1.8, Math.sin(a) * 1.8, rnd() * 6, 0.7 + rnd() * 0.4); }
        put(rnd() < 0.5 ? 'crate' : 'sack', u, v, ry, 0, 0, rnd() * 6, 0.9);
        if (rnd() < 0.5) put('skull', u, v, ry, 0.8, 0.6, rnd() * 6);
      }
      break;
    }
  }
  // the railroad's leavings: discarded sleepers, a stack of old rail, a section gang's tools, a fallen whistle post
  for (let n = 0; n < 4; n++) {
    const u = 4 + rnd() * 88, v = 4 + rnd() * 88, o = at(u, v);
    if (t.RD[o] < 8 || t.RD[o] > 26 || t.PW[o] > 0.05 || slopeAt(o) > 0.35 || rnd() > 0.35) continue;
    const ry = rnd() * PI * 2, k = rnd();
    if (k < 0.4) { put('sleepers', u, v, ry, 0, 0, ry); if (rnd() < 0.5) put('sleepers', u, v, ry, 0, 0, ry + 0.06, 1, 0, -0.3); }
    else if (k < 0.6) put('railStack', u, v, ry, 0, 0, ry);
    else if (k < 0.75) { put('barrel', u, v, ry, 0, 0, 0); put('shovel', u, v, ry, 1.2, 0.4, rnd() * 6); }
    else if (k < 0.9) put('post', u, v, ry, 0, 0, ry, 1, 1.3);
    else put('wheel', u, v, ry, 0, 0, rnd() * 6, 0.8, 1.5);
  }
  // roadsides: posts, the odd sign, stones kicked to the verge, a lost wheel
  for (let n = 0; n < 8; n++) {
    const u = 2 + rnd() * 92, v = 2 + rnd() * 92, o = at(u, v), rw = t.RW[o];
    if (rw < 0.02 || rw > 0.25 || t.PW[o] > 0.1 || rnd() > 0.5) continue;
    const k = rnd(), ry = rnd() * PI * 2;
    put(k < 0.35 ? rockT : k < 0.55 ? 'post' : k < 0.7 ? (snow ? 'stump' : 'bush') : k < 0.8 ? 'fenceBroken' : k < 0.88 ? 'signpost' : k < 0.95 ? 'wheel' : 'bones', u, v, 0, 0, 0, ry, 0.8 + rnd() * 0.4, k > 0.88 && k < 0.95 ? 1.5 : 0);
  }
}
export function dropTileProps(tp, scene) {
  if (!tp) return;
  scene.remove(tp.group); TILE_PROPS.delete(tp.group);
  for (const m of tp.group.children) m.dispose && m.dispose();
}
const TILE_PROPS = new Set();
const TALL = new Set(['ocotillo', 'pine', 'pineSnow', 'oak', 'cypress', 'snag', 'birch', 'hoodoo', 'saguaro', 'deadTree']);
function heightAtTile(t, x, z) {
  const u0 = (x - t.x0) / (256 / 96), v0 = (z - t.z0) / (256 / 96), TV = 97;
  let i = Math.min(95, Math.max(0, Math.floor(u0))), j = Math.min(95, Math.max(0, Math.floor(v0)));
  const u = u0 - i, v = v0 - j, o = j * TV + i, H = t.H;
  if (u + v < 1) return H[o] + (H[o + 1] - H[o]) * u + (H[o + TV] - H[o]) * v;
  return H[o + TV + 1] + (H[o + TV] - H[o + TV + 1]) * (1 - u) + (H[o + 1] - H[o + TV + 1]) * (1 - v);
}

// ---------- finalise into culled instanced cells ----------
const CELLS = [];
const CELL = 400;
export function buildPropMeshes(scene) {
  const groups = new Map();
  for (const p of PROPS) {
    const ci = Math.floor(p.x / CELL), cj = Math.floor(p.z / CELL), key = p.type + '|' + ci + '|' + cj;
    if (!groups.has(key)) groups.set(key, { type: p.type, ci, cj, list: [] });
    groups.get(key).list.push(p);
    const info = INFO[p.type];
    if (info && info.col) CIRCLES.push({ x: p.x, z: p.z, r: info.col * p.s, top: p.y + 2 * p.s });
  }
  const col = new THREE.Color(), rnd = mulberry32(77);
  for (const g of groups.values()) {
    const info = INFO[g.type] || { dist: 500 };
    const parts = protoFor(g.type);
    const grp = new THREE.Group();
    for (const [mat, geo] of parts) {
      const im = new THREE.InstancedMesh(geo, mat, g.list.length);
      g.list.forEach((p, i) => {
        M.compose(V.set(p.x, p.y, p.z), Q.setFromEuler(E.set(p.tilt, p.ry, 0)), S.set(p.s, p.s, p.s));
        im.setMatrixAt(i, M);
        const v = 0.85 + rnd() * 0.3; im.setColorAt(i, col.setRGB(v, v * (0.97 + rnd() * 0.05), v * (0.94 + rnd() * 0.08)));
      });
      im.castShadow = !!info.shadow; im.receiveShadow = true;
      im.computeBoundingSphere();
      grp.add(im);
    }
    scene.add(grp);
    CELLS.push({ grp, x: (g.ci + 0.5) * CELL, z: (g.cj + 0.5) * CELL, dist: info.dist, small: SMALL.has(g.type) });
  }
  PROPS.length = 0;
}
// small clutter follows the environment detail setting; everything else follows view distance
const SMALL = new Set(['grass', 'bush', 'pear', 'sage', 'yucca', 'rockFlat', 'bones', 'skull', 'sack', 'wheel', 'shovel', 'pickaxe', 'rock', 'milepost', 'fern', 'mushroom', 'flowers', 'reeds', 'lily', 'herbpatch', 'mossRock', 'snowRock', 'stump']);
export function cullProps(cam, k = 1, detail = 1) {
  const R = CELL * 0.71;
  for (const c of CELLS) { const d = Math.hypot(cam.x - c.x, cam.z - c.z) - R; c.grp.visible = d < c.dist * (c.small ? detail : k); }
  for (const g of TILE_PROPS) {
    const d = Math.hypot(cam.x - g.userData.cx, cam.z - g.userData.cz) - 181;
    for (const m of g.children) m.visible = d < m.userData.dist * (m.userData.small ? detail : k);
  }
}

// ---------- tumbleweeds ----------
export function makeTumbleweeds(scene, W, n = 14) {
  const B = new Builder(); B.begin(0, 0, 0, 0, false);
  const rnd = mulberry32(99);
  for (let i = 0; i < 70; i++) {
    const a = rnd() * 6.28, b = Math.acos(rnd() * 2 - 1), r = 0.25 + rnd() * 0.2;
    B.box('pp', Math.sin(b) * Math.cos(a) * r, Math.cos(b) * r, Math.sin(b) * Math.sin(a) * r, 0.02, 0.6, 0.02, { rx: rnd() * 3, ry: rnd() * 3, rz: rnd() * 3, c: 0xb09a70 });
  }
  const [[, geo]] = B.toGeometries();
  const items = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, MAT.propPlain); m.castShadow = true; scene.add(m);
    items.push({ m, x: 0, z: 0, life: 0, sp: 3 + Math.random() * 4, bounce: Math.random() * 6 });
  }
  const update = function (dt, cam, wind) {
    items.forEach((t, i) => { t.m.visible = i < update.active; });
    for (const t of items.slice(0, update.active)) {
      t.life -= dt;
      if (t.life <= 0 || Math.hypot(t.x - cam.x, t.z - cam.z) > 180) {
        const a = Math.random() * 6.28, r = 40 + Math.random() * 110;
        t.x = cam.x + Math.cos(a) * r - wind.x * 60; t.z = cam.z + Math.sin(a) * r - wind.z * 60; t.life = 25 + Math.random() * 30;
      }
      t.x += wind.x * t.sp * dt; t.z += wind.z * t.sp * dt; t.bounce += dt * t.sp * 1.3;
      const y = W.heightAt(t.x, t.z) + 0.45 + Math.abs(Math.sin(t.bounce)) * 0.5;
      t.m.position.set(t.x, y, t.z);
      t.m.rotation.x += wind.z * t.sp * dt * 2.2; t.m.rotation.z -= wind.x * t.sp * dt * 2.2;
    }
  };
  update.active = items.length; // lowered by the particle quality setting
  return update;
}
