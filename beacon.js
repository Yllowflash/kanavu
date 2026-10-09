/* ============================================================
   Kanavu — Beacon ritual + streaks (Milestone 3)
   Loads BEFORE game.js; game.js integration points:
     - doContextAction() beacon branch  -> BeaconRitual.begin()
     - update()                         -> BeaconRitual.update(dt)
     - hold-hands ring block in draw()   -> also renders when
                                            BeaconRitual.visualActive()
     - partner wander / player movement  -> paused via
                                            partner.ritualGlide and
                                            BeaconRitual.freezeInput()

   GDD §3.2 (source of truth): nightly ritual, streaks PAUSE
   (never shatter) on a missed night. Persistence:
   localStorage "kanavu.beacon.v1".

   Demo honesty note: the partner (Tara) is simulated in this
   demo — her walk to the beacon is the island AI, not the real
   Tara. Rituals count per calendar day on this device.
   ============================================================ */
'use strict';

(function () {

/* ---------------- persistence ---------------- */
var LS_KEY = 'kanavu.beacon.v1';
var store = loadStore();

function loadStore() {
  var d = { streak: 0, longest: 0, lastLit: null, totalLit: 0, remindedDate: null };
  try {
    var raw = localStorage.getItem(LS_KEY);
    if (raw) {
      var p = JSON.parse(raw);
      for (var k in d) if (p[k] !== undefined && p[k] !== null) d[k] = p[k];
    }
  } catch (e) { /* private mode etc. — streaks just won't persist */ }
  return d;
}
function saveStore() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch (e) {}
}

/* ---------------- calendar helpers ---------------- */
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function dayStr(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function todayStr() { return dayStr(new Date()); }
function shiftDayStr(delta) { var d = new Date(); d.setDate(d.getDate() + delta); return dayStr(d); }
function daysBetween(a, b) {   // 'YYYY-MM-DD' -> integer days
  var pa = a.split('-'), pb = b.split('-');
  var da = Date.UTC(+pa[0], +pa[1] - 1, +pa[2]);
  var db = Date.UTC(+pb[0], +pb[1] - 1, +pb[2]);
  return Math.round((db - da) / 86400000);
}

/* ---------------- streak engine ----------------
   status: 'lit'     — tonight's ritual is done
           'tonight' — not yet lit, streak intact
           'paused'  — missed day(s); streak frozen, NOT reset
   A missed night sets 'paused' (derived, never stored as a
   reset); the next completed ritual resumes from where it paused. */
function derivedState() {
  var t = todayStr();
  var base = { streak: store.streak, longest: store.longest, total: store.totalLit };
  if (store.lastLit === t) { base.status = 'lit'; return base; }
  if (store.lastLit && daysBetween(store.lastLit, t) > 1) { base.status = 'paused'; return base; }
  base.status = 'tonight';
  return base;
}
var MILESTONES = [7, 30, 100, 365];

function onComplete() {
  var t = todayStr();
  if (store.lastLit === t) return { counted: false, streak: store.streak };
  if (!store.lastLit) {
    store.streak = 1;
  } else if (daysBetween(store.lastLit, t) === 1) {
    store.streak += 1;
  }
  // else: paused — resume from where it paused (streak untouched, never reset)
  if (store.streak > store.longest) store.longest = store.streak;
  store.lastLit = t;
  store.totalLit += 1;
  saveStore();
  return {
    counted: true,
    streak: store.streak,
    milestone: MILESTONES.indexOf(store.streak) !== -1
  };
}

/* ---------------- beacon location ---------------- */
var BEACON_FALLBACK = { x: 180, y: 500 };
function beaconPos() {
  try {
    var hs = window.__kanavu2d && window.__kanavu2d.hotspots;
    if (hs) for (var i = 0; i < hs.length; i++) {
      if (hs[i].id === 'beacon') return { x: hs[i].x, y: hs[i].y };
    }
  } catch (e) {}
  return BEACON_FALLBACK;
}

/* ---------------- safe bridges into game.js globals ---------------- */
function toast(text, ms) {
  if (typeof showToast === 'function') showToast(text, ms);
}
function flash(v) {
  try { if (typeof beaconFlash !== 'undefined') beaconFlash = Math.max(beaconFlash, v); } catch (e) {}
}
function getPlayer() { try { return (typeof player !== 'undefined') ? player : null; } catch (e) { return null; } }
function getPartner() { try { return (typeof partner !== 'undefined') ? partner : null; } catch (e) { return null; } }
function burstAt(x, y, color, n) {
  if (typeof burst === 'function') burst(x, y, color, n);
}
function grantStars(n) {
  try { if (typeof stars !== 'undefined') stars = stars + n; } catch (e) {}
}

/* ---------------- ritual runtime ---------------- */
var ritual = null;   // { phase:'gather'|'hold', t:0, holdDur:4, ptx, pty }
var els = {};

function begin() {
  if (ritual) return;                       // already in progress
  var st = derivedState();
  if (st.status === 'lit') {
    flash(0.7);
    toast('the beacon already holds your light ✦');
    return;
  }
  var bp = beaconPos();
  var P = getPlayer(), Q = getPartner();
  if (!P || !Q) { toast('the beacon glows brighter ✦'); return; }
  // end any hold-hands moment; the ritual takes over
  try { if (typeof holdHands !== 'undefined') holdHands.active = false; } catch (e) {}
  ritual = { phase: 'gather', t: 0, holdDur: 4, ptx: bp.x - 34, pty: bp.y + 72 };
  Q.ritualGlide = true;                     // game.js wander/movement skips her
  try { Q.waitT = 99999; } catch (e) {}
  flash(0.55);
  toast('the beacon calls… Tara is coming ✦');
}

function cancelRitual(why) {
  var Q = getPartner();
  if (Q) { Q.ritualGlide = false; try { Q.waitT = 1 + Math.random() * 3; } catch (e) {} }
  ritual = null;
  if (why) toast(why);
}

function finishRitual() {
  var bp = beaconPos();
  burstAt(bp.x, bp.y - 14, '#ffcf6e', 26);
  burstAt(bp.x, bp.y - 14, '#fff3d0', 10);
  flash(1);
  var res = onComplete();
  var Q = getPartner();
  if (Q) { Q.ritualGlide = false; try { Q.waitT = 2 + Math.random() * 3; } catch (e) {} }
  ritual = null;
  if (res.counted) {
    grantStars(15);                          // GDD §6: light together = 15 ⭐ each
    toast('the beacon holds your light ✦');
    if (res.milestone) {
      setTimeout(function () {
        toast(res.streak + ' nights of light — kept in your memories ✦', 2600);
      }, 2300);
    }
  } else {
    toast('the beacon holds your light ✦');
  }
  updateFlame();
  if (panelOpen) renderPanel();
}

function update(dt) {
  // gentle evening reminder (demo: always "evening") — once per day
  var P = getPlayer();
  if (!ritual && P && store.remindedDate !== todayStr()) {
    var st = derivedState();
    if (st.status !== 'lit') {
      var bp = beaconPos();
      if (Math.hypot(P.x - bp.x, P.y - bp.y) < 180) {
        store.remindedDate = todayStr(); saveStore();
        toast('the beacon is waiting ✦ — tap Light');
      }
    }
  }
  if (!ritual) return;
  var Q = getPartner();
  if (!Q) { ritual = null; return; }
  var bp = beaconPos();

  // player walked away mid-ritual → let it fade
  if (P && Math.hypot(P.x - bp.x, P.y - bp.y) > 260) {
    cancelRitual('the ritual faded… come back to the beacon');
    return;
  }

  if (ritual.phase === 'gather') {
    flash(0.55);                             // beacon pulses while she comes
    var dx = ritual.ptx - Q.x, dy = ritual.pty - Q.y;
    var d = Math.hypot(dx, dy);
    if (d < 30) {
      ritual.phase = 'hold'; ritual.t = 0;   // light-hold begins
    } else {
      // spirit glide — fast and straight so the ritual stays snappy
      var step = Math.min(300 * dt, d);
      Q.x += dx / d * step; Q.y += dy / d * step;
      Q.moving = true; Q.bob += dt * 9;
      if (Math.abs(dx) > 4) Q.face = dx > 0 ? 1 : -1;
    }
  } else {
    // hold: shared light-hold, both keepers still, heartbeat rings render
    ritual.t += dt;
    Q.moving = false; Q.bob += dt * 2.2;
    flash(0.75);
    if (ritual.t >= ritual.holdDur) finishRitual();
  }
}

function isActive() { return !!ritual; }
function visualActive() { return !!(ritual && ritual.phase === 'hold'); }
function visualT() { return ritual ? ritual.t : 0; }
function freezeInput() { return !!(ritual && ritual.phase === 'hold'); }

window.BeaconRitual = {
  begin: begin,
  update: update,
  isActive: isActive,
  visualActive: visualActive,
  visualT: visualT,
  freezeInput: freezeInput,
  state: derivedState,
  openPanel: function () { openPanel(); }
};

/* ---------------- streak flame (DOM, top bar) ---------------- */
function flameTier(n) {
  if (n >= 30) return 4;
  if (n >= 14) return 3;
  if (n >= 7) return 2;
  if (n >= 3) return 1;
  return 0;
}

var CSS = [
  '#bc-flame{position:fixed;top:12px;left:104px;z-index:120;width:38px;height:38px;border-radius:50%;',
  'background:radial-gradient(circle at 50% 32%,#5a2a33 0%,#2b1a24 78%);',
  'border:1px solid rgba(232,182,76,.55);box-shadow:0 3px 10px rgba(20,8,14,.55);',
  'display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;}',
  '#bc-flame:active{transform:scale(.94);}',
  '#bc-panel{position:fixed;inset:0;z-index:130;display:none;align-items:center;justify-content:center;',
  'background:rgba(30,14,20,.62);font-family:Georgia,serif;padding:24px;}',
  '#bc-panel.on{display:flex;}',
  '.bc-card{width:100%;max-width:330px;background:#f8f1e3;border:2px solid #c9963c;border-radius:20px;',
  'padding:22px 20px 18px;color:#4a2f1c;box-shadow:0 10px 34px rgba(10,4,8,.6);text-align:center;}',
  '.bc-title{font-size:21px;font-weight:700;color:#3a2415;letter-spacing:.5px;margin-bottom:2px;}',
  '.bc-sub{font-size:12.5px;font-style:italic;color:#a0762e;margin-bottom:14px;}',
  '.bc-flamebig{font-size:44px;line-height:1;margin:2px 0 6px;}',
  '.bc-streak{font-size:30px;font-weight:700;color:#3a2415;}',
  '.bc-streak small{font-size:14px;font-weight:400;color:#a0762e;}',
  '.bc-status{font-size:15px;margin:8px 0 2px;min-height:22px;}',
  '.bc-status.paused{color:#8a5a1d;font-weight:700;}',
  '.bc-status.lit{color:#4d7a3a;font-weight:700;}',
  '.bc-note{font-size:13px;font-style:italic;color:#7a5c33;margin:8px 0 14px;line-height:1.5;}',
  '.bc-stats{display:flex;justify-content:center;gap:22px;margin:6px 0 4px;}',
  '.bc-stats div{text-align:center;}',
  '.bc-stats b{display:block;font-size:19px;color:#3a2415;}',
  '.bc-stats span{font-size:11px;color:#a0762e;letter-spacing:.4px;}',
  '.bc-close{margin-top:6px;background:#3a2415;color:#f3ddab;border:1px solid #c9963c;border-radius:999px;',
  'padding:10px 34px;font-size:15px;font-family:Georgia,serif;cursor:pointer;}',
  '.bc-close:active{transform:scale(.97);}'
].join('\n');

function drawFlameCanvas(cv, tier) {
  var g = cv.getContext('2d');
  var W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  var cx = W / 2, cy = H * 0.58;
  var baseR = 7 + tier * 1.6;                 // flame grows with streak
  // outer glow
  var glowR = baseR * (2.1 + tier * 0.55);
  var gl = g.createRadialGradient(cx, cy, 1, cx, cy, glowR);
  var ga = 0.45 + tier * 0.1;
  gl.addColorStop(0, 'rgba(255,190,90,' + ga.toFixed(2) + ')');
  gl.addColorStop(1, 'rgba(255,150,60,0)');
  g.fillStyle = gl;
  g.beginPath(); g.arc(cx, cy, glowR, 0, 6.29); g.fill();
  // flame body (teardrop)
  var fh = baseR * 2.6, fw = baseR * 1.5;
  var fg = g.createLinearGradient(0, cy - fh, 0, cy + baseR);
  fg.addColorStop(0, '#fff3c4');
  fg.addColorStop(0.45, '#ffcf6e');
  fg.addColorStop(1, '#e07f2e');
  g.fillStyle = fg;
  g.beginPath();
  g.moveTo(cx, cy - fh);
  g.bezierCurveTo(cx + fw, cy - fh * 0.45, cx + fw * 0.7, cy + baseR * 0.6, cx, cy + baseR * 0.6);
  g.bezierCurveTo(cx - fw * 0.7, cy + baseR * 0.6, cx - fw, cy - fh * 0.45, cx, cy - fh);
  g.fill();
  // wick ember
  g.fillStyle = '#7a2e10';
  g.beginPath(); g.arc(cx, cy + baseR * 0.6, 1.6, 0, 6.29); g.fill();
}

function buildDom() {
  var st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);

  var flame = document.createElement('button');
  flame.id = 'bc-flame';
  flame.setAttribute('aria-label', 'Beacon ritual');
  var cv = document.createElement('canvas');
  cv.width = 34; cv.height = 34;
  cv.style.width = '30px'; cv.style.height = '30px';
  cv.style.pointerEvents = 'none';
  flame.appendChild(cv);
  flame.addEventListener('click', function () { openPanel(); });
  document.body.appendChild(flame);
  els.flame = flame; els.flameCv = cv;

  var panel = document.createElement('div');
  panel.id = 'bc-panel';
  panel.innerHTML =
    '<div class="bc-card">' +
      '<div class="bc-title">✦ Nightly Beacon Ritual ✦</div>' +
      '<div class="bc-sub">light together, keep the flame</div>' +
      '<div class="bc-flamebig" id="bc-bigflame">🕯</div>' +
      '<div class="bc-streak"><span id="bc-streakn">0</span> <small>nights</small></div>' +
      '<div class="bc-status" id="bc-status"></div>' +
      '<div class="bc-note" id="bc-note"></div>' +
      '<div class="bc-stats">' +
        '<div><b id="bc-longest">0</b><span>LONGEST</span></div>' +
        '<div><b id="bc-total">0</b><span>NIGHTS LIT</span></div>' +
      '</div>' +
      '<button class="bc-close" id="bc-close">close</button>' +
    '</div>';
  document.body.appendChild(panel);
  els.panel = panel;
  panel.querySelector('#bc-close').addEventListener('click', closePanel);
  panel.addEventListener('click', function (e) { if (e.target === panel) closePanel(); });

  updateFlame();
}

var panelOpen = false;
function openPanel() {
  if (!els.panel) return;
  renderPanel();
  els.panel.classList.add('on');
  panelOpen = true;
}
function closePanel() {
  if (!els.panel) return;
  els.panel.classList.remove('on');
  panelOpen = false;
}
function renderPanel() {
  var st = derivedState();
  var $ = function (id) { return els.panel.querySelector('#' + id); };
  $('bc-streakn').textContent = String(st.streak);
  $('bc-longest').textContent = String(st.longest);
  $('bc-total').textContent = String(st.total);
  var statusEl = $('bc-status'), noteEl = $('bc-note');
  statusEl.className = 'bc-status';
  if (st.status === 'lit') {
    statusEl.classList.add('lit');
    statusEl.textContent = '✦ tonight’s light is lit';
    noteEl.textContent = 'Come back tomorrow evening to keep the flame alive.';
  } else if (st.status === 'paused') {
    statusEl.classList.add('paused');
    statusEl.textContent = 'paused ⏸';
    noteEl.textContent = 'The beacon kept your flame warm. Light tonight to resume your ' +
      st.streak + '-night streak — it never shatters.';
  } else {
    statusEl.textContent = 'not yet lit tonight';
    noteEl.textContent = st.streak > 0
      ? 'Walk to the beacon and tap Light to make it ' + (st.streak + 1) + ' nights.'
      : 'Walk to the beacon and tap Light to begin your streak.';
  }
}
function updateFlame() {
  if (!els.flameCv) return;
  var st = derivedState();
  drawFlameCanvas(els.flameCv, flameTier(st.streak));
  // tooltip-ish title for QA / accessibility
  els.flame.title = st.status === 'paused'
    ? 'Beacon ritual — streak paused at ' + st.streak + ' ⏸'
    : 'Beacon ritual — ' + st.streak + '-night streak';
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', buildDom);
} else {
  buildDom();
}

/* ---------------- demo / QA harness ----------------
   window.__beacon — clearly namespaced debug helpers so QA can
   simulate days without waiting. Not part of the game UI. */
window.__beacon = {
  openPanel: function () { openPanel(); return window.__beacon.state(); },
  state: function () {
    return {
      store: JSON.parse(JSON.stringify(store)),
      derived: derivedState(),
      ritual: ritual ? { phase: ritual.phase, t: +ritual.t.toFixed(2) } : null
    };
  },
  begin: function () { begin(); return window.__beacon.state(); },
  debugComplete: function () {
    // finish whatever ritual is running, or mark tonight lit directly
    if (ritual) finishRitual();
    else {
      var res = onComplete();
      if (res.counted) { grantStars(15); toast('the beacon holds your light ✦'); }
      updateFlame();
      if (panelOpen) renderPanel();
    }
    return window.__beacon.state();
  },
  debugSetStreak: function (n) {
    n = Math.max(0, Math.floor(+n || 0));
    store.streak = n;
    if (store.longest < n) store.longest = n;
    store.lastLit = shiftDayStr(-1);   // lit yesterday → tonight not lit, streak intact
    saveStore();
    updateFlame();
    if (panelOpen) renderPanel();
    return window.__beacon.state();
  },
  debugSetLastLit: function (dateStr) {
    // e.g. debugSetLastLit('2026-10-01') to simulate a missed stretch
    store.lastLit = dateStr;
    saveStore();
    updateFlame();
    if (panelOpen) renderPanel();
    return window.__beacon.state();
  },
  debugReset: function () {
    store = { streak: 0, longest: 0, lastLit: null, totalLit: 0, remindedDate: null };
    saveStore();
    updateFlame();
    if (panelOpen) renderPanel();
    return window.__beacon.state();
  }
};

})();
