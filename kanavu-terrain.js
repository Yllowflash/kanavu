/* ============================================================
   Kanavu — Stream 1: bigger island + premium terrain support
   - Dense instanced grass blades with wind sway (procedural)
   - MegaKit placeholder slots (tall-pine, broadleaf, rocks...)
     -> slots stay EMPTY until setMegakitBase(url) is called.
        NEVER falls back to old assets (Adi: "don't use any old ones").
   - Water glints (ocean + pond), animated shoreline foam
   - Cliff rock strata vertex-color pass on the terrain dome
   - New path network (uses the game's own ge() via W.path)
   - Dappled light pools in temple woods
   - clearLegacyVegetation(): one-call cutover that hides ALL old
     vegetation (code-built trees + old GLB placements) for the
     MegaKit switch. OFF by default — parent enables when ready.
   Graceful: if the world hook is missing, this file is a silent no-op.
   ============================================================ */
!function(){
"use strict";
function findDome(W){
  // hook#2 exposes dome directly; in the offline demo (or if the hook lags),
  // find the terrain mesh by traversal: the largest PlaneGeometry mesh.
  if(W.dome && W.dome.geometry) return W.dome;
  var best=null, bestN=0;
  try{
    W.scene.traverse(function(o){
      if(!o.isMesh || !o.geometry || !o.geometry.attributes) return;
      var g=o.geometry;
      if(g.type!=='PlaneGeometry' && !(g.attributes.position&&g.attributes.color)) return;
      var n=g.attributes.position.count;
      if(n>bestN && n>20000){ bestN=n; best=o; }
    });
  }catch(_){}
  return best;
}
function boot(){
  var W = window.__kvWorld;
  if(!W || !W.scene || !W.groundY || !window.THREE) return false;
  if(!findDome(W)) return false;   // terrain mesh not built yet; retry
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
W.dome = findDome(W);

/* ================= utils ================= */
function sRnd(seed){ var x = Math.sin(seed*127.1+311.7)*43758.5453; return x - Math.floor(x); }
function hash2(x,z){ var h = Math.sin(x*12.9898+z*78.233)*43758.5453; return h - Math.floor(h); }
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function sstep(a,b,x){ var t = clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); }
function segDist(px,pz,ax,az,bx,bz){
  var dx=bx-ax, dz=bz-az, L2=dx*dx+dz*dz;
  var t = L2>0 ? ((px-ax)*dx+(pz-az)*dz)/L2 : 0;
  t = clamp(t,0,1);
  var cx=ax+dx*t, cz=az+dz*t;
  return Math.hypot(px-cx,pz-cz);
}
// cheap slope from groundY (central differences)
function slopeAt(x,z){
  var e=0.7;
  var dx = W.groundY(x+e,z)-W.groundY(x-e,z);
  var dz = W.groundY(x,z+e)-W.groundY(x,z-e);
  return Math.hypot(dx,dz)/(2*e);
}

/* ================= quality tiers (kv-quality-change contract) =================
   kanavu-quality.js (separate stream) dispatches:
     window.dispatchEvent(new CustomEvent('kv-quality-change', {detail:{tier}}))
   tier: 'low' | 'medium' | 'high' | 'ultra'. Default 'medium'.
   30fps floor must hold at 'low' on iPad: techniques stay, counts scale. */
var QUALITY = {
  low:    { grass: 0.40, trees: 0.50 },
  medium: { grass: 0.70, trees: 0.75 },
  high:   { grass: 1.00, trees: 1.00 },
  ultra:  { grass: 1.45, trees: 1.20 }
};
var currentTier = 'medium';
function qf(){ return QUALITY[currentTier] || QUALITY.medium; }

function clearGrass(){
  for(var k=0;k<grassChunkOrder.length;k++){
    var ch = grassChunks[grassChunkOrder[k]];
    if(ch.group){ try{ W.scene.remove(ch.group); }catch(_){} ch.group=null; }
    ch.built = false; ch.blades = 0;
  }
  stats.grassBlades = 0;
}
/* slot instance rebuild on tier change */
var slotBuilds = [];   // {slot, tpl, pl, wrap}
function rebuildSlots(){
  var f = qf();
  for(var b=0;b<slotBuilds.length;b++){
    (function(rec){
      if(!rec.wrap) return;
      try{ W.scene.remove(rec.wrap); }catch(_){}
      try{
        rec.wrap.traverse(function(o){
          if(o.isInstancedMesh){ try{ o.dispose(); }catch(_){} }
        });
      }catch(_){}
    })(slotBuilds[b]);
  }
  slotBuilds = [];
  stats.slotDraws = 0; stats.slotTrees = 0;
  // re-place every loaded template with tier-scaled counts
  var seen = {};
  for(var u in slotCache){
    var e = slotCache[u];
    if(e && e.st===2 && e.tpl && e.slot && e.pl && !seen[e.slot]){
      seen[e.slot] = 1;
      try{
        var rec = buildSlotFor(e.slot, e.tpl, e.pl);
        if(rec) slotBuilds.push(rec);
      }catch(_){}
    }
  }
}
function applyQuality(tier){
  if(!QUALITY[tier]) tier = 'medium';
  if(tier === currentTier) return;
  currentTier = tier;
  try{ console.log('[kv-terrain] quality -> '+tier); }catch(_){}
  try{ clearGrass(); }catch(_){}
  try{ rebuildSlots(); }catch(_){}
  try{ updateGrass(1); }catch(_){}
}
window.addEventListener('kv-quality-change', function(e){
  try{ applyQuality(e && e.detail && e.detail.tier); }catch(_){}
});

/* ================= shared time uniform + ticker ================= */
var uTime = { value: 0 };
var _t0 = (typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
try{
  if(W.tickers && W.tickers.push){ W.tickers.push(function(t){ uTime.value = t; }); }
  else { setInterval(function(){ uTime.value = (performance.now()-_t0)/1000; }, 50); }
}catch(_){
  try{ setInterval(function(){ uTime.value = (performance.now()-_t0)/1000; }, 50); }catch(_){}
}

/* ================= path network (uses game's own ge() look) ================= */
var PATHS = [
  // plaza -> east harbor dock beach
  { pts:[[2,11],[14,10],[30,8],[48,12],[64,18],[80,26],[92,32],[100,36]], w:2.2, stone:false },
  // north path end -> highlands summit (verified dry S-curve causeway)
  { pts:[[36,72],[24,71],[12,71],[2,72],[-6,74],[-2,82],[4,90],[12,96],[20,102],[17,107],[22,110],[25,113],[25,115]], w:2.0, stone:false },
  // beach -> south gardens
  { pts:[[8,-58],[-2,-70],[-10,-84],[-18,-98],[-22,-108],[-25,-114]], w:2.2, stone:false },
  // west cliff walk
  { pts:[[-40,8],[-58,6],[-76,4],[-94,2],[-110,0],[-126,-2],[-140,-4]], w:2.0, stone:false },
  // harbor cove rim loop (arc around the cove)
  { pts:[[86,30],[96,38],[108,42],[120,38],[128,28],[130,16],[126,4],[116,-4]], w:1.8, stone:false },
  // temple woods organic loop (closed)
  { pts:[[8,-20],[16,-32],[28,-36],[34,-26],[28,-16],[16,-14],[8,-20]], w:1.8, stone:false },
  // stone ring around plaza fountain court
  { pts:[[-10,2],[-5,8],[5,8],[10,2],[5,-4],[-5,-4],[-10,2]], w:1.6, stone:true }
];
var DIRT = 0xD6BD85, STONE = 0xA79E8F;
var pathSamples = [];   // sampled centerline points for grass exclusion

function buildPaths(){
  if(!W.path){ try{ console.log('[kv-terrain] W.path missing — paths skipped'); }catch(_){} return; }
  PATHS.forEach(function(p, pi){
    try{
      var mesh = W.path(p.pts, p.w, p.stone?STONE:DIRT, 0.1, p.stone?{stone:true}:null);
      if(mesh) W.scene.add(mesh);
      // sample the curve for exclusion tests (cheap polyline sampling)
      var pts = p.pts, closed = pts.length>2 &&
        Math.hypot(pts[0][0]-pts[pts.length-1][0], pts[0][1]-pts[pts.length-1][1]) < 0.01;
      var v3 = pts.map(function(q){ return new THREE_.Vector3(q[0],0,q[1]); });
      var curve = new THREE_.CatmullRomCurve3(v3, closed);
      var n = Math.max(24, pts.length*8);
      for(var k=0;k<=n;k++){
        var s = curve.getPoint(k/n);
        pathSamples.push({x:s.x, z:s.z});
      }
    }catch(_){}
  });
}
function nearPath(x, z, r){
  for(var k=0;k<pathSamples.length;k+=3){
    var dx=x-pathSamples[k].x, dz=z-pathSamples[k].z;
    if(dx*dx+dz*dz < r*r) return true;
  }
  return false;
}

/* exclusion discs (plaza court, pond basin) — grass stays out */
var EXCLUDE = [
  {x:0, z:2, r:13.5},     // plaza stone court
  {x:-32, z:-6, r:9.0},   // pond basin
  {x:100, z:38, r:16},    // harbor dock pad (Stream 3 builds here)
  {x:-25, z:-115, r:24},  // garden plots (Stream 3 builds here)
  {x:25, z:115, r:9}      // highland summit pad
];
function inExclude(x,z){
  for(var k=0;k<EXCLUDE.length;k++){
    var e=EXCLUDE[k], dx=x-e.x, dz=z-e.z;
    if(dx*dx+dz*dz < e.r*e.r) return true;
  }
  return false;
}

/* ================= dense instanced grass =================
   Thousands of individual blades, chunked for distance culling.
   One draw call per visible chunk. Wind sway in-shader (zero CPU). */
var grassChunks = {};   // key -> {built, group}
var grassChunkOrder = [];
var GRASS_CELL = 32, GRASS_BUILD = 132, GRASS_RANGE = 112;

function bladeGeometry(){
  var g = new THREE_.PlaneGeometry(0.16, 1, 1, 1);
  var pos = g.attributes.position, uv = g.attributes.uv;
  for(var k=0;k<pos.count;k++){
    var v = uv.getY(k);              // 0 base -> 1 tip
    pos.setX(k, pos.getX(k)*(1-v*0.85));  // taper to a point
    pos.setZ(k, v*v*0.22);           // slight forward bend
  }
  g.translate(0, 0.5, 0);
  g.computeVertexNormals();
  return g;
}

function grassMaterial(){
  var m = new THREE_.MeshLambertMaterial({ side: THREE_.DoubleSide });
  m.onBeforeCompile = function(sh){
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>',
        '#include <begin_vertex>\n' +
        '#ifdef USE_INSTANCING\n' +
        ' vec2 gIp = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);\n' +
        ' float gH = clamp(transformed.y, 0.0, 1.0);\n' +
        ' float gSw = sin(uTime*1.9 + gIp.x*0.35 + gIp.y*0.29) + 0.5*sin(uTime*3.7 + gIp.y*0.53);\n' +
        ' transformed.x += gSw*0.11*gH*gH;\n' +
        ' transformed.z += gSw*0.06*gH*gH;\n' +
        '#endif');
  };
  return m;
}

// zone density weight: lush meadows/gardens dense, highlands sparse
function grassDensity(x, z, g){
  var n = Math.hypot(x, z);
  var w = 0.48;
  var gm = 1 - sstep(20, 45, Math.hypot(x+25, z+115));  // south gardens
  w += 0.65*gm;
  var md = 1 - sstep(60, 110, n);                        // inner meadows
  w += 0.25*md;
  var wd = 1 - sstep(8, 30, Math.hypot(x-20, z+28));      // temple woods floor
  w += 0.45*wd;
  var wm = 1 - sstep(8, 26, Math.hypot(x+28, z-12));       // west meadow
  w += 0.5*wm;
  var hl = sstep(60, 100, z);                             // highlands: thinner
  w *= (1 - 0.45*hl);
  if(g > 11) w *= 0.4;                                   // near snowline
  return w;
}

var _m4 = null, _q = null, _p = null, _sc = null, _col = null;
function buildGrass(){
  _m4 = new THREE_.Matrix4(); _q = new THREE_.Quaternion();
  _p = new THREE_.Vector3(); _sc = new THREE_.Vector3(); _col = new THREE_.Color();
  var up = new THREE_.Vector3(0,1,0);
  // register chunk slots (lazy build on approach — never all at once)
  for(var cx=-176; cx<176; cx+=GRASS_CELL){
    for(var cz=-176; cz<176; cz+=GRASS_CELL){
      var ccx = cx+GRASS_CELL/2, ccz = cz+GRASS_CELL/2;
      if(Math.hypot(ccx,ccz) > 160) continue;
      var key = cx+','+cz;
      var chunkNearPath = false;
      for(var ps=0; ps<pathSamples.length; ps+=6){
        var pdx=ccx-pathSamples[ps].x, pdz=ccz-pathSamples[ps].z;
        if(pdx*pdx+pdz*pdz < 34*34){ chunkNearPath=true; break; }
      }
      grassChunks[key] = { built:false, group:null, cx:cx, cz:cz,
        ccx:ccx, ccz:ccz, chunkNearPath:chunkNearPath, blades:0 };
      grassChunkOrder.push(key);
    }
  }
  stats.grassChunks = grassChunkOrder.length;
  updateGrass(1);
  return 0;
}

var _bladeGeo = null, _bladeMat = null;
function buildGrassChunk(ch){
  if(ch.built) return;
  ch.built = true;
  if(!_bladeGeo) _bladeGeo = bladeGeometry();
  if(!_bladeMat) _bladeMat = grassMaterial();
  var up = new THREE_.Vector3(0,1,0);
  var mats = [], cols = [];
  var seed = (ch.cx*7+ch.cz*13);
  var qg = qf().grass;
  var tries = Math.round(560*qg);
  for(var k=0;k<tries;k++){
    var x = ch.cx + sRnd(seed+k*3.1)*GRASS_CELL;
    var z = ch.cz + sRnd(seed+k*7.7)*GRASS_CELL;
    var g = W.groundY(x,z);
    if(g < 0.35 || g > 13.5) continue;
    if(slopeAt(x,z) > 0.62) continue;
    if(inExclude(x,z)) continue;
    if(ch.chunkNearPath && nearPath(x,z,1.7)) continue;
    var dens = grassDensity(x,z,g)* (0.55+0.45*qg);
    if(sRnd(seed+k*13.3) > dens) continue;
    _p.set(x, g-0.05, z);
    _q.setFromAxisAngle(up, sRnd(seed+k*5.9)*Math.PI*2);
    var h = 0.55 + sRnd(seed+k*9.2)*0.75;
    _sc.set(0.8+sRnd(seed+k*4.4)*0.7, h, 1);
    _m4.compose(_p, _q, _sc);
    mats.push(_m4.clone());
    var t = sRnd(seed+k*11.1);
    _col.setHSL(0.26 + (t-0.5)*0.05, 0.52, 0.32 + sRnd(seed+k*17.7)*0.18);
    cols.push(_col.clone());
  }
  ch.blades = mats.length;
  if(!mats.length) return;
  var im = new THREE_.InstancedMesh(_bladeGeo, _bladeMat, mats.length);
  for(var j=0;j<mats.length;j++){ im.setMatrixAt(j, mats[j]); im.setColorAt(j, cols[j]); }
  im.instanceMatrix.needsUpdate = true;
  if(im.instanceColor) im.instanceColor.needsUpdate = true;
  im.frustumCulled = false;   // we cull per-chunk manually
  im.userData.noCast = true;  // grass never casts shadows
  var grp = new THREE_.Group();
  grp.add(im);
  W.scene.add(grp);
  ch.group = grp;
  stats.grassBlades = (stats.grassBlades||0) + mats.length;
}

// lazy build on approach + distance cull; runs on a light interval.
// Two-phase: phase 1 builds the immediately-visible ring at once,
// phase 2 streams the rest a few chunks per tick (no startup hitch).
var GRASS_NEAR = 64;
function updateGrass(phase){
  var c = W.camera.position;
  var built = 0;
  var limit = phase===2 ? 4 : 100000;
  for(var k=0;k<grassChunkOrder.length;k++){
    var ch = grassChunks[grassChunkOrder[k]];
    var dx = ch.ccx - c.x, dz = ch.ccz - c.z;
    var d2 = dx*dx+dz*dz;
    if(!ch.built && d2 < GRASS_BUILD*GRASS_BUILD){
      if(phase===1 && d2 > GRASS_NEAR*GRASS_NEAR) continue;
      try{ buildGrassChunk(ch); }catch(_){ ch.built=true; }
      if(++built >= limit) break;
    }
    if(ch.group) ch.group.visible = d2 < GRASS_RANGE*GRASS_RANGE;
  }
}

/* ================= water life: sun glints + shoreline foam ================
   One THREE.Points draw call each, fully shader-animated (zero CPU). */
function sparkleTexture(){
  var cv = document.createElement('canvas'); cv.width = cv.height = 64;
  var ctx = cv.getContext('2d');
  var g = ctx.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,'rgba(255,255,255,1)');
  g.addColorStop(0.3,'rgba(255,250,230,0.7)');
  g.addColorStop(1,'rgba(255,250,230,0)');
  ctx.fillStyle = g; ctx.fillRect(0,0,64,64);
  return new THREE_.CanvasTexture(cv);
}
function pointsMaterial(size, opacity){
  return new THREE_.ShaderMaterial({
    uniforms: { uTime: uTime, uTex: { value: sparkleTexture() }, uOp: { value: opacity } },
    transparent: true, depthWrite: false, blending: THREE_.AdditiveBlending,
    vertexShader: [
      'attribute float aPhase; attribute float aSize; attribute float aSpeed;',
      'uniform float uTime; varying float vTw;',
      'void main(){',
      ' vec3 p = position;',
      ' p.x += sin(uTime*0.07 + aPhase*1.7)*2.0;',
      ' p.z += cos(uTime*0.05 + aPhase*2.3)*2.0;',
      ' vec4 mv = modelViewMatrix * vec4(p,1.0);',
      ' gl_Position = projectionMatrix * mv;',
      ' float dist = -mv.z;',
      ' gl_PointSize = aSize * (160.0 / max(dist,1.0));',
      ' vTw = 0.5 + 0.5*sin(uTime*aSpeed + aPhase*6.2831);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D uTex; uniform float uOp; varying float vTw;',
      'void main(){',
      ' vec4 t = texture2D(uTex, gl_PointCoord);',
      ' float a = t.a * uOp * (0.25 + 0.75*vTw*vTw);',
      ' gl_FragColor = vec4(t.rgb, a);',
      '}'
    ].join('\n')
  });
}
function buildPoints(list, size, opacity){
  var n = list.length;
  var pos = new Float32Array(n*3), ph = new Float32Array(n),
      sz = new Float32Array(n), sp = new Float32Array(n);
  for(var k=0;k<n;k++){
    pos[k*3]=list[k][0]; pos[k*3+1]=list[k][1]; pos[k*3+2]=list[k][2];
    ph[k]=list[k][3]; sz[k]=list[k][4]; sp[k]=list[k][5];
  }
  var g = new THREE_.BufferGeometry();
  g.setAttribute('position', new THREE_.BufferAttribute(pos,3));
  g.setAttribute('aPhase', new THREE_.BufferAttribute(ph,1));
  g.setAttribute('aSize', new THREE_.BufferAttribute(sz,1));
  g.setAttribute('aSpeed', new THREE_.BufferAttribute(sp,1));
  var pts = new THREE_.Points(g, pointsMaterial(size, opacity));
  pts.frustumCulled = false;
  W.scene.add(pts);
  return pts;
}

