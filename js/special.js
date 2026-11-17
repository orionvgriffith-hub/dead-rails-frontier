// The special places: a bank with a vault, a cathedral with a crypt, outlaw camps, barns, an underground laboratory, an
// oil refinery, a catacomb dungeon and the Hartwell Institute. Each has its own layout, its own dangers (registered as
// encounters for story.js), its puzzles (doors, dials, levers, breakers) and the notes that tell the story.
import * as THREE from 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/three.module.js';
import { Builder, CIRCLES } from './builder.js';
import { building } from './buildings.js';
import { sign, Y0, chest, safe, locker, stove, pew, table, chair, shelf, counter, cabinet, bed, stairs, bars, barsZ, toWorld, prop } from './parts.js';
import { addProp } from './props.js';
import { heightAt } from './world.js';
import { registerLoot, registerHeat, registerInteract, registerUnderground, registerHazard, registerShootable, registerEncounter, registerStable, WORLD_STATE, saveWorldState, HOOKS } from './game/registry.js';
import { addHole } from './terrain.js';
import { itemModel } from './game/items.js';
import { LORE } from './lore.js';

const PI = Math.PI;
const T4 = (x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));
const glow = (c, k = 1) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.4 });
// shared materials that change while you play (the laboratory lights come on when the power does)
export const LAB_BULB = new THREE.MeshBasicMaterial({ color: 0x5a1410 });
const CANDLE = glow(0xffc070, 1.6), STAINED = [glow(0x8a2a30, 0.5), glow(0x2a4a8a, 0.5), glow(0xb8862c, 0.5), glow(0x3a6a3a, 0.5)];
const ICHOR = new THREE.MeshStandardMaterial({ color: 0x0c0a0e, roughness: 0.05, metalness: 0.4 }), COIL = glow(0x6ad8ff, 1.2);

let H = null, SCENE = null; // helpers from towns.js (P, ANIMATED, LAMP_SPOTS, lightFire, trees) and the scene

// ---------- building blocks ----------
// a set of rooms and corridors at floor height y: [x0, z0, x1, z1, h, opts]. Walls go round the union of them; where
// two rectangles touch, the shared edge is left open (a doorway), with a lintel if one side is taller. opts.open: no
// ceiling (a stairwell); opts.floor/wall/ceil: materials
function complex(B, rects, y, mats) {
  const E = 0.05, wallM = mats.wall || 'stone', T = 0.4;
  for (const r of rects) {
    const [x0, z0, x1, z1, h, o = {}] = r;
    B.box(o.floor || mats.floor || 'stone', (x0 + x1) / 2, y - 0.2, (z0 + z1) / 2, x1 - x0, 0.4, z1 - z0);
    if (!o.open) B.box(o.ceil || mats.ceil || wallM, (x0 + x1) / 2, y + h + 0.2, (z0 + z1) / 2, x1 - x0 + T, 0.4, z1 - z0 + T);
    // each edge: [fixed coordinate, along from, along to, is it along x, which side of the other rectangle touches]
    const edges = [[z0, x0, x1, true, 'z1'], [z1, x0, x1, true, 'z0'], [x0, z0, z1, false, 'x1'], [x1, z0, z1, false, 'x0']];
    for (const [f, a0, a1, alongX, other] of edges) {
      let segs = [[a0, a1]];
      for (const q of rects) {
        if (q === r) continue;
        const [qx0, qz0, qx1, qz1, qh] = q, qf = { x0: qx0, z0: qz0, x1: qx1, z1: qz1 }[other];
        if (Math.abs(qf - f) > E) continue;
        const b0 = Math.max(a0, alongX ? qx0 : qz0), b1 = Math.min(a1, alongX ? qx1 : qz1);
        if (b1 - b0 < 0.3) continue;
        const next = []; for (const [s0, s1] of segs) { if (b1 <= s0 || b0 >= s1) next.push([s0, s1]); else { if (b0 > s0) next.push([s0, b0]); if (b1 < s1) next.push([b1, s1]); } } segs = next;
        if (h > qh) { const c = (b0 + b1) / 2, L = b1 - b0; if (alongX) B.box(wallM, c, y + qh + (h - qh) / 2, f, L, h - qh, T); else B.box(wallM, f, y + qh + (h - qh) / 2, c, T, h - qh, L); }
      }
      const wh = o.open ? (o.wallH ?? h) : h;
      for (const [s0, s1] of segs) { const c = (s0 + s1) / 2, L = s1 - s0 + (alongX ? T : 0); if (L < 0.05) continue; if (alongX) B.box(o.wall || wallM, c, y + wh / 2, f, L, wh, T); else B.box(o.wall || wallM, f, y + wh / 2, c, T, wh, L); }
    }
  }
}
// a doorway-less wall run along x or z with window and door gaps: gaps [{c, w, h, sill}]
function wallRun(B, mat, alongX, f, a0, a1, y, h, gaps = [], T = 0.4) {
  let a = a0;
  const put = (c, L, yy, hh) => { if (L < 0.02 || hh < 0.02) return; if (alongX) B.box(mat, c, yy + hh / 2, f, L, hh, T); else B.box(mat, f, yy + hh / 2, c, T, hh, L); };
  for (const g of gaps.slice().sort((p, q) => p.c - q.c)) {
    const g0 = g.c - g.w / 2, g1 = g.c + g.w / 2, sill = g.sill || 0, top = sill + (g.h ?? 2.4);
    put((a + g0) / 2, g0 - a, y, h);
    put(g.c, g.w, y, sill); put(g.c, g.w, y + top, h - top);
    if (g.glass) { const gm = g.glass; if (alongX) B.box(gm, g.c, y + sill + (top - sill) / 2, f, g.w, top - sill, 0.05, { col: false }); else B.box(gm, f, y + sill + (top - sill) / 2, g.c, 0.05, top - sill, g.w, { col: false }); }
    a = g1;
  }
  put((a + a1) / 2, a1 - a, y, h);
}
// world position of a local point of the current Builder frame
const W3 = (B, x, y, z) => toWorld(B, x, y, z);
// a light bulb on a ceiling: always lit underground (under), lit at night above ground
function bulb(B, x, y, z, o = {}) {
  B.custom = B.custom || {}; const key = o.mat === 'lab' ? 'labBulb' : o.candle ? 'candle' : 'bulb';
  B.custom.labBulb = LAB_BULB; B.custom.candle = CANDLE; B.custom.bulb = B.custom.bulb || glow(0xffd8a0, 1.4);
  if (o.candle) { B.box('woodWhite', x, y + 0.08, z, 0.05, 0.16, 0.05, { col: false }); B.box(key, x, y + 0.2, z, 0.03, 0.06, 0.03, { col: false }); }
  else { B.box('iron', x, y + 0.25, z, 0.03, 0.5, 0.03, { col: false }); B.geom(key, new THREE.SphereGeometry(0.11, 8, 6), T4(x, y - 0.05, z)); }
  const p = W3(B, x, y - 0.1, z), spot = [p.x, p.y, p.z]; spot.under = !!o.under; spot.k = o.k ?? 1; spot.group = o.group; spot.fire = !!o.candle && !o.under;
  H.LAMP_SPOTS.push(spot); return spot;
}
// a note lying somewhere: picking it up reads it and counts it towards the records found
function note(B, x, y, z, key, ry = 0) {
  B.box('paper', x, y + 0.006, z, 0.22, 0.012, 0.3, { ry, col: false });
  const p = W3(B, x, y + 0.05, z), L = LORE[key];
  registerInteract({ id: 'lore:' + key, x: p.x, y: p.y, z: p.z, r: 0.35, label: () => `Read: ${L.title}`, act: () => HOOKS.readLore && HOOKS.readLore(key) });
}
// a notice pinned to a post or a wall (ry faces the reader)
function notice(B, x, y, z, ry, key) {
  B.box('paper', x, y, z, 0.42, 0.56, 0.02, { ry, col: false });
  const p = W3(B, x, y, z), L = LORE[key];
  registerInteract({ id: 'lore:' + key, x: p.x, y: p.y, z: p.z, r: 0.4, label: () => `Read: ${L.title}`, act: () => HOOKS.readLore && HOOKS.readLore(key) });
}
function lootAt(B, kind, x, y, z, ry, title) {
  const p = W3(B, x, y, z), hw = 0.5, s = registerLoot(kind, p.x, p.y, p.z, ry + B.ry, title ? { title } : {});
  B.addCollider(x - hw, y, z - hw * 0.6, x + hw, y + 0.6, z + hw * 0.6);
  return s;
}
// the spiral sign the dead scratch into walls: painted on a face
function spiral(B, x, y, z, ry, s = 1, mat = 'black') {
  for (let i = 0; i < 26; i++) {
    const a = i * 0.55, r = 0.04 + i * 0.018 * s, px = Math.cos(a) * r, py = Math.sin(a) * r;
    B.box(mat, x + Math.cos(ry) * px, y + py, z - Math.sin(ry) * px, 0.05 * s, 0.05 * s, 0.01, { ry, col: false });
  }
}
// a person, sitting or lying (the prisoner, the dead doctor): boxes only
function figure(B, x, y, z, ry, pose = 'sit', c = {}) {
  const skin = c.skin || 0xc8a080, coat = c.coat || 0x5a4a3a, legs = c.legs || 0x3a3428;
  B.begin(x, y, z, ry, false);
  if (pose === 'lie') { B.box('cloth', 0, 0.15, 0, 0.45, 0.25, 1.1, { c: coat }); B.box('cloth', 0, 0.12, 0.85, 0.36, 0.2, 0.7, { c: legs }); B.box('cloth', 0, 0.16, -0.75, 0.22, 0.24, 0.24, { c: skin }); return; }
  B.box('cloth', 0, 0.75, 0, 0.42, 0.6, 0.24, { c: coat }); B.box('cloth', 0, 1.2, 0.02, 0.22, 0.25, 0.22, { c: skin });
  for (const sx of [-1, 1]) { B.box('cloth', sx * 0.11, 0.42, 0.25, 0.15, 0.14, 0.5, { c: legs }); B.box('cloth', sx * 0.11, 0.2, 0.48, 0.13, 0.4, 0.13, { c: legs }); B.box('cloth', sx * 0.26, 0.7, 0.12, 0.1, 0.42, 0.1, { c: coat, rx: -0.5 }); }
  if (c.hat) B.box('cloth', 0, 1.36, 0.02, 0.34, 0.04, 0.34, { c: 0x4a3424 });
}
// doors, gates, slabs and vault doors: a separate body that moves when opened, and a collider that goes with it.
// how: 'up' (a portcullis rises), 'down' (sinks into the floor), 'slide' (sideways), 'swing' (on a hinge at -w/2)
function makeDoor(id, x, y, z, ry, w, h, d, mat, how, look) {
  const Bv = new Builder(); Bv.begin(how === 'swing' ? w / 2 : 0, 0, 0, 0, false);
  if (look) look(Bv, w, h, d); else Bv.box(mat, 0, h / 2, 0, w, h, d);
  const inner = Bv.build(), pivot = new THREE.Group(); pivot.position.set(x, y, z); pivot.rotation.y = ry; pivot.add(inner); SCENE.add(pivot);
  const Bc = new Builder(); Bc.begin(x, y, z, ry); Bc.addCollider(-w / 2, 0, -d / 2 - 0.05, w / 2, h, d / 2 + 0.05); const col = Bc.col;
  const D = { id, isOpen: false, t: 0, pivot, inner };
  const set = k => {
    if (how === 'up') inner.position.y = k * (h - 0.3); else if (how === 'down') inner.position.y = -k * (h + 0.1);
    else if (how === 'slide') inner.position.x = k * (w + 0.1); else if (how === 'swing') pivot.rotation.y = ry - k * 1.75;
    else if (how === 'vanish') { inner.position.y = -k * 0.35; inner.visible = k < 1; }
  };
  D.open = (instant) => {
    if (D.isOpen) return; D.isOpen = true; col.boxes.length = 0;
    if (!instant) { WORLD_STATE.open[id] = 1; saveWorldState(); }
    if (instant) { set(1); return; }
    H.ANIMATED.push((el, dt) => { if (D.t >= 1) return; D.t = Math.min(1, D.t + (dt || 0.016) / 2.4); set(D.t * D.t * (3 - 2 * D.t)); });
  };
  if (WORLD_STATE.open[id]) D.open(true);
  return D;
}
// a lever / breaker / valve worked once; on(): what happens. Stays worked (saved)
function lever(B, id, x, y, z, ry, label, on, o = {}) {
  B.box('iron', x, y, z, 0.3, 0.5, 0.12, { ry, col: false });
  const p = W3(B, x, y, z);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.06), new THREE.MeshStandardMaterial({ color: o.color || 0x8a2a20, metalness: 0.4, roughness: 0.5 }));
  const hub = new THREE.Group(); hub.position.copy(p); hub.rotation.y = ry + B.ry; arm.position.set(0, 0.2, 0.1); hub.add(arm); SCENE.add(hub);
  const done = () => !!WORLD_STATE.flags[id];
  const show = () => { hub.rotation.x = done() ? 1.9 : 0.4; };
  show();
  return registerInteract({ id, x: p.x, y: p.y, z: p.z, r: 0.4, label: () => done() ? null : label, act: () => { WORLD_STATE.flags[id] = 1; saveWorldState(); show(); HOOKS.sfx && HOOKS.sfx('reload'); on && on(); } });
}
// a dug-out place: rooms underground, the stairwell to them and the hole in the ground above it (world rectangles)
function underground(B, rects, stair, top, name) {
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (const r of rects) { const a = W3(B, r[0], 0, r[1]), b = W3(B, r[2], 0, r[3]); x0 = Math.min(x0, a.x, b.x); x1 = Math.max(x1, a.x, b.x); z0 = Math.min(z0, a.z, b.z); z1 = Math.max(z1, a.z, b.z); }
  const a = W3(B, stair[0], 0, stair[1]), b = W3(B, stair[2], 0, stair[3]);
  const hole = registerUnderground(a.x, a.z, b.x, b.z, top, name); hole.hole = true;
  addHole(a.x + 0.15, a.z + 0.15, b.x - 0.15, b.z - 0.15);
  return registerUnderground(x0 - 0.4, z0 - 0.4, x1 + 0.4, z1 + 0.4, top, name);
}
const wp = (B, x, y, z) => { const p = W3(B, x, y, z); return [p.x, p.y, p.z]; };

