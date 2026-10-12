/* ============================================================================
 * Kanavu — world2d.js  (Milestone 0: top-down 2D world — DUSK)
 * ----------------------------------------------------------------------------
 * Brawl Stars-style top-down cozy world: two islands + bridge on one screen.
 * One-thumb virtual joystick (bottom-left) + one context button (bottom-right).
 * Proximity is the entire interaction language: Sit / Light / Collect / Talk.
 *
 * Art direction (locked, from art-direction-video.mp4):
 *   DARK dusk/autumn evening. Deep burgundy/maroon ground, dark teal pines,
 *   hanging lanterns, bunting flags, wooden fences, torches, camp supplies.
 *   Warm candlelight gold is the accent. Golden swirling sparkle trail.
 *   Characters: hand-drawn video sprites (Adi back-view walk cycle,
 *   Tara front-view), graphite-pencil + pastel wash, NEVER chibi.
 *
 * API:
 *   var api = KanavuWorld2D.init('canvasId', opts);
 *   api.setPartnerOnline(bool)  api.addStars(n)  api.getState()
 *   api.refreshLook()  api.on('collect'|'light'|'sit'|'talk', fn)  api.destroy()
 *
 * Vanilla JS, zero dependencies, DPR-aware, 60fps, iPhone Safari friendly.
 * ========================================================================== */
(function () {
'use strict';

/* ---------------- utils ---------------- */
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function dist(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); }
function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* '#rrggbb' + alpha -> 'rgba(...)' */
function hexA(hex, a) {
  var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
/* 4-point sparkle */
function star4(ctx, x, y, r, rot) {
  rot = rot || 0;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.beginPath();
  for (var i = 0; i < 8; i++) {
    var rr = (i % 2 === 0) ? r : r * 0.32;
    var a = (i / 8) * Math.PI * 2;
    var px = Math.cos(a) * rr, py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill(); ctx.restore();
}

/* ---------------- palette (DUSK — locked from art-direction video) ----------------
 * Deep burgundy/maroon ground, dark teal pines, warm lantern orange + gold.
 * Moody autumn evening, NOT bright daytime. */
var PAL = {
  water:      '#1c2a33', waterDeep: '#101a22', waterLine: 'rgba(255,190,120,0.05)',
  grass:      '#5a2530', grassLight: '#6e3238', grassDark: '#3f1a24', grassPatch: '#52222c',
  shore:      '#8a6248', shoreDark: '#6e4a34',
  path:       '#7a4636', pathEdge: '#5e3428',
  pine:       '#14352e', pineHi: '#1e5040', pineDark: '#0c231e', trunk: '#4a2620',
  pineMaroon: '#4a1f2a', pineMaroonHi: '#63303c',
  rose:       '#5e2433', roseHi: '#7e3a48', roseLeaf: '#3a1f2a',
  bush:       '#4a2030', bushHi: '#66303e',
  gold:       '#ffd06e', goldDeep: '#e8a24c', candle: '#ffe6a8',
  lantern:    '#ff9a3c', lanternGlow: '#ff7a2a',
  burgundy:   '#5e2433', cream: '#f6e8d0',
  rock:       '#6a5a52', rockDark: '#524640',
  wood:       '#6e4530', woodDark: '#543322',
  fence:      '#5a3a28', fenceDark: '#452b1e',
  ink:        '#2b2026',
  leaf1:      '#8a3a2e', leaf2: '#a85a2e', leaf3: '#6e2a3a'
};

/* ---------------- video sprites (hand-drawn look, from art-direction video) ---------------- */
var Sprites = {
  adi: [], tara: null, loaded: 0, total: 0, ready: false,
  onReady: []
};
function loadSprites(basePath) {
  basePath = basePath || '';
  var defs = [
    { key: 'boy-walk', slot: 'adi', sheet: true },
    { key: 'girl-walk', slot: 'tara', sheet: true }
  ];
  Sprites.total = defs.length;
  defs.forEach(function (d) {
    var img = new Image();
    img.onload = function () {
      // Slice 4-frame horizontal sheet into individual frames
      var fw = Math.floor(img.width / 4);
      for (var i = 0; i < 4; i++) {
        var c = document.createElement('canvas');
        c.width = fw; c.height = img.height;
        var g = c.getContext('2d');
        g.drawImage(img, i * fw, 0, fw, img.height, 0, 0, fw, img.height);
        var frame = new Image();
        frame.src = c.toDataURL();
        if (d.slot === 'adi') Sprites.adi[i] = frame;
        else {
          if (!Sprites.taraFrames) Sprites.taraFrames = [];
          Sprites.taraFrames[i] = frame;
          if (i === 1) Sprites.tara = frame; // stand frame
        }
      }
      Sprites.loaded++;
      if (Sprites.loaded >= Sprites.total) {
        Sprites.ready = true;
        Sprites.onReady.forEach(function (fn) { try { fn(); } catch (e) {} });
      }
    };
    img.onerror = function () { Sprites.loaded++; };
    img.src = basePath + 'sprites/' + d.key + '.png';
  });
}

/* ---------------- KeeperLook integration ----------------
 * Reads colors from avatar-builder.js KeeperLook (if loaded) and applies
 * them as regional tints over the video sprites. */
function rgbStrToHex(s) {
  if (!s) return '#6fe3cf';
  if (s.charAt(0) === '#') return s;
  var m = s.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return '#6fe3cf';
  function h(n) { var x = parseInt(n, 10).toString(16); return x.length < 2 ? '0' + x : x; }
  return '#' + h(m[1]) + h(m[2]) + h(m[3]);
}
function shade(hex, amt) {
  /* amt -1..1: darken/lighten */
  var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= (1 + amt); g *= (1 + amt); b *= (1 + amt); }
  function h(n) { n = Math.round(Math.max(0, Math.min(255, n))); var x = n.toString(16); return x.length < 2 ? '0' + x : x; }
  return '#' + h(r) + h(g) + h(b);
}
function keeperLookColors(who) {
  /* returns {hair, tee, pants, glow} from KeeperLook, or null */
  try {
    if (!window.KeeperLook) return null;
    var cfg = window.KeeperLook.get(who);
    if (!cfg) return null;
    return {
      hair: cfg.hairColor || null,
      tee: cfg.topColor || null,
      pants: cfg.bottomColor || null,
      glow: rgbStrToHex(cfg.glow)
    };
  } catch (e) { return null; }
}
/* per-keeper tint overrides, refreshed from KeeperLook */
var KeeperTints = { player: null, partner: null };
function refreshKeeperTints() {
  KeeperTints.player = keeperLookColors('player');
  KeeperTints.partner = keeperLookColors('partner');
}

/* ---------------- tiny audio (soft chimes, gesture-gated) ---------------- */
var AudioFX = {
  ctx: null,
  ensure: function () {
    if (this.ctx) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    } catch (e) { /* silent */ }
  },
  blip: function (freq, dur, vol) {
    if (!this.ctx) return;
    try {
      var t = this.ctx.currentTime;
      var o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.25));
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t); o.stop(t + (dur || 0.25) + 0.05);
    } catch (e) { /* silent */ }
  },
  collect: function () { this.blip(880, 0.22, 0.10); setTimeout(() => this.blip(1320, 0.3, 0.08), 70); },
  light:   function () { this.blip(523, 0.4, 0.10); setTimeout(() => this.blip(784, 0.5, 0.08), 120); },
  tap:     function () { this.blip(660, 0.12, 0.06); }
};

/* ---------------- world constants ---------------- */
var WORLD_W = 800, WORLD_H = 1200;
var PLAYER_SPEED = 185;          /* world units / second */
var INTERACT_R = { star: 58, beacon: 82, campfire: 82, partner: 90 };

/* Island ellipses + bridge */
var HIS  = { cx: 200, cy: 570, rx: 185, ry: 330, name: 'His island' };
var HERS = { cx: 600, cy: 570, rx: 185, ry: 330, name: 'Her island' };
var BRIDGE = { x: 348, y: 518, w: 104, h: 104 };   /* walkable planks */

function inEllipse(x, y, e) {
  var dx = (x - e.cx) / e.rx, dy = (y - e.cy) / e.ry;
  return dx * dx + dy * dy <= 1;
}
function inRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
function walkable(x, y) {
  return inEllipse(x, y, HIS) || inEllipse(x, y, HERS) || inRect(x, y, BRIDGE);
}

/* ---------------- character configs (locked style) ---------------- */
function makeKeeperCfg(o) {
  return {
    name: o.name, skin: o.skin, hair: o.hair, hairHi: o.hairHi, hairStyle: o.hairStyle,
    tee: o.tee, teeDark: o.teeDark, pants: o.pants, shoes: o.shoes,
    glow: o.glow, smileyTee: !!o.smileyTee, scale: o.scale || 1
  };
}
var ADI_CFG = makeKeeperCfg({
  name: 'Adi', skin: '#e9b78d', hair: '#4c3b2e', hairHi: '#6e5a48', hairStyle: 'curly',
  tee: '#a9c79b', teeDark: '#7ba06c', pants: '#8f96a8', shoes: '#d8cfc0',
  glow: '#6fe3cf', smileyTee: true, scale: 1.1
});
var TARA_CFG = makeKeeperCfg({
  name: 'Tara', skin: '#f2c49a', hair: '#8d7cab', hairHi: '#b3a4d4', hairStyle: 'wavy',
  tee: '#c2a9dc', teeDark: '#9a7fb8', pants: '#a4d2ba', shoes: '#e8dcc8',
  glow: '#ff9ec4', smileyTee: false, scale: 0.96
});

