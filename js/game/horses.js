// Horses: wild herds out in open country and the loose horses at the farms; taming by crouching and holding out food;
// riding (walk, trot, gallop, jump) with the horse's own stamina, health and belly; tack (a saddle, saddlebags, a
// buckboard cart); a whistle that calls your horse; and the livery stables in the towns, which keep, feed and heal your
// horses and send them down the line to whichever stable you ask at. Horses are each rider's own, saved per rider.
import * as THREE from 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/three.module.js';
import { ITEMS } from './items.js';
import { STABLES } from './registry.js';
import { COATS, randomCoat, horseMesh, dressHorse, animateHorse, cartMesh } from './horsemesh.js';

const NAMES = ['Dusty', 'Biscuit', 'Whiskey', 'Sage', 'Ranger', 'Juniper', 'Copper', 'Shadow', 'Ghost', 'Belle', 'Duke', 'Marigold', 'Tumbleweed', 'Pepper', 'Jasper', 'Scout', 'Willow', 'Buck', 'Maverick', 'Sundance', 'Ember', 'Domino', 'Rosie', 'Cinder'];
const MAX_OWNED = 4, TROT = 6.2, WALK = 2.0, REACH = 3.0;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const BIOME_HORSES = [1, 0.5, 0.05, 0.8, 0.15]; // desert, forest, swamp, badlands, snow

