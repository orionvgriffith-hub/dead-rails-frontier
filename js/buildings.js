// Western building types assembled from parts, with furnished interiors
import { registerHeat } from './game/registry.js';
import { T, FH, Y0, GLAZE, wallRun, windowSlots, gableEnd, gableRoof, sign, porch, table, chair, bed, shelf, counter, cabinet, chest, dresser, safe, locker, fireplace, stove, pew, bars, barsZ, stairs, prop, rotCollider } from './parts.js';

const PI = Math.PI;

// shelf stock for particular trades: each puts one item down at a shelf position
const CLOTHS = [0x7a2a2a, 0x2a3a5a, 0x5a6a3a, 0xd8ccb0, 0x3a2a28, 0x8a6a8a, 0xb89a5a, 0x4a4a4a];
function boltGoods(B, x, y, z, ry, rnd) { B.box('cloth', x, y + 0.12, z, 0.12, 0.2, 0.34, { ry, col: false, c: CLOTHS[Math.floor(rnd() * CLOTHS.length)] }); }
function ammoGoods(B, x, y, z, ry, rnd) {
  const t = rnd();
  if (t < 0.6) B.box('paper', x, y + 0.05, z, 0.12, 0.08, 0.08, { ry, col: false, c: [0xa83a2a, 0x3a6a3a, 0xd8c890][Math.floor(rnd() * 3)] }); // cartridge boxes
  else if (t < 0.8) B.box('metal', x, y + 0.08, z, 0.08, 0.14, 0.08, { ry, col: false }); // powder tins
  else B.box('iron', x, y + 0.03, z, 0.24, 0.04, 0.06, { ry: ry + (rnd() - 0.5) * 0.4, col: false }); // a pistol
}
function oreGoods(B, x, y, z, ry, rnd) {
  if (rnd() < 0.7) B.box('stone', x, y + 0.05, z, 0.1 + rnd() * 0.06, 0.08, 0.1, { ry: rnd() * 3, col: false, c: [0x8a7a6a, 0x6a5a4a, 0xa08a50, 0x5a6a6a][Math.floor(rnd() * 4)] });
  else B.box('glass', x, y + 0.08, z, 0.07, 0.14, 0.07, { ry, col: false }); // sample jars
}
function bottleGoods(B, x, y, z, ry, rnd) {
  const t = rnd();
  if (t < 0.7) B.box('bottle', x, y + 0.1, z, 0.06, 0.18 + rnd() * 0.06, 0.06, { ry, col: false });
  else B.box('paper', x, y + 0.06, z, 0.1, 0.1, 0.07, { ry, col: false, c: 0xe8e0cc }); // pill boxes
}

export const DEFAULTS = {
  saloon: { w: 10, d: 14, floors: 2, roof: 'front', falseFront: true, sign: 'SALOON', porch: 'balcony', doorW: 1.5 },
  hotel: { w: 12, d: 12, floors: 2, roof: 'front', falseFront: true, sign: 'HOTEL', porch: 'balcony' },
  store: { w: 9, d: 12, floors: 1, roof: 'front', falseFront: true, sign: 'GENERAL STORE', porch: 'awning', winW: 1.7 },
  sheriff: { w: 8, d: 10, floors: 1, roof: 'front', falseFront: true, sign: 'SHERIFF', porch: 'awning' },
  bank: { w: 8, d: 10, floors: 1, roof: 'flat', sign: 'BANK', porch: 'none', paint: 'brick' },
  shop: { w: 6.5, d: 9, floors: 1, roof: 'front', falseFront: true, porch: 'awning' },
  house: { w: 7, d: 7.5, floors: 1, roof: 'side', porch: 'awning', hitch: false },
  church: { w: 8, d: 16, floors: 1, wallH: 4.6, roof: 'front', porch: 'none', paint: 'woodWhite', winH: 2.6 },
  barn: { w: 12, d: 16, floors: 1, wallH: 5.2, roof: 'front', porch: 'none', paint: 'woodRed', doorW: 3.8, doorH: 3.8 },
  warehouse: { w: 12, d: 18, floors: 1, wallH: 4.6, roof: 'front', porch: 'none', doorW: 3.2, doorH: 3.4, roofMat: 'tin' },
  station: { w: 13, d: 7, floors: 1, wallH: 3.6, roof: 'side', porch: 'none', paint: 'woodOchre', ov: 2.2 },
  shed: { w: 4.5, d: 4, floors: 1, wallH: 2.6, roof: 'side', porch: 'none' },
  // an open-fronted smithy: big doors stood back, forge and chimney at the rear
  smithy: { w: 8, d: 9, floors: 1, wallH: 3.6, roof: 'side', porch: 'none', paint: 'woodDark', doorW: 3.2, doorH: 3.0, sign: 'BLACKSMITH', roofMat: 'tin' },
  // a doctor's surgery or a small hospital: waiting room in front, ward and operating table behind
  clinic: { w: 10, d: 12, floors: 1, wallH: 3.5, roof: 'front', falseFront: true, sign: 'DOCTOR', porch: 'awning', paint: 'woodWhite' },
};

