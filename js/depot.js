// Cinder Flats Station: a standard intermediate stop on the straight run between Bitter Springs and Coyote Bend.
// Station frame: a runs along the track, b across it (b > 0 is the platform side). Every building is walk-in.
import * as THREE from 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/three.module.js';
import { townToWorld, rail, gridSample, roadW, heightAt } from './world.js';
import { building } from './buildings.js';
import { T, Y0, wallRun, sign, table, chair, shelf, counter, cabinet, chest, safe, locker, stove, bars, prop, toWorld } from './parts.js';
import { addProp } from './props.js';
import { TEX, signMaterial } from './textures.js';
import { registerReadable, registerSpot } from './game/registry.js';

const PI = Math.PI;
const PY = 0.74; // platform deck height above the yard
const T4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

export function buildDepot(B, t, rnd, { LAMP_SPOTS, ANIMATED, scene }) {
  const ry0 = Math.atan2(t.nx, t.nz);
  const at = (a, b, y = 0, ry = 0, collide = true) => { const [x, z] = townToWorld(t, a, b); B.begin(x, t.h + y, z, ry0 + ry, collide); };
  const world = (a, b, y = 0) => { const [x, z] = townToWorld(t, a, b); return new THREE.Vector3(x, t.h + y, z); };
  const P = (type, a, b, y = 0, ry = 0, s = 1, o) => { const [x, z] = townToWorld(t, a, b); addProp(type, x, y === 0 ? heightAt(x, z) : t.h + y, z, ry0 + ry, s, o); };
  // ground-level piece that follows the real terrain once it leaves the levelled yard
  const atG = (a, b, ry = 0, collide = true) => { const [x, z] = townToWorld(t, a, b); B.begin(x, heightAt(x, z), z, ry0 + ry, collide); };
  const lamp = (a, b, y, light = true) => { P('lantern', a, b, y); if (light) { const w = world(a, b, y - 0.1); LAMP_SPOTS.push([w.x, w.y, w.z]); } };
  const readable = (B2, x, y, z, title, body) => { const p = toWorld(B2, x, y, z); registerReadable({ x: p.x, y: p.y, z: p.z, title, body }); };
  const spot = (kind, a, b, y, extra) => { const p = world(a, b, y); registerSpot(kind, p.x, p.y, p.z, Object.assign({ station: t.name }, extra)); };
  B.custom = B.custom || {};
  B.custom.coal = new THREE.MeshStandardMaterial({ color: 0x2a2622, map: TEX.gravel, bumpMap: TEX.gravel, bumpScale: 4, roughness: 0.78, metalness: 0.1, vertexColors: true });
  B.custom.rust = new THREE.MeshStandardMaterial({ color: 0x8a4a2a, map: TEX.metal, metalness: 0.45, roughness: 0.8, vertexColors: true });
  B.custom.redPaint = new THREE.MeshStandardMaterial({ color: 0x8e2a1c, map: TEX.metal, metalness: 0.3, roughness: 0.7, vertexColors: true });
  B.custom.rut = new THREE.MeshStandardMaterial({ color: 0x8a6a4c, map: TEX.sand, roughness: 1, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2 });
  B.custom.mapBoard = new THREE.MeshStandardMaterial({ map: railMapTexture(), roughness: 0.9 });
  B.custom.clockFace = new THREE.MeshStandardMaterial({ map: clockTexture(), roughness: 0.6 });

  // ---------------- platform ----------------
  const A0 = -34, A1 = 34, BE = 2.45, BR = 9.2, BC = (BE + BR) / 2, BW = BR - BE;
  for (let a = A0; a < A1; a += 4) {
    at(a + 2, 0);
    B.box('stone', 0, 0.3, BC, 4.02, 0.6, BW);
    B.box('floor', 0, PY - 0.07, BC, 4.02, 0.14, BW + 0.04);
    B.box('woodDark', 0, 0.36, BE + 0.04, 4.02, 0.72, 0.1, { col: false });
    B.box('woodDark', 0, PY + 0.015, BE + 0.12, 4.02, 0.05, 0.24, { col: false });
    B.box('woodWhite', 0, PY + 0.004, BE + 0.62, 3.96, 0.008, 0.14, { col: false }); // keep-back line
    for (let k = -1.5; k <= 1.5; k += 1.5) B.box('woodDark', k, 0.32, BE + 0.13, 0.18, 0.64, 0.12, { col: false }); // edge posts
  }
  // car-stop marks painted on the boards, for lining the loco cab and the cargo car up with the doors
  for (const a of [6, -16]) {
    at(a, 0);
    B.box('woodWhite', 0, PY + 0.006, BE + 0.95, 0.12, 0.008, 0.9, { col: false });
    B.box('woodWhite', 0, PY + 0.006, BE + 1.45, 0.6, 0.008, 0.12, { col: false });
  }
  // end steps
  for (const s of [-1, 1]) {
    at(s * A1, 0);
    B.box('floor', s * 0.2, 0.245, BC, 0.4, 0.49, BW);
    B.box('floor', s * 0.6, 0.125, BC, 0.4, 0.25, BW);
  }
  // steps up from the yard wherever the back edge is open
  for (const [a0, a1] of [[A0, -24], [-12, -5], [13, A1]]) {
    at((a0 + a1) / 2, 0);
    B.box('floor', 0, 0.245, BR + 0.2, a1 - a0, 0.49, 0.4);
    B.box('floor', 0, 0.125, BR + 0.6, a1 - a0, 0.25, 0.4);
  }

  // ---------------- covered platform in front of the station ----------------
  at(4, 0);
  const CA = 20.6;
  B.box('tin', 0, PY + 3.32, 6.8, CA, 0.06, 5.0, { rx: -0.104, col: false });
  B.box('woodDark', 0, PY + 3.0, 4.75, CA, 0.24, 0.16, { col: false });
  B.box('woodDark', 0, PY + 3.02, 4.42, CA + 0.1, 0.3, 0.05, { col: false }); // fascia
  for (const a of [-9.5, -5, -0.5, 4, 8.5]) {
    B.box('woodDark', a, PY + 1.5, 4.9, 0.18, 3.0, 0.18);
    B.box('woodDark', a, 0.3, 4.9, 0.3, 0.6, 0.3, { col: false });
    for (const s of [-1, 1]) B.box('woodDark', a + s * 0.38, PY + 2.7, 4.9, 0.08, 0.95, 0.08, { rz: s * 0.75, col: false });
    B.box('woodDark', a, PY + 3.18, 7.0, 0.1, 0.16, 4.6, { rx: -0.104, col: false }); // rafter
    lamp(a + 4, 5.25, PY + 2.45, a === -0.5 || a === 8.5);
  }
  sign(B, 'CINDER FLATS  ·  ELEV. 2840 FT', 0, PY + 3.0, 4.38, 7.5, 0.34, PI, { bg: '#2c3a2a', fg: '#efe2c4' });

  // station name boards on posts at each end of the platform
  for (const a of [-30, 28]) {
    at(a, 0);
    for (const x of [-1.7, 1.7]) B.box('woodDark', x, PY + 1.3, 8.6, 0.14, 2.6, 0.14);
    sign(B, 'CINDER FLATS', 0, PY + 2.35, 8.52, 3.2, 0.62, PI, { bg: '#e9dcc0', fg: '#2a1c12' });
  }

  // ---------------- waiting shelter ----------------
  {
    const a0 = -24, a1 = -12, bw = 9.05;
    at(0, 0);
    wallRun(B, 'woodGreen', 'x', bw, a0, a1, PY, PY + 2.7, [{ a0: -21.6, a1: -20.4, b0: PY + 1.0, b1: PY + 2.0, kind: 'win' }, { a0: -15.6, a1: -14.4, b0: PY + 1.0, b1: PY + 2.0, kind: 'win' }], 1, rnd);
    for (const a of [a0, a1]) wallRun(B, 'woodGreen', 'z', a, 6.9, bw - T / 2, PY, PY + 2.7, [], a === a0 ? -1 : 1, rnd);
    for (const a of [a0 + 0.1, (a0 + a1) / 2, a1 - 0.1]) B.box('woodDark', a, PY + 1.3, 5.5, 0.16, 2.6, 0.16);
    B.box('tin', (a0 + a1) / 2, PY + 2.85, 7.2, a1 - a0 + 0.8, 0.06, 4.4, { rx: -0.1, col: false });
    B.box('woodDark', (a0 + a1) / 2, PY + 2.6, 5.5, a1 - a0 + 0.4, 0.2, 0.14, { col: false });
    sign(B, 'WAITING', (a0 + a1) / 2, PY + 2.38, 5.43, 2.2, 0.36, PI, { bg: '#3b2a1c', fg: '#e9dcc0' });
    B.box('woodDark', -18, PY + 1.55, bw - 0.12, 1.1, 0.8, 0.04, { col: false });
    B.box('paper', -18, PY + 1.55, bw - 0.15, 0.95, 0.66, 0.01, { col: false });
    readable(B, -18, PY + 1.55, bw - 0.4, 'Timetable · Cinder Flats', TIMETABLE);
    lamp(-18, 7.2, PY + 2.2);
  }
  for (const [a, b] of [[-22.2, 8.4], [-19.4, 8.4], [-16.6, 8.4], [-13.8, 8.4], [-30, 7.6], [-1, 8.2], [10, 8.2], [20, 7.8], [25, 7.8]]) { at(a, b, PY, PI); bench(B, 1.9); }

  // luggage, crates and barrels along the platform
  at(16, 0);
  for (const [x, z, w, h, d, m, r] of [[0, 7.9, 0.9, 0.55, 0.55, 'woodDark', 0.1], [0.05, 7.9, 0.75, 0.42, 0.48, 'cloth', 0.15], [1.2, 8.1, 0.65, 0.4, 0.3, 'cloth', -0.3], [-0.9, 8.2, 0.5, 0.36, 0.5, 'woodRed', 0.4]]) {
    const y = PY + (m === 'cloth' && x === 0.05 ? 0.55 : 0) + h / 2;
    B.box(m, x, y, z, w, h, d, { ry: r, col: false });
    B.box('iron', x, y, z, w + 0.01, 0.04, d + 0.01, { ry: r, col: false });
  }
  B.addCollider(-1.3, PY, 7.5, 1.6, PY + 1.0, 8.5);
  at(0, 0); baggageCart(B, 18.5, 6.6, 0.3);
  for (const [type, a, b, r] of [['crate', 22, 8.4, 0.2], ['crate', 22.8, 8.5, 0.9], ['barrel', 23.6, 8.3, 0], ['barrel', 31, 8.4, 1], ['crate', -26, 8.4, 0.5], ['sack', -27, 8.3, 1], ['sack', -27.5, 8.6, 2]]) P(type, a, b, PY, r);
  for (const [a, txt] of [[-8, 'TO TRAINS'], [13.5, 'NO SPITTING ON THE PLATFORM']]) { at(a, 0); B.box('woodDark', 0, PY + 1.05, 8.9, 0.12, 2.1, 0.12); sign(B, txt, 0, PY + 2.0, 8.83, 1.9, 0.3, PI, { bg: '#e2d4b4', fg: '#2a1c12', size: 120 }); }

  // ---------------- station building ----------------
  {
    at(4, 13.2, 0.34, PI);
    const st = building(B, { type: 'station', w: 18, d: 8, damage: 0, paint: 'woodOchre', roofMat: 'shingle', ov: 0.6 }, rnd);
    const { ix0, ix1, iz0, iz1, hx, hz } = st, y = Y0, px = ix1 - 3.6;
    B.box('stone', 0, -0.17, 0, 18.1, 0.34, 8.1);
    B.box('floor', hx - 1.6, -0.09, -hz - 0.18, 1.6, 0.5, 0.36); B.box('floor', hx - 1.6, -0.215, -hz - 0.54, 1.6, 0.25, 0.36);
    sign(B, 'CINDER FLATS', 0, 3.4, hz + 0.1, 5.6, 0.56, 0, { bg: '#2c3a2a', fg: '#efe2c4' });
    sign(B, 'TICKETS', hx - 1.6, 2.95, -hz - 0.1, 1.6, 0.32, PI, { bg: '#3b2a1c', fg: '#e9dcc0', size: 120 });
    B.dark = { hx, hz, top: st.top + 0.05 };
    // waiting room
    for (const tx of [-4.6, -1.2]) {
      table(B, tx, y, -0.8, 1.1, 0.8);
      chair(B, tx, y, -1.5, 0); chair(B, tx, y, -0.1, PI, rnd() < 0.15); chair(B, tx - 0.85, y, -0.8, PI / 2);
    }
    cabinet(B, ix0 + 0.3, y, 1.1, PI / 2);
    // clock, notice board and railroad map on the back wall
    // (the back wall has windows at x ≈ -6.6, -2.8, 0.9 and 4.7, so these sit in the gaps)
    const CX = -0.95, NB = -4.75, MX = 2.85;
    B.geom('clockFace', new THREE.CircleGeometry(0.32, 32), T4(CX, y + 2.3, iz0 + 0.04));
    B.geom('woodDark', new THREE.TorusGeometry(0.33, 0.035, 6, 32), T4(CX, y + 2.3, iz0 + 0.05));
    B.box('woodDark', CX, y + 1.75, iz0 + 0.06, 0.26, 0.7, 0.1, { col: false });
    B.box('metal', CX, y + 1.55, iz0 + 0.12, 0.1, 0.1, 0.02, { col: false });
    B.box('woodDark', NB, y + 1.65, iz0 + 0.03, 1.4, 1.0, 0.04, { col: false });
    for (const [x, yy, r, w] of [[-0.4, 0.2, 0.06, 0.34], [0.05, 0.1, -0.04, 0.3], [0.45, 0.25, 0.1, 0.28], [-0.25, -0.23, -0.08, 0.36], [0.3, -0.25, 0.03, 0.4]])
      B.box('paper', NB + x, y + 1.65 + yy, iz0 + 0.06, w, w * 1.3, 0.005, { rz: r, col: false });
    readable(B, NB, y + 1.65, iz0 + 0.4, 'Notice board', NOTICES);
    B.geom('mapBoard', new THREE.PlaneGeometry(1.7, 1.15), T4(MX, y + 1.75, iz0 + 0.05));
    B.box('woodDark', MX, y + 1.75, iz0 + 0.03, 1.84, 1.29, 0.03, { col: false });
    readable(B, MX, y + 1.75, iz0 + 0.4, 'Railroad map', MAPNOTE);
    for (const x of [-6.5, -0.2]) { B.box('lamp', x, y + 2.25, iz1 - 0.12, 0.14, 0.22, 0.14, { col: false }); B.box('iron', x, y + 2.05, iz1 - 0.1, 0.2, 0.04, 0.18, { col: false }); }
    { const w = toWorld(B, -3.4, y + 2.6, 0); LAMP_SPOTS.push([w.x, w.y, w.z]); }
    // ticket office
    cabinet(B, ix1 - 0.3, y, -1.4, -PI / 2);
    B.box('iron', ix1 - 1.1, y + 0.82, iz0 + 0.9, 0.22, 0.06, 0.12, { col: false }); B.box('metal', ix1 - 1.5, y + 0.85, iz0 + 0.85, 0.3, 0.12, 0.2, { col: false });
    B.dark = null;
    const agent = toWorld(B, px + 1.4, y, 0.9); registerSpot('stationAgent', agent.x, agent.y, agent.z, { station: t.name, note: 'Ticket window, behind the counter' });
    const win = toWorld(B, px - 0.6, y, 0.9); registerSpot('ticketWindow', win.x, win.y, win.z, { station: t.name });
  }
  for (const a of [-1.5, 9.5]) lamp(a, 9.0, PY + 2.45, false);

  buildYard(B, t, rnd, { at, atG, world, P, lamp, readable, spot, LAMP_SPOTS, ANIMATED, scene, ry0 });
}

