/* ============================================================
   Kanavu — cinematic visual premium pass (Stream 2)
   Lighting / sky / clouds / water / materials / particles /
   atmosphere / quality tiers.

   Hook module — same proven pattern as kanavu-assets.js:
   waits for window.__kvWorld {scene, camera, renderer, groundY},
   then applies a golden-hour cinematic grade on top of the live
   world. Additive only:
     - never edits game state or kanavu-game.js
     - never fights the weather system (fog stays owned by the
       game; we only grade its color via a bias inside its lerp)
     - never touches kanavu-assets.js placements (re-scans catch
       its lazy-loaded GLBs and only fix cheap flat materials)
     - generic: no references to any asset-pack model names,
       tuned for soft dreamy low-poly (Quaternius/Kenney look)
     - graceful silent no-op when THREE / the hook is missing

   Quality contract (separate kanavu-quality.js stream):
     window dispatches 'kv-quality-change' CustomEvent with
     {tier:'low'|'medium'|'high'|'ultra'}. We listen and scale
     shadows / particles / clouds / vignette / glitter / haze.
     Default tier: 'medium' until an event fires.

   Perf: zero post-processing, one shadow map max, particles are
   billboard Points (single draw call each), no per-frame
   allocations, CSS vignette. iPhone/iPad safe.
   ============================================================ */