export function building(B, spec, rnd) {
  const s = Object.assign({}, DEFAULTS[spec.type], spec);
  const w = s.w, d = s.d, hx = w / 2, hz = d / 2, floors = s.floors, WH = s.wallH || FH;
  const top = Y0 + floors * WH, dmg = s.damage || 0, paint = s.paint || 'woodGrey', trim = s.trim || 'woodDark';
  const roofMat = s.roofMat || (rnd() < 0.5 ? 'tin' : 'shingle');
  const ix0 = -hx + T, ix1 = hx - T, iz0 = -hz + T, iz1 = hz - T;
  const ctx = { s, w, d, hx, hz, top, ix0, ix1, iz0, iz1, WH, roofMat };
  B.dark = { hx, hz, top: top + 0.05 };
  // the windows show how a place is kept: s.kept (0..1, the town's upkeep) and the damage decide glass, curtains, shutters
  const kept = s.kept ?? 0.6, homely = ['house', 'hotel', 'saloon', 'clinic', 'shop'].includes(s.type);
  Object.assign(GLAZE, {
    p: dmg >= 2 ? 0.08 : dmg === 1 ? 0.35 + kept * 0.3 : 0.6 + kept * 0.38,
    curtain: dmg === 0 && homely ? 0.65 : dmg === 1 && homely ? 0.25 : 0,
    cloth: s.curtain || 0, shutter: s.type === 'house' || s.type === 'hotel' ? 0.45 : 0.15, shutterMat: trim,
    noDoor: dmg === 0 ? 0 : dmg === 1 ? 0.12 : 0.35,
  });

  B.box('woodDark', 0, (Y0 - 0.1) / 2, 0, w, Y0 - 0.1, d);
  B.box('floor', 0, Y0 - 0.05, 0, w - 2 * T, 0.1, d - 2 * T);

  // stair well for multi storey buildings
  const sx0 = ix0, sx1 = ix0 + 1.0, sz0 = iz0 + 0.2;
  let srun = 0;
  for (let f = 0; f < floors; f++) {
    const fy = Y0 + f * WH, y0 = f === 0 ? 0.2 : fy - 0.12, y1 = Y0 + (f + 1) * WH;
    // front
    const front = [];
    if (f === 0) {
      const dw = s.doorW || 1.2, dh = s.doorH || 2.3, dx = s.doorX || 0;
      front.push({ a0: dx - dw / 2, a1: dx + dw / 2, b0: fy, b1: fy + dh, kind: 'door', batwing: s.type === 'saloon', noLeaf: s.type === 'barn' || s.type === 'warehouse' || s.type === 'smithy' });
      if (s.type === 'barn') front.push({ a0: -1, a1: 1, b0: fy + WH * 0.75 + 0.1, b1: fy + WH * 0.75 + 1.3, kind: 'loft' });
      else if (s.type !== 'warehouse')
        for (const c of windowSlots(-hx + 0.4, hx - 0.4, s.winW ? s.winW + 1.4 : 2.4, [[dx - dw / 2 - 0.6, dx + dw / 2 + 0.6]])) {
          const ww = s.winW || 1.0; front.push({ a0: c - ww / 2, a1: c + ww / 2, b0: fy + (s.winW ? 0.6 : 0.9), b1: fy + (s.winH || 2.1), kind: 'win' });
        }
    } else {
      if (s.porch === 'balcony') front.push({ a0: -0.6, a1: 0.6, b0: fy, b1: fy + 2.2, kind: 'door' });
      for (const c of windowSlots(-hx + 0.4, hx - 0.4, 2.4, s.porch === 'balcony' ? [[-1.2, 1.2]] : [])) front.push({ a0: c - 0.5, a1: c + 0.5, b0: fy + 0.9, b1: fy + 2.1, kind: 'win' });
    }
    wallRun(B, paint, 'x', hz - T / 2, -hx, hx, y0, y1, front, 1, rnd, trim);
    // back
    const back = [];
    if (f === 0 && s.type !== 'church') back.push({ a0: hx - 2.1, a1: hx - 1.1, b0: fy, b1: fy + 2.2, kind: 'door' });
    if (s.type !== 'barn' && s.type !== 'warehouse')
      for (const c of windowSlots(-hx + 0.5, hx - 2.4, 2.8)) back.push({ a0: c - 0.45, a1: c + 0.45, b0: fy + 1.0, b1: fy + 2.0, kind: 'win' });
    wallRun(B, paint, 'x', -hz + T / 2, -hx, hx, y0, y1, back, -1, rnd, trim);
    // sides
    for (const side of [-1, 1]) {
      const ops = [];
      if (!s.blindSides && s.type !== 'barn') {
        const wh = s.winH || 2.1, avoid = (side < 0 && floors > 1) ? [[sz0, sz0 + 5]] : [];
        for (const c of windowSlots(iz0 + 0.3, iz1 - 0.3, s.type === 'church' ? 3.2 : 3.0, avoid)) ops.push({ a0: c - 0.5, a1: c + 0.5, b0: fy + (s.type === 'church' ? 1.2 : 0.9), b1: fy + wh + (s.type === 'church' ? 0.6 : 0), kind: 'win' });
      }
      let yy1 = y1;
      if (dmg >= 2 && side > 0) { if (f > 0) continue; yy1 = Math.min(y1, fy + 1.0 + rnd() * 1.4); }
      wallRun(B, paint, 'z', side * (hx - T / 2), iz0, iz1, y0, yy1, ops, side, rnd, trim);
    }
    // floor above with stairwell
    if (f < floors - 1) {
      const yF = Y0 + (f + 1) * WH;
      srun = stairs(B, sx0, sx1, sz0, fy, WH, 1);
      const hx1 = sx1 + 0.05, hz1 = sz0 + srun;
      B.box('floor', (hx1 + ix1) / 2, yF - 0.06, 0, ix1 - hx1, 0.12, d - 2 * T);
      B.box('floor', (ix0 + hx1) / 2, yF - 0.06, (iz0 + sz0) / 2, hx1 - ix0, 0.12, sz0 - iz0);
      B.box('floor', (ix0 + hx1) / 2, yF - 0.06, (hz1 + iz1) / 2, hx1 - ix0, 0.12, iz1 - hz1);
      B.box('woodDark', hx1 + 0.03, yF + 0.95, (sz0 + hz1 - 0.6) / 2, 0.06, 0.06, hz1 - 0.6 - sz0, { col: false });
      for (let z = sz0; z < hz1 - 0.6; z += 0.45) B.box('woodDark', hx1 + 0.03, yF + 0.48, z, 0.04, 0.95, 0.04, { col: false });
      B.addCollider(hx1, yF, sz0, hx1 + 0.08, yF + 1.0, hz1 - 0.6);
      B.box('woodDark', (ix0 + hx1) / 2, yF + 0.95, sz0 + 0.03, hx1 - ix0, 0.06, 0.06);
      B.addCollider(ix0, yF, sz0, hx1, yF + 1.0, sz0 + 0.08);
    }
  }

  // trim: corner boards, a base board along the foot of the walls, a frieze board under the eaves
  const cornerTop = dmg >= 2 ? Y0 + 1.2 : top;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const yt = sx > 0 ? cornerTop : top;
    B.box(trim, sx * (hx + 0.03), (0.2 + yt) / 2, sz * (hz + 0.03), 0.2, yt - 0.2, 0.2, { col: false });
  }
  for (const sz of [-1, 1]) B.box(trim, 0, Y0 + 0.12, sz * (hz + 0.04), w, 0.24, 0.05, { col: false });
  for (const sx of [-1, 1]) B.box(trim, sx * (hx + 0.04), Y0 + 0.12, 0, 0.05, 0.24, d, { col: false });
  if (dmg < 2) { for (const sz of [-1, 1]) B.box(trim, 0, top - 0.14, sz * (hz + 0.04), w, 0.26, 0.05, { col: false }); for (const sx of [-1, 1]) B.box(trim, sx * (hx + 0.04), top - 0.14, 0, 0.05, 0.26, d, { col: false }); }

  // roof
  const pitch = s.type === 'church' ? 0.75 : s.type === 'barn' ? 0.62 : s.type === 'station' ? 0.36 : 0.45;
  const ov = s.ov || 0.35;
  let ridgeY = top;
  if (s.roof === 'flat') {
    B.box(roofMat === 'tin' ? 'tin' : 'woodDark', 0, top + 0.05, 0, w, 0.1, d, { col: false });
    for (const sz of [-1, 1]) B.box(paint, 0, top + 0.35, sz * (hz - T / 2), w + 0.1, 0.7, T + 0.05, { col: false });
    for (const sx of [-1, 1]) B.box(paint, sx * (hx - T / 2), top + 0.35, 0, T + 0.05, 0.7, d, { col: false });
    B.box(trim, 0, top + 0.72, hz, w + 0.4, 0.12, 0.3, { col: false });
  } else {
    const alongZ = s.roof === 'front';
    const ta = Math.tan(pitch);
    if (alongZ) { gableEnd(B, paint, 'x', hz - T / 2, w, top, ta); gableEnd(B, paint, 'x', -hz + T / 2, w, top, ta); }
    else { gableEnd(B, paint, 'z', hx - T / 2, d, top, ta); gableEnd(B, paint, 'z', -hx + T / 2, d, top, ta); }
    ridgeY = gableRoof(B, roofMat, w, d, top, pitch, ov, dmg, rnd, alongZ, dmg > 0 || s.type === 'barn' || s.type === 'warehouse');
    if (dmg === 0 && s.type !== 'barn' && s.type !== 'warehouse' && s.type !== 'church')
      B.box('woodGrey', 0, top + 0.02, 0, w - 2 * T, 0.06, d - 2 * T, { col: false });
  }
  ctx.ridgeY = ridgeY;
  if (s.falseFront) {
    const ff = Math.max(top + 1.9, ridgeY + 0.5);
    B.box(paint, 0, (top + ff) / 2, hz - T / 2, w + 0.2, ff - top, T, { col: false });
    B.box(trim, 0, ff + 0.08, hz - T / 2 + 0.1, w + 0.5, 0.16, T + 0.3, { col: false });
    for (const sx of [-1, 1]) B.box(trim, sx * (w / 2 + 0.05), (top + ff) / 2, hz - T / 2 + 0.06, 0.18, ff - top, T + 0.1, { col: false });
    if (s.sign) sign(B, s.sign, 0, top + (ff - top) * 0.5, hz + 0.04, Math.min(w * 0.8, 7.5), Math.min(0.95, (ff - top) * 0.6));
    // a bracketed cornice along the top of the false front
    B.box(trim, 0, ff - 0.12, hz - T / 2 + 0.14, w + 0.3, 0.1, 0.22, { col: false });
    for (let x = -w / 2 + 0.2; x <= w / 2 - 0.15; x += 0.42) B.box(trim, x, ff - 0.28, hz - T / 2 + 0.12, 0.1, 0.22, 0.16, { col: false });
  } else if (s.sign && s.type === 'bank') sign(B, s.sign, 0, top - 0.55, hz + 0.04, w * 0.6, 0.65, 0, { bg: '#2a2622', fg: '#e8d7a8' });
  // trades without a false front hang their board over the door
  else if (s.sign && s.type !== 'house' && s.type !== 'station') sign(B, s.sign, s.doorX || 0, Y0 + (s.doorH || 2.3) + 0.45, hz + 0.1, Math.min(w * 0.7, 4.2), 0.5);
  // a brick chimney stack up the outside of a side wall, for the bigger buildings that burn a lot of wood
  if (dmg < 2 && ['saloon', 'hotel', 'clinic', 'sheriff', 'store'].includes(s.type)) {
    const cz = -hz * 0.35, stackTop = Math.max(ridgeY, top) + 1.3;
    B.box('brick', -(hx + 0.55), stackTop / 2, cz, 0.7, stackTop, 0.95);
    B.box('brick', -(hx + 0.55), stackTop + 0.08, cz, 0.85, 0.16, 1.1, { col: false });
  }
  if (s.porch === 'awning' || s.porch === 'balcony')
    porch(B, w, d, rnd, { balcony: s.porch === 'balcony', roofMat, hitch: s.hitch, damaged: dmg >= 1 && rnd() < 0.5, missingPost: dmg >= 2 });
  else if (s.type !== 'station' && s.type !== 'church') B.box('woodDark', s.doorX || 0, 0.15, hz + 0.35, (s.doorW || 1.2) + 0.6, 0.3, 0.7);

  // debris for damaged buildings
  if (dmg >= 2) for (let i = 0; i < 9; i++) {
    const x = hx + 0.5 + rnd() * 2.5, z = (rnd() - 0.5) * d;
    B.box('woodGrey', x, 0.06 + rnd() * 0.2, z, 0.2, 0.04, 1.5 + rnd() * 2.5, { ry: rnd() * PI, rz: rnd() * 0.3, col: false });
  }
  if (dmg >= 1) for (let i = 0; i < 4; i++) B.box('woodGrey', ix0 + 0.5 + rnd() * (w - 2), Y0 + 0.04, iz0 + 0.5 + rnd() * (d - 2), 0.18, 0.04, 1 + rnd() * 1.5, { ry: rnd() * PI, col: false });

  if (!s.noFurnish && FURNISH[s.type]) FURNISH[s.type](B, ctx, rnd);
  // indoors is out of the wind: a sheltered spot for anyone getting cold (the roof has to be there)
  if (dmg < 2) { const e = B.base.elements; registerHeat(e[12], e[13] + Y0, e[14], Math.min(hx, hz) - 0.2, s.type === 'saloon' || s.type === 'hotel' || s.type === 'store' ? 14 : 10, 'shelter'); }
  B.dark = null;
  return ctx;
}

