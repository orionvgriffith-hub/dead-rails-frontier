// Detail for the Jupiter: worn paint, rusting iron and tarnished brass for the model, the plumbing a real engine carries,
// and the things that make it feel alive: steam from cocks, valves and brakes, sparks off the wheels, the headlamp beam,
// and firelight in the cab
import * as THREE from 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/three.module.js';
import { surface, rustIron, boards, vfbm, vfbm2, vnoise, P as SP } from './ptex.js';

const sat = x => x < 0 ? 0 : x > 1 ? 1 : x;
const sst = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

// ---------- surfaces ----------
// paint over iron. The hue comes from the material colour; the map carries the wear: chipped edges down to dark primer,
// rust running down from seams, dull patches and polish
function paint(seed, wear) {
  return (u, v) => {
    const big = vfbm(u, v, 3, 4, seed), mid = vfbm(u, v, 14, 3, seed + 2), fine = vnoise(u, v, 220, seed + 4);
    const run = vfbm2(u, v, 34, 3, 3, seed + 6);
    const chip = sst(0.44 - wear * 0.22, 0.48 - wear * 0.22, mid * 0.8 + big * 0.45 + fine * 0.07);
    const runs = sst(0.25, 0.6, run) * sst(-0.1, 0.4, big) * wear;
    let r = 0.9 + big * 0.06 + fine * 0.02, g = r, b = r;
    r = mix(r, 0.9, runs); g = mix(g, 0.6, runs); b = mix(b, 0.42, runs);
    r = mix(r, 0.34, chip); g = mix(g, 0.24, chip); b = mix(b, 0.18, chip);
    SP.h = 0.5 - chip * 0.08 + fine * 0.012 + runs * 0.01;
    SP.r = r; SP.g = g; SP.b = b; SP.ro = mix(0.4 + big * 0.1, 0.85, Math.max(chip, runs * 0.6)); SP.me = 0;
  };
}
// brass going brown where it isn't rubbed: bright on the high spots, dark tarnish in patches, metallic throughout
function brass(seed) {
  return (u, v) => {
    const big = vfbm(u, v, 4, 4, seed), fine = vnoise(u, v, 180, seed + 3);
    const tarn = sst(-0.15, 0.35, big + fine * 0.1), verd = sst(0.45, 0.6, big) * 0.4;
    SP.h = 0.5 + fine * 0.01; SP.r = mix(1, 0.55, tarn) * (1 - verd * 0.4); SP.g = mix(0.95, 0.5, tarn) + verd * 0.05; SP.b = mix(0.85, 0.42, tarn);
    SP.ro = mix(0.22, 0.55, tarn); SP.me = 1;
  };
}
const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
function maps(mat, s, metal = false) {
  mat.map = tex(s.color, true); mat.normalMap = tex(s.normal); mat.roughnessMap = tex(s.orm);
  mat.normalScale = new THREE.Vector2(0.8, 0.8); mat.roughness = 1;
  if (metal) { mat.metalnessMap = mat.roughnessMap; mat.metalness = 1; }
  mat.needsUpdate = true;
}
// give the locomotive's materials real surfaces. They are drawn once, while the engine loads
export function dressMaterials(M) {
  maps(M.boiler, surface(512, paint(21, 0.5), 5)); M.boiler.color.set(0x2a3a46); M.boiler.metalness = 0.25;
  maps(M.red, surface(512, paint(23, 0.7), 5)); M.red.color.set(0x9a2a1a); M.red.metalness = 0.15;
  maps(M.black, surface(256, paint(25, 0.6), 5)); M.black.color.set(0x2a2624); M.black.metalness = 0.1;
  maps(M.cab, surface(512, boards({ base: [0.95, 0.95, 0.95], peel: 1, seed: 27, boards: 7 }), 7)); M.cab.color.set(0x8a3020); M.cab.metalness = 0;
  maps(M.wood, surface(256, boards({ base: [0.95, 0.92, 0.88], seed: 29 }), 7)); M.wood.color.set(0x7a5034);
  maps(M.iron, surface(512, rustIron({ seed: 31, rust: 0.35 }), 6), true); M.iron.color.set(0x5a544e);
  maps(M.steel, surface(256, rustIron({ seed: 33, rust: 0.1 }), 3), true); M.steel.color.set(0xd2cec8);
  maps(M.brass, surface(256, brass(35), 2), true); M.brass.color.set(0xd8b060);
  M.copper = new THREE.MeshStandardMaterial({ color: 0xc07048, metalness: 1, roughness: 1 });
  maps(M.copper, surface(256, brass(37), 2), true);
}