!function(){
"use strict";

/* ---------------- tuning knobs ----------------
   All visual decisions live here. Tweak, reload, screenshot. */
var CFG = {
  // golden-hour key light (matches the game's warm key)
  sunColor: 0xFFD9A6, sunIntensity: 1.32, sunPos: [-46, 30, 24],
  // hemisphere fill: warm rose sky bounce, green ground bounce
  hemiSky: 0xFFD9C2, hemiGround: 0x3E5A44, hemiIntensity: 0.55,
  // flat ambient: lowered for contrast (game default was 0.55)
  ambColor: 0x8F9BFF, ambIntensity: 0.32,
  // cool opposite fill for cinematic warm/cool contrast
  fillColor: 0x9BB8FF, fillIntensity: 0.30,
  exposure: 1.15,                       // game already runs ACESFilmic
  // camera far extension: the game sets far=130, which would clip
  // our sky dome (r=370) and sun glow. 1200 is depth-safe here.
  cameraFar: 1200,
  // sky dome gradient (zenith -> mid -> horizon -> below)
  skyTop: 0x7FB6E6, skyMid: 0xC4A6D8, skyHorizon: 0xFFD9AE, skyLow: 0x46586E,
  sunGlowColor: 0xFFE9C0, sunGlowOpacity: 0.50, sunGlowSize: 95,
  // clouds
  cloudTint: 0xFFF1E4, cloudMax: 12,
  // ocean
  waterColor: 0x2A5A86, waterRoughness: 0.30, waterMetalness: 0.08,
  glitterOpacity: 0.12,
  // css vignette strength (medium tier)
  vignette: 0.30,
  // tight player-following shadow frustum (game default: static +-65)
  shadowFollow: true, shadowHalf: 30,
  // particles (max counts = ultra tier; lower tiers use fewer)
  fireflyMax: 48, dustMax: 64, leafMax: 32,
  fireflyColor: 0xFFE28A, fireflySize: 0.9,
  dustColor: 0xFFF6E3, dustSize: 0.55,
  leafSize: 0.7,
  // soft blob shadow (low-tier fallback only): radial gradient,
  // never a hard-edged circle
  blobOpacity: 0.42, blobSize: 2.4
};

/* ---------------- quality tiers ----------------
   low = minimal · medium = balanced (default) · high = rich ·
   ultra = max. Adjusted live by applyQuality(). */
var TIERS = {
  low:    { shadow: 0,    particles: 0.00, clouds: 4,  vignette: 0,
            glitter: false, haze: 0.30, blobs: true  },
  medium: { shadow: 1024, particles: 0.50, clouds: 8,  vignette: CFG.vignette,
            glitter: true,  haze: 0.55, blobs: false },
  high:   { shadow: 1024, particles: 0.80, clouds: 10, vignette: 0.34,
            glitter: true,  haze: 0.60, blobs: false },
  ultra:  { shadow: 2048, particles: 1.00, clouds: 12, vignette: 0.38,
            glitter: true,  haze: 0.65, blobs: false }
};

/* -------- quality event contract --------
   Registered at module scope so an event that fires before the
   world hook is ready is still captured (pendingTier). */
var pendingTier = null, currentTier = 'medium', visualsReady = false;
var applyQualityRef = null;   // set to init's applyQuality once booted
try{
  window.addEventListener('kv-quality-change', function(e){
    try{
      var t = e && e.detail && e.detail.tier;
      if(typeof t === 'string' && TIERS[t]){
        pendingTier = t;
        if(visualsReady && applyQualityRef) applyQualityRef(t);
      }
    }catch(_){}
  });
}catch(e){}

function boot(){
  var W = window.__kvWorld;
  if(!W || !W.scene || !W.camera || !W.renderer || !window.THREE) return false;
  try{ init(W); }catch(e){ /* silent: never break the game */ }
  return true;
}
if(!boot()){
  var tries = 0;
  var timer = setInterval(function(){
    if(boot() || ++tries > 120){ clearInterval(timer); }
  }, 500);
}

function init(W){
var T = THREE;

/* tracked premium objects */
var skyDome = null, sunGlow = null, glitter = null, clouds = [];
var waterDone = false, hazeNow = TIERS.medium.haze;
var shadowLight = null, playerRef = null, followPos = null, sunDirVec = null;
var vignetteDiv = null;

/* particle systems (built once at max counts, draw-range scaled) */
var fireflies = null, dust = null, leaves = null;
/* blob shadows (one shared material, per-rig planes) */
var blobMat = null, blobTexShared = null;

/* reusable temps — zero per-frame allocation */
var _v = new T.Vector3(), _c = new T.Color(), _haze = new T.Color(0x8EA6D4);

/* ============================================================
   0. CAMERA FAR FIX — the game sets camera.far = 130, which
   would clip the sky dome, sun glow and high clouds entirely.
   1200 is depth-precision safe at this world scale.
   ============================================================ */
function fixCameraFar(){
  try{
    if(W.camera && W.camera.far < CFG.cameraFar){
      W.camera.far = CFG.cameraFar;
      W.camera.updateProjectionMatrix();
    }
  }catch(e){}
}

/* ============================================================
   1. CINEMATIC LIGHTING — golden-hour retune of the game's
   existing rig (key + hemi + ambient + cool fill). The key
   light's position/target are owned by the shadow follow;
   tuneLights only grades color/intensity. Idempotent.
   ============================================================ */
function tuneLights(){
  var key = null, fill = null, hemi = null, amb = null;
  try{
    W.scene.traverse(function(o){
      if(o.isDirectionalLight){ if(o.castShadow) key = o; else fill = o; }
      else if(o.isHemisphereLight && !hemi) hemi = o;
      else if(o.isAmbientLight && !amb) amb = o;
    });
    if(key){
      key.color.setHex(CFG.sunColor);
      key.intensity = CFG.sunIntensity;
      if(!sunDirVec)
        sunDirVec = new T.Vector3(CFG.sunPos[0], CFG.sunPos[1], CFG.sunPos[2]).normalize();
    }
    if(hemi){
      hemi.color.setHex(CFG.hemiSky);
      hemi.groundColor.setHex(CFG.hemiGround);
      hemi.intensity = CFG.hemiIntensity;
    }
    if(amb){ amb.color.setHex(CFG.ambColor); amb.intensity = CFG.ambIntensity; }
    if(fill){ fill.color.setHex(CFG.fillColor); fill.intensity = CFG.fillIntensity; }
    if(W.renderer && 'toneMappingExposure' in W.renderer)
      W.renderer.toneMappingExposure = CFG.exposure;
  }catch(e){}
}

/* ---------- player + shadow-light lookup (same rig marker
   kanavu-assets.js uses) ---------- */
function findPlayer(){
  if(playerRef && playerRef.parent) return playerRef;
  playerRef = null;
  try{
    W.scene.traverse(function(o){
      if(!playerRef && o.userData && o.userData.rig) playerRef = o;
    });
  }catch(e){}
  return playerRef;
}
function findAllRigs(out){
  out = out || [];
  try{
    W.scene.traverse(function(o){
      if(o.userData && o.userData.rig) out.push(o);
    });
  }catch(e){}
  return out;
}
function findShadowLight(){
  if(shadowLight && shadowLight.parent) return shadowLight;
  shadowLight = null;
  try{
    W.scene.traverse(function(o){
      if(!shadowLight && o.isDirectionalLight && o.castShadow) shadowLight = o;
    });
  }catch(e){}
  return shadowLight;
}

/* ============================================================
   1b. SHADOW FOLLOW — tight frustum tracking the player.
   Game default: static +-65 box on a 1024 map (~8 world units
   per texel: chunky). We shrink to +-CFG.shadowHalf around a
   smoothed follow point so the character's shadow is crisp yet
   soft (PCFSoft stays on), grounding them Zelda-style. Same
   single shadow map => no extra GPU cost; the smaller frustum
   culls more casters. Skipped on the low tier (shadows off;
   blob shadows take over).
   ============================================================ */
function tuneShadow(dt){
  if(!CFG.shadowFollow) return;
  var key = findShadowLight();
  if(!key || !key.castShadow || !sunDirVec) return;
  try{
    var half = CFG.shadowHalf;
    var cam = key.shadow.camera;
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.near = 10; cam.far = 170;
    if(!cam._kvProj){ cam.updateProjectionMatrix(); cam._kvProj = true; }
    var pl = findPlayer();
    if(!pl) return;
    if(!followPos) followPos = new T.Vector3(pl.position.x, pl.position.y, pl.position.z);
    var k = 1 - Math.exp(-8 * Math.min(dt, 0.05));
    followPos.x += (pl.position.x - followPos.x) * k;
    followPos.y += (pl.position.y - followPos.y) * k;
    followPos.z += (pl.position.z - followPos.z) * k;
    key.position.set(
      followPos.x + sunDirVec.x * 70,
      followPos.y + sunDirVec.y * 70,
      followPos.z + sunDirVec.z * 70
    );
    if(!key.target.parent) W.scene.add(key.target);
    key.target.position.copy(followPos);
    key.target.updateMatrixWorld();
  }catch(e){}
}

/* belt-and-braces: character rigs must cast (the game marks
   opaque meshes at build, but rigs can be rebuilt later) */
function assertPlayerShadows(){
  try{
    var rigs = findAllRigs();
    for(var i = 0; i < rigs.length; i++){
      var pl = rigs[i];
      if(pl.userData._kvSh) continue;
      pl.traverse(function(o){
        if(o.isMesh && o.material && !o.material.transparent) o.castShadow = true;
      });
      pl.userData._kvSh = 1;
    }
  }catch(e){}
}

/* ============================================================
   1c. HAZE GRADE — bias the game's fog color toward a soft
   pastel blue, inside its own per-frame lerp. Weather presets
   (clear/rain/snow colors + densities) keep driving; we only
   tint the destination, so distant terrain/water melts into a
   dreamy blue haze instead of murky slate. Strength follows
   the quality tier (hazeNow). Idempotent.
   ============================================================ */
function biasFogColor(){
  try{
    var fog = W.scene.fog;
    if(!fog || !fog.color || fog.color._kvBiased) return;
    var protoLerp = T.Color.prototype.lerp;
    fog.color.lerp = function(target, alpha){
      _c.copy(target).lerp(_haze, hazeNow);
      return protoLerp.call(this, _c, alpha);
    };
    fog.color._kvBiased = true;
  }catch(e){}
}

/* ============================================================
   2. SKY — gradient dome + soft sun glow. The renderer clears
   transparent over the page's night CSS; the dome gives the
   world a real premium golden-hour sky. (Needs the camera far
   fix above — game default far=130 would clip it.)
   ============================================================ */
function buildSky(){
  if(skyDome) return;
  try{
    var geo = new T.SphereGeometry(370, 24, 16);
    var mat = new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new T.Color(CFG.skyTop) },
        mid: { value: new T.Color(CFG.skyMid) },
        warmHor: { value: new T.Color(CFG.skyHorizon) },
        hazeHor: { value: new T.Color(0xA9BBDD) },
        low: { value: new T.Color(CFG.skyLow) },
        sunAz: { value: Math.atan2(CFG.sunPos[0], CFG.sunPos[2]) }
      },
      vertexShader: [
        'varying vec3 vP;',
        'void main(){',
        '  vP = position;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vP;',
        'uniform vec3 top; uniform vec3 mid;',
        'uniform vec3 warmHor; uniform vec3 hazeHor; uniform vec3 low;',
        'uniform float sunAz;',
        'void main(){',
        '  vec3 d = normalize(vP);',
        '  float h = d.y;',
        // golden near the sun azimuth, soft haze blue opposite —
        // distant fogged terrain melts into hazeHor seamlessly
        '  float az = atan(d.x, d.z);',
        '  float sunAmt = pow(max(cos(az - sunAz), 0.0), 2.0);',
        '  vec3 hor = mix(hazeHor, warmHor, sunAmt);',
        '  vec3 c;',
        '  if(h > 0.0){',
        '    vec3 lowMix = mix(hor, mid, smoothstep(0.0, 0.16, h));',
        '    c = mix(lowMix, top, smoothstep(0.14, 0.62, h));',
        '  } else {',
        '    c = mix(hor, low, smoothstep(0.0, -0.22, h));',
        '  }',
        '  gl_FragColor = vec4(c, 1.0);',
        '}'
      ].join('\n')
    });
    skyDome = new T.Mesh(geo, mat);
    skyDome.renderOrder = -10;
    skyDome.frustumCulled = false;
    skyDome.castShadow = false;
    skyDome.receiveShadow = false;
    skyDome.raycast = function(){};
    skyDome.userData._kvSky = true;
    W.scene.add(skyDome);
  }catch(e){ skyDome = null; }
}

