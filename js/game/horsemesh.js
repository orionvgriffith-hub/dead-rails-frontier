// Horse bodies: coats (which double as breeds), the jointed model with its tack, and the gaits it moves in.
// Used for wild and tamed horses, the merchants' wagon teams, and other riders' mounts.
import * as THREE from 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/three.module.js';

// speed: gallop (m/s); stam: stamina use (lower lasts longer); hp; need: trust it takes to tame; w: how common
export const COATS = {
  bay: { name: 'bay', c: 0x6a3a1e, mane: 0x18120e, w: 5, speed: 15, stam: 1, hp: 110, need: 5 },
  chestnut: { name: 'chestnut', c: 0x8e4a22, mane: 0x6a3018, w: 4, speed: 15.5, stam: 1.05, hp: 105, need: 5 },
  black: { name: 'black', c: 0x1c1816, mane: 0x0c0a08, w: 1.5, speed: 16.5, stam: 0.95, hp: 115, need: 7 },
  grey: { name: 'dapple grey', c: 0x9a9894, mane: 0x5a5856, w: 2.5, speed: 15, stam: 0.85, hp: 120, need: 6 },
  palomino: { name: 'palomino', c: 0xc89a4a, mane: 0xf0e6cc, w: 2, speed: 15.5, stam: 0.95, hp: 105, need: 6 },
  buckskin: { name: 'buckskin', c: 0xb88a52, mane: 0x18120e, w: 3, speed: 15, stam: 0.9, hp: 115, need: 5 },
  dun: { name: 'grullo dun', c: 0x7a6a58, mane: 0x2a2018, w: 2.5, speed: 14.5, stam: 0.8, hp: 125, need: 5 },
  pinto: { name: 'pinto', c: 0x5a3018, mane: 0x18120e, w: 1.5, speed: 15.5, stam: 0.9, hp: 110, need: 7, pinto: true },
  appaloosa: { name: 'appaloosa', c: 0xd8d0c4, mane: 0x3a2a20, w: 1, speed: 16, stam: 0.85, hp: 115, need: 8, spots: true },
};
export function randomCoat(rnd = Math.random) {
  let s = 0; for (const k in COATS) s += COATS[k].w;
  let r = rnd() * s; for (const k in COATS) { r -= COATS[k].w; if (r <= 0) return k; } return 'bay';
}

const matCache = new Map();
const mat = (c, r = 0.85) => { const k = c + ':' + r; if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: r })); return matCache.get(k); };
const BOX = new THREE.BoxGeometry(1, 1, 1), SPH = new THREE.SphereGeometry(0.5, 12, 9), CONE = new THREE.ConeGeometry(0.5, 1, 6), CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
function part(p, geo, m, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx, ry, rz); o.castShadow = true; p.add(o); return o;
}
const BODY_Y = 1.13;

