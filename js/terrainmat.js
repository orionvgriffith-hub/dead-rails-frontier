// Shaders for the ground and the things on it, built on three's standard (physically based) material so lights,
// shadows, the sky's reflections and fog all still apply:
//  - terrain: five ground layers blended per pixel by what the land is (rock on steep faces, gravel on the track bed and
//    dry washes, beaten earth on roads and in town, meadow where the ground is green, sand elsewhere), each sampled at
//    two scales so no repeat shows, with rock projected three ways so cliffs aren't smeared, and damp ground near water
//  - water: moving ripples that catch the sky, clearer looking straight down than across
//  - stone props: the same rock, projected in world space so every boulder is different
//  - plants: sway in the wind, more at the tips
import * as THREE from 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/three.module.js';
import { buildGroundLayers } from './ptex.js';

// wet: how soaked the ground is (0..1), snow: how much has settled, rain: how hard it is falling right now
export const SHARED = { time: { value: 0 }, wind: { value: new THREE.Vector3(0.8, 0, 0.35) }, windK: { value: 0.5 }, wet: { value: 0 }, snow: { value: 0 }, rain: { value: 0 } };
let GL = null;
export function groundLayers() { if (!GL) GL = buildGroundLayers(512); return GL; }

const LAYER_GLSL = /* glsl */`
precision highp sampler2DArray;
uniform sampler2DArray tAlb, tNrm;
uniform vec3 tMean[5];
uniform float tScale[5];
float tLum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
// one layer at a point on the ground, at two scales; far: 0 close by, 1 in the distance
void tLayer(int l, vec2 p, float far, out vec3 c, out float h, out vec2 n, out float r, out float ao) {
  float fl = float(l), sc = tScale[l];
  vec3 uv1 = vec3(p / sc, fl), uv2 = vec3(p / (sc * 4.37) + vec2(0.37, 0.71), fl);
  vec4 a1 = texture(tAlb, uv1), a2 = texture(tAlb, uv2), n1 = texture(tNrm, uv1), n2 = texture(tNrm, uv2);
  float k = mix(0.38, 0.78, far);
  c = mix(a1.rgb, a2.rgb, k) / tMean[l];
  h = mix(a1.a, a2.a, k);
  n = (mix(n1.xy, n2.xy, k) * 2.0 - 1.0) * (1.0 - far * 0.6);
  r = mix(n1.z, n2.z, k); ao = mix(n1.w, n2.w, k);
}
`;