function radialTexture(size, stops){
  var cv = document.createElement('canvas'); cv.width = cv.height = size;
  var x = cv.getContext('2d');
  var g = x.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  for(var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  return new T.CanvasTexture(cv);
}
var _glowTex = null, _dotTex = null;

function buildSunGlow(){
  if(sunGlow) return;
  try{
    if(!_glowTex) _glowTex = radialTexture(128, [
      [0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.55)'],
      [0.6, 'rgba(255,255,255,0.16)'], [1, 'rgba(255,255,255,0)']
    ]);
    var m = new T.SpriteMaterial({
      map: _glowTex, color: CFG.sunGlowColor, transparent: true,
      opacity: CFG.sunGlowOpacity, blending: T.AdditiveBlending,
      depthWrite: false, fog: false
    });
    sunGlow = new T.Sprite(m);
    var d = new T.Vector3(CFG.sunPos[0], CFG.sunPos[1], CFG.sunPos[2]).normalize();
    sunGlow.position.copy(d.multiplyScalar(330));
    sunGlow.scale.set(CFG.sunGlowSize, CFG.sunGlowSize, 1);
    sunGlow.raycast = function(){};
    sunGlow.userData._kvSky = true;
    W.scene.add(sunGlow);
  }catch(e){ sunGlow = null; }
}

/* ============================================================
   3. CLOUDS — soft volumetric-looking billboard clusters.
   Built once at CFG.cloudMax; the quality tier toggles how
   many are visible. Drift + bob in our own loop (wrap radius
   195, same as the game's convention).
   ============================================================ */
function cloudTexture(){
  var cv = document.createElement('canvas'); cv.width = cv.height = 128;
  var x = cv.getContext('2d');
  var blobs = [
    [64,74,44],[40,80,30],[90,80,32],[64,56,34],
    [28,66,22],[100,66,24],[52,90,28],[78,90,26],[64,42,24]
  ];
  for(var i = 0; i < blobs.length; i++){
    var b = blobs[i];
    var g = x.createRadialGradient(b[0], b[1], 0, b[0], b[1], b[2]);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.38)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(b[0], b[1], b[2], 0, 6.3); x.fill();
  }
  return new T.CanvasTexture(cv);
}