/* ---------------- world generation (seeded, stable layout) ---------------- */
function buildWorld() {
  var rng = mulberry32(20261012);
  var W = {
    pines: [], gardens: [], bushes: [], obstacles: [], rectObstacles: [],
    starSpots: [], paths: [], fireflies: [],
    lanterns: [], buntings: [], fences: [], props: [], torches: [], leaves: []
  };

  /* winding paths: arrays of points, drawn as strokes */
  function makePath(cx, pts) {
    var p = [];
    for (var i = 0; i < pts.length; i++) p.push({ x: cx + pts[i][0], y: pts[i][1] });
    return p;
  }
  W.paths.push(makePath(HIS.cx,  [[-60,120],[-30,40],[-50,-40],[-20,-120],[-45,-190]]));
  W.paths.push(makePath(HIS.cx,  [[30,180],[55,90],[40,10]]));
  W.paths.push(makePath(HERS.cx, [[60,-140],[30,-60],[50,20],[25,110],[55,190]]));
  W.paths.push(makePath(HERS.cx, [[-40,-160],[-55,-80],[-35,-10]]));

  function clearOf(x, y) {
    /* keep clear of landmarks, bridge, paths, homes */
    if (dist(x, y, 140, 360) < 70) return false;   /* beacon */
    if (dist(x, y, 660, 780) < 80) return false;   /* campfire */
    if (dist(x, y, HIS.cx, 850) < 80) return false;
    if (dist(x, y, HERS.cx, 300) < 80) return false;
    if (x > 320 && x < 480 && y > 480 && y < 640) return false; /* bridge zone */
    return true;
  }
  function scatter(n, isle, minR, maxR, cb) {
    var placed = 0, guard = 0;
    while (placed < n && guard++ < 400) {
      var a = rng() * Math.PI * 2, rr = minR + rng() * (maxR - minR);
      var x = isle.cx + Math.cos(a) * isle.rx * rr, y = isle.cy + Math.sin(a) * isle.ry * rr;
      if (!inEllipse(x, y, isle)) continue;
      var edge = ((x - isle.cx) / isle.rx) ** 2 + ((y - isle.cy) / isle.ry) ** 2;
      if (edge > 0.86) continue;                    /* keep off the shore */
      if (!clearOf(x, y)) continue;
      cb(x, y, rng); placed++;
    }
  }
  /* pines — mix of dark teal and deep maroon */
  scatter(16, HIS, 0.25, 0.95, function (x, y, r) {
    W.pines.push({ x: x, y: y, s: 0.75 + r() * 0.6, ph: r() * 6.28, maroon: r() < 0.35 });
    W.obstacles.push({ x: x, y: y, r: 13 });
  });
  scatter(16, HERS, 0.25, 0.95, function (x, y, r) {
    W.pines.push({ x: x, y: y, s: 0.75 + r() * 0.6, ph: r() * 6.28, maroon: r() < 0.35 });
    W.obstacles.push({ x: x, y: y, r: 13 });
  });
  /* dark maroon bushes */
  scatter(8, HIS, 0.2, 0.9, function (x, y, r) {
    W.bushes.push({ x: x, y: y, s: 0.7 + r() * 0.7, ph: r() * 6.28, berries: r() < 0.5 });
  });
  scatter(8, HERS, 0.2, 0.9, function (x, y, r) {
    W.bushes.push({ x: x, y: y, s: 0.7 + r() * 0.7, ph: r() * 6.28, berries: r() < 0.5 });
  });
  /* rose gardens */
  scatter(3, HIS, 0.3, 0.8, function (x, y, r) { W.gardens.push({ x: x, y: y, s: 0.8 + r() * 0.5, ph: r() * 6.28 }); W.obstacles.push({ x: x, y: y, r: 20 }); });
  scatter(3, HERS, 0.3, 0.8, function (x, y, r) { W.gardens.push({ x: x, y: y, s: 0.8 + r() * 0.5, ph: r() * 6.28 }); W.obstacles.push({ x: x, y: y, r: 20 }); });

  /* hanging lanterns on pines (warm orange glow) */
  W.pines.forEach(function (pn, i) {
    if (i % 3 === 0) {
      W.lanterns.push({ x: pn.x + 18 * pn.s, y: pn.y - 52 * pn.s, s: 0.8 + (i % 4) * 0.15, ph: (i * 1.7) % 6.28 });
    }
  });

  /* bunting garlands between nearby pines */
  for (var bi = 0; bi < W.pines.length - 1; bi += 2) {
    var a = W.pines[bi], b = W.pines[bi + 1];
    var d = dist(a.x, a.y, b.x, b.y);
    if (d > 60 && d < 220 && a.y < 900 && b.y < 900) {
      W.buntings.push({ x1: a.x, y1: a.y - 70 * a.s, x2: b.x, y2: b.y - 70 * b.s, seed: bi });
    }
    if (W.buntings.length >= 8) break;
  }

  /* wooden fences — short runs near paths */
  var fenceRuns = [
    { x: 120, y: 700, w: 130, horiz: true }, { x: 560, y: 880, w: 140, horiz: true },
    { x: 300, y: 420, w: 110, horiz: false }, { x: 660, y: 420, w: 100, horiz: true }
  ];
  fenceRuns.forEach(function (fr) {
    var n = Math.max(2, Math.round(fr.w / 34));
    for (var fi = 0; fi < n; fi++) {
      var fx = fr.horiz ? fr.x + fi * 34 : fr.x;
      var fy = fr.horiz ? fr.y : fr.y + fi * 34;
      if (!walkable(fx, fy)) continue;
      W.fences.push({ x: fx, y: fy, horiz: fr.horiz, last: fi === n - 1 });
      W.obstacles.push({ x: fx, y: fy, r: 8 });
    }
  });

  /* camp supplies: barrels, crates, log stacks near campfire */
  var campProps = [
    { kind: 'barrel', x: 580, y: 720 }, { kind: 'barrel', x: 742, y: 742 },
    { kind: 'crate', x: 596, y: 700 }, { kind: 'logs', x: 720, y: 830 },
    { kind: 'crate', x: 250, y: 640 }, { kind: 'barrel', x: 268, y: 668 }
  ];
  campProps.forEach(function (cp) {
    if (!inEllipse(cp.x, cp.y, HIS) && !inEllipse(cp.x, cp.y, HERS)) return;
    W.props.push(cp);
    W.obstacles.push({ x: cp.x, y: cp.y, r: 14 });
  });

  /* torches along paths */
  var torchSpots = [[180, 640], [120, 480], [620, 900], [700, 640], [400, 560], [250, 760]];
  torchSpots.forEach(function (ts, ti) {
    if (!walkable(ts[0], ts[1])) return;
    W.torches.push({ x: ts[0], y: ts[1], ph: ti * 2.1 });
    W.obstacles.push({ x: ts[0], y: ts[1], r: 7 });
  });

  /* fallen autumn leaves scattered on ground */
  var leafCols = [PAL.leaf1, PAL.leaf2, PAL.leaf3];
  [HIS, HERS].forEach(function (isle) {
    for (var li = 0; li < 46; li++) {
      var a = rng() * Math.PI * 2, rr = 0.15 + rng() * 0.75;
      var lx = isle.cx + Math.cos(a) * isle.rx * rr, ly = isle.cy + Math.sin(a) * isle.ry * rr;
      if (!inEllipse(lx, ly, isle)) continue;
      W.leaves.push({ x: lx, y: ly, r: 3 + rng() * 4, rot: rng() * 6.28, c: leafCols[(rng() * 3) | 0] });
    }
  });

  /* landmark obstacles */
  W.obstacles.push({ x: 140, y: 360, r: 22 });   /* beacon */
  W.obstacles.push({ x: 660, y: 780, r: 26 });   /* campfire */
  W.rectObstacles.push({ x: HIS.cx - 52, y: 850 - 38, w: 104, h: 76 });   /* his home */
  W.rectObstacles.push({ x: HERS.cx - 52, y: 300 - 38, w: 104, h: 76 });  /* her home */

  /* star point spawn spots (5 per island) */
  scatter(5, HIS, 0.3, 0.8, function (x, y) { W.starSpots.push({ x: x, y: y, isle: 'his' }); });
  scatter(5, HERS, 0.3, 0.8, function (x, y) { W.starSpots.push({ x: x, y: y, isle: 'hers' }); });

  /* ambient fireflies over water + islands */
  for (var i = 0; i < 26; i++) {
    W.fireflies.push({
      x: rng() * WORLD_W, y: rng() * WORLD_H,
      ph: rng() * 6.28, sp: 0.3 + rng() * 0.7, r: 6 + rng() * 10
    });
  }
  return W;
}

/* ---------------- environment drawing ---------------- */
function drawWater(ctx, t) {
  var g = ctx.createLinearGradient(0, 0, 0, WORLD_H);
  g.addColorStop(0, PAL.waterDeep); g.addColorStop(0.5, PAL.water); g.addColorStop(1, PAL.waterDeep);
  ctx.fillStyle = g; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  /* soft wave arcs */
  ctx.strokeStyle = PAL.waterLine; ctx.lineWidth = 2;
  for (var i = 0; i < 14; i++) {
    var y = (i * 97 + t * 6) % (WORLD_H + 80) - 40;
    var x = (i * 263) % WORLD_W;
    ctx.beginPath(); ctx.arc(x, y, 34 + (i % 3) * 12, 0.2, Math.PI - 0.2); ctx.stroke();
  }
}

