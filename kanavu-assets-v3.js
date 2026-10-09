/* ============================================================
   Kanavu — V2 asset wiring (Phase 3)
   The 52 premium V2 GLBs are on Supabase but the scene was still
   rendering procedural placeholders. This module wires them in.

   1) TERRAIN SLOTS: remaps kanavu-terrain.js MegaKit slot file names
      to the real V2 nature GLBs and calls setMegakitBase(), so the
      instanced forests/rocks/ferns/flowers/grass actually populate.
      (tall-pine -> bush.glb, flower -> bush-flowers.glb, etc.
      NOTE: 8 V2 nature GLBs are geometrically corrupt on Supabase and
      are blocklisted — see CORRUPT_MODELS. Slots use the valid V2
      foliage instead.)
   2) PLACEHOLDER SWEEP: finds procedural placeholder decoration
      groups (blocky houses, code-built trees/lamps/wells/benches/
      stalls) by geometry signature and swaps them in-place for V2
      GLB clones. The original group (position, rotation, userData
      incl. decoId, tap handling, colliders) is kept — only the meshes
      are replaced. Lazy per area: only placeholders near the player
      are swapped; the sweep re-runs as the player explores.

   Loader: concurrency-capped (3), cached, cloned — same pattern as
   the retired kanavu-assets.js (which stays DISABLED; do not re-add).

   Zero old assets: every touched placeholder becomes V2.
   Graceful: a failed GLB logs and keeps the procedural original —
   never crashes, never shows broken.

   QA override: window.__kvAssetBase replaces the Supabase base URL.
   ============================================================ */