function sRnd(seed){ var x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

function buildClouds(){
  if(clouds.length) return;
  try{
    var tex = cloudTexture();
    for(var i = 0; i < CFG.cloudMax; i++){
      var grp = new T.Group();
      var puffs = 6 + Math.floor(sRnd(i * 3.7) * 3);
      var mat = new T.SpriteMaterial({
        map: tex, color: CFG.cloudTint, transparent: true,
        opacity: 0.82 + sRnd(i * 9.1) * 0.14,
        depthWrite: false, fog: false
      });
      for(var p = 0; p < puffs; p++){
        var sp = new T.Sprite(mat);
        var sc = 13 + sRnd(i * 31 + p * 7.3) * 13;
        sp.scale.set(sc, sc * 0.62, 1);
        sp.position.set((sRnd(i * 13 + p * 3.1) - 0.5) * 26,
                        (sRnd(i * 17 + p * 5.7) - 0.5) * 7,
                        (sRnd(i * 19 + p * 9.4) - 0.5) * 10);
        sp.raycast = function(){};
        grp.add(sp);
      }
      var a = sRnd(i * 5.3) * Math.PI * 2;
      var r = 110 + sRnd(i * 7.9) * 65;
      var by = 36 + sRnd(i * 11.7) * 24;
      grp.position.set(Math.cos(a) * r, by, Math.sin(a) * r);
      grp.userData._kvSky = true;
      W.scene.add(grp);
      clouds.push({
        grp: grp,
        vx: 0.5 + sRnd(i * 23.3) * 0.9,
        vz: (sRnd(i * 29.1) - 0.5) * 0.5,
        by: by, ph: sRnd(i * 37.7) * Math.PI * 2
      });
    }
  }catch(e){ clouds = []; }
}

/* ============================================================
   4. WATER — premium ocean: PBR retune of the game's big disc
   (CircleGeometry r>=200) + a soft sun-glitter strip that
   breathes. We never rebuild the water, only upgrade it.
   Glitter visibility follows the quality tier.
   ============================================================ */
function upgradeWater(){
  if(waterDone) return;
  try{
    W.scene.traverse(function(o){
      if(!o.isMesh || !o.geometry || o.userData._kvWater) return;
      var p = o.geometry.parameters;
      if(o.geometry.type === 'CircleGeometry' && p && p.radius >= 200){
        o.userData._kvWater = true;
        waterDone = true;
        o.material = new T.MeshStandardMaterial({
          color: CFG.waterColor,
          roughness: CFG.waterRoughness,
          metalness: CFG.waterMetalness,
          transparent: true, opacity: 0.96,
          flatShading: true
        });
      }
    });
  }catch(e){}
}

function buildGlitter(){
  if(glitter) return;
  try{
    var cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    var x = cv.getContext('2d');
    var g = x.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, 'rgba(255,236,200,0)');
    g.addColorStop(0.35, 'rgba(255,236,200,0.55)');
    g.addColorStop(0.65, 'rgba(255,236,200,0.55)');
    g.addColorStop(1, 'rgba(255,236,200,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 64);
    x.globalCompositeOperation = 'destination-in';
    var v = x.createLinearGradient(0, 0, 0, 64);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(0.5, 'rgba(0,0,0,1)');
    v.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = v; x.fillRect(0, 0, 256, 64);
    var tex = new T.CanvasTexture(cv);
    var mat = new T.MeshBasicMaterial({
      map: tex, transparent: true, opacity: CFG.glitterOpacity,
      blending: T.AdditiveBlending, depthWrite: false, fog: false
    });
    var holder = new T.Group();
    var m = new T.Mesh(new T.PlaneGeometry(150, 34), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.z = 95;               // out toward the sun azimuth
    m.raycast = function(){};
    holder.add(m);
    var az = Math.atan2(CFG.sunPos[0], CFG.sunPos[2]);
    holder.rotation.y = az;
    holder.position.y = -0.30;       // just above the ocean disc (y=-0.4)
    holder.userData._kvSky = true;
    W.scene.add(holder);
    glitter = holder;
  }catch(e){ glitter = null; }
}

/* ============================================================
   5. PARTICLES — billboard sprites only (Points = 1 draw call
   each). Built once at max counts; the quality tier sets the
   draw range. All arrays preallocated; per-frame updates reuse
   them — zero allocation in the loop.
     fireflies: warm golden motes drifting over meadow/woods
     dust:      soft pale motes rising near the plaza
     leaves:    amber leaves tumbling near the autumn woods
   ============================================================ */
function groundAt(x, z){
  try{ var y = W.groundY(x, z); return (typeof y === 'number') ? y : 0; }
  catch(e){ return 0; }
}

function makePoints(n, opt){
  if(!_dotTex) _dotTex = radialTexture(64, [
    [0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.6)'],
    [1, 'rgba(255,255,255,0)']
  ]);
  var geo = new T.BufferGeometry();
  var pos = new Float32Array(n * 3);
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  var col = null;
  if(opt.vertexColors){
    col = new Float32Array(n * 3);
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
  }
  var mat = new T.PointsMaterial({
    size: opt.size, map: _dotTex, transparent: true,
    opacity: opt.opacity, depthWrite: false,
    blending: opt.blending || T.NormalBlending,
    vertexColors: !!opt.vertexColors,
    sizeAttenuation: true, fog: opt.fog !== false
  });
  if(!opt.vertexColors && opt.color !== undefined) mat.color.setHex(opt.color);
  var pts = new T.Points(geo, mat);
  pts.frustumCulled = false;
  pts.castShadow = false; pts.receiveShadow = false;
  pts.raycast = function(){};
  pts.userData._kvFx = true;
  W.scene.add(pts);
  return { pts: pts, geo: geo, mat: mat, pos: pos, col: col, n: n, active: 0,
           bx: new Float32Array(n), by: new Float32Array(n),
           bz: new Float32Array(n), ph: new Float32Array(n) };
}

function buildParticles(){
  if(fireflies) return;
  try{
    var i, x, z;
    // --- fireflies: meadow + woods ---
    fireflies = makePoints(CFG.fireflyMax, {
      color: CFG.fireflyColor, size: CFG.fireflySize,
      blending: T.AdditiveBlending, opacity: 0.7, fog: false
    });
    for(i = 0; i < fireflies.n; i++){
      x = -32 + sRnd(i * 3.1) * 58; z = -36 + sRnd(i * 7.7) * 56;
      fireflies.bx[i] = x; fireflies.bz[i] = z;
      fireflies.by[i] = groundAt(x, z) + 0.6 + sRnd(i * 11.3) * 2.2;
      fireflies.ph[i] = sRnd(i * 17.9) * Math.PI * 2;
    }
    // --- dust: plaza / village air ---
    dust = makePoints(CFG.dustMax, {
      color: CFG.dustColor, size: CFG.dustSize, opacity: 0.32
    });
    for(i = 0; i < dust.n; i++){
      x = -20 + sRnd(i * 5.7) * 44; z = -16 + sRnd(i * 9.2) * 36;
      dust.bx[i] = x; dust.bz[i] = z;
      dust.by[i] = groundAt(x, z) + 0.4 + sRnd(i * 13.7) * 4.5;
      dust.ph[i] = sRnd(i * 19.3) * Math.PI * 2;
    }
    // --- leaves: autumn woods ---
    leaves = makePoints(CFG.leafMax, {
      size: CFG.leafSize, opacity: 0.9, vertexColors: true
    });
    var leafCols = [0xE8A34C, 0xD97B3F, 0xC95B4A, 0xF2C14E];
    for(i = 0; i < leaves.n; i++){
      x = 10 + sRnd(i * 7.3) * 22; z = -40 + sRnd(i * 11.1) * 24;
      leaves.bx[i] = x; leaves.bz[i] = z;
      leaves.by[i] = groundAt(x, z) + sRnd(i * 15.7) * 6;
      leaves.ph[i] = sRnd(i * 21.3) * Math.PI * 2;
      _c.setHex(leafCols[i % leafCols.length]);
      leaves.col[i * 3] = _c.r; leaves.col[i * 3 + 1] = _c.g; leaves.col[i * 3 + 2] = _c.b;
    }
    leaves.geo.attributes.color.needsUpdate = true;
  }catch(e){ fireflies = dust = leaves = null; }
}

function updateParticles(t){
  var i, n, s;
  if(fireflies && fireflies.active > 0){
    s = fireflies; n = s.active;
    for(i = 0; i < n; i++){
      var p = s.ph[i];
      s.pos[i * 3]     = s.bx[i] + 1.4 * Math.sin(t * 0.45 + p);
      s.pos[i * 3 + 1] = s.by[i] + 0.55 * Math.sin(t * 0.7 + p * 1.7);
      s.pos[i * 3 + 2] = s.bz[i] + 1.4 * Math.cos(t * 0.38 + p);
    }
    s.geo.attributes.position.needsUpdate = true;
    s.mat.opacity = 0.5 + 0.25 * Math.sin(t * 1.6);   // gentle twinkle
  }
  if(dust && dust.active > 0){
    s = dust; n = s.active;
    for(i = 0; i < n; i++){
      var rise = (t * 0.35 + s.ph[i]) % 5;
      s.pos[i * 3]     = s.bx[i] + 0.8 * Math.sin(t * 0.3 + s.ph[i]);
      s.pos[i * 3 + 1] = s.by[i] + rise - 2.5;
      s.pos[i * 3 + 2] = s.bz[i] + 0.8 * Math.cos(t * 0.24 + s.ph[i]);
    }
    s.geo.attributes.position.needsUpdate = true;
  }
  if(leaves && leaves.active > 0){
    s = leaves; n = s.active;
    for(i = 0; i < n; i++){
      var fall = (t * 0.55 + s.ph[i] * 2.2) % 6.5;
      s.pos[i * 3]     = s.bx[i] + 1.1 * Math.sin(t * 1.1 + s.ph[i]);
      s.pos[i * 3 + 1] = s.by[i] + 6 - fall;
      s.pos[i * 3 + 2] = s.bz[i] + 1.1 * Math.cos(t * 0.9 + s.ph[i]);
    }
    s.geo.attributes.position.needsUpdate = true;
  }
}

/* quality-tier draw ranges (fraction of max counts) */
function setParticleFraction(f){
  var sys = [fireflies, dust, leaves];
  var maxs = [CFG.fireflyMax, CFG.dustMax, CFG.leafMax];
  for(var k = 0; k < sys.length; k++){
    var s = sys[k];
    if(!s) continue;
    s.active = Math.floor(maxs[k] * f);
    s.geo.setDrawRange(0, s.active);
    s.pts.visible = s.active > 0;
  }
}

/* ============================================================
   6. SOFT BLOB SHADOWS — low-tier fallback when the real
   shadow map is off. One shared radial-gradient texture, one
   flat plane per character rig: soft ambient-occlusion grounding,
   never a hard-edged circle.
   ============================================================ */
function blobTexture(){
  return radialTexture(128, [
    [0, 'rgba(20,12,26,0.62)'], [0.55, 'rgba(20,12,26,0.28)'],
    [1, 'rgba(20,12,26,0)']
  ]);
}
function attachBlobs(){
  try{
    if(!blobTexShared) blobTexShared = blobTexture();
    if(!blobMat) blobMat = new T.MeshBasicMaterial({
      map: blobTexShared, transparent: true, opacity: CFG.blobOpacity,
      depthWrite: false
    });
    var rigs = findAllRigs();
    for(var i = 0; i < rigs.length; i++){
      var rig = rigs[i];
      if(rig.userData._kvBlob) continue;
      var m = new T.Mesh(new T.PlaneGeometry(CFG.blobSize, CFG.blobSize), blobMat);
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.06;
      m.renderOrder = 1;
      m.castShadow = false; m.receiveShadow = false;
      m.raycast = function(){};
      m.userData._kvBlob = true;
      rig.add(m);
      rig.userData._kvBlob = m;
    }
  }catch(e){}
}
function setBlobs(on){
  try{
    var rigs = findAllRigs();
    for(var i = 0; i < rigs.length; i++){
      var b = rigs[i].userData._kvBlob;
      if(b && b.isMesh) b.visible = !!on;
    }
  }catch(e){}
}

/* ============================================================
   7. MATERIAL UPGRADE — fix cheap flat surfaces only.
   Converts opaque pure-white / pure-black MeshBasicMaterial
   meshes (unlit, flat, cheap-looking) to soft PBR equivalents.
   Skips: sprites, transparent glows, fog:false skybox-style
   materials, and anything already processed. GLB assets use
   Standard materials and pass through untouched.
   ============================================================ */
function upgradeMaterials(){
  try{
    W.scene.traverse(function(o){
      if(!o.isMesh || !o.material || o.userData._kvMat) return;
      var m = o.material;
      if(!m.isMeshBasicMaterial) return;
      if(m.transparent || m.fog === false) return;   // intentional glows / sky
      if(!m.color || !m.color.getHex) return;
      var hex = m.color.getHex();
      if(hex === 0xffffff){
        o.material = new T.MeshStandardMaterial({ color: 0xF3EDE2, roughness: 0.85, metalness: 0 });
        o.userData._kvMat = 1;
      }else if(hex === 0x000000){
        o.material = new T.MeshStandardMaterial({ color: 0x23232E, roughness: 0.9, metalness: 0 });
        o.userData._kvMat = 1;
      }
    });
  }catch(e){}
}

/* ============================================================
   8. POST FEEL — subtle CSS vignette (no GPU post-processing).
   Strength follows the quality tier (0 = hidden).
   ============================================================ */
function buildVignette(){
  try{
    if(document.getElementById('kv-vignette')) return;
    var d = document.createElement('div');
    d.id = 'kv-vignette';
    d.style.cssText =
      'position:fixed;inset:0;z-index:2;pointer-events:none;';
    document.body.appendChild(d);
    vignetteDiv = d;
  }catch(e){}
}
function setVignette(strength){
  try{
    if(!vignetteDiv) buildVignette();
    if(!vignetteDiv) return;
    if(strength <= 0){ vignetteDiv.style.display = 'none'; return; }
    vignetteDiv.style.display = 'block';
    vignetteDiv.style.background =
      'radial-gradient(ellipse at 50% 42%, rgba(0,0,0,0) 55%,' +
      ' rgba(26,10,30,' + strength + ') 100%)';
  }catch(e){}
}

/* ---------------- safety: our sky/fx objects must never cast
   shadows (the game re-marks castShadow when deco is placed) --- */
function assertNoShadow(){
  try{
    if(skyDome){ skyDome.castShadow = false; skyDome.receiveShadow = false; }
    if(sunGlow) sunGlow.castShadow = false;
    if(glitter) glitter.traverse(function(o){ o.castShadow = false; });
    for(var i = 0; i < clouds.length; i++)
      clouds[i].grp.traverse(function(o){ o.castShadow = false; });
    var sys = [fireflies, dust, leaves];
    for(var k = 0; k < sys.length; k++)
      if(sys[k]) sys[k].pts.castShadow = false;
  }catch(e){}
}

/* ============================================================
   9. QUALITY — applyQuality(tier). Called by the
   kv-quality-change listener; defaults to 'medium'.
     shadow:    0 = real shadows off (+blob fallback on),
                else the shadow map size (1024/2048)
     particles: fraction of max firefly/dust/leaf counts
     clouds:    visible cloud count
     vignette:  CSS vignette strength (0 = hidden)
     glitter:   sun-glitter strip visible
     haze:      fog haze-bias strength
     blobs:     soft blob shadows under characters
   Idempotent; safe to call before/after boot completes.
   ============================================================ */
function applyQuality(tier){
  if(!TIERS[tier]) tier = 'medium';
  currentTier = tier;
  var q = TIERS[tier];
  try{
    var key = findShadowLight();
    if(key){
      if(q.shadow === 0){
        key.castShadow = false;                 // shadow pass skipped: cheap
      }else{
        key.castShadow = true;
        if(key.shadow.mapSize.x !== q.shadow){
          key.shadow.mapSize.set(q.shadow, q.shadow);
          if(key.shadow.map){ key.shadow.map.dispose(); key.shadow.map = null; }
        }
      }
    }
    setBlobs(q.blobs);
    setParticleFraction(q.particles);
    for(var i = 0; i < clouds.length; i++)
      clouds[i].grp.visible = i < q.clouds;
    setVignette(q.vignette);
    if(glitter) glitter.visible = q.glitter;
    hazeNow = q.haze;
  }catch(e){}
}

/* ---------------- per-frame: shadow follow, cloud drift,
   glitter breath, particles. Zero allocation in the loop. --- */
var clock = null;
function startLoop(){
  if(clock) return;
  try{
    clock = new T.Clock();
    (function tick(){
      requestAnimationFrame(tick);
      if(document.hidden || !clock) return;
      var dt = Math.min(clock.getDelta(), 0.05);
      var t = clock.elapsedTime;
      tuneShadow(dt);
      for(var i = 0; i < clouds.length; i++){
        var c = clouds[i], g = c.grp;
        if(!g.visible) continue;
        g.position.x += c.vx * dt;
        g.position.z += c.vz * dt;
        g.position.y = c.by + 1.6 * Math.sin(0.18 * t + c.ph);
        if(Math.hypot(g.position.x, g.position.z) > 195){
          var a = Math.atan2(g.position.z, g.position.x) + Math.PI;
          g.position.x = Math.cos(a) * 170;
          g.position.z = Math.sin(a) * 170;
        }
      }
      if(glitter && glitter.visible && glitter.children[0])
        glitter.children[0].material.opacity =
          CFG.glitterOpacity * (0.72 + 0.28 * Math.sin(t * 0.35));
      updateParticles(t);
    })();
  }catch(e){}
}

/* ---------------- boot sequence ---------------- */
fixCameraFar();
tuneLights();
biasFogColor();
buildSky();
buildSunGlow();
buildClouds();
upgradeWater();
buildGlitter();
buildParticles();
attachBlobs();
upgradeMaterials();
buildVignette();
assertNoShadow();
assertPlayerShadows();
startLoop();
applyQualityRef = applyQuality;
applyQuality(pendingTier || 'medium');   // contract default: medium
visualsReady = true;

/* Re-scan: catch lazy GLBs from kanavu-assets.js (player walks
   near an area), new player rigs (blob attach), and re-assert
   lighting/shadow safety. Backs off after ~60s; everything is
   idempotent and never overrides the active quality tier. */
var scans = 0;
var rescanTimer = setInterval(function(){
  try{
    tuneLights();
    biasFogColor();
    upgradeWater();
    upgradeMaterials();
    attachBlobs();
    setBlobs(TIERS[currentTier].blobs);
    assertNoShadow();
    assertPlayerShadows();
  }catch(e){}
  if(++scans > 24){ clearInterval(rescanTimer); }
}, 2500);

/* diagnostics (parallel to window.__kanavuAssets) */
window.__kanavuVisuals = {
  version: '20251009-stream2',
  cfg: CFG, tiers: TIERS,
  setQuality: applyQuality,
  tier: function(){ return currentTier; },
  stats: function(){
    var pc = 0;
    var sys = [fireflies, dust, leaves];
    for(var k = 0; k < sys.length; k++) if(sys[k]) pc += sys[k].active;
    return {
      tier: currentTier,
      clouds: clouds.length,
      cloudsVisible: (function(){ var n = 0;
        for(var i = 0; i < clouds.length; i++) if(clouds[i].grp.visible) n++;
        return n; })(),
      particlesActive: pc,
      sky: !!skyDome, sunGlow: !!sunGlow,
      glitter: !!glitter, glitterVisible: !!(glitter && glitter.visible),
      waterUpgraded: waterDone,
      shadowFollow: CFG.shadowFollow, shadowHalf: CFG.shadowHalf,
      shadowMapSize: (function(){ var k = findShadowLight();
        return k ? k.shadow.mapSize.x : 0; })(),
      shadowsOn: (function(){ var k = findShadowLight();
        return !!(k && k.castShadow); })(),
      blobsOn: TIERS[currentTier].blobs,
      cameraFar: W.camera ? W.camera.far : 0,
      playerFound: !!(playerRef && playerRef.parent),
      hazeBiased: !!(W.scene.fog && W.scene.fog.color && W.scene.fog.color._kvBiased)
    };
  }
};

} // end init(W)

}();