function buildGlints(){
  // ocean sun glints
  var list = [], seed = 4242;
  for(var k=0;k<150;k++){
    var a = sRnd(seed+k)*Math.PI*2, r = 40 + sRnd(seed+k+999)*135;
    var x = Math.cos(a)*r, z = Math.sin(a)*r;
    if(W.groundY(x,z) > -0.5) continue;   // only open water
    list.push([x, -0.30, z, sRnd(seed+k+7), 2.2+sRnd(seed+k+13)*3.2, 0.6+sRnd(seed+k+21)*1.6]);
  }
  buildPoints(list, 1, 0.85);
  // pond glints
  var pl = [];
  for(var j=0;j<26;j++){
    var a2 = sRnd(seed+5000+j)*Math.PI*2, r2 = Math.sqrt(sRnd(seed+5100+j))*6;
    var x2 = -32+Math.cos(a2)*r2, z2 = -6+Math.sin(a2)*r2;
    pl.push([x2, W.groundY(x2,z2)+0.35, z2, sRnd(seed+5200+j), 1.4+sRnd(seed+5300+j)*1.6, 0.8+sRnd(seed+5400+j)*1.4]);
  }
  buildPoints(pl, 1, 0.7);
}

function shorelineRadius(angle){
  // binary search the waterline along a ray from origin
  var lo=20, hi=178;
  for(var k=0;k<18;k++){
    var mid=(lo+hi)/2;
    var x=Math.cos(angle)*mid, z=Math.sin(angle)*mid;
    if(W.groundY(x,z) > -0.35) lo=mid; else hi=mid;
  }
  return (lo+hi)/2;
}
function buildFoam(){
  var list = [], seed = 777;
  for(var k=0;k<640;k++){
    var a = (k/640)*Math.PI*2 + (sRnd(seed+k)-0.5)*0.02;
    var r = shorelineRadius(a);
    if(r>176) continue;
    var rr = r + (sRnd(seed+k+31)-0.5)*2.2;
    var x = Math.cos(a)*rr, z = Math.sin(a)*rr;
    list.push([x, -0.26, z, (k/640), 2.6+sRnd(seed+k+57)*3.4, 0.5+sRnd(seed+k+83)*0.5]);
  }
  // harbor cove shoreline
  for(var j=0;j<120;j++){
    var a2 = (j/120)*Math.PI*2;
    var lo=44, hi=6;
    for(var q=0;q<14;q++){
      var mid=(lo+hi)/2;
      var x2=112+Math.cos(a2)*mid, z2=15+Math.sin(a2)*mid;
      if(W.groundY(x2,z2) > -0.35) lo=mid; else hi=mid;
    }
    var rr2=(lo+hi)/2 + (sRnd(seed+9000+j)-0.5)*1.6;
    list.push([112+Math.cos(a2)*rr2, -0.26, 15+Math.sin(a2)*rr2, j/120, 2.0+sRnd(seed+9100+j)*2.4, 0.5+sRnd(seed+9200+j)*0.5]);
  }
  buildPoints(list, 1, 0.5);
}