!function(){
"use strict";

function boot(){
  var W = null;
  try{ W = window.__kvWorld; }catch(e){}
  if(!W || !W.scene || !W.camera || !W.groundY) return false;
  if(!W.player) return false;              // full hook only (hook#1 is partial)
  if(!window.THREE) return false;
  if(!window.THREE.GLTFLoader) return false;
  init(W);
  return true;
}
if(!boot()){
  var tries = 0;
  var timer = setInterval(function(){
    try{ if(boot() || ++tries > 1200){ clearInterval(timer); } }catch(e){}
  }, 500);
}

function init(W){
var THREE_ = THREE;
var BASE = 'https://ersejxowxutsefalyjaf.supabase.co/storage/v1/object/public/game-assets/v2/';
try{ if(window.__kvAssetBase) BASE = window.__kvAssetBase; }catch(e){}

var stats = { wiredTerrain:false, swept:0, swapped:0, failed:0, skipped:0, blocked:0 };

function log(m){ try{ console.log('[kv-assets-v3] ' + m); }catch(_){} }

/* QA-verified corrupt on Supabase (2026-10-09): geometrically broken,
   must never be instantiated. getModel() refuses them outright. */
var CORRUPT_MODELS = {
  // All 9 previously-corrupt models were re-downloaded from source and replaced
  // on Supabase (2026-10-09). Blocklist cleared — the bbox sanity check below
  // remains as a runtime safety net.
};

/* ================= loader: concurrency-capped, cached ================= */
var loader = new THREE_.GLTFLoader();
var cache = {};                 // url -> {st:1 loading|2 ready|3 failed, tpl, waiters[]}
var activeLoads = 0, loadQueue = [], peakLoads = 0;
var MAX_CONCURRENT = 3;
function pumpQueue(){
  while(activeLoads < MAX_CONCURRENT && loadQueue.length){
    (function(url){
      activeLoads++;
      if(activeLoads > peakLoads) peakLoads = activeLoads;
      loader.load(BASE + url,
        function(gltf){
          activeLoads--;
          var e = cache[url];
          // safety: reject geometrically corrupt models (infinite bbox)
          try{
            var bb = new THREE_.Box3().setFromObject(gltf.scene);
            var sz = new THREE_.Vector3(); bb.getSize(sz);
            if(!isFinite(sz.x+sz.y+sz.z) || Math.max(sz.x,sz.y,sz.z) > 1e6){
              e.st = 3;
              stats.blocked++;
              log('blocked corrupt geometry (bad bbox): ' + url);
              var ws0 = e.waiters; e.waiters = [];
              for(var j=0;j<ws0.length;j++){ try{ ws0[j](null); }catch(_){} }
              pumpQueue();
              return;
            }
          }catch(_){}
          e.st = 2; e.tpl = gltf.scene;
          var ws = e.waiters; e.waiters = [];
          for(var i=0;i<ws.length;i++){ try{ ws[i](e.tpl); }catch(_){} }
          pumpQueue();
        },
        undefined,
        function(err){
          activeLoads--;
          var e = cache[url];
          e.st = 3;
          try{ console.log('[kv-assets-v3] GLB failed: ' + BASE + url); }catch(_){}
          var ws = e.waiters; e.waiters = [];
          for(var i=0;i<ws.length;i++){ try{ ws[i](null); }catch(_){} }
          pumpQueue();
        });
    })(loadQueue.shift());
  }
}
function getModel(url, cb){
  if(CORRUPT_MODELS[url]){
    stats.blocked++;
    log('blocked corrupt V2 model (QA 2026-10-09): ' + url);
    try{ cb(null); }catch(_){}
    return;
  }
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

/* ================= helpers ================= */
function sHash(x, z){ var h = Math.sin(x*12.9898+z*78.233)*43758.5453; return h - Math.floor(h); }
var _box = new THREE_.Box3(), _v3a = new THREE_.Vector3(), _v3b = new THREE_.Vector3();
function measureWorld(obj){
  _box.setFromObject(obj);
  _box.getSize(_v3a); _box.getCenter(_v3b);
  return { sizeX:_v3a.x, sizeY:_v3a.y, sizeZ:_v3a.z, minY:_box.min.y,
           cx:_v3b.x, cy:_v3b.y, cz:_v3b.z };
}
function playerPos(){
  var p = null;
  try{
    if(W.player && W.player.position) return { x:W.player.position.x, z:W.player.position.z };
    W.scene.traverse(function(o){ if(!p && o.userData && o.userData.rig) p = o; });
    if(p) return { x:p.position.x, z:p.position.z };
  }catch(_){}
  return null;
}

/* ================= PART A: terrain MegaKit slots -> V2 nature =================
   kanavu-terrain.js defines slots with placeholder file names
   (tall-pine.glb, flower.glb, ...). Remap to the real V2 names, then
   set the base to v2/nature/. The slot system then loads + instances
   real GLB forests. Never falls back to old assets.
   QA FINDING (2026-10-09): 8 of the 52 V2 GLBs were geometrically corrupt.
   FIXED 2026-10-09: all corrupt models re-downloaded from source and replaced
   on Supabase with valid geometry. Real assets now wired below. */
var SLOT_REMAP = {
  'tall-pine':  'pine-tall.glb',
  'broadleaf':  'broadleaf.glb',
  'rock-large': 'rock.glb',
  'cliff-rock': 'rock.glb',
  'fern':       'fern.glb',
  'flower':     'flowers.glb',
  'grass-deco': 'grass-tall.glb'
};
var wiredTerrain = false;
function wireTerrain(){
  if(wiredTerrain) return true;
  var T = null;
  try{ T = window.__kvTerrain; }catch(e){}
  if(!T || !T.slots || typeof T.setMegakitBase !== 'function') return false;
  try{
    for(var k in SLOT_REMAP){
      if(T.slots[k]) T.slots[k].file = SLOT_REMAP[k];
    }
    // NOTE: we deliberately do NOT call T.clearLegacyVegetation().
    // It hides every userData._asset wrap without _kvNew — including
    // kanavu-buildings.js V2 placements (bookshop, theatre, ...).
    // Legacy code-built trees are handled by the sweep below (swapped
    // to V2 in place, so no bare spots).
    if(T.setMegakitBase(BASE + 'nature/')){
      wiredTerrain = true;
      stats.wiredTerrain = true;
      log('terrain MegaKit slots wired to V2 nature GLBs');
    }
  }catch(e){ log('terrain wire failed: ' + (e.message||e)); }
  return wiredTerrain;
}

/* ================= PART B: procedural placeholder sweep =================
   Geometry signatures extracted from the game's decoration builders.
   Each signature maps to V2 replacements (cycled by position hash
   for variety). Swap = hide original meshes, add V2 clone as child.
   Group (transform, userData.decoId, taps) is untouched. */
function r2(v){ return Math.round(v*100)/100; }
function geoSig(geo){
  var p = geo.parameters || {}, t = geo.type || '';
  function n(v){ return Math.abs(v - Math.round(v*100)/100) < 0.001 ? Math.round(v*100)/100 : r2(v); }
  if(t==='BoxGeometry') return 'box:'+n(p.width)+','+n(p.height)+','+n(p.depth);
  if(t==='ConeGeometry') return 'cone:'+n(p.radius)+','+n(p.height)+','+(p.radialSegments||0);
  if(t==='CylinderGeometry') return 'cyl:'+n(p.radiusTop)+','+n(p.radiusBottom)+','+n(p.height)+','+(p.radialSegments||0);
  if(t==='SphereGeometry') return 'sph:'+n(p.radius)+','+(p.widthSegments||0)+','+(p.heightSegments||0);
  if(t==='IcosahedronGeometry') return 'ico:'+n(p.radius)+','+(p.detail||0);
  return '';
}
function childSigs(g){
  var out = [];
  for(var i=0;i<g.children.length;i++){
    var c = g.children[i];
    if(c.isMesh && c.geometry){
      var s = geoSig(c.geometry);
      if(s) out.push(s);
    }
  }
  return out;
}
function has(sigArr, sig){ return sigArr.indexOf(sig) >= 0; }
/* classifier -> swap class or null. Signatures are exact literals from
   the game's builders; V2 GLBs never match. */
function classify(g){
  var s = childSigs(g);
  if(!s.length) return null;
  if(has(s,'box:2.6,1.9,2.2') && has(s,'cone:2.15,1.3,4')) return 'house_a';
  if(has(s,'box:3.4,2.2,2.8') && has(s,'cone:2.7,1.5,4')) return 'house_b';
  if(has(s,'cyl:0.1,0.13,1.6,6') && has(s,'sph:0.5,12,10')) return 'lamp';
  if(has(s,'box:0.7,0.5,0.7') && has(s,'box:0.8,0.16,0.8')) return 'well';
  if(has(s,'box:1.1,0.1,0.6') && has(s,'box:1.1,0.7,0.1')) return 'bench';
  if(has(s,'cone:1.5,0.8,10') && has(s,'box:1.5,0.06,0.9')) return 'stall';
  if(has(s,'cyl:0.06,0.09,0.9,6') && has(s,'ico:0.34,0')) return 'tree_round';
  if(has(s,'cyl:0.22,0.32,1.3,7') && has(s,'cone:1.35,2.1,8')) return 'tree_pine';
  // ROBUST FALLBACK (2026-10-09): loose house matching. Any Group with a
  // Box body + 4-segment Cone pyramid roof is a house, regardless of exact
  // dimensions. Catches the large manor (7x3.4x5.6) and any variant the
  // exact signatures miss. Size determines the V2 replacement class.
  var loose = classifyLooseHouse(g);
  if(loose) return loose;
  return null;
}
/* Loose house detector: Box + 4-seg Cone = house. Returns 'house_a',
   'house_b', or 'house_manor' based on body size. V2 GLBs never have
   this procedural Box+Cone4 combo as direct children.
   Requires the Box to be a substantial body (height > 1.0) to avoid
   matching gazebos/pavilions (flat base + posts + roof). */
function classifyLooseHouse(g){
  var hasBox = false, hasCone4 = false, maxBoxDim = 0;
  for(var i=0;i<g.children.length;i++){
    var c = g.children[i];
    if(!c.isMesh || !c.geometry) continue;
    var t = c.geometry.type || '', p = c.geometry.parameters || {};
    if(t === 'BoxGeometry'){
      var h = p.height || 0;
      if(h > 1.0){  // substantial body, not a flat platform
        hasBox = true;
        var d = Math.max(p.width||0, p.height||0, p.depth||0);
        if(d > maxBoxDim) maxBoxDim = d;
      }
    }
    if(t === 'ConeGeometry' && (p.radialSegments||0) === 4){
      hasCone4 = true;
    }
  }
  if(!hasBox || !hasCone4) return null;
  // Don't re-match groups we already swapped (they contain a _v3clone wrap)
  if(maxBoxDim >= 6) return 'house_manor';   // large manor (7x3.4x5.6)
  if(maxBoxDim >= 3) return 'house_b';        // village house (3.4x2.2x2.8)
  return 'house_a';                           // small house (2.6x1.9x2.2)
}
var SWAP_MAP = {
  house_a:    ['village/house-teal-1.glb','village/house-teal-2.glb','village/house-stone.glb'],
  house_b:    ['village/house-teal-2.glb','village/house-stone.glb'],
  house_manor:['village/house-stone.glb','village/house-teal-2.glb'],
  lamp:       ['plaza/lantern-post.glb'],
  well:       ['village/well.glb'],
  bench:      ['interior/bench.glb'],
  stall:      ['village/market-stall.glb'],
  tree_round: ['nature/broadleaf.glb'],
  tree_pine:  ['nature/pine-tall.glb']
};
/* V2 model footprint, in world units, per swap class (largest dim).
   Sized to sit naturally where the placeholder stood. */
var SWAP_SIZE = {
  house_a: 4.2, house_b: 5.2, house_manor: 8.5, lamp: 3.0, well: 2.2,
  bench: 1.8, stall: 3.4, tree_round: 4.5, tree_pine: 7.5
};
var _sv = new THREE_.Vector3();
function swapGroup(g, cls){
  var urls = SWAP_MAP[cls];
  if(!urls || !urls.length) return;
  g.getWorldPosition(_sv);
  var url = urls[Math.floor(sHash(_sv.x, _sv.z) * urls.length) % urls.length];
  stats.swept++;
  getModel(url, function(tpl){
    if(!tpl){ stats.failed++; g.userData._v3skip = true; return; }  // keep procedural
    try{
      var obj = tpl.clone(true);
      // normalize: V2 largest dim -> class footprint
      _box.setFromObject(obj);
      _box.getSize(_v3a);
      var md = Math.max(_v3a.x, _v3a.y, _v3a.z) || 1;
      var s = (SWAP_SIZE[cls] || 4) / md;
      obj.scale.setScalar(s);
      obj.position.y = -_box.min.y * s;   // base sits at group origin (ground)
      if(cls==='tree_round' || cls==='tree_pine'){
        obj.rotation.y = sHash(_sv.x+7.3, _sv.z+3.1) * Math.PI * 2;
      }
      obj.traverse(function(o){
        if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; }
      });
      // hide original procedural meshes (group itself stays: taps/colliders intact)
      g.traverse(function(o){ if(o.isMesh) o.visible = false; });
      var wrap = new THREE_.Group();
      wrap.userData._v3clone = true;
      wrap.add(obj);
      g.add(wrap);
      g.userData._v3swapped = true;
      stats.swapped++;
    }catch(e){
      stats.failed++;
      g.userData._v3skip = true;
      try{ console.log('[kv-assets-v3] swap failed: ' + (e.message||e)); }catch(_){}
    }
  });
}

var SWEEP_R = 90, SWEEP_MAX = 6;
function sweep(){
  // decoMode guard removed 2026-10-09: building replacement must work
  // in decoration mode too (user was stuck seeing old buildings)
  wireTerrain();
  var pp = playerPos();
  var cands = [];
  try{
    W.scene.traverse(function(o){
      if(!o.isGroup || o === W.scene) return;
      var ud = o.userData || {};
      if(ud._v3swapped || ud._v3skip || ud._v3scanning || ud._v3clone) return;
      // never touch: other streams' placements, rigs, markers, shadows, taps
      if(ud._asset || ud._kvNew || ud.rig || ud.spot || ud.shf ||
         ud.kvTap || ud._kvNetDriven) return;
      var cls = classify(o);
      if(!cls) return;
      var d = 0;
      if(pp){
        o.getWorldPosition(_sv);
        d = Math.hypot(_sv.x - pp.x, _sv.z - pp.z);
        if(d > SWEEP_R) return;      // lazy per area
      }
      cands.push({ g:o, cls:cls, d:d });
    });
  }catch(_){ return; }
  cands.sort(function(a,b){ return a.d - b.d; });
  for(var i=0; i<cands.length && i<SWEEP_MAX; i++){
    cands[i].g.userData._v3scanning = true;
    try{ swapGroup(cands[i].g, cands[i].cls); }
    catch(_){ cands[i].g.userData._v3skip = true; }
  }
}

/* ================= ROBUST VILLAGE HARD-REPLACE (2026-10-09) =================
   Position-based replacement for the 4 village houses + manor. The
   signature-matching sweep above is fragile (exact dimensions, timing,
   scene structure). This does a direct pass: find ANY Group within
   3 units of a known house position, REMOVE it entirely from the scene,
   and place a V2 GLB house at that spot. Per Adi's direction: "If new
   buildings are used, remove all old equivalents."
   Known positions from kanavu-game.js oe() calls and manor IIFE. */
var VILLAGE_HOUSES = [
  { x:-15, z:-3,  cls:'house_b',     rot:0 },
  { x:12,  z:10,  cls:'house_b',     rot:0 },
  { x:0,   z:-14, cls:'house_b',     rot:0 },
  { x:28,  z:12,  cls:'house_b',     rot:0 },
  { x:-14, z:-58, cls:'house_manor', rot:0 }
];
var villageReplaced = false;
function villageHardReplace(){
  if(villageReplaced) return;
  villageReplaced = true;
  log('village hard-replace: starting');
  var found = 0, removed = 0;
  try{
    for(var hi=0; hi<VILLAGE_HOUSES.length; hi++){
      (function(h){
        var hx = h.x, hz = h.z, cls = h.cls;
        // Find groups near this position
        var targets = [];
        W.scene.traverse(function(o){
          if(!o.isGroup || o === W.scene) return;
          var ud = o.userData || {};
          // Skip already-processed, V2 clones, and protected
          if(ud._v3swapped || ud._v3skip || ud._v3clone || ud._v3hr) return;
          if(ud._asset || ud._kvNew || ud.rig) return;
          o.getWorldPosition(_sv);
          var d = Math.hypot(_sv.x - hx, _sv.z - hz);
          if(d < 4.0){
            // Must look like a building (has meshes, not a marker/light)
            var meshCount = 0;
            o.traverse(function(c){ if(c.isMesh) meshCount++; });
            if(meshCount >= 3) targets.push(o);
          }
        });
        if(!targets.length){
          log('village hard-replace: no group found at ('+hx+','+hz+')');
          return;
        }
        found++;
        // Remove the old building(s) entirely
        for(var ti=0; ti<targets.length; ti++){
          var t = targets[ti];
          t.userData._v3hr = true;  // mark as hard-replaced
          if(t.parent) t.parent.remove(t);
          removed++;
        }
        log('village hard-replace: removed '+targets.length+' group(s) at ('+hx+','+hz+')');
        // Place V2 GLB house at the position
        var urls = SWAP_MAP[cls];
        if(!urls || !urls.length) return;
        var url = urls[Math.floor(sHash(hx, hz) * urls.length) % urls.length];
        getModel(url, function(tpl){
          if(!tpl){
            log('village hard-replace: GLB failed for ('+hx+','+hz+'): '+url);
            return;
          }
          try{
            var obj = tpl.clone(true);
            _box.setFromObject(obj);
            _box.getSize(_v3a);
            var md = Math.max(_v3a.x, _v3a.y, _v3a.z) || 1;
            var s = (SWAP_SIZE[cls] || 5) / md;
            obj.scale.setScalar(s);
            var gy = 0;
            try{ gy = W.groundY(hx, hz); }catch(_){}
            obj.position.set(hx, gy - _box.min.y * s, hz);
            obj.rotation.y = sHash(hx+3.7, hz+9.1) * Math.PI * 2;
            obj.traverse(function(o){
              if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; }
            });
            var wrap = new THREE_.Group();
            wrap.userData._v3clone = true;
            wrap.userData._v3hr = true;
            wrap.add(obj);
            W.scene.add(wrap);
            stats.swapped++;
            log('village hard-replace: placed '+url+' at ('+hx+','+hz+')');
          }catch(e){
            log('village hard-replace: place failed: '+(e.message||e));
          }
        });
      })(VILLAGE_HOUSES[hi]);
    }
    log('village hard-replace: done, found='+found+' removed='+removed);
  }catch(e){
    log('village hard-replace: error '+(e.message||e));
  }
}

/* ================= diagnostics ================= */
window.__kvAssetsV3 = {
  stats: function(){
    var t = null;
    try{ t = window.__kvTerrain ? window.__kvTerrain.stats() : null; }catch(_){}
    return {
      swept: stats.swept, swapped: stats.swapped,
      failed: stats.failed, peakLoads: peakLoads,
      cachedModels: Object.keys(cache).length,
      terrainWired: stats.wiredTerrain,
      terrain: t ? { megakitBase: t.megakitBase, megakitLoaded: t.megakitLoaded,
                     slotTrees: t.slotTrees, slotDraws: t.slotDraws } : null
    };
  },
  sweepNow: function(){ try{ sweep(); return true; }catch(_){ return false; } },
  cacheKeys: function(){ return Object.keys(cache); }
};

/* kick off */
try{ wireTerrain(); }catch(_){}
try{ sweep(); }catch(_){}
setInterval(function(){ try{ sweep(); }catch(_){} }, 3000);
// Robust village replacement runs once after 12s (world fully built)
setTimeout(function(){ try{ villageHardReplace(); }catch(_){} }, 12000);
log('v3 wiring active');

} // end init(W)
}();
