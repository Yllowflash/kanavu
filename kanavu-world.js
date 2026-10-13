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
var pierRects = []; // Phase 4: wooden piers are walkable {x0,x1,z0,z1,y}
function walkHeight(x, z) {
  var zn = zoneAt(x, z); // Phase 2: interior rooms override terrain
  if (zn) return zn.y;
  if (onBridge(x, z) && Math.abs(x) <= BRIDGE_HALF) return bridgeDeckY(x) + 0.11; // plank tops
  for (var pi = 0; pi < pierRects.length; pi++) { // Phase 4: stroll the dock
    var pr = pierRects[pi];
    if (x >= pr.x0 && x <= pr.x1 && z >= pr.z0 && z <= pr.z1) return pr.y;
  }
  var h = groundHeight(x, z);
  return h > 0.45 ? h : -999;
}

/* ================= Phase 2: building plots + interior zones ==============
   Resolved once at load: each plot needs groundHeight >= 2.5, gentle slope,
   and >= 14 units from other plots; nudged deterministically if not. */
var interiorZones = []; // {x0,x1,z0,z1,y,room}
function zoneAt(x, z) {
  for (var i = 0; i < interiorZones.length; i++) {
    var zn = interiorZones[i];
    if (x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1) return zn;
  }
  return null;
}
var BUILD_PLOTS_A = (function () {
  var defs = [
    ['bookshop', -90, -32], ['shop', -58, -20], ['theatre', -122, -20],
    ['cottage', -56, 33], ['house', -122, 30]
  ];
  var out = [];
  function ok(x, z) {
    if (groundHeight(x, z) < 2.5 || groundSlope(x, z) > 0.6) return false;
    for (var i = 0; i < out.length; i++)
      if (Math.hypot(x - out[i].x, z - out[i].z) < 14) return false;
    return true;
  }
  defs.forEach(function (d) {
    var x = d[1], z = d[2];
    if (!ok(x, z)) {
      var done = false;
      for (var r = 1; r <= 14 && !done; r++) {
        for (var k = 0; k < 20 && !done; k++) {
          var cx = x + Math.cos(k / 20 * Math.PI * 2) * r;
          var cz = z + Math.sin(k / 20 * Math.PI * 2) * r;
          if (ok(cx, cz)) { x = cx; z = cz; done = true; }
        }
      }
    }
    out.push({ type: d[0], x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 });
  });
  return out;
})();

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