/* ================= cliff rock strata: vertex-color pass =================
   Runs once on the terrain dome: steep rock faces get banded strata
   texture (no flat color), shorelines get a dry-sand band, shallows
   get a depth tint. Smooth heightfield untouched — color only. */
function rockPass(){
  var dome = W.dome;
  if(!dome || !dome.geometry) return;
  var geo = dome.geometry;
  var pos = geo.attributes.position, col = geo.attributes.color;
  if(!pos || !col) return;
  var count = pos.count;
  var nx = Math.round(Math.sqrt(count));   // 281 for the 280-seg plane
  if(nx*nx !== count) { try{ console.log('[kv-terrain] rockPass: unexpected grid '+count); }catch(_){} return; }
  var getY = function(ix,iz){
    ix=clamp(ix,0,nx-1); iz=clamp(iz,0,nx-1);
    return pos.getY(iz*nx+ix);
  };
  var rock = new THREE_.Color(0x8d8272), sand = new THREE_.Color(0xE3D3A1),
      deep = new THREE_.Color(0x39617e), tmp = new THREE_.Color();
  var t0 = (typeof performance!=='undefined'&&performance.now)?performance.now():0;
  for(var iz=0;iz<nx;iz++){
    for(var ix=0;ix<nx;ix++){
      var vi = iz*nx+ix;
      var x = pos.getX(vi), y = pos.getY(vi), z = pos.getZ(vi);
      var sl = Math.hypot(getY(ix+1,iz)-getY(ix-1,iz), getY(ix,iz+1)-getY(ix,iz-1));
      // note: PlaneGeometry rotated -PI/2: grid step ~1.357
      sl = sl/(2*1.357);
      tmp.setRGB(col.getX(vi), col.getY(vi), col.getZ(vi));
      var h1 = hash2(x,z), h2 = hash2(z*1.7+3.1, x*1.3+7.7);
      if(y < -0.55){
        // shallows: gentle depth tint
        var d = sstep(-0.55,-2.4,y);
        tmp.lerp(deep, d*0.55);
      } else if(sl > 0.55){
        // rock face: strata bands + noise (textured, never flat)
        var band = 0.80 + 0.13*Math.sin(y*2.3 + h1*6.2831) + 0.07*(h2-0.5);
        var rk = Math.min(1,(sl-0.55)*2.4);
        tmp.lerp(rock, rk*0.8);
        tmp.multiplyScalar(band);
      } else if(y < 1.7){
        // dry sand band just above the waterline
        var sb = (1-sstep(0.4,1.7,y))*sstep(-0.9,-0.35,y);
        if(sb>0) tmp.lerp(sand, sb*0.85);
      }
      // faint large-scale variation so grassland isn't airbrushed-flat
      if(y>=1.7 && sl<=0.55 && y<13){
        tmp.multiplyScalar(0.96+0.08*h2);
      }
      col.setXYZ(vi, tmp.r, tmp.g, tmp.b);
    }
  }
  col.needsUpdate = true;
  var t1 = (typeof performance!=='undefined'&&performance.now)?performance.now():0;
  try{ console.log('[kv-terrain] rockPass done in '+Math.round(t1-t0)+'ms'); }catch(_){}
}

