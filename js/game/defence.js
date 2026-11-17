// Train defences. The Jupiter's cab and the cargo car's three walls each have a condition; the dead that reach the
// train tear at the nearest one, and they can only climb aboard where a section has been broken through. Sections can
// be repaired, boarded up with planks (wooden barricades), plated with iron, and the car walls strung with barbed wire
// that cuts whatever climbs them. The cab windows break and can be glazed or boarded. A fitted cowcatcher throws the
// dead off the track. The state is the host's (train.def), shown on the train and in the condition panel.
import * as THREE from 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/three.module.js';
import { ITEMS } from './items.js';
import { CAR } from '../car.js';
import { SECTIONS, MAX, defaultDef, applyDef } from './rules.js';
export { SECTIONS, defaultDef, applyDef };

const LEVEL = ['Bare', 'Barricaded', 'Iron-plated'];
// what each job takes from your saddlebag (and the tool it needs)
const JOBS = {
  repair0: { need: [['plank', 2], ['nails', 6]], tool: 'hammer', hp: 50 },
  repair2: { need: [['sheetMetal', 1], ['nails', 4]], tool: 'hammer', hp: 70 },
  barricade: { need: [['plank', 4], ['nails', 12]], tool: 'hammer' },
  plate: { need: [['sheetMetal', 2], ['ironBar', 1], ['nails', 8]], tool: 'wrench' },
  wire: { need: [['barbedWire', 2]], tool: null },
  glaze: { need: [['glassPane', 1]], tool: null },
  boardWin: { need: [['plank', 1], ['nails', 3]], tool: 'hammer' },
};

