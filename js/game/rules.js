// Shared-world rules with no browser dependencies, run both by the game in the browser and by the multiplayer
// server: what loot a container holds, what the train's storage starts with, and the train defence operations.
import { ITEMS, RARITY } from './itemdata.js';
import { newId } from './grid.js';
import { dominantBiome } from '../biomes.js';
import { mulberry32 } from '../noise.js';

// ---------- train storage ----------
// storage carried by the train; later carriage types slot in here with their own capacity
export const CARRIAGE_TYPES = {
  cargo: { cid: 'train:cargo', title: 'Cargo Car', w: 10, h: 7, spot: 'cargo' },
  toolbox: { cid: 'train:toolbox', title: 'Cab Toolbox', w: 4, h: 3, spot: 'toolbox' },
};
export const STARTERS = {
  'train:cargo': [['coal', 6], ['coal', 6], ['firewood', 4], ['beans', 3], ['bandage', 4], ['canteen', 1]],
  'train:toolbox': [['hammer', 1], ['nails', 30], ['wrench', 1]],
};
export const starterLoot = cid => STARTERS[cid] ? { items: STARTERS[cid].map(([t, n]) => ({ id: newId('S'), t, n, x: 0, y: 0, r: 0 })), cash: 0 } : null;

// ---------- loot ----------
export const KINDS = {
  crate: { title: 'Crate', w: 5, h: 4, rolls: [1, 3], empty: 0.12, cash: [0.15, 1, 6] },
  barrel: { title: 'Barrel', w: 4, h: 3, rolls: [1, 2], empty: 0.2, cash: [0, 0, 0] },
  sack: { title: 'Feed Sack', w: 3, h: 3, rolls: [1, 2], empty: 0.2, cash: [0, 0, 0] },
  cabinet: { title: 'Cabinet', w: 5, h: 4, rolls: [1, 3], empty: 0.1, cash: [0.3, 1, 8] },
  shelf: { title: 'Shelf', w: 6, h: 2, rolls: [1, 2], empty: 0.15, cash: [0.1, 1, 3] },
  chest: { title: 'Chest', w: 7, h: 4, rolls: [2, 4], empty: 0, cash: [0.6, 3, 25] },
  drawer: { title: 'Dresser Drawers', w: 5, h: 2, rolls: [1, 2], empty: 0.1, cash: [0.45, 1, 12] },
  safe: { title: 'Safe', w: 4, h: 3, rolls: [2, 3], empty: 0, cash: [1, 20, 90] },
  locker: { title: 'Gun Locker', w: 5, h: 5, rolls: [1, 3], empty: 0.05, cash: [0.1, 2, 6] },
  wagon: { title: 'Abandoned Wagon', w: 7, h: 5, rolls: [1, 3], empty: 0.1, cash: [0.2, 1, 10] },
  cart: { title: 'Hand Cart', w: 5, h: 3, rolls: [1, 2], empty: 0.2, cash: [0, 0, 0] },
  minecart: { title: 'Mine Cart', w: 5, h: 3, rolls: [1, 3], empty: 0.1, cash: [0, 0, 0] },
  // resource nodes out in the wild: what they hold depends only on what they are
  woodpile: { title: 'Woodpile', w: 5, h: 3, rolls: [2, 3], empty: 0, cash: [0, 0, 0], node: true },
  orevein: { title: 'Ore Seam', w: 5, h: 3, rolls: [1, 3], empty: 0, cash: [0, 0, 0], node: true },
  herbs: { title: 'Wild Plants', w: 4, h: 2, rolls: [1, 2], empty: 0, cash: [0, 0, 0], node: true },
  snowcache: { title: 'Expedition Cache', w: 6, h: 4, rolls: [2, 4], empty: 0, cash: [0.3, 2, 15], node: true },
  scrap: { title: 'Scrap Heap', w: 5, h: 3, rolls: [1, 3], empty: 0.05, cash: [0.1, 1, 3], node: true },
  // the special places: richer, fixed to their kind, drawn as a chest, safe or locker (look)
  vault: { title: 'Safe-Deposit Box', w: 4, h: 3, rolls: [2, 3], empty: 0, cash: [1, 40, 160], node: true, look: 'safe' },
  labcase: { title: 'Laboratory Case', w: 5, h: 4, rolls: [2, 3], empty: 0, cash: [0, 0, 0], node: true, look: 'locker' },
  stash: { title: 'Outlaw Stash', w: 7, h: 4, rolls: [2, 4], empty: 0, cash: [0.8, 10, 60], node: true, look: 'chest' },
  tomb: { title: 'Burial Casket', w: 6, h: 4, rolls: [2, 3], empty: 0, cash: [0.5, 5, 40], node: true, look: 'chest' },
  fuelcrate: { title: 'Fuel Store', w: 6, h: 4, rolls: [2, 3], empty: 0, cash: [0, 0, 0], node: true, look: 'crate' },
  farmchest: { title: 'Tack Chest', w: 6, h: 4, rolls: [2, 3], empty: 0, cash: [0.2, 1, 8], node: true, look: 'chest' },
};
const T = {
  crate: { plank: 6, nails: 6, beans: 4, jerky: 3, coal: 3, firewood: 3, rope: 3, cloth: 3, lampOil: 2, pistolAmmo: 3, rifleAmmo: 1.5, shells: 1.2, hammer: 1, ironBar: 2, bottle: 2, dynamite: 0.6, goldNugget: 0.5, sheetMetal: 1, barbedWire: 0.8, glassPane: 0.7 },
  barrel: { beans: 3, jerky: 3, coal: 3, lampOil: 3, nails: 3, bottle: 4, cactusFruit: 2, coffee: 2, pistolAmmo: 2 },
  sack: { beans: 3, coffee: 3, jerky: 3, bread: 3, cloth: 2, cactusFruit: 2, oats: 3, apple: 1.5, carrot: 1.5 },
  cabinet: { beans: 3, bread: 2, coffee: 2, tonic: 2, bandage: 3, bottle: 3, cards: 2, harmonica: 1, pocketWatch: 1, ring: 0.5, lampOil: 2, pistolAmmo: 2, compass: 0.7, canteen: 1 },
  shelf: { beans: 4, bottle: 4, tonic: 1.5, nails: 3, cloth: 2, coffee: 2, lampOil: 2, bandage: 2, jerky: 2, rope: 1.5 },
  chest: { cloth: 3, cards: 2, harmonica: 2, pocketWatch: 2, ring: 1.5, revolver: 1, pistolAmmo: 3, badge: 1, goldNugget: 1.5, silverBar: 0.8, deed: 0.3, medkit: 0.8, bandage: 2, boot: 1, lantern: 1 },
  drawer: { cards: 3, bandage: 3, pocketWatch: 1.5, ring: 1, pistolAmmo: 3, compass: 1, harmonica: 1.5, tonic: 1, badge: 0.6 },
  safe: { goldNugget: 4, silverBar: 3, goldBar: 1.2, deed: 0.8, pocketWatch: 2, ring: 2, revolver: 1, pistolAmmo: 2 },
  locker: { revolver: 2, rifle: 1.5, shotgun: 1.5, knife: 2, pistolAmmo: 4, rifleAmmo: 3, shells: 3, dynamite: 1, bandage: 2, badge: 1.5, lantern: 1 },
  wagon: { plank: 4, rope: 3, cloth: 3, firewood: 3, coal: 2, beans: 2, boot: 2, skull: 1, shovel: 1, pickaxe: 0.8, lantern: 0.8, wrench: 0.8, rifleAmmo: 1, goldNugget: 0.5, canteen: 1, oats: 1.5, saddle: 0.4, barbedWire: 0.6 },
  cart: { plank: 3, firewood: 3, coal: 2, rope: 2, shovel: 1, boot: 1 },
  minecart: { coal: 6, goldNugget: 2, pickaxe: 1, lampOil: 2, dynamite: 1, ironBar: 2, copperOre: 2, ironOre: 2 },
  woodpile: { firewood: 8, plank: 3, rope: 0.5 },
  orevein: { ironOre: 5, copperOre: 4, coal: 3, turquoise: 1.2, goldNugget: 0.8, silverBar: 0.2 },
  herbs: { herbs: 6, berries: 3, mushrooms: 3, swampMoss: 2, ghostOrchid: 0.25 },
  snowcache: { frozenRations: 5, firewood: 4, lampOil: 3, scarf: 1.5, gloves: 1.5, furHat: 1, woolCoat: 0.8, warmCoat: 0.35, coal: 2, rope: 2, medkit: 0.5, kitHeater: 0.25 },
  scrap: { scrap: 7, nails: 3, sheetMetal: 1.5, ironBar: 1.5, wrench: 0.4, kitCanvas: 0.15, barbedWire: 1.5, glassPane: 0.6, kitPlow: 0.12 },
  vault: { bankNotes: 5, goldNugget: 3, silverBar: 3, goldBar: 1.5, pocketWatch: 2, ring: 2, deed: 0.6 },
  labcase: { teslaCell: 3, copperCoil: 5, medkit: 1.5, tonic: 2, sheetMetal: 1, kitLamp: 0.4, kitEngine: 0.3 },
  stash: { outlawGold: 1, pistolAmmo: 4, rifleAmmo: 3, shells: 3, dynamite: 2, revolver: 1, rifle: 0.7, shotgun: 0.7, bottle: 3, jerky: 3, cards: 2 },
  tomb: { ancientIdol: 1.5, goldNugget: 3, ring: 2, skull: 3, cloth: 2, silverBar: 1 },
  fuelcrate: { crudeOil: 6, refinedFuel: 2.5, coal: 4, lampOil: 4, wrench: 1, kitTank: 0.4 },
  farmchest: { rope: 4, cloth: 2, hammer: 1, nails: 2, oats: 4, apple: 2.5, carrot: 2.5, saddle: 2.2, saddlebags: 1.6, liniment: 1.8, cartKit: 0.5, barbedWire: 1.5, plank: 2, lantern: 1 },
};
// every ordinary container also draws on what its region offers, so a cabinet in Silverpeak holds warmer things than
// one in Dry Gulch. Locomotive upgrades turn up mostly in the region where they matter
const BIOME_T = [
  { coal: 3, scrap: 3, firewood: 2, beans: 2, canteen: 1, cactusFruit: 1, kitEngine: 0.12, kitTank: 0.15, kitPlow: 0.06 },
  { firewood: 3, plank: 3, berries: 3, apple: 1.5, venison: 1.5, mushrooms: 2, herbs: 2, rope: 1.5, woolCoat: 0.6, kitLamp: 0.12, kitTank: 0.1 },
  { swampMoss: 3, herbs: 3, scrap: 2, bottle: 2, gatorHide: 0.8, ghostOrchid: 0.12, tonic: 1, kitLamp: 0.18, kitCanvas: 0.12 },
  { copperOre: 2.5, ironOre: 2.5, turquoise: 0.8, goldNugget: 1, dynamite: 1, scrap: 1.5, wrench: 0.6, fossil: 0.05, kitBrakes: 0.18, kitEngine: 0.06 },
  { warmCoat: 0.6, woolCoat: 1, furHat: 1.2, gloves: 1.5, scarf: 1.8, frozenRations: 2.5, firewood: 3, coal: 2, lampOil: 1.5, ironOre: 1, kitHeater: 0.18, kitBrakes: 0.08, kitCanvas: 0.1 },
];
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
// what a loot spot holds: fixed by its id, so every player (and the server) rolls the same contents
export function genLootFor(spot) {
  const K = KINDS[spot.kind], tab = T[spot.kind], rnd = mulberry32(hash(spot.id) ^ 0x51ed);
  const out = { items: [], cash: 0 };
  if (!K || !tab) return out;
  if (rnd() < K.cash[0]) out.cash = Math.round(K.cash[1] + rnd() * (K.cash[2] - K.cash[1]));
  if (rnd() < K.empty) return out;
  const mix = Object.assign({}, tab);
  if (!K.node) { const extra = BIOME_T[dominantBiome(spot.x, spot.z)]; for (const id in extra) mix[id] = (mix[id] || 0) + extra[id] * 0.7; }
  const entries = Object.entries(mix).filter(([id]) => ITEMS[id]).map(([id, w]) => [id, w * RARITY[ITEMS[id].rarity].w]);
  const total = entries.reduce((a, e) => a + e[1], 0);
  const rolls = K.rolls[0] + Math.floor(rnd() * (K.rolls[1] - K.rolls[0] + 1));
  for (let r = 0; r < rolls; r++) {
    let x = rnd() * total, pick = entries[0][0];
    for (const [id, w] of entries) { x -= w; if (x <= 0) { pick = id; break; } }
    const d = ITEMS[pick], n = Math.min(d.stack, d.loot[0] + Math.floor(rnd() * (d.loot[1] - d.loot[0] + 1)));
    out.items.push({ id: newId('L'), t: pick, n, x: 0, y: 0, r: 0 });
  }
  return out;
}