function drawIsland(ctx, e, t, rng) {
  /* shore ring — darker at dusk */
  ctx.fillStyle = PAL.shoreDark;
  ctx.beginPath(); ctx.ellipse(e.cx, e.cy, e.rx + 10, e.ry + 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PAL.shore;
  ctx.beginPath(); ctx.ellipse(e.cx, e.cy, e.rx + 4, e.ry + 4, 0, 0, Math.PI * 2); ctx.fill();
  /* burgundy ground */
  var g = ctx.createRadialGradient(e.cx, e.cy - 60, 40, e.cx, e.cy, e.rx + 40);
  g.addColorStop(0, PAL.grassLight); g.addColorStop(0.65, PAL.grass); g.addColorStop(1, PAL.grassDark);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI * 2); ctx.fill();
  /* darker ground patches */
  ctx.fillStyle = hexA(PAL.grassPatch, 0.6);
  for (var i = 0; i < 9; i++) {
    var a = mulberry32(i * 7 + (e === HIS ? 1 : 101));
    var px = e.cx + (a() - 0.5) * e.rx * 1.5, py = e.cy + (a() - 0.5) * e.ry * 1.5;
    ctx.beginPath(); ctx.ellipse(px, py, 30 + a() * 36, 20 + a() * 26, a() * 3, 0, Math.PI * 2); ctx.fill();
  }
  /* warm lantern-light pools on ground */
  ctx.fillStyle = hexA(PAL.lantern, 0.06);
  for (var j = 0; j < 5; j++) {
    var b = mulberry32(j * 13 + (e === HIS ? 5 : 55));
    var qx = e.cx + (b() - 0.5) * e.rx * 1.2, qy = e.cy + (b() - 0.5) * e.ry * 1.2;
    ctx.beginPath(); ctx.arc(qx, qy, 44 + b() * 30, 0, Math.PI * 2); ctx.fill();
  }
}

function drawPaths(ctx, paths) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (var i = 0; i < paths.length; i++) {
    var p = paths[i];
    ctx.strokeStyle = hexA(PAL.path, 0.55); ctx.lineWidth = 30;
    ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y);
    for (var j = 1; j < p.length; j++) ctx.lineTo(p[j].x, p[j].y);
    ctx.stroke();
    ctx.strokeStyle = hexA(PAL.path, 0.9); ctx.lineWidth = 22;
    ctx.stroke();
  }
}

