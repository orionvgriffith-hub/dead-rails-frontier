// Entry: renderer, world assembly, explorer camera with collision, HUD, map, audio
import * as THREE from 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/three.module.js';
import * as W from './world.js';
import { buildMaterials, setAniso, setTextureQuality, MAT } from './textures.js';
import { SHARED as SHADE, groundLayers } from './terrainmat.js';
import { createTerrain } from './terrain.js';
import { buildRailway, railNearest, BRIDGES } from './rail.js';
import { buildSettlements, ANIMATED, LAMP_SPOTS } from './towns.js';
import { buildTileProps, dropTileProps, buildPropMeshes, cullProps, makeTumbleweeds } from './props.js';
import { indexColliders, nearby, addCircles, removeCircles, COLLIDERS, CIRCLES } from './builder.js';
import { createAtmosphere } from './sky.js';
import { mulberry32 } from './noise.js';
import { loadTrain } from './train.js';
import { loadTrackScan } from './trackscan.js';
import { createGame } from './game/game.js';
import { STATION_SPOTS, READABLES, HEAT_SPOTS, registerHeat, HAZARDS, registerHazard, undergroundAt } from './game/registry.js';
import { flames } from './special.js';
import { ITEMS } from './game/items.js';
import { airAt, BIOME, DESERT, FOREST, SWAMP, BADLANDS, SNOW } from './biomes.js';
import * as In from './input.js';
import * as Menus from './settings.js';
import * as MP from './mpmenu.js';
import { OnlineNet } from './game/online.js';
import { S, resolutionRatio } from './settings.js';
import { t } from './i18n.js';
import { createPost } from './post.js';

const $ = id => document.getElementById(id);
const canvas = $('view');
// anti-aliasing is done by the post pass (MSAA or FXAA) so it can be changed while playing
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(resolutionRatio(S.resScale));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
setAniso(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(S.fov, innerWidth / innerHeight, 0.1, 20000);
const post = createPost(renderer);
camera.rotation.order = 'YXZ';
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

const progress = (p, msg) => { $('bar').style.width = (p * 100).toFixed(1) + '%'; if (msg) $('status').textContent = msg; };
const frame = () => new Promise(r => requestAnimationFrame(() => r()));

let trackUpd = null;
let game = null, spawnAt = null, terrain = null;
let atmo, tumble, lights = [], train = null, townGroups = [], frameNo = 0, slowT = 0;
let paused = false, atMainMenu = false, quitted = false, started = false, viewK = 1, detailK = 1, shakeAmt = 0, eyeH = 1.65, zoomK = 1;
const player = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: -0.05, fly: false, onGround: false, riding: false, view: 'cab' };
// the clock runs on its own: a whole day passes in DAY_MIN real minutes (time lapse runs it 30 times faster)
const DAY_MIN = 48;
let tod = 16.9, timeLapse = false;

async function init() {
  progress(0.005, 'Grading the sand, gravel and rock'); await frame();
  groundLayers();
  progress(0.01, 'Weathering the timber'); await frame();
  buildMaterials();
  await W.computeRailGround(p => progress(0.02 + p * 0.33, 'Surveying thirty kilometres of line'));
  progress(0.36, 'Laying track across the territory'); await frame();
  buildRailway(scene);
  loadTrackScan(scene).then(f => { trackUpd = f; }).catch(e => { console.error(e); toast('The scanned track could not be loaded'); });
  progress(0.44, 'Raising the towns'); await frame();
  const rnd = mulberry32(1887);
  townGroups = buildSettlements(scene, rnd);
  for (const g of townGroups) { const b = new THREE.Box3().setFromObject(g), c = b.getCenter(new THREE.Vector3()); g.userData.cx = c.x; g.userData.cz = c.z; }
  progress(0.52, 'Scattering rocks, bones and brush'); await frame();
  buildPropMeshes(scene);
  indexColliders();
  atmo = createAtmosphere(scene, renderer);
  atmo.onThunder = d => audio.thunder(d);
  tumble = makeTumbleweeds(scene, W);
  vultures();
  for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffb060, 0, 16, 2); scene.add(l); lights.push(l); }
  // the ground is only built where you are: detailed tiles close by, coarse ones out to the horizon, nothing beyond
  terrain = createTerrain(scene, {
    onTile: t => { t.props = buildTileProps(t, scene); addCircles(t.props.circles); },
    onDrop: t => { if (t.props) { removeCircles(t.props.circles); dropTileProps(t.props, scene); t.props = null; } },
  });
  await buildMinimap(p => progress(0.55 + p * 0.15, 'Drawing the survey map'));
  // start on the Dry Gulch platform looking down the line
  const t = W.TOWNS.find(t => t.name === 'Dry Gulch');
  const [sx, sz] = W.townToWorld(t, -6, 4.4);
  spawnAt = () => { player.pos.set(sx, t.h + 0.75, sz); player.yaw = Math.atan2(-t.tx, -t.tz) + 0.35; player.pitch = -0.05; player.vel.set(0, 0, 0); player.fly = false; player.seated = false; player.perch = null; player.onTrain = false; player.trainLocal = null; };
  spawnAt();
  camera.position.set(sx, t.h + 2.4, sz);
  while (!terrain.readyAt(sx, sz) || terrain.progress(camera.position) < 1) {
    terrain.update(camera.position, 40);
    progress(0.7 + terrain.progress(camera.position) * 0.26, 'Shaping the ground around Dry Gulch'); await frame();
  }
  progress(0.97, 'Filling the crates'); await frame();
  game = createGame({
    scene, camera, renderer, player, toast, groundAt, getTrain: () => train, campfire,
    isUnder, flash: flashAt, firePool, sites: W.SITES, bossIntro, bossBar, setObjective, ending: showEnding, reveal: revealPlace, telegram: telegramSpot,
    trainPush: (q, r) => train && train.push(q, r, STEP, HEAD), railDist: (x, z) => W.gridSample(W.railD, x, z), half: W.HALF,
    inTown: (x, z) => W.TOWNS.some(t => Math.hypot(x - t.cx, z - t.cz) < t.len / 2 + 40),
    heightAt: W.heightAt, waterAt: (x, z) => W.gridSample(W.waterL, x, z), biomeAt: W.biomeAt, pushOut, boom: boomFx,
    inSwamp: (x, z) => { W.biomeAt(x, z, zbw); return zbw[SWAMP] > 0.4 && W.heightAt(x, z) - W.SWAMP_WL < 1.4; },
    blockers: o => townGroups.filter(g => g.visible && Math.hypot(g.userData.cx - o.x, g.userData.cz - o.z) < 160),
    kick: k => { player.pitch = Math.min(1.45, player.pitch + k); }, aiming: () => zoomK < 0.7,
    respawn: () => { spawnAt(); post.resetMotion(); toast('Dry Gulch', true); },
    settings: S, hint: Menus.hint, readNote: Menus.readNote, t, shake: k => { shakeAmt = Math.min(1.2, shakeAmt + k); },
    placeAt: (x, z, yaw) => { player.pos.set(x, groundAt(x, z, W.heightAt(x, z) + 1.5), z); player.yaw = yaw; },
    sit, stand, perch, unperch, sfx: (...a) => audio.sfx(...a),
    lock: () => { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {} },
    unlock: () => { if (document.pointerLockElement) document.exitPointerLock(); for (const k in keys) keys[k] = false; },
  });
  try { $('riderName').value = localStorage.getItem('drw.name') || 'Drifter ' + (100 + Math.floor(Math.random() * 900)); } catch (e) { $('riderName').value = 'Drifter'; }
  Menus.initMenus(menuHooks);
  MP.initMultiplayer({
    click: () => audio.click(), name: riderName, play: playOnline, started: () => started,
    online: () => (game && game.net && game.net.online ? game.net : null),
    saveAndReload: () => { if (game) { game.save(); if (game.net) game.net.leave(); } saveExplored(); location.reload(); },
    opened: () => { clearKeys(); if (document.pointerLockElement) document.exitPointerLock(); },
    closed: () => { if (started && !atMainMenu && !paused) lockPointer(); else if (started && paused && !atMainMenu) Menus.openPause(!alone()); },
  });
  applySettings(null);
  progress(1, 'Ready');
  $('loading').classList.add('done');
  $('start').disabled = false;
  MP.resumePending(); // a server picked while already riding: the page reloaded to join it
  renderer.compile(scene, camera);
  last = performance.now();
  schedule();
  // the user's Jupiter locomotive streams in after the world is up
  loadTrain(scene, 'models/jupiter.obj').then(tr => {
    train = tr; train.audio = audio; train.setSmoke(S.particles);
    train.place(t.k * W.rail.ds + 2);
    game.trainArrived(train);
    const b = document.createElement('button'); b.id = 'trainBtn'; b.textContent = 'The Jupiter (locomotive)';
    b.onclick = () => { if (game.riding) game.horses.dismount(); toggleMap(false); post.resetMotion(); player.seated = false; player.perch = null; player.onTrain = false; player.trainLocal = null; const q = train.boardingPoint(); player.pos.set(q.x, groundAt(q.x, q.z, W.heightAt(q.x, q.z) + 1), q.z); player.fly = false; player.vel.set(0, 0, 0); player.yaw = train.heading - Math.PI / 2; player.pitch = 0; toast('Climb the side steps onto the cargo car, then walk forward into the cab'); };
    $('places').prepend(b);
    toast('The Jupiter is waiting at the platform', false);
  }).catch(e => { console.error(e); toast('The locomotive model could not be loaded'); });
}

// ---------- vultures circling over grim places ----------
function vultures() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x1c1612, roughness: 1 });
  for (const s of [W.SITES[2], W.SITES[4], W.SITES[0]]) {
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group(), body = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.9), mat);
      const wl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 0.5), mat), wr = wl.clone();
      wl.geometry = wl.geometry.clone().translate(-0.8, 0, 0); wr.geometry = wr.geometry.clone().translate(0.8, 0, 0);
      g.add(body, wl, wr); scene.add(g);
      const r = 30 + i * 14, h = s.h + 55 + i * 9, sp = 0.12 + i * 0.03, ph = Math.random() * 6;
      ANIMATED.push((t) => {
        const a = ph + t * sp; g.position.set(s.x + Math.cos(a) * r, h + Math.sin(t * 0.3 + i) * 3, s.z + Math.sin(a) * r);
        g.rotation.set(0, -a, 0.35); const f = Math.sin(t * 2 + i) * 0.12; wl.rotation.z = f; wr.rotation.z = -f;
      });
    }
  }
}

