/* ============================================================
   Kanavu — Stream 3: purpose-built buildings + feature integration
   Bookshop (question decks) · Lighthouse/Beacon (nightly ritual) ·
   Theatre (games) · Memory Cottage (memories) · Warmth (hold-hands
   rhythm). All models are NEW v2/ assets only (Quaternius/Kenney,
   CC0 1.0) — none of the deprecated old-17 set.

   Integration pattern (matches kanavu-assets.js / kanavu-daily.js):
   - hooks into window.__kvWorld (scene, camera, renderer, groundY,
     staticColliders, onTap, player) — never touches game internals
   - tap chain: wraps W.onTap chain-safely (coexists with the daily
     stream's wrapper; re-chains after deco-mode swaps)
   - dual access: tap the 3D building AND bottom-nav pills via
     KVNav.register (decks/memories/beacon re-register the daily
     stream's placeholder pills with real handlers)
   - full-screen UIs reuse the KVRitual premium candlelight shell
   - graceful: any missing hook/loader/network is a silent no-op;
     a failed GLB keeps the tap zone + sign + a modest code-built
     fallback so the feature still works

   Persistence keys (same as the 2D demo): kanavu.decks.v1,
   kanavu.beacon.v1, kanavu.games.v1, kanavu.memories.v1,
   kanavu.warmth.v1 — via the daily stream's kvGet/kvSet.
   ============================================================ */
!function(){
"use strict";

function boot(){
  var W = null;
  try{ W = window.__kvWorld; }catch(e){}
  if(!W || !W.scene || !W.camera || !W.groundY) return false;
  /* hook#1 fires early with a partial facet; hook#2 (full world) adds
     player/tickers — init only on the full hook, like kanavu-terrain.js */
  if(!W.player) return false;
  if(!window.THREE) return false;
  if(!window.THREE.GLTFLoader) return false;   // gltf-loader-umd.js
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
var T = THREE;
var BASE = 'https://ersejxowxutsefalyjaf.supabase.co/storage/v1/object/public/game-assets/v2/';
try{ if(window.__kvAssetBase) BASE = window.__kvAssetBase; }catch(e){}  // QA override only

/* ---------------- safe bridges ---------------- */
function api(){ try{ return window.__kvApi || null; }catch(e){ return null; } }
function toast(m, ms){
  try{ var a = api(); if(a && a.toast) a.toast(m, ms); }catch(e){}
}
function addStars(n){
  try{ var a = api(); if(a && a.addStars) a.addStars(n); }catch(e){}
}
function kvGet(k, fb){
  try{
    if(typeof kvGetFn === 'function') return kvGetFn(k, fb);
  }catch(e){}
  try{ var v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); }
  catch(e){ return fb; }
}
function kvSet(k, v){
  try{
    if(typeof kvSetFn === 'function'){ kvSetFn(k, v); return; }
  }catch(e){}
  try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){}
}
/* the daily stream declares global kvGet/kvSet — bind late so load
   order never matters */
var kvGetFn = null, kvSetFn = null;
try{
  if(typeof window.kvGet === 'function') kvGetFn = window.kvGet;
  if(typeof window.kvSet === 'function') kvSetFn = window.kvSet;
}catch(e){}

