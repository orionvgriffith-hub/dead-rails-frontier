// Travelling merchants: wagons that make camp beside the line for a while and move on, each with a trade of its own
// (provisioner, gunsmith, tinker, horse trader, snake-oil doctor), a stock drawn fresh every time with limited
// quantities, prices that change with the merchant and the region, the odd rare piece, and a special trade or two.
// The same shop screen serves the Cinder Flats stores and the stable hands at the liveries.
import * as THREE from 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/three.module.js';
import { ITEMS, ICONS, RARITY } from './items.js';
import { STATION_SPOTS } from './registry.js';
import { rail } from '../world.js';
import { railNearest, BRIDGE } from '../rail.js';
import { dominantBiome } from '../biomes.js';
import { horseMesh, animateHorse, COATS, randomCoat } from './horsemesh.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// what each trade carries [item, weight, qty], how it marks up, and what it pays best for
const TRADES = {
  provisioner: { title: 'Provisioner', names: ['Ma Kettering', 'Old Abner Pike', 'The Duval Sisters'], mark: 1.2, n: [7, 10],
    pool: [['beans', 5, 6], ['bread', 4, 4], ['jerky', 5, 10], ['coffee', 3, 4], ['canteen', 3, 2], ['venison', 2, 3], ['apple', 4, 8], ['carrot', 3, 8], ['oats', 3, 4], ['bandage', 4, 8], ['lampOil', 3, 3], ['firewood', 3, 4], ['coal', 3, 6], ['frozenRations', 1.5, 3], ['scarf', 1, 1], ['gloves', 1, 1], ['woolCoat', 0.6, 1]],
    likes: ['food', 'fuel'] },
  gunsmith: { title: 'Gunsmith', names: ['Ezra "Hammer" Coyle', 'Juan Ortega', 'Pinkerton Jones'], mark: 1.35, n: [5, 8],
    pool: [['pistolAmmo', 6, 40], ['rifleAmmo', 5, 30], ['shells', 5, 20], ['revolver', 2, 1], ['rifle', 1.2, 1], ['shotgun', 1.4, 1], ['dynamite', 2, 4], ['knife', 2, 1], ['lantern', 1, 1]],
    likes: ['weapon', 'ammo'] },
  tinker: { title: 'Tinker', names: ['Cyrus Whitlow', 'Hans Brenner', 'Tobias the Tinker'], mark: 1.25, n: [6, 9],
    pool: [['plank', 5, 20], ['nails', 5, 60], ['ironBar', 3, 6], ['sheetMetal', 3, 4], ['barbedWire', 3, 4], ['glassPane', 2.5, 3], ['rope', 2, 3], ['hammer', 2, 1], ['wrench', 1.5, 1], ['scrap', 2, 6], ['copperCoil', 0.8, 2], ['kitCanvas', 0.5, 1], ['kitLamp', 0.35, 1], ['kitBrakes', 0.35, 1], ['kitPlow', 0.35, 1], ['kitHeater', 0.3, 1], ['kitTank', 0.3, 1], ['kitEngine', 0.15, 1]],
    likes: ['material', 'tool', 'upgrade'] },
  horse: { title: 'Horse Trader', names: ['Dutch Van Ness', 'Running Elk', 'Silas Bramble'], mark: 1.2, n: [5, 7], horses: true,
    pool: [['saddle', 3, 2], ['saddlebags', 3, 2], ['cartKit', 1.2, 1], ['oats', 5, 8], ['apple', 3, 8], ['carrot', 3, 8], ['liniment', 4, 4], ['rope', 2, 3]],
    likes: ['food', 'tool'] },
  doctor: { title: 'Snake-Oil Doctor', names: ['Dr. Cornelius Marvel', 'Professor Lucius Bright', 'Madame Ostrova'], mark: 1.5, n: [5, 8],
    pool: [['tonic', 5, 4], ['medkit', 2, 2], ['bandage', 4, 10], ['herbs', 3, 6], ['liniment', 1.5, 2], ['coffee', 2, 3], ['teslaCell', 0.5, 1], ['refinedFuel', 0.6, 1]],
    likes: ['valuable', 'medical'] },
};
// a few fixed stores: the depot at Cinder Flats and the liveries
const STORES = {
  supply: { title: 'Cinder Flats Supply', who: 'The storekeeper, behind a shotgun', mark: 1.15, likes: ['food', 'fuel', 'material'], n: [9, 12], pool: TRADES.provisioner.pool.concat([['plank', 4, 20], ['nails', 4, 60], ['pistolAmmo', 3, 30], ['barbedWire', 2, 3], ['glassPane', 2, 2]]) },
  freight: { title: 'Cinder Flats Freight Office', who: 'The freight agent, counting what is left', mark: 1.3, likes: ['valuable', 'material', 'upgrade'], n: [5, 8], pool: TRADES.tinker.pool.concat([['coal', 4, 10], ['refinedFuel', 1, 2], ['crudeOil', 2, 3]]) },
  livery: { title: 'Livery Stable', who: 'The stable hand', mark: 1.1, likes: ['food'], n: [5, 7], horses: true, pool: TRADES.horse.pool },
};
// what things cost out here, region by region: the further from the rail head, the dearer the food
const REGION = [{ k: 1, food: 1 }, { k: 1.05, food: 0.9 }, { k: 1.15, food: 1.1 }, { k: 1.1, food: 1.15 }, { k: 1.3, food: 1.4, clothing: 0.8 }];
const REGION_NAME = ['the desert', 'the pine woods', 'the bayou', 'the badlands', 'the high snow'];
// barter offers: give these, get that
const SPECIALS = [
  { give: [['goldNugget', 3]], get: [['kitEngine', 1]], who: ['tinker'] },
  { give: [['ghostOrchid', 1]], get: [['medkit', 2]], cash: 40, who: ['doctor'] },
  { give: [['ancientIdol', 1]], cash: 520, who: ['doctor'], label: 'A collector in St. Louis will pay anything for one' },
  { give: [['gatorHide', 2]], get: [['saddle', 1], ['saddlebags', 1]], who: ['horse'] },
  { give: [['copperCoil', 3]], get: [['teslaCell', 2]], who: ['tinker', 'doctor'] },
  { give: [['fossil', 1]], cash: 160, who: ['doctor', 'provisioner'], label: 'For the museum in Philadelphia' },
  { give: [['turquoise', 2]], get: [['rifle', 1], ['rifleAmmo', 20]], who: ['gunsmith'] },
  { give: [['bankNotes', 2]], cash: 130, who: ['gunsmith', 'provisioner', 'tinker'], label: 'Nobody else will take them' },
  { give: [['scrap', 8]], get: [['barbedWire', 3], ['sheetMetal', 1]], who: ['tinker'] },
  { give: [['venison', 3]], get: [['shells', 15]], who: ['gunsmith'] },
  { give: [['skull', 2]], get: [['tonic', 2]], who: ['doctor'], label: 'He grinds them into something' },
  { give: [['crudeOil', 2]], get: [['refinedFuel', 1]], who: ['tinker'] },
];