// ---------- input: every key goes through the bindings in input.js ----------
const keys = {};
const down = id => !!keys[In.binds[id]];
const clearKeys = () => { for (const k in keys) keys[k] = false; };
const lockPointer = () => { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {} };
const mapOpen = () => $('mapwrap').classList.contains('open');
const introShown = () => !$('intro').classList.contains('gone');
function sit() {
  if (!train) return;
  player.seated = true; player.fly = false; player.yaw = train.heading - Math.PI / 2; player.pitch = -0.12; toast('At the controls of the Jupiter');
}
function stand() {
  if (!player.seated || !train) return;
  player.seated = false; const q = train.besideDriverSeat(); player.pos.copy(q); player.trainBody = 0; player.trainLocal = train.toLocal(q, 0); player.onTrain = true; toast('Stood up');
}
// riding in one of the other cab seats: you stay put as she runs, free to look about (and shoot)
function perch(i) {
  if (!train || player.seated) return;
  player.perch = i; player.fly = false; player.crouch = false; player.vel.set(0, 0, 0); player.yaw = train.heading - Math.PI / 2; player.pitch = -0.05;
}
function unperch() {
  if (player.perch == null || !train) return;
  const q = train.besideSeat(player.perch); player.perch = null; player.pos.copy(q); player.trainBody = 0; player.trainLocal = train.toLocal(q, 0); player.onTrain = true;
}
// which bindings are live right now
const inputContext = () => game && game.uiOpen ? 'ui' : player.seated ? 'train' : 'foot';
function press(code, e) {
  if (!started || quitted || atMainMenu || Menus.menuOpen() || MP.panelOpen()) return false;
  let handled = false;
  for (const id of In.actionsFor(code, inputContext())) handled = doAction(id, e) || handled;
  return handled;
}
function doAction(id, e) {
  if (id === 'pause') {
    if (game.uiOpen) { game.closeInventory(); return true; }
    if (mapOpen()) { toggleMap(false); return true; }
    openPauseMenu(); return true;
  }
  if (id === 'map') { toggleMap(); return true; }
  if (game.action(id, e)) return true;
  if (game.blocked) return false;
  switch (id) {
    case 'view': if (player.wasInCab) player.view = player.view === 'cab' ? 'chase' : 'cab'; return true;
    case 'whistle': if (train && player.wasInCab) { train.whistle(); game.fx('whistle'); } return true;
    case 'bell': if (train && player.wasInCab) { train.bell(); game.fx('bell'); } return true;
    case 'flight': if (game.riding) game.horses.dismount(); player.fly = !player.fly; player.vel.set(0, 0, 0); toast(player.fly ? 'Survey flight' : 'On foot'); return true;
    case 'timeLapse': timeLapse = !timeLapse; toast(timeLapse ? 'Time passing quickly' : 'Time passing naturally'); return true;
    case 'hourFwd': tod = (tod + 0.5) % 24; return true;
    case 'hourBack': tod = (tod + 23.5) % 24; return true;
    case 'night': tod = tod > 6 && tod < 19 ? 22.5 : 16.9; return true;
    case 'help': { const on = $('hud').classList.toggle('clean'); $('help').classList.toggle('hidden', on); try { localStorage.setItem('drw.hud', on ? 'clean' : 'full'); } catch (e) {} toast(on ? 'Clean view · H for controls and details' : 'Controls and details shown · H to hide'); return true; }
  }
  return false;
}
addEventListener('keydown', e => {
  const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA');
  if (typing) { if (e.code === 'Escape') e.target.blur(); return; }
  if (e.repeat && keys[e.code]) { if (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow')) e.preventDefault(); return; }
  keys[e.code] = true;
  if (press(e.code, e) || e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', clearKeys);
let dragging = false, lx = 0, ly = 0;
const look = (dx, dy) => {
  const k = 0.0022 * S.sens * zoomK, iy = S.invertY ? -1 : 1;
  player.yaw -= dx * k; player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch - dy * k * iy));
};
canvas.addEventListener('mousedown', e => {
  if (document.pointerLockElement === canvas) { const c = 'Mouse' + e.button; keys[c] = true; press(c, e); return; }
  dragging = true; lx = e.clientX; ly = e.clientY;
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => { if (game && document.pointerLockElement === canvas) { game.wheel(e.deltaY); e.preventDefault(); } }, { passive: false });
addEventListener('mouseup', e => { dragging = false; keys['Mouse' + e.button] = false; });
addEventListener('mousemove', e => {
  if (document.pointerLockElement === canvas) look(e.movementX, e.movementY);
  else if (dragging && !Menus.menuOpen()) { look(e.clientX - lx, e.clientY - ly); lx = e.clientX; ly = e.clientY; }
});
canvas.addEventListener('click', () => { if (started && !mapOpen() && !Menus.menuOpen() && !atMainMenu) lockPointer(); });
// losing the mouse while playing (Esc, alt-tab) brings up the pause menu
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement) return;
  clearKeys();
  if (started && !quitted && !atMainMenu && !Menus.menuOpen() && game && !game.uiOpen && !game.dead && !mapOpen()) openPauseMenu();
});
const alone = () => !(game && game.net && game.net.peers.size > 0);
function openPauseMenu() {
  if (!started || quitted || paused) return;
  paused = true; clearKeys();
  if (document.pointerLockElement) document.exitPointerLock();
  Menus.openPause(!alone());
}
const menuHooks = {
  click: () => audio.click(),
  test: cat => audio.test(cat),
  opened: () => { clearKeys(); if (document.pointerLockElement) document.exitPointerLock(); },
  resume: () => { paused = false; post.resetMotion(); renderHelp(); if (!atMainMenu) lockPointer(); },
  noteClosed: () => { if (!paused && !atMainMenu) lockPointer(); },
  mainMenu: () => showMainMenu(),
  quit: () => quitGame(),
  backToMain: () => renderHelp(),
  multiplayer: () => !alone(),
  online: () => !!(game && game.net && game.net.online),
  serverPanel: () => MP.openSession(),
};
// the intro card doubles as the main menu once you are riding
function showMainMenu() {
  paused = false; atMainMenu = true; clearKeys();
  if (game) game.save(); saveExplored();
  $('intro').classList.remove('gone');
  $('start').disabled = false; $('start').dataset.i18n = 'm_continue'; $('start').textContent = t('m_continue');
  $('riderName').disabled = true;
}
function quitGame() {
  if (game) { game.save(); if (game.net) game.net.leave(); } saveExplored();
  quitted = true; atMainMenu = false;
  if (audio.ctx) audio.ctx.suspend();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  $('intro').classList.add('gone'); $('quitScreen').classList.add('on');
}
$('againBtn').addEventListener('click', () => location.reload());
// starting the game: on your own (other tabs of this browser join you), or in a server session (makeNet)
function riderName() { return ($('riderName').value || '').trim().replace(/\s+/g, ' ').slice(0, 18) || 'Drifter'; }
function startGame(makeNet) {
  if (S.fullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  if (started) { atMainMenu = false; $('intro').classList.add('gone'); post.resetMotion(); lockPointer(); return Promise.resolve(); }
  const nm = riderName();
  try { localStorage.setItem('drw.name', nm); } catch (e) {}
  $('start').disabled = true;
  audio.start(); lockPointer();
  return game.begin(nm, makeNet).then(() => { started = true; $('intro').classList.add('gone'); game.setNames(S.showNames); })
    .catch(e => { $('start').disabled = false; throw e; });
}
$('start').addEventListener('click', () => { startGame(); });
// a server session: the server's difficulty for its world while you're in it, and its news as toasts
function playOnline(room) {
  return startGame(o => {
    const net = new OnlineNet(room, o);
    net.onNotice = m => toast(m);
    net.onInfo = info => { if (info.difficulty) S.difficulty = info.difficulty; MP.refreshSession(); };
    net.onDisconnect = msg => { if (document.pointerLockElement) document.exitPointerLock(); MP.disconnected(msg); };
    return net;
  }).catch(e => { try { room.leave(true); } catch (x) {} throw e; });
}
$('menuSettings').addEventListener('click', () => { audio.click(); Menus.openSettings('general', 'main'); });
$('menuRestart').addEventListener('click', () => { audio.click(); Menus.restartDialog(); });
try { if (localStorage.getItem('drw.hud') === 'full') { $('hud').classList.remove('clean'); $('help').classList.remove('hidden'); } } catch (e) {}
$('riderName').addEventListener('keydown', e => { if (e.code === 'Enter' && !$('start').disabled) $('start').click(); });
$('mute').addEventListener('click', () => Menus.set('mute', !S.mute));
$('quality').addEventListener('click', () => { const order = ['low', 'medium', 'high', 'ultra'], i = order.indexOf(S.preset); Menus.set('preset', order[(i + 1) % order.length]); });
$('timeSlider').addEventListener('input', e => { tod = +e.target.value; });

// ---------- collision ----------
const R = 0.35, STEP = 0.46;
let HEAD = 1.75; // 1.15 while crouching
const _l = new THREE.Vector3();
function groundAt(x, z, feet) {
  // in a dug-out place (the laboratory, the catacombs, a crypt) only built floors count
  const u = undergroundAt(x, z), dug = u && (u.hole || feet < u.top - 1.2);
  let g = dug ? -1e4 : W.heightAt(x, z);
  // frozen lakes and rivers carry your weight
  const wl = dug ? -1e4 : W.gridSample(W.waterL, x, z); if (wl > g && W.gridSample(W.iceF, x, z) > 0.5) g = wl;
  const rn = dug ? null : railNearest(x, z);
  if (rn) {
    const a = Math.abs(rn.lat);
    if (rn.bridge) { if (a < 1.45) g = Math.max(g, rn.y + 0.16); }
    else if (a < 1.4) g = Math.max(g, rn.y + 0.16);
    else if (a < 3.1) g = Math.max(g, rn.y + 0.04 - (a - 1.8) * 0.76);
  }
  for (const c of nearby(x, z)) {
    if (!c.boxes) continue;
    _l.set(x, feet, z).applyMatrix4(c.inv);
    for (const b of c.boxes) {
      if (_l.x > b[0] && _l.x < b[3] && _l.z > b[2] && _l.z < b[5]) {
        const top = b[4] + c.y;
        if (top <= feet + STEP && top > g) g = top;
      }
    }
  }
  return g;
}
function pushOut(p, r = R) {
  const feet = p.y;
  for (const c of nearby(p.x, p.z)) {
    if (c.boxes) {
      _l.set(p.x, feet, p.z).applyMatrix4(c.inv);
      let moved = false;
      for (const b of c.boxes) {
        if (b[4] <= _l.y + STEP || b[1] >= _l.y + HEAD) continue;
        const cx = Math.max(b[0], Math.min(_l.x, b[3])), cz = Math.max(b[2], Math.min(_l.z, b[5]));
        let dx = _l.x - cx, dz = _l.z - cz; const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; _l.x += dx * k; _l.z += dz * k; }
        else {
          const pl = [_l.x - b[0], b[3] - _l.x, _l.z - b[2], b[5] - _l.z], m = Math.min(...pl), i = pl.indexOf(m);
          if (i === 0) _l.x = b[0] - r; else if (i === 1) _l.x = b[3] + r; else if (i === 2) _l.z = b[2] - r; else _l.z = b[5] + r;
        }
        moved = true;
      }
      if (moved) { c.base = c.base || c.inv.clone().invert(); _l.applyMatrix4(c.base); p.x = _l.x; p.z = _l.z; }
    } else {
      if (c.top <= feet + STEP) continue;
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), rr = c.r + r;
      if (d < rr && d > 1e-6) { p.x = c.x + dx / d * rr; p.z = c.z + dz / d * rr; }
    }
  }
}
// is there room to stand up here?
function headroom(p) {
  for (const c of nearby(p.x, p.z)) if (c.boxes) {
    _l.set(p.x, p.y, p.z).applyMatrix4(c.inv);
    for (const b of c.boxes) if (_l.x > b[0] - R && _l.x < b[3] + R && _l.z > b[2] - R && _l.z < b[5] + R && b[1] > _l.y + 1.0 && b[1] < _l.y + 1.78) return false;
  }
  return !(train && train.ceiling(p) < p.y + 1.78);
}