function drawBridge(ctx, t) {
  var b = BRIDGE;
  /* posts */
  ctx.fillStyle = PAL.woodDark;
  [[b.x + 6, b.y + 6], [b.x + b.w - 6, b.y + 6], [b.x + 6, b.y + b.h - 6], [b.x + b.w - 6, b.y + b.h - 6]]
    .forEach(function (pt) { ctx.beginPath(); ctx.arc(pt[0], pt[1], 9, 0, Math.PI * 2); ctx.fill(); });
  /* planks */
  var n = 7;
  for (var i = 0; i < n; i++) {
    var px = b.x + 8 + (i * (b.w - 16)) / (n - 1);
    ctx.fillStyle = i % 2 ? PAL.wood : PAL.woodDark;
    roundRect(ctx, px - 7, b.y + 4, 14, b.h - 8, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  /* rope rails */
  ctx.strokeStyle = '#caa06a'; ctx.lineWidth = 4;
  [b.y + 10, b.y + b.h - 10].forEach(function (ry) {
    ctx.beginPath(); ctx.moveTo(b.x, ry);
    ctx.quadraticCurveTo(b.x + b.w / 2, ry + Math.sin(t * 1.4) * 3, b.x + b.w, ry); ctx.stroke();
  });
  /* sparkle where bridge meets candlelight */
  ctx.fillStyle = hexA(PAL.gold, 0.9);
  star4(ctx, b.x + b.w / 2, b.y - 12 + Math.sin(t * 2) * 3, 7, t * 0.6);
}

function drawPine(ctx, p, t) {
  var sway = Math.sin(t * 0.9 + p.ph) * 0.02;
  var cDark = p.maroon ? '#33141f' : PAL.pineDark;
  var cMid = p.maroon ? PAL.pineMaroon : PAL.pine;
  var cHi = p.maroon ? PAL.pineMaroonHi : PAL.pineHi;
  ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.s, p.s); ctx.rotate(sway);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(0, 4, 22, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PAL.trunk; ctx.fillRect(-4, -14, 8, 18);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-4, -14); ctx.lineTo(-4, 4); ctx.moveTo(4, -14); ctx.lineTo(4, 4); ctx.stroke();
  var layers = [[0, -58, 30], [0, -40, 38], [0, -20, 46]];
  for (var i = 0; i < layers.length; i++) {
    var L = layers[i];
    var g = ctx.createLinearGradient(L[0] - L[2], 0, L[0] + L[2], 0);
    g.addColorStop(0, cDark); g.addColorStop(0.45, cMid); g.addColorStop(0.8, cHi);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(L[0], L[1] - 26); ctx.lineTo(L[0] - L[2], L[1] + 14); ctx.lineTo(L[0] + L[2], L[1] + 14);
    ctx.closePath(); ctx.fill();
    /* layered branch strokes */
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.5;
    for (var b = 0; b < 3; b++) {
      var by = L[1] + 2 + b * 6;
      ctx.beginPath(); ctx.moveTo(L[0] - L[2] * 0.7, by); ctx.lineTo(L[0] + L[2] * 0.7, by); ctx.stroke();
    }
  }
  /* warm lantern-light rim on one side */
  ctx.fillStyle = hexA(PAL.lantern, 0.28);
  ctx.beginPath(); ctx.arc(-10, -50, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-6, -30, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawGarden(ctx, gd, t) {
  ctx.save(); ctx.translate(gd.x, gd.y); ctx.scale(gd.s, gd.s);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(0, 4, 30, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PAL.roseLeaf;
  ctx.beginPath(); ctx.ellipse(0, 0, 30, 20, 0, 0, Math.PI * 2); ctx.fill();
  var rng = mulberry32(77);
  for (var i = 0; i < 7; i++) {
    var a = rng() * 6.28, rr = rng() * 18;
    var bx = Math.cos(a) * rr, by = Math.sin(a) * rr * 0.6;
    var pulse = 1 + Math.sin(t * 2 + gd.ph + i) * 0.06;
    ctx.fillStyle = PAL.rose;
    ctx.beginPath(); ctx.arc(bx, by, 7 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PAL.roseHi;
    ctx.beginPath(); ctx.arc(bx - 2, by - 2, 3.2 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hexA(PAL.gold, 0.9);
    ctx.beginPath(); ctx.arc(bx + 2, by + 1, 1.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawBush(ctx, b, t) {
  ctx.save(); ctx.translate(b.x, b.y); ctx.scale(b.s, b.s);
  var sway = Math.sin(t * 0.8 + b.ph) * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(0, 6, 30, 10, 0, 0, Math.PI * 2); ctx.fill();
  /* dark maroon foliage blobs */
  var blobs = [[-16, -8, 17], [0, -14, 21], [16, -8, 17], [-8, -2, 15], [8, -2, 15]];
  blobs.forEach(function (bl, i) {
    var g = ctx.createRadialGradient(bl[0] - 5, bl[1] - 6 + sway * 0.4, 2, bl[0], bl[1], bl[2]);
    g.addColorStop(0, PAL.bushHi); g.addColorStop(1, PAL.bush);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(bl[0], bl[1] + sway * 0.4, bl[2], 0, Math.PI * 2); ctx.fill();
  });
  /* red berries */
  if (b.berries) {
    ctx.fillStyle = '#c23a3a';
    for (var i = 0; i < 6; i++) {
      var a = (i / 6) * 6.28 + b.ph;
      ctx.beginPath(); ctx.arc(Math.cos(a) * 16, -10 + Math.sin(a) * 8, 2.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = hexA(PAL.gold, 0.8);
    ctx.beginPath(); ctx.arc(8, -16, 1.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawLantern(ctx, L, t) {
  var sway = Math.sin(t * 1.1 + L.ph) * 4;
  var x = L.x + sway * 0.4, y = L.y + Math.abs(sway) * 0.3;
  ctx.save(); ctx.translate(x, y); ctx.scale(L.s, L.s);
  /* glow halo */
  var flick = 0.9 + Math.sin(t * 7 + L.ph) * 0.1;
  var g = ctx.createRadialGradient(0, 0, 4, 0, 0, 44 * flick);
  g.addColorStop(0, hexA(PAL.lanternGlow, 0.55 * flick)); g.addColorStop(1, hexA(PAL.lanternGlow, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 44 * flick, 0, Math.PI * 2); ctx.fill();
  /* hanging cord */
  ctx.strokeStyle = '#3a2418'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(0, -12); ctx.stroke();
  /* paper lantern body */
  var lg = ctx.createRadialGradient(-4, -4, 2, 0, 0, 15);
  lg.addColorStop(0, '#ffb35c'); lg.addColorStop(0.6, PAL.lantern); lg.addColorStop(1, '#c25a1e');
  ctx.fillStyle = lg;
  ctx.beginPath(); ctx.ellipse(0, 0, 11, 14, 0, 0, Math.PI * 2); ctx.fill();
  /* ribs */
  ctx.strokeStyle = 'rgba(120,50,10,0.5)'; ctx.lineWidth = 1.2;
  [-6, 0, 6].forEach(function (ry) {
    ctx.beginPath(); ctx.ellipse(0, ry, 10 - Math.abs(ry) * 0.5, 3, 0, 0, Math.PI * 2); ctx.stroke();
  });
  /* caps */
  ctx.fillStyle = '#5a2c14';
  roundRect(ctx, -6, -17, 12, 5, 2); ctx.fill();
  roundRect(ctx, -5, 12, 10, 4, 2); ctx.fill();
  /* bright core */
  ctx.fillStyle = hexA('#fff2c8', 0.95 * flick);
  ctx.beginPath(); ctx.ellipse(0, -1, 4.5, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawBunting(ctx, B, t) {
  var dx = B.x2 - B.x1, dy = B.y2 - B.y1;
  var len = Math.hypot(dx, dy);
  var sag = len * 0.12;
  /* rope */
  ctx.strokeStyle = '#4a3020'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(B.x1, B.y1);
  ctx.quadraticCurveTo((B.x1 + B.x2) / 2, (B.y1 + B.y2) / 2 + sag, B.x2, B.y2);
  ctx.stroke();
  /* pennant flags */
  var cols = ['#b03a2e', '#2e6e6a', '#e8d9b8', '#c26a2e', '#7e3040'];
  var n = Math.max(3, Math.floor(len / 34));
  var sway = Math.sin(t * 1.6 + B.seed) * 2;
  for (var i = 1; i < n; i++) {
    var f = i / n;
    var bx = B.x1 + dx * f, by = B.y1 + dy * f + sag * 4 * f * (1 - f) + sway * Math.sin(f * 9 + t);
    ctx.fillStyle = cols[(i + B.seed) % cols.length];
    ctx.beginPath();
    ctx.moveTo(bx - 8, by); ctx.lineTo(bx + 8, by); ctx.lineTo(bx + sway * 0.5, by + 15);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1; ctx.stroke();
  }
}

function drawFence(ctx, F) {
  ctx.save(); ctx.translate(F.x, F.y);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(0, 8, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
  /* post */
  var pg = ctx.createLinearGradient(-6, 0, 6, 0);
  pg.addColorStop(0, PAL.fenceDark); pg.addColorStop(0.5, PAL.fence); pg.addColorStop(1, PAL.fenceDark);
  ctx.fillStyle = pg;
  roundRect(ctx, -6, -26, 12, 34, 4); ctx.fill();
  ctx.fillStyle = PAL.fenceDark;
  ctx.beginPath(); ctx.arc(0, -26, 6, Math.PI, 0); ctx.fill();
  /* rails to next post */
  if (!F.last) {
    ctx.strokeStyle = PAL.fence; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath();
    if (F.horiz) { ctx.moveTo(4, -16); ctx.lineTo(34, -16); ctx.moveTo(4, -6); ctx.lineTo(34, -6); }
    else { ctx.moveTo(-3, -20); ctx.lineTo(-3, 12); ctx.moveTo(3, -20); ctx.lineTo(3, 12); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (F.horiz) { ctx.moveTo(4, -13); ctx.lineTo(34, -13); }
    else { ctx.moveTo(0, -20); ctx.lineTo(0, 12); }
    ctx.stroke();
  }
  ctx.restore();
}

function drawProp(ctx, P, t) {
  ctx.save(); ctx.translate(P.x, P.y);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(0, 10, 20, 6, 0, 0, Math.PI * 2); ctx.fill();
  if (P.kind === 'barrel') {
    var bg = ctx.createLinearGradient(-13, 0, 13, 0);
    bg.addColorStop(0, PAL.woodDark); bg.addColorStop(0.5, PAL.wood); bg.addColorStop(1, PAL.woodDark);
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.ellipse(0, -8, 14, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a2418'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(0, -12, 13, 4, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -4, 14, 4, 0, 0, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -4, 14, 4, 0, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = '#2e1c12';
    ctx.beginPath(); ctx.ellipse(0, -8, 13, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  } else if (P.kind === 'crate') {
    ctx.fillStyle = PAL.wood; roundRect(ctx, -14, -22, 28, 28, 3); ctx.fill();
    ctx.strokeStyle = PAL.woodDark; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.strokeStyle = PAL.woodDark; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-14, -22); ctx.lineTo(14, 6); ctx.moveTo(14, -22); ctx.lineTo(-14, 6); ctx.stroke();
  } else if (P.kind === 'logs') {
    ctx.fillStyle = PAL.woodDark;
    [[-10, 0], [10, -2], [0, -10]].forEach(function (lp) {
      ctx.beginPath(); ctx.arc(lp[0], lp[1], 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c89a68';
      ctx.beginPath(); ctx.arc(lp[0], lp[1], 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PAL.woodDark;
    });
  }
  ctx.restore();
}

function drawTorch(ctx, T, t) {
  ctx.save(); ctx.translate(T.x, T.y);
  var flick = 0.9 + Math.sin(t * 11 + T.ph) * 0.15;
  /* glow */
  var g = ctx.createRadialGradient(0, -44, 3, 0, -44, 40 * flick);
  g.addColorStop(0, hexA(PAL.lanternGlow, 0.5 * flick)); g.addColorStop(1, hexA(PAL.lanternGlow, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -44, 40 * flick, 0, Math.PI * 2); ctx.fill();
  /* post */
  ctx.fillStyle = PAL.woodDark;
  roundRect(ctx, -4, -34, 8, 40, 3); ctx.fill();
  /* wrap */
  ctx.fillStyle = '#8a6a48'; roundRect(ctx, -6, -40, 12, 10, 3); ctx.fill();
  /* flame */
  ctx.save(); ctx.translate(0, -42); ctx.scale(flick, flick);
  ctx.fillStyle = 'rgba(255,140,60,0.92)';
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.bezierCurveTo(7, -8, 5, -2, 0, 0);
  ctx.bezierCurveTo(-5, -2, -7, -8, 0, -16);
  ctx.fill();
  ctx.fillStyle = hexA(PAL.gold, 0.95);
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.bezierCurveTo(4, -5, 3, -1, 0, 0);
  ctx.bezierCurveTo(-3, -1, -4, -5, 0, -10);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function drawLeaves(ctx, leaves) {
  leaves.forEach(function (L) {
    ctx.save(); ctx.translate(L.x, L.y); ctx.rotate(L.rot);
    ctx.fillStyle = L.c; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.ellipse(0, 0, L.r, L.r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-L.r, 0); ctx.lineTo(L.r, 0); ctx.stroke();
    ctx.restore();
  });
  ctx.globalAlpha = 1;
}

function drawHome(ctx, x, y, label, t) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(0, 40, 62, 14, 0, 0, Math.PI * 2); ctx.fill();
  /* walls */
  ctx.fillStyle = PAL.cream; roundRect(ctx, -44, -18, 88, 58, 6); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 2; ctx.stroke();
  /* timber frame */
  ctx.strokeStyle = PAL.woodDark; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(-44, -18); ctx.lineTo(-44, 40); ctx.moveTo(44, -18); ctx.lineTo(44, 40); ctx.stroke();
  /* roof */
  ctx.fillStyle = PAL.burgundy;
  ctx.beginPath(); ctx.moveTo(-54, -16); ctx.lineTo(0, -58); ctx.lineTo(54, -16); ctx.closePath(); ctx.fill();
  ctx.fillStyle = hexA(PAL.candle, 0.25);
  ctx.beginPath(); ctx.moveTo(-54, -16); ctx.lineTo(0, -58); ctx.lineTo(-12, -16); ctx.closePath(); ctx.fill();
  /* door + warm window */
  var flick = 0.85 + Math.sin(t * 3 + x) * 0.1;
  ctx.fillStyle = 'rgba(255,190,110,' + flick.toFixed(2) + ')';
  roundRect(ctx, -12, 4, 24, 36, 4); ctx.fill();
  roundRect(ctx, 20, -6, 16, 14, 3); ctx.fill();
  ctx.fillStyle = PAL.woodDark; ctx.fillRect(-12, 4, 4, 36);
  /* label */
  ctx.fillStyle = 'rgba(30,18,24,0.75)';
  roundRect(ctx, -46, 48, 92, 22, 11); ctx.fill();
  ctx.fillStyle = PAL.candle; ctx.font = '600 12px -apple-system,sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, 59);
  ctx.restore();
}

function drawBeacon(ctx, lit, t) {
  var x = 140, y = 360;
  ctx.save(); ctx.translate(x, y);
  if (lit) {
    var g = ctx.createRadialGradient(0, -70, 6, 0, -70, 120);
    g.addColorStop(0, hexA(PAL.gold, 0.5)); g.addColorStop(1, hexA(PAL.gold, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -70, 120, 0, Math.PI * 2); ctx.fill();
    /* rotating beam */
    ctx.save(); ctx.translate(0, -70); ctx.rotate(t * 0.7);
    var bg = ctx.createLinearGradient(0, 0, 130, 0);
    bg.addColorStop(0, hexA(PAL.gold, 0.35)); bg.addColorStop(1, hexA(PAL.gold, 0));
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(130, -26); ctx.lineTo(130, 26); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(0, 6, 30, 10, 0, 0, Math.PI * 2); ctx.fill();
  /* striped tower */
  ctx.fillStyle = PAL.cream;
  ctx.beginPath(); ctx.moveTo(-16, 4); ctx.lineTo(-10, -56); ctx.lineTo(10, -56); ctx.lineTo(16, 4); ctx.closePath(); ctx.fill();
  /* burgundy stripes following the tower taper */
  ctx.fillStyle = PAL.burgundy;
  function stripe(y0, y1) {
    var w0 = 10 + (y0 + 56) / 60 * 6, w1 = 10 + (y1 + 56) / 60 * 6;
    ctx.beginPath();
    ctx.moveTo(-w0, y0); ctx.lineTo(w0, y0); ctx.lineTo(w1, y1); ctx.lineTo(-w1, y1);
    ctx.closePath(); ctx.fill();
  }
  stripe(-46, -36); stripe(-24, -14);
  /* light room */
  var fl = lit ? (0.9 + Math.sin(t * 6) * 0.1) : 0.25;
  ctx.fillStyle = 'rgba(255,205,120,' + fl.toFixed(2) + ')';
  roundRect(ctx, -12, -78, 24, 22, 4); ctx.fill();
  ctx.strokeStyle = PAL.ink; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.fillStyle = PAL.burgundy;
  ctx.beginPath(); ctx.moveTo(-15, -78); ctx.lineTo(0, -94); ctx.lineTo(15, -78); ctx.closePath(); ctx.fill();
  ctx.fillStyle = PAL.woodDark; ctx.fillRect(-3, -2, 6, 8);
  ctx.restore();
}

function drawCampfire(ctx, t) {
  var x = 660, y = 780;
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(0, 18, 44, 12, 0, 0, Math.PI * 2); ctx.fill();
  /* stone ring */
  for (var i = 0; i < 9; i++) {
    var a = (i / 9) * Math.PI * 2;
    ctx.fillStyle = i % 2 ? PAL.rock : PAL.rockDark;
    ctx.beginPath(); ctx.arc(Math.cos(a) * 34, Math.sin(a) * 20, 8, 0, Math.PI * 2); ctx.fill();
  }
  /* logs */
  ctx.strokeStyle = '#5e3d24'; ctx.lineWidth = 9; ctx.lineCap = 'round';
  [[-14, 8, 14, -6], [14, 8, -14, -6], [0, 12, 0, -10]].forEach(function (L) {
    ctx.beginPath(); ctx.moveTo(L[0], L[1]); ctx.lineTo(L[2], L[3]); ctx.stroke();
  });
  /* flame */
  var f1 = 1 + Math.sin(t * 9) * 0.14, f2 = 1 + Math.sin(t * 13 + 1) * 0.18;
  function flame(r, h, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, -h);
    ctx.bezierCurveTo(r, -h * 0.55, r * 0.7, -8, 0, -4);
    ctx.bezierCurveTo(-r * 0.7, -8, -r, -h * 0.55, 0, -h);
    ctx.fill();
  }
  ctx.save(); ctx.scale(f1, f1); flame(15, 44, 'rgba(255,140,60,0.92)'); ctx.restore();
  ctx.save(); ctx.scale(f2, f2); flame(9, 30, hexA(PAL.gold, 0.95)); ctx.restore();
  flame(4.5, 17, '#fff3d0');
  /* glow */
  var g = ctx.createRadialGradient(0, -14, 4, 0, -14, 90);
  g.addColorStop(0, hexA(PAL.gold, 0.4)); g.addColorStop(1, hexA(PAL.gold, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -14, 90, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawStarPoint(ctx, sp, t) {
  var bob = Math.sin(t * 2.4 + sp.ph) * 4;
  var pulse = 1 + Math.sin(t * 3.2 + sp.ph) * 0.12;
  ctx.save(); ctx.translate(sp.x, sp.y + bob);
  var g = ctx.createRadialGradient(0, 0, 2, 0, 0, 30 * pulse);
  g.addColorStop(0, hexA(PAL.gold, 0.55)); g.addColorStop(1, hexA(PAL.gold, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 30 * pulse, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PAL.gold; star4(ctx, 0, 0, 13 * pulse, t * 0.8 + sp.ph); ctx.fill();
  ctx.fillStyle = '#fff3d0'; star4(ctx, 0, 0, 6 * pulse, -t * 0.5); ctx.fill();
  ctx.restore();
}

function drawIslandSign(ctx, e) {
  ctx.save();
  ctx.fillStyle = 'rgba(30,18,24,0.72)';
  roundRect(ctx, e.cx - 62, e.cy - e.ry - 6, 124, 30, 15); ctx.fill();
  ctx.strokeStyle = hexA(PAL.gold, 0.6); ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = PAL.candle; ctx.font = '700 14px -apple-system,sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(e.name, e.cx, e.cy - e.ry + 9);
  ctx.restore();
}

/* ---------------- keeper sprite (hand-drawn video sprites) --------------------
 * Uses extracted video frames: Adi (back view, 4 walk poses), Tara (front).
 * Candle-glow aura + name label + sparkle trail drawn as Canvas overlays.
 * KeeperLook tints (hair/tee/pants) applied as regional color washes. */

function drawKeeper(ctx, k, t) {
  var c = k.cfg, s = c.scale;
  var moving = k.moving && !k.sitting;
  var bob = moving ? Math.abs(Math.sin(t * 11 + k.ph)) * 3 : Math.sin(t * 2 + k.ph) * 1.4;

  /* pick sprite frame */
  var img = null, isAdi = (k.role === 'player');
  if (Sprites.ready) {
    if (isAdi && Sprites.adi.length) {
      if (moving) {
        /* 4-frame walk cycle */
        var fi = Math.floor(t * 9 + k.ph) % 4;
        img = Sprites.adi[[0, 1, 0, 2][fi]] || Sprites.adi[0];
        if (fi === 3 && Sprites.adi[3]) img = Sprites.adi[3];
      } else {
        img = Sprites.adi[0];
      }
    } else if (!isAdi && Sprites.taraFrames && Sprites.taraFrames.length) {
      if (moving) {
        var fi2 = Math.floor(t * 9 + k.ph) % 4;
        img = Sprites.taraFrames[[0, 1, 0, 2][fi2]] || Sprites.taraFrames[1];
      } else {
        img = Sprites.taraFrames[1] || Sprites.tara;
      }
    } else if (!isAdi && Sprites.tara) {
      img = Sprites.tara;
    }
  }

  /* target height ~118 world units */
  var TARGET_H = 118 * s;
  var iw = 90 * s, ih = TARGET_H; /* fallback dims */
  if (img) { var ar = img.width / img.height; ih = TARGET_H; iw = ih * ar; }

  ctx.save();
  ctx.translate(k.x, k.y);

  /* soft shadow */
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath(); ctx.ellipse(0, 3, iw * 0.32, 7 * s, 0, 0, Math.PI * 2); ctx.fill();

  /* candle-glow aura in personal color (KeeperLook glow or default) */
  var tint = isAdi ? KeeperTints.player : KeeperTints.partner;
  var glowCol = (tint && tint.glow) || c.glow;
  var aura = ctx.createRadialGradient(0, -ih * 0.45, 4, 0, -ih * 0.45, ih * 0.62);
  aura.addColorStop(0, hexA(glowCol, 0.30)); aura.addColorStop(1, hexA(glowCol, 0));
  ctx.fillStyle = aura;
  ctx.beginPath(); ctx.arc(0, -ih * 0.45, ih * 0.62, 0, Math.PI * 2); ctx.fill();

  var lift = (k.sitting ? 10 : -bob);
  ctx.translate(0, lift);

  if (img) {
    ctx.save();
    if (k.facing < 0) ctx.scale(-1, 1);
    /* base sprite */
    ctx.drawImage(img, -iw / 2, -ih, iw, ih);
    /* KeeperLook regional tints (hair / tee / pants washes) */
    if (tint && (tint.hair || tint.tee || tint.pants)) {
      var tc = drawKeeper._tc;
      if (!tc) { tc = document.createElement('canvas'); drawKeeper._tc = tc; }
      var w2 = img.width, h2 = img.height;
      tc.width = w2; tc.height = h2;
      var g2 = tc.getContext('2d');
      g2.clearRect(0, 0, w2, h2);
      if (tint.hair) { g2.fillStyle = tint.hair; g2.globalAlpha = 0.42; g2.fillRect(0, 0, w2, h2 * 0.34); }
      if (tint.tee) { g2.fillStyle = tint.tee; g2.globalAlpha = 0.38; g2.fillRect(0, h2 * 0.32, w2, h2 * 0.30); }
      if (tint.pants) { g2.fillStyle = tint.pants; g2.globalAlpha = 0.38; g2.fillRect(0, h2 * 0.60, w2, h2 * 0.32); }
      g2.globalAlpha = 1;
      g2.globalCompositeOperation = 'destination-in';
      g2.drawImage(img, 0, 0);
      g2.globalCompositeOperation = 'source-over';
      ctx.drawImage(tc, -iw / 2, -ih, iw, ih);
    }
    /* wisp — small flame tuft in glow color */
    var wx = iw * 0.32, wy = -ih * 0.82 + Math.sin(t * 3 + k.ph) * 3;
    var wg = ctx.createRadialGradient(wx, wy, 1, wx, wy, 15);
    wg.addColorStop(0, hexA(glowCol, 0.8)); wg.addColorStop(1, hexA(glowCol, 0));
    ctx.fillStyle = wg; ctx.beginPath(); ctx.arc(wx, wy, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = glowCol;
    ctx.beginPath();
    ctx.moveTo(wx, wy - 7);
    ctx.bezierCurveTo(wx + 4, wy - 2, wx + 2, wy + 4, wx, wy + 5);
    ctx.bezierCurveTo(wx - 2, wy + 4, wx - 4, wy - 2, wx, wy - 7);
    ctx.fill();
    ctx.restore();
  } else {
    /* fallback: simple silhouette while sprites load */
    ctx.fillStyle = c.tee;
    ctx.beginPath(); ctx.ellipse(0, -ih * 0.55, iw * 0.28, ih * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c.skin;
    ctx.beginPath(); ctx.arc(0, -ih * 0.88, iw * 0.16, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  /* name label */
  var ly = k.y - ih - 14 + (k.sitting ? 10 : 0);
  ctx.save();
  ctx.font = '700 13px -apple-system,sans-serif';
  var tw = ctx.measureText(k.cfg.name).width;
  ctx.fillStyle = 'rgba(24,14,20,0.72)';
  roundRect(ctx, k.x - tw / 2 - 9, ly - 12, tw + 18, 22, 11); ctx.fill();
  ctx.fillStyle = hexA(glowCol, 0.9);
  ctx.beginPath(); ctx.arc(k.x - tw / 2 - 4, ly - 1, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffe9c4'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(k.cfg.name, k.x + 3, ly);
  ctx.restore();
}
/* ---------------- entities ---------------- */
function makeKeeper(cfg, x, y, role) {
  return {
    cfg: cfg, x: x, y: y, vx: 0, vy: 0, facing: 1,
    moving: false, sitting: false, ph: Math.random() * 6.28,
    trailT: 0, role: role || 'player'
  };
}

/* ---------------- particles ---------------- */
function makeParticles() {
  return { list: [] };
}
function spawnP(p, o) {
  if (p.list.length > 420) p.list.shift();
  p.list.push({
    x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0,
    life: o.life || 0.8, age: 0, size: o.size || 5,
    color: o.color || PAL.gold, kind: o.kind || 'dot', grav: o.grav || 0
  });
}
function burst(p, x, y, n, color, kind) {
  for (var i = 0; i < n; i++) {
    var a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 130;
    spawnP(p, {
      x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
      life: 0.6 + Math.random() * 0.7, size: 3 + Math.random() * 5,
      color: color, kind: kind || 'star', grav: 160
    });
  }
}
function updateParticles(p, dt) {
  for (var i = p.list.length - 1; i >= 0; i--) {
    var q = p.list[i];
    q.age += dt;
    if (q.age >= q.life) { p.list.splice(i, 1); continue; }
    q.vy += q.grav * dt;
    q.x += q.vx * dt; q.y += q.vy * dt;
    q.vx *= (1 - dt * 1.6); q.vy *= (1 - dt * 0.6);
  }
}
function drawParticles(ctx, p, t) {
  for (var i = 0; i < p.list.length; i++) {
    var q = p.list[i], k = 1 - q.age / q.life;
    ctx.globalAlpha = k;
    ctx.fillStyle = q.color;
    if (q.kind === 'star') star4(ctx, q.x, q.y, q.size * k + 1, t * 2 + i);
    else if (q.kind === 'heart') {
      ctx.save(); ctx.translate(q.x, q.y); ctx.scale(k, k);
      ctx.beginPath();
      ctx.moveTo(0, 4);
      ctx.bezierCurveTo(-7, -3, -3, -8, 0, -4);
      ctx.bezierCurveTo(3, -8, 7, -3, 0, 4);
      ctx.fill(); ctx.restore();
    }
    else { ctx.beginPath(); ctx.arc(q.x, q.y, q.size * k * 0.6 + 0.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
}

/* ---------------- game state ---------------- */
function makeState(opts) {
  opts = opts || {};
  var world = buildWorld();
  var stars = [];
  /* activate initial star points */
  for (var i = 0; i < world.starSpots.length; i++) {
    stars.push({ x: world.starSpots[i].x, y: world.starSpots[i].y, ph: Math.random() * 6.28, active: true, respawn: 0 });
  }
  return {
    world: world, stars: stars,
    player: makeKeeper(ADI_CFG, HIS.cx - 20, HIS.cy + 60, 'player'),
    partner: makeKeeper(TARA_CFG, HERS.cx + 10, HERS.cy + 40, 'partner'),
    partnerOnline: opts.partnerOnline !== false,
    starCount: opts.stars != null ? opts.stars : 120,
    streak: opts.streak != null ? opts.streak : 12,
    beaconLit: false,
    particles: makeParticles(),
    toast: null, toastT: 0,
    ctxAction: null,            /* {id,label} current context action */
    time: 0,
    listeners: {},
    playerName: opts.playerName || 'Adi',
    partnerName: opts.partnerName || 'Tara'
  };
}
function showToast(S, msg, dur) {
  S.toast = msg; S.toastT = dur || 2.2;
}
function emit(S, evt, data) {
  var ls = S.listeners[evt] || [];
  for (var i = 0; i < ls.length; i++) { try { ls[i](data); } catch (e) {} }
}

/* ---------------- collision ---------------- */
function collideCircle(S, x, y, r) {
  var W = S.world, nx = x, ny = y;
  /* obstacle circles */
  for (var i = 0; i < W.obstacles.length; i++) {
    var o = W.obstacles[i];
    var d = dist(nx, ny, o.x, o.y), min = r + o.r;
    if (d < min && d > 0.001) {
      nx = o.x + (nx - o.x) / d * min;
      ny = o.y + (ny - o.y) / d * min;
    }
  }
  /* obstacle rects (homes) */
  for (var j = 0; j < W.rectObstacles.length; j++) {
    var R = W.rectObstacles[j];
    var cx = clamp(nx, R.x, R.x + R.w), cy = clamp(ny, R.y, R.y + R.h);
    var dd = dist(nx, ny, cx, cy);
    if (dd < r) {
      if (dd > 0.001) { nx = cx + (nx - cx) / dd * r; ny = cy + (ny - cy) / dd * r; }
      else { ny = R.y - r; }
    }
  }
  return { x: nx, y: ny };
}
function tryMove(S, k, dx, dy) {
  var r = 14;
  /* slide: try full, then x-only, then y-only */
  var nx = k.x + dx, ny = k.y + dy;
  if (walkable(nx, ny)) { var c = collideCircle(S, nx, ny, r); k.x = c.x; k.y = c.y; return; }
  nx = k.x + dx; ny = k.y;
  if (walkable(nx, ny)) { var c2 = collideCircle(S, nx, ny, r); k.x = c2.x; k.y = c2.y; return; }
  nx = k.x; ny = k.y + dy;
  if (walkable(nx, ny)) { var c3 = collideCircle(S, nx, ny, r); k.x = c3.x; k.y = c3.y; }
}

/* ---------------- proximity + context actions ---------------- */
function nearestAction(S) {
  var p = S.player, best = null;
  function consider(d, id, label, pri) {
    if (!best || pri < best.pri) best = { id: id, label: label, pri: pri, d: d };
  }
  /* star points */
  for (var i = 0; i < S.stars.length; i++) {
    var sp = S.stars[i];
    if (!sp.active) continue;
    var d = dist(p.x, p.y, sp.x, sp.y);
    if (d < INTERACT_R.star) consider(d, 'collect', 'Collect', 1);
  }
  if (dist(p.x, p.y, 140, 360) < INTERACT_R.beacon) consider(0, 'light', S.beaconLit ? 'Lit ✓' : 'Light', 2);
  if (dist(p.x, p.y, 660, 780) < INTERACT_R.campfire) consider(0, p.sitting ? 'Stand' : 'Sit', p.sitting ? 'Stand' : 'Sit', 3);
  if (S.partnerOnline && dist(p.x, p.y, S.partner.x, S.partner.y) < INTERACT_R.partner)
    consider(0, 'talk', 'Talk', 4);
  return best;
}

function doAction(S, id) {
  var p = S.player;
  AudioFX.ensure();
  if (id === 'collect') {
    for (var i = 0; i < S.stars.length; i++) {
      var sp = S.stars[i];
      if (sp.active && dist(p.x, p.y, sp.x, sp.y) < INTERACT_R.star) {
        sp.active = false; sp.respawn = 40;
        S.starCount += 2;
        burst(S.particles, sp.x, sp.y, 14, PAL.gold, 'star');
        AudioFX.collect();
        showToast(S, '+2 ⭐');
        emit(S, 'collect', { x: sp.x, y: sp.y });
        break;
      }
    }
  } else if (id === 'light') {
    if (S.beaconLit) { showToast(S, 'Already lit — see you tonight 🔥'); return; }
    S.beaconLit = true; S.streak += 1; S.starCount += 15;
    burst(S.particles, 140, 300, 26, PAL.gold, 'star');
    AudioFX.light();
    showToast(S, 'Beacon lit! 🔥 ' + S.streak + '-day streak  +15 ⭐', 3);
    emit(S, 'light', { streak: S.streak });
  } else if (id === 'Sit' || id === 'sit' || id === 'Stand' || id === 'stand') {
    p.sitting = !p.sitting;
    AudioFX.tap();
    if (p.sitting) {
      showToast(S, 'Cozy by the fire…');
      if (S.partnerOnline && dist(p.x, p.y, S.partner.x, S.partner.y) < 150) S.partner.sitting = true;
      emit(S, 'sit', {});
    } else { S.partner.sitting = false; emit(S, 'stand', {}); }
  } else if (id === 'talk') {
    var q = S.partner;
    for (var h = 0; h < 8; h++) {
      spawnP(S.particles, {
        x: (p.x + q.x) / 2 + (Math.random() - 0.5) * 50, y: (p.y + q.y) / 2 - 60 - Math.random() * 30,
        vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 30,
        life: 1.2, size: 6, color: '#ff8fb0', kind: 'heart', grav: -20
      });
    }
    S.starCount += 1;
    AudioFX.tap();
    showToast(S, 'Warm moment ❤  +1 ⭐');
    emit(S, 'talk', {});
  }
}

/* ---------------- partner AI ---------------- */
function updatePartner(S, dt) {
  var q = S.partner, p = S.player;
  q.cfg.name = S.partnerName; p.cfg.name = S.playerName;
  if (!S.partnerOnline) {
    /* rests at home */
    var hx = HERS.cx, hy = 300 + 52;
    if (dist(q.x, q.y, hx, hy) > 4) {
      var d = dist(q.x, q.y, hx, hy);
      tryMove(S, q, (hx - q.x) / d * 60 * dt, (hy - q.y) / d * 60 * dt);
      q.moving = true; q.facing = (hx - q.x) >= 0 ? 1 : -1;
    } else { q.moving = false; q.sitting = true; }
    return;
  }
  q.sitting = p.sitting && dist(p.x, p.y, q.x, q.y) < 150;
  if (p.sitting) { q.moving = false; return; }
  var dd = dist(q.x, q.y, p.x, p.y);
  if (dd > 95) {
    var sp = Math.min(PLAYER_SPEED * 0.92, (dd - 60) * 3);
    tryMove(S, q, (p.x - q.x) / dd * sp * dt, (p.y - q.y) / dd * sp * dt);
    q.moving = true; q.facing = (p.x - q.x) >= 0 ? 1 : -1;
  } else if (dd > 60 && p.moving) {
    tryMove(S, q, (p.x - q.x) / dd * 60 * dt, (p.y - q.y) / dd * 60 * dt);
    q.moving = true;
  } else {
    q.moving = false;
    /* idle drift near player */
    q.ph += dt * 0.2;
  }
}

/* ---------------- UI: top bar, nav, joystick, context button ---------------- */
function drawTopBar(ctx, S, Wpx) {
  var h = 64;
  ctx.fillStyle = 'rgba(22,14,19,0.82)';
  roundRect(ctx, 10, 10, Wpx - 20, h - 16, 22); ctx.fill();
  ctx.strokeStyle = hexA(PAL.gold, 0.35); ctx.lineWidth = 1.5; ctx.stroke();
  /* stars */
  ctx.fillStyle = PAL.gold; star4(ctx, 44, 32, 13, 0.3); ctx.fill();
  ctx.fillStyle = '#ffe9c4'; ctx.font = '800 24px -apple-system,sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(String(S.starCount), 64, 33);
  /* streak pill */
  var label = '🔥 ' + S.streak + '-day streak';
  ctx.font = '700 15px -apple-system,sans-serif';
  var tw = ctx.measureText(label).width;
  var px = Wpx - tw - 46;
  ctx.fillStyle = 'rgba(200,110,40,0.9)';
  roundRect(ctx, px, 18, tw + 26, 30, 15); ctx.fill();
  ctx.fillStyle = '#fff2dd'; ctx.textAlign = 'center';
  ctx.fillText(label, px + (tw + 26) / 2, 34);
}

function drawNav(ctx, S, Wpx, Hpx) {
  var tabs = ['Islands', 'Decks', 'Games', 'Memories'];
  var icons = ['🏝️', '🗂️', '🎮', '🖼️'];
  var y = Hpx - 78, w = (Wpx - 20) / 4;
  ctx.fillStyle = 'rgba(22,14,19,0.88)';
  roundRect(ctx, 10, y - 8, Wpx - 20, 76, 20); ctx.fill();
  for (var i = 0; i < 4; i++) {
    var cx = 10 + w * i + w / 2;
    var active = i === 0;
    if (active) {
      ctx.fillStyle = hexA(PAL.gold, 0.22);
      roundRect(ctx, 14 + w * i, y - 4, w - 8, 66, 14); ctx.fill();
    }
    ctx.font = '22px -apple-system,sans-serif'; ctx.textAlign = 'center';
    ctx.globalAlpha = active ? 1 : 0.45;
    ctx.fillText(icons[i], cx, y + 20);
    ctx.font = (active ? '800' : '600') + ' 13px -apple-system,sans-serif';
    ctx.fillStyle = active ? PAL.gold : '#cdbfae';
    ctx.fillText(tabs[i], cx, y + 44);
    ctx.globalAlpha = 1;
    if (active) {
      ctx.fillStyle = PAL.gold;
      roundRect(ctx, cx - 18, y + 54, 36, 4, 2); ctx.fill();
    }
  }
  return { y: y - 8, h: 76 };
}

function drawJoystick(ctx, joy) {
  if (!joy.active) return;
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = 'rgba(20,14,20,0.55)';
  ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 62, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = hexA(PAL.candle, 0.5); ctx.lineWidth = 2; ctx.stroke();
  var kx = joy.ox + joy.dx * 44, ky = joy.oy + joy.dy * 44;
  var g = ctx.createRadialGradient(kx - 10, ky - 12, 4, kx, ky, 40);
  g.addColorStop(0, '#ffe9bd'); g.addColorStop(1, '#d8a95e');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(kx, ky, 38, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(90,50,20,0.5)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

function drawContextBtn(ctx, S, Wpx, Hpx, t) {
  var a = S.ctxAction;
  var bx = Wpx - 84, by = Hpx - 190, r = 46;
  ctx.save();
  if (a) {
    var pulse = 1 + Math.sin(t * 5) * 0.05;
    var g = ctx.createRadialGradient(bx, by, 6, bx, by, r * 1.9 * pulse);
    g.addColorStop(0, hexA(PAL.gold, 0.55)); g.addColorStop(1, hexA(PAL.gold, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, r * 1.9 * pulse, 0, Math.PI * 2); ctx.fill();
  }
  var bg = ctx.createRadialGradient(bx - 12, by - 14, 6, bx, by, r);
  if (a) { bg.addColorStop(0, '#ffe2a0'); bg.addColorStop(1, '#dd9a44'); }
  else { bg.addColorStop(0, '#6a5a52'); bg.addColorStop(1, '#453a36'); }
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = a ? hexA('#fff3d0', 0.9) : 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2.5; ctx.stroke();
  var icons = { collect: '⭐', light: '🕯️', Sit: '🔥', Stand: '🧍', Talk: '💬' };
  ctx.font = '26px -apple-system,sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(a ? (icons[a.id] || '✨') : '·', bx, by - 8);
  ctx.font = '800 15px -apple-system,sans-serif';
  ctx.fillStyle = a ? '#4a2c12' : 'rgba(255,255,255,0.4)';
  ctx.fillText(a ? a.label : '', bx, by + 18);
  ctx.restore();
  return { x: bx, y: by, r: r };
}

function drawToast(ctx, S, Wpx) {
  if (!S.toast) return;
  var a = clamp(S.toastT / 0.4, 0, 1);
  ctx.save(); ctx.globalAlpha = a;
  ctx.font = '700 15px -apple-system,sans-serif';
  var tw = ctx.measureText(S.toast).width;
  ctx.fillStyle = 'rgba(24,14,20,0.85)';
  roundRect(ctx, Wpx / 2 - tw / 2 - 16, 84, tw + 32, 36, 18); ctx.fill();
  ctx.strokeStyle = hexA(PAL.gold, 0.5); ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#ffe9c4'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(S.toast, Wpx / 2, 102);
  ctx.restore();
}

/* ---------------- main loop ---------------- */
function frame(S, view, t, dt) {
  var ctx = view.ctx;
  S.time = t;

  /* --- update --- */
  var joy = view.joy, p = S.player;
  var mx = 0, my = 0;
  if (joy.active && (Math.abs(joy.dx) > 0.12 || Math.abs(joy.dy) > 0.12)) {
    mx = joy.dx; my = joy.dy;
  }
  /* keyboard fallback (desktop testing) */
  if (view.keys.up) my -= 1; if (view.keys.down) my += 1;
  if (view.keys.left) mx -= 1; if (view.keys.right) mx += 1;
  var ml = Math.hypot(mx, my);
  if (ml > 1) { mx /= ml; my /= ml; }
  p.moving = ml > 0.12 && !p.sitting;
  if (p.moving) {
    if (p.sitting) p.sitting = false;
    tryMove(S, p, mx * PLAYER_SPEED * dt, my * PLAYER_SPEED * dt);
    if (Math.abs(mx) > 0.15) p.facing = mx > 0 ? 1 : -1;
    /* golden sparkle trail — swirling glitter like the video */
    p.trailT -= dt;
    if (p.trailT <= 0) {
      p.trailT = 0.07;
      var swirl = t * 6 + p.ph;
      for (var gi = 0; gi < 2; gi++) {
        var ga = swirl + gi * Math.PI + (Math.random() - 0.5);
        var gr = 6 + Math.random() * 14;
        spawnP(S.particles, {
          x: p.x + Math.cos(ga) * gr, y: p.y - 4 + Math.sin(ga) * gr * 0.5,
          vx: -Math.sin(ga) * 26 + (Math.random() - 0.5) * 10,
          vy: -20 - Math.random() * 18,
          life: 0.9 + Math.random() * 0.5, size: 2.5 + Math.random() * 3.5,
          color: Math.random() < 0.75 ? PAL.gold : '#ffb0d0',
          kind: 'star', grav: -18
        });
      }
    }
  }
  updatePartner(S, dt);

  /* failsafe: nudge back to land if ever off walkable ground */
  if (!walkable(p.x, p.y)) {
    var tc = dist(p.x, p.y, HIS.cx, HIS.cy) < dist(p.x, p.y, HERS.cx, HERS.cy) ? HIS : HERS;
    var ddn = dist(p.x, p.y, tc.cx, tc.cy) || 1;
    var fx = p.x + (tc.cx - p.x) / ddn * 160 * dt, fy = p.y + (tc.cy - p.y) / ddn * 160 * dt;
    if (walkable(fx, fy)) { var cc = collideCircle(S, fx, fy, 14); p.x = cc.x; p.y = cc.y; }
  }

  /* star respawns */
  for (var i = 0; i < S.stars.length; i++) {
    var sp = S.stars[i];
    if (!sp.active) {
      sp.respawn -= dt;
      if (sp.respawn <= 0) {
        /* respawn at a random free spot on either island */
        var spots = S.world.starSpots, s0 = spots[(Math.random() * spots.length) | 0];
        sp.x = s0.x + (Math.random() - 0.5) * 30; sp.y = s0.y + (Math.random() - 0.5) * 30;
        sp.active = true;
        burst(S.particles, sp.x, sp.y, 6, PAL.gold, 'star');
      }
    }
  }
  /* campfire embers */
  if (Math.random() < dt * 6) {
    spawnP(S.particles, {
      x: 660 + (Math.random() - 0.5) * 22, y: 772,
      vx: (Math.random() - 0.5) * 14, vy: -34 - Math.random() * 26,
      life: 1.1, size: 3, color: Math.random() < 0.5 ? PAL.gold : '#ff9a50', kind: 'dot', grav: -30
    });
  }
  updateParticles(S.particles, dt);
  if (S.toast) { S.toastT -= dt; if (S.toastT <= 0) S.toast = null; }

  /* proximity → context action */
  S.ctxAction = p.sitting ? { id: 'Stand', label: 'Stand', pri: 0 } : nearestAction(S);

  /* --- draw --- */
  var Wpx = view.w, Hpx = view.h;
  ctx.save();
  ctx.fillStyle = PAL.waterDeep; ctx.fillRect(0, 0, Wpx, Hpx);
  ctx.translate(view.ox, view.oy); ctx.scale(view.scale, view.scale);

  drawWater(ctx, t);
  var rng = mulberry32(7);
  drawIsland(ctx, HIS, t, rng); drawIsland(ctx, HERS, t, rng);
  drawIslandSign(ctx, HIS); drawIslandSign(ctx, HERS);
  drawPaths(ctx, S.world.paths);
  drawLeaves(ctx, S.world.leaves);
  drawBridge(ctx, t);

  /* y-sorted drawables */
  var draws = [];
  S.world.pines.forEach(function (pn) { draws.push({ y: pn.y, f: function () { drawPine(ctx, pn, t); } }); });
  S.world.bushes.forEach(function (b) { draws.push({ y: b.y, f: function () { drawBush(ctx, b, t); } }); });
  S.world.gardens.forEach(function (gd) { draws.push({ y: gd.y, f: function () { drawGarden(ctx, gd, t); } }); });
  S.world.fences.forEach(function (fn) { draws.push({ y: fn.y, f: function () { drawFence(ctx, fn); } }); });
  S.world.props.forEach(function (pr) { draws.push({ y: pr.y, f: function () { drawProp(ctx, pr, t); } }); });
  S.world.torches.forEach(function (tc) { draws.push({ y: tc.y, f: function () { drawTorch(ctx, tc, t); } }); });
  draws.push({ y: 850, f: function () { drawHome(ctx, HIS.cx, 850, 'Adi\'s home', t); } });
  draws.push({ y: 300, f: function () { drawHome(ctx, HERS.cx, 300, 'Tara\'s home', t); } });
  draws.push({ y: 360, f: function () { drawBeacon(ctx, S.beaconLit, t); } });
  draws.push({ y: 780, f: function () { drawCampfire(ctx, t); } });
  S.stars.forEach(function (sp) {
    if (sp.active) draws.push({ y: sp.y, f: function () { drawStarPoint(ctx, sp, t); } });
  });
  draws.push({ y: S.partner.y, f: function () { drawKeeper(ctx, S.partner, t); } });
  draws.push({ y: p.y, f: function () { drawKeeper(ctx, p, t); } });
  draws.sort(function (a, b) { return a.y - b.y; });
  draws.forEach(function (d) { d.f(); });

  /* lanterns hang on trees — draw after */
  S.world.lanterns.forEach(function (L) { drawLantern(ctx, L, t); });
  /* bunting garlands strung between trees */
  S.world.buntings.forEach(function (B) { drawBunting(ctx, B, t); });

  drawParticles(ctx, S.particles, t);

  /* fireflies */
  S.world.fireflies.forEach(function (f) {
    var fx = f.x + Math.sin(t * f.sp + f.ph) * 26, fy = f.y + Math.cos(t * f.sp * 0.8 + f.ph) * 20;
    var a = 0.25 + Math.abs(Math.sin(t * 1.6 + f.ph)) * 0.55;
    ctx.fillStyle = 'rgba(255,214,130,' + a.toFixed(2) + ')';
    ctx.beginPath(); ctx.arc(fx, fy, 2.4, 0, Math.PI * 2); ctx.fill();
  });

  /* cozy vignette */
  var vg = ctx.createRadialGradient(WORLD_W / 2, WORLD_H / 2, WORLD_H * 0.32, WORLD_W / 2, WORLD_H / 2, WORLD_H * 0.75);
  vg.addColorStop(0, 'rgba(40,10,20,0)'); vg.addColorStop(1, 'rgba(40,10,20,0.42)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  ctx.restore();

  /* --- screen-space UI --- */
  drawTopBar(ctx, S, Wpx);
  var nav = drawNav(ctx, S, Wpx, Hpx);
  view.navRect = { x: 10, y: nav.y, w: Wpx - 20, h: nav.h };
  drawJoystick(ctx, joy);
  view.ctxBtn = drawContextBtn(ctx, S, Wpx, Hpx, t);
  drawToast(ctx, S, Wpx);
}

/* ---------------- input ---------------- */
function attachInput(S, view) {
  var cv = view.canvas, joy = view.joy;
  function toLocal(e) {
    var r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  cv.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    AudioFX.ensure();
    if (AudioFX.ctx && AudioFX.ctx.state === 'suspended') { try { AudioFX.ctx.resume(); } catch (x) {} }
    var pt = toLocal(e);
    /* context button? */
    var b = view.ctxBtn;
    if (b && dist(pt.x, pt.y, b.x, b.y) < b.r + 14) {
      if (S.ctxAction) { doAction(S, S.ctxAction.id); }
      return;
    }
    /* bottom nav? */
    var n = view.navRect;
    if (n && pt.x >= n.x && pt.x <= n.x + n.w && pt.y >= n.y && pt.y <= n.y + n.h) {
      var idx = clamp(((pt.x - n.x) / n.w * 4) | 0, 0, 3);
      AudioFX.tap();
      if (idx === 0) { showToast(S, 'You are home 🏝️'); }
      else showToast(S, ['Decks', 'Games', 'Memories'][idx - 1] + ' — coming soon ✨');
      return;
    }
    /* joystick (left 55% of screen, or anywhere not on buttons) */
    if (joy.active) return;
    joy.active = true; joy.id = e.pointerId; joy.ox = pt.x; joy.oy = pt.y; joy.dx = 0; joy.dy = 0;
    try { cv.setPointerCapture(e.pointerId); } catch (x) {}
  });
  cv.addEventListener('pointermove', function (e) {
    if (!joy.active || e.pointerId !== joy.id) return;
    e.preventDefault();
    var pt = toLocal(e);
    var dx = pt.x - joy.ox, dy = pt.y - joy.oy;
    var d = Math.hypot(dx, dy), max = 52;
    if (d > max) { dx = dx / d * max; dy = dy / d * max; }
    joy.dx = dx / max; joy.dy = dy / max;
  });
  function endJoy(e) {
    if (joy.active && e.pointerId === joy.id) {
      joy.active = false; joy.dx = 0; joy.dy = 0;
    }
  }
  cv.addEventListener('pointerup', endJoy);
  cv.addEventListener('pointercancel', endJoy);
  /* keyboard fallback */
  view.keys = {};
  window.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase();
    if (k === 'arrowup' || k === 'w') view.keys.up = true;
    if (k === 'arrowdown' || k === 's') view.keys.down = true;
    if (k === 'arrowleft' || k === 'a') view.keys.left = true;
    if (k === 'arrowright' || k === 'd') view.keys.right = true;
    if (k === ' ' || k === 'enter') { if (S.ctxAction) doAction(S, S.ctxAction.id); e.preventDefault(); }
  });
  window.addEventListener('keyup', function (e) {
    var k = e.key.toLowerCase();
    if (k === 'arrowup' || k === 'w') view.keys.up = false;
    if (k === 'arrowdown' || k === 's') view.keys.down = false;
    if (k === 'arrowleft' || k === 'a') view.keys.left = false;
    if (k === 'arrowright' || k === 'd') view.keys.right = false;
  });
}

/* ---------------- sizing (DPR-aware, world fits screen) ---------------- */
function fitView(view) {
  var dpr = Math.min(window.devicePixelRatio || 1, 3);
  var w = view.wrap.clientWidth || window.innerWidth;
  var h = view.wrap.clientHeight || window.innerHeight;
  view.w = w; view.h = h;
  view.canvas.width = Math.round(w * dpr);
  view.canvas.height = Math.round(h * dpr);
  view.canvas.style.width = w + 'px';
  view.canvas.style.height = h + 'px';
  view.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  view.scale = Math.min(w / WORLD_W, h / WORLD_H);
  view.ox = (w - WORLD_W * view.scale) / 2;
  view.oy = (h - WORLD_H * view.scale) / 2;
}

/* ---------------- public API ---------------- */
function init(canvasId, opts) {
  var canvas = typeof canvasId === 'string' ? document.getElementById(canvasId) : canvasId;
  if (!canvas) throw new Error('KanavuWorld2D: canvas not found');
  /* load hand-drawn video sprites (sprites/ relative to page) */
  var basePath = (opts && opts.assetPath) || '';
  loadSprites(basePath);
  /* apply saved KeeperLook colors if avatar-builder.js is loaded */
  refreshKeeperTints();
  var wrap = canvas.parentElement || document.body;
  var view = {
    canvas: canvas, ctx: canvas.getContext('2d'), wrap: wrap,
    joy: { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 },
    keys: {}, w: 0, h: 0, scale: 1, ox: 0, oy: 0,
    ctxBtn: null, navRect: null, running: true, raf: 0, last: 0
  };
  var S = makeState(opts || {});
  fitView(view);
  attachInput(S, view);
  var onResize = function () { fitView(view); };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', function () { setTimeout(onResize, 120); });

  function loop(ts) {
    if (!view.running) return;
    var t = ts / 1000, dt = Math.min(0.05, t - (view.last || t));
    view.last = t;
    frame(S, view, t, dt);
    view.raf = requestAnimationFrame(loop);
  }
  view.raf = requestAnimationFrame(loop);

  return {
    version: '0.2.0',
    getState: function () { return S; },
    refreshLook: function () {
      /* re-read KeeperLook colors (called after customization saves) */
      refreshKeeperTints();
      /* update name labels too */
      try {
        if (window.KeeperLook) {
          var pc = window.KeeperLook.get('player');
          if (pc && pc.name) S.playerName = pc.name;
        }
      } catch (e) {}
    },
    setPartnerOnline: function (on) {
      S.partnerOnline = !!on;
      if (!on) S.partner.sitting = false;
      showToast(S, on ? 'Tara is here 💛' : 'Tara is away — resting at home');
    },
    addStars: function (n) { S.starCount += n; showToast(S, (n >= 0 ? '+' : '') + n + ' ⭐'); },
    on: function (evt, fn) {
      (S.listeners[evt] = S.listeners[evt] || []).push(fn);
      return this;
    },
    destroy: function () {
      view.running = false;
      cancelAnimationFrame(view.raf);
      window.removeEventListener('resize', onResize);
    }
  };
}

window.KanavuWorld2D = { init: init, version: '0.2.0', refreshLook: function () { refreshKeeperTints(); } };

})();