/* ================= dappled light pools (temple woods) ================= */
var dappleMats = [];
function buildDapple(){
  var spots = [];
  var seed = 31337;
  for(var k=0;k<46;k++){
    var a = sRnd(seed+k)*Math.PI*2, r = 6+Math.sqrt(sRnd(seed+k+99))*24;
    var x = 20+Math.cos(a)*r, z = -28+Math.sin(a)*r*0.85;
    var g = W.groundY(x,z);
    if(g<0.4 || slopeAt(x,z)>0.6 || nearPath(x,z,1.2)) continue;
    spots.push([x,g+0.09,z, 1.2+sRnd(seed+k+7)*1.8]);
  }
  if(!spots.length) return;
  // 3 meshes with phase-offset shimmer
  for(var m=0;m<3;m++){
    var geo = new THREE_.CircleGeometry(1, 10);
    var mat = new THREE_.MeshBasicMaterial({ color:0xffe9a8, transparent:true, opacity:0.12,
      blending:THREE_.AdditiveBlending, depthWrite:false });
    var im = new THREE_.InstancedMesh(geo, mat, Math.max(spots.length,1));
    var M = new THREE_.Matrix4(), Q = new THREE_.Quaternion(), P = new THREE_.Vector3(),
        S = new THREE_.Vector3(), E = new THREE_.Euler(-Math.PI/2,0,0);
    Q.setFromEuler(E);
    for(var j=0;j<spots.length;j++){
      var s2 = spots[(j+m*17)%spots.length];
      P.set(s2[0], s2[1], s2[2]); S.set(s2[3],s2[3],s2[3]);
      M.compose(P,Q,S); im.setMatrixAt(j,M);
    }
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false;
    im.renderOrder = 5;
    im.userData.noCast = true;
    W.scene.add(im);
    dappleMats.push({mat:mat, ph:m*2.1});
  }
  try{
    var dTick=function(t){
      for(var k=0;k<dappleMats.length;k++){
        var d = dappleMats[k];
        d.mat.opacity = 0.09 + 0.05*(0.5+0.5*Math.sin(t*0.6+d.ph));
      }
    };
    if(W.tickers && W.tickers.push) W.tickers.push(dTick);
    else setInterval(function(){ dTick(uTime.value); }, 120);
  }catch(_){}
}