// ---------- update ----------
let last = 0, elapsed = 0, lightTimer = 0, locTimer = 0, currentLoc = '';
let rideBob = 0;
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), mv = new THREE.Vector3();
const _q = new THREE.Quaternion(), _eu = new THREE.Euler(0, 0, 0, 'YXZ'), _look = new THREE.Vector3();
function update(dt) {
  const p = player.pos;
  surface(p);
  if (game && game.blocked) for (const k in keys) keys[k] = false;
  const shift = down('sprint');
  let sprint = shift, moving = false, sprinting = false;
  // the locomotive moves first; anyone standing on it is carried along
  const seated = !!(train && player.seated);
  if (train) {
    train.update(dt, seated ? { up: down('throttleUp'), down: down('throttleDown'), brake: down('brake') } : null, atmo.night, atmo.wind);
    if (player.onTrain && player.trainLocal) { p.copy(train.toWorld(player.trainLocal, player.trainBody)); player.yaw += train.headingDelta; }
  }
  if (seated !== player.wasInCab) { player.wasInCab = seated; $('trainHud').classList.toggle('on', seated); if (!seated) player.view = 'cab'; }
  if (seated) {
    p.copy(train.driverSeat()); player.vel.set(0, 0, 0); player.onGround = true; player.onTrain = true; player.trainBody = 0; player.trainLocal = train.toLocal(p, 0);
  } else if (player.perch != null && train) {
    // any step or a jump gets you up
    if (down('forward') || down('back') || down('left') || down('right') || down('jump')) unperch();
    else { p.copy(train.seatPos(player.perch)); player.vel.set(0, 0, 0); player.onGround = true; player.onTrain = true; player.trainBody = 0; player.trainLocal = train.toLocal(p, 0); }
  } else if (game && game.riding) {
    // on horseback the horse does the moving; you sit where it is
    rideBob = game.ride(dt, { fwd: down('forward'), back: down('back'), left: down('left'), right: down('right'), sprint: shift, jump: down('jump'), walk: down('crouch') });
    player.onGround = true; player.onTrain = false; player.trainLocal = null; player.fly = false; player.crouch = false; HEAD = 1.75;
    moving = Math.hypot(player.vel.x, player.vel.z) > 0.5;
  } else {
  fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)); right.set(-fwd.z, 0, fwd.x);
  mv.set(0, 0, 0);
  if (down('forward')) mv.add(fwd); if (down('back')) mv.sub(fwd);
  if (down('right')) mv.add(right); if (down('left')) mv.sub(right);
  // crouching: slower, lower, and fits under low beams; you stand back up only where there is head room
  const wantCrouch = down('crouch') && !player.fly;
  if (wantCrouch) player.crouch = true; else if (player.crouch && headroom(p)) player.crouch = false;
  HEAD = player.crouch ? 1.15 : 1.75;
  if (mv.lengthSq()) mv.normalize();
  if (!player.fly) sprint = shift && !player.crouch && mv.lengthSq() > 0 && (!game || game.sprintOK());
  moving = mv.lengthSq() > 0; sprinting = sprint && !player.fly;
  if (player.fly) {
    player.onTrain = false;
    const sp = sprint ? 160 : 35;
    const look3 = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
    const f3 = (down('forward') ? 1 : 0) - (down('back') ? 1 : 0);
    p.addScaledVector(look3, f3 * sp * dt); p.addScaledVector(right, ((down('right') ? 1 : 0) - (down('left') ? 1 : 0)) * sp * dt);
    if (down('jump')) p.y += sp * dt; if (down('crouch')) p.y -= sp * dt;
    p.y = Math.max(p.y, W.heightAt(p.x, p.z) + 0.5);
  } else {
    const sp = (sprint ? 9 : player.crouch ? 2.0 : 4.4) * (game ? game.speedMul() : 1) * surf.mul, accel = player.onGround ? 14 * surf.grip : 3;
    player.vel.x += (mv.x * sp - player.vel.x) * Math.min(1, accel * dt);
    player.vel.z += (mv.z * sp - player.vel.z) * Math.min(1, accel * dt);
    player.vel.y -= 18 * dt;
    if (down('jump') && !player.crouch && player.onGround && (!game || game.jumpOK())) { player.vel.y = 5.6; player.onGround = false; }
    const steps = Math.ceil(Math.hypot(player.vel.x, player.vel.z) * dt / 0.2) || 1;
    for (let i = 0; i < steps; i++) {
      p.x += player.vel.x * dt / steps; p.z += player.vel.z * dt / steps;
      pushOut(p);
      if (train) train.push(p, R, STEP, HEAD);
    }
    p.y += player.vel.y * dt;
    let g = groundAt(p.x, p.z, p.y), onTrain = false;
    if (train) { const tg = train.standOn(p.x, p.z, p.y, STEP); if (tg > g) { g = tg; onTrain = true; player.trainBody = train.standBody; } }
    // deep water: you swim with your head above it instead of walking the bottom
    if (!onTrain && surf.swim && g < surf.wl - 1.35) { g = surf.wl - 1.35; if (down('jump')) player.vel.y = Math.max(player.vel.y, 0); }
    if (p.y <= g) { if (!player.onGround && game) game.land(-player.vel.y); p.y = g; player.vel.y = 0; player.onGround = true; }
    else if (p.y - g < 0.25 && player.vel.y <= 0 && player.onGround) { p.y = g; player.vel.y = 0; }
    else { player.onGround = false; onTrain = false; }
    // ceilings
    for (const c of nearby(p.x, p.z)) if (c.boxes) {
      _l.set(p.x, p.y, p.z).applyMatrix4(c.inv);
      for (const b of c.boxes) if (_l.x > b[0] && _l.x < b[3] && _l.z > b[2] && _l.z < b[5] && b[1] > _l.y + 0.5 && b[1] < _l.y + HEAD && player.vel.y > 0) player.vel.y = 0;
    }
    if (train) { const ceil = train.ceiling(p); if (p.y + HEAD > ceil) { p.y = Math.max(g, ceil - HEAD); if (player.vel.y > 0) player.vel.y = 0; } }
    // stay attached while airborne just above the deck (jumping inside a moving cab)
    if (!onTrain && player.onTrain && train && !player.onGround && train.over(p, player.trainBody)) onTrain = true;
    player.onTrain = onTrain;
    player.trainLocal = onTrain ? train.toLocal(p, player.trainBody) : null;
  }
  }
  p.x = Math.max(-W.HALF + 8, Math.min(W.HALF - 8, p.x)); p.z = Math.max(-W.HALF + 8, Math.min(W.HALF - 8, p.z));
  const riding = !!(game && game.riding);
  const bob = riding ? rideBob : !player.fly && !seated && player.onGround ? Math.sin(elapsed * (sprint ? 13 : 8.5)) * 0.035 * Math.min(1, Math.hypot(player.vel.x, player.vel.z) / 4) : 0;
  // eye height eases between standing, crouching and seated; secondary action held = zoom
  eyeH += ((player.fly ? 0 : seated || player.perch != null ? 0.78 : riding ? 2.35 : player.crouch ? 1.05 : 1.65) - eyeH) * Math.min(1, dt * 8);
  const zoom = down('secondary') && !seated && !(game && game.blocked);
  zoomK += ((zoom ? 0.42 : 1) - zoomK) * Math.min(1, dt * 10);
  const fov = S.fov * zoomK; if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  if (seated && player.view === 'chase') {
    camera.position.copy(train.chaseEye(-(player.yaw - train.heading + Math.PI / 2), Math.max(-0.6, Math.min(0.5, player.pitch))));
    const gy = W.heightAt(camera.position.x, camera.position.z) + 1; if (camera.position.y < gy) camera.position.y = gy;
    camera.lookAt(train.root.localToWorld(_look.set(1, 2.2, 0)));
  } else {
    camera.position.set(p.x, p.y + eyeH + bob, p.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
  }
  // camera shake from hard landings, hits and a fast train underfoot
  const shakeK = { off: 0, low: 0.5, full: 1 }[S.shake] ?? 1;
  shakeAmt = Math.max(0, shakeAmt - dt * 2.2);
  // a moving train only sways gently and smoothly; the random jolt is kept for hits and landings
  const rumble = train && player.onTrain ? Math.min(1, Math.abs(train.v) / 18) * shakeK : 0;
  if (rumble > 0.01) {
    camera.position.y += Math.sin(elapsed * 2.3) * 0.006 * rumble;
    camera.rotation.z += Math.sin(elapsed * 1.1) * 0.0025 * rumble;
  }
  const sh = shakeAmt * shakeAmt * shakeK;
  if (sh > 0.0005) {
    camera.position.x += (Math.random() - 0.5) * 0.12 * sh; camera.position.y += (Math.random() - 0.5) * 0.12 * sh;
    camera.rotation.z += (Math.random() - 0.5) * 0.03 * sh; camera.rotation.x += (Math.random() - 0.5) * 0.02 * sh;
  }
  trainHud();
  tod = (tod + dt * (timeLapse ? 0.25 : 24 / (DAY_MIN * 60))) % 24;
  // the detailed ground follows the camera; work harder while it is missing under your feet (after travel)
  terrain.update(camera.position, terrain.readyAt(camera.position.x, camera.position.z) ? 6 : 24);
  if ((airT -= dt) <= 0) { airT = 0.25; W.biomeAt(camera.position.x, camera.position.z, bw); airAt(bw, atmo.night, camera.position.y, air); air.biomeName = BIOME[air.biome].name; }
  const under = isUnder(camera.position);
  atmo.sheltered = under || underRoof(camera.position) || (seated && train && train.up && train.up.canvas);
  atmo.under += ((under ? 1 : 0) - atmo.under) * Math.min(1, dt * 3);
  atmo.update(tod, camera.position, dt, elapsed, air);
  // plants and water move with the clock and the wind
  SHADE.time.value = elapsed; SHADE.wind.value.copy(atmo.wind); SHADE.windK.value = Math.min(1.6, atmo.windStrength * (atmo.sheltered ? 0.6 : 1));
  tumble.active = (bw[DESERT] + bw[BADLANDS] > 0.4 ? 1 : 0) * tumbleN;
  tumble(dt, camera.position, atmo.wind);
  for (const f of ANIMATED) f(elapsed, dt, atmo.windStrength);
  tickFires(dt); tickBooms(dt); tickPools(dt); tickFlash(dt);
  cullProps(camera.position, viewK, detailK);
  if (trackUpd) trackUpd(camera.position, dt, viewK);
  for (const g of townGroups) g.visible = Math.hypot(g.userData.cx - camera.position.x, g.userData.cz - camera.position.z) < 2200 * viewK;
  lightTimer -= dt;
  if (lightTimer <= 0) {
    lightTimer = 0.5;
    const near = LAMP_SPOTS.map(s => [s, (s[0] - p.x) ** 2 + (s[2] - p.z) ** 2 + ((s[1] - p.y) * 3) ** 2]).sort((a, b) => a[1] - b[1]).slice(0, lights.length);
    lights.forEach((l, i) => { const n = near[i]; if (n && n[1] < 300 * 300) { l.position.set(n[0][0], n[0][1] - 0.2, n[0][2]); l.userData.on = true; l.userData.fire = !!n[0].fire; l.userData.spot = n[0]; } else l.userData.on = false; });
  }
  const flick = 0.85 + 0.15 * Math.sin(elapsed * 13.0) * Math.sin(elapsed * 7.3);
  for (const l of lights) { const sp = l.userData.spot; l.intensity = !l.userData.on ? 0 : sp && sp.under ? 7 * (sp.k ?? 1) * (sp.fire !== false && sp.k < 0.5 ? flick : 1) : (l.userData.fire ? 2 + atmo.night * 10 : atmo.night * 9) * flick; }
  locTimer -= dt; if (locTimer <= 0) { locTimer = 0.4; updateLocation(); explore(); }
  audio.update(atmo.windStrength, atmo.night, dt, bw, atmo.weather, camera.position.y, atmo);
  let grip = 1;
  if (train) { const tp = train.root.position; W.biomeAt(tp.x, tp.z, tbw); grip = 1 - tbw[SNOW] * 0.22 - Math.min(1, air.snow) * 0.12 - Math.min(1, air.rain) * 0.08; }
  if (game) game.update(dt, { moving, sprinting, night: atmo.night, elapsed, loc: currentLoc, air, wet: surf.depth > 0.25 && !surf.ice, grip });
  if (started && game && !game.dead) { if (surf.mul < 0.8 && moving) Menus.hint('mud'); randomEvents(dt); }
  hud();
}

// ---------- the ground underfoot: mud, snow, ice, shallow and deep water ----------
const surf = { mul: 1, grip: 1, depth: 0, wl: -1e4, ice: false, swim: false };
const bw = new Float32Array(5), tbw = new Float32Array(5), sbw = new Float32Array(5), air = { temp: 20, wind: 0.5, snow: 0, rain: 0, tint: [0.88, 0.8, 0.68] };
let airT = 0, tumbleN = 14;
// below ground in one of the dug-out places?
function isUnder(p) { const u = undergroundAt(p.x, p.z); return !!u && (p.y < u.top - 1.2 || (u.hole && p.y < u.top - 0.5)); }
function surface(p) {
  if (isUnder(p)) { Object.assign(surf, { mul: 1, grip: 1, depth: 0, wl: -1e4, ice: false, swim: false, under: true }); return; }
  surf.under = false;
  const h = W.heightAt(p.x, p.z), wl = W.gridSample(W.waterL, p.x, p.z), ice = W.gridSample(W.iceF, p.x, p.z) > 0.5;
  W.biomeAt(p.x, p.z, sbw);
  const raised = p.y > h + 0.25 && !(wl > h && p.y < wl + 0.3); // on a floor, a boardwalk, the train
  const paved = W.gridSample(W.roadW, p.x, p.z) > 0.3 || W.gridSample(W.railD, p.x, p.z) < 2.6 || raised || player.onTrain;
  let mul = 1, grip = 1;
  const depth = ice ? 0 : Math.max(0, wl - h);
  if (ice) { grip = 0.18; mul = 0.95; } // you slide on ice
  else if (depth > 1.35) mul = 0.5;
  else if (depth > 0.25 && !raised) mul = 0.62;
  else if (!paved) {
    if (sbw[SWAMP] > 0.4 && h - W.SWAMP_WL < 1.4) mul = 0.66; // marsh mud
    else if (sbw[SNOW] > 0.5) mul = 0.84 - Math.min(1, air.snow) * 0.08; // deep snow, worse while it is falling
    else if (sbw[FOREST] > 0.5) mul = 0.96;
  }
  Object.assign(surf, { mul, grip, depth, wl, ice, swim: depth > 1.35 && !raised });
}
// a solid roof over this point (a building interior or a covered porch)
function underRoof(c) {
  for (const o of nearby(c.x, c.z)) if (o.boxes) {
    _l.set(c.x, c.y, c.z).applyMatrix4(o.inv);
    for (const b of o.boxes) if (_l.x > b[0] && _l.x < b[3] && _l.z > b[2] && _l.z < b[5] && b[1] > _l.y + 0.3 && b[1] < _l.y + 6) return true;
  }
  return false;
}