// texture coordinates for models that have none: each triangle is projected onto the axis plane it faces most,
// at `k` repeats per metre, so painted and rusted surfaces sit on the model at a real scale
export function boxUV(pos, nrm, k = 0.5) {
  const n = pos.length / 3, uv = new Float32Array(n * 2);
  for (let t = 0; t < n; t += 3) {
    let nx = 0, ny = 0, nz = 0;
    for (let j = 0; j < 3; j++) { nx += Math.abs(nrm[(t + j) * 3]); ny += Math.abs(nrm[(t + j) * 3 + 1]); nz += Math.abs(nrm[(t + j) * 3 + 2]); }
    const ax = nx > ny && nx > nz ? 0 : ny > nz ? 1 : 2;
    for (let j = 0; j < 3; j++) {
      const i = t + j, x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      uv[i * 2] = (ax === 0 ? z : x) * k; uv[i * 2 + 1] = (ax === 1 ? z : y) * k;
    }
  }
  return uv;
}

// ---------- merged static detail ----------
export function merger() {
  const bins = new Map(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
  const put = (mat, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    geo.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s));
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!bins.has(mat)) bins.set(mat, []); bins.get(mat).push(g);
  };
  return {
    put,
    box: (mat, x0, y0, z0, x1, y1, z1, rx, ry, rz) => put(mat, new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, rx, ry, rz),
    cyl: (mat, r, h, x, y, z, rx = 0, ry = 0, rz = 0, seg = 12) => put(mat, new THREE.CylinderGeometry(r, r, h, seg), x, y, z, rx, ry, rz),
    pipe: (mat, pts, r, seg = 24) => put(mat, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), seg, r, 8, false)),
    // into the given parent, one mesh per material; `uvk` re-projects texture coordinates for the mapped materials
    flush(parent, uvk = 0.5, keepUV = new Set()) {
      for (const [mat, list] of bins) {
        let n = 0; for (const g of list) n += g.attributes.position.count;
        const P = new Float32Array(n * 3), N = new Float32Array(n * 3); let U = new Float32Array(n * 2), o = 0;
        for (const g of list) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) U.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; g.dispose(); }
        if (!keepUV.has(mat)) U = boxUV(P, N, uvk);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = !mat.transparent; mesh.receiveShadow = true; parent.add(mesh);
      }
      bins.clear();
    },
  };
}

// ---------- plumbing and fittings on the outside of the engine (model space, metres, +x forward) ----------
export const VENTS = {
  safety: [[-1.38, 4.36, 0.17], [-1.38, 4.36, -0.17]],
  whistle: [-1.66, 4.74, 0],
  cocks: [[3.35, 0.5, 1.18], [4.3, 0.5, 1.18], [3.35, 0.5, -1.18], [4.3, 0.5, -1.18]],
  brake: [[-1.35, 1.25, 0.8], [-1.35, 1.25, -0.8]],
  contact: [[-2.745, 0.06, 0.72], [-2.745, 0.06, -0.72], [-0.03, 0.06, 0.72], [-0.03, 0.06, -0.72]],
  injector: [-1.1, 1.25, 0.86],
};
export function fittings(root, M) {
  const D = merger();
  for (const s of [-1, 1]) {
    // main steam pipe: out of the boiler below the dome, down its flank to the top of the cylinder
    D.pipe(M.iron, [[1.4, 2.72, s * 0.4], [1.9, 2.56, s * 0.74], [2.5, 2.2, s * 0.9], [3.0, 1.7, s * 1.02], [3.45, 1.33, s * 1.1]], 0.055);
    for (const [x, y, z] of [[1.42, 2.71, 0.42], [3.43, 1.35, 1.1]]) D.cyl(M.brass, 0.075, 0.04, x, y, s * z, 0, 0, 0, 12);
    // feed water from the injector under the cab forward to the check valve and the boiler
    D.pipe(M.copper, [[-2.2, 1.84, s * 0.82], [-1.0, 1.83, s * 0.84], [0.6, 1.76, s * 0.86], [1.7, 1.46, s * 0.92]], 0.034);
    D.box(M.brass, 0.92, 1.68, s * 0.86 - 0.06, 1.12, 1.84, s * 0.86 + 0.06);
    D.cyl(M.brass, 0.03, 0.12, 1.02, 1.9, s * 0.86, 0, 0, 0, 8);
    // injector body hung under the running board between the drivers, with its overflow pipe
    D.cyl(M.brass, 0.07, 0.3, -1.1, 1.62, s * 0.86, 0, 0, 0, 12);
    D.cyl(M.copper, 0.022, 0.2, -1.1, 1.37, s * 0.86, 0, 0, 0, 8);
    // cylinder drain cocks under each end of the cylinder
    for (const x of [3.35, 4.3]) { D.cyl(M.brass, 0.028, 0.18, x, 0.62, s * 1.15, 0, 0, 0, 8); D.box(M.brass, x - 0.04, 0.66, s * 1.15 - 0.03, x + 0.04, 0.72, s * 1.15 + 0.03); }
    // sand pipes from the sand dome down to just ahead of the front drivers
    D.pipe(M.iron, [[0.95, 2.62, s * 0.4], [1.0, 2.3, s * 0.82], [1.02, 1.9, s * 0.88], [1.02, 0.7, s * 0.8], [0.98, 0.22, s * 0.74]], 0.022, 16);
    // pop safety valves on the dome by the cab
    D.cyl(M.brass, 0.05, 0.22, -1.38, 4.2, s * 0.17, 0, 0, 0, 12); D.cyl(M.brass, 0.065, 0.05, -1.38, 4.32, s * 0.17, 0, 0, 0, 12);
  }
  D.flush(root, 0.5);

  // lettering: road and number on the cab sides, the name on the headlamp
  const letter = (text, w, h, font, col) => {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = Math.round(512 * h / w); const g = cv.getContext('2d');
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(30,12,6,0.8)'; g.strokeText(text, 256, cv.height / 2); g.fillStyle = col; g.fillText(text, 256, cv.height / 2);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return new THREE.MeshStandardMaterial({ map: t, transparent: true, metalness: 0.4, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
  };
  const cabSide = letter('C. P. R. R.   60', 1.5, 0.3, 'bold italic 64px Georgia, serif', '#e0b860');
  const lampSide = letter('JUPITER', 0.5, 0.15, 'bold 96px Georgia, serif', '#e8c070');
  for (const s of [-1, 1]) {
    const a = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.3), cabSide); a.position.set(-3.3, 1.72, s * 1.478); a.rotation.y = s > 0 ? 0 : Math.PI; root.add(a);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.15), lampSide); b.position.set(4.62, 3.28, s * 0.347); b.rotation.y = s > 0 ? 0 : Math.PI; root.add(b);
  }
}

