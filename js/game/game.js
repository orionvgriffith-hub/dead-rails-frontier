// Gameplay layer: survival stats, saddlebag inventory + hotbar, looting, train storage and fuel, items on the
// ground, death bags, saving, and other open tabs as extra riders. Everything shared goes through Net.
import * as THREE from 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/three.module.js';
import { ITEMS, itemModel, renderIcons } from './items.js';
import { Grid, newId } from './grid.js';
import { Net } from './net.js';
import { LOOT_SPOTS, READABLES, HEAT_SPOTS, HAZARDS, INTERACTS, STATION_SPOTS, HOOKS, onLoot } from './registry.js';
import { createStory } from './story.js';
import { createHorses } from './horses.js';
import { createMerchants } from './merchants.js';
import { createDefence } from './defence.js';
import { horseMesh, animateHorse } from './horsemesh.js';
import { KINDS, genLoot, buildLootVisuals, setOpen, updateLoot, frontOf, cidOf, puff } from './loot.js';
import { createUI } from './ui.js';
import { createEnemies } from './enemies.js';
import { ROUTE_V } from '../world.js';

// storage carried by the train, and what it starts with, are shared rules (the online server uses them too)
import { CARRIAGE_TYPES, starterLoot } from './rules.js';
export { CARRIAGE_TYPES };
const NEW_RIDER = [['lantern', 1], ['jerky', 4], ['bandage', 2], ['revolver', 1], ['pistolAmmo', 18], ['knife', 1]];
// riders from before the dead walked get a sidearm once
const SIDEARM = [['revolver', 1], ['pistolAmmo', 18], ['knife', 1]];
export const INV_W = 9, INV_H = 6, HOTBAR = 6, CARRY = 30, MAX_CARRY = 45;
const REACH = 2.4;
const LOOT_TITLE = s => s.title || KINDS[s.kind].title;
// difficulty scales hunger, fall damage, healing and fuel use
const DIFF = {
  easy: { hunger: 0.6, fall: 0.6, regen: 1.6, fuel: 0.75, cold: 0.6, zdmg: 0.6, zcount: 0.7, zhp: 0.85 },
  normal: { hunger: 1, fall: 1, regen: 1, fuel: 1, cold: 1, zdmg: 1, zcount: 1, zhp: 1 },
  hard: { hunger: 1.5, fall: 1.4, regen: 0.5, fuel: 1.3, cold: 1.4, zdmg: 1.35, zcount: 1.3, zhp: 1.15 },
};

