// The Jupiter: loads the user's OBJ locomotive, animates its running gear and drives it along the line
import * as THREE from 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/three.module.js';
import { rail, railAt } from './world.js';
import { RAIL_TOP } from './rail.js';
import { buildCar, CAR, CAR_BOXES } from './car.js';
import { grime, weathered } from './terrainmat.js';
import { dressMaterials, boxUV, fittings, VENTS, steamSystem, headlamp, firelight, valveGear, brakeRigging } from './locodetail.js';

// measured from the model (metres, +x is forward, wheels touch y = 0.03)
const DRV_A = [-2.745, 0.935], DRV_B = [-0.03, 0.935], DRV_R = 0.905, CRANK_R = 0.455;
const TRK_C = [2.81, 0.46], TRK_D = [4.70, 0.46], TRK_R = 0.43;
const MAIN_R0 = [-0.485, 0.935], MAIN_F0 = [2.445, 1.0];
const BELL_PIVOT = [2.76, 3.52];
const STACK = new THREE.Vector3(3.9, 4.62, 0), LAMP = new THREE.Vector3(5.02, 3.34, 0);
const CAB_EYE = new THREE.Vector3(-3.15, 3.0, 0.55), BOX = { x0: -4.95, x1: 7.1, z: 1.4, y1: 4.7 };
const REAR_PIVOT = -1.39, FRONT_PIVOT = 3.75, WHEEL_BASE_Y = 0.03;
const CAB = { x0: -4.9, x1: -2.2 }, REAR_SHIFT = -0.5; // the floor runs back under the overhang of the cab roof, and the back wall with it
// cab enlargement: stretched back from its front wall, widened, and raised from the floor
const CAB_FRONT = -2.18, CAB_FLOOR = 1.31, CAB_SX = 1.25, CAB_SY = 1.1, CAB_SZ = 1.15;
const FLOOR_Y = 1.335, CAB_HALF = 1.42;
// the cab seats [x, z, raised]: the fireman's, the driver's (raised, at the controls), and two behind
export const SEATS = [[-3.20, 0.70, 0], [-3.20, -0.70, 0.32], [-4.30, 0.70, 0], [-4.30, -0.70, 0]];
const _tv = new THREE.Vector3();
// [x0, y0, z0, x1, y1(top), z1] in model space. You board from the cargo car behind, across its walkway plate.
const BOXES = [
  [CAB.x0, -1.5, -CAB_HALF, -2.18, FLOOR_Y, CAB_HALF],
  // side walls
  [CAB.x0, -1.5, CAB_HALF, -2.18, 4.0, 1.6], [CAB.x0, -1.5, -1.6, -2.18, 4.0, -CAB_HALF],
  // back wall either side of the doorway you come in by from the cargo car
  [CAB.x0, -1.5, 0.8, CAB.x0 + 0.18, 3.6, CAB_HALF], [CAB.x0, -1.5, -CAB_HALF, CAB.x0 + 0.18, 3.6, -0.8],
  // control board across the front
  [-2.78, -1.5, -CAB_HALF, -2.18, 2.38, CAB_HALF],
  // boiler and running boards ahead of the cab
  [-2.18, -1.5, -0.8, 7.10, 4.7, 0.8], [-2.18, -1.5, 0.8, 7.10, 3.3, 1.6], [-2.18, -1.5, -1.6, 7.10, 3.3, -0.8],
  // four seats (seat tops ~0.5 above the floor)
  [-3.42, -1.5, 0.45, -2.98, FLOOR_Y + 0.5, 0.95], [-3.42, -1.5, -0.95, -2.98, FLOOR_Y + 0.82, -0.45],
  [-4.52, -1.5, 0.45, -4.08, FLOOR_Y + 0.5, 0.95], [-4.52, -1.5, -0.95, -4.08, FLOOR_Y + 0.5, -0.45],
];

const std = (c, m, r, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, metalness: m, roughness: r }, o));
const M = {
  iron: std(0x1f1d1c, 0.55, 0.55), boiler: std(0x22303b, 0.55, 0.42), red: std(0x8f2216, 0.25, 0.5), cab: std(0x6e2214, 0.1, 0.6),
  brass: std(0xc9a04a, 0.9, 0.3), steel: std(0xa3a19c, 0.9, 0.32), wood: std(0x6a4128, 0, 0.75), black: std(0x121112, 0.3, 0.6),
  glass: std(0xfff1c8, 0, 0.1, { emissive: 0xffd890, emissiveIntensity: 0.4 }),
};
// a working engine on a desert line: dust up the wheels and running gear, grime down the boiler, the brass only dulled
for (const [k, a] of [['iron', 1], ['boiler', 0.8], ['red', 0.9], ['cab', 0.7], ['black', 0.8], ['wood', 0.7], ['steel', 0.35], ['brass', 0.3]]) grime(M[k], a, 1.4);
const RULES = [
  [/glass|bulbGlass/i, 'glass'],
  [/Bell_bell|Bell_swing|Bell_hammer|Bell_frames|whistle|placque|caprim|Lantern_rim|Lantern_handle|Lantern_sticks|SteamTank_rim|SteamTank_seal|railing|Boiler_bolts|Smokebox_rails|WaterTank_lid|WaterTank_tank|Boiler_lid/i, 'brass'],
  [/rod|piston|crank|axel|braking/i, 'steel'],
  [/Wheels_wheels|Wheels_frames|Front_front|Front_base|Lantern_casing|Lantern_roof|frontBase/i, 'red'],
  [/Cab_cab|Cab_doors|frontWindow/i, 'cab'],
  [/Cab_seat|Cab_floor|curtain|windowDecor|windowFrame/i, 'wood'],
  [/Cab_roof/i, 'black'],
  [/Boiler_boiler|Smokebox_cylinder|Smokebox_outer|Smokebox_cap|WaterTank_base|SteamTank_tube|SteamTank_overtube|SteamTank_top|SteamTank_base/i, 'boiler'],
];
const matFor = n => { for (const [re, k] of RULES) if (re.test(n)) return k; return 'iron'; };

function parseOBJ(text) {
  const V = [], N = [], objs = []; let cur = { name: 'root', f: [] }; objs.push(cur);
  const L = text.length; let pos = 0;
  while (pos < L) {
    let end = text.indexOf('\n', pos); if (end < 0) end = L;
    const c0 = text.charCodeAt(pos), c1 = text.charCodeAt(pos + 1);
    if (c0 === 118 && (c1 === 32 || c1 === 110)) {
      const a = text.substring(pos + (c1 === 110 ? 3 : 2), end).split(' ');
      if (c1 === 110) N.push(+a[0], +a[1], +a[2]); else V.push(+a[0], +a[1], +a[2]);
    } else if (c0 === 102 && c1 === 32) {
      const a = text.substring(pos + 2, end).split(' '), vi = [], ni = [];
      for (const t of a) { if (!t) continue; const k = t.indexOf('/'); if (k < 0) { vi.push(+t - 1); ni.push(-1); } else { vi.push(+t.substring(0, k) - 1); ni.push(t.length > k + 1 ? +t.substring(k + 1) - 1 : -1); } }
      for (let i = 1; i < vi.length - 1; i++) cur.f.push(vi[0], ni[0], vi[i], ni[i], vi[i + 1], ni[i + 1]);
    } else if (c0 === 111 && c1 === 32) { cur = { name: text.substring(pos + 2, end).trim(), f: [] }; objs.push(cur); }
    pos = end + 1;
  }
  return { V, N, objs };
}