/* ---------------- model loader: concurrency-capped, cached ---------------- */
var loader = new T.GLTFLoader();
var cache = {};
var activeLoads = 0, loadQueue = [];
var MAX_CONCURRENT = 3;
function pumpQueue(){
  while(activeLoads < MAX_CONCURRENT && loadQueue.length){
    (function(url){
      activeLoads++;
      loader.load(BASE + url,
        function(gltf){
          activeLoads--;
          var e = cache[url];
          e.st = 2; e.tpl = gltf.scene;
          var ws = e.waiters; e.waiters = [];
          for(var i=0;i<ws.length;i++){ try{ ws[i](e.tpl); }catch(_){} }
          pumpQueue();
        },
        undefined,
        function(){
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

/* ---------------- 3D helpers ---------------- */
var _box = new T.Box3(), _v = new T.Vector3(), _s = new T.Vector3();
function measure(obj){
  _box.setFromObject(obj);
  _box.getSize(_s);
  return { size: new T.Vector3(_s.x, _s.y, _s.z), minY: _box.min.y };
}
function normalizeScale(obj, target){
  var m = measure(obj);
  var md = Math.max(m.size.x, m.size.y, m.size.z) || 1;
  var s = target / md;
  obj.scale.setScalar(s);
  return s;
}
function sRnd(seed){ var x = Math.sin(seed*127.1+311.7)*43758.5453; return x - Math.floor(x); }
function mat(c, rough){
  return new T.MeshStandardMaterial({color:c, roughness:(rough==null?0.9:rough), flatShading:true});
}

/* warm glow sprite texture (shared) */
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
  _glowTex = new T.CanvasTexture(cv);
  return _glowTex;
}
function makeGlow(size, opacity){
  var sp = new T.Sprite(new T.SpriteMaterial({
    map: glowTexture(), blending: T.AdditiveBlending,
    depthWrite: false, transparent: true, opacity: (opacity==null?0.9:opacity)
  }));
  sp.scale.set(size, size, 1);
  return sp;
}

/* floating label sprite */
function makeLabel(text, scale){
  var cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
  var cx = cv.getContext('2d');
  cx.font = '700 56px Georgia'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.shadowColor = 'rgba(0,0,0,.65)'; cx.shadowBlur = 10;
  cx.fillStyle = '#fff3e2';
  cx.fillText(text, 256, 64);
  var sp = new T.Sprite(new T.SpriteMaterial({
    map: new T.CanvasTexture(cv), transparent: true, depthWrite: false
  }));
  var s = scale || 4.6;
  sp.scale.set(s, s*0.25, 1);
  return sp;
}

/* hanging wooden sign with painted text */
function makeSign(text, w){
  w = w || 4.4;
  var cv = document.createElement('canvas'); cv.width = 512; cv.height = 160;
  var cx = cv.getContext('2d');
  cx.fillStyle = '#2c2658';
  cx.beginPath();
  if(cx.roundRect) cx.roundRect(8, 8, 496, 144, 36); else cx.rect(8, 8, 496, 144);
  cx.fill();
  cx.strokeStyle = '#ffe28a'; cx.lineWidth = 6;
  if(cx.roundRect) cx.roundRect(8, 8, 496, 144, 36); else cx.rect(8, 8, 496, 144);
  cx.stroke();
  cx.font = '700 64px Georgia'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.fillStyle = '#fff3e2';
  cx.fillText(text, 256, 84);
  var m = new T.Mesh(new T.PlaneGeometry(w, w*0.3125),
    new T.MeshBasicMaterial({map: new T.CanvasTexture(cv), transparent: true, side: T.DoubleSide}));
  return m;
}

/* place a loaded template: clone, scale-to-size, ground, rotate, collider, glow */
function place(tpl, o){
  var obj = tpl.clone(true);
  normalizeScale(obj, o.size || 4);
  var m = measure(obj);
  var gy = W.groundY(o.x, o.z);
  var wrap = new T.Group();
  wrap.position.set(o.x, gy, o.z);
  wrap.userData._asset = true;
  obj.position.y = -m.minY + (o.sink || 0);
  obj.rotation.y = o.ry || 0;
  if(o.jitter){
    var j = 1 + (sRnd((o.seed||1) + 99) - 0.5) * o.jitter;
    obj.scale.multiplyScalar(j);
  }
  wrap.add(obj);
  if(o.glow){
    var gl = makeGlow(o.glow, o.glowOp);
    gl.position.y = o.glowY || (o.size || 4) * 0.8;
    wrap.add(gl);
  }
  W.scene.add(wrap);
  if(o.collider){
    try{ (W.staticColliders = W.staticColliders || []).push({x:o.x, z:o.z, r:o.collider}); }catch(_){}
  }
  return wrap;
}

/* string lights: drooping catenary-ish spline + emissive warm bulbs */
var bulbGeo = null, bulbMat = null, wireMat = null;
function stringLights(x1, z1, x2, z2, h){
  try{
    h = h || 3.1;
    var y1 = W.groundY(x1, z1) + h, y2 = W.groundY(x2, z2) + h;
    var mid = new T.Vector3((x1+x2)/2, Math.min(y1,y2) - 0.85, (z1+z2)/2);
    var curve = new T.CatmullRomCurve3([
      new T.Vector3(x1, y1, z1), mid, new T.Vector3(x2, y2, z2)
    ]);
    if(!wireMat) wireMat = new T.MeshBasicMaterial({color: 0x3a2a1a});
    var wire = new T.Mesh(new T.TubeGeometry(curve, 20, 0.022, 5), wireMat);
    W.scene.add(wire);
    if(!bulbGeo) bulbGeo = new T.SphereGeometry(0.09, 8, 6);
    if(!bulbMat) bulbMat = new T.MeshBasicMaterial({color: 0xffd97a});
    var dist = Math.hypot(x2-x1, z2-z1);
    var n = Math.max(3, Math.round(dist / 1.4));
    var bulbs = new T.InstancedMesh(bulbGeo, bulbMat, n);
    var M = new T.Matrix4();
    for(var i=0;i<n;i++){
      var p = curve.getPoint((i+0.5)/n);
      p.y -= 0.12;   // bulbs hang just under the wire
      M.makeTranslation(p.x, p.y, p.z);
      bulbs.setMatrixAt(i, M);
    }
    bulbs.instanceMatrix.needsUpdate = true;
    W.scene.add(bulbs);
    var gl = makeGlow(2.4, 0.35);
    var mp = curve.getPoint(0.5);
    gl.position.set(mp.x, mp.y, mp.z);
    W.scene.add(gl);
  }catch(e){}
}

/* ---------------- tap registry + chain-safe wrapper ----------------
   Buildings register tap groups (userData.kvTap='kvb-<id>'). Our
   wrapper runs BEFORE the previous handler (game/daily). Re-chain
   logic: only re-wrap when the game itself swapped W.onTap out from
   under us (deco mode); never re-wrap another stream's wrapper, so
   the chain never grows. */
var tapGroups = [];
var tapHandlers = {};   // 'kvb-<id>' -> fn
function registerTap(group, id, fn){
  group.userData.kvTap = 'kvb-' + id;
  tapGroups.push(group);
  tapHandlers['kvb-' + id] = fn;
}
var _ray = null, _ndc = null;
function chainVisible(o){
  while(o){ if(o.visible === false) return false; o = o.parent; }
  return true;
}
function pickTap(x, y){
  try{
    var T_ = T, W_ = W;
    if(!T_ || !W_ || !W_.camera || !W_.renderer) return null;
    _ray = _ray || new T_.Raycaster();
    _ndc = _ndc || new T_.Vector2();
    var r = W_.renderer.domElement.getBoundingClientRect();
    _ndc.x = ((x - r.left) / r.width) * 2 - 1;
    _ndc.y = -((y - r.top) / r.height) * 2 + 1;
    _ray.setFromCamera(_ndc, W_.camera);
    var hits = _ray.intersectObjects(tapGroups, true);
    for(var i=0;i<hits.length;i++){
      var o = hits[i].object;
      if(!chainVisible(o)) continue;      // hidden gift markers never intercept
      while(o && !o.userData.kvTap) o = o.parent;
      if(o && chainVisible(o)) return o.userData.kvTap;
    }
    return null;
  }catch(e){ return null; }
}
function zoneTap(x, y){
  var id = pickTap(x, y);
  if(!id) return false;
  var fn = tapHandlers[id];
  if(fn){ try{ fn(); }catch(e){} return true; }
  return false;
}
var myTap = null, wrappedPrev = null;
function chainTap(){
  try{
    var W_ = window.__kvWorld;
    if(!W_ || W_ !== W) return;
    var cur = W_.onTap;
    if(myTap && cur === myTap) return;
    if(cur && cur._kvB) return;      // our wrapper already on top
    var prev = cur;
    var fn = function(x, y){
      try{
        if(!W.decoMode){
          if(zoneTap(x, y)) return true;
          if(KVWarmth.rhythmTap(x, y)) return true;
        }
      }catch(e){}
      if(prev){ try{ return prev(x, y); }catch(e){} }
    };
    fn._kvB = true;
    myTap = fn; wrappedPrev = prev;
    W_.onTap = fn;
  }catch(e){}
}
function rechTap(){
  try{
    var W_ = window.__kvWorld;
    if(!W_ || !myTap) return;
    var cur = W_.onTap;
    if(cur === myTap) return;
    if(cur && (cur._kvB || cur._kvWrapped)) return;  // a stream wrapper on top — we're beneath it
    /* the game itself assigned a fresh handler (late Ct, deco exit):
       re-wrap once so buildings stay tappable */
    if(cur === wrappedPrev || (wrappedPrev === null && cur !== null)) chainTap();
  }catch(e){}
}

/* ---------------- partner mesh finder ----------------
   Both spirits are built by S() (userData.rig set); the player's own
   mesh is W.player.mesh — the partner is the other rigged group. */
var _partnerMesh = null, _partnerScanT = 0;
function playerPos(){
  try{
    var p = W.player;
    if(!p) return null;
    if(p.mesh && p.mesh.position) return {x: p.mesh.position.x, z: p.mesh.position.z, y: p.mesh.position.y};
    if(typeof p.x === 'number') return {x: p.x, z: p.z, y: 0};
    return null;
  }catch(e){ return null; }
}
function findPartnerMesh(force){
  var now = performance.now();
  if(!force && _partnerMesh && _partnerMesh.parent && now - _partnerScanT < 2000) return _partnerMesh;
  _partnerScanT = now;
  _partnerMesh = null;
  try{
    var pm = W.player && W.player.mesh ? W.player.mesh : null;
    var best = null, bestH = 0;
    W.scene.traverse(function(o){
      if(best || !o.isGroup || o === pm) return;
      var ud = o.userData || {};
      if(!ud.rig) return;
      _box.setFromObject(o); _box.getSize(_s);
      if(_s.y > 1.2 && _s.y > bestH){ bestH = _s.y; best = o; }  // a spirit, not a pet
    });
    _partnerMesh = best;
  }catch(e){}
  return _partnerMesh;
}
function partnerPos(){
  try{
    var m = findPartnerMesh(false);
    if(!m || !m.position) return null;
    return {x: m.position.x, z: m.position.z, y: m.position.y, mesh: m};
  }catch(e){ return null; }
}

/* ---------------- KVRitual access (daily stream's premium shell) ---------------- */
function ritual(){
  try{ return (typeof KVRitual !== 'undefined') ? KVRitual : (window.KVRitual || null); }
  catch(e){ return null; }
}
function rOpen(kicker, bodyNode, footHtml){
  var R = ritual();
  if(!R){ toast('the island is still waking up…'); return false; }
  try{
    R.setKicker(kicker); R.setBody(bodyNode); R.setFoot(footHtml || '');
    R.open(); return true;
  }catch(e){ return false; }
}
function rEl(tag, cls, html){
  var R = ritual();
  if(R && R.el) return R.el(tag, cls, html);
  var d = document.createElement(tag);
  if(cls) d.className = cls;
  if(html != null) d.innerHTML = html;
  return d;
}
function esc(s){
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function kvBtn(label, primary){
  var b = rEl('button', 'kv-btn' + (primary === false ? ' ghost' : ''), label);
  return b;
}

/* ---------------- frame loop: rings, fireflies, glows, beats ---------------- */
var tickers = [];   // fn(dt, t)
var _lastT = 0;
function frameLoop(){
  requestAnimationFrame(frameLoop);
  try{
    var now = performance.now() / 1000;
    var dt = _lastT ? Math.min(0.1, now - _lastT) : 0.016;
    _lastT = now;
    for(var i=0;i<tickers.length;i++){
      try{ tickers[i](dt, now); }catch(e){}
    }
    /* sweep one-shot tickers (bursts/glows mark themselves _dead) */
    if(!frameLoop._sweep || now - frameLoop._sweep > 5){
      frameLoop._sweep = now;
      tickers = tickers.filter(function(f){ return !f._dead; });
    }
  }catch(e){}
}

/* ============================================================
   3D BUILDINGS
   Bookshop (-22,-8 village) · Lighthouse/Beacon (100,38 harbor) ·
   Theatre (-45,30 meadow) · Memory Cottage (-25,-115 gardens)
   ============================================================ */
var SITE = {
  bookshop: {x:-22, z:-8, ry:1.19},
  beacon:   {x:100, z:38},
  theatre:  {x:-45, z:30},
  cottage:  {x:-25, z:-115, ry:0.3}
};

/* modest code-built fallback hut if a GLB fails (keeps the feature alive) */
function fallbackHut(wallC, roofC){
  var g = new T.Group();
  var walls = new T.Mesh(new T.BoxGeometry(3.6,2.4,3.0), mat(wallC));
  walls.position.y = 1.2; g.add(walls);
  var roof = new T.Mesh(new T.ConeGeometry(2.9,1.6,4), mat(roofC));
  roof.position.y = 3.2; roof.rotation.y = Math.PI/4; g.add(roof);
  var door = new T.Mesh(new T.BoxGeometry(0.9,1.6,0.1), mat(0x6b422a));
  door.position.set(0,0.8,1.53); g.add(door);
  var win = new T.Mesh(new T.BoxGeometry(0.8,0.7,0.1),
    new T.MeshBasicMaterial({color:0xffe28a}));
  win.position.set(-1.1,1.5,1.53); g.add(win);
  return g;
}

/* ---------- BOOKSHOP ---------- */
function buildBookshop(){
  var s = SITE.bookshop;
  var gy = W.groundY(s.x, s.z);
  var g = new T.Group();
  g.position.set(s.x, gy, s.z);
  g.rotation.y = s.ry;
  g.userData._asset = true;
  W.scene.add(g);

  getModel('village/inn.glb', function(tpl){
    if(tpl){
      var obj = tpl.clone(true);
      normalizeScale(obj, 7.5);
      var m = measure(obj);
      obj.position.y = -m.minY;
      g.add(obj);
    }else{
      g.add(fallbackHut(0xf6ead2, 0x2e8f8a));
    }
  });

  /* book displays out front — the shop "looks like" its purpose */
  function front(fwd, side){
    /* local (side, fwd) rotated by s.ry around Y:
       x' = side*cos + fwd*sin ; z' = -side*sin + fwd*cos */
    var c = Math.cos(s.ry), sn = Math.sin(s.ry);
    return {x: s.x + side*c + fwd*sn, z: s.z - side*sn + fwd*c};
  }
  var fx = Math.sin(s.ry), fz = Math.cos(s.ry);   // front dir (local +z rotated)
  /* display table with book stacks + candlestick */
  getModel('interior/table-large.glb', function(tpl){
    if(!tpl) return;
    var p = front(4.6, -1.6);
    var wrap = place(tpl, {x:p.x, z:p.z, ry:0.4, size:2.2});
    getModel('interior/book-stack-1.glb', function(t2){
      if(!t2) return;
      var o2 = t2.clone(true); normalizeScale(o2, 0.9);
      o2.position.set(p.x - 0.5, W.groundY(p.x, p.z) + 1.05, p.z);
      o2.rotation.y = 0.3; W.scene.add(o2);
    });
    getModel('interior/book-stack-2.glb', function(t2){
      if(!t2) return;
      var o2 = t2.clone(true); normalizeScale(o2, 0.9);
      o2.position.set(p.x + 0.5, W.groundY(p.x, p.z) + 1.05, p.z + 0.2);
      o2.rotation.y = -0.4; W.scene.add(o2);
    });
    getModel('interior/candlestick-triple.glb', function(t2){
      if(!t2) return;
      var o2 = t2.clone(true); normalizeScale(o2, 1.0);
      var yy = W.groundY(p.x, p.z);
      o2.position.set(p.x, yy + 1.05, p.z - 0.7);
      W.scene.add(o2);
      var gl = makeGlow(2.2, 0.8); gl.position.set(p.x, yy + 2.1, p.z - 0.7);
      W.scene.add(gl);
    });
  });
  /* bookcases flanking the entrance */
  getModel('interior/bookcase.glb', function(tpl){
    if(!tpl) return;
    [-2.4, 2.4].forEach(function(dz, i){
      var p = front(3.4, dz);
      var o = tpl.clone(true); normalizeScale(o, 2.6);
      var m = measure(o);
      o.position.set(p.x, W.groundY(p.x, p.z) - m.minY, p.z);
      o.rotation.y = s.ry + (i ? -0.35 : 0.35);
      W.scene.add(o);
    });
  });
  /* reading chair + banner + shelf with potion */
  getModel('interior/chair.glb', function(tpl){
    if(!tpl) return;
    var p = front(5.2, 1.8);
    place(tpl, {x:p.x, z:p.z, ry:s.ry + 2.6, size:1.4});
  });
  /* banner.glb removed — rendered as an illegible dark blob against the
     sign; the shop reads clearly without it (sign + displays + porch) */
  getModel('interior/shelf.glb', function(tpl){
    if(!tpl) return;
    var p = front(3.2, -3.4);
    var o = tpl.clone(true); normalizeScale(o, 1.6);
    var yy = W.groundY(p.x, p.z);
    o.position.set(p.x, yy + 1.3, p.z);
    o.rotation.y = s.ry + 0.5;
    W.scene.add(o);
    getModel('interior/potion.glb', function(t2){
      if(!t2) return;
      var o2 = t2.clone(true); normalizeScale(o2, 0.5);
      o2.position.set(p.x, yy + 1.75, p.z);
      W.scene.add(o2);
    });
  });
  /* hanging BOOKSHOP sign on posts */
  var sign = makeSign('\u{1F4DA} BOOKSHOP', 4.6);
  var sp = front(6.4, 0);
  var sy = W.groundY(sp.x, sp.z);
  var post1 = new T.Mesh(new T.CylinderGeometry(0.09,0.11,3.4,6), mat(0x6b422a));
  post1.position.set(sp.x - 2.2, sy + 1.7, sp.z); W.scene.add(post1);
  var post2 = post1.clone(); post2.position.x = sp.x + 2.2; W.scene.add(post2);
  var beam = new T.Mesh(new T.CylinderGeometry(0.07,0.07,4.6,6), mat(0x6b422a));
  beam.rotation.z = Math.PI/2; beam.position.set(sp.x, sy + 3.3, sp.z); W.scene.add(beam);
  sign.position.set(sp.x, sy + 2.45, sp.z); sign.rotation.y = s.ry;
  W.scene.add(sign);
  var label = makeLabel('\u2726 bookshop \u2726', 4.6);
  label.position.set(s.x, gy + 8.6, s.z); W.scene.add(label);

  /* generous tap proxy so the whole shopfront is tappable */
  var proxy = new T.Mesh(new T.CylinderGeometry(5.5, 5.5, 10, 10),
    new T.MeshBasicMaterial({transparent:true, opacity:0, depthWrite:false}));
  proxy.position.y = 5; g.add(proxy);

  try{ (W.staticColliders = W.staticColliders || []).push({x:s.x, z:s.z, r:3.4}); }catch(_){}
  registerTap(g, 'bookshop', function(){ KVDecks.open(); });
  return g;
}

/* ---------- LIGHTHOUSE / BEACON ---------- */
var beaconFx = { lampGlow:null, beam:null, beam2:null, rings:[], lampY:0, cx:0, cz:0 };
function buildLighthouse(){
  var s = SITE.beacon;
  var gy = W.groundY(s.x, s.z);
  var g = new T.Group();
  g.position.set(s.x, gy, s.z);
  g.userData._asset = true;
  W.scene.add(g);
  beaconFx.cx = s.x; beaconFx.cz = s.z;

  var stone = mat(0x9a9aa5), stoneD = mat(0x7e7e88);
  function tier(rTop, rBot, h, y){
    var m = new T.Mesh(new T.CylinderGeometry(rTop, rBot, h, 12), stone);
    m.position.y = y + h/2; g.add(m); return m;
  }
  var y = 0.6;
  tier(1.55, 1.95, 1.2, y); y += 1.2;                 // base
  tier(1.30, 1.55, 2.6, y); y += 2.6;                 // lower tower
  tier(1.05, 1.30, 2.6, y); y += 2.6;                 // mid tower
  tier(0.88, 1.05, 2.2, y); y += 2.2;                 // upper tower
  /* gallery */
  var gal = new T.Mesh(new T.CylinderGeometry(1.55, 1.35, 0.4, 12), stoneD);
  gal.position.y = y + 0.2; g.add(gal); y += 0.4;
  /* lamp room: emissive warm glass */
  var lampY = y + 0.75;
  var glass = new T.Mesh(new T.CylinderGeometry(0.85, 0.85, 1.5, 12),
    new T.MeshBasicMaterial({color:0xffe9b0}));
  glass.position.y = lampY; g.add(glass);
  /* mullions */
  for(var i=0;i<4;i++){
    var bar = new T.Mesh(new T.BoxGeometry(0.09, 1.5, 0.09), stoneD);
    var a = i * Math.PI/2 + Math.PI/4;
    bar.position.set(Math.cos(a)*0.85, lampY, Math.sin(a)*0.85);
    g.add(bar);
  }
  /* roof */
  var roof = new T.Mesh(new T.ConeGeometry(1.25, 1.1, 12), mat(0xa33b4e));
  roof.position.y = y + 1.5 + 0.55; g.add(roof);
  /* door + windows (windows sit proud of the tapered tower surface) */
  var door = new T.Mesh(new T.BoxGeometry(0.9, 1.7, 0.12), mat(0x4a2f1c));
  door.position.set(0, 1.45, 1.70); g.add(door);
  [[3.6, 1.40], [6.0, 1.17]].forEach(function(w){
    var win = new T.Mesh(new T.BoxGeometry(0.5, 0.65, 0.1),
      new T.MeshBasicMaterial({color:0xffd97a}));
    win.position.set(0, w[0], w[1]); g.add(win);
  });
  /* glow + rotating beams */
  var gl = makeGlow(7, 0.85);
  gl.position.y = lampY; g.add(gl);
  beaconFx.lampGlow = gl;
  beaconFx.lampY = gy + lampY;
  var beamMat = new T.MeshBasicMaterial({color:0xffe9b0, transparent:true, opacity:0.09,
    blending:T.AdditiveBlending, depthWrite:false, side:T.DoubleSide});
  function beam(){
    var b = new T.Mesh(new T.PlaneGeometry(18, 1.4), beamMat);
    b.position.y = lampY;
    b.geometry.translate(9, 0, 0);   // pivot at the lamp
    g.add(b); return b;
  }
  beaconFx.beam = beam();
  beaconFx.beam2 = beam(); beaconFx.beam2.rotation.y = Math.PI;
  tickers.push(function(dt, t){
    try{
      if(beaconFx.beam){ beaconFx.beam.rotation.y = t * 0.35; beaconFx.beam2.rotation.y = t * 0.35 + Math.PI; }
      if(beaconFx.lampGlow){
        var p = 0.8 + 0.2 * Math.sin(t * 2.1) + (KVBeacon.ritualActive() ? 0.5 : 0);
        beaconFx.lampGlow.material.opacity = Math.min(1, p);
      }
    }catch(e){}
  });
  /* rocks around the base */
  getModel('nature/rock.glb', function(tpl){
    if(!tpl) return;
    [[3.4, 0.6], [-3.0, 2.2], [0.8, -3.6]].forEach(function(p, i){
      var o = tpl.clone(true); normalizeScale(o, 1.6 + i*0.4);
      var m = measure(o);
      o.position.set(s.x + p[0], W.groundY(s.x + p[0], s.z + p[1]) - m.minY - 0.2, s.z + p[1]);
      o.rotation.y = i * 1.3;
      W.scene.add(o);
    });
  });
  var label = makeLabel('\u2726 beacon \u2726', 4.2);
  label.position.set(s.x, gy + 12.6, s.z); W.scene.add(label);

  try{ (W.staticColliders = W.staticColliders || []).push({x:s.x, z:s.z, r:2.8}); }catch(_){}
  registerTap(g, 'beacon', function(){ KVBeacon.tap(); });
  return g;
}

/* ---------- THEATRE (amphitheater + campfire) ---------- */
var theatreFx = { flame:null, flameIn:null, glow:null, swing:null, swingT:0 };
function buildTheatre(){
  var s = SITE.theatre;
  var gy = W.groundY(s.x, s.z);
  var g = new T.Group();
  g.position.set(s.x, gy, s.z);
  g.userData._asset = true;
  W.scene.add(g);

  var stone = mat(0x8f8f9a);
  /* 3 stepped seating rings, 10 segments each */
  for(var tier=0; tier<3; tier++){
    var R = 5 + tier * 2.3, yy = 0.35 + tier * 0.62;
    for(var i=0;i<10;i++){
      var a = (i/10) * Math.PI * 2;
      var bench = new T.Mesh(new T.BoxGeometry(2.9, 0.55, 0.8), stone);
      bench.position.set(Math.cos(a)*R, yy, Math.sin(a)*R);
      bench.rotation.y = -a + Math.PI/2;
      g.add(bench);
    }
  }
  /* fire pit: stone ring + logs + flame */
  getModel('nature/rock.glb', function(tpl){
    for(var i=0;i<8;i++){
      var a = (i/8) * Math.PI * 2;
      var rk;
      if(tpl){ rk = tpl.clone(true); normalizeScale(rk, 0.7); }
      else { rk = new T.Mesh(new T.IcosahedronGeometry(0.35, 0), mat(0x7e7e88)); }
      var m = measure(rk);
      rk.position.set(s.x + Math.cos(a)*1.3, gy - m.minY, s.z + Math.sin(a)*1.3);
      W.scene.add(rk);
    }
  });
  var wood = mat(0x5a3a22);
  for(var l=0;l<4;l++){
    var a = l * Math.PI/4 + 0.4;
    var log = new T.Mesh(new T.CylinderGeometry(0.14, 0.14, 1.6, 6), wood);
    log.position.set(s.x, gy + 0.35, s.z);
    log.rotation.z = Math.PI/2.6; log.rotation.y = a;
    W.scene.add(log);
  }
  var flame = new T.Mesh(new T.ConeGeometry(0.55, 1.25, 8),
    new T.MeshBasicMaterial({color:0xff9a3c}));
  flame.position.set(s.x, gy + 1.0, s.z); W.scene.add(flame);
  var flameIn = new T.Mesh(new T.ConeGeometry(0.28, 0.8, 8),
    new T.MeshBasicMaterial({color:0xffe9b0}));
  flameIn.position.set(s.x, gy + 0.85, s.z); W.scene.add(flameIn);
  var fglow = makeGlow(5.5, 0.75);
  fglow.position.set(s.x, gy + 1.4, s.z); W.scene.add(fglow);
  theatreFx.flame = flame; theatreFx.flameIn = flameIn; theatreFx.glow = fglow;
  tickers.push(function(dt, t){
    try{
      if(theatreFx.flame){
        var f = 1 + 0.16*Math.sin(t*9.3) + 0.08*Math.sin(t*17.7);
        theatreFx.flame.scale.set(f, 1 + 0.22*Math.sin(t*11.1), f);
        theatreFx.flameIn.scale.set(2-f, 1 + 0.18*Math.sin(t*12.7+1), 2-f);
        theatreFx.glow.material.opacity = 0.6 + 0.2*Math.sin(t*7.7);
      }
      if(theatreFx.swing){
        theatreFx.swingT += dt;
        theatreFx.swing.rotation.x = Math.sin(theatreFx.swingT*0.9)*0.07;
      }
    }catch(e){}
  });
  /* swing bench: bench GLB hung by ropes from a wooden frame */
  (function(){
    var sx = s.x + 12, sz = s.z;
    var sgy = W.groundY(sx, sz);
    var frame = new T.Group();
    frame.position.set(sx, sgy, sz);
    frame.userData._asset = true;
    W.scene.add(frame);
    var post1 = new T.Mesh(new T.CylinderGeometry(0.12,0.15,2.9,6), wood);
    post1.position.set(-1.5, 1.45, 0); frame.add(post1);
    var post2 = post1.clone(); post2.position.x = 1.5; frame.add(post2);
    var beamTop = new T.Mesh(new T.CylinderGeometry(0.1,0.1,3.4,6), wood);
    beamTop.rotation.z = Math.PI/2; beamTop.position.y = 2.85; frame.add(beamTop);
    var swinger = new T.Group(); swinger.position.y = 2.8; frame.add(swinger);
    theatreFx.swing = swinger;
    getModel('interior/bench.glb', function(tpl){
      var seat;
      if(tpl){ seat = tpl.clone(true); normalizeScale(seat, 2.0); }
      else { seat = new T.Mesh(new T.BoxGeometry(1.8, 0.18, 0.6), wood); }
      var m = measure(seat);
      seat.position.y = -2.0 - m.minY;
      swinger.add(seat);
      var ropeM = mat(0x8a6a3a);
      [-0.8, 0.8].forEach(function(dx){
        [-0.22, 0.22].forEach(function(dz){
          var rope = new T.Mesh(new T.CylinderGeometry(0.03,0.03,2.0,5), ropeM);
          rope.position.set(dx, -1.0, dz);
          swinger.add(rope);
        });
      });
    });
    var slabel = makeLabel('\u2726 swing \u2726', 3.2);
    slabel.position.set(sx, sgy + 4.1, sz); W.scene.add(slabel);
    try{ W.staticColliders.push({x:sx-1.5, z:sz, r:0.5}); W.staticColliders.push({x:sx+1.5, z:sz, r:0.5}); }catch(_){}
  })();
  var label = makeLabel('\u2726 theatre \u2726', 4.6);
  label.position.set(s.x, gy + 6.4, s.z); W.scene.add(label);

  /* tap proxy over the fire-pit stage */
  var proxy = new T.Mesh(new T.CylinderGeometry(4.5, 4.5, 5, 10),
    new T.MeshBasicMaterial({transparent:true, opacity:0, depthWrite:false}));
  proxy.position.y = 2.5; g.add(proxy);

  /* colliders: fire pit + outer ring segments */
  try{
    W.staticColliders.push({x:s.x, z:s.z, r:1.8});
    for(var c=0;c<8;c++){
      var a = (c/8)*Math.PI*2;
      W.staticColliders.push({x:s.x + Math.cos(a)*9.6, z:s.z + Math.sin(a)*9.6, r:1.4});
    }
  }catch(_){}
  registerTap(g, 'theatre', function(){ KVGames.open(); });
  return g;
}

/* ---------- MEMORY COTTAGE ---------- */
var giftSpots = { Adi:{x:-21, z:-110}, Tara:{x:-29, z:-119} };
function buildCottage(){
  var s = SITE.cottage;
  var gy = W.groundY(s.x, s.z);
  var g = new T.Group();
  g.position.set(s.x, gy, s.z);
  g.rotation.y = s.ry;
  g.userData._asset = true;
  W.scene.add(g);

  getModel('village/house-stone.glb', function(tpl){
    if(tpl){
      var obj = tpl.clone(true);
      normalizeScale(obj, 7);
      var m = measure(obj);
      obj.position.y = -m.minY;
      g.add(obj);
    }else{
      g.add(fallbackHut(0xd8cfc0, 0x8a5a3a));
    }
  });
  /* garden: fences, flowers, stepping stones, tea spot */
  getModel('village/fence-wood.glb', function(tpl){
    if(!tpl) return;
    for(var i=0;i<6;i++){
      var a = Math.PI*0.15 + (i/6)*Math.PI*1.1;
      var px = s.x + Math.cos(a)*7.5, pz = s.z + Math.sin(a)*7.5;
      var o = tpl.clone(true); normalizeScale(o, 2.6);
      var m = measure(o);
      o.position.set(px, W.groundY(px,pz) - m.minY, pz);
      o.rotation.y = -a + Math.PI/2;
      W.scene.add(o);
    }
  });
  getModel('nature/flowers.glb', function(tpl){
    if(!tpl) return;
    [[-4,3],[3.5,2.5],[-1,-4.5],[5,-2]].forEach(function(p, i){
      var px = s.x + p[0], pz = s.z + p[1];
      var o = tpl.clone(true); normalizeScale(o, 1.4);
      var m = measure(o);
      o.position.set(px, W.groundY(px,pz) - m.minY, pz);
      o.rotation.y = i * 1.7;
      W.scene.add(o);
    });
  });
  getModel('nature/bush-flowers.glb', function(tpl){
    if(!tpl) return;
    [[-5.5,-1],[5.5,0.5]].forEach(function(p, i){
      var px = s.x + p[0], pz = s.z + p[1];
      var o = tpl.clone(true); normalizeScale(o, 2.0);
      var m = measure(o);
      o.position.set(px, W.groundY(px,pz) - m.minY, pz);
      o.rotation.y = i * 2.4;
      W.scene.add(o);
    });
  });
  getModel('nature/stepping-stone.glb', function(tpl){
    if(!tpl) return;
    for(var i=0;i<4;i++){
      var px = s.x - 1.5 + i*1.1, pz = s.z + 5.5 + i*1.6;
      var o = tpl.clone(true); normalizeScale(o, 1.1);
      var m = measure(o);
      o.position.set(px, W.groundY(px,pz) - m.minY + 0.05, pz);
      o.rotation.y = i * 0.8;
      W.scene.add(o);
    }
  });
  /* tea spot: table + chair */
  getModel('interior/table-large.glb', function(tpl){
    if(!tpl) return;
    place(tpl, {x:s.x+5.5, z:s.z+4.5, ry:0.5, size:2.0});
    getModel('interior/chair.glb', function(t2){
      if(t2) place(t2, {x:s.x+4.2, z:s.z+5.6, ry:2.4, size:1.4});
    });
    getModel('interior/candle.glb', function(t2){
      if(!t2) return;
      var o = t2.clone(true); normalizeScale(o, 0.7);
      var yy = W.groundY(s.x+5.5, s.z+4.5);
      o.position.set(s.x+5.5, yy + 1.0, s.z+4.5);
      W.scene.add(o);
      var gl = makeGlow(1.8, 0.7); gl.position.set(s.x+5.5, yy + 1.7, s.z+4.5);
      W.scene.add(gl);
    });
  });
  /* lantern posts flanking the door */
  getModel('plaza/lantern-post.glb', function(tpl){
    if(!tpl) return;
    [-2.2, 2.2].forEach(function(dx){
      var px = s.x + dx, pz = s.z + 3.6;
      var o = tpl.clone(true); normalizeScale(o, 2.6);
      var m = measure(o);
      o.position.set(px, W.groundY(px,pz) - m.minY, pz);
      W.scene.add(o);
      var gl = makeGlow(2.0, 0.75);
      gl.position.set(px, W.groundY(px,pz) + 2.5, pz);
      W.scene.add(gl);
    });
  });
  var label = makeLabel('\u2726 memory cottage \u2726', 5.2);
  label.position.set(s.x, gy + 8.2, s.z); W.scene.add(label);

  try{ (W.staticColliders = W.staticColliders || []).push({x:s.x, z:s.z, r:3.2}); }catch(_){}
  registerTap(g, 'memories', function(){ KVMemories.open(); });
  return g;
}

/* ---------- string lights: plaza loop + village street + theatre ---------- */
function buildStringLights(){
  /* plaza loop (new v2 lantern posts at the corners) */
  var posts = [[-8,-2],[8,-2],[8,-14],[-8,-14]];
  getModel('plaza/lantern-post.glb', function(tpl){
    posts.forEach(function(p, i){
      var o;
      if(tpl){ o = tpl.clone(true); normalizeScale(o, 2.8); }
      else { o = new T.Mesh(new T.CylinderGeometry(0.09,0.12,2.8,6), mat(0x4a3a2a)); o.position.y = 1.4; var gw = new T.Group(); gw.add(o); o = gw; }
      var m = measure(o);
      o.position.set(p[0], W.groundY(p[0],p[1]) - m.minY, p[1]);
      W.scene.add(o);
      var gl = makeGlow(2.2, 0.7);
      gl.position.set(p[0], W.groundY(p[0],p[1]) + 2.75, p[1]);
      W.scene.add(gl);
      try{ W.staticColliders.push({x:p[0], z:p[1], r:0.4}); }catch(_){}
      var q = posts[(i+1)%posts.length];
      stringLights(p[0], p[1], q[0], q[1], 2.9);
    });
  });
  /* village street */
  getModel('plaza/lantern-post.glb', function(tpl){
    [[-16,4],[-4,16],[-26,10]].forEach(function(p, i, arr){
      var o;
      if(tpl){ o = tpl.clone(true); normalizeScale(o, 2.8); }
      else { o = new T.Mesh(new T.CylinderGeometry(0.09,0.12,2.8,6), mat(0x4a3a2a)); o.position.y = 1.4; var gw = new T.Group(); gw.add(o); o = gw; }
      var m = measure(o);
      o.position.set(p[0], W.groundY(p[0],p[1]) - m.minY, p[1]);
      W.scene.add(o);
      var gl = makeGlow(2.2, 0.7);
      gl.position.set(p[0], W.groundY(p[0],p[1]) + 2.75, p[1]);
      W.scene.add(gl);
      try{ W.staticColliders.push({x:p[0], z:p[1], r:0.4}); }catch(_){}
      if(i < arr.length-1){ var q = arr[i+1]; stringLights(p[0], p[1], q[0], q[1], 2.9); }
    });
  });
  /* theatre ring */
  (function(){
    var s = SITE.theatre, pts = [];
    for(var i=0;i<4;i++){
      var a = Math.PI/4 + i*Math.PI/2;
      pts.push([s.x + Math.cos(a)*11.5, s.z + Math.sin(a)*11.5]);
    }
    getModel('plaza/lantern-post.glb', function(tpl){
      pts.forEach(function(p, i){
        var o;
        if(tpl){ o = tpl.clone(true); normalizeScale(o, 2.8); }
        else { o = new T.Mesh(new T.CylinderGeometry(0.09,0.12,2.8,6), mat(0x4a3a2a)); o.position.y = 1.4; var gw = new T.Group(); gw.add(o); o = gw; }
        var m = measure(o);
        o.position.set(p[0], W.groundY(p[0],p[1]) - m.minY, p[1]);
        W.scene.add(o);
        var gl = makeGlow(2.2, 0.7);
        gl.position.set(p[0], W.groundY(p[0],p[1]) + 2.75, p[1]);
        W.scene.add(gl);
        try{ W.staticColliders.push({x:p[0], z:p[1], r:0.4}); }catch(_){}
        var q = pts[(i+1)%pts.length];
        stringLights(p[0], p[1], q[0], q[1], 2.9);
      });
    });
  })();
  /* bookshop porch posts */
  (function(){
    var s = SITE.bookshop;
    var fx = Math.sin(s.ry), fz = Math.cos(s.ry);
    var p1 = [s.x + fx*6.4 - fz*3.2, s.z + fz*6.4 + fx*3.2];
    var p2 = [s.x + fx*6.4 + fz*3.2, s.z + fz*6.4 - fx*3.2];
    getModel('plaza/lantern-post.glb', function(tpl){
      [p1, p2].forEach(function(p){
        var o;
        if(tpl){ o = tpl.clone(true); normalizeScale(o, 2.6); }
        else { o = new T.Mesh(new T.CylinderGeometry(0.09,0.12,2.6,6), mat(0x4a3a2a)); o.position.y = 1.3; var gw = new T.Group(); gw.add(o); o = gw; }
        var m = measure(o);
        o.position.set(p[0], W.groundY(p[0],p[1]) - m.minY, p[1]);
        W.scene.add(o);
        var gl = makeGlow(2.0, 0.7);
        gl.position.set(p[0], W.groundY(p[0],p[1]) + 2.55, p[1]);
        W.scene.add(gl);
      });
      stringLights(p1[0], p1[1], p2[0], p2[1], 2.7);
    });
  })();
}

/* ============================================================
   KVDecks — the Bookshop's question decks
   Ports kanavu-2d/decks.js (48 cards + category tags) and the
   warmth.js date-ideas deck (20 cards). Full-screen candlelight UI
   via KVRitual. No repeats until a deck is exhausted; progress in
   localStorage kanavu.decks.v1.
   ============================================================ */
var KVDecks = (function(){
  var LS_KEY = 'kanavu.decks.v1';
  var TAG_LABELS = {
    'together-online': '\u2726 online together',
    'tonight-apart': '\u2726 tonight \u00b7 apart but together',
    'someday': '\u2726 someday \u00b7 in person'
  };
  var CAT_LABELS = {
    flirty:'flirty', memories:'memories', fun:'just for fun', romance:'romance',
    emotional:'heart to heart', future:'someday', longdistance:'across the distance'
  };
  var TAGS = {"fh-01":"flirty","fh-02":"memories","fh-03":"memories","fh-04":"memories","fh-05":"memories","fh-06":"memories","fh-07":"memories","fh-08":"fun","fh-09":"memories","fh-10":"memories","fh-11":"memories","fh-12":"romance","fh-13":"emotional","fh-14":"fun","fh-15":"flirty","fh-16":"romance","dq-01":"romance","dq-02":"emotional","dq-03":"longdistance","dq-04":"emotional","dq-05":"longdistance","dq-06":"emotional","dq-07":"emotional","dq-08":"longdistance","dq-09":"future","dq-10":"emotional","dq-11":"emotional","dq-12":"longdistance","dq-13":"longdistance","dq-14":"emotional","dq-15":"memories","dq-16":"romance","dt-01":"romance","dt-02":"future","dt-03":"fun","dt-04":"fun","dt-05":"memories","dt-06":"romance","dt-07":"future","dt-08":"fun","dt-09":"romance","dt-10":"memories","dt-11":"fun","dt-12":"memories","dt-13":"future","dt-14":"fun","dt-15":"memories","dt-16":"future"};

  var DECKS = [
    { id:'first-hellos', title:'First Hellos',
      desc:'Where it all began \u2014 the guitar, the random questions, the night of May 11.',
      cards:[
        ['fh-01','What was the very first thing about me that made you look twice?'],
        ['fh-02','When I sent you the photo of my new guitar \u2014 \u201chey, I finally got one\u201d \u2014 what were you feeling in that moment?'],
        ['fh-03','What random question did I ask you back then that you still remember?'],
        ['fh-04','On May 11, 2025, when we finally admitted our feelings \u2014 what were you doing right before you typed it?'],
        ['fh-05','What song were you listening to on repeat when we first started talking?'],
        ['fh-06','What is something small from our early chats that I probably forgot, but you kept?'],
        ['fh-07','If you could relive one week from when we were just insta friends, which week would you pick?'],
        ['fh-08','What did you assume about me in the beginning that turned out to be completely wrong?'],
        ['fh-09','What was the first thing you told your friends about me?'],
        ['fh-10','What did my guitar teach you about me before I ever said a word?'],
        ['fh-11','What is the oldest screenshot you still have of our chats, and why did you keep it?'],
        ['fh-12','When did \u201cgoodnight\u201d first start feeling like a promise instead of just a word?'],
        ['fh-13','Back when this was all new \u2014 what were you afraid I would think of you?'],
        ['fh-14','If our first conversation had a movie title, what would it be?'],
        ['fh-15','What tiny detail from my profile photo hooked you first?'],
        ['fh-16','Who said \u201cI like you\u201d first in spirit, even if not in words \u2014 and how did you know?']
      ]},
    { id:'deep-questions', title:'Deep Questions',
      desc:'The 1am ones \u2014 distance, fears, reassurance, and everything we only tell each other.',
      cards:[
        ['dq-01','What\u2019s one small thing I do that instantly makes a hard day better?'],
        ['dq-02','What are you most afraid to tell me \u2014 and why do you want to tell me anyway?'],
        ['dq-03','When the distance feels heaviest, what do you need from me that you never ask for?'],
        ['dq-04','What part of you do you secretly worry is not enough for me?'],
        ['dq-05','What does \u201chome\u201d mean to you now that home is a person in another timezone?'],
        ['dq-06','What\u2019s a dream you haven\u2019t told anyone but me?'],
        ['dq-07','When I reassure you, which words actually land \u2014 and which ones miss?'],
        ['dq-08','What\u2019s the hardest part of loving someone you can\u2019t just reach out and touch?'],
        ['dq-09','What do you want our life to look like in five years \u2014 be specific, down to the street?'],
        ['dq-10','What are you proud of about us that nobody else ever sees?'],
        ['dq-11','What\u2019s something you forgave me for that I never knew hurt you?'],
        ['dq-12','If we had one teleport evening together, walk me through it minute by minute.'],
        ['dq-13','What scares you most about the day we finally close the distance?'],
        ['dq-14','What do you need to hear from me on the days you doubt us?'],
        ['dq-15','What\u2019s a memory of us you replay when you can\u2019t sleep?'],
        ['dq-16','If our love had a colour tonight, what would it be \u2014 and why?']
      ]},
    { id:'dream-together', title:'Dream Together',
      desc:'Us, someday \u2014 teleport evenings, shared cities, bubble tea rituals, and silly old-age plans.',
      cards:[
        ['dt-01','Design our dream date night \u2014 where are we, what are we eating, what is playing in the background?'],
        ['dt-02','If we had a little cottage by the sea, what would our mornings sound like?'],
        ['dt-03','Our bubble tea orders, side by side \u2014 and what does each choice say about us?'],
        ['dt-04','Teach me one Tbilisi thing and one Vancouver thing we would do on the same perfect day.'],
        ['dt-05','We\u2019re scoring a montage of us \u2014 pick three songs and the scenes they play over.'],
        ['dt-06','If we could stargaze from one place on earth tonight, where would we go \u2014 and what would you point at first?'],
        ['dt-07','Plan our first 24 hours in the same city \u2014 hour by hour, no skipping the boring parts.'],
        ['dt-08','What would our couple superpower be, and how would we use it for good?'],
        ['dt-09','Invent a tiny ritual just for us \u2014 something we\u2019d do every single day.'],
        ['dt-10','You\u2019re directing a short film of our story \u2014 what\u2019s the opening shot?'],
        ['dt-11','What would we cook together on a rainy Sunday \u2014 and who does the dishes?'],
        ['dt-12','Which OK Kanmani song plays the moment we finally live in the same city?'],
        ['dt-13','Describe the home we\u2019d decorate together \u2014 start at the front door.'],
        ['dt-14','What\u2019s the silliest argument we\u2019d have as old people?'],
        ['dt-15','If we could send one object back in time to our first-chat selves, what would it be?'],
        ['dt-16','We close the distance tomorrow \u2014 how do we spend the first week?']
      ]},
    { id:'date-ideas', title:'Date Ideas',
      desc:'Real evenings for Adi & Tara \u2014 some for tonight across the distance, some saved for someday.',
      cards:[
        ['di-01','together-online','Cook the same meal on a video call \u2014 same recipe, same time, race to plate up, then eat \u201ctogether\u201d.'],
        ['di-02','together-online','Press play on Saiyaara at the exact same second \u2014 no talking till the credits, then call and debrief.'],
        ['di-03','together-online','Guitar evening: she plays a little, he plays a little, then teach each other one brand-new chord.'],
        ['di-04','together-online','Build a 10-song \u201cus\u201d playlist together on call \u2014 no skips allowed, defend every pick.'],
        ['di-05','together-online','Rewatch your favourite OK Kanmani scene and both act it out dramatically on camera.'],
        ['di-06','together-online','Read one chapter of a romance novel aloud to each other before bed \u2014 voices and all.'],
        ['di-07','together-online','Candlelight takeout date: same cuisine, candles lit, phones propped up, fancy like a restaurant.'],
        ['di-08','together-online','Ask the three questions you\u2019re scared to ask \u2014 honest answers only, no deflecting.'],
        ['di-09','tonight-apart','Stargaze at the same time and describe your sky to each other \u2014 hers over Tbilisi, his over Vancouver.'],
        ['di-10','tonight-apart','Bubble-tea run at the same moment in your own cities \u2014 compare orders and rate each other\u2019s picks.'],
        ['di-11','tonight-apart','Night-walk date: both stroll your own streets at sunset on video, narrating everything you see.'],
        ['di-12','tonight-apart','Draw each other from memory in five minutes, then reveal the portraits \u2014 no mercy, no flattery.'],
        ['di-13','tonight-apart','Slow dance to Aye Sinamika \u2014 phone propped up, dancing in your own rooms at the same time.'],
        ['di-14','tonight-apart','Write each other a love note and read it aloud without looking away from the camera.'],
        ['di-15','tonight-apart','Plan your dream apartment on paper \u2014 each draws a floor plan, then merge them into one.'],
        ['di-16','someday','A real teleport evening: ice cream, a long walk, her head on his shoulder, nowhere to be.'],
        ['di-17','someday','Bubble-tea showdown in person \u2014 finally settle whose order is actually better.'],
        ['di-18','someday','Find a guitar shop and play in the same room \u2014 the duet you\u2019ve only ever done over call.'],
        ['di-19','someday','Cook chicken wraps together in one kitchen \u2014 and argue about who does the dishes.'],
        ['di-20','someday','Watch a sunrise from a mountain viewpoint, wrapped in one jacket, saying absolutely nothing.']
      ]}
  ];

  var state = null;
  function freshState(){
    var s = {seen:{}};
    DECKS.forEach(function(d){ s.seen[d.id] = []; });
    return s;
  }
  function loadState(){
    state = freshState();
    var d = kvGet(LS_KEY, null);
    if(d && d.seen){
      DECKS.forEach(function(dk){
        var arr = d.seen[dk.id];
        state.seen[dk.id] = Array.isArray(arr) ? arr.filter(function(id){
          return dk.cards.some(function(c){ return c[0] === id; });
        }) : [];
      });
    }
  }
  function saveState(){ kvSet(LS_KEY, state); }
  function deckById(id){
    for(var i=0;i<DECKS.length;i++) if(DECKS[i].id===id) return DECKS[i];
    return null;
  }
  function drawCard(deck){
    var seen = state.seen[deck.id], reshuffled = false;
    var pool = deck.cards.filter(function(c){ return seen.indexOf(c[0]) < 0; });
    if(!pool.length){
      state.seen[deck.id] = []; seen = state.seen[deck.id];
      pool = deck.cards.slice(); reshuffled = true;
    }
    var card = pool[Math.floor(Math.random()*pool.length)];
    seen.push(card[0]); saveState();
    return {card:card, reshuffled:reshuffled};
  }
  var PARTNER_REACTS = [
    'Tara is thinking\u2026', 'Tara smiled at this one \u2661',
    'Tara is typing a long answer\u2026', 'Tara sent a \u2665 with her answer'
  ];

  var view = 'picker', curDeck = null, lastDraw = null, reactT = 0;
  function cardTagLabel(card){
    if(card.length > 2 && TAG_LABELS[card[1]]) return TAG_LABELS[card[1]];
    var cat = TAGS[card[0]];
    return cat && CAT_LABELS[cat] ? '\u2726 ' + CAT_LABELS[cat] : '';
  }
  function renderPicker(){
    view = 'picker'; curDeck = null;
    clearTimeout(reactT);
    var wrap = rEl('div');
    DECKS.forEach(function(dk){
      var n = dk.cards.length, seen = state.seen[dk.id].length;
      var b = rEl('button', 'kv-btn ghost',
        '<div style="font-size:15px;letter-spacing:.2em;color:var(--kv-gold);margin-bottom:6px">\u2726 \u2726 \u2726</div>' +
        '<div style="font-size:23px;font-weight:700;margin-bottom:4px">' + esc(dk.title) + '</div>' +
        '<div style="font-size:14px;font-style:italic;color:var(--kv-ink-dim);margin-bottom:8px">' + n + ' cards' +
        (seen ? ' \u00b7 ' + seen + ' answered' : '') + '</div>' +
        '<div style="font-size:15.5px;line-height:1.6;font-weight:400">' + esc(dk.desc) + '</div>');
      b.style.cssText += ';text-align:center;max-width:560px;width:100%;margin:8px auto;display:block;';
      (function(d){ b.addEventListener('click', function(){ renderCard(d); }); })(dk);
      wrap.appendChild(b);
    });
    var note = rEl('div', 'kv-sub',
      'Here, Tara is your island AI \u2014 she sees every card with you, and her reactions are imagined for now \u2726');
    note.style.marginTop = '14px';
    wrap.appendChild(note);
    rOpen('\u2726 question decks \u2726', wrap, '');
  }
  function renderCard(deck){
    view = 'card'; curDeck = deck;
    lastDraw = drawCard(deck);
    paintCard();
  }
  function paintCard(){
    var deck = curDeck, card = lastDraw.card, cid = card[0];
    var text = card[card.length - 1];
    var n = state.seen[deck.id].length;
    var wrap = rEl('div');
    wrap.appendChild(rEl('div', 'kv-sub', 'card ' + n + ' of ' + deck.cards.length + ' \u00b7 ' + esc(deck.title)));
    var tag = cardTagLabel(card);
    var q = rEl('div', 'kv-q', esc(text) +
      (tag ? '<div style="margin-top:16px"><span class="kv-cat" style="margin:0">' + esc(tag) + '</span></div>' : '') +
      '<div class="kv-sub" style="margin-top:18px">\u2726 Tara sees this too \u2726</div>');
    q.style.cursor = 'pointer';
    q.addEventListener('click', function(){ nextCard(); });
    wrap.appendChild(q);
    var nb = kvBtn('New card \u2726');
    nb.addEventListener('click', function(e){ e.stopPropagation(); nextCard(); });
    wrap.appendChild(nb);
    if(lastDraw.reshuffled){
      var rs = rEl('div', 'kv-sub', 'deck complete \u2726 starting fresh');
      wrap.appendChild(rs);
    }
    var back = kvBtn('\u2039 all decks', false);
    back.style.marginTop = '6px';
    back.addEventListener('click', renderPicker);
    wrap.appendChild(back);
    rOpen('\u2726 ' + esc(deck.title) + ' \u2726', wrap, '');
    clearTimeout(reactT);
    if(Math.random() < 0.55){
      reactT = setTimeout(function(){
        var R = ritual();
        if(R) R.toast(PARTNER_REACTS[Math.floor(Math.random()*PARTNER_REACTS.length)]);
      }, 1400);
    }
  }
  function nextCard(){
    if(!curDeck) return;
    lastDraw = drawCard(curDeck);
    paintCard();
  }
  function open(){
    loadState();
    renderPicker();
  }
  function close(){
    clearTimeout(reactT);
    var R = ritual(); if(R) R.close();
  }
  return {
    open: open, close: close,
    isOpen: function(){ var R = ritual(); return !!(R && R.isOpen()); },
    _testDraw: function(deckId){ loadState(); return drawCard(deckById(deckId || 'first-hellos')).card[0]; },
    _testState: function(){ loadState(); return JSON.parse(JSON.stringify(state)); },
    _decks: DECKS
  };
})();
window.KVDecks = KVDecks;

/* ============================================================
   KVBeacon — the Lighthouse nightly light-hold ritual
   Ports kanavu-2d/beacon.js streak engine verbatim: streaks PAUSE
   (never shatter) on a missed night. 3D ritual: walk to the
   lighthouse, tap Light, hold your light 4s (stay near) while
   golden rings rise from the lamp. Persistence: kanavu.beacon.v1.
   ============================================================ */
var KVBeacon = (function(){
  var LS_KEY = 'kanavu.beacon.v1';
  var store = loadStore();
  function loadStore(){
    var d = {streak:0, longest:0, lastLit:null, totalLit:0, remindedDate:null};
    var p = kvGet(LS_KEY, null);
    if(p) for(var k in d) if(p[k] !== undefined && p[k] !== null) d[k] = p[k];
    return d;
  }
  function saveStore(){ kvSet(LS_KEY, store); }

  function pad2(n){ return (n<10?'0':'')+n; }
  function dayStr(d){ return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }
  function todayStr(){ return dayStr(new Date()); }
  function shiftDayStr(dlt){ var d = new Date(); d.setDate(d.getDate()+dlt); return dayStr(d); }
  function daysBetween(a,b){
    var pa=a.split('-'), pb=b.split('-');
    return Math.round((Date.UTC(+pb[0],+pb[1]-1,+pb[2]) - Date.UTC(+pa[0],+pa[1]-1,+pa[2]))/86400000);
  }
  function derivedState(){
    var t = todayStr();
    var base = {streak:store.streak, longest:store.longest, total:store.totalLit};
    if(store.lastLit === t){ base.status='lit'; return base; }
    if(store.lastLit && daysBetween(store.lastLit, t) > 1){ base.status='paused'; return base; }
    base.status='tonight'; return base;
  }
  var MILESTONES = [7,30,100,365];
  function onComplete(){
    var t = todayStr();
    if(store.lastLit === t) return {counted:false, streak:store.streak};
    if(!store.lastLit) store.streak = 1;
    else if(daysBetween(store.lastLit, t) === 1) store.streak += 1;
    /* else: paused — resume from where it paused, never reset */
    if(store.streak > store.longest) store.longest = store.streak;
    store.lastLit = t; store.totalLit += 1;
    saveStore();
    return {counted:true, streak:store.streak, milestone:(MILESTONES.indexOf(store.streak)!==-1)};
  }
  function flameTier(n){
    if(n>=30) return 4; if(n>=14) return 3; if(n>=7) return 2; if(n>=3) return 1; return 0;
  }

  /* ---------------- ritual runtime ---------------- */
  var ritual = null;   // {t, holdDur}
  var RITUAL_R = 15;   // must stay within this of the lighthouse
  function beaconXZ(){ return {x: SITE.beacon.x, z: SITE.beacon.z}; }
  function distToBeacon(){
    var p = playerPos(), b = beaconXZ();
    if(!p) return 1e9;
    return Math.hypot(p.x-b.x, p.z-b.z);
  }
  function tap(){
    if(ritual) return;
    var st = derivedState();
    if(st.status === 'lit'){ toast('the beacon already holds your light \u2726'); openPanel(); return; }
    if(distToBeacon() > RITUAL_R + 6){ toast('walk up to the lighthouse to light it \u2726'); return; }
    ritual = {t:0, holdDur:4};
    toast('hold your light\u2026 stay near the beacon \u2726');
    spawnRings();
  }
  function cancelRitual(why){
    clearRings();
    ritual = null;
    if(why) toast(why);
  }
  function finishRitual(){
    clearRings();
    ritual = null;
    var res = onComplete();
    /* golden burst at the lamp */
    try{
      var gl = makeGlow(10, 1);
      gl.position.set(beaconFx.cx, beaconFx.lampY, beaconFx.cz);
      W.scene.add(gl);
      var born = performance.now();
      var fn = function(){
        var k = (performance.now()-born)/900;
        if(k>=1){ try{W.scene.remove(gl);}catch(e){} fn._dead = true; return; }
        var s = 10 + k*14;
        gl.scale.set(s, s, 1);
        gl.material.opacity = 1-k;
      };
      tickers.push(fn);
    }catch(e){}
    if(res.counted){
      addStars(15);
      toast('the beacon holds your light \u2726');
      if(res.milestone){
        setTimeout(function(){ toast(res.streak + ' nights of light \u2014 kept in your memories \u2726', 2600); }, 2300);
      }
    }else{
      toast('the beacon holds your light \u2726');
    }
    updateFlame();
  }
  function ritualActive(){ return !!ritual; }

  /* expanding golden rings rising from the lamp during the hold */
  var ringPool = [];
  function spawnRings(){
    clearRings();
    for(var i=0;i<5;i++){
      var m = new T.Mesh(new T.RingGeometry(0.9, 1.05, 40),
        new T.MeshBasicMaterial({color:0xffd97a, transparent:true, opacity:0.85,
          blending:T.AdditiveBlending, depthWrite:false, side:T.DoubleSide}));
      m.rotation.x = -Math.PI/2;
      W.scene.add(m);
      ringPool.push({m:m, ph:i/5});
    }
  }
  function clearRings(){
    ringPool.forEach(function(r){ try{ W.scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); }catch(e){} });
    ringPool = [];
  }
  tickers.push(function(dt, t){
    if(!ritual) return;
    /* walked away → fade */
    if(distToBeacon() > RITUAL_R + 4){
      cancelRitual('the ritual faded\u2026 come back to the beacon');
      return;
    }
    ritual.t += dt;
    var gy = beaconFx.lampY;
    for(var i=0;i<ringPool.length;i++){
      var r = ringPool[i];
      var k = ((t*0.55) + r.ph) % 1;
      var s = 1 + k*7;
      r.m.scale.set(s, s, 1);
      r.m.position.set(beaconFx.cx, gy - 0.4 + k*4.5, beaconFx.cz);
      r.m.material.opacity = 0.85 * (1-k);
    }
    if(ritual.t >= ritual.holdDur) finishRitual();
  });
  /* gentle evening reminder, once per day, when near the lighthouse */
  tickers.push((function(){
    var last = 0;
    return function(dt, t){
      if(t - last < 5) return;
      last = t;
      try{
        if(ritual || store.remindedDate === todayStr()) return;
        var st = derivedState();
        if(st.status === 'lit') return;
        if(distToBeacon() < 26){
          store.remindedDate = todayStr(); saveStore();
          toast('the beacon is waiting \u2726 \u2014 tap Light');
        }
      }catch(e){}
    };
  })());

  /* ---------------- flame button + streak panel ---------------- */
  var flameBtn = null, flameCv = null;
  function drawFlame(cv, tier){
    var g = cv.getContext('2d');
    var Wd = cv.width, H = cv.height;
    g.clearRect(0,0,Wd,H);
    var cx = Wd/2, cy = H*0.58;
    var baseR = 7 + tier*1.6;
    var glowR = baseR*(2.1 + tier*0.55);
    var gl = g.createRadialGradient(cx,cy,1,cx,cy,glowR);
    var ga = 0.45 + tier*0.1;
    gl.addColorStop(0,'rgba(255,190,90,'+ga.toFixed(2)+')');
    gl.addColorStop(1,'rgba(255,150,60,0)');
    g.fillStyle = gl;
    g.beginPath(); g.arc(cx,cy,glowR,0,6.29); g.fill();
    var fh = baseR*2.6, fw = baseR*1.5;
    var fg = g.createLinearGradient(0,cy-fh,0,cy+baseR);
    fg.addColorStop(0,'#fff3c4'); fg.addColorStop(0.45,'#ffcf6e'); fg.addColorStop(1,'#e07f2e');
    g.fillStyle = fg;
    g.beginPath();
    g.moveTo(cx,cy-fh);
    g.bezierCurveTo(cx+fw,cy-fh*0.45,cx+fw*0.7,cy+baseR*0.6,cx,cy+baseR*0.6);
    g.bezierCurveTo(cx-fw*0.7,cy+baseR*0.6,cx-fw,cy-fh*0.45,cx,cy-fh);
    g.fill();
    g.fillStyle = '#7a2e10';
    g.beginPath(); g.arc(cx,cy+baseR*0.6,1.6,0,6.29); g.fill();
  }
  function buildFlameBtn(){
    if(flameBtn || document.getElementById('kvb-flame')) return;
    var st = document.createElement('style');
    st.textContent = '#kvb-flame{position:fixed;top:64px;left:12px;z-index:120;width:44px;height:44px;'+
      'border-radius:50%;background:radial-gradient(circle at 50% 32%,#5a2a33 0%,#2b1a24 78%);'+
      'border:1.5px solid rgba(232,182,76,.55);box-shadow:0 3px 10px rgba(20,8,14,.55);'+
      'display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;}'+
      '#kvb-flame:active{transform:scale(.94);}';
    document.head.appendChild(st);
    var b = document.createElement('button');
    b.id = 'kvb-flame';
    b.setAttribute('aria-label','Beacon ritual');
    var cv = document.createElement('canvas');
    cv.width = 34; cv.height = 34;
    cv.style.width = '32px'; cv.style.height = '32px'; cv.style.pointerEvents = 'none';
    b.appendChild(cv);
    b.addEventListener('click', function(){ openPanel(); });
    document.body.appendChild(b);
    flameBtn = b; flameCv = cv;
    updateFlame();
  }
  function updateFlame(){
    if(!flameCv) return;
    var st = derivedState();
    drawFlame(flameCv, flameTier(st.streak));
    flameBtn.title = st.status === 'paused'
      ? 'Beacon ritual \u2014 streak paused at ' + st.streak + ' \u23f8'
      : 'Beacon ritual \u2014 ' + st.streak + '-night streak';
  }
  function openPanel(){
    var st = derivedState();
    var wrap = rEl('div');
    wrap.appendChild(rEl('div', 'kv-sub', 'light together, keep the flame'));
    wrap.appendChild(rEl('div', '',
      '<div style="font-size:46px;line-height:1;margin:4px 0">\u{1F56F}\uFE0F</div>' +
      '<div style="font-size:34px;font-weight:700;color:var(--kv-ink)">' + st.streak + ' <span style="font-size:15px;font-weight:400;color:var(--kv-ink-dim)">nights</span></div>'));
    var status = rEl('div', 'kv-sub', '');
    if(st.status === 'lit'){
      status.innerHTML = '<span style="color:#9be7a0;font-weight:700">\u2726 tonight\u2019s light is lit</span>';
    }else if(st.status === 'paused'){
      status.innerHTML = '<span style="color:var(--kv-gold);font-weight:700">paused \u23f8</span>';
    }else{
      status.textContent = 'not yet lit tonight';
    }
    wrap.appendChild(status);
    var note = rEl('div', 'kv-sub', '');
    if(st.status === 'lit'){
      note.textContent = 'Come back tomorrow evening to keep the flame alive.';
    }else if(st.status === 'paused'){
      note.textContent = 'The beacon kept your flame warm. Light tonight to resume your ' +
        st.streak + '-night streak \u2014 it never shatters.';
    }else{
      note.textContent = st.streak > 0
        ? 'Walk to the lighthouse and tap Light to make it ' + (st.streak+1) + ' nights.'
        : 'Walk to the lighthouse and tap Light to begin your streak.';
    }
    wrap.appendChild(note);
    var stats = rEl('div', '',
      '<div style="display:flex;justify-content:center;gap:34px;margin:14px 0 4px">' +
      '<div><div style="font-size:21px;font-weight:700">' + st.longest + '</div>' +
      '<div style="font-size:11px;letter-spacing:.2em;color:var(--kv-ink-dim)">LONGEST</div></div>' +
      '<div><div style="font-size:21px;font-weight:700">' + st.total + '</div>' +
      '<div style="font-size:11px;letter-spacing:.2em;color:var(--kv-ink-dim)">NIGHTS LIT</div></div></div>');
    wrap.appendChild(stats);
    if(st.status !== 'lit'){
      var lb = kvBtn('Light the beacon \u2726');
      lb.addEventListener('click', function(){
        var R = ritual(); if(R) R.close();
        tap();
      });
      wrap.appendChild(lb);
    }
    var cb = kvBtn('close', false);
    cb.addEventListener('click', function(){ var R = ritual(); if(R) R.close(); });
    wrap.appendChild(cb);
    rOpen('\u2726 nightly beacon ritual \u2726', wrap, '');
  }

  return {
    tap: tap, openPanel: openPanel, ritualActive: ritualActive,
    buildFlameBtn: buildFlameBtn, updateFlame: updateFlame,
    _testState: function(){
      return {store: JSON.parse(JSON.stringify(store)), derived: derivedState(),
              ritual: ritual ? {t:+ritual.t.toFixed(2)} : null};
    },
    _debugComplete: function(){
      if(ritual) finishRitual();
      else { var r = onComplete(); if(r.counted) addStars(15); updateFlame(); }
      return derivedState();
    },
    _debugSetStreak: function(n){
      n = Math.max(0, Math.floor(+n || 0));
      store.streak = n; if(store.longest < n) store.longest = n;
      store.lastLit = shiftDayStr(-1); saveStore(); updateFlame();
      return derivedState();
    },
    _debugReset: function(){
      store = {streak:0, longest:0, lastLit:null, totalLit:0, remindedDate:null};
      saveStore(); updateFlame(); return derivedState();
    }
  };
})();
window.KVBeacon = KVBeacon;

/* ============================================================
   KVGames — the Theatre's games
   Ports kanavu-2d/games.js: theatre night (a candlelit stub
   screen for two) + co-op firefly catch, re-imagined in 3D —
   real glowing fireflies drift around the amphitheater; walk a
   keeper through one (or tap it) to catch. No fail states, no
   punishing timers. Persistence: kanavu.games.v1.
   ============================================================ */
var KVGames = (function(){
  var LS_KEY = 'kanavu.games.v1';
  var FF_MAX = 20;
  var AUTO_CATCH_R = 1.7;
  var state = {ff:{caught:0, byAdi:0, byTara:0, banked:0}, th:{playing:false, sessions:0}};
  function loadState(){
    var d = kvGet(LS_KEY, null);
    if(d){
      if(d.ff){ state.ff.caught=d.ff.caught|0; state.ff.byAdi=d.ff.byAdi|0; state.ff.byTara=d.ff.byTara|0; state.ff.banked=d.ff.banked|0; }
      if(d.th) state.th.sessions = d.th.sessions|0;
    }
  }
  function saveState(){ kvSet(LS_KEY, state); }
  loadState();

  /* ---------------- 3D fireflies ---------------- */
  var FF = {active:false, aiT:0};
  var flies = [];   // {sp,bx,bz,by,ph,spd,cool}
  var _ffRay = null, _ffNdc = null;
  function spawnFlies(){
    if(flies.length) return;
    var s = SITE.theatre;
    for(var i=0;i<14;i++){
      var sp = new T.Sprite(new T.SpriteMaterial({
        map: glowTexture(), blending: T.AdditiveBlending,
        depthWrite:false, transparent:true, opacity:0.95, color:0xffe9a8
      }));
      var a = Math.random()*Math.PI*2, r = 6 + Math.random()*17;
      var bx = s.x + Math.cos(a)*r, bz = s.z + Math.sin(a)*r;
      var f = {sp:sp, bx:bx, bz:bz,
        by: W.groundY(bx,bz) + 1 + Math.random()*2.2,
        ph: Math.random()*6.28, spd: 0.5 + Math.random()*0.9, cool: 0};
      sp.position.set(bx, f.by, bz);
      sp.scale.set(0.9, 0.9, 1);
      W.scene.add(sp);
      flies.push(f);
    }
  }
  function respawnFly(f){
    var s = SITE.theatre;
    var a = Math.random()*Math.PI*2, r = 6 + Math.random()*17;
    f.bx = s.x + Math.cos(a)*r; f.bz = s.z + Math.sin(a)*r;
    f.by = W.groundY(f.bx, f.bz) + 1 + Math.random()*2.2;
    f.cool = 1.4;
  }
  function burstAt(x, y, z, color, n){
    try{
      for(var i=0;i<n;i++){
        (function(){
          var sp = makeGlow(0.7, 0.9);
          sp.material = sp.material.clone();
          sp.material.color = new T.Color(color);
          var a = Math.random()*6.28, born = performance.now();
          W.scene.add(sp);
          var ox = x, oy = y, oz = z;
          var fn = function(){
            var k = (performance.now()-born)/600;
            if(k>=1){ try{W.scene.remove(sp); sp.material.dispose();}catch(e){} fn._dead = true; return; }
            sp.position.set(ox + Math.cos(a)*k*2.2, oy + k*1.6, oz + Math.sin(a)*k*2.2);
            sp.material.opacity = 0.9*(1-k);
          };
          tickers.push(fn);
          sp.position.set(ox, oy, oz);
        })();
      }
    }catch(e){}
  }
  function catchFly(f, by){
    if(state.ff.caught >= FF_MAX) return;
    burstAt(f.sp.position.x, f.sp.position.y, f.sp.position.z, 0xffe9a8, 6);
    state.ff.caught++;
    if(by === 'tara') state.ff.byTara++; else state.ff.byAdi++;
    saveState();
    respawnFly(f);
    if(state.ff.caught >= FF_MAX){
      toast('lanterns full \u2014 release them! \u2726', 2600);
    }
    updateHud();
  }
  tickers.push(function(dt, t){
    if(!flies.length) return;
    var pp = playerPos();
    var qp = partnerPos();
    for(var i=0;i<flies.length;i++){
      var f = flies[i];
      /* drift */
      f.sp.position.set(
        f.bx + Math.sin(t*f.spd + f.ph)*3,
        f.by + Math.sin(t*1.3 + f.ph)*0.5,
        f.bz + Math.cos(t*f.spd*0.8 + f.ph)*3
      );
      var pu = 0.75 + 0.25*Math.sin(t*3 + f.ph*2);
      f.sp.scale.set(0.9*pu, 0.9*pu, 1);
      if(!FF.active) continue;
      if(f.cool > 0){ f.cool -= dt; continue; }
      if(state.ff.caught >= FF_MAX) continue;
      var p = f.sp.position, caught = false, by = 'adi';
      if(pp && Math.hypot(p.x-pp.x, p.z-pp.z) < AUTO_CATCH_R && Math.abs(p.y-(pp.y||0)-1.2) < 2.4){ caught = true; by = 'adi'; }
      else if(qp && Math.hypot(p.x-qp.x, p.z-qp.z) < AUTO_CATCH_R && Math.abs(p.y-(qp.y||0)-1.2) < 2.4){ caught = true; by = 'tara'; }
      if(caught) catchFly(f, by);
    }
    /* Tara AI: drift toward the nearest firefly so she catches her share */
    if(FF.active && qp && qp.mesh){
      FF.aiT -= dt;
      if(FF.aiT <= 0){
        FF.aiT = 1.6;
        var best = null, bd = 14;
        for(var j=0;j<flies.length;j++){
          var fj = flies[j];
          if(fj.cool > 0) continue;
          var d = Math.hypot(fj.sp.position.x - qp.x, fj.sp.position.z - qp.z);
          if(d < bd){ bd = d; best = fj; }
        }
        /* nudge her mesh target — the real partner moves by network, so
           this only steers the local AI echo when no partner is paired */
        if(best && !qp.mesh.userData._kvNetDriven){
          try{
            qp.mesh.position.x += Math.sign(best.sp.position.x - qp.x)*dt*2.2;
            qp.mesh.position.z += Math.sign(best.sp.position.z - qp.z)*dt*2.2;
          }catch(e){}
        }
      }
    }
  });
  function ffTap(x, y){
    if(!FF.active || state.ff.caught >= FF_MAX || !flies.length) return false;
    try{
      _ffRay = _ffRay || new T.Raycaster();
      _ffNdc = _ffNdc || new T.Vector2();
      var r = W.renderer.domElement.getBoundingClientRect();
      _ffNdc.x = ((x - r.left)/r.width)*2 - 1;
      _ffNdc.y = -((y - r.top)/r.height)*2 + 1;
      _ffRay.setFromCamera(_ffNdc, W.camera);
      var sps = flies.map(function(f){ return f.sp; });
      var hits = _ffRay.intersectObjects(sps, false);
      if(!hits.length) return false;
      var sp = hits[0].object;
      var f = null;
      for(var i=0;i<flies.length;i++) if(flies[i].sp === sp){ f = flies[i]; break; }
      if(!f || f.cool > 0) return false;
      /* must be near a keeper to tap-catch */
      var pp = playerPos(), qp = partnerPos(), p = f.sp.position;
      var dp = pp ? Math.hypot(p.x-pp.x, p.z-pp.z) : 1e9;
      var dq = qp ? Math.hypot(p.x-qp.x, p.z-qp.z) : 1e9;
      if(Math.min(dp, dq) < 4){
        catchFly(f, dp <= dq ? 'adi' : 'tara');
        return true;
      }
      return false;
    }catch(e){ return false; }
  }

  /* ---------------- HUD pill ---------------- */
  var hud = null, hudCount = null;
  function buildHud(){
    if(hud || document.getElementById('kvb-ffhud')) return;
    var st = document.createElement('style');
    st.textContent = '#kvb-ffhud{position:fixed;top:112px;left:50%;transform:translateX(-50%);z-index:119;'+
      'display:none;align-items:center;gap:8px;background:rgba(30,15,18,.88);'+
      'border:1.5px solid rgba(232,200,122,.55);color:#ffd97a;font-family:Georgia,serif;'+
      'font-size:16px;font-weight:700;padding:10px 20px;border-radius:24px;'+
      'box-shadow:0 4px 16px rgba(20,8,14,.5);cursor:pointer;white-space:nowrap;}';
    document.head.appendChild(st);
    var h = document.createElement('div');
    h.id = 'kvb-ffhud';
    h.innerHTML = '<span style="color:#ffe9a8">\u2726</span><span id="kvb-ffhud-n"></span>';
    h.addEventListener('click', function(){ open(); });
    document.body.appendChild(h);
    hud = h; hudCount = h.querySelector('#kvb-ffhud-n');
    updateHud();
  }
  function updateHud(){
    if(!hudCount) return;
    hudCount.textContent = state.ff.caught >= FF_MAX
      ? 'lanterns full \u2014 release! \u2726'
      : 'together: ' + state.ff.caught + ' \u2726';
  }
  function startCatch(){
    if(FF.active) return;
    FF.active = true;
    spawnFlies();
    var R = ritual(); if(R) R.close();
    if(hud) hud.style.display = 'flex';
    updateHud();
    toast('catch fireflies together \u2726 walk through them, or tap one near a keeper', 3200);
  }
  function stopCatch(){
    FF.active = false;
    if(hud) hud.style.display = 'none';
  }
  function releaseLanterns(){
    var n = state.ff.caught;
    if(n <= 0) return;
    var pp = playerPos();
    var cx = pp ? pp.x : SITE.theatre.x, cz = pp ? pp.z : SITE.theatre.z;
    var cy = W.groundY(cx, cz) + 2;
    burstAt(cx, cy, cz, 0xffe9a8, 22);
    burstAt(cx, cy, cz, 0xffc2d1, 12);
    addStars(n);
    state.ff.banked += n;
    state.ff.caught = 0; state.ff.byAdi = 0; state.ff.byTara = 0;
    saveState();
    toast(n + ' \u2726 banked as stars \u2014 the night glows brighter', 3000);
    updateHud();
    if(window.KVWarmth && KVWarmth.celebrate) KVWarmth.celebrate('lanterns released \u2726', n + ' fireflies banked as stars');
  }

  /* ---------------- theatre night (stub screen) ---------------- */
  var scrStars = [];
  (function(){
    for(var i=0;i<55;i++) scrStars.push({x:Math.random(), y:Math.random()*0.72,
      r:1+Math.random()*2.2, ph:Math.random()*6.28, sp:0.8+Math.random()*2.2});
  })();
  function rrC(g, x, y, w, h, r){
    g.beginPath();
    g.moveTo(x+r, y);
    g.arcTo(x+w, y, x+w, y+h, r); g.arcTo(x+w, y+h, x, y+h, r);
    g.arcTo(x, y+h, x, y, r); g.arcTo(x, y, x+w, y, r);
    g.closePath();
  }
  function drawScreen(cv){
    var g = cv.getContext('2d');
    var Wd = cv.width, H = cv.height, t = performance.now()/1000;
    var bg = g.createLinearGradient(0,0,0,H);
    bg.addColorStop(0,'#150a11'); bg.addColorStop(0.65,'#2c1520'); bg.addColorStop(1,'#40201f');
    g.fillStyle = bg; g.fillRect(0,0,Wd,H);
    for(var i=0;i<scrStars.length;i++){
      var s = scrStars[i];
      g.globalAlpha = 0.3 + 0.7*Math.abs(Math.sin(t*s.sp + s.ph));
      g.fillStyle = '#ffe9b0';
      g.fillRect(s.x*Wd, s.y*H, s.r, s.r);
    }
    g.globalAlpha = 1;
    var fl = 0.72 + 0.20*Math.sin(t*7.3) + 0.08*Math.sin(t*13.1+1.2);
    var gg = g.createRadialGradient(Wd/2, H+26, 6, Wd/2, H+26, 130);
    gg.addColorStop(0, 'rgba(255,176,92,'+(0.55*fl).toFixed(3)+')');
    gg.addColorStop(0.5, 'rgba(230,120,60,'+(0.22*fl).toFixed(3)+')');
    gg.addColorStop(1, 'rgba(230,120,60,0)');
    g.fillStyle = gg; g.fillRect(0,0,Wd,H);
    g.fillStyle = 'rgba(248,241,227,0.95)';
    rrC(g, Wd/2-118, H/2-36, 236, 72, 12); g.fill();
    g.strokeStyle = 'rgba(160,118,46,.6)'; g.lineWidth = 1.5;
    rrC(g, Wd/2-110, H/2-28, 220, 56, 9); g.stroke();
    g.textAlign = 'center';
    g.fillStyle = '#a0762e'; g.font = 'italic 13px Georgia';
    g.fillText("tonight's feature:", Wd/2, H/2-6);
    g.fillStyle = '#7a3f10'; g.font = '700 21px Georgia';
    g.fillText('our sky \u2726', Wd/2, H/2+20);
    if(!state.th.playing){
      g.fillStyle = 'rgba(10,5,8,0.55)'; g.fillRect(0,0,Wd,H);
      g.fillStyle = '#f3ddab'; g.font = 'italic 15px Georgia';
      g.fillText('paused \u2726', Wd/2, H/2+52);
    }
  }
  var screenCv = null, screenRaf = 0;
  function screenLoop(){
    var R = ritual();
    if(!R || !R.isOpen()){ screenRaf = 0; return; }
    if(screenCv) drawScreen(screenCv);
    screenRaf = requestAnimationFrame(screenLoop);
  }

  /* ---------------- hub UI ---------------- */
  function open(){
    loadState();
    var wrap = rEl('div');
    /* theatre card */
    var th = rEl('div', '',
      '<div style="text-align:center;letter-spacing:.3em;font-size:13px;color:var(--kv-gold);margin-bottom:10px">\u2726 THEATRE \u00b7 FOR TWO \u2726</div>' +
      '<div style="font-size:21px;font-weight:700;text-align:center;margin-bottom:4px">Theatre for two</div>' +
      '<div class="kv-sub" style="margin-bottom:12px">a little candlelit screen, just for us</div>');
    var cv = document.createElement('canvas');
    cv.width = 320; cv.height = 168;
    cv.style.cssText = 'width:100%;border-radius:14px;border:2px solid var(--kv-line);display:block;';
    th.appendChild(cv);
    screenCv = cv;
    var row = rEl('div', '', '<div style="display:flex;gap:10px;margin:12px 0;align-items:stretch">');
    var playB = kvBtn(state.th.playing ? 'Pause \u275a\u275a' : 'Play \u25b6');
    playB.style.cssText += ';flex:1;margin:0;';
    playB.addEventListener('click', function(){
      state.th.playing = !state.th.playing;
      if(state.th.playing){ state.th.sessions++; saveState(); }
      saveState(); open();
    });
    row.appendChild(playB);
    th.appendChild(row);
    th.appendChild(rEl('div', 'kv-sub',
      state.th.sessions ? (state.th.sessions + (state.th.sessions===1?' cosy session shared':' cosy sessions shared') + ' \u2726')
                        : 'press play and settle in together'));
    th.appendChild(rEl('div', 'kv-sub', 'a gentle stub \u2014 the real watch-together arrives later \u2726'));
    wrap.appendChild(th);
    /* firefly card */
    var ff = rEl('div', '',
      '<div style="font-size:21px;font-weight:700;text-align:center;margin:18px 0 4px">Firefly catch</div>' +
      '<div class="kv-sub" style="margin-bottom:10px">a co-op night game \u2014 no losing, only glowing</div>' +
      '<div style="font-size:15.5px;line-height:1.7;color:var(--kv-ink-dim);text-align:center;max-width:480px;margin:0 auto 12px">' +
      'The theatre\u2019s fireflies are out. Catch them <b>together</b>: walk a keeper through one, or tap a firefly drifting near either of you. ' +
      'At <b>20</b>, your lanterns are full \u2014 release them in a burst and bank them as stars.</div>');
    var score = rEl('div', '',
      '<div style="text-align:center;background:rgba(22,18,54,.6);border:2px solid var(--kv-line);border-radius:18px;padding:14px;margin-bottom:12px">' +
      '<div style="font-size:13px;font-style:italic;color:var(--kv-ink-dim)">together</div>' +
      '<div style="font-size:42px;font-weight:700;color:var(--kv-gold)">' + state.ff.caught + ' \u2726</div>' +
      '<div style="font-size:13px;font-style:italic;color:var(--kv-ink-dim)">' +
      ((state.ff.byAdi || state.ff.byTara) ? ('Adi caught ' + state.ff.byAdi + ' \u00b7 Tara caught ' + state.ff.byTara)
                                           : 'not started yet \u2014 the night is waiting') + '</div></div>');
    ff.appendChild(score);
    var row2 = rEl('div', '', '<div style="display:flex;gap:10px;margin-bottom:8px">');
    var goB = kvBtn(FF.active ? 'Rest for now' : 'Catch together \u2726', !FF.active);
    goB.style.cssText += ';flex:1;margin:0;';
    goB.addEventListener('click', function(){ FF.active ? stopCatch() : startCatch(); open(); });
    row2.appendChild(goB);
    if(state.ff.caught >= FF_MAX){
      var relB = kvBtn('Release ' + state.ff.caught + ' \u2726');
      relB.style.cssText += ';flex:1;margin:0;';
      relB.addEventListener('click', function(){ releaseLanterns(); open(); });
      row2.appendChild(relB);
    }
    ff.appendChild(row2);
    ff.appendChild(rEl('div', 'kv-sub',
      state.ff.banked ? (state.ff.banked + ' \u2726 banked as stars so far \u2014 the island glows brighter')
                      : 'release a full lantern to bank stars'));
    wrap.appendChild(ff);
    wrap.appendChild(rEl('div', 'kv-sub', 'Every game here is co-op: the win always belongs to the pair \u2661'));
    var cb = kvBtn('close', false);
    cb.addEventListener('click', function(){ var R = ritual(); if(R) R.close(); });
    wrap.appendChild(cb);
    rOpen('\u2726 games \u2726', wrap, '');
    if(!screenRaf) screenRaf = requestAnimationFrame(screenLoop);
    updateHud();
  }
  function close(){ var R = ritual(); if(R) R.close(); }

  return {
    open: open, close: close,
    isOpen: function(){ var R = ritual(); return !!(R && R.isOpen()); },
    startCatch: startCatch, stopCatch: stopCatch, releaseLanterns: releaseLanterns,
    ffTap: ffTap, spawnFlies: spawnFlies, buildHud: buildHud,
    _testState: function(){ return JSON.parse(JSON.stringify({ff:state.ff, th:state.th, active:FF.active})); }
  };
})();
window.KVGames = KVGames;

/* ============================================================
   KVMemories — the Memory Cottage
   Ports kanavu-2d/memories.js: daily photo prompt (captured from
   the live 3D renderer), shared journal, wrap-as-gift. Gifts
   appear as glowing 3D presents by the cottage — tap to unwrap.
   Tara's entries/gifts are island-AI simulated (said plainly).
   Persistence: kanavu.memories.v1 (photos capped at 7).
   ============================================================ */
var KVMemories = (function(){
  var LS_KEY = 'kanavu.memories.v1';
  var MAX_PHOTOS = 7;
  var PROMPTS = [
    'tonight: your evening sky \u2014 snap it as it is',
    'something golden you saw today',
    'your corner of calm',
    'show me your sky right now',
    'something that made you think of us today',
    'your warmest light \u2014 a lamp, a candle, the sun',
    'a little detail only you would notice',
    'where you would take me on a slow evening',
    'something growing \u2014 a plant, an idea, a feeling',
    'tonight\u2019s tea, coffee, or comfort drink',
    'a colour that feels like us today',
    'your window view, right now'
  ];
  var TARA_NOTES = [
    'The sky over Tbilisi went pink and gold tonight. I took the long way home just to walk under it \u2014 for Adi, who always looks up.',
    'Played a little guitar before bed. The G chord still buzzes. You\u2019d fix it in two seconds, kanmani.',
    'Bubble tea run: brown sugar, 70% ice. Saved you the mental sip. Come collect the real one soon.',
    'Counted three shooting stars from my window. Wished the same wish three times. You know the one.',
    'Found our song in a caf\u00e9 today. Sat there smiling like a fool. The waiter definitely noticed.',
    'Rainy day here. Made tea and watched the drops race down the glass. Yours would have won, obviously.'
  ];
  var TARA_GIFTS = [
    'a little pressed flower from my evening walk \u2014 it smelled like rain and made me think of you',
    'tonight\u2019s sky, bottled: pink at the edges, gold in the middle, all yours',
    'I hummed our song the whole way home. This memory is the humming.'
  ];

  var state = null, loaded = false;
  function freshState(){ return {entries:[], gifts:[], taraSimDay:null, taraGiftSeeded:false, seeded:false}; }
  function ensureLoaded(){
    if(loaded) return;
    loaded = true;
    state = freshState();
    var d = kvGet(LS_KEY, null);
    if(d){
      if(Array.isArray(d.entries)){
        state.entries = d.entries.filter(function(e){
          return e && e.id && (e.author==='Adi'||e.author==='Tara') && typeof e.text==='string';
        });
        state.gifts = Array.isArray(d.gifts) ? d.gifts.filter(function(g){
          return g && g.id && (g.to==='Adi'||g.to==='Tara');
        }) : [];
        state.taraSimDay = d.taraSimDay || null;
        state.taraGiftSeeded = !!d.taraGiftSeeded;
        state.seeded = !!d.seeded;
      }
    }
  }
  function saveState(){ kvSet(LS_KEY, state); }
  function newId(){ return 'm' + Date.now().toString(36) + Math.floor(Math.random()*46656).toString(36); }
  function todayStr(){
    var d = new Date();
    return d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2);
  }
  function dayIndex(){ return Math.floor(Date.now()/86400000); }
  function todayPrompt(){ return PROMPTS[dayIndex() % PROMPTS.length]; }
  function fmtDate(ds){
    try{ return new Date(ds+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
    catch(e){ return ds; }
  }
  function shiftDate(ds, days){
    var d = new Date(ds+'T12:00:00'); d.setDate(d.getDate()+days);
    return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);
  }
  function ensureSeed(){
    ensureLoaded();
    if(state.seeded) return;
    var t = todayStr();
    state.entries.push({id:newId(), author:'Adi', kind:'note', date:shiftDate(t,-1),
      ts:Date.now()-86400000, photo:null,
      text:'First page. This little journal is ours now \u2014 every photo, every note, every small forever. \u2661'});
    state.entries.push({id:newId(), author:'Tara', kind:'note', date:shiftDate(t,-2),
      ts:Date.now()-2*86400000, photo:null, text:TARA_NOTES[0]});
    state.seeded = true; saveState();
  }
  function unusedTaraNote(){
    var used = {};
    state.entries.forEach(function(e){ if(e.author==='Tara') used[e.text]=true; });
    var pool = TARA_NOTES.filter(function(n){ return !used[n]; });
    if(!pool.length) pool = TARA_NOTES.slice();
    return pool[Math.floor(Math.random()*pool.length)];
  }
  function maybeTaraEntry(){
    var t = todayStr();
    if(state.taraSimDay === t) return;
    if(Math.random() < 0.6){
      state.entries.push({id:newId(), author:'Tara', kind:'note', date:t,
        ts:Date.now(), photo:null, text:unusedTaraNote()});
      state.taraSimDay = t; saveState();
    }
  }
  function maybeTaraGift(force){
    ensureLoaded();
    if(state.taraGiftSeeded && !force) return null;
    if(!force && (Math.random() >= 0.35 || pendingGiftFor('Adi'))) return null;
    var used = {};
    state.gifts.forEach(function(g){ if(g.from==='Tara') used[g.text]=true; });
    var pool = TARA_GIFTS.filter(function(n){ return !used[n]; });
    if(!pool.length) pool = TARA_GIFTS.slice();
    var gift = {id:newId(), from:'Tara', to:'Adi', entryId:null, kind:'gift',
      text:pool[Math.floor(Math.random()*pool.length)], photo:null, ts:Date.now(), opened:false};
    state.gifts.push(gift);
    state.taraGiftSeeded = true;
    saveState();
    refreshGiftMarkers();
    return gift;
  }

  /* ---------------- photos (captured from the live 3D renderer) ---------------- */
  function photoCount(){
    var n = 0;
    state.entries.forEach(function(e){ if(e.photo) n++; });
    return n;
  }
  function prunePhotos(){
    while(photoCount() > MAX_PHOTOS){
      var oldest = null;
      state.entries.forEach(function(e){ if(e.photo && (!oldest || e.ts < oldest.ts)) oldest = e; });
      if(!oldest) break;
      oldest.photo = null;
    }
  }
  function todayPhotoEntry(){
    var d = todayStr();
    for(var i=0;i<state.entries.length;i++){
      var e = state.entries[i];
      if(e.date===d && e.author==='Adi' && e.kind==='photo') return e;
    }
    return null;
  }
  function capturePhoto(){
    try{
      var W_ = W;
      if(!W_ || !W_.renderer || !W_.scene || !W_.camera) return null;
      W_.renderer.render(W_.scene, W_.camera);   // fresh buffer, no preserveDrawingBuffer needed
      var src = W_.renderer.domElement;
      if(!src.width) return null;
      var tw = 360, th = Math.max(1, Math.round(tw*src.height/src.width));
      var tmp = document.createElement('canvas');
      tmp.width = tw; tmp.height = th;
      tmp.getContext('2d').drawImage(src, 0, 0, tw, th);
      return tmp.toDataURL('image/jpeg', 0.62);
    }catch(e){ return null; }
  }
  function doCapture(){
    ensureLoaded();
    var url = capturePhoto();
    if(!url){ toast('couldn\u2019t catch that moment \u2014 try again'); return null; }
    var e = todayPhotoEntry();
    if(!e){
      e = {id:newId(), author:'Adi', kind:'photo', text:todayPrompt(),
           date:todayStr(), ts:Date.now(), photo:null};
      state.entries.push(e);
    }
    e.photo = url; e.ts = Date.now();
    prunePhotos(); saveState();
    toast('kept in today\u2019s journal \u2661');
    return url;
  }

  /* ---------------- journal ---------------- */
  var writeBox = null;
  function saveNote(){
    ensureLoaded();
    var text = writeBox ? writeBox.value.replace(/^\s+|\s+$/g,'') : '';
    if(!text){ toast('write a little something first'); return; }
    state.entries.push({id:newId(), author:'Adi', kind:'note', text:text,
      date:todayStr(), ts:Date.now(), photo:null});
    saveState();
    open();
    toast('written into our journal \u2661');
  }
  function entryById(id){
    for(var i=0;i<state.entries.length;i++) if(state.entries[i].id===id) return state.entries[i];
    return null;
  }
  function wrapAsGift(entryId){
    ensureLoaded();
    var e = entryById(entryId);
    if(!e || e.gifted) return;
    e.gifted = true;
    state.gifts.push({id:newId(), from:'Adi', to:'Tara', entryId:e.id, kind:'gift',
      text:e.text, photo:e.photo||null, ts:Date.now(), opened:false});
    state.entries.push({id:newId(), author:'Adi', kind:'milestone',
      text:'Adi wrapped a memory as a gift for Tara \u{1F381}',
      date:todayStr(), ts:Date.now(), photo:null});
    saveState();
    refreshGiftMarkers();
    open();
    toast('wrapped with love \u2014 it\u2019s waiting by the cottage \u{1F381}');
  }
  function sendNoteGift(text){
    var t = String(text == null ? '' : text).replace(/^\s+|\s+$/g,'');
    if(!t) return null;
    ensureLoaded();
    var gift = {id:newId(), from:'Adi', to:'Tara', entryId:null, kind:'note',
      text:t, photo:null, ts:Date.now(), opened:false};
    state.gifts.push(gift);
    state.entries.push({id:newId(), author:'Adi', kind:'note', text:t,
      date:todayStr(), ts:Date.now(), photo:null});
    saveState();
    refreshGiftMarkers();
    return {id: gift.id, x: giftSpots.Tara.x, y: giftSpots.Tara.z};
  }

  /* ---------------- gifts ---------------- */
  function pendingGiftFor(who){
    ensureLoaded();
    for(var i=0;i<state.gifts.length;i++){
      var g = state.gifts[i];
      if(g.to===who && !g.opened){
        var spot = giftSpots[who] || {x:0, z:0};
        return {id:g.id, x:spot.x, z:spot.z, gift:g};
      }
    }
    return null;
  }
  function openGift(who){
    var p = pendingGiftFor(who);
    if(!p){ toast('no gifts waiting right now'); return; }
    var g = p.gift;
    var wrap = rEl('div');
    wrap.appendChild(rEl('div','kv-sub', g.from==='Tara' ? 'a gift from Tara \u2661' : 'a gift from Adi \u2661'));
    wrap.appendChild(rEl('div','', '<div style="font-size:44px;margin:6px 0">' + (g.kind==='note' ? '\u2709\uFE0F' : '\u{1F381}') + '</div>'));
    wrap.appendChild(rEl('div','kv-q', esc(g.text)));
    if(g.photo){
      var im = document.createElement('img');
      im.src = g.photo; im.alt = 'gift photo';
      im.style.cssText = 'width:100%;border-radius:14px;margin-top:12px;border:2px solid var(--kv-line);';
      wrap.appendChild(im);
    }
    var keep = kvBtn('Keep it close \u2661');
    keep.addEventListener('click', function(){
      for(var i=0;i<state.gifts.length;i++){
        if(state.gifts[i].id===g.id){
          var gg = state.gifts[i];
          gg.opened = true; gg.openedTs = Date.now();
          if(!gg.entryId){
            state.entries.push({id:newId(), author:gg.from, kind:'note', text:gg.text,
              date:todayStr(), ts:Date.now(), photo:gg.photo||null});
            prunePhotos();
          }
          break;
        }
      }
      saveState();
      refreshGiftMarkers();
      var R = ritual(); if(R) R.close();
      toast('kept in your journal \u2661');
    });
    wrap.appendChild(keep);
    rOpen('\u2726 unwrapping \u2726', wrap, '');
  }

  /* 3D gift markers: glowing presents by the cottage, one per recipient */
  var giftMarkers = {};
  function buildGiftMarkers(){
    ['Adi','Tara'].forEach(function(who){
      var spot = giftSpots[who];
      var grp = new T.Group();
      var gy = W.groundY(spot.x, spot.z);
      grp.position.set(spot.x, gy, spot.z);
      grp.visible = false;
      W.scene.add(grp);
      getModel('seasonal/present.glb', function(tpl){
        var o;
        if(tpl){ o = tpl.clone(true); normalizeScale(o, 1.5); }
        else { o = new T.Mesh(new T.BoxGeometry(0.8,0.7,0.8), mat(0xb96a7e)); o.position.y = 0.35; }
        var m = measure(o);
        o.position.y = -m.minY + 0.55;   // float a little
        grp.add(o);
        var gl = makeGlow(2.6, 0.8);
        gl.position.y = 1.2;
        grp.add(gl);
      });
      var label = makeLabel(who==='Adi' ? '\u{1F381} for you' : '\u{1F381} for Tara', 3.4);
      label.position.y = 2.6;
      grp.add(label);
      giftMarkers[who] = grp;
      registerTap(grp, 'gift-'+who.toLowerCase(), function(){ openGift(who); });
      try{ W.staticColliders.push({x:spot.x, z:spot.z, r:0.8}); }catch(_){}
    });
    tickers.push(function(dt, t){
      ['Adi','Tara'].forEach(function(who){
        var grp = giftMarkers[who];
        if(grp && grp.visible){
          grp.position.y = W.groundY(grp.position.x, grp.position.z) + Math.sin(t*2.2)*0.12;
          grp.rotation.y = t*0.5;
        }
      });
    });
    refreshGiftMarkers();
  }
  function refreshGiftMarkers(){
    ['Adi','Tara'].forEach(function(who){
      var grp = giftMarkers[who];
      if(grp) grp.visible = !!pendingGiftFor(who);
    });
  }

  /* ---------------- hub UI ---------------- */
  function open(){
    ensureLoaded();
    ensureSeed();
    maybeTaraEntry();
    maybeTaraGift(false);
    var wrap = rEl('div');
    /* today's prompt */
    wrap.appendChild(rEl('div','kv-sub','\u2726 today\u2019s prompt \u2726'));
    var pc = rEl('div','',
      '<div style="background:rgba(30,26,72,.88);border:2px solid var(--kv-line);border-radius:18px;padding:20px;margin-bottom:6px;text-align:center">' +
      '<div style="font-size:12px;font-style:italic;color:var(--kv-ink-dim);margin-bottom:8px">' + esc(fmtDate(todayStr())) + '</div>' +
      '<div style="font-size:20px;font-style:italic;line-height:1.6;margin-bottom:14px">\u201c' + esc(todayPrompt()) + '\u201d</div></div>');
    var cap = kvBtn('\u{1F4F7} Capture this moment');
    cap.addEventListener('click', function(){ doCapture(); open(); });
    pc.appendChild(cap);
    var tp = todayPhotoEntry();
    if(tp && tp.photo){
      var tw = rEl('div','','<div style="text-align:center;margin-top:12px"></div>');
      var img = document.createElement('img');
      img.src = tp.photo; img.alt = 'today\u2019s memory photo';
      img.style.cssText = 'width:190px;border-radius:12px;border:2px solid var(--kv-line);';
      tw.appendChild(img);
      tw.appendChild(rEl('div','kv-sub','today\u2019s memory, kept \u2661'));
      if(!tp.gifted){
        var gp = kvBtn('\u{1F381} gift this photo to Tara', false);
        gp.addEventListener('click', function(){ wrapAsGift(tp.id); });
        tw.appendChild(gp);
      }
      pc.appendChild(tw);
    }
    wrap.appendChild(pc);
    /* journal */
    wrap.appendChild(rEl('div','kv-sub','\u2726 our journal \u2726'));
    var ta = document.createElement('textarea');
    ta.placeholder = 'write a little note for the journal\u2026';
    ta.style.cssText = 'width:100%;max-width:560px;min-height:84px;margin:0 auto 10px;display:block;padding:14px 16px;'+
      'font-family:inherit;font-style:italic;font-size:16px;color:#33305a;background:#fff8ec;'+
      'border:2px solid var(--kv-gold);border-radius:18px;resize:vertical;';
    wrap.appendChild(ta);
    writeBox = ta;
    var sv = kvBtn('Save to journal \u2661');
    sv.addEventListener('click', saveNote);
    wrap.appendChild(sv);
    var wn = kvBtn('\u2709 write a note for Tara\u2019s island', false);
    wn.addEventListener('click', function(){
      if(window.KVWarmth && KVWarmth.openNotes) KVWarmth.openNotes();
    });
    wrap.appendChild(wn);
    /* entries */
    var entries = state.entries.slice().sort(function(a,b){ return b.ts-a.ts; });
    if(!entries.length){
      wrap.appendChild(rEl('div','kv-sub','no memories yet \u2014 capture today\u2019s prompt above \u2726'));
    }
    entries.forEach(function(e){
      var card = rEl('div','',
        '<div style="background:rgba(30,26,72,.88);border:2px solid var(--kv-line);border-radius:16px;padding:16px 18px;margin:10px auto;max-width:560px;text-align:left">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
        '<span style="font-size:12px;font-style:italic;color:var(--kv-ink-dim);flex:1">' + esc(fmtDate(e.date)) + '</span>' +
        '<span style="font-size:11.5px;font-style:italic;padding:3px 12px;border-radius:12px;background:' +
        (e.author==='Tara' ? 'rgba(242,167,195,.25);color:#ffd9ec' : 'rgba(232,213,181,.25);color:#ffe9b0') + '">\u2661 ' + e.author + '</span></div>' +
        '<div style="font-size:16.5px;line-height:1.65;font-style:italic">' + esc(e.text) + '</div></div>');
      if(e.photo){
        var im = document.createElement('img');
        im.src = e.photo; im.alt = 'memory photo';
        im.style.cssText = 'width:100%;border-radius:10px;margin-top:10px;border:1.5px solid var(--kv-line);';
        card.firstChild.appendChild(im);
      }
      if(e.gifted){
        var gl2 = rEl('div','kv-sub','\u{1F381} wrapped as a gift');
        card.firstChild.appendChild(gl2);
      }else if(e.author==='Adi' && e.kind!=='milestone'){
        (function(id){
          var wb = kvBtn('\u{1F381} wrap as a gift for Tara', false);
          wb.style.cssText += ';min-height:48px;font-size:16px;margin-top:10px;';
          wb.addEventListener('click', function(){ wrapAsGift(id); });
          card.firstChild.appendChild(wb);
        })(e.id);
      }
      wrap.appendChild(card);
    });
    wrap.appendChild(rEl('div','kv-sub','Tara\u2019s entries and gifts here are imagined by the island AI for this demo \u2726'));
    var cb = kvBtn('close', false);
    cb.addEventListener('click', function(){ var R = ritual(); if(R) R.close(); });
    wrap.appendChild(cb);
    rOpen('\u2726 memories \u2726', wrap, '');
  }
  function close(){ var R = ritual(); if(R) R.close(); }

  return {
    open: open, close: close,
    isOpen: function(){ var R = ritual(); return !!(R && R.isOpen()); },
    openGift: openGift, pendingGiftFor: pendingGiftFor,
    sendNoteGift: sendNoteGift, doCapture: doCapture,
    todayPrompt: todayPrompt,
    buildGiftMarkers: buildGiftMarkers, refreshGiftMarkers: refreshGiftMarkers,
    _seedTaraGift: function(){ return maybeTaraGift(true); },
    _testState: function(){ ensureLoaded(); return {entries:state.entries.length, gifts:state.gifts.length}; }
  };
})();
window.KVMemories = KVMemories;

/* ============================================================
   KVWarmth — hold-hands rhythm game + notes + celebrations
   Ports kanavu-2d/warmth.js §1,2,4 into 3D. While holding hands,
   a "tap in rhythm" pill appears — tapping in time with the
   lub-dub heartbeat (1.1s cycle, beats at 0 and 0.308s) fills a
   warmth meter. On-beat taps bloom a warm glow over the pair;
   off-beat taps do nothing (never punitive). Meter full → heart
   burst, +2 stars, celebration card. Integrates with the game's
   own couple interactions: auto-starts when the pair are close
   together (hug / hand-in-hand), plus a proximity prompt and a
   nav shortcut for "across the distance" holds.
   ============================================================ */
var KVWarmth = (function(){
  var BEAT_CYC = 1.1, BEAT2 = 0.308, BEAT_WIN = 0.16;
  var TAP_FILL = 0.17, DECAY = 0.035, SESSION_MAX = 30;

  var ses = {active:false, t:0, meter:0, glow:0, lastBeat:-1,
             lastK:-1, lastPh:0, beatPulse:0, celebrateT:0};
  var holdPromptCd = 0, autoCd = 0, coupleT = 0;
  var lastPPos = null;

  /* ---------------- DOM: rhythm pill + hold prompt ---------------- */
  var pill = null, pillHeart = null, pillFill = null;
  function buildPill(){
    if(pill || document.getElementById('kvb-warm')) return;
    var st = document.createElement('style');
    st.textContent =
      '#kvb-warm{position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:119;display:none;'+
      'align-items:center;gap:10px;background:rgba(46,22,16,.82);border:1.5px solid rgba(255,210,130,.6);'+
      'color:#f3ddab;font-family:Georgia,serif;padding:9px 14px;border-radius:22px;'+
      'box-shadow:0 4px 16px rgba(20,8,14,.5);white-space:nowrap;}'+
      '#kvb-warm .kvb-heart{font-size:22px;display:inline-block;color:#ff9db0;}'+
      '#kvb-warm .kvb-label{font-size:14px;font-style:italic;}'+
      '#kvb-warm .kvb-meter{width:90px;height:8px;border-radius:4px;background:rgba(255,235,190,.18);overflow:hidden;}'+
      '#kvb-warm .kvb-fill{height:100%;width:0%;border-radius:4px;background:#f0b95a;}'+
      '#kvb-warm .kvb-x{background:none;border:none;color:#f3ddab;font-size:16px;cursor:pointer;padding:4px 6px;font-family:inherit;}'+
      '#kvb-holdprompt{position:fixed;bottom:118px;left:50%;transform:translateX(-50%);z-index:121;display:none;'+
      'align-items:center;gap:10px;background:rgba(46,22,16,.9);border:1.5px solid rgba(255,210,130,.65);'+
      'color:#f3ddab;font-family:Georgia,serif;font-size:16px;font-style:italic;'+
      'padding:12px 20px;border-radius:26px;box-shadow:0 4px 18px rgba(20,8,14,.55);cursor:pointer;white-space:nowrap;}'+
      '#kvb-holdprompt:active{transform:translateX(-50%) scale(.96);}';
    document.head.appendChild(st);
    var p = document.createElement('div');
    p.id = 'kvb-warm';
    p.innerHTML = '<span class="kvb-heart">\u2665</span><span class="kvb-label">tap in rhythm \u2661</span>'+
      '<span class="kvb-meter"><span class="kvb-fill" style="display:block"></span></span>'+
      '<button class="kvb-x" aria-label="release hands">\u2715</button>';
    p.querySelector('.kvb-x').addEventListener('click', function(e){
      e.stopPropagation(); endSession('released \u2661');
    });
    document.body.appendChild(p);
    pill = p; pillHeart = p.querySelector('.kvb-heart'); pillFill = p.querySelector('.kvb-fill');
    var hp = document.createElement('div');
    hp.id = 'kvb-holdprompt';
    hp.innerHTML = '\u2661 hold hands? <span style="font-style:normal">\u2014 tap in rhythm with our heartbeat</span>';
    hp.addEventListener('click', function(){ hp.style.display='none'; startSession('prompt'); });
    document.body.appendChild(hp);
  }

  /* ---------------- glow sprites over the pair ---------------- */
  var glowP = null, glowQ = null;
  function buildGlows(){
    if(glowP) return;
    glowP = makeGlow(3.2, 0); W.scene.add(glowP);
    glowQ = makeGlow(3.2, 0); W.scene.add(glowQ);
  }
  function updateGlows(t){
    if(!glowP) return;
    var on = ses.active;
    var pp = playerPos(), qp = partnerPos();
    var base = on ? (0.35 + 0.65*ses.glow) : 0;
    var pulse = 1 + (ses.beatPulse||0)*0.35;
    if(pp){
      glowP.position.set(pp.x, (pp.y||W.groundY(pp.x,pp.z)) + 1.6, pp.z);
      glowP.scale.set(3.2*pulse, 3.2*pulse, 1);
      glowP.material.opacity = base*0.85;
    }else glowP.material.opacity = 0;
    if(qp){
      glowQ.position.set(qp.x, (qp.y||W.groundY(qp.x,qp.z)) + 1.6, qp.z);
      glowQ.scale.set(3.2*pulse, 3.2*pulse, 1);
      glowQ.material.opacity = base*0.85;
    }else glowQ.material.opacity = 0;
  }

  /* ---------------- session ---------------- */
  function startSession(src){
    if(ses.active) return;
    buildPill(); buildGlows();
    ses.active = true; ses.t = 0; ses.meter = 0; ses.glow = 0;
    ses.lastBeat = -1; ses.lastK = -1; ses.lastPh = 0; ses.beatPulse = 0; ses.celebrateT = 0;
    pill.style.display = 'flex';
    var hp = document.getElementById('kvb-holdprompt');
    if(hp) hp.style.display = 'none';
    if(src === 'auto') toast('your hearts beat as one \u2661 \u2014 tap in rhythm');
    else if(src === 'prompt') toast('hand in hand \u2661 tap in rhythm with the heartbeat');
  }
  function endSession(msg){
    if(!ses.active) return;
    ses.active = false;
    if(pill) pill.style.display = 'none';
    if(msg) toast(msg);
    autoCd = performance.now()/1000 + 45;   // don't instantly re-trigger
  }
  function onMeterFull(){
    ses.meter = 0; ses.celebrateT = 2.8; ses.glow = 1.2;
    var pp = playerPos(), qp = partnerPos();
    var mx = pp ? pp.x : 0, mz = pp ? pp.z : 0, my = 0;
    if(pp && qp){ mx = (pp.x+qp.x)/2; mz = (pp.z+qp.z)/2; }
    my = W.groundY(mx, mz) + 2;
    try{
      var gl = makeGlow(9, 1);
      gl.position.set(mx, my, mz); W.scene.add(gl);
      var born = performance.now();
      var fn2 = function(){
        var k = (performance.now()-born)/1100;
        if(k>=1){ try{W.scene.remove(gl);}catch(e){} fn2._dead = true; return; }
        var s = 9 + k*10;
        gl.scale.set(s, s, 1); gl.material.opacity = 1-k;
      };
      tickers.push(fn2);
    }catch(e){}
    addStars(2);
    toast('your hearts beat as one \u2726', 2800);
    celebrate('your hearts beat as one \u2726', 'a warm moment, kept in today');
  }
  function rhythmTap(x, y){
    if(!ses.active) return false;
    if(y < 80) return false;    // top UI zone belongs to pills/buttons
    var t = ses.t;
    var k = Math.floor(t / BEAT_CYC), ph = t - k*BEAT_CYC;
    var d0 = ph < 0.55 ? ph : BEAT_CYC - ph;
    var d1 = ph > BEAT2 ? ph - BEAT2 : BEAT2 - ph;
    var onBeatSide = d0 <= d1;
    var id = onBeatSide ? k*2 : k*2+1;
    var d = onBeatSide ? d0 : d1;
    if(d <= BEAT_WIN && id !== ses.lastBeat){
      ses.lastBeat = id;
      ses.meter = Math.min(1, ses.meter + TAP_FILL);
      ses.glow = 1; ses.beatPulse = 1;
    }
    /* off-beat: acknowledged silently, never punitive */
    return true;
  }

  /* per-frame: beat clock, meter decay, glow, auto-detect */
  tickers.push(function(dt, t){
    if(ses.active){
      ses.t += dt;
      var k = Math.floor(ses.t / BEAT_CYC), ph = ses.t - k*BEAT_CYC;
      if(ses.lastK < 0){ ses.lastK = k; ses.lastPh = ph; }
      else{
        if(k !== ses.lastK || ph < ses.lastPh){ ses.beatPulse = 1; ses.lastK = k; }
        else if(ses.lastPh < BEAT2 && ph >= BEAT2){ ses.beatPulse = 1; }
        ses.lastPh = ph;
      }
      ses.beatPulse = Math.max(0, ses.beatPulse - dt*3);
      ses.glow = Math.max(0, ses.glow - dt*1.1);
      if(ses.celebrateT > 0){ ses.celebrateT -= dt; }
      else{
        ses.meter = Math.max(0, ses.meter - dt*DECAY);
        if(ses.meter >= 1) onMeterFull();
      }
      if(pillHeart) pillHeart.style.transform = 'scale(' + (1 + ses.beatPulse*0.55).toFixed(3) + ')';
      if(pillFill) pillFill.style.width = (ses.meter*100).toFixed(1) + '%';
      if(ses.t > SESSION_MAX && ses.celebrateT <= 0) endSession('such a warm moment \u2661');
    }
    updateGlows(t);
    /* couple auto-detect: close together + still → the heartbeat finds them */
    try{
      if(ses.active || W.decoMode) { coupleT = 0; }
      else{
        var pp = playerPos(), qp = partnerPos();
        var R = ritual(); var uiOpen = R && R.isOpen();
        if(pp && qp && !uiOpen && t > autoCd){
          var d = Math.hypot(pp.x-qp.x, pp.z-qp.z);
          var pStill = true, qStill = true;
          if(lastPPos){
            pStill = Math.hypot(pp.x-lastPPos.x, pp.z-lastPPos.z) < 0.9;
            qStill = Math.hypot(qp.x-lastPPos.qx, qp.z-lastPPos.qz) < 0.9;
          }
          lastPPos = {x:pp.x, z:pp.z, qx:qp.x, qz:qp.z};
          var pspeed = 0;
          try{ pspeed = W.player && W.player.speed ? W.player.speed : 0; }catch(e){}
          if(d < 1.7 && pStill && qStill && pspeed < 0.8){
            coupleT += dt;
            if(coupleT > 2.5){ coupleT = 0; startSession('auto'); }
          }else coupleT = 0;
          /* proximity prompt: near but not coupled */
          var hp = document.getElementById('kvb-holdprompt');
          if(hp){
            var show = d < 3.6 && d >= 1.7 && t > holdPromptCd && !uiOpen;
            if(show && hp.style.display !== 'flex'){ hp.style.display = 'flex'; }
            else if(!show && hp.style.display === 'flex'){ hp.style.display = 'none'; }
          }
        }else{
          coupleT = 0;
          lastPPos = (pp && qp) ? {x:pp.x, z:pp.z, qx:qp.x, qz:qp.z} : lastPPos;
          var hp2 = document.getElementById('kvb-holdprompt');
          if(hp2 && hp2.style.display === 'flex') hp2.style.display = 'none';
        }
      }
    }catch(e){}
  });
  /* prompt cooldown refresh (dismissed by starting or walking away) */
  tickers.push((function(){
    var last = 0;
    return function(dt, t){
      if(t - last < 3) return;
      last = t;
      var hp = document.getElementById('kvb-holdprompt');
      if(hp && hp.style.display === 'flex'){
        var pp = playerPos(), qp = partnerPos();
        if(!pp || !qp || Math.hypot(pp.x-qp.x, pp.z-qp.z) >= 3.6){
          hp.style.display = 'none';
          holdPromptCd = t + 60;
        }
      }
    };
  })());

  /* ---------------- celebration card (shared language) ---------------- */
  function celebrate(title, sub){
    var wrap = rEl('div');
    wrap.appendChild(rEl('div','', '<div style="font-size:20px;letter-spacing:8px;color:var(--kv-gold);margin-bottom:10px">\u2726 \u2726 \u2726</div>'));
    wrap.appendChild(rEl('div','kv-q', esc(title)));
    if(sub) wrap.appendChild(rEl('div','kv-sub', esc(sub)));
    var cb = kvBtn('keep it close \u2661');
    cb.addEventListener('click', function(){ var R = ritual(); if(R) R.close(); });
    wrap.appendChild(cb);
    rOpen('\u2726 celebration \u2726', wrap, '');
  }

  /* ---------------- notes (a note for Tara's island) ---------------- */
  function openNotes(){
    var wrap = rEl('div');
    wrap.appendChild(rEl('div','kv-sub','sealed with love \u2014 it will appear as a floating gift by the memory cottage'));
    var ta = document.createElement('textarea');
    ta.placeholder = 'write a little something\u2026';
    ta.setAttribute('aria-label','note text');
    ta.style.cssText = 'width:100%;max-width:560px;min-height:120px;margin:6px auto 4px;display:block;padding:14px 16px;'+
      'font-family:inherit;font-style:italic;font-size:16.5px;line-height:1.6;color:#33305a;background:#fff8ec;'+
      'border:2px solid var(--kv-gold);border-radius:18px;resize:vertical;';
    wrap.appendChild(ta);
    var send = kvBtn('Send to her island \u2726');
    send.addEventListener('click', function(){
      var v = ta.value.replace(/^\s+|\s+$/g,'');
      if(!v){ ta.placeholder = 'write a little something first \u2661'; return; }
      var ok = false;
      try{ ok = !!(window.KVMemories && KVMemories.sendNoteGift && KVMemories.sendNoteGift(v)); }catch(e){}
      var R = ritual(); if(R) R.close();
      var pp = playerPos();
      if(pp){
        try{
          var gl = makeGlow(6, 0.9);
          gl.position.set(pp.x, W.groundY(pp.x,pp.z)+2.4, pp.z); W.scene.add(gl);
          var born = performance.now();
          var fn = function(){
            var kk = (performance.now()-born)/800;
            if(kk>=1){ try{W.scene.remove(gl);}catch(e){} fn._dead = true; return; }
            gl.material.opacity = 0.9*(1-kk);
          };
          tickers.push(fn);
        }catch(e){}
      }
      toast(ok ? 'sealed with love \u2709 \u2014 waiting by the cottage' : 'the note drifted away\u2026 try again', 2600);
    });
    wrap.appendChild(send);
    var later = kvBtn('not now', false);
    later.addEventListener('click', function(){ var R = ritual(); if(R) R.close(); });
    wrap.appendChild(later);
    rOpen('\u2709 a note for Tara \u2726', wrap, '');
    setTimeout(function(){ try{ ta.focus(); }catch(e){} }, 120);
  }

  /* ---------------- warmth hub ---------------- */
  function openHub(){
    var wrap = rEl('div');
    wrap.appendChild(rEl('div','kv-sub','small warm moments, just for two'));
    var hold = kvBtn('\u2661 Hold hands \u2014 tap in rhythm');
    hold.addEventListener('click', function(){
      var R = ritual(); if(R) R.close();
      startSession('hub');
    });
    wrap.appendChild(hold);
    wrap.appendChild(rEl('div','kv-sub',
      'Hold hands across the distance, or walk up to each other \u2014 when you\u2019re close, the heartbeat finds you on its own. ' +
      'Tap in time with the lub-dub \u2661 and fill the warmth meter together.'));
    var note = kvBtn('\u2709 Write a note for Tara', false);
    note.addEventListener('click', openNotes);
    wrap.appendChild(note);
    var cb = kvBtn('close', false);
    cb.addEventListener('click', function(){ var R = ritual(); if(R) R.close(); });
    wrap.appendChild(cb);
    rOpen('\u2726 warmth \u2726', wrap, '');
  }

  return {
    openHub: openHub, openNotes: openNotes, celebrate: celebrate,
    rhythmTap: rhythmTap, startSession: startSession, endSession: endSession,
    buildPill: buildPill,
    _testState: function(){
      return {active:ses.active, meter:+ses.meter.toFixed(3), t:+ses.t.toFixed(2)};
    }
  };
})();
window.KVWarmth = KVWarmth;

/* ---------------- init: build the world additions ---------------- */
function initBuildings(){
  try{ buildBookshop(); }catch(e){ console.warn('[kvb] bookshop', e); }
  try{ buildLighthouse(); }catch(e){ console.warn('[kvb] lighthouse', e); }
  try{ buildTheatre(); }catch(e){ console.warn('[kvb] theatre', e); }
  try{ buildCottage(); }catch(e){ console.warn('[kvb] cottage', e); }
  try{ buildStringLights(); }catch(e){ console.warn('[kvb] lights', e); }
  try{ KVMemories.buildGiftMarkers(); }catch(e){ console.warn('[kvb] gifts', e); }
  try{ KVGames.spawnFlies(); KVGames.buildHud(); }catch(e){ console.warn('[kvb] flies', e); }
  try{ KVBeacon.buildFlameBtn(); }catch(e){ console.warn('[kvb] flame', e); }
  try{ KVWarmth.buildPill(); }catch(e){ console.warn('[kvb] warmth pill', e); }

  /* bottom-nav dual access — decks/memories/beacon re-register the
     daily stream's placeholder pills with real handlers */
  try{
    var N = window.KVNav;
    if(N && N.register){
      N.register('decks', '🃏', 'Decks', function(){ KVDecks.open(); });
      N.register('memories', '📖', 'Memories', function(){ KVMemories.open(); });
      N.register('beacon', '🕯️', 'Beacon', function(){ KVBeacon.openPanel(); });
      N.register('games', '🎭', 'Games', function(){ KVGames.open(); });
      N.register('warmth', '💞', 'Warmth', function(){ KVWarmth.openHub(); });
    }
  }catch(e){ console.warn('[kvb] nav', e); }

  chainTap();
  setInterval(rechTap, 2500);
  frameLoop();
}

window.__kvBuildings = {
  sites: SITE,
  giftSpots: giftSpots,
  tapCount: function(){ return tapGroups.length; },
  cacheStats: function(){
    var n = 0, ok = 0;
    for(var k in cache){ n++; if(cache[k].st === 2) ok++; }
    return {cached:n, ready:ok};
  },
  state: function(){
    return {
      decks: KVDecks._testState(),
      beacon: KVBeacon._testState(),
      games: KVGames._testState(),
      memories: KVMemories._testState(),
      warmth: KVWarmth._testState()
    };
  },
  /* QA helpers */
  qaOpen: function(which){
    if(which==='decks') KVDecks.open();
    else if(which==='beacon') KVBeacon.openPanel();
    else if(which==='games') KVGames.open();
    else if(which==='memories') KVMemories.open();
    else if(which==='warmth') KVWarmth.openHub();
    else if(which==='gift'){ KVMemories._seedTaraGift(); KVMemories.openGift('Adi'); }
    else if(which==='hold'){ KVWarmth.startSession('hub'); }
    return true;
  }
};

initBuildings();

} // end init(W)

}();
