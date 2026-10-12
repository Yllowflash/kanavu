/* ============================================================================
 * Kanavu — kanavu-world.js  (Phase 1: premium 3D rebuild — world foundation)
 * ----------------------------------------------------------------------------
 * Open-world twin islands + hanging rope bridge, warm sunset lighting with
 * real-time day/night cycle, third-person follow camera, WASD + touch
 * joystick movement, placeholder player, 180-degree frustum loading.
 *
 * Visual target: Pixar-style cozy sunset (warm orange/pink sky, golden
 * water, lit windows/lanterns at night). Two mirrored islands joined by a
 * hanging bridge. Premium low-poly detail: proper trees, flowers, rocks.
 *
 * API:
 *   var api = KanavuWorld.init('canvasId');
 *   api.setTimeOfDay(hour)   // 0-24, or null to follow local time
 *   api.getPlayerPos()       // {x,y,z}
 *   api.destroy()
 *
 * Requires Three.js r160 global (CDN):
 *   https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js
 * Vanilla JS, no build step. iPhone Safari friendly.
 * ========================================================================== */
(function () {
'use strict';

/* ============================== utils =================================== */
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(a, b, x) {
  var t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
/* deterministic PRNG so the world looks the same every load */
function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* cheap 2D value noise in [-1,1] */
function makeNoise2(seed) {
  var rand = mulberry32(seed);
  var gx = 64, gy = 64, grid = new Float32Array(gx * gy);
  for (var i = 0; i < gx * gy; i++) grid[i] = rand() * 2 - 1;
  function at(ix, iy) {
    ix = ((ix % gx) + gx) % gx; iy = ((iy % gy) + gy) % gy;
    return grid[iy * gx + ix];
  }
  return function (x, y) {
    var ix = Math.floor(x), iy = Math.floor(y);
    var fx = x - ix, fy = y - iy;
    var sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    var a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
    return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
  };
}
var noise2 = makeNoise2(1337);

/* ============================== config ==================================== */
var ISL_R = 60;                 // island radius (~120 wide)
var ISL_A = { cx: -90, cz: 0 }; // left island center
var ISL_B = { cx: 90, cz: 0 };  // right island center (mirrored)
var ISL_H = 7;                  // island peak height
var WATER_Y = 0;
var BRIDGE_HALF = 50;           // bridge spans x in [-50, 50]
var BRIDGE_DECK = 3.4;          // deck height at anchors
var BRIDGE_SAG = 1.6;
var BRIDGE_W = 5.2;             // walkable half-width 2.6

/* day/night keyframes: [hour, topSky, horizon, fog, sunColor, sunI, hemiI, ambI, stars, waterDeep, waterShallow] */
var SKY_KEYS = [
  [0.0,  0x0a0f2e, 0x182040, 0x131a36, 0x9db4ff, 0.22, 0.22, 0.10, 1.0, 0x061224, 0x0e2a44],
  [5.0,  0x0a0f2e, 0x182040, 0x131a36, 0x9db4ff, 0.22, 0.22, 0.10, 1.0, 0x061224, 0x0e2a44],
  [6.5,  0x8a7fc0, 0xf2a56b, 0xc98a6a, 0xffc98a, 0.70, 0.45, 0.16, 0.0, 0x1a3a5c, 0x4a7a94],
  [9.0,  0x62b4e8, 0xcfeaf2, 0xbcd8e8, 0xfff3da, 1.25, 0.70, 0.22, 0.0, 0x14507e, 0x3f9db8],
  [15.0, 0x5aa9e6, 0xd8f0fa, 0xc2dcee, 0xfff6e0, 1.30, 0.72, 0.22, 0.0, 0x14507e, 0x3f9db8],
  [17.0, 0x7a6fc0, 0xff9a5c, 0xe89a6a, 0xffb46b, 1.05, 0.60, 0.20, 0.0, 0x1a4a6e, 0x5a9ab0],
  [18.5, 0x4a3f78, 0xff7a5c, 0xb86a68, 0xff8a4b, 0.90, 0.50, 0.18, 0.0, 0x24345e, 0x8a6a70],
  [20.0, 0x1c2450, 0x4a3a6b, 0x2a2a4e, 0xb08ac0, 0.45, 0.32, 0.13, 0.4, 0x0e1e3c, 0x2a4a62],
  [21.5, 0x0a0f2e, 0x182040, 0x131a36, 0x9db4ff, 0.22, 0.22, 0.10, 1.0, 0x061224, 0x0e2a44],
  [24.0, 0x0a0f2e, 0x182040, 0x131a36, 0x9db4ff, 0.22, 0.22, 0.10, 1.0, 0x061224, 0x0e2a44]
];
/* ========================= terrain height ================================ */
function islandHeight(x, z, c) {
  var dx = (x - c.cx) / ISL_R, dz = (z - c.cz) / ISL_R;
  var d2 = dx * dx + dz * dz;
  if (d2 >= 1) return -2.5;
  var d = Math.sqrt(d2);
  var h = ISL_H * Math.pow(1 - d2, 1.35);
  h += noise2(x * 0.045 + c.cx, z * 0.045) * 1.3 * (1 - d); // gentle bumps
  h += noise2(x * 0.15, z * 0.15 + c.cz) * 0.35 * (1 - d);
  return h;
}
function groundHeight(x, z) {
  var ha = islandHeight(x, z, ISL_A), hb = islandHeight(x, z, ISL_B);
  return ha > hb ? ha : hb;
}
/* slope estimate for rock coloring (finite differences) */
function groundSlope(x, z) {
  var e = 1.2;
  var dx = (groundHeight(x + e, z) - groundHeight(x - e, z)) / (2 * e);
  var dz = (groundHeight(x, z + e) - groundHeight(x, z - e)) / (2 * e);
  return Math.sqrt(dx * dx + dz * dz);
}
/* bridge deck curve */
function bridgeDeckY(x) {
  var t = (x + BRIDGE_HALF) / (BRIDGE_HALF * 2);
  return BRIDGE_DECK - BRIDGE_SAG * Math.sin(Math.PI * clamp(t, 0, 1));
}
function onBridge(x, z) {
  return Math.abs(x) <= BRIDGE_HALF + 1.5 && Math.abs(z) <= BRIDGE_W / 2;
}
/* walkable surface height; returns -999 if not walkable (water) */
function walkHeight(x, z) {
  if (onBridge(x, z) && Math.abs(x) <= BRIDGE_HALF) return bridgeDeckY(x);
  var h = groundHeight(x, z);
  return h > 0.45 ? h : -999;
}

/* ========================= sky palette =================================== */
var _skyTmp = {};
function sampleSky(hour) {
  var h = ((hour % 24) + 24) % 24, i = 0;
  while (i < SKY_KEYS.length - 2 && SKY_KEYS[i + 1][0] <= h) i++;
  var k0 = SKY_KEYS[i], k1 = SKY_KEYS[i + 1];
  var t = (h - k0[0]) / Math.max(0.0001, k1[0] - k0[0]);
  t = clamp(t, 0, 1);
  var out = _skyTmp;
  out.top = lerpColor(k0[1], k1[1], t); out.horizon = lerpColor(k0[2], k1[2], t);
  out.fog = lerpColor(k0[3], k1[3], t);
  out.sunColor = lerpColor(k0[4], k1[4], t);
  out.sunI = lerp(k0[5], k1[5], t); out.hemiI = lerp(k0[6], k1[6], t);
  out.ambI = lerp(k0[7], k1[7], t); out.stars = lerp(k0[8], k1[8], t);
  out.waterDeep = lerpColor(k0[9], k1[9], t);
  out.waterShallow = lerpColor(k0[10], k1[10], t);
  /* darkness: 0 = full day, 1 = full night (drives lanterns/fireflies) */
  out.darkness = clamp(1 - (out.sunI - 0.22) / (1.3 - 0.22), 0, 1);
  out.darkness = smoothstep(0.15, 0.75, out.darkness);
  return out;
}
function lerpColor(hexA, hexB, t) {
  var ar = (hexA >> 16) & 255, ag = (hexA >> 8) & 255, ab = hexA & 255;
  var br = (hexB >> 16) & 255, bg = (hexB >> 8) & 255, bb = hexB & 255;
  return (Math.round(lerp(ar, br, t)) << 16) | (Math.round(lerp(ag, bg, t)) << 8) | Math.round(lerp(ab, bb, t));
}
/* ========================= world object ================================== */
var KanavuWorld = (function () {

function createGlowTexture(inner, outer) {
  var c = document.createElement('canvas'); c.width = c.height = 128;
  var g = c.getContext('2d');
  var grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, inner); grd.addColorStop(1, outer);
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  var tex = new THREE.CanvasTexture(c);
  return tex;
}

function init(canvasId) {
  if (typeof THREE === 'undefined') throw new Error('Three.js r160 required');
  var canvas = typeof canvasId === 'string' ? document.getElementById(canvasId) : canvasId;

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x5aa9e6);
  scene.fog = new THREE.Fog(0xc2dcee, 130, 420);

  var camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 1200);

  /* ---------------- lights ---------------- */
  var sun = new THREE.DirectionalLight(0xfff3da, 1.25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -140; sun.shadow.camera.right = 140;
  sun.shadow.camera.top = 140; sun.shadow.camera.bottom = -140;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0006;
  scene.add(sun); scene.add(sun.target);
  var hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a6a4a, 0.7);
  scene.add(hemi);
  var amb = new THREE.AmbientLight(0xffffff, 0.22);
  scene.add(amb);

  /* ---------------- sky dome (gradient shader) ---------------- */
  var skyUniforms = {
    topColor: { value: new THREE.Color(0x5aa9e6) },
    horizonColor: { value: new THREE.Color(0xd8f0fa) },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    sunColor: { value: new THREE.Color(0xfff3da) },
    sunI: { value: 1.0 }
  };
  var skyMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: [
      'varying vec3 vDir;',
      'void main(){ vDir = normalize(position);',
      ' gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }'
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 topColor; uniform vec3 horizonColor;',
      'uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunI;',
      'varying vec3 vDir;',
      'void main(){',
      ' float h = clamp(vDir.y, 0.0, 1.0);',
      ' vec3 col = mix(horizonColor, topColor, pow(h, 0.65));',
      ' float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);',
      ' col += sunColor * (pow(s, 350.0) * 1.2 + pow(s, 8.0) * 0.25) * sunI;',
      ' if (vDir.y < 0.0) col = horizonColor * 0.55;',
      ' gl_FragColor = vec4(col, 1.0); }'
    ].join('\n')
  });
  var skyDome = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), skyMat);
  scene.add(skyDome);

  /* ---------------- stars ---------------- */
  var starGeo = new THREE.BufferGeometry();
  (function () {
    var N = 450, pos = new Float32Array(N * 3), r = mulberry32(77);
    for (var i = 0; i < N; i++) {
      var th = r() * Math.PI * 2, ph = Math.acos(r() * 0.85);
      pos[i * 3] = 850 * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = 850 * Math.cos(ph) + 40;
      pos[i * 3 + 2] = 850 * Math.sin(ph) * Math.sin(th);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  })();
  var starMat = new THREE.PointsMaterial({
    color: 0xffffff, size: 2.2, sizeAttenuation: false,
    transparent: true, opacity: 0, depthWrite: false, fog: false
  });
  var stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  /* ---------------- water (animated shader) ---------------- */
  var waterUniforms = {
    uTime: { value: 0 },
    deepColor: { value: new THREE.Color(0x14507e) },
    shallowColor: { value: new THREE.Color(0x3f9db8) },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    sunColor: { value: new THREE.Color(0xfff3da) },
    sunI: { value: 1.0 }
  };
  var waterMat = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    fog: false,
    vertexShader: [
      'uniform float uTime;',
      'varying vec3 vPos; varying float vWave;',
      'void main(){',
      ' vec3 p = position;',
      ' float w = sin(p.x*0.11 + uTime*1.1)*0.35 + sin(p.z*0.13 - uTime*0.9)*0.3',
      '         + sin((p.x+p.z)*0.05 + uTime*0.5)*0.45;',
      ' p.y += w; vWave = w;',
      ' vPos = (modelMatrix * vec4(p,1.0)).xyz;',
      ' gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }'
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 deepColor; uniform vec3 shallowColor;',
      'uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunI;',
      'uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;',
      'varying vec3 vPos; varying float vWave;',
      'void main(){',
      ' vec3 col = mix(deepColor, shallowColor, clamp(0.45 + vWave*0.55, 0.0, 1.0));',
      /* fake sparkle: ripple normal perturb -> sun glint */
      ' float g1 = sin(vPos.x*0.9)*cos(vPos.z*0.8);',
      ' vec3 n = normalize(vec3(g1*0.12, 1.0, cos(vPos.x*0.7)*0.12));',
      ' vec3 vdir = normalize(cameraPosition - vPos);',
      ' vec3 hv = normalize(vdir + normalize(sunDir));',
      ' float spec = pow(max(dot(n, hv), 0.0), 90.0);',
      ' col += sunColor * spec * 0.9 * sunI;',
      ' float dist = length(cameraPosition - vPos);',
      ' float f = smoothstep(fogNear, fogFar, dist);',
      ' col = mix(col, fogColor, f);',
      ' gl_FragColor = vec4(col, 0.94); }'
    ].join('\n'),
    transparent: true
  });
  waterUniforms.fogColor = { value: new THREE.Color(0xc2dcee) };
  waterUniforms.fogNear = { value: 130 };
  waterUniforms.fogFar = { value: 420 };
  var water = new THREE.Mesh(new THREE.PlaneGeometry(900, 900, 72, 72), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y;
  water.receiveShadow = true;
  scene.add(water);
  /* ---------------- islands ----------------
     Mirrored pair: displaced planes with vertex colors
     (grass / sand shoreline / rock on steep slopes). */
  var dummyColor = new THREE.Color();
  function buildIsland(center, seed) {
    var size = ISL_R * 2 + 14, seg = 100;
    var geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    var posA = geo.attributes.position;
    var colors = new Float32Array(posA.count * 3);
    var rand = mulberry32(seed);
    for (var i = 0; i < posA.count; i++) {
      var x = posA.getX(i) + center.cx, z = posA.getZ(i) + center.cz;
      var h = islandHeight(x, z, center);
      var y = h < -2 ? -2.5 : h; // underwater skirt
      posA.setY(i, y);
      posA.setX(i, x); posA.setZ(i, z);

      /* color by height + slope + noise variation */
      var sl = h > 0 ? groundSlope(x, z) : 0;
      var n = noise2(x * 0.08 + seed, z * 0.08);
      var r, g, b;
      if (y < 0.25) {           /* underwater rock/sand */
        r = 0.42; g = 0.44; b = 0.40;
      } else if (y < 1.5) {     /* sandy shoreline */
        var sv = 0.86 + n * 0.05;
        r = 0.92 * sv; g = 0.80 * sv; b = 0.60 * sv;
      } else if (sl > 0.85) {   /* steep -> rock */
        var rv = 0.52 + n * 0.07;
        r = rv; g = rv * 0.96; b = rv * 0.90;
      } else {                  /* grass with warm variation */
        var gv = 0.9 + n * 0.14;
        r = 0.36 * gv; g = 0.55 * gv; b = 0.30 * gv;
        /* dry warm patches */
        var patch = noise2(x * 0.03 + 99, z * 0.03);
        if (patch > 0.45) { r = 0.55 * gv; g = 0.52 * gv; b = 0.30 * gv; }
      }
      colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    var mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true; mesh.castShadow = false;
    scene.add(mesh);
    return mesh;
  }
  buildIsland(ISL_A, 11);
  buildIsland(ISL_B, 22);

  /* ---------------- scatter: trees / rocks / flowers / bushes -------------
     Instanced meshes grouped per island quadrant for 180-degree LOD. */
  var lodChunks = []; // {obj, cx, cz}
  function registerChunk(obj, cx, cz) {
    scene.add(obj);
    lodChunks.push({ obj: obj, cx: cx, cz: cz });
  }
  var _dummy = new THREE.Object3D();
  function scatterPositions(center, count, seed, minH, excl) {
    var rand = mulberry32(seed), pts = [], tries = 0;
    while (pts.length < count && tries < count * 40) {
      tries++;
      var a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * ISL_R * 0.94;
      var x = center.cx + Math.cos(a) * rr, z = center.cz + Math.sin(a) * rr;
      var h = groundHeight(x, z);
      if (h < minH) continue;
      if (excl && excl(x, z, h)) continue;
      pts.push({ x: x, z: z, h: h, s: 0.75 + rand() * 0.6, r: rand() * Math.PI * 2 });
    }
    return pts;
  }
  /* keep bridge corridor + campfire + future building plots clear */
  function clearOfFeatures(x, z) {
    if (Math.abs(z) < 10 && Math.abs(x) < 72) return true;   // bridge corridor
    if (Math.hypot(x - ISL_A.cx, z - ISL_A.cz) < 15) return true; // plaza A
    if (Math.hypot(x - ISL_B.cx, z - ISL_B.cz) < 15) return true; // plaza B
    if (Math.hypot(x + 70, z - 25) < 9) return true;          // campfire
    return false;
  }
  /* premium low-poly tree: trunk + 2-3 foliage blobs (NOT cones) */
  var trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 2.6, 7);
  var trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 });
  var folGeo = new THREE.IcosahedronGeometry(2.2, 1);
  var folMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  var folColors = [0x4a7a3e, 0x5d8a44, 0x3e6e38, 0x6fa055, 0x557f42];
  function buildTrees(center, seed) {
    var pts = scatterPositions(center, 34, seed, 2.0, function (x, z) { return clearOfFeatures(x, z); });
    var quads = [[], [], [], []];
    pts.forEach(function (p) {
      var q = (p.x < center.cx ? 0 : 1) + (p.z < center.cz ? 0 : 2);
      quads[q].push(p);
    });
    quads.forEach(function (qp, qi) {
      if (!qp.length) return;
      var grp = new THREE.Group();
      var trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, qp.length);
      var f1 = new THREE.InstancedMesh(folGeo, folMat.clone(), qp.length);
      var f2 = new THREE.InstancedMesh(folGeo, folMat.clone(), qp.length);
      var ccx = 0, ccz = 0;
      qp.forEach(function (p, i) {
        ccx += p.x; ccz += p.z;
        _dummy.position.set(p.x, p.h + 1.3 * p.s, p.z);
        _dummy.scale.setScalar(p.s); _dummy.rotation.y = p.r;
        _dummy.updateMatrix(); trunks.setMatrixAt(i, _dummy.matrix);
        var fc = folColors[Math.floor(mulberry32(seed + i)() * folColors.length)];
        _dummy.position.set(p.x, p.h + (2.6 + 1.6) * p.s, p.z);
        _dummy.scale.set(p.s * (0.9 + 0.3 * ((i * 7) % 3) / 2), p.s, p.s * (0.9 + 0.3 * ((i * 5) % 3) / 2));
        _dummy.updateMatrix(); f1.setMatrixAt(i, _dummy.matrix);
        f1.setColorAt(i, dummyColor.setHex(fc));
        _dummy.position.set(p.x + 0.9 * p.s, p.h + (2.6 + 2.6) * p.s, p.z + 0.5 * p.s);
        _dummy.scale.setScalar(p.s * 0.62);
        _dummy.updateMatrix(); f2.setMatrixAt(i, _dummy.matrix);
        f2.setColorAt(i, dummyColor.setHex(fc).multiplyScalar(1.08));
      });
      trunks.castShadow = true; f1.castShadow = true; f2.castShadow = true;
      trunks.instanceMatrix.needsUpdate = true;
      f1.instanceMatrix.needsUpdate = true; f2.instanceMatrix.needsUpdate = true;
      if (f1.instanceColor) f1.instanceColor.needsUpdate = true;
      if (f2.instanceColor) f2.instanceColor.needsUpdate = true;
      grp.add(trunks); grp.add(f1); grp.add(f2);
      registerChunk(grp, ccx / qp.length, ccz / qp.length);
    });
  }
  buildTrees(ISL_A, 101); buildTrees(ISL_B, 202);
  /* shared glow texture + lantern sprite registry (defined before bridge) */
  var glowTex = createGlowTexture('rgba(255,200,120,1)', 'rgba(255,150,60,0)');
  var lanternSprites = [];
  /* rocks */
  var rockGeo = new THREE.DodecahedronGeometry(1, 0);
  var rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8a86, roughness: 1, flatShading: true });
  function buildRocks(center, seed) {
    var pts = scatterPositions(center, 22, seed, 0.4, function (x, z) { return clearOfFeatures(x, z); });
    var grp = new THREE.Group(), ccx = 0, ccz = 0;
    var inst = new THREE.InstancedMesh(rockGeo, rockMat, Math.max(pts.length, 1));
    pts.forEach(function (p, i) {
      ccx += p.x; ccz += p.z;
      _dummy.position.set(p.x, p.h + 0.15 * p.s, p.z);
      _dummy.scale.set(p.s * (0.7 + (i % 3) * 0.3), p.s * 0.55, p.s * (0.7 + ((i + 1) % 3) * 0.3));
      _dummy.rotation.set(0, p.r, 0); _dummy.updateMatrix();
      inst.setMatrixAt(i, _dummy.matrix);
    });
    inst.count = pts.length;
    inst.castShadow = true; inst.receiveShadow = true;
    inst.instanceMatrix.needsUpdate = true;
    grp.add(inst);
    if (pts.length) registerChunk(grp, ccx / pts.length, ccz / pts.length);
  }
  buildRocks(ISL_A, 303); buildRocks(ISL_B, 404);
  /* flowers: tiny bright instanced blooms */
  var flGeo = new THREE.IcosahedronGeometry(0.32, 0);
  var flMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, emissive: 0x222222 });
  var flCols = [0xff8ab0, 0xffd166, 0xff6b6b, 0xc39bff, 0xffffff, 0xff9a5c];
  function buildFlowers(center, seed) {
    var pts = scatterPositions(center, 70, seed, 1.6, function (x, z) { return clearOfFeatures(x, z); });
    var grp = new THREE.Group(), ccx = 0, ccz = 0;
    var inst = new THREE.InstancedMesh(flGeo, flMat.clone(), Math.max(pts.length, 1));
    pts.forEach(function (p, i) {
      ccx += p.x; ccz += p.z;
      _dummy.position.set(p.x, p.h + 0.35, p.z);
      _dummy.scale.setScalar(0.7 + (i % 4) * 0.18);
      _dummy.rotation.y = p.r; _dummy.updateMatrix();
      inst.setMatrixAt(i, _dummy.matrix);
      inst.setColorAt(i, dummyColor.setHex(flCols[i % flCols.length]));
    });
    inst.count = pts.length;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    grp.add(inst);
    if (pts.length) registerChunk(grp, ccx / pts.length, ccz / pts.length);
  }
  buildFlowers(ISL_A, 505); buildFlowers(ISL_B, 606);
  /* bushes */
  var bushGeo = new THREE.IcosahedronGeometry(1.4, 1);
  var bushMat = new THREE.MeshStandardMaterial({ color: 0x3e6e38, roughness: 1 });
  function buildBushes(center, seed) {
    var pts = scatterPositions(center, 26, seed, 1.8, function (x, z) { return clearOfFeatures(x, z); });
    var grp = new THREE.Group(), ccx = 0, ccz = 0;
    var inst = new THREE.InstancedMesh(bushGeo, bushMat, Math.max(pts.length, 1));
    pts.forEach(function (p, i) {
      ccx += p.x; ccz += p.z;
      _dummy.position.set(p.x, p.h + 0.6 * p.s, p.z);
      _dummy.scale.set(p.s * 1.2, p.s * 0.75, p.s * 1.2);
      _dummy.rotation.y = p.r; _dummy.updateMatrix();
      inst.setMatrixAt(i, _dummy.matrix);
    });
    inst.count = pts.length;
    inst.castShadow = true;
    inst.instanceMatrix.needsUpdate = true;
    grp.add(inst);
    if (pts.length) registerChunk(grp, ccx / pts.length, ccz / pts.length);
  }
  buildBushes(ISL_A, 707); buildBushes(ISL_B, 808);

  /* ---------------- hanging rope bridge ---------------- */
  var bridgeGroup = new THREE.Group();
  var lanternMats = [];
  (function buildBridge() {
    var N = 76;
    var plankGeo = new THREE.BoxGeometry(1.15, 0.22, BRIDGE_W);
    var plankMat = new THREE.MeshStandardMaterial({ color: 0x8a5f36, roughness: 0.9 });
    var planks = new THREE.InstancedMesh(plankGeo, plankMat, N);
    var ropePtsL = [], ropePtsR = [];
    for (var i = 0; i < N; i++) {
      var t = i / (N - 1);
      var x = lerp(-BRIDGE_HALF, BRIDGE_HALF, t);
      var y = bridgeDeckY(x);
      _dummy.position.set(x, y, 0);
      _dummy.rotation.set(0, 0, Math.sin(t * Math.PI) * 0.03);
      _dummy.scale.set(1, 1, 1); _dummy.updateMatrix();
      planks.setMatrixAt(i, _dummy.matrix);
      ropePtsL.push(new THREE.Vector3(x, y + 1.15, -BRIDGE_W / 2 - 0.15));
      ropePtsR.push(new THREE.Vector3(x, y + 1.15, BRIDGE_W / 2 + 0.15));
    }
    planks.instanceMatrix.needsUpdate = true;
    planks.castShadow = true; planks.receiveShadow = true;
    bridgeGroup.add(planks);
    /* rope rails: catenary tubes */
    var ropeMat = new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 1 });
    [ropePtsL, ropePtsR].forEach(function (pts) {
      var curve = new THREE.CatmullRomCurve3(pts);
      var tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.09, 6), ropeMat);
      bridgeGroup.add(tube);
      /* lower rope */
      var low = pts.map(function (p) { return new THREE.Vector3(p.x, p.y - 0.75, p.z); });
      var tube2 = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(low), 60, 0.07, 6), ropeMat);
      bridgeGroup.add(tube2);
    });
    /* vertical posts every ~8 planks */
    var postGeo = new THREE.CylinderGeometry(0.12, 0.14, 1.5, 6);
    for (var j = 0; j < N; j += 8) {
      var t2 = j / (N - 1), x2 = lerp(-BRIDGE_HALF, BRIDGE_HALF, t2), y2 = bridgeDeckY(x2);
      [-1, 1].forEach(function (s) {
        var post = new THREE.Mesh(postGeo, ropeMat);
        post.position.set(x2, y2 + 0.65, s * (BRIDGE_W / 2 + 0.15));
        bridgeGroup.add(post);
      });
    }
    /* hanging lanterns along the bridge (glow at night) */
    var lanGeo = new THREE.SphereGeometry(0.42, 10, 10);
    for (var k = 0; k < N; k += 10) {
      var t3 = k / (N - 1), x3 = lerp(-BRIDGE_HALF, BRIDGE_HALF, t3), y3 = bridgeDeckY(x3);
      var lm = new THREE.MeshStandardMaterial({
        color: 0xffd9a0, emissive: 0xff9a3c, emissiveIntensity: 0.25, roughness: 0.6
      });
      var lan = new THREE.Mesh(lanGeo, lm);
      lan.position.set(x3, y3 + 0.55, (k % 20 === 0 ? -1 : 1) * (BRIDGE_W / 2 - 0.4));
      bridgeGroup.add(lan);
      lanternMats.push(lm);
      /* glow sprite */
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: 0xffb46b, transparent: true, opacity: 0.0,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      sp.scale.set(3.2, 3.2, 1);
      sp.position.copy(lan.position);
      bridgeGroup.add(sp);
      lanternSprites.push(sp);
    }
    /* anchor posts at both ends */
    var anchGeo = new THREE.CylinderGeometry(0.5, 0.65, 4.5, 8);
    var anchMat = new THREE.MeshStandardMaterial({ color: 0x4a3320, roughness: 1 });
    [-1, 1].forEach(function (s) {
      [-1, 1].forEach(function (q) {
        var a = new THREE.Mesh(anchGeo, anchMat);
        var ax = s * (BRIDGE_HALF + 1.2);
        a.position.set(ax, walkHeight(ax, 0) + 1.6, q * (BRIDGE_W / 2 + 0.4));
        a.castShadow = true;
        bridgeGroup.add(a);
      });
    });
  })();
  registerChunk(bridgeGroup, 0, 0);
  /* ---------------- campfire (island A social spot) ---------------- */
  var fireMats = [], fireLight;
  var campfirePos = { x: ISL_A.cx + 20, z: 25 };
  (function buildCampfire() {
    var gy = groundHeight(campfirePos.x, campfirePos.z);
    var grp = new THREE.Group();
    var stoneGeo = new THREE.DodecahedronGeometry(0.55, 0);
    var stoneMat = new THREE.MeshStandardMaterial({ color: 0x7a7a76, roughness: 1, flatShading: true });
    for (var i = 0; i < 9; i++) {
      var a = (i / 9) * Math.PI * 2;
      var s = new THREE.Mesh(stoneGeo, stoneMat);
      s.position.set(campfirePos.x + Math.cos(a) * 2.2, gy + 0.25, campfirePos.z + Math.sin(a) * 2.2);
      s.castShadow = true;
      grp.add(s);
    }
    var logGeo = new THREE.CylinderGeometry(0.28, 0.28, 2.6, 7);
    var logMat = new THREE.MeshStandardMaterial({ color: 0x4a2e18, roughness: 1 });
    for (var j = 0; j < 4; j++) {
      var log = new THREE.Mesh(logGeo, logMat);
      var aj = (j / 4) * Math.PI * 2 + 0.4;
      log.position.set(campfirePos.x + Math.cos(aj) * 0.7, gy + 0.45, campfirePos.z + Math.sin(aj) * 0.7);
      log.rotation.set(Math.PI / 2.3, 0, aj);
      log.castShadow = true;
      grp.add(log);
    }
    /* flame: emissive cone + glow sprite (flickers) */
    var fm = new THREE.MeshStandardMaterial({
      color: 0xffb46b, emissive: 0xff7a2a, emissiveIntensity: 1.6, roughness: 0.7
    });
    var flame = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.9, 8), fm);
    flame.position.set(campfirePos.x, gy + 1.5, campfirePos.z);
    grp.add(flame); fireMats.push(fm);
    var fsp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xff9a4b, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    fsp.scale.set(7, 7, 1);
    fsp.position.set(campfirePos.x, gy + 1.8, campfirePos.z);
    grp.add(fsp); lanternSprites.push(fsp);
    /* 2 log benches */
    var benchMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.95 });
    [-1, 1].forEach(function (s) {
      var bench = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.45, 0.9), benchMat);
      bench.position.set(campfirePos.x + s * 4.6, gy + 0.55, campfirePos.z + 1.2);
      bench.rotation.y = s * 0.35;
      bench.castShadow = true; bench.receiveShadow = true;
      grp.add(bench);
    });
    /* one warm point light for the fire (only strong at night) */
    fireLight = new THREE.PointLight(0xff9a4b, 0, 26, 1.8);
    fireLight.position.set(campfirePos.x, gy + 2.4, campfirePos.z);
    grp.add(fireLight);
    registerChunk(grp, campfirePos.x, campfirePos.z);
  })();

  /* bridge night lights (2 point lights, intensity lerped by darkness) */
  var bridgeLights = [];
  [-BRIDGE_HALF / 2, BRIDGE_HALF / 2].forEach(function (x) {
    var pl = new THREE.PointLight(0xffb46b, 0, 30, 1.8);
    pl.position.set(x, bridgeDeckY(x) + 2.6, 0);
    scene.add(pl);
    bridgeLights.push(pl);
  });

  /* ---------------- clouds ---------------- */
  var clouds = [];
  (function buildClouds() {
    var cm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.92 });
    var rand = mulberry32(909);
    for (var i = 0; i < 7; i++) {
      var grp = new THREE.Group();
      var n = 3 + Math.floor(rand() * 2);
      for (var j = 0; j < n; j++) {
        var s = new THREE.Mesh(new THREE.SphereGeometry(4 + rand() * 4, 10, 8), cm);
        s.position.set(j * 5 - n * 2.4 + rand() * 2, rand() * 1.6, rand() * 3 - 1.5);
        s.scale.y = 0.55;
        grp.add(s);
      }
      grp.position.set(-260 + rand() * 520, 52 + rand() * 22, -140 + rand() * 200);
      grp.userData.speed = 0.7 + rand() * 0.9;
      scene.add(grp);
      clouds.push(grp);
    }
  })();

  /* ---------------- birds ---------------- */
  var birds = [];
  (function buildBirds() {
    var bm = new THREE.MeshBasicMaterial({ color: 0x2a2a34, side: THREE.DoubleSide });
    var rand = mulberry32(313);
    for (var i = 0; i < 6; i++) {
      var grp = new THREE.Group();
      var wgeo = new THREE.PlaneGeometry(1.6, 0.5);
      var wl = new THREE.Mesh(wgeo, bm), wr = new THREE.Mesh(wgeo, bm);
      wl.position.x = -0.75; wr.position.x = 0.75;
      grp.add(wl); grp.add(wr);
      grp.userData = {
        wl: wl, wr: wr, r: 45 + rand() * 45, h: 26 + rand() * 12,
        sp: 0.14 + rand() * 0.12, ph: rand() * 9, cx: (rand() - 0.5) * 120
      };
      scene.add(grp);
      birds.push(grp);
    }
  })();

  /* ---------------- fireflies (night) ---------------- */
  var fireflyGeo = new THREE.BufferGeometry();
  var FF_N = 110;
  var ffPos = new Float32Array(FF_N * 3), ffSeed = new Float32Array(FF_N);
  (function () {
    var rand = mulberry32(555);
    for (var i = 0; i < FF_N; i++) {
      var isl = rand() < 0.5 ? ISL_A : ISL_B;
      var a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * ISL_R * 0.8;
      var x = isl.cx + Math.cos(a) * rr, z = isl.cz + Math.sin(a) * rr;
      ffPos[i * 3] = x; ffPos[i * 3 + 1] = Math.max(groundHeight(x, z), 0.5) + 1 + rand() * 3.5;
      ffPos[i * 3 + 2] = z; ffSeed[i] = rand() * 100;
    }
    fireflyGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
  })();
  var fireflyMat = new THREE.PointsMaterial({
    color: 0xffe08a, size: 0.55, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  var fireflies = new THREE.Points(fireflyGeo, fireflyMat);
  scene.add(fireflies);

  /* ---------------- placeholder player ---------------- */
  var player = new THREE.Group();
  var bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a9a8a, roughness: 0.7 });
  var body = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 1.15, 6, 12), bodyMat);
  body.position.y = 1.15; body.castShadow = true;
  player.add(body);
  var headMat = new THREE.MeshStandardMaterial({ color: 0xf2c89b, roughness: 0.7 });
  var head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), headMat);
  head.position.y = 2.35; head.castShadow = true;
  player.add(head);
  /* name label */
  var labelCanvas = document.createElement('canvas');
  labelCanvas.width = 256; labelCanvas.height = 64;
  (function () {
    var g = labelCanvas.getContext('2d');
    g.font = 'bold 34px Georgia'; g.textAlign = 'center';
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillText('You', 128, 42);
    g.fillStyle = '#fff8ec'; g.fillText('You', 128, 40);
  })();
  var labelTex = new THREE.CanvasTexture(labelCanvas);
  var label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, transparent: true, depthWrite: false }));
  label.scale.set(3.4, 0.85, 1);
  label.position.y = 3.35;
  player.add(label);
  var startX = ISL_A.cx + 32, startZ = 12;
  player.position.set(startX, groundHeight(startX, startZ), startZ);
  scene.add(player);
  var playerYaw = 0, targetYaw = 0;
  /* ---------------- input: keys + touch joystick + mouse orbit ---------- */
  var keys = {};
  var joyVec = { x: 0, y: 0, active: false };
  var orbit = { yaw: Math.PI * 0.15, pitch: 0.42, dist: 26, dragging: false, lx: 0, ly: 0 };
  var joystickEls = null;

  function onKeyDown(e) { keys[e.code] = true; }
  function onKeyUp(e) { keys[e.code] = false; }

  function buildJoystick() {
    var base = document.createElement('div');
    base.style.cssText = 'position:fixed;left:26px;bottom:90px;width:124px;height:124px;' +
      'border-radius:50%;background:rgba(255,248,236,0.10);border:2px solid rgba(255,248,236,0.28);' +
      'z-index:20;touch-action:none;';
    var knob = document.createElement('div');
    knob.style.cssText = 'position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px 0 0 -27px;' +
      'border-radius:50%;background:rgba(255,200,120,0.55);border:2px solid rgba(255,220,160,0.8);';
    base.appendChild(knob);
    document.body.appendChild(base);
    joystickEls = { base: base, knob: knob };
    var pid = null;
    function setKnob(dx, dy) {
      var m = Math.hypot(dx, dy), max = 44;
      if (m > max) { dx = dx / m * max; dy = dy / m * max; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      joyVec.x = dx / max; joyVec.y = dy / max; joyVec.active = (m > 6);
    }
    base.addEventListener('pointerdown', function (e) {
      pid = e.pointerId; base.setPointerCapture(pid);
      var r = base.getBoundingClientRect();
      setKnob(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      e.preventDefault();
    });
    base.addEventListener('pointermove', function (e) {
      if (e.pointerId !== pid) return;
      var r = base.getBoundingClientRect();
      setKnob(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
    });
    function end(e) {
      if (e.pointerId !== pid) return;
      pid = null; setKnob(0, 0); joyVec.active = false;
    }
    base.addEventListener('pointerup', end);
    base.addEventListener('pointercancel', end);
  }

  function onCanvasDown(e) {
    if (e.target !== canvas) return;
    orbit.dragging = true; orbit.lx = e.clientX; orbit.ly = e.clientY;
  }
  function onCanvasMove(e) {
    if (!orbit.dragging) return;
    orbit.yaw -= (e.clientX - orbit.lx) * 0.0052;
    orbit.pitch = clamp(orbit.pitch + (e.clientY - orbit.ly) * 0.004, 0.14, 1.15);
    orbit.lx = e.clientX; orbit.ly = e.clientY;
  }
  function onCanvasUp() { orbit.dragging = false; }
  function onWheel(e) {
    orbit.dist = clamp(orbit.dist * (1 + e.deltaY * 0.001), 13, 48);
    e.preventDefault();
  }
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /* ---------------- day/night ---------------- */
  var manualHour = null; // null = follow local time
  var cur = { // smoothed current values
    top: new THREE.Color(0x5aa9e6), horizon: new THREE.Color(0xd8f0fa),
    fog: new THREE.Color(0xc2dcee), sunC: new THREE.Color(0xfff3da),
    sunI: 1.25, hemiI: 0.7, ambI: 0.22, stars: 0,
    deep: new THREE.Color(0x14507e), shal: new THREE.Color(0x3f9db8)
  };
  var _t1 = new THREE.Color(), _t2 = new THREE.Color();
  function updateDayNight(dt, t) {
    var d = new Date();
    var hour = manualHour !== null ? manualHour : d.getHours() + d.getMinutes() / 60;
    var s = sampleSky(hour), k = 1 - Math.exp(-dt * 1.6); // smooth transitions
    cur.top.lerp(_t1.setHex(s.top), k);
    cur.horizon.lerp(_t1.setHex(s.horizon), k);
    cur.fog.lerp(_t1.setHex(s.fog), k);
    cur.sunC.lerp(_t1.setHex(s.sunColor), k);
    cur.deep.lerp(_t1.setHex(s.waterDeep), k);
    cur.shal.lerp(_t1.setHex(s.waterShallow), k);
    cur.sunI = lerp(cur.sunI, s.sunI, k);
    cur.hemiI = lerp(cur.hemiI, s.hemiI, k);
    cur.ambI = lerp(cur.ambI, s.ambI, k);
    cur.stars = lerp(cur.stars, s.stars, k);

    skyUniforms.topColor.value.copy(cur.top);
    skyUniforms.horizonColor.value.copy(cur.horizon);
    skyUniforms.sunColor.value.copy(cur.sunC);
    skyUniforms.sunI.value = 0.4 + cur.sunI * 0.6;
    scene.fog.color.copy(cur.fog);
    waterUniforms.fogColor.value.copy(cur.fog);
    waterUniforms.deepColor.value.copy(cur.deep);
    waterUniforms.shallowColor.value.copy(cur.shal);
    waterUniforms.sunColor.value.copy(cur.sunC);
    waterUniforms.sunI.value = cur.sunI;
    starMat.opacity = cur.stars;

    /* sun position arcs across the sky; moon takes over at night */
    var ang = ((hour - 6) / 12) * Math.PI; // 6h=east .. 18h=west
    var night = s.darkness;
    var sunA = (1 - night) * ang;
    var sd = new THREE.Vector3(Math.cos(sunA), Math.max(Math.sin(sunA), 0.06), 0.35).normalize();
    if (night > 0.5) { // moonlight from opposite arc
      var ma = ((hour - 18 + 24) % 24) / 12 * Math.PI;
      sd = new THREE.Vector3(Math.cos(ma), Math.max(Math.sin(ma), 0.12), -0.3).normalize();
    }
    skyUniforms.sunDir.value.copy(sd);
    waterUniforms.sunDir.value.copy(sd);
    sun.position.copy(sd).multiplyScalar(220).add(new THREE.Vector3(0, 0, 0));
    sun.target.position.set(0, 0, 0);
    sun.color.copy(cur.sunC); sun.intensity = cur.sunI * 1.35;
    hemi.intensity = cur.hemiI; amb.intensity = cur.ambI;
    renderer.toneMappingExposure = lerp(1.08, 0.85, night);

    /* lanterns / fire / fireflies come alive at night */
    var glow = 0.12 + night * 0.88;
    for (var i = 0; i < lanternMats.length; i++) lanternMats[i].emissiveIntensity = 0.25 + night * 2.2;
    for (var j = 0; j < lanternSprites.length; j++) lanternSprites[j].material.opacity = 0.06 + night * 0.6;
    for (var f = 0; f < fireMats.length; f++) {
      fireMats[f].emissiveIntensity = (1.1 + night * 1.6) * (0.85 + 0.3 * Math.sin(t * 9 + f * 2.1));
    }
    fireLight.intensity = 6 + night * 30;
    for (var b = 0; b < bridgeLights.length; b++) bridgeLights[b].intensity = night * 22;
    fireflyMat.opacity = night * 0.95;
    /* clouds dim at night */
  }

  /* ---------------- 180-degree frustum loading ----------------
     Only objects in the camera's forward hemisphere (+ margin) and
     within range stay visible. Checked every 3rd frame. */
  var _camDir = new THREE.Vector3(), _toObj = new THREE.Vector3(), _camPos = new THREE.Vector3();
  var LOD_DIST = 230;
  function updateLOD() {
    camera.getWorldDirection(_camDir);
    _camPos.copy(camera.position);
    for (var i = 0; i < lodChunks.length; i++) {
      var ch = lodChunks[i];
      _toObj.set(ch.cx - _camPos.x, 0, ch.cz - _camPos.z);
      var dist = _toObj.length();
      var vis = true;
      if (dist > LOD_DIST) vis = false;
      else {
        _toObj.normalize();
        var facing = _toObj.x * _camDir.x + _toObj.z * _camDir.z;
        if (facing < -0.18) vis = false; // behind the camera (>~100 deg)
      }
      if (ch.obj.visible !== vis) ch.obj.visible = vis;
    }
  }

  /* ---------------- movement + camera ---------------- */
  var vel = new THREE.Vector3();
  function inputVector() {
    var ix = 0, iz = 0;
    if (keys.KeyW || keys.ArrowUp) iz -= 1;
    if (keys.KeyS || keys.ArrowDown) iz += 1;
    if (keys.KeyA || keys.ArrowLeft) ix -= 1;
    if (keys.KeyD || keys.ArrowRight) ix += 1;
    if (joyVec.active) { ix += joyVec.x; iz += joyVec.y; }
    var m = Math.hypot(ix, iz);
    if (m > 1) { ix /= m; iz /= m; }
    return { x: ix, z: iz };
  }
  function updatePlayer(dt) {
    var inp = inputVector();
    /* camera-relative movement */
    var sin = Math.sin(orbit.yaw), cos = Math.cos(orbit.yaw);
    var dx = inp.x * cos + inp.z * sin;
    var dz = -inp.x * sin + inp.z * cos;
    var speed = 11;
    var nx = player.position.x + dx * speed * dt;
    var nz = player.position.z + dz * speed * dt;
    /* axis-separated slide collision */
    var moved = false;
    if (walkHeight(nx, player.position.z) > -900) { player.position.x = nx; moved = true; }
    if (walkHeight(player.position.x, nz) > -900) { player.position.z = nz; moved = true; }
    var gy = walkHeight(player.position.x, player.position.z);
    if (gy > -900) player.position.y = lerp(player.position.y, gy, 1 - Math.exp(-dt * 10));
    if (moved && (dx || dz)) {
      targetYaw = Math.atan2(dx, dz);
      var dy = targetYaw - playerYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      playerYaw += dy * (1 - Math.exp(-dt * 10));
      player.rotation.y = playerYaw;
      /* gentle bob while walking */
      body.position.y = 1.15 + Math.abs(Math.sin(performance.now() * 0.012)) * 0.09;
    } else {
      body.position.y = 1.15;
    }
  }
  var _camTarget = new THREE.Vector3(), _camWant = new THREE.Vector3();
  function updateCamera(dt) {
    _camTarget.set(player.position.x, player.position.y + 2.2, player.position.z);
    var cp = Math.cos(orbit.pitch), sp = Math.sin(orbit.pitch);
    var fx = -Math.sin(orbit.yaw) * cp, fz = -Math.cos(orbit.yaw) * cp;
    _camWant.set(
      _camTarget.x - fx * orbit.dist,
      _camTarget.y + sp * orbit.dist,
      _camTarget.z - fz * orbit.dist
    );
    /* keep camera above terrain */
    var minY = Math.max(groundHeight(_camWant.x, _camWant.z) + 2.2, 3.2);
    if (_camWant.y < minY) _camWant.y = minY;
    var k = 1 - Math.exp(-dt * 4.5);
    camera.position.lerp(_camWant, k);
    camera.lookAt(_camTarget);
  }

  /* ---------------- ambient life ---------------- */
  function updateAmbient(dt, t) {
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 300) c.position.x = -300;
    }
    for (var b = 0; b < birds.length; b++) {
      var bd = birds[b], u = bd.userData;
      var a = t * u.sp + u.ph;
      bd.position.set(u.cx + Math.cos(a) * u.r, u.h + Math.sin(t * 0.9 + u.ph) * 1.6, Math.sin(a) * u.r * 0.7);
      bd.rotation.y = -a;
      var flap = Math.sin(t * 10 + u.ph) * 0.65;
      u.wl.rotation.y = 0; u.wl.rotation.z = flap;
      u.wr.rotation.z = -flap;
    }
    /* firefly drift */
    var pa = fireflyGeo.attributes.position;
    for (var f = 0; f < FF_N; f++) {
      var s = ffSeed[f];
      pa.array[f * 3] += Math.sin(t * 0.7 + s) * dt * 0.7;
      pa.array[f * 3 + 1] += Math.cos(t * 0.5 + s * 1.7) * dt * 0.45;
      pa.array[f * 3 + 2] += Math.cos(t * 0.6 + s * 0.6) * dt * 0.7;
    }
    pa.needsUpdate = true;
  }

  /* ---------------- main loop ---------------- */
  var clock = new THREE.Clock();
  var rafId = 0, frame = 0, destroyed = false;
  function animate() {
    if (destroyed) return;
    rafId = requestAnimationFrame(animate);
    var dt = Math.min(clock.getDelta(), 0.05);
    var t = clock.elapsedTime;
    waterUniforms.uTime.value = t;
    updatePlayer(dt);
    updateCamera(dt);
    updateDayNight(dt, t);
    updateAmbient(dt, t);
    if ((frame++ % 3) === 0) updateLOD();
    renderer.render(scene, camera);
  }

  /* ---------------- wire up & go ---------------- */
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointerdown', onCanvasDown);
  window.addEventListener('pointermove', onCanvasMove);
  window.addEventListener('pointerup', onCanvasUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('resize', onResize);
  buildJoystick();
  /* snap camera behind player start */
  (function () {
    _camTarget.set(player.position.x, player.position.y + 2.2, player.position.z);
    camera.position.set(
      _camTarget.x - (-Math.sin(orbit.yaw) * Math.cos(orbit.pitch)) * orbit.dist,
      _camTarget.y + Math.sin(orbit.pitch) * orbit.dist,
      _camTarget.z - (-Math.cos(orbit.yaw) * Math.cos(orbit.pitch)) * orbit.dist
    );
    camera.lookAt(_camTarget);
  })();
  animate();

  return {
    setTimeOfDay: function (h) { manualHour = (h === null || h === undefined) ? null : ((h % 24) + 24) % 24; },
    getPlayerPos: function () { return { x: player.position.x, y: player.position.y, z: player.position.z }; },
    version: 'phase1-1.0',
    destroy: function () {
      destroyed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onCanvasDown);
      window.removeEventListener('pointermove', onCanvasMove);
      window.removeEventListener('pointerup', onCanvasUp);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
      if (joystickEls && joystickEls.base.parentNode) joystickEls.base.parentNode.removeChild(joystickEls.base);
      renderer.dispose();
    }
  };
}

return { init: init };

})();

if (typeof window !== 'undefined') window.KanavuWorld = KanavuWorld;
if (typeof module !== 'undefined' && module.exports) module.exports = KanavuWorld;

})();
