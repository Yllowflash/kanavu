/* ============================================================
   Kanavu — Stream 6: Graphics Quality manager
   - Quality tiers: Auto (default) / Low / Medium / High / Ultra.
     Ultra targets 60 fps; all lower tiers target 30 fps.
   - Controls per tier (all applied LIVE, no reload):
       * renderer pixel ratio
       * shadow map on/off + resolution
       * vegetation density + particle counts (via event —
         terrain/visuals streams listen and adjust instances)
       * CSS vignette on/off + fog density scaling
   - Antialiasing: WebGL MSAA is fixed at renderer creation, so it
     CANNOT be toggled live. The desired AA is persisted to
     localStorage['kanavu.aa'] as an integration point for a future
     boot shim, and reported via __kvQuality.aaLive / aaPending.
   - Auto mode: starts at Medium, measures fps in 3s windows, steps
     down fast (1 window < 28 fps), steps up slow (2 consecutive
     windows > 55 fps) — asymmetric hysteresis, no oscillation.
   - Persists to localStorage['kanavu.quality'].
   - API: window.__kvQuality = { setTier, getTier, isAuto, onChange,
     fps, TIER_INFO, debug, aaLive, aaPending }
   - Event contract: window CustomEvent 'kv-quality-change' with
     detail {tier, auto, pixelRatio, shadowsEnabled, shadowPx,
     vegetation, particles, vignette, fogScale, fpsTarget,
     prevTier, source}.
   Graceful: silent no-op if __kvWorld / THREE / renderer is missing.
   Never edits game state or kanavu-game.js.
   ============================================================ */
