// The user's scanned track piece, laid along the whole line with three levels of detail
import * as THREE from 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/three.module.js';
import { railAt } from './world.js';
import { SCAN_LEN, SCAN_SEGS } from './rail.js';
import { TEX } from './textures.js';

// pieces are pre-scaled to standard gauge: x along the track, y up (rail tops ≈ 0.31 above the ballast), z across
const LEVELS = [['models/track_near.obj', 45], ['models/track_mid.obj', 160], ['models/track_far.obj', 700]];

function parse(text) {
  const P = [], I = [];
  for (const line of text.split('\n')) {
    if (line.charCodeAt(0) === 118 && line.charCodeAt(1) === 32) { const a = line.split(' '); P.push(+a[1], +a[2], +a[3]); }
    else if (line.charCodeAt(0) === 102) { const a = line.split(' '); I.push(a[1] - 1, a[2] - 1, a[3] - 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I); g.computeVertexNormals();
  // colour by what each part of the scan is: rail heads, sleepers, or gravel
  const n = P.length / 3, col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], az = Math.abs(z);
    let r, gg, b;
    if (az > 0.66 && az < 0.85 && y > 0.235) { const t = Math.min(1, (y - 0.235) / 0.07); r = 0.36 + t * 0.22; gg = 0.3 + t * 0.2; b = 0.27 + t * 0.2; }
    else if (y > 0.17 && az < 1.32) { r = 0.42; gg = 0.31; b = 0.22; }
    else { const k = 0.82 + 0.18 * Math.sin(x * 9.1 + z * 13.7); r = 0.62 * k; gg = 0.56 * k; b = 0.5 * k; }
    col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b;
    uv[i * 2] = x * 0.6; uv[i * 2 + 1] = z * 0.6;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}

export async function loadTrackScan(scene) {
  const texts = await Promise.all(LEVELS.map(([u]) => fetch(u).then(r => { if (!r.ok) throw new Error('missing ' + u); return r.text(); })));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: TEX.gravel, bumpMap: TEX.gravel, bumpScale: 1.2, roughness: 0.9, metalness: 0.05 });
  // every piece's transform is fixed, so work them out once
  const N = SCAN_SEGS.length, mats = new Float32Array(N * 16), cx = new Float32Array(N), cz = new Float32Array(N);
  const m = new THREE.Matrix4(), X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), A = new THREE.Vector3(), Bv = new THREE.Vector3();
  SCAN_SEGS.forEach((s, i) => {
    const a = railAt(s - SCAN_LEN / 2), b = railAt(s + SCAN_LEN / 2);
    A.set(a.x, a.y, a.z); Bv.set(b.x, b.y, b.z);
    X.subVectors(Bv, A).normalize(); Z.crossVectors(X, up).normalize(); Y.crossVectors(Z, X);
    m.makeBasis(X, Y, Z).setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    m.toArray(mats, i * 16); cx[i] = (a.x + b.x) / 2; cz[i] = (a.z + b.z) / 2;
  });
  const meshes = texts.map((t, li) => {
    const im = new THREE.InstancedMesh(parse(t), mat, N);
    im.count = 0; im.frustumCulled = false; im.receiveShadow = true; im.castShadow = li === 0;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(im); return im;
  });
  let timer = 0;
  return function update(cam, dt, k = 1) {
    if ((timer -= dt) > 0) return; timer = 0.2;
    const cnt = [0, 0, 0], arr = meshes.map(mm => mm.instanceMatrix.array);
    for (let i = 0; i < N; i++) {
      const d = Math.hypot(cx[i] - cam.x, cz[i] - cam.z);
      const lvl = d < LEVELS[0][1] ? 0 : d < LEVELS[1][1] * k ? 1 : d < LEVELS[2][1] * k ? 2 : -1;
      if (lvl < 0) continue;
      arr[lvl].set(mats.subarray(i * 16, i * 16 + 16), cnt[lvl] * 16); cnt[lvl]++;
    }
    meshes.forEach((mm, l) => { mm.count = cnt[l]; mm.instanceMatrix.needsUpdate = true; });
  };
}
