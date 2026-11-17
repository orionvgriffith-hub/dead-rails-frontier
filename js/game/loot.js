// Looting: container kinds, randomised (but fixed per container) loot tables, furniture with moving parts,
// opening animations, and the searched state shown in the world.
import * as THREE from 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/three.module.js';
import { LOOT_SPOTS, onLoot } from './registry.js';
import { dominantBiome } from '../biomes.js';
import { ITEMS, RARITY } from './items.js';
import { newId } from './grid.js';
import { mulberry32 } from '../noise.js';

import { KINDS, genLootFor } from './rules.js';
export { KINDS };

const byId = new Map();
export const spotById = id => byId.get(id);
export const cidOf = spot => 'loot:' + spot.id;
export function genLoot(cid) { const spot = byId.get(cid.replace(/^loot:/, '')); return spot ? genLootFor(spot) : { items: [], cash: 0 }; }

// ---------- visuals ----------
const std = (c, m = 0, r = 0.8) => new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r });
const M = { wood: std(0x6e4a30), dark: std(0x4a3020), iron: std(0x2e2c2a, 0.7, 0.5), brass: std(0xc9a04a, 0.85, 0.3), steel: std(0x6a6a70, 0.8, 0.4), lid: std(0x8a6a48), black: new THREE.MeshBasicMaterial({ color: 0x080605 }) };
const B = (mat, w, h, d, x, y, z, parent) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };

function build(spot) {
  const g = new THREE.Group(); g.position.set(spot.x, spot.y, spot.z); g.rotation.y = spot.ry;
  const anim = { t: 0, target: 0, set: () => {} };
  switch (KINDS[spot.kind].look || spot.kind) {
    case 'chest': {
      B(M.wood, 0.9, 0.42, 0.5, 0, 0.21, 0, g);
      for (const x of [-0.3, 0.3]) B(M.iron, 0.05, 0.44, 0.52, x, 0.22, 0, g);
      const lid = new THREE.Group(); lid.position.set(0, 0.42, -0.25); g.add(lid);
      B(M.lid, 0.92, 0.12, 0.52, 0, 0.06, 0.25, lid); for (const x of [-0.3, 0.3]) B(M.iron, 0.05, 0.13, 0.53, x, 0.06, 0.25, lid);
      B(M.brass, 0.08, 0.1, 0.03, 0, 0.0, 0.51, lid);
      anim.set = t => { lid.rotation.x = -t * 1.25; }; break;
    }
    case 'safe': {
      B(M.iron, 0.8, 1.0, 0.7, 0, 0.5, 0, g); B(M.black, 0.62, 0.8, 0.02, 0, 0.52, 0.34, g);
      const door = new THREE.Group(); door.position.set(-0.34, 0.52, 0.36); g.add(door);
      B(M.iron, 0.7, 0.86, 0.08, 0.34, 0, 0, door);
      const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 18), M.brass); dial.rotation.x = Math.PI / 2; dial.position.set(0.34, 0.12, 0.05); door.add(dial);
      B(M.brass, 0.05, 0.18, 0.04, 0.6, -0.08, 0.05, door);
      B(M.brass, 0.5, 0.06, 0.02, 0, 0.92, 0.36, g);
      anim.set = t => { door.rotation.y = -t * 1.7; dial.rotation.y = t * 6; }; break;
    }
    case 'locker': {
      B(M.steel, 0.7, 1.9, 0.45, 0, 0.95, 0, g); B(M.black, 0.62, 1.8, 0.02, 0, 0.95, 0.215, g);
      for (const y of [0.5, 1.0, 1.45]) B(M.steel, 0.6, 0.02, 0.4, 0, y, 0, g);
      for (let i = 0; i < 3; i++) B(M.dark, 0.06, 0.9, 0.06, -0.2 + i * 0.2, 1.0, -0.12, g);
      const door = new THREE.Group(); door.position.set(-0.34, 0.95, 0.235); g.add(door);
      B(M.steel, 0.68, 1.86, 0.03, 0.34, 0, 0, door);
      for (let y = -0.75; y <= 0.75; y += 0.12) B(M.black, 0.4, 0.02, 0.01, 0.34, y + 0.0, 0.017, door);
      B(M.brass, 0.03, 0.14, 0.04, 0.62, 0, 0.03, door);
      anim.set = t => { door.rotation.y = -t * 1.8; }; break;
    }
    case 'drawer': {
      B(M.wood, 1.0, 0.92, 0.45, 0, 0.46, 0, g); B(M.dark, 1.04, 0.04, 0.49, 0, 0.94, 0, g);
      const drawers = [];
      for (let i = 0; i < 3; i++) {
        const d = new THREE.Group(); d.position.set(0, 0.2 + i * 0.27, 0.0); g.add(d);
        B(M.lid, 0.92, 0.22, 0.04, 0, 0, 0.225, d); B(M.dark, 0.88, 0.16, 0.4, 0, -0.01, 0.02, d);
        for (const x of [-0.25, 0.25]) B(M.brass, 0.06, 0.03, 0.03, x, 0.02, 0.255, d);
        drawers.push(d);
      }
      anim.set = t => { drawers[2].position.z = t * 0.32; drawers[1].position.z = t * 0.16; }; break;
    }
    case 'cabinet': {
      const doors = [];
      for (const s of [-1, 1]) {
        const d = new THREE.Group(); d.position.set(s * 0.44, 1.0, 0.235); g.add(d);
        B(M.lid, 0.43, 1.5, 0.025, -s * 0.215, 0, 0, d); B(M.brass, 0.03, 0.08, 0.03, -s * 0.4, 0, 0.02, d);
        doors.push([d, s]);
      }
      anim.set = t => { for (const [d, s] of doors) d.rotation.y = s * t * 1.6; }; break;
    }
    case 'crate': {
      const lid = new THREE.Group(); lid.position.set(0, 0.79 * spot.s, 0); g.add(lid);
      const bl = B(M.lid, 0.8 * spot.s, 0.04, 0.8 * spot.s, 0, 0.02, 0, lid); lid.visible = false;
      anim.set = t => { lid.visible = t > 0.01; lid.position.set(t * 0.55 * spot.s, 0.79 * spot.s + Math.sin(t * Math.PI) * 0.35 - t * 0.42 * spot.s, t * 0.2); lid.rotation.set(t * 0.2, t * 0.5, -t * 1.3); }; break;
    }
    case 'barrel': {
      const lid = new THREE.Group(); g.add(lid);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * spot.s, 0.3 * spot.s, 0.04, 16), M.lid); m.castShadow = true; lid.add(m); lid.visible = false;
      anim.set = t => { lid.visible = t > 0.01; lid.position.set(t * 0.5 * spot.s, 0.92 * spot.s + Math.sin(t * Math.PI) * 0.4 - t * 0.62 * spot.s, 0.05); lid.rotation.set(0, 0, -t * 1.45); }; break;
    }
    default: break; // sacks, wagons, carts, shelves: searched with a rummage + dust burst
  }
  return { g, anim };
}

