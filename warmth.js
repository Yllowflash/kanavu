/* ============================================================
   Kanavu — Warmth Pass (Milestone 6, FINAL)
   Loads AFTER memories.js, BEFORE game.js.

   1. Synchronized heartbeat: while holding hands on the bridge, a
      "tap in rhythm" prompt appears — tapping in time with the
      lub-dub beat (1.1s cycle, beats at 0 and 0.308s, same as the
      ring render in game.js) fills a warmth meter. On-beat taps bloom
      a brighter warm wash over both keepers (via WarmthUI.glowBoost,
      consumed by game.js drawChar). Off-beat taps: no fill, no penalty.
      Meter fills → heart burst, +2 stars (GDD §6: 1 ⭐ each), toast,
      celebration card. Meter decays slowly without taps.
   2. Notes as gifts: WarmthUI.openNotes() — a warm letter panel —
      sends through the M5 gift pipeline (MemoriesUI.sendNoteGift) and
      appears as a floating envelope on Tara's island. Reachable from
      the floating ✉ button and from the Memories hub.
   3. Date-ideas deck: 20 genuine Adi & Tara date ideas registered into
      the M2 deck system via DecksUI.registerDeck.
   4. Celebrations: streak milestones 7/30/100 (polled from
      window.__beacon.state(), throttled — never per-frame), warmth
      completion, and firefly release (hooked in games.js
      releaseLanterns) all share one burst + overlay-card language.
      Celebrated milestones persist in localStorage kanavu.warmth.v1.

   GDD source of truth: §3.5 (hold-hands heartbeat), §3.6 (notes as
   gifts), §3.7 (date ideas deck), §6 (economy). Cozy rules: no fail
   states, no punishing timers.

   Demo honesty note: the partner (Tara) is simulated in this demo —
   her rhythm "presence" and her note reactions are the island AI,
   not the real Tara.
   ============================================================ */
'use strict';