// ---------- campfires you build: warm, lit, and gone after a few minutes ----------
const FIRES = [];
const flameTex = (() => {
  const c = document.createElement('canvas'); c.width = 32; c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(16, 46, 2, 16, 40, 30); gr.addColorStop(0, 'rgba(255,240,180,1)'); gr.addColorStop(0.35, 'rgba(255,150,40,0.9)'); gr.addColorStop(1, 'rgba(200,40,0,0)');
  g.fillStyle = gr; g.beginPath(); g.ellipse(16, 40, 13, 24, 0, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
function campfire(x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const wood = new THREE.CylinderGeometry(0.07, 0.08, 0.9, 6), stone = new THREE.DodecahedronGeometry(0.14);
  for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(wood, MAT.woodDark); m.rotation.set(Math.PI / 2 - 0.5, i / 5 * Math.PI * 2, 0, 'YXZ'); m.position.y = 0.22; g.add(m); }
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, m = new THREE.Mesh(stone, MAT.stone); m.position.set(Math.cos(a) * 0.55, 0.06, Math.sin(a) * 0.55); m.rotation.set(a, a * 2, 0); g.add(m); }
  const sm = new THREE.SpriteMaterial({ map: flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const sp = new THREE.Sprite(sm); sp.position.y = 0.6; sp.scale.set(0.9, 1.3, 1); g.add(sp);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(g);
  const spot = [x, y + 0.8, z]; spot.fire = true; LAMP_SPOTS.push(spot); lightTimer = 0;
  const heat = registerHeat(x, y, z, 4, 28, 'fire');
  FIRES.push({ g, sp, sm, spot, heat, life: 240, ph: Math.random() * 9 });
}
function tickFires(dt) {
  for (let i = FIRES.length - 1; i >= 0; i--) {
    const f = FIRES[i]; f.life -= dt;
    const k = Math.min(1, f.life / 30), fl = 0.85 + 0.15 * Math.sin(elapsed * 13 + f.ph) * Math.sin(elapsed * 7.7 + f.ph);
    f.sp.scale.set(0.9 * fl * (0.4 + 0.6 * k), 1.3 * (0.9 + 0.2 * fl) * (0.4 + 0.6 * k), 1); f.sm.opacity = (0.75 + 0.25 * fl) * k;
    f.heat.heat = 28 * k;
    if (f.life <= 0) {
      scene.remove(f.g); f.g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); f.sm.dispose();
      HEAT_SPOTS.splice(HEAT_SPOTS.indexOf(f.heat), 1); LAMP_SPOTS.splice(LAMP_SPOTS.indexOf(f.spot), 1); FIRES.splice(i, 1); lightTimer = 0;
    }
  }
}

// ---------- burning pools (tar, spilled spirit) and lightning flashes ----------
const POOLS = [];
function firePool(x, y, z, r, t) {
  const sprites = flames(scene, x, y, z, r, 0.8), h = registerHazard({ x, y, z, r, dps: 14, kind: 'fire' });
  const spot = [x, y + 0.8, z]; spot.fire = true; LAMP_SPOTS.push(spot); lightTimer = 0;
  POOLS.push({ sprites, h, spot, t });
}
function tickPools(dt) {
  for (let i = POOLS.length - 1; i >= 0; i--) {
    const P = POOLS[i]; P.t -= dt;
    if (P.t < 2) for (const s of P.sprites) s.material.opacity = Math.max(0, P.t / 2);
    if (P.t <= 0) { for (const s of P.sprites) { scene.remove(s); s.material.dispose(); } HAZARDS.splice(HAZARDS.indexOf(P.h), 1); LAMP_SPOTS.splice(LAMP_SPOTS.indexOf(P.spot), 1); POOLS.splice(i, 1); lightTimer = 0; }
  }
}
const zapLight = new THREE.PointLight(0x9ad8ff, 0, 24, 2); let zapT = 0;
function flashAt(x, y, z) { if (!zapLight.parent) scene.add(zapLight); zapLight.position.set(x, y + 1, z); zapT = 0.12; }
function tickFlash(dt) { zapT -= dt; zapLight.intensity = zapT > 0 ? 40 : 0; }

// ---------- explosions: a flash, a fireball, a column of dust ----------
const zbw = new Float32Array(5), BOOMS = [];
const smokeTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
function boomFx(x, y, z, r) {
  const l = new THREE.PointLight(0xffa040, 60, r * 6, 2); l.position.set(x, y + 1, z); scene.add(l);
  const parts = [];
  for (let i = 0; i < 14; i++) {
    const fire = i < 5, m = new THREE.SpriteMaterial({ map: smokeTex, color: fire ? 0xffb050 : 0x8a7a64, transparent: true, depthWrite: false, blending: fire ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: fire ? 1 : 0.8 });
    const s = new THREE.Sprite(m); s.position.set(x + (Math.random() - 0.5) * r * 0.4, y + Math.random() * r * 0.3, z + (Math.random() - 0.5) * r * 0.4);
    s.scale.setScalar(r * 0.4); scene.add(s);
    parts.push({ s, v: new THREE.Vector3((Math.random() - 0.5) * 6, 2 + Math.random() * 6, (Math.random() - 0.5) * 6), fire, life: fire ? 0.5 : 2.5 + Math.random() * 1.5, t: 0 });
  }
  BOOMS.push({ l, parts, t: 0 });
  const d = Math.hypot(x - player.pos.x, z - player.pos.z);
  audio.boom(Math.max(0.15, 1 - d / 300));
}
function tickBooms(dt) {
  for (let i = BOOMS.length - 1; i >= 0; i--) {
    const b = BOOMS[i]; b.t += dt; b.l.intensity = Math.max(0, 60 * (1 - b.t / 0.3));
    let alive = 0;
    for (const p of b.parts) {
      if (p.t >= p.life) continue; p.t += dt; alive++;
      p.s.position.addScaledVector(p.v, dt); p.v.multiplyScalar(1 - dt * 1.5); p.v.y += dt * (p.fire ? 0 : 0.6);
      const k = p.t / p.life; p.s.scale.setScalar(p.s.scale.x + dt * (p.fire ? 6 : 2.5)); p.s.material.opacity = (p.fire ? 1 : 0.8) * (1 - k);
      if (p.t >= p.life) { scene.remove(p.s); p.s.material.dispose(); }
    }
    if (!alive && b.t > 0.3) { scene.remove(b.l); BOOMS.splice(i, 1); }
  }
}

// ---------- random events: things left behind out in the wilds ----------
const EVENT_LOOT = [
  [['canteen', 1], ['jerky', 3], ['cactusFruit', 2], ['pistolAmmo', 6], ['bandage', 2]],
  [['venison', 2], ['berries', 4], ['firewood', 3], ['woolCoat', 1], ['rifleAmmo', 5], ['herbs', 2]],
  [['swampMoss', 3], ['gatorHide', 1], ['beans', 2], ['lampOil', 1], ['ghostOrchid', 1], ['bandage', 2]],
  [['copperOre', 3], ['turquoise', 1], ['dynamite', 1], ['canteen', 1], ['scrap', 4], ['jerky', 2]],
  [['frozenRations', 2], ['furHat', 1], ['gloves', 1], ['scarf', 1], ['firewood', 4], ['coffee', 1]],
];
const EVENT_TITLE = ["A drifter's pack", "A trapper's bundle", "A drowned man's satchel", "A prospector's kit", "A frozen traveller's pack"];
let eventT = 150 + Math.random() * 120;
function randomEvents(dt) {
  if ((eventT -= dt) > 0 || !game.net || player.onTrain || player.fly || currentLoc) return;
  eventT = 200 + Math.random() * 260;
  const rnd = Math.random, a = rnd() * Math.PI * 2, r = 25 + rnd() * 25;
  const x = player.pos.x + Math.cos(a) * r, z = player.pos.z + Math.sin(a) * r;
  if (W.gridSample(W.waterL, x, z) > W.heightAt(x, z)) { eventT = 30; return; }
  let bi = 0; for (let i = 1; i < 5; i++) if (bw[i] > bw[bi]) bi = i;
  const pool = EVENT_LOOT[bi].filter(([id]) => ITEMS[id]), items = [];
  for (const [id, n] of pool) if (rnd() < 0.55) items.push({ id: 'ev' + Date.now().toString(36) + items.length + Math.floor(rnd() * 1e6), t: id, n: Math.max(1, Math.round(n * (0.5 + rnd() * 0.7))), x: 0, y: 0, r: 0 });
  if (!items.length && pool.length) items.push({ id: 'ev' + Date.now().toString(36), t: pool[0][0], n: 1, x: 0, y: 0, r: 0 });
  const y = groundAt(x, z, W.heightAt(x, z) + 1) + 0.02;
  game.net.request({ type: 'bag', items, cash: rnd() < 0.4 ? 2 + Math.floor(rnd() * 14) : 0, title: EVENT_TITLE[bi], x, y, z, tb: null }).then(res => {
    if (!res.ok) return;
    const dir = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((Math.atan2(x - player.pos.x, -(z - player.pos.z)) / (Math.PI * 2)) * 8 + 8)) % 8];
    toast(`You spot something left on the ground to the ${dir}`);
    if (bi === SNOW || bi === FOREST || rnd() < 0.3) campfireLater(x + 2, z + 1.5); // sometimes their fire is still smouldering
  });
}
function campfireLater(x, z) { if (W.gridSample(W.waterL, x, z) <= W.heightAt(x, z)) campfire(x, groundAt(x, z, W.heightAt(x, z) + 1), z); }

function nearestPlace(x, z) {
  let best = null, bd = 1e9;
  for (const t of W.TOWNS) { const d = Math.hypot(x - t.cx, z - t.cz) - t.len / 2 - 30; if (d < bd) { bd = d; best = t.name; } }
  for (const s of W.SITES) { const d = Math.hypot(x - s.x, z - s.z) - s.r - 30; if (d < bd) { bd = d; best = s.name; } }
  for (const b of W.LANDMARKS) { const d = Math.hypot(x - b.x, z - b.z) - b.r - 60; if (d < bd) { bd = d; best = b.name; } }
  for (const [b0, b1] of BRIDGES) { const k = (b0 + b1) >> 1; const d = Math.hypot(x - W.rail.x[k], z - W.rail.z[k]) - 60; if (d < bd) { bd = d; best = bridgeName(k); } }
  return bd < 0 ? best : null;
}
const BRIDGE_NAME = ['Rattlesnake Trestle', 'Timber Trestle', 'Bayou Trestle', 'Canyon Trestle', 'High Trestle'];
function bridgeName(k) { const b = W.biomeAt(W.rail.x[k], W.rail.z[k], tbw); let bi = 0; for (let i = 1; i < 5; i++) if (b[i] > b[bi]) bi = i; return BRIDGE_NAME[bi]; }
function updateLocation() {
  const n = nearestPlace(player.pos.x, player.pos.z) || '';
  if (n !== currentLoc) {
    currentLoc = n;
    if (n && !found.has(n) && placeOf(n)) { found.add(n); saveExplored(); mapDirty = true; toast('Discovered: ' + n, true); audio.sfx('pick'); Menus.hint('discover'); }
    else if (n) toast(n, true);
  }
  $('loc').textContent = n || wilderness(player.pos.x, player.pos.z);
}
function wilderness(x, z) {
  const rv = W.gridSample(W.riverD, x, z), rd = W.gridSample(W.railD, x, z), h = W.heightAt(x, z), b = W.biomeAt(x, z, tbw);
  let bi = 0; for (let i = 1; i < 5; i++) if (b[i] > b[bi]) bi = i;
  if (W.gridSample(W.waterL, x, z) > h) return W.gridSample(W.iceF, x, z) > 0.5 ? 'On the ice' : bi === SWAMP ? 'Black water' : 'In the water';
  if (rv < 30) return bi === DESERT ? 'Dry riverbed' : bi === SNOW ? 'Frozen river' : 'Riverbank';
  if (rd < 12) return 'Along the line';
  const m = W.gridSample(W.mtn, x, z) / 255;
  return [
    m > 0.5 ? 'High country' : m > 0.15 ? 'Foothills' : 'Open desert',
    h > 380 ? 'Timbered ridges' : 'Deep woods',
    'The bayou',
    W.gridSample('RAV', x, z) > 60 ? 'Red ravines' : 'The badlands',
    h > 540 ? 'Above the tree line' : 'Snowbound pines',
  ][bi];
}
let toastT = 0;
function toast(msg, big) { const el = $('toast'); el.textContent = msg; el.className = big ? 'show big' : 'show'; clearTimeout(toastT); toastT = setTimeout(() => el.className = '', 2600); }