/* ================= MegaKit placeholder slots =================
   Adi: "don't use any old ones" — vegetation/rocks come ONLY from the
   new Quaternius Stylized Nature MegaKit packs. The asset subagent is
   uploading them now; when the URLs are ready, call
       window.__kvTerrain.setMegakitBase('https://.../megakit/')
   and each named slot resolves to base + file. Until then slots stay
   EMPTY — no fallback to old assets, ever. */
var MEGAKIT_BASE = '';
var MEGAKIT_SLOTS = {
  'tall-pine':  { file:'tall-pine.glb',  size:11  },
  'broadleaf':  { file:'broadleaf.glb',  size:7   },
  'rock-large': { file:'rock-large.glb', size:3.2 },
  'cliff-rock': { file:'cliff-rock.glb', size:6   },
  'fern':       { file:'fern.glb',       size:1.3 },
  'flower':     { file:'flower.glb',     size:0.9 },
  'grass-deco': { file:'grass-deco.glb', size:1.1 }
};
/* deterministic placements (seeded) — Stream 3 can rely on these coords */
var SLOT_PLACEMENTS = [
  // temple woods flagship forest: tall pines, organic cluster
  { slot:'tall-pine', cx:20, cz:-28, rMin:7, rMax:30, n:20, seed:101 },
  { slot:'broadleaf', cx:20, cz:-28, rMin:26, rMax:38, n:8, seed:102 },
  { slot:'fern',      cx:20, cz:-28, rMin:5, rMax:30, n:30, seed:103 },
  // north highlands forest
  { slot:'tall-pine', cx:8, cz:95, rMin:0, rMax:42, n:28, seed:104, avoid:{x:25,z:112,r:14}, zMin:58 },
  { slot:'fern',      cx:8, cz:95, rMin:0, rMax:40, n:22, seed:105, zMin:58 },
  // west meadow broadleaf (sparse, premium)
  { slot:'broadleaf', cx:-28, cz:12, rMin:8, rMax:26, n:7, seed:106 },
  // south gardens
  { slot:'broadleaf', cx:-25, cz:-115, rMin:12, rMax:34, n:9, seed:107 },
  { slot:'flower',    cx:-25, cz:-115, rMin:8, rMax:30, n:28, seed:108 },
  { slot:'grass-deco',cx:-25, cz:-115, rMin:8, rMax:32, n:24, seed:109 },
  // harbor rim
  { slot:'broadleaf', cx:112, cz:15, rMin:32, rMax:44, n:5, seed:110, ring:true },
  { slot:'rock-large',cx:112, cz:15, rMin:28, rMax:40, n:6, seed:111, ring:true },
  // west cliff rocks along the lip
  { slot:'cliff-rock', cx:-138, cz:0, rMin:0, rMax:26, n:10, seed:112, zBand:40 },
  // summit markers
  { slot:'tall-pine', cx:25, cz:115, rMin:12, rMax:20, n:3, seed:113 }
];

