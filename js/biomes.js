// The five regions of the territory: where each lies, its air, temperature and weather. No imports beyond noise,
// so world generation, the sky, sound and gameplay can all ask "what is it like here?"
import { makeNoise, fbm, smoothstep, lerp } from './noise.js';

export const DESERT = 0, FOREST = 1, SWAMP = 2, BADLANDS = 3, SNOW = 4;
export const BIOME_KEYS = ['desert', 'forest', 'swamp', 'badlands', 'snow'];

// west to east along the line: swamp · forest · (scrub) · desert · badlands · snowy mountains.
// Every border is a blend at least two kilometres wide and wanders with the noise, so nothing changes all at once.
const wn = makeNoise(9091);
export function biomeWeights(x, z, out) {
  const wx = x + 900 * fbm(wn, x * 0.00017 + 3.7, z * 0.00017 - 1.3, 3) + 0.05 * z;
  const f = smoothstep(-3500, -5600, wx), s = smoothstep(-9600, -11800, wx);
  const b = smoothstep(3200, 5200, wx), n = smoothstep(8300, 10600, wx);
  out[0] = Math.max(0, 1 - f - b); out[1] = f - s; out[2] = s; out[3] = b - n; out[4] = n;
  return out;
}
const _w = new Float32Array(5);
export function dominantBiome(x, z) {
  biomeWeights(x, z, _w); let b = 0;
  for (let i = 1; i < 5; i++) if (_w[i] > _w[b]) b = i;
  return b;
}

// weather kinds: fog is a multiplier on the clear-day fog, temp a change in °C, amount how heavy the snow, rain or dust is,
// cloud how much of the sky the clouds cover (overcast is how grey and heavy they are)
export const WEATHER = {
  clear: { name: 'Clear', fog: 1, overcast: 0, cloud: 0.08, wind: 0.5, precip: null, amount: 0, temp: 0 },
  cloudy: { name: 'Cloudy', fog: 1.2, overcast: 0.25, cloud: 0.55, wind: 0.65, precip: null, amount: 0, temp: -1 },
  windy: { name: 'Windy', fog: 1.25, overcast: 0.1, cloud: 0.3, wind: 1.15, precip: 'dust', amount: 0.25, temp: -1 },
  sandstorm: { name: 'Sandstorm', fog: 9, overcast: 0.5, cloud: 0.35, wind: 1.9, precip: 'dust', amount: 1, temp: -2, tint: [0.8, 0.62, 0.42] },
  overcast: { name: 'Overcast', fog: 1.6, overcast: 0.65, cloud: 0.92, wind: 0.6, precip: null, amount: 0, temp: -2 },
  fog: { name: 'Fog', fog: 6, overcast: 0.6, cloud: 0.6, wind: 0.2, precip: null, amount: 0, temp: -1 },
  lightRain: { name: 'Light rain', fog: 1.9, overcast: 0.6, cloud: 0.85, wind: 0.65, precip: 'rain', amount: 0.35, temp: -2 },
  rain: { name: 'Heavy rain', fog: 3, overcast: 0.85, cloud: 0.97, wind: 0.9, precip: 'rain', amount: 0.85, temp: -3 },
  storm: { name: 'Thunderstorm', fog: 3.4, overcast: 0.95, cloud: 1, wind: 1.4, precip: 'rain', amount: 1, temp: -4, thunder: true },
  dust: { name: 'Blowing dust', fog: 3.5, overcast: 0.3, cloud: 0.3, wind: 1.45, precip: 'dust', amount: 0.7, temp: -1, tint: [0.82, 0.56, 0.38] },
  snow: { name: 'Snowfall', fog: 3, overcast: 0.75, cloud: 0.95, wind: 0.6, precip: 'snow', amount: 0.7, temp: -4 },
  blizzard: { name: 'Blizzard', fog: 11, overcast: 1, cloud: 1, wind: 2, precip: 'snow', amount: 1, temp: -12 },
};

