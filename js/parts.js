// Building parts: walls with real openings, roofs, porches, furniture
import * as THREE from 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/three.module.js';
import { signMaterial } from './textures.js';
import { addProp } from './props.js';
import { registerLoot } from './game/registry.js';

export const T = 0.16, FH = 3.3, Y0 = 0.4;
// how the windows of the building being built are kept: p glazed (else boarded or broken), curtains, shutters.
// Set per building from how well it is looked after (buildings.js)
export const GLAZE = { p: 0.28, curtain: 0, cloth: 0, shutter: 0.3, shutterMat: 'woodGrey', noDoor: 0.2 };
const _v = new THREE.Vector3(), _m4 = new THREE.Matrix4();

export function toWorld(B, x, y, z) { return _v.set(x, y, z).applyMatrix4(B.base).clone(); }
export function prop(B, type, x, y, z, ry = 0, s = 1) { const p = toWorld(B, x, y, z); addProp(type, p.x, p.y, p.z, ry + B.ry, s); }
export function rot(ox, oz, ry) { const c = Math.cos(ry), s = Math.sin(ry); return [ox * c + oz * s, -ox * s + oz * c]; }

// ---- walls ----
// axis 'x': wall runs along x at z=fixed. axis 'z': runs along z at x=fixed. out: exterior side sign
export function wallRun(B, mat, axis, fixed, a0, a1, y0, y1, ops, out, rnd, trimMat = 'woodDark') {
  ops = ops.filter(o => o.a0 > a0 - 0.01 && o.a1 < a1 + 0.01).sort((p, q) => p.a0 - q.a0);
  const seg = (s0, s1, yy0, yy1) => {
    if (s1 - s0 < 0.02 || yy1 - yy0 < 0.02) return;
    const c = (s0 + s1) / 2, l = s1 - s0, cy = (yy0 + yy1) / 2, h = yy1 - yy0;
    if (axis === 'x') B.box(mat, c, cy, fixed, l, h, T); else B.box(mat, fixed, cy, c, T, h, l);
  };
  const piece = (m, a, y, perp, la, h, lp, o = {}) => {
    if (axis === 'x') B.box(m, a, y, fixed + perp, la, h, lp, Object.assign({ col: false }, o));
    else B.box(m, fixed + perp, y, a, lp, h, la, Object.assign({ col: false }, o, o.rz !== undefined ? { rx: -o.rz, rz: 0 } : {}));
  };
  let cur = a0;
  for (const op of ops) {
    seg(cur, op.a0, y0, y1); seg(op.a0, op.a1, y0, op.b0); seg(op.a0, op.a1, op.b1, y1); cur = op.a1;
    const ow = op.a1 - op.a0, oc = (op.a0 + op.a1) / 2, oh = op.b1 - op.b0, ex = out * (T / 2 + 0.025);
    piece(trimMat, op.a0 - 0.05, (op.b0 + op.b1) / 2, ex, 0.1, oh + 0.1, 0.05);
    piece(trimMat, op.a1 + 0.05, (op.b0 + op.b1) / 2, ex, 0.1, oh + 0.1, 0.05);
    piece(trimMat, oc, op.b1 + 0.07, ex, ow + 0.32, 0.14, 0.06);
    if (op.kind === 'win') {
      piece(trimMat, oc, op.b0 - 0.03, out * (T / 2 + 0.05), ow + 0.24, 0.06, 0.16);
      const r = rnd();
      if (r < GLAZE.p) { // glazed: sashes with muntins, panes catching the light, sometimes a curtain behind
        piece('glass', oc, (op.b0 + op.b1) / 2, 0, ow, oh, 0.02);
        const cols = ow > 1.3 ? 3 : 2, rows = oh > 1.5 ? 3 : 2;
        for (let i = 1; i < cols; i++) piece(trimMat, op.a0 + ow * i / cols, (op.b0 + op.b1) / 2, out * 0.01, 0.035, oh, 0.05);
        for (let i = 1; i < rows; i++) piece(trimMat, oc, op.b0 + oh * i / rows, out * 0.01, ow, 0.035, 0.05);
        piece(trimMat, oc, (op.b0 + op.b1) / 2, out * 0.015, ow, 0.06, 0.06); // the meeting rail of the sashes
        if (GLAZE.curtain && rnd() < GLAZE.curtain) {
          const k = 0.3 + rnd() * 0.25, c = GLAZE.cloth ? { c: GLAZE.cloth } : {};
          piece('cloth', op.a0 + ow * k / 2, (op.b0 + op.b1) / 2, -out * (T / 2 + 0.04), ow * k, oh * 0.98, 0.02, c);
          piece('cloth', op.a1 - ow * k / 2, (op.b0 + op.b1) / 2, -out * (T / 2 + 0.04), ow * k, oh * 0.98, 0.02, c);
        }
      } else if (r < GLAZE.p + (1 - GLAZE.p) * 0.4) { // boarded up
        const ang = Math.atan2(oh, ow) * 0.8;
        piece('woodGrey', oc, (op.b0 + op.b1) / 2, out * (T / 2 + 0.06), Math.hypot(ow, oh) * 0.95, 0.18, 0.03, { rz: ang });
        piece('woodGrey', oc, (op.b0 + op.b1) / 2 + 0.05, out * (T / 2 + 0.09), Math.hypot(ow, oh) * 0.95, 0.18, 0.03, { rz: -ang * 0.9 });
      } else if (r < GLAZE.p + (1 - GLAZE.p) * 0.7) { // shard left in the frame
        piece('glass', op.a0 + ow * 0.25, op.b0 + oh * 0.25, 0, ow * 0.5, oh * 0.5, 0.02);
      }
      if (rnd() < GLAZE.shutter) { // shutters: both open against the wall, or one hanging off a hinge
        if (GLAZE.p > 0.6) for (const sx of [-1, 1]) piece(GLAZE.shutterMat, (sx < 0 ? op.a0 : op.a1) + sx * ow / 4, (op.b0 + op.b1) / 2, out * (T / 2 + 0.04), ow / 2, oh, 0.035);
        else piece('woodGrey', op.a1 + 0.35, (op.b0 + op.b1) / 2 - 0.1, out * (T / 2 + 0.06), ow * 0.5, oh, 0.04, { rz: 0.2 });
      }
    } else if (op.kind === 'door' && !op.noLeaf) {
      const r = rnd(); if (r < GLAZE.noDoor) continue;
      const theta = r < 0.6 ? 0.5 + rnd() * 0.9 : 1.45 + rnd() * 0.15;
      const dw = ow - 0.04, dh = oh - 0.04;
      if (op.batwing) {
        for (const sgn of [-1, 1]) {
          const hinge = sgn < 0 ? op.a0 : op.a1, th = (0.2 + rnd() * 0.5);
          doorLeaf(B, axis, fixed, hinge, -sgn, ow / 2 - 0.03, op.b0 + 0.6, 1.1, th, out);
        }
      } else doorLeaf(B, axis, fixed, op.a0 + 0.02, 1, dw, op.b0 + dh / 2, dh, theta, out);
    }
  }
  seg(cur, a1, y0, y1);
}
function doorLeaf(B, axis, fixed, hinge, dirSign, dw, cy, dh, theta, out) {
  // swings toward interior (-out), always left standing open so the way in is clear. The leaf is a frame with raised
  // panels on both faces and a knob each side
  const ca = Math.cos(theta) * dirSign, sa = Math.sin(theta) * -out;
  // u: along the leaf from the hinge; n: across it (the way its faces look), both in (x, z)
  const u = axis === 'x' ? [ca, sa] : [sa, ca], n = axis === 'x' ? [-sa, ca] : [ca, -sa];
  const cx = axis === 'x' ? hinge + ca * dw / 2 : fixed + sa * dw / 2, cz = axis === 'x' ? fixed + sa * dw / 2 : hinge + ca * dw / 2;
  const ry = axis === 'x' ? Math.atan2(-sa, ca) : Math.atan2(sa, ca);
  const leaf = (x, y, z, along, h, thick, m = 'woodDark') => axis === 'x' ? B.box(m, x, y, z, along, h, thick, { ry, col: false }) : B.box(m, x, y, z, thick, h, along, { ry, col: false });
  leaf(cx, cy, cz, dw, dh, 0.05);
  if (dh > 1.4 && dw > 0.5) {
    const pw = dw * 0.32, ph = dh * 0.34;
    for (const f of [-1, 1]) for (const [du, dy] of [[-dw * 0.21, dh * 0.2], [dw * 0.21, dh * 0.2], [-dw * 0.21, -dh * 0.2], [dw * 0.21, -dh * 0.2]])
      leaf(cx + u[0] * du + n[0] * 0.03 * f, cy + dy, cz + u[1] * du + n[1] * 0.03 * f, pw, ph, 0.02, 'woodGrey');
    for (const f of [-1, 1]) leaf(cx + u[0] * (dw / 2 - 0.1) + n[0] * 0.05 * f, cy - 0.08, cz + u[1] * (dw / 2 - 0.1) + n[1] * 0.05 * f, 0.06, 0.06, 0.05, 'iron');
  }
}

