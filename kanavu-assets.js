/* ============================================================
   Kanavu — premium asset integration (Phase 2)
   Lazy-loads curated GLB models per area, replaces/augments
   code-built scenery with sparse premium pieces.
   Graceful: if the world hook, loader, or network is missing,
   this file is a silent no-op — the game plays on unchanged.
   ============================================================ */
!function(){
"use strict";
// The game builds its world on Begin click, not at script load.
// Wait for the hook, then initialize. If the loader is missing,
// stay a silent no-op.
function boot(){
  var W = window.__kvWorld;
  if(!W || !W.scene || !W.groundY || !window.THREE || !THREE.GLTFLoader) return false;
  init(W);
  return true;
}
if(!boot()){
  var tries = 0;
  var timer = setInterval(function(){
    if(boot() || ++tries > 120){ clearInterval(timer); }
  }, 500);
}
function init(W){
var THREE_ = THREE;

var BASE = 'https://ersejxowxutsefalyjaf.supabase.co/storage/v1/object/public/game-assets/v2/';

/* ---------------- loader: concurrency-capped, cached, cloned ---------------- */
var loader = new THREE_.GLTFLoader();
var cache = {};            // url -> {st:1 loading|2 ready|3 failed, tpl, waiters[]}
var activeLoads = 0, loadQueue = [], peakLoads = 0;
var MAX_CONCURRENT = 3;

function pumpQueue(){
  while(activeLoads < MAX_CONCURRENT && loadQueue.length){
    (function(url){
      activeLoads++;
      if(activeLoads > peakLoads) peakLoads = activeLoads;
      loader.load(BASE + url,
        function(gltf){          // success
          activeLoads--;
          var e = cache[url];
          e.st = 2; e.tpl = gltf.scene;
          var ws = e.waiters; e.waiters = [];
          for(var i=0;i<ws.length;i++){ try{ ws[i](e.tpl); }catch(_){} }
          pumpQueue();
        },
        undefined,
        function(){               // failure -> graceful, originals stay
          activeLoads--;
          var e = cache[url];
          e.st = 3;
          var ws = e.waiters; e.waiters = [];
          for(var i=0;i<ws.length;i++){ try{ ws[i](null); }catch(_){} }
          pumpQueue();
        });
    })(loadQueue.shift());
  }
}
function getModel(url, cb){
  var e = cache[url];
  if(e){
    if(e.st === 2){ try{ cb(e.tpl); }catch(_){} return; }
    if(e.st === 3){ try{ cb(null); }catch(_){} return; }
    e.waiters.push(cb); return;
  }
  cache[url] = {st:1, tpl:null, waiters:[cb]};
  loadQueue.push(url);
  pumpQueue();
}

/* ---------------- helpers ---------------- */
function sRnd(seed){ var x = Math.sin(seed*127.1+311.7)*43758.5453; return x - Math.floor(x); }

var _box = new THREE_.Box3(), _v = new THREE_.Vector3(), _s = new THREE_.Vector3();
function measure(obj){
  _box.setFromObject(obj);
  _box.getSize(_s);
  return { size: new THREE_.Vector3(_s.x, _s.y, _s.z), minY: _box.min.y };
}

// Scale clone so its largest dimension == target; returns scale applied.
function normalizeScale(obj, target){
  var m = measure(obj);
  var md = Math.max(m.size.x, m.size.y, m.size.z) || 1;
  var s = target / md;
  obj.scale.setScalar(s);
  return s;
}

// Subtle per-building variety: clone materials once, nudge hue/lightness.
var _hsl = {};
function applyTint(obj, hShift, lShift){
  var seen = [];
  obj.traverse(function(o){
    if(!o.isMesh || !o.material) return;
    var idx = seen.indexOf(o.material);
    if(idx < 0){
      o.material = o.material.clone();
      seen.push(o.material);
      var c = o.material.color;
      if(c && c.getHSL){
        c.getHSL(_hsl);
        var h = ((_hsl.h + hShift) % 1 + 1) % 1;
        var l = Math.min(1, Math.max(0, _hsl.l + lShift));
        c.setHSL(h, _hsl.s, l);
      }
      if(o.material.emissive && o.material.emissiveIntensity > 0){
        // keep window glow warm: leave emissive alone
      }
    } else {
      o.material = seen[idx];
    }
  });
}

// Warm glow sprite (for lamps / lanterns).
var _glowTex = null;
function glowTexture(){
  if(_glowTex) return _glowTex;
  var cv = document.createElement('canvas'); cv.width = cv.height = 64;
  var ctx = cv.getContext('2d');
  var g = ctx.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0, 'rgba(255,242,205,1)');
  g.addColorStop(0.35, 'rgba(255,222,150,0.55)');
  g.addColorStop(1, 'rgba(255,200,110,0)');
  ctx.fillStyle = g; ctx.fillRect(0,0,64,64);
  _glowTex = new THREE_.CanvasTexture(cv);
  return _glowTex;
}
function makeGlow(size){
  var sp = new THREE_.Sprite(new THREE_.SpriteMaterial({
    map: glowTexture(), blending: THREE_.AdditiveBlending,
    depthWrite: false, transparent: true, opacity: 0.9
  }));
  sp.scale.set(size, size, 1);
  return sp;
}

// Hide an original code-built group near (cx,cz) with approx size md.
// Never touches markers, player, shadows, or sprites.
function hideOriginal(cx, cz, md, tol){
  tol = tol || 1.6;
  var found = null;
  W.scene.children.forEach(function(c){
    if(!(c.isMesh || c.isGroup)) return;
    var ud = c.userData || {};
    if(ud.spot || ud.rig || ud.shf || ud._asset) return;
    _box.setFromObject(c);
    _box.getCenter(_v); _box.getSize(_s);
    var m = Math.max(_s.x, _s.y, _s.z);
    if(Math.hypot(_v.x - cx, _v.z - cz) < tol && Math.abs(m - md) < 1.6){
      found = c;
    }
  });
  if(found) found.visible = false;
  return !!found;
}

// Place a loaded template: clone, scale, ground, rotate, optional hide+collider+tint+glow.
function place(tpl, item, seed){
  var obj = tpl.clone(true);
  var target = item.size || 4;
  normalizeScale(obj, target);
  // ground it: shift so bbox base sits at terrain
  var m = measure(obj);
  var gy = W.groundY(item.x, item.z);
  var wrap = new THREE_.Group();
  wrap.position.set(item.x, gy, item.z);
  wrap.userData._asset = true;   // marker: never hide our own placements
  obj.position.y = -m.minY + (item.sink || 0);
  var ry = (item.ry || 0) + (sRnd(seed) - 0.5) * (item.ryJitter || 0);
  obj.rotation.y = ry;
  // subtle scale jitter for variety
  if(item.jitter){
    var j = 1 + (sRnd(seed + 99) - 0.5) * item.jitter;
    obj.scale.multiplyScalar(j);
  }
  wrap.add(obj);
  if(item.tint){
    applyTint(obj, (sRnd(seed + 7) - 0.5) * 0.06, (sRnd(seed + 13) - 0.5) * 0.08);
  }
  if(item.glow){
    var gl = makeGlow(item.glow);
    gl.position.y = item.glowY || target * 0.8;
    wrap.add(gl);
  }
  W.scene.add(wrap);
  if(item.hide){
    hideOriginal(item.hide.x, item.hide.z, item.hide.md, item.hide.tol);
  }
  if(item.collider){
    try{ W.staticColliders.push({x:item.x, z:item.z, r:item.collider}); }catch(_){}
  }
  return wrap;
}

/* ---------------- area definitions ----------------
   size: target largest-dimension in world units.
   hide: {x,z,md} hides the original code-built group it replaces. */
var AREAS = [
  { name:'plaza', x:0, z:0, r:32, items:[
    { m:'decor/fountain.glb', x:0, z:-7, size:3.6, collider:1.9, ry:0.4 },
    { m:'lamps/post-lantern.glb', x:-4.7, z:3.8, size:3.2, glow:2.2, glowY:2.9,
      hide:{x:-4.7, z:3.8, md:2.9} },
    { m:'lamps/post-lantern.glb', x:4.3, z:-0.7, size:3.2, glow:2.2, glowY:2.9,
      hide:{x:4.3, z:-0.7, md:2.9} },
    { m:'plants/bush.glb', x:-6, z:-9, size:2.0, jitter:0.3 },
    { m:'plants/bush.glb', x:6.5, z:-10, size:1.7, jitter:0.3 }
  ]},
  { name:'village', x:8, z:4, r:38, items:[
    { m:'buildings/fantasy-house.glb', x:12, z:10, size:7.2, ry:-0.15, ryJitter:0.2,
      tint:true, collider:3.0, hide:{x:12, z:10, md:7.6} },
    { m:'shops/shop.glb', x:-15, z:-3, size:6.6, ry:0.2, ryJitter:0.2,
      tint:true, collider:2.8, hide:{x:-15, z:-3, md:7.6} },
    { m:'buildings/hut-a.glb', x:0, z:-14, size:5.6, ry:0.1, ryJitter:0.25,
      tint:true, collider:2.2, hide:{x:0, z:-14, md:7.6} },
    { m:'shops/market-stand-a.glb', x:28, z:12, size:4.6, ry:-0.3, ryJitter:0.3,
      tint:true, collider:1.8, hide:{x:28, z:12, md:7.6} },
    { m:'fences/hedge.glb', x:8, z:17, size:2.6, ry:0.5, jitter:0.2 },
    { m:'fences/hedge.glb', x:17, z:5, size:2.4, ry:1.2, jitter:0.2 },
    { m:'fences/hedge.glb', x:-9, z:-8, size:2.5, ry:0.2, jitter:0.2 },
    { m:'plants/bush.glb', x:15.5, z:12.5, size:1.8, jitter:0.3 },
    { m:'trees/pine-cluster.glb', x:26, z:-12.1, size:6.5, jitter:0.2,
      hide:{x:26, z:-12.1, md:4.4, tol:1.2} }
  ]},
  { name:'beach', x:8, z:-58, r:32, items:[
    { m:'trees/palm.glb', x:4, z:-56, size:4.2, jitter:0.25, ryJitter:3.0 },
    { m:'trees/palm.glb', x:13, z:-60, size:3.8, jitter:0.25, ryJitter:3.0 },
    { m:'trees/palm.glb', x:-2, z:-62, size:4.5, jitter:0.25, ryJitter:3.0 },
    { m:'decor/beach-lounger.glb', x:7, z:-62, size:2.2, ry:2.6 },
    { m:'decor/beach-lounger.glb', x:10.5, z:-63, size:2.2, ry:2.9 }
  ]},
  { name:'mountain', x:-8, z:-28, r:38, items:[
    { m:'rocks/rock-a.glb', x:-4, z:-34, size:2.6, jitter:0.4, ryJitter:3.0 },
    { m:'rocks/rock-a.glb', x:2, z:-36, size:2.0, jitter:0.4, ryJitter:3.0 },
    { m:'rocks/rock-c.glb', x:-12, z:-30, size:2.2, jitter:0.4, ryJitter:3.0 },
    { m:'trees/pine-cluster.glb', x:-5.9, z:-28.1, size:6.0, jitter:0.2,
      hide:{x:-5.9, z:-28.1, md:4.0, tol:1.2} }
  ]},
  { name:'meadow', x:-28, z:12, r:38, items:[
    { m:'trees/oak.glb', x:-24, z:4, size:5.2, jitter:0.2, ryJitter:3.0,
      hide:{x:-24, z:4, md:3.9, tol:1.2} },
    { m:'trees/willow.glb', x:-14, z:18, size:4.6, jitter:0.2, ryJitter:3.0,
      hide:{x:-14, z:18, md:4.2, tol:1.2} },
    { m:'plants/bush.glb', x:-20, z:8, size:2.2, jitter:0.3 },
    { m:'plants/grass-tuft.glb', x:-26, z:14, size:1.2 },
    { m:'plants/grass-tuft.glb', x:-22, z:16, size:1.0 }
  ]},
  { name:'woods', x:20, z:-28, r:32, items:[
    { m:'trees/autumn-tree.glb', x:20, z:-30, size:4.6, jitter:0.2, ryJitter:3.0,
      hide:{x:20, z:-30, md:3.5, tol:1.2} },
    { m:'trees/pine-cluster.glb', x:27, z:-24, size:5.5, jitter:0.25, ryJitter:3.0 },
    { m:'rocks/rock-c.glb', x:16, z:-33, size:1.8, jitter:0.3, ryJitter:3.0 }
  ]}
];

/* ---------------- area loading ---------------- */
var loadedAreas = {};
var playerRef = null;

function findPlayer(){
  if(playerRef && playerRef.parent) return playerRef;
  playerRef = null;
  W.scene.traverse(function(o){
    if(!playerRef && o.userData && o.userData.rig) playerRef = o;
  });
  return playerRef;
}
function focusPos(){
  var pl = findPlayer();
  if(pl) return { x: pl.position.x, z: pl.position.z };
  var c = W.camera;
  return { x: c.position.x, z: c.position.z };
}

function loadArea(area){
  var seedBase = 0;
  for(var i=0;i<area.name.length;i++) seedBase += area.name.charCodeAt(i);
  area.items.forEach(function(item, idx){
    var seed = seedBase * 100 + idx;
    getModel(item.m, function(tpl){
      if(!tpl) return;                    // failed -> original scenery stays
      try{ place(tpl, item, seed); }
      catch(_){ /* never break the game */ }
    });
  });
}

function checkAreas(){
  var pp;
  try{ pp = focusPos(); }catch(_){ return; }
  if(!pp) return;
  for(var i=0;i<AREAS.length;i++){
    var a = AREAS[i];
    if(loadedAreas[a.name]) continue;
    var dx = pp.x - a.x, dz = pp.z - a.z;
    if(dx*dx + dz*dz < a.r * a.r){
      loadedAreas[a.name] = true;
      loadArea(a);
    }
  }
}

// Expose diagnostics (used by QA; harmless in production).
window.__kanavuAssets = {
  areas: AREAS, loadedAreas: loadedAreas, cache: cache,
  stats: function(){ return { peakConcurrentLoads: peakLoads, cached: Object.keys(cache).length }; }
};

// Kick off: check now (spawn area loads instantly) and every second.
try{ checkAreas(); }catch(_){}
setInterval(function(){ try{ checkAreas(); }catch(_){} }, 1000);

/* ---------------- credits UI wiring ---------------- */
try{
  var creditsBtn = document.getElementById('set-credits');
  var creditsPanel = document.getElementById('credits-panel');
  var creditsClose = document.getElementById('credits-close');
  var settingsPanel = document.getElementById('settings-panel');
  if(creditsBtn && creditsPanel){
    creditsBtn.addEventListener('click', function(){
      creditsPanel.classList.remove('hidden-el');
      if(settingsPanel) settingsPanel.classList.add('hidden-el');
    });
  }
  if(creditsClose && creditsPanel){
    creditsClose.addEventListener('click', function(){
      creditsPanel.classList.add('hidden-el');
      if(settingsPanel) settingsPanel.classList.remove('hidden-el');
    });
  }
}catch(_){}

} // end init(W)

}();