!function(){
"use strict";

/* ---------------- tier table ---------------- */
var TIERS = ['low', 'medium', 'high', 'ultra'];
var SPEC = {
  low:    { label:'Low',       desc:'Battery saver · smoothest', pixelRatio:0.75, shadows:false, shadowPx:0,    vegetation:0.35, particles:0.30, vignette:false, fogScale:1.40, aa:false, fpsTarget:30 },
  medium: { label:'Medium',    desc:'Balanced · default Auto start', pixelRatio:1.0, shadows:true, shadowPx:512,  vegetation:0.60, particles:0.60, vignette:true,  fogScale:1.15, aa:true,  fpsTarget:30 },
  high:   { label:'High',      desc:'Beautiful · rich detail',  pixelRatio:1.5, shadows:true, shadowPx:1024, vegetation:0.85, particles:0.85, vignette:true,  fogScale:1.00, aa:true,  fpsTarget:30 },
  ultra:  { label:'Ultra',     desc:'60 fps showcase · max detail', pixelRatio:2.0, shadows:true, shadowPx:2048, vegetation:1.00, particles:1.00, vignette:true,  fogScale:1.00, aa:true,  fpsTarget:60 }
};
var TIER_INFO = {
  auto:   { label:'Auto',   desc:'Adapts to this device · starts at Medium' },
  low:    { label:SPEC.low.label,    desc:SPEC.low.desc },
  medium: { label:SPEC.medium.label, desc:SPEC.medium.desc },
  high:   { label:SPEC.high.label,   desc:SPEC.high.desc },
  ultra:  { label:SPEC.ultra.label,  desc:SPEC.ultra.desc }
};

var LS_TIER = 'kanavu.quality';
var LS_AA   = 'kanavu.aa';

/* ---------------- tiny storage ---------------- */
function lsGet(k){ try{ return window.localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k,v){ try{ window.localStorage.setItem(k,v); }catch(e){} }

/* ---------------- hook pattern (same as streams 1/2) ---------------- */
function boot(){
  var W = window.__kvWorld;
  if(!W || !W.scene || !W.renderer || !window.THREE) return false;
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
  var renderer = W.renderer, scene = W.scene;
  var dpr = 1;
  try{ dpr = window.devicePixelRatio || 1; }catch(e){}

  /* capture the game's own baseline so we never fight it */
  var baseFogDensity = null;
  try{
    if(scene.fog && scene.fog.isFogExp2 && typeof scene.fog.density === 'number')
      baseFogDensity = scene.fog.density;
  }catch(e){}
  var rendererAA = true; /* game creates renderer with antialias:true */

  /* ---------------- state ---------------- */
  var state = {
    mode: 'auto',          // 'auto' | tier id
    tier: 'medium',        // currently applied tier
    shadowsOn: true,      // last applied shadow state
    aaPending: false,
    prevTier: null
  };
  var listeners = [];

  /* restore persisted choice */
  (function(){
    var raw = lsGet(LS_TIER);
    if(!raw) return;
    var v = (''+raw).toLowerCase();
    if(v === 'auto'){ state.mode = 'auto'; state.tier = 'medium'; }
    else if(SPEC[v]){ state.mode = v; state.tier = v; }
  })();

  /* ---------------- live apply ---------------- */
  function effPixelRatio(tier){
    var want = SPEC[tier].pixelRatio;
    return Math.min(dpr, want); // never exceed device pixels
  }

  function applyShadows(tier){
    var spec = SPEC[tier];
    try{
      if(!spec.shadows){
        // turn shadows off: stop lights casting (cheap, fully live)
        if(renderer.shadowMap.enabled) renderer.shadowMap.enabled = false;
        scene.traverse(function(o){
          if(o.isLight && o.shadow && o.castShadow){
            o.userData._kvCast = true; o.castShadow = false;
          }
        });
        state.shadowsOn = false;
      }else{
        var px = spec.shadowPx;
        var wasOff = !state.shadowsOn;
        if(!renderer.shadowMap.enabled){
          renderer.shadowMap.enabled = true;
          renderer.shadowMap.needsUpdate = true;
        }
        scene.traverse(function(o){
          if(o.isLight && o.shadow && o.shadow.mapSize){
            if(o.shadow.mapSize.x !== px || o.shadow.mapSize.y !== px){
              o.shadow.mapSize.set(px, px);
              // force the GPU shadow map to re-allocate at the new size
              if(o.shadow.map){ try{ o.shadow.map.dispose(); }catch(e){} o.shadow.map = null; }
            }
            if(o.userData._kvCast){ o.castShadow = true; delete o.userData._kvCast; }
          }
        });
        // materials compiled while shadows were off need one recompile
        if(wasOff){
          scene.traverse(function(o){
            if(!o.isMesh || !o.material) return;
            var mats = Array.isArray(o.material) ? o.material : [o.material];
            for(var i=0;i<mats.length;i++){ try{ mats[i].needsUpdate = true; }catch(e){} }
          });
        }
        state.shadowsOn = true;
      }
    }catch(e){}
  }

  function applyVignette(on){
    try{
      var el = document.getElementById('kv-vignette');
      if(!el){
        // visuals stream may not have built it yet — retry a few times
        var n = 0;
        var t = setInterval(function(){
          var e2 = document.getElementById('kv-vignette');
          if(e2){ e2.style.display = on ? '' : 'none'; clearInterval(t); }
          else if(++n > 5){ clearInterval(t); }
        }, 700);
        return;
      }
      el.style.display = on ? '' : 'none';
    }catch(e){}
  }

  function applyFog(tier){
    if(baseFogDensity === null) return;
    try{
      if(scene.fog && scene.fog.isFogExp2)
        scene.fog.density = baseFogDensity * SPEC[tier].fogScale;
    }catch(e){}
  }

  function applyAA(tier){
    // MSAA is fixed at WebGLRenderer construction — cannot toggle live.
    var want = SPEC[tier].aa;
    var live = (want === rendererAA);
    state.aaPending = !live;
    lsSet(LS_AA, want ? 'on' : 'off'); // boot-shim integration point
    return live;
  }

  function applyTier(tier, source){
    if(!SPEC[tier]) tier = 'medium';
    var spec = SPEC[tier];
    var prev = state.tier;

    try{ renderer.setPixelRatio(effPixelRatio(tier)); }catch(e){}
    applyShadows(tier);
    applyVignette(spec.vignette);
    applyFog(tier);
    var aaLive = applyAA(tier);

    state.tier = tier;
    state.prevTier = prev;

    var detail = {
      tier: tier,
      auto: (state.mode === 'auto'),
      pixelRatio: effPixelRatio(tier),
      shadowsEnabled: spec.shadows,
      shadowPx: spec.shadowPx,
      vegetation: spec.vegetation,   // terrain stream scales instance counts
      particles: spec.particles,     // visuals stream scales firefly/leaf/dust
      vignette: spec.vignette,
      fogScale: spec.fogScale,
      fpsTarget: spec.fpsTarget,
      aaLive: aaLive,
      prevTier: prev,
      source: source || 'manual'
    };
    try{
      window.dispatchEvent(new CustomEvent('kv-quality-change', { detail: detail }));
    }catch(e){}
    for(var i=0;i<listeners.length;i++){
      try{ listeners[i](detail); }catch(e){}
    }
    return detail;
  }

  /* ---------------- fps meter + Auto stepper ---------------- */
  var meter = {
    frames: 0, t0: 0, lastFps: 0,
    upStreak: 0,           // consecutive 3s windows > 55 fps
    settleUntil: 0,        // no auto changes during warm-up / after changes
    booted: false
  };
  var now = function(){
    try{
      if(window.performance && typeof window.performance.now === 'function')
        return window.performance.now();
    }catch(e){}
    try{ return Date.now(); }catch(e2){ return 0; }
  };

  function onWindow(fps){
    meter.lastFps = fps;
    if(state.mode !== 'auto') return;
    var t = now();
    if(t < meter.settleUntil) return;
    var idx = TIERS.indexOf(state.tier);

    if(fps < 28 && idx > 0){
      // bad perf: step down fast (one tier per window)
      meter.upStreak = 0;
      meter.settleUntil = t + 6000;
      applyTier(TIERS[idx-1], 'auto-down');
    }else if(fps > 55){
      // clearly capable: step up only after 2 sustained windows (hysteresis)
      meter.upStreak++;
      if(meter.upStreak >= 2 && idx < TIERS.length-1){
        meter.upStreak = 0;
        meter.settleUntil = t + 6000;
        applyTier(TIERS[idx+1], 'auto-up');
      }
    }else{
      meter.upStreak = 0; // comfort zone: hold
    }
  }

  function rafLoop(t){
    try{
      if(!document.hidden){
        if(!meter.t0) meter.t0 = t;
        meter.frames++;
        var dt = t - meter.t0;
        if(dt >= 3000){
          onWindow(meter.frames * 1000 / dt);
          meter.frames = 0; meter.t0 = t;
        }
      }else{
        meter.frames = 0; meter.t0 = 0; meter.upStreak = 0;
      }
    }catch(e){}
    schedule();
  }
  function schedule(){
    try{
      if(window.requestAnimationFrame) window.requestAnimationFrame(rafLoop);
      else setTimeout(function(){ rafLoop(now()); }, 16);
    }catch(e){}
  }

  /* ---------------- public API ---------------- */
  var api = {
    setTier: function(t){
      t = (''+t).toLowerCase();
      if(t === 'auto'){
        state.mode = 'auto';
        lsSet(LS_TIER, 'auto');
        meter.upStreak = 0;
        meter.settleUntil = now() + 6000;
        return applyTier('medium', 'manual-auto');
      }
      if(!SPEC[t]) return null;
      state.mode = t;
      lsSet(LS_TIER, t);
      meter.upStreak = 0;
      meter.settleUntil = now() + 6000; // let the meter re-baseline
      return applyTier(t, 'manual');
    },
    getTier: function(){ return state.mode === 'auto' ? 'auto' : state.tier; },
    appliedTier: function(){ return state.tier; },
    isAuto: function(){ return state.mode === 'auto'; },
    fps: function(){ return Math.round(meter.lastFps * 10) / 10; },
    onChange: function(cb){
      if(typeof cb !== 'function') return function(){};
      listeners.push(cb);
      return function(){
        var i = listeners.indexOf(cb);
        if(i >= 0) listeners.splice(i, 1);
      };
    },
    TIER_INFO: TIER_INFO,
    tiers: TIERS.slice(),
    get aaLive(){ return !state.aaPending; },
    get aaPending(){ return state.aaPending; },
    debug: function(){
      return {
        mode: state.mode, tier: state.tier, prevTier: state.prevTier,
        pixelRatio: (function(){ try{ return renderer.getPixelRatio(); }catch(e){ return -1; } })(),
        shadowsEnabled: !!(renderer.shadowMap && renderer.shadowMap.enabled),
        aaLive: !state.aaPending, aaPending: state.aaPending,
        fps: Math.round(meter.lastFps*10)/10,
        upStreak: meter.upStreak
      };
    }
  };
  window.__kvQuality = api;

  /* ---------------- go ---------------- */
  meter.settleUntil = now() + 6000;   // warm-up: no auto changes first 6s
  applyTier(state.tier, 'init');      // applies persisted choice (or Medium)
  schedule();                          // fps meter always on (cheap, one rAF)
  meter.booted = true;
}

}();