export function specialSites(helpers, scene) {
  H = helpers; SCENE = scene;
  return { bank, cathedral, outlawcamp, barn, teslalab, refinery, catacombs, institute };
}

// ---------- Fortune: a dead boomtown and the First Territorial Bank ----------
// lobby with the teller cage, offices with the three numbers of the vault combination, and the vault where Crowe waits
const BANK_CODE = [4, 7, 2];
function bank(B, s, rnd) {
  const y = 0.3;
  B.begin(s.x, s.h, s.z, 0);
  const R = [
    [-11, -14, 11, -3, 6.5, { floor: 'stone' }], [-2.5, -17, 2.5, -14, 4, { open: true, wallH: 0, floor: 'stone' }],
    [-11, -3, 11, 1, 4.2], [-8.4, 1, -6.8, 1.4, 2.5], [-11, 1.4, -4.6, 12, 3.6, { floor: 'floor' }],
    [-1.5, 1, 1.5, 1.4, 2.9, { wall: 'metal' }], [-3.8, 1.4, 3.8, 12, 3.4, { floor: 'metal', wall: 'metal', ceil: 'metal' }],
    [6.8, 1, 8.4, 1.4, 2.5], [4.6, 1.4, 11, 12, 3.6, { floor: 'floor' }],
  ];
  complex(B, R, y, { wall: 'brick', floor: 'floor', ceil: 'woodDark' });
  // the façade: columns, a pediment, tall dark windows, the name in gold
  for (const x of [-2, 2]) B.geom('stone', new THREE.CylinderGeometry(0.32, 0.36, 4, 14), T4(x, y + 2, -16.6));
  B.box('stone', 0, y + 4.2, -15.6, 6, 0.4, 3.2, { col: false });
  B.box('brick', 0, y + 7.6, -14.1, 22.4, 2.2, 0.4);
  B.box('stone', 0, y + 8.8, -14.2, 23, 0.3, 0.7, { col: false });
  sign(B, 'FIRST TERRITORIAL BANK', 0, y + 7.6, -14.35, 9, 1.0, PI, { bg: '#2a1c12', fg: '#e0b040' });
  for (const x of [-8.5, -5.5, 5.5, 8.5]) { B.box('glass', x, y + 3.3, -14.25, 1.5, 3.2, 0.06, { col: false }); B.box('stone', x, y + 1.6, -14.4, 1.9, 0.18, 0.3, { col: false }); }
  for (let i = 0; i < 4; i++) B.box('stone', 0, y - 0.2 - i * 0.12, -17.4 - i * 0.35, 6, 0.12, 0.7);
  // lobby: marble counter with brass bars, writing desks, a chandelier
  B.box('stone', -1, y + 0.55, -3.4, 20, 1.1, 0.7);
  bars(B, -11, 9, -3.4, y + 1.1, 1.3, null);
  for (const x of [-7, -3, 1, 5]) { B.box('woodDark', x, y + 1.1, -3.6, 1.2, 0.02, 0.4, { col: false }); }
  for (const [x, z] of [[-7, -10], [7, -10], [-7, -6.5], [7, -6.5]]) { table(B, x, y, z, 1.4, 0.7); chair(B, x, y, z - 0.8, PI, rnd() < 0.4); }
  for (const [x, z] of [[-6, -8], [6, -8], [0, -10]]) bulb(B, x, y + 6.2, z, { k: 0.8 });
  note(B, -3, y + 1.12, -3.6, 'tellerNote1', 0.2);
  note(B, 7, y + 0.78, -10, 'photo1', -0.3);
  prop(B, 'bones', 3, y, -8, 1); prop(B, 'skull', 3.4, y, -7.6, 0);
  // west office (loans) and the manager's office
  B.begin(s.x, s.h, s.z, 0);
  table(B, -8, y, 8, 1.6, 0.8); chair(B, -8, y, 9, 0); cabinet(B, -10.4, y, 4, PI / 2); safe(B, -10.3, y, 10.6, PI / 2); shelf(B, -5.2, y, 6, 2, 2.2, -PI / 2, rnd);
  note(B, -8, y + 0.78, 8, 'tellerNote2', 0.1);
  table(B, 8, y, 8, 1.8, 0.9); chair(B, 8, y, 9, 0); safe(B, 10.3, y, 10.6, -PI / 2); cabinet(B, 10.4, y, 4, -PI / 2); bulb(B, 8, y + 3.5, 6.5, { k: 0.6 });
  note(B, 7.6, y + 0.78, 8.1, 'tellerNote3', -0.2); note(B, 8.6, y + 0.78, 7.8, 'crowe', 0.3);
  // the vault: deposit boxes floor to ceiling, stacked gold, Crowe's counting table
  for (const x of [-3.5, 3.5]) for (let z = 2.4; z < 11.5; z += 0.62) for (let yy = 0.2; yy < 3.2; yy += 0.5) B.box('iron', x, y + yy + 0.22, z, 0.12, 0.44, 0.56, { col: false });
  table(B, 0, y, 8, 2, 1); note(B, 0.4, y + 0.78, 8, 'vault', 0.4);
  for (let i = 0; i < 9; i++) B.box('metal', -1.6 + (i % 3) * 0.24, y + 0.06 + Math.floor(i / 3) * 0.1, 10.6, 0.2, 0.08, 0.5, { col: false, c: 0xe0b040 });
  for (const [x, z, r] of [[-2.6, 4, PI / 2], [2.6, 4, -PI / 2], [-2.6, 7, PI / 2], [2.6, 10.8, -PI / 2]]) lootAt(B, 'vault', x, y, z, r);
  bulb(B, 0, y + 3.3, 6, { k: 0.7 });
  // the round vault door on its hinge, and the combination dials on the wall beside it
  const [dx, dy, dz] = wp(B, 0, y, 1.2);
  const door = makeDoor('bank:vault', dx, dy, dz, 0, 2.9, 2.9, 0.5, 'metal', 'swing', (Bv, w, h, d) => {
    Bv.geom('metal', new THREE.CylinderGeometry(1.42, 1.42, d, 28), T4(0, h / 2, 0, PI / 2));
    for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; Bv.geom('iron', new THREE.CylinderGeometry(0.08, 0.08, 0.2, 8), T4(Math.cos(a) * 1.15, h / 2 + Math.sin(a) * 1.15, -d / 2 - 0.08, PI / 2)); }
    Bv.geom('iron', new THREE.TorusGeometry(0.5, 0.06, 6, 18), T4(0, h / 2, -d / 2 - 0.12));
  });
  const st = WORLD_STATE.dial.bank = WORLD_STATE.dial.bank || [0, 0, 0];
  const dials = [];
  for (let i = 0; i < 3; i++) {
    const lx = 2.2 + i * 0.42, [x, yy, z] = wp(B, lx, y + 1.5, 0.75);
    B.box('iron', lx, y + 1.5, 0.78, 0.36, 0.36, 0.06, { col: false });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.06, 20), new THREE.MeshStandardMaterial({ color: 0xc9a04a, metalness: 0.8, roughness: 0.3 }));
    m.rotation.x = PI / 2; m.position.set(x, yy, z - 0.02); SCENE.add(m);
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.02), new THREE.MeshBasicMaterial({ color: 0x1a1008 })); tick.position.y = 0.06; tick.position.z = -0.04; m.add(tick);
    const show = () => { m.rotation.y = -st[i] / 10 * PI * 2; };
    show(); dials.push(show);
    registerInteract({ id: 'bank:dial' + i, x, y: yy, z, r: 0.22, label: () => door.isOpen ? null : `Turn dial ${['one', 'two', 'three'][i]} (shows ${st[i]})`, act: () => {
      st[i] = (st[i] + 1) % 10; show(); saveWorldState(); HOOKS.sfx && HOOKS.sfx('dry');
      if (st.every((v, k) => v === BANK_CODE[k])) { door.open(); HOOKS.notify && HOOKS.notify('The bolts slide back and the vault door swings open. Something inside stops counting.', 'epic'); HOOKS.sfx && HOOKS.sfx('boom', 0.25); }
    } });
  }
  sign(B, 'VAULT', 0, y + 3.1, 0.82, 1.6, 0.4, PI, { bg: '#1a1410', fg: '#c9a04a' });
  // the dead town around it: a street of ruins in front of the bank
  const R2 = [[-26, -30, 0, 'saloon'], [-12, -36, 0, 'store'], [14, -36, 0, 'hotel'], [28, -30, 0, 'house'], [-28, 4, PI / 2, 'house'], [28, 6, -PI / 2, 'shed']];
  for (const [a, b, ry, type] of R2) { const [x, , z] = wp(B, a, 0, b); H.siteBuilding(B, x, s.h, z, ry, { type, damage: 2, paint: rnd() < 0.5 ? 'woodGrey' : 'woodOchre', sign: type === 'saloon' ? 'THE GILDED LILY' : type === 'store' ? "CROWE'S TONIC" : type === 'hotel' ? 'FORTUNE HOTEL' : undefined }, rnd); }
  B.begin(s.x, s.h, s.z, 0);
  B.box('woodDark', -6, 1.3, -26, 0.14, 2.6, 0.14); notice(B, -6, 1.9, -25.92, 0, 'fortuneNews');
  for (const [t, a, b] of [['wagon', -4, -22], ['barrel', 6, -20], ['barrel', 6.6, -20.4], ['crate', -9, -20], ['cross', 16, -22], ['cross', 17, -22.5], ['signpost', -20, -24]]) { const p = W3(B, a, 0, b); H.P(t, p.x, p.z, rnd() * 6); }
  // the clerks still at their posts, and the president in his vault
  registerEncounter({ key: 'bank:clerks', x: s.x, y: s.h + y, z: s.z - 6, r: 16, title: 'The clerks are still at their posts', groups: [{ type: 'clerk', at: [[-6, -9], [6, -7], [-2, -1], [4, -1], [0, -11]].map(([a, b]) => wp(B, a, y, b)) }] });
  registerEncounter({ key: 'bank:crowe', x: s.x, y: s.h + y, z: s.z + 6, r: 9, when: () => door.isOpen,
    boss: { type: 'banker', at: wp(B, 0, y, 8), name: 'Silas Crowe', title: 'President of the First Territorial Bank', home: { x: s.x, y: s.h + y, z: s.z - 1, r: 22 }, reward: [['hartwellKey', 1], ['goldBar', 2], ['bankNotes', 6]], cash: 250 } });
}

