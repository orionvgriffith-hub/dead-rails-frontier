// Sky dome, sun/moon lighting, fog, stars, dust and the day/night cycle, plus the weather of whichever region you are in:
// thicker or tinted fog, overcast skies, falling snow and rain, blowing dust and lightning
import * as THREE from 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/three.module.js';
import { smoothstep, lerp } from './noise.js';
import { MAT } from './textures.js';
import { SHARED } from './terrainmat.js';

const C = (r, g, b) => new THREE.Color(r, g, b);
const TOP_DAY = C(0.30, 0.52, 0.80), HOR_DAY = C(0.88, 0.80, 0.68), HOR_GOLD = C(1.0, 0.6, 0.34), TOP_GOLD = C(0.36, 0.42, 0.62);
const TOP_NIGHT = C(0.006, 0.009, 0.022), HOR_NIGHT = C(0.03, 0.036, 0.06), GREY = C(0.56, 0.58, 0.6);
const CL_DAY = C(0.97, 0.97, 0.98), CL_GREY = C(0.6, 0.62, 0.66), CL_WARM = C(1.0, 0.74, 0.58), CL_NIGHT = C(0.035, 0.04, 0.06), CL_FLASH = C(0.9, 0.92, 1.0);

export function createAtmosphere(scene, renderer) {
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 1; sc.far = 900;
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.5;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x8a6a4a, 1); scene.add(hemi);
  scene.fog = new THREE.FogExp2(0xd8c8b0, 0.0003);

  const skyU = {
    top: { value: TOP_DAY.clone() }, hor: { value: HOR_DAY.clone() }, sunDir: { value: new THREE.Vector3(0, 1, 0) },
    sunCol: { value: new THREE.Color(1, 0.9, 0.7) }, moonDir: { value: new THREE.Vector3(0, -1, 0) }, night: { value: 0 }, cloud: { value: 0 },
    // clouds: cover is how much of the sky they fill, dark how heavy with rain they are, cOff where the wind has carried them
    cover: { value: 0.1 }, dark: { value: 0 }, cOff: { value: new THREE.Vector2(0, 0) }, cloudCol: { value: new THREE.Color(1, 1, 1) },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(12000, 48, 24), new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 top, hor, sunDir, sunCol, moonDir, cloudCol; uniform float night, cloud, cover, dark; uniform vec2 cOff; varying vec3 vD;
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
      float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
      void main(){
        vec3 d = normalize(vD); float h = max(d.y, 0.0);
        vec3 c = mix(hor, top, pow(h, 0.45));
        c = mix(c, hor * 0.85, smoothstep(0.0, -0.15, d.y));
        float sd = max(dot(d, sunDir), 0.0);
        // dawn and dusk: the low sky burns orange towards the sun, and a cool rose band lies along the opposite horizon
        float low = smoothstep(-0.2, 0.0, sunDir.y) * (1.0 - smoothstep(0.02, 0.32, sunDir.y));
        float az = dot(normalize(sunDir.xz + 1e-4), normalize(d.xz + 1e-4)) * 0.5 + 0.5;
        c += vec3(1.0, 0.4, 0.14) * pow(az, 3.0) * exp(-h * 5.0) * low * 0.9 * (1.0 - cloud * 0.7);
        c += vec3(0.42, 0.28, 0.48) * pow(1.0 - az, 2.0) * exp(-h * 9.0) * low * 0.25 * (1.0 - cloud);
        // clouds on a high layer, carried by the wind; thin at the horizon where you see through more of them edge-on
        float dens = 0.0;
        if (d.y > 0.0 && cover > 0.01) {
          vec2 q = d.xz / (d.y + 0.08) * 1.6 + cOff;
          float n = fbm(q) * 0.75 + fbm(q * 3.1 + cOff * 1.7) * 0.25;
          dens = smoothstep(1.0 - cover - 0.05, 1.0 - cover + 0.35, n) * smoothstep(0.0, 0.16, d.y);
          dens = min(1.0, dens * (0.85 + cover * 0.3));
        }
        float clear = (1.0 - cloud * 0.92) * (1.0 - dens);
        c += sunCol * (pow(sd, 6.0) * 0.35 + pow(sd, 60.0) * 0.6) * (1.0 - night) * (1.0 - cloud * 0.8);
        c += sunCol * smoothstep(0.9993, 0.9997, sd) * 6.0 * (1.0 - night) * clear;
        float md = max(dot(d, moonDir), 0.0);
        c += vec3(0.7,0.78,0.95) * (smoothstep(0.99955, 0.9997, md) * 1.4 + pow(md, 80.0) * 0.08) * night * clear;
        // the clouds themselves: lit on the sun's side, grey-bellied when heavy, edged with silver near the sun and
        // flushed with colour at sunrise and sunset
        if (dens > 0.0) {
          vec3 cc = cloudCol * (1.0 - dark * 0.55 * dens);
          cc += sunCol * (pow(sd, 5.0) * 0.5 + (1.0 - dens) * pow(sd, 2.0) * 0.25) * (1.0 - dark) * (1.0 - night);
          cc += vec3(1.0, 0.45, 0.2) * low * pow(az, 2.0) * 0.6 * (1.0 - dark);
          c = mix(c, cc, dens);
        }
        // haze band low on the horizon
        c = mix(c, hor * 1.05, exp(-abs(d.y) * 18.0) * 0.35);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  sky.renderOrder = -1; sky.frustumCulled = false; scene.add(sky);
  // the sky as seen from the ground, turned into the light and reflections every surface picks up (metal, glass, water,
  // wet ground and the soft fill on shadowed sides). Redrawn every few seconds from the live sky, so it follows the time
  // of day and the weather; a dark-earth floor below the horizon stops the underside of things glowing sky-blue
  const pmrem = new THREE.PMREMGenerator(renderer), envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), sky.material));
  const envGround = new THREE.Mesh(new THREE.CircleGeometry(90, 24), new THREE.MeshBasicMaterial({ color: 0x6a5240, fog: false }));
  envGround.rotation.x = -Math.PI / 2; envGround.position.y = -3; envScene.add(envGround);
  let envRT = null, envT = 0;

  // stars
  const sp = [], scol = [];
  for (let i = 0; i < 3200; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    if (u < 0.02) continue;
    sp.push(Math.cos(a) * r * 11000, u * 11000, Math.sin(a) * r * 11000);
    const b = 0.5 + Math.random() * 0.5, w = Math.random(); scol.push(b, b * (0.9 + w * 0.1), b * (0.8 + w * 0.2));
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute('color', new THREE.Float32BufferAttribute(scol, 3));
  const starMat = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const stars = new THREE.Points(sg, starMat); stars.frustumCulled = false; scene.add(stars);

  // dust motes (and the grit of a dust storm)
  const DN = 1400, dp = new Float32Array(DN * 3), dv = new Float32Array(DN);
  for (let i = 0; i < DN; i++) { dp[i * 3] = (Math.random() - 0.5) * 90; dp[i * 3 + 1] = Math.random() * 30; dp[i * 3 + 2] = (Math.random() - 0.5) * 90; dv[i] = Math.random(); }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dustMat = new THREE.PointsMaterial({ size: 0.07, color: 0xffe2b0, transparent: true, opacity: 0.45, depthWrite: false });
  const dust = new THREE.Points(dg, dustMat); dust.frustumCulled = false; scene.add(dust);

  // snowflakes: soft round points in a box that travels with you
  const SN = 5000, SB = 70, snp = new Float32Array(SN * 3), snv = new Float32Array(SN);
  for (let i = 0; i < SN; i++) { snp[i * 3] = (Math.random() - 0.5) * SB; snp[i * 3 + 1] = Math.random() * 40; snp[i * 3 + 2] = (Math.random() - 0.5) * SB; snv[i] = Math.random(); }
  const flake = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); const t = new THREE.CanvasTexture(c); return t; })();
  const sng = new THREE.BufferGeometry(); sng.setAttribute('position', new THREE.BufferAttribute(snp, 3));
  const snowMat = new THREE.PointsMaterial({ size: 0.16, map: flake, color: 0xf4f8ff, transparent: true, opacity: 0, depthWrite: false });
  const snow = new THREE.Points(sng, snowMat); snow.frustumCulled = false; snow.visible = false; scene.add(snow);

  // rain: short streaks falling fast and slanting with the wind
  const RN = 3000, RB = 60, rp = new Float32Array(RN * 6), rs = new Float32Array(RN * 3);
  for (let i = 0; i < RN; i++) { rs[i * 3] = (Math.random() - 0.5) * RB; rs[i * 3 + 1] = Math.random() * 30; rs[i * 3 + 2] = (Math.random() - 0.5) * RB; }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rainMat = new THREE.LineBasicMaterial({ color: 0xaab4c0, transparent: true, opacity: 0, depthWrite: false });
  const rain = new THREE.LineSegments(rg, rainMat); rain.frustumCulled = false; rain.visible = false; scene.add(rain);

  // distant blowing sand haze: big soft sprites near the horizon
  const hazeTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,235,200,0.55)'); gr.addColorStop(1, 'rgba(255,235,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const hazes = [];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: hazeTex, transparent: true, opacity: 0.18, depthWrite: false, fog: true }));
    m.scale.set(900, 160, 1); scene.add(m); hazes.push({ m, a: Math.random() * 6.28, r: 900 + Math.random() * 900 });
  }

  // sandstorm curtains: big soft sheets of blowing sand streaming past close by, so the storm has depth
  const curtains = [];
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: hazeTex, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    m.visible = false; scene.add(m); curtains.push({ m, x: (Math.random() - 0.5) * 140, z: (Math.random() - 0.5) * 140, y: 2 + Math.random() * 10, s: 25 + Math.random() * 35 });
  }
  // a lightning bolt: a jagged ribbon from the cloud base to the ground, a few kilometres off, there for an instant
  const boltN = 28, boltG = new THREE.BufferGeometry(), boltP = new Float32Array(boltN * 2 * 3), boltI = [];
  for (let i = 0; i < boltN - 1; i++) { const a = i * 2; boltI.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  boltG.setAttribute('position', new THREE.BufferAttribute(boltP, 3)); boltG.setIndex(boltI);
  const boltM = new THREE.MeshBasicMaterial({ color: 0xe8ecff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const bolt = new THREE.Mesh(boltG, boltM); bolt.frustumCulled = false; bolt.visible = false; scene.add(bolt);
  const strike = (cam) => {
    const a = Math.random() * Math.PI * 2, dist = 250 + Math.random() * 2800, bx = cam.x + Math.cos(a) * dist, bz = cam.z + Math.sin(a) * dist;
    const top = cam.y + 650 + Math.random() * 250, bot = cam.y - 20, rx = -Math.sin(a), rz = Math.cos(a), w = 3 + dist * 0.004;
    let x = bx, z = bz;
    for (let i = 0; i < boltN; i++) {
      const k = i / (boltN - 1), y = top + (bot - top) * k;
      if (i) { x += (Math.random() - 0.5) * 60; z += (Math.random() - 0.5) * 60; }
      const o = i * 6; boltP[o] = x - rx * w; boltP[o + 1] = y; boltP[o + 2] = z - rz * w; boltP[o + 3] = x + rx * w; boltP[o + 4] = y; boltP[o + 5] = z + rz * w;
    }
    boltG.attributes.position.needsUpdate = true;
    return dist;
  };
  const wind = new THREE.Vector3(0.8, 0, 0.35).normalize(), _dark = new THREE.Color(0.02, 0.018, 0.016);
  const tmp = new THREE.Color(), sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3(), tint = new THREE.Color(), fogC = new THREE.Color();
  const _lr = new THREE.Vector3(), _lu = new THREE.Vector3(), _ld = new THREE.Vector3();
  // the weather actually shown eases towards what the region asks for, so crossing a border is gradual
  const wx = { fog: 1, overcast: 0, cloud: 0.1, wind: 0.5, snow: 0, rain: 0, dust: 0, thunder: 0, temp: 20, tint: [0.88, 0.8, 0.68] };
  let flash = 0, flashT = 8;
  // fogMul and the particle counts are driven by the view distance and particle quality settings
  // wetness: how soaked the ground is; snowCover: how much snow has settled. Both build up and fade over minutes
  const state = { wetness: 0, snowCover: 0, night: 0, wind, windStrength: 0.5, sun, fogMul: 1, shadowSpan: 220, dustN: DN, hazeN: hazes.length, snowN: SN, rainN: RN, weather: wx, onThunder: null, sheltered: false, under: 0 };
  state.setParticles = level => {
    state.dustN = { low: 350, medium: 800, high: DN }[level] || DN; state.hazeN = { low: 3, medium: 6, high: hazes.length }[level] || hazes.length;
    state.snowN = { low: 1200, medium: 2800, high: SN }[level] || SN; state.rainN = { low: 800, medium: 1800, high: RN }[level] || RN;
    dg.setDrawRange(0, state.dustN); hazes.forEach((h, i) => { h.m.visible = i < state.hazeN; });
  };

  state.update = function (tod, cam, dt, t, air) {
    if (air) {
      const k = Math.min(1, dt * 0.6);
      for (const p of ['fog', 'overcast', 'cloud', 'wind', 'snow', 'rain', 'dust', 'thunder']) wx[p] += ((air[p] || 0) - wx[p]) * k;
      if (air.temp !== undefined) wx.temp += (air.temp - wx.temp) * k;
      for (let i = 0; i < 3; i++) wx.tint[i] += (air.tint[i] - wx.tint[i]) * k;
    }
    const over = Math.min(1, wx.overcast);
    const ang = (tod - 6) / 24 * Math.PI * 2;
    sunDir.set(-Math.cos(ang) * 0.85, Math.sin(ang), -0.35 - Math.cos(ang) * 0.1).normalize();
    moonDir.set(Math.cos(ang) * 0.7, -Math.sin(ang) * 0.9 + 0.15, 0.45).normalize();
    const y = sunDir.y;
    const day = smoothstep(-0.12, 0.12, y), gold = (1 - smoothstep(0.04, 0.42, y)) * (1 - over * 0.8);
    const night = 1 - smoothstep(-0.22, 0.02, y);
    state.night = night;
    // lightning: a bolt somewhere off across the country, a sudden white sky and ground, the thunder following as
    // long after as the sound takes to arrive
    flashT -= dt;
    if (wx.thunder > 0.25 && flashT < 0) {
      flashT = 5 + Math.random() * 16 / wx.thunder; flash = 1;
      const dist = strike(cam); bolt.visible = state.under < 0.5;
      if (state.onThunder) state.onThunder(Math.min(8, dist / 340));
    }
    flash = Math.max(0, flash - dt * (flash > 0.5 ? 9 : 3));
    boltM.opacity = flash > 0.3 ? (0.6 + Math.random() * 0.4) : 0; if (flash < 0.05) bolt.visible = false;
    const fl = flash > 0.5 ? 1 : flash * 0.6;
    const top = tmp.copy(TOP_DAY).lerp(TOP_GOLD, gold * 0.7).lerp(GREY, over * 0.75); const topC = top.clone().lerp(TOP_NIGHT, night);
    tint.setRGB(wx.tint[0], wx.tint[1], wx.tint[2]);
    const hor = HOR_DAY.clone().lerp(tint, 0.65).lerp(HOR_GOLD, gold * day * 0.85).lerp(GREY.clone().multiplyScalar(1.15), over * 0.5).lerp(HOR_NIGHT, night);
    if (fl) { topC.lerp(C(0.8, 0.84, 0.95), fl * 0.7); hor.lerp(C(0.85, 0.88, 0.98), fl * 0.6); }
    skyU.top.value.copy(topC); skyU.hor.value.copy(hor); skyU.sunDir.value.copy(sunDir); skyU.moonDir.value.copy(moonDir); skyU.night.value = night; skyU.cloud.value = over;
    skyU.sunCol.value.setRGB(1, lerp(0.92, 0.55, gold), lerp(0.75, 0.3, gold));
    // clouds drift with the wind and fill in or clear as the weather turns; coloured by the hour, grey when heavy
    const cover = Math.min(1, wx.cloud), cd = dt * 0.012 * (0.4 + state.windStrength), co = skyU.cOff.value;
    co.x = (co.x + wind.x * cd) % 200; co.y = (co.y + wind.z * cd) % 200;
    skyU.cover.value = cover; skyU.dark.value = Math.min(1, over * 0.9 + wx.thunder * 0.3 + Math.min(1, wx.rain) * 0.2);
    skyU.cloudCol.value.copy(CL_DAY).lerp(CL_GREY, over).lerp(CL_WARM, gold * day * 0.6).lerp(CL_NIGHT, night).lerp(CL_FLASH, fl * 0.8);
    fogC.copy(hor); if (wx.dust > 0.05) fogC.lerp(tint.clone().multiplyScalar(lerp(1, 0.08, night)), Math.min(1, wx.dust));
    scene.fog.color.copy(fogC);
    scene.fog.density = lerp(lerp(0.00026, 0.00042, gold * day), 0.0016, night) * state.fogMul * Math.max(0.6, wx.fog);

    const useSun = y > -0.04;
    const dir = useSun ? sunDir : moonDir;
    sun.position.set(cam.x + dir.x * 400, cam.y + dir.y * 400, cam.z + dir.z * 400);
    sun.target.position.set(cam.x, cam.y, cam.z);
    // sunlight dims under heavy cloud and blowing sand; in broken cloud it comes and goes as the clouds pass over
    const pc = Math.min(1, cover * 1.5) * (1 - over), wave = smoothstep(0.45, 0.7, 0.5 + 0.5 * Math.sin(t * 0.045 + Math.sin(t * 0.017) * 2.5));
    const dim = (1 - over * 0.78) * (1 - pc * 0.55 * wave) * (1 - Math.min(1, wx.dust) * 0.45);
    if (useSun) { sun.intensity = 3.4 * smoothstep(-0.04, 0.14, y) * dim; sun.color.setRGB(1, lerp(0.95, 0.62, gold), lerp(0.86, 0.38, gold)); }
    else { sun.intensity = 0.32 * smoothstep(-0.04, -0.25, y) * dim; sun.color.setRGB(0.55, 0.65, 0.95); }
    // stable shadows: snap the target to whole shadow texels in the light's own frame, and keep the light the same
    // distance behind it, so the light never changes direction as you move (snapping only the target made every
    // shadow jump about at train speed)
    const texel = state.shadowSpan / Math.max(512, sun.shadow.mapSize.x), tp = sun.target.position;
    _lr.set(dir.z, 0, -dir.x); if (_lr.lengthSq() < 1e-6) _lr.set(1, 0, 0); _lr.normalize();
    _lu.crossVectors(_lr, _ld.set(dir.x, dir.y, dir.z).normalize());
    const a = tp.dot(_lr), b = tp.dot(_lu);
    tp.addScaledVector(_lr, Math.round(a / texel) * texel - a).addScaledVector(_lu, Math.round(b / texel) * texel - b);
    sun.position.copy(tp).addScaledVector(_ld, 400);
    hemi.intensity = lerp(lerp(1.05, 0.7, gold * day), 0.09, night) * (1 + over * 0.25) + fl * 2.5;
    hemi.color.copy(topC).lerp(new THREE.Color(1, 1, 1), 0.35 * (1 - night));
    hemi.groundColor.setRGB(lerp(0.55, 0.05, night), lerp(0.42, 0.045, night), lerp(0.3, 0.05, night));
    // underground: no sky light, no sun, a short dark fog; lamps and your lantern do the work
    const dk = 1 - state.under * 0.93; hemi.intensity *= dk; sun.intensity *= dk;
    // ambient now comes mostly from the sky map; the hemisphere light only tops it up
    if (scene.environment) hemi.intensity *= 0.45;
    if ((envT -= dt) <= 0) {
      envT = 2.5;
      envGround.material.color.copy(hemi.groundColor).multiplyScalar(lerp(0.75, 0.25, night) * (1 - over * 0.3));
      const rt = pmrem.fromScene(envScene, 0, 0.1, 100, { size: 128 });
      if (envRT && envRT !== rt) envRT.dispose();
      envRT = rt; scene.environment = rt.texture;
    }
    // indoors, under a roof or underground, much less of the sky reaches you
    scene.environmentIntensity = (1 - state.under * 0.95) * (state.sheltered ? 0.4 : 1) * (1 + fl * 1.5);
    if (state.under > 0.01) { scene.fog.color.lerp(_dark, state.under * 0.92); scene.fog.density = lerp(scene.fog.density, 0.035, state.under); }
    dust.visible = state.under < 0.5;
    renderer.toneMappingExposure = lerp(0.95, 0.8, night) * (1 - over * 0.06);
    starMat.opacity = night * 0.95 * (1 - over) * (1 - cover * 0.85); stars.position.copy(cam); stars.rotation.y = t * 0.002;
    MAT.lamp.emissiveIntensity = night * 2.4 + smoothstep(0.3, 0.0, y) * 0.4 + over * 0.3;

    // wind: the old slow gusting, scaled by the weather
    state.windStrength = (0.45 + 0.35 * Math.sin(t * 0.07) + 0.2 * Math.sin(t * 0.31)) * (0.4 + wx.wind * 1.2);
    const ws = state.windStrength * 3;
    // dust follows the camera and drifts with the wind; a dust storm fills the air with it
    const p = dg.attributes.position.array, storm = Math.min(1, wx.dust);
    for (let i = 0; i < state.dustN; i++) {
      let x = p[i * 3] + (wind.x * ws * (1 + storm * 3) + Math.sin(t * 0.7 + dv[i] * 20) * 0.3) * dt, yy = p[i * 3 + 1] + Math.sin(t + dv[i] * 40) * 0.2 * dt, z = p[i * 3 + 2] + (wind.z * ws * (1 + storm * 3)) * dt;
      if (x > 45) x -= 90; if (x < -45) x += 90; if (z > 45) z -= 90; if (z < -45) z += 90; if (yy > 30) yy = 0; if (yy < 0) yy = 30;
      p[i * 3] = x; p[i * 3 + 1] = yy; p[i * 3 + 2] = z;
    }
    dg.attributes.position.needsUpdate = true;
    dust.position.set(cam.x, cam.y - 10, cam.z);
    dustMat.opacity = lerp(0.45, 0.12, night) * (1 - Math.min(1, wx.snow + wx.rain) * 0.8) + storm * 0.4;
    dustMat.size = 0.07 + storm * 0.08;
    dustMat.color.setRGB(1, lerp(0.88, 0.7, gold), lerp(0.7, 0.5, gold)).lerp(new THREE.Color(0.4, 0.45, 0.6), night);

    // snow: drifting flakes, thicker and sideways in a blizzard
    const sAmt = Math.min(1, wx.snow) * (state.sheltered ? 0 : 1), nS = Math.round(state.snowN * sAmt);
    snow.visible = nS > 20;
    if (snow.visible) {
      const q = sng.attributes.position.array, side = ws * (0.6 + wx.wind);
      for (let i = 0; i < nS; i++) {
        let x = q[i * 3] + (wind.x * side + Math.sin(t * 1.3 + snv[i] * 30) * 0.5) * dt, yy = q[i * 3 + 1] - (0.9 + snv[i] * 0.8) * dt, z = q[i * 3 + 2] + (wind.z * side + Math.cos(t * 1.1 + snv[i] * 20) * 0.5) * dt;
        const h = SB / 2; if (x > h) x -= SB; if (x < -h) x += SB; if (z > h) z -= SB; if (z < -h) z += SB; if (yy < 0) yy += 40;
        q[i * 3] = x; q[i * 3 + 1] = yy; q[i * 3 + 2] = z;
      }
      sng.setDrawRange(0, nS); sng.attributes.position.needsUpdate = true;
      snow.position.set(cam.x, cam.y - 14, cam.z);
      snowMat.opacity = 0.9 * Math.min(1, sAmt * 2); snowMat.color.setRGB(lerp(0.96, 0.3, night), lerp(0.97, 0.33, night), lerp(1, 0.42, night));
    }
    // rain
    const rAmt = Math.min(1, wx.rain) * (state.sheltered ? 0 : 1), nR = Math.round(state.rainN * rAmt);
    rain.visible = nR > 20;
    if (rain.visible) {
      const q = rg.attributes.position.array, vx = wind.x * ws * 1.6, vz = wind.z * ws * 1.6, vy = 22;
      for (let i = 0; i < nR; i++) {
        let x = rs[i * 3] + vx * dt, yy = rs[i * 3 + 1] - vy * dt, z = rs[i * 3 + 2] + vz * dt;
        const h = RB / 2; if (x > h) x -= RB; if (x < -h) x += RB; if (z > h) z -= RB; if (z < -h) z += RB; if (yy < 0) yy += 30;
        rs[i * 3] = x; rs[i * 3 + 1] = yy; rs[i * 3 + 2] = z;
        const o = i * 6, L = 0.045; q[o] = x; q[o + 1] = yy; q[o + 2] = z; q[o + 3] = x - vx * L; q[o + 4] = yy + vy * L; q[o + 5] = z - vz * L;
      }
      rg.setDrawRange(0, nR * 2); rg.attributes.position.needsUpdate = true;
      rain.position.set(cam.x, cam.y - 10, cam.z);
      rainMat.opacity = 0.35 * Math.min(1, rAmt * 1.6) * lerp(1, 0.4, night);
    }
    for (const h of hazes) { h.a += dt * 0.004 * (1 + storm * 4); h.m.position.set(cam.x + Math.cos(h.a) * h.r, cam.y + 30, cam.z + Math.sin(h.a) * h.r); h.m.material.opacity = (0.16 * (1 - night) + 0.03) * (1 + storm * 2.5) * (1 - Math.min(1, wx.snow + wx.rain) * 0.6); h.m.material.color.copy(fogC); }
    // sandstorm curtains streaming past, thickest out in the open
    const cur = storm * (state.sheltered ? 0.35 : 1) * (1 - state.under);
    for (const q of curtains) {
      q.m.visible = cur > 0.03; if (!q.m.visible) continue;
      q.x += wind.x * ws * 4 * dt; q.z += wind.z * ws * 4 * dt;
      if (q.x > 70) q.x -= 140; if (q.x < -70) q.x += 140; if (q.z > 70) q.z -= 140; if (q.z < -70) q.z += 140;
      q.m.position.set(cam.x + q.x, cam.y + q.y - 4, cam.z + q.z); q.m.scale.set(q.s * 2, q.s * 0.6, 1);
      q.m.material.opacity = cur * 0.5 * Math.min(1, Math.hypot(q.x, q.z) / 12); q.m.material.color.copy(fogC);
    }
    // rain soaks the ground over a minute or so and it dries over a few, fastest in desert heat and wind. Snow settles
    // over a couple of minutes while it falls below freezing, and melts when it warms or rain comes
    const rainNow = Math.min(1, wx.rain), snowNow = Math.min(1, wx.snow), temp = wx.temp;
    if (rainNow > 0.05) state.wetness = Math.min(1, state.wetness + rainNow * dt / 45);
    else state.wetness = Math.max(0, state.wetness - dt * (1 / 240 + Math.max(0, temp) / 7000) * (1 + storm));
    if (snowNow > 0.05 && temp < 1) state.snowCover = Math.min(1, state.snowCover + snowNow * dt / 100);
    else if (temp > 0.5 || rainNow > 0.1) state.snowCover = Math.max(0, state.snowCover - dt * (Math.max(0, temp) / 1500 + rainNow / 200 + 1 / 900));
    SHARED.wet.value = state.wetness; SHARED.snow.value = state.snowCover; SHARED.rain.value = state.under > 0.5 ? 0 : rainNow;
  };
  return state;
}