function upperRooms(B, c, rnd, yF) {
  const { ix0, ix1, iz1, top } = c, zp = 0.6;
  const n = c.w > 11 ? 3 : 2, rw = (ix1 - ix0) / n, ops = [];
  for (let i = 0; i < n; i++) { const xc = ix0 + rw * (i + 0.5) + (i === 0 ? 0.4 : 0); ops.push({ a0: xc - 0.45, a1: xc + 0.45, b0: yF, b1: yF + 2.15, kind: 'door' }); }
  wallRun(B, 'woodWhite', 'x', zp, ix0, ix1, yF, top, ops, -1, rnd);
  for (let i = 1; i < n; i++) wallRun(B, 'woodWhite', 'z', ix0 + rw * i, zp + T / 2, iz1, yF, top, [], 1, rnd);
  for (let i = 0; i < n; i++) {
    const xc = ix0 + rw * (i + 0.5);
    bed(B, xc - rw / 2 + 0.65, yF, iz1 - 1.1, false, rnd);
    if (rnd() < 0.7) chair(B, xc + rw / 2 - 0.5, yF, zp + 0.8, rnd() * PI, rnd() < 0.3);
    if (rnd() < 0.5) chest(B, xc - rw / 2 + 0.65, yF, iz1 - 2.65, PI / 2); else dresser(B, xc - rw / 2 + 1.75, yF, iz1 - 0.3, PI);
    if (rnd() < 0.6) cabinet(B, xc + rw / 2 - 0.55, yF, iz1 - 0.3, PI);
    else table(B, xc + rw / 2 - 0.6, yF, iz1 - 0.7, 0.6, 0.5);
  }
  // corridor bits
  chair(B, ix1 - 0.6, yF, -1.5, -PI / 2, true);
}