// ---------- train defences ----------
export const SECTIONS = {
  cab: { name: 'the cab', short: 'Cab' },
  carL: { name: 'the cargo car\'s left wall', short: 'Car, left' },
  carR: { name: 'the cargo car\'s right wall', short: 'Car, right' },
  carB: { name: 'the cargo car\'s tailgate', short: 'Tailgate' },
};
export const MAX = [100, 180, 300]; // bare, barricaded, plated
export function defaultDef() { const d = { winL: 1, winR: 1 }; for (const k in SECTIONS) d[k] = { hp: 100, lvl: 0, wire: 0 }; return d; }

// host side: the train.def operations (called from Net.apply)
export function applyDef(S, op) {
  const d = S.train.def ? JSON.parse(JSON.stringify(S.train.def)) : defaultDef(), s = d[op.sec];
  let res = { ok: true };
  if (op.op === 'hit') {
    if (!s || s.hp <= 0) return { ok: false };
    s.hp = Math.max(0, s.hp - Math.max(0, Math.min(60, op.n || 0))); res.broke = s.hp <= 0;
    if (op.win && d[op.win] === 1 && (s.hp < MAX[s.lvl] * 0.6 || res.broke)) { d[op.win] = 0; res.window = true; }
  } else if (op.op === 'fix') { if (!s || s.hp >= MAX[s.lvl]) return { ok: false, err: 'full' }; s.hp = Math.min(MAX[s.lvl], s.hp + Math.max(0, Math.min(100, op.add || 0))); res.msg = `Patched ${SECTIONS[op.sec].name} · ${Math.round(s.hp)}/${MAX[s.lvl]}`; }
  else if (op.op === 'up') { if (!s || s.lvl >= 2 || s.hp < MAX[s.lvl]) return { ok: false, err: 'full' }; s.lvl++; s.hp = MAX[s.lvl]; res.msg = s.lvl === 1 ? `${SECTIONS[op.sec].name[0].toUpperCase() + SECTIONS[op.sec].name.slice(1)} is boarded up` : `${SECTIONS[op.sec].name[0].toUpperCase() + SECTIONS[op.sec].name.slice(1)} is plated with iron`; }
  else if (op.op === 'wire') { if (!s || s.wire) return { ok: false, err: 'full' }; s.wire = 1; res.msg = `Barbed wire runs along ${SECTIONS[op.sec].name}`; }
  else if (op.op === 'win') { if (d[op.w] !== 0) return { ok: false, err: 'full' }; d[op.w] = op.v === 2 ? 2 : 1; res.msg = op.v === 2 ? 'The window is boarded over' : 'New glass in the cab window'; }
  else if (op.op === 'all') { for (const k in SECTIONS) d[k].hp = MAX[d[k].lvl]; if (d.winL === 0) d.winL = 1; if (d.winR === 0) d.winR = 1; }
  else return { ok: false };
  res.def = d;
  return res;
}