var WarmthUI = (function () {

  /* ---------------- persistence ---------------- */
  var LS_KEY = 'kanavu.warmth.v1';
  var store = { celebrated: {} };
  (function loadStore() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && p.celebrated && typeof p.celebrated === 'object') store.celebrated = p.celebrated;
      }
    } catch (e) { /* fresh start */ }
  })();
  function saveStore() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch (e) {}
  }

  /* ---------------- heartbeat rhythm state ----------------
     No per-frame allocations: plain numbers + one small ripple pool. */
  var BEAT_CYC = 1.1;        // matches the ring cycle in game.js draw()
  var BEAT2 = 0.308;         // the "dub" (0.28 * 1.1)
  var BEAT_WIN = 0.16;       // on-beat window, seconds either side
  var TAP_FILL = 0.17;       // ~6 on-beat taps fill the meter
  var DECAY = 0.035;         // meter decay per second without taps
  var HOLD_MAX_T = 6;        // hold-hands window in game.js (informational)

  var rh = {
    meter: 0, glow: 0, lastBeat: -1,
    lastK: -1, lastPh: 0, beatPulse: 0,
    celebrateT: 0, ripples: [], msT: 0,
    mailShown: false
  };

  function hh() {
    try { return (typeof holdHands !== 'undefined') ? holdHands : null; } catch (e) { return null; }
  }
  function k2d() { return window.__kanavu2d || null; }
  function world() { var k = k2d(); return k ? k.world : null; }

  function beginHold() {
    rh.meter = 0; rh.glow = 0; rh.lastBeat = -1;
    rh.lastK = -1; rh.lastPh = 0; rh.beatPulse = 0;
    rh.celebrateT = 0; rh.ripples.length = 0;
  }

  function ageRipples(dt) {
    for (var i = rh.ripples.length - 1; i >= 0; i--) {
      var r = rh.ripples[i];
      r.t += dt;
      if (r.t > 0.45) rh.ripples.splice(i, 1);
    }
  }

  function heartbeatTick(dt) {
    updateMailBtn();

    // streak milestones — throttled: __beacon.state() allocates, never call per-frame
    rh.msT += dt;
    if (rh.msT >= 1) { rh.msT = 0; checkMilestones(); }

    var H = hh();
    var active = !!(H && H.active);
    if (!active) {
      if (rh.meter !== 0 || rh.glow !== 0) { rh.meter = 0; rh.glow = 0; }
      rh.celebrateT = 0;
      ageRipples(dt);
      return;
    }
    var t = H.t;

    // beat-crossing detection for the prompt pill pulse
    var k = Math.floor(t / BEAT_CYC), ph = t - k * BEAT_CYC;
    if (rh.lastK < 0) { rh.lastK = k; rh.lastPh = ph; }
    else {
      if (k !== rh.lastK || ph < rh.lastPh) { rh.beatPulse = 1; rh.lastK = k; }
      else if (rh.lastPh < BEAT2 && ph >= BEAT2) { rh.beatPulse = 1; }
      rh.lastPh = ph;
    }
    rh.beatPulse = Math.max(0, rh.beatPulse - dt * 3);
    rh.glow = Math.max(0, rh.glow - dt * 1.1);

    if (rh.celebrateT > 0) {
      rh.celebrateT -= dt;
    } else {
      rh.meter = Math.max(0, rh.meter - dt * DECAY);
      if (rh.meter >= 1) onMeterFull();
    }
    ageRipples(dt);
  }

  /* Tap anywhere on the canvas (below the top bar) while holding hands.
     Returns true when consumed. On-beat → fill + glow; off-beat → a
     soft ripple only. Never punitive. */
  function rhythmTap(x, y) {
    var H = hh();
    if (!H || !H.active) return false;
    if (y < 70) return false;   // top bar / pause zone belongs to canvas UI
    var t = H.t;
    var k = Math.floor(t / BEAT_CYC), ph = t - k * BEAT_CYC;
    var d0 = ph < 0.55 ? ph : BEAT_CYC - ph;
    var d1 = ph > BEAT2 ? ph - BEAT2 : BEAT2 - ph;
    var onBeatSide = d0 <= d1;
    var id = onBeatSide ? k * 2 : k * 2 + 1;
    var d = onBeatSide ? d0 : d1;
    if (d <= BEAT_WIN && id !== rh.lastBeat) {
      rh.lastBeat = id;
      rh.meter = Math.min(1, rh.meter + TAP_FILL);
      rh.glow = 1;
      rh.beatPulse = 1;
    } else if (rh.ripples.length < 6) {
      rh.ripples.push({ x: x, y: y, t: 0 });
    }
    return true;
  }

  /* Extra warm-sprite wash alpha, consumed by game.js drawChar().
     Baseline 0.25 while holding so the pair always feels candlelit. */
  function glowBoost() {
    var H = hh();
    var base = (H && H.active) ? 0.25 : 0;
    var g = rh.glow > base ? rh.glow : base;
    return g > 1.2 ? 1.2 : g;
  }

  function onMeterFull() {
    rh.meter = 0; rh.celebrateT = 2.8; rh.glow = 1.2;
    var kk = k2d(), w = world();
    if (kk && w) {
      var mx = (kk.player.x + kk.partner.x) / 2;
      var my = (kk.player.y + kk.partner.y) / 2 - 30;
      w.burst(mx, my, '#ffd97a', 24);
      w.burst(mx, my, '#ff9db0', 14);
      w.burst(mx, my, '#fff6d8', 10);
      w.addStars(2);   // GDD §6: holding hands 1 ⭐ each
      w.toast('your hearts beat as one ✦', 2800);
    }
    showCelebration('your hearts beat as one ✦', 'a warm moment, kept in today');
  }

  /* ---------------- canvas: rhythm prompt + meter ---------------- */
  function rrC(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawRhythm(ctx, hx, hy, s, now) {
    var t = now / 1000;
    // celebration heart bloom
    if (rh.celebrateT > 0) {
      var ca = rh.celebrateT > 1.2 ? 1 : rh.celebrateT / 1.2;
      var cp = 1 + Math.sin(t * 6) * 0.08;
      ctx.save();
      ctx.globalAlpha = ca;
      ctx.translate(hx, hy - 64 * s);
      ctx.scale(cp, cp);
      ctx.font = '700 ' + Math.round(46 * s) + 'px Georgia';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ff8fa3';
      ctx.fillText('\u2665', 0, 0);
      ctx.restore();
      ctx.textAlign = 'left';
    }
    // parchment prompt pill above the pair
    var pw = 172, phh = 58;
    var px = hx - pw / 2, py = hy - 168;
    var pulse = 0.5 + rh.beatPulse * 0.5;
    ctx.fillStyle = 'rgba(46,22,16,0.78)';
    rrC(ctx, px, py, pw, phh, 14); ctx.fill();
    ctx.strokeStyle = 'rgba(255,210,130,' + (0.45 + 0.4 * pulse).toFixed(3) + ')';
    ctx.lineWidth = 1.5;
    rrC(ctx, px, py, pw, phh, 14); ctx.stroke();
    ctx.fillStyle = '#f3ddab';
    ctx.font = '600 13px Georgia'; ctx.textBaseline = 'middle';
    var label = 'tap in rhythm \u2661';
    var lw = ctx.measureText(label).width;
    ctx.fillText(label, hx - lw / 2, py + 15);
    // warmth meter bar
    var bw = 130, bh = 8, bx = hx - bw / 2, by = py + 32;
    ctx.fillStyle = 'rgba(255,235,190,0.18)';
    rrC(ctx, bx, by, bw, bh, 4); ctx.fill();
    if (rh.meter > 0.01) {
      ctx.fillStyle = '#f0b95a';
      rrC(ctx, bx, by, Math.max(8, bw * rh.meter), bh, 4); ctx.fill();
    }
    ctx.font = '11px Georgia'; ctx.fillStyle = '#ff9db0';
    ctx.fillText('\u2665', bx + bw + 6, by + 4.5);
    // off-beat tap ripples (acknowledged, never punished)
    for (var i = 0; i < rh.ripples.length; i++) {
      var r = rh.ripples[i];
      var ra = 0.5 - r.t * 1.4;
      if (ra <= 0) continue;
      ctx.strokeStyle = 'rgba(255,220,160,' + ra.toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(r.x, r.y, 6 + r.t * 46, 0, 6.29); ctx.stroke();
    }
  }

  /* ---------------- celebrations (shared burst language) ---------------- */
  function celebrate(title, sub) {
    var kk = k2d(), w = world();
    var cxm = 500, cym = 1000;
    if (kk) {
      cxm = (kk.player.x + kk.partner.x) / 2;
      cym = (kk.player.y + kk.partner.y) / 2 - 40;
    }
    if (w) {
      w.burst(cxm, cym, '#ffd97a', 26);
      w.burst(cxm, cym, '#ff9db0', 16);
      w.burst(cxm, cym, '#fff6d8', 12);
    }
    showCelebration(title, sub);
  }

  var MILESTONES = [7, 30, 100];
  var lastSeenStreak = -1;
  function checkMilestones() {
    if (!window.__beacon) return;
    var st;
    try { st = window.__beacon.state(); } catch (e) { return; }
    if (!st || !st.derived) return;
    var n = st.derived.streak;
    if (lastSeenStreak < 0) { lastSeenStreak = n; }
    for (var i = 0; i < MILESTONES.length; i++) {
      var m = MILESTONES[i];
      if (n >= m && lastSeenStreak < m && !store.celebrated[m]) {
        store.celebrated[m] = Date.now();
        saveStore();
        var w = world();
        if (w) w.toast(m + ' nights of light \u2726', 3000);
        celebrate(m + ' nights of light \u2726', 'your beacon streak glows on');
      }
    }
    lastSeenStreak = n;
  }

  function onFireflyRelease(n) {
    var nn = Math.max(0, Math.floor(+n || 0));
    celebrate('lanterns released \u2726',
      nn > 0 ? nn + ' fireflies banked as stars' : 'the night glows brighter');
  }

  /* ---------------- DOM: shared pieces ---------------- */
  var els = {};
  var cssDone = false;

  var CSS = [
    /* floating mail button near the top bar */
    '#wm-mail{position:fixed;top:12px;left:150px;z-index:120;width:38px;height:38px;border-radius:50%;',
    'background:#f8f1e3;border:1.5px solid rgba(200,150,60,.8);box-shadow:0 3px 10px rgba(20,8,14,.55);',
    'display:none;align-items:center;justify-content:center;cursor:pointer;padding:0;',
    'color:#7a2e10;font-size:18px;font-family:Georgia,serif;}',
    '#wm-mail:active{transform:scale(.94);}',
    /* notes panel */
    '#wm-notes{position:fixed;inset:0;z-index:235;display:none;align-items:center;justify-content:center;',
    'background:rgba(24,10,16,.66);font-family:Georgia,serif;padding:26px;}',
    '#wm-notes.on{display:flex;}',
    '.wm-ncard{background:#f8f1e3;border-radius:24px;padding:28px 24px 22px;max-width:330px;width:100%;',
    'text-align:center;border:2px solid rgba(232,182,76,.6);box-shadow:0 12px 44px rgba(0,0,0,.6);',
    'position:relative;animation:wmpop .45s cubic-bezier(.2,1.4,.4,1);}',
    '@keyframes wmpop{0%{opacity:0;transform:scale(.85);}100%{opacity:1;transform:none;}}',
    '.wm-ncard::before{content:"";position:absolute;inset:9px;border:1px solid rgba(160,118,46,.35);',
    'border-radius:16px;pointer-events:none;}',
    '.wm-ntitle{font-size:21px;font-weight:700;color:#3a2415;margin-bottom:2px;}',
    '.wm-nsub{font-size:13px;font-style:italic;color:#a0762e;margin-bottom:14px;line-height:1.5;}',
    '.wm-ncard textarea{width:100%;min-height:110px;border:1.5px solid rgba(160,118,46,.5);border-radius:14px;',
    'padding:12px 14px;font-family:Georgia,serif;font-style:italic;font-size:16.5px;line-height:1.6;',
    'color:#3a2415;background:#fffdf6;resize:vertical;}',
    '.wm-nsend{display:block;width:230px;margin:16px auto 0;border:none;border-radius:26px;padding:14px 0;',
    'font-family:Georgia,serif;font-size:17px;font-weight:700;color:#5a2c0c;cursor:pointer;',
    'background:linear-gradient(180deg,#ffe9b0,#e8a93e);box-shadow:0 4px 14px rgba(200,140,40,.5);}',
    '.wm-nsend:active{transform:scale(.97);}',
    '.wm-nlater{display:block;margin:10px auto 0;background:none;border:none;color:#a0762e;',
    'font-family:Georgia,serif;font-style:italic;font-size:14px;cursor:pointer;padding:6px 12px;}',
    /* celebration overlay card */
    '#wm-celeb{position:fixed;inset:0;z-index:240;display:none;align-items:center;justify-content:center;',
    'background:rgba(24,10,16,.55);font-family:Georgia,serif;padding:26px;}',
    '#wm-celeb.on{display:flex;}',
    '.wm-ccard{background:#f8f1e3;border-radius:24px;padding:32px 26px 24px;max-width:320px;width:100%;',
    'text-align:center;border:2px solid rgba(232,182,76,.65);box-shadow:0 14px 48px rgba(0,0,0,.65);',
    'position:relative;animation:wmpop .5s cubic-bezier(.2,1.4,.4,1);}',
    '.wm-ccard::before{content:"";position:absolute;inset:9px;border:1px solid rgba(160,118,46,.35);',
    'border-radius:16px;pointer-events:none;}',
    '.wm-cstars{color:#c8952e;font-size:20px;letter-spacing:6px;margin-bottom:10px;}',
    '.wm-ctitle{font-size:23px;font-weight:700;color:#3a2415;line-height:1.4;margin-bottom:6px;}',
    '.wm-csub{font-size:14.5px;font-style:italic;color:#7a5c33;line-height:1.6;margin-bottom:6px;}',
    '.wm-cclose{display:block;width:210px;margin:16px auto 0;border:none;border-radius:26px;padding:13px 0;',
    'font-family:Georgia,serif;font-size:16.5px;font-weight:700;color:#5a2c0c;cursor:pointer;',
    'background:linear-gradient(180deg,#ffe9b0,#e8a93e);box-shadow:0 4px 14px rgba(200,140,40,.5);}',
    '.wm-cclose:active{transform:scale(.97);}'
  ].join('\n');

  function ensureCss() {
    if (cssDone) return;
    cssDone = true;
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }

  function buildMailBtn() {
    if (els.mail) return;
    ensureCss();
    var b = el('button', null, '\u2709');
    b.id = 'wm-mail';
    b.setAttribute('aria-label', 'Write a note for Tara');
    b.title = 'write a note for Tara\u2019s island';
    b.addEventListener('click', function () { openNotes(); });
    document.body.appendChild(b);
    els.mail = b;
  }

  function uiOpen() {
    if (window.DecksUI && DecksUI.isOpen()) return true;
    if (window.GamesUI && GamesUI.isOpen()) return true;
    if (window.MemoriesUI && MemoriesUI.isOpen()) return true;
    if (els.notes && els.notes.classList.contains('on')) return true;
    if (els.celeb && els.celeb.classList.contains('on')) return true;
    return false;
  }
  function updateMailBtn() {
    if (!els.mail) return;
    var l = document.getElementById('loader');
    var show = !!(l && l.style.display === 'none') && !uiOpen();
    if (show !== rh.mailShown) {
      rh.mailShown = show;
      els.mail.style.display = show ? 'flex' : 'none';
    }
  }

  function buildNotesDom() {
    if (els.notes) return;
    ensureCss();
    var root = el('div'); root.id = 'wm-notes';
    var card = el('div', 'wm-ncard');
    card.appendChild(el('div', 'wm-ntitle', '\u2709 a note for Tara'));
    card.appendChild(el('div', 'wm-nsub',
      'sealed with love \u2014 it will appear as a floating envelope on her island'));
    var ta = el('textarea');
    ta.placeholder = 'write a little something\u2026';
    ta.setAttribute('aria-label', 'note text');
    var send = el('button', 'wm-nsend', 'Send to her island \u2726');
    var later = el('button', 'wm-nlater', 'not now');
    card.appendChild(ta); card.appendChild(send); card.appendChild(later);
    root.appendChild(card);
    root.addEventListener('click', function (e) { if (e.target === root) closeNotes(); });
    document.body.appendChild(root);
    send.addEventListener('click', sendNote);
    later.addEventListener('click', closeNotes);
    els.notes = root; els.noteText = ta;
  }

  function openNotes() {
    buildNotesDom();
    els.noteText.value = '';
    els.noteText.placeholder = 'write a little something\u2026';
    els.notes.classList.add('on');
    updateMailBtn();
    setTimeout(function () { try { els.noteText.focus(); } catch (e) {} }, 80);
  }
  function closeNotes() {
    if (els.notes) els.notes.classList.remove('on');
    updateMailBtn();
  }
  function sendNote() {
    var v = els.noteText.value.replace(/^\s+|\s+$/g, '');
    if (!v) {
      els.noteText.placeholder = 'write a little something first \u2661';
      return;
    }
    var ok = false;
    try {
      if (window.MemoriesUI && MemoriesUI.sendNoteGift) ok = !!MemoriesUI.sendNoteGift(v);
    } catch (e) { ok = false; }
    closeNotes();
    var w = world(), kk = k2d();
    if (w && kk) {
      if (ok) w.burst(kk.player.x, kk.player.y - 40, '#ffd97a', 14);
      w.toast(ok ? 'sealed with love \u2709 \u2014 waiting on Tara\u2019s island'
                 : 'the note drifted away\u2026 try again', 2600);
    }
  }

  function buildCelebDom() {
    if (els.celeb) return;
    ensureCss();
    var root = el('div'); root.id = 'wm-celeb';
    var card = el('div', 'wm-ccard');
    card.appendChild(el('div', 'wm-cstars', '\u2726 \u2726 \u2726'));
    var title = el('div', 'wm-ctitle');
    var sub = el('div', 'wm-csub');
    var closeB = el('button', 'wm-cclose', 'keep it close \u2661');
    card.appendChild(title); card.appendChild(sub); card.appendChild(closeB);
    root.appendChild(card);
    root.addEventListener('click', function (e) { if (e.target === root) closeCelebration(); });
    closeB.addEventListener('click', closeCelebration);
    document.body.appendChild(root);
    els.celeb = root; els.cTitle = title; els.cSub = sub;
  }
  function showCelebration(title, sub) {
    buildCelebDom();
    els.cTitle.textContent = title;
    els.cSub.textContent = sub;
    els.celeb.classList.add('on');
    updateMailBtn();
  }
  function closeCelebration() {
    if (els.celeb) els.celeb.classList.remove('on');
    updateMailBtn();
  }

  /* ---------------- date-ideas deck (M2 extension) ---------------- */
  var DATE_IDEAS = {
    id: 'date-ideas',
    title: 'Date Ideas',
    desc: 'Real evenings for Adi & Tara — some for tonight across the distance, some saved for someday.',
    cards: [
      { id: 'di-01', tag: 'together-online', text: 'Cook the same meal on a video call — same recipe, same time, race to plate up, then eat "together".' },
      { id: 'di-02', tag: 'together-online', text: 'Press play on Saiyaara at the exact same second — no talking till the credits, then call and debrief.' },
      { id: 'di-03', tag: 'together-online', text: 'Guitar evening: she plays a little, he plays a little, then teach each other one brand-new chord.' },
      { id: 'di-04', tag: 'together-online', text: 'Build a 10-song "us" playlist together on call — no skips allowed, defend every pick.' },
      { id: 'di-05', tag: 'together-online', text: 'Rewatch your favourite OK Kanmani scene and both act it out dramatically on camera.' },
      { id: 'di-06', tag: 'together-online', text: 'Read one chapter of a romance novel aloud to each other before bed — voices and all.' },
      { id: 'di-07', tag: 'together-online', text: 'Candlelight takeout date: same cuisine, candles lit, phones propped up, fancy like a restaurant.' },
      { id: 'di-08', tag: 'together-online', text: 'Ask the three questions you\u2019re scared to ask — honest answers only, no deflecting.' },
      { id: 'di-09', tag: 'tonight-apart', text: 'Stargaze at the same time and describe your sky to each other — hers over Tbilisi, his over Vancouver.' },
      { id: 'di-10', tag: 'tonight-apart', text: 'Bubble-tea run at the same moment in your own cities — compare orders and rate each other\u2019s picks.' },
      { id: 'di-11', tag: 'tonight-apart', text: 'Night-walk date: both stroll your own streets at sunset on video, narrating everything you see.' },
      { id: 'di-12', tag: 'tonight-apart', text: 'Draw each other from memory in five minutes, then reveal the portraits — no mercy, no flattery.' },
      { id: 'di-13', tag: 'tonight-apart', text: 'Slow dance to Aye Sinamika — phone propped up, dancing in your own rooms at the same time.' },
      { id: 'di-14', tag: 'tonight-apart', text: 'Write each other a love note and read it aloud without looking away from the camera.' },
      { id: 'di-15', tag: 'tonight-apart', text: 'Plan your dream apartment on paper — each draws a floor plan, then merge them into one.' },
      { id: 'di-16', tag: 'someday', text: 'A real teleport evening: ice cream, a long walk, her head on his shoulder, nowhere to be.' },
      { id: 'di-17', tag: 'someday', text: 'Bubble-tea showdown in person — finally settle whose order is actually better.' },
      { id: 'di-18', tag: 'someday', text: 'Find a guitar shop and play in the same room — the duet you\u2019ve only ever done over call.' },
      { id: 'di-19', tag: 'someday', text: 'Cook chicken wraps together in one kitchen — and argue about who does the dishes.' },
      { id: 'di-20', tag: 'someday', text: 'Watch a sunrise from a mountain viewpoint, wrapped in one jacket, saying absolutely nothing.' }
    ]
  };

  function registerDateDeck() {
    try {
      if (window.DecksUI && DecksUI.registerDeck) DecksUI.registerDeck(DATE_IDEAS);
    } catch (e) { /* decks stay at 3 — world still fine */ }
  }

  /* ---------------- QA hooks (hash-gated, invisible in normal use):
     #warmthhold=1  → teleport both keepers to the bridge, start hold-hands
     #warmthfill=1  → same, then force the warmth celebration (frozen for capture)
     #warmthnote=1  → send a note-gift, teleport near Tara's island
     #warmthdate=1  → open the Date Ideas deck card */
  function whenWorldReady(fn) {
    var n = 0;
    (function p() {
      var l = document.getElementById('loader');
      if ((l && l.style.display === 'none') || n > 60) fn();
      else { n++; setTimeout(p, 300); }
    })();
  }
  function qaHold(frozen) {
    var kk = k2d();
    if (!kk) return;
    kk.teleport(470, 1115);
    kk.partner.x = 560; kk.partner.y = 1115;
    kk.partner.tx = 560; kk.partner.ty = 1115;
    kk.partner.waitT = 99999;
    kk.pressContext();                       // bridge hotspot → Hold hands
    var H = hh();
    if (H && H.active) {
      H.t = -900;                            // keep the hold window open for capture
      if (frozen) {
        onMeterFull();
        rh.celebrateT = 999;                 // freeze the celebration heart for capture
      } else {
        rh.meter = 0.52; rh.glow = 0.9;      // QA preset: mid-fill meter + keeper glow
        rh.beatPulse = 1;
      }
    }
    document.title = 'WARMTHQA:hold' + (frozen ? ':fill' : '');
  }
  function qaNote() {
    try {
      if (window.MemoriesUI && MemoriesUI.sendNoteGift) {
        MemoriesUI.sendNoteGift('Adi here \u2014 look up at your sky tonight, kanmani. Same stars, same us. \u2661');
      }
    } catch (e) {}
    var kk = k2d();
    if (kk) kk.teleport(790, 990);            // her island, near the envelope spot
    document.title = 'WARMTHQA:note';
  }
  function qaDate() {
    try {
      if (window.DecksUI) {
        DecksUI.open();
        var btns = document.querySelectorAll('.dk-deck');
        for (var i = 0; i < btns.length; i++) {
          if (btns[i].textContent.indexOf('Date Ideas') >= 0) { btns[i].click(); break; }
        }
      }
    } catch (e) {}
    document.title = 'WARMTHQA:date';
  }
  var hashTries = 0;
  function hashCheck() {
    var h = location.hash;
    var wantHold = h.indexOf('warmthhold=1') >= 0;
    var wantFill = h.indexOf('warmthfill=1') >= 0;
    var wantNote = h.indexOf('warmthnote=1') >= 0;
    var wantDate = h.indexOf('warmthdate=1') >= 0;
    if (!wantHold && !wantFill && !wantNote && !wantDate) return;
    if (document.readyState !== 'complete' && document.readyState !== 'interactive') {
      if (++hashTries < 40) setTimeout(hashCheck, 300);
      return;
    }
    whenWorldReady(function () {
      if (wantHold || wantFill) qaHold(wantFill);
      if (wantNote) qaNote();
      if (wantDate) qaDate();
    });
  }

  /* ---------------- init ---------------- */
  function init() {
    buildMailBtn();
    registerDateDeck();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { setTimeout(hashCheck, 400); });
    } else {
      setTimeout(hashCheck, 400);
    }
  }
  init();

  return {
    beginHold: beginHold,
    heartbeatTick: heartbeatTick,
    rhythmTap: rhythmTap,
    drawRhythm: drawRhythm,
    glowBoost: glowBoost,
    openNotes: openNotes,
    closeNotes: closeNotes,
    onFireflyRelease: onFireflyRelease,
    _testState: function () {
      return { meter: +rh.meter.toFixed(3), glow: +rh.glow.toFixed(3),
               celebrated: JSON.parse(JSON.stringify(store.celebrated)) };
    }
  };
})();

window.WarmthUI = WarmthUI;