export function windowSlots(a0, a1, spacing, avoid = []) {
  const len = a1 - a0, n = Math.max(0, Math.floor((len - 1.2) / spacing)), out = [];
  for (let i = 0; i < n; i++) {
    const c = a0 + (i + 0.5) * len / n;
    if (avoid.some(([x0, x1]) => c + 0.7 > x0 && c - 0.7 < x1)) continue;
    out.push(c);
  }
  return out;
}

// stepped board gable end (axis like wallRun)
export function gableEnd(B, mat, axis, fixed, span, yTop, ta) {
  const rise = span / 2 * ta, dy = 0.26;
  for (let y = yTop; y < yTop + rise - 0.05; y += dy) {
    const hw = span / 2 * (1 - (y + dy * 0.5 - yTop) / rise);
    if (axis === 'x') B.box(mat, 0, y + dy / 2, fixed, hw * 2, dy, T, { col: false });
    else B.box(mat, fixed, y + dy / 2, 0, T, dy, hw * 2, { col: false });
  }
}

// gable roof, ridge along z (alongZ) or along x
export function gableRoof(B, mat, w, d, top, pitch, ov, dmg, rnd, alongZ = true, rafters = false) {
  const ta = Math.tan(pitch), ca = Math.cos(pitch);
  const span = alongZ ? w : d, len = alongZ ? d : w;
  const half = span / 2 + ov, slopeLen = half / ca + 0.1, ridgeY = top + span / 2 * ta;
  const strip = 1.1, n = Math.ceil((len + 2 * ov) / strip);
  const hole = dmg >= 2 ? [Math.floor(n * (0.2 + rnd() * 0.3)), Math.floor(n * (0.55 + rnd() * 0.3))] : null;
  for (const side of [-1, 1]) {
    const pc = side * half / 2, yc = ridgeY - (half / 2) * ta + 0.06;
    for (let i = 0; i < n; i++) {
      if (dmg && rnd() < dmg * 0.13) continue;
      if (hole && side > 0 && i >= hole[0] && i <= hole[1]) continue;
      const l = -len / 2 - ov + (i + 0.5) * strip;
      if (alongZ) B.box(mat, pc, yc, l, slopeLen, 0.07, strip - 0.02, { rz: -side * pitch, col: false, uvRot: true });
      else B.box(mat, l, yc, pc, strip - 0.02, 0.07, slopeLen, { rx: side * pitch, col: false });
    }
    if (rafters) {
      for (let l = -len / 2 + 0.6; l < len / 2; l += 1.2) {
        if (alongZ) B.box('woodDark', side * span / 4, top + span / 4 * ta - 0.05, l, span / 2 / ca, 0.16, 0.08, { rz: -side * pitch, col: false });
        else B.box('woodDark', l, top + span / 4 * ta - 0.05, side * span / 4, 0.08, 0.16, span / 2 / ca, { rx: side * pitch, col: false });
      }
    }
    // trim: a fascia board along the eave, and barge boards up both gable ends
    const eaveY = ridgeY - half * ta - 0.02;
    if (alongZ) B.box('woodDark', side * (half - 0.02), eaveY, 0, 0.05, 0.22, len + 2 * ov, { col: false });
    else B.box('woodDark', 0, eaveY, side * (half - 0.02), len + 2 * ov, 0.22, 0.05, { col: false });
    for (const e of [-1, 1]) {
      const l = e * (len / 2 + ov - 0.03);
      if (alongZ) B.box('woodDark', pc, yc + 0.02, l, slopeLen, 0.2, 0.05, { rz: -side * pitch, col: false });
      else B.box('woodDark', l, yc + 0.02, pc, 0.05, 0.2, slopeLen, { rx: side * pitch, col: false });
    }
  }
  if (alongZ) B.box('woodDark', 0, ridgeY + 0.1, 0, 0.22, 0.12, len + 2 * ov, { col: false });
  else B.box('woodDark', 0, ridgeY + 0.1, 0, len + 2 * ov, 0.12, 0.22, { col: false });
  return ridgeY;
}

