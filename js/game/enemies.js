// The dead: what walks in each region, where they rise, how they hunt you, and how they fall.
// Zombies are simulated by each rider's own game around them (they are not shared between tabs).
// Bodies are built and animated in zombiebody.js; hits are raycast against their body parts.
// How they hunt: they wander until they see you (in a cone ahead, shortened by night and fog, blocked by hills) or hear
// you (footsteps, and every gunshot and blast). A noise far off brings them to look; close up, or once they've seen you,
// they come for you. Out of sight they follow where you were for a while, then search there, then drift off again.
import * as THREE from 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/three.module.js';
import { DESERT, FOREST, SWAMP, BADLANDS, SNOW } from '../biomes.js';
import { SHOOTABLES } from './registry.js';
import { makeBody, pose, deathPose, emberMats } from './zombiebody.js';

// ---------- the kinds of dead ----------
// hp, walk/run speed (m/s), dmg per hit, reach (m), scale, colours; look: clothing and kit (see zombiebody.js).
// build: body shape. gait: how it moves. attack: claw | lunge | slam | swing | punch. voice: what it sounds like.
// windup: seconds from the start of a blow to it landing. sightK/hearK: senses. memory: seconds it follows where you
// were once you're out of sight. poise: share of its health one blow must take to stagger it. armourK: what its
// armour lets through. rally: it calls the dead around it when it finds you
const DROPS_EXTRA = {};
export const TYPES = {
  walker: { name: 'Walker', hp: 70, walk: 1.2, run: 3.3, dmg: 11, reach: 1.45, scale: 1, skin: 0x8e9468, shirt: 0x8a6a44, pants: 0x4a3c2c, look: ['hat', 'hair', 'suspenders'], gait: 'shamble', attack: 'claw', voice: 'moan', memory: 8 },
  cowpoke: { name: 'Cowboy zombie', hp: 95, walk: 1.3, run: 3.7, dmg: 14, reach: 1.5, scale: 1.04, skin: 0x7f8a5e, shirt: 0x6a2a20, pants: 0x3a3a44, look: ['hat', 'vest', 'bandana', 'chaps', 'spurs', 'belt', 'holster'], gait: 'swagger', attack: 'punch', voice: 'drawl', memory: 9 },
  runner: { name: 'Runner', hp: 48, walk: 1.6, run: 6.0, dmg: 9, reach: 1.35, scale: 0.94, skin: 0x8a8a62, shirt: 0x6a5040, pants: 0x3a2e22, look: ['hair'], build: 'thin', gait: 'sprint', attack: 'lunge', voice: 'shriek', windup: 0.3, sightK: 1.2, memory: 14 },
  miner: { name: 'Miner zombie', hp: 110, walk: 1.2, run: 3.2, dmg: 20, reach: 1.7, scale: 1.02, skin: 0x8a7a5a, shirt: 0x6a5a40, pants: 0x3a3226, look: ['helmet', 'pick', 'overalls'], gait: 'hunch', attack: 'swing', voice: 'cough', windup: 0.7, memory: 8 },
  canyonBrute: { name: 'Canyon brute', hp: 560, walk: 1.3, run: 4.0, dmg: 38, reach: 2.4, scale: 1.65, skin: 0x7a5038, shirt: 0x4a2a1a, pants: 0x2a1a12, look: ['spikes'], build: 'brute', gait: 'lumber', attack: 'slam', voice: 'roar', windup: 0.9, poise: 0.6, boss: true },
  lurker: { name: 'Woodland lurker', hp: 80, walk: 1.0, run: 4.8, dmg: 13, reach: 1.45, scale: 0.98, skin: 0x6a7a58, shirt: 0x3e4a30, pants: 0x2e3424, look: ['moss', 'hair'], gait: 'hunch', attack: 'lunge', voice: 'hiss', windup: 0.35, ambush: true, hearK: 1.3 },
  lumberjack: { name: 'Rotten lumberjack', hp: 150, walk: 1.2, run: 3.2, dmg: 26, reach: 1.9, scale: 1.12, skin: 0x7c8a62, shirt: 0x8a2a24, pants: 0x2c3448, look: ['axe', 'hair', 'suspenders'], gait: 'stride', attack: 'swing', voice: 'moan', windup: 0.75 },
  bloater: { name: 'Bog bloater', hp: 60, walk: 0.8, run: 1.9, dmg: 0, reach: 2.2, scale: 1.08, skin: 0x7a8a50, shirt: 0x5a6038, pants: 0x3a3a26, look: ['bloat'], gait: 'shamble', voice: 'gurgle', explode: { r: 4.5, dmg: 34 } },
  drowned: { name: 'Drowned one', hp: 85, walk: 1.1, run: 3.6, dmg: 13, reach: 1.5, scale: 1, skin: 0x5e7068, shirt: 0x3a4a44, pants: 0x2a3430, look: ['moss', 'weed', 'hair'], gait: 'shamble', attack: 'claw', voice: 'gurgle', swims: true },
  frozen: { name: 'Frozen zombie', hp: 120, walk: 0.9, run: 2.6, dmg: 14, reach: 1.5, scale: 1.02, skin: 0x9fb4c0, shirt: 0x5a6878, pants: 0x3a4250, look: ['ice', 'scarf', 'hair'], gait: 'stiff', attack: 'claw', voice: 'rattle', chill: 10, sightK: 0.85, memory: 6 },
  frozenMiner: { name: 'Frozen miner', hp: 140, walk: 1.0, run: 2.8, dmg: 22, reach: 1.75, scale: 1.04, skin: 0xa8bcc8, shirt: 0x6a5a48, pants: 0x3a3428, look: ['helmet', 'pick', 'ice', 'overalls'], gait: 'stiff', attack: 'swing', voice: 'rattle', windup: 0.8, chill: 8 },
  frostBrute: { name: 'Frostbitten brute', hp: 650, walk: 1.2, run: 4.2, dmg: 40, reach: 2.5, scale: 1.75, skin: 0xb4c8d4, shirt: 0x40505e, pants: 0x2a323c, look: ['ice', 'spikes'], build: 'brute', gait: 'lumber', attack: 'slam', voice: 'roar', windup: 0.9, poise: 0.6, chill: 16, boss: true },
  // the new dead
  brute: { name: 'Brute', hp: 300, walk: 1.1, run: 3.4, dmg: 30, reach: 2.0, scale: 1.32, skin: 0x7a7a58, shirt: 0x4a3a2a, pants: 0x2e2a22, look: ['hair'], build: 'brute', gait: 'lumber', attack: 'slam', voice: 'roar', windup: 0.9, poise: 0.5, memory: 10 },
  crawler: { name: 'Crawler', hp: 45, walk: 0.9, run: 2.6, dmg: 10, reach: 1.3, scale: 1, skin: 0x8a8a64, shirt: 0x5a4a36, pants: 0x3a3226, look: ['legless', 'hair'], gait: 'crawl', attack: 'lunge', voice: 'hiss', windup: 0.35, low: true, sightK: 0.7, hearK: 1.4, memory: 6 },
  armoured: { name: 'Armoured zombie', hp: 160, walk: 1.0, run: 2.8, dmg: 18, reach: 1.6, scale: 1.04, skin: 0x8a8a6a, shirt: 0x5a2a20, pants: 0x3a3226, look: ['armour', 'belt'], gait: 'march', attack: 'punch', voice: 'clank', windup: 0.6, armourK: 0.3, poise: 0.4, memory: 10 },
  burnt: { name: 'Burnt zombie', hp: 70, walk: 1.4, run: 4.2, dmg: 12, reach: 1.45, scale: 0.98, skin: 0xffffff, shirt: 0x2a1c14, pants: 0x2a1c14, look: ['burnt'], gait: 'flail', attack: 'claw', voice: 'crackle', burns: true, memory: 8 },
  sheriff: { name: 'Sheriff zombie', hp: 150, walk: 1.3, run: 3.6, dmg: 16, reach: 1.5, scale: 1.06, skin: 0x8a8e6a, shirt: 0xb8a888, pants: 0x2a2620, look: ['sheriffHat', 'badge', 'vest', 'coat', 'belt', 'holster', 'spurs', 'tidy'], gait: 'stride', attack: 'punch', voice: 'bellow', rally: 40, sightK: 1.15, memory: 12 },
};
// the special places' dead, the outlaws, and the bosses that guard what the cure needs. special: boss behaviour;
// ranged: shoots (outlaws); human: no glowing eyes, shouts instead of groans
Object.assign(TYPES, {
  clerk: { name: 'Dead bank clerk', hp: 65, walk: 1.2, run: 3.4, dmg: 11, reach: 1.45, scale: 0.98, skin: 0x8a9070, shirt: 0xd8d0c0, pants: 0x2a2a30, look: ['vest', 'visor', 'hair'], gait: 'shamble', attack: 'claw', voice: 'moan' },
  penitent: { name: 'Pale penitent', hp: 70, walk: 1.0, run: 3.6, dmg: 12, reach: 1.5, scale: 1, skin: 0xd8d4c8, shirt: 0x2a2428, pants: 0x2a2428, look: ['robe'], gait: 'stride', attack: 'claw', voice: 'moan' },
  experiment: { name: 'Specimen', hp: 95, walk: 1.4, run: 4.6, dmg: 13, reach: 1.5, scale: 1.02, skin: 0x8ab0a8, shirt: 0xd8d8d0, pants: 0xd8d8d0, look: ['spark'], gait: 'flail', attack: 'lunge', voice: 'shriek', chill: 0 },
  tarwalker: { name: 'Tar walker', hp: 150, walk: 0.9, run: 2.6, dmg: 17, reach: 1.6, scale: 1.08, skin: 0x141214, shirt: 0x1a1618, pants: 0x141214, look: ['tar'], gait: 'lumber', attack: 'slam', voice: 'gurgle', windup: 0.8 },
  crypt: { name: 'Catacomb dead', hp: 85, walk: 1.2, run: 4.2, dmg: 13, reach: 1.5, scale: 1, skin: 0xd8d0b8, shirt: 0x4a4238, pants: 0x3a342a, look: ['bones'], build: 'thin', gait: 'shamble', attack: 'claw', voice: 'rattle' },
  outlaw: { name: 'Outlaw', hp: 75, walk: 1.8, run: 4.6, dmg: 9, reach: 1.4, scale: 1, skin: 0xc8956a, shirt: 0x6a4a30, pants: 0x3a3428, look: ['hat', 'bandana', 'duster', 'gun', 'belt'], gait: 'stride', attack: 'punch', human: true, ranged: { dmg: 8, rof: 1.5, range: 40, acc: 0.5, keep: [9, 22] } },
  banker: { name: 'Silas Crowe', hp: 950, walk: 1.3, run: 3.4, dmg: 26, reach: 1.9, scale: 1.25, skin: 0x9aa080, shirt: 0x141418, pants: 0x141418, look: ['tophat', 'suit', 'chain'], gait: 'stride', attack: 'punch', voice: 'bellow', poise: 0.5, boss: true, special: 'banker' },
  scientist: { name: 'Dr. Augustus Volt', hp: 850, walk: 1.6, run: 3.2, dmg: 20, reach: 1.6, scale: 1.05, skin: 0x9ab0b4, shirt: 0xe8e8e0, pants: 0x3a3a40, look: ['labcoat', 'goggles', 'spark'], gait: 'stride', attack: 'claw', voice: 'shriek', poise: 0.5, boss: true, special: 'scientist' },
  blackjack: { name: 'Black Jack Mercer', hp: 700, walk: 2.4, run: 5.0, dmg: 22, reach: 1.6, scale: 1.08, skin: 0x8a8470, shirt: 0x141414, pants: 0x1a1a1a, look: ['hat', 'duster', 'gun', 'bandana', 'belt', 'spurs'], gait: 'swagger', attack: 'punch', human: true, poise: 0.5, boss: true, special: 'blackjack', ranged: { dmg: 12, rof: 0.65, range: 55, acc: 0.6, keep: [8, 20] } },
  behemoth: { name: 'The Tar Behemoth', hp: 1600, walk: 0.9, run: 2.3, dmg: 45, reach: 3.6, scale: 2.5, skin: 0x121012, shirt: 0x161214, pants: 0x121012, look: ['tar', 'spikes', 'bloat'], build: 'brute', gait: 'lumber', attack: 'slam', voice: 'roar', windup: 1, poise: 0.8, boss: true, special: 'behemoth' },
  warden: { name: 'The Crypt Warden', hp: 650, walk: 1.4, run: 4.4, dmg: 30, reach: 2.0, scale: 1.4, skin: 0xd8d0b8, shirt: 0x3a3a40, pants: 0x2a2a30, look: ['bones', 'armour', 'spikes'], gait: 'march', attack: 'swing', voice: 'clank', poise: 0.6, armourK: 0.5, boss: true, special: 'warden' },
  guardian: { name: 'The Pale Guardian', hp: 2200, walk: 1.0, run: 2.4, dmg: 42, reach: 3.4, scale: 2.7, skin: 0xb8b0a0, shirt: 0x8a8478, pants: 0x6a6458, look: ['bones', 'spikes', 'stone'], build: 'brute', gait: 'lumber', attack: 'slam', voice: 'roar', windup: 1.1, poise: 0.8, boss: true, special: 'guardian' },
});
Object.assign(DROPS_EXTRA, {
  clerk: [['bankNotes', 0.25, 1, 1], ['pocketWatch', 0.06, 1, 1], ['pistolAmmo', 0.2, 2, 5]],
  penitent: [['cloth', 0.3, 1, 2], ['ring', 0.05, 1, 1], ['ancientIdol', 0.02, 1, 1]],
  experiment: [['copperCoil', 0.3, 1, 2], ['teslaCell', 0.08, 1, 1], ['medkit', 0.05, 1, 1]],
  tarwalker: [['crudeOil', 0.35, 1, 1], ['scrap', 0.2, 1, 2], ['refinedFuel', 0.04, 1, 1]],
  crypt: [['goldNugget', 0.12, 1, 1], ['skull', 0.15, 1, 1], ['ring', 0.05, 1, 1]],
  outlaw: [['pistolAmmo', 0.6, 3, 9], ['rifleAmmo', 0.3, 2, 6], ['jerky', 0.2, 1, 2], ['bottle', 0.15, 1, 1], ['revolver', 0.08, 1, 1], ['dynamite', 0.08, 1, 1]],
  brute: [['scrap', 0.5, 1, 3], ['rifleAmmo', 0.35, 3, 8], ['jerky', 0.25, 1, 2], ['dynamite', 0.1, 1, 1]],
  crawler: [['scrap', 0.2, 1, 1], ['pistolAmmo', 0.2, 1, 4]],
  armoured: [['scrap', 0.6, 2, 4], ['ironOre', 0.25, 1, 2], ['rifleAmmo', 0.25, 2, 6], ['ring', 0.04, 1, 1]],
  burnt: [['scrap', 0.2, 1, 2], ['lampOil', 0.12, 1, 1]],
  sheriff: [['pistolAmmo', 0.6, 4, 10], ['badge', 0.25, 1, 1], ['revolver', 0.06, 1, 1], ['pocketWatch', 0.06, 1, 1]],
});

