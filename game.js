/* ============================================================
   Kanavu 2D Island Demo — real-art rebuild
   - World: cozy-map.webp as the hero background (cover-fit)
   - Characters: graphite-pencil keeper sprites (Adi + Tara)
   - Canvas 2D, phone portrait, joystick + context button
   ============================================================ */
'use strict';
window.__qaErrors = [];
window.addEventListener('error', function (e) {
  window.__qaErrors.push(String(e.message || e.error || e.type));
});

/* ---------------- 2.5D depth: pre-rendered assets ----------------
   Everything expensive is baked once (on load / on resize).
   Per-frame work is just drawImage with varying alpha/transform. */
var depthAssets = {
  shadowTex: null, glowGold: null, glowFire: null, glowWarm: null,
  silWarm: {}, silCool: {},
  fireflyTex: [], vignette: null, fgNear: null, fgFar: null
};

function makeGlowTex(rgb) {
  var c = document.createElement('canvas'); c.width = c.height = 256;
  var g = c.getContext('2d');
  var gr = g.createRadialGradient(128, 128, 4, 128, 128, 128);
  gr.addColorStop(0, 'rgba(' + rgb + ',0.85)');
  gr.addColorStop(0.45, 'rgba(' + rgb + ',0.32)');
  gr.addColorStop(1, 'rgba(' + rgb + ',0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  return c;
}
function makeShadowTex() {
  // elongated soft shadow, dark at root (x=0) fading along +x
  var c = document.createElement('canvas'); c.width = 128; c.height = 64;
  var g = c.getContext('2d');
  var lg = g.createLinearGradient(0, 0, 128, 0);
  lg.addColorStop(0, 'rgba(12,6,12,0.5)');
  lg.addColorStop(1, 'rgba(12,6,12,0)');
  g.fillStyle = lg; g.fillRect(0, 0, 128, 64);
  g.globalCompositeOperation = 'destination-in';
  var vg = g.createLinearGradient(0, 0, 0, 64);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(0.5, 'rgba(0,0,0,1)');
  vg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = vg; g.fillRect(0, 0, 128, 64);
  return c;
}
function makeSilhouette(img, rgb, topA, midA, botA) {
  // sprite-shaped light tint; per-frame we only vary its alpha
  var c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  var g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-in';
  var gr = g.createLinearGradient(0, 0, 0, c.height);
  gr.addColorStop(0, 'rgba(' + rgb + ',' + topA + ')');
  gr.addColorStop(0.55, 'rgba(' + rgb + ',' + midA + ')');
  gr.addColorStop(1, 'rgba(' + rgb + ',' + botA + ')');
  g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
  return c;
}
function makeFireflyTex(r, alpha) {
  var s = Math.ceil(r * 4);
  var c = document.createElement('canvas'); c.width = c.height = s;
  var g = c.getContext('2d');
  var gr = g.createRadialGradient(s / 2, s / 2, 0.5, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,220,140,' + alpha + ')');
  gr.addColorStop(0.4, 'rgba(255,205,120,' + (alpha * 0.5).toFixed(3) + ')');
  gr.addColorStop(1, 'rgba(255,200,110,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  return c;
}
function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function makeFgLayer(alpha, blobs, seed) {
  // out-of-focus foreground foliage creeping from screen edges + warm bokeh
  var W = Math.round(SW + 40), H = Math.round(SH + 40);
  var c = document.createElement('canvas'); c.width = W; c.height = H;
  var g = c.getContext('2d');
  var rnd = mulberry(seed);
  var spots = [
    [0.02, 0.03], [0.97, 0.06], [0.03, 0.94], [0.96, 0.93],
    [0.5, -0.02], [-0.02, 0.5], [1.02, 0.55], [0.35, 1.02]
  ];
  for (var i = 0; i < blobs; i++) {
    var s = spots[i % spots.length];
    var bx = (s[0] + (rnd() - 0.5) * 0.12) * W;
    var by = (s[1] + (rnd() - 0.5) * 0.12) * H;
    var br = (0.10 + rnd() * 0.16) * Math.max(W, H);
    var gr = g.createRadialGradient(bx, by, br * 0.2, bx, by, br);
    gr.addColorStop(0, 'rgba(28,12,16,' + alpha.toFixed(3) + ')');
    gr.addColorStop(0.7, 'rgba(30,14,18,' + (alpha * 0.55).toFixed(3) + ')');
    gr.addColorStop(1, 'rgba(30,14,18,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(bx, by, br, 0, 6.29); g.fill();
    for (var k = 0; k < 5; k++) {   // leaf-lobe bumps
      var a = rnd() * 6.28, lr = br * (0.35 + rnd() * 0.3);
      var lx = bx + Math.cos(a) * br * 0.55, ly = by + Math.sin(a) * br * 0.55;
      var lg2 = g.createRadialGradient(lx, ly, 1, lx, ly, lr);
      lg2.addColorStop(0, 'rgba(36,17,22,' + (alpha * 0.9).toFixed(3) + ')');
      lg2.addColorStop(1, 'rgba(36,17,22,0)');
      g.fillStyle = lg2;
      g.beginPath(); g.arc(lx, ly, lr, 0, 6.29); g.fill();
    }
  }
  for (var j = 0; j < 9; j++) {   // warm bokeh dots caught in the foliage
    var px = rnd() * W, py = rnd() * H;
    if (px > W * 0.2 && px < W * 0.8 && py > H * 0.25 && py < H * 0.75) continue;
    var pr = 3 + rnd() * 7;
    var pg = g.createRadialGradient(px, py, 0.5, px, py, pr * 2.4);
    pg.addColorStop(0, 'rgba(255,200,120,' + (0.16 + rnd() * 0.18).toFixed(3) + ')');
    pg.addColorStop(1, 'rgba(255,190,110,0)');
    g.fillStyle = pg;
    g.beginPath(); g.arc(px, py, pr * 2.4, 0, 6.29); g.fill();
  }
  return c;
}
function buildScreenFx() {
  // vignette (screen-sized, baked once per resize)
  var c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(SW)); c.height = Math.max(2, Math.round(SH));
  var g = c.getContext('2d');
  var cx = SW / 2, cy = SH * 0.46, rr = Math.hypot(SW, SH) * 0.62;
  var gr = g.createRadialGradient(cx, cy, rr * 0.42, cx, cy, rr);
  gr.addColorStop(0, 'rgba(24,10,18,0)');
  gr.addColorStop(1, 'rgba(24,10,18,0.40)');
  g.fillStyle = gr; g.fillRect(0, 0, SW, SH);
  depthAssets.vignette = c;
  depthAssets.fgFar = makeFgLayer(0.26, 7, 1234);
  depthAssets.fgNear = makeFgLayer(0.45, 5, 987);
}
function buildDepthAssets() {
  depthAssets.shadowTex = makeShadowTex();
  depthAssets.glowGold = makeGlowTex('255,205,110');
  depthAssets.glowFire = makeGlowTex('255,150,60');
  depthAssets.glowWarm = makeGlowTex('255,190,90');
  depthAssets.silWarm.adi = makeSilhouette(adiImg, '255,196,120', 0.50, 0.28, 0.10);
  depthAssets.silCool.adi = makeSilhouette(adiImg, '110,140,220', 0.34, 0.20, 0.10);
  depthAssets.silWarm.tara = makeSilhouette(taraImg, '255,196,120', 0.50, 0.28, 0.10);
  depthAssets.silCool.tara = makeSilhouette(taraImg, '110,140,220', 0.34, 0.20, 0.10);
  depthAssets.fireflyTex = [makeFireflyTex(2.2, 0.5), makeFireflyTex(3.4, 0.75), makeFireflyTex(5, 0.95)];
}

/* ---------------- config ---------------- */
var MAP_W = 1152, MAP_H = 2048;
var CHAR_H = 80;                 // character height in map units (~painted-figure scale)
var WALK_SPEED = 130;            // map units / second
var DPR = Math.min(window.devicePixelRatio || 1, 2);

var canvas = document.getElementById('game');
var ctx = canvas.getContext('2d');
var SW = 0, SH = 0;              // css pixels
var FIT = { s: 1, ox: 0, oy: 0 };

function resize() {
  SW = window.innerWidth; SH = window.innerHeight;
  canvas.width = Math.round(SW * DPR); canvas.height = Math.round(SH * DPR);
  canvas.style.width = SW + 'px'; canvas.style.height = SH + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  var s = Math.max(SW / MAP_W, SH / MAP_H);   // cover-fit
  FIT = { s: s, ox: (SW - MAP_W * s) / 2, oy: (SH - MAP_H * s) / 2 };
  buildScreenFx();
}
window.addEventListener('resize', resize);
resize();

function mx2sx(mx) { return mx * FIT.s + FIT.ox; }
function my2sy(my) { return my * FIT.s + FIT.oy; }

/* ---------------- walkable regions (map coords) ---------------- */
var ISLANDS = [
  { cx: 200, cy: 700, rx: 170, ry: 280 },   // his island
  { cx: 830, cy: 950, rx: 210, ry: 330 }    // her island
];
var RECTS = [
  { x0: 360, x1: 660, y0: 1075, y1: 1155 }, // bridge
  { x0: 600, x1: 720, y0: 1180, y1: 1420 }  // dock
];
function walkable(mx, my) {
  for (var i = 0; i < ISLANDS.length; i++) {
    var e = ISLANDS[i], dx = (mx - e.cx) / e.rx, dy = (my - e.cy) / e.ry;
    if (dx * dx + dy * dy <= 1) return true;
  }
  for (var j = 0; j < RECTS.length; j++) {
    var r = RECTS[j];
    if (mx >= r.x0 && mx <= r.x1 && my >= r.y0 && my <= r.y1) return true;
  }
  return false;
}

/* ---------------- 2.5D depth: light model ---------------- */
var LIGHTS = [
  { x: 180, y: 470, r: 300, kind: 'beacon' },    // lighthouse beacon
  { x: 930, y: 890, r: 340, kind: 'fire' }       // campfire
];
function nearestLight(mx, my) {
  var best = LIGHTS[0], bd = 1e18;
  for (var i = 0; i < LIGHTS.length; i++) {
    var L = LIGHTS[i];
    var d = Math.hypot(mx - L.x, my - L.y);
    if (d < bd) { bd = d; best = L; }
  }
  return { L: best, d: bd };
}
function warmthAt(mx, my) {
  var nl = nearestLight(mx, my);
  var w = 1 - Math.min(nl.d / nl.L.r, 1);
  return w * w;   // eased falloff
}
function onBridge(ch) {
  var r = RECTS[0];
  return ch.x >= r.x0 && ch.x <= r.x1 && ch.y >= r.y0 && ch.y <= r.y1;
}

/* ---------------- hotspots (map coords) ---------------- */
var HOTSPOTS = [
  { id: 'beacon',   label: 'Light',      x: 180, y: 500,  r: 110 },
  { id: 'campfire', label: 'Sit',        x: 930, y: 900,  r: 110 },
  { id: 'garden',   label: 'Admire',     x: 950, y: 1010, r: 95  },
  { id: 'bridge',   label: 'Hold hands', x: 500, y: 1115, r: 130 }
];

/* ---------------- assets ---------------- */
var mapImg = new Image(), adiImg = new Image(), taraImg = new Image();
var loaded = 0;
function assetReady() {
  if (++loaded === 3) {
    player.img = adiImg; partner.img = taraImg;
    buildDepthAssets();
    if (window.KeeperLook) KeeperLook.applyToGame();   // saved keeper look
    // QA helpers via URL hash (invisible in normal use): #t=x,y teleports player, #fps=1 shows fps
    var hm = location.hash.match(/t=([\d.]+),([\d.]+)/);
    if (hm) { player.x = +hm[1]; player.y = +hm[2]; }
    showFps = /fps=1/.test(location.hash);
    document.getElementById('loader').style.display = 'none';
    requestAnimationFrame(loop);
  }
}
mapImg.onload = assetReady; adiImg.onload = assetReady; taraImg.onload = assetReady;
mapImg.onerror = adiImg.onerror = taraImg.onerror = function () {
  document.getElementById('loader').textContent = 'could not load art — check files';
};
mapImg.src = 'cozy-map.webp';
adiImg.src = 'art/adi-v2-cut.png';
taraImg.src = 'art/tara-v2-cut.png';
// future pets (not wired in yet): art/cat-v2-cut.png, art/dog-v2-cut.png



/* ---------------- entities ---------------- */
var player = { key: 'adi', x: 250, y: 760, vx: 0, vy: 0, face: 1, bob: 0, moving: false, name: 'Adi', img: null };
var partner = { key: 'tara', x: 800, y: 1050, vx: 0, vy: 0, face: 1, bob: 0, moving: false, name: 'Tara', img: null,
                tx: 800, ty: 1050, waitT: 0 };
var stars = 128;

/* ---------------- joystick ---------------- */
var joy = { active: false, id: -1, cx: 0, cy: 0, dx: 0, dy: 0 };
var JOY_R = 52, KNOB_R = 24;
function joyBase() { return { x: 78, y: SH - 168 }; }

canvas.addEventListener('pointerdown', onDown);
canvas.addEventListener('pointermove', onMove);
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', onUp);

function onDown(e) {
  var b = joyBase();
  var d = Math.hypot(e.clientX - b.x, e.clientY - b.y);
  // UI taps first
  if (handleUiTap(e.clientX, e.clientY)) return;
  // M6: tap-in-rhythm while holding hands (consumed; off-beat taps are gentle)
  if (window.WarmthUI && WarmthUI.rhythmTap(e.clientX, e.clientY)) { e.preventDefault(); return; }
  // M4: firefly tap-to-catch (world taps only, consumed when a catch happens)
  if (window.GamesUI && GamesUI.tapWorld(e.clientX, e.clientY)) { e.preventDefault(); return; }
  if (d < JOY_R + 30 && !joy.active) {
    joy.active = true; joy.id = e.pointerId; joy.cx = b.x; joy.cy = b.y;
    joy.dx = 0; joy.dy = 0;
    e.preventDefault();
  }
}
function onMove(e) {
  if (!joy.active || e.pointerId !== joy.id) return;
  var dx = e.clientX - joy.cx, dy = e.clientY - joy.cy;
  var d = Math.hypot(dx, dy), max = JOY_R;
  if (d > max) { dx = dx / d * max; dy = dy / d * max; }
  joy.dx = dx / max; joy.dy = dy / max;
  e.preventDefault();
}
function onUp(e) {
  if (joy.active && e.pointerId === joy.id) {
    joy.active = false; joy.dx = 0; joy.dy = 0;
  }
}

/* ---------------- UI state ---------------- */
var toast = { text: '', until: 0 };
var holdHands = { active: false, t: 0 };
var contextBtn = { x: 0, y: 0, r: 34, visible: false, label: '' };
var navItems = ['Island', 'Decks', 'Games', 'Memories'];

function showToast(text, ms) {
  toast.text = text; toast.until = performance.now() + (ms || 1800);
}
function handleUiTap(x, y) {
  // context button
  if (contextBtn.visible) {
    if (Math.hypot(x - contextBtn.x, y - contextBtn.y) < contextBtn.r + 12) {
      doContextAction(); return true;
    }
  }
  // nav bar
  var navY = SH - 46;
  if (y > navY - 26 && y < SH) {
    var idx = Math.floor(x / (SW / 4));
    if (idx >= 0 && idx < 4) {
      if (idx === 0) { showToast('already home ♥'); }
      else if (idx === 1 && window.DecksUI && !DecksUI.isOpen()) { DecksUI.open(); }
      else if (idx === 2 && window.GamesUI && !GamesUI.isOpen()) { GamesUI.open(); }
      else if (idx === 3 && window.MemoriesUI && !MemoriesUI.isOpen()) { MemoriesUI.open(); }
      else showToast(navItems[idx] + ' — coming soon');
      return true;
    }
  }
  // top-right buttons
  if (y < 64) {
    if (x > SW - 104 && x < SW - 56) { showToast('paused'); return true; }
    if (x > SW - 48) {
      if (window.KeeperBuilder && !KeeperBuilder.isOpen()) KeeperBuilder.open();
      else if (!window.KeeperBuilder) showToast('settings — coming soon');
      return true;
    }
  }
  return false;
}

function nearestHotspot() {
  var best = null, bd = 1e9;
  for (var i = 0; i < HOTSPOTS.length; i++) {
    var h = HOTSPOTS[i];
    var d = Math.hypot(player.x - h.x, player.y - h.y);
    if (d < h.r && d < bd) { bd = d; best = h; }
  }
  // M5: gift marker near the player — the context button becomes "Open gift"
  if (window.MemoriesUI) {
    var gf = MemoriesUI.nearbyGift(player.x, player.y, 110);
    if (gf && gf.dist < bd) { bd = gf.dist; best = { id: 'gift', label: 'Open gift', x: gf.x, y: gf.y, r: 110 }; }
  }
  return best;
}

function doContextAction() {
  var h = nearestHotspot();
  if (!h) return;
  if (h.id === 'beacon') {
    if (window.BeaconRitual) BeaconRitual.begin();
    else { beaconFlash = 1; showToast('the beacon glows brighter ✦'); }
  } else if (h.id === 'campfire') {
    burst(h.x, h.y - 10, '#ffb347', 14);
    showToast('you sit by the fire');
  } else if (h.id === 'garden') {
    burst(h.x, h.y - 10, '#ff7d9c', 16);
    showToast('the roses smell like autumn');
  } else if (h.id === 'bridge') {
    var pd = Math.hypot(player.x - partner.x, player.y - partner.y);
    if (pd < 170) {
      holdHands.active = true; holdHands.t = 0;
      if (window.WarmthUI) WarmthUI.beginHold();   // M6: reset the rhythm state
      showToast('hold hands — feel the rhythm');
    } else {
      showToast('Tara is too far — walk closer');
    }
  } else if (h.id === 'gift') {
    if (window.MemoriesUI) MemoriesUI.openGift('Adi');
  }
}

/* ---------------- particles ---------------- */
var fireflies = [], shimmers = [], bursts = [];
var beaconFlash = 0;
(function initAmbient() {
  for (var i = 0; i < 26; i++) {
    var isl = ISLANDS[i % 2];
    var a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random());
    var tr = Math.random();
    var tier = tr < 0.4 ? 0 : tr < 0.75 ? 1 : 2;   // 0=far/small/dim … 2=near/large/bright
    fireflies.push({
      x: isl.cx + Math.cos(a) * rr * isl.rx * 0.9,
      y: isl.cy + Math.sin(a) * rr * isl.ry * 0.9,
      ph: Math.random() * 6.28, sp: 0.4 + Math.random() * 0.8,
      dx: (Math.random() - 0.5) * 14, dy: (Math.random() - 0.5) * 10,
      tier: tier
    });
  }
  var waterSpots = [[300, 1250], [500, 1400], [750, 1500], [950, 1300], [420, 1600], [880, 1650]];
  for (var j = 0; j < waterSpots.length; j++) {
    shimmers.push({ x: waterSpots[j][0], y: waterSpots[j][1], ph: Math.random() * 6.28, len: 50 + Math.random() * 60 });
  }
})();
function burst(mx, my, color, n) {
  for (var i = 0; i < n; i++) {
    var a = Math.random() * 6.28, sp = 20 + Math.random() * 50;
    bursts.push({ x: mx, y: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20,
                  life: 1, color: color, sz: 2 + Math.random() * 3 });
  }
}

/* ---------------- update ---------------- */
var lastT = 0;
function update(dt, now) {
  // M3 beacon ritual (movement freeze / partner glide handled inside)
  if (window.BeaconRitual) BeaconRitual.update(dt);

  // player movement
  var jx = joy.dx, jy = joy.dy;
  player.moving = (Math.abs(jx) > 0.12 || Math.abs(jy) > 0.12);
  if (player.moving && !holdHands.active && !(window.BeaconRitual && BeaconRitual.freezeInput())) {
    var nx = player.x + jx * WALK_SPEED * dt, ny = player.y + jy * WALK_SPEED * dt;
    if (walkable(nx, player.y)) player.x = nx;
    if (walkable(player.x, ny)) player.y = ny;
    if (Math.abs(jx) > 0.15) player.face = jx > 0 ? 1 : -1;
    player.bob += dt * 10;
  } else {
    player.bob += dt * 2.2;   // idle breathing
  }

  // partner wander (her island)
  var isl = ISLANDS[1];
  partner.waitT -= dt;
  if (partner.waitT <= 0 && !holdHands.active && !partner.ritualGlide) {
    var a = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * 0.7;
    partner.tx = isl.cx + Math.cos(a) * rr * isl.rx;
    partner.ty = isl.cy + Math.sin(a) * rr * isl.ry;
    partner.waitT = 3 + Math.random() * 4;
  }
  if (!holdHands.active && !partner.ritualGlide) {
    var pdx = partner.tx - partner.x, pdy = partner.ty - partner.y;
    var pd = Math.hypot(pdx, pdy);
    partner.moving = pd > 8;
    if (partner.moving) {
      var ps = 42 * dt;
      var mxn = partner.x + pdx / pd * ps, myn = partner.y + pdy / pd * ps;
      if (walkable(mxn, partner.y)) partner.x = mxn;
      if (walkable(partner.x, myn)) partner.y = myn;
      if (Math.abs(pdx) > 4) partner.face = pdx > 0 ? 1 : -1;
      partner.bob += dt * 9;
    } else partner.bob += dt * 2.2;
  }

  // hold-hands timer
  if (holdHands.active) {
    holdHands.t += dt;
    var pdist = Math.hypot(player.x - partner.x, player.y - partner.y);
    if (holdHands.t > 6 || pdist > 200) holdHands.active = false;
  }

  // M6 warmth pass: heartbeat rhythm tick + streak-milestone watch (guarded)
  if (window.WarmthUI) WarmthUI.heartbeatTick(dt);

  // particles
  for (var i = 0; i < fireflies.length; i++) {
    var f = fireflies[i];
    f.ph += dt * f.sp;
    f.x += f.dx * dt; f.y += f.dy * dt;
    if (Math.random() < 0.005) { f.dx = (Math.random() - 0.5) * 16; f.dy = (Math.random() - 0.5) * 12; }
  }
  for (var s = 0; s < shimmers.length; s++) shimmers[s].ph += dt * 0.5;
  for (var b = bursts.length - 1; b >= 0; b--) {
    var p = bursts[b];
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 30 * dt; p.life -= dt * 1.4;
    if (p.life <= 0) bursts.splice(b, 1);
  }
  if (beaconFlash > 0) beaconFlash = Math.max(0, beaconFlash - dt * 0.8);

  // M4: games tick (firefly catch auto-catch + Tara AI steering)
  if (window.GamesUI) GamesUI.tick(dt);

  // context button follows nearest hotspot
  var h = (holdHands.active || (window.BeaconRitual && BeaconRitual.isActive())) ? null : nearestHotspot();
  contextBtn.visible = !!h;
  if (h) {
    contextBtn.label = h.label;
    contextBtn.x = SW - 72; contextBtn.y = SH - 168;
  }
}

/* ---------------- draw ---------------- */
function drawChar(ch, now) {
  var sx = mx2sx(ch.x), sy = my2sy(ch.y);
  var bridge = onBridge(ch);
  var hPx = CHAR_H * FIT.s * (bridge ? 1.06 : 1.0) * (ch.lookScale || 1);   // raised feel on the bridge
  var wPx = hPx * (ch.img.width / ch.img.height) * (ch.lookW || 1);     // per-sprite aspect (v2 sprites differ)
  var bobY = ch.moving ? Math.abs(Math.sin(ch.bob)) * -3 * FIT.s : Math.sin(ch.bob) * 1.2 * FIT.s;

  // light model for this character
  var nl = nearestLight(ch.x, ch.y);
  var ldx = ch.x - nl.L.x, ldy = ch.y - nl.L.y;
  var ldd = Math.max(1, Math.hypot(ldx, ldy));
  var warm = warmthAt(ch.x, ch.y);

  // directional soft shadow — cast away from the nearest light
  var shAng = Math.atan2(ldy, ldx);
  var shLen = (26 + (1 - Math.min(ldd / nl.L.r, 1)) * 66) * FIT.s;
  var shWid = wPx * 0.95;
  ctx.save();
  ctx.translate(sx, sy + 2 * FIT.s);
  ctx.rotate(shAng);
  ctx.globalAlpha = 0.85;
  ctx.drawImage(depthAssets.shadowTex, 0, -shWid / 2, shLen, shWid);
  ctx.restore();
  ctx.globalAlpha = 1;

  // personal candle glow under feet (pre-rendered)
  var gwR = wPx * 1.5;
  ctx.globalAlpha = 0.5;
  ctx.drawImage(depthAssets.glowWarm, sx - gwR, sy - gwR * 0.55, gwR * 2, gwR * 1.1);
  ctx.globalAlpha = 1;

  // extra contact shadow when raised on the bridge
  if (bridge) {
    ctx.fillStyle = 'rgba(20,10,14,0.20)';
    ctx.beginPath(); ctx.ellipse(sx, sy + 7 * FIT.s, wPx * 0.7, wPx * 0.26, 0, 0, 6.29); ctx.fill();
  }

  // sprite + dynamic lighting overlays
  ctx.save();
  ctx.translate(sx, sy + bobY);
  ctx.scale(ch.face, 1);
  var tilt = ch.moving ? Math.sin(ch.bob) * 0.035 : 0;
  ctx.rotate(tilt);
  ctx.drawImage(ch.img, -wPx / 2, -hPx, wPx, hPx);
  var silW = depthAssets.silWarm[ch.key], silC = depthAssets.silCool[ch.key];
  if (warm > 0.02 && silW) {
    // v2 sprites have baked-in rim light — keep the dynamic wash subtle so it complements
    ctx.globalAlpha = Math.min(1, warm * 0.45);
    ctx.drawImage(silW, -wPx / 2, -hPx, wPx, hPx);
    // faint rim-light fringe on the light-facing edge
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = warm * 0.22;
    var rimOx = (ldx / ldd) * 3 * FIT.s * ch.face;   // toward the light (screen space)
    var rimOy = (ldy / ldd) * 3 * FIT.s;
    ctx.drawImage(silW, -wPx / 2 + rimOx, -hPx + rimOy, wPx, hPx);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  // M6: on-beat taps bloom a brighter warm wash over both keepers (guarded)
  var wGlow = (window.WarmthUI && WarmthUI.glowBoost) ? WarmthUI.glowBoost() : 0;
  if (wGlow > 0.02 && silW) {
    ctx.globalAlpha = Math.min(1, wGlow * 0.6);
    ctx.drawImage(silW, -wPx / 2, -hPx, wPx, hPx);
    ctx.globalAlpha = 1;
  }
  if (silC) {
    // cool blue ambient when far from warm lights — subtle against the baked warmth
    var cool = (1 - warm) * 0.28;
    if (cool > 0.03) {
      ctx.globalAlpha = cool;
      ctx.drawImage(silC, -wPx / 2, -hPx, wPx, hPx);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();

  // name label — small parchment tag
  ctx.font = '600 ' + Math.round(11 * FIT.s + 4) + 'px Georgia';
  var tw = ctx.measureText(ch.name).width;
  var lx = sx - tw / 2 - 7, ly = sy - hPx - 26 * FIT.s - 8, lw = tw + 14, lh = 17;
  ctx.fillStyle = 'rgba(46,22,16,0.72)';
  roundRect(lx, ly, lw, lh, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(232,200,122,0.85)'; ctx.lineWidth = 1;
  roundRect(lx, ly, lw, lh, 8); ctx.stroke();
  ctx.fillStyle = '#f3ddab'; ctx.textBaseline = 'middle';
  ctx.fillText(ch.name, sx - tw / 2, ly + lh / 2 + 0.5);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function draw(now) {
  var t = now / 1000;
  ctx.clearRect(0, 0, SW, SH);

  // map background
  ctx.drawImage(mapImg, FIT.ox, FIT.oy, MAP_W * FIT.s, MAP_H * FIT.s);

  // beacon pulse (pre-rendered glow; alpha carries the flicker)
  var bx = mx2sx(180), by = my2sy(470);
  var pulse = (Math.sin(t * 2.1) * 0.5 + 0.5) * 0.35 + 0.25 + beaconFlash * 0.6;
  var bgR = 150 * FIT.s;
  ctx.globalAlpha = Math.min(1, 0.35 + 0.45 * pulse);
  ctx.drawImage(depthAssets.glowGold, bx - bgR, by - bgR, bgR * 2, bgR * 2);
  // wide soft wash — the light touches the surrounding world
  var bgR2 = 330 * FIT.s;
  ctx.globalAlpha = 0.10 + 0.08 * pulse;
  ctx.drawImage(depthAssets.glowGold, bx - bgR2, by - bgR2, bgR2 * 2, bgR2 * 2);
  ctx.globalAlpha = 1;

  // campfire flicker (pre-rendered glow)
  var cx = mx2sx(930), cy = my2sy(890);
  var fl = 0.55 + Math.sin(t * 11) * 0.12 + Math.sin(t * 23 + 1.7) * 0.08;
  var fgR = 120 * FIT.s;
  ctx.globalAlpha = 0.35 + 0.45 * fl;
  ctx.drawImage(depthAssets.glowFire, cx - fgR, cy - fgR, fgR * 2, fgR * 2);
  var fgR2 = 310 * FIT.s;
  ctx.globalAlpha = 0.10 + 0.09 * fl;
  ctx.drawImage(depthAssets.glowFire, cx - fgR2, cy - fgR2, fgR2 * 2, fgR2 * 2);
  ctx.globalAlpha = 1;

  // water shimmer streaks
  ctx.save();
  ctx.strokeStyle = 'rgba(255,235,190,0.20)'; ctx.lineWidth = 2 * FIT.s; ctx.lineCap = 'round';
  for (var i = 0; i < shimmers.length; i++) {
    var s = shimmers[i];
    var sx = mx2sx(s.x + Math.sin(s.ph) * 14), sy = my2sy(s.y);
    var a = 0.10 + 0.10 * Math.sin(s.ph * 1.7);
    ctx.strokeStyle = 'rgba(255,235,190,' + a.toFixed(3) + ')';
    ctx.beginPath(); ctx.moveTo(sx - s.len * FIT.s / 2, sy);
    ctx.lineTo(sx + s.len * FIT.s / 2, sy); ctx.stroke();
  }
  ctx.restore();

  // fireflies — depth-tiered (far/small/dim … near/large/bright)
  for (var f = 0; f < fireflies.length; f++) {
    var p = fireflies[f];
    var tw = 0.35 + 0.65 * Math.abs(Math.sin(p.ph * 2));
    var tex = depthAssets.fireflyTex[p.tier];
    if (!tex) continue;
    var fsz = (p.tier === 0 ? 8 : p.tier === 1 ? 13 : 20) * FIT.s * (0.7 + 0.5 * tw);
    ctx.globalAlpha = (0.35 + 0.65 * tw) * (p.tier === 0 ? 0.45 : p.tier === 1 ? 0.7 : 1);
    ctx.drawImage(tex, mx2sx(p.x) - fsz / 2, my2sy(p.y) - fsz / 2, fsz, fsz);
  }
  ctx.globalAlpha = 1;

  // bursts
  for (var b = 0; b < bursts.length; b++) {
    var q = bursts[b];
    ctx.globalAlpha = Math.max(0, q.life);
    ctx.fillStyle = q.color;
    ctx.beginPath(); ctx.arc(mx2sx(q.x), my2sy(q.y), q.sz * FIT.s * q.life, 0, 6.29); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // hold-hands heartbeat rings (the beacon ritual light-hold reuses the same visual language)
  var ritualHold = (window.BeaconRitual && BeaconRitual.visualActive());
  if (holdHands.active || ritualHold) {
    var pax = mx2sx(player.x), pay = my2sy(player.y);
    var pbx = mx2sx(partner.x), pby = my2sy(partner.y);
    var hx = (pax + pbx) / 2, hy = (pay + pby) / 2 - 20 * FIT.s;
    // warm glow between them
    var hg = ctx.createRadialGradient(hx, hy, 2, hx, hy, 90 * FIT.s);
    hg.addColorStop(0, 'rgba(255,170,120,0.5)');
    hg.addColorStop(1, 'rgba(255,170,120,0)');
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(hx, hy, 90 * FIT.s, 0, 6.29); ctx.fill();
    // heartbeat rings — two beats per cycle (lub-dub)
    // M6: positive modulo — keeps ring math safe for any timer value
    var cyc = (((holdHands.active ? holdHands.t : BeaconRitual.visualT()) % 1.1 + 1.1) % 1.1) / 1.1;
    var beats = [0, 0.28];
    var ringBoost = ritualHold ? 1.7 : 1;    // ritual rings read over the bright beacon glow
    var ringAlpha = ritualHold ? 1.3 : 1;
    for (var r = 0; r < 2; r++) {
      var bt = (cyc - beats[r] + 1) % 1;
      if (bt < 0.85) {
        var rr = (8 + bt * 70) * FIT.s * ringBoost;
        var ra = Math.min(1, 0.75 * (1 - bt / 0.85) * ringAlpha);
        // ritual rings use rose so they read against the bright beacon glow
        var rcol = ritualHold ? '255,110,125' : '255,190,150';
        ctx.strokeStyle = 'rgba(' + rcol + ',' + ra.toFixed(3) + ')';
        ctx.lineWidth = (3 - bt * 2) * FIT.s * ringBoost;
        ctx.beginPath(); ctx.arc(hx, hy, rr, 0, 6.29); ctx.stroke();
      }
    }
    // M6: rhythm prompt + warmth meter (canvas, storybook) — bridge hold only
    if (window.WarmthUI && holdHands.active) WarmthUI.drawRhythm(ctx, hx, hy, FIT.s, now);
  }

  // characters — y-sorted so the lower one overlaps correctly
  var chars = [partner, player].sort(function (a, b) { return a.y - b.y; });
  drawChar(chars[0], now);
  drawChar(chars[1], now);

  // M5: glowing gift marker (Memories) — drawn in-world, under the vignette
  if (window.MemoriesUI) MemoriesUI.drawWorldGift(ctx, mx2sx, my2sy, FIT.s, now);

  // atmospheric vignette (baked)
  if (depthAssets.vignette) ctx.drawImage(depthAssets.vignette, 0, 0, SW, SH);

  // parallax foreground — out-of-focus foliage drifts against player movement
  var parFx = (player.x - MAP_W / 2) * -0.02 * FIT.s;
  var parFy = (player.y - MAP_H / 2) * -0.02 * FIT.s;
  if (depthAssets.fgFar) ctx.drawImage(depthAssets.fgFar, -20 + parFx * 0.5, -20 + parFy * 0.5);
  if (depthAssets.fgNear) ctx.drawImage(depthAssets.fgNear, -20 + parFx, -20 + parFy);

  // QA fps readout (hash-gated)
  if (showFps) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(SW - 78, 52, 66, 24);
    ctx.fillStyle = '#7dff9a'; ctx.font = '700 14px monospace'; ctx.textBaseline = 'middle';
    ctx.fillText(fpsVal + ' fps', SW - 70, 65);
  }

  drawUi(now, t);
}

function drawUi(now, t) {
  // top bar
  ctx.fillStyle = 'rgba(30,14,18,0.55)';
  roundRect(12, 12, 86, 34, 17); ctx.fill();
  ctx.fillStyle = '#ffd97a'; ctx.font = '700 19px Georgia'; ctx.textBaseline = 'middle';
  ctx.fillText('★', 24, 30);
  ctx.fillStyle = '#f7ead0';
  ctx.fillText(String(stars), 46, 30);

  // pause + settings
  ctx.fillStyle = 'rgba(30,14,18,0.55)';
  ctx.beginPath(); ctx.arc(SW - 80, 29, 17, 0, 6.29); ctx.fill();
  ctx.beginPath(); ctx.arc(SW - 31, 29, 17, 0, 6.29); ctx.fill();
  ctx.fillStyle = '#f7ead0'; ctx.font = '700 15px Georgia';
  ctx.fillText('❚❚', SW - 88, 30);
  ctx.fillText('⚙', SW - 39, 30);

  // joystick
  var b = joyBase();
  ctx.fillStyle = 'rgba(20,30,40,0.30)';
  ctx.beginPath(); ctx.arc(b.x, b.y, JOY_R, 0, 6.29); ctx.fill();
  ctx.strokeStyle = 'rgba(220,235,255,0.55)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(b.x, b.y, JOY_R, 0, 6.29); ctx.stroke();
  var kx = b.x + joy.dx * (JOY_R - KNOB_R), ky = b.y + joy.dy * (JOY_R - KNOB_R);
  var kg = ctx.createRadialGradient(kx - 6, ky - 8, 4, kx, ky, KNOB_R + 6);
  kg.addColorStop(0, 'rgba(235,245,255,0.85)');
  kg.addColorStop(1, 'rgba(180,200,220,0.55)');
  ctx.fillStyle = kg;
  ctx.beginPath(); ctx.arc(kx, ky, KNOB_R, 0, 6.29); ctx.fill();

  // context button
  if (contextBtn.visible) {
    var pulse = 1 + Math.sin(t * 4) * 0.05;
    var cg = ctx.createRadialGradient(contextBtn.x - 8, contextBtn.y - 10, 6,
                                      contextBtn.x, contextBtn.y, contextBtn.r * pulse + 8);
    cg.addColorStop(0, '#ffe9b0'); cg.addColorStop(1, '#df9f3e');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(contextBtn.x, contextBtn.y, contextBtn.r * pulse, 0, 6.29); ctx.fill();
    ctx.strokeStyle = 'rgba(120,60,10,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(contextBtn.x, contextBtn.y, contextBtn.r * pulse, 0, 6.29); ctx.stroke();
    ctx.fillStyle = '#5a2c0c'; ctx.font = '700 13px Georgia';
    var lw = ctx.measureText(contextBtn.label).width;
    ctx.fillText(contextBtn.label, contextBtn.x - lw / 2, contextBtn.y + 1);
  }

  // bottom nav
  var navH = 64, navY = SH - navH;
  ctx.fillStyle = 'rgba(24,12,16,0.88)';
  ctx.fillRect(0, navY, SW, navH);
  ctx.fillStyle = 'rgba(232,200,122,0.35)';
  ctx.fillRect(0, navY, SW, 1.5);
  var icons = ['⌂', '▤', '⚄', '♥'];
  for (var i = 0; i < 4; i++) {
    var cx = SW / 8 + i * (SW / 4);
    var active = i === 0;
    ctx.fillStyle = active ? '#ffd97a' : 'rgba(200,170,130,0.55)';
    ctx.font = (active ? '700 ' : '') + '21px Georgia';
    var iw = ctx.measureText(icons[i]).width;
    ctx.fillText(icons[i], cx - iw / 2, navY + 24);
    ctx.font = '600 10px Georgia';
    var nw = ctx.measureText(navItems[i]).width;
    ctx.fillText(navItems[i], cx - nw / 2, navY + 46);
  }

  // toast
  if (now < toast.until) {
    var a = Math.min(1, (toast.until - now) / 400);
    ctx.globalAlpha = Math.min(1, a * 2);
    ctx.font = '600 14px Georgia';
    var twd = ctx.measureText(toast.text).width;
    ctx.fillStyle = 'rgba(30,15,18,0.82)';
    roundRect(SW / 2 - twd / 2 - 14, navY - 52, twd + 28, 32, 16); ctx.fill();
    ctx.fillStyle = '#f7e6c4';
    ctx.fillText(toast.text, SW / 2 - twd / 2, navY - 35);
    ctx.globalAlpha = 1;
  }
}

/* ---------------- main loop ---------------- */
var fpsFrames = 0, fpsLastT = 0, fpsVal = 0, showFps = false;
function loop(now) {
  var dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
  lastT = now;
  update(dt, now);
  draw(now);
  fpsFrames++;
  if (fpsLastT === 0) fpsLastT = now;
  if (now - fpsLastT >= 2000) {
    fpsVal = Math.round(fpsFrames * 1000 / (now - fpsLastT));
    fpsFrames = 0; fpsLastT = now;
  }
  requestAnimationFrame(loop);
}

/* expose for QA */
window.__kanavu2d = {
  player: player, partner: partner,
  hotspots: HOTSPOTS,
  fps: function () { return fpsVal; },
  teleport: function (x, y) { player.x = x; player.y = y; },
  pressContext: doContextAction,
  // M4 (games.js): firefly catch + theatre hooks
  world: {
    fireflies: fireflies, burst: burst,
    addStars: function (n) { stars += n; },
    toast: showToast,
    screenToWorld: function (sx, sy) { return { x: (sx - FIT.ox) / FIT.s, y: (sy - FIT.oy) / FIT.s }; }
  },
  holdActive: function () { return holdHands.active; }
};