function clock(h) { const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); const ap = hh >= 12 ? 'pm' : 'am'; return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${ap}`; }
let hudT = 0;
function trainHud() {
  if (!train) return;
  const near = !player.onTrain && !player.fly && train.distanceTo(player.pos) < 6;
  $('prompt').classList.toggle('on', near && S.hints);
  if (!player.wasInCab) return;
  $('mph').textContent = train.mph().toFixed(0);
  const th = train.throttle;
  $('thr').style.width = (Math.abs(th) * 50) + '%';
  $('thr').style.left = th >= 0 ? '50%' : (50 - Math.abs(th) * 50) + '%';
  $('thrLabel').textContent = train.brake ? 'Brakes on' : th > 0.02 ? 'Forward ' + Math.round(th * 100) + '%' : th < -0.02 ? 'Reverse ' + Math.round(-th * 100) + '%' : 'Neutral';
  $('viewLabel').textContent = player.view === 'cab' ? 'Cab view' : 'Outside view';
}
// ---------- the journey on screen: boss bar and introduction, the objective, the ending ----------
let objTarget = null, introT = 0, lastObj = '';
function bossIntro(name, title) {
  const el = $('bossIntro'); el.querySelector('.bn').textContent = name; el.querySelector('.bt').textContent = title || '';
  el.classList.add('on'); clearTimeout(introT); introT = setTimeout(() => el.classList.remove('on'), 3600);
}
function bossBar(b) {
  const el = $('bossbar'); el.classList.toggle('on', !!b); if (!b) return;
  el.querySelector('.bn').textContent = b.name; el.querySelector('.bt').textContent = b.title || ''; el.querySelector('s').style.width = (b.k * 100).toFixed(1) + '%';
}
function setObjective(o) {
  objTarget = o && o.target;
  const key = JSON.stringify(o); if (key === lastObj) return; lastObj = key;
  const el = $('objective'); el.querySelector('.ot').textContent = o.title;
  let next = true;
  el.querySelector('ul').innerHTML = o.lines.map(l => { const n = !l.done && next; if (n) next = false; return `<li class="${l.done ? 'done' : n ? 'next' : ''}">${l.text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</li>`; }).join('');
  el.querySelector('.rec').textContent = o.records || '';
}
function showEnding(title, body) {
  $('endTitle').textContent = title; $('endBody').textContent = body; $('ending').classList.add('on');
  if (document.pointerLockElement) document.exitPointerLock();
}
$('endBtn').onclick = () => { $('ending').classList.remove('on'); try { canvas.requestPointerLock(); } catch (e) {} };
// the Dry Gulch telegram board, for the first objective's pointer
function telegramSpot() { const t = W.TOWNS.find(t => t.name === 'Dry Gulch'); const [x, z] = W.townToWorld(t, -10, 4.8); return { x, z, name: 'Dry Gulch' }; }
function revealPlace(name) { found.add(name); const s = W.SITES.find(s => s.name === name); if (s) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const k = exIdx(s.x + di * EXK, s.z + dj * EXK); if (k >= 0) explored[k] = 1; } saveExplored(); mapDirty = true; }

function hud() {
  if ((hudT += 1) % 4) return;
  $('clock').textContent = clock(tod);
  $('timeSlider').value = tod;
  $('mode').textContent = game && game.dead ? t('fallen') : player.wasInCab ? 'Driving the Jupiter' : game && game.riding ? 'On horseback' : player.onTrain ? 'Aboard the Jupiter' : player.fly ? 'Survey flight' : 'On foot';
  $('coords').textContent = `${player.pos.x.toFixed(0)} E  ${(-player.pos.z).toFixed(0)} N  ${player.pos.y.toFixed(0)} ft`;
  const deg = ((-player.yaw * 180 / Math.PI) % 360 + 360) % 360;
  $('compass').style.setProperty('--h', deg);
  drawMinimap();
}

// ---------- maps: a coarse survey of the whole territory, revealed only where you have been ----------
// explored ground is kept as a 128×128 grid of 256 m squares; places count as found once you have stood in them
const EXN = 128, EXK = W.WORLD / EXN, EX_KEY = 'drw.explored.v2', FOUND_KEY = 'drw.found.v2';
const explored = new Uint8Array(EXN * EXN), found = new Set();
let mapDirty = true, mapImg = null, fogImg = null, exSaveT = 0;
addEventListener('beforeunload', () => saveExplored());
try {
  const s = localStorage.getItem(EX_KEY); if (s) { const b = atob(s); for (let i = 0; i < Math.min(b.length, explored.length); i++) explored[i] = b.charCodeAt(i); }
  for (const n of JSON.parse(localStorage.getItem(FOUND_KEY) || '[]')) found.add(n);
  found.add('Dry Gulch');
} catch (e) {}
function saveExplored() {
  try {
    let s = ''; for (let i = 0; i < explored.length; i += 4096) s += String.fromCharCode.apply(null, explored.subarray(i, i + 4096));
    localStorage.setItem(EX_KEY, btoa(s)); localStorage.setItem(FOUND_KEY, JSON.stringify([...found]));
  } catch (e) {}
}
const exIdx = (x, z) => { const i = Math.floor((x + W.HALF) / EXK), j = Math.floor((z + W.HALF) / EXK); return i < 0 || j < 0 || i >= EXN || j >= EXN ? -1 : j * EXN + i; };
const isExplored = (x, z) => { const k = exIdx(x, z); return k >= 0 && explored[k] > 0; };
function explore() {
  // you can see about a square around you; from the train or in survey flight, a little further
  const r = player.fly ? 3 : player.onTrain ? 2 : 1, ci = Math.floor((player.pos.x + W.HALF) / EXK), cj = Math.floor((player.pos.z + W.HALF) / EXK);
  let changed = false;
  for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    if (di * di + dj * dj > r * r + 1) continue;
    const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= EXN || j >= EXN) continue;
    if (!explored[j * EXN + i]) { explored[j * EXN + i] = 1; changed = true; }
  }
  if (changed) { mapDirty = true; if ((exSaveT -= 1) <= 0) { exSaveT = 10; saveExplored(); } }
}
function placeOf(name) {
  const t = W.TOWNS.find(t => t.name === name); if (t) { const [x, z] = W.townToWorld(t, t.crossA + 6, t.streetB || 14); return { kind: 'town', x, z, t }; }
  const s = W.SITES.find(s => s.name === name); if (s) return { kind: 'site', x: s.x + s.r + 6, z: s.z, s };
  const b = W.LANDMARKS.find(b => b.name === name); if (b) return { kind: 'landmark', x: b.x + b.r + 20, z: b.z, b };
  return null;
}
// the coarse picture of the whole territory, sampled once while loading
const MAPS = 256;
async function buildMinimap(progressFn) {
  const c = document.createElement('canvas'); c.width = c.height = MAPS; const g = c.getContext('2d'), img = g.createImageData(MAPS, MAPS);
  const k = W.WORLD / MAPS, col = [0, 0, 0], hs = new Float32Array(MAPS + 1);
  for (let j = 0; j < MAPS; j++) {
    for (let i = 0; i < MAPS; i++) {
      const x = -W.HALF + (i + 0.5) * k, z = -W.HALF + (j + 0.5) * k, s = W.sampleAt(x, z), h = s.h;
      const sh = (h - (i ? hs[i - 1] : h)) * 0.012 + (h - hs[i]) * 0.012; hs[i] = h;
      const o = (j * MAPS + i) * 4;
      if (s.wl > h) { const sw = s.w[2] > 0.3; col[0] = s.ice ? 0.82 : sw ? 0.38 : 0.42; col[1] = s.ice ? 0.88 : sw ? 0.45 : 0.56; col[2] = s.ice ? 0.94 : sw ? 0.36 : 0.66; }
      else W.groundColor(s, 0.1, x, z, col, true);
      const f = 1 + Math.max(-0.35, Math.min(0.35, sh));
      // old survey paper: colours washed towards parchment
      img.data[o] = (col[0] * 255 * 0.7 + 230 * 0.3) * f; img.data[o + 1] = (col[1] * 255 * 0.7 + 214 * 0.3) * f; img.data[o + 2] = (col[2] * 255 * 0.7 + 176 * 0.3) * f; img.data[o + 3] = 255;
    }
    if (j % 8 === 7) { progressFn && progressFn(j / MAPS); await frame(); }
  }
  g.putImageData(img, 0, 0);
  mapImg = c;
  RAILPTS.length = 0; for (let q = 0; q <= W.rail.N; q += Math.max(1, Math.round(20 / W.rail.ds))) RAILPTS.push([W.rail.x[q], W.rail.z[q]]);
  const list = $('places');
  const big = $('bigmap');
  big.width = big.height = 1024;
  big.addEventListener('click', e => {
    const r = big.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width * W.WORLD - W.HALF, z = (e.clientY - r.top) / r.height * W.WORLD - W.HALF;
    if (!isExplored(x, z)) { toast('You have not been there yet'); return; }
    go(x, z, 'Somewhere out there');
  });
  list.addEventListener('click', e => { const b = e.target.closest('button[data-place]'); if (!b) return; const P = placeOf(b.dataset.place); if (P) go(P.x, P.z, b.dataset.place); });
}
const RAILPTS = [];
function go(x, z, name) {
  if (game && game.riding) game.horses.dismount();
  player.seated = false; player.perch = null; player.onTrain = false; player.trainLocal = null; player.fly = false; player.vel.set(0, 0, 0);
  player.pos.set(x, groundAt(x, z, W.heightAt(x, z) + 2) + 0.05, z);
  toggleMap(false); post.resetMotion(); toast(name, true); currentLoc = name;
}
// full map: parchment where unexplored, the survey where you have been, the line, and every place you have found
function drawBigMap() {
  const big = $('bigmap'), bg = big.getContext('2d'), S = 1024, k = S / W.WORLD;
  bg.fillStyle = '#d8c7a0'; bg.fillRect(0, 0, S, S);
  bg.drawImage(mapImg, 0, 0, S, S);
  if (!fogImg) { fogImg = document.createElement('canvas'); fogImg.width = fogImg.height = EXN; }
  const fg = fogImg.getContext('2d'), fd = fg.createImageData(EXN, EXN);
  for (let q = 0; q < explored.length; q++) { const o = q * 4; fd.data[o] = 214; fd.data[o + 1] = 196; fd.data[o + 2] = 156; fd.data[o + 3] = explored[q] ? 0 : 255; }
  fg.putImageData(fd, 0, 0);
  bg.imageSmoothingEnabled = true; bg.drawImage(fogImg, 0, 0, S, S);
  // hatched edge of the unknown
  bg.globalAlpha = 0.18; bg.strokeStyle = '#6a4a2a'; bg.lineWidth = 1;
  for (let a = -S; a < S; a += 9) { bg.beginPath(); bg.moveTo(a, 0); bg.lineTo(a + S, S); bg.stroke(); }
  bg.globalAlpha = 1;
  // redraw the explored ground over the hatching
  bg.save(); bg.beginPath();
  for (let j = 0; j < EXN; j++) for (let i = 0; i < EXN; i++) if (explored[j * EXN + i]) bg.rect(i * S / EXN, j * S / EXN, S / EXN + 0.5, S / EXN + 0.5);
  bg.clip(); bg.drawImage(mapImg, 0, 0, S, S); bg.restore();
  // the railroad is on every map; it is the one thing everyone knows
  bg.strokeStyle = 'rgba(40,20,10,0.9)'; bg.lineWidth = 2; bg.setLineDash([5, 3]);
  bg.beginPath(); RAILPTS.forEach(([x, z], q) => { const px = (x + W.HALF) * k, pz = (z + W.HALF) * k; q ? bg.lineTo(px, pz) : bg.moveTo(px, pz); }); bg.stroke(); bg.setLineDash([]);
  bg.font = 'italic 600 15px "Iowan Old Style", Palatino, Georgia, serif'; bg.textAlign = 'center';
  const label = (txt, x, z, col, dot) => {
    const px = (x + W.HALF) * k, pz = (z + W.HALF) * k;
    bg.fillStyle = col; if (dot === 'sq') bg.fillRect(px - 3, pz - 3, 6, 6); else { bg.beginPath(); bg.arc(px, pz, 3, 0, 7); bg.fill(); }
    const w = bg.measureText(txt).width; bg.fillStyle = 'rgba(244,234,210,0.78)'; bg.fillRect(px - w / 2 - 4, pz - 25, w + 8, 18); bg.fillStyle = col; bg.fillText(txt, px, pz - 11);
  };
  for (const t of W.TOWNS) { if (found.has(t.name)) label(t.name, t.cx, t.cz, '#6e1f0e', 'sq'); else { bg.fillStyle = 'rgba(110,31,14,0.55)'; bg.fillRect((t.cx + W.HALF) * k - 2, (t.cz + W.HALF) * k - 2, 4, 4); } }
  for (const s of W.SITES) if (found.has(s.name)) label(s.name, s.x, s.z, '#2b3a26');
  for (const b of W.LANDMARKS) if (found.has(b.name)) label(b.name, b.x, b.z, '#5a3a20');
  if (objTarget) { const px = (objTarget.x + W.HALF) * k, pz = (objTarget.z + W.HALF) * k; bg.save(); bg.translate(px, pz); bg.fillStyle = '#e0b040'; bg.strokeStyle = '#2a1608'; bg.lineWidth = 2; bg.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 6 : 14, a = i / 10 * Math.PI * 2 - Math.PI / 2; bg.lineTo(Math.cos(a) * r, Math.sin(a) * r); } bg.closePath(); bg.fill(); bg.stroke(); bg.restore(); label('Next: ' + objTarget.name, objTarget.x, objTarget.z + 900, '#6e1f0e'); }
  // region names across explored country
  bg.font = '700 13px ui-monospace, Menlo, monospace'; bg.fillStyle = 'rgba(60,35,15,0.55)';
  for (const [name, x] of [['BAYOU', -13000], ['PINE FOREST', -7000], ['DESERT', 0], ['BADLANDS', 6500], ['SNOWY MOUNTAINS', 12200]]) bg.fillText(name, (x + W.HALF) * k, (W.HALF + 3600) * k);
  mapDirty = false;
  // the list of places you can travel to
  const list = $('places'), groups = [['Towns & stations', W.TOWNS.map(t => t.name)], ['Places found', W.SITES.map(s => s.name)], ['Landmarks', W.LANDMARKS.map(b => b.name)]];
  const all = W.TOWNS.length + W.SITES.length + W.LANDMARKS.length;
  let html = `<div class="count">${found.size} of ${all} places discovered</div>`;
  for (const [h, names] of groups) {
    const f = names.filter(n => found.has(n)); if (!f.length) continue;
    html += `<h4>${h}</h4>` + f.map(n => `<button data-place="${n.replace(/"/g, '&quot;')}">${n}</button>`).join('');
  }
  const keep = list.querySelector('#trainBtn'); list.innerHTML = html; if (keep) list.prepend(keep);
}
function toggleMap(force) {
  const el = $('mapwrap'), open = force === undefined ? !el.classList.contains('open') : force;
  if (open) drawBigMap();
  el.classList.toggle('open', open);
  if (open && document.pointerLockElement) document.exitPointerLock();
}
const mm = $('minimap'), mg = mm.getContext('2d');
function drawMinimap() {
  if (!mapImg) return;
  const S = mm.width, span = 900, px = S / span; // metres across the minimap
  const cx = player.pos.x, cz = player.pos.z, x0 = cx - span / 2, z0 = cz - span / 2;
  mg.save(); mg.clearRect(0, 0, S, S); mg.beginPath(); mg.arc(S / 2, S / 2, S / 2 - 2, 0, 7); mg.clip();
  // coarse survey underneath, sharp tile pictures on top wherever the ground is loaded
  const k = MAPS / W.WORLD;
  mg.imageSmoothingEnabled = true;
  mg.drawImage(mapImg, (x0 + W.HALF) * k, (z0 + W.HALF) * k, span * k, span * k, 0, 0, S, S);
  const i0 = Math.floor((x0 + W.HALF) / W.TILE), i1 = Math.floor((x0 + span + W.HALF) / W.TILE), j0 = Math.floor((z0 + W.HALF) / W.TILE), j1 = Math.floor((z0 + span + W.HALF) / W.TILE);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const t = W.TILES.get(W.tkey(i, j)); if (!t || !t.img) continue;
    mg.drawImage(t.img, (t.x0 - x0) * px, (t.z0 - z0) * px, W.TILE * px + 0.6, W.TILE * px + 0.6);
  }
  mg.strokeStyle = 'rgba(40,20,10,0.85)'; mg.lineWidth = 2; mg.setLineDash([4, 3]); mg.beginPath();
  let pen = false;
  for (const [x, z] of RAILPTS) { const inR = Math.abs(x - cx) < span * 0.75 && Math.abs(z - cz) < span * 0.75; if (!inR) { pen = false; continue; } const sx = (x - x0) * px, sy = (z - z0) * px; pen ? mg.lineTo(sx, sy) : mg.moveTo(sx, sy); pen = true; }
  mg.stroke(); mg.setLineDash([]);
  if (train) {
    const sx = (train.root.position.x - x0) * px, sy = (train.root.position.z - z0) * px;
    mg.fillStyle = '#1f2a33'; mg.strokeStyle = '#f4ead2'; mg.lineWidth = 2;
    mg.beginPath(); mg.arc(sx, sy, 6, 0, 7); mg.fill(); mg.stroke();
  }
  // a merchant's wagon by the line: a brass coin, on the rim when it is further off
  if (game && game.merchants) for (const m of game.merchants.markers()) {
    let sx = (m.x - x0) * px, sy = (m.z - z0) * px; const dx = sx - S / 2, dy = sy - S / 2, d = Math.hypot(dx, dy), R0 = S / 2 - 12;
    if (d > R0) { sx = S / 2 + dx / d * R0; sy = S / 2 + dy / d * R0; }
    mg.fillStyle = '#c9a04a'; mg.strokeStyle = '#2a1608'; mg.lineWidth = 2; mg.beginPath(); mg.arc(sx, sy, 7, 0, 7); mg.fill(); mg.stroke();
    mg.fillStyle = '#2a1608'; mg.font = 'bold 10px Georgia, serif'; mg.textAlign = 'center'; mg.fillText('$', sx, sy + 3.5);
  }
  // where the journey points next: a gold star, or an arrow on the rim when it is further off
  if (objTarget) {
    let sx = (objTarget.x - x0) * px, sy = (objTarget.z - z0) * px; const dx = sx - S / 2, dy = sy - S / 2, d = Math.hypot(dx, dy), R0 = S / 2 - 14;
    const edge = d > R0; if (edge) { sx = S / 2 + dx / d * R0; sy = S / 2 + dy / d * R0; }
    mg.save(); mg.translate(sx, sy); mg.fillStyle = '#e0b040'; mg.strokeStyle = '#2a1608'; mg.lineWidth = 2;
    mg.beginPath();
    if (edge) { mg.rotate(Math.atan2(dy, dx)); mg.moveTo(10, 0); mg.lineTo(-7, -7); mg.lineTo(-3, 0); mg.lineTo(-7, 7); }
    else for (let i = 0; i < 10; i++) { const r = i % 2 ? 4.5 : 10, a = i / 10 * Math.PI * 2 - Math.PI / 2; mg.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    mg.closePath(); mg.fill(); mg.stroke(); mg.restore();
  }
  mg.translate(S / 2, S / 2); mg.rotate(-player.yaw);
  mg.fillStyle = '#a2401f'; mg.strokeStyle = '#f4ead2'; mg.lineWidth = 1.5;
  mg.beginPath(); mg.moveTo(0, -9); mg.lineTo(6, 7); mg.lineTo(0, 3); mg.lineTo(-6, 7); mg.closePath(); mg.fill(); mg.stroke();
  mg.restore();
  if ($('mapwrap').classList.contains('open')) {
    const pm = $('pmark'), b = $('bigmap').getBoundingClientRect();
    pm.style.left = ((player.pos.x + W.HALF) / W.WORLD * b.width) + 'px'; pm.style.top = ((player.pos.z + W.HALF) / W.WORLD * b.height) + 'px';
    pm.style.transform = `translate(-50%,-50%) rotate(${-player.yaw}rad)`;
  }
}

