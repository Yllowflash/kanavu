/* ============================================================
   Kanavu — "Your keeper" avatar builder (Milestone 1)
   Layered tint customizer over the v2 graphite keeper sprites.
   - KeeperLook: config + persistence + Canvas tint engine
   - KeeperBuilder: DOM UI matching customization.webp
   Loads BEFORE game.js; game.js calls KeeperLook.applyToGame().
   ============================================================ */
'use strict';

/* ---------------- option data ---------------- */
var KB_SKIN_TONES = ['#ffdfc4','#f6c69c','#eab183','#dda06f','#c9855a','#a96b42','#7c4e2e','#57331d'];
var KB_EYE_COLORS = ['#7a4a22','#3a2412','#4f7a5a','#5f7a95','#c08a35'];
var KB_HAIR_COLORS = ['#4a3325','#6b4a2f','#8a5a35','#b07a3f','#d9a05a','#7a4a5a','#4a5a6b','#2e2a26'];
var KB_TOP_COLORS = ['#8a3b2e','#4a6b3f','#c08a35','#a85f2e','#6b3f5e','#e8dcc0'];
var KB_BOTTOM_COLORS = ['#3a3a42','#5a4a38','#4a5d3a','#2f3a4a','#7a4a2e','#d8cbb2'];
var KB_GLOWS = ['255,190,90','255,150,140','170,220,190','150,190,255','200,170,230','255,130,80'];
var KB_PALETTES = [
  { name: 'Autumn cabin', hair: '#6b4a2f', top: '#8a3b2e', bottom: '#4a5d3a', glow: '255,190,90' },
  { name: 'Rose dusk',    hair: '#7a4a5a', top: '#a85f7a', bottom: '#5d4a5e', glow: '255,170,150' },
  { name: 'Forest glow',  hair: '#3f4a2e', top: '#4a6b3f', bottom: '#2f3a2e', glow: '200,220,150' }
];
var KB_FACE_SHAPES = ['Oval','Round','Soft square','Heart'];
var KB_NOSES = ['Soft','Button','Gentle','Defined'];

/* Fractional body regions per base sprite (calibrated from the v2 art).
   bands: [y0,y1] as fractions of image height. */
var KB_REGIONS = {
  adi: {
    hair: [0.00, 0.35], top: [0.36, 0.68], bottom: [0.60, 0.95],
    eyes: [{ x: 0.500, y: 0.313 }, { x: 0.625, y: 0.308 }], eyeR: 0.024,
    cheeks: [{ x: 0.462, y: 0.350 }, { x: 0.662, y: 0.344 }],
    mouth: { x0: 0.548, x1: 0.622, y: 0.363 }
  },
  tara: {
    hair: [0.00, 0.58], top: [0.36, 0.66], bottom: [0.60, 0.95],
    eyes: [{ x: 0.168, y: 0.188 }, { x: 0.228, y: 0.182 }], eyeR: 0.020,
    cheeks: [{ x: 0.150, y: 0.220 }, { x: 0.252, y: 0.214 }],
    mouth: { x0: 0.190, x1: 0.228, y: 0.248 }
  }
};