export function createHorses(ctx) {
  const { scene, player } = ctx;
  const wild = [], STEP = new THREE.Vector3(), bw = new Float32Array(5);
  let owned = [], active = null, riding = null, name = '', herdT = 8, msgT = 0, nextId = 1;
  const stallViews = new Map(); // stable name → [{ horse, g }]
  const notify = (m, r) => ctx.notify(m, r);
  const she = d => d.sex === 'mare' ? 'she' : 'he', her = d => d.sex === 'mare' ? 'her' : 'his';

  // ---------- saving ----------
  const key = () => 'drw.horses.' + name;
  function save() {
    if (!name) return;
    for (const h of owned) if (h.g && !h.d.stabled) { const p = h.g.position; Object.assign(h.d, { x: p.x, y: p.y, z: p.z, yaw: h.yaw }); }
    try { localStorage.setItem(key(), JSON.stringify({ v: 1, active: active ? active.d.id : null, list: owned.map(h => h.d), next: nextId })); } catch (e) {}
  }
  function load(n) {
    name = n; let s = null; try { s = JSON.parse(localStorage.getItem(key()) || 'null'); } catch (e) {}
    if (!s) return;
    nextId = s.next || 1;
    for (const d of s.list || []) { if (!COATS[d.coat]) d.coat = 'bay'; const h = makeOwned(d); owned.push(h); if (d.id === s.active && !d.stabled) setActive(h); }
  }

  // ---------- a horse in the world ----------
  function body(h, d) {
    h.g = horseMesh(d); h.g.position.set(d.x, d.y ?? ctx.heightAt(d.x, d.z), d.z); h.g.rotation.y = h.yaw; scene.add(h.g);
    h.g.traverse(o => { if (o.isMesh) o.userData.horse = h; });
    return h;
  }
  const anim = () => ({ gait: 'stand', ph: Math.random(), t: Math.random() * 9, speed: 0 });
  function makeOwned(d) { const h = { d, own: true, yaw: d.yaw || 0, v: 0, vy: 0, a: anim(), state: 'idle', g: null, cart: null }; return h; }
  function setActive(h) {
    active = h;
    if (!h.g) body(h, h.d);
    if (h.d.cart && !h.cart) addCart(h);
  }
  function hide(h) { if (h.g) { scene.remove(h.g); h.g = null; } if (h.cart) { scene.remove(h.cart.g); h.cart = null; } }
  function addCart(h) {
    const g = cartMesh(), p = h.g.position; scene.add(g);
    h.cart = { g, x: p.x - Math.sin(h.yaw) * 3.4, z: p.z - Math.cos(h.yaw) * 3.4, roll: 0 };
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  }

  // one step of movement for any horse: turn towards yawT, speed towards want; walls, slopes, water, gravity
  function step(h, dt, want, yawT, turn) {
    h.yaw += clamp(wrap(yawT - h.yaw), -turn * dt, turn * dt);
    const p = h.g.position, dir = Math.sign(want || h.v || 1), fx = Math.sin(h.yaw), fz = Math.cos(h.yaw);
    const h0 = ctx.heightAt(p.x, p.z), grade = (ctx.heightAt(p.x + fx * 1.6 * dir, p.z + fz * 1.6 * dir) - h0) / 1.6;
    if (grade > 0.95) want = Math.min(want, 0.8); else if (grade > 0.6) want = Math.min(want, 4.5);
    const wl = ctx.waterAt(p.x, p.z), depth = wl - h0; h.swim = depth > 1.5 && p.y < wl;
    if (h.swim) want = clamp(want, -1, 2.6); else if (depth > 0.5) want = clamp(want, -2, 5);
    const acc = Math.abs(want) > Math.abs(h.v) ? 5.5 : 9; h.v += clamp(want - h.v, -acc * dt, acc * dt);
    STEP.set(p.x + fx * h.v * dt, p.y, p.z + fz * h.v * dt);
    ctx.pushOut(STEP, 0.55); if (ctx.trainPush) ctx.trainPush(STEP, 0.6);
    const moved = Math.hypot(STEP.x - p.x, STEP.z - p.z);
    if (Math.abs(h.v) > 2 && moved < Math.abs(h.v) * dt * 0.3) h.v *= 0.5; // ran into something
    p.x = clamp(STEP.x, -ctx.half + 10, ctx.half - 10); p.z = clamp(STEP.z, -ctx.half + 10, ctx.half - 10);
    let gy = ctx.groundAt(p.x, p.z, p.y + 0.45);
    if (h.swim || (depth > 1.5 && p.y <= wl)) gy = Math.max(gy, wl - 1.25);
    h.vy -= 20 * dt; p.y += h.vy * dt; let fall = 0;
    if (p.y <= gy) { fall = -h.vy; p.y = gy; h.vy = 0; h.air = false; }
    else if (p.y - gy < 0.35 && h.vy <= 0 && !h.air) { p.y = gy; h.vy = 0; }
    else h.air = true;
    h.g.rotation.y = h.yaw;
    const sp = Math.abs(h.v);
    h.a.speed = sp; h.a.gait = h.air && h.jumped ? 'jump' : h.swim ? 'swim' : sp > 10 ? 'gallop' : sp > 3.6 ? 'trot' : sp > 0.4 ? 'walk' : h.a.gait === 'graze' ? 'graze' : 'stand';
    if (!h.air) h.jumped = false;
    if (h.cart) tickCart(h, dt);
    return fall;
  }
  function tickCart(h, dt) {
    const c = h.cart, p = h.g.position, hx = p.x - Math.sin(h.yaw) * 0.9, hz = p.z - Math.cos(h.yaw) * 0.9;
    let dx = hx - c.x, dz = hz - c.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    const nx = hx - dx * 2.5, nz = hz - dz * 2.5, moved = Math.hypot(nx - c.x, nz - c.z);
    c.x = nx; c.z = nz; c.roll += moved / 0.55 * Math.sign(h.v || 1);
    c.g.position.set(c.x, ctx.groundAt(c.x, c.z, p.y + 0.5), c.z); c.g.rotation.y = Math.atan2(dx, dz);
    for (const w of c.g.userData.wheels) w.rotation.x = c.roll;
  }

  // ---------- wild horses ----------
  function spawnWild(x, z, o = {}) {
    const coat = o.coat || randomCoat(), C = COATS[coat];
    const d = { coat, blaze: !!o.blaze || Math.random() < 0.2, socks: Math.random() < 0.3 ? 1 + Math.floor(Math.random() * 3) : 0, sex: o.sex || (Math.random() < 0.5 ? 'mare' : Math.random() < 0.5 ? 'stallion' : 'gelding'), x, z, y: ctx.groundAt(x, z, ctx.heightAt(x, z) + 1) };
    const h = { d, own: false, yaw: Math.random() * 6.28, v: 0, vy: 0, a: anim(), state: 'graze', trust: 0, need: o.need || C.need, special: o.special || null, herd: o.herd || null, t: Math.random() * 5 };
    body(h, d); wild.push(h); return h;
  }
  function spawnHerd(x, z, n, o = {}) {
    const herd = { lead: null, tx: x, tz: z, t: 0 }, coat = o.coat || randomCoat();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, r = i ? 3 + Math.random() * 6 : 0;
      const h = spawnWild(x + Math.cos(a) * r, z + Math.sin(a) * r, { herd, coat: i && Math.random() < 0.5 ? randomCoat() : coat, sex: i ? undefined : 'stallion' });
      if (!i) herd.lead = h;
    }
    return herd;
  }
  // the farms' loose horses come through here (story.js encounters)
  function farmHorse(enc) {
    if (enc.blaze && owned.some(h => h.d.name === 'Clementine')) enc = Object.assign({}, enc, { blaze: false });
    const a = Math.random() * 6.28, x = enc.x + Math.cos(a) * 6, z = enc.z + Math.sin(a) * 6;
    if (enc.herd) { spawnHerd(x, z, enc.herd, { coat: enc.coatKey }); notify('Horses are running loose in the corral.'); return; }
    const h = spawnWild(x, z, enc.blaze ? { coat: 'grey', blaze: true, sex: 'mare', need: 3, special: 'Clementine' } : { coat: enc.coatKey });
    notify(enc.blaze ? 'A grey mare with a white blaze is grazing by the corral.' : `A loose ${COATS[h.d.coat].name} is grazing by the corral.`);
  }
  function trySpawnHerd(o) {
    if (wild.length >= 8 || o.under || o.inTown || player.fly) return;
    const p = player.pos;
    if (wild.some(h => h.g.position.distanceTo(p) < 600)) return;
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * 6.28, r = 150 + Math.random() * 110, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      ctx.biomeAt(x, z, bw); let w = 0; for (let i = 0; i < 5; i++) w += bw[i] * BIOME_HORSES[i];
      if (Math.random() > w) continue;
      const h = ctx.heightAt(x, z);
      if (ctx.waterAt(x, z) > h - 0.2 || Math.abs(ctx.heightAt(x + 6, z) - h) > 2.5 || Math.abs(ctx.heightAt(x, z + 6) - h) > 2.5) continue;
      if (ctx.railDist && ctx.railDist(x, z) < 35) continue;
      spawnHerd(x, z, 2 + Math.floor(Math.random() * 3));
      return;
    }
  }
  // a gunshot or a blast scatters every wild horse that hears it
  function noise(x, z, r) { for (const h of wild) if (h.state !== 'flee' && Math.hypot(h.g.position.x - x, h.g.position.z - z) < r) flee(h, x, z); }
  function flee(h, fx, fz) {
    const group = h.herd ? wild.filter(o => o.herd === h.herd) : [h];
    for (const o of group) { const p = o.g.position; o.state = 'flee'; o.t = 5 + Math.random() * 3; o.fleeYaw = Math.atan2(p.x - fx, p.z - fz) + (Math.random() - 0.5) * 0.6; o.trust = Math.max(0, o.trust - 1); }
  }
  const heldTrust = () => { const it = ctx.held(); return it && ITEMS[it.t].trust ? it : null; };
  function tickWild(h, dt, o) {
    const p = h.g.position, pl = player.pos, dx = p.x - pl.x, dz = p.z - pl.z, d = Math.hypot(dx, dz);
    const speed = Math.hypot(player.vel.x, player.vel.z), sneaking = player.crouch && speed < 2.5 && !riding;
    h.t -= dt;
    if (d > 520 && h.state !== 'calm') return false;
    // the dead nearby send them running
    if (h.state !== 'flee') for (const e of ctx.enemies()) if (e.hp > 0 && e.g.position.distanceTo(p) < 11) { flee(h, e.g.position.x, e.g.position.z); break; }
    const C = COATS[h.d.coat];
    if (h.state === 'flee') {
      step(h, dt, C.speed * 0.85, h.fleeYaw, 3);
      if (h.t <= 0) { h.state = 'graze'; h.t = 3; }
      return true;
    }
    const alertR = riding ? 22 : sneaking ? 9 : o.sprinting ? 45 : 28, food = heldTrust();
    if (d < alertR) {
      if (sneaking) { h.state = d < 7 ? 'calm' : 'alert'; }
      else if (d < (riding ? 9 : 15) || (speed > 3 && d < alertR * 0.7)) {
        flee(h, pl.x, pl.z); ctx.sfx('groan', 0.5, 0, 2.3);
        if ((msgT -= 1) <= 0) { msgT = 3; notify(h.special ? 'Clementine shies, then bolts. Not yet, not like this.' : 'The horses throw up their heads and bolt. Crouch and come slowly.'); }
        return true;
      } else h.state = 'alert';
    } else if (h.state === 'alert' || h.state === 'calm') h.state = 'graze';
    if (h.state === 'alert' || h.state === 'calm') { step(h, dt, 0, Math.atan2(-dx, -dz), 2); h.a.gait = 'stand'; return true; }
    // grazing: the lead wanders, the rest drift after it
    let want = 0, yaw = h.yaw;
    if (h.herd && h.herd.lead !== h && h.herd.lead && wild.includes(h.herd.lead)) {
      const L = h.herd.lead.g.position, lx = L.x - p.x, lz = L.z - p.z, ld = Math.hypot(lx, lz);
      if (ld > 9) { want = ld > 25 ? TROT : WALK; yaw = Math.atan2(lx, lz); }
    } else if (h.t <= 0) { h.t = 4 + Math.random() * 7; h.wander = Math.random() < 0.45 ? h.yaw + (Math.random() - 0.5) * 2 : null; }
    if (want === 0 && h.wander != null) { want = 1.2; yaw = h.wander; }
    step(h, dt, want, yaw, 1.2);
    if (want === 0) h.a.gait = 'graze';
    return true;
  }
  function removeWild(h) { const i = wild.indexOf(h); if (i >= 0) wild.splice(i, 1); if (h.g) scene.remove(h.g); }

  // ---------- taming ----------
  function offer(h) {
    const it = heldTrust();
    if (it) { const d = ITEMS[it.t]; ctx.take(it.t); h.trust += d.trust; ctx.sfx('use'); }
    else { h.trust += 0.5; if (Math.random() < 0.35) { flee(h, player.pos.x, player.pos.z); notify('It snorts and wheels away. Something to offer would help.'); return; } }
    if (h.trust >= h.need) { tame(h); return; }
    if (it && Math.random() < 0.12) { h.g.position.x += Math.sin(h.yaw) * -1.5; notify('It startles, steps back, then comes forward again.'); }
    else notify(`It takes it from your hand. Trust ${Math.floor(h.trust)} of ${h.need}`);
  }
  function tame(h) {
    if (owned.length >= MAX_OWNED) { notify(`You can't keep more than ${MAX_OWNED} horses. Sell one to a merchant, or let one go at a stable.`); return; }
    removeWild(h);
    const taken = new Set(owned.map(o => o.d.name)), free = NAMES.filter(n => !taken.has(n));
    const C = COATS[h.d.coat], p = h.g.position;
    const d = Object.assign({}, h.d, { id: 'h' + Date.now().toString(36) + (nextId++), name: h.special || free[Math.floor(Math.random() * free.length)] || 'Horse', hp: C.hp, maxHp: C.hp, stam: 100, belly: 60, saddle: false, bags: false, cart: false, x: p.x, y: p.y, z: p.z, yaw: h.yaw, stabled: null });
    const n = makeOwned(d); n.g = h.g; scene.add(n.g); n.g.traverse(o => { if (o.isMesh) o.userData.horse = n; });
    if (active && !active.d.stabled && STABLES.length) { const prev = active, st = nearestStable(prev.g.position); stable(prev, st, true); notify(`${prev.d.name} is taken to the ${st.name} livery for you.`); }
    owned.push(n); setActive(n); save();
    notify(`The ${C.name} ${d.sex} nuzzles your hand. ${d.name} is yours now.`, 'epic'); ctx.sfx('sting');
    if (!d.saddle) setTimeout(() => notify('Ride bareback, or find a saddle to gallop further. Press X to whistle for ' + d.name + '.'), 2500);
  }

  // ---------- your horse ----------
  function mount(h) {
    if (h.state === 'down') { notify(`${h.d.name} is down and hurt. Liniment, or time.`); return; }
    riding = h; h.state = 'ridden'; player.crouch = false;
    player.yaw = h.yaw + Math.PI; player.pitch = -0.08;
    ctx.sfx('use'); ctx.onMount && ctx.onMount(true);
  }
  function dismount(thrown) {
    const h = riding; if (!h) return; riding = null; h.state = 'idle'; h.v = 0;
    const p = h.g.position, lx = Math.cos(h.yaw), lz = -Math.sin(h.yaw);
    STEP.set(p.x + lx * 1.15, p.y, p.z + lz * 1.15); ctx.pushOut(STEP, 0.4);
    player.pos.set(STEP.x, ctx.groundAt(STEP.x, STEP.z, p.y + 1.2), STEP.z); player.vel.set(0, 0, 0);
    ctx.onMount && ctx.onMount(false);
    if (thrown) ctx.damage(10, 'fell');
    save();
  }
  // a frame in the saddle. inp: { fwd, back, left, right, sprint, jump, walk }. Returns the bob for the camera
  function ride(dt, inp) {
    const h = riding; if (!h) return 0;
    const d = h.d, C = COATS[d.coat], cartK = d.cart ? 0.82 : 1, bare = !d.saddle;
    const gallop = C.speed * cartK * (bare ? 0.85 : 1) * (d.belly < 15 ? 0.8 : 1) * (d.hp < d.maxHp * 0.3 ? 0.8 : 1);
    let want = 0;
    if (inp.fwd) want = inp.walk ? WALK : inp.sprint && !h.blown && d.stam > 0 ? gallop : TROT * cartK;
    else if (inp.back) want = -1.6;
    const rate = Math.abs(h.v) > 9 ? 1.5 : 2.4, turn = ((inp.left ? 1 : 0) - (inp.right ? 1 : 0)) * rate * dt;
    player.yaw += turn;
    if (!inp.fwd) h.yaw += turn;
    if (inp.jump && !h.air && !h.swim && d.stam >= 12) { h.vy = 6.2; h.air = true; h.jumped = true; d.stam -= 12; }
    const fall = step(h, dt, want, inp.fwd ? player.yaw + Math.PI : h.yaw, rate);
    if (fall > 12) hurt(h, (fall - 12) * 6);
    // stamina, wind and belly
    const sp = Math.abs(h.v);
    if (sp > 9) { d.stam -= dt * 7 * C.stam * (bare ? 1.5 : 1) * (d.cart ? 1.2 : 1); if (d.stam <= 0) { d.stam = 0; h.blown = true; notify(`${d.name} is blown. Let ${her(d)} catch ${her(d)} breath.`); } }
    else d.stam = Math.min(100, d.stam + dt * (sp < 3 ? 9 : 4) * (d.belly > 20 ? 1 : 0.5));
    if (h.blown && d.stam > 35) h.blown = false;
    d.belly = Math.max(0, d.belly - dt * (0.02 + (sp > 9 ? 0.05 : 0)));
    player.pos.copy(h.g.position); player.vel.set(Math.sin(h.yaw) * h.v, h.vy, Math.cos(h.yaw) * h.v);
    animateHorse(h.g, h.a, dt);
    const ph = h.a.ph * Math.PI * 2;
    return h.a.gait === 'gallop' ? Math.sin(ph * 2) * 0.07 : h.a.gait === 'trot' ? Math.sin(ph * 2) * 0.045 : h.a.gait === 'walk' ? Math.sin(ph * 2) * 0.015 : 0;
  }
  function hurt(h, n) {
    const d = h.d; d.hp = Math.max(0, d.hp - n); h.a.gait = 'rear'; h.rearT = 0.6;
    if (d.hp <= 0) {
      if (riding === h) { dismount(true); notify(`${d.name} goes down under you!`, 'epic'); }
      h.state = 'down'; ctx.sfx('groan', 0.7, 0, 2);
    }
  }
  // the share of a blow that lands on your horse while you ride; returns what still reaches you
  function shareHit(n) { if (!riding) return n; hurt(riding, n * 0.6); return n * 0.65; }
  function tickOwned(h, dt, o) {
    const d = h.d, p = h.g.position, pl = player.pos, dx = pl.x - p.x, dz = pl.z - p.z, dist = Math.hypot(dx, dz);
    if (h.rearT > 0) { h.rearT -= dt; animateHorse(h.g, h.a, dt); return; }
    if (h.state === 'down') {
      d.hp = Math.min(d.maxHp, d.hp + dt * 0.25); h.a.gait = 'down'; animateHorse(h.g, h.a, dt);
      if (d.hp >= 25) { h.state = 'idle'; notify(`${d.name} struggles back to ${her(d)} feet.`); }
      return;
    }
    d.stam = Math.min(100, d.stam + dt * 8);
    let want = 0, yaw = h.yaw;
    if (h.state !== 'spooked') for (const e of ctx.enemies()) if (e.hp > 0 && e.g.position.distanceTo(p) < 9) { h.state = 'spooked'; h.t = 4; h.fleeYaw = Math.atan2(p.x - e.g.position.x, p.z - e.g.position.z); if (dist < 60) notify(`${d.name} spooks at the dead!`); break; }
    if (h.state === 'spooked') { want = TROT * 1.6; yaw = h.fleeYaw; if ((h.t -= dt) <= 0) h.state = 'idle'; }
    else if (h.state === 'come') {
      if (dist < 3.2) h.state = 'idle';
      else { want = dist > 40 ? COATS[d.coat].speed * 0.8 : dist > 8 ? TROT : WALK; yaw = Math.atan2(dx, dz); }
    }
    step(h, dt, want, yaw, 2.4);
    if (want === 0) {
      ctx.biomeAt(p.x, p.z, bw); const grass = bw[1] + bw[0] * 0.4 + bw[3] * 0.3;
      if (grass > 0.3) { h.a.gait = 'graze'; d.belly = Math.min(100, d.belly + dt * 0.15 * grass); }
      if (dist < 12) h.a.look = clamp(wrap(Math.atan2(dx, dz) - h.yaw), -0.6, 0.6); else h.a.look = 0;
    }
    animateHorse(h.g, h.a, dt);
  }
  function call() {
    const h = active;
    ctx.sfx('callwhistle');
    if (!h) { notify(owned.length ? 'Your horses are all in the stables. Ask at a livery.' : 'You have no horse. Tame a wild one: crouch and hold out food.'); return; }
    if (riding) return;
    if (h.d.stabled) { notify(`${h.d.name} is in the ${h.d.stabled} livery.`); return; }
    const d = h.g.position.distanceTo(player.pos);
    if (d > 700) { notify(`${h.d.name} is too far away to hear you. Send for ${her(h.d)} at a stable.`); return; }
    if (h.state === 'down') { notify(`${h.d.name} is down and can't come.`); return; }
    h.state = 'come'; if (d > 60) notify(`You whistle. Somewhere out there, ${h.d.name} answers.`);
  }

  // ---------- held items used on a horse: feed, tack, liniment ----------
  function useOn(h, it) {
    const t = it.t, D = ITEMS[t], d = h.d, nm = d.name;
    if (D.horseFood) {
      if (d.belly >= 98) { notify(`${nm} isn't hungry.`); return true; }
      ctx.take(t); d.belly = Math.min(100, d.belly + D.horseFood); d.stam = Math.min(100, d.stam + D.horseFood * 0.5); notify(`${nm} eats the ${D.name.toLowerCase()} · belly ${Math.round(d.belly)}%`); ctx.sfx('use'); save(); return true;
    }
    if (D.horseHeal) {
      if (d.hp >= d.maxHp) { notify(`${nm} isn't hurt.`); return true; }
      ctx.take(t); d.hp = Math.min(d.maxHp, d.hp + D.horseHeal); if (h.state === 'down' && d.hp >= 25) h.state = 'idle'; notify(`You rub liniment into ${nm}'s wounds · ${Math.round(d.hp)} / ${d.maxHp}`); ctx.sfx('use'); save(); return true;
    }
    if (D.horse) {
      const k = D.horse;
      if (d[k]) { notify(`${nm} already has ${k === 'saddle' ? 'a saddle' : k === 'bags' ? 'saddlebags' : 'a cart hitched'}.`); return true; }
      if (k === 'cart' && !d.saddle) { notify(`Saddle ${nm} first: the traces hang from the saddle.`); return true; }
      ctx.take(t); d[k] = true; dressHorse(h.g, d); if (k === 'cart') addCart(h);
      notify({ saddle: `${nm} is saddled. Hold Shift to gallop.`, bags: `${nm} carries saddlebags now.`, cart: `The buckboard is hitched behind ${nm}.` }[k], 'rare'); ctx.sfx('stoke'); save(); return true;
    }
    return false;
  }
  // from the saddlebag's "Use": the nearest horse of yours within reach
  function useItem(it) {
    const D = ITEMS[it.t]; if (!(D.horse || D.horseFood || D.horseHeal)) return false;
    const h = active && active.g && !active.d.stabled && active.g.position.distanceTo(player.pos) < 4 ? active : null;
    if (h) return useOn(h, it);
    const w = D.trust && wild.find(o => o.state === 'calm' && o.g.position.distanceTo(player.pos) < REACH);
    if (w) { offer(w); return true; }
    if (D.horse || D.horseHeal || (D.horseFood && !D.use)) { notify('Stand beside your horse to use that.'); return true; }
    return false;
  }

  // ---------- stables ----------
  const nearestStable = p => STABLES.reduce((b, s) => !b || Math.hypot(s.x - p.x, s.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? s : b, null);
  function stable(h, st, quiet) {
    if (riding === h) dismount();
    h.d.stabled = st.name; h.d.stabledAt = Date.now(); h.state = 'idle'; hide(h);
    if (active === h) active = null;
    refreshStall(st); if (!quiet) notify(`${h.d.name} is put up at the ${st.name} livery: fed, rested and seen to.`);
    save();
  }
  function takeOut(h, st) {
    if (active && active !== h && !active.d.stabled) { stable(active, st, true); notify(`${active.d.name} goes into the stall in ${h.d.name}'s place.`); }
    const d = h.d; d.hp = d.maxHp; d.stam = 100; d.belly = 100; d.stabled = null;
    const [x, y, z] = st.post; d.x = x + Math.sin(st.ry) * 2.5; d.z = z + Math.cos(st.ry) * 2.5; d.y = ctx.groundAt(d.x, d.z, y + 1); h.yaw = st.ry;
    setActive(h); refreshStall(st); notify(`${d.name} is led out, brushed and fed.`); save();
  }
  function sendFor(h, st) {
    const fee = h.d.stabled ? 5 : 10;
    if (!ctx.pay(fee)) { notify(`The stable hand wants $${fee} to send a rider for ${h.d.name}.`); return; }
    if (riding === h) return;
    if (!h.d.stabled) hide(h);
    if (active === h) active = null;
    h.d.stabled = st.name; refreshStall(st); notify(`$${fee}. A rider brings ${h.d.name} down the line to ${st.name}.`); save();
  }
  function refreshStall(st) {
    const old = stallViews.get(st.name); if (old) for (const v of old) scene.remove(v.g);
    stallViews.delete(st.name);
  }
  function tickStalls() {
    for (const st of STABLES) {
      const near = Math.hypot(st.x - player.pos.x, st.z - player.pos.z) < 160;
      if (!near) { if (stallViews.has(st.name)) refreshStall(st); continue; }
      if (stallViews.has(st.name)) continue;
      const list = owned.filter(h => h.d.stabled === st.name).slice(0, st.stalls.length).map((h, i) => {
        const g = horseMesh(h.d), [x, y, z] = st.stalls[i]; g.position.set(x, y, z); g.rotation.y = st.ry + Math.PI; scene.add(g);
        return { horse: h, g, a: anim(), x, y, z };
      });
      stallViews.set(st.name, list);
    }
  }

  // ---------- what you can do with E ----------
  function targets() {
    const out = [], p = player.pos, held = ctx.held();
    if (riding) return out;
    const h = active;
    if (h && h.g && !h.d.stabled) {
      const g = h.g.position, d = g.distanceTo(p);
      if (d < 5) {
        const c = g.clone(); c.y += 1.3;
        const D = held && ITEMS[held.t], nm = h.d.name;
        if (D && (D.horse || D.horseFood || D.horseHeal)) out.push({ pos: c, r: 1.1, label: D.horse === 'saddle' ? `Saddle ${nm}` : D.horse === 'bags' ? `Put the saddlebags on ${nm}` : D.horse === 'cart' ? `Hitch the buckboard to ${nm}` : D.horseHeal ? `Rub liniment into ${nm}'s wounds` : `Feed ${nm} the ${D.name.toLowerCase()}`, act: () => useOn(h, held), key: 'horse:use' });
        else if (h.state === 'down') out.push({ pos: c, r: 1.1, label: `${nm} is down · ${Math.round(h.d.hp)} / ${h.d.maxHp} (use liniment, or wait)`, act: () => {}, key: 'horse:down' });
        else out.push({ pos: c, r: 1.1, label: `Ride ${nm}`, act: () => mount(h), key: 'horse:ride' });
        if (h.d.bags) { const b = g.clone(); b.x -= Math.sin(h.yaw) * 0.5; b.z -= Math.cos(h.yaw) * 0.5; b.y += 1.15; out.push({ pos: b, r: 0.45, label: `Open ${nm}'s saddlebags`, act: () => ctx.openContainer({ cid: 'horse:bags:' + h.d.id, w: 6, h: 4, kind: 'horsebags', title: `${nm}'s saddlebags`, loot: false, anchor: () => h.g ? h.g.position : player.pos }), key: 'horse:bags' }); }
      }
      if (h.cart) { const c = h.cart.g.position.clone(); c.y += 1; if (c.distanceTo(p) < 4) out.push({ pos: c, r: 0.9, label: 'Open the buckboard', act: () => ctx.openContainer({ cid: 'horse:cart:' + h.d.id, w: 9, h: 6, kind: 'horsecart', title: `${h.d.name}'s buckboard`, loot: false, anchor: () => h.cart ? h.cart.g.position : player.pos }), key: 'horse:cart' }); }
    }
    for (const w of wild) {
      if (w.state !== 'calm' || w.g.position.distanceTo(p) > REACH + 1) continue;
      const it = heldTrust(), c = w.g.position.clone(); c.y += 1.5;
      out.push({ pos: c, r: 0.9, label: it ? `Offer the ${ITEMS[it.t].name.toLowerCase()} to the wild ${COATS[w.d.coat].name} (trust ${Math.floor(w.trust)}/${w.need})` : `Calm the wild ${COATS[w.d.coat].name} with gentle words`, act: () => offer(w), key: 'horse:wild' });
    }
    for (const st of STABLES) {
      if (Math.abs(st.x - p.x) > 30 || Math.abs(st.z - p.z) > 30) continue;
      const post = new THREE.Vector3(st.post[0], st.post[1] + 1.1, st.post[2]);
      if (post.distanceTo(p) < 5) {
        if (active && !active.d.stabled && active.g && active.g.position.distanceTo(post) < 30) out.push({ pos: post, r: 0.5, label: `Stable ${active.d.name} here (fed, rested, healed)`, act: () => stable(active, st), key: 'stable:put' });
        else { const away = owned.find(o => o.d.stabled !== st.name); if (away) out.push({ pos: post, r: 0.5, label: `Send for ${away.d.name} (${away.d.stabled ? 'at ' + away.d.stabled : 'out on the range'}) · $${away.d.stabled ? 5 : 10}`, act: () => sendFor(away, st), key: 'stable:send' }); }
      }
      for (const v of stallViews.get(st.name) || []) { const c = new THREE.Vector3(v.x, v.y + 1.3, v.z); if (c.distanceTo(p) < 5) out.push({ pos: c, r: 1, label: `Take ${v.horse.d.name} out of the stall`, act: () => takeOut(v.horse, st), key: 'stall:' + v.horse.d.id }); }
      const hand = new THREE.Vector3(st.hand[0], st.hand[1] + 1.4, st.hand[2]);
      if (hand.distanceTo(p) < 5) out.push({ pos: hand, r: 0.5, label: 'Trade with the stable hand (feed and tack)', act: () => ctx.openShop('livery', st.name), key: 'stable:shop' });
    }
    return out;
  }

  // ---------- frame ----------
  let hudT = 0;
  function update(dt, o) {
    for (let i = wild.length - 1; i >= 0; i--) if (!tickWild(wild[i], dt, o)) removeWild(wild[i]);
    else animateHorse(wild[i].g, wild[i].a, dt);
    for (const h of owned) if (h.g && h !== riding && !h.d.stabled) tickOwned(h, dt, o);
    for (const [, list] of stallViews) for (const v of list) { v.a.gait = 'graze'; animateHorse(v.g, v.a, dt); }
    if ((herdT -= dt) <= 0) { herdT = 25 + Math.random() * 20; if (Math.random() < 0.5) trySpawnHerd(o); }
    if ((hudT -= dt) <= 0) { hudT = 0.2; renderHud(); tickStalls(); }
  }
  // the horse panel: while you ride, or stand near your horse
  const hud = document.createElement('div'); hud.id = 'horseHud'; hud.className = 'paper'; document.getElementById('hud').appendChild(hud);
  function renderHud() {
    const h = riding || (active && active.g && !active.d.stabled && active.g.position.distanceTo(player.pos) < 12 ? active : null);
    hud.classList.toggle('on', !!h); if (!h) return;
    const d = h.d, bar = (k, v, max = 100) => `<div class="hb ${k}"><i><s style="width:${Math.max(0, Math.min(100, v / max * 100))}%"></s></i></div>`;
    const tack = [d.saddle && 'Saddle', d.bags && 'Bags', d.cart && 'Buckboard'].filter(Boolean).join(' · ') || 'Bareback';
    hud.innerHTML = `<div class="eyebrow">${d.name} · ${COATS[d.coat].name} ${d.sex}</div>${bar('hp', d.hp, d.maxHp)}${bar('st', d.stam)}${bar('bl', d.belly)}<div class="hl"><span>Health · Stamina · Belly</span><span>${tack}</span></div>${riding ? `<div class="hk"><kbd>W</kbd> trot <kbd>Shift</kbd> gallop <kbd>C</kbd> walk <kbd>Space</kbd> jump <kbd>E</kbd> dismount</div>` : ''}`;
  }
  function clearWild() { for (const h of wild.slice()) removeWild(h); }

  return {
    load, save, update, ride, mount, dismount, call, noise, targets, useItem, shareHit, farmHorse, clearWild,
    get riding() { return !!riding; },
    get horse() { return riding; },
    pose() { return riding ? { c: riding.d.coat, s: riding.d.saddle ? 1 : 0, b: riding.d.blaze ? 1 : 0, y: riding.yaw } : null; },
    get owned() { return owned; },
    // a broken-in horse bought from a trader: it waits in that stable's stall, or beside you if there is none
    buy(coat, stableName) {
      if (owned.length >= MAX_OWNED) { notify(`You can't keep more than ${MAX_OWNED} horses.`); return false; }
      const C = COATS[coat] || COATS.bay, taken = new Set(owned.map(o => o.d.name)), free = NAMES.filter(n => !taken.has(n));
      const p = player.pos, d = { id: 'h' + Date.now().toString(36) + (nextId++), name: free[Math.floor(Math.random() * free.length)] || 'Horse', coat, sex: Math.random() < 0.5 ? 'mare' : 'gelding', blaze: Math.random() < 0.25, socks: 0, hp: C.hp, maxHp: C.hp, stam: 100, belly: 100, saddle: true, bags: false, cart: false, x: p.x + 2, y: p.y, z: p.z + 2, yaw: 0, stabled: stableName && STABLES.some(s => s.name === stableName) ? stableName : null };
      const h = makeOwned(d); owned.push(h);
      if (d.stabled) { const st = STABLES.find(s => s.name === stableName); refreshStall(st); notify(`${d.name}, a saddled ${C.name} ${d.sex}, waits in a stall here.`, 'epic'); }
      else { if (active && !active.d.stabled && STABLES.length) stable(active, nearestStable(active.g.position), true); setActive(h); notify(`${d.name}, a saddled ${C.name} ${d.sex}, is yours.`, 'epic'); }
      save(); return true;
    },
    // a merchant buys a horse you own (the one you stand beside, or the first in a stable)
    sell(st) { const h = owned.find(o => o !== riding && (o === active ? o.g && o.g.position.distanceTo(player.pos) < 15 : !!o.d.stabled)); if (!h) return null; hide(h); owned.splice(owned.indexOf(h), 1); if (active === h) active = null; save(); return h.d; },
  };
}