// ---------- sound: wind, creaks, coyotes, music; every source runs through a volume channel ----------
const BUSES = { music: 'vMusic', env: 'vEnv', train: 'vTrain', weapons: 'vWeapons', enemy: 'vEnemy', ui: 'vUi' };
const audio = {
  ctx: null, master: null, bus: null, windGain: null, filt: null, howlT: 20, creakT: 8, musicT: 6,
  caption: k => Menus.caption(k),
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const c = this.ctx, len = c.sampleRate * 4, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    this.master = c.createGain(); this.master.connect(c.destination);
    this.bus = {}; for (const k in BUSES) { const g = c.createGain(); g.connect(this.master); this.bus[k] = g; }
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    this.filt = c.createBiquadFilter(); this.filt.type = 'bandpass'; this.filt.frequency.value = 380; this.filt.Q.value = 0.7;
    this.windGain = c.createGain(); this.windGain.gain.value = 0.0;
    src.connect(this.filt).connect(this.windGain).connect(this.bus.env); src.start();
    this.setVolumes();
  },
  setVolumes() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(S.mute ? 0 : S.vMaster / 100, t0, 0.05);
    for (const k in BUSES) this.bus[k].gain.setTargetAtTime(S[BUSES[k]] / 100, t0, 0.05);
  },
  // short effects for looting and using things
  sfx(kind, vol = 1, pan = 0, x) {
    if (!this.ctx) return;
    if (kind === 'gun') return x === 'zap' ? this.zap(1, 0) : this.gunshot('weapons', x);
    if (kind === 'egun') return this.gunshot('enemy', x, vol, pan);
    if (kind === 'zap') return this.zap(vol, pan);
    if (kind === 'bell') return this.bell();
    if (kind === 'callwhistle') return this.callWhistle();
    if (kind === 'sting') return this.sting();
    if (kind === 'shout') return this.groan(vol * 0.8, pan, 2.1);
    if (kind === 'groan') return this.groan(vol, pan, x || 1);
    if (kind === 'zvoice') return this.zvoice(vol, pan, x || 'moan');
    if (kind === 'zstep') return this.zstep(vol, pan, x || 'thud');
    if (kind === 'boom') return this.boom(vol);
    const c = this.ctx, t = c.currentTime, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    const P = {
      open: [700, 4, 0.12, 0.35], pick: [2400, 2, 0.1, 0.08], use: [1100, 1.5, 0.08, 0.25], stoke: [380, 0.8, 0.22, 0.6],
      thud: [220, 1.2, 0.5, 0.18], swish: [1800, 0.7, 0.12, 0.2], dry: [3200, 6, 0.12, 0.05], reload: [1400, 3, 0.14, 0.3], fuse: [4200, 1, 0.08, 1.2],
    }[kind] || [1000, 1, 0.1, 0.2];
    src.buffer = this.noise(); f.type = 'bandpass'; f.frequency.value = P[0]; f.Q.value = P[1];
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(P[2], t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + P[3]);
    const bus = ['thud', 'swish', 'dry', 'reload', 'fuse'].includes(kind) ? 'weapons' : 'ui';
    src.connect(f).connect(g).connect(this.bus[bus]); src.start(t); src.stop(t + P[3] + 0.05);
    if (kind === 'reload') for (const k of [0.35, 0.7]) { const s2 = c.createBufferSource(), g2 = c.createGain(), f2 = c.createBiquadFilter(); s2.buffer = this.noise(); f2.type = 'bandpass'; f2.frequency.value = 2600; f2.Q.value = 8; g2.gain.setValueAtTime(0.0001, t + k); g2.gain.exponentialRampToValueAtTime(0.2, t + k + 0.005); g2.gain.exponentialRampToValueAtTime(0.0001, t + k + 0.06); s2.connect(f2).connect(g2).connect(this.bus.weapons); s2.start(t + k); s2.stop(t + k + 0.08); }
    if (kind === 'open') { this.creak(); this.caption('cap_open'); }
    if (kind === 'stoke') this.caption('cap_stoke');
  },
  // electric crackle: a burst of high noise with a fast stutter
  zap(vol = 1, pan = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, src = c.createBufferSource(), hp = c.createBiquadFilter(), g = c.createGain(), pn = c.createStereoPanner();
    src.buffer = this.noise(); hp.type = 'highpass'; hp.frequency.value = 1800; pn.pan.value = pan;
    g.gain.setValueAtTime(0, t); for (let i = 0; i < 9; i++) g.gain.setValueAtTime((i % 2 ? 0.05 : 0.5) * vol, t + i * 0.025); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    src.connect(hp).connect(g).connect(pn).connect(this.bus.weapons); src.start(t); src.stop(t + 0.45);
  },
  // a church bell: a struck partial series that rings out
  bell() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    for (const [f, a, d] of [[220, 0.25, 5], [440, 0.12, 3.5], [528, 0.1, 3], [660, 0.06, 2.4], [880, 0.04, 1.6]]) {
      const o = c.createOscillator(), g = c.createGain(); o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(this.bus.env); o.start(t); o.stop(t + d + 0.05);
    }
    this.caption('cap_bell');
  },
  // two fingers in the mouth: a rising whistle and a falling one, to call your horse
  callWhistle() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    for (const [t0, f0, f1] of [[0, 1500, 2600], [0.32, 2500, 1700]]) {
      const o = c.createOscillator(), g = c.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(f0, t + t0); o.frequency.exponentialRampToValueAtTime(f1, t + t0 + 0.24);
      g.gain.setValueAtTime(0.0001, t + t0); g.gain.exponentialRampToValueAtTime(0.16, t + t0 + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + t0 + 0.28);
      o.connect(g).connect(this.bus.ui); o.start(t + t0); o.stop(t + t0 + 0.3);
    }
  },
  // a low brass-like stab for a boss arriving or falling
  sting() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    for (const f of [55, 82.5, 110, 116.5]) {
      const o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.setValueAtTime(300, t); lp.frequency.linearRampToValueAtTime(1400, t + 0.3); lp.frequency.exponentialRampToValueAtTime(200, t + 2.2);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      o.connect(lp).connect(g).connect(this.bus.music); o.start(t); o.stop(t + 2.5);
    }
  },
  // a zombie's moan: louder when close, panned to where it is, deeper for the big ones
  groan(vol, pan, pitch) {
    if (vol < 0.03) return;
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), bp = c.createBiquadFilter(), p = c.createStereoPanner(), lfo = c.createOscillator(), lg = c.createGain();
    const f = (70 + Math.random() * 40) * pitch, dur = 0.9 + Math.random() * 0.8;
    o.type = 'sawtooth'; o2.type = 'square'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 1.35, t + dur * 0.4); o.frequency.linearRampToValueAtTime(f * 0.8, t + dur);
    o2.frequency.value = f * 0.5; bp.type = 'bandpass'; bp.frequency.value = 520 * pitch; bp.Q.value = 3;
    lfo.frequency.value = 9 + Math.random() * 8; lg.gain.value = 0.35; lfo.connect(lg).connect(g.gain);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16 * vol, t + 0.15); g.gain.linearRampToValueAtTime(0, t + dur);
    p.pan.value = pan;
    const g2 = c.createGain(); g2.gain.value = 0.4; o2.connect(g2).connect(bp); o.connect(bp).connect(g).connect(p).connect(this.bus.enemy);
    o.start(t); o2.start(t); lfo.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    if (vol > 0.25) this.caption('cap_enemy');
  },
  // each kind of dead has its own voice. v: moan | shriek | roar | hiss | rattle | crackle | clank | drawl | bellow |
  // cough | gurgle, with ':atk' for the snarl as it strikes (shorter, harder, higher)
  // [pitch Hz, formant Hz, Q, seconds, glide up, glide down, breath (noise share), flutter Hz, flutter depth, syllables]
  zvoice(vol, pan, v) {
    if (vol < 0.03) return;
    const atk = v.endsWith(':atk'), kind = atk ? v.slice(0, -4) : v;
    const V = {
      moan: [80, 520, 3, 1.4, 1.35, 0.8, 0.15, 9, 0.3, 1], shriek: [360, 1900, 5, 0.65, 1.8, 0.7, 0.35, 22, 0.2, 1],
      roar: [44, 320, 1.4, 1.5, 1.5, 0.7, 0.55, 30, 0.35, 1], hiss: [0, 3400, 1, 0.8, 1, 1, 1, 0, 0, 1],
      rattle: [95, 760, 2.5, 1.1, 1.1, 0.9, 0.3, 26, 0.85, 1], crackle: [72, 460, 2, 1.2, 1.2, 0.8, 0.5, 14, 0.4, 1],
      clank: [70, 480, 3, 1.2, 1.3, 0.8, 0.15, 8, 0.3, 1], drawl: [96, 600, 3, 1.5, 1.25, 0.75, 0.12, 6, 0.2, 2],
      bellow: [58, 400, 2.2, 1.7, 1.4, 0.75, 0.25, 7, 0.25, 1], cough: [110, 650, 1.5, 0.9, 1, 0.8, 0.8, 0, 0, 3],
      gurgle: [68, 380, 4, 1.3, 1.2, 0.8, 0.3, 13, 0.7, 1],
    }[kind] || [80, 520, 3, 1.4, 1.35, 0.8, 0.15, 9, 0.3, 1];
    const c = this.ctx, t = c.currentTime, p = c.createStereoPanner(), out = c.createGain();
    const dur = V[3] * (atk ? 0.45 : 0.85 + Math.random() * 0.3), up = atk ? 1.25 : 1, f = V[0] * (0.88 + Math.random() * 0.24) * up;
    p.pan.value = pan; out.gain.value = vol * (atk ? 1.3 : 1); out.connect(p).connect(this.bus.enemy);
    const env = (g, a, t0, d) => { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(a, t0 + Math.min(0.08, d * 0.15)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d); };
    const syl = V[9], sd = dur / syl;
    for (let s = 0; s < syl; s++) {
      const t0 = t + s * sd * (kind === 'cough' ? 1.1 : 1), d = sd * (kind === 'cough' ? 0.5 : 0.95), bp = c.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = V[1] * up * (s ? 0.9 : 1); bp.Q.value = V[2]; bp.connect(out);
      if (V[0]) {
        // the voice: a buzzing throat with the pitch sliding up then down, and a flutter for rattles and gurgles
        const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), g2 = c.createGain();
        o.type = 'sawtooth'; o2.type = 'square'; const fs = f * (s ? 0.85 : 1);
        o.frequency.setValueAtTime(fs, t0); o.frequency.linearRampToValueAtTime(fs * V[4], t0 + d * 0.35); o.frequency.linearRampToValueAtTime(fs * V[5], t0 + d);
        o2.frequency.value = fs * 0.5; g2.gain.value = 0.35;
        env(g, 0.16 * (1 - V[6] * 0.5), t0, d);
        if (V[7]) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = V[7] * (0.85 + Math.random() * 0.3); lg.gain.value = V[8] * 0.16; l.connect(lg).connect(g.gain); l.start(t0); l.stop(t0 + d + 0.05); }
        o.connect(g); o2.connect(g2).connect(g); g.connect(bp);
        o.start(t0); o2.start(t0); o.stop(t0 + d + 0.05); o2.stop(t0 + d + 0.05);
      }
      if (V[6]) {
        // breath: rasping noise through the same mouth (all of a hiss, most of a cough)
        const n = c.createBufferSource(), ng = c.createGain(), hp = c.createBiquadFilter(); n.buffer = this.noise(); n.loop = true;
        hp.type = 'highpass'; hp.frequency.value = kind === 'hiss' ? 2200 : 250; env(ng, 0.2 * V[6], t0, d);
        n.connect(hp).connect(ng).connect(bp); n.start(t0); n.stop(t0 + d + 0.05);
      }
    }
    // the burnt pop and spit as they come; the armoured ring as they move
    if (kind === 'crackle') for (let i = 0; i < 6; i++) { const k = t + Math.random() * dur; this.tick(k, 2600 + Math.random() * 2400, 0.12 * vol, out); }
    if (kind === 'clank') this.zstep(vol * 0.6, pan, 'clank');
    if (vol > 0.25) this.caption('cap_enemy');
  },
  // a short click of filtered noise at time k into node n
  tick(k, fq, a, n) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise(); f.type = 'bandpass'; f.frequency.value = fq; f.Q.value = 6;
    g.gain.setValueAtTime(0.0001, k); g.gain.exponentialRampToValueAtTime(a, k + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, k + 0.04);
    s.connect(f).connect(g).connect(n); s.start(k); s.stop(k + 0.06);
  },
  // heavy footfalls: thud (a brute's weight), clank (plate armour), ping (a blow glancing off armour)
  zstep(vol, pan, v) {
    if (!this.ctx || vol < 0.03) return;
    const c = this.ctx, t = c.currentTime, p = c.createStereoPanner(); p.pan.value = pan; p.connect(this.bus.enemy);
    if (v === 'thud') {
      const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.2);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g).connect(p); o.start(t); o.stop(t + 0.3);
      this.tick(t, 300, 0.25 * vol, p);
      return;
    }
    // metal: a few inharmonic partials struck together
    const parts = v === 'ping' ? [[1850, 0.12, 0.5], [2930, 0.07, 0.35], [4410, 0.04, 0.25]] : [[620, 0.07, 0.18], [1170, 0.05, 0.14], [1730, 0.03, 0.1]];
    for (const [fq, a, d] of parts) {
      const o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.value = fq * (0.97 + Math.random() * 0.06);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a * vol * 2, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(p); o.start(t); o.stop(t + d + 0.02);
    }
    this.tick(t, v === 'ping' ? 5000 : 1800, 0.2 * vol, p);
  },
  boom(vol = 1) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, src = c.createBufferSource(), lp = c.createBiquadFilter(), g = c.createGain(), o = c.createOscillator(), og = c.createGain();
    src.buffer = this.noise(); src.loop = true; lp.type = 'lowpass'; lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(60, t + 2.2);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9 * vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(25, t + 0.8); og.gain.setValueAtTime(0.8 * vol, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    src.connect(lp).connect(g).connect(this.bus.weapons); o.connect(og).connect(this.bus.weapons); src.start(t); src.stop(t + 2.5); o.start(t); o.stop(t + 1);
    this.caption('cap_boom');
  },
  click() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.05);
    g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g).connect(this.bus.ui); o.start(t); o.stop(t + 0.08);
  },
  noise() {
    if (this._nb) return this._nb;
    const c = this.ctx, n = c.sampleRate * 0.5, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return (this._nb = b);
  },
  // bw: biome weights where you stand, wx: the weather shown, alt: height above the datum
  update(ws, night, dt, bw, wx, alt = 0, at = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, snow = bw ? bw[SNOW] : 0, rain = wx ? Math.min(1, wx.rain) : 0;
    const roof = !!(at && at.sheltered && !(at.under > 0.5)), under = at ? at.under : 0, gale = wx ? Math.max(0, Math.min(1, wx.wind - 1)) : 0;
    const sand = wx ? Math.min(1, wx.dust) : 0, wet = at ? at.wetness : 0;
    // mountain wind is deeper and stronger, and climbs with height; indoors and underground it's muffled
    const hi = snow * Math.min(1, Math.max(0, (alt - 250) / 400)), inside = roof ? 0.45 : 1 - under * 0.8;
    this.windGain.gain.setTargetAtTime((0.18 + ws * 0.35 + snow * 0.12 + hi * 0.2) * inside, t, 0.5);
    this.filt.frequency.setTargetAtTime((260 + ws * 420 - snow * 120) * (roof ? 0.6 : 1), t, 0.8);
    if (!this.rainGain) this.rainLoop();
    // light rain is a soft high patter, heavy rain adds a deep roar; under a roof you hear it drumming overhead instead
    const outK = roof ? 0.25 : 1 - under;
    this.rainGain.gain.setTargetAtTime(rain * 0.26 * outK, t, 1.2);
    this.roarGain.gain.setTargetAtTime(rain * rain * 0.3 * outK, t, 1.5);
    this.roofGain.gain.setTargetAtTime(roof ? rain * 0.42 : 0, t, 0.6);
    // gales whistle round you in storms and blizzards; a sandstorm hisses with grit
    this.galeGain.gain.setTargetAtTime(gale * 0.12 * inside, t, 1);
    this.galeF.frequency.setTargetAtTime(700 + Math.sin(t * 0.37) * 260 + Math.sin(t * 1.3) * 120 + ws * 160, t, 0.3);
    this.gritGain.gain.setTargetAtTime(sand * sand * 0.09 * inside, t, 1);
    // after the rain: water dripping off roofs and branches
    this.dripT = (this.dripT ?? 1) - dt;
    if (this.dripT < 0) { this.dripT = 0.25 + Math.random() * 1.2 / Math.max(0.15, wet); if (wet > 0.3 && rain < 0.15 && under < 0.5) this.tone('sine', 1300 + Math.random() * 1400, 500 + Math.random() * 300, 0.07, 0.012 + wet * 0.02); }
    this.howlT -= dt; this.creakT -= dt; this.musicT -= dt;
    // coyotes are desert and badlands animals; the forest has owls instead
    const open = bw ? bw[DESERT] + bw[BADLANDS] : 1;
    if (night > 0.6 && this.howlT < 0) { this.howlT = 25 + Math.random() * 45; if (open > 0.4) this.howl(); else if (bw && bw[FOREST] > 0.4) this.owl(); }
    if (this.creakT < 0) { this.creakT = 6 + Math.random() * 14; if (currentLoc) this.creak(); }
    if (this.musicT < 0) { this.musicT = 22 + Math.random() * 30; if (S.vMusic > 0 && !S.mute) this.phrase(night); }
    if (!bw) return;
    this.lifeT = (this.lifeT ?? 4) - dt;
    if (this.lifeT < 0) {
      this.lifeT = 2.5 + Math.random() * 6;
      const r = Math.random();
      if (bw[FOREST] > 0.35 && night < 0.5 && rain < 0.4 && r < bw[FOREST]) this.birds();
      else if (bw[SWAMP] > 0.35 && r < bw[SWAMP]) { if (night > 0.3 || Math.random() < 0.5) this.frogs(); else this.insects(); }
      else if (bw[BADLANDS] > 0.4 && night < 0.4 && r < bw[BADLANDS] * 0.35) this.hawk();
      else if (snow > 0.5 && r < 0.3) this.gust();
    }
  },
  rainLoop() {
    const c = this.ctx, src = c.createBufferSource(), hp = c.createBiquadFilter(), lp = c.createBiquadFilter();
    const n = c.sampleRate * 2, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (Math.random() < 0.002 ? 3 : 0.6);
    src.buffer = b; src.loop = true; hp.type = 'highpass'; hp.frequency.value = 900; lp.type = 'lowpass'; lp.frequency.value = 6500;
    this.rainGain = c.createGain(); this.rainGain.gain.value = 0;
    src.connect(hp).connect(lp).connect(this.rainGain).connect(this.bus.env); src.start();
    // the roar of a downpour: the same hiss, low and full
    const roar = c.createBufferSource(), rl = c.createBiquadFilter(); roar.buffer = this.noise(); roar.loop = true; rl.type = 'lowpass'; rl.frequency.value = 900;
    this.roarGain = c.createGain(); this.roarGain.gain.value = 0;
    roar.connect(rl).connect(this.roarGain).connect(this.bus.env); roar.start();
    // drumming on the roof overhead: big drops, heavy and dull through the boards
    const dn = c.sampleRate * 3, db = c.createBuffer(1, dn, c.sampleRate), dd = db.getChannelData(0);
    for (let i = 0; i < dn; i++) { dd[i] = (Math.random() * 2 - 1) * 0.15; if (Math.random() < 0.0015) for (let k = 0; k < 300 && i + k < dn; k++) dd[i + k] += Math.exp(-k / 60) * (Math.random() * 2 - 1) * 1.6; }
    const drum = c.createBufferSource(), dl = c.createBiquadFilter(); drum.buffer = db; drum.loop = true; dl.type = 'lowpass'; dl.frequency.value = 1500;
    this.roofGain = c.createGain(); this.roofGain.gain.value = 0;
    drum.connect(dl).connect(this.roofGain).connect(this.bus.env); drum.start();
    // a gale whistling, and blown sand hissing
    const gale = c.createBufferSource(); gale.buffer = this.noise(); gale.loop = true;
    this.galeF = c.createBiquadFilter(); this.galeF.type = 'bandpass'; this.galeF.frequency.value = 800; this.galeF.Q.value = 5;
    this.galeGain = c.createGain(); this.galeGain.gain.value = 0;
    gale.connect(this.galeF).connect(this.galeGain).connect(this.bus.env); gale.start();
    const grit = c.createBufferSource(), gh = c.createBiquadFilter(); grit.buffer = this.noise(); grit.loop = true; gh.type = 'highpass'; gh.frequency.value = 3800;
    this.gritGain = c.createGain(); this.gritGain.gain.value = 0;
    grit.connect(gh).connect(this.gritGain).connect(this.bus.env); grit.start();
  },
  // a short shaped tone through the environment channel
  tone(type, f0, f1, dur, vol, at = 0, bus = 'env') {
    const c = this.ctx, t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.03, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.bus[bus]); o.start(t); o.stop(t + dur + 0.05);
  },
  birds() { const n = 3 + Math.floor(Math.random() * 5), f = 2400 + Math.random() * 1800; for (let i = 0; i < n; i++) this.tone('sine', f * (1 + Math.random() * 0.2), f * (0.7 + Math.random() * 0.6), 0.08 + Math.random() * 0.1, 0.025, i * (0.1 + Math.random() * 0.12)); this.caption('cap_birds'); },
  frogs() { const n = 4 + Math.floor(Math.random() * 6), f = 90 + Math.random() * 90; for (let i = 0; i < n; i++) this.tone('square', f, f * 0.8, 0.09, 0.02, i * 0.22 + Math.random() * 0.05); this.caption('cap_frogs'); },
  insects() {
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = 4200 + Math.random() * 1500; lfo.frequency.value = 38; lg.gain.value = 0.006; lfo.connect(lg).connect(g.gain);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.008, t + 0.8); g.gain.linearRampToValueAtTime(0, t + 3);
    o.connect(g).connect(this.bus.env); o.start(t); lfo.start(t); o.stop(t + 3.1); lfo.stop(t + 3.1); this.caption('cap_insects');
  },
  hawk() { this.tone('sawtooth', 2600, 1500, 1.1, 0.02); this.tone('sine', 2700, 1600, 1.1, 0.03); this.caption('cap_hawk'); },
  owl() { this.tone('sine', 420, 380, 0.35, 0.05); this.tone('sine', 400, 360, 0.6, 0.05, 0.5); this.caption('cap_owl'); },
  gust() {
    const c = this.ctx, t = c.currentTime, src = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noise(); src.loop = true; bp.type = 'bandpass'; bp.Q.value = 6; bp.frequency.setValueAtTime(300, t); bp.frequency.linearRampToValueAtTime(700, t + 1.2); bp.frequency.linearRampToValueAtTime(250, t + 3);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 1); g.gain.linearRampToValueAtTime(0, t + 3);
    src.connect(bp).connect(g).connect(this.bus.env); src.start(t); src.stop(t + 3.1); this.caption('cap_wind');
  },
  // thunder arrives d seconds after the flash: a crack when close, a long low roll when far
  thunder(d) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + d, src = c.createBufferSource(), lp = c.createBiquadFilter(), g = c.createGain(), dur = 2.5 + d * 0.8;
    src.buffer = this.noise(); src.loop = true; lp.type = 'lowpass'; lp.frequency.setValueAtTime(d < 1.2 ? 1800 : 500, t); lp.frequency.exponentialRampToValueAtTime(90, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(d < 1.2 ? 0.6 : 0.35, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(lp).connect(g).connect(this.bus.env); src.start(t); src.stop(t + dur + 0.1);
    setTimeout(() => this.caption('cap_thunder'), d * 1000);
  },
  howl(bus = 'env') {
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter(), vib = c.createOscillator(), vg = c.createGain();
    o.type = 'sine'; lp.type = 'lowpass'; lp.frequency.value = 1400; vib.frequency.value = 6; vg.gain.value = 9;
    vib.connect(vg).connect(o.frequency);
    o.frequency.setValueAtTime(420, t); o.frequency.linearRampToValueAtTime(880, t + 0.9); o.frequency.linearRampToValueAtTime(760, t + 2.2); o.frequency.linearRampToValueAtTime(520, t + 3.0);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.5); g.gain.linearRampToValueAtTime(0.045, t + 2.2); g.gain.linearRampToValueAtTime(0, t + 3.1);
    o.connect(lp).connect(g).connect(this.bus[bus]); o.start(t); vib.start(t); o.stop(t + 3.2); vib.stop(t + 3.2);
    this.caption('cap_howl');
  },
  creak() {
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(), bp = c.createBiquadFilter();
    o.type = 'sawtooth'; bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 8;
    o.frequency.setValueAtTime(90, t); o.frequency.linearRampToValueAtTime(140, t + 0.6); o.frequency.linearRampToValueAtTime(70, t + 1.1);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.035, t + 0.15); g.gain.linearRampToValueAtTime(0, t + 1.1);
    o.connect(bp).connect(g).connect(this.bus.env); o.start(t); o.stop(t + 1.2);
    this.caption('cap_creak');
  },
  // a few slow plucked notes in A minor pentatonic, with a low drone after dark
  phrase(night = 0) {
    const c = this.ctx, scale = [110, 130.8, 146.8, 164.8, 196, 220, 261.6, 293.7, 329.6, 392];
    let tt = c.currentTime + 0.05, i = 3 + Math.floor(Math.random() * 4);
    const n = 5 + Math.floor(Math.random() * 5);
    for (let k = 0; k < n; k++) {
      i = Math.max(0, Math.min(scale.length - 1, i + Math.floor(Math.random() * 5) - 2));
      this.pluck(scale[i], tt, k === n - 1 ? 2.6 : 1.4);
      tt += [0.45, 0.6, 0.9, 1.2][Math.floor(Math.random() * 4)];
    }
    if (night > 0.5) {
      const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), t0 = c.currentTime;
      o.frequency.value = 55; o2.frequency.value = 82.4; o.type = o2.type = 'sine';
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.05, t0 + 3); g.gain.linearRampToValueAtTime(0, tt + 3);
      o.connect(g); o2.connect(g); g.connect(this.bus.music); o.start(t0); o2.start(t0); o.stop(tt + 3.2); o2.stop(tt + 3.2);
    }
    this.caption('cap_music');
  },
  pluck(hz, t, dur) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o.type = 'triangle'; o2.type = 'sawtooth'; o.frequency.value = hz; o2.frequency.value = hz * 2.003;
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(2600, t); lp.frequency.exponentialRampToValueAtTime(500, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const g2 = c.createGain(); g2.gain.value = 0.18; o2.connect(g2).connect(lp); o.connect(lp); lp.connect(g).connect(this.bus.music);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  },
  // each gun has its own voice: a sharp revolver crack, the rifle's long report, the shotgun's heavy boom
  gunshot(bus = 'weapons', kind = 'revolver', vol = 1, pan = 0) {
    const V = { revolver: [5000, 300, 0.7, 0.6, 140], rifle: [7000, 400, 0.85, 1.1, 120], shotgun: [3200, 160, 1, 0.9, 90] }[kind] || [5000, 300, 0.7, 0.6, 140];
    const c = this.ctx, t = c.currentTime, src = c.createBufferSource(), lp = c.createBiquadFilter(), g = c.createGain(), o = c.createOscillator(), og = c.createGain();
    src.buffer = this.noise(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(V[0], t); lp.frequency.exponentialRampToValueAtTime(V[1], t + 0.4);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(V[2], t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + V[3]);
    o.frequency.setValueAtTime(V[4], t); o.frequency.exponentialRampToValueAtTime(45, t + 0.25); og.gain.setValueAtTime(0.5, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    const out = c.createGain(), pn = c.createStereoPanner(); out.gain.value = vol; pn.pan.value = pan; out.connect(pn).connect(this.bus[bus]);
    src.connect(lp).connect(g).connect(out); o.connect(og).connect(out); src.start(t); src.stop(t + V[3] + 0.05); o.start(t); o.stop(t + 0.32);
    this.caption('cap_gun');
  },
  snarl() {
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(), bp = c.createBiquadFilter(), lfo = c.createOscillator(), lg = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(95, t); o.frequency.linearRampToValueAtTime(140, t + 0.5); o.frequency.linearRampToValueAtTime(80, t + 1.1);
    bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 2; lfo.frequency.value = 28; lg.gain.value = 0.08; lfo.connect(lg).connect(g.gain);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.1); g.gain.linearRampToValueAtTime(0, t + 1.2);
    o.connect(bp).connect(g).connect(this.bus.enemy); o.start(t); lfo.start(t); o.stop(t + 1.25); lfo.stop(t + 1.25);
    this.caption('cap_enemy');
  },
  // the Test buttons beside each volume slider
  test(cat) {
    this.start(); if (!this.ctx) return;
    if (cat === 'vMusic') this.phrase(0);
    else if (cat === 'vEnv') this.howl();
    else if (cat === 'vTrain') { if (train) train.whistle(); }
    else if (cat === 'vWeapons') this.gunshot();
    else if (cat === 'vEnemy') this.snarl();
    else if (cat === 'vUi') { this.click(); setTimeout(() => this.sfx('pick'), 120); this.caption('cap_chime'); }
  },
};