export function sign(B, text, x, y, z, w, h, ry = 0, opts) {
  const key = 'sign:' + text + (opts ? JSON.stringify(opts) : '');
  B.custom = B.custom || {}; B.custom[key] = signMaterial(text, opts);
  B.box('woodDark', x - Math.sin(ry) * 0.03, y, z - Math.cos(ry) * 0.03, w + 0.16, h + 0.16, 0.05, { ry, col: false });
  _m4.makeRotationY(ry).setPosition(x + Math.sin(ry) * 0.005, y, z + Math.cos(ry) * 0.005);
  B.geom(key, new THREE.PlaneGeometry(w, h), _m4);
}

// ---- porch / boardwalk / balcony ----
export function porch(B, w, d, rnd, o = {}) {
  const pd = 2.6, z0 = d / 2, z1 = d / 2 + pd, zc = (z0 + z1) / 2;
  B.box('floor', 0, Y0 - 0.1, zc, w + 0.3, 0.16, pd);
  B.box('woodDark', 0, (Y0 - 0.18) / 2, z1 - 0.1, w + 0.3, Y0 - 0.18, 0.2, { col: false });
  B.box('woodDark', 0, 0.11, z1 + 0.3, 2.2, 0.22, 0.6);
  const np = Math.max(2, Math.round(w / 2.8) + 1), ph = o.balcony ? FH + 1.15 : 2.95;
  for (let i = 0; i < np; i++) {
    const x = -w / 2 + i * w / (np - 1);
    if (o.missingPost && i === 1) { B.box('woodDark', x + 0.5, Y0 + 0.1, z1 + 0.6, 0.14, 0.14, 2.8, { ry: 0.4, col: false }); continue; }
    B.box('woodDark', x, Y0 + ph / 2, z1 - 0.12, 0.14, ph, 0.14);
    // knee braces from post to beam
    if (!o.balcony) for (const sx of [-1, 1]) if ((i > 0 || sx > 0) && (i < np - 1 || sx < 0)) B.box('woodDark', x + sx * 0.28, Y0 + ph - 0.3, z1 - 0.12, 0.6, 0.08, 0.08, { rz: -sx * 0.78, col: false });
  }
  if (!o.balcony && !o.noRoof) B.box('woodDark', 0, Y0 + ph - 0.03, z1 - 0.12, w + 0.3, 0.14, 0.12, { col: false });
  if (o.balcony) {
    const by = Y0 + FH;
    B.box('floor', 0, by - 0.06, zc, w + 0.3, 0.12, pd);
    B.box('woodDark', 0, by + 1.0, z1 - 0.12, w + 0.3, 0.07, 0.08, { col: false });
    B.addCollider(-w / 2 - 0.2, by, z1 - 0.22, w / 2 + 0.2, by + 1.05, z1);
    for (const sx of [-1, 1]) { B.box('woodDark', sx * (w / 2 + 0.1), by + 1.0, zc, 0.08, 0.07, pd, { col: false }); B.addCollider(sx * (w / 2 + 0.1) - 0.1, by, z0, sx * (w / 2 + 0.1) + 0.1, by + 1.05, z1); }
    for (let x = -w / 2; x <= w / 2; x += 0.32) B.box('woodDark', x, by + 0.5, z1 - 0.12, 0.04, 1.0, 0.04, { col: false });
    B.box('woodDark', 0, by + 0.12, z1 - 0.12, w + 0.3, 0.06, 0.08, { col: false });
    B.box(o.roofMat || 'tin', 0, by + 3.05, zc + 0.1, w + 0.5, 0.06, pd + 0.5, { rx: 0.16, col: false });
  } else if (!o.noRoof) {
    if (o.damaged) B.box(o.roofMat || 'tin', -w * 0.2, Y0 + 2.6, zc + 0.6, w * 0.6, 0.06, pd + 0.5, { rx: 0.55, rz: 0.15, col: false }),
      B.box(o.roofMat || 'tin', w * 0.3, Y0 + 3.05, zc + 0.1, w * 0.4 + 0.25, 0.06, pd + 0.5, { rx: 0.18, col: false });
    else B.box(o.roofMat || 'tin', 0, Y0 + 3.05, zc + 0.1, w + 0.5, 0.06, pd + 0.5, { rx: 0.18, col: false });
  }
  if (o.hitch !== false) {
    const hz = z1 + 1.8;
    B.box('woodDark', -1.2, 0.5, hz, 0.12, 1.0, 0.12); B.box('woodDark', 1.2, 0.5, hz, 0.12, 1.0, 0.12);
    B.box('woodDark', 0, 0.95, hz, 2.6, 0.09, 0.09, { col: false });
  }
  return z1;
}