// ---------- Our Lady of Sorrows: a stone cathedral, a bell tower, a graveyard, and a crypt under the floor ----------
function cathedral(B, s, rnd, scene) {
  const y = 0.4, W = 7, L = 15, WH = 9;
  B.begin(s.x, s.h, s.z, 0);
  B.custom = B.custom || {}; STAINED.forEach((m, i) => { B.custom['st' + i] = m; });
  // floor, with the stairwell to the crypt left open beside the altar (a stone slab covers it)
  for (const [x0, z0, x1, z1] of [[-W, -L, W, 9.8], [-W, 9.8, 3, L], [5.4, 9.8, W, L]]) B.box('stone', (x0 + x1) / 2, y - 0.2, (z0 + z1) / 2, x1 - x0, 0.4, z1 - z0);
  const wins = [-10, -4, 2, 8].map((c, i) => ({ c, w: 1.6, h: 4.2, sill: 2.6, glass: 'st' + i }));
  wallRun(B, 'stone', false, -W, -L, L, y, WH, wins); wallRun(B, 'stone', false, W, -L, L, y, WH, wins.map((g, i) => Object.assign({}, g, { glass: 'st' + ((i + 2) % 4) })));
  wallRun(B, 'stone', true, -L, -W - 0.2, W + 0.2, y, WH, [{ c: 0, w: 3.2, h: 4.4 }, { c: 0, w: 2.2, h: 2.2, sill: 5.6, glass: 'st1' }].slice(0, 1));
  B.box('st1', 0, y + 6.7, -L - 0.02, 2.2, 2.2, 0.05, { col: false });
  wallRun(B, 'stone', true, L, -W - 0.2, W + 0.2, y, WH, [{ c: 0, w: 1.4, h: 3.2, sill: 4.4, glass: 'st2' }]);
  B.box('woodDark', 0, y + WH + 0.15, 0, 2 * W + 0.4, 0.3, 2 * L + 0.4);
  // pitched roof and stepped gable ends
  const pitch = 0.6, half = W + 0.6, rise = half * Math.tan(pitch), slope = half / Math.cos(pitch);
  for (const sx of [-1, 1]) B.box('shingle', sx * half / 2, y + WH + 0.3 + rise / 2, 0, slope, 0.25, 2 * L + 1.2, { rz: -sx * pitch, col: false });
  for (const z of [-L, L]) for (let i = 0; i < 7; i++) { const k = (i + 0.5) / 7, w = 2 * W * (1 - k); B.box('stone', 0, y + WH + 0.3 + k * rise, z, w, rise / 7 + 0.02, 0.4, { col: false }); }
  B.geom('woodDark', new THREE.BoxGeometry(0.25, 1.6, 0.25), T4(0, y + WH + rise + 1.1, -L)); B.geom('woodDark', new THREE.BoxGeometry(1, 0.22, 0.25), T4(0, y + WH + rise + 1.4, -L));
  for (let i = 0; i < 4; i++) B.box('stone', 0, y - 0.25 - i * 0.12, -L - 0.5 - i * 0.4, 4.4, 0.12, 0.8);
  // inside: pews, the altar with its candlesticks, a pulpit, a great cross
  for (let z = -11; z <= 6; z += 1.7) for (const x of [-3.7, 3.7]) { if (rnd() < 0.12) continue; pew(B, x, y, z, 5); }
  B.box('stone', 0, y + 0.55, 13.2, 4, 1.1, 1.4); B.box('cloth', 0, y + 1.12, 13.2, 4.2, 0.04, 1.5, { col: false, c: 0xe8e0d0 });
  spiral(B, 0, y + 0.6, 12.48, 0, 1.4, 'black');
  for (const x of [-1.6, -0.8, 0.8]) bulb(B, x, y + 1.14, 13.3, { candle: true });
  B.box('woodDark', 0, y + 5, L - 0.25, 0.3, 4.2, 0.2, { col: false }); B.box('woodDark', 0, y + 6, L - 0.25, 2.2, 0.3, 0.2, { col: false });
  B.box('woodDark', -5, y + 0.7, 9, 1.2, 1.4, 1.2); B.box('woodDark', -5, y + 1.45, 9, 1.4, 0.08, 1.4, { col: false });
  note(B, -5, y + 1.5, 9, 'sisterAgnes', 0.3); note(B, 3.7, y + 0.5, -4.2, 'palemass', -0.2); note(B, -3.4, y + 0.5, 1.5, 'sermon', 0.4);
  for (const [x, z] of [[-3.5, -6], [3.5, -6], [0, 3], [-3.5, 8], [3.5, 8]]) bulb(B, x, y + WH - 0.1, z, { candle: false, k: 0.6 });
  // the bell tower beside the doors
  const tx = 9.6, tz = -12.4, TH = 19;
  for (const [x, z, w, d] of [[tx, tz - 2.4, 5, 0.5], [tx, tz + 2.4, 5, 0.5], [tx - 2.4, tz, 0.5, 5], [tx + 2.4, tz, 0.5, 5]]) B.box('stone', x, y + TH / 2 - 1.5, z, w, TH - 3, d);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box('stone', tx + sx * 2.3, y + TH - 1.5, tz + sz * 2.3, 0.6, 3, 0.6, { col: false });
  B.geom('shingle', new THREE.ConeGeometry(3.9, 5, 4), T4(tx, y + TH + 2.5, tz, 0, PI / 4));
  // the stairwell and the crypt of St. Agnes
  const Fc = y - 4.6, run = stairs(B, 3.1, 5.3, 16.2, Fc, 4.6, -1);
  complex(B, [[3, 16.2 - run - 0.05, 5.4, 16.2, 4.6, { open: true, wallH: 4.6 }], [-5, 16.2, 5.4, 24, 3.2]], Fc, { wall: 'stone', floor: 'stone', ceil: 'stone' });
  B.box('stone', 0, Fc + 0.5, 21.6, 1.2, 1, 2.4); B.box('stone', 0, Fc + 1.05, 21.6, 1.4, 0.12, 2.6, { col: false });
  for (const x of [-3.6, 3.8]) for (const z of [18, 22.6]) bulb(B, x, Fc + 0.02, z, { candle: true, under: true, k: 0.5 });
  notice(B, 0, Fc + 1.8, 23.78, PI, 'crypt');
  lootAt(B, 'tomb', -3.8, Fc, 19, PI / 2); lootAt(B, 'tomb', -3.8, Fc, 22, PI / 2);
  B.box('stone', 2.5, Fc + 0.5, 23.2, 0.7, 1, 0.7);
  const [rx, ry2, rz] = wp(B, 2.5, Fc + 1.0, 23.2);
  if (!WORLD_STATE.flags['church:relic']) {
    const m = itemModel('reliquary'); m.scale.setScalar(2); m.position.set(rx, ry2, rz); scene.add(m);
    registerInteract({ id: 'church:relic', x: rx, y: ry2 + 0.2, z: rz, r: 0.35, label: () => WORLD_STATE.flags['church:relic'] ? null : 'Take the Reliquary of St. Agnes', act: () => {
      WORLD_STATE.flags['church:relic'] = 1; saveWorldState(); scene.remove(m); HOOKS.give && HOOKS.give('reliquary', 1);
      HOOKS.notify && HOOKS.notify('You lift the reliquary. Somewhere above, the bell moves on its own.', 'epic');
    } });
  }
  const [sx2, sy2, sz2] = wp(B, 4.2, y - 0.4, 13);
  const slab = makeDoor('church:crypt', sx2, sy2, sz2, 0, 2.5, 0.4, 6.4, 'stone', 'vanish');
  const [cx, cy, cz] = wp(B, 1.7, y + 1.1, 13.3);
  registerInteract({ id: 'church:candle', x: cx, y: cy + 0.3, z: cz, r: 0.3, label: () => slab.isOpen ? null : 'Turn the brass candlestick', act: () => {
    slab.open(); HOOKS.sfx && HOOKS.sfx('stoke'); HOOKS.notify && HOOKS.notify('Stone grinds on stone. Beside the altar, the floor opens onto a stair.');
  } });
  bulb(B, 1.7, y + 1.14, 13.3, { candle: true });
  B.box('stone', 4.2, y - 0.2, 15.6, 2.8, 0.4, 1.25); // the stair passes under the back wall: cap it outside
  underground(B, [[3, 16.2 - run, 5.4, 16.2], [-5, 16.2, 5.4, 24]], [3, 16.2 - run, 5.4, 16.2], s.h, 'crypt');
  // the graveyard
  for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) { if (rnd() < 0.2) continue; const p = W3(B, -14 - c * 2.8 + (rnd() - 0.5), 0, -8 + r * 4.2 + (rnd() - 0.5)); H.P(rnd() < 0.5 ? 'tombstone' : 'cross', p.x, p.z, (rnd() - 0.5) * 0.4, 1, { tilt: (rnd() - 0.5) * 0.3 }); }
  for (let i = 0; i < 26; i++) { const p = W3(B, -11 - (i < 13 ? 0 : 18), 0, -11 + (i % 13) * 2.4); H.P(rnd() < 0.2 ? 'fenceBroken' : 'fence', p.x, p.z, PI / 2); }
  H.trees(s, rnd, 14, 40, 60);
  // after dark the pale congregation comes back to pray
  const nave = wp(B, 0, y, 0);
  registerEncounter({ key: 'church:pale', x: nave[0], y: nave[1], z: nave[2], r: 13, night: true, repeat: 900, title: 'The bell tolls three times. The Pale Congregation has come to pray',
    groups: [{ type: 'penitent', rise: true, at: [[-3.7, -9], [3.7, -7.6], [-3.7, -4], [3.7, -1], [-3.7, 3], [3.7, 5]].map(([a, b]) => wp(B, a, y, b)) }],
    onStart: () => { HOOKS.sfx && [0, 1.6, 3.2].forEach(t => setTimeout(() => HOOKS.sfx('bell'), t * 1000)); } });
}