// the help panel always shows the player's current bindings
function renderHelp() {
  const k = id => `<kbd>${In.label(id)}</kbd>`;
  $('help').innerHTML = `${k('forward')}${k('left')}${k('back')}${k('right')} walk &nbsp; ${k('sprint')} run &nbsp; ${k('jump')} jump<br>
    ${k('crouch')} crouch &nbsp; ${k('flashlight')} lantern &nbsp; ${k('secondary')} zoom<br>
    ${k('interact')} search / use &nbsp; ${k('playerInv')} saddlebag &nbsp; ${k('hot1')}–${k('hot6')} hotbar<br>
    ${k('primary')} fire or swing the held weapon &nbsp; ${k('reload')} reload &nbsp; ${k('secondary')} aim<br>
    ${k('primary')} with firewood: campfire &nbsp; use a kit aboard the Jupiter to fit it<br>
    ${k('flight')} survey flight &nbsp; ${k('map')} map &nbsp; ${k('pause')} pause &amp; settings<br>
    ${k('hourBack')}${k('hourFwd')} shift the hour &nbsp; ${k('night')} dusk / midnight &nbsp; ${k('timeLapse')} time lapse<br>
    Jupiter: board via the cargo car steps, ${k('interact')} at the front-left seat &nbsp; ${k('help')} hide`;
  $('trainHud').querySelector('.tk').innerHTML = `${k('throttleUp')}${k('throttleDown')} throttle / reverse &nbsp; ${k('brake')} brake<br>${k('whistle')} whistle &nbsp; ${k('bell')} bell &nbsp; ${k('view')} outside view<br>${k('interact')} stand up`;
}