/* ---------------- small utils ---------------- */
function kbHexRgb(hex) {
  var h = hex.replace('#', '');
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  return parseInt(h.substr(0,2),16) + ',' + parseInt(h.substr(2,2),16) + ',' + parseInt(h.substr(4,2),16);
}
function kbSeedRand(seed) {
  var a = seed;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function kbStar4(g, x, y, r) {
  g.beginPath();
  g.moveTo(x, y - r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.quadraticCurveTo(x, y, x, y + r);
  g.quadraticCurveTo(x, y, x - r, y);
  g.quadraticCurveTo(x, y, x, y - r);
  g.fill();
}

/* Feathered horizontal band tint. mode: 'multiply' | 'soft-light' | 'color'. */
function kbBandTint(g, w, h, y0f, y1f, color, alpha, mode) {
  if (!color || alpha <= 0) return;
  var y0 = y0f * h, y1 = y1f * h;
  if (y1 <= y0) return;
  var f = Math.min(0.45, (h * 0.035) / (y1 - y0));
  var col = kbHexRgb(color);
  var gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, 'rgba(' + col + ',0)');
  gr.addColorStop(f, 'rgba(' + col + ',' + alpha + ')');
  gr.addColorStop(1 - f, 'rgba(' + col + ',' + alpha + ')');
  gr.addColorStop(1, 'rgba(' + col + ',0)');
  g.save();
  g.globalCompositeOperation = mode;
  g.fillStyle = gr;
  g.fillRect(0, y0, w, y1 - y0);
  g.restore();
}

/* Render a customized keeper: base sprite + all tint/fill layers.
   Stroke overlays (lashes etc.) are preview-only — see kbDrawStrokes. */
function kbRenderLook(img, cfg) {
  var w = img.width, h = img.height;
  var R = KB_REGIONS[cfg.base] || KB_REGIONS.adi;

  // tint layer: sprite copy + all color layers, then masked to the sprite's own alpha
  var lay = document.createElement('canvas');
  lay.width = w; lay.height = h;
  var g = lay.getContext('2d');
  g.drawImage(img, 0, 0);

  if (cfg.skin) kbBandTint(g, w, h, 0, 1, cfg.skin, 0.30, 'soft-light');
  if (cfg.hairColor) kbBandTint(g, w, h, R.hair[0], R.hair[1], cfg.hairColor, 0.80, 'multiply');
  if (cfg.topColor) kbBandTint(g, w, h, R.top[0], R.top[1], cfg.topColor, 0.74, 'multiply');
  if (cfg.bottomColor) kbBandTint(g, w, h, R.bottom[0], R.bottom[1], cfg.bottomColor, 0.74, 'multiply');

  // eye color — 'color' composite keeps the graphite shading, shifts hue
  if (cfg.eyeColor) {
    g.save();
    g.globalCompositeOperation = 'color';
    g.fillStyle = cfg.eyeColor;
    g.globalAlpha = 0.9;
    for (var i = 0; i < R.eyes.length; i++) {
      var e = R.eyes[i], er = R.eyeR * w;
      g.beginPath();
      g.ellipse(e.x * w, e.y * h, er * 0.8, er * 1.05, 0, 0, 6.29);
      g.fill();
    }
    g.restore();
    g.globalAlpha = 1;
  }

  // blush — soft radial cheek glow (per the GDD: radial glow, not circles)
  if (cfg.blush) {
    for (var b = 0; b < R.cheeks.length; b++) {
      var ch = R.cheeks[b], cr = w * 0.055;
      var bg2 = g.createRadialGradient(ch.x * w, ch.y * h, 1, ch.x * w, ch.y * h, cr);
      bg2.addColorStop(0, 'rgba(255,110,110,0.34)');
      bg2.addColorStop(1, 'rgba(255,110,110,0)');
      g.fillStyle = bg2;
      g.beginPath(); g.arc(ch.x * w, ch.y * h, cr, 0, 6.29); g.fill();
    }
  }

  // freckle-stars — tiny 4-point sparkles dusted on cheeks + nose bridge
  if (cfg.freckles) {
    var rnd = kbSeedRand(77);
    g.fillStyle = 'rgba(120,70,40,0.85)';
    for (var f = 0; f < 16; f++) {
      var side = f % 2, ck = R.cheeks[side];
      var fx = (ck.x + (rnd() - 0.5) * 0.075) * w;
      var fy = (ck.y + (rnd() - 0.5) * 0.055) * h;
      kbStar4(g, fx, fy, w * 0.0045 * (0.7 + rnd() * 0.7));
    }
  }

  // mask the tint layer to the sprite silhouette (kills band rectangles on transparent bg)
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-over';

  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  var out = c.getContext('2d');
  out.drawImage(img, 0, 0);
  out.drawImage(lay, 0, 0);
  return c;
}

/* Thin graphite stroke overlays — drawn live in the builder preview only
   (too fine to survive at in-world scale). */
function kbDrawStrokes(g, w, h, cfg) {
  var R = KB_REGIONS[cfg.base] || KB_REGIONS.adi;
  var lw = Math.max(1.6, w * 0.0032);
  g.save();
  g.strokeStyle = 'rgba(46,32,26,0.92)';
  g.fillStyle = 'rgba(46,32,26,0.92)';
  g.lineWidth = lw;
  g.lineCap = 'round';

  function eyeGeom(i) {
    var e = R.eyes[i], er = R.eyeR * w;
    return { x: e.x * w, y: e.y * h, r: er };
  }

  // lashes — short flicks at the outer corner of each eye
  if (cfg.lashes) {
    for (var i = 0; i < 2; i++) {
      var E = eyeGeom(i), sgn = i === 0 ? -1 : 1;
      for (var k = 0; k < 3; k++) {
        var bx = E.x + sgn * E.r * (0.95 + k * 0.12);
        var by = E.y - E.r * (0.25 - k * 0.22);
        g.beginPath();
        g.moveTo(bx, by);
        g.lineTo(bx + sgn * E.r * 0.55, by - E.r * (0.35 + k * 0.12));
        g.stroke();
      }
    }
  }

  // eye styles
  if (cfg.eyeStyle === 'starlit') {
    g.fillStyle = 'rgba(255,240,200,0.95)';
    for (var s = 0; s < 2; s++) {
      var SE = eyeGeom(s);
      kbStar4(g, SE.x - SE.r * 0.25, SE.y - SE.r * 0.35, SE.r * 0.42);
    }
    g.fillStyle = 'rgba(46,32,26,0.92)';
  } else if (cfg.eyeStyle === 'sleepy') {
    // heavier upper lid: a soft lid-line drawn lower over each eye
    for (var p = 0; p < 2; p++) {
      var PE = eyeGeom(p);
      g.beginPath();
      g.moveTo(PE.x - PE.r * 1.05, PE.y - PE.r * 0.15);
      g.quadraticCurveTo(PE.x, PE.y - PE.r * 0.75, PE.x + PE.r * 1.05, PE.y - PE.r * 0.1);
      g.stroke();
    }
  }

  // mouth — additive corner lifts over the baked calm smile
  var m = R.mouth, mx0 = m.x0 * w, mx1 = m.x1 * w, my = m.y * h;
  if (cfg.mouth === 'warm' || cfg.mouth === 'bright') {
    var ext = cfg.mouth === 'bright' ? 1.8 : 1.0;
    g.beginPath();
    g.moveTo(mx0, my);
    g.quadraticCurveTo(mx0 - w * 0.008 * ext, my - h * 0.004 * ext, mx0 - w * 0.016 * ext, my - h * 0.010 * ext);
    g.stroke();
    g.beginPath();
    g.moveTo(mx1, my);
    g.quadraticCurveTo(mx1 + w * 0.008 * ext, my - h * 0.004 * ext, mx1 + w * 0.016 * ext, my - h * 0.010 * ext);
    g.stroke();
    if (cfg.mouth === 'bright') {
      // faint lower-lip hint
      g.globalAlpha = 0.5;
      g.beginPath();
      g.moveTo(mx0 + w * 0.012, my + h * 0.010);
      g.quadraticCurveTo((mx0 + mx1) / 2, my + h * 0.016, mx1 - w * 0.012, my + h * 0.010);
      g.stroke();
      g.globalAlpha = 1;
    }
  }
  g.restore();
}

/* ---------------- KeeperLook: config + persistence ---------------- */
var KeeperLook = (function () {
  var LS_KEY = 'kanavu.keeper.v1';

  function defaults() {
    return {
      base: 'adi',
      skin: KB_SKIN_TONES[2], eyeColor: null, eyeStyle: 'natural',
      lashes: false, blush: false, freckles: false,
      mouth: 'calm', body: 1.0,
      hairStyle: 'cloud', hairColor: null,
      topColor: null, bottomColor: null,
      glow: KB_GLOWS[0]
    };
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  var store = { player: defaults(), partner: defaults() };
  store.partner.base = 'tara';

  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d.player) store.player = Object.assign(defaults(), d.player);
        if (d.partner) { var pd = defaults(); pd.base = 'tara'; store.partner = Object.assign(pd, d.partner); }
      }
    } catch (e) { /* fresh start */ }
  }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch (e) {}
  }
  function get(who) { return store[who] || store.player; }
  function set(who, patch) {
    Object.assign(store[who], patch);
    lookCache = {};   // invalidate tint cache
  }

  /* tint cache: key = base + JSON of tint-relevant fields */
  var lookCache = {};
  function baseImg(base) {
    return base === 'tara' ? window.taraImg : window.adiImg;
  }
  function tintKey(cfg) {
    return cfg.base + '|' + [cfg.skin, cfg.hairColor, cfg.topColor, cfg.bottomColor,
      cfg.eyeColor, cfg.blush, cfg.freckles].join(',');
  }
  function tintedCanvas(cfg) {
    var k = tintKey(cfg);
    if (!lookCache[k]) {
      var img = baseImg(cfg.base);
      if (!img || !img.width) return null;
      lookCache[k] = kbRenderLook(img, cfg);
    }
    return lookCache[k];
  }

  /* Apply saved looks to the running game (called from game.js assetReady
     and live on every builder change). Rebuilds the 2.5D light silhouettes
     so the dynamic lighting follows the new colors. */
  function applyToGame() {
    if (!window.player || !window.depthAssets || !window.adiImg || !window.adiImg.width) return;
    if (typeof makeSilhouette !== 'function' || typeof makeGlowTex !== 'function') return;
    try {
      var pc = get('player'), qc = get('partner');
      var pimg = tintedCanvas(pc);
      if (pimg) {
        window.player.img = pimg;
        window.player.lookScale = pc.body;
        window.player.lookW = 1 / Math.sqrt(Math.max(0.5, pc.body));
        window.depthAssets.silWarm.adi = makeSilhouette(pimg, '255,196,120', 0.50, 0.28, 0.10);
        window.depthAssets.silCool.adi = makeSilhouette(pimg, '110,140,220', 0.34, 0.20, 0.10);
        window.depthAssets.glowWarm = makeGlowTex(pc.glow || KB_GLOWS[0]);
      }
      var qimg = tintedCanvas(qc);
      if (qimg) {
        window.partner.img = qimg;
        window.partner.lookScale = qc.body;
        window.partner.lookW = 1 / Math.sqrt(Math.max(0.5, qc.body));
        window.depthAssets.silWarm.tara = makeSilhouette(qimg, '255,196,120', 0.50, 0.28, 0.10);
        window.depthAssets.silCool.tara = makeSilhouette(qimg, '110,140,220', 0.34, 0.20, 0.10);
      }
    } catch (e) { /* game not ready yet */ }
  }

  /* "Match" — coordinating couple set per GDD §3.8 */
  function matchPartner() {
    var pc = get('player');
    set('partner', {
      topColor: pc.topColor, bottomColor: pc.bottomColor,
      glow: pc.glow, blush: pc.blush
    });
    save();
  }

  function applyPalette(pal) {
    set('player', { hairColor: pal.hair, topColor: pal.top, bottomColor: pal.bottom, glow: pal.glow });
    save();
  }

  load();
  return {
    defaults: defaults, get: get, set: set, save: save, load: load,
    tintedCanvas: tintedCanvas, baseImg: baseImg, applyToGame: applyToGame,
    matchPartner: matchPartner, applyPalette: applyPalette
  };
})();