// ---------- terrain ----------
// o: { holes: uniform of 8 rects or null, cutout: uniform rect or null, mode: 'near' | 'mid' | 'far' }
export function terrainMaterial(o) {
  const G = groundLayers();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const U = { tAlb: { value: G.albedo }, tNrm: { value: G.normal }, tMean: { value: G.mean }, tScale: { value: G.scale }, uWet: SHARED.wet, uSnow: SHARED.snow, uRain: SHARED.rain, uWxTime: SHARED.time };
  mat.userData.lite = false;
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    if (o.holes) sh.uniforms.holes = o.holes;
    if (o.cutout) sh.uniforms.nearRect = o.cutout;
    const far = o.mode === 'far', lite = far || o.mode === 'mid' || mat.userData.lite;
    sh.defines = Object.assign(sh.defines || {}, far ? { TERR_FAR: '' } : {}, lite ? { TERR_LITE: '' } : {});
    sh.vertexShader = (far ? '' : 'attribute vec4 surf;\nvarying vec4 vSurf;\n') + 'varying vec3 vTW;\nvarying vec3 vTN;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  vec4 tw4 = modelMatrix * vec4(transformed, 1.0); vTW = tw4.xyz; vTN = normalize(mat3(modelMatrix) * objectNormal);
  ${far ? '' : 'vSurf = surf;'}`);
    let f = sh.fragmentShader;
    f = LAYER_GLSL + 'uniform float uWet, uSnow, uRain, uWxTime;\n' + (far ? '' : 'varying vec4 vSurf;\n') + 'varying vec3 vTW;\nvarying vec3 vTN;\n' +
      (o.holes ? 'uniform vec4 holes[8];\n' : '') + (o.cutout ? 'uniform vec4 nearRect;\n' : '') + f;
    f = f.replace('void main() {', `void main() {
  ${o.holes ? 'for (int i = 0; i < 8; i++) { vec4 hr = holes[i]; if (vTW.x > hr.x && vTW.x < hr.z && vTW.z > hr.y && vTW.z < hr.w) discard; }' : ''}
  ${o.cutout ? 'if (vTW.x > nearRect.x && vTW.x < nearRect.z && vTW.z > nearRect.y && vTW.z < nearRect.w) discard;' : ''}
  vec3 terrN; float terrRough, terrAO;`);
    // the whole surface is worked out where the colour map would be read, and used for roughness, normal and shading below
    f = f.replace('#include <map_fragment>', /* glsl */`
  {
    vec3 N = normalize(vTN), vc = vColor.rgb;
    float dist = length(vTW - cameraPosition), farK = smoothstep(40.0, 420.0, dist);
    vec2 p = vTW.xz;
    // broad patchiness, so the same mix of layers doesn't read as a flat wash
    float macro = texture(tAlb, vec3(p / 131.0, 3.0)).a, macro2 = texture(tAlb, vec3(p / 47.0 + 0.5, 1.0)).a;
#ifdef TERR_FAR
    float wr = smoothstep(0.86, 0.6, N.y), wg = 0.0, wd = 0.0, wet = 0.0;
#else
    float wr = vSurf.x, wg = vSurf.y, wd = vSurf.z, wet = vSurf.w;
#endif
    float grassy = smoothstep(0.0, 0.07, vc.g - vc.r * 0.92) * (1.0 - wr);
    float snowy = smoothstep(0.82, 0.9, min(vc.r, min(vc.g, vc.b)));
    wd = clamp(wd + (macro2 - 0.5) * 0.5 * (1.0 - wr - wg) * (1.0 - snowy), 0.0, 1.0);
    float rest = max(0.0, 1.0 - wr - wg - wd);
    float wsand = rest * (1.0 - grassy), wmead = rest * grassy;

    vec3 c0 = vec3(1.0), c1 = vec3(1.0), c2 = vec3(1.0), c3 = vec3(1.0), c4 = vec3(1.0);
    float h0 = 0.0, h1 = 0.0, h2 = 0.0, h3 = 0.0, h4 = 0.0, r0 = 0.95, r1 = 0.9, r2 = 0.8, r3 = 0.8, r4 = 0.92, a0 = 1.0, a1 = 1.0, a2 = 1.0, a3 = 1.0, a4 = 1.0;
    vec2 n0 = vec2(0.0), n1 = vec2(0.0), n2 = vec2(0.0), n4 = vec2(0.0);
    vec3 n3 = vec3(0.0);
#ifdef TERR_FAR
    vec2 pf = p * 0.18;
    tLayer(0, pf, 1.0, c0, h0, n0, r0, a0);
    if (wr > 0.01) { vec2 nn; tLayer(3, vec2(p.x + p.y, vTW.y * 1.6) * 0.12, 1.0, c3, h3, nn, r3, a3); n3 = vec3(nn.x, 0.0, nn.y); }
#else
    if (wsand > 0.01) tLayer(0, p, farK, c0, h0, n0, r0, a0);
    if (wd > 0.01) tLayer(1, p, farK, c1, h1, n1, r1, a1);
    if (wg > 0.01) tLayer(2, p, farK, c2, h2, n2, r2, a2);
    if (wmead > 0.01) tLayer(4, p, farK, c4, h4, n4, r4, a4);
    if (wr > 0.01) {
  #ifdef TERR_LITE
      vec2 nn; tLayer(3, p, farK, c3, h3, nn, r3, a3); n3 = vec3(nn.x, 0.0, nn.y);
  #else
      // rock seen from three sides, so steep faces carry bedding and joints instead of stretched streaks
      vec3 bw = pow(abs(N), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
      vec3 cx, cy, cz; float hx, hy, hz, rx, ry, rz, ax, ay, az; vec2 nx, ny, nz;
      tLayer(3, vTW.zy, farK, cx, hx, nx, rx, ax);
      tLayer(3, vTW.xz, farK, cy, hy, ny, ry, ay);
      tLayer(3, vTW.xy, farK, cz, hz, nz, rz, az);
      c3 = cx * bw.x + cy * bw.y + cz * bw.z; h3 = hx * bw.x + hy * bw.y + hz * bw.z; r3 = rx * bw.x + ry * bw.y + rz * bw.z; a3 = ax * bw.x + ay * bw.y + az * bw.z;
      n3 = vec3(0.0, nx.y, nx.x) * bw.x * sign(N.x) + vec3(ny.x, 0.0, ny.y) * bw.y + vec3(nz.x, nz.y, 0.0) * bw.z * sign(N.z);
  #endif
    }
#endif
    // blend by height as well as weight: stones stand out of sand, sand fills the cracks in rock
    vec4 W1 = vec4(wsand, wd, wg, wr) , HH = vec4(h0, h1 * 0.9, h2 * 1.1, h3 * 1.05);
    float W5 = wmead, H5 = h4;
    vec4 bw4 = W1 + HH * 0.55 * step(0.001, W1); float bw5 = W5 + H5 * 0.55 * step(0.001, W5);
    float top = max(max(max(bw4.x, bw4.y), max(bw4.z, bw4.w)), bw5) - 0.22;
    bw4 = max(bw4 - top, 0.0) * step(0.001, W1); bw5 = max(bw5 - top, 0.0) * step(0.001, W5);
    float bs = bw4.x + bw4.y + bw4.z + bw4.w + bw5 + 1e-4; bw4 /= bs; bw5 /= bs;

    vec3 det = c0 * bw4.x + c1 * bw4.y + c3 * bw4.w + c4 * bw5;
    vec3 base = vc * det;
    // gravel keeps some of its own colour, the ground's tint only partly over it
    base += bw4.z * mix(vec3(tLum(vc)) * 1.1, vc, 0.45) * c2;
    float lumK = 0.86 + macro * 0.28;
    base *= lumK;
    // damp ground: darker and with a sheen
    wet = clamp(wet, 0.0, 1.0);
    // fallen snow lies on the flatter ground, patchy where it's thin; it hides the wet and the puddles under it
    float snowLay = uSnow * smoothstep(0.62, 0.86, N.y) * clamp(0.7 + (macro - 0.5) * 0.9 + uSnow * 0.3, 0.0, 1.0) * (1.0 - snowy * 0.5);
    // rain soaks everything (sand drinks it fastest); water stands in the hollows of flat ground
    wet = max(wet, uWet * (0.55 + 0.45 * N.y) * (1.0 - wsand * 0.35)) * (1.0 - snowLay);
    float puddle = smoothstep(0.56, 0.63, (1.0 - macro2) * 0.8 + (1.0 - macro) * 0.2) * smoothstep(0.94, 0.99, N.y) * smoothstep(0.35, 0.9, uWet)
      * (1.0 - wr) * (1.0 - snowy) * (1.0 - wsand * 0.6) * (1.0 - snowLay);
    base *= 1.0 - wet * 0.42;
    base = mix(base, base * 0.45 + vec3(0.015, 0.02, 0.025), puddle);
    base = mix(base, vec3(0.86, 0.88, 0.93), snowLay);
    diffuseColor.rgb *= base;
    terrRough = (r0 * bw4.x + r1 * bw4.y + r2 * bw4.z + r3 * bw4.w + r4 * bw5);
    terrRough = mix(terrRough, 0.34, wet * 0.85);
    terrRough = mix(terrRough, 0.04, puddle);
    terrRough = mix(terrRough, 0.85, snowLay);
    terrAO = a0 * bw4.x + a1 * bw4.y + a2 * bw4.z + a3 * bw4.w + a4 * bw5;
    terrAO = mix(1.0, terrAO, 1.0 - farK * 0.7);
    float sandK = 0.9 * (1.0 - snowy * 0.6);
    vec3 pert = vec3(n0.x, 0.0, n0.y) * bw4.x * sandK + vec3(n1.x, 0.0, n1.y) * bw4.y * 1.0 + vec3(n2.x, 0.0, n2.y) * bw4.z * 1.35 + n3 * bw4.w * 1.25 + vec3(n4.x, 0.0, n4.y) * bw5 * 0.8;
    terrN = normalize(N + pert * (1.0 - wet * 0.5));
    // puddles are flat and mirror-like, with rings spreading on them while the rain falls; snow smooths the ground over
    vec2 rp = vec2(sin(p.x * 7.0 + uWxTime * 6.0 + sin(p.y * 5.0)), sin(p.y * 7.0 - uWxTime * 5.3 + sin(p.x * 4.0))) * 0.07 * uRain;
    terrN = normalize(mix(terrN, normalize(vec3(rp.x, 1.0, rp.y)), puddle));
    terrN = normalize(mix(terrN, N, snowLay * 0.7));
  }`);
    f = f.replace('#include <color_fragment>', '');
    f = f.replace('#include <roughnessmap_fragment>', 'float roughnessFactor = terrRough;');
    f = f.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  normal = normalize((viewMatrix * vec4(terrN, 0.0)).xyz);');
    f = f.replace('#include <aomap_fragment>', '#include <aomap_fragment>\n  reflectedLight.indirectDiffuse *= terrAO; reflectedLight.directDiffuse *= mix(1.0, terrAO, 0.45); reflectedLight.indirectSpecular *= terrAO;');
    sh.fragmentShader = f;
  };
  mat.customProgramCacheKey = () => 'terrain:' + o.mode + ':' + (o.holes ? 'h' : '') + (o.cutout ? 'c' : '') + (mat.userData.lite ? 'L' : '');
  return mat;
}
export function setTerrainLite(mats, lite) { for (const m of mats) if (m.userData.lite !== lite) { m.userData.lite = lite; m.needsUpdate = true; } }

// ---------- water ----------
let waterN = null;
function waterNormals() {
  if (waterN) return waterN;
  // a tiling field of soft wavelets, as a normal map
  const S = 256, d = new Uint8Array(S * S * 4), H = new Float32Array(S * S);
  const hsh = (x, y) => { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
  const vn = (u, v, p) => { const x = u * p, y = v * p, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, w = i => ((i % p) + p) % p; const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy); const a = hsh(w(xi), w(yi)), b = hsh(w(xi + 1), w(yi)), c = hsh(w(xi), w(yi + 1)), e = hsh(w(xi + 1), w(yi + 1)); return a + (b - a) * sx + (c - a) * sy + (a - b - c + e) * sx * sy; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const u = x / S, v = y / S; H[y * S + x] = vn(u, v, 8) * 0.5 + vn(u, v, 16) * 0.3 + vn(u, v, 32) * 0.2; }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (H[y * S + (x + 1) % S] - H[y * S + (x + S - 1) % S]) * 6, dy = (H[((y + 1) % S) * S + x] - H[((y + S - 1) % S) * S + x]) * 6, l = Math.hypot(dx, dy, 1), o = (y * S + x) * 4;
    d[o] = (-dx / l * 0.5 + 0.5) * 255; d[o + 1] = (-dy / l * 0.5 + 0.5) * 255; d[o + 2] = (1 / l * 0.5 + 0.5) * 255; d[o + 3] = 255;
  }
  waterN = new THREE.DataTexture(d, S, S, THREE.RGBAFormat); waterN.wrapS = waterN.wrapT = THREE.RepeatWrapping;
  waterN.minFilter = THREE.LinearMipmapLinearFilter; waterN.magFilter = THREE.LinearFilter; waterN.generateMipmaps = true; waterN.needsUpdate = true;
  return waterN;
}
// o: { cutout: uniform rect or null, ice: bool }
export function waterMaterial(o = {}) {
  const ice = !!o.ice;
  const mat = new THREE.MeshStandardMaterial(ice ? { vertexColors: true, roughness: 0.28, metalness: 0 } : { vertexColors: true, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.86, depthWrite: true });
  mat.onBeforeCompile = sh => {
    sh.uniforms.tWave = { value: waterNormals() }; sh.uniforms.uTime = SHARED.time; sh.uniforms.uRain = SHARED.rain;
    if (o.cutout) sh.uniforms.nearRect = o.cutout;
    sh.vertexShader = 'varying vec3 vWW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vWW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    let f = 'uniform sampler2D tWave;\nuniform float uTime, uRain;\nvarying vec3 vWW;\n' + (o.cutout ? 'uniform vec4 nearRect;\n' : '') + sh.fragmentShader;
    if (o.cutout) f = f.replace('void main() {', 'void main() {\n  if (vWW.x > nearRect.x && vWW.x < nearRect.z && vWW.z > nearRect.y && vWW.z < nearRect.w) discard;');
    f = f.replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
  {
    float t = ${ice ? '0.0' : 'uTime'};
    vec2 p = vWW.xz;
    vec3 w1 = texture2D(tWave, p / 23.0 + vec2(t * 0.011, t * 0.007)).xyz * 2.0 - 1.0;
    vec3 w2 = texture2D(tWave, p / 9.0 - vec2(t * 0.017, -t * 0.013)).xyz * 2.0 - 1.0;
    vec3 w3 = texture2D(tWave, p / 61.0 + vec2(-t * 0.004, t * 0.006)).xyz * 2.0 - 1.0;
    float fade = 1.0 - smoothstep(60.0, 600.0, length(vWW - cameraPosition));
    vec2 s = (w1.xy * 0.55 + w2.xy * 0.35 + w3.xy * 0.6) * ${ice ? '0.25' : '0.5'} * (0.35 + 0.65 * fade);
    // rain stipples the surface with rings
    ${ice ? '' : 's += vec2(sin(p.x * 9.0 + t * 7.0 + sin(p.y * 6.0)), sin(p.y * 9.0 - t * 6.4 + sin(p.x * 5.0))) * 0.09 * uRain * fade;'}
    normal = normalize((viewMatrix * vec4(normalize(vec3(s.x, 1.0, s.y)), 0.0)).xyz);
  }`);
    if (!ice) f = f.replace('#include <opaque_fragment>', /* glsl */`
  // looking straight down you see into the water, across it you see the sky
  { vec3 V = normalize(cameraPosition - vWW); float fr = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0); diffuseColor.a = mix(0.62, 0.97, fr) * opacity; }
  #include <opaque_fragment>`);
    sh.fragmentShader = f;
  };
  mat.customProgramCacheKey = () => 'water:' + (ice ? 'i' : 'w') + (o.cutout ? 'c' : '');
  return mat;
}

