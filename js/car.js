// Open cargo car coupled behind the Jupiter: walkable deck, low plank walls, side steps, spinning wheels.
// The body rides on springs above its trucks, carries the engine's coal in two bunkers at the front, and is fitted out
// for a crew living aboard: a bench, sacks, rope, a lantern, a tarp over the crates
import * as THREE from 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/three.module.js';
import { railAt } from './world.js';
import { RAIL_TOP } from './rail.js';
import { grime, weathered } from './terrainmat.js';
import { surface, boards } from './ptex.js';
import { merger } from './locodetail.js';

// model space: x forward (toward the loco), y up from the rail tops, z across
export const CAR = {
  half: 4.5, truck: 3.0, deck: 1.30, wall: 0.92, width: 1.30,
  // distance (along the line) from the loco's origin back to the car's centre
  offset: 10.0,
};
const WHEEL_R = 0.42, AXLE = 0.76, GAUGE_HALF = 0.7175;
const H = CAR.half, W = CAR.width, D = CAR.deck, WT = D + CAR.wall, GATE = 0.62, APRON = 1.12;
// coal bunkers in the front corners, either side of the gangway to the cab
const BUNK = { x0: 3.15, x1: H - 0.12, z0: 0.62, z1: W - 0.06, h: 0.7 };

// walkable / blocking boxes [x0, y0, z0, x1, top, z1]
export const CAR_BOXES = [
  [-H, -1.5, -W, H, D, W],                                      // deck
  [H, -1.5, -0.55, H + APRON, D, 0.55],                          // walkway plate across to the cab
  [-H, -1.5, W, -GATE, WT, W + 0.12], [GATE, -1.5, W, H, WT, W + 0.12],          // side walls (gate in the middle)
  [-H, -1.5, -W - 0.12, -GATE, WT, -W], [GATE, -1.5, -W - 0.12, H, WT, -W],
  [-H - 0.12, -1.5, -W - 0.12, -H, WT, W + 0.12],                // rear wall
  [H - 0.12, -1.5, 0.55, H, WT, W + 0.12], [H - 0.12, -1.5, -W - 0.12, H, WT, -0.55], // front wall with gap
  // side steps under each gate
  [-0.45, -1.5, W + 0.12, 0.45, 0.85, W + 0.36], [-0.45, -1.5, W + 0.36, 0.45, 0.40, W + 0.58], [-0.45, -1.5, W + 0.58, 0.45, -0.05, W + 0.80],
  [-0.45, -1.5, -W - 0.36, 0.45, 0.85, -W - 0.12], [-0.45, -1.5, -W - 0.58, 0.45, 0.40, -W - 0.36], [-0.45, -1.5, -W - 0.80, 0.45, -0.05, -W - 0.58],
  // cargo at the back: two crates and a barrel (you can climb on them)
  [-4.30, -1.5, 0.35, -3.50, D + 0.8, 1.15], [-4.30, -1.5, -0.55, -3.50, D + 0.8, 0.25], [-3.40, -1.5, 0.55, -2.80, D + 0.9, 1.15],
  // coal bunkers
  [BUNK.x0, -1.5, BUNK.z0, BUNK.x1, D + BUNK.h, BUNK.z1], [BUNK.x0, -1.5, -BUNK.z1, BUNK.x1, D + BUNK.h, -BUNK.z0],
  // crew bench along the left wall, sacks against it
  [1.2, -1.5, -W, 2.8, D + 0.45, -W + 0.42], [-2.6, -1.5, -W, -1.5, D + 0.35, -W + 0.5],
];

// weathered boards with relief, running along the car: the board pattern is turned so the planks lie horizontal
function planks(base, peel, seed, rx, ry) {
  const fn = boards({ base, peel, seed, boards: 8 });
  const s = surface(256, (u, v) => fn(v, u), 6);
  const t = (c, srgb) => { const x = new THREE.CanvasTexture(c); x.wrapS = x.wrapT = THREE.RepeatWrapping; x.repeat.set(rx, ry); x.anisotropy = 4; if (srgb) x.colorSpace = THREE.SRGBColorSpace; return x; };
  return { map: t(s.color, true), normalMap: t(s.normal), roughnessMap: t(s.orm), roughness: 1 };
}