// ---------- outlaw camps: a palisade, tents and lean-tos, a lookout, a stores shed, prison cages ----------
// the gang comes out shooting when you get close; Black Jack Mercer holds the hideout and the map to the catacombs
function outlawcamp(B, s, rnd, scene) {
  const big = !!s.boss, R = s.r - 10, ry = rnd() * PI * 2;
  B.begin(s.x, s.h, s.z, ry);
  // the palisade: sharpened logs in a ring, a gate facing the trail
  const n = Math.round(R * 2 * PI / 0.5);
  for (let i = 0; i < n; i++) {
    const a = i / n * PI * 2; if (Math.abs(((a + PI) % (PI * 2)) - PI) < 0.09) continue; // the gate at a = 0
    const x = Math.cos(a) * R, z = Math.sin(a) * R, h = 3.4 + rnd() * 0.6;
    B.geom('woodDark', new THREE.CylinderGeometry(0.22, 0.24, h, 7), T4(x, h / 2, z)); B.geom('woodDark', new THREE.ConeGeometry(0.22, 0.5, 7), T4(x, h + 0.25, z));
    B.addCollider(x - 0.25, 0, z - 0.25, x + 0.25, h, z + 0.25);
  }
  B.box('woodDark', R, 3.8, 0, 0.3, 0.3, 4.6, { col: false });
  sign(B, big ? 'KEEP OUT' : 'TRESPASSERS SHOT', R + 0.3, 3.2, 0, 2.4, 0.5, PI / 2, { bg: '#3a2416', fg: '#e8d8b8' });
  // a stores shed with the stash, a lean-to, a lookout
  B.begin(...wp(B, -R + 8, 0, -4), ry);
  wallRun(B, 'woodGrey', true, -3, -3, 3, 0, 2.8); wallRun(B, 'woodGrey', true, 3, -3, 3, 0, 2.8, [{ c: 0, w: 1.4, h: 2.2 }]);
  wallRun(B, 'woodGrey', false, -3, -3, 3, 0, 2.8); wallRun(B, 'woodGrey', false, 3, -3, 3, 0, 2.8);
  B.box('tin', 0, 3, 0, 6.8, 0.1, 6.8, { col: false });
  lootAt(B, 'stash', -1.8, 0, -1.8, 0); lootAt(B, 'stash', 1.8, 0, -1.8, 0, big ? "Black Jack's Strongbox" : undefined);
  shelf(B, -2.7, 0, 0.8, 2, 2, PI / 2, rnd);
  B.begin(s.x, s.h, s.z, ry);
  for (const [a, b] of [[-6, 9], [5, -10], [-9, -10], [8, 8], [0, -13]].slice(0, big ? 5 : 3)) { const p = W3(B, a, 0, b); H.P('tent', p.x, p.z, rnd() * 6); }
  for (let i = 0; i < 5; i++) B.box('woodDark', -2 + i * 1.1, 1.2 + i * 0.1, 13, 0.12, 2.4 + i * 0.2, 0.12, { col: false });
  B.box('cloth', 0.2, 2.4, 12, 5, 0.06, 2.6, { rx: 0.4, col: false, c: 0x8a7a60 });
  const fire = wp(B, 0, 0, 0); H.lightFire(scene, fire[0], heightAt(fire[0], fire[2]), fire[2], 1.2);
  for (const [a, b] of [[2.4, 1], [-2.4, 0.6], [0.4, -2.6]]) { const p = W3(B, a, 0, b); H.P('log', p.x, p.z, rnd() * 6, 0.9); }
  // prison cages; in the hideout a living deputy sits in one
  const cages = big ? [[-4, -R + 6], [2, -R + 6]] : [[-3, -R + 6]];
  cages.forEach(([a, b], i) => {
    B.begin(...wp(B, a, 0, b), ry);
    bars(B, -1.2, 1.2, -1.2, 0, 2.2, null); bars(B, -1.2, 1.2, 1.2, 0, 2.2, i === 0 && big ? [-0.4, 0.4] : null); barsZ(B, -1.2, 1.2, -1.2, 0, 2.2); barsZ(B, -1.2, 1.2, 1.2, 0, 2.2);
    B.box('woodDark', 0, 0.05, 0, 2.5, 0.1, 2.5); B.box('woodDark', 0, 2.3, 0, 2.6, 0.12, 2.6, { col: false });
    if (i === 0 && big) {
      const gate = makeDoor('camp:cage', ...wp(B, 0, 0.1, 1.2), ry, 0.8, 2.1, 0.08, 'iron', 'swing', (Bv, w, h) => { for (let x = -w / 2; x <= w / 2; x += 0.14) Bv.box('iron', x, h / 2, 0, 0.035, h, 0.035); });
      if (!WORLD_STATE.flags['camp:freed']) {
        const Bf = new Builder(); figure(Bf, ...wp(B, 0, 0.1, -0.2), ry, 'sit', { coat: 0x6a5a48, legs: 0x3a3a44, skin: 0xc89878, hat: true }); const fig = Bf.build(); scene.add(fig);
        const [px, py, pz] = wp(B, 0, 1, 1.3);
        registerInteract({ id: 'camp:prisoner', x: px, y: py, z: pz, r: 0.5, label: () => WORLD_STATE.flags['camp:freed'] ? null : HOOKS.cleared && HOOKS.cleared('camp:boss') ? 'Free the prisoner' : 'A prisoner (deal with the gang first)', act: () => {
          if (!(HOOKS.cleared && HOOKS.cleared('camp:boss'))) { HOOKS.notify && HOOKS.notify('"Not while they\'re still out there," she hisses. "Get Mercer first."'); return; }
          WORLD_STATE.flags['camp:freed'] = 1; saveWorldState(); gate.open(); setTimeout(() => scene.remove(fig), 2500);
          HOOKS.readLore && HOOKS.readLore('prisoner'); HOOKS.give && HOOKS.give('rifleAmmo', 20); HOOKS.give && HOOKS.give('medkit', 1);
          HOOKS.notify && HOOKS.notify('Deputy Calder takes the ammunition belt off a dead outlaw and hands it to you. "Obliged."', 'epic');
        } });
      } else gate.open(true);
    } else { const p = W3(B, 0, 0, 0); H.P('skull', p.x, p.z, rnd()); H.P('bones', p.x + 0.4, p.z + 0.3, rnd()); }
  });
  // the lookout over the gate
  B.begin(...wp(B, R - 4, 0, 6), ry);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box('woodDark', sx * 1.2, 3, sz * 1.2, 0.22, 6, 0.22);
  B.box('woodGrey', 0, 6.1, 0, 3.2, 0.2, 3.2); for (const [x, z, w, d] of [[0, 1.55, 3.2, 0.1], [0, -1.55, 3.2, 0.1], [1.55, 0, 0.1, 3.2]]) B.box('woodGrey', x, 6.7, z, w, 1, d);
  B.begin(s.x, s.h, s.z, ry);
  for (const [t, a, b] of [['wagon', -12, 4], ['crate', -10, -1], ['crate', -10.6, -0.2], ['barrel', 10, -4], ['barrel', 10.6, -3.4], ['sack', -7, 6], ['trough', 11, 2]]) { const p = W3(B, a, 0, b); H.P(t, p.x, p.z, rnd() * 6); }
  // shooting practice: bottles on a rail
  B.box('woodDark', -3, 1.1, 16, 4, 0.1, 0.1, { col: false }); for (let i = 0; i < 6; i++) B.box('bottle', -4.6 + i * 0.6, 1.3, 16, 0.08, 0.3, 0.08, { col: false });
  B.box('woodDark', 3, 1.3, -5, 0.12, 2.6, 0.12); notice(B, 3, 1.9, -4.92, 0, big ? 'wanted' : 'outlawLetter');
  note(B, -R + 6.2, 0.5, -5.8, 'photo3');
  if (!big) note(B, 2.2, 0.02, 1.6, 'outlawLetter', 0.4);
  // the gang
  const spots = [[6, 6], [-6, 6], [8, -6], [-8, -4], [0, -9], [4, 11], [-10, 10], [11, 0]].slice(0, big ? 8 : 6);
  const c = wp(B, 0, 0, 0);
  registerEncounter({ key: big ? 'camp:gang' : 'camp2:gang', x: c[0], y: c[1], z: c[2], r: R + 55, flat: true, title: big ? 'Outlaws! Black Jack\'s gang has seen you' : 'The Rattlesnake Gang opens fire',
    groups: [{ type: 'outlaw', at: spots.map(([a, b]) => { const p = W3(B, a, 0, b); return [p.x, heightAt(p.x, p.z), p.z]; }) }] });
  if (big) registerEncounter({ key: 'camp:boss', x: c[0], y: c[1], z: c[2], r: R + 20, flat: true, after: 'camp:gang',
    boss: { type: 'blackjack', at: (p => [p.x, heightAt(p.x, p.z), p.z])(W3(B, -R + 9, 0, 2)), name: 'Black Jack Mercer', title: 'Outlaw, murderer, thief of the Hartwell serum', home: { x: c[0], y: c[1], z: c[2], r: R + 30 }, reward: [['blackjackMap', 1], ['outlawGold', 1], ['revolver', 1], ['pistolAmmo', 30]], cash: 180 } });
}

// ---------- abandoned barns: a big gambrel barn with stalls, a hayloft and a tack room; ploughs and rakes outside;
// sometimes a horse that ran loose still grazes nearby ----------
function barn(B, s, rnd, scene) {
  const ry = rnd() * PI * 2, W = 7, L = 12, WH = 5.6, paint = s.name === 'Hollis Farm' ? 'woodRed' : 'woodGrey';
  B.begin(s.x, s.h, s.z, ry);
  B.box('floor', 0, 0.1, 0, 2 * W, 0.2, 2 * L);
  wallRun(B, paint, false, -W, -L, L, 0.2, WH, [{ c: -6, w: 1, h: 1, sill: 2.6 }, { c: 4, w: 1, h: 1, sill: 2.6 }]);
  wallRun(B, paint, false, W, -L, L, 0.2, WH, [{ c: -2, w: 1.2, h: 2.2 }]);
  for (const z of [-L, L]) wallRun(B, paint, true, z, -W - 0.2, W + 0.2, 0.2, WH, [{ c: 0, w: 4.4, h: 4.4 }]);
  // gambrel roof: steep lower slopes, shallow upper ones, and gable ends to match
  const lw = 2.6, lp = 1.05, uw = W + 0.4 - lw * Math.cos(lp), up = 0.42, ly = WH + 0.2 + lw * Math.sin(lp);
  for (const sx of [-1, 1]) {
    B.box('shingle', sx * (W + 0.4 - lw * Math.cos(lp) / 2), WH + 0.2 + lw * Math.sin(lp) / 2, 0, lw, 0.2, 2 * L + 0.8, { rz: -sx * lp, col: false });
    B.box('shingle', sx * uw / 2, ly + uw * Math.tan(up) / 2, 0, uw / Math.cos(up), 0.2, 2 * L + 0.8, { rz: -sx * up, col: false });
  }
  for (const z of [-L, L]) for (let i = 0; i < 6; i++) { const k = (i + 0.5) / 6, hh = (ly + uw * Math.tan(up) - WH - 0.2), w = 2 * W * (1 - k * 0.8); B.box(paint, 0, WH + 0.2 + k * hh, z, w, hh / 6 + 0.02, 0.3, { col: false }); }
  B.box('woodWhite', 0, 2.3, -L - 0.12, 4.6, 0.25, 0.1, { col: false }); for (const sx of [-1, 1]) B.box('woodWhite', sx * 2.3, 1.2, -L - 0.12, 0.2, 2.3, 0.1, { col: false });
  // stalls down one side, each with a manger
  for (let i = 0; i < 6; i++) {
    const z = -9 + i * 3.2;
    B.box('woodDark', -3.4, 0.95, z - 1.6, 7.2 - 3.8, 1.5, 0.1); B.box('woodDark', -W + 0.4, 0.8, z, 0.5, 0.4, 2.4, { col: false });
    if (i % 2) { const p = W3(B, -5, 0.2, z); addProp('hay', p.x, p.y, p.z, rnd() * 6, 0.8); }
  }
  B.box('woodDark', -1.7, 0.6, 0, 0.1, 1.0, 19.2);
  // the hayloft over the back, with a ladder-stair up
  B.box('floor', 2.6, 3.6, 7, 8.8, 0.2, 10); B.box('woodDark', -1.8, 3.1, 7, 0.2, 1, 10, { col: false });
  stairs(B, 5.4, 6.6, -3.6, 0.2, 3.4, 1);
  for (let i = 0; i < 7; i++) { const p = W3(B, 0.5 + (i % 3) * 1.6, 3.7, 4.5 + Math.floor(i / 3) * 1.6); addProp('hay', p.x, p.y, p.z, rnd() * 0.3, 1); }
  // tack room in the corner
  wallRun(B, 'woodGrey', true, 8.4, 2.4, W, 0.2, 3, [{ c: 4.4, w: 1, h: 2.1 }]); wallRun(B, 'woodGrey', false, 2.4, 8.4, L, 0.2, 3);
  B.box('woodGrey', 4.7, 3.25, 10.2, 4.6, 0.12, 3.6);
  lootAt(B, 'farmchest', 5.6, 0.2, 11.2, PI); shelf(B, 6.7, 0.2, 9.6, 1.6, 2, -PI / 2, rnd);
  note(B, 4, 0.26, 10.4, { 'Hollis Farm': 'hollis', 'Whitfield Stud': 'whitfield' }[s.name] || 'redwater', 0.5);
  for (const [a, b] of [[3, -6], [3.8, -5], [-1, 9], [2, -9]]) { const p = W3(B, a, 0.2, b); addProp(rnd() < 0.6 ? 'hay' : 'sack', p.x, p.y, p.z, rnd() * 6, 1); }
  bulb(B, 0, WH, -4, { k: 0.4 }); bulb(B, 0, WH, 6, { k: 0.4 });
  // farm machinery outside: a plough, a hay rake on its big wheels, a seed drill, a wagon
  const out = (a, b, r = 0) => { const p = W3(B, a, 0, b); B.begin(p.x, heightAt(p.x, p.z), p.z, ry + r); };
  out(12, -6, 0.5); B.box('woodDark', 0, 0.5, 0, 0.12, 0.12, 2.6, { rx: 0.3 }); B.box('iron', 0, 0.2, -1.2, 0.5, 0.35, 0.05, { rx: 0.6, col: false }); for (const sx of [-1, 1]) B.box('woodDark', sx * 0.3, 0.75, 1.1, 0.06, 0.06, 1, { rx: -0.5, col: false });
  out(13, 4, -0.3);
  for (const sx of [-1, 1]) B.geom('iron', new THREE.TorusGeometry(0.75, 0.04, 6, 20), T4(sx * 1.4, 0.75, 0, 0, PI / 2));
  B.box('iron', 0, 0.75, 0, 2.8, 0.06, 0.06); for (let i = 0; i < 12; i++) B.box('iron', -1.3 + i * 0.24, 0.45, 0.1, 0.02, 0.6, 0.02, { rz: 0, rx: 0.4, col: false });
  B.box('woodDark', 0, 0.9, 1.1, 0.1, 0.1, 2, { col: false }); B.box('woodDark', 0, 1.1, -0.3, 0.4, 0.06, 0.4, { col: false });
  out(-12, 9, 1.2); B.box('woodRed', 0, 0.9, 0, 2.4, 0.5, 0.7); for (const sx of [-1, 1]) B.geom('iron', new THREE.TorusGeometry(0.5, 0.04, 6, 16), T4(sx * 1.3, 0.5, 0, 0, PI / 2)); for (let i = 0; i < 6; i++) B.box('iron', -1 + i * 0.4, 0.4, 0.2, 0.03, 0.6, 0.03, { col: false });
  B.begin(s.x, s.h, s.z, ry);
  for (const [t, a, b] of [['wagon', -12, -8], ['trough', 9, -14], ['barrel', 8, -13], ['wheel', 11, 8], ['woodpile', -10, 13], ['hay', 9, 13], ['hay', 9.6, 14]]) { const p = W3(B, a, 0, b); H.P(t, p.x, p.z, rnd() * 6); }
  // the corral
  for (let i = 0; i < 30; i++) { const a = i / 30 * PI * 2; if (i === 0) continue; const p = W3(B, 22 + Math.cos(a) * 9, 0, -4 + Math.sin(a) * 9); H.P(rnd() < 0.25 ? 'fenceBroken' : 'fence', p.x, p.z, -a + PI / 2 - ry); }
  H.trees(s, rnd, 10, 34, 54);
  // a horse that ran loose sometimes still grazes here, and bolts if you come at it
  const g = W3(B, 22, 0, -4);
  const stud = s.name === 'Whitfield Stud';
  registerEncounter({ key: 'horse:' + s.name, x: g.x, y: heightAt(g.x, g.z), z: g.z, r: 120, flat: true, horse: true, chance: stud ? 0.8 : 0.45, repeat: 600, herd: stud ? 3 : 0, coatKey: stud ? 'black' : s.name === 'Hollis Farm' ? 'grey' : 'bay', blaze: s.name === 'Hollis Farm' });
}