// h: { coat, blaze, socks (1 front, 2 hind, 3 all), saddle, bags }. The horse faces +z; its hooves stand on y = 0
export function horseMesh(h = {}) {
  const C = COATS[h.coat] || COATS.bay, coat = mat(C.c), mane = mat(C.mane, 0.95), dark = mat(0x1a1410, 0.9), white = mat(0xf0ece4, 0.8), hoofM = mat(0x2a2420, 0.7);
  const g = new THREE.Group(), body = new THREE.Group(); body.position.y = BODY_Y; g.add(body);
  // barrel, chest and quarters, and the coat's markings
  part(body, BOX, coat, 0, 0, 0, 0.56, 0.6, 1.2);
  part(body, SPH, coat, 0, 0.02, 0.55, 0.6, 0.66, 0.6);
  part(body, SPH, coat, 0, 0.04, -0.58, 0.62, 0.66, 0.66);
  if (C.pinto) { part(body, BOX, white, 0, -0.06, 0.1, 0.575, 0.4, 0.5); part(body, SPH, white, 0.02, -0.08, -0.62, 0.63, 0.46, 0.5); }
  if (C.spots) for (let i = 0; i < 16; i++) part(body, SPH, dark, (i % 2 ? 1 : -1) * 0.305, -0.12 + ((i * 37) % 7) * 0.05, -0.32 - ((i * 53) % 9) * 0.06, 0.03, 0.06, 0.06);
  // neck, mane, head with its bridle; the face is tilted down
  const neck = new THREE.Group(); neck.position.set(0, 0.2, 0.62); body.add(neck);
  part(neck, BOX, coat, 0, 0.32, 0.12, 0.26, 0.72, 0.36, -0.55);
  part(neck, BOX, mane, 0, 0.4, -0.04, 0.08, 0.68, 0.1, -0.55);
  const head = new THREE.Group(); head.position.set(0, 0.66, 0.36); neck.add(head);
  const face = new THREE.Group(); face.position.set(0, 0.02, 0.16); face.rotation.x = 0.55; head.add(face);
  part(face, BOX, coat, 0, 0, 0, 0.24, 0.26, 0.48);
  part(face, BOX, coat, 0, -0.04, 0.27, 0.2, 0.2, 0.16);
  if (h.blaze) part(face, BOX, white, 0, 0.131, 0.06, 0.07, 0.01, 0.4);
  part(face, BOX, dark, 0, 0, 0.16, 0.25, 0.27, 0.03);
  for (const s of [-1, 1]) { part(face, BOX, dark, s * 0.122, 0.05, -0.08, 0.01, 0.04, 0.05); part(head, CONE, coat, s * 0.07, 0.2, 0.0, 0.06, 0.15, 0.05, -0.2); }
  part(head, BOX, mane, 0, 0.15, 0.06, 0.1, 0.1, 0.08);
  // tail
  const tail = new THREE.Group(); tail.position.set(0, 0.22, -0.9); body.add(tail);
  part(tail, BOX, mane, 0, -0.3, -0.06, 0.12, 0.7, 0.14, 0.25);
  // legs: upper leg on a hip or shoulder pivot, lower leg on a knee or hock pivot
  const legs = [];
  for (const [x, z, front] of [[-0.17, 0.5, 1], [0.17, 0.5, 1], [-0.17, -0.55, 0], [0.17, -0.55, 0]]) {
    const L = new THREE.Group(); L.position.set(x, -0.12, z); body.add(L);
    part(L, BOX, coat, 0, -0.24, 0, front ? 0.15 : 0.17, 0.52, front ? 0.18 : 0.24);
    const K = new THREE.Group(); K.position.y = -0.5; L.add(K);
    const sock = h.socks && (front ? h.socks & 1 : h.socks & 2);
    part(K, BOX, sock ? white : coat, 0, -0.22, 0, 0.1, 0.46, 0.11);
    part(K, BOX, hoofM, 0, -0.47, 0.015, 0.12, 0.08, 0.14);
    legs.push({ L, K, front });
  }
  // tack: blanket, saddle with horn and stirrups; saddlebags behind
  const leather = mat(0x5a3018, 0.6), tack = new THREE.Group(), bags = new THREE.Group(); body.add(tack, bags);
  part(tack, BOX, mat(0x7a2a20), 0, 0.29, 0.05, 0.6, 0.04, 0.62);
  part(tack, BOX, leather, 0, 0.34, 0.05, 0.4, 0.1, 0.5);
  part(tack, BOX, leather, 0, 0.42, 0.28, 0.3, 0.12, 0.06); part(tack, CYL, mat(0x3a2010), 0, 0.5, 0.3, 0.04, 0.12, 0.04);
  part(tack, BOX, leather, 0, 0.42, -0.2, 0.36, 0.14, 0.06);
  for (const s of [-1, 1]) { part(tack, BOX, leather, s * 0.3, 0.05, 0.05, 0.02, 0.5, 0.2); part(tack, BOX, dark, s * 0.32, -0.22, 0.05, 0.04, 0.06, 0.14); part(bags, BOX, mat(0x7a4a28), s * 0.34, 0.08, -0.45, 0.1, 0.3, 0.32); part(bags, BOX, leather, s * 0.35, 0.2, -0.45, 0.1, 0.06, 0.33); }
  g.userData = { body, neck, head, tail, legs, tack, bags };
  dressHorse(g, h);
  return g;
}
export function dressHorse(g, h) { const u = g.userData; u.tack.visible = !!h.saddle; u.bags.visible = !!h.bags; }