// a slatted platform bench, front at +z
function bench(B, w) {
  B.box('woodDark', 0, 0.45, 0, w, 0.05, 0.44);
  for (let k = 0; k < 3; k++) B.box('woodDark', 0, 0.62 + k * 0.14, -0.21, w, 0.09, 0.03, { rx: -0.12, col: false });
  for (const s of [-1, 1]) {
    B.box('iron', s * (w / 2 - 0.12), 0.22, 0, 0.05, 0.44, 0.4, { col: false });
    B.box('iron', s * (w / 2 - 0.12), 0.68, -0.18, 0.05, 0.5, 0.05, { col: false });
    B.box('iron', s * (w / 2 - 0.12), 0.62, 0.05, 0.05, 0.04, 0.42, { col: false });
  }
}
// two-wheeled baggage cart standing on the platform
function baggageCart(B, a, b, r) {
  B.box('woodDark', a, PY + 0.55, b, 2.2, 0.08, 1.0, { ry: r });
  for (const s of [-1, 1]) {
    const [ox, oz] = [Math.sin(r) * s * 0.55, Math.cos(r) * s * 0.55];
    B.geom('iron', new THREE.TorusGeometry(0.32, 0.04, 6, 18), T4(a + ox * 1.0, PY + 0.33, b + oz * 1.0, 0, r, 0));
  }
  B.box('woodDark', a + Math.cos(r) * 1.35, PY + 0.75, b - Math.sin(r) * 1.35, 0.6, 0.05, 0.06, { ry: r, rz: 0.5, col: false });
  B.box('woodRed', a - 0.4 * Math.cos(r), PY + 0.82, b + 0.4 * Math.sin(r), 0.7, 0.45, 0.5, { ry: r + 0.1, col: false });
}

