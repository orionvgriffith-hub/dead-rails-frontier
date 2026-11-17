// Post-processing for the graphics settings: MSAA or FXAA anti-aliasing, screen-space ambient occlusion and camera
// motion blur, then tone mapping. With all of them off the scene renders straight to the screen at no extra cost.
import * as THREE from 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/three.module.js';

const FRAG = /* glsl */`
uniform sampler2D tColor, tDepth;
uniform vec2 res;
uniform mat4 projInv, reproj;
uniform float useDepth, fxaa, ao, aoRadius, projScale, blur;
varying vec2 vUv;
float luma(vec3 c) { c = c / (1.0 + c); return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 viewPos(vec2 uv) { float d = texture2D(tDepth, uv).x; vec4 v = projInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return v.xyz / v.w; }
void main() {
  vec2 px = 1.0 / res;
  vec3 col = texture2D(tColor, vUv).rgb;
  if (fxaa > 0.5) {
    vec3 cNW = texture2D(tColor, vUv + vec2(-1.0, -1.0) * px).rgb, cNE = texture2D(tColor, vUv + vec2(1.0, -1.0) * px).rgb;
    vec3 cSW = texture2D(tColor, vUv + vec2(-1.0, 1.0) * px).rgb, cSE = texture2D(tColor, vUv + vec2(1.0, 1.0) * px).rgb;
    float lNW = luma(cNW), lNE = luma(cNE), lSW = luma(cSW), lSE = luma(cSE), lM = luma(col);
    float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
    vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
    float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
    float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
    dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * px;
    vec3 rA = 0.5 * (texture2D(tColor, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tColor, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
    vec3 rB = rA * 0.5 + 0.25 * (texture2D(tColor, vUv - dir * 0.5).rgb + texture2D(tColor, vUv + dir * 0.5).rgb);
    float lB = luma(rB);
    col = (lB < lMin || lB > lMax) ? rA : rB;
  }
  if (useDepth > 0.5) {
    float d = texture2D(tDepth, vUv).x;
    if (ao > 0.0 && d < 1.0) {
      vec3 P = viewPos(vUv);
      vec3 N = normalize(cross(dFdx(P), dFdy(P)));
      if (dot(N, P) > 0.0) N = -N;
      float dist = -P.z;
      if (dist < 140.0) {
        float pr = min(aoRadius * projScale / dist, 70.0);
        float rot = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
        float occ = 0.0;
        for (int i = 0; i < 12; i++) {
          float fi = float(i), a = fi * 2.39996 + rot, rr = (fi + 0.5) / 12.0;
          vec3 S = viewPos(vUv + vec2(cos(a), sin(a)) * rr * pr * px);
          vec3 v = S - P; float L = length(v);
          occ += max(0.0, dot(v / max(L, 1e-4), N) - 0.12) * (1.0 - smoothstep(aoRadius * 0.6, aoRadius * 1.6, L));
        }
        occ = occ / 12.0 * (1.0 - smoothstep(90.0, 140.0, dist));
        col *= 1.0 - clamp(occ * ao * 1.6, 0.0, 0.75);
      }
    }
    if (blur > 0.0) {
      vec4 v = projInv * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); v /= v.w;
      vec4 pc = reproj * vec4(v.xyz, 1.0);
      vec2 vel = (vUv - (pc.xy / pc.w * 0.5 + 0.5)) * blur;
      float L = length(vel); if (L > 0.04) vel *= 0.04 / L;
      if (L > 0.0006) {
        vec3 acc = col;
        for (int i = 1; i < 9; i++) acc += texture2D(tColor, vUv + vel * (float(i) / 8.0 - 0.5)).rgb;
        col = acc / 9.0;
      }
    }
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createPost(renderer) {
  const U = {
    tColor: { value: null }, tDepth: { value: null }, res: { value: new THREE.Vector2(1, 1) },
    projInv: { value: new THREE.Matrix4() }, reproj: { value: new THREE.Matrix4() },
    useDepth: { value: 0 }, fxaa: { value: 0 }, ao: { value: 0 }, aoRadius: { value: 0.9 }, projScale: { value: 500 }, blur: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: U, depthTest: false, depthWrite: false, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: FRAG });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const qs = new THREE.Scene(); qs.add(quad); const qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let rt = null, key = '';
  const size = new THREE.Vector2(), vp = new THREE.Matrix4(), prev = new THREE.Matrix4(), rp = new THREE.Matrix4();
  let havePrev = false;

  return {
    // o: { aa: 'off' | 'fxaa' | 'msaa', ao: 0..1, blur: 0..1, carry: Matrix4 or null }. carry maps where things are now to where
    // they were last frame when you ride something (the train): the cab moves with you, so it must not smear
    render(scene, camera, o) {
      const needDepth = o.ao > 0 || o.blur > 0, need = o.aa !== 'off' || needDepth;
      camera.updateMatrixWorld();
      vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      if (!need) { renderer.setRenderTarget(null); renderer.render(scene, camera); prev.copy(vp); havePrev = true; return; }
      renderer.getDrawingBufferSize(size);
      const samples = o.aa === 'msaa' ? 4 : 0, k = `${size.x}x${size.y}:${samples}:${needDepth}`;
      if (k !== key) {
        if (rt) rt.dispose();
        rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples, depthBuffer: true });
        // always attach a float depth texture: without one the target can fall back to a 16-bit depth buffer, which across a
        // 20 km view lets distant hills and the under-map horizon ring bleed through nearby ground as walls, holes and flicker
        rt.depthTexture = new THREE.DepthTexture(size.x, size.y, THREE.FloatType);
        key = k;
      }
      renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null);
      U.tColor.value = rt.texture; U.tDepth.value = rt.depthTexture || null; U.useDepth.value = needDepth ? 1 : 0;
      U.res.value.copy(size); U.fxaa.value = o.aa === 'fxaa' ? 1 : 0; U.ao.value = o.ao; U.blur.value = havePrev ? o.blur : 0;
      U.projInv.value.copy(camera.projectionMatrixInverse);
      // current view space to last frame's clip space, worked out here in double precision rather than from world
      // positions in the shader, which lose millimetres far from the middle of the map and made the blur shimmer
      rp.copy(prev); if (o.carry) rp.multiply(o.carry); U.reproj.value.multiplyMatrices(rp, camera.matrixWorld);
      U.projScale.value = size.y * 0.5 * camera.projectionMatrix.elements[5];
      renderer.render(qs, qc);
      prev.copy(vp); havePrev = true;
    },
    // a teleport or respawn shouldn't smear the whole screen
    resetMotion() { havePrev = false; },
  };
}