var slotCache = {}, slotQueue = [], slotActive = 0, slotPeak = 0;
var SLOT_MAX = 3, megakitStarted = false, megakitDone = 0, megakitTotal = 0;
function slotPump(){
  while(slotActive < SLOT_MAX && slotQueue.length){
    (function(url){
      slotActive++; if(slotActive>slotPeak) slotPeak=slotActive;
      new THREE_.GLTFLoader().load(url,
        function(gltf){
          slotActive--;
          var e = slotCache[url]; e.st=2; e.tpl=gltf.scene;
          var ws=e.waiters; e.waiters=[];
          for(var k=0;k<ws.length;k++){ try{ ws[k](e.tpl); }catch(_){} }
          slotPump();
        }, undefined,
        function(){ slotActive--; var e=slotCache[url]; e.st=3;
          var ws=e.waiters; e.waiters=[];
          for(var k=0;k<ws.length;k++){ try{ ws[k](null); }catch(_){} }
          slotPump(); });
    })(slotQueue.shift());
  }
}
function getSlot(slot, pl, cb){
  if(!MEGAKIT_BASE){ try{ cb(null); }catch(_){} return; }
  var def = MEGAKIT_SLOTS[slot];
  if(!def){ try{ cb(null); }catch(_){} return; }
  var url = MEGAKIT_BASE + def.file;
  var _e0 = slotCache[url];
  if(_e0 && !_e0.pl) _e0.pl = pl;
  var e = slotCache[url];
  if(e){
    if(e.st===2){ try{ cb(e.tpl); }catch(_){} return; }
    if(e.st===3){ try{ cb(null); }catch(_){} return; }
    e.waiters.push(cb); return;
  }
  slotCache[url] = { st:1, tpl:null, waiters:[cb], slot:slot, pl:null };
  slotQueue.push(url);
  slotPump();
}
var _sb = new THREE_.Box3(), _ss = new THREE_.Vector3();
var _pm = new THREE_.Matrix4(), _pq = new THREE_.Quaternion(), _pp = new THREE_.Vector3(),
    _ps = new THREE_.Vector3(), _up = new THREE_.Vector3(0,1,0);