// leg timing per gait, legs in the order LF, RF, LH, RH; amp is the swing
const GAITS = {
  walk: { off: [0.25, 0.75, 0, 0.5], amp: 0.32 },
  trot: { off: [0, 0.5, 0.5, 0], amp: 0.5 },
  gallop: { off: [0.5, 0.62, 0, 0.12], amp: 0.85 },
};
const TAU = Math.PI * 2;
// s: { gait: stand|graze|walk|trot|gallop|rear|jump|down|swim, ph, t, speed }. Moves ph along with the speed
export function animateHorse(g, s, dt) {
  const u = g.userData, G = GAITS[s.gait === 'swim' ? 'walk' : s.gait];
  s.t = (s.t || 0) + dt;
  if (G) s.ph = (s.ph || 0) + dt * (0.45 + Math.abs(s.speed || 0) * 0.12);
  const ease = Math.min(1, dt * 8), lerp = (a, b) => a + (b - a) * ease;
  let bodyY = BODY_Y, pitch = 0, neckX = 0.12;
  if (G) {
    u.legs.forEach((l, i) => {
      const a = TAU * (s.ph + G.off[i]), sw = Math.sin(a) * G.amp, lift = Math.max(0, Math.cos(a)) * G.amp;
      l.L.rotation.x = -sw; l.K.rotation.x = l.front ? lift * 1.4 : -lift * 0.9;
    });
    const beat = Math.sin(TAU * s.ph * 2);
    if (s.gait === 'gallop') { pitch = Math.sin(TAU * s.ph) * 0.07; bodyY += Math.abs(Math.sin(TAU * s.ph)) * 0.08; neckX = -0.12 + Math.sin(TAU * s.ph) * 0.12; }
    else if (s.gait === 'trot') { bodyY += Math.abs(beat) * 0.04; neckX = 0.05; }
    else { neckX = 0.15 + beat * 0.04; }
    if (s.gait === 'swim') bodyY -= 0.1;
  } else {
    let pose = [0, 0, 0, 0], knees = [0, 0, 0, 0];
    if (s.gait === 'graze') neckX = 1.05 + Math.sin(s.t * 1.3) * 0.05;
    if (s.gait === 'rear') { pitch = -0.75; bodyY += 0.45; pose = [-0.9 + Math.sin(s.t * 9) * 0.4, -0.7 - Math.sin(s.t * 9) * 0.4, 0.6, 0.6]; knees = [1.4, 1.4, -0.3, -0.3]; neckX = -0.4; }
    if (s.gait === 'jump') { pitch = -0.15; pose = [-0.9, -0.9, 0.9, 0.9]; knees = [1.6, 1.6, -1.2, -1.2]; neckX = -0.1; }
    if (s.gait === 'down') { bodyY = 0.42; pose = [-1.4, -1.4, 1.5, 1.5]; knees = [2.6, 2.6, -2.6, -2.6]; neckX = 0.5; }
    u.legs.forEach((l, i) => { l.L.rotation.x = lerp(l.L.rotation.x, pose[i]); l.K.rotation.x = lerp(l.K.rotation.x, knees[i]); });
  }
  u.body.position.y = lerp(u.body.position.y, bodyY); u.body.rotation.x = lerp(u.body.rotation.x, pitch);
  u.neck.rotation.x = lerp(u.neck.rotation.x, neckX);
  u.tail.rotation.x = lerp(u.tail.rotation.x, s.gait === 'gallop' ? -0.7 : 0);
  u.tail.rotation.z = Math.sin(s.t * 1.7) * 0.15;
  u.head.rotation.y = s.look ? lerp(u.head.rotation.y, s.look) : lerp(u.head.rotation.y, 0);
}

// a two-wheeled buckboard hitched behind; faces +z, shafts reach forward to the horse
export function cartMesh() {
  const g = new THREE.Group(), wood = mat(0x8a6a46), dark = mat(0x4a3020), iron = mat(0x2a2826, 0.5);
  part(g, BOX, wood, 0, 0.78, 0, 1.4, 0.08, 1.9);
  for (const s of [-1, 1]) { part(g, BOX, wood, s * 0.68, 0.98, 0, 0.06, 0.34, 1.9); part(g, BOX, dark, s * 0.45, 0.82, 1.9, 0.06, 0.06, 2.2, 0.12); }
  part(g, BOX, wood, 0, 0.98, -0.93, 1.4, 0.34, 0.06); part(g, BOX, wood, 0, 0.98, 0.93, 1.4, 0.34, 0.06);
  part(g, BOX, dark, 0, 1.1, 0.75, 1.3, 0.08, 0.35);
  const wheels = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(s * 0.82, 0.55, -0.1); g.add(w);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.04, 6, 18), iron); rim.rotation.y = Math.PI / 2; rim.castShadow = true; w.add(rim);
    for (let k = 0; k < 4; k++) part(w, BOX, dark, 0, 0, 0, 0.04, 1.02, 0.05, k * Math.PI / 4);
    wheels.push(w);
  }
  part(g, BOX, iron, 0, 0.55, -0.1, 1.7, 0.06, 0.06);
  g.userData.wheels = wheels;
  return g;
}