// ---------- stone props ----------
// rock texture projected from the world, three ways, over the prop's own vertex colour
export function stoneMaterial() {
  const G = groundLayers();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { tAlb: { value: G.albedo }, tNrm: { value: G.normal }, tMean: { value: G.mean }, tScale: { value: G.scale } });
    sh.vertexShader = 'varying vec3 vSW;\nvarying vec3 vSN;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  vec4 sw4 = vec4(transformed, 1.0); vec3 sn3 = objectNormal;
  #ifdef USE_INSTANCING
    sw4 = instanceMatrix * sw4; sn3 = mat3(instanceMatrix) * sn3;
  #endif
  sw4 = modelMatrix * sw4; vSW = sw4.xyz; vSN = normalize(mat3(modelMatrix) * sn3);`);
    let f = LAYER_GLSL + 'varying vec3 vSW;\nvarying vec3 vSN;\n' + sh.fragmentShader;
    f = f.replace('void main() {', 'void main() {\n  vec3 stN; float stR, stAO;');
    f = f.replace('#include <map_fragment>', /* glsl */`
  {
    vec3 N = normalize(vSN); vec3 bw = pow(abs(N), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
    float farK = smoothstep(20.0, 260.0, length(vSW - cameraPosition));
    vec3 cx, cy, cz; float hx, hy, hz, rx, ry, rz, ax, ay, az; vec2 nx, ny, nz;
    // a little smaller than on the cliffs, so a boulder carries several beds
    vec3 q = vSW * 1.6;
    tLayer(3, q.zy, farK, cx, hx, nx, rx, ax); tLayer(3, q.xz, farK, cy, hy, ny, ry, ay); tLayer(3, q.xy, farK, cz, hz, nz, rz, az);
    vec3 c = cx * bw.x + cy * bw.y + cz * bw.z;
    diffuseColor.rgb *= c;
    stR = rx * bw.x + ry * bw.y + rz * bw.z; stAO = ax * bw.x + ay * bw.y + az * bw.z;
    vec3 pert = vec3(0.0, nx.y, nx.x) * bw.x * sign(N.x) + vec3(ny.x, 0.0, ny.y) * bw.y + vec3(nz.x, nz.y, 0.0) * bw.z * sign(N.z);
    stN = normalize(N + pert * 1.4);
  }`);
    f = f.replace('#include <roughnessmap_fragment>', 'float roughnessFactor = stR;');
    f = f.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  normal = normalize((viewMatrix * vec4(stN, 0.0)).xyz);');
    f = f.replace('#include <aomap_fragment>', '#include <aomap_fragment>\n  reflectedLight.indirectDiffuse *= stAO; reflectedLight.directDiffuse *= mix(1.0, stAO, 0.4);');
    sh.fragmentShader = f;
  };
  mat.customProgramCacheKey = () => 'stone-prop';
  return mat;
}

// ---------- plants ----------
// leaves and stems bend with the wind, each plant on its own beat; the base stays put
export function plantMaterial(opts = {}) {
  const mat = new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.82, metalness: 0, side: THREE.DoubleSide }, opts));
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = SHARED.time; sh.uniforms.uWind = SHARED.wind; sh.uniforms.uWindK = SHARED.windK;
    sh.vertexShader = 'uniform float uTime, uWindK;\nuniform vec3 uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  {
    float hy = max(transformed.y, 0.0);
    vec2 ph = vec2(0.0);
    #ifdef USE_INSTANCING
      ph = instanceMatrix[3].xz;
    #endif
    float beat = sin(uTime * 1.7 + ph.x * 0.37 + ph.y * 0.23) * 0.6 + sin(uTime * 3.1 + ph.x * 0.11 - ph.y * 0.29 + hy) * 0.4;
    float bend = (0.06 * min(hy, 1.0) + 0.014 * hy) * uWindK * (0.55 + 0.45 * beat);
    // flutter on the outer leaves
    bend += sin(uTime * 7.0 + position.x * 9.0 + position.z * 7.0 + ph.x) * 0.012 * min(hy, 2.0) * uWindK;
    transformed.xz += uWind.xz * bend;
    transformed.y -= bend * bend * 0.5;
  }`);
    // a little light passes through thin leaves
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.035;');
  };
  mat.customProgramCacheKey = () => 'plant';
  return mat;
}