// which moving assembly a triangle belongs to (or null = static body)
function assign(name, cx, cy) {
  const near = (c, r) => Math.hypot(cx - c[0], cy - c[1]) < r;
  if (/BackWheels_wheels/.test(name)) return near(DRV_A, DRV_R + 0.05) ? 'drvA' : near(DRV_B, DRV_R + 0.05) ? 'drvB' : null;
  if (/BackWheels_backrods|BackWheels_axelBack/.test(name)) return 'drvA';
  if (/BackWheels_frontrods|BackWheels_axelFront/.test(name)) return 'drvB';
  if (/FrontWheels_wheels/.test(name)) return near(TRK_C, TRK_R + 0.05) ? 'trkC' : near(TRK_D, TRK_R + 0.05) ? 'trkD' : null;
  if (/FrontWheels_axelBack/.test(name)) return 'trkC';
  if (/FrontWheels_axelFront/.test(name)) return 'trkD';
  if (/Coupling_rod_001|rodFlags_001|rodBolts_001/.test(name)) return 'side';
  if (/Coupling_rod_002|rodFlags_002|rodBolts_002|rodBulbs_002/.test(name)) return 'main';
  if (/rodClamp_00[23]/.test(name)) { if (cy > 1.25) return null; return cx < -0.42 ? 'side' : cx < 2.6 ? 'main' : null; }
  if (/pistonRod|pistonPin|pistonBlock|pistonFlag/.test(name)) return 'cross';
  if (/Bell_swing|Bell_bell|Bell_hammer/.test(name)) return 'bell';
  return null;
}
const PIVOT = { drvA: DRV_A, drvB: DRV_B, trkC: TRK_C, trkD: TRK_D, main: MAIN_R0, bell: BELL_PIVOT, side: [0, 0], cross: [0, 0] };