export function createMerchants(ctx) {
  const { scene, player } = ctx;
  let wagon = null, spawnT = 90 + Math.random() * 90, shop = null, tab = 'buy';
  const stores = {}; // fixed stores keep their stock until it is redrawn

  // ---------- stock ----------
  function region(x, z) { return dominantBiome(x, z); }
  function draw(T, x, z) {
    const R = REGION[region(x, z)], spread = 0.85 + Math.random() * 0.4, out = [];
    const pool = T.pool.filter(([t]) => ITEMS[t]).slice(), n = T.n[0] + Math.floor(Math.random() * (T.n[1] - T.n[0] + 1));
    for (let i = 0; i < n && pool.length; i++) {
      let s = 0; for (const p of pool) s += p[1] * RARITY[ITEMS[p[0]].rarity].w ** 0.5;
      let r = Math.random() * s, k = 0; for (; k < pool.length - 1; k++) { r -= pool[k][1] * RARITY[ITEMS[pool[k][0]].rarity].w ** 0.5; if (r <= 0) break; }
      const [t, , q] = pool.splice(k, 1)[0], d = ITEMS[t];
      out.push({ t, n: Math.max(1, Math.round(q * (0.4 + Math.random() * 0.8))), price: priceOf(d, T.mark * spread, R) });
    }
    return out;
  }
  const priceOf = (d, mark, R) => Math.max(1, Math.round(d.value * mark * R.k * (R[d.cat] || 1) + (d.value < 2 ? 0.5 : 0)));
  function sellPrice(d) {
    const T = shop.T, base = (T.likes || []).includes(d.cat) ? 0.55 : 0.35;
    return Math.max(d.value >= 1 ? 1 : 0, Math.floor(d.value * base * (shop.R.k || 1)));
  }
  function specials(kind) { const L = SPECIALS.filter(s => s.who.includes(kind) && s.give.every(([t]) => ITEMS[t]) && (s.get || []).every(([t]) => ITEMS[t])); const out = []; while (L.length && out.length < 2) out.push(L.splice(Math.floor(Math.random() * L.length), 1)[0]); return out; }

  // ---------- the wagon by the line ----------
  const M = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
  function box(p, m, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; o.receiveShadow = true; p.add(o); return o; }
  function person(c) {
    const g = new THREE.Group(), coat = M(c.coat), skin = M(c.skin || 0xc8956a), dark = M(0x2a2420);
    box(g, coat, 0.44, 0.64, 0.26, 0, 1.17, 0); box(g, skin, 0.22, 0.25, 0.22, 0, 1.62, 0.02);
    box(g, dark, 0.38, 0.04, 0.38, 0, 1.78, 0.02); box(g, dark, 0.22, 0.14, 0.22, 0, 1.87, 0.02);
    for (const s of [-1, 1]) { box(g, M(c.legs || 0x3a3428), 0.15, 0.85, 0.16, s * 0.11, 0.42, 0); box(g, coat, 0.1, 0.56, 0.1, s * 0.28, 1.12, 0.04); }
    if (c.apron) box(g, M(0xd8ccb0), 0.4, 0.6, 0.02, 0, 0.95, 0.14);
    return g;
  }
  function wagonMesh(T, label) {
    const g = new THREE.Group(), wood = M(0x7a5a3a), canvas = M(0xe2d6b8), iron = M(0x2a2826);
    box(g, wood, 1.6, 0.12, 3.4, 0, 0.95, 0);
    for (const s of [-1, 1]) box(g, wood, 0.06, 0.5, 3.4, s * 0.8, 1.25, 0);
    for (let i = 0; i < 5; i++) { const z = -1.5 + i * 0.75; const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.03, 5, 14, Math.PI), wood); hoop.position.set(0, 1.45, z); g.add(hoop); }
    const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.86, 3.3, 14, 1, true, -Math.PI / 2, Math.PI), canvas); cover.rotation.x = Math.PI / 2; cover.position.y = 1.45; cover.material.side = THREE.DoubleSide; cover.castShadow = true; g.add(cover);
    for (const [x, z, r] of [[-0.85, 1.2, 0.5], [0.85, 1.2, 0.5], [-0.85, -1.2, 0.6], [0.85, -1.2, 0.6]]) { const w = new THREE.Mesh(new THREE.TorusGeometry(r, 0.04, 6, 16), iron); w.rotation.y = Math.PI / 2; w.position.set(x, r, z); g.add(w); for (let k = 0; k < 3; k++) box(g, wood, 0.03, r * 2, 0.04, x, r, z, k * Math.PI / 3); }
    box(g, wood, 0.08, 0.08, 2.4, 0, 0.75, 2.8);
    // the painted board on the side
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96; const c = cv.getContext('2d');
    c.fillStyle = '#8a2a1a'; c.fillRect(0, 0, 512, 96); c.strokeStyle = '#e0b040'; c.lineWidth = 6; c.strokeRect(6, 6, 500, 84);
    c.fillStyle = '#f4e6c4'; c.font = 'bold 40px Georgia, serif'; c.textAlign = 'center'; c.fillText(label.toUpperCase(), 256, 62);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.48), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 })); b.position.set(s * 0.87, 1.6, 0); b.rotation.y = s * Math.PI / 2; g.add(b); }
    // goods: crates and barrels at the tailgate
    for (const [x, z] of [[-0.5, -2.3], [0.4, -2.5]]) box(g, M(0xa88a5e), 0.6, 0.55, 0.6, x, 0.28, z);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.8, 12), M(0x6a4a2a)); bar.position.set(1.1, 0.4, -1.9); bar.castShadow = true; g.add(bar);
    return g;
  }
  // somewhere ahead along the line (from the train) or near you, off to one side, on firm level ground
  function placeWagon() {
    const t = ctx.getTrain(), onTrain = player.onTrain && t;
    let k0;
    if (onTrain) k0 = Math.round((t.s + Math.sign(t.v || 1) * (600 + Math.random() * 700)) / rail.ds);
    else { const rn = railNearest(player.pos.x, player.pos.z); if (!rn || Math.abs(rn.lat) > 120) return null; k0 = rn.k + Math.round((Math.random() < 0.5 ? -1 : 1) * (250 + Math.random() * 400) / rail.ds); }
    for (let tries = 0; tries < 12; tries++) {
      const k = Math.max(20, Math.min(rail.N - 20, k0 + tries * 15)), side = Math.random() < 0.5 ? -1 : 1;
      if (BRIDGE[k]) continue;
      const nx = -rail.tz[k] * side, nz = rail.tx[k] * side, x = rail.x[k] + nx * 13, z = rail.z[k] + nz * 13;
      if (ctx.inTown(x, z) || ctx.waterAt(x, z) > ctx.heightAt(x, z) - 0.2) continue;
      const h = ctx.heightAt(x, z); if (Math.abs(ctx.heightAt(x + 4, z) - h) > 1.6 || Math.abs(ctx.heightAt(x, z + 4) - h) > 1.6) continue;
      return { x, z, yaw: Math.atan2(rail.tx[k], rail.tz[k]), nx, nz };
    }
    return null;
  }
  function spawnWagon() {
    const at = placeWagon(); if (!at) return false;
    const kinds = Object.keys(TRADES), kind = kinds[Math.floor(Math.random() * kinds.length)], T = TRADES[kind];
    const who = T.names[Math.floor(Math.random() * T.names.length)], R = REGION[region(at.x, at.z)];
    const g = new THREE.Group(), y = ctx.groundAt(at.x, at.z, ctx.heightAt(at.x, at.z) + 1);
    g.position.set(at.x, y, at.z); g.rotation.y = at.yaw; scene.add(g);
    g.add(wagonMesh(T, `${who.split(' ').slice(-1)[0]}'s ${T.title}`));
    const team = [];
    for (const s of [-0.45, 0.45]) { const coat = randomCoat(), h = horseMesh({ coat, saddle: false }); h.position.set(s, 0, 4.3); g.add(h); team.push({ g: h, a: { gait: 'stand', ph: Math.random(), t: Math.random() * 9 } }); }
    const npc = person({ coat: { provisioner: 0x7a5a3a, gunsmith: 0x2a2a30, tinker: 0x5a4a30, horse: 0x8a6a3a, doctor: 0x3a1a3a }[kind], apron: kind === 'provisioner' || kind === 'tinker' });
    npc.position.set(2.2, 0, -0.6); npc.rotation.y = Math.PI / 2; g.add(npc);
    // a cookfire for the night
    const fx = at.x + at.nx * 3 - Math.sin(at.yaw) * 2, fz = at.z + at.nz * 3 - Math.cos(at.yaw) * 2;
    const fire = ctx.campfire ? ctx.campfire(fx, ctx.groundAt(fx, fz, y + 1), fz) : null;
    g.updateMatrixWorld(true);
    const npcPos = npc.getWorldPosition(new THREE.Vector3());
    wagon = { g, kind, T, who, R, team, npc, npcPos, x: at.x, z: at.z, life: 720, met: false, stock: draw(T, at.x, at.z), specials: specials(kind), fire };
    ctx.colliders && ctx.colliders(at.x, y, at.z, at.yaw);
    const d = Math.hypot(at.x - player.pos.x, at.z - player.pos.z);
    ctx.notify(`A travelling ${T.title.toLowerCase()} has made camp beside the line, about ${Math.round(d / 50) * 50} m ${onTrainDir(at)}.`, 'rare');
    return true;
  }
  const onTrainDir = at => { const t = ctx.getTrain(); if (player.onTrain && t) return 'ahead'; const a = Math.atan2(at.x - player.pos.x, -(at.z - player.pos.z)); return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round((a / (Math.PI * 2)) * 8 + 8) % 8]; };
  function removeWagon() { if (!wagon) return; scene.remove(wagon.g); if (shop && shop.src === wagon) close(); wagon = null; }

  // ---------- the shop screen ----------
  const wrap = document.createElement('div'); wrap.id = 'shopwrap';
  wrap.innerHTML = `<div id="shopcard" class="paper"><div class="ihead"><div><div class="eyebrow" id="shopWho"></div><h2 id="shopTitle"></h2></div><div class="stabs"><button class="ibtn" data-tab="buy">Buy</button><button class="ibtn" data-tab="sell">Sell</button><button class="ibtn" data-tab="trade">Special trades</button><span class="scash" id="shopCash"></span><button class="ibtn" data-close>Close</button></div></div><p class="snote" id="shopNote"></p><div id="shopRows"></div></div>`;
  document.body.appendChild(wrap);
  const $ = s => wrap.querySelector(s);
  wrap.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.close != null) { close(); return; }
    if (b.dataset.tab) { tab = b.dataset.tab; render(); return; }
    if (b.dataset.buy != null) buy(+b.dataset.buy, e.shiftKey ? 5 : 1);
    if (b.dataset.sell) sell(b.dataset.sell, e.shiftKey ? 99 : 1);
    if (b.dataset.trade != null) trade(+b.dataset.trade);
    if (b.dataset.horse) horseDeal(b.dataset.horse);
  });
  function open(src, T, who, R, title) {
    shop = { src, T, who, R, title }; tab = 'buy'; wrap.classList.add('open'); ctx.unlock(); ctx.sfx('open'); render();
    if (src.met === false) { src.met = true; ctx.notify(`"${['Evening, stranger.', 'Don\'t mind the shotgun. Buying or selling?', 'Prices are what they are. The dead don\'t haggle either.'][Math.floor(Math.random() * 3)]}"`); }
  }
  function close() { if (!shop) return; shop = null; wrap.classList.remove('open'); ctx.lock(); }
  function render() {
    if (!shop) return;
    const S = shop, src = S.src;
    $('#shopWho').textContent = S.who; $('#shopTitle').textContent = S.title; $('#shopCash').textContent = '$' + ctx.cash();
    for (const b of wrap.querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === tab);
    wrap.querySelector('[data-tab=trade]').style.display = (src.specials && src.specials.length) || S.T.horses ? '' : 'none';
    const icon = t => `<img src="${ICONS[t]}" alt="">`, R = r => RARITY[ITEMS[r].rarity].color;
    let html = '';
    if (tab === 'buy') {
      $('#shopNote').textContent = `Prices in ${REGION_NAME[region(src.x ?? player.pos.x, src.z ?? player.pos.z)]}. Shift-click to buy five. What's gone is gone until the next delivery.`;
      for (let i = 0; i < src.stock.length; i++) { const s = src.stock[i], d = ITEMS[s.t]; html += `<div class="srow${s.n ? '' : ' out'}">${icon(s.t)}<span class="sn" style="color:${R(s.t)}">${esc(d.name)}</span><span class="sd">${esc(d.desc)}</span><span class="sq">${s.n ? s.n + ' left' : 'Sold out'}</span><button class="ibtn" data-buy="${i}" ${s.n && ctx.cash() >= s.price ? '' : 'disabled'}>$${s.price}</button></div>`; }
    } else if (tab === 'sell') {
      $('#shopNote').textContent = `${S.title.split(' ').slice(-1)[0]} pays best for ${S.T.likes.join(' and ')} things. Shift-click to sell the whole stack.`;
      const seen = new Map(); for (const it of ctx.items()) { const d = ITEMS[it.t]; if (d.quest) continue; seen.set(it.t, (seen.get(it.t) || 0) + it.n); }
      for (const [t, n] of seen) { const d = ITEMS[t], p = sellPrice(d); html += `<div class="srow">${icon(t)}<span class="sn" style="color:${R(t)}">${esc(d.name)}</span><span class="sd">${esc(d.desc)}</span><span class="sq">×${n}</span><button class="ibtn" data-sell="${t}" ${p > 0 ? '' : 'disabled'}>${p > 0 ? '+$' + p : 'Worthless'}</button></div>`; }
      if (!seen.size) html = '<p class="snote">Your saddlebag is empty.</p>';
    } else {
      $('#shopNote').textContent = 'Swaps you won\'t get anywhere else.';
      (src.specials || []).forEach((s, i) => {
        const has = s.give.every(([t, n]) => ctx.count(t) >= n), give = s.give.map(([t, n]) => `${n} × ${ITEMS[t].name}`).join(', '), get = (s.get || []).map(([t, n]) => `${n} × ${ITEMS[t].name}`).concat(s.cash ? ['$' + s.cash] : []).join(' and ');
        html += `<div class="srow">${icon(s.give[0][0])}<span class="sn">${esc(give)} → ${esc(get)}</span><span class="sd">${esc(s.label || '')}</span><span class="sq">${s.done ? 'Done' : has ? 'You have them' : 'You need them'}</span><button class="ibtn" data-trade="${i}" ${has && !s.done ? '' : 'disabled'}>Trade</button></div>`;
      });
      if (S.T.horses) {
        const coats = src.horsesForSale || (src.horsesForSale = [randomCoat(), randomCoat()].map(c => ({ c, price: Math.round(70 + COATS[c].speed * 4 + (8 - COATS[c].w) * 12) })));
        for (const hs of coats) html += `<div class="srow"><span class="hicon" style="background:#${COATS[hs.c].c.toString(16).padStart(6, '0')}"></span><span class="sn">A broken-in ${COATS[hs.c].name}</span><span class="sd">Tame, shod and ready to ride. ${COATS[hs.c].speed} m/s at the gallop.</span><span class="sq">${hs.sold ? 'Sold' : ''}</span><button class="ibtn" data-horse="buy:${hs.c}" ${!hs.sold && ctx.cash() >= hs.price ? '' : 'disabled'}>$${hs.price}</button></div>`;
        const mine = ctx.horses && ctx.horses.owned.length;
        if (mine) html += `<div class="srow"><span class="hicon"></span><span class="sn">Sell a horse of yours</span><span class="sd">The one beside you, or one kept in a stable.</span><span class="sq"></span><button class="ibtn" data-horse="sell">Sell for $60</button></div>`;
      }
    }
    $('#shopRows').innerHTML = html;
  }
  function buy(i, n) {
    const s = shop.src.stock[i]; if (!s) return;
    let bought = 0;
    for (let k = 0; k < n && s.n > 0; k++) {
      if (ctx.cash() < s.price) break;
      if (!ctx.room(s.t, 1)) { ctx.notify('Your saddlebag is full'); break; }
      ctx.pay(s.price); ctx.give(s.t, 1, true); s.n--; bought++;
    }
    if (bought) { ctx.notify(`Bought ${ITEMS[s.t].name}${bought > 1 ? ' ×' + bought : ''}`, ITEMS[s.t].rarity); ctx.sfx('pick'); }
    else if (ctx.cash() < s.price) ctx.notify('You can\'t afford that');
    render();
  }
  function sell(t, n) {
    const d = ITEMS[t], p = sellPrice(d); let sold = 0;
    for (let k = 0; k < n && ctx.count(t) > 0; k++) { ctx.take(t, 1); sold++; }
    if (!sold) return;
    ctx.earn(p * sold); ctx.notify(`Sold ${d.name}${sold > 1 ? ' ×' + sold : ''} for $${p * sold}`, 'legendary'); ctx.sfx('pick');
    // what you sell joins the stock (a little dearer)
    const st = shop.src.stock.find(s => s.t === t); if (st) st.n += sold; else shop.src.stock.push({ t, n: sold, price: Math.max(1, Math.round(d.value * shop.T.mark * 1.1)) });
    render();
  }
  function trade(i) {
    const s = shop.src.specials[i]; if (!s || s.done) return;
    if (!s.give.every(([t, n]) => ctx.count(t) >= n)) return;
    for (const [t, n] of s.give) ctx.take(t, n);
    for (const [t, n] of s.get || []) ctx.give(t, n);
    if (s.cash) ctx.earn(s.cash);
    s.done = true; ctx.notify('A fair trade, out here.', 'epic'); ctx.sfx('sting'); render();
  }
  function horseDeal(k) {
    if (k === 'sell') { const d = ctx.horses.sell(); if (!d) { ctx.notify('Bring the horse here, or keep it in a stable.'); return; } ctx.earn(60); ctx.notify(`${d.name} is led away. +$60`); render(); return; }
    const c = k.split(':')[1], hs = shop.src.horsesForSale.find(h => h.c === c && !h.sold); if (!hs) return;
    if (ctx.cash() < hs.price) return;
    if (!ctx.horses.buy(c, shop.src.stableName)) return;
    ctx.pay(hs.price); hs.sold = true; render();
  }

  // ---------- frame and E targets ----------
  function update(dt, o) {
    if (wagon) {
      wagon.life -= dt;
      for (const h of wagon.team) { h.a.gait = Math.sin(h.a.t * 0.2) > 0.6 ? 'graze' : 'stand'; animateHorse(h.g, h.a, dt); }
      wagon.npc.rotation.y = Math.atan2(player.pos.x - wagon.npcPos.x, player.pos.z - wagon.npcPos.z) - wagon.g.rotation.y;
      const d = Math.hypot(player.pos.x - wagon.x, player.pos.z - wagon.z);
      if ((wagon.life <= 0 && d > 200) || d > 3000) removeWagon();
    } else if ((spawnT -= dt) <= 0) { spawnT = 240 + Math.random() * 200; if (!o.under && !o.dead) spawnWagon(); }
  }
  function targets() {
    const out = [], p = player.pos;
    if (wagon && wagon.npcPos.distanceTo(p) < 6) out.push({ pos: wagon.npcPos.clone().setY(wagon.npcPos.y + 1.4), r: 0.6, label: `Trade with ${wagon.who}, travelling ${wagon.T.title.toLowerCase()}`, act: () => open(wagon, wagon.T, `${wagon.who} · travelling ${wagon.T.title.toLowerCase()}`, wagon.R, `${wagon.who.split(' ').slice(-1)[0]}'s wagon`), key: 'merchant' });
    for (const s of STATION_SPOTS) {
      if (s.kind !== 'trade' || Math.abs(s.x - p.x) > 5 || Math.abs(s.z - p.z) > 5) continue;
      out.push({ pos: new THREE.Vector3(s.x, s.y + 0.3, s.z), r: 0.6, label: `Trade: ${STORES[s.shop].title}`, act: () => openStore(s.shop, s.station, s), key: 'store:' + s.shop });
    }
    return out;
  }
  // a fixed store redraws its shelves every twenty minutes
  function openStore(kind, place, spot) {
    const T = STORES[kind], key = kind + ':' + place, slot = Math.floor(Date.now() / 1200000);
    let st = stores[key];
    const x = spot ? spot.x : player.pos.x, z = spot ? spot.z : player.pos.z;
    if (!st || st.slot !== slot) st = stores[key] = { slot, x, z, stock: draw(T, x, z), specials: kind === 'livery' ? [] : specials(kind === 'supply' ? 'provisioner' : 'tinker'), stableName: kind === 'livery' ? place : null };
    open(st, T, T.who, REGION[region(x, z)], kind === 'livery' ? `${place} Livery Stable` : T.title);
  }
  return {
    update, targets, openStore, close,
    get isOpen() { return !!shop; },
    markers() { return wagon ? [{ x: wagon.x, z: wagon.z, label: wagon.T.title }] : []; },
    refresh() { if (shop) render(); },
  };
}