// ---------- steam, sparks ----------
function softDot() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 1, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv);
}
export function steamSystem(scene) {
  const dot = softDot(), steam = [], sparks = [];
  for (let i = 0; i < 140; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    sp.visible = false; scene.add(sp); steam.push({ sp, life: 0, max: 1, v: new THREE.Vector3(), s0: 0.3, grow: 3, a: 0.5 });
  }
  for (let i = 0; i < 60; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xffb050, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.visible = false; sp.scale.setScalar(0.06); scene.add(sp); sparks.push({ sp, life: 0, max: 0.4, v: new THREE.Vector3() });
  }
  let si = 0, ki = 0, mul = 1;
  return {
    setLevel(level) { mul = { low: 0.35, medium: 0.65, high: 1 }[level] || 1; },
    // a puff of steam at p (world) moving at v (world), starting size s0, growing `grow` times over `life` seconds
    puff(p, v, s0, grow, life, a = 0.55) {
      if (mul < 1 && Math.random() > mul) return;
      const q = steam[si++ % steam.length];
      q.sp.position.copy(p); q.v.copy(v); q.s0 = s0; q.grow = grow; q.max = life; q.life = 0; q.a = a; q.sp.visible = true;
    },
    spark(p, v) {
      if (mul < 1 && Math.random() > mul) return;
      const q = sparks[ki++ % sparks.length];
      q.sp.position.copy(p); q.v.copy(v); q.life = 0; q.max = 0.25 + Math.random() * 0.3; q.sp.visible = true;
    },
    update(dt, wind, night) {
      // steam is white by day and lit only by the moon and the lamps at night
      const lum = 1 - night * 0.72;
      for (const q of steam) {
        if (!q.sp.visible) continue;
        q.life += dt; const k = q.life / q.max;
        if (k >= 1) { q.sp.visible = false; continue; }
        q.v.multiplyScalar(1 - dt * 2.2); q.v.y += dt * 0.9; q.v.x += wind.x * dt * 1.2; q.v.z += wind.z * dt * 1.2;
        q.sp.position.addScaledVector(q.v, dt);
        const s = q.s0 * (1 + k * q.grow); q.sp.scale.set(s, s, s);
        q.sp.material.opacity = (1 - k) * (1 - k) * Math.min(1, k * 12) * q.a;
        q.sp.material.color.setScalar(lum * (0.92 + k * 0.08));
      }
      for (const q of sparks) {
        if (!q.sp.visible) continue;
        q.life += dt; const k = q.life / q.max;
        if (k >= 1) { q.sp.visible = false; continue; }
        q.v.y -= 9.8 * dt; q.sp.position.addScaledVector(q.v, dt);
        q.sp.material.opacity = (1 - k) * (0.5 + night * 0.5);
      }
    },
  };
}