// ---------- applying settings ----------
const GFX = ['preset', 'resScale', 'shadows', 'textures', 'viewDist', 'aa', 'ao', 'motionBlur', 'particles', 'envDetail'];
const SHADOWS = { off: null, low: [1024, THREE.PCFShadowMap, 70], medium: [2048, THREE.PCFShadowMap, 110], high: [2048, THREE.PCFSoftShadowMap, 110], ultra: [4096, THREE.PCFSoftShadowMap, 150] };
let postOpts = { aa: 'msaa', ao: 0, blur: 0 };
function applySettings(keys) {
  const has = k => !keys || keys.includes(k);
  if (has('lang')) Menus.relabel();
  if (has('uiScale')) document.documentElement.style.setProperty('--ui', S.uiScale);
  if (has('showFps')) $('fps').style.display = S.showFps ? '' : 'none';
  if (has('crosshair')) $('cross').style.display = S.crosshair ? '' : 'none';
  if (has('showNames') && game) game.setNames(S.showNames);
  if (keys && has('fullscreen')) {
    if (S.fullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => { Menus.set('fullscreen', false); });
    else if (!S.fullscreen && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
  if (!keys || keys.some(k => k in S && (k[0] === 'v' && k !== 'viewDist' && k !== 'vsync' || k === 'mute'))) audio.setVolumes();
  if (!keys || keys.some(k => GFX.includes(k))) applyGraphics();
  if (keys && has('tooltips') && game) game.refreshUI();
  $('mute').textContent = S.mute ? 'Sound off' : 'Sound on';
  $('quality').textContent = 'Graphics: ' + t('o_' + S.preset);
  renderHelp();
}
function applyGraphics() {
  renderer.setPixelRatio(resolutionRatio(S.resScale)); renderer.setSize(innerWidth, innerHeight);
  const sh = SHADOWS[S.shadows] || null, sun = atmo.sun, wasOn = renderer.shadowMap.enabled, wasType = renderer.shadowMap.type;
  renderer.shadowMap.enabled = !!sh; sun.castShadow = !!sh;
  if (sh) {
    const [size, type, span] = sh;
    renderer.shadowMap.type = type;
    if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    const sc = sun.shadow.camera; sc.left = sc.bottom = -span; sc.right = sc.top = span; sc.updateProjectionMatrix(); atmo.shadowSpan = span * 2;
    renderer.shadowMap.needsUpdate = true;
  }
  // switching shadows on, off or to a different filter changes every lit shader
  if (wasOn !== renderer.shadowMap.enabled || wasType !== renderer.shadowMap.type) scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
  setTextureQuality(S.textures, renderer.capabilities.getMaxAnisotropy());
  viewK = S.viewDist; atmo.fogMul = 1 / Math.max(0.5, viewK);
  if (terrain) { terrain.setView(viewK); terrain.setLite(S.textures === 'low' || S.textures === 'medium'); }
  detailK = { low: 0.45, medium: 0.75, high: 1, ultra: 1.6 }[S.envDetail] || 1;
  atmo.setParticles(S.particles); tumbleN = { low: 5, medium: 9, high: 14 }[S.particles] || 14; if (train) train.setSmoke(S.particles);
  postOpts = { aa: S.aa, ao: S.ao ? 1 : 0, blur: { off: 0, low: 0.5, high: 1 }[S.motionBlur] || 0 };
}
Menus.onChange(applySettings);
document.addEventListener('fullscreenchange', () => { const fs = !!document.fullscreenElement; if (fs !== S.fullscreen) Menus.set('fullscreen', fs); });

// ---------- loop: V-Sync on follows the display; off renders as fast as it can; an optional frame cap on top ----------
let fpsAcc = 0, fpsN = 0, lastFrame = 0;
const carryM = new THREE.Matrix4(), prevBodyM = new THREE.Matrix4(), _bodyInv = new THREE.Matrix4();
let carryOK = false;
function schedule() { if (quitted) return; if (S.vsync) requestAnimationFrame(loop); else setTimeout(() => loop(performance.now()), 0); }
function loop(now) {
  if (S.fpsCap && now - lastFrame < 1000 / S.fpsCap - 0.5) { schedule(); return; }
  lastFrame = now;
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  // the world stands still in the menus unless other riders are sharing it
  const frozen = (paused || atMainMenu || Menus.noteOpen()) && started && alone();
  if (!frozen) { elapsed += dt; update(dt); }
  frameNo++;
  renderer.shadowMap.needsUpdate = renderer.shadowMap.enabled && (frameNo % 2 === 0 || (train && Math.abs(train.v) > 0.05));
  // aboard, the blur follows the car you stand in, so the cab around you stays sharp
  let carry = null;
  if (train && player.onTrain) {
    const m = train.bodyRoot(player.trainBody || 0).matrixWorld;
    if (carryOK) carry = carryM.copy(prevBodyM).multiply(_bodyInv.copy(m).invert());
    prevBodyM.copy(m); carryOK = true;
  } else carryOK = false;
  postOpts.carry = carry;
  post.render(scene, camera, postOpts);
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 1) {
    const fps = fpsN / fpsAcc; $('fps').textContent = Math.round(fps) + ' fps'; fpsAcc = 0; fpsN = 0;
    if (started && !frozen && fps < 28 && S.preset !== 'low') { if (++slowT >= 5) { slowT = 0; Menus.hint('slow'); } } else slowT = 0;
  }
  schedule();
}

// expose a small API for whoever adds trains and gameplay later
window.DeadRailsWorld = {
  scene, camera, renderer, world: W, rail: W.rail, railAt: W.railAt, railNearest, heightAt: W.heightAt,
  towns: W.TOWNS, sites: W.SITES, biomeAt: W.biomeAt, get weather() { return air; }, explored, found, colliders: COLLIDERS, circles: CIRCLES, setTimeOfDay: h => { tod = h; }, get train() { return train; },
  // marked places at Cinder Flats for shopkeepers, trading, refuelling, repairs and notice boards
  stationSpots: STATION_SPOTS, readables: READABLES, settings: S, bindings: In.binds,
};

init().catch(e => { console.error(e); $('status').textContent = 'Something went wrong: ' + e.message; });
