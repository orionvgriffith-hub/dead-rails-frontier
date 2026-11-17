// Item catalogue: categories, rarity, weight, value, grid size, stacking, use effects, and 3D models
import * as THREE from 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/three.module.js';
import { CATS, RARITY, ITEMS, ITEM_IDS } from './itemdata.js';
export { CATS, RARITY, ITEMS, ITEM_IDS };
const I = ITEMS; // the models below look items up by this name

// ---------- 3D models ----------
const matCache = new Map();
function mat(code) {
  if (matCache.has(code)) return matCache.get(code);
  const hex = parseInt(code.slice(0, 6), 16), f = code.slice(6);
  const m = new THREE.MeshStandardMaterial({ color: hex, roughness: f.includes('m') ? 0.4 : f.includes('g') ? 0.1 : 0.75, metalness: f.includes('m') ? 0.75 : 0 });
  if (f.includes('g')) { m.transparent = true; m.opacity = 0.75; }
  if (f.includes('e')) { m.emissive = new THREE.Color(hex); m.emissiveIntensity = 0.6; }
  matCache.set(code, m); return m;
}
const geoCache = new Map();
function geo(key, make) { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); }
export function itemModel(id) {
  const d = I[id], g = new THREE.Group();
  for (const p of d.model) {
    const [s, col] = p; let mesh, rest;
    if (s === 'b') { mesh = new THREE.Mesh(geo(`b${p[2]},${p[3]},${p[4]}`, () => new THREE.BoxGeometry(p[2], p[3], p[4])), mat(col)); rest = p.slice(5); }
    else if (s === 'c') { const seg = p[10] || 14; mesh = new THREE.Mesh(geo(`c${p[2]},${p[3]},${seg}`, () => new THREE.CylinderGeometry(p[2], p[2], p[3], seg)), mat(col)); rest = p.slice(4); }
    else if (s === 'k') { mesh = new THREE.Mesh(geo(`k${p[2]},${p[3]}`, () => new THREE.ConeGeometry(p[2], p[3], 10)), mat(col)); rest = p.slice(4); }
    else if (s === 't') { mesh = new THREE.Mesh(geo(`t${p[2]},${p[3]}`, () => new THREE.TorusGeometry(p[2], p[3], 8, 20)), mat(col)); rest = p.slice(4); }
    else { mesh = new THREE.Mesh(geo(`s${p[2]}`, () => new THREE.SphereGeometry(p[2], 12, 9)), mat(col)); rest = p.slice(3); mesh.position.set(rest[0], rest[1], rest[2]); mesh.scale.set(rest[3] || 1, rest[4] || 1, rest[5] || 1); mesh.castShadow = true; g.add(mesh); continue; }
    mesh.position.set(rest[0], rest[1], rest[2]); mesh.rotation.set(rest[3] || 0, rest[4] || 0, rest[5] || 0);
    mesh.castShadow = true; g.add(mesh);
  }
  return g;
}

// ---------- icons: each item's own 3D model, rendered once ----------
export const ICONS = {};
export function renderIcons(renderer) {
  const U = 64, rt = new THREE.WebGLRenderTarget(U, U, { colorSpace: THREE.SRGBColorSpace }), scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x5a4030, 2.2));
  const dl = new THREE.DirectionalLight(0xffffff, 2.5); dl.position.set(0.6, 1.2, 0.9); scene.add(dl);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.01, 20), tanH = Math.tan(14 * Math.PI / 180);
  const prevTone = renderer.toneMapping, prevColor = new THREE.Color(); renderer.getClearColor(prevColor); const prevAlpha = renderer.getClearAlpha();
  renderer.toneMapping = THREE.NoToneMapping; renderer.setClearColor(0x000000, 0);
  for (const id of ITEM_IDS) {
    const d = I[id], Wp = U * d.w, Hp = U * d.h, aspect = d.w / d.h;
    rt.setSize(Wp, Hp);
    const m = itemModel(id), holder = new THREE.Group(); holder.add(m); scene.add(holder);
    let box = new THREE.Box3().setFromObject(holder), sz = box.getSize(new THREE.Vector3());
    // long thin models follow the icon's long side
    if (aspect < 1 && sz.x > sz.y * 1.2) m.rotation.z = Math.PI / 2;
    if (aspect > 1 && sz.y > sz.x * 1.2) m.rotation.z = Math.PI / 2;
    box = new THREE.Box3().setFromObject(holder); sz = box.getSize(new THREE.Vector3());
    holder.position.sub(box.getCenter(new THREE.Vector3()));
    const need = Math.max(sz.y, sz.x / aspect, sz.z * 0.6) * 1.18;
    const D = need / (2 * tanH) + sz.z;
    cam.aspect = aspect; cam.updateProjectionMatrix();
    cam.position.set(0, D * 0.38, D); cam.lookAt(0, 0, 0);
    renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, cam);
    const buf = new Uint8Array(Wp * Hp * 4); renderer.readRenderTargetPixels(rt, 0, 0, Wp, Hp, buf);
    const cv = document.createElement('canvas'); cv.width = Wp; cv.height = Hp;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(Wp, Hp);
    for (let y = 0; y < Hp; y++) img.data.set(buf.subarray((Hp - 1 - y) * Wp * 4, (Hp - y) * Wp * 4), y * Wp * 4);
    ctx.putImageData(img, 0, 0);
    ICONS[id] = cv.toDataURL();
    scene.remove(holder);
  }
  renderer.setRenderTarget(null); renderer.toneMapping = prevTone; renderer.setClearColor(prevColor, prevAlpha);
  rt.dispose();
}
