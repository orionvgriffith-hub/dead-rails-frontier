// Shared registry filled while the world is generated (no imports, so any module can use it)
export const LOOT_SPOTS = [];
const seen = new Set(), lootListeners = [];
// called for every spot registered after start-up (resource nodes on streamed ground)
export function onLoot(fn) { lootListeners.push(fn); }

// kinds: crate, barrel, sack, cabinet, shelf, chest, drawer, safe, locker, wagon, cart, minecart,
// and the resource nodes woodpile, orevein, herbs, snowcache, scrap
export function registerLoot(kind, x, y, z, ry = 0, extra = {}) {
  const id = `${kind}@${Math.round(x * 10)},${Math.round(z * 10)}`;
  if (seen.has(id)) return null;
  seen.add(id);
  const spot = Object.assign({ id, kind, x, y, z, ry }, extra);
  LOOT_SPOTS.push(spot);
  for (const f of lootListeners) f(spot);
  return spot;
}

// notices, timetables and maps a player can stop and read: { id, x, y, z, title, body }
export const READABLES = [];
export function registerReadable(o) { READABLES.push(Object.assign({ id: 'read' + READABLES.length }, o)); }
// marked places at stations for later systems (shopkeepers, trading, refuelling, repairs, notice boards)
export const STATION_SPOTS = [];
export function registerSpot(kind, x, y, z, extra = {}) { STATION_SPOTS.push(Object.assign({ kind, x, y, z }, extra)); }
// fires, stoves and shelters that warm a cold rider: r is the reach, heat the °C added (shelter: roof over your head)
export const HEAT_SPOTS = [];
export function registerHeat(x, y, z, r, heat, kind = 'fire') { const h = { x, y, z, r, heat, kind }; HEAT_SPOTS.push(h); return h; }
// levers, dials, doors and altars a player can work: { id, x, y, z, r, label(): string|null (null hides it), act() }
export const INTERACTS = [];
export function registerInteract(o) { INTERACTS.push(o); return o; }
// dug-out ground (labs, crypts): inside the rectangle the terrain is ignored and only built floors count. Axis aligned
export const UNDERGROUND = [];
export function registerUnderground(x0, z0, x1, z1, top, name) { const u = { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), top, name }; UNDERGROUND.push(u); return u; }
// stairwells (hole) win over the rooms round them
export const undergroundAt = (x, z) => { let f = null; for (const u of UNDERGROUND) if (x > u.x0 && x < u.x1 && z > u.z0 && z < u.z1) { if (u.hole) return u; f = f || u; } return f; };
// places that hurt: burning oil, gas, live current. { x, y, z, r, dps, kind, on: bool, until?: seconds since start }
export const HAZARDS = [];
export function registerHazard(o) { const h = Object.assign({ on: true }, o); HAZARDS.push(h); return h; }
// things a bullet can set off (oil barrels): { x, y, z, r, mesh, hp, onBreak() }
export const SHOOTABLES = [];
export function registerShootable(o) { SHOOTABLES.push(o); return o; }
// site encounters, filled in by the special places: { key, x, z, r, ... } (see story.js)
export const ENCOUNTERS = [];
export function registerEncounter(o) { ENCOUNTERS.push(o); return o; }
// what has happened at the special places (doors opened, dials set, bosses beaten, the story so far), kept in this
// browser. Read while the world is built, so opened doors stay open
// (its own key: the shared world's containers and train live under drw.world.v1, and the two must not overwrite each
// other. Progress saved there by an earlier build is picked up once.)
const WS_KEY = 'drw.story.v1', STORY_FIELDS = ['open', 'dial', 'cleared', 'flags', 'lore', 'placed'];
export const WORLD_STATE = (() => {
  const base = () => ({ open: {}, dial: {}, cleared: {}, flags: {}, lore: {}, placed: {}, horses: {} });
  try {
    let s = JSON.parse(localStorage.getItem(WS_KEY) || 'null');
    if (!s) { const old = JSON.parse(localStorage.getItem('drw.world.v1') || '{}') || {}; s = {}; for (const k of STORY_FIELDS) if (old[k]) s[k] = old[k]; }
    return Object.assign(base(), s);
  } catch (e) { return base(); }
})();
export function saveWorldState() { try { localStorage.setItem(WS_KEY, JSON.stringify(WORLD_STATE)); } catch (e) {} }
// filled in by the game once it is running (give items, start encounters, show messages), used by the places' levers
export const HOOKS = {};
// livery stables in the towns: { name, town, x, y, z, ry, post: [x, y, z], stall: [x, y, z], hand: [x, y, z] }
export const STABLES = [];
export function registerStable(o) { STABLES.push(o); return o; }