// what rises in each region, by weight; bosses are rare
const SPAWN = [
  [['walker', 6], ['cowpoke', 3], ['runner', 1.2], ['miner', 0.8], ['sheriff', 0.6], ['burnt', 0.8], ['crawler', 1], ['brute', 0.4]],
  [['lurker', 5], ['lumberjack', 2.5], ['walker', 1.5], ['crawler', 0.8], ['armoured', 0.5], ['brute', 0.3]],
  [['drowned', 5], ['bloater', 2.5], ['lurker', 1], ['crawler', 1]],
  [['miner', 4], ['runner', 3], ['walker', 2], ['burnt', 1.5], ['armoured', 0.9], ['brute', 0.5], ['sheriff', 0.4], ['canyonBrute', 0.12]],
  [['frozen', 5], ['frozenMiner', 3], ['crawler', 0.6], ['armoured', 0.4], ['frostBrute', 0.12]],
];
// what they carry; [item, chance, min, max]
const DROPS = {
  walker: [['pistolAmmo', 0.3, 2, 6], ['jerky', 0.12, 1, 1], ['scrap', 0.12, 1, 2], ['cards', 0.04, 1, 1]],
  cowpoke: [['pistolAmmo', 0.45, 3, 8], ['bottle', 0.1, 1, 1], ['badge', 0.03, 1, 1], ['pocketWatch', 0.04, 1, 1], ['revolver', 0.025, 1, 1]],
  runner: [['scrap', 0.25, 1, 3], ['canteen', 0.08, 1, 1]],
  miner: [['copperOre', 0.3, 1, 2], ['ironOre', 0.2, 1, 2], ['turquoise', 0.08, 1, 1], ['dynamite', 0.06, 1, 1], ['goldNugget', 0.05, 1, 1], ['pickaxe', 0.03, 1, 1]],
  canyonBrute: [['goldBar', 0.7, 1, 1], ['turquoise', 0.8, 1, 3], ['dynamite', 0.6, 1, 3], ['rifleAmmo', 0.8, 6, 14]],
  lurker: [['berries', 0.2, 1, 3], ['herbs', 0.15, 1, 2], ['rifleAmmo', 0.12, 2, 5], ['mushrooms', 0.1, 1, 2]],
  lumberjack: [['firewood', 0.5, 1, 3], ['venison', 0.15, 1, 1], ['woolCoat', 0.05, 1, 1], ['shells', 0.15, 1, 3]],
  bloater: [['swampMoss', 0.4, 1, 3], ['ghostOrchid', 0.05, 1, 1]],
  drowned: [['swampMoss', 0.25, 1, 2], ['gatorHide', 0.06, 1, 1], ['ring', 0.04, 1, 1], ['shells', 0.2, 1, 3], ['lampOil', 0.08, 1, 1]],
  frozen: [['frozenRations', 0.25, 1, 2], ['scarf', 0.05, 1, 1], ['gloves', 0.05, 1, 1], ['firewood', 0.2, 1, 2]],
  frozenMiner: [['ironOre', 0.3, 1, 2], ['silverBar', 0.05, 1, 1], ['furHat', 0.05, 1, 1], ['dynamite', 0.06, 1, 1], ['rifleAmmo', 0.15, 2, 6]],
  frostBrute: [['silverBar', 0.8, 1, 2], ['warmCoat', 0.5, 1, 1], ['furHat', 0.5, 1, 1], ['rifleAmmo', 0.8, 8, 16]],
};
// how many may walk around you at once (doubled-ish at night)
const CAP = { off: 0, few: 5, normal: 10, many: 18 };
Object.assign(DROPS, DROPS_EXTRA);