// ---------- weathering for models without texture coordinates (the locomotive, the cargo car) ----------
// dust settles thickest low down by the wheels and in hollows, grime streaks run down the sides, and dirty patches are
// duller and rougher. Worked out in the model's own space, so it stays put on the moving train.
// amt: how dirty; dustY: height (model units) the dust reaches up to
export function grime(mat, amt = 1, dustY = 1.3) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    const G = groundLayers(); // built on first use, not when the page loads
    Object.assign(sh.uniforms, { tAlb: { value: G.albedo }, tNrm: { value: G.normal }, tMean: { value: G.mean }, tScale: { value: G.scale }, gAmt: { value: amt }, gDustY: { value: dustY } });
    sh.vertexShader = 'varying vec3 vGO;\nvarying vec3 vGN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGO = position; vGN = normal;');
    let f = LAYER_GLSL + 'uniform float gAmt, gDustY;\nvarying vec3 vGO;\nvarying vec3 vGN;\n' + sh.fragmentShader;
    f = f.replace('void main() {', 'void main() {\n  float grimeR = 0.0;');
    f = f.replace('#include <map_fragment>', /* glsl */`#include <map_fragment>
  {
    vec3 bw = pow(abs(normalize(vGN)), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
    vec3 q = vGO * 0.9;
    float g = texture(tAlb, vec3(q.zy, 1.0)).a * bw.x + texture(tAlb, vec3(q.xz, 1.0)).a * bw.y + texture(tAlb, vec3(q.xy, 1.0)).a * bw.z;
    float streak = texture(tAlb, vec3(vGO.x * 0.21 + vGO.z * 0.21, vGO.y * 0.06, 3.0)).a;
    float low = clamp((gDustY - vGO.y) / gDustY, 0.0, 1.0);
    // dust lies on top of horizontal surfaces too
    float dust = clamp(low * low * 0.8 + smoothstep(0.55, 0.9, g) * 0.35 + max(vGN.y, 0.0) * 0.25, 0.0, 1.0) * gAmt;
    diffuseColor.rgb *= 0.86 + streak * 0.24;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.43, 0.35, 0.27), dust * 0.55);
    grimeR = dust * 0.4 + (1.0 - streak) * 0.08 * gAmt;
  }`);
    f = f.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = clamp(roughnessFactor + grimeR, 0.0, 1.0);');
    f = f.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor *= 1.0 - clamp(grimeR * 1.4, 0.0, 0.85);');
    sh.fragmentShader = f;
  };
  const key = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.customProgramCacheKey = () => key() + '|grime';
  return mat;
}