// ---------- Volt Research Station: a fenced compound on the surface, a long stair down, and the laboratory below:
// reception, the generator hall, the coil laboratory, the stores, and the core where Dr. Volt still works ----------
function coilTower(B, x, y, z, h, r = 0.5) {
  B.custom = B.custom || {}; B.custom.coil = COIL;
  B.geom('metal', new THREE.CylinderGeometry(r * 1.4, r * 1.6, 0.6, 16), T4(x, y + 0.3, z));
  B.geom('metal', new THREE.CylinderGeometry(r * 0.5, r * 0.6, h, 12), T4(x, y + h / 2, z), 0xc07840);
  for (let k = 0.15; k < 0.85; k += 0.07) B.geom('metal', new THREE.TorusGeometry(r * 0.62, 0.03, 4, 16), T4(x, y + h * k, z, PI / 2), 0xc07840);
  B.geom('coil', new THREE.TorusGeometry(r * 1.4, r * 0.35, 8, 22), T4(x, y + h + 0.1, z, PI / 2));
  B.addCollider(x - r * 1.5, y, z - r * 1.5, x + r * 1.5, y + h, z + r * 1.5);
}
function teslalab(B, s, rnd, scene) {
  const F = -8;
  B.begin(s.x, s.h, s.z, 0);
  const run = stairs(B, -1.5, 1.5, -14.8, F, 8, -1);
  const stair = [-1.7, -14.8 - run - 0.05, 1.7, -14.8, 8, { open: true, wallH: 8 }];
  const R = [stair, [-7, -14.8, 7, -3, 3.8], [-15, -10, -7, -7, 3.2], [-27, -14, -15, -1, 5.5], [7, -10, 15, -7, 3.2], [15, -15, 28, -1, 5.5],
    [-2, -3, 2, 9, 3.2], [2, 2, 8, 5, 3.2], [8, -1, 16, 8, 3.4], [-13, 9, 13, 28, 7]];
  complex(B, R, F, { wall: 'stone', floor: 'stone', ceil: 'metal' });
  const lamps = [[0, -9], [0, -5], [-11, -8.5], [11, -8.5], [-21, -10], [-21, -4], [21, -11], [21, -5], [0, 3], [5, 3.5], [12, 1], [12, 6], [-8, 14], [8, 14], [-8, 23], [8, 23], [0, 18]];
  for (const [x, z] of lamps) bulb(B, x, F + (Math.abs(z - 18) < 10 && Math.abs(x) < 13 && z > 9 ? 7 : z < -1 && Math.abs(x) > 15 ? 5.5 : 3.2), z, { mat: 'lab', under: true, group: 'lab', k: 0.25 });
  // reception
  B.box('woodDark', 0, F + 0.55, -10, 4, 1.1, 0.8); chair(B, 0, F, -9, PI);
  note(B, 0.8, F + 1.12, -10, 'photo2', 0.3); notice(B, -6.75, F + 1.7, -8, PI / 2, 'labNotice');
  for (const z of [-13, -5]) { B.box('woodDark', -5.5, F + 0.45, z, 2.2, 0.08, 0.5); B.box('woodDark', 5.5, F + 0.45, z, 2.2, 0.08, 0.5); }
  // the generator hall: a dynamo the size of a locomotive
  B.geom('metal', new THREE.CylinderGeometry(2, 2, 4, 24), T4(-21, F + 2.4, -7.5, 0, 0, PI / 2), 0x3a4a3a);
  B.geom('metal', new THREE.TorusGeometry(2.4, 0.25, 8, 28), T4(-23.6, F + 2.4, -7.5, 0, PI / 2), 0x2a2a2a);
  for (let i = 0; i < 8; i++) B.geom('metal', new THREE.TorusGeometry(2.05, 0.06, 4, 24), T4(-22.5 + i * 0.42, F + 2.4, -7.5, 0, PI / 2), 0xc07840);
  B.addCollider(-23.8, F, -9.8, -18.8, F + 4.6, -5.2);
  B.box('woodDark', -18, F + 0.4, -2.2, 2, 0.8, 0.8); note(B, -18, F + 0.82, -2.2, 'voltLog1', 0.2);
  lootAt(B, 'labcase', -16, F, -13.2, 0);
  lever(B, 'lab:b1', -26.6, F + 1.5, -4, PI / 2, 'Close the GENERATOR HALL breaker', () => powerCheck());
  // the coil laboratory: four coils in pens
  for (const [x, z] of [[19, -11], [24, -11], [19, -5], [24, -5]]) {
    coilTower(B, x, F, z, 3.4, 0.45);
    bars(B, x - 1.8, x + 1.8, z - 1.8, F, 2, null); bars(B, x - 1.8, x + 1.8, z + 1.8, F, 2, [x - 0.6, x + 0.6]);
  }
  table(B, 17, F, -2.4, 1.6, 0.8); note(B, 17, F + 0.78, -2.4, 'labReport', -0.3); lootAt(B, 'labcase', 26.6, F, -2.2, -PI / 2);
  lever(B, 'lab:b2', 27.6, F + 1.5, -8, -PI / 2, 'Close the COIL LABORATORY breaker', () => powerCheck());
  // the stores
  for (const z of [0.4, 3, 5.6]) shelf(B, 15.6, F, z, 2, 2.4, -PI / 2, rnd);
  lootAt(B, 'labcase', 9.4, F, 0, 0); lootAt(B, 'labcase', 9.4, F, 7, PI);
  table(B, 12, F, 3.5, 1.4, 0.8); note(B, 12, F + 0.78, 3.5, 'voltLog2', 0.1);
  lever(B, 'lab:b3', 13, F + 1.5, -0.7, 0, 'Close the STORES breaker', () => powerCheck());
  // the core: a great coil in the middle, four smaller at the corners, Volt's desk
  coilTower(B, 0, F, 18.5, 5.2, 0.9);
  const coils = [[-10, 12], [10, 12], [-10, 25], [10, 25]];
  for (const [x, z] of coils) coilTower(B, x, F, z, 3.8, 0.5);
  B.box('woodDark', 0, F + 0.45, 26.2, 3, 0.9, 1); chair(B, 0, F, 25.3, PI);
  note(B, -0.6, F + 0.92, 26.2, 'voltLog3', 0.2);
  for (let i = 0; i < 6; i++) B.box('iron', -12 + i * 0.2, F + 2, 9.4 + i * 3, 0.1, 0.1, 2.8, { col: false });
  // the blast door between the corridor and the core
  const blast = makeDoor('lab:blast', ...wp(B, 0, F, 9), 0, 4, 3.2, 0.5, 'metal', 'up', (Bv, w, h, d) => { Bv.box('metal', 0, h / 2, 0, w, h, d, { c: 0x8a8a70 }); for (let k = 0; k < 5; k++) Bv.box('black', -1.6 + k * 0.8, h / 2, -d / 2 - 0.01, 0.4, h - 0.3, 0.01, { rz: 0.6 }); });
  const powerOn = (quiet) => {
    LAB_BULB.color.setHex(0xfff0c8); for (const l of H.LAMP_SPOTS) if (l.group === 'lab') l.k = 1;
    blast.open(quiet); if (!quiet) { HOOKS.notify && HOOKS.notify('The dynamo screams into life. Lights flicker on down the corridors, and the core blast door grinds open.', 'epic'); HOOKS.sfx && HOOKS.sfx('boom', 0.3); }
  };
  function powerCheck() {
    const n = ['lab:b1', 'lab:b2', 'lab:b3'].filter(k => WORLD_STATE.flags[k]).length;
    if (n < 3) { HOOKS.notify && HOOKS.notify(`Breaker closed (${n} of 3). Somewhere a relay clicks.`); return; }
    WORLD_STATE.flags['lab:power'] = 1; saveWorldState(); powerOn(false);
  }
  if (WORLD_STATE.flags['lab:power']) powerOn(true);
  const zone = underground(B, R.map(r => r.slice(0, 4)), stair.slice(0, 4), s.h, 'lab');
  // the surface: the entrance house over the stair head, a fence, a tall coil tower, a guard hut
  B.begin(s.x, s.h, s.z, 0);
  const z0 = -14.8 - run - 1.6;
  wallRun(B, 'brick', false, -2.4, z0, -14.3, 0, 3.2); wallRun(B, 'brick', false, 2.4, z0, -14.3, 0, 3.2);
  wallRun(B, 'brick', true, -14.3, -2.6, 2.6, 0, 3.2); wallRun(B, 'brick', true, z0, -2.6, 2.6, 0, 3.2, [{ c: 0, w: 1.6, h: 2.3 }]);
  B.box('tin', 0, 3.3, (z0 - 14.3) / 2, 5.6, 0.12, -14.3 - z0 + 0.8, { col: false });
  sign(B, 'VOLT RESEARCH STATION', 0, 2.8, z0 - 0.25, 3.4, 0.5, PI, { bg: '#20262a', fg: '#9ad8ff' });
  bulb(B, 0, 3.1, z0 - 0.6, { k: 0.8 });
  for (let i = 0; i < 44; i++) { const a = i / 44 * PI * 2; if (Math.abs(a - PI * 1.5) < 0.12) continue; const x = Math.cos(a) * 44, z = Math.sin(a) * 44; B.box('iron', x, 1.2, z, 0.12, 2.4, 0.12); B.box('iron', x - Math.sin(a) * 3.1, 2.1, z + Math.cos(a) * 3.1, 0.02, 0.02, 6.3, { ry: -a, col: false }); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box('iron', 30 + sx * 1.4, 7, -24 + sz * 1.4, 0.2, 14, 0.2, { rx: -sz * 0.08, rz: sx * 0.08 });
  coilTower(B, 30, 13.6, -24, 1, 1.6);
  H.siteBuilding(B, s.x - 26, s.h, s.z - 30, 0.3, { type: 'shed', damage: 1, paint: 'woodGrey' }, rnd);
  B.begin(s.x, s.h, s.z, 0);
  for (const [t, a, b] of [['crate', -8, -32], ['crate', -8.8, -32.8], ['snowcache', 9, -32], ['barrel', 6, -34]]) H.P(t, s.x + a, s.z + b, rnd() * 6);
  const Bf = new Builder(); figure(Bf, s.x + 5, s.h + 0.05, s.z - 36, 1.1, 'lie', { coat: 0xd8d8d0 }); scene.add(Bf.build());
  // the experiments in their pens, and the doctor in his core
  const at = (pts) => pts.map(([a, b]) => wp(B, a, F, b));
  registerEncounter({ key: 'lab:gen', x: s.x - 21, y: s.h + F, z: s.z - 7, r: 9, under: true, title: 'Something stirs beside the dynamo', groups: [{ type: 'experiment', at: at([[-25, -12], [-17, -3], [-25, -2]]) }] });
  registerEncounter({ key: 'lab:coil', x: s.x + 21, y: s.h + F, z: s.z - 8, r: 9, under: true, title: 'The pens are open', groups: [{ type: 'experiment', at: at([[19, -8], [24, -8], [21.5, -13], [21.5, -3], [26, -13]]) }] });
  registerEncounter({ key: 'lab:volt', x: s.x, y: s.h + F, z: s.z + 18, r: 11, under: true, when: () => !!WORLD_STATE.flags['lab:power'],
    boss: { type: 'scientist', at: wp(B, 0, F, 24), name: 'Dr. Augustus Volt', title: 'The lightning is in him now', home: { x: s.x, y: s.h + F, z: s.z + 18.5, r: 16 }, coils: at(coils.map(([x, z]) => [x * 0.75, 12 + (z - 12) * 0.85])), reward: [['voltFormula', 1], ['arcCaster', 1], ['teslaCell', 3], ['copperCoil', 4]] } });
  void zone;
}

// ---------- Ichor Oil Works: storage tanks, a distillation tower, pipes, a flare stack, the breathing pit; burning
// pools and gas leaks to avoid, red barrels that go up when shot, and the Tar Behemoth under the pit ----------
const sprite = (() => {
  const make = (stops) => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 40, 2, 32, 32, 32); stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  return { fire: make([[0, 'rgba(255,240,180,1)'], [0.35, 'rgba(255,140,30,0.9)'], [1, 'rgba(160,30,0,0)']]), gas: make([[0, 'rgba(170,220,120,0.55)'], [1, 'rgba(120,170,80,0)']]) };
})();
export function flames(scene, x, y, z, r, k = 1) {
  const list = [];
  for (let i = 0; i < Math.max(1, Math.round(r * 1.6)); i++) {
    const m = new THREE.SpriteMaterial({ map: sprite.fire, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const sp = new THREE.Sprite(m), a = Math.random() * PI * 2, d = Math.sqrt(Math.random()) * r * 0.8;
    sp.position.set(x + Math.cos(a) * d, y + 0.6 * k, z + Math.sin(a) * d); sp.scale.set(1.4 * k, 2 * k, 1); scene.add(sp); list.push(sp);
    const ph = Math.random() * 9; H.ANIMATED.push(t => { const f = 0.8 + 0.2 * Math.sin(t * 11 + ph) * Math.sin(t * 6.3 + ph); sp.scale.set(1.4 * k * f, 2 * k * (0.85 + 0.3 * f), 1); });
  }
  return list;
}
function refinery(B, s, rnd, scene) {
  B.begin(s.x, s.h, s.z, 0);
  const tanks = [[-30, -20], [30, -20], [-32, 6], [32, 6], [-14, 32], [14, 32]];
  for (const [x, z] of tanks) {
    B.geom('metal', new THREE.CylinderGeometry(6, 6, 9, 32, 1), T4(x, 4.5, z), 0x7a7468); B.geom('metal', new THREE.ConeGeometry(6.1, 1.2, 32), T4(x, 9.6, z), 0x6a645a);
    for (const y of [2, 5, 8]) B.geom('iron', new THREE.TorusGeometry(6.02, 0.06, 4, 40), T4(x, y, z, PI / 2));
    B.box('iron', x + 6.1, 4.6, z, 0.06, 9.2, 0.5, { col: false }); spiral(B, x, 4, z - 6.05, 0, 3, 'black');
    const p = W3(B, x, 0, z); CIRCLES.push({ x: p.x, z: p.z, r: 6.2, top: s.h + 10 });
  }
  // the distillation tower with its platforms, and the pipes feeding it
  B.geom('metal', new THREE.CylinderGeometry(2.2, 2.4, 26, 20), T4(0, 13, 24), 0x8a8478);
  for (const y of [8, 16, 23]) { B.geom('iron', new THREE.CylinderGeometry(3.6, 3.6, 0.2, 20), T4(0, y, 24)); B.geom('iron', new THREE.TorusGeometry(3.6, 0.04, 4, 24), T4(0, y + 1, 24, PI / 2)); }
  { const p = W3(B, 0, 0, 24); CIRCLES.push({ x: p.x, z: p.z, r: 2.6, top: s.h + 26 }); }
  for (const [x, z] of tanks) {
    const dx = -x, dz = 24 - z, L = Math.hypot(dx, dz), a = Math.atan2(dx, dz);
    B.geom('metal', new THREE.CylinderGeometry(0.35, 0.35, L, 10), new THREE.Matrix4().makeRotationY(a).multiply(new THREE.Matrix4().makeRotationX(PI / 2)).setPosition(x + dx / 2, 1.6, z + dz / 2), 0x4a4038);
    for (let k = 0.2; k < 0.9; k += 0.2) B.box('iron', x + dx * k, 0.8, z + dz * k, 0.2, 1.6, 0.2, { col: false });
  }
  // the flare stack, always burning
  B.geom('metal', new THREE.CylinderGeometry(0.5, 0.7, 22, 12), T4(-44, 11, 30), 0x5a5048);
  { const p = W3(B, -44, 22.3, 30); flames(scene, p.x, p.y, p.z, 0.6, 2.2); const l = [p.x, p.y + 1, p.z]; l.fire = true; H.LAMP_SPOTS.push(l); }
  // the pit: black, glossy and breathing, with a concrete rim
  B.geom('stone', new THREE.TorusGeometry(9.6, 0.5, 6, 40), T4(0, 0.2, 0, PI / 2));
  { const p = W3(B, 0, 0.06, 0), m = new THREE.Mesh(new THREE.CircleGeometry(9.3, 40), ICHOR); m.rotation.x = -PI / 2; m.position.set(p.x, p.y, p.z); scene.add(m);
    H.ANIMATED.push(t => { m.position.y = p.y + Math.sin(t * 0.7) * 0.05; });
    registerHazard({ x: p.x, y: p.y, z: p.z, r: 9, dps: 22, kind: 'ichor' }); }
  // burning oil pools and two gas leaks (the valves beside the stills shut them off)
  for (const [x, z, r] of [[-18, 14, 3.5], [20, -6, 3], [10, -28, 3.8], [-22, -36, 3]]) {
    const p = W3(B, x, 0.05, z), m = new THREE.Mesh(new THREE.CircleGeometry(r, 20), ICHOR); m.rotation.x = -PI / 2; m.position.set(p.x, p.y, p.z); scene.add(m);
    flames(scene, p.x, p.y, p.z, r); registerHazard({ x: p.x, y: p.y, z: p.z, r, dps: 16, kind: 'fire' }); const l = [p.x, p.y + 1, p.z]; l.fire = true; H.LAMP_SPOTS.push(l);
  }
  [[24, 18, 'east'], [-22, -10, 'west']].forEach(([x, z, side], i) => {
    const p = W3(B, x, 0, z), hz = registerHazard({ x: p.x, y: p.y, z: p.z, r: 5, dps: 9, kind: 'gas', on: !WORLD_STATE.flags['ref:valve' + i] });
    const haze = [];
    for (let k = 0; k < 6; k++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sprite.gas, transparent: true, depthWrite: false })); sp.position.set(p.x + (Math.random() - 0.5) * 6, p.y + 1 + Math.random() * 2, p.z + (Math.random() - 0.5) * 6); sp.scale.setScalar(4 + Math.random() * 2); scene.add(sp); haze.push(sp); }
    const ph = Math.random() * 9; H.ANIMATED.push(t => { haze.forEach((sp, k) => { sp.visible = hz.on; sp.material.opacity = 0.6 + 0.3 * Math.sin(t * 0.8 + ph + k); }); });
    B.geom('metal', new THREE.CylinderGeometry(1.4, 1.4, 6, 14), T4(x, 3, z), 0x6a6458); B.addCollider(x - 1.4, 0, z - 1.4, x + 1.4, 6, z + 1.4);
    lever(B, 'ref:valve' + i, x + 2, 1.2, z, -PI / 2, `Close the ${side} still gas valve`, () => { hz.on = false; HOOKS.notify && HOOKS.notify('The hiss of gas dies away.'); }, { color: 0xc8a020 });
  });
  // red barrels of refined spirit: shoot one and stand well back
  for (let i = 0; i < 12; i++) {
    const a = rnd() * PI * 2, r = 14 + rnd() * 34, p = W3(B, Math.cos(a) * r, 0, Math.sin(a) * r), y = heightAt(p.x, p.z);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.9, 14), new THREE.MeshStandardMaterial({ color: 0xa82a1a, roughness: 0.5, metalness: 0.3 }));
    m.position.set(p.x, y + 0.45, p.z); m.castShadow = true; scene.add(m);
    const sh = registerShootable({ x: p.x, y: y + 0.45, z: p.z, r: 0.45, mesh: m, hp: 12, onBreak: () => { scene.remove(m); HOOKS.explode && HOOKS.explode(p.x, y + 0.6, p.z, 5, 80); HOOKS.firePool && HOOKS.firePool(p.x, y, p.z, 2.6, 10); } });
    void sh;
  }
  // the works buildings, fuel stores, notices
  for (const [a, b, ry] of [[-40, -28, 0.1], [40, -30, -0.2]]) { const p = W3(B, a, 0, b); H.siteBuilding(B, p.x, s.h, p.z, ry, { type: 'warehouse', damage: 1, paint: 'woodGrey', sign: 'ICHOR OIL WORKS' }, rnd); }
  B.begin(s.x, s.h, s.z, 0);
  for (const [x, z, r] of [[-28, -42, 0], [-24, -42, 0], [30, -42, 0], [44, -12, -PI / 2]]) lootAt(B, 'fuelcrate', x, 0, z, r);
  table(B, 26, 0, -44, 1.6, 0.8); note(B, 26, 0.78, -44, 'refinery2', 0.3); note(B, 25.4, 0.78, -44.2, 'refinery3', -0.2);
  B.box('woodDark', 0, 1.3, -60, 0.14, 2.6, 0.14); notice(B, 0, 1.9, -59.92, 0, 'refinery1');
  for (let i = 0; i < 70; i++) { const a = i / 70 * PI * 2; if (Math.abs(a - PI * 1.5) < 0.07 || Math.abs(a - PI * 0.5) < 0.07) continue; const x = Math.cos(a) * 62, z = Math.sin(a) * 62; B.box('woodDark', x, 1, z, 0.16, 2, 0.16); B.box('iron', x - Math.sin(a) * 2.8, 1.6, z + Math.cos(a) * 2.8, 0.02, 0.02, 5.6, { ry: -a, col: false }); }
  // the tar men, and what lives in the pit
  const c = W3(B, 0, 0, 0), pts = [[-12, -14], [14, -16], [-24, 2], [24, 0], [-8, 16], [10, 14], [0, -32]].map(([a, b]) => { const p = W3(B, a, 0, b); return [p.x, heightAt(p.x, p.z), p.z]; });
  registerEncounter({ key: 'ref:tar', x: c.x, y: s.h, z: c.z, r: 58, flat: true, title: 'Black shapes pull themselves out of the oil', groups: [{ type: 'tarwalker', rise: true, at: pts }] });
  registerEncounter({ key: 'ref:behemoth', x: c.x, y: s.h, z: c.z, r: 24, flat: true,
    boss: { type: 'behemoth', at: [c.x, s.h - 1, c.z], rise: true, name: 'The Tar Behemoth', title: 'What the Ichor Oil Works was really pumping', home: { x: c.x, y: s.h, z: c.z, r: 46 }, reward: [['ichorSample', 1], ['refinedFuel', 2], ['kitTank', 1]] } });
}