/* Instanced placement: ONE InstancedMesh per template mesh-part per slot
   type — a whole forest of tall-pines costs a handful of draw calls. */
function placeSlotInstances(slot, tpl, transforms){
  var def = MEGAKIT_SLOTS[slot];
  // normalize: scale so the template's largest dim == def.size
  _sb.setFromObject(tpl); _sb.getSize(_ss);
  var md = Math.max(_ss.x,_ss.y,_ss.z)||1;
  var base = def.size/md;
  var groundOff = _sb.min.y*base;   // sink so base sits on terrain
  var parts = [];
  tpl.traverse(function(o){ if(o.isMesh) parts.push(o); });
  if(!parts.length) return 0;
  var up = _up;
  parts.forEach(function(part){
    part.updateMatrix();
    var im = new THREE_.InstancedMesh(part.geometry, part.material, transforms.length);
    for(var k=0;k<transforms.length;k++){
      var tr = transforms[k];
      _pq.setFromAxisAngle(up, tr.ry);
      var js = base*tr.j;
      _ps.set(js,js,js);
      _pp.set(tr.x, tr.g - groundOff*tr.j, tr.z);
      _pm.compose(_pp,_pq,_ps);
      _pm.multiply(part.matrix);   // bake the part's local transform
      im.setMatrixAt(k,_pm);
    }
    im.instanceMatrix.needsUpdate = true;
    try{ im.computeBoundingSphere(); }catch(_){ im.frustumCulled=false; }
    im.castShadow = true;
    var wrap = new THREE_.Group();
    wrap.userData._kvNew = true;   // marks NEW builds (never hidden by legacy clear)
    wrap.add(im);
    W.scene.add(wrap);
    lastSlotWrap = wrap;
  });
  return parts.length;   // draw calls added for this slot type
}
var lastSlotWrap = null;
function slotTransformCount(pl){ return Math.max(1, Math.round(pl.n * qf().trees)); }
function buildSlotFor(slot, tpl, pl){
  var count = slotTransformCount(pl);
  var transforms = [];
  for(var k=0;k<count;k++){
        var a = sRnd(pl.seed+k*1.7)*Math.PI*2;
        var r = pl.rMin + Math.sqrt(sRnd(pl.seed+k*3.3))*(pl.rMax-pl.rMin);
        var x, z;
        if(pl.ring){ x = pl.cx+Math.cos(a)*r; z = pl.cz+Math.sin(a)*r*0.8; }
        else if(pl.zBand){ x = pl.cx+(sRnd(pl.seed+k*5.1)-0.5)*pl.rMax; z = pl.cz+(sRnd(pl.seed+k*7.9)-0.5)*pl.zBand; }
        else { x = pl.cx+Math.cos(a)*r; z = pl.cz+Math.sin(a)*r; }
        if(pl.zMin && z < pl.zMin) continue;
        if(pl.avoid && Math.hypot(x-pl.avoid.x, z-pl.avoid.z) < pl.avoid.r) continue;
        var g = W.groundY(x,z);
        if(g < 0.4 || g > 16) continue;
        if(slopeAt(x,z) > 0.7) continue;
        if(nearPath(x,z, pl.slot==='fern'||pl.slot==='flower' ? 1.0 : 2.2)) continue;
        if(inExclude(x,z)) continue;
        transforms.push({x:x, z:z, g:g, ry:sRnd(pl.seed+k)*Math.PI*2,
          j:1+(sRnd(pl.seed+k+99)-0.5)*0.25});
      }
      if(!transforms.length) return null;
      var dc = placeSlotInstances(slot, tpl, transforms);
      stats.slotDraws = (stats.slotDraws||0)+dc;
      stats.slotTrees = (stats.slotTrees||0)+transforms.length;
      return { slot:slot, tpl:tpl, pl:pl, wrap:lastSlotWrap, transforms:transforms };
}
function loadMegakit(){
  if(megakitStarted || !MEGAKIT_BASE) return;
  megakitStarted = true;
  SLOT_PLACEMENTS.forEach(function(pl){
    var def = MEGAKIT_SLOTS[pl.slot];
    if(!def) return;
    megakitTotal++;
    getSlot(pl.slot, pl, function(tpl){
      megakitDone++;
      if(!tpl) return;   // failed -> slot stays empty (no fallback, per Adi)
      try{
        var rec = buildSlotFor(pl.slot, tpl, pl);
        if(rec){
          // placeSlotInstances adds its own wrap to the scene; track for rebuild
          rec.wrap = null;
          slotBuilds.push(rec);
        }
      }catch(_){}
    });
  });
}
function setMegakitBase(url){
  if(megakitStarted) return false;
  MEGAKIT_BASE = url.replace(/\/?$/,'/');
  try{ console.log('[kv-terrain] MegaKit base set: '+MEGAKIT_BASE); }catch(_){}
  loadMegakit();
  return true;
}