function init(canvasId, opts) {
  if (typeof THREE === 'undefined') throw new Error('Three.js r160 required');
  opts = opts || {};
  var myRole = opts.role === 'girl' ? 'girl' : 'boy'; // which character the local player is
  var myName = opts.playerName || (myRole === 'girl' ? 'Tara' : 'You');
  var partnerName = opts.partnerName || (myRole === 'girl' ? 'Adi' : 'Tara');
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
  var lodChunks = []; // {obj, cx, cz, noBehind, noLOD}
  function registerChunk(obj, cx, cz, noBehind) {
    scene.add(obj);
    var ch = { obj: obj, cx: cx, cz: cz, noBehind: !!noBehind, noLOD: false };
    lodChunks.push(ch);
    return ch;
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
  /* ---- Phase 4 plots: sky wheels, docks, cycle stands (resolved before scatter) ---- */
  function findWheelPlot(cx, cz) { // nudge until groundHeight >= 2.5 & gentle slope
    var x = cx, z = cz, done = false;
    for (var r = 0; r <= 12 && !done; r++) {
      for (var k = 0; k < 16 && !done; k++) {
        var nx = cx + Math.cos(k / 16 * Math.PI * 2) * r, nz = cz + Math.sin(k / 16 * Math.PI * 2) * r;
        if (groundHeight(nx, nz) >= 2.5 && groundSlope(nx, nz) <= 0.6) { x = nx; z = nz; done = true; }
      }
    }
    return { x: x, z: z };
  }
  var WHEEL_A = findWheelPlot(ISL_A.cx, 42), WHEEL_B = findWheelPlot(ISL_B.cx, 42);
  var STAND_A = { x: ISL_A.cx + 10, z: 10 }, STAND_B = { x: ISL_B.cx - 10, z: 10 };
  var PIER_LEN = 14;
  function findShore(cx, cz, dx, dz) { // march outward until ground dips below 0.6
    var sx = cx + dx * 30, sz = cz + dz * 30;
    for (var t = 30; t <= 75; t++) {
      if (groundHeight(cx + dx * t, cz + dz * t) < 0.6) { sx = cx + dx * (t - 3); sz = cz + dz * (t - 3); break; }
      sx = cx + dx * t; sz = cz + dz * t;
    }
    return { x: sx, z: sz, dx: dx, dz: dz };
  }
  var DOCK_A = findShore(ISL_A.cx, ISL_A.cz, 0, -1);
  var DOCK_B = findShore(ISL_B.cx, ISL_B.cz, 0, -1);
  /* keep bridge corridor + campfire + future building plots clear */
  function clearOfFeatures(x, z) {
    if (Math.abs(z) < 10 && Math.abs(x) < 72) return true;   // bridge corridor
    if (Math.hypot(x - ISL_A.cx, z - ISL_A.cz) < 15) return true; // plaza A
    if (Math.hypot(x - ISL_B.cx, z - ISL_B.cz) < 15) return true; // plaza B
    if (Math.hypot(x + 70, z - 25) < 9) return true;          // campfire
    if (Math.hypot(x - WHEEL_A.x, z - WHEEL_A.z) < 11) return true; // Phase 4 sky wheel
    if (Math.hypot(x - WHEEL_B.x, z - WHEEL_B.z) < 11) return true;
    if (Math.hypot(x - (DOCK_A.x + DOCK_A.dx * 7), z - (DOCK_A.z + DOCK_A.dz * 7)) < 8) return true; // pier
    if (Math.hypot(x - (DOCK_B.x + DOCK_B.dx * 7), z - (DOCK_B.z + DOCK_B.dz * 7)) < 8) return true;
    for (var i = 0; i < BUILD_PLOTS_A.length; i++) {          // Phase 2 building plots (mirrored)
      var p = BUILD_PLOTS_A[i];
      if (Math.hypot(x - p.x, z - p.z) < 8) return true;
      if (Math.hypot(x + p.x, z - p.z) < 8) return true;
      // keep the doorway approach clear: no trees in a corridor in front of each door
      for (var s = 0; s < 2; s++) {
        var bx = s ? -p.x : p.x, bz = p.z;
        var ccx = s ? ISL_B.cx : ISL_A.cx;
        var fx = ccx - bx, fz = 0 - bz; // door faces the island center
        var fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
        var dx = x - bx, dz = z - bz;
        var along = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
        if (along > -3 && along < 17 && lat < 7.5) return true;
      }
    }
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
  registerChunk(bridgeGroup, 0, 0, true); // long span: never cull when its center falls behind the camera
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

  /* ================= PHASE 2: buildings + interiors =================
     5 Pixar-style buildings x 2 mirrored islands, plus teleport interiors
     far south over water (z=-400/-418). Shared canvas textures, merged
     geometry per building, instanced repeated parts, one shader-driven
     smoke cloud for all chimneys + kettle steam. */
  var windowMats = [];    // night-glow materials (driven in updateDayNight)
  var colliders = [];     // {x,z,r} building slide colliders
  var interactables = []; // {x,z,r,label,action} prompt triggers
  var rooms = [];         // interior rooms {cx,cz,lampLight}
  var tvStates = [];

  /* ---- canvas texture helper ---- */
  function canvasTex(w, h, draw) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  }
  function plankBG(g, w, h, base) {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    var r = mulberry32(42), rows = 8, rh = h / rows;
    for (var i = 0; i < rows; i++) {
      var v = (r() - 0.5) * 22;
      g.fillStyle = 'rgb(' + ((156 + v) | 0) + ',' + ((107 + v * 0.7) | 0) + ',' + ((65 + v * 0.5) | 0) + ')';
      g.fillRect(0, i * rh, w, rh);
      g.fillStyle = 'rgba(60,35,18,0.85)'; g.fillRect(0, i * rh, w, 2.5);
      g.strokeStyle = 'rgba(90,55,28,0.35)'; g.lineWidth = 1;
      for (var k = 0; k < 5; k++) {
        var yy = i * rh + 4 + r() * (rh - 8);
        g.beginPath(); g.moveTo(0, yy);
        g.bezierCurveTo(w * 0.3, yy + 3, w * 0.6, yy - 3, w, yy + 1); g.stroke();
      }
      g.fillStyle = 'rgba(60,35,18,0.7)'; g.fillRect(r() * w, i * rh, 2.5, rh);
    }
  }
  var woodTex = canvasTex(256, 256, function (g, w, h) { plankBG(g, w, h, '#9c6b41'); });
  var shingleTex = canvasTex(256, 256, function (g, w, h) {
    g.fillStyle = '#6e4438'; g.fillRect(0, 0, w, h);
    var r = mulberry32(77), rows = 8, rh = h / rows, sw = 32;
    for (var i = 0; i < rows; i++) {
      var off = (i % 2) * sw / 2;
      for (var x = -1; x < w / sw + 1; x++) {
        var v = (r() - 0.5) * 26;
        g.fillStyle = 'rgb(' + ((122 + v) | 0) + ',' + ((74 + v * 0.7) | 0) + ',' + ((60 + v * 0.6) | 0) + ')';
        g.fillRect(x * sw + off + 1.5, i * rh, sw - 3, rh + 6);
        g.strokeStyle = 'rgba(40,20,14,0.8)'; g.lineWidth = 2;
        g.strokeRect(x * sw + off + 1.5, i * rh, sw - 3, rh + 6);
      }
    }
  });
  var stoneTex = canvasTex(128, 128, function (g, w, h) {
    g.fillStyle = '#7d7d78'; g.fillRect(0, 0, w, h);
    var r = mulberry32(123);
    for (var i = 0; i < 26; i++) {
      var v = (r() - 0.5) * 30;
      g.fillStyle = 'rgb(' + ((130 + v) | 0) + ',' + ((128 + v) | 0) + ',' + ((120 + v) | 0) + ')';
      var bw = 22 + r() * 26, bh = 16 + r() * 16;
      g.beginPath();
      if (g.roundRect) g.roundRect(r() * (w - bw), r() * (h - bh), bw, bh, 6);
      else g.rect(r() * (w - bw), r() * (h - bh), bw, bh);
      g.fill();
      g.strokeStyle = 'rgba(50,48,44,0.7)'; g.lineWidth = 2; g.stroke();
    }
  });
  var awningTex = canvasTex(128, 128, function (g, w, h) {
    for (var i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f5ead8' : '#c94f4f'; g.fillRect(i * w / 8, 0, w / 8, h); }
    g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(0, h - 14, w, 14);
  });
  var rugTex = canvasTex(128, 128, function (g, w, h) {
    g.fillStyle = '#a8433c'; g.fillRect(0, 0, w, h);
    var cx = w / 2, cy = h / 2, rings = ['#e8d8b0', '#a8433c', '#d8a04a', '#7a2e2a'];
    for (var i = 4; i >= 1; i--) {
      g.fillStyle = rings[(4 - i) % rings.length];
      g.beginPath(); g.arc(cx, cy, i * 15, 0, 7); g.fill();
    }
    g.fillStyle = '#e8d8b0';
    for (var k = 0; k < 8; k++) {
      var a = k / 8 * Math.PI * 2;
      g.beginPath(); g.arc(cx + Math.cos(a) * 38, cy + Math.sin(a) * 38, 5, 0, 7); g.fill();
    }
  });
  function boardSign(w, h, draw) {
    return canvasTex(w, h, function (g) {
      plankBG(g, w, h, '#7a5230');
      g.fillStyle = 'rgba(40,22,10,0.35)'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
      draw(g, w, h);
    });
  }
  function signText(g, w, h, text, size, y) {
    g.font = 'bold ' + size + 'px Georgia'; g.textAlign = 'center';
    g.fillStyle = 'rgba(30,16,6,0.8)'; g.fillText(text, w / 2, (y || h / 2) + 3);
    g.fillStyle = '#ffe9b8'; g.fillText(text, w / 2, (y || h / 2));
  }
  var bookSignTex = boardSign(256, 160, function (g, w, h) {
    g.fillStyle = '#f5ead8';
    g.beginPath(); g.moveTo(58, 42); g.lineTo(108, 32); g.lineTo(108, 78); g.lineTo(58, 88); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(198, 42); g.lineTo(148, 32); g.lineTo(148, 78); g.lineTo(198, 88); g.closePath(); g.fill();
    g.strokeStyle = '#7a5230'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(128, 30); g.lineTo(128, 80); g.stroke();
    signText(g, w, h, 'BOOKSHOP', 34, 132);
  });
  var shopSignTex = boardSign(256, 128, function (g, w, h) {
    for (var i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f5ead8' : '#c94f4f'; g.fillRect(i * w / 8, 0, 18, 18); }
    signText(g, w, h, 'SHOP', 52, 92);
  });
  var marqueeTex = canvasTex(512, 128, function (g, w, h) {
    g.fillStyle = '#5a1f1f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd9a0';
    for (var x = 14; x < w; x += 28) { g.beginPath(); g.arc(x, 12, 6, 0, 7); g.fill(); g.beginPath(); g.arc(x, h - 12, 6, 0, 7); g.fill(); }
    signText(g, w, h, '★ KANAVU THEATRE ★', 44, 82);
  });
  var heartTex = boardSign(128, 128, function (g, w, h) {
    g.fillStyle = '#c94f4f';
    g.beginPath(); g.moveTo(64, 96);
    g.bezierCurveTo(20, 62, 34, 26, 64, 48);
    g.bezierCurveTo(94, 26, 108, 62, 64, 96);
    g.fill();
  });
  var homeTex = boardSign(256, 128, function (g, w, h) { signText(g, w, h, 'HOME ♥', 52, 84); });
  var posterTex = canvasTex(256, 192, function (g, w, h) {
    function poster(px, night, title) {
      var grd = g.createLinearGradient(0, 0, 0, h);
      if (night) { grd.addColorStop(0, '#1c2450'); grd.addColorStop(1, '#4a3a6b'); }
      else { grd.addColorStop(0, '#ff9a5c'); grd.addColorStop(1, '#ffd166'); }
      g.fillStyle = grd; g.fillRect(px, 0, 128, h);
      g.fillStyle = night ? '#f5f0e6' : '#fff3da';
      g.beginPath(); g.arc(px + 64, night ? 60 : 120, night ? 22 : 30, 0, 7); g.fill();
      g.fillStyle = 'rgba(20,10,8,0.85)';
      g.font = 'bold 26px Georgia'; g.textAlign = 'center';
      g.fillText(title, px + 64, h - 26);
      g.strokeStyle = '#3a2418'; g.lineWidth = 8; g.strokeRect(px + 4, 4, 120, h - 8);
    }
    poster(0, false, 'DREAMS'); poster(128, true, 'MEMORIES');
  });
  var photoTex = canvasTex(384, 128, function (g, w, h) {
    var caps = ['you & me', 'us ♥', 'kanavu'];
    for (var i = 0; i < 3; i++) {
      var grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, ['#ff9a5c', '#8a5ab8', '#4a7ab8'][i]);
      grd.addColorStop(1, ['#ffd166', '#ff8ab0', '#7ac8b8'][i]);
      g.fillStyle = grd; g.fillRect(i * 128 + 8, 8, 112, 112);
      g.fillStyle = '#c94f4f';
      g.beginPath(); g.arc(i * 128 + 50, 58, 12, 0, 7); g.arc(i * 128 + 78, 58, 12, 0, 7); g.fill();
      g.beginPath(); g.moveTo(i * 128 + 38, 62); g.lineTo(i * 128 + 90, 62); g.lineTo(i * 128 + 64, 92); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,248,236,0.95)'; g.font = 'bold 17px Georgia'; g.textAlign = 'center';
      g.fillText(caps[i], i * 128 + 64, 112);
    }
  });

  /* ---- shared materials ---- */
  var wallMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.85 });
  var trimMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.9 });
  var roofMat = new THREE.MeshStandardMaterial({ map: shingleTex, roughness: 0.9 });
  var stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 1 });
  var darkMat = new THREE.MeshStandardMaterial({ color: 0x241a10, roughness: 1 });
  var paneMat = new THREE.MeshStandardMaterial({
    color: 0x6a563e, emissive: 0xffb45e, emissiveIntensity: 0.25, roughness: 0.3, metalness: 0.1
  });
  var metalMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.35, metalness: 0.65 });
  var fabricMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  var rugMat = new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 });
  var shadeMat = new THREE.MeshStandardMaterial({
    color: 0xffe2b0, emissive: 0xffb45e, emissiveIntensity: 0.7, roughness: 0.8, side: THREE.DoubleSide
  });
  var marqueeMat = new THREE.MeshStandardMaterial({
    map: marqueeTex, emissive: 0xffffff, emissiveMap: marqueeTex, emissiveIntensity: 0.6, roughness: 0.7
  });
  var posterMat = new THREE.MeshStandardMaterial({
    map: posterTex, emissive: 0xffffff, emissiveMap: posterTex, emissiveIntensity: 0.35, roughness: 0.8
  });
  var photoMat = new THREE.MeshStandardMaterial({ map: photoTex, roughness: 0.7 });
  var leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  var flowerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  var bookMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  var jarMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  var awningMat = new THREE.MeshStandardMaterial({ map: awningTex, roughness: 0.85, side: THREE.DoubleSide });
  var bookSignMat = new THREE.MeshStandardMaterial({ map: bookSignTex, roughness: 0.8 });
  var shopSignMat = new THREE.MeshStandardMaterial({ map: shopSignTex, roughness: 0.8 });
  var heartSignMat = new THREE.MeshStandardMaterial({ map: heartTex, roughness: 0.8 });
  var homeSignMat = new THREE.MeshStandardMaterial({ map: homeTex, roughness: 0.8 });
  var ceramicMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.5 });
  var teaMat = new THREE.MeshStandardMaterial({ color: 0x8a4a1a, roughness: 0.3 });
  var coneMat = new THREE.MeshBasicMaterial({
    color: 0xfff2c0, transparent: true, opacity: 0.10,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false
  });
  windowMats.push(paneMat, shadeMat, marqueeMat, posterMat);

  /* ---- shared unit geometries ---- */
  var GEO = {
    box: new THREE.BoxGeometry(1, 1, 1),
    plane: new THREE.PlaneGeometry(1, 1),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
    sph: new THREE.SphereGeometry(0.5, 10, 8),
    ico: new THREE.IcosahedronGeometry(0.5, 0),
    circle: new THREE.CircleGeometry(0.5, 20)
  };

  /* ---- geometry merge helpers (keeps draw calls low) ---- */
  var _e = new THREE.Euler(), _q = new THREE.Quaternion();
  var _v = new THREE.Vector3(), _sv = new THREE.Vector3(), _m = new THREE.Matrix4();
  function part(geo, px, py, pz, rx, ry, rz, sx, sy, sz, uvS) {
    var g = geo.index ? geo.toNonIndexed() : geo.clone();
    _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e);
    _v.set(px, py, pz); _sv.set(sx || 1, sy || 1, sz || 1);
    _m.compose(_v, _q, _sv);
    g.applyMatrix4(_m);
    if (uvS) {
      var uv = g.attributes.uv, su = uvS[0], sv = uvS[1], ou = uvS[2] || 0, ov = uvS[3] || 0;
      for (var i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su + ou, uv.getY(i) * sv + ov);
    }
    return g;
  }
  function mergeGeos(list) {
    var total = 0, i, hasColor = !!list[0].attributes.color;
    for (i = 0; i < list.length; i++) total += list[i].attributes.position.count;
    var pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    var col = hasColor ? new Float32Array(total * 3) : null;
    var o = 0;
    for (i = 0; i < list.length; i++) {
      var g = list[i];
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      if (col && g.attributes.color) col.set(g.attributes.color.array, o * 3);
      o += g.attributes.position.count;
    }
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return out;
  }

  /* ---- global instancers (repeated parts, 1 draw call each) ---- */
  function makeInstancer(geo, mat) {
    var items = [];
    return {
      add: function (px, py, pz, rx, ry, rz, sx, sy, sz, color) {
        items.push({ p: [px, py, pz], r: [rx || 0, ry || 0, rz || 0], s: [sx || 1, sy || 1, sz || 1], c: color });
      },
      build: function () {
        var n = items.length;
        var im = new THREE.InstancedMesh(geo, mat, Math.max(n, 1));
        for (var i = 0; i < n; i++) {
          var it = items[i];
          _e.set(it.r[0], it.r[1], it.r[2]); _q.setFromEuler(_e);
          _v.set(it.p[0], it.p[1], it.p[2]); _sv.set(it.s[0], it.s[1], it.s[2]);
          _m.compose(_v, _q, _sv);
          im.setMatrixAt(i, _m);
          if (it.c !== undefined) im.setColorAt(i, dummyColor.setHex(it.c));
        }
        im.count = n;
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.castShadow = true; im.receiveShadow = true;
        im.frustumCulled = false; // spans the whole world; tiny anyway
        scene.add(im);
        return im;
      }
    };
  }
  var winFrameI = makeInstancer(GEO.box, trimMat);
  var winPaneI = makeInstancer(GEO.plane, paneMat);
  var postI = makeInstancer(GEO.cyl, trimMat);
  var crateI = makeInstancer(GEO.box, wallMat);
  var handleI = makeInstancer(GEO.sph, metalMat);
  var planterI = makeInstancer(GEO.box, trimMat);
  var flowerI = makeInstancer(GEO.ico, flowerMat);
  var leafI = makeInstancer(GEO.ico, leafMat);
  var bookI = makeInstancer(GEO.box, bookMat);
  var jarI = makeInstancer(GEO.cyl, jarMat);

  /* ---- chimney smoke + kettle steam: one shader-driven Points cloud ---- */
  var smokeTex = createGlowTexture('rgba(215,210,205,0.9)', 'rgba(215,210,205,0)');
  var SMK_N = 160;
  var smkPos = new Float32Array(SMK_N * 3), smkSize = new Float32Array(SMK_N), smkAlpha = new Float32Array(SMK_N);
  var smkParts = [];
  for (var si = 0; si < SMK_N; si++) smkParts.push({ life: 1e9, max: 1, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, s0: 1, grow: 1, alpha: 0.4 });
  var smkGeo = new THREE.BufferGeometry();
  smkGeo.setAttribute('position', new THREE.BufferAttribute(smkPos, 3));
  smkGeo.setAttribute('aSize', new THREE.BufferAttribute(smkSize, 1));
  smkGeo.setAttribute('aAlpha', new THREE.BufferAttribute(smkAlpha, 1));
  var smkMat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: smokeTex } },
    transparent: true, depthWrite: false,
    vertexShader: [
      'attribute float aSize;', 'attribute float aAlpha;', 'varying float vA;',
      'void main(){ vA = aAlpha;',
      ' vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      ' gl_PointSize = aSize * 240.0 / max(-mv.z, 1.0);',
      ' gl_Position = projectionMatrix * mv; }'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D uMap;', 'varying float vA;',
      'void main(){ vec4 t = texture2D(uMap, gl_PointCoord);',
      ' gl_FragColor = vec4(vec3(0.84, 0.82, 0.80), t.a * vA); }'
    ].join('\n')
  });
  var smokePts = new THREE.Points(smkGeo, smkMat);
  smokePts.frustumCulled = false;
  scene.add(smokePts);
  var smkEmitters = [];
  function addSmokeEmitter(x, y, z, opts) {
    var e = {
      x: x, y: y, z: z, rate: opts.rate, acc: Math.random(),
      life: opts.life, vy: opts.vy, vx: opts.vx || 0, vz: opts.vz || 0,
      size: opts.size, grow: opts.grow, alpha: opts.alpha, active: opts.active || null
    };
    smkEmitters.push(e);
    return e;
  }
  function updateSmoke(dt) {
    for (var i = 0; i < smkEmitters.length; i++) {
      var e = smkEmitters[i];
      if (e.active && !e.active()) continue;
      e.acc += e.rate * dt;
      while (e.acc >= 1) {
        e.acc -= 1;
        for (var j = 0; j < SMK_N; j++) {
          var p = smkParts[j];
          if (p.life >= p.max) {
            p.life = 0; p.max = e.life * (0.8 + Math.random() * 0.4);
            p.x = e.x; p.y = e.y; p.z = e.z;
            p.vx = e.vx + (Math.random() - 0.5) * 0.3;
            p.vy = e.vy * (0.9 + Math.random() * 0.2);
            p.vz = e.vz + (Math.random() - 0.5) * 0.3;
            p.s0 = e.size * (0.8 + Math.random() * 0.4);
            p.grow = e.grow; p.alpha = e.alpha;
            break;
          }
        }
      }
    }
    for (var k = 0; k < SMK_N; k++) {
      var q = smkParts[k];
      if (q.life < q.max) {
        q.life += dt;
        q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
        var lt = Math.min(q.life / q.max, 1);
        smkPos[k * 3] = q.x; smkPos[k * 3 + 1] = q.y; smkPos[k * 3 + 2] = q.z;
        smkSize[k] = q.s0 * (1 + q.grow * lt);
        smkAlpha[k] = Math.sin(lt * Math.PI) * q.alpha;
      } else smkAlpha[k] = 0;
    }
    smkGeo.attributes.position.needsUpdate = true;
    smkGeo.attributes.aSize.needsUpdate = true;
    smkGeo.attributes.aAlpha.needsUpdate = true;
  }
  /* ---- building type specs ---- */
  var BTYPES = {
    bookshop: { w: 10, d: 8, wallH: 6.6, roofH: 3.1, name: 'Bookshop', icon: '📖', porch: true, sign: 'book' },
    shop:     { w: 9,  d: 7, wallH: 5.0, roofH: 2.6, name: 'Shop', icon: '🛍️', awning: true, sign: 'shop' },
    theatre:  { w: 11, d: 9, wallH: 6.0, roofH: 3.0, name: 'Theatre', icon: '🎭', marquee: true },
    cottage:  { w: 7,  d: 6, wallH: 4.2, roofH: 2.4, name: 'Memory Cottage', icon: '💭', flowers: true, sign: 'heart' },
    house:    { w: 12, d: 9, wallH: 5.5, roofH: 3.0, name: "Couple's House", icon: '🏠', porch: true, bench: true, sign: 'home' }
  };
  var FLOWER_COLS = [0xff8ab0, 0xffd166, 0xff6b6b, 0xc39bff, 0xffffff, 0xff9a5c];

  /* ---- building runtime data (10 = 5 types x mirrored islands) ---- */
  var INTERIOR_XS = [-48, -24, 0, 24, 48];
  var BUILDINGS = [];
  ['A', 'B'].forEach(function (side) {
    BUILD_PLOTS_A.forEach(function (p, pi) {
      var s = side === 'A' ? 1 : -1;
      var bx = p.x * s, bz = p.z;
      var ccx = side === 'A' ? ISL_A.cx : ISL_B.cx;
      var yaw = Math.atan2(ccx - bx, 0 - bz); // door faces island center
      var fx = Math.sin(yaw), fz = Math.cos(yaw);
      var spec = BTYPES[p.type];
      var doorG = groundHeight(bx + fx * (spec.d / 2 + 1), bz + fz * (spec.d / 2 + 1));
      BUILDINGS.push({
        side: side, type: p.type, x: bx, z: bz, yaw: yaw, fx: fx, fz: fz,
        gy: doorG - 0.4, // group base: door sits just above the door-side ground
        ix: INTERIOR_XS[pi], iz: side === 'A' ? -400 : -418
      });
    });
  });

  function meshFromParts(parts, mat) {
    if (!parts.length) return null;
    var m = new THREE.Mesh(mergeGeos(parts), mat);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  /* ---------------- Halloween Barn (seasonal, beside bridge entrance) ---------------- */
  function makeTextSprite(text, opts) {
    opts = opts || {};
    var c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    var g = c.getContext('2d');
    g.fillStyle = opts.bg || '#3a2418';
    g.fillRect(0, 0, 512, 128);
    g.strokeStyle = opts.border || '#f5a86e';
    g.lineWidth = 6;
    g.strokeRect(8, 8, 496, 112);
    g.fillStyle = opts.fg || '#ffe9b8';
    g.font = 'bold 42px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 256, 64);
    var t = new THREE.CanvasTexture(c);
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    var m = new THREE.Mesh(
      new THREE.PlaneGeometry(opts.w || 6, (opts.w || 6) * 0.25),
      new THREE.MeshBasicMaterial({ map: t })
    );
    return m;
  }
  function buildHalloweenBarn(bx, bz, yaw) {
    var g = new THREE.Group();
    var gy = groundHeight(bx, bz);
    // Main barn body (wooden, dark red-brown)
    var woodMat = new THREE.MeshStandardMaterial({ color: 0x6b3a2a, roughness: 0.85 });
    var woodDark = new THREE.MeshStandardMaterial({ color: 0x4a2a1e, roughness: 0.9 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 8), woodMat);
    body.position.y = 3;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    // Gambrel roof (two slopes)
    var roofMat = new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.9 });
    var roof1 = new THREE.Mesh(new THREE.BoxGeometry(11, 0.3, 4.5), roofMat);
    roof1.position.set(0, 7.2, -1.8);
    roof1.rotation.x = 0.5;
    roof1.castShadow = true;
    g.add(roof1);
    var roof2 = new THREE.Mesh(new THREE.BoxGeometry(11, 0.3, 4.5), roofMat);
    roof2.position.set(0, 7.2, 1.8);
    roof2.rotation.x = -0.5;
    roof2.castShadow = true;
    g.add(roof2);
    // Roof ridge cap
    var ridge = new THREE.Mesh(new THREE.BoxGeometry(11, 0.4, 0.6), woodDark);
    ridge.position.y = 8.6;
    g.add(ridge);
    // Front gable (triangle)
    var gableShape = new THREE.Shape();
    gableShape.moveTo(-5, 0); gableShape.lineTo(5, 0); gableShape.lineTo(0, 2.6); gableShape.closePath();
    var gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: 0.3, bevelEnabled: false });
    var gable = new THREE.Mesh(gableGeo, woodMat);
    gable.position.set(0, 6, 3.85);
    g.add(gable);
    // Glowing windows
    var winMat = new THREE.MeshBasicMaterial({ color: 0xffd98a });
    var win1 = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), winMat);
    win1.position.set(-2.5, 4.5, 4.02);
    g.add(win1);
    var win2 = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), winMat);
    win2.position.set(2.5, 4.5, 4.02);
    g.add(win2);
    // Window frames
    var frameMat = new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.8 });
    [[-2.5], [2.5]].forEach(function (wx) {
      var f = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.9, 0.1), frameMat);
      f.position.set(wx[0], 4.5, 3.98);
      g.add(f);
    });
    // Big barn doors (front)
    var doorMat = new THREE.MeshStandardMaterial({ color: 0x4a2e20, roughness: 0.85 });
    var doorL = new THREE.Mesh(new THREE.BoxGeometry(1.8, 4.2, 0.15), doorMat);
    doorL.position.set(-1, 2.6, 4.05);
    g.add(doorL);
    var doorR = new THREE.Mesh(new THREE.BoxGeometry(1.8, 4.2, 0.15), doorMat);
    doorR.position.set(1, 2.6, 4.05);
    g.add(doorR);
    // Porch roof (front overhang)
    var porchRoof = new THREE.Mesh(new THREE.BoxGeometry(12, 0.25, 3), roofMat);
    porchRoof.position.set(0, 5.2, 5.2);
    porchRoof.rotation.x = 0.15;
    porchRoof.castShadow = true;
    g.add(porchRoof);
    // Porch posts
    var postMat = new THREE.MeshStandardMaterial({ color: 0x4a2e20, roughness: 0.85 });
    [[-5.5], [5.5]].forEach(function (px) {
      var post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 5.2, 8), postMat);
      post.position.set(px[0], 2.6, 6.5);
      post.castShadow = true;
      g.add(post);
    });
    // Signs
    var sign1 = makeTextSprite('KANAVU AUTUMN BARN', { w: 7 });
    sign1.position.set(0, 6.8, 4.1);
    g.add(sign1);
    var sign2 = makeTextSprite('KANAVU HALLOWEEN BARN FESTIVAL', { w: 8, bg: '#2a1a12', fg: '#ffb86e' });
    sign2.position.set(0, 5.9, 4.1);
    g.add(sign2);
    // String lights along roof edges (glowing spheres)
    var lightMat = new THREE.MeshBasicMaterial({ color: 0xffc86e });
    var bulbGeo = new THREE.SphereGeometry(0.09, 6, 6);
    for (var i = 0; i <= 20; i++) {
      var t = i / 20;
      // Front eave
      var bulb = new THREE.Mesh(bulbGeo, lightMat);
      bulb.position.set(-5 + t * 10, 6.1 + Math.sin(t * Math.PI) * 0.15, 4.15);
      g.add(bulb);
      // Porch edge
      var bulb2 = new THREE.Mesh(bulbGeo, lightMat);
      bulb2.position.set(-6 + t * 12, 5.05, 6.65);
      g.add(bulb2);
    }
    // Pumpkins (orange spheres, some with faces)
    var pumpkinMat = new THREE.MeshStandardMaterial({ color: 0xe67e22, roughness: 0.7 });
    var pumpkinGlow = new THREE.MeshBasicMaterial({ color: 0xff9a3d });
    var pumpkinPositions = [
      [-6, 0, 5], [-5, 0, 6], [6, 0, 5], [5.5, 0, 6.5], [-4, 0, 7], [4, 0, 7.5],
      [-7, 0, 3], [7, 0, 3.5], [0, 0, 8], [-3, 0, 8.5], [3, 0, 8.5]
    ];
    pumpkinPositions.forEach(function (pp, idx) {
      var s = 0.5 + Math.random() * 0.35;
      var pk = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), idx % 3 === 0 ? pumpkinGlow : pumpkinMat);
      pk.position.set(pp[0], s * 0.85, pp[2]);
      pk.scale.y = 0.85;
      pk.castShadow = true;
      g.add(pk);
      // Stem
      var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.3, 6),
        new THREE.MeshStandardMaterial({ color: 0x4a6b2a, roughness: 0.9 }));
      stem.position.set(pp[0], s * 0.85 + s * 0.85, pp[2]);
      g.add(stem);
    });
    // Hay bales
    var hayMat = new THREE.MeshStandardMaterial({ color: 0xd4a84b, roughness: 0.95 });
    [[-7.5, 2], [7.5, 2.5], [-6.5, -1]].forEach(function (hp) {
      var hay = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 1.2), hayMat);
      hay.position.set(hp[0], 0.55, hp[1]);
      hay.rotation.y = Math.random() * 0.6;
      hay.castShadow = true;
      g.add(hay);
    });
    // Ghosts (floating white sprites)
    var ghostMat = new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    for (var gi = 0; gi < 3; gi++) {
      var ghost = new THREE.Sprite(ghostMat);
      var gs = 0.8 + Math.random() * 0.4;
      ghost.scale.set(gs, gs * 1.2, 1);
      ghost.position.set(-4 + gi * 4 + Math.random(), 3.5 + Math.random() * 1.5, 5.5);
      ghost.userData = { baseY: ghost.position.y, phase: Math.random() * Math.PI * 2 };
      g.add(ghost);
      if (!g.userData.ghosts) g.userData.ghosts = [];
      g.userData.ghosts.push(ghost);
    }
    // Warm light from windows/door
    var barnLight = new THREE.PointLight(0xffb86e, 25, 20, 1.8);
    barnLight.position.set(0, 4, 6);
    g.add(barnLight);
    g.position.set(bx, gy, bz);
    g.rotation.y = yaw;
    scene.add(g);
    // Collider
    colliders.push({ x: bx, z: bz, r: 7 });
    // Interactable (popup, no interior)
    interactables.push({
      x: bx + Math.sin(yaw) * 8, z: bz + Math.cos(yaw) * 8, r: 6.5,
      label: '🎃 Halloween Barn',
      action: function () {
        if (window.KanavuSocial && window.KanavuSocial.openBuilding) {
          window.KanavuSocial.openBuilding('barn');
        }
      }
    });
    return g;
  }
  var halloweenBarn = null;

  /* ---------------- Island decorations (flowers, grass, etc.) ---------------- */
  var DECOR_KEY = 'kanavu-decorations-v1';
  var decorations = [];
  var decorGroup = null;
  function loadDecorations() {
    try {
      var raw = localStorage.getItem(DECOR_KEY);
      decorations = raw ? JSON.parse(raw) : [];
    } catch (e) { decorations = []; }
  }
  function saveDecorations() {
    try { localStorage.setItem(DECOR_KEY, JSON.stringify(decorations)); } catch (e) {}
  }
  function buildDecorMesh(type) {
    var g = new THREE.Group();
    if (type === 'flower') {
      // Stem + petals
      var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.7, 6),
        new THREE.MeshStandardMaterial({ color: 0x4a7c3a, roughness: 0.9 }));
      stem.position.y = 0.35;
      g.add(stem);
      var petalMat = new THREE.MeshStandardMaterial({
        color: [0xff6b9d, 0xffd93d, 0xff8c42, 0xc77dff][Math.floor(Math.random() * 4)],
        roughness: 0.7
      });
      for (var i = 0; i < 5; i++) {
        var p = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), petalMat);
        var a = (i / 5) * Math.PI * 2;
        p.position.set(Math.cos(a) * 0.14, 0.75, Math.sin(a) * 0.14);
        p.scale.y = 0.6;
        g.add(p);
      }
      var center = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0xffd93d, roughness: 0.6 }));
      center.position.y = 0.75;
      g.add(center);
    } else if (type === 'grass') {
      // Grass tuft (3 blades)
      var gm = new THREE.MeshStandardMaterial({ color: 0x5a9c4a, roughness: 0.95 });
      for (var gi = 0; gi < 3; gi++) {
        var blade = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.55 + Math.random() * 0.25, 5), gm);
        blade.position.set((Math.random() - 0.5) * 0.25, 0.28, (Math.random() - 0.5) * 0.25);
        blade.rotation.z = (Math.random() - 0.5) * 0.35;
        g.add(blade);
      }
    } else if (type === 'mushroom') {
      var cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xe74c3c, roughness: 0.7 }));
      cap.position.y = 0.28;
      g.add(cap);
      var stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.3, 6),
        new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.8 }));
      stalk.position.y = 0.15;
      g.add(stalk);
      // White dots
      for (var di = 0; di < 3; di++) {
        var dot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 5),
          new THREE.MeshBasicMaterial({ color: 0xffffff }));
        var da = Math.random() * Math.PI * 2;
        dot.position.set(Math.cos(da) * 0.12, 0.38, Math.sin(da) * 0.12);
        g.add(dot);
      }
    } else if (type === 'stone') {
      var rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35 + Math.random() * 0.2, 0),
        new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.95 }));
      rock.position.y = 0.25;
      rock.rotation.set(Math.random(), Math.random() * 3, Math.random());
      rock.scale.y = 0.7;
      g.add(rock);
    } else if (type === 'lantern') {
      // Paper lantern (glows at night)
      var post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.6, 6),
        new THREE.MeshStandardMaterial({ color: 0x4a2e20, roughness: 0.85 }));
      post.position.y = 0.8;
      g.add(post);
      var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xffe9b8, emissive: 0xffb86e, emissiveIntensity: 0.6, roughness: 0.5 }));
      lamp.position.y = 1.7;
      g.add(lamp);
    }
    return g;
  }
  function renderDecorations() {
    if (decorGroup) { scene.remove(decorGroup); }
    decorGroup = new THREE.Group();
    decorations.forEach(function (d) {
      var mesh = buildDecorMesh(d.type);
      var gy = groundHeight(d.x, d.z);
      mesh.position.set(d.x, gy > -900 ? gy : 0, d.z);
      mesh.rotation.y = d.rot || 0;
      decorGroup.add(mesh);
    });
    scene.add(decorGroup);
  }
  function addDecoration(type, x, z) {
    decorations.push({ type: type, x: +x.toFixed(1), z: +z.toFixed(1), rot: Math.random() * Math.PI * 2 });
    saveDecorations();
    renderDecorations();
  }
  function clearDecorations() {
    decorations = [];
    saveDecorations();
    renderDecorations();
  }
  loadDecorations();

  /* ---- exterior builder (local space: front/door faces +z) ---- */
  function buildExterior(b) {
    var spec = BTYPES[b.type];
    var w = spec.w, d = spec.d, wallH = spec.wallH, roofH = spec.roofH;
    var wallTop = 0.55 + wallH;
    var g = new THREE.Group();
    var cy = Math.cos(b.yaw), sy = Math.sin(b.yaw);
    function wpos(lx, ly, lz) {
      return { x: b.x + lx * cy + lz * sy, y: b.gy + ly, z: b.z - lx * sy + lz * cy };
    }
    function winst(im, lx, ly, lz, rx, ry, rz, sx, syy, sz, color) {
      var p = wpos(lx, ly, lz);
      im.add(p.x, p.y, p.z, rx || 0, (ry || 0) + b.yaw, rz || 0, sx || 1, syy || 1, sz || 1, color);
    }
    var woodParts = [], trimParts = [], roofParts = [], stoneParts = [], darkParts = [];
    var signParts = [], marqParts = [], posterParts = [], awnParts = [];

    /* stone pad (levels the slope) + foundation */
    stoneParts.push(part(GEO.box, 0, -1.45, 0.3, 0, 0, 0, w + 5, 3.6, d + 7, [4, 2]));
    stoneParts.push(part(GEO.box, 0, -0.1, 0, 0, 0, 0, w + 0.7, 1.3, d + 0.7, [w / 3, 1]));
    /* plank walls + corner boards + baseboard */
    woodParts.push(part(GEO.box, 0, 0.55 + wallH / 2, 0, 0, 0, 0, w, wallH, d, [w / 3, wallH / 3]));
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
      trimParts.push(part(GEO.box, s[0] * (w / 2 - 0.12), 0.55 + wallH / 2, s[1] * (d / 2 - 0.12),
        0, 0, 0, 0.5, wallH, 0.5, [1, 2]));
    });
    trimParts.push(part(GEO.box, 0, 0.72, 0, 0, 0, 0, w + 0.18, 0.35, d + 0.18, [w / 3, 1]));
    if (b.type === 'bookshop') // two-story band
      trimParts.push(part(GEO.box, 0, 0.55 + wallH / 2, 0, 0, 0, 0, w + 0.14, 0.32, d + 0.14, [w / 3, 1]));

    /* pitched shingle roof: two slabs + ridge beam + wood gables + frieze */
    var ov = 0.9, run = d / 2 + ov;
    var slopeLen = Math.sqrt(run * run + roofH * roofH) + 0.5;
    var ang = Math.atan2(roofH, run);
    roofParts.push(part(GEO.box, 0, wallTop + roofH / 2 + 0.12, run / 2, ang, 0, 0,
      w + 2 * ov, 0.35, slopeLen, [(w + 2 * ov) / 3, slopeLen / 3]));
    roofParts.push(part(GEO.box, 0, wallTop + roofH / 2 + 0.12, -run / 2, -ang, 0, 0,
      w + 2 * ov, 0.35, slopeLen, [(w + 2 * ov) / 3, slopeLen / 3]));
    roofParts.push(part(GEO.box, 0, wallTop + roofH + 0.18, 0, 0, 0, 0,
      w + 2 * ov + 0.3, 0.34, 0.75, [w / 3, 1]));
    var tri = new THREE.Shape();
    tri.moveTo(-d / 2, 0); tri.lineTo(d / 2, 0); tri.lineTo(0, roofH); tri.closePath();
    var triGeo = new THREE.ShapeGeometry(tri);
    woodParts.push(part(triGeo, w / 2 - 0.06, wallTop, 0, 0, Math.PI / 2, 0, 1, 1, 1, [d / 3, roofH / 3]));
    woodParts.push(part(triGeo, -w / 2 + 0.06, wallTop, 0, 0, -Math.PI / 2, 0, 1, 1, 1, [d / 3, roofH / 3]));
    trimParts.push(part(GEO.box, 0, wallTop + 0.32, d / 2 + 0.06, 0, 0, 0, w + 2 * ov - 0.2, 0.72, 0.16, [w / 3, 1]));
    trimParts.push(part(GEO.box, 0, wallTop + 0.32, -d / 2 - 0.06, 0, 0, 0, w + 2 * ov - 0.2, 0.72, 0.16, [w / 3, 1]));

    /* windows: instanced frame + glowing pane + sill */
    function window_(lx, ly, lz, lry, ww, wh) {
      winst(winFrameI, lx, ly, lz, 0, lry, 0, ww + 0.55, wh + 0.55, 0.3);
      var nx = Math.sin(lry), nz = Math.cos(lry);
      winst(winPaneI, lx + nx * 0.2, ly, lz + nz * 0.2, 0, lry, 0, ww, wh, 1);
      trimParts.push(part(GEO.box, lx, ly - wh / 2 - 0.16, lz, 0, lry, 0, ww + 0.8, 0.2, 0.5, [1, 1]));
    }
    /* door: dark recess + frame + panel(s) + step + handle */
    function door_(dx, dbl) {
      var dw = dbl ? 2.6 : 1.7, dh = 3.0, by = 0.55;
      darkParts.push(part(GEO.box, dx, by + dh / 2, d / 2 + 0.02, 0, 0, 0, dw + 0.5, dh + 0.35, 0.12, [1, 1]));
      trimParts.push(part(GEO.box, dx, by + dh / 2 + 0.05, d / 2 + 0.1, 0, 0, 0, dw + 0.3, dh + 0.3, 0.18, [1, 1]));
      if (dbl) {
        trimParts.push(part(GEO.box, dx - dw / 4, by + dh / 2, d / 2 + 0.2, 0, 0, 0, dw / 2 - 0.08, dh - 0.1, 0.1, [1, 1]));
        trimParts.push(part(GEO.box, dx + dw / 4, by + dh / 2, d / 2 + 0.2, 0, 0, 0, dw / 2 - 0.08, dh - 0.1, 0.1, [1, 1]));
      } else {
        trimParts.push(part(GEO.box, dx, by + dh / 2, d / 2 + 0.2, 0, 0, 0, dw - 0.12, dh - 0.1, 0.1, [1, 1]));
      }
      stoneParts.push(part(GEO.box, dx, 0.46, d / 2 + 0.75, 0, 0, 0, dw + 1.3, 0.22, 1.7, [1, 1]));
      var hx = dx + (dbl ? dw / 4 - 0.4 : dw / 2 - 0.4);
      var hp = wpos(hx, by + 1.55, d / 2 + 0.3);
      handleI.add(hp.x, hp.y, hp.z, 0, 0, 0, 0.18, 0.18, 0.18);
    }
    /* porch with posts + slanted roof (+ bench for the couple's house) */
    function porch_(withBench) {
      var pw = Math.min(w * 0.72, 7);
      woodParts.push(part(GEO.box, 0, 0.5, d / 2 + 1.5, 0, 0, 0, pw, 0.3, 3.0, [pw / 3, 1]));
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
        winst(postI, s[0] * (pw / 2 - 0.35), 2.35, d / 2 + 1.5 + s[1] * 1.15, 0, 0, 0, 0.3, 3.4, 0.3);
      });
      roofParts.push(part(GEO.box, 0, 4.0, d / 2 + 1.5, -0.09, 0, 0, pw + 0.9, 0.22, 3.9, [pw / 3, 1]));
      if (withBench) {
        var bz = d / 2 + 1.75, bx = -pw / 4;
        trimParts.push(part(GEO.box, bx, 1.2, bz, 0, 0, 0, 2.6, 0.22, 0.95, [1, 1]));
        trimParts.push(part(GEO.box, bx, 1.85, bz - 0.42, 0, 0, 0, 2.6, 1.05, 0.18, [1, 1]));
        trimParts.push(part(GEO.box, bx - 1.15, 0.85, bz, 0, 0, 0, 0.18, 0.75, 0.85, [1, 1]));
        trimParts.push(part(GEO.box, bx + 1.15, 0.85, bz, 0, 0, 0, 0.18, 0.75, 0.85, [1, 1]));
      }
    }

    /* per-type layout */
    var doorDx = 0;
    if (b.type === 'bookshop') {
      doorDx = -2.6;
      window_(1.4, 2.75, d / 2, 0, 3.4, 2.3);   // big display window
      window_(-2.6, 5.35, d / 2, 0, 1.5, 1.6);
      window_(0.6, 5.35, d / 2, 0, 1.5, 1.6);
      window_(3.2, 5.35, d / 2, 0, 1.5, 1.6);
      window_(w / 2, 2.75, 1.5, Math.PI / 2, 1.5, 1.8);
      window_(-w / 2, 2.75, 1.5, -Math.PI / 2, 1.5, 1.8);
      door_(doorDx, false);
      porch_(false);
      /* hanging book sign on a post */
      winst(postI, w / 2 + 1.6, 2.25, d / 2 + 0.6, 0, 0, 0, 0.3, 3.8, 0.3);
      trimParts.push(part(GEO.box, w / 2 + 0.85, 3.85, d / 2 + 0.6, 0, 0, 0, 1.7, 0.18, 0.18, [1, 1]));
      signParts.push(part(GEO.box, w / 2 + 0.85, 2.95, d / 2 + 0.6, 0, 0, 0, 1.9, 1.35, 0.12, [1, 1]));
    } else if (b.type === 'shop') {
      window_(-2.3, 2.95, d / 2, 0, 2.0, 1.8);
      window_(2.3, 2.95, d / 2, 0, 2.0, 1.8);
      window_(w / 2, 2.95, 0.5, Math.PI / 2, 1.6, 1.6);
      window_(-w / 2, 2.95, 0.5, -Math.PI / 2, 1.6, 1.6);
      door_(0, false);
      /* striped awning + crates + hanging sign between the posts */
      awnParts.push(part(GEO.box, 0, 4.35, d / 2 + 1.35, -0.33, 0, 0, 7.6, 0.16, 2.9, [3, 1]));
      winst(postI, -3.4, 2.25, d / 2 + 2.55, 0, 0, 0, 0.24, 3.9, 0.24);
      winst(postI, 3.4, 2.25, d / 2 + 2.55, 0, 0, 0, 0.24, 3.9, 0.24);
      winst(crateI, -w / 2 - 0.4, 0.9, d / 2 - 0.5, 0, 0.3, 0, 1.15, 1.1, 1.15);
      winst(crateI, -w / 2 - 0.3, 1.8, d / 2 - 0.6, 0, 0.9, 0, 0.9, 0.9, 0.9);
      winst(crateI, w / 2 + 0.5, 0.8, d / 2 - 0.4, 0, -0.2, 0, 0.95, 0.9, 0.95);
      signParts.push(part(GEO.box, 0, 3.2, d / 2 + 2.55, 0, 0, 0, 3.6, 1.1, 0.14, [1, 1]));
    } else if (b.type === 'theatre') {
      window_(-4.5, 2.9, d / 2, 0, 1.7, 2.0);
      window_(4.5, 2.9, d / 2, 0, 1.7, 2.0);
      window_(w / 2, 3.0, -1, Math.PI / 2, 1.6, 1.8);
      window_(-w / 2, 3.0, -1, -Math.PI / 2, 1.6, 1.8);
      door_(0, true);
      /* glowing marquee + poster frames */
      trimParts.push(part(GEO.box, 0, 4.9, d / 2 + 0.75, 0, 0, 0, 6.6, 1.6, 1.0, [2, 1]));
      marqParts.push(part(GEO.plane, 0, 4.9, d / 2 + 1.32, 0, 0, 0, 6.2, 1.25, 1, [1, 1]));
      posterParts.push(part(GEO.plane, -2.75, 2.7, d / 2 + 0.09, 0, 0, 0, 1.7, 2.3, 1, [0.5, 1, 0, 0]));
      posterParts.push(part(GEO.plane, 2.75, 2.7, d / 2 + 0.09, 0, 0, 0, 1.7, 2.3, 1, [0.5, 1, 0.5, 0]));
    } else if (b.type === 'cottage') {
      window_(-1.8, 2.45, d / 2, 0, 1.7, 1.5);
      window_(1.8, 2.45, d / 2, 0, 1.7, 1.5);
      window_(0, 2.45, -d / 2, Math.PI, 1.7, 1.5);
      door_(0, false);
      /* flower boxes + ivy + heart plaque */
      [-1.8, 1.8].forEach(function (fx, fi) {
        winst(planterI, fx, 1.32, d / 2 + 0.35, 0, 0, 0, 2.4, 0.55, 0.7);
        for (var f2 = 0; f2 < 5; f2++) {
          var pp = wpos(fx - 0.9 + f2 * 0.45, 1.82, d / 2 + 0.35);
          flowerI.add(pp.x, pp.y, pp.z, 0, 0, 0, 0.5, 0.5, 0.5,
            FLOWER_COLS[(f2 + fi * 2) % FLOWER_COLS.length]);
        }
      });
      var ir = mulberry32(7);
      for (var iv = 0; iv < 7; iv++) {
        var ipp = wpos(-w / 2 + 0.4 + ir() * 0.8, 1.2 + iv * 0.72 + ir() * 0.3, d / 2 + 0.28);
        leafI.add(ipp.x, ipp.y, ipp.z, 0, ir() * 3, 0, 1.1 + ir() * 0.7, 0.9 + ir() * 0.5, 0.8, 0x4a7a3e);
      }
      signParts.push(part(GEO.plane, 0, 4.05, d / 2 + 0.09, 0, 0, 0, 1.3, 1.3, 1, [1, 1]));
    } else if (b.type === 'house') {
      window_(-3.3, 2.85, d / 2, 0, 2.2, 1.9);
      window_(3.3, 2.85, d / 2, 0, 2.2, 1.9);
      window_(w / 2, 2.85, 1.8, Math.PI / 2, 1.8, 1.8);
      window_(w / 2, 2.85, -1.8, Math.PI / 2, 1.8, 1.8);
      window_(-w / 2, 2.85, 1.8, -Math.PI / 2, 1.8, 1.8);
      window_(-w / 2, 2.85, -1.8, -Math.PI / 2, 1.8, 1.8);
      door_(0, false);
      porch_(true);
      /* planters flanking the door + home plaque */
      [-2.6, 2.6].forEach(function (fx, fi) {
        winst(planterI, fx, 0.62, d / 2 + 0.9, 0, 0, 0, 1.1, 0.55, 1.1);
        for (var f3 = 0; f3 < 3; f3++) {
          var pp2 = wpos(fx - 0.3 + f3 * 0.3, 1.12, d / 2 + 0.9);
          flowerI.add(pp2.x, pp2.y, pp2.z, 0, 0, 0, 0.55, 0.55, 0.55,
            FLOWER_COLS[(f3 + fi * 3) % FLOWER_COLS.length]);
        }
      });
      signParts.push(part(GEO.plane, 0, 4.5, d / 2 + 0.09, 0, 0, 0, 2.6, 1.1, 1, [1, 1]));
    }

    /* chimney with animated smoke */
    var chx = w * 0.28, chimH = roofH + 2.4, chimTop = wallTop - 1.0 + chimH;
    stoneParts.push(part(GEO.box, chx, wallTop - 1.0 + chimH / 2, 0, 0, 0, 0, 1.2, chimH, 1.2, [1, 1]));
    stoneParts.push(part(GEO.box, chx, chimTop + 0.15, 0, 0, 0, 0, 1.7, 0.3, 1.7, [1, 1]));
    var sp = wpos(chx, chimTop + 0.5, 0);
    addSmokeEmitter(sp.x, sp.y, sp.z, { rate: 2.2, life: 3.2, vy: 1.7, vx: 0.35, size: 1.1, grow: 1.7, alpha: 0.4 });

    /* assemble merged meshes */
    var signMatFor = { book: bookSignMat, shop: shopSignMat, heart: heartSignMat, home: homeSignMat }[spec.sign];
    [meshFromParts(woodParts, wallMat), meshFromParts(trimParts, trimMat),
     meshFromParts(roofParts, roofMat), meshFromParts(stoneParts, stoneMat),
     meshFromParts(darkParts, darkMat),
     signMatFor ? meshFromParts(signParts, signMatFor) : null,
     meshFromParts(marqParts, marqueeMat), meshFromParts(posterParts, posterMat),
     meshFromParts(awnParts, awningMat)
    ].forEach(function (m) { if (m) g.add(m); });

    g.position.set(b.x, b.gy, b.z);
    g.rotation.y = b.yaw;
    registerChunk(g, b.x, b.z);

    /* collider, door prompt (just outside the slide-collider so it's always reachable) */
    var colR = Math.hypot(w + 5, d + 7) / 2 + 1;
    colliders.push({ x: b.x, z: b.z, r: colR });
    var dw = wpos(doorDx, 0, d / 2 + 0.1);
    b.door = { x: dw.x, z: dw.z, dx: doorDx };
    var promptD = colR + 0.8; // reachable ring: just outside where the collider leaves the player
    interactables.push({
      x: b.x + b.fx * promptD, z: b.z + b.fz * promptD, r: 6.5,
      label: spec.icon + ' ' + spec.name,
      buildingType: b.type, buildingSide: b.side,
      action: function () {
        if (b.type === 'theatre' && window.KanavuSocial && window.KanavuSocial.openTheatre) {
          window.KanavuSocial.openTheatre();
        } else if (window.KanavuSocial && window.KanavuSocial.openBuilding) {
          window.KanavuSocial.openBuilding(b.type, b.side); // popup pattern for every building; no interiors
        }
      }
    });
  }

  BUILDINGS.forEach(function (b) { buildExterior(b); });
  /* Halloween Barn beside the bridge entrance (island A side) */
  halloweenBarn = buildHalloweenBarn(-64, 16, Math.PI * 0.15);
  renderDecorations(); // island decorations (flowers, grass, etc.)
  /* ---- interiors: cozy teleport rooms far south over water ---- */
  var RW = 13, RD = 11, WH = 4.2;
  var BOOK_COLS = [0xc94f4f, 0x4a7ab8, 0x4aa86b, 0xd8a04a, 0x8a5ab8, 0xe8e0d0, 0x3a8a8a];
  var JAR_COLS = [0xd8a04a, 0x8ab86a, 0xc96a8a, 0x7ab8c9, 0xe8e0d0];
  function addBookRow(wx, wy, wz, n, seed) {
    var r = mulberry32(1000 + seed);
    for (var i = 0; i < n; i++) {
      var bw = 0.26 + r() * 0.12, bh = 0.55 + r() * 0.2;
      bookI.add(wx - n * 0.17 + i * 0.34 + bw / 2, wy + bh / 2, wz,
        0, (r() - 0.5) * 0.12, (r() - 0.5) * 0.06,
        bw, bh, 0.62, BOOK_COLS[Math.floor(r() * BOOK_COLS.length)]);
    }
  }
  var _fc = new THREE.Color();
  function softPart(geo, px, py, pz, rx, ry, rz, sx, sy, sz, hex) {
    var g2 = part(geo, px, py, pz, rx, ry, rz, sx, sy, sz);
    var n = g2.attributes.position.count, col = new Float32Array(n * 3);
    _fc.setHex(hex);
    for (var i = 0; i < n; i++) { col[i * 3] = _fc.r; col[i * 3 + 1] = _fc.g; col[i * 3 + 2] = _fc.b; }
    g2.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g2;
  }

  function buildInterior(b, idx) {
    var g = new THREE.Group();
    var cx = b.ix, cz = b.iz;
    g.position.set(cx, 0, cz);
    /* dollhouse shell: inward-facing planes (single-sided) merged into one mesh.
       From outside the room the near wall/ceiling cull away so the camera
       always sees in; from inside everything renders. No per-frame hiding. */
    var segW = (RW - 2.0) / 2;
    var shellMesh = new THREE.Mesh(mergeGeos([
      part(GEO.plane, 0, WH / 2, -RD / 2, 0, 0, 0, RW, WH, 1, [RW / 3, WH / 3]),
      part(GEO.plane, -(1.0 + segW / 2), WH / 2, RD / 2, 0, Math.PI, 0, segW, WH, 1, [segW / 3, WH / 3]),
      part(GEO.plane, (1.0 + segW / 2), WH / 2, RD / 2, 0, Math.PI, 0, segW, WH, 1, [segW / 3, WH / 3]),
      part(GEO.plane, 0, 3.1 + (WH - 3.1) / 2, RD / 2, 0, Math.PI, 0, 2.0, WH - 3.1, 1, [1, 1]),
      part(GEO.plane, -RW / 2, WH / 2, 0, 0, Math.PI / 2, 0, RD, WH, 1, [RD / 3, WH / 3]),
      part(GEO.plane, RW / 2, WH / 2, 0, 0, -Math.PI / 2, 0, RD, WH, 1, [RD / 3, WH / 3]),
      part(GEO.plane, 0, WH, 0, Math.PI / 2, 0, 0, RW, RD, 1, [RW / 3, RD / 3])
    ]), wallMat);
    shellMesh.receiveShadow = true;
    g.add(shellMesh);
    /* open door panel swung inward (marks the entrance) */
    var doorMesh = new THREE.Mesh(mergeGeos([
      part(GEO.box, -1.7, 1.5, -0.7, 0, 1.05, 0, 1.9, 3.0, 0.12, [1, 1])
    ]), trimMat);
    doorMesh.position.set(0, 0, RD / 2);
    g.add(doorMesh);
    /* platform + plank floor (top at y=0) + baseboards */
    var floorMesh = new THREE.Mesh(mergeGeos([
      part(GEO.box, 0, -0.81, 0, 0, 0, 0, RW + 2.5, 1.3, RD + 2.5, [5, 1]),
      part(GEO.box, 0, -0.08, 0, 0, 0, 0, RW, 0.16, RD, [RW / 3, RD / 3]),
      part(GEO.box, 0, 0.14, -RD / 2 + 0.2, 0, 0, 0, RW - 0.4, 0.28, 0.12, [3, 1]),
      part(GEO.box, 0, 0.14, RD / 2 - 0.2, 0, 0, 0, RW - 0.4, 0.28, 0.12, [3, 1]),
      part(GEO.box, -RW / 2 + 0.2, 0.14, 0, 0, 0, 0, 0.12, 0.28, RD - 0.4, [1, 1]),
      part(GEO.box, RW / 2 - 0.2, 0.14, 0, 0, 0, 0, 0.12, 0.28, RD - 0.4, [1, 1])
    ]), wallMat);
    floorMesh.castShadow = true; floorMesh.receiveShadow = true;
    g.add(floorMesh);
    /* hanging lamp + warm point light */
    var lampMesh = new THREE.Mesh(mergeGeos([
      part(GEO.cyl, 0, WH - 0.5, 0, 0, 0, 0, 0.12, 1.0, 0.12, [1, 1]),
      part(GEO.cyl, 0, WH - 1.35, 0, 0, 0, 0, 1.5, 0.85, 1.5, [1, 1])
    ]), shadeMat);
    g.add(lampMesh);
    var lampLight = new THREE.PointLight(0xffc98a, 5, 20, 1.8);
    lampLight.position.set(0, WH - 1.9, 0);
    g.add(lampLight);

    var woodP = [], softP = [], trimP = [], photoP = [];
    var extras = []; // {parts, mat, noShadow}
    var rugX = 0, rugZ = 0;

    if (b.type === 'bookshop') {
      rugX = -3; rugZ = 2.2;
      [-4, 0, 4].forEach(function (sx, si) {
        woodP.push(part(GEO.box, sx - 1.6, 1.82, -RD / 2 + 0.45, 0, 0, 0, 0.18, 3.6, 0.9, [1, 1]));
        woodP.push(part(GEO.box, sx + 1.6, 1.82, -RD / 2 + 0.45, 0, 0, 0, 0.18, 3.6, 0.9, [1, 1]));
        for (var s2 = 0; s2 < 4; s2++)
          woodP.push(part(GEO.box, sx, 0.62 + s2 * 0.95, -RD / 2 + 0.45, 0, 0, 0, 3.4, 0.14, 0.9, [1, 1]));
        for (var s3 = 0; s3 < 3; s3++)
          addBookRow(cx + sx - 1.35, 0.69 + s3 * 0.95, cz - RD / 2 + 0.45, 8, si * 10 + s3);
      });
      woodP.push(part(GEO.box, 3.6, 0.65, 3.2, 0, 0, 0, 2.6, 1.3, 1.1, [1, 1]));
      woodP.push(part(GEO.box, 3.6, 1.36, 3.2, 0, 0, 0, 2.8, 0.12, 1.3, [1, 1]));
      softP.push(softPart(GEO.box, -3.6, 0.42, 2.4, 0, 0.5, 0, 1.5, 0.7, 1.4, 0xb85c38));
      softP.push(softPart(GEO.box, -3.6, 1.02, 2.95, 0, 0.5, 0, 1.5, 1.1, 0.35, 0xb85c38));
      softP.push(softPart(GEO.box, -4.3, 0.82, 2.4, 0, 0.5, 0, 0.3, 0.9, 1.3, 0xa04e30));
      softP.push(softPart(GEO.box, -2.9, 0.82, 2.4, 0, 0.5, 0, 0.3, 0.9, 1.3, 0xa04e30));
      woodP.push(part(GEO.cyl, -1.8, 0.45, 3.4, 0, 0, 0, 1.0, 0.9, 1.0, [1, 1]));
    } else if (b.type === 'shop') {
      rugX = 0.5; rugZ = 1.5;
      [-1, 1].forEach(function (s) {
        var wx = s * (RW / 2 - 0.75);
        [-2.2, 1.4].forEach(function (wz, zi) {
          woodP.push(part(GEO.box, wx - s * 0.55, 1.75, wz - 1.05, 0, 0, 0, 0.16, 3.5, 0.8, [1, 1]));
          woodP.push(part(GEO.box, wx - s * 0.55, 1.75, wz + 1.05, 0, 0, 0, 0.16, 3.5, 0.8, [1, 1]));
          for (var sh = 0; sh < 3; sh++) {
            var byy = 0.75 + sh * 0.95;
            woodP.push(part(GEO.box, wx - s * 0.55, byy, wz, 0, 0, 0, 0.9, 0.14, 2.3, [1, 1]));
            for (var ji = 0; ji < 4; ji++)
              jarI.add(cx + wx - s * 0.55, byy + 0.38, cz + wz - 0.75 + ji * 0.5, 0, 0, 0,
                0.5, 0.62, 0.5, JAR_COLS[(ji + sh * 2 + zi * 3 + (s > 0 ? 5 : 0)) % JAR_COLS.length]);
          }
        });
      });
      woodP.push(part(GEO.box, 2.8, 0.6, 3.4, 0, 0, 0, 3.0, 1.2, 1.2, [1, 1]));
      woodP.push(part(GEO.box, 2.8, 1.25, 3.4, 0, 0, 0, 3.1, 0.1, 1.3, [1, 1]));
      trimP.push(part(GEO.box, -1.2, WH - 0.6, 1.5, 0, 0, 0, 0.08, 1.2, 0.08, [1, 1]));
      trimP.push(part(GEO.box, 1.2, WH - 0.6, 1.5, 0, 0, 0, 0.08, 1.2, 0.08, [1, 1]));
      extras.push({ parts: [part(GEO.box, 0, WH - 1.7, 1.5, 0, 0, 0, 3.0, 1.1, 0.14, [1, 1])], mat: shopSignMat });
    } else if (b.type === 'theatre') {
      rugX = 0; rugZ = 2.6;
      woodP.push(part(GEO.box, 0, 0.4, -3.6, 0, 0, 0, 6.4, 0.8, 3.0, [2, 1]));
      softP.push(softPart(GEO.box, 0, 2.0, -5.05, 0, 0, 0, 6.4, 3.8, 0.25, 0x6e1f1f));
      softP.push(softPart(GEO.box, -3.0, 2.1, -4.55, 0, 0.28, 0, 1.15, 4.0, 0.7, 0xa32e2e));
      softP.push(softPart(GEO.box, 3.0, 2.1, -4.55, 0, -0.28, 0, 1.15, 4.0, 0.7, 0xa32e2e));
      softP.push(softPart(GEO.box, 0, 3.7, -4.65, 0, 0, 0, 7.2, 0.9, 0.6, 0x8a2828));
      [-1.35, 1.35].forEach(function (sx) {
        softP.push(softPart(GEO.box, sx, 0.42, 0.9, 0, 0, 0, 1.45, 0.7, 1.35, 0x5a3a8a));
        softP.push(softPart(GEO.box, sx, 1.12, 1.5, -0.14, 0, 0, 1.45, 1.25, 0.35, 0x5a3a8a));
        softP.push(softPart(GEO.box, sx - 0.82, 0.82, 0.9, 0, 0, 0, 0.25, 0.75, 1.25, 0x4a2e72));
        softP.push(softPart(GEO.box, sx + 0.82, 0.82, 0.9, 0, 0, 0, 0.25, 0.75, 1.25, 0x4a2e72));
      });
      woodP.push(part(GEO.cyl, 0, 0.85, 4.2, 0, 0, 0, 0.5, 1.7, 0.5, [1, 1]));
      woodP.push(part(GEO.box, 0, 1.85, 4.2, 0, 0, 0, 1.1, 0.55, 1.3, [1, 1]));
      var beam = new THREE.Mesh(new THREE.ConeGeometry(2.3, 9.4, 12, 1, true), coneMat);
      beam.rotation.x = Math.PI / 2 + 0.02; // narrow at projector, wide at backdrop
      beam.position.set(0, 2.1, -0.4);
      beam.castShadow = false;
      g.add(beam);
    } else if (b.type === 'cottage') {
      rugX = -2.2; rugZ = 1.2;
      [-2.7, 0, 2.7].forEach(function (fx, fi) {
        woodP.push(part(GEO.box, fx, 2.5, -RD / 2 + 0.22, 0, 0, 0, 2.1, 1.6, 0.14, [1, 1]));
        photoP.push(part(GEO.plane, fx, 2.5, -RD / 2 + 0.31, 0, 0, 0, 1.8, 1.35, 1, [1 / 3, 1, fi / 3, 0]));
      });
      woodP.push(part(GEO.box, 3.8, 0.62, 1.4, 0, 0, 0, 2.3, 1.05, 1.25, [1, 1]));
      woodP.push(part(GEO.box, 3.8, 1.22, 1.4, 0, 0, 0, 2.3, 0.3, 1.25, [1, 1]));
      trimP.push(part(GEO.box, 3.1, 0.65, 1.4, 0, 0, 0, 0.16, 1.15, 1.31, [1, 1]));
      trimP.push(part(GEO.box, 4.5, 0.65, 1.4, 0, 0, 0, 0.16, 1.15, 1.31, [1, 1]));
      /* rocking chair (grounded, facing the room) */
      woodP.push(part(GEO.box, -3.95, 0.08, 1.6, 0, 0, 0, 0.14, 0.1, 2.5, [1, 1]));
      woodP.push(part(GEO.box, -2.85, 0.08, 1.6, 0, 0, 0, 0.14, 0.1, 2.5, [1, 1]));
      woodP.push(part(GEO.box, -3.95, 0.42, 1.15, 0, 0, 0, 0.12, 0.7, 0.12, [1, 1]));
      woodP.push(part(GEO.box, -3.95, 0.42, 2.05, 0, 0, 0, 0.12, 0.7, 0.12, [1, 1]));
      woodP.push(part(GEO.box, -2.85, 0.42, 1.15, 0, 0, 0, 0.12, 0.7, 0.12, [1, 1]));
      woodP.push(part(GEO.box, -2.85, 0.42, 2.05, 0, 0, 0, 0.12, 0.7, 0.12, [1, 1]));
      woodP.push(part(GEO.box, -3.4, 0.8, 1.6, 0, 0, 0, 1.3, 0.14, 1.2, [1, 1]));
      woodP.push(part(GEO.box, -3.4, 1.55, 1.02, -0.16, 0, 0, 1.3, 1.5, 0.14, [1, 1]));
    } else if (b.type === 'house') {
      rugX = -3.0; rugZ = 1.0;
      woodP.push(part(GEO.box, 1.4, 0.7, -0.5, 0, 0, 0, 0.55, 1.4, 5.2, [1, 2]));
      /* sofa facing the TV wall */
      softP.push(softPart(GEO.box, -3.0, 0.42, 2.6, 0, 0, 0, 3.0, 0.7, 1.4, 0x3a7a8a));
      softP.push(softPart(GEO.box, -3.0, 1.07, 3.25, 0, 0, 0, 3.0, 1.2, 0.4, 0x3a7a8a));
      softP.push(softPart(GEO.box, -4.35, 0.82, 2.6, 0, 0, 0, 0.35, 0.8, 1.4, 0x2e626e));
      softP.push(softPart(GEO.box, -1.65, 0.82, 2.6, 0, 0, 0, 0.35, 0.8, 1.4, 0x2e626e));
      woodP.push(part(GEO.box, -3.0, 0.42, 0.9, 0, 0, 0, 1.8, 0.14, 0.9, [1, 1]));
      woodP.push(part(GEO.box, -3.7, 0.2, 0.9, 0, 0, 0, 0.14, 0.4, 0.8, [1, 1]));
      woodP.push(part(GEO.box, -2.3, 0.2, 0.9, 0, 0, 0, 0.14, 0.4, 0.8, [1, 1]));
      /* TV console + screen */
      woodP.push(part(GEO.box, -3.0, 0.5, -RD / 2 + 0.55, 0, 0, 0, 4.0, 1.0, 0.9, [2, 1]));
      var tvCanvas = document.createElement('canvas'); tvCanvas.width = 128; tvCanvas.height = 96;
      var tvCtx = tvCanvas.getContext('2d');
      var tvTex = new THREE.CanvasTexture(tvCanvas);
      tvTex.colorSpace = THREE.SRGBColorSpace;
      drawTVOff(tvCtx);
      var tvScreenMat = new THREE.MeshBasicMaterial({ map: tvTex });
      extras.push({
        parts: [part(GEO.plane, -3.0, 2.6, -RD / 2 + 0.18, 0, 0, 0, 3.5, 2.1, 1, [1, 1])],
        mat: tvScreenMat, noShadow: true
      });
      /* tea table + tea set */
      woodP.push(part(GEO.cyl, -0.9, 0.75, 1.4, 0, 0, 0, 1.6, 0.12, 1.6, [1, 1]));
      woodP.push(part(GEO.cyl, -0.9, 0.38, 1.4, 0, 0, 0, 0.3, 0.75, 0.3, [1, 1]));
      extras.push({
        parts: [
          part(GEO.box, -0.9, 0.86, 1.4, 0, 0, 0, 1.15, 0.07, 0.75, [1, 1]),
          part(GEO.cyl, -1.15, 0.99, 1.3, 0, 0, 0, 0.32, 0.24, 0.32, [1, 1]),
          part(GEO.cyl, -0.65, 0.99, 1.55, 0, 0, 0, 0.32, 0.24, 0.32, [1, 1])
        ], mat: ceramicMat
      });
      var liqMesh = new THREE.Mesh(mergeGeos([
        part(GEO.circle, -1.15, 1.1, 1.3, -Math.PI / 2, 0, 0, 0.26, 0.26, 1, [1, 1]),
        part(GEO.circle, -0.65, 1.1, 1.55, -Math.PI / 2, 0, 0, 0.26, 0.26, 1, [1, 1])
      ]), teaMat);
      liqMesh.visible = false;
      g.add(liqMesh);
      /* bed with blanket + pillows */
      woodP.push(part(GEO.box, 4.0, 0.45, -2.2, 0, 0, 0, 3.4, 0.9, 4.8, [2, 2]));
      woodP.push(part(GEO.box, 4.0, 1.3, -4.5, 0, 0, 0, 3.4, 1.6, 0.25, [1, 1]));
      softP.push(softPart(GEO.box, 4.0, 1.0, -2.2, 0, 0, 0, 3.2, 0.5, 4.6, 0xe8e0d0));
      softP.push(softPart(GEO.box, 4.0, 1.25, -1.4, 0, 0, 0, 3.25, 0.28, 2.6, 0xc96a7a));
      softP.push(softPart(GEO.box, 3.2, 1.35, -3.9, 0, 0, 0, 1.2, 0.35, 0.9, 0xf5f0e6));
      softP.push(softPart(GEO.box, 4.8, 1.35, -3.9, 0, 0, 0, 1.2, 0.35, 0.9, 0xf5f0e6));
      /* kitchen corner + kettle */
      woodP.push(part(GEO.box, 4.6, 0.6, 3.4, 0, 0, 0, 2.6, 1.2, 1.1, [1, 1]));
      woodP.push(part(GEO.box, 4.6, 1.26, 3.4, 0, 0, 0, 2.7, 0.1, 1.2, [1, 1]));
      trimP.push(part(GEO.box, 2.6, 0.55, 3.4, 0, 0, 0, 1.4, 1.1, 1.1, [1, 1]));
      extras.push({
        parts: [
          part(GEO.cyl, 2.6, 1.5, 3.4, 0, 0, 0, 0.85, 0.75, 0.85, [1, 1]),
          part(GEO.cyl, 2.6, 1.95, 3.4, 0, 0, 0, 0.5, 0.18, 0.5, [1, 1]),
          part(GEO.sph, 2.6, 2.08, 3.4, 0, 0, 0, 0.16, 0.16, 0.16, [1, 1]),
          part(GEO.cyl, 3.05, 1.62, 3.4, 0, 0, -0.7, 0.18, 0.6, 0.18, [1, 1])
        ], mat: metalMat
      });
      /* interactions */
      var teaState = { brewing: false, steamUntil: 0, liquid: liqMesh, it: null };
      addSmokeEmitter(cx + 2.9, 2.35, cz + 3.4, {
        rate: 26, life: 1.5, vy: 1.5, size: 0.45, grow: 2.4, alpha: 0.5,
        active: function () { return performance.now() < teaState.steamUntil; }
      });
      var teaIt = {
        x: cx - 0.9, z: cz + 1.4, r: 3.2, label: '🍵 Make tea',
        action: function () { doTea(teaState); }
      };
      teaState.it = teaIt;
      interactables.push(teaIt);
      var tvState = { watching: false, lastDraw: 0, tex: tvTex, ctx: tvCtx, rand: mulberry32(900 + idx), it: null };
      var tvIt = {
        x: cx - 3.0, z: cz - 3.4, r: 3.6, label: '📺 Watch TV',
        action: function () { toggleTV(tvState); }
      };
      tvState.it = tvIt;
      tvStates.push(tvState);
      interactables.push(tvIt);
      interactables.push({
        x: cx + 4.0, z: cz + 0.8, r: 3.4, label: '😴 Sleep',
        action: function () { doSleep(); }
      });
    }

    /* rug */
    var rug = new THREE.Mesh(mergeGeos([part(GEO.circle, 0, 0, 0, -Math.PI / 2, 0, 0, 4.6, 4.6, 1, [1, 1])]), rugMat);
    rug.position.set(rugX, 0.03, rugZ);
    rug.receiveShadow = true;
    g.add(rug);

    /* merged prop meshes */
    function addMerged(parts, mat, noShadow) {
      if (!parts.length) return;
      var m = new THREE.Mesh(mergeGeos(parts), mat);
      m.castShadow = !noShadow; m.receiveShadow = true;
      g.add(m);
    }
    addMerged(woodP, wallMat);
    addMerged(softP, fabricMat);
    addMerged(trimP, trimMat);
    addMerged(photoP, photoMat);
    extras.forEach(function (ex) { addMerged(ex.parts, ex.mat, ex.noShadow); });

    /* exit door prompt (inside, in front of the door) */
    interactables.push({
      x: cx, z: cz + 3.6, r: 4.2, label: '🚪 Exit',
      action: function () { exitInterior(b); }
    });

    g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    var room = { cx: cx, cz: cz, lampLight: lampLight };
    rooms.push(room);
    interiorZones.push({ x0: cx - RW / 2, x1: cx + RW / 2, z0: cz - RD / 2, z1: cz + RD / 2, y: 0.02, room: room });
    b.roomObj = g; // for interior isolation (hide the outside world while inside)
    registerChunk(g, cx, cz);
  }

  /* ---- prompt system (DOM button bottom-center + E key; later phases reuse) ---- */
  var promptEl = document.createElement('button');
  promptEl.style.cssText = 'position:fixed;left:50%;bottom:30px;transform:translateX(-50%);' +
    'z-index:30;display:none;cursor:pointer;max-width:86vw;' +
    'font:600 17px Georgia,serif;color:#ffe9b8;background:rgba(46,26,14,0.88);' +
    'border:2px solid rgba(255,200,120,0.65);border-radius:999px;padding:15px 30px;' +
    'box-shadow:0 4px 18px rgba(0,0,0,0.45);touch-action:manipulation;';
  document.body.appendChild(promptEl);
  var promptShownLabel = null;
  function showPrompt(label, onAction) {
    promptShownLabel = label; promptAction = onAction || null;
    promptEl.textContent = '';
    promptEl.appendChild(document.createTextNode(label + '   '));
    if (!window.matchMedia || !window.matchMedia('(pointer: coarse)').matches) { // hide the E chip on touch devices
      var k = document.createElement('span');
      k.style.cssText = 'opacity:0.65;font-size:13px;border:1px solid rgba(255,233,184,0.5);' +
        'border-radius:6px;padding:2px 8px;';
      k.textContent = 'E';
      promptEl.appendChild(k);
    }
    promptEl.style.display = 'block';
  }
  function hidePrompt() {
    promptEl.style.display = 'none'; promptAction = null; promptShownLabel = null;
  }
  promptEl.addEventListener('click', function () { if (promptAction) promptAction(); });
  var currentInteract = null;
  function updatePrompts() {
    if (promptLocked) return; // Phase 4: exclusive prompt (Dismount/Exit/Stand up) stays put
    var best = null, bd = 1e9;
    for (var i = 0; i < interactables.length; i++) {
      var it = interactables[i];
      if (it.disabled) continue; // Phase 4: e.g. ridden bike / boarded wheel
      var dx = player.position.x - it.x, dz = player.position.z - it.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d < it.r && d < bd) { bd = d; best = it; }
    }
    if (best !== currentInteract || (best && best.label !== promptShownLabel)) {
      currentInteract = best;
      if (best) showPrompt(best.label, best.action); else hidePrompt();
    }
  }

  /* ---- fade overlay + teleport ---- */
  var fadeEl = document.createElement('div');
  fadeEl.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;' +
    'z-index:40;transition:opacity 0.85s ease;';
  document.body.appendChild(fadeEl);
  function fadeTo(black, dur, cb) {
    fadeEl.style.transition = 'opacity ' + dur + 's ease';
    fadeEl.style.opacity = black ? '1' : '0';
    if (cb) setTimeout(cb, dur * 1000 + 60);
  }
  function fadeTeleport(cb) { fadeTo(true, 0.22, function () { cb(); fadeTo(false, 0.35); }); }
  var insideRoomObj = null; // set while inside a building: exterior chunks stay hidden
  function enterInterior(b) {
    hidePrompt();
    movementLocked = true; // no walking during the fade (smooth, no glitch)
    fadeTeleport(function () {
      player.position.set(b.ix, 0.2, b.iz + 3.0);
      playerYaw = targetYaw = Math.PI; player.rotation.y = Math.PI;
      orbit.yaw = Math.PI;
      insideRoomObj = b.roomObj || null;
      camDistSm = 6.5; // snap the camera inside: no fly-through, room fills the screen
      movementLocked = false;
    });
  }
  function exitInterior(b) {
    hidePrompt();
    movementLocked = true;
    fadeTeleport(function () {
      player.position.set(b.door.x + b.fx * 3.2, b.gy + 0.6, b.door.z + b.fz * 3.2);
      var yw = Math.atan2(b.fx, b.fz);
      playerYaw = targetYaw = yw; player.rotation.y = yw;
      orbit.yaw = yw;
      insideRoomObj = null;
      camDistSm = orbit.dist; // snap back out
      movementLocked = false;
    });
  }

  /* ---- interior interactions ---- */
  var sleeping = false;
  function doSleep() {
    if (sleeping) return; sleeping = true; hidePrompt();
    fadeTo(true, 0.9, function () {
      setTimeout(function () {
        manualHour = 7.5; // wake to morning light
        fadeTo(false, 1.1, function () { sleeping = false; });
      }, 1200);
    });
  }
  function doTea(st) {
    if (st.brewing) return;
    st.brewing = true;
    st.steamUntil = performance.now() + 4000;
    setTimeout(function () {
      st.brewing = false;
      st.liquid.visible = true;
      st.it.label = '🍵 Pour more tea';
      if (currentInteract === st.it) showPrompt(st.it.label, st.it.action);
    }, 4100);
  }
  function drawTVOff(g2) {
    g2.fillStyle = '#0e1420'; g2.fillRect(0, 0, 128, 96);
    g2.fillStyle = 'rgba(120,160,200,0.25)'; g2.fillRect(10, 10, 50, 76);
  }
  function drawTVStatic(st) {
    try {
      var g2 = st.ctx, W = 128, H = 96, r = st.rand;
      var img = g2.createImageData(W, H), dd = img.data;
      for (var i = 0; i < dd.length; i += 4) {
        var v = (r() * 255) | 0;
        dd[i] = v; dd[i + 1] = v; dd[i + 2] = v; dd[i + 3] = 255;
      }
      g2.putImageData(img, 0, 0);
      st.tex.needsUpdate = true;
    } catch (e) { /* headless stub */ }
  }
  function toggleTV(st) {
    st.watching = !st.watching;
    if (!st.watching) drawTVOff(st.ctx);
    st.it.label = st.watching ? '📺 Turn off TV' : '📺 Watch TV';
    if (currentInteract === st.it) showPrompt(st.it.label, st.it.action);
  }

  /* ---- per-frame Phase 2 update: smoke, prompts, lamp lights, TV ---- */
  var p2frame = 0;
  function updatePhase2(dt, t) {
    updateSmoke(dt);
    if ((p2frame++ % 6) === 0) updatePrompts();
    for (var i = 0; i < rooms.length; i++) {
      var rm = rooms[i];
      var near = Math.hypot(player.position.x - rm.cx, player.position.z - rm.cz) < 45;
      if (rm.lampLight.visible !== near) rm.lampLight.visible = near;
    }
    for (var ti = 0; ti < tvStates.length; ti++) {
      var st = tvStates[ti];
      if (st.watching && t - st.lastDraw > 0.12) { st.lastDraw = t; drawTVStatic(st); }
    }
  }

  /* ---- build all interiors, then bake the instanced meshes ---- */
  BUILDINGS.forEach(function (b, bi) { buildInterior(b, bi); });
  winFrameI.build(); winPaneI.build(); postI.build(); crateI.build(); handleI.build();
  planterI.build(); flowerI.build(); leafI.build(); bookI.build(); jarI.build();

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

  /* ================= Phase 3: characters ================= */
  /* Procedural Pixar-style BOY (player) + GIRL (partner Tara), ~2.8u tall.
     Built from merged primitive parts + shared materials/geometries:
     boy = 20 draw calls, girl = 19 -> 39 total for both characters. */
  var CHSPH = new THREE.SphereGeometry(0.5, 20, 16);    // hero surfaces
  var CHSPH_LO = new THREE.SphereGeometry(0.5, 12, 10); // small merged bits
  var CHCYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
  /* ---- cozy fabric textures: canvas-generated knit / cable / fleece ----
     Applied to sweater + boot materials so the characters match their
     reference portraits (ribbed olive knit, salmon cable-knit, shearling). */
  function _charCanvas(size, draw) {
    var c = document.createElement('canvas'); c.width = c.height = size;
    draw(c.getContext('2d'), size);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  function shadeHex(hex, amt) { // M6: darken/lighten a hex color by amt (-100..100)
    var n = parseInt(String(hex).replace('#', ''), 16);
    var r = Math.max(0, Math.min(255, (n >> 16) + amt));
    var g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    var b = Math.max(0, Math.min(255, (n & 255) + amt));
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }
  function knitTex(base, dark) { // vertical ribbed knit (boy's olive sweater)
    return _charCanvas(256, function (g, s) {
      g.fillStyle = base; g.fillRect(0, 0, s, s);
      var ribW = 14;
      for (var x = 0; x < s; x += ribW) {
        g.fillStyle = dark; g.fillRect(x, 0, ribW * 0.38, s);
        g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x + ribW * 0.55, 0, ribW * 0.18, s);
      }
      g.fillStyle = 'rgba(0,0,0,0.06)'; // faint horizontal rows
      for (var y = 0; y < s; y += 10) g.fillRect(0, y, s, 1);
    });
  }
  function cableTex(base, dark) { // girl's salmon cable-knit: twisted braid columns
    return _charCanvas(256, function (g, s) {
      g.fillStyle = base; g.fillRect(0, 0, s, s);
      var col = s / 4;
      for (var i = 0; i < 4; i++) {
        var x0 = i * col;
        for (var y = 0; y < s; y += 16) {
          g.strokeStyle = dark; g.lineWidth = 5; g.lineCap = 'round';
          g.beginPath(); g.moveTo(x0 + 8, y); g.lineTo(x0 + col - 8, y + 16); g.stroke();
          g.beginPath(); g.moveTo(x0 + col - 8, y); g.lineTo(x0 + 8, y + 16); g.stroke();
          g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 2;
          g.beginPath(); g.moveTo(x0 + 11, y + 3); g.lineTo(x0 + col - 11, y + 13); g.stroke();
        }
        g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(x0, 0, 3, s); // purl gutter
      }
    });
  }
  function fleeceTex(base) { // girl's shearling boots: fuzzy noise
    return _charCanvas(128, function (g, s) {
      g.fillStyle = base; g.fillRect(0, 0, s, s);
      var r = mulberry32(77);
      for (var i = 0; i < 2600; i++) {
        g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.28)' : 'rgba(188,172,148,0.28)';
        g.fillRect(r() * s, r() * s, 1.7, 1.7);
      }
    });
  }
  var CHMAT = {
    skin:   new THREE.MeshStandardMaterial({ color: 0xb07a4f, roughness: 0.62 }),
    hair:   new THREE.MeshStandardMaterial({ color: 0x25201b, roughness: 0.58 }),
    eyeW:   new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32 }),
    pupil:  new THREE.MeshStandardMaterial({ color: 0x26211d, roughness: 0.28 }),
    mouth:  new THREE.MeshStandardMaterial({ color: 0x7c4634, roughness: 0.60 }),
    brow:   new THREE.MeshStandardMaterial({ color: 0x25201b, roughness: 0.60 }),
    hl:     new THREE.MeshBasicMaterial({ color: 0xffffff }), // eye catchlight
    blush:  new THREE.MeshStandardMaterial({ color: 0xd98873, roughness: 0.70 }),
    bead:   new THREE.MeshStandardMaterial({ color: 0xe79fb2, roughness: 0.45 }), // pink braid beads
    hairG:  new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.55 }), // girl's warm dark brown
    boySw:  new THREE.MeshStandardMaterial({ map: knitTex('#6d7f3c', '#57652f'), roughness: 0.92 }), // ribbed olive knit
    boyHem: new THREE.MeshStandardMaterial({ color: 0xf2ede2, roughness: 0.75 }), // white trim
    boyPn:  new THREE.MeshStandardMaterial({ color: 0x3b4048, roughness: 0.80 }), // charcoal pants
    boySh:  new THREE.MeshStandardMaterial({ color: 0x717177, roughness: 0.70 }), // gray shoes
    grlSw:  new THREE.MeshStandardMaterial({ map: cableTex('#e89a90', '#c4746a'), roughness: 0.92 }), // salmon cable-knit
    grlCb:  new THREE.MeshStandardMaterial({ color: 0xd47f76, roughness: 0.78 }), // cable trim
    grlPn:  new THREE.MeshStandardMaterial({ color: 0x2c3550, roughness: 0.80 }), // navy pants
    grlBt:  new THREE.MeshStandardMaterial({ map: fleeceTex('#f4eee1'), roughness: 0.95 })  // shearling boots
  };
  var CHGEO = {};
  function _torusY(r, tube, y) {
    return part(new THREE.TorusGeometry(r, tube, 10, 22), 0, y, 0, Math.PI / 2, 0, 0, 1, 1, 1);
  }
  /* ---- shared geometries: head, face, limbs (boy + girl reuse) ---- */
  (function buildSharedCharGeos() {
    var hp = [part(CHSPH, 0, 0, 0, 0, 0, 0, 0.68, 0.70, 0.63)]; // skull
    hp.push(part(CHSPH_LO, 0.315, 0, -0.02, 0, 0, 0, 0.17, 0.17, 0.17)); // ear R
    hp.push(part(CHSPH_LO, -0.315, 0, -0.02, 0, 0, 0, 0.17, 0.17, 0.17)); // ear L
    hp.push(part(CHSPH_LO, 0, -0.03, 0.315, 0, 0, 0, 0.10, 0.10, 0.10)); // nose
    hp.push(part(CHCYL, 0, -0.40, 0, 0, 0, 0, 0.22, 0.20, 0.22)); // neck
    CHGEO.head = mergeGeos(hp);
    CHGEO.eyeW = mergeGeos([ // eye whites (one mesh, blinks as a pair)
      part(CHSPH_LO, 0.135, 0, 0.02, 0, 0, 0, 0.176, 0.20, 0.11),
      part(CHSPH_LO, -0.135, 0, 0.02, 0, 0, 0, 0.176, 0.20, 0.11)]);
    CHGEO.pupil = mergeGeos([
      part(CHSPH_LO, 0.135, 0.005, 0.078, 0, 0, 0, 0.084, 0.084, 0.05),
      part(CHSPH_LO, -0.135, 0.005, 0.078, 0, 0, 0, 0.084, 0.084, 0.05)]);
    CHGEO.hl = mergeGeos([ // white catchlights on the pupils (expressive eyes)
      part(CHSPH_LO, 0.155, 0.035, 0.098, 0, 0, 0, 0.032, 0.032, 0.02),
      part(CHSPH_LO, -0.115, 0.035, 0.098, 0, 0, 0, 0.032, 0.032, 0.02)]);
    CHGEO.blush = mergeGeos([ // soft pink cheeks (portrait look)
      part(CHSPH_LO, 0.205, -0.10, 0.235, 0, 0, 0, 0.085, 0.06, 0.05),
      part(CHSPH_LO, -0.205, -0.10, 0.235, 0, 0, 0, 0.085, 0.06, 0.05)]);
    CHGEO.brows = mergeGeos([
      part(GEO.box, 0.145, 0.20, 0.27, 0, 0, -0.10, 0.15, 0.035, 0.04),
      part(GEO.box, -0.145, 0.20, 0.27, 0, 0, 0.10, 0.15, 0.035, 0.04)]);
    var sm = new THREE.TorusGeometry(0.10, 0.024, 8, 20, Math.PI); // smile arc
    sm.rotateZ(Math.PI); sm.rotateX(-0.18); sm.translate(0, -0.12, 0.295);
    CHGEO.smile = sm.index ? sm.toNonIndexed() : sm;
    // arm: upper + forearm capsules with a gentle elbow bend (shoulder-pivot space)
    CHGEO.arm = mergeGeos([
      part(new THREE.CapsuleGeometry(0.125, 0.30, 4, 10), 0, -0.20, 0, 0, 0, 0, 1, 1, 1),
      part(new THREE.CapsuleGeometry(0.105, 0.28, 4, 10), 0.015, -0.50, 0.035, 0.10, 0, -0.05, 1, 1, 1),
      _torusY(0.10, 0.038, -0.63)]); // ribbed sweater cuff at the wrist
    CHGEO.hand = mergeGeos([part(CHSPH_LO, 0.03, -0.74, 0.06, 0, 0, 0, 0.23, 0.25, 0.23)]);
    CHGEO.thigh = mergeGeos([part(new THREE.CapsuleGeometry(0.15, 0.42, 4, 10), 0, -0.28, 0, 0, 0, 0, 1, 1, 1)]);
    CHGEO.shinKnee = mergeGeos([ // knee-pivot space (knee sits at hip-space -0.55)
      part(new THREE.CapsuleGeometry(0.125, 0.50, 4, 10), 0, -0.17, 0.005, 0, 0, 0, 1, 1, 1),
      _torusY(0.125, 0.045, -0.47)]); // elastic ankle cuff (joggers)
  })();
  /* ---- per-character geometries: torsos, trim, hair, footwear ---- */
  (function buildVariantCharGeos() {
    CHGEO.boyTorso = mergeGeos([ // olive sweater: tapered body + rounded shoulders + collar
      part(new THREE.CylinderGeometry(0.40, 0.33, 0.80, 16), 0, 1.66, 0, 0, 0, 0, 1, 1, 1),
      part(CHSPH_LO, 0.37, 1.97, 0, 0, 0, 0, 0.38, 0.38, 0.38),
      part(CHSPH_LO, -0.37, 1.97, 0, 0, 0, 0, 0.38, 0.38, 0.38),
      _torusY(0.21, 0.055, 2.03)]);
    CHGEO.boyHem = mergeGeos([ // white hem band + neck trim (matches sheet)
      part(new THREE.CylinderGeometry(0.345, 0.335, 0.10, 16), 0, 1.32, 0, 0, 0, 0, 1, 1, 1),
      _torusY(0.15, 0.04, 2.045)]);
    CHGEO.grlTorso = mergeGeos([ // salmon sweater, bulky fit (portrait match)
      part(new THREE.CylinderGeometry(0.40, 0.33, 0.80, 16), 0, 1.65, 0, 0, 0, 0, 1, 1, 1),
      part(CHSPH_LO, 0.36, 1.95, 0, 0, 0, 0, 0.37, 0.37, 0.37),
      part(CHSPH_LO, -0.36, 1.95, 0, 0, 0, 0, 0.37, 0.37, 0.37),
      _torusY(0.20, 0.05, 2.01)]);
    CHGEO.grlCables = mergeGeos([ // cable-knit rings around the sweater
      _torusY(0.328, 0.02, 1.45), _torusY(0.348, 0.02, 1.65), _torusY(0.362, 0.02, 1.85)]);
    var puffs = [ // boy's curly hair: dense clustered curls (head-local, portrait match)
      [0, 0.30, 0.03, 0.30], [0.17, 0.26, 0.08, 0.28], [-0.17, 0.26, 0.08, 0.28],
      [0.28, 0.18, -0.02, 0.28], [-0.28, 0.18, -0.02, 0.28],
      [0.10, 0.30, -0.14, 0.30], [-0.10, 0.30, -0.14, 0.30],
      [0.22, 0.22, -0.20, 0.26], [-0.22, 0.22, -0.20, 0.26],
      [0, 0.24, -0.30, 0.28],
      [0.13, 0.34, 0.16, 0.24], [-0.13, 0.34, 0.16, 0.24],
      [0.24, 0.30, 0.10, 0.24], [-0.24, 0.30, 0.10, 0.24], // density layer
      [0.30, 0.10, -0.10, 0.24], [-0.30, 0.10, -0.10, 0.24],
      [0.16, 0.16, -0.26, 0.24], [-0.16, 0.16, -0.26, 0.24],
      [0.06, 0.38, -0.02, 0.24], [-0.06, 0.38, -0.02, 0.24],
      [0.30, 0.02, 0.06, 0.22], [-0.30, 0.02, 0.06, 0.22]];
    CHGEO.boyHair = mergeGeos(puffs.map(function (p) {
      return part(CHSPH_LO, p[0], p[1], p[2], 0, 0, 0, p[3], p[3] * 0.9, p[3]);
    }));
    CHGEO.grlCap = mergeGeos([ // girl's hair cap + forehead framing (sits behind the face plane)
      part(CHSPH, 0, 0.03, -0.12, 0, 0, 0, 0.75, 0.77, 0.75),
      part(CHSPH_LO, 0.20, 0.22, 0.18, 0, 0, 0, 0.26, 0.26, 0.26),
      part(CHSPH_LO, -0.20, 0.22, 0.18, 0, 0, 0, 0.26, 0.26, 0.26),
      part(CHSPH_LO, 0, 0.33, 0.06, 0, 0, 0, 0.30, 0.22, 0.28)]);
    var bpts = [ // girl's side braid: tapered tube down her right side
      new THREE.Vector3(0.30, 0.16, -0.04), new THREE.Vector3(0.345, -0.12, 0.03),
      new THREE.Vector3(0.36, -0.42, 0.08), new THREE.Vector3(0.345, -0.72, 0.10),
      new THREE.Vector3(0.32, -1.00, 0.10), new THREE.Vector3(0.30, -1.22, 0.08)];
    var bp = [part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bpts), 16, 0.098, 10),
      0, 0, 0, 0, 0, 0, 1, 1, 1)];
    var taper = [0.092, 0.078, 0.064, 0.050]; // long, thick braid
    for (var bi = 0; bi < 4; bi++) {
      var q = bpts[2 + bi];
      bp.push(part(CHSPH_LO, q.x, q.y, q.z, 0, 0, 0, taper[bi] * 2, taper[bi] * 2, taper[bi] * 2));
    }
    CHGEO.grlBraid = mergeGeos(bp);
    CHGEO.grlBead = mergeGeos([ // pink hair tie + bead cluster at the braid end
      part(new THREE.TorusGeometry(0.075, 0.030, 8, 18), 0.30, -1.15, 0.085, Math.PI / 2, 0, 0, 1, 1, 1),
      part(CHSPH_LO, 0.30, -1.26, 0.08, 0, 0, 0, 0.085, 0.085, 0.085),
      part(CHSPH_LO, 0.335, -1.30, 0.10, 0, 0, 0, 0.06, 0.06, 0.06),
      part(CHSPH_LO, 0.265, -1.30, 0.10, 0, 0, 0, 0.06, 0.06, 0.06)]);
    CHGEO.shoeKnee = mergeGeos([ // boy's gray loafers (knee-pivot space)
      part(GEO.box, 0, -0.67, 0.08, 0, 0, 0, 0.30, 0.22, 0.46),
      part(CHSPH_LO, 0, -0.68, 0.28, 0, 0, 0, 0.26, 0.20, 0.26),
      part(GEO.box, 0, -0.58, 0.22, 0.18, 0, 0, 0.26, 0.025, 0.035)]);
    CHGEO.bootKnee = mergeGeos([ // girl's tall cream boots: shaft + foot + toe (knee-pivot space)
      part(new THREE.CylinderGeometry(0.155, 0.175, 0.68, 12), 0, -0.39, 0, 0, 0, 0, 1, 1, 1),
      part(GEO.box, 0, -0.71, 0.07, 0, 0, 0, 0.28, 0.18, 0.44),
      part(CHSPH_LO, 0, -0.72, 0.26, 0, 0, 0, 0.24, 0.17, 0.24)]);
  })();

  function makeCharLabel(text) {
    var c = document.createElement('canvas'); c.width = 256; c.height = 64;
    var g2 = c.getContext('2d');
    g2.font = 'bold 34px Georgia'; g2.textAlign = 'center';
    g2.fillStyle = 'rgba(0,0,0,0.45)'; g2.fillText(text, 128, 42);
    g2.fillStyle = '#fff8ec'; g2.fillText(text, 128, 40);
    var tex = new THREE.CanvasTexture(c);
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set(3.4, 0.85, 1); sp.position.y = 3.32;
    return sp;
  }
  var charGlowTex = createGlowTexture('rgba(255,196,120,0.85)', 'rgba(255,150,60,0)');
  var charGlowMat = new THREE.MeshBasicMaterial({ map: charGlowTex, transparent: true, depthWrite: false, opacity: 0.5 });

  /* Builds a fully rigged character.
     opt: {name, girl, sweater, pants, torsoGeo, trimGeo, trimMat,
           hairGeo, hairGeo2, hairMat, beadGeo, legLowMat} */
  function buildCharacter(opt) {
    var group = new THREE.Group();   // world position + yaw
    var rig = new THREE.Group();     // walk bob + forward lean
    group.add(rig);
    function M(geo, mat) { var m = new THREE.Mesh(geo, mat); m.castShadow = true; rig.add(m); return m; }
    var torso = M(opt.torsoGeo, opt.sweater);
    if (opt.trimGeo) M(opt.trimGeo, opt.trimMat);
    var headG = new THREE.Group(); headG.position.set(0, 2.38, 0); rig.add(headG);
    function HM(geo, mat) { var m = new THREE.Mesh(geo, mat); m.castShadow = true; headG.add(m); return m; }
    HM(CHGEO.head, CHMAT.skin);
    var eyeG = new THREE.Group(); eyeG.position.set(0, 0.06, 0.26); headG.add(eyeG);
    eyeG.add(new THREE.Mesh(CHGEO.eyeW, CHMAT.eyeW));   // no shadow: tiny
    eyeG.add(new THREE.Mesh(CHGEO.pupil, CHMAT.pupil));  // no shadow: tiny
    eyeG.add(new THREE.Mesh(CHGEO.hl, CHMAT.hl));       // catchlight
    if (opt.girl) eyeG.scale.x = 1.18;                   // Tara's bigger expressive eyes
    HM(CHGEO.brows, CHMAT.brow);
    HM(CHGEO.smile, CHMAT.mouth);
    HM(CHGEO.blush, CHMAT.blush);
    HM(opt.hairGeo, opt.hairMat);
    if (opt.hairGeo2) HM(opt.hairGeo2, opt.hairMat);
    if (opt.beadGeo) HM(opt.beadGeo, CHMAT.bead);
    function arm(side) { // shoulder pivot; arm hangs -y, character faces +z
      var piv = new THREE.Group(); piv.position.set(0.47 * side, 1.94, 0); rig.add(piv);
      var a = new THREE.Mesh(CHGEO.arm, opt.sweater); a.castShadow = true; piv.add(a);
      var h = new THREE.Mesh(CHGEO.hand, CHMAT.skin); h.castShadow = true; piv.add(h);
      piv.rotation.z = 0.10 * side;
      return piv;
    }
    var shL = arm(-1), shR = arm(1);
    function leg(side) { // hip pivot + knee pivot (proper sitting / pedaling)
      var piv = new THREE.Group(); piv.position.set(0.22 * side, 1.34, 0); rig.add(piv);
      var t = new THREE.Mesh(CHGEO.thigh, opt.pants); t.castShadow = true; piv.add(t);
      var knee = new THREE.Group(); knee.position.set(0, -0.55, 0); piv.add(knee);
      function KM(geo, mat) { var m = new THREE.Mesh(geo, mat); m.castShadow = true; knee.add(m); return m; }
      if (opt.girl) {
        KM(CHGEO.bootKnee, opt.legLowMat);
      } else {
        KM(CHGEO.shinKnee, opt.pants);
        KM(CHGEO.shoeKnee, opt.legLowMat);
      }
      return { hip: piv, knee: knee };
    }
    var legL = leg(-1), legR = leg(1);
    var glow = new THREE.Mesh(GEO.circle, charGlowMat); // warm ground glow
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.12; glow.scale.set(5.5, 5.5, 1);
    group.add(glow);
    group.add(makeCharLabel(opt.name));
    return {
      group: group, rig: rig, torso: torso, headG: headG, eyeG: eyeG,
      shL: shL, shR: shR, hipL: legL.hip, hipR: legR.hip, kneeL: legL.knee, kneeR: legR.knee,
      phase: 0, blinkT: 2 + Math.random() * 2.5, blinkCd: 0, blinked: false, lean: 0,
      emote: null // {name, t, dur} — social emote override
    };
  }

  /* ---- player + partner rigs (role decides which is local) ----
     One character per island at start: the boy on island A, the girl on B. */
  var boyRig = buildCharacter({
    name: myRole === 'boy' ? myName : partnerName, girl: false,
    sweater: CHMAT.boySw, pants: CHMAT.boyPn,
    torsoGeo: CHGEO.boyTorso, trimGeo: CHGEO.boyHem, trimMat: CHMAT.boyHem,
    hairGeo: CHGEO.boyHair, hairMat: CHMAT.hair, legLowMat: CHMAT.boySh
  });
  var girlRig = buildCharacter({
    name: myRole === 'girl' ? myName : partnerName, girl: true,
    sweater: CHMAT.grlSw, pants: CHMAT.grlPn,
    torsoGeo: CHGEO.grlTorso, trimGeo: CHGEO.grlCables, trimMat: CHMAT.grlCb,
    hairGeo: CHGEO.grlCap, hairGeo2: CHGEO.grlBraid, hairMat: CHMAT.hairG,
    beadGeo: CHGEO.grlBead,
    legLowMat: CHMAT.grlBt
  });
  var playerRig = myRole === 'girl' ? girlRig : boyRig;
  var partnerRig = myRole === 'girl' ? boyRig : girlRig;
  var player = playerRig.group;
  var partner = partnerRig.group;
  var startX = ISL_A.cx + 32, startZ = 12; // boy's island start (final placement after porches resolve)
  player.position.set(startX, groundHeight(startX, startZ), startZ);
  partner.position.set(startX + 3.2, groundHeight(startX + 3.2, startZ + 2.6), startZ + 2.6);
  scene.add(player); scene.add(partner);
  var isGuest = (myName === 'Guest');
  partner.visible = isGuest; // guest: AI couple roams; signed-in: hidden until real partner joins
  /* Guest mode: a second AI character so it's a couple roaming together */
  var guestCouple2 = null, guestCouple2Yaw = 0, gc2Rig = null;
  if (isGuest) {
    gc2Rig = buildCharacter({
      name: 'Guest', girl: myRole !== 'girl',
      sweater: myRole !== 'girl' ? CHMAT.boySw : CHMAT.grlSw,
      pants: myRole !== 'girl' ? CHMAT.boyPn : CHMAT.grlPn,
      torsoGeo: myRole !== 'girl' ? CHGEO.boyTorso : CHGEO.grlTorso,
      trimGeo: myRole !== 'girl' ? CHGEO.boyHem : CHGEO.grlCables,
      trimMat: myRole !== 'girl' ? CHMAT.boyHem : CHMAT.grlCb,
      hairGeo: myRole !== 'girl' ? CHGEO.boyHair : CHGEO.grlCap,
      hairMat: myRole !== 'girl' ? CHMAT.hair : CHMAT.hairG,
      legLowMat: myRole !== 'girl' ? CHMAT.boySh : CHMAT.grlBt
    });
    guestCouple2 = gc2Rig.group;
    var gx = ISL_A.cx + 20, gz = 8;
    guestCouple2.position.set(gx, groundHeight(gx, gz), gz);
    scene.add(guestCouple2);
  }
  var playerYaw = 0, targetYaw = 0, partnerYaw = 0;
  var playerMovingState = false; // Phase 5: tracked for network sync

  /* ---- walk / idle animation shared by player + partner ----
     Stride is matched to travel speed (stride 1.6u): no foot sliding. */
  function updateCharacterAnim(c, dt, t, moving, speed) {
    var k = 1 - Math.exp(-dt * 10);
    if (c.emote) { // social emote override (wave, bow, laugh, cheer, shy, loveyou)
      c.emote.t += dt;
      if (c.emote.t >= c.emote.dur) { c.emote = null; }
      else { applyEmotePose(c, c.emote.name, c.emote.t, c.emote.dur); return; }
    }
    if (moving) {
      var w = Math.PI * speed / 1.6; // full leg cycle per 2 steps
      c.phase += w * dt;
      var s = Math.sin(c.phase);
      c.hipL.rotation.x = s * 0.55;
      c.hipR.rotation.x = -s * 0.55;
      c.kneeL.rotation.x = lerp(c.kneeL.rotation.x, Math.max(0, -s * 0.55) * 0.85 + 0.05, k); // knee flex on swing-through
      c.kneeR.rotation.x = lerp(c.kneeR.rotation.x, Math.max(0, s * 0.55) * 0.85 + 0.05, k);
      c.shL.rotation.x = -s * 0.45; // arms oppose legs
      c.shR.rotation.x = s * 0.45;
      c.rig.position.y = Math.abs(Math.cos(c.phase)) * 0.07; // bob, 2x per cycle
      c.lean = lerp(c.lean, 0.07, 1 - Math.exp(-dt * 6)); // slight forward lean
      c.torso.scale.set(1, 1, 1);
    } else {
      c.hipL.rotation.x = lerp(c.hipL.rotation.x, 0, k);
      c.hipR.rotation.x = lerp(c.hipR.rotation.x, 0, k);
      c.kneeL.rotation.x = lerp(c.kneeL.rotation.x, 0.05, k); // soft standing knees
      c.kneeR.rotation.x = lerp(c.kneeR.rotation.x, 0.05, k);
      c.shL.rotation.x = lerp(c.shL.rotation.x, 0, k);
      c.shR.rotation.x = lerp(c.shR.rotation.x, 0, k);
      c.shL.rotation.z = lerp(c.shL.rotation.z, -0.10, k);
      c.shR.rotation.z = lerp(c.shR.rotation.z, 0.10, k);
      c.rig.position.y = lerp(c.rig.position.y, 0, k);
      c.lean = lerp(c.lean, 0, k);
      var br = Math.sin(t * 1.9); // breathing
      c.torso.scale.set(1 - br * 0.008, 1 + br * 0.015, 1 - br * 0.008);
    }
    c.rig.rotation.x = c.lean;
    c.headG.rotation.y = Math.sin(t * 0.6) * 0.07;      // gentle head sway
    c.headG.rotation.z = Math.sin(t * 0.43 + 1.0) * 0.03;
    c.blinkT -= dt;                                     // blink every 3-5.5s
    if (c.blinkT <= 0) { c.blinkCd = 0.12; c.blinkT = 3 + Math.random() * 2.5; c.blinked = true; }
    if (c.blinkCd > 0) { c.blinkCd -= dt; c.eyeG.scale.y = 0.12; }
    else c.eyeG.scale.y = 1;
  }

  /* ---- social emotes: wave, bow, laugh, cheer, shy, loveyou ---- */
  var EMOTE_DUR = 2.4;
  function playEmoteOn(rig, name) {
    rig.emote = { name: name, t: 0, dur: EMOTE_DUR };
    if (name === 'loveyou' && rig.group) { // big love emoji pops above the head
      var p = rig.group.position;
      spawnLoveEmoji(p.x, p.y + 2.7, p.z);
    }
  }
  function applyEmotePose(c, name, t, dur) {
    var k = 1 - Math.exp(-0.16 * 10);
    function L(obj, prop, target) { obj[prop] = lerp(obj[prop], target, k); }
    // settle legs first
    L(c.hipL.rotation, 'x', 0); L(c.hipR.rotation, 'x', 0);
    L(c.kneeL.rotation, 'x', 0.05); L(c.kneeR.rotation, 'x', 0.05);
    L(c.rig.position, 'y', 0);
    if (name === 'wave') {
      L(c.shR.rotation, 'x', -2.5); L(c.shR.rotation, 'z', 0.5 + Math.sin(t * 11) * 0.45);
      L(c.shL.rotation, 'x', -0.15);
      c.headG.rotation.z = Math.sin(t * 5) * 0.06;
    } else if (name === 'bow') {
      var b = Math.sin(Math.PI * Math.min(1, t / dur)); // down and back up
      c.rig.rotation.x = b * 0.62;
      L(c.shL.rotation, 'x', -0.2 + b * 0.35); L(c.shR.rotation, 'x', -0.2 + b * 0.35);
      c.headG.rotation.x = b * 0.3;
    } else if (name === 'laugh') {
      c.rig.position.y = Math.abs(Math.sin(t * 9)) * 0.13;
      c.headG.rotation.x = -0.28;
      L(c.shL.rotation, 'x', -0.9); L(c.shR.rotation, 'x', -0.9);
      L(c.shL.rotation, 'z', -0.35); L(c.shR.rotation, 'z', 0.35);
    } else if (name === 'cheer') {
      L(c.shL.rotation, 'x', -2.85); L(c.shR.rotation, 'x', -2.85);
      L(c.shL.rotation, 'z', -0.35); L(c.shR.rotation, 'z', 0.35);
      c.rig.position.y = Math.abs(Math.sin(t * 7)) * 0.2;
      c.headG.rotation.x = -0.15;
    } else if (name === 'shy') {
      c.headG.rotation.x = 0.38; c.headG.rotation.z = Math.sin(t * 3) * 0.05;
      L(c.shL.rotation, 'x', -0.55); L(c.shR.rotation, 'x', -0.55);
      L(c.shL.rotation, 'z', -0.5); L(c.shR.rotation, 'z', 0.5);
      c.rig.rotation.x = 0.08;
    } else if (name === 'loveyou') { // arms up in a heart arc
      L(c.shL.rotation, 'x', -2.3); L(c.shR.rotation, 'x', -2.3);
      L(c.shL.rotation, 'z', -0.75); L(c.shR.rotation, 'z', 0.75);
      c.headG.rotation.z = Math.sin(t * 4) * 0.08;
      var p = 1 + Math.sin(t * 6) * 0.03;
      c.torso.scale.set(p, p, p);
    }
    if (name !== 'bow' && name !== 'shy') c.rig.rotation.x = lerp(c.rig.rotation.x, 0, k);
    if (name !== 'laugh' && name !== 'cheer' && name !== 'shy' && name !== 'bow') c.headG.rotation.x = lerp(c.headG.rotation.x, 0, k);
  }

  /* ---- hug sequence: walk together, embrace, hearts, release ---- */
  var hugState = null; // {t, dur}
  var heartTex = null;
  function getHeartTex() {
    if (heartTex) return heartTex;
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var g = c.getContext('2d');
    g.fillStyle = '#ff6b8a';
    g.beginPath();
    g.moveTo(32, 54);
    g.bezierCurveTo(4, 30, 6, 10, 20, 10);
    g.bezierCurveTo(28, 10, 32, 16, 32, 22);
    g.bezierCurveTo(32, 16, 36, 10, 44, 10);
    g.bezierCurveTo(58, 10, 60, 30, 32, 54);
    g.fill();
    heartTex = new THREE.CanvasTexture(c);
    return heartTex;
  }
  var heartSprites = [];
  function spawnHearts(x, y, z, n) {
    for (var i = 0; i < n; i++) {
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getHeartTex(), transparent: true, depthWrite: false, opacity: 0.95
      }));
      var s = 0.5 + Math.random() * 0.5;
      sp.scale.set(s, s, 1);
      sp.position.set(x + (Math.random() - 0.5) * 1.6, y + Math.random() * 0.8, z + (Math.random() - 0.5) * 1.6);
      sp.userData = { vy: 1.2 + Math.random() * 0.9, life: 2.6, age: 0 };
      scene.add(sp);
      heartSprites.push(sp);
    }
  }
  /* M8: shooting star (miss-you) */
  var shootingStars = [];
  function shootingStar() {
    // A bright streak across the sky
    var startX = player.position.x + (Math.random() - 0.5) * 60;
    var startZ = player.position.z - 40 - Math.random() * 20;
    var startY = 45 + Math.random() * 15;
    var geo = new THREE.BufferGeometry();
    var pts = new Float32Array(20 * 3);
    for (var i = 0; i < 20; i++) {
      pts[i * 3] = startX - i * 1.2;
      pts[i * 3 + 1] = startY - i * 0.35;
      pts[i * 3 + 2] = startZ;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    var mat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95 });
    var line = new THREE.Line(geo, mat);
    scene.add(line);
    shootingStars.push({ line: line, age: 0, life: 1.8, vx: -28, vy: -8 });
  }
  function updateShootingStars(dt) {
    for (var i = shootingStars.length - 1; i >= 0; i--) {
      var s = shootingStars[i];
      s.age += dt;
      s.line.position.x += s.vx * dt;
      s.line.position.y += s.vy * dt;
      s.line.material.opacity = 0.95 * (1 - s.age / s.life);
      if (s.age >= s.life) {
        scene.remove(s.line);
        s.line.geometry.dispose();
        s.line.material.dispose();
        shootingStars.splice(i, 1);
      }
    }
  }
  var loveEmojiTex = null;
  function getLoveEmojiTex() {
    if (loveEmojiTex) return loveEmojiTex;
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var g = c.getContext('2d');
    g.font = '100px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('❤️', 64, 70);
    loveEmojiTex = new THREE.CanvasTexture(c);
    return loveEmojiTex;
  }
  function spawnLoveEmoji(x, y, z) { // big ❤️ for the love emote (floats + fades like hearts)
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getLoveEmojiTex(), transparent: true, depthWrite: false, opacity: 1
    }));
    sp.scale.set(1.7, 1.7, 1);
    sp.position.set(x, y, z);
    sp.userData = { vy: 1.5, life: 2.2, age: 0 };
    scene.add(sp);
    heartSprites.push(sp);
  }
  function updateHearts(dt) {
    for (var i = heartSprites.length - 1; i >= 0; i--) {
      var sp = heartSprites[i], u = sp.userData;
      u.age += dt;
      sp.position.y += u.vy * dt;
      sp.material.opacity = Math.max(0, 0.95 * (1 - u.age / u.life));
      if (u.age >= u.life) {
        scene.remove(sp); sp.material.dispose();
        heartSprites.splice(i, 1);
      }
    }
  }
  function startHug() {
    if (hugState) return;
    hugState = { t: 0, dur: 4.2 };
    var mx = (player.position.x + partner.position.x) / 2;
    var mz = (player.position.z + partner.position.z) / 2;
    var my = (player.position.y + partner.position.y) / 2;
    spawnHearts(mx, my + 2.6, mz, 8);
  }
  function updateHug(dt) {
    if (!hugState) return;
    hugState.t += dt;
    if (hugState.t >= hugState.dur) { hugState = null; return; }
    var t = hugState.t;
    // both face each other and lean into the embrace
    var dx = partner.position.x - player.position.x, dz = partner.position.z - player.position.z;
    var d = Math.hypot(dx, dz) || 0.001;
    if (d > 1.35 && t < 1.2) { // step together first
      var step = Math.min(d - 1.35, dt * 3);
      player.position.x += dx / d * step * 0.5; player.position.z += dz / d * step * 0.5;
      partner.position.x -= dx / d * step * 0.5; partner.position.z -= dz / d * step * 0.5;
      updateCharacterAnim(playerRig, dt, t, true, 3);
      updateCharacterAnim(partnerRig, dt, t, true, 3);
      return;
    }
    var yawP = Math.atan2(dx, dz), yawQ = Math.atan2(-dx, -dz);
    player.rotation.y = yawP; partner.rotation.y = yawQ;
    [playerRig, partnerRig].forEach(function (c) {
      var k = 1 - Math.exp(-dt * 8);
      c.hipL.rotation.x = lerp(c.hipL.rotation.x, 0, k);
      c.hipR.rotation.x = lerp(c.hipR.rotation.x, 0, k);
      c.kneeL.rotation.x = lerp(c.kneeL.rotation.x, 0.08, k);
      c.kneeR.rotation.x = lerp(c.kneeR.rotation.x, 0.08, k);
      c.shL.rotation.x = lerp(c.shL.rotation.x, -1.05, k); // arms around each other
      c.shR.rotation.x = lerp(c.shR.rotation.x, -1.05, k);
      c.shL.rotation.z = lerp(c.shL.rotation.z, -0.45, k);
      c.shR.rotation.z = lerp(c.shR.rotation.z, 0.45, k);
      c.lean = lerp(c.lean, 0.12, k); c.rig.rotation.x = c.lean;
      c.headG.rotation.z = lerp(c.headG.rotation.z, 0.12, k);
    });
    if (Math.random() < dt * 2.2) {
      spawnHearts((player.position.x + partner.position.x) / 2,
        (player.position.y + partner.position.y) / 2 + 2.8,
        (player.position.z + partner.position.z) / 2, 1);
    }
  }

  /* ---- gift visual: floating gift above the partner's head ---- */
  var giftSprite = null, giftTimer = 0;
  function showGift(emoji) {
    hideGift();
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var g = c.getContext('2d');
    g.font = '92px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(emoji || '🎁', 64, 70);
    var tex = new THREE.CanvasTexture(c);
    giftSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    giftSprite.scale.set(1.6, 1.6, 1);
    scene.add(giftSprite);
    giftTimer = 6;
    spawnHearts(partner.position.x, partner.position.y + 3.4, partner.position.z, 5);
  }
  function hideGift() {
    if (giftSprite) { scene.remove(giftSprite); giftSprite.material.map.dispose(); giftSprite.material.dispose(); giftSprite = null; }
    giftTimer = 0;
  }
  function updateGift(dt, t) {
    if (!giftSprite) return;
    giftTimer -= dt;
    if (giftTimer <= 0) { hideGift(); return; }
    giftSprite.position.set(partner.position.x, partner.position.y + 3.9 + Math.sin(t * 2.4) * 0.18, partner.position.z);
    giftSprite.material.opacity = Math.min(1, giftTimer / 1.2);
  }

  /* ---------------- partner (Tara) AI ---------------- */
  var partnerOnline = isGuest, partnerSeeking = true; // guest: AI couple roams; signed-in: hidden until join
  /* Phase 5 multiplayer: when partnerRemote is true, the partner rig is driven
     by network state instead of the follow AI. setPartnerNet() feeds target
     transform; updatePartner lerps toward it for smoothness. */
  var partnerRemote = false;
  var partnerNet = { x: 0, y: 0, z: 0, yaw: 0, moving: false, sitting: false, activity: 'idle', t: 0 };
  function setPartnerRemote(b) {
    partnerRemote = !!b;
    if (!partnerRemote) partnerSeeking = true; // resume AI cleanly
  }
  function setPartnerNet(x, y, z, yaw, moving, sitting, activity) {
    partnerNet.x = x; partnerNet.y = y; partnerNet.z = z;
    partnerNet.yaw = yaw;
    partnerNet.moving = !!moving;
    partnerNet.sitting = !!sitting;
    partnerNet.activity = activity || 'idle';
    partnerNet.t = performance.now();
  }
  function isPartnerStale() {
    return performance.now() - partnerNet.t > 5000; // no update in 5s
  }
  var porchB = (function () { // her island's Couple's House porch (offline spot)
    for (var i = 0; i < BUILDINGS.length; i++) {
      var b = BUILDINGS[i]; if (b.side === 'B' && b.type === 'house') return porchOf(b);
    }
    return { x: ISL_B.cx + 32, z: 12 };
  })();
  var porchA = (function () { // his island's Couple's House porch
    for (var i = 0; i < BUILDINGS.length; i++) {
      var b = BUILDINGS[i]; if (b.side === 'A' && b.type === 'house') return porchOf(b);
    }
    return { x: ISL_A.cx + 32, z: 12 };
  })();
  function porchOf(b) {
    var sp = BTYPES[b.type];
    return { x: b.x + b.fx * (sp.d / 2 + 1.8), z: b.z + b.fz * (sp.d / 2 + 1.8) };
  }
  var partnerHome = myRole === 'girl' ? porchA : porchB; // partner idles on their own island
  var partnerWanderT = 0, partnerWanderX = partnerHome.x, partnerWanderZ = partnerHome.z;
  (function placeRoles() { // one character per island at game start
    var bx = ISL_A.cx + 32, bz = 12, gy;
    boyRig.group.position.set(bx, groundHeight(bx, bz), bz);
    gy = groundHeight(porchB.x, porchB.z);
    girlRig.group.position.set(porchB.x, gy > -900 ? gy : 2, porchB.z);
    if (myRole === 'girl') { playerYaw = targetYaw = Math.PI; player.rotation.y = Math.PI; }
    partnerYaw = 0; partner.rotation.y = 0;
  })();
  function setPartnerOnline(b) {
    if (isGuest) return; // guest: AI couple always roams
    partnerOnline = !!b;
    partner.visible = !!b; // only show the other character when they've actually joined
    if (!partnerOnline) partnerSeeking = true; // reset AI cleanly
  }
  function updatePartner(dt, t) {
    if (!partnerOnline && !partnerRemote) return; // hidden until they join — skip AI
    var pp = partner.position;
    /* Phase 5: remote-driven partner — lerp toward network state, bypass AI */
    if (partnerRemote && !isPartnerStale()) {
      var k = 1 - Math.exp(-dt * 12); // snappy but smooth
      pp.x = lerp(pp.x, partnerNet.x, k);
      pp.z = lerp(pp.z, partnerNet.z, k);
      var gy = walkHeight(pp.x, pp.z);
      var targetY = partnerNet.y > -900 ? partnerNet.y : (gy > -900 ? gy : pp.y);
      pp.y = lerp(pp.y, targetY, k);
      // smooth yaw toward network yaw
      var dy = partnerNet.yaw - partnerYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      partnerYaw += dy * (1 - Math.exp(-dt * 10));
      partner.rotation.y = partnerYaw;
      /* M1: match the partner's activity pose (wheel/bike/sit/walk) */
      var pact = partnerNet.activity || (partnerNet.sitting ? 'sit' : (partnerNet.moving ? 'walk' : 'idle'));
      if (pact === 'sit' || pact === 'wheel') applySitPose(partnerRig, dt, -0.55);
      else updateCharacterAnim(partnerRig, dt, t, partnerNet.moving || pact === 'walk', 10.2);
      return;
    }
    if (partnerHold) { // Phase 4: sitting with the player at the campfire (AI paused)
      if (partnerSit && !partnerSit.seated) {
        var dx = partnerSit.x - pp.x, dz = partnerSit.z - pp.z, d = Math.hypot(dx, dz);
        var moving = false;
        if (d > 0.5) {
          var st = stepMover(pp.x, pp.z, dx / d, dz / d, 8, dt);
          pp.x = st.x; pp.z = st.z; moving = st.moved;
          if (st.moved) {
            var ty = Math.atan2(dx / d, dz / d), dy2 = ty - partnerYaw;
            while (dy2 > Math.PI) dy2 -= Math.PI * 2;
            while (dy2 < -Math.PI) dy2 += Math.PI * 2;
            partnerYaw += dy2 * (1 - Math.exp(-dt * 8));
            partner.rotation.y = partnerYaw;
          }
        } else {
          partnerSit.seated = true;
          partnerYaw = partnerSit.yaw; partner.rotation.y = partnerYaw;
        }
        var gy = walkHeight(pp.x, pp.z);
        if (gy > -900) pp.y = lerp(pp.y, gy, 1 - Math.exp(-dt * 10));
        updateCharacterAnim(partnerRig, dt, t, moving, 8);
      } else if (partnerSit && partnerSit.seated) {
        applySitPose(partnerRig, dt, -0.55);
      }
      return;
    }
    /* partner idles on their own island: gentle wandering near home, never follows */
    if (!partnerWanderT || t > partnerWanderT) {
      partnerWanderT = t + 4 + Math.random() * 6;
      var wa = Math.random() * Math.PI * 2, wr = 1 + Math.random() * 3.2;
      partnerWanderX = partnerHome.x + Math.cos(wa) * wr;
      partnerWanderZ = partnerHome.z + Math.sin(wa) * wr;
    }
    var dx = partnerWanderX - pp.x, dz = partnerWanderZ - pp.z;
    var d = Math.hypot(dx, dz);
    var moving = false;
    if (d > 0.6) {
      var st = stepMover(pp.x, pp.z, dx / d, dz / d, 3.2, dt); // slow amble
      pp.x = st.x; pp.z = st.z; moving = st.moved;
      if (st.moved) { // smooth yaw toward travel direction
        var ty = Math.atan2(dx / d, dz / d), dy2 = ty - partnerYaw;
        while (dy2 > Math.PI) dy2 -= Math.PI * 2;
        while (dy2 < -Math.PI) dy2 += Math.PI * 2;
        partnerYaw += dy2 * (1 - Math.exp(-dt * 8));
        partner.rotation.y = partnerYaw;
      }
    }
    var gy = walkHeight(pp.x, pp.z);
    if (gy > -900) pp.y = lerp(pp.y, gy, 1 - Math.exp(-dt * 10));
    updateCharacterAnim(partnerRig, dt, t, moving, 3.2); // gentle amble
    /* Guest mode: second AI character follows the partner (a couple roaming together) */
    if (isGuest && guestCouple2) {
      var gp = guestCouple2.position;
      var gdx = pp.x - gp.x, gdz = pp.z - gp.z;
      var gd = Math.hypot(gdx, gdz);
      var gmoving = false;
      if (gd > 2.5) { // keep a couple's distance, follow
        var gst = stepMover(gp.x, gp.z, gdx / gd, gdz / gd, 3.0, dt);
        gp.x = gst.x; gp.z = gst.z; gmoving = gst.moved;
        if (gst.moved) {
          var gty = Math.atan2(gdx / gd, gdz / gd), gdy = gty - guestCouple2Yaw;
          while (gdy > Math.PI) gdy -= Math.PI * 2;
          while (gdy < -Math.PI) gdy += Math.PI * 2;
          guestCouple2Yaw += gdy * (1 - Math.exp(-dt * 8));
          guestCouple2.rotation.y = guestCouple2Yaw;
        }
      }
      var ggy = walkHeight(gp.x, gp.z);
      if (ggy > -900) gp.y = lerp(gp.y, ggy, 1 - Math.exp(-dt * 10));
      // Find the rig for animation (we need to store it)
      updateCharacterAnim(gc2Rig, dt, t, gmoving, 3.0);
    }
  }
  /* ================= PHASE 4: interactive objects =================
     Sky wheels (rideable), docks + rowboats, rideable bicycles,
     campfire sitting. Shared geometries/materials throughout;
     ~40 new draw calls total (budget < 60). */
  var speedMult = 1;               // Phase 4: bicycle speed multiplier (updatePlayer)
  var movementLocked = false;      // sitting / wheel riding: walk input ignored
  var promptLocked = false;        // exclusive prompt (Dismount/Exit/Stand up) shown
  var cameraTargetOverride = null; // Phase 4: updateCamera follows this when set
  var ridingWheel = null, ridingBike = null, sitting = null;
  var partnerHold = false, partnerSit = null; // Phase 4: partner AI paused / her bench
  var nightLevel = 0;              // 0..1 darkness, written by updateDayNight
  var WHEEL_R = 7, WHEEL_H = 12;   // wheel radius / hub height
  var wheels = [], boats = [], bikes = [];

  /* ---- geometry helpers: bake transformed, vertex-colored parts, merge to 1 mesh ---- */
  function eulerMatrix(rx, ry, rz) { // R = Ry * Rx * Rz
    var cx = Math.cos(rx), sx = Math.sin(rx),
        cy = Math.cos(ry), sy = Math.sin(ry),
        cz = Math.cos(rz), sz = Math.sin(rz);
    return [
      cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx,
      cx * sz, cx * cz, -sx,
      -sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx
    ];
  }
  function xg(g, px, py, pz, rx, ry, rz, color, parts) { // transformed part
    var p = g.attributes.position;
    if (p && p.array) {
      var R = eulerMatrix(rx || 0, ry || 0, rz || 0);
      var n = g.attributes.normal, arr = p.array, narr = n && n.array;
      for (var i = 0; i < arr.length; i += 3) {
        var x = arr[i], y = arr[i + 1], z = arr[i + 2];
        arr[i] = R[0] * x + R[1] * y + R[2] * z + px;
        arr[i + 1] = R[3] * x + R[4] * y + R[5] * z + py;
        arr[i + 2] = R[6] * x + R[7] * y + R[8] * z + pz;
        if (narr) {
          var nx = narr[i], ny = narr[i + 1], nz = narr[i + 2];
          narr[i] = R[0] * nx + R[1] * ny + R[2] * nz;
          narr[i + 1] = R[3] * nx + R[4] * ny + R[5] * nz;
          narr[i + 2] = R[6] * nx + R[7] * ny + R[8] * nz;
        }
      }
    }
    parts.push({ g: g, c: color });
  }
  function tubePart(ax, ay, az, bx, by, bz, w, color, parts) { // box tube between points
    var dx = bx - ax, dy = by - ay, dz = bz - az;
    var len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
    var g = new THREE.BoxGeometry(w, len, w);
    xg(g, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2,
      Math.acos(Math.max(-1, Math.min(1, dy / len))), Math.atan2(dx, dz), 0, color, parts);
  }
  function mergeParts(parts) { // indexed merge + color attribute (one draw call)
    var p0 = parts[0].g;
    if (!p0.attributes.position || !p0.attributes.position.array) return p0; // headless stub
    var pos = [], nor = [], uv = [], col = [], idx = [], off = 0;
    for (var i = 0; i < parts.length; i++) {
      var g = parts[i].g, c = parts[i].c;
      var p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv, ix = g.index;
      var cr = ((c >> 16) & 255) / 255, cg = ((c >> 8) & 255) / 255, cb = (c & 255) / 255;
      var nv = p.array.length / 3;
      for (var v = 0; v < nv; v++) {
        pos.push(p.array[v * 3], p.array[v * 3 + 1], p.array[v * 3 + 2]);
        if (n && n.array) nor.push(n.array[v * 3], n.array[v * 3 + 1], n.array[v * 3 + 2]);
        else nor.push(0, 1, 0);
        if (u && u.array) uv.push(u.array[v * 2], u.array[v * 2 + 1]); else uv.push(0, 0);
        col.push(cr, cg, cb);
      }
      if (ix && ix.array) for (var k = 0; k < ix.array.length; k++) idx.push(ix.array[k] + off);
      else for (var k2 = 0; k2 < nv; k2++) idx.push(k2 + off);
      off += nv;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    geo.setIndex(idx);
    return geo;
  }
  function shadeColor(hex, f) {
    var r = Math.min(255, ((hex >> 16) & 255) * f) | 0,
        g = Math.min(255, ((hex >> 8) & 255) * f) | 0,
        b = Math.min(255, (hex & 255) * f) | 0;
    return (r << 16) | (g << 8) | b;
  }
  function boundsOf(geo) { // local-space bounds of merged geometry (debug/test)
    var a = geo.attributes.position.array, mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (var i = 0; i < a.length; i += 3) {
      for (var k = 0; k < 3; k++) {
        if (a[i + k] < mn[k]) mn[k] = a[i + k];
        if (a[i + k] > mx[k]) mx[k] = a[i + k];
      }
    }
    return { minX: mn[0], maxX: mx[0], minY: mn[1], maxY: mx[1], minZ: mn[2], maxZ: mx[2] };
  }
  var vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });

  /* ---- shared sitting pose (campfire benches, wheel gondolas) ----
     Proper sit: thighs forward horizontal, knees bent 75deg, shins vertical,
     feet planted, torso upright, hands resting toward the knees. */
  function applySitPose(c, dt, rigY) {
    var k = 1 - Math.exp(-dt * 8);
    c.hipL.rotation.x = lerp(c.hipL.rotation.x, -1.40, k);
    c.hipR.rotation.x = lerp(c.hipR.rotation.x, -1.40, k);
    c.kneeL.rotation.x = lerp(c.kneeL.rotation.x, 1.32, k);
    c.kneeR.rotation.x = lerp(c.kneeR.rotation.x, 1.32, k);
    c.shL.rotation.x = lerp(c.shL.rotation.x, -0.55, k);
    c.shR.rotation.x = lerp(c.shR.rotation.x, -0.55, k);
    c.shL.rotation.z = lerp(c.shL.rotation.z, -0.12, k);
    c.shR.rotation.z = lerp(c.shR.rotation.z, 0.12, k);
    c.rig.position.y = lerp(c.rig.position.y, rigY, k);
    c.lean = lerp(c.lean, 0.03, k);
    c.rig.rotation.x = c.lean;
    c.headG.rotation.y = lerp(c.headG.rotation.y, 0, k);
    c.headG.rotation.z = lerp(c.headG.rotation.z, 0, k);
  }

  /* ---------------- 1. rideable sky wheel ---------------- */
  function boardWheel(w) {
    if (w.riding) return;
    var best = 0, bd = 1e9; // gondola nearest the boarding point (world xz; yaw=PI)
    for (var i = 0; i < 8; i++) {
      var a = w.angle + i * Math.PI / 4;
      var gx = w.cx - Math.cos(a) * WHEEL_R, gz = w.cz;
      var d = Math.hypot(gx - w.boardX, gz - w.boardZ);
      if (d < bd) { bd = d; best = i; }
    }
    w.riding = true; w.rideIdx = best; ridingWheel = w;
    w.rideIt.disabled = true;
    movementLocked = true; promptLocked = true;
    cameraTargetOverride = player.position; // follow-camera retarget (no camera rewrite)
    showPrompt('🎡 Exit', function () { exitWheel(w); });
  }
  function exitWheel(w) {
    w.riding = false; ridingWheel = null;
    w.rideIt.disabled = false;
    movementLocked = false; promptLocked = false;
    cameraTargetOverride = null;
    hidePrompt();
    player.position.set(w.boardX, walkHeight(w.boardX, w.boardZ), w.boardZ);
    playerYaw = targetYaw = w.exitYaw; player.rotation.y = w.exitYaw;
  }
  function buildSkyWheel(plot, seedAngle) {
    var wx = plot.x, wz = plot.z, gy = groundHeight(wx, wz);
    var grp = new THREE.Group();
    grp.position.set(wx, gy, wz); grp.rotation.y = Math.PI; // face the plaza
    var H = WHEEL_H, R = WHEEL_R;
    /* static: platform, A-frames, crossbar, ticket booth (one merged mesh) */
    var sp = [];
    xg(new THREE.CylinderGeometry(4.8, 5.2, 0.5, 18), 0, 0.25, 0, 0, 0, 0, 0x8a7f72, sp);
    [-1.9, 1.9].forEach(function (sz) {
      tubePart(-3.6, 0.4, sz, 0, H, sz, 0.55, 0xb03a48, sp);
      tubePart(3.6, 0.4, sz, 0, H, sz, 0.55, 0xb03a48, sp);
    });
    tubePart(0, H, -1.9, 0, H, 1.9, 0.42, 0x7a2a34, sp);
    xg(new THREE.BoxGeometry(2.2, 2.0, 1.8), 0, 1.0, 6.4, 0, 0, 0, 0xf2e3c2, sp);   // booth
    xg(new THREE.ConeGeometry(1.9, 1.0, 4), 0, 2.5, 6.4, 0, Math.PI / 4, 0, 0xc0392b, sp); // roof
    xg(new THREE.BoxGeometry(2.4, 0.14, 0.6), 0, 1.05, 7.4, 0, 0, 0, 0x8a5a30, sp); // counter
    var stat = new THREE.Mesh(mergeParts(sp), vcMat);
    stat.castShadow = true; stat.receiveShadow = true; grp.add(stat);
    var statGeo = stat.geometry;
    /* rotor: rim + spokes + hub + 8 upright gondolas */
    var rotor = new THREE.Group(); rotor.position.set(0, H, 0); grp.add(rotor);
    var rimMat = new THREE.MeshStandardMaterial({
      color: 0xd94f5c, roughness: 0.5, emissive: 0xff6a4a, emissiveIntensity: 0.25
    });
    var rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.28, 10, 44), rimMat);
    rim.castShadow = true; rotor.add(rim); windowMats.push(rimMat); // night glow
    var bulbParts = []; // festive light bulbs around the rim (one merged mesh)
    for (var bi2 = 0; bi2 < 20; bi2++) {
      var ba = bi2 * Math.PI / 10;
      bulbParts.push(part(new THREE.SphereGeometry(0.17, 8, 6),
        Math.cos(ba) * R, Math.sin(ba) * R, 0.30, 0, 0, 0, 1, 1, 1));
    }
    var bulbMat = new THREE.MeshStandardMaterial({
      color: 0xffe0a0, emissive: 0xffb46b, emissiveIntensity: 1.4, roughness: 0.4
    });
    windowMats.push(bulbMat); // bulbs glow warm at night
    rotor.add(new THREE.Mesh(mergeGeos(bulbParts), bulbMat));
    var skp = [];
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4;
      tubePart(0, 0, 0, Math.cos(a) * (R - 0.2), Math.sin(a) * (R - 0.2), 0, 0.16, 0xf5ead2, skp);
    }
    var spokeGeo = mergeParts(skp);
    rotor.add(new THREE.Mesh(spokeGeo, vcMat));
    var hkp = [];
    xg(new THREE.CylinderGeometry(0.75, 0.75, 1.7, 12), 0, 0, 0, Math.PI / 2, 0, 0, 0xd8a04a, hkp);
    xg(new THREE.SphereGeometry(0.5, 10, 8), 0, 0, 0, 0, 0, 0, 0xffe0a0, hkp);
    var hubMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.4, emissive: 0xffc46b, emissiveIntensity: 0.4
    });
    rotor.add(new THREE.Mesh(mergeParts(hkp), hubMat)); windowMats.push(hubMat);
    /* illuminated retro LOVE board at the hub (static: child of grp, the rotor spins around it) */
    (function buildLoveBoard() {
      var c = document.createElement('canvas'); c.width = 512; c.height = 320;
      var g2 = c.getContext('2d');
      g2.fillStyle = '#2a1420'; g2.fillRect(0, 0, 512, 320);
      g2.strokeStyle = '#6b2a3a'; g2.lineWidth = 14; g2.strokeRect(10, 10, 492, 300);
      function heartPath(sz, oy) {
        var x = 256, y = oy;
        g2.beginPath();
        g2.moveTo(x, y + sz * 0.9);
        g2.bezierCurveTo(x - sz * 1.4, y, x - sz * 0.7, y - sz * 0.9, x, y - sz * 0.25);
        g2.bezierCurveTo(x + sz * 0.7, y - sz * 0.9, x + sz * 1.4, y, x, y + sz * 0.9);
        g2.closePath();
      }
      g2.shadowColor = '#ff4d6d'; g2.shadowBlur = 42;
      g2.fillStyle = '#ff5c7a';
      heartPath(72, 118); g2.fill(); g2.fill();
      g2.shadowColor = '#ffb46b'; g2.shadowBlur = 26;
      g2.fillStyle = '#ffe9b8';
      g2.font = 'bold 66px Georgia, serif'; g2.textAlign = 'center';
      g2.fillText('L O V E', 256, 272);
      var boardTex = new THREE.CanvasTexture(c);
      var boardMat = new THREE.MeshStandardMaterial({
        map: boardTex, emissive: 0xffffff, emissiveMap: boardTex,
        emissiveIntensity: 0.55, roughness: 0.6
      });
      windowMats.push(boardMat); // glows warm at night
      var bulbMat = new THREE.MeshStandardMaterial({
        color: 0xffe0a0, emissive: 0xffb46b, emissiveIntensity: 1.2, roughness: 0.4
      });
      windowMats.push(bulbMat);
      [1.2, -1.2].forEach(function (bz) {
        var bg = new THREE.Group();
        var frame = new THREE.Mesh(new THREE.BoxGeometry(5.6, 3.8, 0.16), trimMat);
        frame.castShadow = true; bg.add(frame);
        var face = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 3.4), boardMat);
        face.position.z = bz > 0 ? 0.1 : -0.1;
        if (bz < 0) face.rotation.y = Math.PI;
        bg.add(face);
        for (var bi = 0; bi < 16; bi++) { // marquee bulbs around the frame
          var t = bi / 16, bx2, by2;
          if (t < 0.25) { bx2 = -2.8 + t * 4 * 5.6; by2 = 1.9; }
          else if (t < 0.5) { bx2 = 2.8; by2 = 1.9 - (t - 0.25) * 4 * 3.8; }
          else if (t < 0.75) { bx2 = 2.8 - (t - 0.5) * 4 * 5.6; by2 = -1.9; }
          else { bx2 = -2.8; by2 = -1.9 + (t - 0.75) * 4 * 3.8; }
          var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), bulbMat);
          bulb.position.set(bx2, by2, bz > 0 ? 0.14 : -0.14);
          bg.add(bulb);
        }
        bg.position.set(0, H, bz);
        grp.add(bg);
      });
    })();
    /* gondolas: one InstancedMesh; children of the rotor so they orbit yet stay upright */
    var gparts = [];
    tubePart(0, 0, 0, 0, -1.0, 0, 0.12, 0x3a3a44, gparts);                 // hanger
    xg(new THREE.BoxGeometry(2.6, 0.18, 2.8), 0, -3.5, 0, 0, 0, 0, 0xffffff, gparts); // cabin floor
    xg(new THREE.BoxGeometry(2.6, 1.0, 0.12), 0, -2.9, 1.34, 0, 0, 0, 0xffffff, gparts);  // low walls (open cabin)
    xg(new THREE.BoxGeometry(2.6, 1.0, 0.12), 0, -2.9, -1.34, 0, 0, 0, 0xffffff, gparts);
    xg(new THREE.BoxGeometry(0.12, 1.0, 2.8), 1.24, -2.9, 0, 0, 0, 0, 0xffffff, gparts);
    xg(new THREE.BoxGeometry(0.12, 1.0, 2.8), -1.24, -2.9, 0, 0, 0, 0, 0xffffff, gparts);
    [[1.24, 1.34], [-1.24, 1.34], [1.24, -1.34], [-1.24, -1.34]].forEach(function (cn) {
      xg(new THREE.BoxGeometry(0.16, 2.5, 0.16), cn[0], -2.15, cn[1], 0, 0, 0, 0x8a5a30, gparts); // corner posts
    });
    xg(new THREE.BoxGeometry(2.9, 0.2, 3.1), 0, -0.9, 0, 0, 0, 0, 0xffffff, gparts);  // roof
    xg(new THREE.BoxGeometry(2.2, 0.18, 1.0), 0, -3.0, 0.2, 0, 0, 0, 0x8a5a30, gparts); // bench seat
    xg(new THREE.BoxGeometry(2.2, 0.9, 0.15), 0, -2.55, -0.35, 0, 0, 0, 0x8a5a30, gparts); // bench back
    var gondMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.6, emissive: 0xffb46b, emissiveIntensity: 0.18
    });
    windowMats.push(gondMat); // cabins glow warm at night
    var gondGeo = mergeParts(gparts);
    var gond = new THREE.InstancedMesh(gondGeo, gondMat, 8);
    var cols = [0xff5a5a, 0xffb03a, 0xffe45a, 0x5ad96b, 0x5ab8ff, 0xb07aff, 0xff7ac0, 0x5ae8d4];
    for (var j = 0; j < 8; j++) {
      var a2 = j * Math.PI / 4;
      _dummy.position.set(Math.cos(a2) * R, Math.sin(a2) * R, 0);
      _dummy.rotation.set(0, 0, 0); _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix(); gond.setMatrixAt(j, _dummy.matrix);
      gond.setColorAt(j, dummyColor.setHex(cols[j]));
    }
    if (gond.instanceMatrix) gond.instanceMatrix.needsUpdate = true;
    gond.castShadow = true; rotor.add(gond);
    var hubLight = new THREE.PointLight(0xffc46b, 0, 30, 1.8);
    hubLight.position.set(0, H, 0); grp.add(hubLight);
    scene.add(grp);
    registerChunk(grp, wx, wz);
    colliders.push({ x: wx, z: wz, r: 8.5 }); // solid structure; prompt stays reachable
    var boardX = wx, boardZ = wz - 8.8;       // booth front (yaw=PI flips local +z)
    var w = {
      cx: wx, cz: wz, baseY: gy, rotor: rotor, gond: gond, angle: seedAngle, spin: 0.045,
      riding: false, rideIdx: 0, hubLight: hubLight,
      boardX: boardX, boardZ: boardZ, exitYaw: Math.PI
    };
    var it = {
      x: boardX, z: boardZ, r: 4.2, label: '🎡 Ride', disabled: false,
      action: function () { boardWheel(w); }
    };
    w.rideIt = it;
    interactables.push(it);
    wheels.push(w);
    w.geoVerts = { // test/debug: merged-geometry stats (local space)
      statik: statGeo.attributes.position.count,
      spokes: spokeGeo.attributes.position.count,
      gondola: gondGeo.attributes.position.count,
      staticBounds: boundsOf(statGeo)
    };
    return w;
  }

  /* ---------------- 2. dock + rowboat ---------------- */
  var pierLantMat = new THREE.MeshStandardMaterial({
    color: 0xffd9a0, emissive: 0xffb46b, emissiveIntensity: 0.7, roughness: 0.5
  });
  windowMats.push(pierLantMat);
  function buildDock(dock, seed) {
    var sx = dock.x, sz = dock.z, dx = dock.dx, dz = dock.dz;
    var deckY = 1.3;
    var ex = sx + dx * PIER_LEN, ez = sz + dz * PIER_LEN;
    var grp = new THREE.Group();
    grp.position.set(sx, 0, sz); grp.rotation.y = Math.atan2(dx, dz); // pier along local +z
    var prand = mulberry32(seed);
    var pp = [], n = 13;
    for (var i = 0; i < n; i++) { // planks with subtle tone variation
      xg(new THREE.BoxGeometry(3.2, 0.16, 0.92), 0, deckY, 0.55 + i * 1.05, 0, 0, 0,
        shadeColor(0x8a6238, 0.9 + prand() * 0.2), pp);
    }
    var planks = new THREE.Mesh(mergeParts(pp), vcMat);
    planks.castShadow = true; planks.receiveShadow = true; grp.add(planks);
    var qp = []; // posts + rope rails
    for (var j = 0; j < n; j += 3) {
      var pz = 0.55 + j * 1.05;
      [-1.45, 1.45].forEach(function (px) {
        xg(new THREE.CylinderGeometry(0.15, 0.18, deckY + 2.0, 7), px, deckY / 2, pz, 0, 0, 0, 0x6b4a2c, qp);
      });
      if (j + 3 < n) {
        var pz2 = 0.55 + (j + 3) * 1.05;
        [-1.45, 1.45].forEach(function (px2) { // rope with a gentle sag (2 spans)
          var mz = (pz + pz2) / 2;
          tubePart(px2, deckY + 0.85, pz, px2, deckY + 0.72, mz, 0.06, 0xc9a86a, qp);
          tubePart(px2, deckY + 0.72, mz, px2, deckY + 0.85, pz2, 0.06, 0xc9a86a, qp);
        });
      }
    }
    xg(new THREE.CylinderGeometry(0.09, 0.11, 1.7, 6), 1.25, deckY + 0.85, PIER_LEN - 0.6, 0, 0, 0, 0x4a3524, qp); // lamp pole
    grp.add(new THREE.Mesh(mergeParts(qp), vcMat));
    var lant = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), pierLantMat);
    lant.position.set(1.25, deckY + 1.85, PIER_LEN - 0.6); grp.add(lant);
    var spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffb46b, transparent: true, opacity: 0.1,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    spr.scale.set(4, 4, 1); spr.position.copy(lant.position);
    grp.add(spr); lanternSprites.push(spr);
    /* rowboat floating beside the pier end */
    var bp = [];
    xg(new THREE.BoxGeometry(1.7, 0.28, 4.4), 0, 0.15, 0, 0, 0, 0, 0x7a4f2e, bp);          // hull bottom
    xg(new THREE.BoxGeometry(0.2, 0.75, 4.4), -0.85, 0.55, 0, 0, 0, 0.18, 0x7a4f2e, bp);  // port wall
    xg(new THREE.BoxGeometry(0.2, 0.75, 4.4), 0.85, 0.55, 0, 0, 0, -0.18, 0x7a4f2e, bp);  // starboard
    xg(new THREE.BoxGeometry(1.7, 0.75, 0.2), 0, 0.55, -2.15, 0, 0, 0, 0x7a4f2e, bp);    // transom
    xg(new THREE.BoxGeometry(1.7, 0.75, 1.4), 0, 0.55, 2.5, -0.5, 0, 0, 0x7a4f2e, bp);    // bow
    xg(new THREE.BoxGeometry(1.5, 0.12, 0.45), 0, 0.62, -0.9, 0, 0, 0, 0x9a6f42, bp);     // benches
    xg(new THREE.BoxGeometry(1.5, 0.12, 0.45), 0, 0.62, 0.9, 0, 0, 0, 0x9a6f42, bp);
    var boat = new THREE.Group();
    var hull = new THREE.Mesh(mergeParts(bp), vcMat); hull.castShadow = true; boat.add(hull);
    boat.position.set(ex + 3.4, 0.12, ez + dz * 2.5); boat.rotation.y = Math.atan2(dx, dz);
    scene.add(boat);
    boats.push({ group: boat, ph: seed * 0.37 });
    scene.add(grp);
    registerChunk(grp, (sx + ex) / 2, (sz + ez) / 2);
    pierRects.push({ // strollable deck
      x0: Math.min(sx, ex) - 1.7, x1: Math.max(sx, ex) + 1.7,
      z0: Math.min(sz, ez) - 0.5, z1: Math.max(sz, ez) + 0.5, y: deckY + 0.08
    });
  }

  /* ---------------- 3. bicycles ---------------- */
  var bikeTireMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.8 });
  var bikeWheelGeo = (function () { // torus + spokes + hub, axle along x (rolls on z)
    var wp = [];
    xg(new THREE.TorusGeometry(0.55, 0.09, 8, 20), 0, 0, 0, 0, Math.PI / 2, 0, 0x2a2a2e, wp);
    for (var s = 0; s < 3; s++)
      xg(new THREE.BoxGeometry(0.05, 1.0, 0.05), 0, 0, 0, s * Math.PI / 3, Math.PI / 2, 0, 0x8a8a92, wp);
    xg(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 8), 0, 0, 0, 0, 0, Math.PI / 2, 0x55555e, wp);
    return mergeParts(wp);
  })();
  function buildBike(frameColor, px, pz, yaw) {
    var gy = groundHeight(px, pz);
    var grp = new THREE.Group(); grp.position.set(px, gy, pz); grp.rotation.y = yaw;
    var fp = [], F = frameColor, D = 0x333338;
    tubePart(0.10, 0.55, -0.85, 0.10, 0.60, -0.05, 0.09, F, fp);   // chainstays
    tubePart(-0.10, 0.55, -0.85, -0.10, 0.60, -0.05, 0.09, F, fp);
    tubePart(0.10, 0.55, -0.85, 0.10, 1.08, -0.36, 0.08, F, fp);  // seatstays
    tubePart(-0.10, 0.55, -0.85, -0.10, 1.08, -0.36, 0.08, F, fp);
    tubePart(0, 0.60, -0.05, 0, 1.12, -0.38, 0.10, F, fp);        // seat tube
    tubePart(0, 0.60, -0.05, 0, 0.95, 0.70, 0.11, F, fp);         // down tube
    tubePart(0, 1.12, -0.38, 0, 1.28, 0.60, 0.10, F, fp);         // top tube
    tubePart(0.10, 0.95, 0.70, 0.10, 0.55, 0.85, 0.08, F, fp);    // fork
    tubePart(-0.10, 0.95, 0.70, -0.10, 0.55, 0.85, 0.08, F, fp);
    tubePart(0, 0.95, 0.70, 0, 1.28, 0.60, 0.14, F, fp);          // head tube
    tubePart(0, 1.28, 0.60, 0, 1.42, 0.52, 0.07, D, fp);          // stem
    tubePart(-0.32, 1.42, 0.52, 0.32, 1.42, 0.52, 0.06, D, fp);   // handlebar
    xg(new THREE.BoxGeometry(0.28, 0.10, 0.42), 0, 1.16, -0.40, 0, 0, 0, D, fp); // saddle
    var frameGeo = mergeParts(fp);
    var frame = new THREE.Mesh(frameGeo, vcMat); frame.castShadow = true; grp.add(frame);
    var wheelF = new THREE.Mesh(bikeWheelGeo, bikeTireMat);
    wheelF.position.set(0, 0.55, 0.85); wheelF.castShadow = true; grp.add(wheelF);
    var wheelR = new THREE.Mesh(bikeWheelGeo, bikeTireMat);
    wheelR.position.set(0, 0.55, -0.85); wheelR.castShadow = true; grp.add(wheelR);
    scene.add(grp);
    var bchunk = registerChunk(grp, px, pz);
    var b = { group: grp, wheelF: wheelF, wheelR: wheelR, pedal: 0, it: null, chunk: bchunk };
    var it = {
      x: px, z: pz, r: 3.4, label: '🚲 Ride', disabled: false,
      action: function () { rideBike(b); }
    };
    b.it = it; interactables.push(it);
    bikes.push(b);
    b.geoVerts = frameGeo.attributes.position.count; // 13 boxes = 312 verts
    b.frameBounds = boundsOf(frameGeo);
    return b;
  }
  function buildCycleStand(plot, seedIdx) {
    var sx = plot.x, sz = plot.z, gy = groundHeight(sx, sz);
    var grp = new THREE.Group(); grp.position.set(sx, gy, sz);
    var rp = [];
    tubePart(-1.6, 0, 0, -1.6, 0.9, 0, 0.09, 0x5a6068, rp);
    tubePart(1.6, 0, 0, 1.6, 0.9, 0, 0.09, 0x5a6068, rp);
    tubePart(-1.6, 0.9, 0, 1.6, 0.9, 0, 0.09, 0x5a6068, rp);
    var rack = new THREE.Mesh(mergeParts(rp), vcMat); rack.castShadow = true; grp.add(rack);
    scene.add(grp);
    registerChunk(grp, sx, sz);
    var cols = [0x2a9d8f, 0xe86a8a]; // teal + rose, like the old game
    for (var i = 0; i < 2; i++)
      buildBike(cols[(seedIdx + i) % 2], sx + (i ? 1.5 : -1.5), sz + 0.9, Math.PI / 2 + (i ? 0.25 : -0.2));
  }
  function rideBike(b) {
    if (ridingBike) return;
    ridingBike = b; b.it.disabled = true;
    speedMult = 1.8;
    if (b.chunk) b.chunk.noLOD = true; // keep the bike visible while riding (chunk stays at parked spot)
    b.group.visible = true;
    scene.remove(b.group);
    playerRig.group.add(b.group);      // bike follows the player
    b.group.position.set(0, 0.02, 0.40); // saddle (bike-local z=-0.40) lands under the hips
    b.group.rotation.set(0, 0, 0);
    b.pedal = 0;
    promptLocked = true;
    showPrompt('🚲 Dismount', dismountBike);
  }
  function dismountBike() {
    var b = ridingBike; if (!b) return;
    ridingBike = null; speedMult = 1;
    var yaw = playerYaw;
    var wx = player.position.x - 0.55 * Math.sin(yaw), wz = player.position.z - 0.55 * Math.cos(yaw);
    var wy = walkHeight(wx, wz);
    if (wy < -900) { wx = player.position.x; wz = player.position.z; wy = player.position.y; }
    playerRig.group.remove(b.group);
    scene.add(b.group);
    b.group.position.set(wx, wy, wz);
    b.group.rotation.set(0, yaw, 0);
    if (b.chunk) { b.chunk.noLOD = false; b.chunk.cx = wx; b.chunk.cz = wz; } // resume LOD at the parked spot
    b.it.disabled = false; b.it.x = wx; b.it.z = wz; // prompt follows the parked bike
    promptLocked = false;
    hidePrompt();
  }
  function updateBikeAnim(c, dt, t, moving, speed) {
    var k = 1 - Math.exp(-dt * 8), b = ridingBike;
    if (b) {
      b.pedal += dt * (moving ? speed * 1.6 : 1.2);
      var s = Math.sin(b.pedal); // legs pedal in circles
      c.hipL.rotation.x = lerp(c.hipL.rotation.x, -0.95 + s * 0.45, k);
      c.hipR.rotation.x = lerp(c.hipR.rotation.x, -0.95 - s * 0.45, k);
      var flexL = 0.95 - s * 0.45, flexR = 0.95 + s * 0.45; // hip flexion 0.5..1.4
      c.kneeL.rotation.x = lerp(c.kneeL.rotation.x, 0.25 + (flexL - 0.5) * 1.1, k); // knee follows pedal
      c.kneeR.rotation.x = lerp(c.kneeR.rotation.x, 0.25 + (flexR - 0.5) * 1.1, k);
      var spin = speed * dt / 0.55 * (moving ? 1 : 0.15); // forward roll: top of wheel moves +z
      b.wheelF.rotation.x += spin; b.wheelR.rotation.x += spin;
    }
    c.shL.rotation.x = lerp(c.shL.rotation.x, -0.72, k); // hands to the handlebar
    c.shR.rotation.x = lerp(c.shR.rotation.x, -0.72, k);
    c.rig.position.y = lerp(c.rig.position.y, -0.15, k); // butt on the saddle
    c.lean = lerp(c.lean, 0.14, k); c.rig.rotation.x = c.lean;
    c.headG.rotation.y = Math.sin(t * 0.6) * 0.07;
  }

  /* ---------------- 4. campfire sit ---------------- */
  var campBenches = [-1, 1].map(function (s) {
    var bx = campfirePos.x + s * 4.6, bz = campfirePos.z + 1.2;
    return { x: bx, z: bz, yaw: Math.atan2(campfirePos.x - bx, campfirePos.z - bz) };
  });
  function doCampSit() {
    if (sitting) return;
    var d0 = Math.hypot(player.position.x - campBenches[0].x, player.position.z - campBenches[0].z);
    var mine = d0 < Math.hypot(player.position.x - campBenches[1].x, player.position.z - campBenches[1].z)
      ? campBenches[0] : campBenches[1];
    var hers = mine === campBenches[0] ? campBenches[1] : campBenches[0];
    sitting = { bench: mine };
    player.position.set(mine.x, walkHeight(mine.x, mine.z), mine.z);
    playerYaw = targetYaw = mine.yaw; player.rotation.y = mine.yaw;
    movementLocked = true; promptLocked = true;
    showPrompt('🧍 Stand up', doCampStand);
    if (partnerOnline && // Tara joins on the next bench when she's close
        Math.hypot(partner.position.x - campfirePos.x, partner.position.z - campfirePos.z) < 14) {
      partnerHold = true;
      partnerSit = { x: hers.x, z: hers.z, yaw: hers.yaw, seated: false };
    }
  }
  function doCampStand() {
    if (!sitting) return;
    sitting = null; partnerHold = false; partnerSit = null;
    movementLocked = false; promptLocked = false;
    hidePrompt();
  }
  interactables.push({
    x: campfirePos.x, z: campfirePos.z + 1.0, r: 5,
    label: '🔥 Sit', disabled: false, action: doCampSit
  });

  /* ---------------- M3: beacon (light together, daily streak) ---------------- */
  var beacons = [];
  function buildBeacon(cx, cz) {
    var g = new THREE.Group();
    var gy = groundHeight(cx, cz);
    // stone base
    var base = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 0.8, 8), new THREE.MeshStandardMaterial({ color: 0x8a7f72, roughness: 0.9 }));
    base.position.y = 0.4;
    base.castShadow = true;
    g.add(base);
    // pillar
    var pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0x6b5d4f, roughness: 0.85 }));
    pillar.position.y = 1.9;
    pillar.castShadow = true;
    g.add(pillar);
    // brazier bowl
    var bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.6, 0.6, 10), new THREE.MeshStandardMaterial({ color: 0x3a2f28, roughness: 0.7, metalness: 0.3 }));
    bowl.position.y = 3.2;
    bowl.castShadow = true;
    g.add(bowl);
    // flame (hidden until lit)
    var flame = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.4, 8), new THREE.MeshBasicMaterial({ color: 0xffa63d, transparent: true, opacity: 0.9 }));
    flame.position.y = 4.1;
    flame.visible = false;
    g.add(flame);
    // inner flame
    var flame2 = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 8), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95 }));
    flame2.position.y = 4.0;
    flame2.visible = false;
    g.add(flame2);
    // light
    var light = new THREE.PointLight(0xff9a3d, 0, 25, 1.8);
    light.position.y = 4.2;
    g.add(light);
    g.position.set(cx, gy, cz);
    scene.add(g);
    var beacon = { group: g, flame: flame, flame2: flame2, light: light, x: cx, z: cz, lit: false };
    beacons.push(beacon);
    return beacon;
  }
  // Place beacons near each island's plaza
  var beaconA = buildBeacon(ISL_A.cx + 8, 18);
  var beaconB = buildBeacon(ISL_B.cx - 8, 18);
  function isBeaconLitToday() {
    try {
      var raw = localStorage.getItem('kanavu-beacon-lit');
      if (!raw) return false;
      var d = JSON.parse(raw);
      var today = new Date().toISOString().slice(0, 10);
      return d.date === today && d.lit;
    } catch (e) { return false; }
  }
  function setBeaconLit(lit) {
    var today = new Date().toISOString().slice(0, 10);
    try { localStorage.setItem('kanavu-beacon-lit', JSON.stringify({ date: today, lit: !!lit })); } catch (e) {}
    beacons.forEach(function (b) {
      b.lit = !!lit;
      b.flame.visible = !!lit;
      b.flame2.visible = !!lit;
      b.light.intensity = lit ? 30 : 0;
    });
    // update streak
    if (lit) {
      try {
        var sRaw = localStorage.getItem('kanavu-beacon-streak-data');
        var sData = sRaw ? JSON.parse(sRaw) : { streak: 0, last: null };
        var yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        if (sData.last === today) { /* already counted */ }
        else if (sData.last === yesterday) { sData.streak += 1; }
        else { sData.streak = 1; }
        sData.last = today;
        localStorage.setItem('kanavu-beacon-streak-data', JSON.stringify(sData));
        localStorage.setItem('kanavu-beacon-streak', String(sData.streak));
      } catch (e) {}
    }
  }
  // Restore lit state on load
  if (isBeaconLitToday()) {
    beacons.forEach(function (b) {
      b.lit = true; b.flame.visible = true; b.flame2.visible = true; b.light.intensity = 30;
    });
  }
  function lightBeacon() {
    if (isBeaconLitToday()) return;
    setBeaconLit(true);
    try { if (window.KanavuSocial && window.KanavuSocial.onBeaconLit) window.KanavuSocial.onBeaconLit(); } catch (e) {}
    // notify partner
    try {
      var mp = window.KanavuMultiplayer;
      if (mp && mp.sendMsg) mp.sendMsg('beacon', { lit: true });
    } catch (e) {}
  }
  beacons.forEach(function (b) {
    interactables.push({
      x: b.x, z: b.z, r: 6,
      label: '🔥 Light the beacon',
      action: lightBeacon
    });
  });
  // Animate flames
  var beaconT = 0;

  /* ---------------- Phase 4 per-frame update ---------------- */
  function updatePhase4(dt, t) {
    /* M3: beacon flame flicker */
    beaconT += dt;
    for (var bi = 0; bi < beacons.length; bi++) {
      var bc = beacons[bi];
      if (bc.lit) {
        var f = 1 + Math.sin(beaconT * 13 + bi * 2.1) * 0.12 + Math.sin(beaconT * 29 + bi) * 0.06;
        bc.flame.scale.set(f, 1 + (f - 1) * 1.6, f);
        bc.flame2.scale.set(f, 1 + (f - 1) * 1.4, f);
        bc.flame.rotation.y += dt * 2;
      }
    }
    for (var i = 0; i < wheels.length; i++) {
      var w = wheels[i];
      w.spin = lerp(w.spin, w.riding ? 0.12 : 0.045, 1 - Math.exp(-dt * 1.5));
      w.angle += w.spin * dt;
      w.rotor.rotation.z = w.angle;
      w.hubLight.intensity = nightLevel * 16;
      /* gondolas hang from pivots: counter-rotate the rotor's spin so cabins stay upright */
      for (var gj = 0; gj < 8; gj++) {
        var ga = gj * Math.PI / 4;
        _dummy.position.set(Math.cos(ga) * WHEEL_R, Math.sin(ga) * WHEEL_R, 0);
        _dummy.rotation.set(0, 0, -w.angle);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        w.gond.setMatrixAt(gj, _dummy.matrix);
      }
      w.gond.instanceMatrix.needsUpdate = true;
      if (w.riding) { // carry the rider in their gondola (yaw=PI: x flips)
        var a = w.angle + w.rideIdx * Math.PI / 4;
        var lx = Math.cos(a) * WHEEL_R, ly = Math.sin(a) * WHEEL_R;
        var wy = w.baseY + WHEEL_H + ly;
        player.position.set(w.cx - lx, wy - 3.41, w.cz + 0.2); // feet on the cabin floor, butt back on the bench
        playerYaw = targetYaw = Math.PI; player.rotation.y = Math.PI; // sit on the bench: back on the backrest, facing the plaza side
        applySitPose(playerRig, dt, -0.84); // hips on the bench seat
      }
    }
    for (var b = 0; b < boats.length; b++) { // gentle bobbing
      var bt = boats[b];
      bt.group.position.y = 0.12 + Math.sin(t * 0.9 + bt.ph) * 0.12;
      bt.group.rotation.z = Math.sin(t * 0.8 + bt.ph) * 0.045;
      bt.group.rotation.x = Math.sin(t * 0.63 + bt.ph * 1.7) * 0.03;
    }
    if (sitting) fireLight.intensity += Math.sin(t * 6.3) * 2.5; // warmth pulse
  }

  /* ---------------- homely utility poles + sagging wires ---------------- */
  var poleWoodMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1 });
  var wireMat = new THREE.MeshStandardMaterial({ color: 0x232326, roughness: 0.85 });
  function buildPowerLines() {
    /* poles behind each building, strung around the island outskirts (never in the central walking area) */
    var polePts = []; // {x, z, cx}  cx = island center x
    [0, 1].forEach(function (side) {
      var ccx = side ? ISL_B.cx : ISL_A.cx;
      BUILD_PLOTS_A.forEach(function (p) {
        var bx = side ? -p.x : p.x, bz = p.z;
        var dx = bx - ccx, dz = bz; // back direction: away from the island center (doors face the center)
        var dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
        [[12, -3], [19, 3]].forEach(function (off) {
          var px = bx + dx * off[0] - dz * off[1];
          var pz = bz + dz * off[0] + dx * off[1];
          for (var k = 0; k < 24 && groundHeight(px, pz) < 2; k++) { px -= dx * 1.5; pz -= dz * 1.5; } // stay on land
          polePts.push({ x: px, z: pz, cx: ccx });
        });
      });
    });
    /* order poles around each island by angle; wire consecutive poles, skipping bridge crossings */
    var runs = [];
    [ISL_A.cx, ISL_B.cx].forEach(function (ccx) {
      var pts = polePts.filter(function (q) { return q.cx === ccx; });
      pts.sort(function (a, b) { return Math.atan2(a.z, a.x - ccx) - Math.atan2(b.z, b.x - ccx); });
      var run = [];
      for (var i = 0; i < pts.length; i++) {
        var nx = pts[(i + 1) % pts.length];
        var mx = (pts[i].x + nx.x) / 2, mz = (pts[i].z + nx.z) / 2;
        run.push([pts[i].x, pts[i].z]);
        if (Math.abs(mz) < 12 && Math.abs(mx) < 78) { if (run.length > 1) runs.push(run); run = []; } // bridge corridor: break the ring
      }
      if (run.length > 1) runs.push(run);
    });
    var seen = {}, poleList = [];
    runs.forEach(function (run) {
      run.forEach(function (pt) {
        var k = pt[0].toFixed(1) + ',' + pt[1].toFixed(1);
        if (!seen[k]) { seen[k] = true; poleList.push(pt); }
      });
    });
    var poleGeos = [], wireGeos = [], topAt = {}, ARM_Y = 7.4;
    function key(pt) { return pt[0].toFixed(1) + ',' + pt[1].toFixed(1); }
    poleList.forEach(function (pt) {
      var gy = groundHeight(pt[0], pt[1]);
      poleGeos.push(part(GEO.cyl, pt[0], gy + 2.1, pt[1], 0, 0, 0, 0.62, 4.2, 0.62, [1, 1])); // tapered pole
      poleGeos.push(part(GEO.cyl, pt[0], gy + 6.2, pt[1], 0, 0, 0, 0.42, 4.2, 0.42, [1, 1]));
      poleGeos.push(part(GEO.box, pt[0], gy + ARM_Y, pt[1], 0, 0, 0, 2.6, 0.18, 0.18, [1, 1])); // crossarm
      poleGeos.push(part(GEO.cyl, pt[0] - 1.1, gy + ARM_Y + 0.2, pt[1], 0, 0, 0, 0.16, 0.32, 0.16, [1, 1])); // insulators
      poleGeos.push(part(GEO.cyl, pt[0] + 1.1, gy + ARM_Y + 0.2, pt[1], 0, 0, 0, 0.16, 0.32, 0.16, [1, 1]));
      topAt[key(pt)] = [[pt[0] - 1.1, gy + ARM_Y + 0.36, pt[1]], [pt[0] + 1.1, gy + ARM_Y + 0.36, pt[1]]];
      colliders.push({ x: pt[0], z: pt[1], r: 0.7 }); // solid pole
    });
    runs.forEach(function (run) {
      for (var i = 0; i < run.length - 1; i++) {
        var t0 = topAt[key(run[i])], t1 = topAt[key(run[i + 1])];
        if (!t0 || !t1) continue;
        for (var w = 0; w < 2; w++) {
          var p0 = t0[w], p1 = t1[w];
          var sag = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) * 0.055;
          var curve = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(p0[0], p0[1], p0[2]),
            new THREE.Vector3((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 - sag, (p0[2] + p1[2]) / 2),
            new THREE.Vector3(p1[0], p1[1], p1[2]));
          wireGeos.push(new THREE.TubeGeometry(curve, 14, 0.035, 5, false).toNonIndexed());
        }
      }
    });
    if (poleGeos.length) {
      var poleMesh = new THREE.Mesh(mergeGeos(poleGeos), poleWoodMat);
      poleMesh.castShadow = true;
      registerChunk(poleMesh, 0, -12);
    }
    if (wireGeos.length) registerChunk(new THREE.Mesh(mergeGeos(wireGeos), wireMat), 0, -12);
  }

  /* ---------------- homely street lamps (glow at night) ---------------- */
  var lampMetalMat = new THREE.MeshStandardMaterial({ color: 0x2e3138, roughness: 0.7, metalness: 0.35 });
  var lampHeadMat = new THREE.MeshStandardMaterial({
    color: 0xffe0a0, emissive: 0xffc98a, emissiveIntensity: 0.9, roughness: 0.4
  });
  function buildStreetLamps() {
    var spots = [
      [-90, 10], [-80, 0], [-100, 2], [-90, -16], [-70, -10],
      [90, 10], [80, 0], [100, 2], [90, -16], [70, -10]
    ];
    var lampGeos = [], headGeos = [];
    spots.forEach(function (pt) {
      var gy = groundHeight(pt[0], pt[1]);
      lampGeos.push(part(GEO.cyl, pt[0], gy + 2.75, pt[1], 0, 0, 0, 0.28, 5.5, 0.28, [1, 1])); // post
      lampGeos.push(part(GEO.box, pt[0] + 0.7, gy + 5.4, pt[1], 0, 0, 0, 1.6, 0.14, 0.14, [1, 1])); // arm
      headGeos.push(part(GEO.sph, pt[0] + 1.4, gy + 5.15, pt[1], 0, 0, 0, 0.34, 0.34, 0.34, [1, 1])); // lamp head
      headGeos.push(part(GEO.cyl, pt[0] + 1.4, gy + 5.42, pt[1], 0, 0, 0, 0.5, 0.1, 0.5, [1, 1])); // cap
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: 0xffc98a, transparent: true, opacity: 0.0,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      sp.scale.set(4.5, 4.5, 1);
      sp.position.set(pt[0] + 1.4, gy + 5.15, pt[1]);
      scene.add(sp);
      lanternSprites.push(sp); // fades in at night via the existing driver
      colliders.push({ x: pt[0], z: pt[1], r: 0.45 }); // solid post
    });
    windowMats.push(lampHeadMat); // lamp heads glow at night
    if (lampGeos.length) {
      var lampMesh = new THREE.Mesh(mergeGeos(lampGeos), lampMetalMat);
      lampMesh.castShadow = true;
      registerChunk(lampMesh, 0, 0);
    }
    if (headGeos.length) registerChunk(new THREE.Mesh(mergeGeos(headGeos), lampHeadMat), 0, 0);
  }

  /* weather state (declared before the builders run) */
  var weatherMode = 'clear'; // 'clear' | 'rain' | 'snow'
  var rainLines = null, snowPts = null, weatherDim = 0; // weatherDim lerps 0..1 while precipitating

  /* build all Phase 4 objects (mirrored across islands) */
  pierRects.length = 0; // reset on re-init (module-level walk list)
  buildSkyWheel(WHEEL_A, 0.6);
  buildSkyWheel(WHEEL_B, 2.2);
  buildDock(DOCK_A, 31);
  buildDock(DOCK_B, 77);
  buildCycleStand(STAND_A, 0);
  buildCycleStand(STAND_B, 1);
  buildPowerLines(); // homely utility poles + sagging wires (outskirts, behind buildings)
  buildStreetLamps(); // warm street lamps around the plazas
  buildWeather(); // rain + snow particle systems (hidden until the settings pick them)

  /* ---------------- input: keys + touch joystick + mouse orbit ---------- */
  var keys = {};
  var promptAction = null; // Phase 2: current prompt button action (E key)
  var joyVec = { x: 0, y: 0, active: false };
  var orbit = { yaw: Math.PI * 0.15, pitch: 0.42, dist: 26, dragging: false, lx: 0, ly: 0 };
  var joystickEls = null;

  function onKeyDown(e) {
    keys[e.code] = true;
    if (e.code === 'KeyE' && !e.repeat && promptAction) promptAction(); // Phase 2 prompt
  }
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

  var camPointers = new Map(); // pointerId -> {x, y} (pinch zoom)
  var pinchD0 = 0;
  function onCanvasDown(e) {
    if (e.target !== canvas) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    camPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (camPointers.size === 2) { // start pinch: stop single-finger orbit
      var p = Array.from(camPointers.values());
      pinchD0 = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      orbit.dragging = false;
    } else if (camPointers.size === 1) {
      orbit.dragging = true; orbit.lx = e.clientX; orbit.ly = e.clientY;
    }
  }
  function onCanvasMove(e) {
    if (!camPointers.has(e.pointerId)) return;
    camPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (camPointers.size === 2) { // pinch zoom in/out
      var p = Array.from(camPointers.values());
      var d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      if (pinchD0 > 0 && d > 0) orbit.dist = clamp(orbit.dist * (pinchD0 / d), 13, 48);
      pinchD0 = d;
      return;
    }
    if (!orbit.dragging) return;
    orbit.yaw -= (e.clientX - orbit.lx) * 0.0052;
    orbit.pitch = clamp(orbit.pitch + (e.clientY - orbit.ly) * 0.004, 0.14, 1.15);
    orbit.lx = e.clientX; orbit.ly = e.clientY;
  }
  function onCanvasUp(e) {
    camPointers.delete(e.pointerId);
    if (camPointers.size < 2) pinchD0 = 0;
    if (camPointers.size === 0) orbit.dragging = false;
    else if (camPointers.size === 1) {
      var p = Array.from(camPointers.values())[0];
      orbit.dragging = true; orbit.lx = p.x; orbit.ly = p.y;
    }
  }
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
    nightLevel = night; // Phase 4: wheel hub lights, driven below
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
    sun.color.copy(cur.sunC); sun.intensity = cur.sunI * 1.35 * (1 - weatherDim * 0.45); // overcast dims the sun
    hemi.intensity = cur.hemiI * (1 - weatherDim * 0.25); amb.intensity = cur.ambI;
    renderer.toneMappingExposure = lerp(1.08, 0.85, night);

    /* lanterns / fire / fireflies come alive at night */
    var glow = 0.12 + night * 0.88;
    for (var i = 0; i < lanternMats.length; i++) lanternMats[i].emissiveIntensity = 0.25 + night * 2.2;
    for (var w = 0; w < windowMats.length; w++) windowMats[w].emissiveIntensity = 0.25 + night * 2.2; // Phase 2: glowing windows
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
      if (ch.noLOD) continue; // e.g. ridden bike: managed manually, never auto-hide
      _toObj.set(ch.cx - _camPos.x, 0, ch.cz - _camPos.z);
      var dist = _toObj.length();
      var vis = true;
      if (insideRoomObj) vis = (ch.obj === insideRoomObj); // inside: only the room shows
      else if (dist > LOD_DIST) vis = false;
      else {
        _toObj.normalize();
        var facing = _toObj.x * _camDir.x + _toObj.z * _camDir.z;
        if (facing < -0.18 && !ch.noBehind) vis = false; // behind the camera (>~100 deg)
      }
      if (ch.obj.visible !== vis) ch.obj.visible = vis;
    }
  }

  /* ---------------- movement + camera ---------------- */
  /* Phase 2: circle colliders push the player out (slide, don't stick);
     inside an interior room the player is clamped to the room bounds. */
  function collideCircle(px, pz) {
    for (var i = 0; i < colliders.length; i++) {
      var c = colliders[i];
      var dx = px - c.x, dz = pz - c.z;
      var rr = c.r + 0.7, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        if (d2 < 1e-6) { px = c.x + rr; }
        else { var dd = Math.sqrt(d2); px = c.x + dx / dd * rr; pz = c.z + dz / dd * rr; }
      }
    }
    return { x: px, z: pz };
  }
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
  /* Phase 3: shared axis-separated stepper (player + partner): circle
     colliders push out (slide, don't stick), interior rooms clamp,
     water/out-of-bounds block */
  function stepMover(px, pz, dx, dz, speed, dt) {
    var nx = px + dx * speed * dt, nz = pz + dz * speed * dt;
    var moved = false, x = px, z = pz;
    var zone = zoneAt(px, pz);
    if (zone) {
      var qx = clamp(nx, zone.x0 + 0.6, zone.x1 - 0.6);
      var qz = clamp(nz, zone.z0 + 0.6, zone.z1 - 0.6);
      if (walkHeight(qx, pz) > -900) { x = qx; moved = true; }
      if (walkHeight(x, qz) > -900) { z = qz; moved = true; }
    } else {
      /* Phase 2: resolve circle colliders on the COMBINED move (one radial
         push-out per collider = stable slide, no tangential orbit), then
         axis-separated walkHeight checks keep water/out-of-bounds blocking */
      var tx = nx, tz = nz;
      for (var ci = 0; ci < 2; ci++) { var rs = collideCircle(tx, tz); tx = rs.x; tz = rs.z; }
      if (walkHeight(tx, pz) > -900) { x = tx; moved = true; }
      if (walkHeight(x, tz) > -900) { z = tz; moved = true; }
    }
    return { x: x, z: z, moved: moved };
  }
  function updatePlayer(dt, t) {
    var inp = inputVector();
    /* camera-relative movement */
    var sin = Math.sin(orbit.yaw), cos = Math.cos(orbit.yaw);
    var dx = inp.x * cos + inp.z * sin;
    var dz = -inp.x * sin + inp.z * cos;
    var speed = 11 * speedMult; // Phase 4: bicycle multiplier
    var moved = false;
    if (!movementLocked && !hugState) { // Phase 4: sitting / sky-wheel riding freezes walking; hugs too
      var st = stepMover(player.position.x, player.position.z, dx, dz, speed, dt);
      player.position.x = st.x; player.position.z = st.z;
      moved = st.moved && (dx || dz);
      if (moved) {
        targetYaw = Math.atan2(dx, dz);
        var dy = targetYaw - playerYaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        playerYaw += dy * (1 - Math.exp(-dt * 10));
        player.rotation.y = playerYaw;
      }
    }
    playerMovingState = moved; // Phase 5: expose for network sync
    var gy = walkHeight(player.position.x, player.position.z);
    if (!ridingWheel && gy > -900) player.position.y = lerp(player.position.y, gy, 1 - Math.exp(-dt * 10)); // Phase 4: gondola drives y
    if (ridingBike) updateBikeAnim(playerRig, dt, t, moved, speed); // Phase 4
    else if (sitting) applySitPose(playerRig, dt, -0.55);            // Phase 4
    else updateCharacterAnim(playerRig, dt, t, moved, speed); // Phase 3 rig
  }
  var _camTarget = new THREE.Vector3(), _camWant = new THREE.Vector3();
  var camDistSm = 26; // smoothed camera distance (pulls in inside interiors)
  function updateCamera(dt) {
    var tp = cameraTargetOverride || player.position; // Phase 4: follow gondola while riding
    _camTarget.set(tp.x, tp.y + 2.2, tp.z);
    /* gentle auto-follow: while walking, the camera swings behind the character.
       The camera sits behind a character facing (sin h, cos h) when its yaw
       equals h + PI (camera offset = -(facing) * dist). Targeting playerYaw
       alone leaves the camera perpetually PI behind its goal, which made the
       camera orbit forever and the player walk in circles. */
    if (playerMovingState && !orbit.dragging && camPointers.size === 0 && !ridingWheel && !ridingBike) {
      var dyaw = (playerYaw + Math.PI) - orbit.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      orbit.yaw += dyaw * (1 - Math.exp(-dt * 1.6));
    }
    var pzn = zoneAt(player.position.x, player.position.z); // Phase 2 interiors
    var wantD = pzn ? Math.min(orbit.dist, 6.5) : orbit.dist; // interiors: camera stays inside the room
    camDistSm = lerp(camDistSm, wantD, 1 - Math.exp(-dt * 3));
    var cp = Math.cos(orbit.pitch), sp = Math.sin(orbit.pitch);
    var fx = -Math.sin(orbit.yaw) * cp, fz = -Math.cos(orbit.yaw) * cp;
    _camWant.set(
      _camTarget.x - fx * camDistSm,
      _camTarget.y + sp * camDistSm,
      _camTarget.z - fz * camDistSm
    );
    /* keep camera above terrain (or room floor inside interiors) */
    var minY = pzn ? (pzn.y + 1.2) : Math.max(groundHeight(_camWant.x, _camWant.z) + 2.2, 3.2);
    if (_camWant.y < minY) _camWant.y = minY;
    if (pzn) { // clamp the camera inside the room: interiors fill the screen, no dollhouse view, no wall clipping
      _camWant.x = clamp(_camWant.x, pzn.x0 + 0.9, pzn.x1 - 0.9);
      _camWant.z = clamp(_camWant.z, pzn.z0 + 0.9, pzn.z1 - 0.9);
      _camWant.y = clamp(_camWant.y, pzn.y + 1.1, pzn.y + 3.5);
    }
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
  /* ---------------- weather: rain + snow (settings override) ---------------- */
  function buildWeather() {
    var i, pos, g;
    /* rain: short vertical streaks (LineSegments) */
    var RN = 700;
    pos = new Float32Array(RN * 6);
    var rvel = new Float32Array(RN);
    for (i = 0; i < RN; i++) {
      var rx = (Math.random() - 0.5) * 70, ry = Math.random() * 28, rz = (Math.random() - 0.5) * 70;
      pos[i * 6] = rx; pos[i * 6 + 1] = ry; pos[i * 6 + 2] = rz;
      pos[i * 6 + 3] = rx; pos[i * 6 + 4] = ry - 0.9; pos[i * 6 + 5] = rz;
      rvel[i] = 24 + Math.random() * 10;
    }
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rainLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
      color: 0x9fb8d8, transparent: true, opacity: 0.55
    }));
    rainLines.visible = false; rainLines.frustumCulled = false;
    rainLines.userData = { vel: rvel, n: RN };
    scene.add(rainLines);
    /* snow: soft drifting flakes (Points) */
    var SN = 600;
    pos = new Float32Array(SN * 3);
    var svel = new Float32Array(SN), sph = new Float32Array(SN);
    for (i = 0; i < SN; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 70;
      pos[i * 3 + 1] = Math.random() * 28;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 70;
      svel[i] = 1.6 + Math.random() * 1.8; sph[i] = Math.random() * Math.PI * 2;
    }
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    snowPts = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.32, transparent: true, opacity: 0.9, sizeAttenuation: true
    }));
    snowPts.visible = false; snowPts.frustumCulled = false;
    snowPts.userData = { vel: svel, ph: sph, n: SN };
    scene.add(snowPts);
  }
  function updateWeather(dt, t) {
    var wantDim = weatherMode === 'clear' ? 0 : 1;
    weatherDim = lerp(weatherDim, wantDim, 1 - Math.exp(-dt * 1.2));
    if (weatherDim > 0.02) { // overcast mood: pull the fog in, dim the sun
      scene.fog.near = lerp(130, 70, weatherDim);
      scene.fog.far = lerp(420, 240, weatherDim);
    } else { scene.fog.near = 130; scene.fog.far = 420; }
    var cx = camera.position.x, cz = camera.position.z, i, p, u;
    if (rainLines.visible) {
      p = rainLines.geometry.attributes.position; u = rainLines.userData;
      for (i = 0; i < u.n; i++) {
        var ny = p.getY(i * 2) - u.vel[i] * dt;
        if (ny < 0) {
          ny = 24 + Math.random() * 6;
          var nx = cx + (Math.random() - 0.5) * 70, nz = cz + (Math.random() - 0.5) * 70;
          p.setXYZ(i * 2, nx, ny, nz); p.setXYZ(i * 2 + 1, nx, ny - 0.9, nz);
        } else { p.setY(i * 2, ny); p.setY(i * 2 + 1, ny - 0.9); }
      }
      p.needsUpdate = true;
    }
    if (snowPts.visible) {
      p = snowPts.geometry.attributes.position; u = snowPts.userData;
      for (i = 0; i < u.n; i++) {
        var sy = p.getY(i) - u.vel[i] * dt;
        var sx = p.getX(i) + Math.sin(t * 1.4 + u.ph[i]) * dt * 1.2;
        if (sy < 0) {
          sy = 24 + Math.random() * 6;
          sx = cx + (Math.random() - 0.5) * 70;
          p.setZ(i, cz + (Math.random() - 0.5) * 70);
        }
        p.setY(i, sy); p.setX(i, sx);
      }
      p.needsUpdate = true;
    }
  }
  function setWeather(mode) {
    weatherMode = (mode === 'rain' || mode === 'snow') ? mode : 'clear';
    if (rainLines) rainLines.visible = weatherMode === 'rain';
    if (snowPts) snowPts.visible = weatherMode === 'snow';
  }

  function animate() {
    if (destroyed) return;
    rafId = requestAnimationFrame(animate);
    var dt = Math.min(clock.getDelta(), 0.05);
    var t = clock.elapsedTime;
    waterUniforms.uTime.value = t;
    updatePlayer(dt, t);
    updatePartner(dt, t); // Phase 3: Tara idle / porch / remote
    updateHug(dt); // social: hug sequence overrides both rigs
    updateHearts(dt);
    updateGift(dt, t);
    updatePhase4(dt, t); // Phase 4: sky wheels, boats, campfire warmth
    updateShootingStars(dt); // M8: miss-you shooting stars
    /* Halloween Barn: floating ghosts */
    if (halloweenBarn && halloweenBarn.userData.ghosts) {
      var gt = performance.now() * 0.001;
      halloweenBarn.userData.ghosts.forEach(function (gh) {
        gh.position.y = gh.userData.baseY + Math.sin(gt * 1.5 + gh.userData.phase) * 0.4;
      });
    }
    updateCamera(dt);
    updateDayNight(dt, t);
    updateWeather(dt, t); // settings: rain / snow particles + overcast mood
    updateAmbient(dt, t);
    updatePhase2(dt, t); // Phase 2: smoke, prompts, interior cutaway, TV
    if ((frame++ % 3) === 0) updateLOD();
    renderer.render(scene, camera);
  }

  /* ---------------- wire up & go ---------------- */
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointerdown', onCanvasDown);
  window.addEventListener('pointermove', onCanvasMove);
  window.addEventListener('pointerup', onCanvasUp);
  window.addEventListener('pointercancel', onCanvasUp);
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
  try { renderer.compile(scene, camera); renderer.render(scene, camera); } catch (e) {} // warmup: upload textures, kill pop-in
  /* M6: apply saved outfit color */
  try {
    var savedOutfit = localStorage.getItem('kanavu_outfit');
    if (savedOutfit) {
      var outfitMap = { olive: '#6d7f3c', salmon: '#e89a90', sky: '#7fb3d5', lavender: '#b8a9d9', rose: '#d98880', mint: '#82c99a' };
      var oc = outfitMap[savedOutfit];
      if (oc) {
        var isGirl = myRole === 'girl';
        var dark = shadeHex(oc, -25);
        var tex = isGirl ? cableTex(oc, dark) : knitTex(oc, dark);
        var mat = isGirl ? CHMAT.grlSw : CHMAT.boySw;
        if (mat.map) mat.map.dispose();
        mat.map = tex;
        mat.needsUpdate = true;
      }
    }
  } catch (e) {}
  animate();

  return {
    setTimeOfDay: function (h) { manualHour = (h === null || h === undefined) ? null : ((h % 24) + 24) % 24; },
    setWeather: setWeather, // 'clear' | 'rain' | 'snow'
    getWeather: function () { return weatherMode; },
    sleep: function () { doSleep(); }, // house popup: sleep till morning
    isBeaconLitToday: isBeaconLitToday, // M3: beacon state for Today tasks
    lightBeacon: lightBeacon,
    setOutfitColor: function (hex) { // M6: free outfit customization
      try {
        var playerRig = myRole === 'girl' ? girlRig : boyRig;
        var isGirl = myRole === 'girl';
        // Darken the hex for the rib/shadow color
        var dark = shadeHex(hex, -25);
        var tex = isGirl ? cableTex(hex, dark) : knitTex(hex, dark);
        var mat = isGirl ? CHMAT.grlSw : CHMAT.boySw;
        if (mat.map) mat.map.dispose();
        mat.map = tex;
        mat.needsUpdate = true;
      } catch (e) {}
    },
    shootingStar: shootingStar, // M8: miss-you shooting star
    addDecoration: addDecoration, // island decorations
    clearDecorations: clearDecorations,
    refreshBuildingLabels: function () { // update prompt labels after rename
      try {
        var raw = localStorage.getItem('kanavu-building-names-v1');
        var names = raw ? JSON.parse(raw) : {};
        interactables.forEach(function (it) {
          if (it.buildingType && it.buildingSide) {
            var key = it.buildingSide + '-' + it.buildingType;
            if (names[key] && window.KanavuSocial && window.KanavuSocial.BUILDING_INFO) {
              var info = window.KanavuSocial.BUILDING_INFO[it.buildingType];
              if (info) it.label = info.icon + ' ' + names[key];
            }
          }
        });
      } catch (e) {}
    },
    getPlayerPos: function () { return { x: player.position.x, y: player.position.y, z: player.position.z }; },
    getPartnerPos: function () { return { x: partner.position.x, y: partner.position.y, z: partner.position.z }; },
    getRole: function () { return myRole; },
    getPlayerName: function () { return myName; },
    getPartnerName: function () { return partnerName; },
    playEmote: function (name) { playEmoteOn(playerRig, name); },
    playPartnerEmote: function (name) { playEmoteOn(partnerRig, name); },
    startHug: startHug,
    isHugging: function () { return !!hugState; },
    showGift: showGift,
    spawnHearts: function (n) { spawnHearts(player.position.x, player.position.y + 2.6, player.position.z, n || 6); },
    showPrompt: showPrompt,   // Phase 2 prompt API (also on E key / tap)
    hidePrompt: hidePrompt,
    setPartnerOnline: setPartnerOnline, // Phase 3: Tara follow (true) / porch idle (false)
    setPartnerRemote: setPartnerRemote, // Phase 5: true = network drives partner rig
    setPartnerNet: setPartnerNet,       // Phase 5: feed network transform
    isPartnerRemote: function () { return partnerRemote; },
    getPlayerAnim: function () {        // Phase 5: animation state for sync
      var act = 'idle';
      if (ridingWheel) act = 'wheel';
      else if (ridingBike) act = 'bike';
      else if (sitting) act = 'sit';
      else if (playerMovingState) act = 'walk';
      return {
        moving: playerMovingState,
        sitting: !!sitting,
        yaw: playerYaw,
        activity: act
      };
    },
    getPlayerYaw: function () { return playerYaw; },
    phase3: {                 // Phase 3 introspection / test hooks
      partnerPos: function () { return { x: partner.position.x, y: partner.position.y, z: partner.position.z }; },
      setPartner: function (x, z) { partner.position.set(x, partner.position.y, z); }, // Phase 4 test hook
      playerRig: function () { return playerRig; },
      partnerRig: function () { return partnerRig; },
      isPartnerOnline: function () { return partnerOnline; },
      porchB: function () { return { x: porchB.x, z: porchB.z }; }
    },
    phase2: {                 // Phase 2 introspection / test hooks
      buildings: BUILDINGS,
      interactables: interactables,
      colliders: colliders,
      interiorZones: interiorZones,
      windowMats: windowMats,
      promptEl: function () { return promptEl; },
      promptLabel: function () { return promptShownLabel; },
      getHour: function () { return manualHour; },
      setPlayer: function (x, z) { player.position.set(x, player.position.y, z); },
      setOrbitYaw: function (y) { orbit.yaw = y; }
    },
    phase4: {                 // Phase 4 introspection / test hooks
      wheels: wheels,
      bikes: bikes,
      boats: boats,
      docks: [DOCK_A, DOCK_B],
      campfire: function () { return { x: campfirePos.x, z: campfirePos.z }; },
      isRiding: function () { return !!(ridingWheel || ridingBike); },
      isSitting: function () { return !!sitting; },
      isPartnerSitting: function () { return !!(partnerSit && partnerSit.seated); },
      speedMult: function () { return speedMult; },
      camOverride: function () { return !!cameraTargetOverride; },
      boardWheel: function (i) { boardWheel(wheels[i || 0]); },
      exitWheel: function () { if (ridingWheel) exitWheel(ridingWheel); },
      rideBike: function (i) { rideBike(bikes[i || 0]); },
      dismount: function () { dismountBike(); },
      sit: function () { doCampSit(); },
      stand: function () { doCampStand(); }
    },
    version: 'phase4-1.0',
    destroy: function () {
      destroyed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onCanvasDown);
      window.removeEventListener('pointermove', onCanvasMove);
      window.removeEventListener('pointerup', onCanvasUp);
      window.removeEventListener('pointercancel', onCanvasUp);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
      if (joystickEls && joystickEls.base.parentNode) joystickEls.base.parentNode.removeChild(joystickEls.base);
      if (promptEl && promptEl.parentNode) promptEl.parentNode.removeChild(promptEl); // Phase 2
      if (fadeEl && fadeEl.parentNode) fadeEl.parentNode.removeChild(fadeEl);         // Phase 2
      renderer.dispose();
    }
  };
}

return { init: init };

})();

if (typeof window !== 'undefined') window.KanavuWorld = KanavuWorld;
if (typeof module !== 'undefined' && module.exports) module.exports = KanavuWorld;

})();