// ---------- The Pale Catacombs: a hidden stair in the bayou down to three stages, each harder than the last:
// the ossuary and its three levers, the hall of the Crypt Warden who carries the bone key, and the guardian's chamber ----------
function catacombs(B, s, rnd, scene) {
  const F = -7, oz = s.z - 15;
  B.begin(s.x, s.h, oz, 0);
  const run = stairs(B, -1.3, 1.3, -14.2, F, 7, -1);
  const stair = [-1.5, -14.2 - run - 0.05, 1.5, -14.2, 7, { open: true, wallH: 7 }];
  const R = [stair, [-8, -14.2, 8, 0, 4.5], [-2, 0, 2, 6, 3.2], [-10, 6, 10, 24, 5.5], [-2, 24, 2, 30, 3.2], [-14, 30, 14, 54, 8]];
  complex(B, R, F, { wall: 'stone', floor: 'stone', ceil: 'stone' });
  const torch = (x, y, z) => { B.box('iron', x, y - 0.25, z, 0.08, 0.5, 0.08, { col: false }); bulb(B, x, y, z, { candle: true, under: true, k: 0.7 }); };
  // the ossuary: skulls stacked in the walls
  for (const x of [-7.6, 7.6]) for (let z = -13; z < -1; z += 1.1) for (let yy = 0.8; yy < 3.8; yy += 0.75) { if (rnd() < 0.25) continue; prop(B, 'skull', x + (x < 0 ? 0.15 : -0.15), F + yy, z, x < 0 ? PI / 2 : -PI / 2, 1); }
  for (const x of [-7.6, 7.6]) for (let yy = 0.7; yy < 4; yy += 0.75) B.box('stone', x + (x < 0 ? 0.2 : -0.2), F + yy - 0.05, -7, 0.5, 0.08, 12, { col: false });
  for (const [x, z] of [[-6.5, -12], [6.5, -12], [-6.5, -3], [6.5, -3]]) torch(x, F + 2.4, z);
  notice(B, 0, F + 2, -13.98, 0, 'catacomb1');
  spiral(B, -3, F + 2.5, -0.25, PI, 2, 'black'); spiral(B, 3, F + 2.5, -0.25, PI, 2, 'black');
  note(B, 0, F + 0.02, -8, 'catacomb2', 0.6);
  // the portcullis and its three levers
  const gate = makeDoor('cat:gate', ...wp(B, 0, F, 0), 0, 4, 3.2, 0.2, 'iron', 'up', (Bv, w, h) => { for (let x = -w / 2 + 0.1; x < w / 2; x += 0.25) Bv.box('iron', x, h / 2, 0, 0.06, h, 0.06); for (let y = 0.3; y < h; y += 0.6) Bv.box('iron', 0, y, 0, w, 0.06, 0.06); });
  const pulled = () => ['cat:l1', 'cat:l2', 'cat:l3'].filter(k => WORLD_STATE.flags[k]).length;
  const onLever = () => {
    const n = pulled();
    if (n < 3) { HOOKS.notify && HOOKS.notify(`A lever drops into place (${n} of 3). Something answers from inside the walls.`); return; }
    gate.open(); HOOKS.notify && HOOKS.notify('With a shriek of iron the portcullis rises.', 'epic');
  };
  lever(B, 'cat:l1', -7.6, F + 1.4, -10, PI / 2, 'Pull the lever marked with a spiral', onLever, { color: 0xd8d0b8 });
  lever(B, 'cat:l2', 7.6, F + 1.4, -5, -PI / 2, 'Pull the lever marked with a spiral', onLever, { color: 0xd8d0b8 });
  lever(B, 'cat:l3', 5.5, F + 1.4, -0.4, PI, 'Pull the lever marked with a spiral', onLever, { color: 0xd8d0b8 });
  if (pulled() >= 3) gate.open(true);
  // the warden's hall: pillars and sarcophagi
  for (const x of [-6, 6]) for (const z of [9, 15, 21]) { B.geom('stone', new THREE.CylinderGeometry(0.55, 0.65, 5.5, 12), T4(x, F + 2.75, z)); B.addCollider(x - 0.6, F, z - 0.6, x + 0.6, F + 5.5, z + 0.6); }
  for (const [x, z] of [[-8.6, 9], [-8.6, 15], [-8.6, 21], [8.6, 9], [8.6, 15], [8.6, 21]]) { B.box('stone', x, F + 0.45, z, 1.2, 0.9, 2.4); B.box('stone', x, F + 0.95, z, 1.3, 0.12, 2.5, { col: false }); }
  lootAt(B, 'tomb', -3, F, 22.8, PI); lootAt(B, 'tomb', 3, F, 22.8, PI);
  for (const [x, z] of [[-9.4, 12], [9.4, 12], [-9.4, 18], [9.4, 18]]) torch(x, F + 2.6, z);
  prop(B, 'bones', 2, F, 12, 1); prop(B, 'skull', 2.4, F, 12.4, 0.4); note(B, 1.6, F + 0.02, 11.6, 'catacomb3', 0.3);
  // the bone door
  const boneDoor = makeDoor('cat:bonedoor', ...wp(B, 0, F, 24), 0, 4, 3.2, 0.4, 'paper', 'up', (Bv, w, h, d) => { Bv.box('paper', 0, h / 2, 0, w, h, d, { c: 0xe8e0cc }); for (let i = 0; i < 7; i++) Bv.box('paper', -1.5 + i * 0.5, h / 2, -d / 2 - 0.05, 0.12, h - 0.4, 0.1, { c: 0xd0c8b0 }); });
  { const [x, y, z] = wp(B, 0, F + 1.3, 23.6);
    registerInteract({ id: 'cat:bonelock', x, y, z, r: 0.5, label: () => boneDoor.isOpen ? null : HOOKS.has && HOOKS.has('boneKey') ? 'Unlock the door with the Bone Key' : 'A door of fused bone, with a keyhole shaped like a knuckle', act: () => {
      if (!(HOOKS.has && HOOKS.has('boneKey'))) { HOOKS.notify && HOOKS.notify('Locked. The sentinel carries the key, says the inscription.'); return; }
      boneDoor.open(); HOOKS.notify && HOOKS.notify('The bone key turns. Beyond, something enormous breathes in the dark.', 'epic');
    } }); }
  // the guardian's chamber
  spiral(B, 0, F + 4.5, 53.75, PI, 6, 'black');
  B.box('stone', 0, F + 0.6, 48, 3, 1.2, 4.6); const [lx, ly, lz] = wp(B, 0, F + 1.25, 48);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.18, 4.7), new THREE.MeshStandardMaterial({ color: 0x9a9488, roughness: 0.9 })); lid.position.set(lx, ly, lz); lid.castShadow = true; scene.add(lid);
  if (WORLD_STATE.cleared['cat:guardian']) { lid.position.x += 2.2; lid.rotation.z = 0.5; }
  for (const [x, z] of [[-12, 34], [12, 34], [-12, 50], [12, 50]]) { B.box('iron', x, F + 0.6, z, 0.9, 1.2, 0.9); bulb(B, x, F + 1.3, z, { candle: true, under: true, k: 1 }); }
  lootAt(B, 'tomb', -12.6, F, 42, PI / 2); lootAt(B, 'tomb', 12.6, F, 42, -PI / 2); lootAt(B, 'tomb', -6, F, 53, PI);
  for (let i = 0; i < 20; i++) prop(B, rnd() < 0.5 ? 'bones' : 'skull', (rnd() - 0.5) * 24, F, 32 + rnd() * 20, rnd() * 6, 1.2);
  underground(B, R.map(r => r.slice(0, 4)), stair.slice(0, 4), s.h, 'catacombs');
  // the entrance: a ring of leaning stones round a stone doorway, half sunk in the marsh
  B.begin(s.x, s.h, oz, 0);
  const top = -14.2 - run;
  wallRun(B, 'stone', false, -1.9, top, -14.0, 0, 1); wallRun(B, 'stone', false, 1.9, top, -14.0, 0, 1); wallRun(B, 'stone', true, -14.0, -2.1, 2.1, 0, 1);
  for (const sx of [-1, 1]) B.box('stone', sx * 2.1, 1.8, top - 0.2, 0.8, 3.6, 0.8);
  B.box('stone', 0, 3.8, top - 0.2, 5.2, 0.7, 1); spiral(B, 0, 3.8, top - 0.72, PI, 0.8, 'black');
  for (let i = 0; i < 9; i++) { const a = i / 9 * PI * 2, x = Math.cos(a) * 12, z = top + 6 + Math.sin(a) * 12; B.box('stone', x, 1.4, z, 1, 2.8 + rnd(), 0.6, { ry: -a, rz: (rnd() - 0.5) * 0.3 }); }
  for (let i = 0; i < 10; i++) { const p = W3(B, (rnd() - 0.5) * 34, 0, top + (rnd() - 0.5) * 34); H.P(rnd() < 0.5 ? 'reeds' : 'cypress', p.x, p.z, rnd() * 6, 0.8 + rnd() * 0.4); }
  // three stages, harder each time
  const at = (pts) => pts.map(([a, b]) => wp(B, a, F, b));
  registerEncounter({ key: 'cat:oss', x: s.x, y: s.h + F, z: oz - 7, r: 8, under: true, title: 'The skulls in the walls turn to watch you', groups: [{ type: 'crypt', rise: true, at: at([[-4, -10], [4, -9], [-3, -3], [3, -4]]) }] });
  registerEncounter({ key: 'cat:lever', x: s.x, y: s.h + F, z: oz - 7, r: 12, under: true, when: () => pulled() > 0, groups: [{ type: 'crypt', rise: true, at: at([[-5, -6], [5, -6], [0, -12], [0, -2]]) }] });
  registerEncounter({ key: 'cat:warden', x: s.x, y: s.h + F, z: oz + 15, r: 9, under: true,
    groups: [{ type: 'crypt', rise: true, at: at([[-4, 10], [4, 20], [0, 22]]) }],
    boss: { type: 'warden', at: wp(B, 0, F, 18), name: 'The Crypt Warden', title: 'Sentinel of the Pale Catacombs', home: { x: s.x, y: s.h + F, z: oz + 15, r: 14 }, reward: [['boneKey', 1], ['ancientIdol', 1]] } });
  registerEncounter({ key: 'cat:guardian', x: s.x, y: s.h + F, z: oz + 42, r: 13, under: true, when: () => boneDoor.isOpen,
    boss: { type: 'guardian', at: wp(B, 0, F, 45), name: 'The Pale Guardian', title: 'Older than the territory, older than the Spanish', home: { x: s.x, y: s.h + F, z: oz + 42, r: 18 }, reward: [['heartstone', 1], ['goldBar', 2], ['ancientIdol', 2]],
      onDown: () => { H.ANIMATED.push((t, dt) => { if (lid.position.x < lx + 2.2) { lid.position.x += (dt || 0.016) * 0.8; lid.rotation.z = Math.min(0.5, lid.rotation.z + (dt || 0.016) * 0.2); } }); } } });
}

