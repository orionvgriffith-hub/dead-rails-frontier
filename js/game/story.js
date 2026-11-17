// The story and the special places at play time: Dr. Hartwell's telegram and the journey to the cure, the encounters
// at each place (who appears, when, and what they leave), boss introductions and rewards, the wild horses at the farms,
// the objective and where it points, and the ending.
import * as THREE from 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/three.module.js';
import { ENCOUNTERS, WORLD_STATE, saveWorldState, HOOKS, INTERACTS } from './registry.js';
import { ITEMS } from './items.js';
import { LORE } from '../lore.js';

const LORE_KEYS = Object.keys(LORE).filter(k => k !== 'ending');

export function createStory(ctx) {
  const { scene, player, enemies } = ctx, S = WORLD_STATE;
  const active = new Map(); // key → { enc, total, killed, members }
  let tickT = 0;
  const site = name => ctx.sites.find(s => s.name === name);
  const notify = (m, r) => ctx.notify(m, r);

  // ---------- what the places' levers and doors can call ----------
  Object.assign(HOOKS, {
    readLore(key) {
      const L = LORE[key]; if (!L) return;
      const first = !S.lore[key]; S.lore[key] = 1; saveWorldState();
      ctx.readNote(L.title, L.body);
      if (key === 'telegram' && !S.flags.telegram) { S.flags.telegram = 1; saveWorldState(); setTimeout(() => notify('New journey: take the cure to the Hartwell Institute at Glacier Point. Press M to see where.', 'epic'), 600); }
      else if (first) notify(`Record found (${Object.keys(S.lore).filter(k => LORE_KEYS.includes(k)).length} of ${LORE_KEYS.length})`);
    },
    give: (t, n = 1) => ctx.give(t, n), has: t => ctx.has(t), take: t => ctx.take(t), notify, sfx: (...a) => ctx.sfx(...a),
    explode: (x, y, z, r, d) => enemies.explode(x, y, z, r, d), firePool: (x, y, z, r, t) => ctx.firePool(x, y, z, r, t),
    cleared: key => !!S.cleared[key], flag: k => { S.flags[k] = 1; saveWorldState(); },
    ending: () => { S.flags.ended = 1; saveWorldState(); ctx.sfx('boom', 0.5); setTimeout(() => ctx.ending(LORE.ending.title, LORE.ending.body), 1800); },
  });

  // ---------- encounters ----------
  const ready = enc => {
    const c = S.cleared[enc.key];
    if (c && !enc.repeat) return false;
    if (c && enc.repeat && Date.now() - c < enc.repeat * 1000) return false;
    if (enc.after && !S.cleared[enc.after]) return false;
    if (enc.when && !enc.when()) return false;
    return true;
  };
  function inRange(enc, o) {
    const p = player.pos, d = Math.hypot(p.x - enc.x, p.z - enc.z);
    if (d > enc.r) return false;
    if (enc.under) return Math.abs(p.y - enc.y) < 4;
    if (!enc.flat) return Math.abs(p.y - enc.y) < 6;
    return !player.fly;
  }
  function start(enc, o) {
    if (enc.horse) { if (Math.random() < enc.chance && HOOKS.farmHorse) HOOKS.farmHorse(enc); S.cleared[enc.key] = Date.now(); saveWorldState(); return; }
    if (enc.night && !(o.night > 0.55)) return;
    const A = { enc, total: 0, killed: 0 };
    for (const g of enc.groups || []) for (const at of g.at) { enemies.spawn(g.type, at[0], at[2], { y: at[1], rise: !!g.rise, aggro: true, state: 'chase', key: enc.key }); A.total++; }
    if (enc.boss) {
      const b = enc.boss; enemies.spawn(b.type, b.at[0], b.at[2], { y: b.at[1], rise: !!b.rise, aggro: true, state: 'chase', key: enc.key, boss: b }); A.total++;
      ctx.bossIntro(b.name, b.title); ctx.sfx('sting');
    } else if (enc.title) notify(enc.title);
    enc.onStart && enc.onStart();
    active.set(enc.key, A);
  }
  // a member of an encounter fell: when they all have, the place is cleared and the boss's reward is left behind
  function onKill(e) {
    if (!e.key) return;
    const A = active.get(e.key); if (!A) return;
    A.killed++;
    if (e.boss) {
      const b = e.boss, p = e.g.position;
      ctx.rewardBag((b.reward || []).filter(([t]) => ITEMS[t]), b.cash || 0, `${b.name}'s belongings`, p.x, p.y, p.z);
      notify(`${b.name} is dead. They dropped something.`, 'epic'); ctx.sfx('sting');
      b.onDown && b.onDown();
      for (const m of enemies.list.slice()) if (m.key === e.key + ':minion') enemies.hurt(m, 9999, null, 'body');
    }
    if (A.killed >= A.total) { S.cleared[e.key] = A.enc.repeat ? Date.now() : 1; saveWorldState(); active.delete(e.key); if (!e.boss && A.enc.title) notify('All quiet again.'); }
  }
  function tickEncounters(o) {
    for (const enc of ENCOUNTERS) {
      if (active.has(enc.key)) {
        // walked away (or died): everyone still standing goes, and it can happen again later
        const alive = enemies.list.filter(e => e.key === enc.key);
        if (!alive.length || Math.hypot(player.pos.x - enc.x, player.pos.z - enc.z) > Math.max(220, enc.r * 3) || o.dead) {
          if (alive.length || o.dead) { for (const e of alive) enemies.remove(e); active.delete(enc.key); }
          else active.delete(enc.key);
        }
        continue;
      }
      if (!ready(enc) || o.dead || !inRange(enc, o)) continue;
      start(enc, o);
    }
  }

  // ---------- the journey: what to do next and where it is ----------
  function objective() {
    if (!S.flags.telegram) { const t = ctx.telegram(); return { title: 'Something on the wire', lines: [{ text: 'Read the telegram at the Dry Gulch station', done: false }], target: t }; }
    const got = t => ctx.has(t) || !!S.placed[t];
    const key = ctx.has('hartwellKey') || S.flags.instOpen || S.open['inst:door'];
    const map = ctx.has('blackjackMap') || S.flags.mapRead || got('heartstone');
    const steps = [
      { text: 'The Institute key: First Territorial Bank, Fortune', done: key, at: 'Fortune' },
      { text: "Volt's Formula: Volt Research Station, the mountains", done: got('voltFormula'), at: 'Volt Research Station' },
      { text: 'A pure Ichor sample: Ichor Oil Works, the badlands', done: got('ichorSample'), at: 'Ichor Oil Works' },
      map ? { text: 'The Heartstone: the Pale Catacombs, the bayou', done: got('heartstone'), at: 'The Pale Catacombs' }
        : { text: "The Heartstone: ask Black Jack Mercer (his hideout, the badlands)", done: false, at: "Black Jack's Hideout" },
    ];
    const all = steps.every(s => s.done), placed = ['voltFormula', 'ichorSample', 'heartstone'].filter(t => S.placed[t]).length;
    steps.push({ text: S.flags.ended ? 'The cure is made' : `Bring them to the Hartwell Institute, Glacier Point${placed ? ` (${placed} of 3 placed)` : ''}`, done: !!S.flags.ended, at: 'Hartwell Institute' });
    const next = steps.find(s => !s.done && (s.at !== 'Hartwell Institute' || all || key)) || (S.flags.ended ? null : steps.find(s => !s.done));
    const st = next && site(next.at);
    return { title: S.flags.ended ? 'The cure (done)' : 'The cure', lines: steps, target: st ? { x: st.x, z: st.z, name: next.at } : null, records: `${Object.keys(S.lore).filter(k => LORE_KEYS.includes(k)).length} of ${LORE_KEYS.length} records found` };
  }

  function update(dt, o) {

    if ((tickT -= dt) > 0) return; tickT = 0.25;
    tickEncounters(o);
    if (ctx.has('blackjackMap') && !S.flags.mapRead) { S.flags.mapRead = 1; saveWorldState(); ctx.reveal('The Pale Catacombs'); notify("Black Jack's map marks a hidden stair deep in the bayou. The Pale Catacombs are on your map now.", 'epic'); }
    const b = enemies.bosses.filter(e => e.g.position.distanceTo(player.pos) < 70).sort((a, c) => a.g.position.distanceTo(player.pos) - c.g.position.distanceTo(player.pos))[0];
    ctx.bossBar(b ? { name: b.boss.name, title: b.boss.title, k: Math.max(0, b.hp / b.maxHp) } : null);
    if ((o.objT = (o.objT || 0)) >= 0) ctx.setObjective(objective());
  }
  const inLair = () => ENCOUNTERS.some(e => !e.horse && !e.repeat && !S.cleared[e.key] && Math.hypot(player.pos.x - e.x, player.pos.z - e.z) < e.r + 30);
  return { update, onKill, objective, inLair, get interacts() { return INTERACTS; } };
}