export function buildCar(scene, M) {
  const std = (c, m, r, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, metalness: m, roughness: r }, o));
  const L = {
    body: std(0xffffff, 0, 1, planks([0.6, 0.29, 0.19], 1, 41, 3, 1)),
    deck: std(0xffffff, 0, 1, planks([0.5, 0.39, 0.28], 0, 43, 4, 1.4)),
    crate: std(0xc8b088, 0, 1, planks([0.66, 0.52, 0.36], 0, 45, 1, 1)),
    letter: std(0xe8dcc0, 0, 0.8),
    coal: std(0x141210, 0.15, 0.38, { flatShading: true }),
    rope: std(0x9a8058, 0, 0.95), tarp: std(0x6a6448, 0, 0.92), sack: std(0xa8946a, 0, 0.95),
    lamp: std(0xfff0c8, 0, 0.3, { emissive: 0xffb050, emissiveIntensity: 0 }),
    marker: std(0x3a0806, 0, 0.3, { emissive: 0xff2010, emissiveIntensity: 0 }),
  };
  for (const k of ['body', 'deck', 'crate']) grime(L[k], 0.8, 1.6);
  for (const k of ['tarp', 'sack']) grime(L[k], 0.6, 1.6);
  for (const k of ['body', 'deck', 'crate', 'tarp', 'sack']) weathered(L[k]);
  const root = new THREE.Group(); root.name = 'CargoCar'; scene.add(root);
  // the sprung body: everything above the trucks
  const body = new THREE.Group(); root.add(body);
  const BODY = merger(), TRUCK = merger();
  let Q = BODY;
  const put = (...a) => Q.put(...a), box = (...a) => Q.box(...a), cyl = (...a) => Q.cyl(...a);

  // underframe: sills, end beams, queen-post truss rods
  box(M.wood, -H, D - 0.32, -W + 0.05, H, D - 0.1, -W + 0.25); box(M.wood, -H, D - 0.32, W - 0.25, H, D - 0.1, W - 0.05);
  box(M.wood, -H, D - 0.34, -0.35, H, D - 0.1, -0.15); box(M.wood, -H, D - 0.34, 0.15, H, D - 0.1, 0.35);
  for (const x of [-H, H]) box(M.wood, x - 0.12, D - 0.42, -W - 0.05, x + 0.12, D - 0.06, W + 0.05);
  for (const z of [-0.85, 0.85]) {
    for (const x of [-1.1, 1.1]) box(M.iron, x - 0.04, D - 0.75, z - 0.04, x + 0.04, D - 0.3, z + 0.04);
    box(M.iron, -1.1, D - 0.77, z - 0.015, 1.1, D - 0.73, z + 0.015);
    for (const s of [-1, 1]) { const x0 = s * 1.1, x1 = s * (H - 0.2), dy = 0.45; put(M.iron, new THREE.CylinderGeometry(0.015, 0.015, Math.hypot(x1 - x0, dy), 6), (x0 + x1) / 2, D - 0.75 + dy / 2, z, 0, 0, s * (Math.PI / 2 - Math.atan2(dy, Math.abs(x1 - x0)))); }
    // turnbuckles in the truss rods
    for (const s of [-1, 1]) box(M.iron, s * 2.6 - 0.09, D - 0.52, z - 0.025, s * 2.6 + 0.09, D - 0.46, z + 0.025, 0, 0, s * 0.18);
  }
  // air reservoir and brake cylinder slung under the deck
  cyl(M.iron, 0.16, 1.6, -0.2, D - 0.55, -0.45, 0, 0, Math.PI / 2, 14);
  cyl(M.iron, 0.11, 0.35, 1.2, D - 0.5, 0.45, 0, 0, Math.PI / 2, 12);
  box(M.iron, 1.38, D - 0.52, 0.43, 2.6, D - 0.48, 0.47);
  // deck, plank walls with iron stakes, top rails
  box(L.deck, -H, D - 0.1, -W, H, D, W);
  box(L.deck, H, D - 0.06, -0.55, H + APRON, D, 0.55);
  for (const [z0, z1] of [[0.55, W], [-W, -0.55]]) { box(L.body, H - 0.05, D, z0, H + 0.05, WT, z1); box(M.wood, H - 0.07, WT - 0.02, z0, H + 0.07, WT + 0.06, z1); }
  for (const s of [-1, 1]) {
    for (const [x0, x1] of [[-H, -GATE], [GATE, H]]) {
      box(L.body, x0, D, s * W - 0.05, x1, WT, s * W + 0.05);
      box(M.wood, x0, WT - 0.02, s * W - 0.07, x1, WT + 0.06, s * W + 0.07);
      for (let x = x0 + 0.3; x < x1 - 0.1; x += 0.95) {
        box(M.iron, x - 0.04, D - 0.25, s * W + 0.05, x + 0.04, WT + 0.02, s * W + 0.11);
        // bolt heads through the stake and the wall
        for (const y of [D + 0.2, WT - 0.2]) cyl(M.iron, 0.018, 0.03, x, y, s * (W + 0.115), Math.PI / 2, 0, 0, 6);
      }
    }
    // gateway at the side steps is left open
    box(M.iron, -GATE - 0.05, D - 0.1, s * W - 0.06, -GATE + 0.03, WT + 0.06, s * W + 0.06);
    box(M.iron, GATE - 0.03, D - 0.1, s * W - 0.06, GATE + 0.05, WT + 0.06, s * W + 0.06);
    // stirrup steps
    const z0 = s * (W + 0.12), dz = s * 0.22;
    for (const [y, k] of [[0.85, 1], [0.40, 2], [-0.05, 3]]) box(M.iron, -0.45, y - 0.04, z0 + dz * (k - 1), 0.45, y, z0 + dz * k);
    for (const x of [-0.47, 0.47]) box(M.iron, x - 0.02, -0.05, s * W, x + 0.02, D - 0.1, s * (W + 0.82));
    // grab irons
    for (const x of [-0.75, 0.75]) cyl(M.brass, 0.015, 0.7, x, D + 0.45, s * (W + 0.1), 0, 0, 0, 6);
  }
  box(L.body, -H - 0.05, D, -W, -H + 0.05, WT, W); box(M.wood, -H - 0.07, WT - 0.02, -W - 0.07, -H + 0.07, WT + 0.06, W + 0.07);

  // couplers: link-and-pin pocket at each end, a rear brake wheel, lettering board
  for (const x of [-H - 0.25, H + 0.12]) box(M.iron, x, D - 0.62, -0.12, x + 0.18, D - 0.38, 0.12);
  box(M.iron, H + 0.3, D - 0.53, -0.03, H + 1.25, D - 0.47, 0.03);
  cyl(M.iron, 0.02, 0.9, -H - 0.2, WT + 0.05, 0.8);
  put(M.iron, new THREE.TorusGeometry(0.22, 0.02, 6, 18), -H - 0.2, WT + 0.5, 0.8, Math.PI / 2, 0, 0);
  for (let k = 0; k < 4; k++) box(M.iron, -H - 0.21, WT + 0.49, 0.8 - 0.01, -H - 0.19, WT + 0.51, 0.8 + 0.01, 0, k * Math.PI / 4, 0), box(M.iron, -H - 0.2 - 0.2, WT + 0.495, 0.79, -H - 0.2 + 0.2, WT + 0.505, 0.81, 0, k * Math.PI / 4, 0);
  for (const s of [-1, 1]) box(L.letter, -2.9, D + 0.38, s * (W + 0.055) - 0.004, -1.3, D + 0.52, s * (W + 0.055) + 0.004);
  // rear marker lamp
  box(M.iron, -H - 0.2, WT - 0.1, -0.95, -H - 0.07, WT + 0.12, -0.8);
  box(L.marker, -H - 0.21, WT - 0.04, -0.93, -H - 0.19, WT + 0.06, -0.82);

  // cargo
  const crate = (x0, z0, x1, z1, h) => {
    box(L.crate, x0, D, z0, x1, D + h, z1);
    for (const y of [D + 0.04, D + h - 0.04]) box(M.wood, x0 - 0.01, y - 0.04, z0 - 0.01, x1 + 0.01, y + 0.04, z1 + 0.01);
    for (const x of [x0 + 0.04, x1 - 0.04]) box(M.wood, x - 0.04, D, z0 - 0.012, x + 0.04, D + h, z1 + 0.012);
  };
  crate(-4.30, 0.35, -3.50, 1.15, 0.8); crate(-4.30, -0.55, -3.50, 0.25, 0.8); crate(-4.25, 0.42, -3.62, 1.05, 1.42 - 0.62);
  put(M.wood, new THREE.CylinderGeometry(0.3, 0.3, 0.9, 14), -3.1, D + 0.45, 0.85);
  for (const y of [0.12, 0.45, 0.78]) put(M.iron, new THREE.TorusGeometry(0.305, 0.015, 4, 16), -3.1, D + y, 0.85, Math.PI / 2, 0, 0);
  // a tarp roped over the rear crates, a coil of rope on top
  box(L.tarp, -4.34, D + 0.8, -0.6, -3.46, D + 0.84, 0.3);
  box(L.tarp, -4.36, D + 0.35, -0.62, -4.32, D + 0.84, 0.3, 0, 0, -0.06); box(L.tarp, -3.48, D + 0.4, -0.62, -3.44, D + 0.84, 0.3, 0, 0, 0.08);
  for (const x of [-4.1, -3.7]) box(L.rope, x - 0.015, D + 0.3, -0.63, x + 0.015, D + 0.86, -0.6), box(L.rope, x - 0.015, D + 0.84, -0.6, x + 0.015, D + 0.87, 0.3);
  put(L.rope, new THREE.TorusGeometry(0.17, 0.035, 6, 18), -3.9, D + 0.84, 0.75, Math.PI / 2, 0, 0);
  // the crew's corner: a bench along the wall, sacks beside it, a shovel and a pick against the stakes
  box(M.wood, 1.2, D + 0.4, -W + 0.06, 2.8, D + 0.45, -W + 0.42);
  for (const x of [1.3, 2.7]) box(M.wood, x - 0.04, D, -W + 0.08, x + 0.04, D + 0.4, -W + 0.4);
  box(M.wood, 1.2, D + 0.45, -W + 0.06, 2.8, D + 0.85, -W + 0.1, 0.08, 0, 0);
  for (const [x, y, z, s] of [[-2.3, 0.16, -0.95, 1], [-1.8, 0.15, -1.0, 0.95], [-2.05, 0.42, -0.98, 0.9]]) {
    const g = new THREE.SphereGeometry(0.28, 10, 8); g.scale(1.15 * s, 0.6 * s, 0.8 * s); put(L.sack, g, x, D + y, z, 0, x * 2, 0.1);
  }
  box(M.wood, 2.98, D + 0.05, -W + 0.08, 3.02, D + 1.1, -W + 0.12, 0.12, 0, 0.08); box(M.iron, 2.92, D + 0.02, -W + 0.06, 3.1, D + 0.28, -W + 0.18, 0.12, 0, 0.08);
  box(M.wood, 0.95, D + 0.05, -W + 0.1, 0.99, D + 0.95, -W + 0.14, 0.15, 0, -0.1); box(M.iron, 0.8, D + 0.85, -W + 0.08, 1.14, D + 0.9, -W + 0.16, 0.15, 0, -0.1);
  // a lantern hung on a stake inside the right wall
  box(M.iron, 2.04, WT - 0.15, W - 0.16, 2.08, WT, W - 0.06);
  cyl(M.brass, 0.07, 0.02, 2.06, WT - 0.2, W - 0.22, 0, 0, 0, 10); cyl(L.lamp, 0.055, 0.16, 2.06, WT - 0.3, W - 0.22, 0, 0, 0, 10); cyl(M.brass, 0.07, 0.02, 2.06, WT - 0.39, W - 0.22, 0, 0, 0, 10);
  // coal bunkers: plank boxes in the front corners, the heap inside them follows the engine's fuel
  for (const s of [-1, 1]) {
    const za = s * BUNK.z0, zb = s * BUNK.z1, lo = Math.min(za, zb), hi = Math.max(za, zb);
    box(L.body, BUNK.x0, D, lo, BUNK.x0 + 0.05, D + BUNK.h, hi);
    box(L.body, BUNK.x0, D, s > 0 ? lo : hi - 0.05, BUNK.x1, D + BUNK.h, s > 0 ? lo + 0.05 : hi);
    box(M.iron, BUNK.x0 - 0.01, D + BUNK.h - 0.04, lo - 0.01, BUNK.x0 + 0.06, D + BUNK.h + 0.01, hi + 0.01);
  }
  const heaps = [];
  {
    const parts = [], rnd = (() => { let a = 7; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
    const cx = (BUNK.x0 + BUNK.x1) / 2, cz = (BUNK.z0 + BUNK.z1) / 2, hw = (BUNK.x1 - BUNK.x0) / 2 - 0.06, hd = (BUNK.z1 - BUNK.z0) / 2 - 0.06;
    for (let i = 0; i < 70; i++) {
      const u = rnd() * 2 - 1, v = rnd() * 2 - 1, mound = 1 - Math.max(Math.abs(u), Math.abs(v)) * 0.55;
      const g = new THREE.DodecahedronGeometry(0.07 + rnd() * 0.07, 0);
      g.rotateX(rnd() * 6); g.rotateY(rnd() * 6); g.translate(cx + u * hw, mound * (0.25 + rnd() * 0.65), cz + v * hd);
      parts.push(g.index ? g.toNonIndexed() : g);
    }
    let n = 0; for (const g of parts) n += g.attributes.position.count;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3); let o = 0;
    for (const g of parts) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; g.dispose(); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); geo.computeBoundingSphere();
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(geo, L.coal); m.castShadow = m.receiveShadow = true;
      m.position.y = D + 0.02; if (s < 0) m.scale.z = -1;
      body.add(m); heaps.push(m);
    }
  }
  L.coal.side = THREE.DoubleSide;

  // trucks: side frames, springs and bolsters, and spinning wheelsets (these stay on the rails; the body rides above)
  Q = TRUCK;
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.12, 20), flange = new THREE.CylinderGeometry(WHEEL_R + 0.03, WHEEL_R + 0.03, 0.03, 20);
  for (const tx of [-CAR.truck, CAR.truck]) {
    for (const s of [-1, 1]) {
      const z = s * (GAUGE_HALF + 0.24);
      box(M.iron, tx - AXLE - 0.35, WHEEL_R + 0.12, z - 0.05, tx + AXLE + 0.35, WHEEL_R + 0.2, z + 0.05);
      box(M.iron, tx - AXLE - 0.1, WHEEL_R - 0.15, z - 0.05, tx + AXLE + 0.1, WHEEL_R - 0.08, z + 0.05);
      for (const ax of [-AXLE, AXLE]) box(M.iron, tx + ax - 0.12, WHEEL_R - 0.12, z - 0.07, tx + ax + 0.12, WHEEL_R + 0.12, z + 0.07);
      box(M.iron, tx - 0.18, WHEEL_R - 0.1, z - 0.05, tx + 0.18, WHEEL_R + 0.12, z + 0.05);
      // coil springs under the bolster ends
      for (const dx of [-0.09, 0.09]) for (let k = 0; k < 4; k++) put(M.steel, new THREE.TorusGeometry(0.06, 0.012, 4, 10), tx + dx, WHEEL_R + 0.24 + k * 0.05, z, Math.PI / 2, 0, 0);
    }
    // brake shoes against the treads
    for (const ax of [-AXLE, AXLE]) for (const s of [-1, 1]) box(M.iron, tx + ax - Math.sign(ax) * (WHEEL_R + 0.05) - 0.03, WHEEL_R - 0.15, s * GAUGE_HALF - 0.05, tx + ax - Math.sign(ax) * (WHEEL_R + 0.05) + 0.03, WHEEL_R + 0.15, s * GAUGE_HALF + 0.05);
    for (const ax of [-AXLE, AXLE]) {
      const set = new THREE.Group(); set.position.set(tx + ax, WHEEL_R, 0); root.add(set);
      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(wheelGeo, M.iron); w.rotation.x = Math.PI / 2; w.position.z = s * GAUGE_HALF; w.castShadow = true; set.add(w);
        const f = new THREE.Mesh(flange, M.iron); f.rotation.x = Math.PI / 2; f.position.z = s * (GAUGE_HALF - 0.075); set.add(f);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 10), M.steel); hub.rotation.x = Math.PI / 2; hub.position.z = s * (GAUGE_HALF + 0.05); set.add(hub);
        for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.06, WHEEL_R * 1.6, 0.02), M.steel); sp.rotation.z = k * Math.PI / 3; sp.position.z = s * (GAUGE_HALF + 0.065); set.add(sp); }
      }
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2 * GAUGE_HALF + 0.3, 8), M.steel); axle.rotation.x = Math.PI / 2; set.add(axle);
      wheels.push(set);
    }
  }
  // the bolsters belong to the body: they ride on the springs
  Q = BODY;
  for (const tx of [-CAR.truck, CAR.truck]) box(M.wood, tx - 0.2, D - 0.55, -W + 0.1, tx + 0.2, D - 0.32, W - 0.1);

  const planked = new Set([L.body, L.deck, L.crate]);
  BODY.flush(body, 0.5, planked);
  TRUCK.flush(root, 0.5);

  const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), A = new THREE.Vector3(), B = new THREE.Vector3(), mm = new THREE.Matrix4();
  let roll = 0, dist = 0, sway = 0, bob = 0, bobV = 0, coal = -1;
  return {
    root, body, boxes: CAR_BOXES,
    place(s) {
      const r = railAt(s - CAR.truck), f = railAt(s + CAR.truck);
      A.set(r.x, r.y + RAIL_TOP, r.z); B.set(f.x, f.y + RAIL_TOP, f.z);
      X.subVectors(B, A).normalize(); Z.crossVectors(X, up).normalize(); Y.crossVectors(Z, X);
      root.position.addVectors(A, B).multiplyScalar(0.5);
      root.quaternion.setFromRotationMatrix(mm.makeBasis(X, Y, Z));
      root.updateMatrixWorld(true);
    },
    spin(ds) { roll -= ds / WHEEL_R; for (const w of wheels) w.rotation.z = roll; },
    // the body on its springs: rail joints every 12 m knock it, it rings down; it leans out on curves.
    // Small and slow, so the deck stays steady underfoot
    ride(dt, v, turn) {
      const sp = Math.min(1, Math.abs(v) / 14);
      dist += Math.abs(v) * dt;
      const ph = (dist % 12) / 12;
      if (ph < Math.abs(v) * dt / 12 + 0.0001 && sp > 0.05) bobV -= 0.05 * sp;
      bobV += (-bob * 60 - bobV * 7) * dt; bob += bobV * dt;
      body.position.y = Math.max(-0.012, Math.min(0.012, bob));
      sway += (Math.max(-0.012, Math.min(0.012, turn * Math.abs(v) * 0.0075)) - sway) * Math.min(1, dt * 1.5);
      body.rotation.x = sway;
    },
    setCoal(f) {
      const k = Math.max(0, Math.min(100, f)) / 100; if (Math.abs(k - coal) < 0.005) return; coal = k;
      for (const m of heaps) { m.visible = k > 0.01; m.scale.y = 0.15 + k * 0.85; }
    },
    setNight(night) { L.lamp.emissiveIntensity = 0.2 + night * 2.5; L.marker.emissiveIntensity = night > 0.15 ? 0.5 + night * 3 : 0.15; },
  };
}