export function createDefence(ctx) {
  const { scene, player } = ctx;
  let train = null, vis = null, msgT = 0, flashT = 0, lastHit = null, plowMsg = 0;
  const def = () => { const n = ctx.net(); if (!n) return null; if (!n.state.train.def) n.state.train.def = defaultDef(); return n.state.train.def; };
  const req = op => { const n = ctx.net(); return n ? n.request(Object.assign({ type: 'def' }, op)) : Promise.resolve({ ok: false }); };

  // ---------- where the dead are: which section a point next to the train belongs to ----------
  const _v = new THREE.Vector3();
  function sectionAt(p) {
    if (!train) return null;
    const c = train.car.root.worldToLocal(_v.set(p.x, p.y, p.z));
    if (c.x > -CAR.half - 2 && c.x < CAR.half + 0.6 && Math.abs(c.z) < 3.5) return c.x < -CAR.half + 0.3 ? 'carB' : c.z > 0 ? 'carR' : 'carL';
    const l = train.root.worldToLocal(_v.set(p.x, p.y, p.z));
    if (l.x > -6.5 && l.x < 8.5 && Math.abs(l.z) < 3.5) return 'cab';
    return null;
  }
  // can a zombie at p climb aboard? Only through a section that has been broken
  function canBoard(p) { const d = def(), s = sectionAt(p); if (!d || !s) return true; return d[s].hp <= 0; }
  // a blow against the hull; returns the damage barbed wire does back
  function hullHit(p, n) {
    const d = def(), s = sectionAt(p); if (!d || !s) return 0;
    const sec = d[s]; if (sec.hp <= 0) return 0;
    const dmg = n * (sec.lvl === 2 ? 0.45 : sec.lvl === 1 ? 0.7 : 1);
    req({ op: 'hit', sec: s, n: dmg, win: s === 'cab' && Math.random() < 0.25 ? (Math.random() < 0.5 ? 'winL' : 'winR') : null }).then(r => {
      if (!r.ok) return;
      flashT = 0.6; lastHit = s;
      if (r.broke) { ctx.notify(`The dead have broken through ${SECTIONS[s].name}!`, 'epic'); ctx.sfx('thud', 1); }
      else if ((msgT -= 1) <= 0) { msgT = 6; ctx.notify(`The dead are tearing at ${SECTIONS[s].name}!`); }
      if (r.window) ctx.notify('Glass shatters in the cab. The wind comes in.');
    });
    ctx.sfx('thud', 0.5);
    return s !== 'cab' && sec.wire ? 9 : 0;
  }

  // ---------- jobs you can do on the train ----------
  function count(t) { return ctx.count(t); }
  function canDo(job) {
    const J = JOBS[job];
    if (J.tool && !count(J.tool)) return `You need a ${ITEMS[J.tool].name.toLowerCase()}`;
    const miss = J.need.filter(([t, n]) => count(t) < n).map(([t, n]) => `${n} × ${ITEMS[t].name}`);
    return miss.length ? `You need ${miss.join(', ')}` : null;
  }
  const cost = job => JOBS[job].need.map(([t, n]) => `${n} ${ITEMS[t].name.toLowerCase()}`).join(', ');
  function doJob(job, op) {
    const why = canDo(job); if (why) { ctx.notify(why); return; }
    req(op).then(r => {
      if (!r.ok) { ctx.notify(r.err === 'full' ? 'Nothing to do there' : 'It would not take'); return; }
      for (const [t, n] of JOBS[job].need) ctx.take(t, n);
      ctx.sfx('stoke'); ctx.notify(r.msg, 'rare');
    });
  }
  // the spot on the train to work each section from: [body, x, y, z] in that body's space
  const SPOT = { cab: [0, -3.6, 2.4, 0], carL: [1, -2.6, CAR.deck + 0.7, -CAR.width + 0.1], carR: [1, -2.6, CAR.deck + 0.7, CAR.width - 0.1], carB: [1, -CAR.half + 0.2, CAR.deck + 0.7, -0.4], winL: [0, -3.3, 2.7, -1.35], winR: [0, -3.3, 2.7, 1.35] };
  const spotWorld = k => { const [i, x, y, z] = SPOT[k]; return train.bodyRoot(i).localToWorld(new THREE.Vector3(x, y, z)); };
  function targets() {
    const out = [], d = def(); if (!train || !d || player.seated) return out;
    if (train.distanceTo(player.pos) > 3) return out;
    for (const k in SECTIONS) {
      const s = d[k], nm = SECTIONS[k].name, max = MAX[s.lvl];
      let label = null, act = null;
      if (s.hp < max) {
        const job = s.lvl === 2 ? 'repair2' : 'repair0';
        label = `Repair ${nm} · ${Math.round(s.hp)}/${max} (${cost(job)})`; act = () => doJob(job, { op: 'fix', sec: k, add: JOBS[job].hp });
      } else if (s.lvl < 2) {
        const job = s.lvl === 0 ? 'barricade' : 'plate';
        label = `${s.lvl === 0 ? 'Barricade' : 'Plate'} ${nm} with ${s.lvl === 0 ? 'planks' : 'iron'} (${cost(job)})`; act = () => doJob(job, { op: 'up', sec: k });
      } else if (k !== 'cab' && !s.wire) { label = `String barbed wire along ${nm} (${cost('wire')})`; act = () => doJob('wire', { op: 'wire', sec: k }); }
      if (!label) continue;
      // the cab is worked from either side wall below the windows, where its planks and plates go
      const spots = k === 'cab' ? [-1, 1].map(sd => train.bodyRoot(0).localToWorld(new THREE.Vector3(-3.3, 1.85, sd * 1.45))) : [spotWorld(k)];
      for (const pos of spots) out.push({ pos, r: k === 'cab' ? 0.6 : 0.5, label, act, key: 'def:' + k });
    }
    for (const w of ['winL', 'winR']) if (d[w] === 0) {
      const pos = spotWorld(w), side = w === 'winL' ? 'left' : 'right';
      if (count('glassPane')) out.push({ pos, r: 0.4, label: `Glaze the ${side} cab window (${cost('glaze')})`, act: () => doJob('glaze', { op: 'win', w, v: 1 }), key: 'def:' + w });
      else out.push({ pos, r: 0.4, label: `Board up the ${side} cab window (${cost('boardWin')})`, act: () => doJob('boardWin', { op: 'win', w, v: 2 }), key: 'def:' + w });
    }
    return out;
  }
  // the section crew's bench at Cinder Flats does the lot, for money
  function benchTargets(spots) {
    const out = []; if (!train) return out;
    for (const s of spots) {
      if (s.kind !== 'repairBench' || Math.abs(s.x - player.pos.x) > 5 || Math.abs(s.z - player.pos.z) > 5) continue;
      const near = train.distanceTo(new THREE.Vector3(s.x, s.y, s.z)) < 60, d = def(), fee = d ? Math.round(Object.keys(SECTIONS).reduce((a, k) => a + (MAX[d[k].lvl] - d[k].hp), 0) * 0.12 + (d.winL === 0 ? 6 : 0) + (d.winR === 0 ? 6 : 0)) : 0;
      out.push({ pos: new THREE.Vector3(s.x, s.y + 1, s.z), r: 0.6, label: !near ? 'Section crew: bring the Jupiter into the yard for repairs' : fee <= 0 ? 'Section crew: the Jupiter is sound' : `Section crew: repair the Jupiter · $${fee}`, act: () => { if (!near || fee <= 0) return; if (!ctx.pay(fee)) { ctx.notify(`The crew wants $${fee}`); return; } req({ op: 'all' }).then(() => { ctx.notify('The section crew patches every wall and glazes the cab.', 'epic'); ctx.sfx('stoke'); }); }, key: 'bench' });
    }
    return out;
  }

  // ---------- the cowcatcher (or the lack of one) ----------
  function plough(dt, enemies) {
    if (!train || Math.abs(train.v) < 4) return;
    const fwd = train.v > 0, up = train.up || {};
    for (const e of enemies.list.slice()) {
      if (e.hp <= 0) continue;
      const l = train.root.worldToLocal(_v.copy(e.g.position));
      const hit = fwd ? l.x > 6.2 && l.x < 9.5 : l.x < -CAR.offset - CAR.half - 0.5 && l.x > -CAR.offset - CAR.half - 3.5;
      if (!hit || Math.abs(l.z) > 1.9 || l.y < -1 || l.y > 3) continue;
      const side = l.z >= 0 ? 1 : -1, a = train.heading;
      e.vel.set(Math.sin(a) * side * 9, 0, Math.cos(a) * side * 9);
      enemies.hurt(e, 9999, train.root.position, 'body');
      if (up.plow && fwd) { if ((plowMsg -= 1) <= 0) { plowMsg = 8; ctx.notify('The cowcatcher throws them clear.'); } }
      else { req({ op: 'hit', sec: fwd ? 'cab' : 'carB', n: 7 }); train.v *= 0.88; if ((plowMsg -= 1) <= 0) { plowMsg = 5; ctx.notify('Bodies go under the wheels. The Jupiter shudders.'); } ctx.shake && ctx.shake(0.4); }
    }
  }

  // ---------- on the train: barricade planks, iron plates, wire, glass ----------
  const M = { plank: new THREE.MeshStandardMaterial({ color: 0x8a6a46, roughness: 0.9 }), iron: new THREE.MeshStandardMaterial({ color: 0x5a5a5e, metalness: 0.6, roughness: 0.5 }), wire: new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.5, roughness: 0.6 }), dark: new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 1 }), glass: new THREE.MeshStandardMaterial({ color: 0xcfe6f0, roughness: 0.1, transparent: true, opacity: 0.35 }) };
  const B = (p, m, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; p.add(o); return o; };
  function build(t) {
    const car = t.car.body || t.car.root, H = CAR.half, W = CAR.width, D = CAR.deck, WT = D + CAR.wall, V = {};
    const wall = (key, root, fn) => { const g = { planks: new THREE.Group(), plates: new THREE.Group(), wire: new THREE.Group(), broken: new THREE.Group() }; for (const k in g) root.add(g[k]); fn(g); V[key] = g; };
    for (const [key, s] of [['carL', -1], ['carR', 1]]) wall(key, car, g => {
      for (let i = 0; i < 3; i++) B(g.planks, M.plank, 2 * H - 0.4, 0.16, 0.05, 0, WT + 0.12 + i * 0.2, s * (W + 0.14), 0, 0, (i - 1) * 0.02);
      for (const x of [-H + 0.6, -0.6, 0.6, H - 0.6]) B(g.planks, M.plank, 0.12, 0.8, 0.06, x, WT + 0.25, s * (W + 0.17));
      for (const x of [-2.6, 2.6]) B(g.plates, M.iron, 3.4, 0.95, 0.03, x, D + 0.5, s * (W + 0.2));
      B(g.plates, M.iron, 1.2, 0.95, 0.03, 0, D + 0.5, s * (W + 0.95));
      for (let x = -H + 0.3; x < H - 0.2; x += 0.6) B(g.wire, M.wire, 0.62, 0.015, 0.015, x + 0.3, WT + (g.planks.visible ? 0.7 : 0.15) + ((x * 10) % 2 ? 0.06 : -0.06), s * (W + 0.1), 0, 0, 0.3);
      for (let i = 0; i < 5; i++) B(g.broken, M.dark, 0.5, 0.25 + i * 0.07, 0.06, -3 + i * 1.4, D + 0.3, s * (W + 0.06), 0, 0, 0.6 - i * 0.3);
    });
    wall('carB', car, g => {
      for (let i = 0; i < 3; i++) B(g.planks, M.plank, 0.05, 0.16, 2 * W - 0.2, -H - 0.14, WT + 0.12 + i * 0.2, 0);
      B(g.plates, M.iron, 0.03, 0.95, 2 * W, -H - 0.2, D + 0.5, 0);
      for (let z = -W; z < W; z += 0.5) B(g.wire, M.wire, 0.015, 0.015, 0.52, -H - 0.1, WT + 0.15 + ((z * 10) % 2 ? 0.05 : -0.05), z + 0.25, 0.3);
      B(g.broken, M.dark, 0.06, 0.5, 1.2, -H - 0.08, D + 0.4, 0.2, 0.5);
    });
    wall('cab', t.root, g => {
      for (const s of [-1, 1]) { for (let i = 0; i < 3; i++) B(g.planks, M.plank, 2.1, 0.16, 0.05, -3.3, 1.7 + i * 0.22, s * 1.62); B(g.plates, M.iron, 2.3, 1.0, 0.03, -3.3, 1.9, s * 1.66); }
      B(g.broken, M.dark, 0.6, 0.4, 0.06, -3.6, 1.9, 1.63, 0, 0, 0.5);
    });
    // the cab windows: a cracked pane overlay when broken, boards when boarded up
    const wins = {};
    for (const [w, s] of [['winL', -1], ['winR', 1]]) {
      const g = { glass: new THREE.Group(), boards: new THREE.Group(), cracks: new THREE.Group() }; for (const k in g) t.root.add(g[k]);
      B(g.glass, M.glass, 0.9, 0.6, 0.01, -3.3, 2.85, s * 1.63);
      for (let i = 0; i < 3; i++) B(g.boards, M.plank, 1.0, 0.14, 0.04, -3.3, 2.65 + i * 0.2, s * 1.65, 0, 0, (i - 1) * 0.15);
      for (let i = 0; i < 4; i++) B(g.cracks, M.dark, 0.5, 0.015, 0.012, -3.3, 2.85, s * 1.64, 0, 0, i * 0.8);
      wins[w] = g;
    }
    return { V, wins };
  }
  let lastKey = '';
  function dress() {
    const d = def(); if (!d || !vis) return;
    const key = JSON.stringify(d); if (key === lastKey) return; lastKey = key;
    for (const k in vis.V) {
      const s = d[k], g = vis.V[k], max = MAX[s.lvl], k01 = s.hp / max;
      g.planks.visible = s.lvl >= 1 && s.hp > 0; g.plates.visible = s.lvl >= 2 && s.hp > 0; g.wire.visible = !!s.wire && s.hp > 0 && k !== 'cab';
      g.broken.visible = s.hp <= 0;
      // a battered barricade loses boards
      g.planks.children.forEach((c, i) => { c.visible = k01 > i / g.planks.children.length * 0.7; });
    }
    for (const w in vis.wins) { const v = d[w], g = vis.wins[w]; g.glass.visible = v === 1; g.boards.visible = v === 2; g.cracks.visible = v === 0; }
  }

  // ---------- the condition panel ----------
  const panel = document.createElement('div'); panel.id = 'trainCond'; panel.className = 'paper'; document.getElementById('hud').appendChild(panel);
  let panelT = 0;
  function renderPanel() {
    // shares its spot with the horse panel, which wins while you ride
    const horse = document.getElementById('horseHud'), riding = horse && horse.classList.contains('on');
    const d = def(), show = train && d && !riding && (player.onTrain || train.distanceTo(player.pos) < 25);
    panel.classList.toggle('on', !!show); if (!show) return;
    const total = Object.keys(SECTIONS).reduce((a, k) => a + d[k].hp / MAX[d[k].lvl], 0) / 4;
    let html = `<div class="eyebrow">Train condition · ${Math.round(total * 100)}%</div>`;
    for (const k in SECTIONS) { const s = d[k], max = MAX[s.lvl], v = s.hp / max; html += `<div class="crow${lastHit === k && flashT > 0 ? ' hit' : ''}${s.hp <= 0 ? ' broken' : ''}"><span>${SECTIONS[k].short}</span><i><s style="width:${v * 100}%;background:${v > 0.6 ? '#52604a' : v > 0.3 ? '#b4852f' : '#a2401f'}"></s></i><em>${s.hp <= 0 ? 'BROKEN' : LEVEL[s.lvl]}${s.wire ? ' · wire' : ''}</em></div>`; }
    const win = w => d[w] === 1 ? 'glass' : d[w] === 2 ? 'boarded' : 'broken';
    html += `<div class="cnote">Cab windows: ${win('winL')} / ${win('winR')}${(train.up || {}).plow ? ' · Cowcatcher' : ''}</div>`;
    panel.innerHTML = html; panel.classList.toggle('flash', flashT > 0);
  }

  return {
    sectionAt, canBoard, hullHit, targets, benchTargets,
    attach(t) { train = t; vis = build(t); lastKey = ''; dress(); },
    update(dt, enemies) { flashT = Math.max(0, flashT - dt); if (!train) return; plough(dt, enemies); dress(); if ((panelT -= dt) <= 0) { panelT = 0.25; renderPanel(); } },
    // broken cab windows let the weather in (0 to 0.5 more exposure in the cab)
    exposure() { const d = def(); return d ? ((d.winL === 0 ? 0.25 : 0) + (d.winR === 0 ? 0.25 : 0)) : 0; },
  };
}
