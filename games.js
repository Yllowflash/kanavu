/* ============================================================
   Kanavu — Games: theatre + co-op firefly catch (Milestone 4)
   DOM overlay UI matching the Decks (M2) storybook style:
   cozy burgundy + hunter green + candlelight gold, parchment cards,
   Georgia serif, rounded everything.
   Loads BEFORE game.js; game.js nav index 2 calls GamesUI.open(),
   game.js update() calls GamesUI.tick(dt), game.js onDown routes
   world taps through GamesUI.tapWorld().

   Demo honesty note: the partner (Tara) is simulated in this demo —
   the theatre is a stub for the real watch-together, and firefly
   catching is co-op with the island AI, not the real Tara.
   No fail states, no punishing timers (GDD pillars).
   Progress persists in localStorage under kanavu.games.v1.
   ============================================================ */
'use strict';

var GamesUI = (function () {
  var LS_KEY = 'kanavu.games.v1';
  var FF_MAX = 20;                 // lanterns full at 20 caught
  var AUTO_CATCH_R = 55;           // world units: keeper walks through a firefly
  var TAP_HIT_R = 90;              // world units: tap hit area on a firefly
  var KEEPER_NEAR_R = 120;         // world units: firefly must be near a keeper to tap-catch
  var MAP_W = 1152, MAP_H = 2048;  // must match game.js

  var els = {}, opened = false;
  var thTimer = 0, screenRaf = 0;

  /* ---------------- state ---------------- */
  var FF = { active: false, caught: 0, byAdi: 0, byTara: 0, banked: 0, fullNotified: false, aiT: 0 };
  var TH = { playing: false, sessions: 0 };

  function loadState() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && d.ff) {
          FF.caught = d.ff.caught | 0; FF.byAdi = d.ff.byAdi | 0;
          FF.byTara = d.ff.byTara | 0; FF.banked = d.ff.banked | 0;
          FF.fullNotified = FF.caught >= FF_MAX;
        }
        if (d && d.th) TH.sessions = d.th.sessions | 0;
      }
    } catch (e) { /* fresh start */ }
  }
  function saveState() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        ff: { caught: FF.caught, byAdi: FF.byAdi, byTara: FF.byTara, banked: FF.banked },
        th: { sessions: TH.sessions }
      }));
    } catch (e) {}
  }

  function k2d() { return (window.__kanavu2d && window.__kanavu2d.world) ? window.__kanavu2d : null; }

  /* ---------------- CSS ---------------- */
  var CSS = [
    '#gm{position:fixed;inset:0;z-index:215;display:none;flex-direction:column;font-family:Georgia,serif;',
    'background:linear-gradient(180deg,#4a2333 0%,#3a1c30 42%,#25332a 100%);}',
    '#gm.on{display:flex;}',
    '.gm-head{margin:12px 14px 6px;background:#2b1a24;border-radius:22px;display:flex;align-items:center;',
    'padding:10px 12px;box-shadow:0 4px 14px rgba(20,8,14,.45);flex:none;}',
    '.gm-head button{background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.22);color:#f3ddab;',
    'width:38px;height:38px;border-radius:50%;font-size:19px;font-family:Georgia,serif;cursor:pointer;flex:none;}',
    '.gm-title{flex:1;text-align:center;color:#f3ddab;font-size:21px;letter-spacing:.5px;}',
    '.gm-scroll{flex:1;overflow-y:auto;padding:6px 16px 24px;touch-action:pan-y;-webkit-overflow-scrolling:touch;}',
    '.gm-card{background:#f8f1e3;border-radius:22px;padding:20px 18px 18px;margin:0 0 16px;position:relative;',
    'box-shadow:0 8px 26px rgba(20,8,14,.45);border:2px solid rgba(232,182,76,.5);}',
    '.gm-card h2{font-size:21px;color:#3a2415;margin:0 0 6px;font-weight:700;}',
    '.gm-card .gm-sub{font-size:13.5px;color:#a0762e;font-style:italic;margin-bottom:12px;line-height:1.5;}',
    '.gm-marquee{background:#2b1a24;border:2px solid rgba(232,200,122,.5);border-radius:16px;',
    'padding:8px 12px 10px;text-align:center;color:#ffd97a;letter-spacing:3px;font-size:14px;margin-bottom:12px;}',
    '.gm-marquee::before,.gm-marquee::after{content:"";display:block;height:8px;margin:0 4px 8px;border-radius:4px;',
    'background-image:radial-gradient(circle,#ffe9a8 2.5px,rgba(255,233,168,0) 3px);',
    'background-size:16px 8px;background-repeat:repeat-x;opacity:.9;}',
    '.gm-marquee::after{margin:8px 4px 0;}',
    '.gm-screenwrap{background:#160a12;border:2px solid rgba(232,200,122,.45);border-radius:18px;padding:10px;',
    'box-shadow:inset 0 0 30px rgba(0,0,0,.6),0 6px 20px rgba(20,8,14,.4);margin-bottom:12px;}',
    '#gmScreen{width:100%;display:block;border-radius:10px;}',
    '.gm-row{display:flex;align-items:center;gap:10px;margin-bottom:10px;}',
    '.gm-btn{flex:1;border:none;border-radius:26px;padding:14px 0;font-family:Georgia,serif;font-size:19px;',
    'font-weight:700;color:#5a2c0c;cursor:pointer;background:linear-gradient(180deg,#ffe9b0,#e8a93e);',
    'box-shadow:0 4px 14px rgba(200,140,40,.5);}',
    '.gm-btn:active{transform:scale(.97);}',
    '.gm-btn.ghost{background:rgba(90,60,30,.12);color:#6b4a2e;box-shadow:none;border:1.5px solid rgba(160,118,46,.5);}',
    '.gm-sync{flex:none;font-size:13px;font-style:italic;padding:8px 14px;border-radius:18px;',
    'background:rgba(90,60,30,.12);color:#8a6a3e;border:1px solid rgba(160,118,46,.4);white-space:nowrap;}',
    '.gm-sync.live{background:rgba(46,80,50,.18);color:#2e5a34;border-color:rgba(90,160,100,.55);}',
    '.gm-note{font-size:13px;color:#a0762e;font-style:italic;line-height:1.6;text-align:center;margin:4px 2px 0;}',
    '.gm-score{background:#2b1a24;border-radius:16px;padding:14px;margin-bottom:10px;text-align:center;}',
    '.gm-score .gm-together{color:#f3ddab;font-size:15px;font-style:italic;margin-bottom:2px;}',
    '.gm-score .gm-bignum{color:#ffd97a;font-size:42px;font-weight:700;line-height:1.1;}',
    '.gm-score .gm-bysplit{color:#c9a86a;font-size:13px;font-style:italic;margin-top:4px;}',
    '.gm-banked{text-align:center;color:#a0762e;font-size:13.5px;font-style:italic;margin:8px 0 2px;}',
    '.gm-rules{font-size:14.5px;line-height:1.65;color:#6b4a2e;margin-bottom:12px;}',
    '.gm-hud{position:fixed;top:58px;left:50%;transform:translateX(-50%);z-index:205;display:none;',
    'align-items:center;gap:8px;background:rgba(30,15,18,.88);border:1.5px solid rgba(232,200,122,.55);',
    'color:#ffd97a;font-family:Georgia,serif;font-size:16px;font-weight:700;padding:10px 20px;border-radius:24px;',
    'box-shadow:0 4px 16px rgba(20,8,14,.5);cursor:pointer;white-space:nowrap;}',
    '.gm-hud .gm-dot{width:9px;height:9px;border-radius:50%;background:#ffe9a8;',
    'box-shadow:0 0 8px 2px rgba(255,233,168,.8);animation:gmpulse 1.6s ease-in-out infinite;}',
    '@keyframes gmpulse{0%,100%{transform:scale(1);opacity:1;}50%{transform:scale(.7);opacity:.6;}}',
    '.gm-ptoast{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);background:rgba(30,15,18,.9);',
    'color:#f7e6c4;font-size:14px;padding:10px 20px;border-radius:18px;opacity:0;transition:opacity .3s;',
    'pointer-events:none;white-space:nowrap;z-index:6;}',
    '.gm-ptoast.show{opacity:1;}',
    '#gmQaLog{display:none;}'
  ].join('\n');

  /* ---------------- DOM helpers ---------------- */
  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var partnerTimer = 0;
  function partnerToast(msg, ms) {
    if (!els.ptoast) return;
    clearTimeout(partnerTimer);
    els.ptoast.textContent = msg;
    els.ptoast.classList.add('show');
    partnerTimer = setTimeout(function () { els.ptoast.classList.remove('show'); }, ms || 2400);
  }

  /* ---------------- theatre screen (stub) ---------------- */
  var scrStars = [];
  (function () {
    for (var i = 0; i < 55; i++) {
      scrStars.push({ x: Math.random(), y: Math.random() * 0.72, r: 1 + Math.random() * 2.2,
                      ph: Math.random() * 6.28, sp: 0.8 + Math.random() * 2.2 });
    }
  })();
  function roundRectPath(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function drawScreen() {
    var c = els.screen;
    if (!c) return;
    var g = c.getContext('2d');
    var W = c.width, H = c.height, t = performance.now() / 1000;
    var bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#150a11'); bg.addColorStop(0.65, '#2c1520'); bg.addColorStop(1, '#40201f');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    var i, s;
    for (i = 0; i < scrStars.length; i++) {
      s = scrStars[i];
      g.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(t * s.sp + s.ph));
      g.fillStyle = '#ffe9b0';
      g.fillRect(s.x * W, s.y * H, s.r, s.r);
    }
    g.globalAlpha = 1;
    // campfire glow along the bottom, gently flickering
    var fl = 0.72 + 0.20 * Math.sin(t * 7.3) + 0.08 * Math.sin(t * 13.1 + 1.2);
    var gg = g.createRadialGradient(W / 2, H + 26, 6, W / 2, H + 26, 130);
    gg.addColorStop(0, 'rgba(255,176,92,' + (0.55 * fl).toFixed(3) + ')');
    gg.addColorStop(0.5, 'rgba(230,120,60,' + (0.22 * fl).toFixed(3) + ')');
    gg.addColorStop(1, 'rgba(230,120,60,0)');
    g.fillStyle = gg; g.fillRect(0, 0, W, H);
    // vignette
    var vg = g.createRadialGradient(W / 2, H / 2, 24, W / 2, H / 2, 200);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,4,8,0.6)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    // title card
    g.fillStyle = 'rgba(248,241,227,0.95)';
    roundRectPath(g, W / 2 - 118, H / 2 - 36, 236, 72, 12); g.fill();
    g.strokeStyle = 'rgba(160,118,46,.6)'; g.lineWidth = 1.5;
    roundRectPath(g, W / 2 - 110, H / 2 - 28, 220, 56, 9); g.stroke();
    g.textAlign = 'center';
    g.fillStyle = '#a0762e'; g.font = 'italic 13px Georgia';
    g.fillText("tonight's feature:", W / 2, H / 2 - 6);
    g.fillStyle = '#7a3f10'; g.font = '700 21px Georgia';
    g.fillText('our sky \u2726', W / 2, H / 2 + 20);
    if (!TH.playing) {
      g.fillStyle = 'rgba(10,5,8,0.55)'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#f3ddab'; g.font = 'italic 15px Georgia';
      g.fillText('paused \u2726', W / 2, H / 2 + 52);
    }
  }
  function screenLoop() {
    if (!opened) { screenRaf = 0; return; }
    drawScreen();
    screenRaf = requestAnimationFrame(screenLoop);
  }

  function theatrePlay() {
    TH.playing = true; TH.sessions++; saveState();
    renderTheatre();
    clearTimeout(thTimer);
    thTimer = setTimeout(function () { partnerToast('Tara settled in with popcorn \u2661'); }, 1400);
  }
  function theatrePause() {
    TH.playing = false;
    renderTheatre();
    clearTimeout(thTimer);
    partnerToast('paused together \u2726');
  }

  /* ---------------- firefly catch ---------------- */
  function respawnFirefly(f, kk) {
    var k = Math.random() < 0.5 ? kk.player : kk.partner;
    var a = Math.random() * 6.283, r = 260 + Math.random() * 260;
    f.x = Math.max(20, Math.min(MAP_W - 20, k.x + Math.cos(a) * r));
    f.y = Math.max(20, Math.min(MAP_H - 20, k.y + Math.sin(a) * r));
    f.dx = (Math.random() - 0.5) * 14; f.dy = (Math.random() - 0.5) * 10;
    f.cool = 1.4;   // grace period so it can't be instantly re-caught
  }

  function catchFirefly(f, by) {
    if (FF.caught >= FF_MAX) return;
    var kk = k2d(); if (!kk) return;
    var w = kk.world;
    w.burst(f.x, f.y - 8, '#ffe9a8', 9);
    w.burst(f.x, f.y - 8, '#ffc2d1', 5);
    FF.caught++;
    if (by === 'tara') FF.byTara++; else FF.byAdi++;
    saveState();
    respawnFirefly(f, kk);
    if (FF.caught >= FF_MAX && !FF.fullNotified) {
      FF.fullNotified = true;
      w.toast('lanterns full \u2014 release them! \u2726', 2600);
    }
    updateHud();
    if (opened) renderFF();
  }

  function startCatch() {
    if (FF.active) return;
    FF.active = true; FF.aiT = 0;
    saveState();
    close();   // reveal the world; the HUD pill carries the score
    if (els.hud) els.hud.style.display = 'flex';
    updateHud();
    var kk = k2d();
    if (kk) kk.world.toast('catch fireflies together \u2726 walk through them, or tap one near a keeper', 3000);
  }
  function stopCatch() {
    FF.active = false;
    if (els.hud) els.hud.style.display = 'none';
    if (opened) renderFF();
  }

  function releaseLanterns() {
    var kk = k2d(); if (!kk) return;
    var w = kk.world, n = FF.caught;
    if (n <= 0) return;
    var keepers = [kk.player, kk.partner];
    for (var i = 0; i < keepers.length; i++) {
      var k = keepers[i];
      w.burst(k.x, k.y - 30, '#ffe9a8', 18);
      w.burst(k.x, k.y - 30, '#ffc2d1', 10);
      w.burst(k.x, k.y - 30, '#fff6d8', 10);
    }
    w.addStars(n);
    FF.banked += n; FF.caught = 0; FF.byAdi = 0; FF.byTara = 0; FF.fullNotified = false;
    saveState();
    w.toast(n + ' \u2726 banked as stars \u2014 the night glows brighter', 3000);
    if (window.WarmthUI) WarmthUI.onFireflyRelease(n);   // M6: celebration burst + card
    updateHud();
    if (opened) renderFF();
  }

  /* per-frame, called from game.js update() — no per-frame allocation */
  function tick(dt) {
    if (!FF.active) return;
    var kk = k2d(); if (!kk) return;
    var P = kk.player, Q = kk.partner, fl = kk.world.fireflies;
    var i, f, dp, dq;
    for (i = 0; i < fl.length; i++) {
      f = fl[i];
      if (f.cool > 0) { f.cool -= dt; continue; }
      dp = Math.hypot(f.x - P.x, f.y - P.y);
      dq = Math.hypot(f.x - Q.x, f.y - Q.y);
      if (dp < AUTO_CATCH_R || dq < AUTO_CATCH_R) catchFirefly(f, dp <= dq ? 'adi' : 'tara');
    }
    // Tara AI: drift toward the nearest firefly so she catches her share
    FF.aiT -= dt;
    if (FF.aiT <= 0) {
      FF.aiT = 1.4;
      var holdActive = kk.holdActive ? kk.holdActive() : false;
      var ritualBusy = !!(window.BeaconRitual && BeaconRitual.isActive());
      if (!holdActive && !ritualBusy && !Q.ritualGlide) {
        var best = null, bd = 420;
        for (i = 0; i < fl.length; i++) {
          f = fl[i];
          if (f.cool > 0) continue;
          var d = Math.hypot(f.x - Q.x, f.y - Q.y);
          if (d < bd) { bd = d; best = f; }
        }
        if (best) { Q.tx = best.x; Q.ty = best.y; Q.waitT = 1.6; }
      }
    }
  }

  /* world tap → catch a firefly near either keeper. true = consumed. */
  function tapWorld(x, y) {
    if (opened || !FF.active || FF.caught >= FF_MAX) return false;
    var kk = k2d(); if (!kk) return false;
    var m = kk.world.screenToWorld(x, y);
    var fl = kk.world.fireflies, P = kk.player, Q = kk.partner;
    for (var i = 0; i < fl.length; i++) {
      var f = fl[i];
      if (f.cool > 0) continue;
      if (Math.hypot(m.x - f.x, m.y - f.y) < TAP_HIT_R) {
        var dp = Math.hypot(f.x - P.x, f.y - P.y);
        var dq = Math.hypot(f.x - Q.x, f.y - Q.y);
        if (Math.min(dp, dq) < KEEPER_NEAR_R) {
          catchFirefly(f, dp <= dq ? 'adi' : 'tara');
          return true;
        }
      }
    }
    return false;
  }

  function updateHud() {
    if (!els.hud) return;
    els.hudCount.textContent = FF.caught >= FF_MAX
      ? 'lanterns full \u2014 release! \u2726'
      : 'together: ' + FF.caught + ' \u2726';
  }

  /* ---------------- DOM ---------------- */
  function buildDom() {
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);

    var root = el('div'); root.id = 'gm';

    var head = el('div', 'gm-head');
    var back = el('button', 'gm-back', '&#8592;');
    var title = el('div', 'gm-title', '\u2726 Games \u2726');
    var closeB = el('button', 'gm-close', '\u2715');
    head.appendChild(back); head.appendChild(title); head.appendChild(closeB);

    var scroll = el('div', 'gm-scroll');

    // ---- theatre section ----
    var th = el('section', 'gm-card');
    th.appendChild(el('div', 'gm-marquee', '\u2726 THEATRE \u00b7 FOR TWO \u2726'));
    th.appendChild(el('h2', null, 'Theatre for two'));
    th.appendChild(el('div', 'gm-sub', 'a little candlelit screen, just for us'));
    var wrap = el('div', 'gm-screenwrap');
    var cv = document.createElement('canvas');
    cv.id = 'gmScreen'; cv.width = 320; cv.height = 168;
    wrap.appendChild(cv);
    th.appendChild(wrap);
    var row = el('div', 'gm-row');
    var playB = el('button', 'gm-btn', 'Play \u25b6');
    var sync = el('span', 'gm-sync', 'ready \u2726');
    row.appendChild(playB); row.appendChild(sync);
    th.appendChild(row);
    th.appendChild(el('div', 'gm-sessions gm-note', ''));
    th.appendChild(el('div', 'gm-note',
      'a gentle stub \u2014 the real watch-together arrives later \u2726'));
    scroll.appendChild(th);

    // ---- firefly catch section ----
    var ff = el('section', 'gm-card');
    ff.appendChild(el('h2', null, 'Firefly catch'));
    ff.appendChild(el('div', 'gm-sub', 'a co-op night game \u2014 no losing, only glowing'));
    ff.appendChild(el('div', 'gm-rules',
      'The island\u2019s fireflies are out. Catch them <b>together</b>: walk a keeper ' +
      'through one, or tap a firefly drifting near either of you. ' +
      'Tara catches her share too. At <b>20</b>, your lanterns are full \u2014 ' +
      'release them in a burst and bank them as stars.'));
    var score = el('div', 'gm-score',
      '<div class="gm-together">together</div>' +
      '<div class="gm-bignum">0 \u2726</div>' +
      '<div class="gm-bysplit"></div>');
    ff.appendChild(score);
    var row2 = el('div', 'gm-row');
    var goB = el('button', 'gm-btn', '');
    var relB = el('button', 'gm-btn ghost', 'Release \u2726');
    row2.appendChild(goB); row2.appendChild(relB);
    ff.appendChild(row2);
    ff.appendChild(el('div', 'gm-banked', ''));
    ff.appendChild(el('div', 'gm-note',
      'Here, Tara is your island AI \u2014 she wanders and catches beside you, imagined for now \u2726'));
    scroll.appendChild(ff);

    scroll.appendChild(el('div', 'gm-note',
      'Every game here is co-op: the win always belongs to the pair \u2661'));

    var ptoast = el('div', 'gm-ptoast');
    var qalog = el('div'); qalog.id = 'gmQaLog';

    root.appendChild(head); root.appendChild(scroll);
    root.appendChild(ptoast); root.appendChild(qalog);
    document.body.appendChild(root);

    // HUD pill (world view, firefly active)
    var hud = el('div', 'gm-hud', '<span class="gm-dot"></span><span class="gm-hudcount"></span>');
    hud.style.display = 'none';
    hud.addEventListener('click', function () { open(); });
    document.body.appendChild(hud);

    els = { root: root, scroll: scroll, ptoast: ptoast, qalog: qalog,
            playB: playB, sync: sync, sess: th.querySelector('.gm-sessions'),
            score: score, goB: goB, relB: relB,
            banked: ff.querySelector('.gm-banked'),
            bignum: score.querySelector('.gm-bignum'),
            bysplit: score.querySelector('.gm-bysplit'),
            screen: cv, hud: hud, hudCount: hud.querySelector('.gm-hudcount') };

    playB.addEventListener('click', function () { TH.playing ? theatrePause() : theatrePlay(); });
    goB.addEventListener('click', function () { FF.active ? stopCatch() : startCatch(); });
    relB.addEventListener('click', releaseLanterns);
    back.addEventListener('click', close);
    closeB.addEventListener('click', close);
    updateHud();
  }

  function renderTheatre() {
    if (!els.playB) return;
    els.playB.innerHTML = TH.playing ? 'Pause \u275a\u275a' : 'Play \u25b6';
    els.sync.textContent = TH.playing ? 'synced \u2726' : 'ready \u2726';
    els.sync.className = 'gm-sync' + (TH.playing ? ' live' : '');
    els.sess.textContent = TH.sessions
      ? TH.sessions + (TH.sessions === 1 ? ' cosy session shared' : ' cosy sessions shared') + ' \u2726'
      : 'press play and settle in together';
  }

  function renderFF() {
    if (!els.goB) return;
    els.bignum.innerHTML = FF.caught + ' \u2726';
    els.bysplit.textContent = (FF.byAdi || FF.byTara)
      ? 'Adi caught ' + FF.byAdi + ' \u00b7 Tara caught ' + FF.byTara
      : 'not started yet \u2014 the night is waiting';
    els.goB.textContent = FF.active ? 'Rest for now' : 'Catch together \u2726';
    els.goB.className = 'gm-btn' + (FF.active ? ' ghost' : '');
    var full = FF.caught >= FF_MAX;
    els.relB.style.display = full ? '' : 'none';
    els.relB.textContent = 'Release ' + FF.caught + ' \u2726';
    els.banked.textContent = FF.banked
      ? FF.banked + ' \u2726 banked as stars so far \u2014 the island glows brighter'
      : 'release a full lantern to bank stars';
  }

  /* ---------------- open / close ---------------- */
  function open() {
    if (!els.root) buildDom();
    loadState();
    opened = true;
    els.root.classList.add('on');
    if (els.hud) els.hud.style.display = 'none';
    renderTheatre();
    renderFF();
    els.scroll.scrollTop = 0;
    if (!screenRaf) screenRaf = requestAnimationFrame(screenLoop);
  }
  function close() {
    opened = false;
    clearTimeout(thTimer);
    clearTimeout(partnerTimer);
    if (els.root) els.root.classList.remove('on');
    if (FF.active && els.hud) els.hud.style.display = 'flex';
  }

  /* QA hooks (invisible in normal use):
     #games=1          → opens the games hub
     #gamestheatre=1   → opens hub + starts theatre playing
     #gamesff=1        → starts firefly catch (overlay closes, HUD shows),
                         teleports the player onto a firefly so auto-catch fires
     #gamesclear=1     → clears kanavu.games.v1 first */
  function qaLog(msg) {
    if (els.qalog) els.qalog.textContent = msg;
    document.title = 'GAMESQA:' + msg;
  }
  var hashTries = 0;
  function hashCheck() {
    var h = location.hash;
    if (h.indexOf('gamesclear=1') >= 0) {
      try { localStorage.removeItem(LS_KEY); } catch (e) {}
    }
    if (h.indexOf('gamestheatre=1') >= 0) {
      open(); theatrePlay(); qaLog('theatre-playing'); return;
    }
    if (h.indexOf('gamesff=1') >= 0) {
      open(); startCatch(); qaLog('firefly-active');
      setTimeout(function () {
        var kk = window.__kanavu2d;
        if (kk && kk.world && kk.world.fireflies.length) {
          var f = kk.world.fireflies[0];
          f.cool = 0;
          kk.teleport(f.x, f.y);
        }
      }, 600);
      return;
    }
    if (h.indexOf('gamesff20=1') >= 0 || h.indexOf('gamesffrel=1') >= 0) {
      var doRelease = h.indexOf('gamesffrel=1') >= 0;
      open(); startCatch();
      setTimeout(function () {
        var kk = window.__kanavu2d;
        if (kk && kk.world) {
          var fl = kk.world.fireflies;
          for (var i = 0; i < FF_MAX && i < fl.length; i++) {
            fl[i].cool = 0;
            catchFirefly(fl[i], i % 2 ? 'tara' : 'adi');
          }
          if (doRelease) releaseLanterns();
          open();   // hub shows the release button / banked line
          els.scroll.scrollTop = els.scroll.scrollHeight;   // QA: show the firefly section
          qaLog(doRelease ? 'firefly-released' : 'firefly-full');
        }
      }, 800);
      return;
    }
    if (h.indexOf('games=1') < 0) return;
    if (document.readyState === 'complete' || document.readyState === 'interactive') open();
    else if (++hashTries < 40) setTimeout(hashCheck, 300);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(hashCheck, 400); });
  } else {
    setTimeout(hashCheck, 400);
  }

  /* exposed for QA (parent agent / screenshots only) */
  function _testState() {
    return { ff: JSON.parse(JSON.stringify(FF)), th: JSON.parse(JSON.stringify(TH)) };
  }

  return {
    open: open, close: close, isOpen: function () { return opened; },
    tick: tick, tapWorld: tapWorld,
    startCatch: startCatch, stopCatch: stopCatch, releaseLanterns: releaseLanterns,
    theatrePlay: theatrePlay, theatrePause: theatrePause,
    _testState: _testState
  };
})();

window.GamesUI = GamesUI;