// fog: how much thicker the air is than the open desert. temp: [midday, midnight] °C at the valley floor
export const BIOME = [
  { key: 'desert', name: 'Desert', fog: 1, fogCol: [0.88, 0.8, 0.68], temp: [31, 7], weather: { clear: 0.45, cloudy: 0.14, windy: 0.17, sandstorm: 0.12, overcast: 0.07, lightRain: 0.05 } },
  { key: 'forest', name: 'Forest', fog: 1.8, fogCol: [0.64, 0.71, 0.69], temp: [17, 5], weather: { clear: 0.28, cloudy: 0.16, fog: 0.18, overcast: 0.12, lightRain: 0.14, rain: 0.08, storm: 0.04 } },
  { key: 'swamp', name: 'Swamp', fog: 3.2, fogCol: [0.58, 0.62, 0.52], temp: [25, 15], weather: { fog: 0.3, cloudy: 0.1, overcast: 0.15, lightRain: 0.15, rain: 0.15, storm: 0.15 } },
  { key: 'badlands', name: 'Badlands', fog: 1.1, fogCol: [0.9, 0.72, 0.56], temp: [28, 8], weather: { clear: 0.45, cloudy: 0.14, windy: 0.2, dust: 0.12, overcast: 0.05, storm: 0.04 } },
  { key: 'snow', name: 'Snowy mountains', fog: 1.5, fogCol: [0.8, 0.85, 0.93], temp: [-5, -17], weather: { snow: 0.3, clear: 0.2, cloudy: 0.1, fog: 0.12, blizzard: 0.18, overcast: 0.1 } },
];

// the weather follows the real clock in four-minute spells, so every open tab sees the same sky without talking
const SLOT = 240000, FADE = 45000;
function hash(n) { n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 16; return (n >>> 0) / 4294967296; }
function pick(bi, slot) {
  const r = hash((slot % 1000003) * 31 + bi * 7919 + 17); let acc = 0;
  for (const k in BIOME[bi].weather) { acc += BIOME[bi].weather[k]; if (r < acc) return k; }
  return 'clear';
}
export function weatherOf(bi, now = Date.now()) {
  const slot = Math.floor(now / SLOT);
  return { a: WEATHER[pick(bi, slot - 1)], b: WEATHER[pick(bi, slot)], k: smoothstep(0, FADE, now - slot * SLOT) };
}

// what the air is like for someone standing where the biome weights are w, at night (0..1) and altitude alt
export function airAt(w, night, alt, out = {}) {
  let fog = 0, over = 0, cloud = 0, wind = 0, temp = 0, snow = 0, rain = 0, dust = 0, thunder = 0, r = 0, g = 0, b = 0, best = 0;
  const now = Date.now();
  out.weather = 'Clear'; out.biome = 0;
  for (let i = 0; i < 5; i++) {
    const k = w[i]; if (k < 0.001) continue;
    const B = BIOME[i], W = weatherOf(i, now), A = W.a, C = W.b, t = W.k;
    const mix = p => lerp(A[p] || 0, C[p] || 0, t);
    fog += k * B.fog * mix('fog'); over += k * mix('overcast'); cloud += k * mix('cloud'); wind += k * mix('wind');
    temp += k * (lerp(B.temp[0], B.temp[1], night) + mix('temp'));
    for (const [P, wt] of [[A, 1 - t], [C, t]]) {
      if (P.precip === 'snow') snow += k * P.amount * wt;
      else if (P.precip === 'rain') rain += k * P.amount * wt;
      else if (P.precip === 'dust') dust += k * P.amount * wt;
      if (P.thunder) thunder += k * wt;
      const col = P.tint || B.fogCol; r += k * wt * col[0]; g += k * wt * col[1]; b += k * wt * col[2];
    }
    if (k > best) { best = k; out.biome = i; out.weather = (t > 0.5 ? C : A).name; }
  }
  temp -= Math.max(0, alt - 120) * 0.0065;
  // rain turns to snow when it is cold enough
  if (temp < 0.5 && rain > 0) { snow += rain; rain = 0; }
  Object.assign(out, { fog, overcast: over, cloud, wind, temp, snow, rain, dust, thunder, tint: [r, g, b] });
  return out;
}