export async function loadTrain(scene, url, status) {
  status && status('Bringing the Jupiter up the line');
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not load ' + url);
  const text = await res.text();
  const { V, N, objs } = parseOBJ(text);
  // worn paint, rusting iron, tarnished brass and weathered boards, drawn once while the engine loads
  if (!M.copper) { dressMaterials(M); grime(M.copper, 0.3, 1.4); for (const k of ['boiler', 'red', 'black', 'iron', 'steel', 'cab', 'brass', 'copper']) weathered(M[k]); }
  const buckets = new Map();
  const add = (key, mat) => { const k = key + '|' + mat; if (!buckets.has(k)) buckets.set(k, { key, mat, p: [], n: [] }); return buckets.get(k); };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), fn = new THREE.Vector3();
  for (const o of objs) {
    if (!o.f.length) continue;
    if (/Cab_seat|Cab_block|Cab_engine/.test(o.name)) continue; // benches replaced by four seats; dark backhead block hid the gauges
    const mat = matFor(o.name);
    const grow = /Cab_/.test(o.name) && !/Cab_engine/.test(o.name);
    for (let i = 0; i < o.f.length; i += 6) {
      const i0 = o.f[i] * 3, i1 = o.f[i + 2] * 3, i2 = o.f[i + 4] * 3;
      const cx = (V[i0] + V[i1] + V[i2]) / 3, cy = (V[i0 + 1] + V[i1 + 1] + V[i2 + 1]) / 3, cz = (V[i0 + 2] + V[i1 + 2] + V[i2 + 2]) / 3;
      const grp = assign(o.name, cx, cy) || 'static';
      // the frame's top showed through the cab floor where the model's full-width benches used to hide it
      if (grp === 'static' && !grow && cx > CAB.x0 - 0.05 && cx < CAB.x1 && cy > FLOOR_Y + 0.01 && cy < FLOOR_Y + 1.2 && Math.abs(cz) < CAB_HALF) continue;
      const B = add(grp, mat), pv = PIVOT[grp] || [0, 0];
      let flat = null;
      for (let k = 0; k < 3; k++) {
        const vi = o.f[i + k * 2] * 3, ni = o.f[i + k * 2 + 1] * 3;
        if (grow) {
          let gx = CAB_FRONT + (V[vi] - CAB_FRONT) * CAB_SX, gy = CAB_FLOOR + (V[vi + 1] - CAB_FLOOR) * CAB_SY;
          // the back wall (with its doorway, curtain and trim) moves back to the end of the longer floor, and the wall
          // itself comes down to the boards: it stood on the old benches
          if (gx <= -4.215 && gx >= -4.425 && !/Cab_roof/.test(o.name)) { gx += REAR_SHIFT; if (gy < 2.2 && Math.abs(V[vi + 2] * CAB_SZ) < 1.4 && /Cab_cab/.test(o.name)) gy = FLOOR_Y; }
          B.p.push(gx, gy, V[vi + 2] * CAB_SZ);
        }
        else B.p.push(V[vi] - pv[0], V[vi + 1] - pv[1], V[vi + 2]);
        if (ni >= 0) B.n.push(N[ni], N[ni + 1], N[ni + 2]);
        else {
          if (!flat) { a.fromArray(V, i0); b.fromArray(V, i1); c.fromArray(V, i2); flat = fn.subVectors(c, b).cross(b.sub(a)).normalize().toArray(); }
          B.n.push(flat[0], flat[1], flat[2]);
        }
      }
    }
  }
  const root = new THREE.Group(); root.name = 'Jupiter';
  const parts = {};
  for (const g of ['drvA', 'drvB', 'trkC', 'trkD', 'side', 'main', 'cross', 'bell']) {
    const grp = new THREE.Group(); const pv = PIVOT[g]; grp.position.set(pv[0], pv[1], 0); parts[g] = grp; root.add(grp);
  }
  for (const B of buckets.values()) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(boxUV(B.p, B.n, 0.5), 2));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, M[B.mat]); mesh.castShadow = B.mat !== 'glass' && B.mat !== 'brass'; mesh.receiveShadow = true;
    (B.key === 'static' ? root : parts[B.key]).add(mesh);
  }
  scene.add(root);

  // headlamp
  const spot = new THREE.SpotLight(0xffd79a, 0, 160, 0.32, 0.55, 1.2);
  spot.position.copy(LAMP); spot.target.position.set(40, 0.5, 0);

  root.add(spot, spot.target);
  // grab irons either side of the cab's open back
  for (const z of [-0.62, 0.62]) {
    const grab = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6), M.brass);
    grab.position.set(-4.47, 2.3, z * 1.3); root.add(grab);
  }
  const cabin = buildCabInterior(root);
  fittings(root, M);
  // the crosshead travels between 2.445 and 3.355 m, so its mean is 2.9
  const gear = valveGear(root, M, DRV_B, CRANK_R, [2.9, MAIN_F0[1]]), shoes = brakeRigging(root, M, [DRV_A, DRV_B], DRV_R);
  const steam = steamSystem(scene), lampFx = headlamp(root, LAMP), fire = firelight(root, new THREE.Vector3(-2.62, FLOOR_Y + 0.55, 0.12));
  const car = buildCar(scene, M);
  const BODIES = [{ root, boxes: BOXES, x0: -6, x1: 8.5 }, { root: car.root, boxes: CAR_BOXES, x0: -5.2, x1: 6.0 }];

  // smoke
  const smokeTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();
  const puffs = [];
  for (let i = 0; i < 90; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0x6a6460, transparent: true, opacity: 0, depthWrite: false }));
    sp.visible = false; scene.add(sp); puffs.push({ sp, life: 0, max: 1, v: new THREE.Vector3(), size: 1 });
  }
  let puffIdx = 0, smokeMul = 1; // smokeMul follows the particle quality setting
  const emit = (n0, strength) => {
    const n = Math.floor(n0 * smokeMul + Math.random());
    const w = root.localToWorld(STACK.clone());
    for (let i = 0; i < n; i++) {
      const p = puffs[puffIdx++ % puffs.length];
      p.sp.position.copy(w).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, Math.random() * 0.2, (Math.random() - 0.5) * 0.3));
      p.v.set((Math.random() - 0.5) * 0.6, 2.2 + strength * 3 + Math.random(), (Math.random() - 0.5) * 0.6);
      p.life = 0; p.max = 3 + Math.random() * 2 + strength * 2; p.size = 0.8 + strength * 0.6; p.sp.visible = true;
      // hard work throws dark coal smoke; drifting, it is a paler grey
      p.g = strength > 0.45 ? 0.17 + Math.random() * 0.1 : 0.32 + Math.random() * 0.15;
    }
  };
  // steam vents in world space, and a direction out of the engine's side
  const _vw = new THREE.Vector3(), _dw = new THREE.Vector3();
  const vent = (p, dx, dy, dz) => { root.localToWorld(_vw.set(p[0], p[1], p[2])); _dw.set(dx, dy, dz).applyQuaternion(root.quaternion); return _vw; };
  // a short burst of filtered noise on the train bus: hiss of air and steam
  const hiss = (len, freq, vol, q = 0.7) => {
    const A = T.audio; if (!A || !A.ctx) return;
    const c = A.ctx, t = c.currentTime, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = A.noise(); src.loop = true; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(A.bus ? A.bus.train : A.master); src.start(t); src.stop(t + len + 0.05);
  };
  // a sound that runs while something lasts (the safety valve, the brake shoes); returns a handle to set its level
  const held = (freq, q, type = 'bandpass') => {
    const A = T.audio; if (!A || !A.ctx) return null;
    const c = A.ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = A.noise(); src.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.value = 0;
    src.connect(f).connect(g).connect(A.bus ? A.bus.train : A.master); src.start();
    return { set(v) { g.gain.setTargetAtTime(v, c.currentTime, 0.08); }, f };
  };
  let safetyS = null, shoeS = null, lifted = false, wasBraking = true, sinceStart = 0, vPrev = 0, accS = 0;

  const T = {
    root, s: 0, v: 0, throttle: 0, brake: true, alpha: 0, bellT: 0, ready: true, grade: 0,
    audio: null,
    // power: 0 when the firebox has gone cold. sync: {s, v, throttle, brake, at} streamed from the tab that drives
    power: 1, sync: null,
    // up: fitted upgrades (shared by the host); grip: rail adhesion, below 1 on snow and ice
    up: {}, grip: 1,
    // chest: steam in the cylinders, which follows the regulator with a lag; brakeK: how hard the shoes are on;
    // slack: how far the car has run in or out on its coupling
    chest: 0, brakeK: 1, slack: 0, slackV: 0, pressure: 150,
    setSmoke(level) { smokeMul = { low: 0.35, medium: 0.65, high: 1 }[level] || 1; steam.setLevel(level); },
    place(s) {
      this.s = Math.max(CAR.offset + 10, Math.min(rail.L - 14, s));
      const r = railAt(this.s + REAR_PIVOT), f = railAt(this.s + FRONT_PIVOT);
      const rp = new THREE.Vector3(r.x, r.y + RAIL_TOP - WHEEL_BASE_Y, r.z), fp = new THREE.Vector3(f.x, f.y + RAIL_TOP - WHEEL_BASE_Y, f.z);
      const X = fp.clone().sub(rp).normalize(), Z = new THREE.Vector3().crossVectors(X, new THREE.Vector3(0, 1, 0)).normalize(), Y = new THREE.Vector3().crossVectors(Z, X);
      const t = -REAR_PIVOT / (FRONT_PIVOT - REAR_PIVOT);
      root.position.copy(rp).lerp(fp, t);
      root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
      root.updateMatrixWorld(true);
      this.grade = (f.y - r.y) / (FRONT_PIVOT - REAR_PIVOT);
      car.place(this.s - CAR.offset + this.slack);
      const h = Math.atan2(-X.z, X.x); this.headingDelta = this.heading === undefined ? 0 : Math.atan2(Math.sin(h - this.heading), Math.cos(h - this.heading)); this.heading = h;
    },
    update(dt, ctl, night, wind) {
      // ctl: {up, down, brake}
      if (ctl) {
        if (ctl.up) this.throttle = Math.min(1, this.throttle + dt * 0.6);
        if (ctl.down) this.throttle = Math.max(-0.6, this.throttle - dt * 0.6);
        this.brake = !!ctl.brake;
      }
      let ns;
      // the regulator lets steam into the chest: it takes a second or so to build up, and dies away a little quicker
      const want = this.throttle * this.power;
      this.chest += (want - this.chest) * Math.min(1, dt * (Math.abs(want) > Math.abs(this.chest) ? 1.4 : 2.2));
      // the brakes come on over a second as the air builds in the cylinders, and let off a little faster
      this.brakeK += ((this.brake ? 1 : 0) - this.brakeK) * Math.min(1, dt * (this.brake ? 1.8 : 2.6));
      this.slip = 0;
      if (this.sync) {
        // follow the driving tab: extrapolate its last report and ease towards it
        const S = this.sync, target = S.s + S.v * Math.min(0.5, (performance.now() - S.at) / 1000);
        this.v = S.v; this.throttle = S.throttle; this.brake = S.brake;
        ns = this.s + this.v * dt; ns += (target - ns) * Math.min(1, dt * 4);
        if (Math.abs(target - ns) > 30) ns = target;
      } else {
        const up = this.up || {}, grip = this.grip ?? 1;
        let drive = this.chest * (up.engine ? 1.6 : 1.25);
        // wheelslip on snow when opened up too far: the drivers spin faster than she moves
        if (grip < 1 && Math.abs(this.chest) > 0.55) { drive *= grip; this.slip = (Math.abs(this.chest) - 0.55) * (1 - grip) * 2.2; }
        let acc = drive - 0.03 * this.v - 0.0012 * this.v * Math.abs(this.v) - 9.81 * this.grade * 0.6;
        // a standing train needs a firm pull before the whole weight breaks away
        if (Math.abs(this.v) < 0.05 && Math.abs(drive) < 0.14) { acc = 0; this.v = 0; }
        if (this.brakeK > 0.01) acc -= Math.sign(this.v) * Math.min((up.brakes ? 5 : 3.2) * (up.brakes ? Math.max(grip, 0.9) : grip) * this.brakeK, Math.abs(this.v) / dt);
        this.v = Math.max(-8, Math.min(up.engine ? 30 : 24, this.v + acc * dt));
        ns = this.s + this.v * dt;
        if (ns < CAR.offset + 10 || ns > rail.L - 14) { this.v = 0; this.throttle = 0; }
      }
      // slack in the coupling: the car is snatched along when she pulls, and runs in against her when she checks
      const accNow = (this.v - vPrev) / Math.max(dt, 1e-3); vPrev = this.v; accS += (accNow - accS) * Math.min(1, dt * 5);
      const slackT = Math.max(-0.07, Math.min(0.07, -accS * 0.04));
      this.slackV += ((slackT - this.slack) * 38 - this.slackV * 7) * dt; this.slack = Math.max(-0.08, Math.min(0.08, this.slack + this.slackV * dt));
      const before = this.s; this.place(ns); car.spin(this.s - before);
      car.ride(dt, this.v, dt > 0 ? (this.headingDelta || 0) / dt : 0);
      // running gear
      const prev = this.alpha;
      this.alpha += (this.v / DRV_R + Math.sign(this.chest) * this.slip * 9) * dt;
      const al = this.alpha;
      parts.drvA.rotation.z = -al; parts.drvB.rotation.z = -al;
      // the leading wheels aren't driven, so they only ever roll with the ground
      this.roll = (this.roll || 0) + this.v / DRV_R * dt;
      parts.trkC.rotation.z = -this.roll * DRV_R / TRK_R; parts.trkD.rotation.z = parts.trkC.rotation.z;
      const ox = CRANK_R * (1 - Math.cos(al)), oy = CRANK_R * Math.sin(al);
      parts.side.position.set(ox, oy, 0);
      const Px = MAIN_R0[0] + ox, Py = MAIN_R0[1] + oy;
      const L0 = Math.hypot(MAIN_F0[0] - MAIN_R0[0], MAIN_F0[1] - MAIN_R0[1]);
      const Cx = Px + Math.sqrt(Math.max(0, L0 * L0 - (MAIN_F0[1] - Py) ** 2));
      parts.main.position.set(Px, Py, 0);
      parts.main.rotation.z = Math.atan2(MAIN_F0[1] - Py, Cx - Px) - Math.atan2(MAIN_F0[1] - MAIN_R0[1], MAIN_F0[0] - MAIN_R0[0]);
      parts.cross.position.x = Cx - MAIN_F0[0];
      // bell swing
      this.bellT = Math.max(0, this.bellT - dt);
      parts.bell.rotation.z = Math.sin(performance.now() * 0.006) * 0.5 * Math.min(1, this.bellT);
      // exhaust: one chuff per quarter turn
      const q0 = Math.floor(prev / (Math.PI / 2)), q1 = Math.floor(al / (Math.PI / 2));
      const work = Math.abs(this.chest), sp = Math.abs(this.v), R = Math.random;
      sinceStart = sp < 0.3 ? 0 : sinceStart + sp * dt;
      // cylinder cocks: the driver leaves them open as she gets under way, to clear water out of the cylinders
      this.cocks = !!this.power && sinceStart < 30 && work > 0.08 && sp < 6;
      if (q1 !== q0 && sp > 0.05) {
        emit(2 + Math.round(work * 3), work); this.chuff(work);
        if (this.cocks) {
          const side = q1 & 1 ? 1 : -1, p = VENTS.cocks[(q1 & 2 ? 1 : 0) + (side > 0 ? 0 : 2)];
          for (let i = 0; i < 4; i++) { vent(p, (R() - 0.5) * 0.8, -0.3 - R() * 0.3, side * (3.5 + R() * 2)); steam.puff(_vw, _dw, 0.25, 7, 1.3 + R(), 0.7); }
          hiss(0.35, 1800, 0.1);
        }
      }
      if (Math.random() < dt * 1.5) emit(1, 0);
      if (this.cocks && R() < dt * 14) { const p = VENTS.cocks[Math.floor(R() * 4)]; vent(p, 0, -0.4, Math.sign(p[2]) * 1.2); steam.puff(_vw, _dw, 0.15, 5, 0.8, 0.4); }
      // a working engine leaks a little at the glands; standing, the injector overflow drips steam
      if (work > 0.3 && R() < dt * work * 3) { const p = VENTS.cocks[R() < 0.5 ? 1 : 3]; vent(p, 0.3, 0.8, Math.sign(p[2]) * 0.3); steam.puff(_vw, _dw, 0.12, 6, 1.0, 0.3); }
      if (this.power && sp < 0.5 && R() < dt * 1.2) { const s = R() < 0.5 ? 1 : -1; vent([VENTS.injector[0], VENTS.injector[1], s * VENTS.injector[2]], 0, -0.3, s * 0.2); steam.puff(_vw, _dw, 0.1, 6, 1.4, 0.35); }
      // safety valves lift when the boiler is over pressure, roaring until it falls back
      if (!lifted && this.pressure > 172 && this.power) lifted = true; else if (lifted && (this.pressure < 164 || !this.power)) lifted = false;
      this.safetyOpen = lifted;
      if (lifted) for (const p of VENTS.safety) if (R() < dt * 26) { vent(p, (R() - 0.5) * 0.5, 7 + R() * 3, (R() - 0.5) * 0.5); steam.puff(_vw, _dw, 0.16, 10, 1.7, 0.6); }
      if (lifted && !safetyS) safetyS = held(3400, 0.7);
      if (safetyS) safetyS.set(lifted ? 0.06 : 0);
      // the whistle blows steam as well as sound
      if (this.whistleT > 0 && R() < dt * 40) { vent(VENTS.whistle, (R() - 0.5) * 0.4, 4 + R() * 2, (R() - 0.5) * 0.4); steam.puff(_vw, _dw, 0.12, 8, 1.3, 0.55); }
      // brakes: a blast of air as they go on, a sigh as they come off, hot shoes smoking and sparking at speed
      if (this.brake && !wasBraking && sp > 0.5) { hiss(1.1, 900, 0.16); for (const p of VENTS.brake) for (let i = 0; i < 6; i++) { vent(p, (R() - 0.5) * 0.6, -0.6, Math.sign(p[2]) * (1 + R())); steam.puff(_vw, _dw, 0.25, 5, 1.1, 0.45); } }
      if (!this.brake && wasBraking && this.power) hiss(0.6, 1400, 0.08);
      wasBraking = this.brake;
      const braking = this.brakeK > 0.3 && sp > 0.6;
      if (braking) for (const p of VENTS.contact) {
        if (R() < dt * sp * 0.2) { vent(p, -Math.sign(this.v) * 0.5, 0.4, Math.sign(p[2]) * 0.3); steam.puff(_vw, _dw, 0.18, 5, 0.9, 0.22); }
        if (sp > 4 && R() < dt * sp * 1.1) { vent(p, -Math.sign(this.v) * (1 + R() * 2), 0.5 + R() * 1.5, Math.sign(p[2]) * (0.4 + R())); steam.spark(_vw, _dw); }
      }
      // spinning drivers throw sparks off the rail
      if (this.slip > 0.05) for (const p of VENTS.contact) if (R() < dt * this.slip * 40) { vent(p, -Math.sign(this.chest) * (1 + R() * 2), 0.6 + R(), Math.sign(p[2]) * R()); steam.spark(_vw, _dw); }
      if (braking && sp > 2 && !shoeS) shoeS = held(2300, 16);
      if (shoeS) { shoeS.set(braking && sp > 2 ? Math.min(0.045, sp * 0.003) * this.brakeK : 0); shoeS.f.frequency.value = 2200 + Math.sin(performance.now() * 0.003) * 160; }
      // the reverser sits in full gear to start and is notched up as she gathers speed
      gear.update(al, (this.throttle < 0 ? -1 : 1) * (1 - 0.6 * Math.min(1, sp / 15)), Cx, dt);
      shoes.update(dt, this.brakeK, sp, night);
      // after firing: the door swings open, the fire flares, and the stack throws black smoke
      if (this.doorT > 0) { this.doorT -= dt; if (this.doorT > 1.4 && R() < dt * 8) emit(2, 1); }
      const lum = 1 - night * 0.6;
      for (const p of puffs) {
        if (!p.sp.visible) continue;
        p.life += dt; const k = p.life / p.max;
        if (k >= 1) { p.sp.visible = false; continue; }
        p.v.y *= 1 - dt * 0.6; p.v.x += wind.x * dt * 1.5; p.v.z += wind.z * dt * 1.5;
        p.sp.position.addScaledVector(p.v, dt);
        const s = p.size * (1 + k * 6); p.sp.scale.set(s, s, s);
        p.sp.material.opacity = (1 - k) * (k < 0.1 ? k * 10 : 1) * 0.55;
        const g = (p.g ?? 0.4) * lum; p.sp.material.color.setRGB(g, g * 0.96, g * 0.92);
      }
      steam.update(dt, wind, night);
      const flick = lampFx.update(dt, night, this.up && this.up.lamp);
      spot.intensity = (40 + night * 900) * (this.up && this.up.lamp ? 1.8 : 1) * flick; spot.distance = this.up && this.up.lamp ? 340 : 160;
      M.glass.emissiveIntensity = (0.5 + night * 3) * flick;
      fire.update(dt, night, !!this.power, work + (this.doorT > 0 ? 1.5 : 0));
      car.setCoal(this.fuel ?? 100); car.setNight(night);
      cabin.update(this, night);
    },
    cabEye() { return root.localToWorld(CAB_EYE.clone()); },
    chaseEye(yaw, pitch) {
      const d = 16, h = 4;
      const off = new THREE.Vector3(-Math.cos(yaw) * Math.cos(pitch) * d, h + Math.sin(-pitch) * d * 0.6, -Math.sin(yaw) * Math.cos(pitch) * d);
      return root.localToWorld(new THREE.Vector3(1, 2.2, 0).add(off));
    },
    // ---- walkable bodies: the locomotive (0) and the cargo car (1), boxes in each one's model space ----
    standBody: 0,
    standOn(x, z, feet, step) {
      let bestW = -Infinity;
      BODIES.forEach((B, i) => {
        const l = B.root.worldToLocal(_tv.set(x, feet, z)); let best = -Infinity;
        if (l.x < B.x0 || l.x > B.x1 || Math.abs(l.z) > 3) return;
        for (const b of B.boxes) if (l.x > b[0] && l.x < b[3] && l.z > b[2] && l.z < b[5] && b[4] <= l.y + step && b[4] > best) best = b[4];
        if (best === -Infinity) return;
        const wy = B.root.localToWorld(_tv.set(l.x, best, l.z)).y;
        if (wy > bestW) { bestW = wy; this.standBody = i; }
      });
      return bestW;
    },
    push(p, R, step, head) {
      let moved = false;
      for (const B of BODIES) {
        const l = B.root.worldToLocal(_tv.set(p.x, p.y, p.z)); let m = false;
        if (l.x < B.x0 || l.x > B.x1 || Math.abs(l.z) > 3) continue;
        for (const b of B.boxes) {
          if (b[4] <= l.y + step || b[1] >= l.y + head) continue;
          const cx = Math.max(b[0], Math.min(l.x, b[3])), cz = Math.max(b[2], Math.min(l.z, b[5]));
          const dx = l.x - cx, dz = l.z - cz, d2 = dx * dx + dz * dz;
          if (d2 >= R * R) continue;
          if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (R - d) / d; l.x += dx * k; l.z += dz * k; }
          else {
            const pl = [l.x - b[0], b[3] - l.x, l.z - b[2], b[5] - l.z], mn = Math.min(...pl), i = pl.indexOf(mn);
            if (i === 0) l.x = b[0] - R; else if (i === 1) l.x = b[3] + R; else if (i === 2) l.z = b[2] - R; else l.z = b[5] + R;
          }
          m = true;
        }
        if (m) { const w = B.root.localToWorld(l); p.x = w.x; p.z = w.z; moved = true; }
      }
      return moved;
    },
    // still above a deck while jumping (so a moving train doesn't leave you behind mid-air)
    over(p, i = 0) {
      const B = BODIES[i] || BODIES[0], l = B.root.worldToLocal(_tv.set(p.x, p.y, p.z));
      return i === 0 ? (l.x > CAB.x0 && l.x < CAB.x1 && Math.abs(l.z) < CAB_HALF && l.y > 1.0 && l.y < 3.2)
        : (l.x > -4.5 && l.x < 5.6 && Math.abs(l.z) < 1.3 && l.y > 1.0 && l.y < 3.5);
    },
    ceiling(p) {
      const l = root.worldToLocal(_tv.set(p.x, p.y, p.z));
      if (l.x > CAB.x0 - 1 && l.x < CAB.x1 && Math.abs(l.z) < CAB_HALF && l.y > 1.0) return root.localToWorld(_tv.set(l.x, 3.85, l.z)).y;
      return Infinity;
    },
    inCab(p) { const l = root.worldToLocal(_tv.set(p.x, p.y, p.z)); return l.x > CAB.x0 && l.x < CAB.x1 && Math.abs(l.z) < CAB_HALF && l.y > 1.0 && l.y < 2.6; },
    toLocal(p, i = 0) { return (BODIES[i] || BODIES[0]).root.worldToLocal(p.clone()); },
    // driver's seat: front-left (model -z), raised so the driver can see over the board
    driverSeat() { return root.localToWorld(new THREE.Vector3(-3.24, FLOOR_Y + 0.85, -0.70)); },
    besideDriverSeat() { return root.localToWorld(new THREE.Vector3(-3.20, FLOOR_Y, -0.05)); },
    nearDriverSeat(p) { const l = root.worldToLocal(_tv.set(p.x, p.y, p.z)); return Math.hypot(l.x + 3.2, l.z + 0.7) < 1.0 && l.y > 1.0 && l.y < 2.6; },
    // the other three seats (0, 2, 3 in SEATS): somewhere to ride, looking where you like
    seatPos(i) { const s = SEATS[i]; return root.localToWorld(new THREE.Vector3(s[0] - 0.04, FLOOR_Y + s[2] + 0.53, s[1])); },
    besideSeat(i) { return root.localToWorld(new THREE.Vector3(SEATS[i][0], FLOOR_Y, 0)); },
    toWorld(l, i = 0) { return (BODIES[i] || BODIES[0]).root.localToWorld(l.clone()); },
    boardingPoint() { return car.root.localToWorld(new THREE.Vector3(0, 0, -(CAR.width + 1.6))); },
    // things you can use aboard: [body, x, y, z] in that body's model space
    spots: { firebox: [0, -2.70, FLOOR_Y + 0.55, 0.12], toolbox: [0, -3.75, FLOOR_Y + 0.2, 1.2], cargo: [1, -3.9, CAR.deck + 0.95, 0.3] },
    spotWorld(name) { const [i, x, y, z] = this.spots[name]; return BODIES[i].root.localToWorld(new THREE.Vector3(x, y, z)); },
    bodyRoot(i) { return (BODIES[i] || BODIES[0]).root; },
    car,
    distanceTo(p) {
      const l = root.worldToLocal(p.clone()), c = car.root.worldToLocal(p.clone());
      return Math.min(Math.hypot(Math.max(0, Math.abs(l.x - 1) - 6), Math.max(0, Math.abs(l.z) - 1.4)), Math.hypot(Math.max(0, Math.abs(c.x) - 4.6), Math.max(0, Math.abs(c.z) - 1.4)));
    },
    mph() { return Math.abs(this.v) * 2.237; },
    // someone has just fired her: the door opens for a moment
    stoked() { this.doorT = 2.4; },
    chuff(work) {
      const A = this.audio; if (!A || !A.ctx) return;
      const c = A.ctx, t = c.currentTime, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = A.noise(); f.type = 'lowpass'; f.frequency.value = 500 + work * 900;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25 + work * 0.35, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22 + work * 0.1);
      src.connect(f).connect(g).connect(A.bus ? A.bus.train : A.master); src.start(t); src.stop(t + 0.4);
    },
    whistle() {
      this.whistleT = 1.7;
      const A = this.audio; if (!A || !A.ctx) return;
      const c = A.ctx, t = c.currentTime, g = c.createGain(), f = c.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.2;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22, t + 0.12); g.gain.setValueAtTime(0.22, t + 1.3); g.gain.linearRampToValueAtTime(0, t + 1.7);
      for (const hz of [554, 659, 831]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz; o.connect(f); o.start(t); o.stop(t + 1.8); }
      f.connect(g).connect(A.bus ? A.bus.train : A.master); if (A.caption) A.caption('cap_whistle');
      emit(1, 0.2); // the steam plume from the whistle itself comes from update()
    },
    bell() {
      this.bellT = 2.2;
      const A = this.audio; if (!A || !A.ctx) return;
      const c = A.ctx; if (A.caption) A.caption('cap_bell');
      for (let i = 0; i < 3; i++) {
        const t = c.currentTime + i * 0.55, o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
        o.frequency.value = 1180; o2.frequency.value = 2950; o2.type = 'sine';
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
        o.connect(g); o2.connect(g); g.connect(A.bus ? A.bus.train : A.master); o.start(t); o2.start(t); o.stop(t + 1.5); o2.stop(t + 1.5);
      }
    },
  };
  return T;
}