// ---- furniture ----
export function table(B, x, y, z, w = 1.2, d = 0.8, ry = 0) {
  const h = 0.78;
  B.box('woodDark', x, y + h - 0.03, z, w, 0.05, d, { ry, col: false });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const [ox, oz] = rot(sx * (w / 2 - 0.07), sz * (d / 2 - 0.07), ry);
    B.box('woodDark', x + ox, y + (h - 0.05) / 2, z + oz, 0.06, h - 0.05, 0.06, { ry, col: false });
  }
  const r = Math.max(w, d) / 2; B.addCollider(x - r * 0.8, y, z - r * 0.8, x + r * 0.8, y + h, z + r * 0.8);
}
export function chair(B, x, y, z, ry = 0, broken = false) {
  if (broken) {
    B.box('woodDark', x, y + 0.03, z, 0.42, 0.04, 0.42, { ry: ry + 0.4, col: false });
    B.box('woodDark', x + 0.4, y + 0.03, z + 0.2, 0.05, 0.05, 0.5, { ry: ry + 1.2, col: false });
    B.box('woodDark', x - 0.2, y + 0.25, z - 0.4, 0.42, 0.5, 0.04, { ry: ry + 0.2, rx: 1.2, col: false });
    return;
  }
  B.box('woodDark', x, y + 0.45, z, 0.42, 0.04, 0.42, { ry, col: false });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const [ox, oz] = rot(sx * 0.18, sz * 0.18, ry);
    B.box('woodDark', x + ox, y + 0.22, z + oz, 0.04, 0.44, 0.04, { ry, col: false });
  }
  const [bx, bz] = rot(0, -0.19, ry);
  B.box('woodDark', x + bx, y + 0.72, z + bz, 0.42, 0.5, 0.04, { ry, col: false });
}
export function bed(B, x, y, z, alongX = false, rnd) {
  const L = 2.0, W = 1.0, ry = alongX ? Math.PI / 2 : 0;
  B.box('woodDark', x, y + 0.25, z, W, 0.12, L, { ry, col: false });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const [ox, oz] = rot(sx * (W / 2 - 0.04), sz * (L / 2 - 0.04), ry);
    B.box('woodDark', x + ox, y + (sz < 0 ? 0.5 : 0.3), z + oz, 0.07, sz < 0 ? 1.0 : 0.6, 0.07, { ry, col: false });
  }
  const [hx, hz] = rot(0, -L / 2 + 0.03, ry);
  B.box('woodDark', x + hx, y + 0.65, z + hz, W, 0.5, 0.04, { ry, col: false });
  B.box('mattress', x, y + 0.38, z, W - 0.08, 0.16, L - 0.1, { ry, col: false });
  const tilt = rnd ? (rnd() - 0.5) * 0.3 : 0;
  const [cx, cz] = rot(0, 0.25, ry);
  B.box('cloth', x + cx, y + 0.48, z + cz, W - 0.02, 0.05, L * 0.62, { ry: ry + tilt, col: false });
  const [px, pz] = rot(0, -L / 2 + 0.3, ry);
  B.box('cloth', x + px, y + 0.5, z + pz, 0.6, 0.1, 0.32, { ry, col: false });
  const hx2 = alongX ? L / 2 : W / 2, hz2 = alongX ? W / 2 : L / 2;
  B.addCollider(x - hx2, y, z - hz2, x + hx2, y + 0.55, z + hz2);
}
// shelf against a wall; ry so that +z faces the room. goods: true for a mixed stock, or a function (B, x, y, z, ry, rnd)
// that puts one item down, for shops with their own wares
export function shelf(B, x, y, z, w, h, ry, rnd, goods = true) {
  const d = 0.4;
  for (const sx of [-1, 1]) { const [ox, oz] = rot(sx * w / 2, 0, ry); B.box('woodDark', x + ox, y + h / 2, z + oz, 0.04, h, d, { ry, col: false }); }
  const [bx, bz] = rot(0, -d / 2, ry);
  B.box('woodDark', x + bx, y + h / 2, z + bz, w, h, 0.03, { ry, col: false });
  const rows = Math.max(2, Math.round(h / 0.45));
  for (let r = 0; r <= rows; r++) {
    const sy = y + 0.08 + r * (h - 0.1) / rows;
    B.box('woodDark', x, sy, z, w, 0.03, d, { ry, col: false });
    if (!goods || r === rows || !rnd) continue;
    for (let gx = -w / 2 + 0.12; gx < w / 2 - 0.1; gx += 0.14 + rnd() * 0.12) {
      if (rnd() < 0.35) continue;
      const [ox, oz] = rot(gx, (rnd() - 0.5) * 0.15, ry), t = rnd();
      if (typeof goods === 'function') { goods(B, x + ox, sy, z + oz, ry, rnd); continue; }
      if (t < 0.3) B.box('bottle', x + ox, sy + 0.13, z + oz, 0.07, 0.24, 0.07, { ry, col: false });
      else if (t < 0.5) B.box('metal', x + ox, sy + 0.07, z + oz, 0.09, 0.12, 0.09, { ry, col: false }); // tins
      else if (t < 0.65) B.box('paper', x + ox, sy + 0.1, z + oz, 0.12, 0.18, 0.08, { ry, col: false, c: [0xd8c8a0, 0xc84a2a, 0x3a5a8a, 0xe0b040][Math.floor(rnd() * 4)] }); // packets
      else if (t < 0.8) B.box('cloth', x + ox, sy + 0.1, z + oz, 0.22, 0.17, 0.25, { ry: ry + rnd(), col: false });
      else if (t < 0.9) B.box('woodGrey', x + ox, sy + 0.09, z + oz, 0.18, 0.16, 0.2, { ry, col: false }); // a small crate
      else B.box('bottle', x + ox, sy + 0.04, z + oz, 0.22, 0.06, 0.07, { ry: ry + 1.57, rx: 1.57, col: false });
    }
  }
  rotCollider(B, x, y, z, w, h, d, ry);
  if (goods) loot(B, 'shelf', x, y, z, ry);
}
export function counter(B, x, y, z, w, d, alongZ = false) {
  const W = alongZ ? d : w, D = alongZ ? w : d;
  B.box('woodDark', x, y + 0.5, z, W, 1.0, D);
  B.box('woodDark', x, y + 1.04, z, W + 0.12, 0.06, D + 0.12, { col: false });
  // a kick board and a panelled front
  B.box('woodGrey', x, y + 0.06, z, W + 0.04, 0.12, D + 0.04, { col: false });
}
// ---- lootable furniture (bodies with moving parts are built in game/loot.js) ----
function loot(B, kind, x, y, z, ry) { const p = toWorld(B, x, y, z); registerLoot(kind, p.x, p.y, p.z, ry + B.ry); }
function rotCollider(B, x, y, z, w, h, d, ry) {
  const hw = Math.abs(Math.cos(ry)) * w / 2 + Math.abs(Math.sin(ry)) * d / 2, hd = Math.abs(Math.sin(ry)) * w / 2 + Math.abs(Math.cos(ry)) * d / 2;
  B.addCollider(x - hw, y, z - hd, x + hw, y + h, z + hd);
}
export { rotCollider };
export function cabinet(B, x, y, z, ry) {
  B.box('woodDark', x, y + 0.95, z, 0.9, 1.9, 0.45, { ry });
  loot(B, 'cabinet', x, y, z, ry); // the doors open, so they live in game/loot.js
}
export function chest(B, x, y, z, ry) { rotCollider(B, x, y, z, 0.92, 0.48, 0.52, ry); loot(B, 'chest', x, y, z, ry); }
export function dresser(B, x, y, z, ry) { rotCollider(B, x, y, z, 1.04, 0.96, 0.49, ry); loot(B, 'drawer', x, y, z, ry); }
export function safe(B, x, y, z, ry) { rotCollider(B, x, y, z, 0.8, 1.0, 0.72, ry); loot(B, 'safe', x, y, z, ry); }
export function locker(B, x, y, z, ry) { rotCollider(B, x, y, z, 0.7, 1.9, 0.45, ry); loot(B, 'locker', x, y, z, ry); }
export function fireplace(B, x, y, z, ry, roofY) {
  const [ox, oz] = rot(0, -0.15, ry);
  B.box('brick', x + ox, y + 0.75, z + oz, 1.6, 1.5, 0.7, { ry: ry });
  const [ix, iz] = rot(0, 0.2, ry);
  B.box('black', x + ix, y + 0.45, z + iz, 0.9, 0.75, 0.02, { ry, col: false });
  const [mx, mz] = rot(0, 0.22, ry);
  B.box('woodDark', x + mx, y + 1.42, z + mz, 1.9, 0.08, 0.3, { ry, col: false });
  const [cx, cz] = rot(0, -0.45, ry);
  B.box('brick', x + cx, (y + 1.5 + roofY + 1.4) / 2, z + cz, 0.75, roofY + 1.4 - y - 1.5, 0.6, { ry, col: false });
  // the chimney cap above the roof
  B.box('brick', x + cx, roofY + 1.45, z + cz, 0.95, 0.12, 0.8, { ry, col: false });
}
export function stove(B, x, y, z, topY) {
  B.box('iron', x, y + 0.45, z, 0.7, 0.75, 0.55);
  B.geom('iron', new THREE.CylinderGeometry(0.08, 0.08, topY - y - 0.8, 8), _m4.makeTranslation(x, (y + 0.8 + topY) / 2, z));
  // a rain cap on the pipe where it leaves the roof
  B.geom('iron', new THREE.ConeGeometry(0.2, 0.18, 8), _m4.makeTranslation(x, topY + 0.1, z));
}
export function pew(B, x, y, z, w) {
  B.box('woodDark', x, y + 0.45, z, w, 0.06, 0.42);
  B.box('woodDark', x, y + 0.75, z - 0.2, w, 0.6, 0.05, { col: false });
  for (const sx of [-1, 1]) B.box('woodDark', x + sx * w / 2, y + 0.45, z, 0.06, 0.9, 0.46, { col: false });
}
export function bars(B, x0, x1, z, y, h, gap) {
  for (let x = x0; x <= x1; x += 0.14) { if (gap && x > gap[0] && x < gap[1]) continue; B.box('iron', x, y + h / 2, z, 0.035, h, 0.035, { col: false }); }
  B.box('iron', (x0 + x1) / 2, y + h, z, x1 - x0, 0.06, 0.06, { col: false });
  B.box('iron', (x0 + x1) / 2, y + 0.05, z, x1 - x0, 0.06, 0.06, { col: false });
  if (gap) { B.addCollider(x0, y, z - 0.05, gap[0], y + h, z + 0.05); B.addCollider(gap[1], y, z - 0.05, x1, y + h, z + 0.05); }
  else B.addCollider(x0, y, z - 0.05, x1, y + h, z + 0.05);
}
export function barsZ(B, z0, z1, x, y, h) {
  for (let z = z0; z <= z1; z += 0.14) B.box('iron', x, y + h / 2, z, 0.035, h, 0.035, { col: false });
  B.box('iron', x, y + h, (z0 + z1) / 2, 0.06, 0.06, z1 - z0, { col: false });
  B.addCollider(x - 0.05, y, z0, x + 0.05, y + h, z1);
}
export function stairs(B, x0, x1, z0, y0, rise, dirZ = 1) {
  const n = Math.ceil(rise / 0.2), rh = rise / n, run = 0.28;
  for (let i = 0; i < n; i++) {
    const z = z0 + dirZ * (i + 0.5) * run, top = y0 + (i + 1) * rh;
    B.box('woodDark', (x0 + x1) / 2, (y0 + top) / 2, z, x1 - x0, top - y0, run);
  }
  return n * run;
}