// ---------- the Hartwell Institute: locked doors, a hall, an infirmary, a cold store, and the apparatus with its
// three cradles. Fill them and the cure is made ----------
export const CURE = [['voltFormula', 'FORMULA'], ['ichorSample', 'SAMPLE'], ['heartstone', 'HEARTSTONE']];
function institute(B, s, rnd, scene) {
  const y = 0.4;
  B.begin(s.x, s.h, s.z, 0);
  const R = [[-2, -16, 2, -13, 3.6, { open: true, wallH: 0, floor: 'stone' }], [-8, -13, 8, -2, 6], [-12, -2, 12, 14, 6], [12, 6, 12.4, 8, 2.5], [12.4, 2, 18, 12, 6, { floor: 'stone' }], [-12.4, 4, -12, 6, 2.5], [-18, 0, -12.4, 12, 6]];
  complex(B, R, y, { wall: 'stone', floor: 'floor', ceil: 'woodDark' });
  B.box('snowroof', 0, y + 6.55, 0, 37, 0.3, 30, { col: false });
  B.box('stone', 0, y + 7.2, -13.1, 16.4, 1.2, 0.4, { col: false });
  sign(B, 'HARTWELL INSTITUTE', 0, y + 5, -13.25, 6, 0.8, PI, { bg: '#20262a', fg: '#e8e0cc' });
  for (const x of [-6, -4, 4, 6]) B.box('glass', x, y + 2.8, -13.22, 1.1, 2.2, 0.05, { col: false });
  for (let i = 0; i < 3; i++) B.box('stone', 0, y - 0.22 - i * 0.12, -16.4 - i * 0.35, 4.4, 0.12, 0.7);
  // the hall: benches, a stove, the notice
  stove(B, -6, y, -10, y + 6); notice(B, 7.75, y + 1.7, -8, -PI / 2, 'hartwell2');
  for (const z of [-11, -5]) { B.box('woodDark', 6, y + 0.45, z, 0.5, 0.08, 2.2); }
  // the apparatus: a dynamo, coils, a bench with three cradles
  B.geom('metal', new THREE.CylinderGeometry(1.6, 1.6, 3.2, 22), T4(0, y + 1.7, 10.5, 0, 0, PI / 2), 0x3a4a3a);
  for (let i = 0; i < 7; i++) B.geom('metal', new THREE.TorusGeometry(1.65, 0.05, 4, 22), T4(-1.3 + i * 0.43, y + 1.7, 10.5, 0, PI / 2), 0xc07840);
  B.addCollider(-1.7, y, 8.8, 1.7, y + 3.4, 12.2);
  coilTower(B, -8, y, 10, 4, 0.6); coilTower(B, 8, y, 10, 4, 0.6);
  B.box('woodDark', 0, y + 0.5, 5, 9, 1, 1.4);
  for (let i = 0; i < 3; i++) {
    const x = -3 + i * 3; B.box('iron', x, y + 1.08, 5, 0.9, 0.16, 0.9); B.box('metal', x, y + 1.6, 7.2, 0.12, 0.12, 4.2, { col: false, c: 0xc07840 });
    sign(B, CURE[i][1], x, y + 1.35, 4.28, 0.8, 0.18, PI, { bg: '#2a2016', fg: '#e8d8b0' });
    const [cx, cy, cz] = wp(B, x, y + 1.25, 5), [item, lbl] = CURE[i];
    let shown = null;
    const show = () => { if (shown || !WORLD_STATE.placed[item]) return; shown = itemModel(item); shown.scale.setScalar(2.2); shown.position.set(cx, cy, cz); scene.add(shown); };
    show();
    registerInteract({ id: 'inst:cradle' + i, x: cx, y: cy, z: cz, r: 0.45, label: () => WORLD_STATE.placed[item] ? null : HOOKS.has && HOOKS.has(item) ? `Place the ${lbl.toLowerCase()} in the apparatus` : `An empty cradle marked ${lbl}`, act: () => {
      if (!(HOOKS.has && HOOKS.has(item))) { HOOKS.notify && HOOKS.notify('You have nothing to put here yet.'); return; }
      HOOKS.take(item); WORLD_STATE.placed[item] = 1; saveWorldState(); show(); HOOKS.sfx && HOOKS.sfx('stoke');
      if (CURE.every(([k]) => WORLD_STATE.placed[k])) HOOKS.ending && HOOKS.ending();
      else HOOKS.notify && HOOKS.notify(`The cradle locks around it (${CURE.filter(([k]) => WORLD_STATE.placed[k]).length} of 3).`);
    } });
  }
  for (const [x, z] of [[-6, 2], [6, 2], [0, -6], [-6, 9], [6, 9]]) bulb(B, x, y + 5.9, z, { k: 0.8 });
  registerHeat(...wp(B, 0, y, 2), 12, 12, 'shelter');
  // the infirmary, with the doctor in the last bed
  for (const z of [1.5, 4.5, 7.5, 10.5]) bed(B, -16.6, y, z, true, rnd);
  const Bf = new Builder(); figure(Bf, ...wp(B, -16.4, y + 0.55, 10.5), PI / 2, 'lie', { coat: 0xe8e4dc, legs: 0xe8e4dc }); scene.add(Bf.build());
  B.begin(s.x, s.h, s.z, 0); table(B, -14, y, 9.5, 0.7, 0.6); note(B, -14, y + 0.78, 9.5, 'hartwell1', 0.4);
  // the cold store
  for (const [x, z] of [[17, 3], [17, 6], [17, 9]]) B.box('ice', x, y + 0.7, z, 1.4, 1.4, 1.4);
  lootAt(B, 'labcase', 13.4, y, 10.6, PI / 2);
  // the doors, and the frozen dead in the yard
  const door = makeDoor('inst:door', ...wp(B, 0, y, -13), 0, 3.8, 3.5, 0.25, 'woodDark', 'swing');
  { const [x, yy, z] = wp(B, 0, y + 1.3, -13.5);
    registerInteract({ id: 'inst:lock', x, y: yy, z, r: 0.6, label: () => door.isOpen ? null : HOOKS.has && HOOKS.has('hartwellKey') ? 'Unlock the Institute doors' : 'Locked. Dr. Hartwell\'s key is in the bank vault at Fortune', act: () => {
      if (!(HOOKS.has && HOOKS.has('hartwellKey'))) { HOOKS.notify && HOOKS.notify('The doors are locked fast. The key is in the vault at Fortune.'); return; }
      door.open(); HOOKS.notify && HOOKS.notify('The brass key turns. Warm air breathes out of the Institute.', 'epic'); HOOKS.flag && HOOKS.flag('instOpen');
    } }); }
  for (const [t, a, b] of [['snowcache', -10, -20], ['crate', 10, -19], ['barrel', 11, -20], ['signpost', 0, -26]]) H.P(t, s.x + a, s.z + b, rnd() * 6);
  H.trees(s, rnd, 12, 30, 48, 'pineSnow');
  const yard = [[-10, -24], [10, -26], [-16, -8], [18, -6], [0, -32]].map(([a, b]) => { const p = W3(B, a, 0, b); return [p.x, heightAt(p.x, p.z), p.z]; });
  registerEncounter({ key: 'inst:yard', x: s.x, y: s.h, z: s.z, r: 60, flat: true, title: 'The frozen dead turn towards the Institute', groups: [{ type: 'frozen', at: yard }] });
}