// station paperwork shown when a notice is read
const TIMETABLE = `WESTBOUND · for Bitter Springs, Dry Gulch, Mile 3
  No. 3 Mail ............ 6:40 am
  No. 7 Mixed ........... 1:15 pm
  No. 11 Freight ....... 9:50 pm  (flag stop)

EASTBOUND · for Coyote Bend, Dead Man's Pass
  No. 4 Mail ............ 8:05 am
  No. 8 Mixed ........... 3:30 pm

All trains take water here. Coal by arrangement with the agent.
No service has run since the spring. — Agent, C.F.`;
const NOTICES = `WANTED: men for section work. Apply at the freight office.
LOST: one grey mare, branded C-bar. Reward.
NOTICE: Do not draw water from the tower without the agent present.
COAL: 3 dollars the ton, paid in advance.
Last train south was attacked past Dead Man's Pass. Travel in company.
— pinned on top, in a hurried hand: "Agent gone to Coyote Bend for help. Back by Sunday."`;
const MAPNOTE = `The Territory Line, hand-coloured survey of 1886.
West to east: Mile 3 Water Stop · Dry Gulch · Bitter Springs · CINDER FLATS · Coyote Bend · Dead Man's Pass · Section House No. 9.
Cinder Flats is marked in red ink: "water · coal · supplies".`;

function railMapTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 340; const g = c.getContext('2d');
  g.fillStyle = '#e4d3ac'; g.fillRect(0, 0, 512, 340);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(120,80,40,${Math.random() * 0.06})`; g.fillRect(Math.random() * 512, Math.random() * 340, Math.random() * 30, 2); }
  g.strokeStyle = '#3a2414'; g.lineWidth = 6; g.strokeRect(8, 8, 496, 324);
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let k = 0; k <= rail.N; k += 8) { x0 = Math.min(x0, rail.x[k]); x1 = Math.max(x1, rail.x[k]); z0 = Math.min(z0, rail.z[k]); z1 = Math.max(z1, rail.z[k]); }
  const sx = 440 / (x1 - x0), px = x => 36 + (x - x0) * sx, pz = z => 170 + (z - (z0 + z1) / 2) * sx;
  g.strokeStyle = '#2a1a10'; g.lineWidth = 3; g.beginPath();
  for (let k = 0; k <= rail.N; k += 4) { const X = px(rail.x[k]), Z = pz(rail.z[k]); k ? g.lineTo(X, Z) : g.moveTo(X, Z); } g.stroke();
  g.setLineDash([2, 5]); g.lineWidth = 7; g.stroke(); g.setLineDash([]);
  g.fillStyle = '#a2401f'; g.beginPath(); g.arc(px(230), pz(85), 7, 0, 7); g.fill();
  g.font = 'bold 26px Georgia, serif'; g.fillStyle = '#2a1a10'; g.textAlign = 'center'; g.fillText('THE TERRITORY LINE', 256, 46);
  g.font = 'italic 17px Georgia, serif'; g.fillStyle = '#7a2614'; g.fillText('Cinder Flats', px(230), pz(85) + 28);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function clockTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#efe6d0'; g.beginPath(); g.arc(128, 128, 126, 0, 7); g.fill();
  g.fillStyle = '#2a1a10'; g.font = 'bold 30px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const R = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; g.fillText(R[i], 128 + Math.sin(a) * 96, 128 - Math.cos(a) * 96); }
  // stopped at twenty past four
  g.lineCap = 'round'; g.strokeStyle = '#1a120c';
  g.lineWidth = 9; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(4.33 / 12 * PI * 2) * 56, 128 - Math.cos(4.33 / 12 * PI * 2) * 56); g.stroke();
  g.lineWidth = 5; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(20 / 60 * PI * 2) * 86, 128 - Math.cos(20 / 60 * PI * 2) * 86); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------------- the rest of the yard ----------------
function buildYard(B, t, rnd, H) {
  const { at, atG, world, P, lamp, readable, spot, LAMP_SPOTS, ANIMATED, scene, ry0 } = H;
  const S0 = t.k * rail.ds; // track position of the station centre

  // ---- supply store (south row, west) ----
  {
    at(-18, 30, 0, PI);
    const c = building(B, { type: 'store', w: 9, d: 11, damage: 0, paint: 'woodRed', sign: 'SUPPLY STORE', roofMat: 'tin', noFurnish: true }, rnd);
    const { ix0, ix1, iz0, iz1, top } = c, y = Y0;
    B.dark = { hx: c.hx, hz: c.hz, top: top + 0.05 };
    counter(B, -0.6, y, iz0 + 2.3, 5.4, 0.6, false);
    B.box('woodDark', -2.6, y + 1.14, iz0 + 2.3, 0.5, 0.14, 0.35, { col: false }); // cash drawer
    B.box('metal', -2.0, y + 1.17, iz0 + 2.25, 0.36, 0.2, 0.2, { col: false });     // scale
    shelf(B, -2.6, y, iz0 + 0.22, 2.0, 2.3, 0, rnd); shelf(B, -0.4, y, iz0 + 0.22, 2.0, 2.3, 0, rnd);
    shelf(B, ix0 + 0.22, y, -1.0, 2.0, 2.0, PI / 2, rnd); shelf(B, ix0 + 0.22, y, 1.15, 2.0, 2.0, PI / 2, rnd);
    // empty display shelving and tables, kept clear for the shop's stock
    shelf(B, ix1 - 0.22, y, -0.9, 2.0, 1.6, -PI / 2, rnd, false); shelf(B, ix1 - 0.22, y, 1.3, 2.0, 1.6, -PI / 2, rnd, false);
    table(B, -1.25, y, 1.6, 1.3, 0.8); table(B, 1.45, y, 1.6, 1.3, 0.8);
    for (const [x, z] of [[-1.25, 1.6], [1.45, 1.6]]) { const p = toWorld(B, x, y + 0.78, z); registerSpot('shopDisplay', p.x, p.y, p.z, { station: t.name, kind2: 'table', w: 1.3, d: 0.8 }); }
    for (const z of [-0.9, 1.3]) for (const r of [0.55, 1.05, 1.5]) { const p = toWorld(B, ix1 - 0.22, y + r, z); registerSpot('shopDisplay', p.x, p.y, p.z, { station: t.name, kind2: 'shelf', w: 2.0, d: 0.4 }); }
    cabinet(B, ix1 - 0.3, y, -3.4, -PI / 2);
    chest(B, ix0 + 0.7, y, iz0 + 1.6, PI / 2);
    prop(B, 'barrel', ix0 + 0.6, y, iz1 - 0.7, rnd() * 6); prop(B, 'barrel', ix0 + 1.35, y, iz1 - 0.6, rnd() * 6);
    prop(B, 'crate', ix1 - 0.7, y, iz1 - 0.8, 0.3); prop(B, 'sack', ix1 - 1.5, y, iz1 - 0.6, 1);
    sign(B, 'DRY GOODS · TINNED FOOD · CARTRIDGES', -1.4, y + 2.95, iz0 + 0.04, 4.0, 0.42, 0, { bg: '#e2d4b4', fg: '#3a2414', size: 110 });
    for (const [x, z] of [[-0.8, 0.2], [1.4, -2.2]]) { B.box('iron', x, top - 0.25, z, 0.03, 0.5, 0.03, { col: false }); B.box('lamp', x, top - 0.6, z, 0.16, 0.26, 0.16, { col: false }); }
    { const p = toWorld(B, -0.8, top - 0.7, 0.2); LAMP_SPOTS.push([p.x, p.y, p.z]); }
    B.dark = null;
    const k = toWorld(B, -0.6, y, iz0 + 1.25); registerSpot('shopkeeper', k.x, k.y, k.z, { station: t.name, note: 'Behind the supply store counter' });
    const ct = toWorld(B, -0.6, y + 1.07, iz0 + 2.3); registerSpot('trade', ct.x, ct.y, ct.z, { station: t.name, shop: 'supply' });
  }
  // swinging shingle over the store porch
  {
    const g = new THREE.Group(), w = world(-15.2, 22.0, 2.9);
    g.position.copy(w); g.rotation.y = ry0 + PI;
    const hinge = new THREE.Group(); g.add(hinge);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), signMaterial('SUPPLIES', { bg: '#3b2a1c', fg: '#e9dcc0' }));
    board.material.side = THREE.DoubleSide; board.position.y = -0.42; board.castShadow = true;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0x2e2a28, metalness: 0.7, roughness: 0.5 }));
    hinge.add(board); g.add(bar); scene.add(g);
    for (const s of [-0.45, 0.45]) { const ch = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.17, 0.01), bar.material); ch.position.set(s, -0.09, 0); hinge.add(ch); }
    ANIMATED.push((time, dt, wind) => { hinge.rotation.x = Math.sin(time * 1.7) * 0.12 * (0.4 + wind) + Math.sin(time * 4.1) * 0.03 * wind; });
  }

  // ---- freight & telegraph office (south row, east) ----
  {
    at(16, 28.5, 0, PI);
    const c = building(B, { type: 'shop', w: 7, d: 7.5, damage: 0, paint: 'woodBlue', sign: 'FREIGHT & TELEGRAPH', roofMat: 'shingle', noFurnish: true }, rnd);
    const { ix0, ix1, iz0, iz1, top } = c, y = Y0;
    B.dark = { hx: c.hx, hz: c.hz, top: top + 0.05 };
    counter(B, -0.87, y, 0.4, 4.94, 0.6, false);
    bars(B, -3.3, 1.5, 0.4, y + 1.07, 0.9, [-1.25, -0.35]);
    B.box('paper', -0.8, y + 1.08, 0.62, 0.3, 0.01, 0.22, { col: false });
    readable(B, -0.8, y + 1.2, 1.0, 'Freight & telegraph rates', RATES);
    safe(B, ix0 + 0.6, y, iz0 + 0.5, 0);
    table(B, 0.4, y, -2.3, 1.4, 0.7); chair(B, 0.4, y, -1.6, PI);
    B.box('iron', 0.15, y + 0.8, -2.35, 0.2, 0.05, 0.12, { col: false }); B.box('metal', 0.6, y + 0.84, -2.4, 0.26, 0.12, 0.16, { col: false }); // telegraph key and sounder
    B.box('paper', -0.1, y + 0.785, -2.2, 0.3, 0.01, 0.22, { ry: 0.2, col: false });
    cabinet(B, ix1 - 0.3, y, -2.2, -PI / 2);
    B.box('black', 0.6, y + 1.75, iz0 + 0.03, 1.0, 0.7, 0.02, { col: false }); B.box('woodDark', 0.6, y + 1.75, iz0 + 0.02, 1.1, 0.8, 0.02, { col: false });
    B.box('iron', 2.2, y + 0.08, 2.4, 1.0, 0.16, 0.8); B.box('iron', 2.6, y + 0.7, 2.75, 0.08, 1.2, 0.08, { col: false }); B.box('iron', 2.35, y + 1.25, 2.75, 0.7, 0.05, 0.05, { col: false }); // freight scale
    prop(B, 'crate', -2.6, y, 2.6, 0.2); prop(B, 'crate', -1.8, y, 2.95, 1.1);
    chair(B, ix0 + 0.4, y, 1.6, PI / 2);
    B.box('lamp', -0.5, top - 0.55, 1.0, 0.16, 0.26, 0.16, { col: false }); B.box('iron', -0.5, top - 0.22, 1.0, 0.03, 0.44, 0.03, { col: false });
    B.dark = null;
    const a = toWorld(B, -0.8, y, -0.4); registerSpot('freightAgent', a.x, a.y, a.z, { station: t.name, note: 'Behind the ticket grille' });
    const tr = toWorld(B, -0.8, y + 1.07, 0.4); registerSpot('trade', tr.x, tr.y, tr.z, { station: t.name, shop: 'freight' });
  }

  // ---- fuel area at the east end, clear of the line ----
  {
    // elevated coal stage with chutes over the track
    at(45, 0);
    for (const a of [-4.8, -1.6, 1.6, 4.8]) for (const b of [4.4, 7.2]) { B.box('woodDark', a, 1.5, b, 0.26, 3.0, 0.26); }
    for (const b of [4.4, 7.2]) for (const s of [-1, 1]) B.box('woodDark', s * 3.2, 1.6, b, 0.1, 3.4, 0.1, { rz: s * 0.85, col: false });
    B.box('woodDark', 0, 3.1, 5.8, 10.2, 0.22, 3.2, { col: false });
    for (const [b, h] of [[4.25, 1.4], [7.35, 1.6]]) B.box('woodGrey', 0, 3.2 + h / 2, b, 10.2, h, 0.12, { col: false });
    for (const a of [-5.05, 5.05]) B.box('woodGrey', a, 3.95, 5.8, 0.12, 1.5, 3.2, { col: false });
    B.box('coal', 0, 3.85, 5.8, 9.8, 1.1, 2.9, { col: false });
    for (let i = 0; i < 26; i++) B.box('coal', (rnd() - 0.5) * 9.4, 4.4 + rnd() * 0.2, 4.6 + rnd() * 2.4, 0.3 + rnd() * 0.4, 0.2 + rnd() * 0.2, 0.3 + rnd() * 0.4, { rx: rnd(), ry: rnd() * 3, col: false });
    for (const a of [-2.5, 2.5]) {
      B.box('iron', a, 3.75, 3.2, 1.0, 0.05, 2.3, { rx: -0.42, col: false });
      for (const s of [-0.5, 0.5]) B.box('iron', a + s, 3.85, 3.2, 0.05, 0.25, 2.3, { rx: -0.42, col: false });
      B.box('iron', a, 4.3, 2.2, 0.04, 1.1, 0.04, { col: false }); // counterweight chain
    }
    sign(B, 'COAL', 0, 5.2, 4.18, 1.6, 0.4, PI, { bg: '#2a2622', fg: '#e9dcc0' });
    B.addCollider(-5.2, 3.0, 4.2, 5.2, 5.0, 7.4);
    // ladder up the end of the stage
    for (const s of [-0.25, 0.25]) B.box('woodDark', 5.3, 2.2, 6.4 + s, 0.06, 4.4, 0.06, { col: false });
    for (let y = 0.3; y < 4.2; y += 0.32) B.box('woodDark', 5.3, y, 6.4, 0.05, 0.05, 0.55, { col: false });
    // coal heap on the ground
    B.geom('coal', lumpy(new THREE.ConeGeometry(2.8, 1.6, 14, 3), rnd), T4(8.5, 0.75, 12.5));
    B.addCollider(6.3, 0, 10.4, 10.7, 1.1, 14.6);
    P('shovel', 52.5, 8.0, 0, 0.8); P('shovel', 57.4, 11.7, 0, 2.2);
    P('crate', 49.0, 9.9, 0, 0.3); P('crate', 49.7, 9.2, 0, 1.0);
  }
  spot('refuelCoal', 45, 0, 0.3, { s: S0 + 45, note: 'Stop the tender under the coal chutes' });
  {
    // oil drums on a pallet and loose barrels
    at(57.5, 7.5);
    B.box('woodDark', 0, 0.07, 0, 2.6, 0.14, 1.8);
    for (const [x, z] of [[-0.9, -0.5], [-0.3, -0.5], [0.3, -0.5], [0.9, -0.5], [-0.6, 0.15], [0, 0.15], [0.6, 0.15], [-0.9, 0.7], [0.9, 0.7]])
      B.geom('redPaint', new THREE.CylinderGeometry(0.29, 0.29, 0.88, 14), T4(x, 0.58, z));
    B.geom('redPaint', new THREE.CylinderGeometry(0.29, 0.29, 0.88, 14), T4(0.2, 0.5, 1.4, PI / 2, 0.4, 0));
    B.addCollider(-1.3, 0, -0.9, 1.3, 1.05, 1.0);
    sign(B, 'LAMP OIL · NO SMOKING', 0, 1.6, -0.95, 2.4, 0.34, PI, { bg: '#e2d4b4', fg: '#7a2614', size: 110 });
    B.box('woodDark', -1.0, 0.8, -0.95, 0.08, 1.6, 0.08); B.box('woodDark', 1.0, 0.8, -0.95, 0.08, 1.6, 0.08);
  }
  for (const [a, b, r] of [[54, 6.0, 0], [54.8, 6.4, 1], [61.5, 9.5, 2]]) P('barrel', a, b, 0, r);
  {
    // pair of riveted water cisterns on timber cradles
    at(43, 14);
    for (const z of [-1.3, 1.3]) {
      B.geom('rust', new THREE.CylinderGeometry(0.95, 0.95, 4.2, 20), T4(0, 1.45, z, 0, 0, PI / 2));
      for (const x of [-1.6, 0, 1.6]) B.geom('iron', new THREE.TorusGeometry(0.97, 0.035, 5, 24), T4(x, 1.45, z, 0, PI / 2, 0));
      for (const x of [-1.4, 1.4]) B.box('woodDark', x, 0.3, z, 0.4, 0.6, 1.6, { col: false });
      B.geom('iron', new THREE.CylinderGeometry(0.08, 0.08, 1.0, 8), T4(2.3, 1.2, z, 0, 0, PI / 2));
      B.geom('iron', new THREE.TorusGeometry(0.16, 0.025, 5, 12), T4(2.82, 1.2, z, 0, PI / 2, 0));
    }
    B.addCollider(-2.2, 0, -2.3, 2.2, 2.4, 2.3);
  }
  {
    // supply shelving under a lean-to, old tools, firewood and a grindstone
    at(51.5, 17.5);
    for (const x of [-2.8, 2.8]) for (const z of [-1.4, 0.4]) B.box('woodDark', x, 1.25, z, 0.14, z < 0 ? 2.5 : 2.2, 0.14);
    B.box('tin', 0, 2.45, -0.5, 6.2, 0.06, 2.4, { rx: 0.12, col: false });
    B.box('woodGrey', 0, 1.1, 0.45, 5.8, 2.2, 0.08);
    shelf(B, -1.4, 0, 0.18, 2.4, 1.9, PI, rnd); shelf(B, 1.4, 0, 0.18, 2.4, 1.9, PI, rnd);
    B.box('iron', -2.2, 0.28, -1.2, 0.5, 0.18, 0.25, { col: false }); B.box('iron', -2.2, 0.15, -1.2, 0.18, 0.3, 0.18); // anvil
    B.geom('stone', new THREE.CylinderGeometry(0.42, 0.42, 0.12, 18), T4(2.1, 0.75, -1.1, 0, 0, PI / 2));
    for (const s of [-0.12, 0.12]) B.box('woodDark', 2.1 + s, 0.4, -1.1, 0.06, 0.8, 0.06, { col: false });
    B.addCollider(1.7, 0, -1.4, 2.5, 0.9, -0.8);
  }
  P('pickaxe', 49.0, 16.0, 0, 1.2); wheelbarrow(B, at, 47.2, 16.8, 0.6);
  {
    at(61, 5.2);
    for (let r = 0; r < 3; r++) for (let i = 0; i < 9 - r; i++)
      B.geom('woodDark', new THREE.CylinderGeometry(0.11, 0.12, 1.2, 8), T4(-1.0 + i * 0.25 + r * 0.125, 0.12 + r * 0.21, 0, PI / 2, 0, 0));
    B.addCollider(-1.15, 0, -0.6, 1.15, 0.7, 0.6);
  }
  {
    at(62, 15.5, 0, PI);
    building(B, { type: 'shed', w: 4.6, d: 4, damage: 1, paint: 'woodGrey', roofMat: 'tin' }, rnd);
    sign(B, 'COAL & OIL', 0, 2.55, 2.06, 2.0, 0.34, 0, { bg: '#3b2a1c', fg: '#e9dcc0', size: 120 });
  }
  lamp(45, 3.9, 2.7); lamp(57.5, 6.4, 2.0, false);
  for (let a = 36; a <= 66; a += 2.7) P(rnd() < 0.2 ? 'fenceBroken' : 'fence', a, 20.6, 0);

  // ---- railway water tower (north side, landmark) ----
  waterTowerBig(B, at, 20, -12.5, rnd);
  spot('refuelWater', 20, 0, 0.3, { s: S0 + 20, note: 'Stop the tender under the water spout' });

  // ---- storage shed for railway supplies (north side) ----
  {
    at(-8, -18.5, 0, 0);
    const c = building(B, { type: 'warehouse', w: 11, d: 8, wallH: 3.4, damage: 0, paint: 'woodRed', roofMat: 'tin', noFurnish: true }, rnd);
    const { ix0, ix1, iz0, iz1, top } = c, y = Y0;
    sign(B, 'C.F. SECTION STORES', 0, top - 0.4, c.hz + 0.06, 4.2, 0.45, 0, { bg: '#e2d4b4', fg: '#3a2414', size: 110 });
    B.dark = { hx: c.hx, hz: c.hz, top: top + 0.05 };
    workbench(B, -3.0, y, iz0 + 0.45, 2.6, rnd); workbench(B, 0.5, y, iz0 + 0.45, 2.2, rnd);
    B.box('woodGrey', -1.25, y + 1.9, iz0 + 0.03, 6.2, 1.0, 0.03, { col: false }); // tool board
    for (let i = 0; i < 9; i++) { const x = -4.1 + i * 0.7; B.box(i % 3 ? 'iron' : 'woodDark', x, y + 1.85, iz0 + 0.07, 0.05, 0.5 + (i % 2) * 0.2, 0.04, { rz: (i % 2 ? 0.2 : -0.1), col: false }); B.box('iron', x + 0.05, y + 2.15, iz0 + 0.07, 0.16, 0.05, 0.05, { col: false }); }
    shelf(B, ix0 + 0.22, y, -2.0, 2.4, 2.4, PI / 2, rnd); shelf(B, ix0 + 0.22, y, 1.8, 2.4, 2.4, PI / 2, rnd);
    cabinet(B, ix1 - 0.3, y, -2.4, -PI / 2); cabinet(B, ix1 - 0.3, y, 2.2, -PI / 2);
    // spare rails, a wheelset, couplers, spikes and gearing
    for (let i = 0; i < 4; i++) B.box('rail', 2.2, y + 0.18 + (i % 2) * 0.13, -0.6 + i * 0.16, 3.0, 0.14, 0.08, { col: false });
    for (const x of [1.0, 3.4]) B.box('woodDark', x, y + 0.06, -0.35, 0.22, 0.12, 1.0, { col: false });
    B.addCollider(0.6, y, -0.9, 3.8, y + 0.45, 0.2);
    for (const z of [1.1, 2.6]) { B.geom('iron', new THREE.CylinderGeometry(0.46, 0.46, 0.1, 20), T4(2.6, y + 0.46, z, PI / 2, 0, 0)); B.geom('rust', new THREE.TorusGeometry(0.46, 0.05, 6, 20), T4(2.6, y + 0.46, z)); }
    B.geom('iron', new THREE.CylinderGeometry(0.06, 0.06, 1.7, 8), T4(2.6, y + 0.46, 1.85, PI / 2, 0, 0));
    B.addCollider(2.1, y, 1.0, 3.1, y + 0.95, 2.7);
    for (let i = 0; i < 5; i++) B.box('iron', -0.6 + i * 0.18, y + 0.06 + (i % 2) * 0.05, 1.2, 0.12, 0.08, 0.5, { ry: i * 0.4, col: false });
    B.geom('iron', new THREE.CylinderGeometry(0.35, 0.35, 0.08, 16), T4(0.8, y + 0.82, iz0 + 0.5, 0, 0, 0));
    for (let k = 0; k < 12; k++) { const a = k / 12 * PI * 2; B.box('iron', 0.8 + Math.cos(a) * 0.38, y + 0.82, iz0 + 0.5 + Math.sin(a) * 0.38, 0.08, 0.08, 0.06, { ry: -a, col: false }); }
    prop(B, 'sleepers', -3.6, y, 0.5, 0); prop(B, 'crate', -4.4, y, 3.0, 0.2); prop(B, 'crate', -3.6, y, 3.2, 0.9); prop(B, 'barrel', 4.6, y, 3.2, 1); prop(B, 'barrel', 4.0, y, 3.3, 2);
    chest(B, 2.8, y, iz0 + 0.5, 0);
    B.box('iron', 0, top - 0.25, 0, 0.03, 0.5, 0.03, { col: false }); B.box('lamp', 0, top - 0.6, 0, 0.16, 0.26, 0.16, { col: false });
    { const p = toWorld(B, 0, top - 0.7, 0); LAMP_SPOTS.push([p.x, p.y, p.z]); }
    B.dark = null;
    const wb = toWorld(B, -1.25, y, iz0 + 1.3); registerSpot('repairBench', wb.x, wb.y, wb.z, { station: t.name, note: 'Section stores workbench' });
  }
  spot('repairTrack', -40, 0, 0.3, { s: S0 - 40, note: 'Repair stand at the west end of the platform' });
  {
    // section crew's repair stand beside the line at the west end
    at(-40, -4.2);
    for (const x of [-1.2, 1.2]) B.box('woodDark', x, 1.0, 0, 0.14, 2.0, 0.14);
    B.box('woodDark', 0, 1.95, 0, 2.6, 0.12, 0.14, { col: false });
    for (let i = 0; i < 6; i++) B.box(i % 2 ? 'iron' : 'woodDark', -0.9 + i * 0.36, 1.5, 0.08, 0.05, 0.8, 0.04, { rz: (i % 2 ? 0.15 : -0.1), col: false });
    sign(B, 'SECTION No. 4 · REPAIRS', 0, 2.3, 0.02, 2.4, 0.32, 0, { bg: '#e2d4b4', fg: '#3a2414', size: 110 });
  }
  P('railStack', -44, -6.8, 0, 0); P('sleepers', -36, -6.6, 0, 0);
  handcar(B, at, -20, -11.5, 0.15);

  // ---- small house with its yard (north side) ----
  {
    at(-36, -27, 0, 0);
    building(B, { type: 'house', w: 7, d: 7, damage: 1, paint: 'woodWhite', roofMat: 'shingle' }, rnd);
    for (let a = -42; a <= -30; a += 2.7) P(a === -36.6 ? 'fenceBroken' : 'fence', a, -19.6, 0);
    for (const b of [-21.5, -24.2, -26.9, -29.6, -32.3]) { P('fence', -42.6, b, PI / 2); P(b === -26.9 ? 'fenceBroken' : 'fence', -29.4, b, PI / 2); }
    at(-31.2, -31.5, 0, 0); // outhouse
    B.box('woodGrey', 0, 1.1, -0.6, 1.3, 2.2, 0.08); for (const x of [-0.62, 0.62]) B.box('woodGrey', x, 1.1, 0, 0.08, 2.2, 1.3);
    B.box('woodGrey', -0.4, 1.1, 0.62, 0.5, 2.2, 0.08); B.box('woodGrey', 0.45, 1.1, 0.95, 0.5, 2.1, 0.05, { ry: -1.0, col: false });
    B.box('tin', 0, 2.3, 0, 1.6, 0.05, 1.6, { rx: 0.12, col: false }); B.box('woodDark', 0, 0.25, -0.3, 1.2, 0.5, 0.6);
    at(-37, -34, 0, 0); // clothesline behind the house
    for (const x of [-2, 2]) B.box('woodDark', x, 1.0, 0, 0.1, 2.0, 0.1);
    B.box('iron', 0, 1.9, 0, 4, 0.015, 0.015, { col: false });
    for (const [x, c] of [[-1.2, 'cloth'], [-0.2, 'paper'], [0.9, 'cloth']]) B.box(c, x, 1.55, 0, 0.7, 0.7, 0.02, { rz: 0.05, col: false });
    P('deadTree', -46, -30, 0, 1.2, 1.1); P('trough', -31.0, -20.6, 0, 0); P('barrel', -30.6, -22.6, 0, 1);
  }

  // ---- forecourt, entrance and the desert around ----
  {
    for (const [a, b] of [[-7, 38], [9, 38]]) { at(a, b); B.box('woodDark', -1.2, 0.5, 0, 0.12, 1.0, 0.12); B.box('woodDark', 1.2, 0.5, 0, 0.12, 1.0, 0.12); B.box('woodDark', 0, 0.95, 0, 2.6, 0.09, 0.09, { col: false }); }
    P('trough', 1, 37.6, 0, 0); P('wagon', -2, 44, 0, 0.3); P('cart', 24, 40, 0, 2.6); P('signpost', 12, 45, 0, 0.6);
    // entrance arch where the yard road leaves the crossing road
    at(-27, 51, 0, -1.249);
    for (const x of [-4.2, 4.2]) B.box('woodDark', x, 2.4, 0, 0.3, 4.8, 0.3);
    B.box('woodDark', 0, 4.6, 0, 9.0, 0.24, 0.22, { col: false });
    sign(B, 'CINDER FLATS STATION', 0, 4.05, 0.13, 5.6, 0.62, 0, { bg: '#3b2a1c', fg: '#e9dcc0' });
    sign(B, 'CINDER FLATS STATION', 0, 4.05, -0.13, 5.6, 0.62, PI, { bg: '#3b2a1c', fg: '#e9dcc0' });
    P('skull', -27.2, 51.2, 4.75, 0.3);
    // wagon ruts across the yard
    at(0, 0, 0, 0, false);
    for (const [a0, b0, a1, b1] of [[-6, 42, -14, 22], [6, 42, 14, 25], [-48, 58, -6, 44], [-70, -25, -8, -14], [-70, -23, -40, -21]])
      for (const off of [-0.8, 0.8]) {
        const L = Math.hypot(a1 - a0, b1 - b0), ang = Math.atan2(b1 - b0, a1 - a0), nx = -Math.sin(ang) * off, nz = Math.cos(ang) * off;
        B.box('rut', (a0 + a1) / 2 + nx, 0.012, (b0 + b1) / 2 + nz, L, 0.02, 0.32, { ry: -ang, col: false });
      }
    // railway signs approaching the yard
    for (const s of [-1, 1]) {
      atG(s * 75, -3.8);
      B.box('woodDark', 0, 1.2, 0, 0.12, 2.4, 0.12);
      sign(B, 'YARD LIMIT · 10 MPH', 0, 2.2, s * 0.08, 1.8, 0.32, s > 0 ? 0 : PI, { bg: '#e2d4b4', fg: '#3a2414', size: 110 });
      atG(s * 130, -3.6);
      B.box('woodWhite', 0, 1.0, 0, 0.18, 2.0, 0.18); sign(B, 'W', 0, 1.7, s * 0.1, 0.5, 0.5, s > 0 ? 0 : PI, { bg: '#e8e0cc', fg: '#1a120c' });
    }
    // brush, rocks and dead trees, kept off the buildings, the line and the roads
    const keepOut = [[-36, 36, -4.5, 21], [-24, -12, 21, 37], [11, 21, 21, 33], [-25, 24, 33, 47], [36, 67, 3, 21], [13, 27, -20, -5], [-15, -1, -24, -12], [-44, -28, -34, -19], [-46, -34, -8, -2]];
    for (let i = 0; i < 190; i++) {
      const a = (rnd() - 0.5) * 180, b = -54 + rnd() * 128;
      if (Math.abs(b) < 5.5 || keepOut.some(([a0, a1, b0, b1]) => a > a0 - 1.5 && a < a1 + 1.5 && b > b0 - 1.5 && b < b1 + 1.5)) continue;
      const [x, z] = townToWorld(t, a, b); if (gridSample(roadW, x, z) > 0.15) continue;
      const r = rnd(), type = r < 0.32 ? 'bush' : r < 0.55 ? 'grass' : r < 0.7 ? 'rock' : r < 0.8 ? 'rockFlat' : r < 0.86 ? 'deadTree' : r < 0.93 ? 'pear' : r < 0.97 ? 'saguaro' : 'bones';
      P(type, a, b, 0, rnd() * 6.28, 0.6 + rnd() * 0.7);
    }
    P('wagon', 34, 52, 0, 1.9, 1, { tilt: 0.12 }); P('wheel', 36.5, 50.5, 0, 0.4); P('minecart', -58, 30, 0, 0.7, 1, { tilt: 0.25 });
    P('boulder', -70, 48, 0, 1, 1.4); P('boulder', 72, -40, 0, 2, 1.8); P('deadTree', 30, -44, 0, 2, 1.3);
  }
  // weather vane on the station ridge
  {
    const m = new THREE.MeshStandardMaterial({ color: 0x2e2a28, metalness: 0.7, roughness: 0.5 });
    const g = new THREE.Group(); g.position.copy(world(4, 13.2, 0.34 + 4.0 + 4 * Math.tan(0.36) + 0.12));
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 6), m); rod.position.y = 0.6; g.add(rod);
    const vane = new THREE.Group(); vane.position.y = 1.15; g.add(vane);
    const arrow = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, 0.03), m); vane.add(arrow);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.3), m); tail.position.x = -0.5; tail.rotation.x = PI / 4; vane.add(tail);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 6), m); head.position.x = 0.6; head.rotation.z = -PI / 2; vane.add(head);
    for (let k = 0; k < 4; k++) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.02), m); arm.position.y = 0.85; arm.rotation.y = k * PI / 2; arm.position.x = 0; g.add(arm); }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; }); scene.add(g);
    ANIMATED.push((time, dt, wind) => { vane.rotation.y = -0.4 + Math.sin(time * 0.6) * 0.25 * wind + Math.sin(time * 2.3) * 0.05; });
  }
  spot('meetingPoint', 4, 6.5, PY, { note: 'Under the platform canopy, by the station door' });
}

function lumpy(g, rnd) {
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 1 + (rnd() - 0.5) * 0.25; p.setXYZ(i, v.x * k, v.y * (0.9 + rnd() * 0.2), v.z * k); }
  g.computeVertexNormals(); return g;
}
function workbench(B, x, y, z, w, rnd) {
  B.box('woodDark', x, y + 0.86, z, w, 0.08, 0.7);
  for (const s of [-1, 1]) for (const d of [-0.28, 0.28]) B.box('woodDark', x + s * (w / 2 - 0.08), y + 0.42, z + d, 0.08, 0.84, 0.08, { col: false });
  B.box('woodDark', x, y + 0.2, z, w - 0.2, 0.04, 0.6, { col: false });
  B.addCollider(x - w / 2, y, z - 0.35, x + w / 2, y + 0.9, z + 0.35);
  B.box('iron', x - w / 2 + 0.25, y + 0.98, z + 0.28, 0.2, 0.16, 0.14, { col: false }); // vice
  for (let i = 0; i < 4; i++) B.box(rnd() < 0.5 ? 'iron' : 'woodDark', x - w / 4 + i * 0.35, y + 0.92, z - 0.05 + (rnd() - 0.5) * 0.3, 0.06, 0.04, 0.3, { ry: rnd() * 3, col: false });
}
function wheelbarrow(B, at, a, b, r) {
  at(a, b, 0, r);
  B.box('rust', 0, 0.5, 0, 0.7, 0.3, 0.9, { rx: 0.1, col: false });
  B.geom('iron', new THREE.TorusGeometry(0.2, 0.04, 6, 14), T4(0, 0.22, 0.62, 0, PI / 2, 0));
  for (const s of [-0.28, 0.28]) B.box('woodDark', s, 0.45, -0.55, 0.05, 0.05, 1.3, { rx: -0.25, col: false });
  B.addCollider(-0.4, 0, -0.9, 0.4, 0.65, 0.8);
}
function handcar(B, at, a, b, r) {
  at(a, b, 0, r);
  for (const x of [-0.9, 0.9]) for (const z of [-0.7, 0.7]) { B.box('woodDark', x, 0.12, z, 0.3, 0.24, 0.3, { col: false }); B.geom('iron', new THREE.TorusGeometry(0.3, 0.05, 6, 16), T4(x, 0.52, z)); }
  B.box('woodDark', 0, 0.86, 0, 2.4, 0.1, 1.5);
  B.box('iron', 0, 1.3, 0, 0.14, 0.9, 0.14, { col: false });
  B.box('iron', 0, 1.78, 0, 1.8, 0.07, 0.07, { rz: 0.25, col: false });
  for (const s of [-1, 1]) B.box('iron', s * 0.88, 1.78 + s * 0.22, 0, 0.06, 0.06, 1.2, { col: false });
}
function waterTowerBig(B, at, a, b, rnd) {
  at(a, b, 0, 0);
  const legH = 9.2, R = 3.4, L = 2.5;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    B.box('woodDark', sx * L, legH / 2, sz * L, 0.38, legH, 0.38, { rx: -sz * 0.03, rz: sx * 0.03, col: false });
    B.addCollider(sx * L - 0.24, 0, sz * L - 0.24, sx * L + 0.24, legH, sz * L + 0.24);
    B.box('stone', sx * L, 0.2, sz * L, 0.8, 0.4, 0.8, { col: false });
  }
  for (let y = 1.9; y < legH; y += 2.4) for (const s of [-1, 1]) {
    B.box('woodDark', 0, y, s * L, 2 * L, 0.16, 0.16, { col: false }); B.box('woodDark', s * L, y, 0, 0.16, 0.16, 2 * L, { col: false });
    B.box('woodGrey', 0, y + 1.2, s * L, 6.0, 0.13, 0.09, { rz: s * 0.42, col: false }); B.box('woodGrey', s * L, y + 1.2, 0, 0.09, 0.13, 6.0, { rx: s * 0.42, col: false });
  }
  B.box('woodDark', 0, legH + 0.12, 0, 7.6, 0.24, 7.6, { col: false });
  for (const s of [-1, 1]) { B.box('woodDark', 0, legH + 1.0, s * 3.8, 7.6, 0.06, 0.06, { col: false }); B.box('woodDark', s * 3.8, legH + 1.0, 0, 0.06, 0.06, 7.6, { col: false }); }
  for (let k = -3.6; k <= 3.6; k += 1.2) for (const s of [-1, 1]) { B.box('woodDark', k, legH + 0.6, s * 3.8, 0.05, 0.8, 0.05, { col: false }); B.box('woodDark', s * 3.8, legH + 0.6, k, 0.05, 0.8, 0.05, { col: false }); }
  // tank
  const g = new THREE.CylinderGeometry(R, R, 4.8, 32, 1, true), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 21, uv.getY(i) * 4.8);
  B.geom('woodGrey', g, T4(0, legH + 2.65, 0));
  B.geom('woodDark', new THREE.CircleGeometry(R, 32), T4(0, legH + 0.25, 0, -PI / 2));
  for (const y of [0.5, 1.5, 2.6, 3.7, 4.6]) B.geom('rust', new THREE.TorusGeometry(R + 0.04, 0.035, 4, 40), T4(0, legH + 0.25 + y, 0, PI / 2));
  const roof = new THREE.ConeGeometry(R + 0.45, 2.1, 32, 1, true), ru = roof.attributes.uv; for (let i = 0; i < ru.count; i++) ru.setXY(i, ru.getX(i) * 12, ru.getY(i) * 2);
  B.geom('shingle', roof, T4(0, legH + 6.1, 0));
  B.geom('iron', new THREE.SphereGeometry(0.16, 10, 8), T4(0, legH + 7.25, 0));
  // spout swung out over the track, with its chain
  B.geom('rust', new THREE.CylinderGeometry(0.24, 0.3, 7.8, 12), T4(0, legH + 0.0, 8.2, PI / 2 + 0.33, 0, 0));
  B.geom('rust', new THREE.CylinderGeometry(0.34, 0.24, 0.6, 12), T4(0, legH + 1.1, R + 0.4, PI / 2 + 0.33, 0, 0));
  B.box('iron', 0, legH + 1.7, 7.8, 0.03, 3.2, 0.03, { rx: 0.9, col: false });
  // outlet valve, downpipe and overflow
  B.geom('iron', new THREE.CylinderGeometry(0.16, 0.16, legH, 10), T4(0.6, legH / 2, 0.6));
  B.box('iron', 0.6, 0.45, 0.6, 0.5, 0.5, 0.5);
  B.geom('rust', new THREE.TorusGeometry(0.28, 0.035, 6, 18), T4(0.6, 1.0, 0.95));
  B.geom('iron', new THREE.CylinderGeometry(0.08, 0.08, 4.0, 8), T4(-R - 0.1, legH + 2.4, 0));
  // float gauge board on the track side
  B.box('woodWhite', 1.6, legH + 2.6, R + 0.05, 0.4, 4.2, 0.05, { col: false });
  for (let y = 0.8; y < 4.6; y += 0.6) B.box('woodDark', 1.6, legH + 0.5 + y, R + 0.09, 0.25, 0.04, 0.02, { col: false });
  B.box('woodRed', 1.6, legH + 3.6, R + 0.11, 0.42, 0.14, 0.03, { col: false });
  // ladder up the track-side leg to the catwalk
  for (const s of [-0.24, 0.24]) B.box('woodDark', L + 0.5 + s, (legH + 1) / 2, L + 0.42, 0.07, legH + 1, 0.07, { col: false });
  for (let y = 0.35; y < legH + 0.8; y += 0.33) B.box('woodDark', L + 0.5, y, L + 0.42, 0.55, 0.05, 0.05, { col: false });
  B.addCollider(L + 0.2, 0, L + 0.3, L + 0.8, legH, L + 0.55);
  sign(B, 'CINDER FLATS', 0, legH + 2.2, R + 0.08, 3.6, 0.6, 0, { bg: '#2a1c12', fg: '#e4d4b4' });
}

const RATES = `CINDER FLATS FREIGHT OFFICE
Package, under 10 lb ....... 25 cents
Package, per 10 lb more .... 10 cents
Crate, per hundredweight ... 1 dollar
Livestock ............... by arrangement

WESTERN UNION TELEGRAPH
Ten words, any office on the line ... 40 cents
Each word over ten .................. 3 cents

"Line down past Dead Man's Pass. Messages held." — chalked underneath`;