export function createEnemies(ctx) {
  const { scene, player, camera } = ctx, S = ctx.settings || {};
  const Z = [], CORPSES = [], ray = new THREE.Raycaster(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), bw = new Float32Array(5);
  let spawnT = 3, eventT = 240 + Math.random() * 240, groanT = 2, lastTrain = null;
  const stats = { kills: 0 };

  function pickType(bi) {
    const L = SPAWN[bi]; let s = 0; for (const [, w] of L) s += w;
    let r = Math.random() * s; for (const [k, w] of L) { r -= w; if (r <= 0) return k; } return L[0][0];
  }
  const dominant = (x, z) => { ctx.biomeAt(x, z, bw); let b = 0; for (let i = 1; i < 5; i++) if (bw[i] > bw[b]) b = i; return b; };
  function spawn(type, x, z, o = {}) {
    const T = TYPES[type], g = makeBody(T), y = o.y != null ? ctx.groundAt(x, z, o.y + 0.6) : ctx.groundAt(x, z, ctx.heightAt(x, z) + 1);
    g.position.set(x, o.rise ? y - 1.9 * T.scale : y, z); g.rotation.y = Math.random() * Math.PI * 2;
    scene.add(g);
    const e = {
      type, T, g, rig: g.userData.rig, hp: T.hp * (ctx.diff().hp || 1), state: o.state === 'chase' ? 'chase' : 'wander', aggro: !!o.aggro,
      thinkT: Math.random() * 0.3, lod: 0, windT0: 0, stagger: 0, lastX: player.pos.x, lastZ: player.pos.z, lastSeenT: 0, goalX: x, goalZ: z, searchT: 0, stepQ: 0, flinchSide: 1, seen: 0, lostT: 0, atkT: 0, wind: 0,
      t: Math.random() * 10, vel: new THREE.Vector3(), wander: Math.random() * Math.PI * 2, wanderT: 0, rise: o.rise ? 1 : 0, hidden: T.ambush && !o.aggro, stuck: 0, last: new THREE.Vector3(x, y, z), side: Math.random() < 0.5 ? -1 : 1, onTrain: false, flinch: 0,
    };
    if (o.key) e.key = o.key;
    if (o.boss) { e.boss = o.boss; e.home = o.boss.home; e.hp *= 1; }
    e.maxHp = e.hp; e.shotT = 1 + Math.random() * 1.5; e.sT = [2 + Math.random() * 2, 8, 6, 0];
    e.casters = []; g.traverse(m => { if (m.isMesh) { m.userData.z = e; if (m.castShadow) e.casters.push(m); } });
    Z.push(e);
    if (T.boss && !T.special) ctx.toast(`${T.name}! The ground shakes under it`, true);
    return e;
  }
  // a spot out of sight, away from fires, on dry ground (the drowned want water)
  function findSpot(r0, r1, wantWater, avoidView = true) {
    const p = player.pos; camera.getWorldDirection(tmp);
    for (let k = 0; k < 14; k++) {
      const a = Math.random() * Math.PI * 2, r = r0 + Math.random() * (r1 - r0), x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (avoidView && k < 9) { const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz); if ((dx * tmp.x + dz * tmp.z) / d > 0.45) continue; }
      const h = ctx.heightAt(x, z), wl = ctx.waterAt(x, z), wet = wl > h + 0.3;
      if (wantWater ? !wet || wl - h > 2.5 : wet) continue;
      if (ctx.groundAt(x, z, h + 1.2) > h + 0.6) continue; // a floor or a roof: not inside buildings
      if (ctx.nearHeat(x, z, 18)) continue;
      return [x, z];
    }
    return null;
  }
  function trySpawn(night) {
    const cap = Math.round((CAP[S.enemies || 'normal'] ?? 10) * (0.55 + night * 0.75) * (ctx.diff().count || 1));
    if (Z.length >= cap) return;
    const bi = dominant(player.pos.x, player.pos.z), type = pickType(bi), T = TYPES[type];
    if (T.boss && Z.some(e => e.T.boss)) return;
    if (T.boss && night < 0.5 && Math.random() < 0.7) return;
    const spot = findSpot(55, 115, T.swims && Math.random() < 0.7);
    if (spot) spawn(type, spot[0], spot[1], { rise: T.swims || Math.random() < 0.25 });
  }
  // the bigger moments: an ambush in the trees, the swamp giving up its dead, a horde out of the blizzard
  function event(o) {
    const bi = dominant(player.pos.x, player.pos.z), n = 3 + Math.floor(Math.random() * 3);
    if (CAP[S.enemies || 'normal'] === 0 || ctx.nearHeat(player.pos.x, player.pos.z, 12)) return;
    const msgs = ['Dust devils kick up and shapes walk out of them', 'The birds stop singing. Something is in the trees', 'Bubbles rise in the black water around you', 'Lamps flicker in the ravine. Miners, or what is left of them', 'Shapes stagger out of the white'];
    const pool = [['walker', 'cowpoke', 'runner', 'sheriff', 'crawler'], ['lurker', 'lurker', 'lumberjack', 'crawler', 'armoured'], ['drowned', 'drowned', 'bloater', 'crawler'], ['miner', 'miner', 'runner', 'burnt', 'armoured'], ['frozen', 'frozen', 'frozenMiner', 'crawler']][bi];
    if (bi === SNOW && o.air && o.air.snow < 0.5 && Math.random() < 0.6) return; // the frozen come with the snow
    let made = 0;
    for (let i = 0; i < n; i++) { const s = findSpot(bi === FOREST ? 16 : 24, bi === FOREST ? 30 : 45, bi === SWAMP, false); if (s) { spawn(pool[i % pool.length], s[0], s[1], { rise: bi === SWAMP, aggro: bi !== FOREST, state: bi === FOREST ? 'wander' : 'chase' }); made++; } }
    if (made) { ctx.toast(msgs[bi]); ctx.sfx('groan', 1, 0); }
  }

  // ---------- noise and damage ----------
  // a sound at x, z carrying r metres: close by they come straight for it; further off they come to look, and the
  // further they are the less sure they are where it came from
  function noise(x, z, r) {
    for (const e of Z) {
      if (e.hp <= 0 || e.leash) continue;
      const d = Math.hypot(e.g.position.x - x, e.g.position.z - z); if (d > r * (e.T.hearK || 1)) continue;
      e.hidden = false;
      if (d < r * 0.35 || e.state === 'chase') { setChase(e, x, z); continue; }
      const err = d * 0.15; e.state = 'investigate'; e.goalX = x + (Math.random() - 0.5) * err; e.goalZ = z + (Math.random() - 0.5) * err; e.searchT = 4 + Math.random() * 3;
    }
  }
  function setChase(e, x, z) {
    const was = e.state === 'chase'; e.state = 'chase'; e.aggro = true; e.lostT = 0; e.lastSeenT = 0; e.lastX = x; e.lastZ = z;
    if (!was && e.T.rally) rally(e);
  }
  // a sheriff finding you raises the alarm: every one of the dead around him comes to look
  function rally(e) {
    const p = e.g.position; voice(e, Math.hypot(player.pos.x - p.x, player.pos.z - p.z), 1.4);
    for (const f of Z) if (f !== e && f.hp > 0 && f.state !== 'chase' && !f.leash && Math.hypot(f.g.position.x - p.x, f.g.position.z - p.z) < e.T.rally) { f.hidden = false; f.state = 'investigate'; f.goalX = player.pos.x + (Math.random() - 0.5) * 6; f.goalZ = player.pos.z + (Math.random() - 0.5) * 6; f.searchT = 5; }
  }
  // a blow: plate turns most of it (with a ring you can hear), every hit makes them flinch away from it, and one big
  // enough for their size staggers them and breaks off whatever blow they were winding up
  function hurt(e, n, from, part) {
    if (e.hp <= 0) return false;
    const T = e.T, pos = e.g.position;
    if (part === 'armour') { n *= T.armourK ?? 0.45; ctx.sfx('zstep', Math.max(0.25, 1 - pos.distanceTo(player.pos) / 40), relPan(pos), 'ping'); }
    e.hp -= n; e.hidden = false; e.flinch = 0.22;
    setChase(e, player.pos.x, player.pos.z);
    if (from) {
      tmp2.subVectors(pos, from).setY(0).normalize();
      e.vel.addScaledVector(tmp2, Math.min(4, n / 18) / (T.build === 'brute' ? 3 : 1) / T.scale);
      e.flinchSide = Math.sign(Math.cos(e.g.rotation.y) * tmp2.x - Math.sin(e.g.rotation.y) * tmp2.z) || 1;
    }
    if (e.hp > 0 && n > e.maxHp * (T.poise ?? 0.3)) { e.stagger = T.boss ? 0.6 : 0.9 + Math.random() * 0.3; e.wind = 0; }
    if (e.hp <= 0) {
      // how it falls: away from the blow, to its knees from a headshot, flat if it was already crawling
      const front = from ? Math.sin(e.g.rotation.y) * (from.x - pos.x) + Math.cos(e.g.rotation.y) * (from.z - pos.z) > 0 : Math.random() < 0.5;
      e.fallKind = T.low ? 'sprawl' : part === 'head' && n < 200 && Math.random() < 0.6 ? 'buckle' : front ? 'back' : 'fwd';
      kill(e, part === 'head'); return true;
    }
    return false;
  }
  function kill(e, head, self) { // self: a bloater bursting on its own, not your kill
    e.hp = 0; e.wind = 0; e.windT = 0; e.flinch = 0; e.stagger = 0; e.state = 'dead';
    if (!e.fallKind) e.fallKind = e.T.low ? 'sprawl' : Math.random() < 0.5 ? 'fwd' : 'back';
    if (!self) stats.kills++;
    const i = Z.indexOf(e); if (i >= 0) Z.splice(i, 1);
    CORPSES.push({ e, t: 0 });
    voice(e, e.g.position.distanceTo(player.pos), 0.7);
    // the burnt go up as they fall: a patch of fire where they drop, so don't stand over them
    if (e.T.burns && !self) { const p = e.g.position; ctx.firePool(p.x, p.y, p.z, 1.6, 5); }
    if (e.T.explode && !e.blown) { e.blown = true; explode(e.g.position.x, e.g.position.y + 1, e.g.position.z, e.T.explode.r, e.T.explode.dmg, e); }
    if (!self) for (const [item, ch, a, b] of DROPS[e.type] || []) if (Math.random() < ch) ctx.drop(item, a + Math.floor(Math.random() * (b - a + 1)), e.g.position.x + (Math.random() - 0.5), e.g.position.z + (Math.random() - 0.5), e.g.position.y);
    if (!self && ctx.onKill) ctx.onKill(e, head);
  }
  // a blast: knocks over and kills what is close, hurts you too if you stood too near
  function explode(x, y, z, r, dmg, src, cause) {
    ctx.boom(x, y, z, r);
    const c = new THREE.Vector3(x, y - 1, z);
    for (const e of Z.slice()) { if (e === src) continue; const d = e.g.position.distanceTo(c); if (d < r * 1.4) hurt(e, dmg * 2.6 * (1 - d / (r * 1.4)), c, 'body'); }
    const d = player.pos.distanceTo(c);
    if (d < r) ctx.hitPlayer(dmg * (1 - d / r) * (src ? 1 : 1.6), cause || (src && src.T && src.T.explode ? 'bloater' : 'blown'), x, z);
    for (const s of SHOOTABLES.slice()) if (!s.broken && Math.hypot(s.x - x, s.z - z) < r) breakShootable(s, 0.25);
    noise(x, z, 140);
  }
  // first thing a shot from o along dir meets within range: a zombie part, the ground, or a wall
  const _hits = [];
  // the nearest real body part along a ray: poses are brought up to date first (they are otherwise a frame behind where
  // you see them), and hats are passed straight through, so a shot through the brim is neither a headshot nor a hit
  function partHit(list) {
    for (const g of list) g.updateMatrixWorld(true);
    _hits.length = 0; ray.intersectObjects(list, true, _hits);
    for (const h of _hits) if (h.object.userData.zpart !== 'gear' && h.object.visible) return h;
    return null;
  }
  function shoot(o, dir, range) {
    ray.set(o, dir); ray.far = range; ray.camera = camera;
    const list = [];
    for (const e of Z) if (e.hp > 0 && e.g.position.distanceTo(o) < range + 4) list.push(e.g);
    const zh = list.length ? partHit(list) : null;
    let far = zh ? zh.distance : range;
    const bl = ctx.blockers && ctx.blockers(o);
    if (bl && bl.length) { const w = ray.intersectObjects(bl, true)[0]; if (w && w.distance < far) return { wall: true, point: w.point, dist: w.distance }; }
    // the ground: fine steps, so a shot just clearing a rise or a body lying in a hollow is judged on the real surface
    if (!(ctx.isUnder && ctx.isUnder(o))) for (let s = 0.5; s < far; s += s < 40 ? 0.5 : 1) { tmp.copy(o).addScaledVector(dir, s); if (ctx.heightAt(tmp.x, tmp.z) > tmp.y) return { wall: true, point: tmp.clone(), dist: s }; }
    for (const s of SHOOTABLES) { if (s.broken || s.mesh.position.distanceTo(o) > far + 1) continue; const h = ray.intersectObject(s.mesh, false)[0]; if (h && h.distance < far) return { shootable: s, point: h.point, dist: h.distance }; }
    if (zh) return { e: zh.object.userData.z, part: zh.object.userData.zpart, point: zh.point, dist: zh.distance };
    return null;
  }
  // red barrels and the like: enough damage and they go off (and set off their neighbours)
  function breakShootable(s, delay = 0) {
    if (s.broken) return; s.broken = true;
    setTimeout(() => s.onBreak && s.onBreak(), delay * 1000);
  }
  function hurtShootable(s, n) { if (s.broken) return; s.hp -= n; if (s.hp <= 0) breakShootable(s); }
  // a swing: first whatever your blade actually meets along your aim (head counts), otherwise a narrow cone just in front,
  // so a swing at one that's slightly off-centre still lands
  function melee(o, dir, reach) {
    ray.set(o, dir); ray.far = reach + 0.25;
    const list = [];
    for (const e of Z) if (e.hp > 0 && e.g.position.distanceTo(o) < reach + 3) list.push(e.g);
    const h = list.length ? partHit(list) : null;
    if (h) return { e: h.object.userData.z, part: h.object.userData.zpart, point: h.point, dist: h.distance };
    let best = null, bd = 1e9;
    for (const e of Z) {
      if (e.hp <= 0) continue;
      // aim for the body's height; a crawler is down at your feet, so swinging low at it counts
      const lo = e.T.low ? 0.1 : 0.5 * e.T.scale, hi = e.T.low ? 0.5 : 1.5 * e.T.scale;
      tmp.copy(e.g.position).setY(Math.max(e.g.position.y + lo, Math.min(e.g.position.y + hi, o.y))).sub(o); const d = tmp.length();
      if (d > reach + 0.3 * e.T.scale || tmp.normalize().dot(dir) < (e.T.low ? 0.7 : 0.8)) continue;
      if (d < bd) { bd = d; best = e; }
    }
    return best ? { e: best, part: 'body', point: best.g.position.clone().setY(best.T.low ? best.g.position.y + 0.3 : o.y - 0.2), dist: bd } : null;
  }

  // ---------- gunfire, thrown things, warnings on the ground ----------
  const SHOTS = [], LOBS = [], RINGS = [], BOLTS = [];
  const shotMat = new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.8, depthWrite: false });
  // an outlaw's shot: worse at range, worse if you are moving or crouched; you hear every one, panned
  function rangedFire(e, dt, o, dist) {
    const R = e.T.ranged; e.shotT -= dt;
    if (e.shotT > 0 || dist > R.range || o.dead || o.flying) return;
    e.shotT = R.rof * (0.7 + Math.random() * 0.6);
    const pos = e.g.position, from = new THREE.Vector3(pos.x, pos.y + 1.45 * e.T.scale, pos.z), to = player.pos.clone().setY(player.pos.y + 1.2);
    let chance = R.acc * (1 - dist / R.range * 0.6) * (o.moving ? (o.sprinting ? 0.55 : 0.75) : 1) * (o.crouch ? 0.8 : 1);
    const hit = Math.random() < chance;
    if (!hit) to.add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.3) * 2, (Math.random() - 0.5) * 3));
    const g = new THREE.BufferGeometry().setFromPoints([from, to]), l = new THREE.Line(g, shotMat); l.frustumCulled = false; scene.add(l); SHOTS.push({ l, t: 0.06 });
    ctx.sfx('egun', Math.max(0.15, 1 - dist / 140), relPan(pos), e.T.boss ? 'rifle' : 'revolver');
    if (hit) ctx.hitPlayer(R.dmg * (ctx.diff().dmg || 1), 'shot', pos.x, pos.z);
  }
  // something thrown in an arc that lands where you were: coin purses, dynamite, tar, boulders
  function lob(e, kind, speed = 14) {
    const pos = e.g.position, from = new THREE.Vector3(pos.x, pos.y + 1.8 * e.T.scale, pos.z), to = player.pos.clone();
    to.x += player.vel ? player.vel.x * 0.5 : 0; to.z += player.vel ? player.vel.z * 0.5 : 0;
    const d = Math.hypot(to.x - from.x, to.z - from.z), T = Math.max(0.6, d / speed), v = new THREE.Vector3((to.x - from.x) / T, (to.y - from.y) / T + 4.9 * T, (to.z - from.z) / T);
    const look = { coins: [0xe0b040, 0.22, 0.5], dynamite: [0xa8301e, 0.12, 0.3], tar: [0x0a080a, 0.5, 0.05], rock: [0x8a8478, 0.7, 1] }[kind];
    const m = new THREE.Mesh(kind === 'dynamite' ? new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8) : new THREE.SphereGeometry(look[1], 10, 8), new THREE.MeshStandardMaterial({ color: look[0], roughness: look[2], metalness: kind === 'coins' ? 0.8 : 0 }));
    m.position.copy(from); m.castShadow = true; scene.add(m);
    LOBS.push({ m, v, kind, src: e, fuse: kind === 'dynamite' ? 2.2 : 0, landed: false });
    ring(to.x, to.z, to.y, kind === 'rock' ? 2.6 : kind === 'dynamite' ? 4.5 : 2.4, T + (kind === 'dynamite' ? 1.8 : 0), kind === 'tar' ? 0x301810 : 0xff6030);
  }
  // a glowing ring that warns where a blow will land; then fn() if it still matters
  function ring(x, z, y, r, t, color, fn) {
    const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.86, r, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, ctx.groundAt(x, z, y + 0.6) + 0.06, z); scene.add(m); RINGS.push({ m, t, T: t, fn });
  }
  function bolt(a, b) {
    const pts = [a.clone()]; for (let i = 1; i < 7; i++) { const k = i / 7; pts.push(a.clone().lerp(b, k).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8))); } pts.push(b.clone());
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 1, depthWrite: false })); l.frustumCulled = false; scene.add(l); BOLTS.push({ l, t: 0.18 });
    ctx.flash && ctx.flash(b.x, b.y, b.z);
  }
  const near = (x, z, r) => Math.hypot(player.pos.x - x, player.pos.z - z) < r;
  const onGround = () => !ctx.airborne || !ctx.airborne();
  function summon(e, type, n, r = 6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, x = e.g.position.x + Math.cos(a) * r, z = e.g.position.z + Math.sin(a) * r;
      const m = spawn(type, x, z, { y: e.g.position.y, rise: true, aggro: true, state: 'chase', key: e.key + ':minion' }); m.minion = true;
    }
  }
  // what each boss does besides walking at you and hitting. Return [speed, dirX, dirZ] to take over its movement
  const SPECIAL = {
    banker(e, dt, o, dist) {
      e.sT[0] -= dt; e.sT[1] -= dt;
      if (e.sT[0] <= 0 && dist > 4 && dist < 26) { e.sT[0] = e.hp < e.maxHp / 2 ? 2.4 : 3.6; lob(e, 'coins', 13); e.wind = 0.35; }
      if (e.sT[1] <= 0) { e.sT[1] = 15; if (Z.filter(z => z.minion && z.key === e.key + ':minion').length < 4) { summon(e, 'clerk', 2, 4); ctx.toast('"Clerks! Count him out!"'); } }
    },
    scientist(e, dt, o, dist, dx, dz) {
      e.sT[0] -= dt; e.sT[1] -= dt;
      const angry = e.hp < e.maxHp / 2;
      if (e.sT[0] <= 0) {
        e.sT[0] = angry ? 1.9 : 3.1; e.wind = 0.4;
        const aims = angry ? [[0, 0], [2.6, 1.4], [-2.4, -1.8]] : [[0, 0]];
        for (const [ox, oz] of aims) {
          const x = player.pos.x + ox, z = player.pos.z + oz, y = player.pos.y;
          ring(x, z, y, 2.4, 1.1, 0x6ad8ff, () => { const top = new THREE.Vector3(x, y + 7, z), bot = new THREE.Vector3(x, ctx.groundAt(x, z, y + 0.6) + 0.1, z); bolt(top, bot); ctx.sfx('zap', 1, relPan(bot)); if (near(x, z, 2.4) && Math.abs(player.pos.y - y) < 3) ctx.hitPlayer(28 * (ctx.diff().dmg || 1), 'shocked', x, z); });
        }
      }
      if (e.sT[1] <= 0 && e.boss.coils) {
        e.sT[1] = angry ? 7 : 11;
        const c = e.boss.coils[Math.floor(Math.random() * e.boss.coils.length)], from = e.g.position.clone().setY(e.g.position.y + 1.2);
        e.g.position.set(c[0], c[1], c[2]); bolt(from, e.g.position.clone().setY(c[1] + 1.2)); ctx.sfx('zap', 1, 0);
      }
      if (e.g.userData.spark) e.g.userData.spark.scale.setScalar(0.08 * (1 + Math.random()));
      // he keeps away from you
      if (dist < 7) return [e.T.run, -dx / dist, -dz / dist];
      if (dist < 13) return [e.T.walk, -dz / dist, dx / dist];
    },
    blackjack(e, dt, o, dist) {
      e.sT[0] -= dt;
      if (e.sT[0] <= 0 && dist > 9 && dist < 28) { e.sT[0] = 11; lob(e, 'dynamite', 12); ctx.toast('"Catch!"'); }
      if (!e.called && e.hp < e.maxHp / 2) { e.called = true; summon(e, 'outlaw', 3, 12); ctx.toast('"BOYS! On me!"'); }
    },
    behemoth(e, dt, o, dist) {
      e.sT[0] -= dt; e.sT[1] -= dt;
      if (e.sT[0] <= 0 && dist > 7 && dist < 34) { e.sT[0] = e.hp < e.maxHp / 2 ? 2.8 : 4.2; lob(e, 'tar', 12); e.wind = 0.4; }
      if (e.sT[1] <= 0 && dist < 7) {
        e.sT[1] = 6; const p = e.g.position.clone();
        ring(p.x, p.z, p.y, 6, 1.1, 0xff6020, () => { ctx.boom(p.x, p.y, p.z, 3); if (near(p.x, p.z, 6) && onGround()) ctx.hitPlayer(40 * (ctx.diff().dmg || 1), 'crushed', p.x, p.z); });
      }
    },
    warden(e, dt, o, dist, dx, dz) {
      e.sT[0] -= dt;
      if (e.dash > 0) {
        e.dash -= dt;
        if (!e.dashHit && dist < 2.2) { e.dashHit = true; ctx.hitPlayer(32 * (ctx.diff().dmg || 1), 'crushed', e.g.position.x, e.g.position.z); }
        return [14, e.dashDir[0], e.dashDir[1]];
      }
      if (e.charge > 0) { e.charge -= dt; if (e.charge <= 0) { e.dash = 0.65; e.dashHit = false; e.dashDir = [dx / dist, dz / dist]; ctx.sfx('groan', 1, 0, 0.7); } return [0, dx / dist, dz / dist]; }
      if (e.sT[0] <= 0 && dist > 5 && dist < 22) { e.sT[0] = 5.5; e.charge = 0.8; const p = e.g.position; ring(p.x, p.z, p.y, 1.6, 0.8, 0xffffff); }
    },
    guardian(e, dt, o, dist) {
      e.sT[0] -= dt; e.sT[1] -= dt;
      if (e.sT[0] <= 0 && dist < 11) {
        e.sT[0] = e.hp < e.maxHp / 3 ? 3.8 : 5.4; e.wind = 1.1; const p = e.g.position.clone();
        ring(p.x, p.z, p.y, 7.5, 1.2, 0xd8d0b8, () => { ctx.boom(p.x, p.y, p.z, 2); if (near(p.x, p.z, 7.5) && onGround()) ctx.hitPlayer(40 * (ctx.diff().dmg || 1), 'crushed', p.x, p.z); });
      }
      if (e.sT[1] <= 0 && dist > 11) { e.sT[1] = 4.2; lob(e, 'rock', 15); }
      const k = e.hp / e.maxHp;
      if (!e.s66 && k < 0.66) { e.s66 = true; summon(e, 'crypt', 4, 8); ctx.toast('The dead claw their way out of the floor'); }
      if (!e.s33 && k < 0.33) { e.s33 = true; summon(e, 'crypt', 5, 8); ctx.toast('The Guardian roars, and the catacombs answer'); }
    },
  };
  function tickFx(dt) {
    for (let i = SHOTS.length - 1; i >= 0; i--) { const s = SHOTS[i]; if ((s.t -= dt) <= 0) { scene.remove(s.l); s.l.geometry.dispose(); SHOTS.splice(i, 1); } }
    for (let i = BOLTS.length - 1; i >= 0; i--) { const s = BOLTS[i]; s.l.material.opacity = Math.max(0, s.t / 0.18); if ((s.t -= dt) <= 0) { scene.remove(s.l); s.l.geometry.dispose(); BOLTS.splice(i, 1); } }
    for (let i = RINGS.length - 1; i >= 0; i--) {
      const r = RINGS[i]; r.t -= dt; r.m.material.opacity = 0.25 + 0.55 * (1 - r.t / r.T) * (0.7 + 0.3 * Math.sin(r.t * 30));
      if (r.t <= 0) { scene.remove(r.m); r.m.geometry.dispose(); RINGS.splice(i, 1); if (r.fn) r.fn(); }
    }
    for (let i = LOBS.length - 1; i >= 0; i--) {
      const L = LOBS[i], p = L.m.position;
      if (!L.landed) {
        L.v.y -= 9.8 * dt; p.addScaledVector(L.v, dt); L.m.rotation.x += dt * 6;
        const g = ctx.groundAt(p.x, p.z, p.y + 0.3);
        if (p.y <= g + 0.1) {
          L.landed = true; p.y = g + 0.1;
          if (L.kind === 'coins') { if (near(p.x, p.z, 2.4)) ctx.hitPlayer(18 * (ctx.diff().dmg || 1), 'coins', p.x, p.z); ctx.sfx('thud'); }
          if (L.kind === 'rock') { ctx.boom(p.x, p.y, p.z, 1.5); if (near(p.x, p.z, 2.6)) ctx.hitPlayer(30 * (ctx.diff().dmg || 1), 'crushed', p.x, p.z); }
          if (L.kind === 'tar') { if (near(p.x, p.z, 2.4)) ctx.hitPlayer(14 * (ctx.diff().dmg || 1), 'burned', p.x, p.z); ctx.firePool(p.x, p.y, p.z, 2.6, 10); }
          if (L.kind !== 'dynamite') { scene.remove(L.m); LOBS.splice(i, 1); continue; }
        }
      }
      if (L.kind === 'dynamite' && (L.fuse -= dt) <= 0) { scene.remove(L.m); LOBS.splice(i, 1); explode(p.x, p.y + 0.3, p.z, 4.5, 45, L.src, 'blown'); }
    }
  }

  // ---------- frame ----------
  const STEP = new THREE.Vector3();
  let embers = [], emberT = 0;
  // whether it can see you: in a cone ahead (all round once it's hunting you), cut short by dark and fog, and not
  // through the brow of a hill between you
  function canSee(e, dx, dz, dist, sight) {
    const T = e.T;
    if (dist > sight * (T.sightK || 1) * (e.state === 'chase' ? 1.3 : 1)) return false;
    if (e.state !== 'chase' && dist > 4 && facing(e, dx, dz) < 0.34) return false;
    if (dist > 12) {
      const p = e.g.position, eye = p.y + (T.low ? 0.5 : 1.6 * T.scale), aim = player.pos.y + 1.4 - eye;
      for (let k = 1; k <= 3; k++) { const f = k / 4; if (ctx.heightAt(p.x + dx * f, p.z + dz * f) > eye + aim * f) return false; }
    }
    return true;
  }
  // a few times a second rather than every frame: what it sees and hears, and what it means to do about it.
  // A glimpse or a footstep brings it over to look; a good look (quicker up close) and it comes for you. Out of sight
  // it follows where you were for as long as it remembers, then searches about there, then wanders off
  function think(e, o, dx, dz, dist, sight, hearing, quiet, td) {
    const T = e.T, p = player.pos;
    if (o.dead || o.flying) {
      e.sees = false; e.aggro = false;
      if (e.state === 'chase' || e.state === 'investigate') { e.state = 'search'; e.searchT = 3; e.goalX = e.lastX; e.goalZ = e.lastZ; }
      return;
    }
    if (e.hidden) {
      if (dist < 13 * quiet) { e.hidden = false; setChase(e, p.x, p.z); voice(e, dist, 1.4); ctx.toast(`A ${T.name.toLowerCase()} lunges out of the brush`); }
      return;
    }
    e.sees = canSee(e, dx, dz, dist, sight);
    const heard = dist < hearing * (T.hearK || 1);
    if (e.sees || heard) {
      e.seen += td * (dist < 12 ? 3 : 1) * (e.sees ? 1 : 0.6);
      if (e.state === 'chase') { e.lastX = p.x; e.lastZ = p.z; e.lostT = 0; }
      else if (e.seen > 0.6) { setChase(e, p.x, p.z); e.alertT = T.gait === 'sprint' ? 0.12 : 0.35; voice(e, dist, 1); }
      else if (e.state !== 'investigate') { e.state = 'investigate'; e.goalX = p.x; e.goalZ = p.z; e.searchT = 4; e.goT = 0; }
    } else {
      e.seen = Math.max(0, e.seen - td * 0.4);
      if (e.state === 'chase') {
        e.lostT += td;
        const there = Math.hypot(e.lastX - e.g.position.x, e.lastZ - e.g.position.z) < 1.5;
        if (e.lostT > (T.memory || (T.boss ? 30 : 8)) || (there && e.lostT > 1.5)) { e.state = 'search'; e.searchT = 6 + Math.random() * 4; e.goalX = e.lastX; e.goalZ = e.lastZ; e.aggro = false; }
      }
    }
  }
  // far off they lose their small parts, then their shadows, then animate less often
  function setLod(e, lod) {
    if ((lod >= 1) !== (e.lod >= 1)) for (const m of e.rig.detail) m.visible = lod < 1;
    if ((lod >= 3) !== (e.lod >= 3)) for (const m of e.casters) m.castShadow = lod < 3;
    e.lod = lod;
  }
  function update(dt, o) {
    const p = player.pos, night = o.night || 0, t = ctx.getTrain(), off = (CAP[S.enemies || 'normal'] ?? 10) === 0;
    // the train carries anyone standing on it
    let tdx = 0, tdz = 0, tdy = 0;
    if (t) { const tp = t.root.position; if (lastTrain) { tdx = tp.x - lastTrain.x; tdz = tp.z - lastTrain.z; tdy = tp.y - lastTrain.y; } else lastTrain = new THREE.Vector3(); lastTrain.copy(tp); }
    if (off) { for (const e of Z.slice()) remove(e); }
    else if (!o.paused) {
      if ((spawnT -= dt) <= 0) { spawnT = 1.6 - night * 0.8; if (!o.flying && !o.dead && !o.under && !o.lair) trySpawn(night); }
      if ((eventT -= dt) <= 0) { eventT = 300 + Math.random() * 360; if (!o.flying && !o.dead && !o.inTown && !o.under && !o.lair) event(o); }
    }
    tickFx(dt);
    // the burnt smoulder: the cracks in them glow up and die back
    if ((emberT -= dt) <= 0) { emberT = 1; embers = emberMats(); }
    for (let i = 0; i < embers.length; i++) embers[i].emissiveIntensity = 1.2 * (0.7 + 0.2 * Math.sin(performance.now() * 0.004 + i) + Math.random() * 0.2);
    const sight = 42 * (1 - night * 0.55) / Math.max(1, (o.air ? o.air.fog : 1) * 0.35 + 0.65), quiet = o.crouch ? 0.5 : 1;
    const hearing = (o.sprinting ? 22 : o.moving ? 9 : 4) * quiet;
    for (const e of Z.slice()) {
      if (e.hp <= 0) continue;
      const g = e.g, T = e.T, pos = g.position;
      e.t += dt;
      if (e.onTrain) { pos.x += tdx; pos.z += tdz; pos.y += tdy; }
      const dx = p.x - pos.x, dz = p.z - pos.z, dist = Math.hypot(dx, dz), dy = p.y - pos.y;
      if (e.home) { if (dist > 420) { remove(e); continue; } }
      else if (e.key ? dist > 240 : (dist > 190 && !e.aggro) || dist > 280) { remove(e); continue; }
      // a boss keeps to its lair: if you leave, it goes back and mends
      if (e.home) {
        const hx = p.x - e.home.x, hz = p.z - e.home.z, out = Math.hypot(hx, hz) > e.home.r * 1.6 || Math.abs(p.y - e.home.y) > 5 || o.dead;
        e.leash = out; if (out) { e.aggro = false; e.state = 'wander'; e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.05 * dt); }
      }
      // rising out of the ground or the water
      if (e.rise > 0) { e.rise -= dt * 0.7; pos.y += dt * 1.9 * T.scale * 0.7; pose(e, dt, 0, true); if (e.rise <= 0) e.state = e.aggro ? 'chase' : 'wander'; continue; }
      if (!e.leash && (e.thinkT -= dt) <= 0) { think(e, o, dx, dz, dist, sight, hearing, quiet, e.thinkI || 0.2); e.thinkI = (dist > 60 ? 0.5 : 0.18) + Math.random() * 0.12; e.thinkT = e.thinkI; }
      e.flinch = Math.max(0, e.flinch - dt); e.stagger = Math.max(0, e.stagger - dt); e.alertT = Math.max(0, (e.alertT || 0) - dt);
      // moving
      let want = 0, wx = 0, wz = 0;
      const st = e.state;
      if (st === 'chase') {
        // straight at you while it has you; otherwise to where it last had you
        const tx = e.sees ? dx : e.lastX - pos.x, tz = e.sees ? dz : e.lastZ - pos.z, td = Math.hypot(tx, tz) || 1;
        if (!e.sees || dist > T.reach * 0.7) { want = dist > 26 && !T.boss ? T.walk * 1.8 : T.run; wx = tx / td; wz = tz / td; }
        e.lookYaw = 0;
      } else if (st === 'investigate' || st === 'search') {
        const gx = e.goalX - pos.x, gz = e.goalZ - pos.z, gd = Math.hypot(gx, gz);
        if (st === 'search') e.searchT -= dt;
        if (gd > 1.5) {
          want = T.walk * (st === 'investigate' ? 1.15 : 0.8); wx = gx / gd; wz = gz / gd; e.lookYaw = (e.lookYaw || 0) * (1 - Math.min(1, dt * 3));
          if (st === 'investigate' && (e.goT = (e.goT || 0) + dt) > 25) e.searchT = 0;
        } else {
          // there: stop and look about; searching, pick somewhere else close by to try
          e.lookYaw = Math.sin(e.t * 0.9) * 0.9;
          if (st === 'investigate') e.searchT -= dt;
          else if ((e.pickT = (e.pickT || 0) - dt) <= 0) { e.pickT = 2 + Math.random() * 2; const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 5; e.goalX = e.lastX + Math.cos(a) * r; e.goalZ = e.lastZ + Math.sin(a) * r; }
        }
        if (e.searchT <= 0) { e.state = 'wander'; e.aggro = false; e.wanderT = 0; e.goT = 0; }
      } else if (!e.hidden) {
        if ((e.wanderT -= dt) <= 0) { e.wanderT = 3 + Math.random() * 6; e.wander += (Math.random() - 0.5) * 2; e.pause = Math.random() < 0.4; }
        if (!e.pause) { want = T.walk * 0.6; wx = Math.cos(e.wander); wz = Math.sin(e.wander); }
        e.lookYaw = e.pause ? Math.sin(e.t * 0.4) * 0.5 : 0;
      }
      // a leashed boss walks home; gunmen keep their distance and circle; bosses do their own thing
      if (e.leash) { const hx = e.home.x - pos.x, hz = e.home.z - pos.z, hd = Math.hypot(hx, hz); if (hd > 3) { want = T.walk; wx = hx / hd; wz = hz / hd; } else want = 0; }
      else if (T.ranged && st === 'chase') {
        const [k0, k1] = T.ranged.keep;
        if ((e.sideT = (e.sideT || 0) - dt) <= 0) { e.sideT = (T.boss ? 1.2 : 2.5) + Math.random() * 2; e.side = -e.side; }
        if (dist > k1 || !e.sees) { /* closing in, as above */ }
        else if (dist < k0) { want = T.walk * 1.6; wx = -dx / dist; wz = -dz / dist; }
        else { want = T.walk * (T.boss ? 1.8 : 1); wx = -dz / dist * e.side; wz = dx / dist * e.side; }
        if (e.sees) rangedFire(e, dt, o, dist);
      }
      if (T.special && !e.leash && st === 'chase') { const r = SPECIAL[T.special](e, dt, o, dist, dx, dz); if (r) { want = r[0]; wx = r[1]; wz = r[2]; } }
      // walk around blockages: if not getting closer, slide sideways for a while
      if (want && st !== 'wander') {
        e.stuck = pos.distanceTo(e.last) < want * dt * 0.25 ? e.stuck + dt : Math.max(0, e.stuck - dt * 2);
        if (e.stuck > 0.6) { const s = e.side; const ox = wx; wx = wx * 0.3 - wz * s; wz = wz * 0.3 + ox * s; if (e.stuck > 2.5) { e.side = -e.side; e.stuck = 0.6; } }
      }
      e.last.copy(pos);
      const h = ctx.heightAt(pos.x, pos.z), wl = ctx.waterAt(pos.x, pos.z), deep = wl - h;
      if (deep > 0.4 && !T.swims) want *= deep > 1.2 ? 0.4 : 0.65;
      if (ctx.inSwamp(pos.x, pos.z) && !T.swims) want *= 0.8;
      if (e.flinch) want *= 0.3;
      if (e.wind > 0) want *= 0.25;
      if (e.stagger || e.alertT) want = 0; // reeling from a blow; or the moment it spots you, before it comes
      // spread out a little (only near you, where it shows)
      if (dist < 60) for (const f of Z) { if (f === e) continue; const sx = pos.x - f.g.position.x, sz = pos.z - f.g.position.z, sd = sx * sx + sz * sz; if (sd < 1 && sd > 1e-4) { const k = (1 - Math.sqrt(sd)) * 2; wx += sx * k; wz += sz * k; } }
      const k = Math.min(1, dt * (e.stagger ? 2 : 6));
      e.vel.x += (wx * want - e.vel.x) * k; e.vel.z += (wz * want - e.vel.z) * k;
      STEP.set(pos.x + e.vel.x * dt, pos.y, pos.z + e.vel.z * dt);
      ctx.pushOut(STEP, 0.32 * T.scale);
      pos.x = STEP.x; pos.z = STEP.z;
      // ground, a floor, or the train deck if they are close enough to climb onto it
      let gy = ctx.groundAt(pos.x, pos.z, pos.y);
      if (T.swims && deep > 1.2) gy = Math.max(gy, wl - 1.3 * T.scale);
      e.onTrain = false;
      if (t && dist < 30) { const tg = t.standOn(pos.x, pos.z, pos.y, 1.5); if (tg > gy && (tg - pos.y < 1.5 || e.onTrainBefore) && (e.onTrainBefore || !ctx.canBoard || ctx.canBoard(pos))) { gy = tg; e.onTrain = true; } }
      // a defended wall keeps them off: they tear at it instead, and barbed wire tears back
      const walled = t && o.onTrain && !e.onTrain && ctx.canBoard && t.distanceTo(pos) < 1.1 && !ctx.canBoard(pos);
      if (walled && st === 'chase' && e.atkT <= 0 && e.wind <= 0 && !e.stagger) { e.atkT = 1.3; e.wind = T.windup || 0.5; const back = ctx.hullHit(pos, T.dmg * (ctx.diff().dmg || 1)); if (back) { hurt(e, back, null, 'body'); if (e.hp <= 0) continue; } }
      e.onTrainBefore = e.onTrain;
      pos.y += (gy - pos.y) * Math.min(1, dt * 12);
      const sp = Math.hypot(e.vel.x, e.vel.z), face = st === 'chase' && (dist < 6 || e.alertT > 0);
      if (sp > 0.15 && !face) g.rotation.y = lerpAngle(g.rotation.y, Math.atan2(e.vel.x, e.vel.z), Math.min(1, dt * 8));
      else if (st === 'chase' && !e.stagger) g.rotation.y = lerpAngle(g.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * (T.build === 'brute' ? 4 : 8)));
      // attacking: a wind-up you can see (each kind its own length), then the blow lands if you are still in reach
      e.atkT -= dt;
      if (st === 'chase' && !o.dead && dist < T.reach && Math.abs(dy) < 1.8 && e.atkT <= 0 && e.wind <= 0 && !e.stagger) {
        if (T.explode) { kill(e, false, true); continue; }
        e.wind = T.windup || 0.5; voice(e, dist, 0.9, true);
      }
      if (e.wind > (e.windPrev || 0)) e.windT0 = e.wind; // a new blow (the bosses wind up their own)
      if (e.wind > 0) {
        e.wind -= dt;
        if (e.wind <= 0) {
          e.atkT = T.boss ? 1.6 : 1.15;
          const reachY = T.low ? 1.0 : 1.9; // a crawler can only get at you while you're on its level
          if (dist < T.reach + 0.5 && Math.abs(dy) < reachY && !o.dead && !(o.onTrain && !e.onTrain && dy > 0.8 && ctx.canBoard && !ctx.canBoard(pos))) ctx.hitPlayer(T.dmg * (ctx.diff().dmg || 1), 'bitten', pos.x, pos.z, T.chill || 0);
        }
      }
      e.windPrev = Math.max(0, e.wind); e.windT = e.windPrev; e.windK = e.windT0 ? 1 - e.windT / e.windT0 : 0;
      // posing, less often far away; heavy feet you can hear coming
      const cd = pos.distanceTo(camera.position), lod = cd > 90 ? 3 : cd > 70 ? 2 : cd > 45 ? 1 : 0;
      if (lod !== e.lod) setLod(e, lod);
      e.animDt = (e.animDt || 0) + dt;
      if (lod < 2 || e.animDt > 0.1) { pose(e, e.animDt, sp, false); e.animDt = 0; }
      if (dist < 35 && (T.build === 'brute' || T.armourK)) { const up = Math.sin(e.ph) > 0; if (up !== e.stepUp && sp > 0.4) ctx.sfx('zstep', (1 - dist / 35) * (T.scale > 1.3 ? 1 : 0.55), relPan(pos), T.armourK ? 'clank' : 'thud'); e.stepUp = up; }
      if (dist < 45 && (e.groanT = (e.groanT ?? Math.random() * 6) - dt) <= 0) { e.groanT = (st === 'chase' ? 3 : 6) + Math.random() * 8; voice(e, dist, st === 'chase' ? 1 : 0.6); }
    }
    // the fallen: each falls its own way, lies still, sinks away
    for (let i = CORPSES.length - 1; i >= 0; i--) {
      const c = CORPSES[i]; c.t += dt;
      if (c.t < 1.6) deathPose(c.e, c.t, c.e.fallKind);
      if (c.t > 10) c.e.g.position.y -= dt * 0.4;
      if (c.t > 13) { scene.remove(c.e.g); CORPSES.splice(i, 1); }
    }
  }
  function remove(e) { const i = Z.indexOf(e); if (i >= 0) Z.splice(i, 1); scene.remove(e.g); }
  function facing(e, dx, dz) { const y = e.g.rotation.y, d = Math.hypot(dx, dz) || 1; return (Math.sin(y) * dx + Math.cos(y) * dz) / d; }
  // its voice: each kind its own (see audio zvoice), a snarl as it strikes; outlaws shout
  function voice(e, dist, k, atk) {
    const T = e.T, vol = Math.max(0, 1 - dist / 45) * k * (T.boss ? 1.6 : 1);
    if (T.human) return ctx.sfx('shout', vol, relPan(e.g.position));
    ctx.sfx('zvoice', vol, relPan(e.g.position), (T.voice || 'moan') + (atk ? ':atk' : ''));
  }
  function relPan(pos) { camera.getWorldDirection(tmp); const dx = pos.x - player.pos.x, dz = pos.z - player.pos.z, d = Math.hypot(dx, dz) || 1; return Math.max(-1, Math.min(1, (dx * -tmp.z + dz * tmp.x) / d)); }
  return {
    update, shoot, melee, hurt, explode, noise, spawn, remove, hurtShootable, ring, bolt,
    get bosses() { return Z.filter(e => e.boss && e.hp > 0 && !e.leash && e.aggro); },
    get count() { return Z.length; }, get list() { return Z; }, stats,
    clear() { for (const e of Z.slice()) remove(e); for (const c of CORPSES) scene.remove(c.e.g); CORPSES.length = 0; },
  };
}
function lerpAngle(a, b, k) { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * k; }
export { DROPS };