// ---------- the story along the line: Dr. Hartwell's telegram at Dry Gulch, notices at the stations ----------
export function storyProps(B, towns, townToWorld) {
  let i = 0;
  for (const t of towns) {
    if (t.name === 'Dry Gulch') {
      const [x, z] = townToWorld(t, -10, 4.8), ry = Math.atan2(-t.nx, -t.nz);
      B.begin(x, t.h, z, ry);
      B.box('woodDark', -0.7, 1.1, 0, 0.12, 2.2, 0.12); B.box('woodDark', 0.7, 1.1, 0, 0.12, 2.2, 0.12); B.box('woodGrey', 0, 1.6, 0, 1.7, 1.1, 0.06);
      notice(B, -0.3, 1.65, -0.05, 0, 'telegram'); notice(B, 0.42, 1.6, -0.05, 0, 'timetable');
      sign(B, 'WESTERN UNION', 0, 2.3, -0.05, 1.6, 0.26, PI, { bg: '#e8d8b0', fg: '#2a1c12' });
      continue;
    }
    if (!['station', 'small', 'large'].includes(t.kind)) continue;
    const [x, z] = townToWorld(t, 6, 5.2), ry = Math.atan2(-t.nx, -t.nz);
    B.begin(x, t.h, z, ry); B.box('woodDark', 0, 1.1, 0, 0.12, 2.2, 0.12);
    notice(B, 0, 1.7, -0.07, 0, ['quarantine', 'survivor', 'quarantine', 'timetable'][i++ % 4]);
    if (t.kind === 'large' || t.kind === 'small') livery(B, t, townToWorld);
  }
}
// ---------- a livery stable past the end of town: an open-front shed with three stalls, a hitching post, a trough,
// and the stable hand who stayed. The stalls show the horses you keep here (horses.js) ----------
function livery(B, t, townToWorld) {
  const [x, z] = townToWorld(t, t.a1 + 18, 16), ry = Math.atan2(-t.nx, -t.nz), y = heightAt(x, z);
  B.begin(x, y, z, ry);
  B.box('floor', 0, 0.1, 0, 9.4, 0.2, 4.4);
  B.box('woodGrey', 0, 1.6, -2.1, 9.4, 3.0, 0.2);
  for (const sx of [-1, 1]) B.box('woodGrey', sx * 4.6, 1.5, 0, 0.2, 2.8, 4.4);
  for (const sx of [-1.5, 1.5]) B.box('woodDark', sx, 0.85, -0.6, 0.12, 1.5, 2.8);
  for (const px of [-4.5, -1.5, 1.5, 4.5]) B.box('woodDark', px, 1.45, 2.05, 0.18, 2.7, 0.18);
  B.box('shingle', 0, 3.2, 0, 10, 0.16, 5.2, { rx: -0.12, col: false });
  for (const sx of [-3, 0, 3]) { B.box('woodDark', sx, 0.7, -1.8, 1.6, 0.35, 0.4, { col: false }); const p = W3(B, sx + 0.5, 0.2, -1.2); addProp('hay', p.x, p.y, p.z, 0.4, 0.7); }
  sign(B, 'LIVERY STABLE', 0, 2.75, 2.15, 2.6, 0.36, 0, { bg: '#e8d8b0', fg: '#2a1c12' });
  // hitching post, trough, feed sacks
  B.box('woodDark', -1, 0.5, 4.5, 0.14, 1.0, 0.14); B.box('woodDark', 1, 0.5, 4.5, 0.14, 1.0, 0.14); B.box('woodDark', 0, 1.0, 4.5, 2.3, 0.12, 0.12);
  B.box('woodDark', -5.6, 0.35, 3.2, 0.7, 0.5, 2.0); B.box('paper', -5.6, 0.58, 3.2, 0.55, 0.02, 1.85, { c: 0x3a5a6a, col: false });
  for (const [a, b] of [[5.4, -1.2], [5.9, -0.6], [-5.8, 0.6]]) { const p = W3(B, a, 0, b); addProp('sack', p.x, heightAt(p.x, p.z), p.z, a, 1); }
  const L = (a, b, c = 0) => { const p = W3(B, a, c, b); return [p.x, p.y, p.z]; };
  registerStable({ name: t.name, town: t.name, x, y, z, ry, post: L(0, 4.5), stalls: [L(-3, -0.3, 0.2), L(0, -0.3, 0.2), L(3, -0.3, 0.2)], hand: L(5.8, 3) });
  // the stable hand, standing at the corner with a pitchfork
  const h = W3(B, 5.8, 0, 3);
  B.begin(h.x, y, h.z, ry + PI * 0.75, false);
  B.box('cloth', 0, 1.15, 0, 0.42, 0.62, 0.24, { c: 0x6a5a40 }); B.box('cloth', 0, 1.6, 0.02, 0.22, 0.25, 0.22, { c: 0xc8956a });
  B.box('cloth', 0, 1.76, 0.02, 0.36, 0.04, 0.36, { c: 0x8a6a3a }); B.box('cloth', 0, 1.84, 0.02, 0.2, 0.12, 0.2, { c: 0x8a6a3a });
  for (const sx of [-1, 1]) { B.box('cloth', sx * 0.11, 0.42, 0, 0.15, 0.84, 0.16, { c: 0x2e3448 }); B.box('cloth', sx * 0.27, 1.12, 0.05, 0.1, 0.55, 0.1, { c: 0x6a5a40 }); }
  B.box('woodDark', 0.36, 1.0, 0.18, 0.04, 1.8, 0.04);
}