const FURNISH = {
  store(B, c, rnd) {
    const { ix0, ix1, iz0, iz1, top } = c, y = Y0;
    counter(B, ix1 - 1.4, y, (iz0 + iz1) / 2 - 0.5, iz1 - iz0 - 4.5, 0.6, true);
    for (let z = iz0 + 1.2; z < iz1 - 2; z += 2.1) shelf(B, ix1 - 0.22, y, z, 2.0, 2.3, -PI / 2, rnd);
    for (let x = ix0 + 1.1; x < ix1 - 2.5; x += 2.1) shelf(B, x, y, iz0 + 0.22, 2.0, 2.3, 0, rnd);
    for (let z = iz0 + 2.5; z < iz1 - 1.5; z += 2.1) shelf(B, ix0 + 0.22, y, z, 2.0, 2.0, PI / 2, rnd);
    stove(B, 0, y, iz0 + 2.6, top + 1.2);
    prop(B, 'barrel', ix0 + 1.5, y, iz1 - 1.2, rnd() * 6); prop(B, 'barrel', ix0 + 2.3, y, iz1 - 1.0, rnd() * 6);
    prop(B, 'crate', 0.8, y, iz1 - 1.6, rnd()); prop(B, 'sack', -0.4, y, 0.5, rnd() * 6);
    table(B, -0.6, y, -0.6, 1.0, 1.0); chair(B, -0.6, y, 0.3, PI); chair(B, 0.4, y, -0.7, PI / 2, true);
    // a cracker barrel with a checkerboard, a platform scale on the counter, flour sacks stacked by the door
    B.box('paper', -0.6, y + 0.79, -0.6, 0.4, 0.01, 0.4, { col: false, c: 0x2a1a12 });
    const cx = ix1 - 1.4, cz = (iz0 + iz1) / 2 - 0.5;
    B.box('iron', cx, y + 1.12, cz + 0.8, 0.3, 0.1, 0.4, { col: false });
    B.box('metal', cx, y + 1.3, cz + 0.8, 0.34, 0.02, 0.34, { col: false });
    B.box('iron', cx, y + 1.2, cz + 0.65, 0.03, 0.2, 0.03, { col: false });
    for (let i = 0; i < 4; i++) prop(B, 'sack', ix0 + 0.7 + (i % 2) * 0.6, y + Math.floor(i / 2) * 0.3, iz1 - 2.4, rnd() * 0.4);
    for (let i = 0; i < 3; i++) B.box('iron', -1.5 + i * 1.5, top - 0.3, 0, 0.18, 0.26, 0.18, { col: false });
  },
  saloon(B, c, rnd) {
    const { ix0, ix1, iz0, iz1, top } = c, y = Y0;
    counter(B, ix1 - 1.6, y, -0.5, iz1 - iz0 - 5.5, 0.65, true);
    for (let z = iz0 + 1.5; z < iz1 - 3.5; z += 2.1) shelf(B, ix1 - 0.22, y, z, 2.0, 2.0, -PI / 2, rnd);
    B.box('glass', ix1 - 0.05, y + 2.5, -0.5, 0.02, 0.8, 4, { col: false });
    for (let i = 0; i < 4; i++) B.box('woodDark', ix1 - 2.3, y + 0.38, -3.5 + i * 1.6, 0.36, 0.06, 0.36, { col: false }), B.box('woodDark', ix1 - 2.3, y + 0.2, -3.5 + i * 1.6, 0.08, 0.38, 0.08);
    const tabs = [[-1.2, -1.0], [0.6, 1.6], [-1.6, 3.2], [1.2, -3.6]];
    for (const [tx, tz] of tabs) {
      table(B, tx, y, tz, 0.9, 0.9);
      for (let k = 0; k < 4; k++) { const a = k * PI / 2 + (rnd() - 0.5) * 0.5; chair(B, tx + Math.sin(a) * 0.75, y, tz + Math.cos(a) * 0.75, a + PI, rnd() < 0.25); }
      if (rnd() < 0.6) B.box('bottle', tx + 0.2, y + 0.9, tz, 0.07, 0.24, 0.07, { col: false });
    }
    B.box('woodDark', ix0 + 0.5, y + 0.65, iz1 - 1.6, 0.7, 1.3, 1.6);
    B.box('woodWhite', ix0 + 0.95, y + 0.82, iz1 - 1.6, 0.25, 0.05, 1.45, { col: false });
    chair(B, ix0 + 1.4, y, iz1 - 1.6, -PI / 2);
    prop(B, 'barrel', ix1 - 0.7, y, iz1 - 0.9, 1);
    upperRooms(B, c, rnd, Y0 + c.WH);
  },
  hotel(B, c, rnd) {
    const { ix0, ix1, iz0, iz1 } = c, y = Y0;
    counter(B, 1.2, y, iz0 + 2.6, ix1 - 1.4 - 1.2 + 1.6, 0.6, false);
    shelf(B, 1.8, y, iz0 + 0.22, 2.4, 1.8, 0, rnd, false);
    B.box('cloth', -1.5, y + 0.25, iz1 - 1.2, 2.0, 0.5, 0.8); B.box('cloth', -1.5, y + 0.65, iz1 - 0.85, 2.0, 0.6, 0.2, { col: false });
    table(B, 1.6, y, 1.6, 0.8, 0.8); chair(B, 1.6, y, 2.4, PI); chair(B, 2.4, y, 1.6, -PI / 2, true);
    prop(B, 'crate', ix1 - 0.6, y, iz1 - 0.6, 0.4);
    upperRooms(B, c, rnd, Y0 + c.WH);
  },
  sheriff(B, c, rnd) {
    const { ix0, ix1, iz0, iz1, top } = c, y = Y0;
    table(B, -1.2, y, 1.0, 1.5, 0.8); chair(B, -1.2, y, 0.3, 0); chair(B, -1.2, y, 1.8, PI, true);
    cabinet(B, ix0 + 0.3, y, -0.8, PI / 2);
    locker(B, ix0 + 0.3, y, 1.6, PI / 2);
    const cz = iz0 + 3.0;
    bars(B, 0.6, ix1, cz, y, 2.6, [1.6, 2.4]); barsZ(B, iz0, cz, 0.6, y, 2.6);
    B.box('iron', 2.0 + 0.4, y + 1.3, cz + 0.5, 0.8, 2.5, 0.04, { ry: 0.9, col: false });
    bed(B, ix1 - 0.6, y, iz0 + 1.4, false, rnd);
    stove(B, -1.8, y, iz0 + 1.0, top + 1.2);
  },
  bank(B, c, rnd) {
    const { ix0, ix1, iz0, iz1 } = c, y = Y0;
    counter(B, -0.8, y, 0, ix1 - ix0 - 1.6, 0.6, false);
    bars(B, ix0, ix1 - 1.6, 0, y + 1.07, 1.0);
    safe(B, ix0 + 0.8, y, iz0 + 0.45, 0);
    table(B, 1.5, y, iz0 + 1.6, 1.4, 0.8); chair(B, 1.5, y, iz0 + 0.9, 0);
    cabinet(B, ix1 - 0.3, y, iz0 + 2.8, -PI / 2);
    prop(B, 'sack', ix0 + 1.6, y, iz0 + 0.5, 2);
  },
  shop(B, c, rnd) {
    const { ix0, ix1, iz0, iz1, top } = c, y = Y0, n = c.s.sign || '', cw = ix1 - ix0 - 1.6, cz = iz0 + 2.3;
    const tailor = /TAILOR|DRESS|FUR|MILLIN/.test(n), gun = n.includes('GUN'), assay = n.includes('ASSAY');
    // each trade stocks its own shelves
    const goods = tailor ? boltGoods : gun ? ammoGoods : assay ? oreGoods : true;
    counter(B, 0.3, y, cz, cw, 0.6, false);
    shelf(B, 0.3, y, iz0 + 0.22, cw, 2.2, 0, rnd, goods);
    if (n.includes('UNDERTAKER')) for (let i = 0; i < 3; i++) B.box('woodDark', ix0 + 0.4, y + 1.0, iz1 - 1.4 - i * 0.8, 0.3, 2.0, 0.6, { rz: -0.12, col: false });
    else if (n.includes('BARBER')) { B.box('cloth', 0.5, y + 0.55, 1.2, 0.7, 0.2, 0.7); B.box('iron', 0.5, y + 0.25, 1.2, 0.2, 0.5, 0.2); B.box('cloth', 0.5, y + 1.0, 0.85, 0.7, 0.8, 0.12, { col: false }); B.box('glass', ix1 - 0.05, y + 1.6, 1.2, 0.02, 0.9, 1.2, { col: false }); }
    else if (gun) {
      // a rack of long guns along the side wall, a glass case of pistols on the counter, a bench with a vise
      B.box('woodDark', ix1 - 0.06, y + 1.0, -0.2, 0.06, 0.12, 2.6, { col: false });
      B.box('woodDark', ix1 - 0.06, y + 1.75, -0.2, 0.06, 0.1, 2.6, { col: false });
      for (let i = 0; i < 7; i++) {
        const z = -1.35 + i * 0.38;
        B.box('woodDark', ix1 - 0.16, y + 0.55, z, 0.07, 0.6, 0.12, { rz: 0.1, col: false });
        B.box('iron', ix1 - 0.12, y + 1.3, z, 0.04, 0.95, 0.04, { rz: 0.1, col: false });
      }
      rotCollider(B, ix1 - 0.15, y, -0.2, 0.3, 1.9, 2.7, 0);
      const gw = Math.min(cw * 0.55, 2.4);
      B.box('glass', 0.3, y + 1.25, cz, gw, 0.38, 0.5, { col: false });
      B.box('woodDark', 0.3, y + 1.45, cz, gw + 0.05, 0.03, 0.55, { col: false });
      for (let x = 0.3 - gw / 2 + 0.25; x < 0.3 + gw / 2 - 0.15; x += 0.38) {
        B.box('iron', x, y + 1.11, cz, 0.22, 0.04, 0.05, { ry: (rnd() - 0.5) * 0.4, col: false });
        B.box('woodDark', x - 0.1, y + 1.1, cz + 0.04, 0.08, 0.04, 0.1, { ry: 0.3, col: false });
      }
      B.box('woodDark', ix0 + 0.5, y + 0.45, 1.3, 0.8, 0.9, 1.8);
      B.box('iron', ix0 + 0.6, y + 1.0, 1.0, 0.16, 0.2, 0.3, { col: false });
      B.box('iron', ix0 + 0.55, y + 0.93, 1.7, 0.4, 0.05, 0.05, { col: false });
      locker(B, ix0 + 0.3, y, iz1 - 2.0, PI / 2);
    }
    else if (tailor) {
      // a long cutting table with a bolt rolled out, two dressmaker's forms and a cheval mirror
      table(B, 0.4, y, 0.9, 2.0, 0.9);
      B.box('cloth', 0.3, y + 0.79, 0.9, 1.5, 0.01, 0.75, { col: false, c: [0x7a2a2a, 0x2a3a5a, 0x5a6a3a][Math.floor(rnd() * 3)] });
      B.box('cloth', 0.8, y + 0.86, 0.6, 0.8, 0.15, 0.15, { col: false, c: 0x8a6a4a });
      for (const [fx, fz] of [[ix0 + 0.8, 0.0], [ix1 - 0.9, 1.8]]) {
        B.box('iron', fx, y + 0.02, fz, 0.4, 0.04, 0.4, { col: false });
        B.box('woodDark', fx, y + 0.5, fz, 0.04, 0.95, 0.04, { col: false });
        B.box('cloth', fx, y + 1.25, fz, 0.38, 0.6, 0.26, { col: false, c: rnd() < 0.5 ? 0xd8ccb0 : 0x3a2a28 });
        B.box('cloth', fx, y + 1.0, fz, 0.48, 0.3, 0.34, { col: false, c: 0x5a3a3a });
        rotCollider(B, fx, y, fz, 0.45, 1.6, 0.4, 0);
      }
      B.box('woodDark', ix0 + 0.12, y + 1.0, iz1 - 2.2, 0.06, 1.9, 0.75);
      B.box('glass', ix0 + 0.16, y + 1.05, iz1 - 2.2, 0.01, 1.6, 0.6, { col: false });
      if (n.includes('FUR')) for (let i = 0; i < 4; i++) B.box('cloth', ix1 - 0.06, y + 1.6, -1.6 + i * 0.8, 0.04, 0.9, 0.55, { col: false, c: [0x5a3e28, 0x7a5a3a, 0x3a2a1e, 0x8a7a6a][i] });
    }
    else if (assay) {
      // balance scales on the counter, a small brick furnace for the crucibles, and a safe for the dust
      const sx = 0.3 + cw * 0.25;
      B.box('iron', sx, y + 1.25, cz, 0.04, 0.4, 0.04, { col: false });
      B.box('iron', sx, y + 1.45, cz, 0.5, 0.025, 0.025, { col: false });
      for (const d of [-0.22, 0.22]) B.box('metal', sx + d, y + 1.2, cz, 0.16, 0.02, 0.16, { col: false });
      B.box('glass', sx, y + 1.35, cz, 0.62, 0.42, 0.34, { col: false });
      B.box('brick', ix0 + 0.75, y + 0.6, -0.6, 1.1, 1.2, 1.0);
      B.box('black', ix0 + 1.31, y + 0.65, -0.6, 0.02, 0.35, 0.4, { col: false });
      B.box('brick', ix0 + 0.5, (y + 1.2 + top + 1.3) / 2, -0.6, 0.45, top + 0.1 - y, 0.45, { col: false });
      safe(B, ix0 + 0.6, y, iz1 - 1.2, PI / 2);
      for (let i = 0; i < 5; i++) B.box('stone', 0.6 + (rnd() - 0.5) * 0.6, y + 0.82, 1.2 + (rnd() - 0.5) * 0.4, 0.1 + rnd() * 0.08, 0.08, 0.1, { ry: rnd() * 3, col: false });
      table(B, 0.6, y, 1.2, 1.0, 0.8); chair(B, 0.6, y, 1.9, PI);
    }
    else { table(B, 0.6, y, 1.4, 1.0, 0.8); chair(B, 0.6, y, 2.1, PI, rnd() < 0.4); }
    if (!assay) stove(B, ix0 + 0.8, y, 0.5, top + 1.2);
    prop(B, 'crate', ix1 - 0.7, y, iz1 - 0.8, rnd());
    if (!gun) dresser(B, ix0 + 1.0, y, iz1 - 0.35, PI);
  },
  smithy(B, c, rnd) {
    const { ix0, ix1, iz0, iz1, ridgeY } = c, y = Y0;
    // the forge: a brick hearth with a glowing coal bed, a hood and a stack up through the roof
    const fx = ix0 + 1.2, fz = iz0 + 1.0;
    B.box('brick', fx, y + 0.45, fz, 2.0, 0.9, 1.5);
    B.box('black', fx, y + 0.92, fz + 0.1, 1.3, 0.05, 0.9, { col: false });
    B.box('lamp', fx, y + 0.95, fz + 0.1, 0.5, 0.03, 0.4, { col: false });
    B.box('brick', fx, y + 2.0, fz - 0.2, 1.6, 0.7, 1.0, { col: false });
    B.box('brick', fx, (y + 2.35 + ridgeY + 1.3) / 2, fz - 0.4, 0.6, ridgeY + 1.3 - y - 2.35, 0.6, { col: false });
    B.box('brick', fx, ridgeY + 1.35, fz - 0.4, 0.8, 0.12, 0.8, { col: false });
    // bellows on a frame beside the hearth
    B.box('woodDark', fx + 1.45, y + 0.5, fz, 0.5, 1.0, 0.5, { col: false });
    B.box('woodDark', fx + 1.45, y + 1.05, fz, 0.7, 0.06, 1.3, { rx: 0.12, col: false });
    B.box('cloth', fx + 1.45, y + 1.14, fz, 0.66, 0.14, 1.2, { rx: 0.08, col: false, c: 0x3a2618 });
    rotCollider(B, fx + 1.45, y, fz, 0.7, 1.2, 1.3, 0);
    // anvil on its stump, and the quench barrel within reach
    const ax = ix0 + 1.5, az = iz0 + 3.2;
    B.box('bark', ax, y + 0.33, az, 0.55, 0.66, 0.55);
    B.box('iron', ax, y + 0.72, az, 0.28, 0.12, 0.22, { col: false });
    B.box('iron', ax, y + 0.82, az, 0.16, 0.1, 0.14, { col: false });
    B.box('iron', ax, y + 0.93, az, 0.62, 0.13, 0.2, { col: false });
    B.box('iron', ax + 0.4, y + 0.95, az, 0.22, 0.08, 0.12, { col: false });
    B.box('iron', ax - 0.05, y + 1.01, az + 0.05, 0.3, 0.04, 0.04, { ry: 0.5, col: false });
    prop(B, 'barrel', ix0 + 2.6, y, iz0 + 2.7, rnd() * 6);
    // workbench with a leg vise down the right wall, tools racked on the back wall
    const bz = (iz0 + iz1) / 2 - 0.8;
    B.box('woodDark', ix1 - 0.45, y + 0.45, bz, 0.8, 0.9, 2.8);
    B.box('woodDark', ix1 - 0.45, y + 0.93, bz, 0.9, 0.06, 2.9, { col: false });
    B.box('iron', ix1 - 0.85, y + 1.02, bz + 0.8, 0.2, 0.16, 0.28, { col: false });
    B.box('iron', ix1 - 0.95, y + 0.5, bz + 0.8, 0.06, 1.0, 0.08, { col: false });
    B.box('woodDark', 0.9, y + 1.6, iz0 + 0.06, 2.4, 0.9, 0.04, { col: false });
    for (let i = 0; i < 8; i++) {
      const tx = -0.1 + i * 0.28, long = rnd() < 0.5;
      B.box('iron', tx, y + (long ? 1.45 : 1.65), iz0 + 0.12, 0.04, long ? 0.7 : 0.4, 0.04, { rz: (rnd() - 0.5) * 0.2, col: false });
      if (!long) B.box('woodDark', tx, y + 1.38, iz0 + 0.12, 0.03, 0.25, 0.03, { col: false });
    }
    for (let i = 0; i < 6; i++) B.box('iron', ix1 - 0.06, y + 2.1 + (i % 2) * 0.25, bz - 1.0 + i * 0.35, 0.02, 0.16, 0.14, { col: false });
    // coal heap and a stack of bar stock in the corner
    B.box('black', ix1 - 1.0, y + 0.15, iz0 + 0.9, 1.4, 0.3, 1.0, { ry: 0.3 });
    B.box('black', ix1 - 1.1, y + 0.36, iz0 + 0.85, 0.8, 0.2, 0.6, { ry: 0.7, col: false });
    for (let i = 0; i < 6; i++) B.box('iron', ix1 - 2.3 + i * 0.07, y + 0.04 + (i % 2) * 0.05, iz0 + 0.8, 0.05, 0.05, 1.8, { ry: 0.05 * i, col: false });
    prop(B, 'wheel', ix0 + 0.3, y, iz1 - 1.4, PI / 2);
    locker(B, ix1 - 0.3, y, iz1 - 1.2, -PI / 2);
  },
  clinic(B, c, rnd) {
    const { ix0, ix1, iz0, iz1, top } = c, y = Y0, zp = 0.5;
    // a partition splits the waiting room at the front from the ward and surgery behind
    wallRun(B, 'woodWhite', 'x', zp, ix0, ix1, y, top, [{ a0: -0.6, a1: 0.6, b0: y, b1: y + 2.2, kind: 'door' }], 1, rnd);
    table(B, ix1 - 1.4, y, 2.4, 1.4, 0.8); chair(B, ix1 - 1.4, y, 1.7, 0);
    B.box('paper', ix1 - 1.2, y + 0.79, 2.4, 0.3, 0.02, 0.22, { col: false });
    B.box('lamp', ix1 - 1.8, y + 0.88, 2.3, 0.12, 0.2, 0.12, { col: false });
    for (const z of [2.0, 3.6]) pew(B, ix0 + 1.8, y, z, 2.4);
    cabinet(B, ix1 - 0.3, y, iz1 - 1.6, -PI / 2);
    stove(B, ix0 + 0.8, y, 1.1, top + 1.2);
    // ward: iron beds along the left wall, each with a screen
    for (let i = 0; i < 3; i++) {
      const bz = iz0 + 1.0 + i * 1.5;
      bed(B, ix0 + 1.1, y, bz, true, rnd);
      if (i < 2) B.box('cloth', ix0 + 1.0, y + 0.9, bz + 0.75, 1.6, 1.5, 0.03, { col: false, c: 0xe8e0cc });
    }
    // surgery: a scrubbed operating table under a hanging lamp, an instrument tray, a wall of medicines
    const ox = ix1 - 1.7, oz = iz0 + 2.4;
    B.box('woodWhite', ox, y + 0.45, oz, 0.9, 0.9, 2.0);
    B.box('cloth', ox, y + 0.91, oz, 0.92, 0.02, 1.9, { col: false, c: 0xece6d6 });
    B.box('iron', ox, y + 2.6, oz, 0.02, 0.6, 0.02, { col: false });
    B.box('lamp', ox, y + 2.25, oz, 0.3, 0.2, 0.3, { col: false });
    table(B, ox - 1.2, y, oz + 0.4, 0.7, 0.5);
    for (let i = 0; i < 4; i++) B.box('metal', ox - 1.35 + i * 0.1, y + 0.79, oz + 0.4, 0.03, 0.01, 0.2, { col: false });
    B.box('bottle', ox - 0.95, y + 0.88, oz + 0.3, 0.06, 0.18, 0.06, { col: false });
    shelf(B, ix1 - 1.6, y, iz0 + 0.22, 2.0, 2.0, 0, rnd, bottleGoods);
    // folding screen between the ward and the table
    for (let i = 0; i < 3; i++) B.box('cloth', -0.1 + (i % 2) * 0.12, y + 0.9, iz0 + 1.6 + i * 0.6, 0.03, 1.6, 0.6, { ry: i % 2 ? 0.3 : -0.3, col: i === 1, c: 0xe0d8c4 });
    chest(B, ix0 + 0.6, y, zp - 0.6, PI / 2);
  },
  house(B, c, rnd) {
    const { ix0, ix1, iz0, iz1, ridgeY } = c, y = Y0;
    bed(B, ix1 - 0.65, y, iz0 + 1.1, false, rnd);
    chest(B, ix1 - 0.65, y, iz0 + 2.6, -PI / 2);
    if (rnd() < 0.6) dresser(B, ix1 - 1.95, y, iz0 + 0.35, 0);
    table(B, 0, y, 0.6, 1.1, 0.8);
    chair(B, -0.8, y, 0.6, PI / 2); chair(B, 0.8, y, 0.6, -PI / 2, rnd() < 0.5);
    fireplace(B, ix0 + 0.4, y, -0.5, PI / 2, ridgeY);
    cabinet(B, ix1 - 0.3, y, iz1 - 1.5, -PI / 2);
    B.box('cloth', 0, y + 0.005, 0.4, 2.2, 0.01, 1.6, { col: false });
    shelf(B, -0.6, y, iz0 + 0.22, 1.4, 1.2, 0, rnd);
  },
  church(B, c, rnd) {
    const { ix0, ix1, iz0, iz1, top, ridgeY, hz } = c, y = Y0;
    for (let z = iz1 - 2.5; z > iz0 + 4; z -= 1.3) {
      if (rnd() < 0.15) { B.box('woodDark', -1.9, y + 0.25, z, 2.6, 0.06, 0.42, { ry: 0.5, rz: 0.3, col: false }); } else pew(B, -1.9, y, z, 2.6);
      pew(B, 1.9, y, z, 2.6);
    }
    B.box('woodDark', 0, y + 0.2, iz0 + 1.6, ix1 - ix0, 0.4, 3.0);
    B.box('woodDark', 0, y + 0.85, iz0 + 1.2, 1.8, 0.9, 0.7);
    B.box('cloth', 0, y + 1.32, iz0 + 1.2, 1.9, 0.04, 0.8, { col: false });
    B.box('woodDark', 1.8, y + 0.95, iz0 + 2.6, 0.7, 1.1, 0.6);
    chest(B, ix0 + 0.6, y + 0.4, iz0 + 0.6, PI / 2);
    B.box('woodDark', 0, y + 3.0, iz0 + 0.05, 0.16, 2.0, 0.08, { col: false });
    B.box('woodDark', 0, y + 3.4, iz0 + 0.05, 1.0, 0.16, 0.08, { col: false });
    // steeple
    const tw = 2.6, tb = ridgeY - 1.2, tz = hz - 1.6;
    B.box('woodWhite', 0, (tb + ridgeY + 2.4) / 2, tz, tw, ridgeY + 2.4 - tb, tw, { col: false });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box('woodWhite', sx * (tw / 2 - 0.12), ridgeY + 3.4, tz + sz * (tw / 2 - 0.12), 0.22, 2.0, 0.22, { col: false });
    B.box('iron', 0, ridgeY + 3.6, tz, 0.7, 0.8, 0.7, { col: false });
    B.box('woodWhite', 0, ridgeY + 4.45, tz, tw + 0.2, 0.15, tw + 0.2, { col: false });
    for (let i = 0; i < 10; i++) { const r = (tw / 2 + 0.05) * (1 - i / 10), h = 0.55; B.box('shingle', 0, ridgeY + 4.6 + i * h, tz, r * 2, h, r * 2, { col: false }); }
    B.box('woodDark', 0, ridgeY + 10.4, tz, 0.1, 1.2, 0.1, { col: false }); B.box('woodDark', 0, ridgeY + 10.6, tz, 0.6, 0.1, 0.1, { col: false });
    B.box('woodDark', 0, 0.15, hz + 0.6, 2.2, 0.3, 1.2); B.box('woodDark', 0, 0.05, hz + 1.4, 2.2, 0.1, 0.5);
  },
  barn(B, c, rnd) {
    const { ix0, ix1, iz0, iz1, top } = c, y = Y0;
    for (const sx of [-1, 1]) for (let z = iz0 + 2.5; z < iz1 - 3; z += 2.6) {
      B.box('woodGrey', sx * (c.hx - 2.0), y + 0.7, z, 3.6, 1.4, 0.1);
      if (rnd() < 0.5) prop(B, 'hay', sx * (c.hx - 1.4), y, z + 1.3, rnd() * 3);
    }
    const ly = y + 3.0;
    B.box('floor', 0, ly, iz0 + 2.5, ix1 - ix0, 0.12, 5.0);
    for (let i = 0; i < 4; i++) prop(B, 'hay', -2 + i * 1.4, ly + 0.06, iz0 + 1.5, rnd());
    for (let r = 0.3; r < 3.0; r += 0.35) B.box('woodDark', 0, y + r, iz0 + 5.15 + r * 0.25, 0.6, 0.05, 0.08, { col: false });
    for (const sx of [-0.33, 0.33]) B.box('woodDark', sx, y + 1.5, iz0 + 5.5, 0.06, 3.1, 0.06, { rx: -0.25, col: false });
    prop(B, 'wheel', ix1 - 0.3, y, 1.5, 0); prop(B, 'cart', -1.0, y, 1.5, rnd() * 6);
    chest(B, 1.0, y, iz0 + 0.6, 0);
    B.box('woodGrey', 1.2 + 0.9, 2.0, c.hz + 0.9, 1.9, 3.7, 0.08, { ry: -1.0, col: false });
  },
  warehouse(B, c, rnd) {
    const { ix0, ix1, iz0, iz1, hz } = c, y = Y0;
    for (let i = 0; i < 16; i++) {
      const x = ix0 + 1 + rnd() * (ix1 - ix0 - 2), z = iz0 + 1 + rnd() * (iz1 - iz0 - 5);
      prop(B, rnd() < 0.6 ? 'crate' : 'barrel', x, y, z, rnd() * 6, 0.9 + rnd() * 0.3);
    }
    for (let z = iz0 + 1.5; z < iz1 - 3; z += 2.6) shelf(B, ix1 - 0.22, y, z, 2.4, 3.0, -PI / 2, rnd);
    B.box('woodDark', 0, 0.55, hz + 1.5, c.w, 1.1, 3.0);
  },
  station(B, c, rnd) {
    const { ix0, ix1, iz0, iz1, top } = c, y = Y0, px = ix1 - 3.6;
    wallRun(B, 'woodWhite', 'z', px, iz0, iz1, y, top, [{ a0: -1.6, a1: -0.8, b0: y, b1: y + 2.2, kind: 'door' }, { a0: 0.4, a1: 1.4, b0: y + 1.0, b1: y + 1.8, kind: 'ticket' }], -1, rnd);
    counter(B, px + 0.7, y, 0.9, 1.6, 0.6, true);
    table(B, ix1 - 1.3, y, iz0 + 0.9, 1.2, 0.7); chair(B, ix1 - 1.3, y, iz0 + 1.6, PI);
    shelf(B, ix1 - 0.22, y, 0.6, 1.4, 1.8, -PI / 2, rnd);
    for (let x = ix0 + 1.2; x < px - 1.5; x += 2.6) { pew(B, x, y, iz1 - 0.6, 2.0); }
    stove(B, ix0 + 1.0, y, iz0 + 1.0, top + 2);
    prop(B, 'crate', ix0 + 2.8, y, iz0 + 0.7, 0.2);
    locker(B, ix1 - 0.3, y, iz1 - 1.2, -PI / 2);
  },
  shed(B, c, rnd) {
    const { ix0, ix1, iz0, iz1 } = c, y = Y0;
    shelf(B, 0, y, iz0 + 0.22, 2.4, 1.6, 0, rnd);
    prop(B, 'shovel', ix1 - 0.3, y, 0.6, 0); prop(B, 'pickaxe', ix0 + 0.4, y, 0.8, 1);
    chest(B, ix1 - 0.4, y, -0.5, -PI / 2);
  },
};

// ------ structures that aren't enclosed buildings ------
export function waterTower(B, rnd) {
  const legH = 7.5, R = 3.1;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    B.box('woodDark', sx * 2.2, legH / 2, sz * 2.2, 0.32, legH, 0.32, { col: false });
    B.addCollider(sx * 2.2 - 0.2, 0, sz * 2.2 - 0.2, sx * 2.2 + 0.2, legH, sz * 2.2 + 0.2);
  }
  for (let y = 1.8; y < legH; y += 2.6) {
    for (const s of [-1, 1]) {
      B.box('woodDark', 0, y, s * 2.2, 4.4, 0.14, 0.14, { col: false });
      B.box('woodDark', s * 2.2, y, 0, 0.14, 0.14, 4.4, { col: false });
      B.box('woodGrey', 0, y + 1.3, s * 2.2, 5.4, 0.12, 0.08, { rz: s * 0.5, col: false });
      B.box('woodGrey', s * 2.2, y + 1.3, 0, 0.08, 0.12, 5.4, { rx: s * 0.5, col: false });
    }
  }
  B.box('woodDark', 0, legH + 0.1, 0, 6.6, 0.2, 6.6, { col: false });
  return { legH, R };
}