// ---------- enlarged cab interior: floor, side panels, four seats, control board ----------
function gaugeFace(label, max, step, red) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d');
  g.fillStyle = '#efe4c8'; g.beginPath(); g.arc(128, 128, 126, 0, 7); g.fill();
  g.strokeStyle = '#2a1b10'; g.lineWidth = 3; g.beginPath(); g.arc(128, 128, 118, 0, 7); g.stroke();
  if (red) { g.strokeStyle = '#a2261a'; g.lineWidth = 10; g.beginPath(); const a0 = -Math.PI / 2 - 2.36 + 4.72 * red; g.arc(128, 128, 104, a0, -Math.PI / 2 + 2.36); g.stroke(); }
  g.fillStyle = '#2a1b10'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let v = 0; v <= max; v += step / 2) {
    const a = -Math.PI / 2 - 2.36 + 4.72 * v / max, major = v % step === 0, r0 = major ? 92 : 100;
    g.lineWidth = major ? 4 : 2; g.beginPath(); g.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0); g.lineTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112); g.stroke();
    if (major) { g.font = 'bold 22px Georgia, serif'; g.fillText(String(v), 128 + Math.cos(a) * 74, 128 + Math.sin(a) * 74); }
  }
  g.font = 'italic bold 20px Georgia, serif'; g.fillText(label, 128, 178);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, emissive: 0xffe2b0, emissiveMap: t, emissiveIntensity: 0.05 });
}
function plankTex() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const g = cv.getContext('2d');
  for (let i = 0; i < 8; i++) {
    const s = 0.78 + Math.random() * 0.25; g.fillStyle = `rgb(${120 * s | 0},${84 * s | 0},${56 * s | 0})`; g.fillRect(0, i * 32, 256, 32);
    for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(40,25,12,${Math.random() * 0.18})`; g.fillRect(Math.random() * 256, i * 32 + Math.random() * 32, 30 + Math.random() * 80, 1); }
    g.fillStyle = 'rgba(25,15,8,0.8)'; g.fillRect(0, i * 32, 256, 2);
    g.fillRect((i * 97) % 256, i * 32, 2, 32);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}

function buildCabInterior(root) {
  const L = { leather: std(0x4a2516, 0.05, 0.5), panel: std(0x3a2416, 0, 0.6), lampRed: std(0x3a0c08, 0, 0.4, { emissive: 0xff2a10, emissiveIntensity: 0 }), lampGreen: std(0x0c2a10, 0, 0.4, { emissive: 0x30ff50, emissiveIntensity: 0 }), cord: std(0xb89a6a, 0, 0.9) };
  const ft = plankTex(); ft.repeat.set(2.5, 3);
  L.floor = std(0xffffff, 0, 0.85, { map: ft });
  // static pieces are merged per material to keep draw calls low
  const bins = new Map(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
  const put = (mat, geo, x, y, z, rx = 0, ry = 0, rz = 0) => {
    geo.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s));
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!bins.has(mat)) bins.set(mat, []); bins.get(mat).push(g);
  };
  const box = (mat, x0, y0, z0, x1, y1, z1, rx, ry, rz) => put(mat, new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, rx, ry, rz);
  const cyl = (mat, r, h, x, y, z, rx = 0, ry = 0, rz = 0, seg = 16) => put(mat, new THREE.CylinderGeometry(r, r, h, seg), x, y, z, rx, ry, rz);
  const F = FLOOR_Y, X0 = CAB.x0, X1 = -2.19, H = CAB_HALF;

  // floor + skirting + lower side panels that close the gap under the stretched cab walls
  box(L.floor, X0, F - 0.05, -H, X1, F, H);
  for (const s of [-1, 1]) {
    box(M.cab, X0, F - 0.12, s * H - (s > 0 ? 0 : 0.05), X1, 2.14, s * H + (s > 0 ? 0.05 : 0));
    box(M.wood, X0, F, s * (H - 0.03) - 0.02, X1, F + 0.12, s * (H - 0.03) + 0.02);
    box(M.wood, X0, 2.1, s * (H - 0.02) - 0.04, X1, 2.16, s * (H - 0.02) + 0.04);
  }
  box(M.iron, X0 - 0.05, F - 0.14, -H, X0 + 0.02, F + 0.02, H);

  // four seats: driver + fireman up front, two passenger seats behind
  const seat = (cx, cz, lift = 0) => {
    const F = FLOOR_Y + lift;
    if (lift) { box(M.iron, cx - 0.2, FLOOR_Y, cz - 0.2, cx + 0.2, F, cz + 0.2); box(M.iron, cx + 0.22, FLOOR_Y + 0.12, cz - 0.18, cx + 0.42, FLOOR_Y + 0.17, cz + 0.18); }
    const fx = cx + 0.22, bx = cx - 0.22, w = 0.25;
    for (const [lx, lz] of [[fx - 0.04, cz - w + 0.04], [fx - 0.04, cz + w - 0.04], [bx + 0.04, cz - w + 0.04], [bx + 0.04, cz + w - 0.04]]) box(M.iron, lx - 0.02, F, lz - 0.02, lx + 0.02, F + 0.42, lz + 0.02);
    box(M.wood, bx, F + 0.40, cz - w, fx, F + 0.45, cz + w);
    box(L.leather, bx + 0.02, F + 0.45, cz - w + 0.02, fx - 0.01, F + 0.53, cz + w - 0.02);
    box(M.wood, bx - 0.02, F + 0.45, cz - w, bx + 0.03, F + 1.12, cz + w, 0, 0, -0.1);
    box(L.leather, bx + 0.02, F + 0.58, cz - w + 0.03, bx + 0.08, F + 1.06, cz + w - 0.03, 0, 0, -0.1);
    for (const s of [-1, 1]) {
      box(M.wood, bx + 0.02, F + 0.70, cz + s * w - 0.025, fx - 0.03, F + 0.74, cz + s * w + 0.025);
      box(M.wood, fx - 0.07, F + 0.53, cz + s * w - 0.02, fx - 0.03, F + 0.70, cz + s * w + 0.02);
    }
    cyl(M.brass, 0.012, 0.5, bx - 0.03, F + 1.12, cz, Math.PI / 2, 0, 0, 6);
  };
  for (const s of SEATS) seat(s[0], s[1], s[2]);

  // control board: cabinet, sloped desk, upright gauge panel
  const DX0 = -2.78, DX1 = -2.20, DT = 2.36;
  box(L.panel, DX0 + 0.06, F, -H + 0.02, DX1, DT - 0.04, H - 0.02);
  box(M.wood, DX0 + 0.04, F, -H + 0.02, DX0 + 0.08, F + 0.12, H - 0.02);
  for (let z = -1.2; z <= 1.21; z += 0.6) box(M.wood, DX0 + 0.05, F + 0.25, z - 0.25, DX0 + 0.07, DT - 0.15, z + 0.25);
  put(M.iron, new THREE.BoxGeometry(0.62, 0.04, 2 * H - 0.04), (DX0 + DX1) / 2 - 0.02, DT, 0, 0, 0, 0.32);
  box(M.brass, DX0 - 0.02, DT - 0.12, -H + 0.02, DX0 + 0.02, DT - 0.08, H - 0.02);
  const PX = -2.28;
  box(L.panel, PX - 0.04, DT + 0.08, -0.95, PX, 2.92, 0.95);
  box(M.brass, PX - 0.06, 2.91, -0.97, PX - 0.02, 2.95, 0.97); box(M.brass, PX - 0.06, DT + 0.06, -0.97, PX - 0.02, DT + 0.1, 0.97);

  // gauges (faces + brass bezels) with live needles
  const needles = {};
  const gauge = (key, label, max, step, red, z, y, r) => {
    cyl(M.brass, r + 0.025, 0.05, PX - 0.06, y, z, 0, 0, Math.PI / 2, 24);
    const face = new THREE.Mesh(new THREE.CircleGeometry(r, 32), gaugeFace(label, max, step, red));
    face.position.set(PX - 0.088, y, z); face.rotation.y = -Math.PI / 2; root.add(face);
    const pivot = new THREE.Group(); pivot.position.set(PX - 0.095, y, z);
    const nd = new THREE.Mesh(new THREE.BoxGeometry(0.006, r * 0.82, 0.012), M.black); nd.position.y = r * 0.36; pivot.add(nd);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.01, 10), M.brass); cap.rotation.z = Math.PI / 2; pivot.add(cap);
    root.add(pivot); needles[key] = { pivot, face };
  };
  gauge('speed', 'MPH', 60, 10, 0, -0.55, 2.62, 0.13);
  gauge('steam', 'STEAM', 200, 40, 0.82, 0, 2.64, 0.16);
  gauge('brake', 'BRAKE', 100, 20, 0, 0.55, 2.62, 0.12);
  // steam chest: what actually reaches the cylinders, lagging the throttle
  gauge('chest', 'CHEST', 200, 40, 0, 0.32, 2.83, 0.065);
  // water glass beside the steam gauge
  box(M.brass, PX - 0.08, 2.42, 0.78, PX - 0.04, 2.46, 0.86); box(M.brass, PX - 0.08, 2.84, 0.78, PX - 0.04, 2.88, 0.86);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.46, 10), new THREE.MeshStandardMaterial({ color: 0xcfe6f0, transparent: true, opacity: 0.35, roughness: 0.05 }));
  tube.scale.y = 0.85; tube.position.set(PX - 0.07, 2.65, 0.82); root.add(tube);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 1, 8), std(0x2a5a78, 0.1, 0.2)); water.position.set(PX - 0.07, 2.5, 0.82); root.add(water);

  // levers on the desk
  const lever = (x, y, z, len, mat, knob) => {
    const piv = new THREE.Group(); piv.position.set(x, y, z);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, len, 0.03), mat); arm.position.y = len / 2; piv.add(arm);
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), knob); k.position.y = len; piv.add(k);
    cyl(M.iron, 0.04, 0.08, x, y, z, Math.PI / 2, 0, 0, 12);
    root.add(piv); return piv;
  };
  const throttle = lever(-2.50, DT + 0.06, -0.95, 0.42, M.steel, M.brass);
  const reverser = lever(-2.95, F + 0.02, -1.15, 1.15, M.steel, M.wood);
  const cockL = lever(-2.62, DT + 0.02, 0.66, 0.3, M.steel, M.black); lever(-2.62, DT + 0.02, 0.84, 0.26, M.steel, M.brass).rotation.z = 0.25;
  box(M.iron, -3.15, F, -1.22, -2.75, F + 0.12, -1.08);
  const brakeH = new THREE.Group(); brakeH.position.set(-2.45, DT + 0.08, -0.55);
  const bh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 0.03), M.brass); bh.position.x = -0.1; brakeH.add(bh);
  const bk = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), M.black); bk.position.x = -0.21; brakeH.add(bk);
  cyl(M.brass, 0.05, 0.06, -2.45, DT + 0.06, -0.55, 0, 0, 0, 14);
  root.add(brakeH);
  // switches + indicator lamps along the desk
  for (let i = 0; i < 5; i++) { const z = -0.45 + i * 0.22; cyl(M.brass, 0.022, 0.03, -2.62, DT + 0.03, z, 0, 0, 0.32, 10); box(M.black, -2.63, DT + 0.04, z - 0.006, -2.6, DT + 0.11, z + 0.006, 0, 0, 0.6); }
  const lampR = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), L.lampRed); lampR.position.set(-2.33, DT + 0.16, 0.25); root.add(lampR);
  const lampG = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), L.lampGreen); lampG.position.set(-2.33, DT + 0.16, -0.25); root.add(lampG);
  // whistle cord from the roof
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 5), L.cord); root.add(cord);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.01, 6, 12), M.wood); root.add(handle);
  // firebox door in the board (the fire behind it glows while there is fuel) and the cab toolbox
  L.fire = std(0x1a0804, 0, 0.6, { emissive: 0xff6a1a, emissiveIntensity: 1.2 });
  // firebox door, hinged on its left: closed, the fire shows through the draught slots; it swings open when she's fired
  L.mouth = std(0x1a0804, 0, 0.6, { emissive: 0xffa040, emissiveIntensity: 2.5 });
  box(L.mouth, -2.73, F + 0.34, -0.1, -2.722, F + 0.76, 0.34);
  box(M.iron, -2.735, F + 0.3, -0.14, -2.72, F + 0.34, 0.38); box(M.iron, -2.735, F + 0.76, -0.14, -2.72, F + 0.8, 0.38);
  const fireDoor = new THREE.Group(); fireDoor.position.set(-2.748, F + 0.55, -0.12); root.add(fireDoor);
  const leaf = (mat, x0, y0, z0, x1, y1, z1) => { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.castShadow = true; fireDoor.add(m); };
  leaf(M.iron, -0.012, -0.23, 0, 0.012, 0.23, 0.48);
  leaf(L.fire, -0.016, -0.13, 0.08, -0.012, -0.08, 0.4); leaf(L.fire, -0.016, -0.03, 0.08, -0.012, 0.02, 0.4);
  leaf(M.brass, -0.05, 0.07, 0.34, -0.012, 0.11, 0.44);
  box(M.wood, -3.97, F, 1.06, -3.53, F + 0.28, 1.36); box(M.iron, -3.98, F + 0.26, 1.05, -3.52, F + 0.3, 1.37);
  box(M.brass, -3.79, F + 0.3, 1.18, -3.71, F + 0.34, 1.24);
  // backhead plumbing: a copper steam manifold over the gauges feeding the injector valves, the lubricator with its
  // sight glasses, and the cylinder-cock and sanding levers beside the throttle
  L.coal = std(0x141210, 0.15, 0.38, { flatShading: true });
  L.cabLamp = std(0xfff1c8, 0, 0.2, { emissive: 0xffb860, emissiveIntensity: 0 });
  cyl(M.copper, 0.022, 1.5, PX - 0.06, 3.13, 0.15, Math.PI / 2, 0, 0, 10);
  for (const z of [-0.5, 0.8]) {
    put(M.brass, new THREE.TorusGeometry(0.06, 0.012, 6, 14), PX - 0.15, 3.13, z, 0, Math.PI / 2, 0);
    for (let k = 0; k < 3; k++) box(M.brass, PX - 0.155, 3.125, z - 0.06, PX - 0.145, 3.135, z + 0.06, k * Math.PI / 3, 0, 0);
    cyl(M.brass, 0.012, 0.1, PX - 0.1, 3.13, z, 0, 0, Math.PI / 2, 8);
    cyl(M.brass, 0.04, 0.07, PX - 0.06, 3.13, z, 0, 0, 0, 10);
  }
  cyl(M.copper, 0.018, 0.2, PX - 0.06, 3.03, 0.9, 0, 0, 0, 8);
  box(M.brass, PX - 0.13, 2.4, -0.91, PX - 0.05, 2.62, -0.8);
  for (let k = 0; k < 3; k++) box(M.steel, PX - 0.14, 2.44 + k * 0.06, -0.88, PX - 0.128, 2.48 + k * 0.06, -0.83);
  // a dashed oil can and a water bucket on the floor, the coal shovel leaning on the board, coal spilt by the fire door
  put(M.brass, new THREE.ConeGeometry(0.07, 0.18, 10), -2.92, F + 0.09, -1.25);
  cyl(M.brass, 0.008, 0.2, -2.86, F + 0.16, -1.25, 0, 0, -0.9, 6);
  cyl(M.iron, 0.14, 0.28, -3.75, F + 0.14, -1.15, 0, 0, 0, 14);
  put(M.iron, new THREE.TorusGeometry(0.13, 0.008, 4, 14, Math.PI), -3.75, F + 0.28, -1.15, 0, 0, 0);
  box(M.iron, -2.95, F + 0.02, 0.52, -2.81, F + 0.04, 0.68, 0, 0, 0.9);
  cyl(M.wood, 0.018, 0.95, -2.84, F + 0.5, 0.6, 0, 0, -0.12, 8);
  for (let i = 0; i < 14; i++) { const g = new THREE.DodecahedronGeometry(0.03 + (i % 4) * 0.012, 0); put(L.coal, g, -2.92 - (i * 37 % 10) * 0.02, F + 0.02, -0.1 + (i * 53 % 11) * 0.04, i, i * 2, 0); }
  // the fire-door latch, and an oil lantern hung from the roof
  box(M.brass, -2.78, F + 0.52, -0.17, -2.74, F + 0.58, -0.1);
  cyl(M.iron, 0.006, 0.32, -3.6, 3.7, 0, 0, 0, 0, 5);
  cyl(M.brass, 0.07, 0.03, -3.6, 3.53, 0, 0, 0, 0, 12); cyl(L.cabLamp, 0.055, 0.16, -3.6, 3.43, 0, 0, 0, 0, 12); cyl(M.brass, 0.075, 0.025, -3.6, 3.34, 0, 0, 0, 0, 12);
  // small brass dash lamp
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), std(0xfff1c8, 0, 0.2, { emissive: 0xffb860, emissiveIntensity: 0 }));
  lamp.position.set(-2.33, 3.02, -0.75); root.add(lamp); cyl(M.brass, 0.05, 0.05, -2.33, 2.96, -0.75);

  for (const [mat, list] of bins) {
    let n = 0; for (const g of list) n += g.attributes.position.count;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2); let o = 0;
    for (const g of list) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); U.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; g.dispose(); }
    const UV = mat === L.floor ? U : boxUV(P, N, 0.5);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = mat !== L.floor; mesh.receiveShadow = true; root.add(mesh);
  }

  let pressure = 150, t0 = 0;
  return {
    update(tr, night) {
      t0 += 1 / 60;
      const mph = Math.min(60, tr.mph());
      needles.speed.pivot.rotation.x = -2.36 + 4.72 * mph / 60;
      pressure += ((tr.power ? 150 + 25 * Math.sin(t0 * 0.3) - Math.abs(tr.throttle) * 30 : 15) - pressure) * (tr.power ? 0.02 : 0.004);
      // the safety valves blow the pressure down while they're lifted
      if (tr.safetyOpen) pressure -= 0.12;
      tr.pressure = pressure;
      needles.chest.pivot.rotation.x = -2.36 + 4.72 * Math.min(1, Math.abs(tr.chest || 0) * pressure / 200) + Math.sin(t0 * 31) * 0.006;
      cockL.rotation.z = tr.cocks ? -0.45 : 0.3;
      L.cabLamp.emissiveIntensity = 0.15 + night * 2.6;
      // the firebox door: open while she's being fired, the fire white-hot behind it
      const dT = tr.doorT || 0, open = dT > 0 ? Math.min(1, (2.4 - dT) * 4, dT * 2) : 0;
      fireDoor.rotation.y = -1.35 * open;
      L.mouth.emissiveIntensity = tr.power ? (2.2 + open * 2) * (0.85 + 0.15 * Math.sin(t0 * 13) * Math.sin(t0 * 7.1)) : 0.05;
      L.fire.emissiveIntensity = tr.power ? 1.0 + 0.4 * Math.sin(t0 * 9) * Math.sin(t0 * 5.3) : 0.02;
      needles.steam.pivot.rotation.x = -2.36 + 4.72 * pressure / 200 + Math.sin(t0 * 23) * 0.01;
      needles.brake.pivot.rotation.x = -2.36 + 4.72 * (0.7 - 0.55 * (tr.brakeK ?? (tr.brake ? 1 : 0)));
      throttle.rotation.x = 0; throttle.rotation.z = 0.55 - tr.throttle * 0.9;
      reverser.rotation.z = tr.throttle >= 0 ? -0.35 : 0.35;
      brakeH.rotation.y = tr.brake ? 1.1 : 0;
      const lvl = 0.25 + 0.08 * Math.sin(t0 * 0.7);
      water.scale.y = lvl; water.position.y = 2.47 + lvl / 2;
      L.lampRed.emissiveIntensity = tr.brake ? 2.5 : 0.05;
      L.lampGreen.emissiveIntensity = !tr.brake && Math.abs(tr.v) > 0.1 ? 2.5 : 0.05;
      lamp.material.emissiveIntensity = 0.3 + night * 3;
      for (const k in needles) needles[k].face.material.emissiveIntensity = 0.05 + night * 0.6;
      tr.whistleT = Math.max(0, (tr.whistleT || 0) - 1 / 60);
      const pull = tr.whistleT > 0 ? 0.12 : 0, top = 3.78, bot = 2.55 - pull;
      cord.scale.y = top - bot; cord.position.set(-2.75, (top + bot) / 2, -0.3);
      handle.position.set(-2.75, bot - 0.04, -0.3);
    },
  };
}