const VIS = [];
let dust = null;
export function buildLootVisuals(scene) {
  for (const s of LOOT_SPOTS) {
    byId.set(s.id, s);
    s.s = s.s || 1;
    const v = build(s);
    if (!v.g.children.length && !['crate', 'barrel'].includes(KINDS[s.kind].look || s.kind)) { s.vis = null; continue; }
    scene.add(v.g); s.vis = v; v.g.visible = false; VIS.push(s);
  }
  // dust puff sprite pool
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d');
  const gr = c.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(225,200,160,0.8)'); gr.addColorStop(1, 'rgba(225,200,160,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  dust = Array.from({ length: 12 }, () => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 })); sp.visible = false; scene.add(sp); return { sp, t: 1, v: new THREE.Vector3() }; });
}
export function puff(x, y, z) {
  for (let i = 0; i < 5; i++) { const d = dust.find(p => p.t >= 1) || dust[0]; d.t = 0; d.sp.visible = true; d.sp.position.set(x + (Math.random() - 0.5) * 0.4, y + Math.random() * 0.3, z + (Math.random() - 0.5) * 0.4); d.v.set((Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6); }
}
export function setOpen(spot, open, instant) { if (!spot.vis) return; spot.vis.anim.target = open ? 1 : 0; if (instant) { spot.vis.anim.t = spot.vis.anim.target; spot.vis.anim.set(spot.vis.anim.t); } }
export function updateLoot(cam, dt, isSearched) {
  for (const s of VIS) {
    const near = Math.abs(s.x - cam.x) < 70 && Math.abs(s.z - cam.z) < 70;
    s.vis.g.visible = near;
    if (!near) continue;
    const a = s.vis.anim, want = isSearched(s) ? Math.max(a.target, 0.55) : a.target;
    if (Math.abs(a.t - want) > 0.001) { a.t += Math.sign(want - a.t) * Math.min(Math.abs(want - a.t), dt * 2.4); a.set(a.t); }
  }
  for (const d of dust) { if (d.t >= 1) continue; d.t += dt * 0.9; d.sp.position.addScaledVector(d.v, dt); const s = 0.4 + d.t * 1.4; d.sp.scale.set(s, s, s); d.sp.material.opacity = (1 - d.t) * 0.6; if (d.t >= 1) d.sp.visible = false; }
}
// where the player should stand / look to use a container
export function frontOf(spot) {
  const reach = { wagon: 1.6, cart: 1.0, minecart: 0.9, chest: 0.5, safe: 0.55, locker: 0.45, drawer: 0.45, cabinet: 0.45, shelf: 0.35 }[spot.kind] || 0.5;
  const h = { chest: 0.4, safe: 0.6, locker: 1.0, drawer: 0.6, cabinet: 1.0, shelf: 1.0, crate: 0.6, barrel: 0.7, sack: 0.25, wagon: 1.0, cart: 0.8, minecart: 0.7 }[spot.kind] || 0.6;
  return new THREE.Vector3(spot.x + Math.sin(spot.ry) * reach, spot.y + h * (spot.s || 1), spot.z + Math.cos(spot.ry) * reach);
}
// resource nodes on streamed ground are registered while you play; they are searched like any container
onLoot(s => { byId.set(s.id, s); s.s = s.s || 1; s.vis = null; });