/* ================= legacy vegetation cutover =================
   Hides ALL old vegetation so the MegaKit builds stand alone:
   - code-built trees at their exact baked positions
   - old GLB placements (kanavu-assets.js wraps: userData._asset)
   OFF by default. Parent enables when MegaKit is live. Never hides
   anything flagged _kvNew (this module's builds). */
var legacyCleared = false;
var LEGACY_TREES = [
  [-14,18],[-24,4],[-28,-4],[-6,22],[14,20],[24,10],[26,-12],[12,-14],[-2,-22],[-6,-28],
  [30,18],[-32,10],[20,-30],[-24,-30],[34,-8],[-36,-14],[46,14],[-48,-6],[16,44],[-22,40],[48,-28],[-6,-50],
  [38,22],[-40,14],[28,-38],[-28,-38],[44,-8],[-44,-18],[0,-44]
];
function clearLegacyVegetation(){
  if(legacyCleared) return 0;
  legacyCleared = true;
  var hidden = 0;
  // old GLB wraps from kanavu-assets.js
  W.scene.traverse(function(o){
    if(o.userData && o.userData._asset && !(o.userData._kvNew)){ o.visible=false; hidden++; }
  });
  // code-built trees: match by baked position (they sit at groundY)
  W.scene.children.forEach(function(c){
    if(!(c.isMesh||c.isGroup)||!c.visible) return;
    var ud=c.userData||{};
    if(ud._asset||ud._kvNew||ud.spot||ud.rig||ud.shf) return;
    for(var k=0;k<LEGACY_TREES.length;k++){
      var t=LEGACY_TREES[k];
      if(Math.hypot(c.position.x-t[0], c.position.z-t[1])<0.6){
        c.visible=false; hidden++; break;
      }
    }
  });
  try{ console.log('[kv-terrain] legacy vegetation hidden: '+hidden); }catch(_){}
  return hidden;
}

/* ================= init ================= */
var stats = {};
function run(){
  try{ buildPaths(); }catch(e){ try{console.log('[kv-terrain] paths: '+e.message);}catch(_){} }
  try{ rockPass(); }catch(e){ try{console.log('[kv-terrain] rockPass: '+e.message);}catch(_){} }
  try{ buildGrass(); }catch(e){ try{console.log('[kv-terrain] grass: '+e.message);}catch(_){} }
  try{ buildGlints(); }catch(e){ try{console.log('[kv-terrain] glints: '+e.message);}catch(_){} }
  try{ buildFoam(); }catch(e){ try{console.log('[kv-terrain] foam: '+e.message);}catch(_){} }
  try{ buildDapple(); }catch(e){ try{console.log('[kv-terrain] dapple: '+e.message);}catch(_){} }
  try{ loadMegakit(); }catch(e){}
  // grass: near ring now, rest streams on the interval (no startup hitch)
  try{ setInterval(function(){ try{ updateGrass(2); }catch(_){} }, 350); }catch(_){}
  try{ updateGrass(1); }catch(_){}
  stats.paths = PATHS.length;
  stats.megakitBase = MEGAKIT_BASE || '(not set — slots empty)';
}

window.__kvTerrain = {
  setMegakitBase: setMegakitBase,
  clearLegacyVegetation: clearLegacyVegetation,
  slots: MEGAKIT_SLOTS,
  placements: SLOT_PLACEMENTS,
  stats: function(){ return {
    grassBlades: stats.grassBlades||0, grassChunks: stats.grassChunks||0,
    paths: stats.paths||0, megakitBase: MEGAKIT_BASE||null,
    megakitLoaded: megakitDone+'/'+megakitTotal, slotPeak: slotPeak,
    slotDraws: stats.slotDraws||0, slotTrees: stats.slotTrees||0,
    legacyCleared: legacyCleared,
    qualityTier: currentTier
  }; },
  drawCalls: function(){
    try{ return W.renderer.info.render.calls; }catch(_){ return -1; }
  },
  fpsSample: function(ms, cb){
    // worst-case fps in this environment (SwiftShader = CPU rendering)
    var frames = 0, t0 = performance.now();
    function tick(){
      frames++;
      if(performance.now()-t0 < ms) requestAnimationFrame(tick);
      else cb(+(frames/((performance.now()-t0)/1000)).toFixed(1), frames);
    }
    requestAnimationFrame(tick);
  }
};

try{ run(); }catch(e){ try{ console.log('[kv-terrain] init failed: '+e.message); }catch(_){} }

} // end init(W)
}();