export function createGame(ctx) {
  const { scene, camera, renderer, player, toast } = ctx;
  const P = { inv: new Grid('inv', INV_W, INV_H), hot: Array(HOTBAR).fill(null), sel: -1, cash: 0, mag: {}, hp: 100, hunger: 100, stamina: 100, warmth: 100, dead: false, rest: 0, winded: false, cause: '', limbo: [] };
  let net = null, name = '', started = false, open = null, target = null, scanT = 0, poseT = 0, tposeT = 0, burnT = 0, burnAcc = 0, saveT = 0, hurtT = 0;
  let lampOn = false, showNames = true, hintT = 3;
  const S = ctx.settings || {}, D = () => DIFF[S.difficulty] || DIFF.normal, hint = id => ctx.hint && ctx.hint(id);
  const recentDrops = new Set(), pickingUp = new Set();
  const busy = new Set();
  let chain = Promise.resolve();
  const queue = fn => (chain = chain.then(fn).catch(e => { console.error(e); }));

  // ---------- world-side visuals ----------
  buildLootVisuals(scene);
  const cell = new Map(), CS = 16, ck = (x, z) => `${Math.floor(x / CS)},${Math.floor(z / CS)}`;
  const addSpot = s => { const k = ck(s.x, s.z); if (!cell.has(k)) cell.set(k, []); cell.get(k).push(s); };
  for (const s of LOOT_SPOTS) addSpot(s);
  // woodpiles, ore veins and the like appear with the ground they stand on
  onLoot(addSpot);
  const spotsNear = (x, z) => { const out = [], cx = Math.floor(x / CS), cz = Math.floor(z / CS); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = cell.get(`${cx + i},${cz + j}`); if (a) out.push(...a); } return out; };
  renderIcons(renderer);
  scene.add(camera);
  const lantern = new THREE.PointLight(0xffc27a, 0, 15, 1.5); scene.add(lantern);
  const viewModel = new THREE.Group(); viewModel.position.set(0.3, -0.3, -0.6); camera.add(viewModel);
  let heldShown = null;

  const ui = createUI({
    P, INV_W, INV_H, HOTBAR, CARRY, settings: S,
    container: () => open && net ? net.container(open.cid) : null,
    containerMeta: () => open && net ? net.meta(open.cid) : null,
    openInfo: () => open,
    isBusy: id => busy.has(id),
    nearFirebox: () => !!(target && target.key === 'firebox') || nearSpot('firebox', 2.6),
    act: {
      moveInv, mergeInv, invToCont, contToInv, contMove, quickToCont, quickToInv, splitInv, splitCont,
      dropInv, useItem, stokeWith, bindHot, sortInv, sortCont, takeAll, takeCash, closeContainer, respawn,
    },
  });

  // ---------- helpers ----------
  const train = () => ctx.getTrain();
  const fuelNow = () => net ? Math.max(0, net.state.train.fuel - burnAcc) : 0;
  function nearSpot(name, d) { const t = train(); if (!t) return false; return t.spotWorld(name).distanceTo(camera.position) < d; }
  function changed(save = true) { if (P.sel >= 0 && P.hot[P.sel] && !P.inv.get(P.hot[P.sel])) P.hot[P.sel] = null; for (let i = 0; i < HOTBAR; i++) if (P.hot[i] && !P.inv.get(P.hot[i])) P.hot[i] = null; ui.renderInv(); ui.renderHot(); if (save) savePlayer(); }
  function notifyGain(t, n) { ui.notify(`+ ${ITEMS[t].name}${n > 1 ? ' ×' + n : ''}`, ITEMS[t].rarity); }
  // can the saddlebag take this whole stack (topping up stacks first)?
  function invRoom(t, n) {
    const d = ITEMS[t]; let room = 0;
    if (d.stack > 1) for (const s of P.inv.items) if (s.t === t) room += d.stack - s.n;
    return room >= n || !!P.inv.findSpace(t);
  }

  // ---------- transfers (saddlebag is local, every container is the host's) ----------
  function moveInv(iid, x, y, r) { const it = P.inv.get(iid); if (!it || busy.has(iid)) return false; if (!P.inv.place(it, x, y, r)) return false; changed(); return true; }
  function mergeInv(iid, tid) {
    const it = P.inv.get(iid), tg = P.inv.get(tid); if (!it || !tg || it === tg || it.t !== tg.t) return false;
    const left = P.inv.mergeInto(tg, it); if (left <= 0) P.inv.remove(iid); changed(); return true;
  }
  function invToCont(iid, x, y, r, mergeId) {
    if (!open || busy.has(iid)) return; const it = P.inv.get(iid), cid = open.cid; if (!it) return;
    busy.add(iid); ui.renderInv();
    queue(async () => {
      const res = await net.request({ type: 'put', cid, item: { id: it.id, t: it.t, n: it.n, x: 0, y: 0, r: r ? 1 : 0 }, x, y, r: r ? 1 : 0, mergeId });
      busy.delete(iid);
      if (res.ok) { if (res.left && res.left.n > 0) it.n = res.left.n; else P.inv.remove(iid); }
      else if (res.err === 'nospace') ui.notify('No room there');
      else if (res.err === 'timeout') ui.notify('The world did not answer, nothing was moved');
      changed(); ui.renderCont();
    });
  }
  function quickToCont(iid) { invToCont(iid, null, null, 0, null); }
  // pull from a container into the saddlebag at (x, y, r), or merged into stack `mergeId`, or anywhere if x is null
  function contToInv(iid, x, y, r, mergeId) {
    if (!open || busy.has(iid)) return; const cid = open.cid, g = net.container(cid), it = g && g.get(iid); if (!it) return;
    if (mergeId) { const tg = P.inv.get(mergeId); if (!tg || tg.t !== it.t || tg.n >= ITEMS[it.t].stack) return; }
    else if (x != null) { if (!P.inv.fits(it.t, x, y, r)) return; }
    else if (!invRoom(it.t, it.n)) { ui.notify('Your saddlebag is full'); return; }
    busy.add(iid); ui.renderCont();
    queue(async () => {
      const res = await net.request({ type: 'take', cid, iid });
      busy.delete(iid);
      if (!res.ok) { ui.notify(res.err === 'gone' ? 'Someone else took it' : 'Could not take that'); ui.renderCont(); return; }
      const got = Object.assign({}, res.item), n = got.n;
      let left = null;
      if (mergeId && P.inv.get(mergeId)) { P.inv.mergeInto(P.inv.get(mergeId), got); if (got.n > 0) left = P.inv.addMerge(got); }
      else if (x != null && P.inv.place(got, x, y, r)) left = null;
      else left = P.inv.addMerge(got);
      if (left && left.n > 0) await giveBack(cid, left);
      notifyGain(got.t, n - (left ? left.n : 0));
      changed(); ui.renderCont();
    });
  }
  // something didn't fit after all: return it to where it came from, or drop it at your feet. Never lost.
  async function giveBack(cid, it) {
    const r = await net.request({ type: 'put', cid, item: it, x: null });
    if (r.ok && !r.left) return;
    const rest = r.ok ? r.left : it, p = dropPoint();
    const d = await net.request({ type: 'drop', item: rest, ...p });
    if (!d.ok) keep(rest); else recentDrops.add(d.gid);
  }
  // last resort when the world can't take an item back right now: held aside, saved, and dropped again shortly
  function keep(it) { const l = P.inv.addMerge(it); if (l && l.n > 0) P.limbo.push(l); savePlayer(); }
  function retryLimbo() {
    if (!P.limbo.length || !net) return;
    const items = P.limbo.splice(0);
    queue(async () => { for (const it of items) { const r = await net.request({ type: 'drop', item: it, ...dropPoint() }); if (!r.ok) P.limbo.push(it); } savePlayer(); });
  }
  function quickToInv(iid) { contToInv(iid, null, null, 0, null); }
  function contMove(iid, x, y, r, mergeId) {
    if (!open || busy.has(iid)) return; const cid = open.cid;
    queue(async () => { const res = await net.request({ type: 'move', cid, iid, x, y, r: r ? 1 : 0, mergeId }); if (!res.ok) ui.notify('No room there'); ui.renderCont(); });
  }
  function splitInv(iid, n) {
    const it = P.inv.get(iid); if (!it || n < 1 || n >= it.n) return;
    const sp = P.inv.findSpace(it.t); if (!sp) { ui.notify('No free space to split into'); return; }
    it.n -= n; const ni = { id: newId('i'), t: it.t, n, x: 0, y: 0, r: 0 }; P.inv.place(ni, sp.x, sp.y, sp.r); changed();
  }
  function splitCont(iid, n) { if (!open) return; const cid = open.cid; queue(async () => { const r = await net.request({ type: 'split', cid, iid, n }); if (!r.ok) ui.notify('No free space to split into'); ui.renderCont(); }); }
  function sortInv() { if (!P.inv.sort()) ui.notify('Could not repack everything, left as it was'); changed(); }
  function sortCont() { if (!open) return; const cid = open.cid; queue(async () => { const r = await net.request({ type: 'sort', cid }); if (!r.ok) ui.notify('Could not repack everything, left as it was'); ui.renderCont(); }); }
  function takeCash() {
    if (!open) return;
    const cid = open.cid; queue(async () => { const r = await net.request({ type: 'takeCash', cid }); if (r.ok && r.cash) { P.cash += r.cash; ui.notify(`+ $${r.cash}`, 'legendary'); changed(); } ui.renderCont(); });
  }
  function takeAll() {
    if (!open) return;
    const cid = open.cid;
    queue(async () => {
      const c = net.meta(cid); if (c && c.cash) { const r = await net.request({ type: 'takeCash', cid }); if (r.ok && r.cash) { P.cash += r.cash; ui.notify(`+ $${r.cash}`, 'legendary'); } }
      const g = net.container(cid); if (!g) return;
      let skipped = 0;
      for (const it of [...g.items].sort((a, b) => ITEMS[b.t].value - ITEMS[a.t].value)) {
        if (!invRoom(it.t, it.n)) { skipped++; continue; }
        const res = await net.request({ type: 'take', cid, iid: it.id }); if (!res.ok) continue;
        const got = Object.assign({}, res.item), n = got.n, left = P.inv.addMerge(got);
        if (left && left.n > 0) await giveBack(cid, left);
        notifyGain(got.t, n - (left ? left.n : 0));
      }
      if (skipped) ui.notify(`${skipped} item${skipped > 1 ? 's' : ''} did not fit`);
      changed(); ui.renderCont();
    });
  }
  function dropPoint() {
    const p = player.pos, f = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    const x = p.x + f.x * 0.7, z = p.z + f.z * 0.7, y = ctx.groundAt(x, z, p.y + 0.3) + 0.02;
    const t = train();
    if (t && player.onTrain && player.trainLocal) { const l = t.toLocal(new THREE.Vector3(x, p.y + 0.02, z), player.trainBody); return { x: l.x, y: l.y, z: l.z, ry: Math.random() * 6, tb: player.trainBody }; }
    return { x, y, z, ry: Math.random() * 6, tb: null };
  }
  function dropInv(iid) {
    const it = P.inv.get(iid); if (!it || busy.has(iid) || !net) return;
    busy.add(iid); ui.renderInv();
    queue(async () => {
      const res = await net.request({ type: 'drop', item: { id: it.id, t: it.t, n: it.n, x: 0, y: 0, r: 0 }, ...dropPoint() });
      busy.delete(iid);
      if (res.ok) { P.inv.remove(iid); recentDrops.add(res.gid); ui.notify(`Dropped ${ITEMS[it.t].name}`); } else ui.notify('Could not drop that');
      changed();
    });
  }
  function bindHot(slot, iid) {
    if (slot < 0 || slot >= HOTBAR) return;
    for (let i = 0; i < HOTBAR; i++) if (P.hot[i] === iid) P.hot[i] = null;
    P.hot[slot] = iid; changed();
  }
  function useItem(iid) {
    const it = P.inv.get(iid); if (!it || busy.has(iid)) return false; const d = ITEMS[it.t];
    if (d.fuel && nearSpot('firebox', 2.6)) { stokeWith(iid); return true; }
    if ((d.horse || d.horseFood || d.horseHeal) && horses.useItem(it)) { changed(); return true; }
    if (d.up) { fitUpgrade(iid); return true; }
    if (it.t === 'firewood') { makeCamp(iid); return true; }
    if (d.cat === 'clothing') { ui.notify(`${d.name}: worn while it is in your saddlebag`); return false; }
    if (!d.use) return false;
    const u = d.use;
    if (u.hp && P.hp >= 100 && !u.hunger && !u.stamina && !(u.warmth && P.warmth < 100)) { ui.notify('You are not hurt'); return false; }
    if (u.hp) P.hp = Math.min(100, P.hp + u.hp);
    if (u.hunger) P.hunger = Math.min(100, P.hunger + u.hunger);
    if (u.stamina) { P.stamina = Math.min(100, P.stamina + u.stamina); P.winded = false; }
    if (u.warmth) P.warmth = Math.min(100, P.warmth + u.warmth);
    it.n -= 1; if (it.n <= 0) P.inv.remove(iid);
    ui.notify(`${d.cat === 'medical' ? 'Used' : /canteen|coffee/.test(it.t) ? 'Drank from' : 'Ate'} ${d.name}`); ctx.sfx && ctx.sfx('use');
    changed(); return true;
  }
  // a bundle of firewood makes a campfire where you stand (not aboard, not in water)
  function makeCamp(iid) {
    const it = P.inv.get(iid); if (!it) return;
    if (player.onTrain || player.seated) { ui.notify('Not aboard the train. Feed the firebox instead'); return; }
    if (envNow.wet) { ui.notify('Too wet to light a fire here'); return; }
    if (!ctx.campfire) return;
    const f = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)), x = player.pos.x + f.x * 1.4, z = player.pos.z + f.z * 1.4;
    ctx.campfire(x, ctx.groundAt(x, z, player.pos.y + 0.4), z);
    it.n -= 1; if (it.n <= 0) P.inv.remove(iid);
    ui.notify('You built a campfire. It will burn for a few minutes'); ctx.sfx && ctx.sfx('stoke'); hint('fire'); changed();
  }
  const UP_NAME = { heater: 'cab heater', lamp: 'carbide headlamp', brakes: 'steel brake shoes', engine: 'superheater', tank: 'tender extension', canvas: 'storm curtains' };
  function fitUpgrade(iid) {
    const it = P.inv.get(iid); if (!it || !net) return; const d = ITEMS[it.t];
    if (!train() || !player.onTrain) { ui.notify('Climb aboard the Jupiter to fit this'); return; }
    if ((net.state.train.up || {})[d.up]) { ui.notify(`The Jupiter already has the ${UP_NAME[d.up]}`); return; }
    busy.add(iid);
    queue(async () => {
      const r = await net.request({ type: 'upgrade', up: d.up });
      busy.delete(iid);
      if (r.ok) { it.n -= 1; if (it.n <= 0) P.inv.remove(iid); ui.notify(`Fitted the ${UP_NAME[d.up]} to the Jupiter`, 'epic'); ctx.sfx && ctx.sfx('stoke'); }
      else ui.notify(r.err === 'fitted' ? `The Jupiter already has the ${UP_NAME[d.up]}` : 'Could not fit it');
      changed();
    });
  }
  function stokeWith(iid) {
    const it = P.inv.get(iid); if (!it || busy.has(iid) || !ITEMS[it.t].fuel) return;
    if (!nearSpot('firebox', 2.6)) { ui.notify('Stand at the firebox in the cab to stoke it'); return; }
    if (fuelNow() >= 99.5) { ui.notify('The firebox is full'); return; }
    busy.add(iid);
    queue(async () => {
      const r = await net.request({ type: 'stoke', amount: ITEMS[it.t].fuel });
      busy.delete(iid);
      if (r.ok) { it.n -= 1; if (it.n <= 0) P.inv.remove(iid); ui.notify(`Stoked the firebox · fuel ${Math.round(r.fuel)}%`); ctx.sfx && ctx.sfx('stoke'); const tt = train(); if (tt && tt.stoked) tt.stoked(); }
      else ui.notify(r.err === 'full' ? 'The firebox is full' : 'Could not stoke the firebox');
      changed();
    });
  }
  function stokeAny() { const f = P.inv.items.filter(i => ITEMS[i.t].fuel).sort((a, b) => ITEMS[b.t].fuel - ITEMS[a.t].fuel)[0]; if (!f) { ui.notify('You have no coal, firewood or lamp oil'); return; } stokeWith(f.id); }

  // ---------- containers ----------
  function openContainer(info) {
    if (!net || P.dead) return;
    queue(async () => {
      const sp = info.spot, spot = sp && sp.id != null ? { id: sp.id, kind: sp.kind, x: sp.x, z: sp.z } : undefined; // the server rolls the loot itself, and checks you're close enough
      const res = await net.request({ type: 'open', cid: info.cid, w: info.w, h: info.h, kind: info.kind, title: info.title, loot: info.loot, spot });
      if (!res.ok) { ui.notify('It will not open'); return; }
      if (open && open.spot && open.spot !== info.spot) setOpen(open.spot, false);
      open = info;
      if (info.spot) { setOpen(info.spot, true); if (!info.spot.vis || ['sack', 'wagon', 'cart', 'minecart', 'shelf'].includes(info.spot.kind)) { const f = frontOf(info.spot); puff(f.x, f.y - 0.3, f.z); } }
      ctx.sfx && ctx.sfx('open');
      ui.show(true); ctx.unlock();
    });
  }
  function closeContainer() { if (open && open.spot) setOpen(open.spot, false); open = null; ui.renderCont(); }
  const lootInfo = s => ({ cid: cidOf(s), w: KINDS[s.kind].w, h: KINDS[s.kind].h, kind: s.kind, title: LOOT_TITLE(s), loot: true, spot: s, anchor: () => frontOf(s) });
  const trainInfo = T => ({ cid: T.cid, w: T.w, h: T.h, kind: 'train', title: T.title, loot: true, anchor: () => train().spotWorld(T.spot) });

  // ---------- ground items + death bags ----------
  const GV = new Map();
  const bagMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.95 }), tieMat = new THREE.MeshStandardMaterial({ color: 0x3a2414 });
  function bagModel() {
    const g = new THREE.Group(), b = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), bagMat); b.scale.set(1, 0.75, 0.9); b.position.y = 0.22; b.castShadow = true;
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.16, 10), bagMat); n.position.y = 0.5; const t = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 6, 14), tieMat); t.rotation.x = Math.PI / 2; t.position.y = 0.48;
    g.add(b, n, t); return g;
  }
  function syncGround(gid) {
    const d = net.state.ground[gid]; let v = GV.get(gid);
    if (!d) { if (v) { scene.remove(v.obj); GV.delete(gid); } if (open && open.gid === gid) closeContainer(); return; }
    if (!v) { const obj = d.bag ? bagModel() : itemModel(d.item.t); if (!d.bag) obj.scale.setScalar(1.6); scene.add(obj); v = { obj }; GV.set(gid, v); }
    v.d = d; placeGround(v);
  }
  const _gq = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _gv = new THREE.Vector3();
  function placeGround(v) {
    const d = v.d, t = train();
    if (d.tb != null) {
      if (!t) { v.obj.visible = false; return; }
      const R = t.bodyRoot(d.tb); v.obj.visible = true;
      v.obj.position.copy(R.localToWorld(_gv.set(d.x, d.y, d.z))); v.obj.quaternion.copy(R.quaternion).multiply(_gq.setFromAxisAngle(_up, d.ry || 0));
    } else { v.obj.position.set(d.x, d.y, d.z); v.obj.rotation.set(0, d.ry || 0, 0); }
  }
  function pickup(gid) {
    const d = net.state.ground[gid]; if (!d || !d.item) return;
    if (!invRoom(d.item.t, d.item.n)) { ui.notify('Your saddlebag is full'); return; }
    queue(async () => {
      const r = await net.request({ type: 'pickup', gid }); if (!r.ok) return;
      const got = Object.assign({}, r.item), n = got.n, left = P.inv.addMerge(got);
      if (left && left.n > 0) { const back = await net.request({ type: 'drop', item: left, x: d.x, y: d.y, z: d.z, ry: d.ry, tb: d.tb }); if (!back.ok) keep(left); }
      notifyGain(got.t, n - (left ? left.n : 0)); ctx.sfx && ctx.sfx('pick'); changed();
    });
  }

  // ---------- other riders (other tabs) ----------
  const AV = new Map();
  const coat = [0x5a3a28, 0x3a4a5a, 0x5a5a3a, 0x6a2a20, 0x2a3a2a];
  function avatar(id, nm) {
    const g = new THREE.Group(), col = coat[Math.abs([...id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % coat.length];
    const m = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 1.1, 12), m(col)); body.position.y = 0.95;
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.42, 10), m(0x2a2420)); legs.position.y = 0.21;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), m(0xc8946a)); head.position.y = 1.66;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 18), m(0x3a2a1a)); brim.position.y = 1.78;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.18, 14), m(0x3a2a1a)); crown.position.y = 1.88;
    for (const o of [body, legs, head, brim, crown]) { o.castShadow = true; g.add(o); }
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const c = cv.getContext('2d');
    c.font = '700 30px Georgia, serif'; c.textAlign = 'center'; c.lineWidth = 6; c.strokeStyle = 'rgba(30,15,5,.85)'; c.strokeText(nm, 128, 42); c.fillStyle = '#fff3d6'; c.fillText(nm, 128, 42);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true })); label.scale.set(1.6, 0.4, 1); label.position.y = 2.25; label.renderOrder = 10; g.add(label);
    label.visible = showNames;
    scene.add(g); return { g, label, target: new THREE.Vector3(), yaw: 0, have: false, pose: null };
  }
  function onPose(id, nm, p) { let a = AV.get(id); if (!a) { a = avatar(id, nm || 'Rider'); AV.set(id, a); } a.pose = p; a.at = performance.now(); }
  function updateAvatars(dt) {
    const t = train();
    for (const [id, a] of AV) {
      const p = a.pose; if (!p) continue;
      if (p.tb != null && t) a.target.copy(t.toWorld(_gv.set(p.tl[0], p.tl[1], p.tl[2]), p.tb)); else a.target.set(p.x, p.y, p.z);
      if (p.seated) a.target.y -= 0.45;
      if (!a.have || a.g.position.distanceTo(a.target) > 12) { a.g.position.copy(a.target); a.have = true; } else a.g.position.lerp(a.target, Math.min(1, dt * 12));
      const yaw = p.tb != null && t ? p.yaw + t.heading : p.yaw;
      a.g.rotation.y = yaw;
      a.g.visible = !p.dead;
      // a rider on horseback: the horse under them, the rider raised into the saddle
      const hk = p.horse ? p.horse.c + p.horse.s + p.horse.b : null;
      if (hk !== a.horseKey) { if (a.horse) { scene.remove(a.horse.g); a.horse = null; } a.horseKey = hk; if (p.horse) { a.horse = { g: horseMesh({ coat: p.horse.c, saddle: p.horse.s, blaze: p.horse.b }), a: { gait: 'stand', ph: 0, t: 0 }, last: a.g.position.clone() }; scene.add(a.horse.g); } }
      for (const c of a.g.children) c.position.y = (c.userData.y0 ??= c.position.y) + (a.horse ? 1.25 : 0);
      if (a.horse) {
        const H = a.horse, sp = H.last.distanceTo(a.g.position) / Math.max(dt, 1e-3); H.last.copy(a.g.position);
        H.g.position.copy(a.g.position); H.g.rotation.y = p.horse.y; H.g.visible = !p.dead;
        H.a.speed = sp; H.a.gait = sp > 10 ? 'gallop' : sp > 3.6 ? 'trot' : sp > 0.4 ? 'walk' : 'stand'; animateHorse(H.g, H.a, dt);
      }
    }
  }

  // ---------- network hooks ----------
  function isTrainAuthority() { if (!net) return true; const dr = net.state.train.driver; return dr ? dr === net.id : net.isHost; }
  // makeNet: how to reach the others (online, a server session; otherwise other tabs in this browser)
  async function begin(nm, makeNet) {
    name = nm;
    net = (makeNet || (o => new Net(o)))({
      name, genLoot: cid => starterLoot(cid) || genLoot(cid),
      onContainer: cid => { if (open && open.cid === cid) { if (!net.state.containers[cid]) closeContainer(); else ui.renderCont(); } },
      onGround: gid => syncGround(gid),
      onTrain: () => {},
      onPose, onPeerJoin: (id, nm) => { ui.notify(`${nm} rode in`); ui.renderOnline(net.peers.size + 1); }, onPeerLeave: id => { const a = AV.get(id); if (a) { scene.remove(a.g); if (a.horse) scene.remove(a.horse.g); AV.delete(id); } ui.renderOnline(net.peers.size + 1); },
      onHostChange: () => { ui.renderOnline(net.peers.size + 1); },
      onSnapshot: () => { for (const gid of [...GV.keys()]) syncGround(gid); for (const gid in net.state.ground) syncGround(gid); },
      onMsg: m => {
        const t = train();
        if (m.k === 'tpose' && t && !isTrainAuthority()) t.sync = Object.assign({}, m.d, { at: performance.now() });
        if (m.k === 'tpose' && net.isHost) { net.state.train.s = m.d.s; net.state.train.rv = ROUTE_V; }
        if (m.k === 'fx' && t) { if (m.d === 'whistle') t.whistle(); if (m.d === 'bell') t.bell(); }
      },
    });
    await net.start();
    // two tabs can't share one rider's saddlebag
    const taken = new Set([...net.peers.values()].map(p => p.name));
    if (taken.has(name)) { let k = 2; while (taken.has(`${nm} ${k}`)) k++; name = `${nm} ${k}`; net.name = name; toast(`${nm} is already riding in another tab, you are ${name}`); }
    loadPlayer(); horses.load(name);
    for (const gid in net.state.ground) syncGround(gid);
    const t = train(); if (t && net.isHost && savedS() != null) t.place(savedS());
    started = true; boardSaved(); ui.renderOnline(net.peers.size + 1); ui.renderAll();
    addEventListener('beforeunload', () => { savePlayer(); if (net) net.leave(); });
    // closing a tab doesn't always get as far as beforeunload; save whenever the page is hidden too
    addEventListener('pagehide', () => { savePlayer(); if (net && net.isHost) net.save(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { savePlayer(); if (net && net.isHost) net.save(); } });
    return name;
  }
  const savedS = () => net && net.state.train.rv === ROUTE_V ? net.state.train.s : null; // a position on an older line means nothing on this one
  // left the game while aboard: put you back on the train where you stood, once it (and its saved spot on the line) is in
  let pendingBoard = null;
  function boardSaved() {
    const t = train(), b = pendingBoard; if (!t || !b || !started) return;
    pendingBoard = null;
    const l = new THREE.Vector3(b.x, b.y + 0.05, b.z);
    player.seated = false; player.perch = null; player.fly = false; player.vel.set(0, 0, 0);
    player.onTrain = true; player.trainBody = b.b || 0; player.trainLocal = l;
    player.pos.copy(t.toWorld(l, player.trainBody)); player.yaw = t.heading + (b.yaw || 0);
    ui.notify('Back aboard the Jupiter');
  }
  function trainArrived(t) { if (net && net.isHost && savedS() != null) t.place(savedS()); for (const [, v] of GV) placeGround(v); defence.attach(t); boardSaved(); }

  // ---------- saving ----------
  const pkey = () => 'drw.player.' + name;
  function savePlayer() {
    if (!name) return;
    let pos = !player.onTrain && !player.fly ? { x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw } : null;
    // aboard, remember where on the train you stood (from the driver's seat, the spot beside it), so you come back aboard
    const t = train(); let onT = null;
    if (t && player.onTrain && !player.fly) {
      const b = player.seated ? 0 : player.trainBody || 0, l = player.seated ? t.toLocal(t.besideDriverSeat(), 0) : player.trainLocal || t.toLocal(player.pos, b);
      onT = { b, x: l.x, y: l.y, z: l.z, yaw: player.yaw - t.heading };
    }
    if (horses) horses.save();
    // where you stand in a server's (or a friend's) world means nothing on your own: keep your own game's spot
    if (net && (net.online || net.guest)) { try { const old = JSON.parse(localStorage.getItem(pkey()) || 'null'); pos = old && old.pos || null; onT = old && old.onT || null; } catch (e) {} }
    try { localStorage.setItem(pkey(), JSON.stringify({ v: 1, inv: P.inv.toJSON().items, hot: P.hot, cash: P.cash, hp: P.hp, hunger: P.hunger, stamina: P.stamina, warmth: P.warmth, dead: P.dead, limbo: P.limbo, mag: P.mag, kit2: 1, pos, onT })); } catch (e) {}
  }
  function loadPlayer() {
    let s = null; try { s = JSON.parse(localStorage.getItem(pkey()) || 'null'); } catch (e) {}
    if (!s) {
      for (const [t, n] of NEW_RIDER) P.inv.addMerge({ id: newId('i'), t, n, x: 0, y: 0, r: 0 });
      P.hot[0] = P.inv.items.find(i => i.t === 'revolver').id; P.hot[1] = P.inv.items.find(i => i.t === 'knife').id; P.hot[2] = P.inv.items.find(i => i.t === 'lantern').id; P.hot[3] = P.inv.items.find(i => i.t === 'jerky').id; P.hot[4] = P.inv.items.find(i => i.t === 'bandage').id;
      P.mag[P.hot[0]] = 6;
      savePlayer(); ui.notify('Welcome, ' + name + '. Search the towns for supplies.'); return;
    }
    P.inv = new Grid('inv', INV_W, INV_H, (s.inv || []).filter(i => ITEMS[i.t]).map(i => Object.assign({}, i)));
    P.hot = (s.hot || []).slice(0, HOTBAR); while (P.hot.length < HOTBAR) P.hot.push(null);
    Object.assign(P, { cash: s.cash || 0, hp: s.hp ?? 100, hunger: s.hunger ?? 100, stamina: s.stamina ?? 100, warmth: s.warmth ?? 100, mag: s.mag || {}, limbo: (s.limbo || []).filter(i => ITEMS[i.t]) });
    if (!s.kit2) { for (const [t, n] of SIDEARM) P.inv.addMerge({ id: newId('i'), t, n, x: 0, y: 0, r: 0 }); setTimeout(() => ui.notify('The dead are walking. You found an old revolver and a knife in your saddlebag', 'epic'), 1500); }
    if (s.dead || P.hp <= 0) { P.hp = 100; P.hunger = Math.max(P.hunger, 60); P.warmth = 100; }
    // on a server everyone starts together on the Dry Gulch platform; on your own you pick up where you left off
    const online = !!(net && (net.online || net.guest)); // on a server, or riding in a friend's posse
    if (s.pos && !online) ctx.placeAt(s.pos.x, s.pos.z, s.pos.yaw);
    pendingBoard = online ? null : s.onT || null;
    ui.notify('Welcome back, ' + name);
  }

  // ---------- survival ----------
  const weight = () => P.inv.weight();
  function damage(n, cause) {
    if (P.dead || n <= 0) return;
    if (horses && horses.riding && !["starved", "froze", "drowned", "fell", "gassed", "ichor"].includes(cause)) n = horses.shareHit(n);
    P.hp -= n; hurtT = 0.6; ui.hurt(Math.min(1, n / 30), n); ctx.shake && ctx.shake(Math.min(1, n / 25));
    if (P.hp <= 0) die(cause);
  }
  function die(cause) {
    P.hp = 0; P.dead = true; P.cause = cause; closeContainer(); ui.show(false);
    const t = train(), items = P.inv.items.map(i => ({ id: i.id, t: i.t, n: i.n, x: 0, y: 0, r: 0 })), cash = P.cash;
    if (player.seated) stand();
    if (horses && horses.riding) horses.dismount();
    ui.death(cause, items.length || cash ? 'Your belongings are in a bag where you fell.' : 'You had nothing on you.');
    if (!items.length && !cash) { savePlayer(); return; }
    let where;
    if (t && player.onTrain && player.trainLocal) { const l = player.trainLocal; where = { x: l.x, y: l.y + 0.02, z: l.z, tb: player.trainBody }; }
    else where = { x: player.pos.x, y: ctx.groundAt(player.pos.x, player.pos.z, player.pos.y + 0.3) + 0.02, z: player.pos.z, tb: null };
    queue(async () => {
      const r = await net.request({ type: 'bag', items, cash, title: `${name}'s belongings`, ...where });
      if (r.ok) { P.inv.items = []; P.hot.fill(null); P.cash = 0; }
      else ui.notify('Could not leave a bag, you kept your things');
      P.sel = -1; changed();
    });
  }
  function respawn() {
    P.dead = false; P.hp = 100; P.hunger = Math.max(P.hunger, 60); P.stamina = 100; P.warmth = 100; P.winded = false;
    enemies.clear(); ctx.respawn(); ui.death(null); changed(); ctx.lock();
  }
  function tickSurvival(dt, moving, sprinting) {
    if (P.dead) return;
    P.hunger = Math.max(0, P.hunger - dt * (sprinting ? 0.09 : 0.045) * D().hunger * (P.warmth < 40 ? 1.4 : 1));
    if (P.hunger <= 0) damage(dt * 0.6, 'starved');
    else if (P.hunger > 50 && P.warmth > 20 && P.hp < 100) P.hp = Math.min(100, P.hp + dt * 0.25 * D().regen);
    if (sprinting) { P.stamina = Math.max(0, P.stamina - dt * 16); P.rest = 0.9; if (P.stamina <= 0) P.winded = true; }
    else if (P.rest > 0) P.rest -= dt;
    else P.stamina = Math.min(100, P.stamina + dt * (P.hunger > 20 ? 18 : 7) * (moving ? 0.7 : 1) * (P.warmth < 30 ? 0.5 : 1));
    if (P.winded && P.stamina > 30) P.winded = false;
  }
  // ---------- cold ----------
  // what you feel is the air (region, weather, height, night) less wind chill and wet, plus whatever is warming you:
  // a fire, a roof, the firebox, a fitted cab heater. Carried clothing adds the best piece of each kind.
  let envNow = { feels: 20, heat: '', biome: '', weather: '', wet: false };
  const COMFORT = 12;
  function clothing() {
    const best = {}; let s = 0;
    for (const i of P.inv.items) { const d = ITEMS[i.t]; if (d.warm && (!best[d.slot] || d.warm > best[d.slot])) best[d.slot] = d.warm; }
    for (const k in best) s += best[k];
    return s;
  }
  function tickWarmth(dt, o) {
    const a = o.air; if (!a || P.dead) return;
    const p = player.pos, t = train(), up = (net && net.state.train.up) || {};
    let fire = 0, roof = 0, exposed = 1, label = '';
    for (const h of HEAT_SPOTS) {
      const dx = p.x - h.x, dz = p.z - h.z; if (Math.abs(dx) > h.r || Math.abs(dz) > h.r || Math.abs(p.y - h.y) > 4) continue;
      const d = Math.hypot(dx, dz); if (d > h.r) continue;
      if (h.kind === 'shelter') roof = Math.max(roof, h.heat);
      else fire = Math.max(fire, h.heat * (1 - (d / h.r) ** 2 * 0.7));
    }
    if (roof) { exposed = 0.15; label = 'Sheltered'; }
    let tHeat = 0;
    if (t && player.onTrain) {
      const cab = player.seated || nearSpot('firebox', 3.2), lit = fuelNow() > 0;
      if (up.canvas) exposed = Math.min(exposed, cab ? 0.15 : 0.5);
      if (cab && defence) exposed = Math.min(1, exposed + defence.exposure());
      if (up.heater && lit) { tHeat = cab ? 22 : 12; label = 'Cab heater'; }
      else if (cab && lit) { tHeat = 8; label = 'By the firebox'; }
    }
    if (fire > Math.max(roof, tHeat)) label = 'By the fire';
    let feels = a.temp;
    if (a.temp < 18) feels -= exposed * Math.max(0, a.wind - 0.4) * 6;
    feels -= exposed * (a.rain * 3 + a.snow * 2);
    if (o.wet) feels -= a.temp < 12 ? 9 : 3;
    const heat = Math.max(fire, roof, tHeat) + (fire && (roof || tHeat) ? Math.min(fire, roof || tHeat) * 0.3 : 0);
    const comfort = feels + clothing() + heat;
    const cold = (DIFF[S.difficulty] || DIFF.normal).cold || 1;
    if (comfort >= COMFORT) P.warmth = Math.min(100, P.warmth + dt * Math.min(4, 0.5 + (comfort - COMFORT) * 0.25));
    else P.warmth = Math.max(0, P.warmth - dt * (COMFORT - comfort) ** 1.3 * 0.012 * cold); // a cool desert night is slow, a blizzard is quick
    if (P.warmth < 10) damage(dt * 0.8, 'froze');
    if (P.warmth < 55 && comfort < COMFORT) hint('cold');
    envNow = { feels: feels + heat, heat: label, biome: a.biomeName || '', weather: a.weather || '', wet: !!o.wet, comfort };
  }

  // ---------- interaction ----------
  const _f = new THREE.Vector3();
  // what you're looking at: of the things the centre of your view passes through (each a small ball around its
  // spot, a touch larger further off) within reach, the one you aim at most squarely. Nothing off to one side
  function consider(best, pos, radius, label, act, key) {
    const e = camera.position, dx = pos.x - e.x, dy = pos.y - e.y, dz = pos.z - e.z, d = Math.hypot(dx, dy, dz);
    if (d > REACH + radius) return best;
    const along = dx * _f.x + dy * _f.y + dz * _f.z; if (along <= 0) return best;
    const r = radius + 0.1 + along * 0.03, miss2 = d * d - along * along;
    if (miss2 > r * r) return best;
    const s = Math.sqrt(miss2) / r + along * 0.1; // the one you aim at most squarely, then the nearer
    return !best || s < best.s ? { s, label, act, key } : best;
  }
  function scan() {
    camera.updateMatrixWorld(); camera.getWorldDirection(_f);
    // in the saddle the only thing E does is get you down
    if (horses.riding) { target = { label: `Dismount ${horses.horse.d.name}`, act: () => horses.dismount(), key: 'dismount' }; return; }
    // sitting in a cab seat, E gets you up
    if (player.perch != null) { target = { label: 'Stand up', act: () => ctx.unperch(), key: 'unperch' }; return; }
    let best = null;
    const p = player.pos, searched = s => !!net.state.containers[cidOf(s)];
    // horses, stables, merchants and the train's walls and windows
    for (const o of horses.targets().concat(merchants.targets(), defence.targets(), defence.benchTargets(STATION_SPOTS))) best = consider(best, o.pos, o.r, o.label, o.act, o.key);
    for (const s of spotsNear(p.x, p.z)) {
      const f = frontOf(s), done = searched(s), cash = done && net.state.containers[cidOf(s)].cash;
      best = consider(best, f, s.kind === 'wagon' ? 1.2 : 0.45, `${done ? 'Open' : 'Search'} ${LOOT_TITLE(s)}${done ? (net.meta(cidOf(s)).items.length || cash ? '' : ' · empty') : ''}`, () => openContainer(lootInfo(s)), cidOf(s));
    }
    for (const [gid, v] of GV) {
      const d = v.d, label = d.bag ? `Open ${d.title || 'bag'}` : `Pick up ${ITEMS[d.item.t].name}${d.item.n > 1 ? ' ×' + d.item.n : ''}`;
      best = consider(best, v.obj.position.clone().add(_gv.set(0, 0.15, 0)), d.bag ? 0.4 : 0.3, label,
        d.bag ? () => openContainer({ cid: d.bag, w: 10, h: 8, kind: 'bag', title: d.title || 'Bag', loot: false, gid, anchor: () => v.obj.position }) : () => pickup(gid), gid);
    }
    const t = train();
    if (t && !player.seated) {
      for (const k in CARRIAGE_TYPES) { const C = CARRIAGE_TYPES[k]; best = consider(best, t.spotWorld(C.spot), k === 'cargo' ? 0.8 : 0.35, `Open ${C.title}`, () => openContainer(trainInfo(C)), C.cid); }
      const fuel = Math.round(fuelNow());
      best = consider(best, t.spotWorld('firebox'), 0.3, `Stoke the firebox · fuel ${fuel}%`, stokeAny, 'firebox');
      if (player.onTrain && t.nearDriverSeat(player.pos)) best = consider(best, t.driverSeat(), 0.6, 'Sit in the driver\'s seat', sit, 'seat');
      if (player.onTrain) for (const i of [0, 2, 3]) best = consider(best, t.seatPos(i).add(_gv.set(0, 0.15, 0)), 0.4, i ? 'Sit down' : 'Sit in the fireman\'s seat', () => ctx.perch(i), 'seat' + i);
    }
    // levers, dials, doors and the notes of the story
    for (const r of INTERACTS) {
      if (Math.abs(r.x - p.x) > 4 || Math.abs(r.z - p.z) > 4 || Math.abs(r.y - p.y) > 4) continue;
      const label = r.label(); if (!label) continue;
      best = consider(best, _gv.set(r.x, r.y, r.z).clone(), r.r || 0.4, label, r.act, r.id);
    }
    // notices, timetables and maps
    for (const r of READABLES) {
      if (Math.abs(r.x - p.x) > 4 || Math.abs(r.z - p.z) > 4) continue;
      best = consider(best, _gv.set(r.x, r.y, r.z).clone(), 0.5, `${ctx.t ? ctx.t('read') : 'Read'}: ${r.title}`, () => ctx.readNote && ctx.readNote(r.title, r.body), r.id);
    }
    target = best;
    autoPickup();
  }
  // walk over loose items to pick them up (bags are always opened by hand)
  function autoPickup() {
    const mode = S.autoPickup || 'off', p = player.pos;
    for (const gid of recentDrops) { const v = GV.get(gid); if (!v || v.obj.position.distanceTo(p) > 2.5) recentDrops.delete(gid); }
    if (mode === 'off' || player.seated || ui.isOpen()) return;
    for (const [gid, v] of GV) {
      const d = v.d; if (d.bag || recentDrops.has(gid) || pickingUp.has(gid)) continue;
      const o = v.obj.position; if (Math.hypot(o.x - p.x, o.z - p.z) > 1.2 || Math.abs(o.y - p.y) > 1.2) continue;
      const cat = ITEMS[d.item.t].cat;
      if (mode === 'valuables' && cat !== 'ammo' && cat !== 'valuable') continue;
      if (!invRoom(d.item.t, d.item.n)) continue;
      pickingUp.add(gid); pickup(gid); queue(async () => { pickingUp.delete(gid); });
    }
  }
  function sit() {
    queue(async () => {
      const r = await net.request({ type: 'seat', claim: true });
      if (!r.ok) { ui.notify(r.err === 'taken' ? 'Someone else is at the controls' : 'Could not take the seat'); return; }
      ctx.sit();
    });
  }
  function stand() { ctx.stand(); if (net) net.request({ type: 'seat', claim: false }); }

  // ---------- held item ----------
  function held() { const id = P.sel >= 0 ? P.hot[P.sel] : null; return id ? P.inv.get(id) : null; }
  function updateHeld(dt, night, elapsed) {
    const h = held(), t = h ? h.t : null;
    if (t !== heldShown) {
      viewModel.clear(); heldShown = t;
      if (t) { const m = itemModel(t); m.scale.setScalar(1.3); m.rotation.set(0.15, -0.5, 0); viewModel.add(m); m.traverse(o => { o.castShadow = false; }); }
    }
    viewModel.visible = !!t && !player.seated && !P.dead && !ui.isOpen();
    viewModel.position.y = -0.3 + Math.sin(elapsed * 7) * 0.006;
    const hasLamp = !P.dead && P.inv.items.some(i => ITEMS[i.t].light), heldLamp = t && ITEMS[t].light;
    const on = hasLamp && (lampOn || heldLamp);
    lantern.intensity = on ? (1.5 + night * 7) * (0.9 + 0.1 * Math.sin(elapsed * 17) * Math.sin(elapsed * 6.1)) : 0;
    // held lanterns shine from the hand, otherwise from the belt
    // the camera has moved this frame but its matrix is only refreshed at render: bring it up to date first, or on a moving
    // train the lamp trails behind you and flickers about the cab
    if (on) { camera.updateMatrixWorld(); lantern.position.copy(camera.localToWorld(heldLamp ? _gv.set(0.3, -0.15, -0.5) : _gv.set(0.25, -0.75, -0.2))); }
  }
  function hints(o) {
    if ((hintT -= o.dt) > 0) return; hintT = 1;
    hint('start');
    const t = train();
    if (P.hunger < 40) hint('hunger');
    if (t && !player.onTrain && t.distanceTo(player.pos) < 8) hint('board');
    if (t && player.onTrain && !player.seated && t.distanceTo(player.pos) < 1) hint('seat');
    if (player.seated) { hint('drive'); if (fuelNow() < 20) hint('fuel'); }
    if (o.night > 0.6 && P.inv.items.some(i => ITEMS[i.t].light)) hint('night');
    if (o.loc === 'Cinder Flats Station') hint('station');
    if (o.air && o.air.temp < 5) hint('coldRegion');
    if (P.inv.items.some(i => ITEMS[i.t].up)) hint('upgrade');
  }

  // ---------- combat ----------
  // guns hold rounds in their own magazine (kept per weapon in your save) and reload from the matching ammo you carry;
  // tools double as melee weapons; dynamite is thrown and goes off after its fuse
  const WEAPONS = {
    revolver: { ammo: 'pistolAmmo', mag: 6, dmg: 38, head: 2.2, rof: 0.3, spread: 0.014, range: 95, reload: 1.7, kick: 0.035, loud: 120, snd: 'revolver' },
    rifle: { ammo: 'rifleAmmo', mag: 10, dmg: 72, head: 2.5, rof: 0.7, spread: 0.004, range: 240, reload: 2.6, kick: 0.05, loud: 170, snd: 'rifle' },
    shotgun: { ammo: 'shells', mag: 2, dmg: 15, pellets: 9, head: 1.6, rof: 0.28, spread: 0.075, range: 42, reload: 2.3, kick: 0.09, loud: 140, snd: 'shotgun' },
    knife: { melee: true, dmg: 34, reach: 2.1, rof: 0.45, stam: 5 },
    pickaxe: { melee: true, dmg: 48, reach: 2.4, rof: 0.95, stam: 9 },
    shovel: { melee: true, dmg: 36, reach: 2.4, rof: 0.8, stam: 8 },
    hammer: { melee: true, dmg: 30, reach: 2.0, rof: 0.62, stam: 6 },
    wrench: { melee: true, dmg: 24, reach: 2.0, rof: 0.55, stam: 5 },
    dynamite: { thrown: true, rof: 0.9, fuse: 2.6, r: 7, dmg: 120 },
    arcCaster: { ammo: 'teslaCell', mag: 4, perCell: true, arc: true, dmg: 62, head: 1, rof: 0.85, spread: 0, range: 32, reload: 2.2, kick: 0.04, loud: 90, snd: 'zap' },
  };
  let fireT = 0, reloadT = 0, reloadFor = null, swingT = 0, kickZ = 0, kickR = 0, flashT = 0, markT = 0;
  const flash = new THREE.PointLight(0xffc070, 0, 9, 2); flash.position.set(0.25, -0.15, -1); camera.add(flash);
  const flashSp = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffd890, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  flashSp.scale.set(0.16, 0.16, 1); flashSp.position.set(0.3, -0.17, -1.05); flashSp.renderOrder = 10; camera.add(flashSp);
  const TRACERS = [];
  for (let i = 0; i < 10; i++) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(6, 3));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0, depthWrite: false })); l.frustumCulled = false; scene.add(l); TRACERS.push({ l, t: 0 });
  }
  const THROWN = [];
  const cross = document.getElementById('cross'), ammoEl = document.getElementById('ammo');
  const ammoOf = t => { let n = 0; for (const i of P.inv.items) if (i.t === t) n += i.n; return n; };
  function takeAmmo(t, n) {
    let left = n;
    for (const i of P.inv.items.slice()) { if (i.t !== t || left <= 0) continue; const k = Math.min(i.n, left); i.n -= k; left -= k; if (i.n <= 0) P.inv.remove(i.id); }
    return n - left;
  }
  const nearHeat = (x, z, r) => HEAT_SPOTS.some(h => h.kind === 'fire' && h.heat > 6 && Math.abs(h.x - x) < r && Math.abs(h.z - z) < r);
  const dropItem = (t, n, x, z, yy) => { if (!ITEMS[t] || !net) return; const y = ctx.groundAt(x, z, (yy ?? ctx.heightAt(x, z)) + 1) + 0.02; net.request({ type: 'drop', item: { id: newId('i'), t, n, x: 0, y: 0, r: 0 }, x, y, z, ry: Math.random() * 6 }); };
  let story = null, horses = null, merchants = null, defence = null;
  const enemies = createEnemies({
    scene, camera, player, settings: S, getTrain: train, toast: (m, big) => ui.notify(m, big ? 'epic' : undefined),
    groundAt: ctx.groundAt, heightAt: ctx.heightAt, waterAt: ctx.waterAt, biomeAt: ctx.biomeAt, pushOut: ctx.pushOut, inSwamp: ctx.inSwamp, blockers: ctx.blockers,
    isUnder: ctx.isUnder, airborne: () => !player.onGround, flash: ctx.flash, firePool: (...a) => ctx.firePool && ctx.firePool(...a),
    canBoard: p => !defence || defence.canBoard(p), hullHit: (p, n) => defence ? defence.hullHit(p, n) : 0,
    nearHeat, diff: () => ({ dmg: D().zdmg, count: D().zcount, hp: D().zhp }),
    sfx: (k, v, pan, pitch) => ctx.sfx && ctx.sfx(k, v, pan, pitch),
    boom: (x, y, z, r) => { ctx.boom && ctx.boom(x, y, z, r); const d = Math.hypot(x - player.pos.x, z - player.pos.z); ctx.shake && ctx.shake(Math.max(0, 1 - d / (r * 6)) * 1.2); },
    hitPlayer: (n, cause, x, z, chill) => { if (P.dead) return; damage(n, cause); if (chill) P.warmth = Math.max(0, P.warmth - chill); ctx.hurtFrom && ctx.hurtFrom(x, z); hint('zombies'); },
    drop: dropItem,
    onKill: (e, head) => { const b = e.T.boss; if (!e.boss) ui.notify(`${e.T.name} down${head ? ' · headshot' : ''}`, b ? 'epic' : undefined); marker(true); story && story.onKill(e); },
  });
  // ---------- the story: items given and taken by the special places, the journey, the bosses ----------
  const hasItem = t => P.inv.items.some(i => i.t === t);
  function giveItem(t, n = 1, quiet) {
    if (!ITEMS[t]) return;
    const left = P.inv.addMerge({ id: newId('i'), t, n, x: 0, y: 0, r: 0 });
    if (left && left.n > 0) { dropItem(t, left.n, player.pos.x, player.pos.z, player.pos.y); ui.notify(`No room: ${ITEMS[t].name} left at your feet`); }
    else if (!quiet) ui.notify(`+ ${ITEMS[t].name}${n > 1 ? ' ×' + n : ''}`, ITEMS[t].rarity);
    changed();
  }
  function takeItem(t) { const it = P.inv.items.find(i => i.t === t); if (!it) return false; it.n -= 1; if (it.n <= 0) P.inv.remove(it.id); changed(); return true; }
  function rewardBag(list, cash, title, x, y, z) {
    if (!net) return;
    const items = list.map(([t, n]) => ({ id: newId('i'), t, n, x: 0, y: 0, r: 0 }));
    net.request({ type: 'bag', items, cash, title, x, y: ctx.groundAt(x, z, y + 1) + 0.02, z, tb: null });
  }
  story = createStory({
    scene, player, enemies, sites: ctx.sites || [], notify: (m, r) => ui.notify(m, r), readNote: (a, b) => ctx.readNote && ctx.readNote(a, b),
    give: giveItem, has: hasItem, take: takeItem, sfx: (...a) => ctx.sfx && ctx.sfx(...a), rewardBag, groundAt: ctx.groundAt, heightAt: ctx.heightAt,
    bossIntro: (a, b) => ctx.bossIntro && ctx.bossIntro(a, b), bossBar: b => ctx.bossBar && ctx.bossBar(b), setObjective: o => ctx.setObjective && ctx.setObjective(o),
    ending: (a, b) => ctx.ending && ctx.ending(a, b), reveal: n => ctx.reveal && ctx.reveal(n), telegram: () => ctx.telegram && ctx.telegram(), firePool: (...a) => ctx.firePool && ctx.firePool(...a),
  });
  // ---------- horses, merchants, the train's defences ----------
  const pay = n => { if (P.cash < n) return false; P.cash -= n; changed(); return true; };
  const earn = n => { P.cash += n; changed(); };
  const takeN = (t, n = 1) => { const k = takeAmmo(t, n); changed(); return k; };
  const shared = { notify: (m, r) => ui.notify(m, r), sfx: (...a) => ctx.sfx && ctx.sfx(...a), take: takeN, count: ammoOf, cash: () => P.cash, pay, earn };
  horses = createHorses(Object.assign({}, shared, {
    scene, camera, player, groundAt: ctx.groundAt, heightAt: ctx.heightAt, waterAt: ctx.waterAt, biomeAt: ctx.biomeAt, pushOut: ctx.pushOut, trainPush: ctx.trainPush, railDist: ctx.railDist, half: ctx.half || 16000,
    enemies: () => enemies.list, held: () => held(), openContainer: info => openContainer(info), openShop: (kind, place) => merchants.openStore(kind, place, null),
    damage: (n, c) => damage(n, c), onMount: on => { ui.prompt(null); if (on) hint('horse'); },
  }));
  HOOKS.farmHorse = enc => horses.farmHorse(enc);
  merchants = createMerchants(Object.assign({}, shared, {
    scene, player, getTrain: train, groundAt: ctx.groundAt, heightAt: ctx.heightAt, waterAt: ctx.waterAt, inTown: ctx.inTown || (() => false), campfire: ctx.campfire,
    give: (t, n, quiet) => giveItem(t, n, quiet), room: (t, n) => invRoom(t, n), items: () => P.inv.items, horses,
    unlock: () => ctx.unlock(), lock: () => ctx.lock(),
  }));
  defence = createDefence(Object.assign({}, shared, { scene, player, net: () => net, shake: k => ctx.shake && ctx.shake(k) }));
  // burning oil, gas and the Ichor pit hurt while you stand in them
  let hazT = 0;
  function tickHazards(dt) {
    if (P.dead) return;
    const p = player.pos;
    for (const h of HAZARDS) {
      if (!h.on || Math.abs(h.x - p.x) > h.r || Math.abs(h.z - p.z) > h.r || Math.abs(h.y - p.y) > 2.5 || Math.hypot(h.x - p.x, h.z - p.z) > h.r) continue;
      damage(h.dps * dt, { fire: 'burned', gas: 'gassed', ichor: 'ichor' }[h.kind] || 'burned');
      if ((hazT -= dt) <= 0) { hazT = 1.2; ui.notify({ fire: 'You are burning!', gas: 'The gas burns your throat', ichor: 'The Ichor clings and burns' }[h.kind] || 'It burns!'); }
    }
  }
  function marker(kill) { if (!cross) return; cross.classList.remove('hit', 'kill'); void cross.offsetWidth; cross.classList.add(kill ? 'kill' : 'hit'); markT = kill ? 0.35 : 0.15; }
  function tracer(a, b) {
    const tr = TRACERS.find(t => t.t <= 0) || TRACERS[0], p = tr.l.geometry.attributes.position.array;
    p[0] = a.x; p[1] = a.y; p[2] = a.z; p[3] = b.x; p[4] = b.y; p[5] = b.z; tr.l.geometry.attributes.position.needsUpdate = true; tr.t = 0.07;
  }
  const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Vector3();
  function attack(h) {
    const W = WEAPONS[h.t]; if (!W) return false;
    if (player.seated) { ui.notify('Hands on the controls. Stand up to fight'); return true; }
    if (fireT > 0 || reloadT > 0) return true;
    camera.updateMatrixWorld(); camera.getWorldDirection(_d); _o.copy(camera.position);
    if (W.melee) {
      if (P.stamina < W.stam) { ui.notify('Too winded to swing'); return true; }
      P.stamina -= W.stam; P.rest = Math.max(P.rest, 0.5);
      fireT = W.rof; swingT = W.rof;
      setTimeout(() => {
        camera.updateMatrixWorld(); camera.getWorldDirection(_d);
        const r = enemies.melee(camera.position, _d, W.reach);
        if (r) { const head = r.part === 'head'; marker(enemies.hurt(r.e, W.dmg * (0.85 + Math.random() * 0.3) * (head ? 1.5 : 1), camera.position, r.part)); ctx.sfx && ctx.sfx('thud'); puff(r.point.x, r.point.y, r.point.z); }
        else ctx.sfx && ctx.sfx('swish');
        enemies.noise(player.pos.x, player.pos.z, 10);
      }, W.rof * 250);
      return true;
    }
    if (W.thrown) { throwDynamite(h); fireT = W.rof; return true; }
    const m = P.mag[h.id] ?? 0;
    if (m <= 0) { ctx.sfx && ctx.sfx('dry'); fireT = 0.25; if (ammoOf(W.ammo)) reload(h); else ui.notify(`No ${ITEMS[W.ammo].name.toLowerCase()} left`); return true; }
    P.mag[h.id] = m - 1; fireT = W.rof;
    if (W.arc) { arcShot(W); enemies.noise(player.pos.x, player.pos.z, W.loud); ctx.sfx && ctx.sfx('zap', 1, 0); flashT = 0.05; kickR = W.kick * 6; return true; }
    _m.copy(camera.localToWorld(_gv.set(0.3, -0.17, -1.0)));
    const aim = ctx.aiming && ctx.aiming() ? 0.35 : 1, moving = player.vel ? Math.min(1, Math.hypot(player.vel.x, player.vel.z) / 6) : 0;
    let hitAny = false;
    for (let k = 0; k < (W.pellets || 1); k++) {
      const s = W.spread * aim * (1 + moving * 1.5) + (W.pellets ? 0 : 0);
      const dir = _gv.copy(_d).add(new THREE.Vector3((Math.random() - 0.5) * 2 * s, (Math.random() - 0.5) * 2 * s, (Math.random() - 0.5) * 2 * s)).normalize().clone();
      const r = enemies.shoot(_o, dir, W.range);
      const end = r ? r.point : _o.clone().addScaledVector(dir, W.range);
      if (k < 3) tracer(_m, end);
      if (r && r.e) {
        const fall = W.pellets ? Math.max(0.25, 1 - r.dist / W.range) : r.dist > W.range * 0.6 ? 0.75 : 1;
        enemies.hurt(r.e, W.dmg * fall * (r.part === 'head' ? W.head : 1), camera.position, r.part); hitAny = true;
      } else if (r && r.shootable) { enemies.hurtShootable(r.shootable, W.dmg); puff(r.point.x, r.point.y, r.point.z); hitAny = true; }
      else if (r && r.wall) puff(r.point.x, r.point.y, r.point.z);
    }
    if (hitAny) marker(false);
    enemies.noise(player.pos.x, player.pos.z, W.loud); horses.noise(player.pos.x, player.pos.z, W.loud);
    ctx.sfx && ctx.sfx('gun', 1, 0, W.snd);
    flashT = 0.05; kickZ = W.kick * 3; kickR = W.kick * 6;
    ctx.kick && ctx.kick(W.kick * aim * 0.8);
    hint('combat');
    if (P.mag[h.id] === 0 && ammoOf(W.ammo)) setTimeout(() => { const hh = held(); if (hh && hh.id === h.id && !reloadT) reload(hh); }, W.rof * 900);
    return true;
  }
  // the Arc Caster: lightning that leaps from the first one it hits to the nearest others, weaker each jump
  function arcShot(W) {
    camera.updateMatrixWorld(); camera.getWorldDirection(_d); _o.copy(camera.position);
    const first = enemies.shoot(_o, _d, W.range);
    let cur = first && first.e ? first.e : null;
    if (!cur) { let bd = 1e9; for (const e of enemies.list) { if (e.hp <= 0) continue; const v = e.g.position.clone().setY(e.g.position.y + 1.1).sub(_o), d = v.length(); if (d > W.range || v.normalize().dot(_d) < 0.93) continue; if (d < bd) { bd = d; cur = e; } } }
    let from = camera.localToWorld(_gv.set(0.3, -0.17, -1.0)).clone(), dmg = W.dmg;
    if (!cur) { const end = first ? first.point : _o.clone().addScaledVector(_d, W.range); enemies.bolt(from, end); if (first && first.shootable) enemies.hurtShootable(first.shootable, 30); return; }
    const hit = new Set();
    for (let k = 0; k < 4 && cur; k++) {
      hit.add(cur); const to = cur.g.position.clone().setY(cur.g.position.y + 1.1 * cur.T.scale);
      enemies.bolt(from, to); enemies.hurt(cur, dmg, from, 'body'); from = to; dmg *= 0.72;
      let nx = null, nd = 9; for (const e of enemies.list) { if (hit.has(e) || e.hp <= 0) continue; const d = e.g.position.distanceTo(to); if (d < nd) { nd = d; nx = e; } } cur = nx;
    }
    marker(false);
  }
  function reload(h) {
    const W = WEAPONS[h.t]; if (!W || !W.ammo || reloadT > 0) return;
    const m = P.mag[h.id] ?? 0; if (m >= W.mag) { ui.notify('Already loaded'); return; }
    if (!ammoOf(W.ammo)) { ui.notify(`No ${ITEMS[W.ammo].name.toLowerCase()} for the ${ITEMS[h.t].name}`); return; }
    reloadT = W.reload; reloadFor = h.id; ctx.sfx && ctx.sfx('reload');
  }
  function finishReload() {
    const h = P.inv.get(reloadFor); reloadFor = null; if (!h) return;
    const W = WEAPONS[h.t], need = W.mag - (P.mag[h.id] ?? 0), got = W.perCell ? (takeAmmo(W.ammo, 1) ? need : 0) : takeAmmo(W.ammo, need);
    P.mag[h.id] = (P.mag[h.id] ?? 0) + got; changed();
  }
  function throwDynamite(h) {
    const it = P.inv.get(h.id); if (!it) return;
    it.n -= 1; if (it.n <= 0) P.inv.remove(it.id); changed();
    const m = itemModel('dynamite'); m.scale.setScalar(1.4); scene.add(m);
    camera.updateMatrixWorld(); camera.getWorldDirection(_d);
    const spark = new THREE.PointLight(0xffa040, 2, 4, 2); m.add(spark);
    THROWN.push({ m, spark, v: _d.clone().multiplyScalar(15).add(new THREE.Vector3(0, 3.5, 0)), t: WEAPONS.dynamite.fuse, spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0) });
    m.position.copy(camera.position).addScaledVector(_d, 0.6);
    ctx.sfx && ctx.sfx('fuse'); swingT = 0.5;
  }
  function tickCombat(dt) {
    fireT = Math.max(0, fireT - dt); swingT = Math.max(0, swingT - dt);
    if (reloadT > 0) { reloadT -= dt; const h = held(); if (!h || h.id !== reloadFor) { reloadT = 0; reloadFor = null; } else if (reloadT <= 0) { reloadT = 0; finishReload(); } }
    kickZ *= Math.max(0, 1 - dt * 14); kickR *= Math.max(0, 1 - dt * 12);
    flashT -= dt; flash.intensity = flashT > 0 ? 18 : 0; flashSp.material.opacity = flashT > 0 ? 1 : 0; flashSp.material.rotation = Math.random() * 6;
    for (const tr of TRACERS) if (tr.t > 0) { tr.t -= dt; tr.l.material.opacity = Math.max(0, tr.t / 0.07) * 0.7; }
    if (markT > 0 && (markT -= dt) <= 0 && cross) cross.classList.remove('hit', 'kill');
    for (let i = THROWN.length - 1; i >= 0; i--) {
      const d = THROWN[i]; d.t -= dt; d.v.y -= 9.8 * dt; d.m.position.addScaledVector(d.v, dt);
      d.m.rotation.x += d.spin.x * dt; d.m.rotation.y += d.spin.y * dt; d.spark.intensity = 1 + Math.random() * 2;
      const g = ctx.groundAt(d.m.position.x, d.m.position.z, d.m.position.y + 0.3);
      if (d.m.position.y < g + 0.05) { d.m.position.y = g + 0.05; if (d.v.y < 0) d.v.y *= -0.3; d.v.x *= 0.6; d.v.z *= 0.6; d.spin.multiplyScalar(0.6); }
      if (d.t <= 0) { const p = d.m.position; scene.remove(d.m); THROWN.splice(i, 1); enemies.explode(p.x, p.y + 0.3, p.z, WEAPONS.dynamite.r, WEAPONS.dynamite.dmg); }
    }
    // what the hand is doing: recoil, the reload dip, the swing
    const h = held(), W = h && WEAPONS[h.t];
    viewModel.position.z = -0.6 + kickZ; viewModel.rotation.x = kickR + (reloadT > 0 ? -0.9 * Math.sin(Math.min(1, (1 - reloadT / WEAPONS[P.inv.get(reloadFor)?.t || 'revolver'].reload)) * Math.PI) : 0);
    viewModel.rotation.z = swingT > 0 && W && (W.melee || W.thrown) ? -Math.sin((1 - swingT / W.rof) * Math.PI) * 1.2 : 0;
    if (ammoEl) {
      if (W && W.ammo && !player.seated && !P.dead) { ammoEl.style.display = ''; ammoEl.innerHTML = reloadT > 0 ? '<b>Reloading…</b>' : `<b>${P.mag[h.id] ?? 0}</b> / ${ammoOf(W.ammo)}`; ammoEl.classList.toggle('empty', !(P.mag[h.id] ?? 0)); }
      else if (W && W.thrown && !P.dead) { ammoEl.style.display = ''; ammoEl.innerHTML = `<b>${h.n}</b> stick${h.n > 1 ? 's' : ''}`; ammoEl.classList.remove('empty'); }
      else ammoEl.style.display = 'none';
    }
    if (W && !W.melee) hint('combat');
  }

  // ---------- frame ----------
  function update(dt, o) {
    if (!started) return;
    tickSurvival(dt, o.moving, o.sprinting); tickWarmth(dt, o);
    const under = !!(ctx.isUnder && ctx.isUnder(player.pos));
    enemies.update(dt, { night: o.night, air: o.air, flying: !!player.fly, dead: P.dead, moving: o.moving, sprinting: o.sprinting, crouch: !!player.crouch, inTown: !!o.loc, under, lair: story.inLair(), onTrain: !!player.onTrain });
    story.update(dt, { night: o.night, dead: P.dead }); tickHazards(dt);
    horses.update(dt, { sprinting: o.sprinting, under, inTown: !!o.loc, dead: P.dead });
    merchants.update(dt, { under, dead: P.dead }); defence.update(dt, enemies);
    tickCombat(dt);
    if ((scanT -= dt) <= 0) { scanT = 0.1; if (!P.dead && !ui.isOpen()) scan(); else target = null; }
    ui.prompt(target ? target.label : null);
    updateLoot(camera.position, dt, s => !!net.state.containers[cidOf(s)]);
    // walk away (or the train pulls away) and the container closes
    if (open && open.anchor && open.anchor().distanceTo(camera.position) > 4.2) { closeContainer(); ui.notify('Too far away'); }
    for (const [, v] of GV) if (v.d.tb != null) placeGround(v);
    updateHeld(dt, o.night, o.elapsed);
    hints(Object.assign({ dt }, o));
    updateAvatars(dt);
    // train: whoever is driving simulates it and tells everyone else; the host keeps the fuel
    const t = train();
    if (t) {
      const auth = isTrainAuthority();
      if (auth && t.sync) t.sync = null;
      t.power = fuelNow() > 0 ? 1 : 0; t.fuel = fuelNow(); t.up = net.state.train.up || {}; t.grip = o.grip ?? 1;
      if (auth) {
        if ((tposeT -= dt) <= 0) { tposeT = 0.1; net.broadcast('tpose', { s: t.s, v: t.v, throttle: t.throttle, brake: t.brake, rv: ROUTE_V }); if (net.isHost) { net.state.train.s = t.s; net.state.train.rv = ROUTE_V; } }
        if (t.power && !t.brake && Math.abs(t.throttle) > 0.02) burnAcc += dt * D().fuel * (t.up.tank ? 0.7 : 1) * (0.01 + 0.27 * Math.abs(t.throttle) * Math.min(1, Math.abs(t.v) / 10 + 0.3));
        else if (t.power) burnAcc += dt * 0.004;
        if ((burnT -= dt) <= 0 && burnAcc > 0) { burnT = 1; const a = burnAcc; burnAcc = 0; net.request({ type: 'burn', amount: a }).then(r => { if (r.ok && r.fuel <= 0) ui.notify('The firebox has gone cold. Stoke it with coal or wood'); }); }
      }
    }
    if ((poseT -= dt) <= 0) {
      poseT = 0.1;
      const pose = { x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw, seated: !!player.seated || player.perch != null, dead: P.dead, tb: null, horse: horses.pose() };
      if (t && player.onTrain && player.trainLocal) { pose.tb = player.trainBody; pose.tl = [player.trainLocal.x, player.trainLocal.y, player.trainLocal.z]; pose.yaw = player.yaw - t.heading; }
      net.pose(pose);
    }
    if ((saveT -= dt) <= 0) { saveT = 5; retryLimbo(); savePlayer(); if (net.isHost) net.save(); }
    hurtT = Math.max(0, hurtT - dt);
    ui.tick(fuelNow(), weight(), envNow);
  }

  // one bound action (see input.js); returns true when the gameplay layer handled it
  function action(id, e) {
    if (!started || P.dead) return false;
    if (merchants.isOpen) { if (id === "interact" || id === "inventory" || id === "playerInv") { merchants.close(); return true; } return false; }
    if (id === "callHorse") { horses.call(); return true; }
    if (id === 'inventory' || id === 'playerInv') {
      if (e) e.preventDefault();
      if (ui.isOpen()) closeInventory(); else { ui.show(true); ctx.unlock(); hint('loot'); }
      return true;
    }
    if (ui.isOpen()) {
      if (id === 'interact') { closeInventory(); return true; }
      if (id === 'rotate') return ui.rotateDrag();
      if (id.startsWith('hot')) return ui.bindHovered(+id.slice(3) - 1);
      return false;
    }
    if (id === 'interact') {
      if (player.seated) { stand(); return true; }
      if (target) { target.act(); return true; }
      return true;
    }
    if (id.startsWith('hot')) { const k = +id.slice(3) - 1; P.sel = P.sel === k ? -1 : k; const h = held(); if (h) { ui.notify(ITEMS[h.t].name); if (ITEMS[h.t].light) lampOn = true; } ui.renderHot(); return true; }
    if (id === 'primary') { click(); return true; }
    if (id === 'flashlight') {
      if (!P.inv.items.some(i => ITEMS[i.t].light)) { ui.notify('You have no lantern'); return true; }
      lampOn = !lampOn; ctx.sfx && ctx.sfx('use'); return true;
    }
    if (id === 'reload') {
      const h = held();
      if (h && WEAPONS[h.t] && WEAPONS[h.t].ammo) reload(h);
      return true;
    }
    return false;
  }
  function closeInventory() { if (merchants.isOpen) { merchants.close(); return; } ui.show(false); closeContainer(); ctx.lock(); }
  function wheel(dy) { if (!started || ui.isOpen() || P.dead) return; let k = P.sel; for (let i = 0; i < HOTBAR; i++) { k = (k + (dy > 0 ? 1 : HOTBAR - 1) + HOTBAR) % HOTBAR; if (P.hot[k]) break; } P.sel = P.hot[k] ? k : -1; ui.renderHot(); }
  function click() {
    if (!started || ui.isOpen() || P.dead) return;
    const h = held(); if (!h) return;
    const d = ITEMS[h.t];
    if ((d.horse || d.horseFood || d.horseHeal) && !WEAPONS[h.t]) useItem(h.id);
    else if (WEAPONS[h.t] && !(d.fuel && nearSpot("firebox", 2.6))) attack(h);
    else if (d.fuel && nearSpot('firebox', 2.6)) stokeWith(h.id);
    else if (d.use || d.up || h.t === 'firewood') useItem(h.id);
  }

  return {
    begin, update, action, closeInventory, wheel, click, trainArrived, damage, enemies,
    get uiOpen() { return ui.isOpen() || merchants.isOpen; },
    get riding() { return horses.riding; },
    ride(dt, inp) { return horses.ride(dt, inp); },
    horses, merchants,
    save() { if (!started) return; savePlayer(); if (net && net.isHost) net.save(); },
    setNames(v) { showNames = v; for (const [, a] of AV) a.label.visible = v; },
    refreshUI() { if (started) ui.renderAll(); },
    get started() { return started; },
    get blocked() { return P.dead || ui.isOpen() || merchants.isOpen; },
    get dead() { return P.dead; },
    get net() { return net; },
    stand,
    fx(kind) { if (net) net.broadcast('fx', kind); },
    sprintOK() { return started && !P.winded && P.stamina > 0 && weight() < MAX_CARRY; },
    jumpOK() { if (!started) return true; if (P.stamina < 8) return false; P.stamina -= 8; P.rest = Math.max(P.rest, 0.6); return true; },
    speedMul() { const w = weight(), k = P.warmth < 20 ? 0.8 : 1; return k * (w <= CARRY ? 1 : Math.max(0.5, 1 - (w - CARRY) / (MAX_CARRY - CARRY) * 0.5)); },
    get warmth() { return P.warmth; }, get env() { return envNow; },
    drown(dt) { damage(dt * 12, 'drowned'); },
    land(v) { if (v > 6 && ctx.shake) ctx.shake(Math.min(1, (v - 6) / 10) * 0.6); if (v > 12) damage((v - 12) * 8 * D().fall, 'fell'); },
  };
}