// ---------- weather on things: rain darkens and glosses them, snow settles on their upward faces ----------
// Worked out from the world-space normal so it lies on roofs, crate lids, boulders and the boiler top, not walls.
// gate: the material's vertex colours carry the buildings' baked interior shading; anything indoors (darker than
// about 0.75) stays dry and clear of snow
export function weathered(mat, o = {}) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uWet = SHARED.wet; sh.uniforms.uSnow = SHARED.snow;
    sh.vertexShader = 'varying vec3 vWxN;\nvarying vec3 vWxP;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  { vec4 wxp = vec4(transformed, 1.0); vec3 wxn = objectNormal;
  #ifdef USE_INSTANCING
    wxp = instanceMatrix * wxp; wxn = mat3(instanceMatrix) * wxn;
  #endif
    wxp = modelMatrix * wxp; vWxP = wxp.xyz; vWxN = normalize(mat3(modelMatrix) * wxn); }`);
    let f = 'uniform float uWet, uSnow;\nvarying vec3 vWxN;\nvarying vec3 vWxP;\n' + sh.fragmentShader;
    f = f.replace('void main() {', 'void main() {\n  float wxSnow = 0.0, wxWet = 0.0;');
    f = f.replace('#include <color_fragment>', `#include <color_fragment>
  {
    float up = normalize(vWxN).y, gate = 1.0;
    ${o.gate ? '#ifdef USE_COLOR\n    gate = smoothstep(0.74, 0.92, max(vColor.r, max(vColor.g, vColor.b)));\n    #endif' : ''}
    float n = fract(sin(dot(floor(vWxP.xz * 6.0), vec2(12.9898, 78.233))) * 43758.5453);
    float n2 = sin(vWxP.x * 2.3 + sin(vWxP.z * 1.7)) * 0.5 + 0.5;
    wxSnow = uSnow * smoothstep(0.45 - uSnow * 0.15, 0.8, up) * gate * clamp(0.6 + n2 * 0.5 + n * 0.15 - (1.0 - uSnow) * 0.5, 0.0, 1.0);
    wxWet = uWet * (0.45 + 0.55 * max(up, 0.0)) * gate * (1.0 - wxSnow);
    diffuseColor.rgb *= 1.0 - wxWet * 0.3;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.9, 0.95), wxSnow);
  }`);
    f = f.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.2, wxWet * 0.7);
  roughnessFactor = mix(roughnessFactor, 0.85, wxSnow);
  metalnessFactor *= 1.0 - wxSnow;`);
    sh.fragmentShader = f;
  };
  const key = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.customProgramCacheKey = () => key() + '|wx' + (o.gate ? 'g' : '');
  return mat;
}