// ---------- the headlamp: a beam you can see at night, a glow on the lens, and a little spill round the lamp ----------
export function headlamp(root, at) {
  const cv = document.createElement('canvas'); cv.width = 8; cv.height = 128; const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,220,160,1)'); gr.addColorStop(0.35, 'rgba(255,210,150,0.35)'); gr.addColorStop(1, 'rgba(255,200,140,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 8, 128);
  const beamT = new THREE.CanvasTexture(cv);
  const geo = new THREE.ConeGeometry(3.4, 18, 24, 1, true); geo.translate(0, -9, 0); geo.rotateZ(Math.PI / 2);
  const beamM = new THREE.MeshBasicMaterial({ map: beamT, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true });
  const beam = new THREE.Mesh(geo, beamM); beam.position.set(at.x + 0.05, at.y, at.z); beam.rotation.z = -0.04; root.add(beam);
  const glowM = new THREE.SpriteMaterial({ map: softDot(), color: 0xffd8a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const glow = new THREE.Sprite(glowM); glow.position.set(at.x + 0.1, at.y, at.z); root.add(glow);
  const spill = new THREE.PointLight(0xffc880, 0, 7, 2); spill.position.set(at.x + 0.6, at.y - 0.3, at.z); root.add(spill);
  let t = 0;
  return {
    update(dt, night, strong) {
      t += dt;
      const lit = sst(0.08, 0.4, night), flick = 0.96 + 0.04 * Math.sin(t * 31) * Math.sin(t * 17.3);
      beamM.opacity = lit * 0.16 * (strong ? 1.4 : 1) * flick;
      glowM.opacity = (0.25 + lit * 0.75) * flick; glow.scale.setScalar(0.5 + lit * 1.1);
      spill.intensity = lit * 12 * flick;
      return flick;
    },
  };
}

// ---------- firelight: the firebox lights the cab through the door, flickering, strongest at night ----------
export function firelight(root, at) {
  const L = new THREE.PointLight(0xff7a30, 0, 4.2, 2); L.position.copy(at); root.add(L);
  let t = 0;
  return {
    update(dt, night, burning, work) {
      t += dt;
      const f = 0.75 + 0.25 * Math.sin(t * 11.3) * Math.sin(t * 6.1 + 1.3) + 0.08 * Math.sin(t * 37);
      L.intensity = burning ? f * (0.6 + work * 0.6) * (1.2 + night * 7) : 0;
    },
  };
}

// ---------- Walschaerts valve gear, both sides ----------
// A return crank on the main crank pin drives the eccentric rod, which rocks the expansion link on its bracket. The
// radius rod takes motion off the link at the height the reverser sets, and the combination lever mixes in the
// crosshead's travel, sliding the valve stem in and out of the steam chest. drv: main driver centre, cr: crank throw,
// cross: crosshead [x mean, y]
export function valveGear(root, M, drv, cr, cross) {
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const rod = (mat, t, w) => { const m = new THREE.Mesh(unit, mat); m.scale.set(1, t, w); m.castShadow = true; m.receiveShadow = true; root.add(m); return m; };
  const set = (m, ax, ay, bx, by, z) => { m.position.set((ax + bx) / 2, (ay + by) / 2, z); m.rotation.set(0, 0, Math.atan2(by - ay, bx - ax)); m.scale.x = Math.hypot(bx - ax, by - ay); };
  const LP = [1.25, 1.55], LH = 0.24, TAIL = 0.3, VY = 1.42, VX0 = cross[0] + 0.05, STEM = 0.97, H = 0.5, RE = 0.21;
  const LE = Math.hypot(LP[0] - drv[0], LP[1] - TAIL - drv[1]);
  const sides = [-1, 1].map(s => ({
    s, ret: rod(M.steel, 0.07, 0.05), ecc: rod(M.steel, 0.05, 0.04), link: rod(M.iron, 0.1, 0.06), rad: rod(M.steel, 0.055, 0.04),
    lev: rod(M.steel, 0.06, 0.035), arm: rod(M.steel, 0.05, 0.035), stem: rod(M.steel, 0.035, 0.035),
  }));
  // brackets: the link hangs from the running board, the valve stem runs through a guide and a gland into the chest
  const D = merger();
  for (const s of [-1, 1]) {
    D.box(M.iron, LP[0] - 0.06, LP[1] - 0.06, s * 1.31 - 0.025, LP[0] + 0.06, 1.98, s * 1.31 + 0.025);
    D.cyl(M.steel, 0.035, 0.1, LP[0], LP[1], s * 1.29, Math.PI / 2, 0, 0, 10);
    D.box(M.iron, 3.25, VY - 0.05, s * 1.15 - 0.04, 3.33, VY + 0.05, s * 1.15 + 0.04);
    D.box(M.iron, 3.27, VY + 0.05, s * 1.15 - 0.02, 3.31, 1.6, s * 1.15 + 0.02);
    D.cyl(M.brass, 0.05, 0.05, 3.4, VY, s * 1.15, 0, 0, Math.PI / 2, 12);
  }
  D.flush(root, 0.5);
  let cut = 1;
  return {
    // al: driver angle, rev: reverser setting (-1 back .. 1 full forward), cx: crosshead x now
    update(al, rev, cx, dt) {
      cut += (rev - cut) * Math.min(1, dt * 2);
      const px = drv[0] - cr * Math.cos(al), py = drv[1] + cr * Math.sin(al);
      const ex = drv[0] - RE * Math.cos(al + 1.45), ey = drv[1] + RE * Math.sin(al + 1.45);
      // where the link tail must be for the eccentric rod to keep its length, and so the link's angle
      let ty = LP[1] - TAIL;
      let tx = ex + Math.sqrt(Math.max(0, LE * LE - (ty - ey) ** 2));
      const sn = Math.max(-0.7, Math.min(0.7, (tx - LP[0]) / TAIL)), cs = Math.sqrt(1 - sn * sn);
      tx = LP[0] + TAIL * sn; ty = LP[1] - TAIL * cs;
      const d = cut * LH, dx = LP[0] - d * sn, dy = LP[1] + d * cs;
      const vx = VX0 + (dx - LP[0]) * 0.9 + (cx - cross[0]) * 0.12;
      const off = Math.max(-H * 0.95, Math.min(H * 0.95, cx - vx)), by = VY - Math.sqrt(H * H - off * off);
      for (const g of sides) {
        const z = g.s;
        set(g.ret, px, py, ex, ey, z * 1.33);
        set(g.ecc, ex, ey, tx, ty, z * 1.35);
        set(g.link, tx, ty, LP[0] - LH * sn, LP[1] + LH * cs, z * 1.3);
        set(g.rad, dx, dy, vx, VY, z * 1.27);
        set(g.lev, vx, VY + 0.08, vx + off, by, z * 1.24);
        set(g.arm, cx, cross[1], vx + off, by, z * 1.235);
        set(g.stem, vx, VY, vx + STEM, VY, z * 1.15);
      }
    },
  };
}

// ---------- brake shoes on the driving wheels: they clamp on, and after a hard stop they glow ----------
export function brakeRigging(root, M, drvs, R) {
  const shoeM = new THREE.MeshStandardMaterial({ color: 0x4a4440, metalness: 0.6, roughness: 0.6, emissive: 0xff3a08, emissiveIntensity: 0 });
  const shoes = [];
  // one shoe ahead of the rear driver, one behind the front driver, both in the gap between them; a pull rod joins them
  const spots = [[drvs[0][0] + R + 0.045, drvs[0][1], 1], [drvs[1][0] - R - 0.045, drvs[1][1], -1]];
  for (const s of [-1, 1]) for (const [x, y, dir] of spots) {
    const g = new THREE.Group(); g.position.set(x, y, s * 0.85); root.add(g);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.38, 0.1), shoeM); m.castShadow = true; g.add(m);
    const hang = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.03), M.iron); hang.position.set(dir * 0.04, 0.26, 0); g.add(hang);
    shoes.push({ g, x, dir });
  }
  const D = merger();
  for (const s of [-1, 1]) D.box(M.iron, spots[0][0] + 0.04, 0.93, s * 0.85 - 0.015, spots[1][0] - 0.04, 0.97, s * 0.85 + 0.015);
  D.flush(root, 0.5);
  let heat = 0;
  return {
    update(dt, k, sp, night) {
      // off, the shoes stand a few centimetres clear of the tyres
      for (const q of shoes) q.g.position.x = q.x + q.dir * (1 - k) * 0.035;
      heat = Math.max(0, Math.min(1, heat + (k > 0.3 ? k * sp * 0.015 : 0) * dt - dt * 0.04));
      shoeM.emissiveIntensity = Math.max(0, heat - 0.35) * (1.5 + night * 4);
    },
  };
}