/* ---------------- KeeperBuilder: DOM UI ---------------- */
var KeeperBuilder = (function () {
  var els = {}, opened = false, rafId = 0, curTab = 'Face';
  var snapshot = null;

  var CSS = [
    '#kb{position:fixed;inset:0;z-index:200;display:none;flex-direction:column;font-family:Georgia,serif;',
    'background:linear-gradient(180deg,#f6e3d6 0%,#eed3e2 42%,#d9e2ef 100%);}',
    '#kb.on{display:flex;}',
    '.kb-head{margin:12px 14px 6px;background:#2b3040;border-radius:22px;display:flex;align-items:center;',
    'padding:10px 12px;box-shadow:0 4px 14px rgba(30,20,40,.25);}',
    '.kb-head button{background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.22);color:#f3ddab;',
    'width:38px;height:38px;border-radius:50%;font-size:19px;font-family:Georgia,serif;cursor:pointer;}',
    '.kb-title{flex:1;text-align:center;color:#f3ddab;font-size:22px;letter-spacing:.5px;}',
    '.kb-head .kb-help{margin-right:8px;}',
    '.kb-pvwrap{height:296px;position:relative;flex:none;}',
    '#kbPreview{position:absolute;inset:0;width:100%;height:100%;}',
    '.kb-tabs{display:flex;gap:7px;padding:8px 14px 4px;flex:none;}',
    '.kb-tab{flex:1;border:none;border-radius:16px;padding:10px 0;font-family:Georgia,serif;font-size:14px;',
    'font-weight:700;background:#2b3040;color:#cdbf9a;cursor:pointer;}',
    '.kb-tab.on{background:linear-gradient(180deg,#ffe9b0,#e8a93e);color:#5a2c0c;',
    'box-shadow:0 3px 10px rgba(200,140,40,.45);}',
    '.kb-panelwrap{flex:1;display:flex;padding:8px 14px 14px;min-height:0;}',
    '.kb-panel{flex:1;background:#f8f1e3;border-radius:20px;overflow-y:auto;padding:14px 16px 18px;',
    'box-shadow:0 6px 20px rgba(90,50,30,.18);touch-action:pan-y;-webkit-overflow-scrolling:touch;}',
    '.kb-sec{margin-bottom:16px;}',
    '.kb-seclabel{color:#a0762e;font-size:15px;font-weight:700;margin-bottom:9px;}',
    '.kb-dots{display:flex;flex-wrap:wrap;gap:10px;}',
    '.kb-dot{width:44px;height:44px;border-radius:50%;border:2px solid rgba(90,50,20,.18);cursor:pointer;',
    'box-shadow:inset 0 2px 5px rgba(255,255,255,.35),0 2px 5px rgba(90,50,20,.15);padding:0;}',
    '.kb-dot.on{outline:3px solid #e8b64c;outline-offset:2px;transform:scale(1.08);}',
    '.kb-dot.clear{background:linear-gradient(135deg,#fff 60%,#f0e6d2 60%);position:relative;}',
    '.kb-chips{display:flex;flex-wrap:wrap;gap:8px;}',
    '.kb-chip{border:none;border-radius:14px;padding:9px 15px;font-family:Georgia,serif;font-size:14px;',
    'background:#ece0c8;color:#6b4a22;cursor:pointer;}',
    '.kb-chip.on{background:linear-gradient(180deg,#ffe9b0,#e8a93e);color:#5a2c0c;font-weight:700;}',
    '.kb-chip.soon{opacity:.45;}',
    '.kb-facegrid{display:flex;gap:10px;}',
    '.kb-face{width:64px;height:64px;border-radius:16px;border:2px solid rgba(90,50,20,.15);cursor:pointer;padding:0;',
    'background:linear-gradient(135deg,#fdf6ea,#f3e4d2);}',
    '.kb-face.on{outline:3px solid #e8b64c;outline-offset:2px;}',
    '.kb-face.soon{opacity:.6;}',
    '.kb-hairgrid{display:flex;gap:10px;flex-wrap:wrap;}',
    '.kb-hair{width:72px;border:none;background:none;cursor:pointer;padding:0;}',
    '.kb-hair canvas{width:72px;height:72px;border-radius:16px;border:2px solid rgba(90,50,20,.15);',
    'background:linear-gradient(135deg,#fdf6ea,#f3e4d2);display:block;}',
    '.kb-hair.on canvas{outline:3px solid #e8b64c;outline-offset:2px;}',
    '.kb-hair.soon{opacity:.45;}',
    '.kb-hair span{display:block;text-align:center;font-size:11px;color:#6b4a22;margin-top:4px;}',
    '.kb-row{display:flex;align-items:center;gap:10px;}',
    '.kb-slider{flex:1;-webkit-appearance:none;appearance:none;height:12px;border-radius:8px;outline:none;',
    'background:linear-gradient(90deg,#9fc6e8,#e8b64c);}',
    '.kb-slider::-webkit-slider-thumb{-webkit-appearance:none;width:26px;height:26px;border-radius:50%;',
    'background:radial-gradient(circle at 35% 30%,#ffe9b0,#df9f3e);border:2px solid #a0762e;cursor:pointer;}',
    '.kb-slider::-moz-range-thumb{width:24px;height:24px;border-radius:50%;',
    'background:radial-gradient(circle at 35% 30%,#ffe9b0,#df9f3e);border:2px solid #a0762e;cursor:pointer;}',
    '.kb-cap{font-size:12px;color:#8a6a3a;white-space:nowrap;}',
    '.kb-togs{display:flex;gap:8px;flex-wrap:wrap;}',
    '.kb-tog{border:2px solid rgba(90,50,20,.2);border-radius:20px;padding:8px 16px;font-family:Georgia,serif;',
    'font-size:14px;background:#fffdf6;color:#8a6a3a;cursor:pointer;}',
    '.kb-tog.on{background:#2b3040;color:#f3ddab;border-color:#2b3040;}',
    '.kb-note{font-size:12px;color:#a08050;font-style:italic;margin-top:8px;}',
    '.kb-save{display:block;width:210px;margin:6px auto 2px;border:none;border-radius:24px;padding:14px 0;',
    'font-family:Georgia,serif;font-size:21px;font-weight:700;color:#5a2c0c;cursor:pointer;',
    'background:linear-gradient(180deg,#ffe9b0,#e8a93e);box-shadow:0 4px 14px rgba(200,140,40,.5);}',
    '.kb-match{display:block;width:100%;margin:4px 0 10px;border:none;border-radius:18px;padding:13px 0;',
    'font-family:Georgia,serif;font-size:16px;font-weight:700;color:#7a2e2e;cursor:pointer;',
    'background:linear-gradient(180deg,#ffd9d9,#f0a0a0);box-shadow:0 3px 10px rgba(200,90,90,.35);}',
    '.kb-pal{display:block;width:100%;margin:0 0 8px;border:2px solid rgba(90,50,20,.18);border-radius:14px;',
    'padding:11px;font-family:Georgia,serif;font-size:14px;background:#fffdf6;color:#6b4a22;cursor:pointer;text-align:left;}',
    '.kb-toast{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);background:rgba(30,15,18,.88);',
    'color:#f7e6c4;font-size:14px;padding:10px 20px;border-radius:18px;opacity:0;transition:opacity .3s;',
    'pointer-events:none;white-space:nowrap;z-index:5;}',
    '.kb-toast.show{opacity:1;}'
  ].join('\n');

  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }
  function toast(msg, ms) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { els.toast.classList.remove('show'); }, ms || 1800);
  }

  function buildDom() {
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);

    var root = el('div'); root.id = 'kb';
    var head = el('div', 'kb-head');
    var back = el('button', 'kb-back', '&#8592;');
    var title = el('div', 'kb-title', 'Your keeper');
    var help = el('button', 'kb-help', '?');
    var gear = el('button', 'kb-gear', '&#9881;');
    head.appendChild(back); head.appendChild(title); head.appendChild(help); head.appendChild(gear);

    var pvwrap = el('div', 'kb-pvwrap');
    var pv = el('canvas'); pv.id = 'kbPreview';
    pvwrap.appendChild(pv);

    var tabs = el('div', 'kb-tabs');
    var tabNames = ['Face', 'Body', 'Hair', 'Outfit', 'Colors'];
    var tabBtns = {};
    tabNames.forEach(function (n) {
      var b = el('button', 'kb-tab' + (n === curTab ? ' on' : ''), n);
      b.addEventListener('click', function () {
        curTab = n;
        Object.keys(tabBtns).forEach(function (k) { tabBtns[k].classList.toggle('on', k === n); });
        renderTab();
      });
      tabBtns[n] = b; tabs.appendChild(b);
    });

    var panelwrap = el('div', 'kb-panelwrap');
    var panel = el('div', 'kb-panel'); panel.id = 'kbPanel';
    panelwrap.appendChild(panel);

    var tst = el('div', 'kb-toast'); tst.id = 'kbToast';

    root.appendChild(head); root.appendChild(pvwrap); root.appendChild(tabs);
    root.appendChild(panelwrap); root.appendChild(tst);
    document.body.appendChild(root);

    els = { root: root, preview: pv, panel: panel, toast: tst, tabBtns: tabBtns };

    back.addEventListener('click', function () { discard(); });
    help.addEventListener('click', function () { toast('every change is live — Save keeps it'); });
    gear.addEventListener('click', function () { toast('more settings arrive soon \u2726'); });

    sizePreview();
    window.addEventListener('resize', sizePreview);
  }

  var pctx = null, PVW = 0, PVH = 0;
  function sizePreview() {
    if (!els.preview) return;
    var r = els.preview.parentNode.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    PVW = Math.round(r.width); PVH = Math.round(r.height);
    els.preview.width = Math.round(PVW * dpr);
    els.preview.height = Math.round(PVH * dpr);
    pctx = els.preview.getContext('2d');
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  var sparkles = [];
  (function () {
    var rnd = kbSeedRand(42);
    for (var i = 0; i < 14; i++) sparkles.push({ x: rnd(), y: rnd() * 0.8, ph: rnd() * 6.28, s: 3 + rnd() * 5 });
  })();

  function drawPreview(now) {
    if (!pctx) return;
    var g = pctx, t = now;
    g.clearRect(0, 0, PVW, PVH);
    var px = PVW / 2, py = PVH - 34;

    // glowing platform
    var pg = g.createRadialGradient(px, py, 4, px, py, PVW * 0.44);
    pg.addColorStop(0, 'rgba(255,222,150,0.9)');
    pg.addColorStop(0.55, 'rgba(255,200,130,0.38)');
    pg.addColorStop(1, 'rgba(255,200,130,0)');
    g.fillStyle = pg;
    g.beginPath(); g.ellipse(px, py, PVW * 0.44, PVH * 0.17, 0, 0, 6.29); g.fill();
    g.fillStyle = 'rgba(255,246,224,0.55)';
    g.beginPath(); g.ellipse(px, py + 4, PVW * 0.30, PVH * 0.085, 0, 0, 6.29); g.fill();
    g.strokeStyle = 'rgba(210,160,90,0.5)'; g.lineWidth = 2;
    g.beginPath(); g.ellipse(px, py + 4, PVW * 0.30, PVH * 0.085, 0, 0, 6.29); g.stroke();

    // keeper
    var cfg = KeeperLook.get('player');
    var tc = KeeperLook.tintedCanvas(cfg);
    if (tc && tc.width) {
      var sh = PVH * 0.80 * cfg.body;
      var sw = sh * (tc.width / tc.height) / Math.sqrt(Math.max(0.5, cfg.body));
      var bob = Math.sin(t / 480) * 5;
      var dx = px - sw / 2, dy = py - sh + 8 + bob;
      g.drawImage(tc, dx, dy, sw, sh);
      g.save();
      g.translate(dx, dy); g.scale(sw / tc.width, sh / tc.height);
      kbDrawStrokes(g, tc.width, tc.height, cfg);
      g.restore();
    }

    // drifting sparkles
    for (var i = 0; i < sparkles.length; i++) {
      var s = sparkles[i];
      var tw = 0.3 + 0.7 * Math.abs(Math.sin(t / 900 + s.ph));
      g.fillStyle = 'rgba(255,225,160,' + (tw * 0.9).toFixed(3) + ')';
      kbStar4(g, s.x * PVW, s.y * PVH + Math.sin(t / 1400 + s.ph) * 8, s.s * (0.6 + 0.6 * tw));
    }
  }

  function loop(now) {
    if (!opened) return;
    drawPreview(now);
    rafId = requestAnimationFrame(loop);
  }

  /* ------- option-row builders ------- */
  function sec(label) {
    var s = el('div', 'kb-sec');
    s.appendChild(el('div', 'kb-seclabel', label));
    return s;
  }
  function dotRow(colors, cur, onPick, opts) {
    var row = el('div', 'kb-dots');
    colors.forEach(function (c) {
      var d = el('button', 'kb-dot' + (cur === c ? ' on' : ''));
      d.style.background = c;
      d.title = c;
      d.addEventListener('click', function () {
        onPick(c);
        var kids = row.children;
        for (var i = 0; i < kids.length; i++) kids[i].classList.remove('on');
        d.classList.add('on');
      });
      row.appendChild(d);
    });
    if (opts && opts.clear) {
      var cl = el('button', 'kb-dot clear' + (!cur ? ' on' : ''), '\u2715');
      cl.style.color = '#8a6a3a'; cl.style.fontSize = '16px';
      cl.title = 'natural';
      cl.addEventListener('click', function () {
        onPick(null);
        var kids = row.children;
        for (var i = 0; i < kids.length; i++) kids[i].classList.remove('on');
        cl.classList.add('on');
      });
      row.appendChild(cl);
    }
    return row;
  }
  function glowRow(cur, onPick) {
    var row = el('div', 'kb-dots');
    KB_GLOWS.forEach(function (c) {
      var d = el('button', 'kb-dot' + (cur === c ? ' on' : ''));
      d.style.background = 'radial-gradient(circle at 35% 35%, rgba(' + c + ',1), rgba(' + c + ',0.25))';
      d.addEventListener('click', function () {
        onPick(c);
        var kids = row.children;
        for (var i = 0; i < kids.length; i++) kids[i].classList.remove('on');
        d.classList.add('on');
      });
      row.appendChild(d);
    });
    return row;
  }
  function chipRow(items, cur, onPick) {
    // items: [{id,label,soon}]
    var row = el('div', 'kb-chips');
    items.forEach(function (it) {
      var b = el('button', 'kb-chip' + (cur === it.id ? ' on' : '') + (it.soon ? ' soon' : ''), it.label);
      b.addEventListener('click', function () { onPick(it); });
      row.appendChild(b);
    });
    return row;
  }
  function togRow(defs, onToggle) {
    var row = el('div', 'kb-togs');
    defs.forEach(function (df) {
      var b = el('button', 'kb-tog' + (df.on ? ' on' : ''), df.label);
      b.addEventListener('click', function () {
        var v = !b.classList.contains('on');
        b.classList.toggle('on', v);
        onToggle(df.id, v);
      });
      row.appendChild(b);
    });
    return row;
  }
  function faceShapeCanvas(shape) {
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var g = c.getContext('2d');
    g.strokeStyle = '#6b4a2e'; g.lineWidth = 2.5; g.lineCap = 'round';
    g.beginPath();
    if (shape === 'Oval') g.ellipse(32, 32, 19, 25, 0, 0, 6.29);
    else if (shape === 'Round') g.arc(32, 33, 22, 0, 6.29);
    else if (shape === 'Soft square') {
      var r = 10; g.moveTo(13, 12);
      g.arcTo(51, 12, 51, 54, r); g.arcTo(51, 54, 13, 54, r);
      g.arcTo(13, 54, 13, 12, r); g.arcTo(13, 12, 51, 12, r);
    } else { // Heart
      g.moveTo(32, 54);
      g.bezierCurveTo(8, 36, 12, 12, 32, 20);
      g.bezierCurveTo(52, 12, 56, 36, 32, 54);
    }
    g.stroke();
    // ears hint
    g.beginPath(); g.arc(12, 34, 5, 0, 6.29); g.stroke();
    g.beginPath(); g.arc(52, 34, 5, 0, 6.29); g.stroke();
    return c;
  }
  function hairChip(base, label, soon) {
    var b = el('button', 'kb-hair' + (soon ? ' soon' : ''));
    var c = document.createElement('canvas'); c.width = c.height = 72;
    var g = c.getContext('2d');
    if (!soon) {
      var img = KeeperLook.baseImg(base);
      if (img && img.width) {
        // head crop per base
        var sx, sy, sw, sh;
        if (base === 'adi') { sx = 0.04 * img.width; sy = 0; sw = 0.92 * img.width; sh = 0.36 * img.height; }
        else { sx = 0; sy = 0; sw = 0.44 * img.width; sh = 0.30 * img.height; }
        g.drawImage(img, sx, sy, sw, sh, 0, 0, 72, 72);
      }
    } else {
      g.fillStyle = '#d9cbaa'; g.font = '28px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('\u2726', 36, 38);
    }
    b.appendChild(c);
    b.appendChild(el('span', null, label));
    return b;
  }

  function applyLive() { KeeperLook.applyToGame(); }

  /* ------- tabs ------- */
  function renderTab() {
    var p = els.panel; p.innerHTML = '';
    var cfg = KeeperLook.get('player');

    if (curTab === 'Face') {
      var s1 = sec('\u2726 Face shape');
      var grid = el('div', 'kb-facegrid');
      KB_FACE_SHAPES.forEach(function (f, i) {
        var b = el('button', 'kb-face' + (i === 0 ? ' on' : '') + (i > 0 ? ' soon' : ''));
        b.appendChild(faceShapeCanvas(f)); b.title = f;
        b.addEventListener('click', function () {
          if (i > 0) { toast('\u2726 layered face shapes arrive with the next art drop'); return; }
          var kids = grid.children;
          for (var k = 0; k < kids.length; k++) kids[k].classList.remove('on');
          b.classList.add('on');
        });
        grid.appendChild(b);
      });
      s1.appendChild(grid); p.appendChild(s1);

      var s2 = sec('\u2728 Skin tone');
      s2.appendChild(dotRow(KB_SKIN_TONES, cfg.skin, function (c) {
        KeeperLook.set('player', { skin: c || KB_SKIN_TONES[2] }); applyLive();
      }));
      p.appendChild(s2);

      var s3 = sec('\u2728 Eyes');
      s3.appendChild(chipRow([
        { id: 'natural', label: 'Natural' }, { id: 'starlit', label: 'Starlit' }, { id: 'sleepy', label: 'Sleepy' }
      ], cfg.eyeStyle, function (it) { KeeperLook.set('player', { eyeStyle: it.id }); applyLive(); renderTab(); }));
      s3.appendChild(el('div', 'kb-note', 'eye colour'));
      s3.appendChild(dotRow(KB_EYE_COLORS, cfg.eyeColor, function (c) {
        KeeperLook.set('player', { eyeColor: c }); applyLive();
      }, { clear: true }));
      p.appendChild(s3);

      var s4 = sec('\u2728 Nose');
      s4.appendChild(chipRow(KB_NOSES.map(function (n, i) {
        return { id: 'n' + i, label: n, soon: i > 0 };
      }), 'n0', function (it) {
        if (it.soon) { toast('\u2726 layered noses arrive with the next art drop'); return; }
      }));
      p.appendChild(s4);

      var s5 = sec('\u2728 Mouth');
      s5.appendChild(chipRow([
        { id: 'calm', label: 'Calm' }, { id: 'warm', label: 'Warm' }, { id: 'bright', label: 'Bright' }
      ], cfg.mouth, function (it) { KeeperLook.set('player', { mouth: it.id }); applyLive(); renderTab(); }));
      p.appendChild(s5);

      var s6 = sec('\u2728 Details');
      s6.appendChild(togRow([
        { id: 'lashes', label: 'Lashes', on: cfg.lashes },
        { id: 'blush', label: 'Blush', on: cfg.blush },
        { id: 'freckles', label: 'Freckle-stars', on: cfg.freckles }
      ], function (id, v) { var pt = {}; pt[id] = v; KeeperLook.set('player', pt); applyLive(); }));
      p.appendChild(s6);
    }

    if (curTab === 'Body') {
      var b1 = sec('\u2726 Body size');
      var row = el('div', 'kb-row');
      row.appendChild(el('span', 'kb-cap', 'petite'));
      var sl = el('input'); sl.type = 'range'; sl.className = 'kb-slider';
      sl.min = 0.85; sl.max = 1.15; sl.step = 0.01; sl.value = cfg.body;
      sl.addEventListener('input', function () {
        KeeperLook.set('player', { body: parseFloat(sl.value) }); applyLive();
      });
      row.appendChild(sl);
      row.appendChild(el('span', 'kb-cap', 'tall'));
      b1.appendChild(row);
      b1.appendChild(el('div', 'kb-note', 'the tall-and-lanky silhouette is the default, not the only option'));
      p.appendChild(b1);
    }

    if (curTab === 'Hair') {
      var h1 = sec('\u2728 Style');
      var hg = el('div', 'kb-hairgrid');
      var styles = [
        { base: 'adi', label: 'Cloud curls', soon: false },
        { base: 'tara', label: 'Long waves', soon: false },
        { base: null, label: 'Bob', soon: true },
        { base: null, label: 'Ponytail', soon: true },
        { base: null, label: 'Bun', soon: true },
        { base: null, label: 'Short neat', soon: true }
      ];
      styles.forEach(function (st) {
        var b = hairChip(st.base, st.soon ? st.label + ' \u2726' : st.label, st.soon);
        if (!st.soon && ((st.base === 'adi') === (cfg.base === 'adi'))) b.classList.add('on');
        b.addEventListener('click', function () {
          if (st.soon) { toast('\u2726 more hairstyles arrive with the next art drop'); return; }
          KeeperLook.set('player', { base: st.base }); applyLive(); renderTab();
        });
        hg.appendChild(b);
      });
      h1.appendChild(hg); p.appendChild(h1);

      var h2 = sec('\u2728 Hair colour');
      h2.appendChild(dotRow(KB_HAIR_COLORS, cfg.hairColor, function (c) {
        KeeperLook.set('player', { hairColor: c }); applyLive();
      }, { clear: true }));
      p.appendChild(h2);
    }

    if (curTab === 'Outfit') {
      var o1 = sec('\u2728 Top colour');
      o1.appendChild(dotRow(KB_TOP_COLORS, cfg.topColor, function (c) {
        KeeperLook.set('player', { topColor: c }); applyLive();
      }, { clear: true }));
      p.appendChild(o1);
      var o2 = sec('\u2728 Bottom colour');
      o2.appendChild(dotRow(KB_BOTTOM_COLORS, cfg.bottomColor, function (c) {
        KeeperLook.set('player', { bottomColor: c }); applyLive();
      }, { clear: true }));
      o2.appendChild(el('div', 'kb-note', 'new outfits arrive in the star shop \u2726'));
      p.appendChild(o2);
    }

    if (curTab === 'Colors') {
      var c1 = sec('\u2728 Wisp glow');
      c1.appendChild(glowRow(cfg.glow, function (c) {
        KeeperLook.set('player', { glow: c }); applyLive();
      }));
      c1.appendChild(el('div', 'kb-note', 'your personal glow — it follows you around the island'));
      p.appendChild(c1);

      var c2 = sec('\u2728 Palettes');
      KB_PALETTES.forEach(function (pal) {
        var b = el('button', 'kb-pal', '<b>' + pal.name + '</b> — hair, outfit & glow in one tap');
        b.addEventListener('click', function () {
          KeeperLook.applyPalette(pal); applyLive(); renderTab();
          toast(pal.name + ' applied \u2726');
        });
        c2.appendChild(b);
      });
      p.appendChild(c2);

      var c3 = sec('\u2665 Together');
      var mb = el('button', 'kb-match', '\u2665 Match with partner');
      mb.addEventListener('click', function () {
        KeeperLook.matchPartner(); applyLive();
        toast('you match now \u2665');
      });
      c3.appendChild(mb);
      c3.appendChild(el('div', 'kb-note', 'one tap: coordinating colours for both keepers'));
      p.appendChild(c3);
    }

    var save = el('button', 'kb-save', 'Save');
    save.addEventListener('click', function () {
      KeeperLook.save(); applyLive();
      toast('keeper saved \u2665');
      setTimeout(close, 650);
    });
    p.appendChild(save);
  }

  /* ------- open / close ------- */
  function open(preset) {
    if (!els.root) buildDom();
    snapshot = JSON.parse(JSON.stringify(KeeperLook.get('player')));
    if (preset) { KeeperLook.set('player', preset); KeeperLook.applyToGame(); }
    opened = true;
    els.root.classList.add('on');
    curTab = 'Face';
    Object.keys(els.tabBtns).forEach(function (k) { els.tabBtns[k].classList.toggle('on', k === 'Face'); });
    renderTab();
    sizePreview();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }
  function close() {
    opened = false;
    cancelAnimationFrame(rafId);
    if (els.root) els.root.classList.remove('on');
  }
  function discard() {
    if (snapshot) { KeeperLook.set('player', snapshot); KeeperLook.save(); KeeperLook.applyToGame(); }
    close();
  }

  /* QA hash hooks (invisible in normal use): #kb=1 opens the builder,
     #kbpreset=alt applies a dramatic preset first. */
  var KB_QA_PRESETS = {
    alt: { skin: '#7c4e2e', hairColor: '#8a5a35', topColor: '#8a3b2e', bottomColor: '#2f3a4a',
           body: 1.12, glow: '255,150,140', blush: true, freckles: true, lashes: true,
           eyeStyle: 'starlit', eyeColor: '#4f7a5a', mouth: 'warm' }
  };
  var hashTries = 0;
  function hashCheck() {
    if (!/kb=1/.test(location.hash)) return;
    if (window.adiImg && window.adiImg.width) {
      var m = location.hash.match(/kbpreset=([a-z]+)/);
      open(m && KB_QA_PRESETS[m[1]] ? KB_QA_PRESETS[m[1]] : null);
    } else if (++hashTries < 40) {
      setTimeout(hashCheck, 300);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(hashCheck, 500); });
  } else {
    setTimeout(hashCheck, 500);
  }

  return { open: open, close: close, isOpen: function () { return opened; } };
})();
