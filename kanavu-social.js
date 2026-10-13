/* ============================================================================
 * Kanavu — kanavu-social.js
 * ----------------------------------------------------------------------------
 * The social layer: side chat, emotes, gifts, hug flow, theatre couple
 * questions, toast notifications, and the voice-chat toggle.
 *
 *   KanavuSocial.init(worldApi, mp)
 *   KanavuSocial.openTheatre()   (called by the world on theatre door)
 *
 * Chat is ephemeral: messages travel over Supabase Realtime broadcast and a
 * small local cache auto-vanishes after 7 days (capped at 100 messages), so
 * it never grows or takes much space.
 *
 * Vanilla JS, no dependencies. Warm Georgia-serif styling to match the game.
 * ========================================================================== */
(function () {
'use strict';

var worldApi = null, mp = null;
var myName = 'You';

/* ---------------- Dream points (one currency) ---------------- */
var DP_KEY = 'kanavu-dream-points-v1';
var dreamPoints = 0;
var dpPill = null;
function loadDreamPoints() {
  try {
    var v = parseInt(localStorage.getItem(DP_KEY) || '0', 10);
    dreamPoints = isNaN(v) || v < 0 ? 0 : v;
  } catch (e) { dreamPoints = 0; }
}
function saveDreamPoints() {
  try { localStorage.setItem(DP_KEY, String(dreamPoints)); } catch (e) {}
}
function renderDreamPoints() {
  if (dpPill) dpPill.textContent = '💭 ' + dreamPoints;
}
function buildDreamPointsPill() {
  if (dpPill) return;
  dpPill = el('div', 'position:fixed;top:14px;left:14px;z-index:60;' + BASE_FONT +
    'background:rgba(26,14,18,.88);border:2px solid rgba(245,200,110,.85);color:#ffe9b8;' +
    'border-radius:999px;padding:8px 16px;font-size:15px;letter-spacing:.03em;' +
    'box-shadow:0 4px 14px rgba(0,0,0,.4);backdrop-filter:blur(6px);',
    '💭 0');
  document.body.appendChild(dpPill);
  renderDreamPoints();
}
var DP_DAILY_CAP = 150; // max Dream points earnable per day
var DP_EARNED_KEY = 'kanavu-dp-earned-v1';
function getDpEarnedToday() {
  try {
    var raw = localStorage.getItem(DP_EARNED_KEY);
    if (!raw) return 0;
    var d = JSON.parse(raw);
    return d.date === todayStr() ? (d.total || 0) : 0;
  } catch (e) { return 0; }
}
function addDpEarnedToday(n) {
  try {
    var today = todayStr();
    var raw = localStorage.getItem(DP_EARNED_KEY);
    var d = raw ? JSON.parse(raw) : null;
    if (!d || d.date !== today) d = { date: today, total: 0 };
    d.total += n;
    localStorage.setItem(DP_EARNED_KEY, JSON.stringify(d));
  } catch (e) {}
}
function addDreamPoints(n, reason) {
  if (!n || n <= 0) return;
  // Daily cap
  var earned = getDpEarnedToday();
  var allowed = Math.min(n, DP_DAILY_CAP - earned);
  if (allowed <= 0) {
    if (reason) toast('Daily Dream point limit reached 💭 (comes back tomorrow!)');
    return;
  }
  dreamPoints += allowed;
  addDpEarnedToday(allowed);
  saveDreamPoints();
  renderDreamPoints();
  if (reason) toast('+' + allowed + ' 💭 Dream points — ' + reason);
}
function spendDreamPoints(n) {
  if (dreamPoints < n) return false;
  dreamPoints -= n;
  saveDreamPoints();
  renderDreamPoints();
  return true;
}
loadDreamPoints();

/* ---------------- M7: mood check-in ---------------- */
var MOOD_KEY = 'kanavu-mood-v1';
function getMoodToday() {
  try {
    var raw = localStorage.getItem(MOOD_KEY);
    if (!raw) return null;
    var d = JSON.parse(raw);
    return d.date === todayStr() ? d.mood : null;
  } catch (e) { return null; }
}
function setMoodToday(mood) {
  try {
    localStorage.setItem(MOOD_KEY, JSON.stringify({ date: todayStr(), mood: mood }));
  } catch (e) {}
  addDreamPoints(5, 'mood check-in');
  // Notify partner
  try { if (mp && mp.sendMsg) mp.sendMsg('mood', { mood: mood }); } catch (e) {}
}
function openMood() {
  var m = el('div', 'position:fixed;inset:0;z-index:130;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(20,10,14,.72);backdrop-filter:blur(4px);' + BASE_FONT);
  var moods = [
    { e: '😊', n: 'Happy' }, { e: '😍', n: 'In love' }, { e: '😌', n: 'Calm' },
    { e: '🥰', n: 'Grateful' }, { e: '😢', n: 'Sad' }, { e: '😰', n: 'Anxious' },
    { e: '😴', n: 'Tired' }, { e: '🤒', n: 'Sick' }
  ];
  var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0;">';
  moods.forEach(function (md) {
    html += '<button data-mood="' + md.n + '" style="background:rgba(0,0,0,.3);border:1px solid rgba(245,200,110,.3);' +
      'border-radius:14px;padding:14px;cursor:pointer;color:#f4e8d8;font-family:inherit;text-align:center;">' +
      '<div style="font-size:32px;margin-bottom:4px;">' + md.e + '</div>' +
      '<div style="font-size:13px;">' + md.n + '</div></button>';
  });
  html += '</div>';
  m.innerHTML =
    '<div style="background:linear-gradient(180deg,#3a2126,#241318);border:1px solid rgba(245,200,110,.4);' +
    'border-radius:20px;padding:28px 30px;max-width:420px;width:90%;color:#f4e8d8;text-align:center;' +
    'box-shadow:0 16px 60px rgba(0,0,0,.6);max-height:86vh;overflow-y:auto;">' +
    '<div style="font-size:13px;letter-spacing:.3em;color:rgba(245,200,110,.7);margin-bottom:6px;">★ MOOD ★</div>' +
    '<div style="font-size:18px;margin-bottom:4px;">How are you feeling?</div>' +
    html +
    '<button id="ks-mood-close" style="margin-top:8px;background:none;border:none;color:rgba(244,232,216,.45);' +
    'font-family:inherit;font-size:13px;cursor:pointer;">close</button></div>';
  document.body.appendChild(m);
  m.querySelector('#ks-mood-close').onclick = function () { document.body.removeChild(m); };
  m.addEventListener('click', function (e) { if (e.target === m) document.body.removeChild(m); });
  m.querySelectorAll('[data-mood]').forEach(function (b) {
    b.onclick = function () {
      setMoodToday(b.getAttribute('data-mood'));
      toast('Mood saved 💛 +5 💭');
      document.body.removeChild(m);
    };
  });
}

/* ---------------- M5: Co-op games hub ---------------- */
var GAMES = [
  { id: 'likely', name: "Who's More Likely", icon: '🤔', desc: 'Point at the culprit!' },
  { id: 'thisthat', name: 'This or That', icon: '⚖️', desc: 'Pick your side' },
  { id: 'fastqa', name: 'Fast Q&A', icon: '⚡', desc: 'Quick-fire questions' },
  { id: 'watch', name: 'Watch Together', icon: '🎬', desc: 'Sync a video' }
];
var LIKELY_QS = [
  "Who's more likely to cry at a movie?",
  "Who's more likely to plan a surprise trip?",
  "Who's more likely to steal the blanket?",
  "Who's more likely to sing in the shower?",
  "Who's more likely to get lost with GPS on?",
  "Who's more likely to remember anniversaries?",
  "Who's more likely to eat dessert first?",
  "Who's more likely to stay up late talking?",
  "Who's more likely to adopt a stray animal?",
  "Who's more likely to dance in the kitchen?",
  "Who's more likely to cry laughing?",
  "Who's more likely to write a love letter?",
  "Who's more likely to fall asleep during a movie?",
  "Who's more likely to plan the perfect date?",
  "Who's more likely to say 'I love you' first?"
];
var THISTHAT_QS = [
  ["Beach day", "Mountain hike"],
  ["Movie night", "Stargazing"],
  ["Cook together", "Order in"],
  ["Road trip", "Cozy staycation"],
  ["Sunrise", "Sunset"],
  ["Text all day", "One long call"],
  ["Surprise gift", "Planned date"],
  ["City adventure", "Quiet village"],
  ["Dance party", "Slow dance"],
  ["Picnic", "Fancy dinner"],
  ["Phone call", "Voice note"],
  ["Hold hands", "Hug tight"]
];
var FASTQA_QS = [
  "Favorite food right now?",
  "Dream vacation spot?",
  "Song stuck in your head?",
  "Best thing today?",
  "What are you craving?",
  "Ideal weekend?",
  "Favorite memory of us?",
  "What makes you laugh?",
  "Dream superpower?",
  "Comfort movie?"
];
var gameModal = null, gameState = null;
function openGames() {
  if (gameModal) { document.body.removeChild(gameModal); gameModal = null; }
  var m = el('div', 'position:fixed;inset:0;z-index:130;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(20,10,14,.72);backdrop-filter:blur(4px);' + BASE_FONT);
  var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0;">';
  GAMES.forEach(function (g) {
    html += '<button data-game="' + g.id + '" style="background:rgba(0,0,0,.3);border:1px solid rgba(245,200,110,.3);' +
      'border-radius:14px;padding:16px 10px;cursor:pointer;color:#f4e8d8;font-family:inherit;text-align:center;">' +
      '<div style="font-size:32px;margin-bottom:6px;">' + g.icon + '</div>' +
      '<div style="font-size:14px;font-weight:bold;margin-bottom:2px;">' + g.name + '</div>' +
      '<div style="font-size:12px;color:rgba(244,232,216,.6);">' + g.desc + '</div></button>';
  });
  html += '</div>';
  m.innerHTML =
    '<div style="background:linear-gradient(180deg,#3a2126,#241318);border:1px solid rgba(245,200,110,.4);' +
    'border-radius:20px;padding:28px 30px;max-width:420px;width:90%;color:#f4e8d8;text-align:center;' +
    'box-shadow:0 16px 60px rgba(0,0,0,.6);max-height:86vh;overflow-y:auto;">' +
    '<div style="font-size:13px;letter-spacing:.3em;color:rgba(245,200,110,.7);margin-bottom:6px;">★ GAMES ★</div>' +
    '<div style="font-size:18px;margin-bottom:4px;">Play together</div>' +
    html +
    '<button id="ks-game-close" style="margin-top:8px;background:none;border:none;color:rgba(244,232,216,.45);' +
    'font-family:inherit;font-size:13px;cursor:pointer;">close</button></div>';
  document.body.appendChild(m);
  gameModal = m;
  m.querySelector('#ks-game-close').onclick = function () { document.body.removeChild(m); gameModal = null; };
  m.addEventListener('click', function (e) { if (e.target === m) { document.body.removeChild(m); gameModal = null; } });
  m.querySelectorAll('[data-game]').forEach(function (b) {
    b.onclick = function () {
      var id = b.getAttribute('data-game');
      document.body.removeChild(m); gameModal = null;
      if (id === 'likely') openLikely();
      else if (id === 'thisthat') openThisThat();
      else if (id === 'fastqa') openFastQA();
      else if (id === 'watch') openWatch();
    };
  });
}
/* Who's More Likely */
function openLikely() {
  gameState = { idx: Math.floor(Math.random() * LIKELY_QS.length), mine: null, theirs: null };
  renderLikely();
}
function renderLikely() {
  if (gameModal) { document.body.removeChild(gameModal); gameModal = null; }
  var m = el('div', 'position:fixed;inset:0;z-index:130;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(20,10,14,.72);backdrop-filter:blur(4px);' + BASE_FONT);
  var q = LIKELY_QS[gameState.idx];
  var html = '<div style="font-size:18px;font-style:italic;color:#ffe9b8;margin:20px 0;line-height:1.4;">“' + q + '”</div>';
  if (!gameState.mine) {
    html += '<div style="display:flex;gap:12px;justify-content:center;margin:16px 0;">' +
      '<button data-likely="me" style="padding:14px 28px;border:none;border-radius:14px;cursor:pointer;' +
      'background:linear-gradient(180deg,#ffe9b8,#f5a86e);color:#2a1a12;font-family:inherit;font-size:15px;">Me!</button>' +
      '<button data-likely="them" style="padding:14px 28px;border:1px solid rgba(245,200,110,.4);border-radius:14px;cursor:pointer;' +
      'background:transparent;color:#f5d9a8;font-family:inherit;font-size:15px;">Them!</button></div>';
  } else {
    html += '<div style="font-size:15px;margin:12px 0;">You picked: <b style="color:#f5c98a;">' +
      (gameState.mine === 'me' ? 'You!' : partnerLabel()) + '</b></div>';
    if (gameState.theirs) {
      var match = gameState.mine === gameState.theirs;
      html += '<div style="font-size:15px;margin:8px 0;">' + escHtml(gameState.theirName || 'Partner') +
        ' picked: <b style="color:#f5c98a;">' + (gameState.theirs === 'me' ? 'You!' : 'Them!') + '</b></div>';
      html += '<div style="font-size:20px;margin:12px 0;">' + (match ? '💛 Match!' : '😂 Different!') + '</div>';
      if (match) addDreamPoints(10, 'match!');
    } else {
      html += '<div style="font-size:13px;color:rgba(244,232,216,.5);font-style:italic;">waiting for ' +
        escHtml(partnerLabel()) + '…</div>';
    }
    html += '<button id="ks-likely-next" style="margin-top:12px;padding:10px 20px;border:1px solid rgba(245,200,110,.4);' +
      'border-radius:12px;background:transparent;color:#f5d9a8;font-family:inherit;font-size:14px;cursor:pointer;">Next →</button>';
  }
  m.innerHTML =
    '<div style="background:linear-gradient(180deg,#3a2126,#241318);border:1px solid rgba(245,200,110,.4);' +
    'border-radius:20px;padding:28px 30px;max-width:420px;width:90%;color:#f4e8d8;text-align:center;' +
    'box-shadow:0 16px 60px rgba(0,0,0,.6);max-height:86vh;overflow-y:auto;">' +
    '<div style="font-size:13px;letter-spacing:.3em;color:rgba(245,200,110,.7);margin-bottom:6px;">★ WHO\'S MORE LIKELY ★</div>' +
    html +
    '<div style="margin-top:12px;"><button id="ks-likely-back" style="background:none;border:none;color:rgba(245,200,110,.7);' +
    'font-family:inherit;font-size:13px;cursor:pointer;">← games</button></div></div>';
  document.body.appendChild(m);
  gameModal = m;
  m.querySelector('#ks-likely-back').onclick = function () { openGames(); };
  m.querySelectorAll('[data-likely]').forEach(function (b) {
    b.onclick = function () {
      gameState.mine = b.getAttribute('data-likely');
      try { if (mp && mp.sendMsg) mp.sendMsg('likely', { idx: gameState.idx, pick: gameState.mine }); } catch (e) {}
      renderLikely();
    };
  });
  var nextBtn = m.querySelector('#ks-likely-next');
  if (nextBtn) nextBtn.onclick = function () {
    gameState.idx = (gameState.idx + 1) % LIKELY_QS.length;
    gameState.mine = null; gameState.theirs = null;
    renderLikely();
  };
}
/* This or That */
function openThisThat() {
  gameState = { idx: Math.floor(Math.random() * THISTHAT_QS.length), mine: null, theirs: null };
  renderThisThat();
}
function renderThisThat() {
  if (gameModal) { document.body.removeChild(gameModal); gameModal = null; }
  var m = el('div', 'position:fixed;inset:0;z-index:130;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(20,10,14,.72);backdrop-filter:blur(4px);' + BASE_FONT);
  var pair = THISTHAT_QS[gameState.idx];
  var html = '<div style="font-size:16px;color:rgba(244,232,216,.7);margin:12px 0;">This… or that?</div>';
  if (!gameState.mine) {
    html += '<div style="display:flex;gap:12px;justify-content:center;margin:16px 0;">' +
      '<button data-tt="0" style="flex:1;padding:18px 12px;border:none;border-radius:14px;cursor:pointer;' +
      'background:linear-gradient(180deg,#ffe9b8,#f5a86e);color:#2a1a12;font-family:inherit;font-size:15px;">' + pair[0] + '</button>' +
      '<button data-tt="1" style="flex:1;padding:18px 12px;border:1px solid rgba(245,200,110,.4);border-radius:14px;cursor:pointer;' +
      'background:transparent;color:#f5d9a8;font-family:inherit;font-size:15px;">' + pair[1] + '</button></div>';
  } else {
    html += '<div style="font-size:15px;margin:12px 0;">You picked: <b style="color:#f5c98a;">' + pair[gameState.mine] + '</b></div>';
    if (gameState.theirs !== null && gameState.theirs !== undefined) {
      var match = gameState.mine == gameState.theirs;
      html += '<div style="font-size:15px;margin:8px 0;">' + escHtml(gameState.theirName || 'Partner') +
        ' picked: <b style="color:#f5c98a;">' + pair[gameState.theirs] + '</b></div>';
      html += '<div style="font-size:20px;margin:12px 0;">' + (match ? '💛 Twins!' : '💛 Opposites attract!') + '</div>';
      addDreamPoints(5, 'this or that');
    } else {
      html += '<div style="font-size:13px;color:rgba(244,232,216,.5);font-style:italic;">waiting for ' +
        escHtml(partnerLabel()) + '…</div>';
    }
    html += '<button id="ks-tt-next" style="margin-top:12px;padding:10px 20px;border:1px solid rgba(245,200,110,.4);' +
      'border-radius:12px;background:transparent;color:#f5d9a8;font-family:inherit;font-size:14px;cursor:pointer;">Next →</button>';
  }
  m.innerHTML =
    '<div style="background:linear-gradient(180deg,#3a2126,#241318);border:1px solid rgba(245,200,110,.4);' +
    'border-radius:20px;padding:28px 30px;max-width:420px;width:90%;color:#f4e8d8;text-align:center;' +
    'box-shadow:0 16px 60px rgba(0,0,0,.6);max-height:86vh;overflow-y:auto;">' +
    '<div style="font-size:13px;letter-spacing:.3em;color:rgba(245,200,110,.7);margin-bottom:6px;">★ THIS OR THAT ★</div>' +
    html +
    '<div style="margin-top:12px;"><button id="ks-tt-back" style="background:none;border:none;color:rgba(245,200,110,.7);' +
    'font-family:inherit;font-size:13px;cursor:pointer;">← games</button></div></div>';
  document.body.appendChild(m);
  gameModal = m;
  m.querySelector('#ks-tt-back').onclick = function () { openGames(); };
  m.querySelectorAll('[data-tt]').forEach(function (b) {
    b.onclick = function () {
      gameState.mine = b.getAttribute('data-tt');
      try { if (mp && mp.sendMsg) mp.sendMsg('thisthat', { idx: gameState.idx, pick: gameState.mine }); } catch (e) {}
      renderThisThat();
    };
  });
  var nextBtn = m.querySelector('#ks-tt-next');
  if (nextBtn) nextBtn.onclick = function () {
    gameState.idx = (gameState.idx + 1) % THISTHAT_QS.length;
    gameState.mine = null; gameState.theirs = null;
    renderThisThat();
  };
}
/* Fast Q&A */
function openFastQA() {
  gameState = { idx: 0, answers: [] };
  renderFastQA();
}
function renderFastQA() {
  if (gameModal) { document.body.removeChild(gameModal); gameModal = null; }
  var m = el('div', 'position:fixed;inset:0;z-index:130;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(20,10,14,.72);backdrop-filter:blur(4px);' + BASE_FONT);
  var q = FASTQA_QS[gameState.idx];
  var html = '<div style="font-size:13px;color:rgba(244,232,216,.6);margin-bottom:8px;">' +
    (gameState.idx + 1) + ' / ' + FASTQA_QS.length + '</div>' +
    '<div style="font-size:18px;font-style:italic;color:#ffe9b8;margin:16px 0;line-height:1.4;">“' + q + '”</div>' +
    '<input id="ks-fqa-in" placeholder="quick! type your answer…" maxlength="120" ' +
    'style="width:100%;padding:12px 14px;border-radius:12px;border:1px solid rgba(245,200,110,.3);' +
    'background:rgba(0,0,0,.3);color:#f4e8d8;font-family:inherit;font-size:14px;outline:none;margin-bottom:12px;" />' +
    '<button id="ks-fqa-go" style="padding:11px 26px;border:none;border-radius:12px;cursor:pointer;' +
    'background:linear-gradient(180deg,#ffe9b8,#f5a86e);color:#2a1a12;font-family:inherit;font-size:14px;">Go! ⚡</button>';
  if (gameState.answers.length) {
    html += '<div style="margin-top:16px;text-align:left;max-height:24vh;overflow-y:auto;">';
    gameState.answers.forEach(function (a) {
      html += '<div style="font-size:13px;margin-bottom:8px;"><b style="color:#f5c98a;">' + escHtml(a.q) + '</b><br>' +
        'You: ' + escHtml(a.mine) + (a.theirs ? '<br>' + escHtml(a.theirName || 'Partner') + ': ' + escHtml(a.theirs) : '') + '</div>';
    });
    html += '</div>';
  }
  m.innerHTML =
    '<div style="background:linear-gradient(180deg,#3a2126,#241318);border:1px solid rgba(245,200,110,.4);' +
    'border-radius:20px;padding:28px 30px;max-width:420px;width:90%;color:#f4e8d8;text-align:center;' +
    'box-shadow:0 16px 60px rgba(0,0,0,.6);max-height:86vh;overflow-y:auto;">' +
    '<div style="font-size:13px;letter-spacing:.3em;color:rgba(245,200,110,.7);margin-bottom:6px;">★ FAST Q&A ★</div>' +
    html +
    '<div style="margin-top:12px;"><button id="ks-fqa-back" style="background:none;border:none;color:rgba(245,200,110,.7);' +
    'font-family:inherit;font-size:13px;cursor:pointer;">← games</button></div></div>';
  document.body.appendChild(m);
  gameModal = m;
  m.querySelector('#ks-fqa-back').onclick = function () { openGames(); };
  var input = m.querySelector('#ks-fqa-in');
  input.focus();
  function submit() {
    var v = input.value.trim();
    if (!v) return;
    gameState.answers.push({ q: q, mine: v, theirs: null, theirName: null });
    try { if (mp && mp.sendMsg) mp.sendMsg('fastqa', { idx: gameState.idx, a: v }); } catch (e) {}
    gameState.idx++;
    if (gameState.idx >= FASTQA_QS.length) {
      addDreamPoints(20, 'fast Q&A complete!');
      toast('⚡ Fast Q&A done! +20 💭');
      gameState.idx = 0;
    }
    renderFastQA();
  }
  m.querySelector('#ks-fqa-go').onclick = submit;
  input.addEventListener('keypress', function (e) { if (e.key === 'Enter') submit(); });
}
/* Watch Together */
function openWatch() {
  if (gameModal) { document.body.removeChild(gameModal); gameModal = null; }
  var m = el('div', 'position:fixed;inset:0;z-index:130;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(20,10,14,.72);backdrop-filter:blur(4px);' + BASE_FONT);
  m.innerHTML =
    '<div style="background:linear-gradient(180deg,#3a2126,#241318);border:1px solid rgba(245,200,110,.4);' +
    'border-radius:20px;padding:28px 30px;max-width:420px;width:90%;color:#f4e8d8;text-align:center;' +
    'box-shadow:0 16px 60px rgba(0,0,0,.6);max-height:86vh;overflow-y:auto;">' +
    '<div style="font-size:13px;letter-spacing:.3em;color:rgba(245,200,110,.7);margin-bottom:6px;">★ WATCH TOGETHER ★</div>' +
    '<div style="font-size:14px;color:rgba(244,232,216,.7);margin:12px 0;line-height:1.5;">Paste a YouTube link and you\'ll both watch in sync.<br>Play/pause stays together.</div>' +
    '<input id="ks-watch-url" placeholder="YouTube link…" ' +
    'style="width:100%;padding:10px 14px;border-radius:12px;border:1px solid rgba(245,200,110,.3);' +
    'background:rgba(0,0,0,.3);color:#f4e8d8;font-family:inherit;font-size:14px;margin-bottom:12px;outline:none;" />' +
    '<div id="ks-watch-player" style="margin:12px 0;"></div>' +
    '<button id="ks-watch-go" style="padding:11px 26px;border:none;border-radius:12px;cursor:pointer;' +
    'background:linear-gradient(180deg,#ffe9b8,#f5a86e);color:#2a1a12;font-family:inherit;font-size:14px;">Watch together 🎬</button>' +
    '<div style="margin-top:12px;"><button id="ks-watch-back" style="background:none;border:none;color:rgba(245,200,110,.7);' +
    'font-family:inherit;font-size:13px;cursor:pointer;">← games</button></div></div>';
  document.body.appendChild(m);
  gameModal = m;
  m.querySelector('#ks-watch-back').onclick = function () { openGames(); };
  m.querySelector('#ks-watch-go').onclick = function () {
    var url = m.querySelector('#ks-watch-url').value.trim();
    if (!url) return;
    // Extract YouTube video ID
    var vid = null;
    var mt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    if (mt) vid = mt[1];
    if (!vid) { toast('That doesn\'t look like a YouTube link 💛'); return; }
    // Sync to partner
    try { if (mp && mp.sendMsg) mp.sendMsg('watch', { vid: vid }); } catch (e) {}
    var player = m.querySelector('#ks-watch-player');
    player.innerHTML = '<iframe width="100%" height="220" src="https://www.youtube.com/embed/' + vid +
      '?autoplay=1" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen ' +
      'style="border-radius:12px;"></iframe>';
    toast('🎬 Watching together!');
  };
}

/* ---------------- Island decoration picker ---------------- */
var DECOR_TYPES = [
  { id: 'flower', icon: '🌸', name: 'Flower' },
  { id: 'grass', icon: '🌿', name: 'Grass tuft' },
  { id: 'mushroom', icon: '🍄', name: 'Mushroom' },
  { id: 'stone', icon: '🪨', name: 'Stone' },
  { id: 'lantern', icon: '🏮', name: 'Lantern' },
  { id: '__remove', icon: '🧹', name: 'Remove' }
];
var decorMode = null; // type being placed, or null
function openDecorate() {
  var m = el('div', 'position:fixed;inset:0;z-index:130;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(20,10,14,.72);backdrop-filter:blur(4px);' + BASE_FONT);
  var html = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:16px 0;">';
  DECOR_TYPES.forEach(function (dt) {
    html += '<button data-decor="' + dt.id + '" style="background:rgba(0,0,0,.3);border:1px solid rgba(245,200,110,.3);' +
      'border-radius:14px;padding:14px 8px;cursor:pointer;color:#f4e8d8;font-family:inherit;text-align:center;">' +
      '<div style="font-size:32px;margin-bottom:4px;">' + dt.icon + '</div>' +
      '<div style="font-size:12px;">' + dt.name + '</div></button>';
  });
  html += '</div>';
  m.innerHTML =
    '<div style="background:linear-gradient(180deg,#3a2126,#241318);border:1px solid rgba(245,200,110,.4);' +
    'border-radius:20px;padding:28px 30px;max-width:420px;width:90%;color:#f4e8d8;text-align:center;' +
    'box-shadow:0 16px 60px rgba(0,0,0,.6);max-height:86vh;overflow-y:auto;">' +
    '<div style="font-size:13px;letter-spacing:.3em;color:rgba(245,200,110,.7);margin-bottom:6px;">★ DECORATE ★</div>' +
    '<div style="font-size:14px;color:rgba(244,232,216,.7);margin-bottom:4px;">Pick something, then tap the ground<br>where you want it on your island</div>' +
    html +
    '<button id="ks-decor-clear" style="margin:8px 0;padding:8px 16px;border:1px solid rgba(200,100,100,.5);' +
    'border-radius:10px;background:transparent;color:#e88;font-family:inherit;font-size:13px;cursor:pointer;">Clear all</button><br>' +
    '<button id="ks-decor-close" style="background:none;border:none;color:rgba(244,232,216,.45);' +
    'font-family:inherit;font-size:13px;cursor:pointer;">close</button></div>';
  document.body.appendChild(m);
  m.querySelector('#ks-decor-close').onclick = function () { document.body.removeChild(m); };
  m.addEventListener('click', function (e) { if (e.target === m) document.body.removeChild(m); });
  m.querySelector('#ks-decor-clear').onclick = function () {
    if (confirm('Remove all your decorations?')) {
      try { if (worldApi && worldApi.clearDecorations) worldApi.clearDecorations(); } catch (e) {}
      toast('Decorations cleared');
      document.body.removeChild(m);
    }
  };
  m.querySelectorAll('[data-decor]').forEach(function (b) {
    b.onclick = function () {
      decorMode = b.getAttribute('data-decor');
      document.body.removeChild(m);
      var dt = DECOR_TYPES.find(function (x) { return x.id === decorMode; });
      toast('Tap the ground to place ' + (dt ? dt.icon + ' ' + dt.name : 'it') + ' — tap ✏️ to stop');
      showDecorBanner();
    };
  });
}
var decorBanner = null;
function showDecorBanner() {
  if (decorBanner) return;
  decorBanner = el('div', 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:125;' + BASE_FONT +
    'background:rgba(46,26,14,.94);border:1px solid rgba(255,200,120,.5);color:#ffe9b8;' +
    'border-radius:999px;padding:10px 18px;font-size:14px;display:flex;gap:12px;align-items:center;' +
    'box-shadow:0 6px 20px rgba(0,0,0,.5);',
    '<span>🌸 tap PLACE where you stand</span>' +
    '<button id="ks-decor-place" style="padding:6px 14px;border:none;border-radius:10px;cursor:pointer;' +
    'background:linear-gradient(180deg,#ffe9b8,#f5a86e);color:#2a1a12;font-family:inherit;font-size:13px;">PLACE</button>' +
    '<button id="ks-decor-stop" style="background:none;border:none;color:#ffe9b8;' +
    'font-size:16px;cursor:pointer;">✏️</button>');
  document.body.appendChild(decorBanner);
  decorBanner.querySelector('#ks-decor-stop').onclick = stopDecorMode;
  decorBanner.querySelector('#ks-decor-place').onclick = function () {
    if (!decorMode) return;
    try {
      var pos = worldApi.getPlayerPos();
      if (!pos) return;
      if (decorMode === '__remove') {
        // Remove mode: remove nearest decoration
        if (worldApi.removeDecorationAt && worldApi.removeDecorationAt(pos.x, pos.z)) {
          toast('🧹 Removed');
        } else {
          toast('Nothing to remove here');
        }
      } else if (worldApi.addDecoration) {
        // Place slightly in front of the player
        var yaw = worldApi.getPlayerYaw ? worldApi.getPlayerYaw() : 0;
        var px = pos.x + Math.sin(yaw) * 2;
        var pz = pos.z + Math.cos(yaw) * 2;
        if (worldApi.addDecoration(decorMode, px, pz)) {
          addDreamPoints(2, 'decorated');
        }
      }
    } catch (e) {}
  };
}
function stopDecorMode() {
  decorMode = null;
  if (decorBanner) { document.body.removeChild(decorBanner); decorBanner = null; }
}
// Hook into the world's tap-to-place: the world calls this on ground taps
function onGroundTap(x, z) {
  if (!decorMode) return false;
  try {
    if (worldApi && worldApi.addDecoration) {
      worldApi.addDecoration(decorMode, x, z);
      addDreamPoints(2, 'decorated');
      return true;
    }
  } catch (e) {}
  return false;
}

/* ---------------- M8: Miss You button ---------------- */
function sendMissYou() {
  // Haptic
  try { if (navigator.vibrate) navigator.vibrate(50); } catch (e) {}
  // Shooting star visual
  try { if (worldApi && worldApi.shootingStar) worldApi.shootingStar(); } catch (e) {}
  // Send to partner (queues if offline via mp)
  var sent = false;
  try { if (mp && mp.sendMsg) sent = mp.sendMsg('missyou', { at: Date.now() }); } catch (e) {}
  if (sent) {
    toast('💫 Miss-you sent across the stars!');
  } else {
    toast('💫 Miss-you saved — they\'ll feel it when they\'re here');
    // Queue for later
    try {
      var q = JSON.parse(localStorage.getItem('kanavu-missyou-queue') || '[]');
      q.push({ at: Date.now() });
      localStorage.setItem('kanavu-missyou-queue', JSON.stringify(q));
    } catch (e) {}
  }
  addDreamPoints(2, 'miss-you');
  completeTodayTask('affection');
}

/* ---------------- M7: open-when letters ---------------- */
var LETTERS_KEY = 'kanavu-letters-v1';
function getLetters() {
  try {
    var raw = localStorage.getItem(LETTERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}
function saveLetters(letters) {
  try { localStorage.setItem(LETTERS_KEY, JSON.stringify(letters)); } catch (e) {}
}
function openLetters() {
  var letters = getLetters();
  var m = el('div', 'position:fixed;inset:0;z-index:130;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(20,10,14,.72);backdrop-filter:blur(4px);' + BASE_FONT);
  var html = '';
  if (!letters.length) {
    html = '<div style="color:rgba(244,232,216,.5);font-style:italic;margin:16px 0;">No letters yet — write one for your partner 💌</div>';
  } else {
    letters.forEach(function (l, i) {
      var openDate = new Date(l.openDate + 'T12:00:00');
      var canOpen = new Date() >= openDate;
      html += '<div style="background:rgba(0,0,0,.3);border:1px solid rgba(245,200,110,.25);border-radius:14px;' +
        'padding:14px;margin-bottom:10px;text-align:left;">' +
        '<div style="font-size:14px;font-weight:bold;margin-bottom:4px;">💌 ' + escHtml(l.title) + '</div>' +
        '<div style="font-size:12px;color:rgba(244,232,216,.6);margin-bottom:8px;">Open ' +
        (canOpen ? 'now!' : 'on ' + l.openDate) + '</div>' +
        (canOpen
          ? '<div style="font-size:14px;line-height:1.5;white-space:pre-wrap;">' + escHtml(l.body) + '</div>'
          : '<button data-letter-open="' + i + '" style="padding:8px 16px;border:1px solid rgba(245,200,110,.4);' +
            'border-radius:10px;background:transparent;color:#f5d9a8;font-family:inherit;font-size:13px;cursor:pointer;opacity:.5;" disabled>🔒 Sealed</button>') +
        '</div>';
    });
  }
  m.innerHTML =
    '<div style="background:linear-gradient(180deg,#3a2126,#241318);border:1px solid rgba(245,200,110,.4);' +
    'border-radius:20px;padding:28px 30px;max-width:420px;width:90%;color:#f4e8d8;text-align:center;' +
    'box-shadow:0 16px 60px rgba(0,0,0,.6);max-height:86vh;overflow-y:auto;">' +
    '<div style="font-size:13px;letter-spacing:.3em;color:rgba(245,200,110,.7);margin-bottom:6px;">★ LETTERS ★</div>' +
    '<div style="font-size:18px;margin-bottom:4px;">Open when…</div>' +
    '<div style="max-height:40vh;overflow-y:auto;margin:12px 0;">' + html + '</div>' +
    '<button id="ks-letter-new" style="padding:10px 20px;border:none;border-radius:12px;cursor:pointer;' +
    'background:linear-gradient(180deg,#ffe9b8,#f5a86e);color:#2a1a12;font-family:inherit;font-size:14px;margin-bottom:8px;">✍️ Write a letter</button>' +
    '<br><button id="ks-letter-close" style="background:none;border:none;color:rgba(244,232,216,.45);' +
    'font-family:inherit;font-size:13px;cursor:pointer;">close</button></div>';
  document.body.appendChild(m);
  m.querySelector('#ks-letter-close').onclick = function () { document.body.removeChild(m); };
  m.addEventListener('click', function (e) { if (e.target === m) document.body.removeChild(m); });
  m.querySelector('#ks-letter-new').onclick = function () {
    document.body.removeChild(m);
    openLetterComposer();
  };
}
function openLetterComposer() {
  var m = el('div', 'position:fixed;inset:0;z-index:130;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(20,10,14,.72);backdrop-filter:blur(4px);' + BASE_FONT);
  m.innerHTML =
    '<div style="background:linear-gradient(180deg,#3a2126,#241318);border:1px solid rgba(245,200,110,.4);' +
    'border-radius:20px;padding:28px 30px;max-width:420px;width:90%;color:#f4e8d8;text-align:center;' +
    'box-shadow:0 16px 60px rgba(0,0,0,.6);max-height:86vh;overflow-y:auto;">' +
    '<div style="font-size:13px;letter-spacing:.3em;color:rgba(245,200,110,.7);margin-bottom:6px;">★ NEW LETTER ★</div>' +
    '<input id="ks-ltitle" placeholder="Open when… (e.g. Open when you miss me)" maxlength="60" ' +
    'style="width:100%;padding:10px 14px;border-radius:12px;border:1px solid rgba(245,200,110,.3);' +
    'background:rgba(0,0,0,.3);color:#f4e8d8;font-family:inherit;font-size:14px;margin-bottom:10px;outline:none;" />' +
    '<textarea id="ks-lbody" rows="4" placeholder="your letter…" maxlength="1000" ' +
    'style="width:100%;padding:10px 14px;border-radius:12px;border:1px solid rgba(245,200,110,.3);' +
    'background:rgba(0,0,0,.3);color:#f4e8d8;font-family:inherit;font-size:14px;resize:none;outline:none;margin-bottom:10px;"></textarea>' +
    '<input id="ks-ldate" type="date" style="width:100%;padding:10px;border-radius:12px;border:1px solid rgba(245,200,110,.3);' +
    'background:rgba(0,0,0,.3);color:#f4e8d8;font-family:inherit;font-size:14px;margin-bottom:14px;" />' +
    '<div style="display:flex;gap:10px;justify-content:center;">' +
    '<button id="ks-lsave" style="padding:11px 26px;border:none;border-radius:12px;cursor:pointer;' +
    'background:linear-gradient(180deg,#ffe9b8,#f5a86e);color:#2a1a12;font-family:inherit;font-size:14px;">Seal 💌</button>' +
    '<button id="ks-lcancel" style="padding:11px 20px;border:1px solid rgba(245,200,110,.4);border-radius:12px;cursor:pointer;' +
    'background:transparent;color:#f5d9a8;font-family:inherit;font-size:14px;">Cancel</button>' +
    '</div></div>';
  document.body.appendChild(m);
  try { m.querySelector('#ks-ldate').min = new Date().toISOString().slice(0, 10); } catch (e) {}
  m.querySelector('#ks-lcancel').onclick = function () { document.body.removeChild(m); openLetters(); };
  m.querySelector('#ks-lsave').onclick = function () {
    var title = m.querySelector('#ks-ltitle').value.trim();
    var body = m.querySelector('#ks-lbody').value.trim();
    var date = m.querySelector('#ks-ldate').value;
    if (!title || !body || !date) { toast('Fill in all three 💛'); return; }
    var letters = getLetters();
    letters.push({ title: title, body: body, openDate: date, from: myName, at: Date.now() });
    saveLetters(letters);
    // Sync to partner
    try { if (mp && mp.sendMsg) mp.sendMsg('letter', { title: title, body: body, openDate: date }); } catch (e) {}
    addDreamPoints(10, 'wrote a letter');
    toast('💌 Letter sealed!');
    document.body.removeChild(m);
    openLetters();
  };
}

/* ---------------- M7: Dream-point coupons ---------------- */
var COUPONS_KEY = 'kanavu-coupons-v1';
var COUPON_CATALOG = [
  { id: 'hug-coupon', name: 'Hug Coupon', desc: 'Redeem for an extra-long hug', cost: 50, icon: '🤗' },
  { id: 'song-coupon', name: 'Song Request', desc: 'They sing you a song', cost: 75, icon: '🎵' },
  { id: 'date-coupon', name: 'Date Night', desc: 'Plan a surprise date', cost: 100, icon: '🍷' },
  { id: 'massage-coupon', name: 'Massage', desc: '10-minute shoulder rub', cost: 120, icon: '💆' },
  { id: 'breakfast-coupon', name: 'Breakfast in Bed', desc: 'They make you breakfast', cost: 150, icon: '🥞' }
];
function getCoupons() {
  try {
    var raw = localStorage.getItem(COUPONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}
function saveCoupons(c) {
  try { localStorage.setItem(COUPONS_KEY, JSON.stringify(c)); } catch (e) {}
}
function openCoupons() {
  var owned = getCoupons();
  var m = el('div', 'position:fixed;inset:0;z-index:130;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(20,10,14,.72);backdrop-filter:blur(4px);' + BASE_FONT);
  var html = '<div style="font-size:13px;color:#ffe9b8;margin-bottom:12px;">💭 ' + dreamPoints + ' Dream points</div>';
  html += '<div style="font-size:14px;font-weight:bold;margin:12px 0 8px;text-align:left;">Shop</div>';
  COUPON_CATALOG.forEach(function (c) {
    var has = owned.indexOf(c.id) >= 0;
    html += '<div style="display:flex;align-items:center;gap:12px;background:rgba(0,0,0,.3);' +
      'border:1px solid rgba(245,200,110,.25);border-radius:14px;padding:12px;margin-bottom:8px;text-align:left;">' +
      '<div style="font-size:28px;">' + c.icon + '</div>' +
      '<div style="flex:1;"><div style="font-size:14px;font-weight:bold;">' + c.name + '</div>' +
      '<div style="font-size:12px;color:rgba(244,232,216,.6);">' + c.desc + '</div></div>' +
      (has ? '<div style="font-size:12px;color:#ffe9b8;">Owned ✓</div>'
        : '<button data-coupon-buy="' + c.id + '" style="padding:8px 14px;border:none;border-radius:10px;cursor:pointer;' +
          'background:linear-gradient(180deg,#ffe9b8,#f5a86e);color:#2a1a12;font-family:inherit;font-size:13px;">' + c.cost + ' 💭</button>') +
      '</div>';
  });
  if (owned.length) {
    html += '<div style="font-size:14px;font-weight:bold;margin:12px 0 8px;text-align:left;">Your coupons</div>';
    owned.forEach(function (id) {
      var c = COUPON_CATALOG.find(function (x) { return x.id === id; });
      if (!c) return;
      html += '<div style="display:flex;align-items:center;gap:12px;background:rgba(245,200,110,.1);' +
        'border:1px dashed rgba(245,200,110,.5);border-radius:14px;padding:12px;margin-bottom:8px;text-align:left;">' +
        '<div style="font-size:28px;">' + c.icon + '</div>' +
        '<div style="flex:1;"><div style="font-size:14px;font-weight:bold;">' + c.name + '</div>' +
        '<div style="font-size:12px;color:rgba(244,232,216,.6);">' + c.desc + '</div></div>' +
        '<button data-coupon-use="' + c.id + '" style="padding:8px 14px;border:1px solid rgba(245,200,110,.4);' +
        'border-radius:10px;background:transparent;color:#f5d9a8;font-family:inherit;font-size:13px;cursor:pointer;">Redeem</button></div>';
    });
  }
  m.innerHTML =
    '<div style="background:linear-gradient(180deg,#3a2126,#241318);border:1px solid rgba(245,200,110,.4);' +
    'border-radius:20px;padding:28px 30px;max-width:420px;width:90%;color:#f4e8d8;text-align:center;' +
    'box-shadow:0 16px 60px rgba(0,0,0,.6);max-height:86vh;overflow-y:auto;">' +
    '<div style="font-size:13px;letter-spacing:.3em;color:rgba(245,200,110,.7);margin-bottom:6px;">★ COUPONS ★</div>' +
    '<div style="font-size:18px;margin-bottom:4px;">Little promises</div>' +
    '<div style="max-height:50vh;overflow-y:auto;margin:12px 0;text-align:left;">' + html + '</div>' +
    '<button id="ks-coupon-close" style="background:none;border:none;color:rgba(244,232,216,.45);' +
    'font-family:inherit;font-size:13px;cursor:pointer;">close</button></div>';
  document.body.appendChild(m);
  m.querySelector('#ks-coupon-close').onclick = function () { document.body.removeChild(m); };
  m.addEventListener('click', function (e) { if (e.target === m) document.body.removeChild(m); });
  m.querySelectorAll('[data-coupon-buy]').forEach(function (b) {
    b.onclick = function () {
      var id = b.getAttribute('data-coupon-buy');
      var c = COUPON_CATALOG.find(function (x) { return x.id === id; });
      if (!c) return;
      if (spendDreamPoints(c.cost)) {
        var owned = getCoupons();
        owned.push(id);
        saveCoupons(owned);
        toast('🎟️ ' + c.name + ' yours!');
        document.body.removeChild(m);
        openCoupons();
      } else {
        toast('Need ' + c.cost + ' 💭 (you have ' + dreamPoints + ')');
      }
    };
  });
  m.querySelectorAll('[data-coupon-use]').forEach(function (b) {
    b.onclick = function () {
      var id = b.getAttribute('data-coupon-use');
      var c = COUPON_CATALOG.find(function (x) { return x.id === id; });
      if (!c) return;
      // Notify partner
      try { if (mp && mp.sendMsg) mp.sendMsg('coupon', { name: c.name, icon: c.icon }); } catch (e) {}
      // Remove from owned
      var owned = getCoupons();
      owned.splice(owned.indexOf(id), 1);
      saveCoupons(owned);
      toast('🎟️ Redeemed: ' + c.name + '! ' + (partnerOnline() ? partnerLabel() + ' has been notified 💛' : ''));
      document.body.removeChild(m);
      openCoupons();
    };
  });
}

/* ---------------- M3: Today loop ---------------- */
var TODAY_KEY = 'kanavu-today-v1';
var todayData = null;
function todayStr() { return new Date().toISOString().slice(0, 10); }
function loadToday() {
  var today = todayStr();
  try {
    var raw = localStorage.getItem(TODAY_KEY);
    if (raw) {
      var d = JSON.parse(raw);
      if (d && d.date === today) { todayData = d; return; }
    }
  } catch (e) {}
  todayData = { date: today, question: false, beacon: false, affection: false, bonus: false };
  saveToday();
}
function saveToday() {
  try { localStorage.setItem(TODAY_KEY, JSON.stringify(todayData)); } catch (e) {}
}
function completeTodayTask(task) {
  if (!todayData || todayData[task]) return;
  todayData[task] = true;
  addDreamPoints(10, 'Today: ' + task);
  // Check for full completion bonus
  if (todayData.question && todayData.beacon && todayData.affection && !todayData.bonus) {
    todayData.bonus = true;
    addDreamPoints(20, 'Today complete! 🌟');
    toast('🌟 Today complete! +20 bonus Dream points');
  }
  saveToday();
  renderTodayPanel(); // refresh if open
}
function onBeaconLit() {
  completeTodayTask('beacon');
  toast('🔥 Beacon lit! +10 💭');
}
var todayModal = null;
function openToday() {
  if (todayModal) { document.body.removeChild(todayModal); todayModal = null; }
  var m = el('div', 'position:fixed;inset:0;z-index:130;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(20,10,14,.72);backdrop-filter:blur(4px);' + BASE_FONT);
  m.innerHTML =
    '<div style="background:linear-gradient(180deg,#3a2126,#241318);border:1px solid rgba(245,200,110,.4);' +
    'border-radius:20px;padding:28px 30px;max-width:420px;width:90%;color:#f4e8d8;text-align:center;' +
    'box-shadow:0 16px 60px rgba(0,0,0,.6);max-height:86vh;overflow-y:auto;">' +
    '<div style="font-size:13px;letter-spacing:.3em;color:rgba(245,200,110,.7);margin-bottom:6px;">★ TODAY ★</div>' +
    '<div style="font-size:18px;margin-bottom:4px;">' + todayStr() + '</div>' +
    '<div style="font-size:13px;color:rgba(244,232,216,.6);font-style:italic;margin-bottom:16px;">three little rituals, just for you two</div>' +
    '<div id="ks-today-tasks"></div>' +
    '<button id="ks-today-close" style="margin-top:16px;background:none;border:none;color:rgba(244,232,216,.45);' +
    'font-family:inherit;font-size:13px;cursor:pointer;">close</button></div>';
  document.body.appendChild(m);
  todayModal = m;
  m.querySelector('#ks-today-close').onclick = function () {
    document.body.removeChild(m); todayModal = null;
  };
  m.addEventListener('click', function (e) { if (e.target === m) { document.body.removeChild(m); todayModal = null; } });
  renderTodayPanel();
}
function renderTodayPanel() {
  if (!todayModal) return;
  var tasksEl = todayModal.querySelector('#ks-today-tasks');
  if (!tasksEl) return;
  // M7: anniversary countdown
  var countdownHtml = '';
  try {
    var ann = localStorage.getItem('kanavu_anniversary');
    if (ann) {
      var annDate = new Date(ann + 'T12:00:00');
      var now = new Date();
      // Next anniversary
      var next = new Date(annDate);
      next.setFullYear(now.getFullYear());
      if (next < now) next.setFullYear(now.getFullYear() + 1);
      var days = Math.ceil((next - now) / 86400000);
      var years = next.getFullYear() - annDate.getFullYear();
      countdownHtml = '<div style="background:linear-gradient(135deg,rgba(245,200,110,.15),rgba(245,200,110,.05));' +
        'border:1px solid rgba(245,200,110,.4);border-radius:14px;padding:14px;margin-bottom:12px;">' +
        '<div style="font-size:12px;letter-spacing:.2em;color:rgba(245,200,110,.8);">💛 COUNTDOWN 💛</div>' +
        '<div style="font-size:28px;font-weight:bold;color:#ffe9b8;margin:6px 0;">' + days + ' days</div>' +
        '<div style="font-size:13px;color:rgba(244,232,216,.7);">until your ' + years + (years === 1 ? 'st' : years === 2 ? 'nd' : years === 3 ? 'rd' : 'th') + ' anniversary</div>' +
        '</div>';
    }
  } catch (e) {}
  var tasks = [
    { id: 'question', icon: '💬', name: 'Answer a question', desc: 'one deck card, just for you two', action: 'theatre' },
    { id: 'beacon', icon: '🔥', name: 'Light the beacon', desc: 'find it on your island', action: 'beacon' },
    { id: 'affection', icon: '💛', name: 'One affection action', desc: 'hug, gift, or sweet note', action: 'affection' }
  ];
  var html = '';
  tasks.forEach(function (t) {
    var done = todayData[t.id];
    html += '<div style="display:flex;align-items:center;gap:12px;background:rgba(0,0,0,.3);' +
      'border:1px solid rgba(245,200,110,.25);border-radius:14px;padding:14px;margin-bottom:10px;text-align:left;">' +
      '<div style="font-size:28px;">' + (done ? '✅' : t.icon) + '</div>' +
      '<div style="flex:1;">' +
      '<div style="font-size:14px;font-weight:bold;' + (done ? 'text-decoration:line-through;opacity:.6;' : '') + '">' + t.name + '</div>' +
      '<div style="font-size:12px;color:rgba(244,232,216,.6);">' + t.desc + '</div>' +
      '</div>' +
      (done ? '<div style="font-size:12px;color:#ffe9b8;">+10 💭</div>'
        : '<button data-today-go="' + t.action + '" style="padding:8px 16px;border:none;border-radius:10px;cursor:pointer;' +
          'background:linear-gradient(180deg,#ffe9b8,#f5a86e);color:#2a1a12;font-family:inherit;font-size:13px;">Go →</button>') +
      '</div>';
  });
  if (todayData.question && todayData.beacon && todayData.affection) {
    html += '<div style="font-size:14px;color:#ffe9b8;margin-top:8px;">🌟 All done! +20 bonus earned</div>';
  } else {
    html += '<div style="font-size:12px;color:rgba(244,232,216,.5);margin-top:8px;">Complete all three for a +20 💭 bonus</div>';
  }
  tasksEl.innerHTML = countdownHtml + html;
  var goBtns = tasksEl.querySelectorAll('[data-today-go]');
  goBtns.forEach(function (b) {
    b.onclick = function () {
      var action = b.getAttribute('data-today-go');
      document.body.removeChild(todayModal); todayModal = null;
      if (action === 'theatre') openTheatre();
      else if (action === 'beacon') toast('🔥 Find the beacon on your island and tap it!');
      else if (action === 'affection') toast('💛 Send a hug, gift, or sweet note from the buttons on the right!');
    };
  });
}
loadToday();

/* ---------------- tiny DOM helpers ---------------- */
function el(tag, css, html) {
  var d = document.createElement(tag);
  if (css) d.style.cssText = css;
  if (html !== undefined) d.innerHTML = html;
  return d;
}
var BASE_FONT = "font-family:Georgia,'Times New Roman',serif;";
function btnCss() {
  return BASE_FONT +
    'width:52px;height:52px;border-radius:50%;border:2px solid rgba(245,200,110,.85);' +
    'background:rgba(26,14,18,.88);color:#f5d9a8;font-size:22px;cursor:pointer;' +
    'backdrop-filter:blur(6px);box-shadow:0 4px 14px rgba(0,0,0,.4);' +
    'display:flex;align-items:center;justify-content:center;position:relative;';
}

/* ---------------- toast notifications ---------------- */
var toastBox = null;
function toast(msg, ms) {
  if (!toastBox) {
    toastBox = el('div', 'position:fixed;left:50%;transform:translateX(-50%);bottom:235px;z-index:120;' +
      'display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;max-width:88vw;');
    document.body.appendChild(toastBox);
  }
  var t = el('div', BASE_FONT +
    'background:rgba(46,26,14,.92);border:1px solid rgba(255,200,120,.5);color:#ffe9b8;' +
    'border-radius:999px;padding:10px 20px;font-size:14px;letter-spacing:.03em;' +
    'box-shadow:0 6px 20px rgba(0,0,0,.5);opacity:0;transition:opacity .35s ease;text-align:center;',
    escHtml(msg));
  toastBox.appendChild(t);
  requestAnimationFrame(function () { t.style.opacity = '1'; });
  setTimeout(function () {
    t.style.opacity = '0';
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 400);
  }, ms || 3800);
}
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* ---------------- chat (7-day auto-expiry) ---------------- */
var CHAT_LS = 'kanavu_chat_v1';
var CHAT_TTL = 7 * 24 * 60 * 60 * 1000;
function loadChat() {
  try {
    var arr = JSON.parse(localStorage.getItem(CHAT_LS) || '[]');
    var now = Date.now();
    arr = arr.filter(function (m) { return now - m.t < CHAT_TTL; }).slice(-100);
    return arr;
  } catch (e) { return []; }
}
function saveChat(arr) {
  try { localStorage.setItem(CHAT_LS, JSON.stringify(arr.slice(-100))); } catch (e) {}
}
var chatMsgs = [];
var chatPanel = null, chatList = null, chatInput = null, chatBadge = null, chatOpen = false;
var unread = 0;

function renderChat() {
  if (!chatList) return;
  chatList.innerHTML = '';
  if (!chatMsgs.length) {
    var empty = el('div', BASE_FONT + 'text-align:center;color:rgba(244,232,216,.5);font-size:14px;' +
      'font-style:italic;padding:28px 18px;line-height:1.6;', 'No messages yet — say something sweet 💛');
    chatList.appendChild(empty);
    return;
  }
  chatMsgs.forEach(function (m) {
    var mine = m.from === 'me';
    var row = el('div', 'display:flex;' + (mine ? 'justify-content:flex-end;' : 'justify-content:flex-start;') + 'margin:5px 0;');
    var b = el('div', BASE_FONT +
      'max-width:78%;padding:9px 13px;border-radius:14px;font-size:14px;line-height:1.35;' +
      (mine
        ? 'background:linear-gradient(180deg,#ffe9b8,#f5c98a);color:#2a1a12;border-bottom-right-radius:4px;'
        : 'background:rgba(255,248,236,.12);color:#f4e8d8;border:1px solid rgba(245,200,110,.25);border-bottom-left-radius:4px;'),
      escHtml(m.text));
    row.appendChild(b);
    chatList.appendChild(row);
  });
  chatList.scrollTop = chatList.scrollHeight;
}
function pushChat(from, name, text) {
  chatMsgs.push({ from: from, name: name, text: text, t: Date.now() });
  chatMsgs = chatMsgs.slice(-100);
  saveChat(chatMsgs);
  renderChat();
  if (!chatOpen && from !== 'me') {
    unread++;
    if (chatBadge) { chatBadge.style.display = 'flex'; chatBadge.textContent = unread > 9 ? '9+' : unread; }
  }
}
function buildChat() {
  chatMsgs = loadChat();
  var fab = el('button', btnCss(), '💬');
  fab.setAttribute('aria-label', 'Chat');
  fab.id = 'ks-chat-fab';
  chatBadge = el('span', 'display:none;position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;' +
    'border-radius:10px;background:#ff6b8a;color:#fff;font-size:11px;font-weight:bold;' +
    'align-items:center;justify-content:center;padding:0 5px;', '0');
  fab.appendChild(chatBadge);
  fab.onclick = function () {
    chatOpen = !chatOpen;
    chatPanel.style.display = chatOpen ? 'flex' : 'none';
    if (chatOpen) { unread = 0; chatBadge.style.display = 'none'; renderChat(); if (chatInput) chatInput.focus(); }
  };
  chatPanel = el('div', BASE_FONT +
    'position:fixed;top:0;right:0;bottom:0;width:min(340px,88vw);z-index:110;display:none;' +
    'flex-direction:column;background:linear-gradient(180deg,rgba(42,21,26,.97),rgba(26,14,18,.97));' +
    'border-left:1px solid rgba(245,200,110,.3);box-shadow:-12px 0 40px rgba(0,0,0,.5);');
  var head = el('div', 'padding:16px 18px;border-bottom:1px solid rgba(245,200,110,.2);' +
    'display:flex;align-items:center;justify-content:space-between;',
    '<div style="font-size:17px;letter-spacing:.12em;color:#ffe9b8;">ISLAND CHAT</div>');
  var x = el('button', 'background:none;border:none;color:rgba(244,232,216,.5);font-size:20px;cursor:pointer;', '✕');
  x.onclick = function () { fab.onclick(); };
  head.appendChild(x);
  chatPanel.appendChild(head);
  var sub = el('div', 'padding:8px 18px;font-size:11px;font-style:italic;color:rgba(244,232,216,.4);',
    'messages fade away after a week 💭');
  chatPanel.appendChild(sub);
  chatList = el('div', 'flex:1;overflow-y:auto;padding:12px 16px;');
  chatPanel.appendChild(chatList);
  var form = el('div', 'padding:12px 14px;border-top:1px solid rgba(245,200,110,.2);display:flex;gap:8px;');
  chatInput = el('input', BASE_FONT +
    'flex:1;padding:11px 14px;border-radius:999px;border:1px solid rgba(245,200,110,.3);' +
    'background:rgba(0,0,0,.3);color:#f4e8d8;font-size:14px;outline:none;');
  chatInput.placeholder = 'say something sweet…';
  chatInput.maxLength = 300;
  var send = el('button', BASE_FONT +
    'padding:11px 18px;border:none;border-radius:999px;cursor:pointer;font-size:14px;' +
    'background:linear-gradient(180deg,#ffe9b8,#f5a86e);color:#2a1a12;', 'Send');
  function doSend() {
    var v = chatInput.value.trim();
    if (!v) return;
    chatInput.value = '';
    pushChat('me', myName, v);
    if (mp) mp.sendMsg('chat', { text: v });
  }
  send.onclick = doSend;
  chatInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSend(); e.stopPropagation(); });
  form.appendChild(chatInput); form.appendChild(send);
  chatPanel.appendChild(form);
  document.body.appendChild(chatPanel);
  renderChat();
  return fab;
}

/* ---------------- emotes ---------------- */
var EMOTES = [
  ['wave', '👋', 'Wave'], ['bow', '🙇', 'Bow'], ['laugh', '😂', 'Laugh'],
  ['cheer', '🎉', 'Cheer'], ['shy', '🙈', 'Shy'], ['loveyou', '🫶', 'Love you']
];
function buildEmotes() {
  var fab = el('button', btnCss(), '😊');
  fab.setAttribute('aria-label', 'Emotes');
  var pop = el('div', 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:115;display:none;' +
    'background:rgba(42,21,26,.96);border:1px solid rgba(245,200,110,.3);border-radius:16px;padding:12px;' +
    'max-width:calc(100vw - 100px);' +
    'grid-template-columns:repeat(3,1fr);gap:8px;');
  EMOTES.forEach(function (em) {
    var b = el('button', BASE_FONT +
      'width:64px;height:64px;border-radius:14px;border:1px solid rgba(245,200,110,.25);cursor:pointer;' +
      'background:rgba(255,248,236,.07);font-size:15px;color:#f4e8d8;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;gap:2px;',
      '<span style="font-size:24px;">' + em[1] + '</span><span style="font-size:10px;">' + em[2] + '</span>');
    b.onclick = function () {
      try { worldApi.playEmote(em[0]); } catch (e) {}
      if (mp) mp.sendMsg('emote', { name: em[0] });
      pop.style.display = 'none';
    };
    pop.appendChild(b);
  });
  document.body.appendChild(pop);
  fab.onclick = function () {
    pop.style.display = pop.style.display === 'none' ? 'grid' : 'none';
  };
  return fab;
}

/* ---------------- gifts ---------------- */
var GIFTS = ['💐', '🍫', '🧸', '💍', '💌', '🍰'];
function buildGifts() {
  var fab = el('button', btnCss(), '🎁');
  fab.setAttribute('aria-label', 'Send a gift');
  var pop = el('div', 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:115;display:none;' +
    'background:rgba(42,21,26,.96);border:1px solid rgba(245,200,110,.3);border-radius:16px;padding:14px;' +
    'max-width:calc(100vw - 100px);' +
    BASE_FONT + 'color:#ffe9b8;font-size:14px;text-align:center;');
  pop.innerHTML = '<div style="margin-bottom:10px;letter-spacing:.08em;">SEND A GIFT</div>';
  var row = el('div', 'display:flex;gap:8px;justify-content:center;flex-wrap:wrap;max-width:280px;margin:0 auto;');
  GIFTS.forEach(function (g) {
    var b = el('button', 'width:52px;height:52px;font-size:28px;border-radius:12px;cursor:pointer;' +
      'background:rgba(255,248,236,.07);border:1px solid rgba(245,200,110,.25);', g);
    b.onclick = function () {
      if (mp) {
        if (mp.sendMsg('gift', { emoji: g })) toast('Sent ' + g + ' to ' + partnerLabel());
        else toast('Your partner isn\'t here yet — gift saved for later 💛');
        completeTodayTask('affection');
      }
      pop.style.display = 'none';
    };
    row.appendChild(b);
  });
  pop.appendChild(row);
  document.body.appendChild(pop);
  fab.onclick = function () {
    pop.style.display = pop.style.display === 'none' ? 'block' : 'none';
  };
  return fab;
}

/* ---------------- hug flow ---------------- */
var hugFab = null, hugCooldownUntil = 0;
function partnerLabel() {
  try { var p = mp.getPartner(); return (p && p.name) || 'partner'; } catch (e) { return 'partner'; }
}
function partnerOnline() {
  try { var p = mp.getPartner(); return !!(p && p.online); } catch (e) { return false; }
}
function checkHugProximity() {
  if (!hugFab || !mp) return;
  var show = false;
  try {
    if (partnerOnline() && !worldApi.isHugging() && Date.now() > hugCooldownUntil) {
      var a = worldApi.getPlayerPos(), b = worldApi.getPartnerPos();
      show = Math.hypot(a.x - b.x, a.z - b.z) < 4.5;
    }
  } catch (e) {}
  hugFab.style.display = show ? 'flex' : 'none';
}
function buildHug() {
  hugFab = el('button', btnCss() + 'display:none;', '💞');
  hugFab.setAttribute('aria-label', 'Hug');
  hugFab.title = 'Hug?';
  hugFab.onclick = function () {
    hugCooldownUntil = Date.now() + 20000;
    hugFab.style.display = 'none';
    if (mp.sendMsg('hug-request', {})) toast('Hug request sent 💛');
    completeTodayTask('affection');
  };
  setInterval(checkHugProximity, 1500);
  return hugFab;
}
function showHugRequest(from) {
  var ov = el('div', 'position:fixed;inset:0;z-index:130;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(20,10,14,.6);' + BASE_FONT);
  ov.innerHTML =
    '<div style="background:linear-gradient(180deg,#3a2126,#2a151a);border:1px solid rgba(245,200,110,.4);' +
    'border-radius:18px;padding:26px 30px;text-align:center;color:#f4e8d8;max-width:300px;">' +
    '<div style="font-size:40px;margin-bottom:10px;">🤗</div>' +
    '<div style="font-size:16px;margin-bottom:18px;">' + escHtml(from) + ' wants to hug you?</div>' +
    '<div style="display:flex;gap:10px;justify-content:center;">' +
    '<button id="ks-hug-yes" style="padding:11px 22px;border:none;border-radius:12px;cursor:pointer;' +
    'background:linear-gradient(180deg,#ffe9b8,#f5a86e);color:#2a1a12;font-family:inherit;font-size:14px;">Hug back</button>' +
    '<button id="ks-hug-no" style="padding:11px 22px;border:1px solid rgba(245,200,110,.4);border-radius:12px;cursor:pointer;' +
    'background:transparent;color:#f5d9a8;font-family:inherit;font-size:14px;">Not now</button>' +
    '</div></div>';
  document.body.appendChild(ov);
  ov.querySelector('#ks-hug-yes').onclick = function () {
    document.body.removeChild(ov);
    if (mp) mp.sendMsg('hug-accept', {});
    try { worldApi.startHug(); } catch (e) {}
  };
  ov.querySelector('#ks-hug-no').onclick = function () {
    document.body.removeChild(ov);
    if (mp) mp.sendMsg('hug-decline', {});
  };
  setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 30000);
}

/* ---------------- theatre: couple questions ---------------- */
var QUESTIONS = [
  "What's your favorite memory of us so far?",
  "If we could teleport anywhere right now, where would we go?",
  "What's one small thing I do that makes you smile?",
  "What are you most looking forward to with us?",
  "Describe our perfect Sunday together.",
  "What's a song that reminds you of me?",
  "What's something you've always wanted to tell me?",
  "If we had a whole day with no phones, what would we do?",
  "How do you feel most loved?",
  "What's a dream we should chase together?",
  "What's the sweetest thing anyone's ever done for you?",
  "If you could relive one day with me, which would it be?",
  "What food reminds you of home?",
  "What's something you're proud of lately?",
  "How do you want to be comforted when you're sad?",
  "What's a tradition we should start together?",
  "If we wrote a book about us, what would the title be?",
  "What's your favorite thing about how we met?",
  "What does 'home' mean to you?",
  "What's one thing you want to learn together?",
  "Describe me in three words.",
  "What's a little surprise that would make your week?",
  "Where do you see us in five years?",
  "What's something that always makes you laugh?"
];
var theatreIdx = 0;
var theatreAnswers = {}; // "deckId:qIndex" -> {mine, theirs, theirName}
var theatreModal = null, theatreQ = null, theatreA = null;
var theatreDeckId = null; // null = shelf view

/* ---------------- deck catalog (M4) ---------------- */
var DECKS = [];
var deckUnlocks = {}; // deckId -> true (purchased with Dream points)
var DECK_UNLOCK_KEY = 'kanavu-deck-unlocks-v1';
try {
  var duRaw = localStorage.getItem(DECK_UNLOCK_KEY);
  if (duRaw) deckUnlocks = JSON.parse(duRaw) || {};
} catch (e) {}
function saveDeckUnlocks() {
  try { localStorage.setItem(DECK_UNLOCK_KEY, JSON.stringify(deckUnlocks)); } catch (e) {}
}
function loadDecks() {
  // Fetch the deck catalog; fall back to the legacy single-deck list.
  return fetch('kanavu-decks.json?v=1').then(function (r) {
    if (!r.ok) throw new Error('no decks');
    return r.json();
  }).then(function (j) {
    if (j && j.decks && j.decks.length) DECKS = j.decks;
  }).catch(function () {
    DECKS = [{ id: 'first-hellos', name: 'First Hellos', icon: '👋', blurb: 'Questions for two.', unlock: { type: 'free' }, cards: QUESTIONS }];
  });
}
function daysPaired() {
  try {
    var raw = localStorage.getItem('kanavu-pair');
    if (!raw) return 0;
    var p = JSON.parse(raw);
    if (!p || !p.at) return 0;
    return Math.floor((Date.now() - p.at) / 86400000);
  } catch (e) { return 0; }
}
function beaconStreak() {
  // M4/M3: beacon streak stored by the Today/beacon system; 0 until implemented.
  try { return parseInt(localStorage.getItem('kanavu-beacon-streak') || '0', 10) || 0; } catch (e) { return 0; }
}
function deckUnlockState(deck) {
  var u = deck.unlock || { type: 'free' };
  if (u.type === 'free') return { unlocked: true };
  if (u.type === 'day') {
    var d = daysPaired();
    return d >= u.day ? { unlocked: true } : { unlocked: false, label: 'Day ' + u.day + ' · day ' + d + ' now' };
  }
  if (u.type === 'points') {
    if (deckUnlocks[deck.id]) return { unlocked: true };
    return { unlocked: false, label: u.points + ' 💭', cost: u.points };
  }
  if (u.type === 'streak') {
    var s = beaconStreak();
    return s >= u.days ? { unlocked: true } : { unlocked: false, label: u.days + '-day beacon streak · ' + s + ' now' };
  }
  return { unlocked: true };
}
function deckProgress(deck) {
  var total = (deck.cards || []).length;
  var done = 0;
  for (var i = 0; i < total; i++) {
    var rec = theatreAnswers[deck.id + ':' + i];
    if (rec && rec.mine) done++;
  }
  return { done: done, total: total };
}
function answerKey() { return theatreDeckId + ':' + theatreIdx; }

function openTheatre() {
  // M4: deck shelf — pick a deck, see locks and progress.
  if (theatreModal) { document.body.removeChild(theatreModal); theatreModal = null; }
  theatreDeckId = null;
  var m = el('div', 'position:fixed;inset:0;z-index:130;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(20,10,14,.72);backdrop-filter:blur(4px);' + BASE_FONT);
  var shelfHtml = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0;max-height:50vh;overflow-y:auto;padding:2px;">';
  DECKS.forEach(function (deck) {
    var st = deckUnlockState(deck);
    var pr = deckProgress(deck);
    var lockHtml = st.unlocked
      ? '<div style="font-size:11px;color:rgba(245,200,110,.75);margin-top:6px;">' + pr.done + '/' + pr.total + ' answered</div>'
      : '<div style="font-size:11px;color:rgba(244,232,216,.5);margin-top:6px;">🔒 ' + escHtml(st.label || 'locked') + '</div>';
    shelfHtml += '<button data-deck="' + deck.id + '" ' + (st.unlocked ? '' : 'data-locked="1"') +
      ' style="background:rgba(0,0,0,.3);border:1px solid rgba(245,200,110,.3);border-radius:14px;' +
      'padding:14px 10px;cursor:pointer;color:#f4e8d8;font-family:inherit;text-align:center;' +
      (st.unlocked ? '' : 'opacity:.75;') + '">' +
      '<div style="font-size:28px;margin-bottom:6px;">' + (st.unlocked ? deck.icon : '🔒') + '</div>' +
      '<div style="font-size:13px;font-weight:bold;margin-bottom:2px;">' + escHtml(deck.name) + '</div>' +
      lockHtml + '</button>';
  });
  shelfHtml += '</div>';
  m.innerHTML =
    '<div style="background:linear-gradient(180deg,#3a2126,#241318);border:1px solid rgba(245,200,110,.4);' +
    'border-radius:20px;padding:28px 30px;max-width:420px;width:90%;color:#f4e8d8;text-align:center;' +
    'box-shadow:0 16px 60px rgba(0,0,0,.6);max-height:86vh;overflow-y:auto;">' +
    '<div style="font-size:13px;letter-spacing:.3em;color:rgba(245,200,110,.7);margin-bottom:6px;">★ THEATRE ★</div>' +
    '<div style="font-size:18px;margin-bottom:4px;">Pick a deck</div>' +
    '<div style="font-size:13px;color:rgba(244,232,216,.6);font-style:italic;">questions for two, answered in your own time</div>' +
    shelfHtml +
    '<div style="font-size:13px;color:#ffe9b8;margin-top:4px;">💭 ' + dreamPoints + ' Dream points</div>' +
    '<button id="ks-tclose" style="margin-top:14px;background:none;border:none;color:rgba(244,232,216,.45);' +
    'font-family:inherit;font-size:13px;cursor:pointer;">close</button></div>';
  document.body.appendChild(m);
  theatreModal = m;
  m.querySelector('#ks-tclose').onclick = function () {
    document.body.removeChild(m); theatreModal = null;
  };
  m.addEventListener('click', function (e) { if (e.target === m) { document.body.removeChild(m); theatreModal = null; } });
  var buttons = m.querySelectorAll('[data-deck]');
  buttons.forEach(function (b) {
    b.onclick = function () {
      var id = b.getAttribute('data-deck');
      var deck = DECKS.find(function (d) { return d.id === id; });
      if (!deck) return;
      var st = deckUnlockState(deck);
      if (!st.unlocked) {
        if (st.cost && dreamPoints >= st.cost) {
          if (confirm('Unlock "' + deck.name + '" for ' + st.cost + ' 💭 Dream points?')) {
            if (spendDreamPoints(st.cost)) {
              deckUnlocks[deck.id] = true;
              saveDeckUnlocks();
              toast('Unlocked ' + deck.icon + ' ' + deck.name + '!');
              openTheatre(); // refresh shelf
            }
          }
        } else {
          toast(st.cost ? 'Need ' + st.cost + ' 💭 (you have ' + dreamPoints + ')' : '🔒 ' + (st.label || 'locked'));
        }
        return;
      }
      openDeck(id);
    };
  });
}

function openDeck(deckId) {
  // M4: question view for a single deck.
  if (theatreModal) { document.body.removeChild(theatreModal); theatreModal = null; }
  theatreDeckId = deckId;
  theatreIdx = 0;
  var deck = DECKS.find(function (d) { return d.id === deckId; });
  if (!deck) { openTheatre(); return; }
  var m = el('div', 'position:fixed;inset:0;z-index:130;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(20,10,14,.72);backdrop-filter:blur(4px);' + BASE_FONT);
  m.innerHTML =
    '<div style="background:linear-gradient(180deg,#3a2126,#241318);border:1px solid rgba(245,200,110,.4);' +
    'border-radius:20px;padding:28px 30px;max-width:420px;width:90%;color:#f4e8d8;text-align:center;' +
    'box-shadow:0 16px 60px rgba(0,0,0,.6);max-height:86vh;overflow-y:auto;">' +
    '<div style="font-size:13px;letter-spacing:.3em;color:rgba(245,200,110,.7);margin-bottom:6px;">★ THEATRE ★</div>' +
    '<div style="font-size:16px;margin-bottom:4px;">' + deck.icon + ' ' + escHtml(deck.name) + '</div>' +
    '<div id="ks-tq" style="font-size:16px;font-style:italic;color:#ffe9b8;margin:16px 0;min-height:48px;line-height:1.4;"></div>' +
    '<div id="ks-ta" style="text-align:left;font-size:14px;margin-bottom:12px;"></div>' +
    '<textarea id="ks-tin" rows="2" placeholder="your answer…" maxlength="300" ' +
    'style="width:100%;padding:10px 14px;border-radius:12px;border:1px solid rgba(245,200,110,.3);' +
    'background:rgba(0,0,0,.3);color:#f4e8d8;font-family:inherit;font-size:14px;resize:none;outline:none;"></textarea>' +
    '<div style="display:flex;gap:10px;justify-content:center;margin-top:14px;">' +
    '<button id="ks-tans" style="padding:11px 26px;border:none;border-radius:12px;cursor:pointer;' +
    'background:linear-gradient(180deg,#ffe9b8,#f5a86e);color:#2a1a12;font-family:inherit;font-size:14px;">Answer 💛</button>' +
    '<button id="ks-tnext" style="padding:11px 20px;border:1px solid rgba(245,200,110,.4);border-radius:12px;cursor:pointer;' +
    'background:transparent;color:#f5d9a8;font-family:inherit;font-size:14px;">Next →</button>' +
    '</div>' +
    '<div style="margin-top:14px;display:flex;gap:16px;justify-content:center;">' +
    '<button id="ks-tback" style="background:none;border:none;color:rgba(245,200,110,.7);' +
    'font-family:inherit;font-size:13px;cursor:pointer;">← decks</button>' +
    '<button id="ks-tclose" style="background:none;border:none;color:rgba(244,232,216,.45);' +
    'font-family:inherit;font-size:13px;cursor:pointer;">close</button></div></div>';
  document.body.appendChild(m);
  theatreModal = m;
  theatreQ = m.querySelector('#ks-tq');
  theatreA = m.querySelector('#ks-ta');
  renderTheatreQ();
  m.querySelector('#ks-tans').onclick = function () {
    var v = m.querySelector('#ks-tin').value.trim();
    if (!v) return;
    m.querySelector('#ks-tin').value = '';
    var key = answerKey();
    var rec = theatreAnswers[key] || (theatreAnswers[key] = {});
    var firstAnswer = !rec.mine;
    rec.mine = v;
    if (mp) {
      if (mp.sendMsg('question', { q: key, a: v, deck: theatreDeckId })) {
        if (!partnerOnline()) toast('Answer saved — ' + partnerLabel() + ' will see it when they\'re here 💛');
      }
    }
    if (firstAnswer) {
      addDreamPoints(5, 'answered a question');
      completeTodayTask('question');
    }
    renderTheatreQ();
  };
  m.querySelector('#ks-tnext').onclick = function () {
    var deck = DECKS.find(function (d) { return d.id === theatreDeckId; });
    var n = deck ? deck.cards.length : 1;
    theatreIdx = (theatreIdx + 1) % n;
    renderTheatreQ();
  };
  m.querySelector('#ks-tback').onclick = function () { openTheatre(); };
  m.querySelector('#ks-tclose').onclick = function () {
    document.body.removeChild(m); theatreModal = null;
  };
  m.addEventListener('click', function (e) { if (e.target === m) { document.body.removeChild(m); theatreModal = null; } });
}

/* ---------------- building popups (theatre pattern for every building; no interiors) ---------------- */
var BUILDING_INFO = {
  shop: { icon: '🛍️', name: 'Shop', blurb: 'Little treasures for your island life.' },
  bookshop: { icon: '📖', name: 'Bookshop', blurb: 'Stories, letters, and quiet corners.' },
  cottage: { icon: '💭', name: 'Memory Cottage', blurb: 'Keep your favorite moments here.' },
  house: { icon: '🏠', name: "Couple's House", blurb: 'Your cozy corner of the island.' },
  barn: { icon: '🎃', name: 'Halloween Barn', blurb: 'Kanavu Autumn Barn — the Halloween Barn Festival is on! Grab some hot cider and pick a pumpkin.' }
};
/* Building rename (per-island, stored locally) */
var BNAME_KEY = 'kanavu-building-names-v1';
function getBuildingNames() {
  try {
    var raw = localStorage.getItem(BNAME_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}
function getBuildingName(type, side) {
  var names = getBuildingNames();
  var key = (side || 'A') + '-' + type;
  return names[key] || null;
}
function setBuildingName(type, side, name) {
  var names = getBuildingNames();
  var key = (side || 'A') + '-' + type;
  if (name) names[key] = name;
  else delete names[key];
  try { localStorage.setItem(BNAME_KEY, JSON.stringify(names)); } catch (e) {}
}
var buildingModal = null;
function openBuilding(type) {
  if (buildingModal) { document.body.removeChild(buildingModal); buildingModal = null; }
  var info = BUILDING_INFO[type] || { icon: '🏠', name: 'Building', blurb: '' };
  var m = el('div', 'position:fixed;inset:0;z-index:130;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(20,10,14,.72);backdrop-filter:blur(4px);' + BASE_FONT);
  var actions = '';
  if (type === 'house') {
    actions = '<button id="ks-bsleep" style="padding:11px 26px;border:none;border-radius:12px;cursor:pointer;' +
      'background:linear-gradient(180deg,#ffe9b8,#f5a86e);color:#2a1a12;font-family:inherit;font-size:14px;">😴 Sleep till morning</button>';
  }
  m.innerHTML =
    '<div style="background:linear-gradient(180deg,#3a2126,#241318);border:1px solid rgba(245,200,110,.4);' +
    'border-radius:20px;padding:28px 30px;max-width:420px;width:90%;color:#f4e8d8;text-align:center;' +
    'box-shadow:0 16px 60px rgba(0,0,0,.6);max-height:86vh;overflow-y:auto;">' +
    '<div style="font-size:40px;margin-bottom:8px;">' + info.icon + '</div>' +
    '<div style="font-size:13px;letter-spacing:.3em;color:rgba(245,200,110,.7);margin-bottom:6px;">★ ' +
    info.name.toUpperCase() + ' ★</div>' +
    '<div style="font-size:15px;font-style:italic;color:rgba(244,232,216,.75);margin:12px 0 18px;line-height:1.5;">' +
    info.blurb + '</div>' +
    (actions ? '<div style="display:flex;gap:10px;justify-content:center;margin-bottom:6px;">' + actions + '</div>' : '') +
    '<button id="ks-bclose" style="margin-top:10px;background:none;border:none;color:rgba(244,232,216,.45);' +
    'font-family:inherit;font-size:13px;cursor:pointer;">close</button></div>';
  document.body.appendChild(m);
  buildingModal = m;
  m.querySelector('#ks-bclose').onclick = function () {
    document.body.removeChild(m); buildingModal = null;
  };
  m.addEventListener('click', function (e) { if (e.target === m) { document.body.removeChild(m); buildingModal = null; } });
  m.addEventListener('click', function (e) { if (e.target === m) { document.body.removeChild(m); buildingModal = null; } });
  var sleepBtn = m.querySelector('#ks-bsleep');
  if (sleepBtn) sleepBtn.onclick = function () {
    document.body.removeChild(m); buildingModal = null;
    try { if (worldApi && worldApi.sleep) worldApi.sleep(); } catch (e) {}
  };
}
function renderTheatreQ() {
  if (!theatreQ) return;
  var rdeck = null;
  for (var di = 0; di < DECKS.length; di++) { if (DECKS[di].id === theatreDeckId) { rdeck = DECKS[di]; break; } }
  var rcards = rdeck ? rdeck.cards : QUESTIONS;
  theatreQ.textContent = '“' + (rcards[theatreIdx] || '…') + '”';
  var rec = theatreAnswers[answerKey()] || {};
  var html = '';
  // M3: async reveal — their answer shows only once BOTH have answered.
  var bothAnswered = rec.mine && rec.theirs;
  if (rec.mine) html += '<div style="margin-bottom:8px;"><b style="color:#f5c98a;">You:</b> ' + escHtml(rec.mine) + '</div>';
  if (bothAnswered) {
    html += '<div><b style="color:#f5c98a;">' + escHtml(rec.theirName || 'Partner') + ':</b> ' + escHtml(rec.theirs) + '</div>';
  } else if (rec.theirs && !rec.mine) {
    html += '<div style="color:rgba(245,200,110,.8);font-style:italic;margin-top:6px;">💛 ' +
      escHtml(rec.theirName || 'Partner') + ' has answered — answer to reveal theirs!</div>';
  }
  if (!html) html = '<div style="color:rgba(244,232,216,.45);font-style:italic;">' +
    (partnerOnline() ? 'waiting for your answers… don\'t leave each other hanging 💛' : 'your partner isn\'t here yet — answer anyway, they\'ll see it 💛') + '</div>';
  else if (rec.mine && !rec.theirs && partnerOnline()) html += '<div style="color:rgba(244,232,216,.45);font-style:italic;margin-top:6px;">waiting for ' + escHtml(partnerLabel()) + '…</div>';
  theatreA.innerHTML = html;
}

/* ---------------- voice toggle ---------------- */
var voiceFab = null;
function buildVoice() {
  voiceFab = el('button', btnCss() + 'opacity:.45;', '🎙️');
  voiceFab.setAttribute('aria-label', 'Voice chat');
  voiceFab.title = 'Voice chat';
  function refresh(st) {
    if (!st) return;
    voiceFab.style.opacity = st.mine ? '1' : '.45';
    voiceFab.style.boxShadow = st.live ? '0 0 16px rgba(168,230,161,.8)' : '0 4px 14px rgba(0,0,0,.4)';
    voiceFab.title = st.live ? 'Voice connected — tap to hang up' : (st.mine ? 'Waiting for partner…' : 'Voice chat');
  }
  voiceFab.onclick = function () {
    if (!mp) return;
    if (!partnerOnline()) { toast('Voice needs your partner online 🎙️'); return; }
    try {
      var on = mp.setVoice(!mp.isVoiceOn());
      if (on) toast('Mic on — waiting for ' + partnerLabel() + ' 🎙️');
    } catch (e) { toast('Couldn\'t reach the mic — check permissions 🎙️'); }
  };
  if (mp && mp.onVoiceState) mp.onVoiceState(refresh);
  return voiceFab;
}

/* ---------------- init ---------------- */
function init(w, m) {
  worldApi = w; mp = m;
  try { myName = w.getPlayerName() || 'You'; } catch (e) {}

  buildDreamPointsPill();
  loadDecks().then(function () { /* deck shelf ready */ });

  var bar = el('div', 'position:fixed;right:14px;top:50%;transform:translateY(-50%);z-index:60;' +
    'display:flex;flex-direction:column;gap:12px;');
  bar.appendChild(buildChat());
  bar.appendChild(buildEmotes());
  bar.appendChild(buildGifts());
  bar.appendChild(buildHug());
  bar.appendChild(buildVoice());
  // M3: Today button
  var todayFab = el('button', btnCss(), '📅');
  todayFab.setAttribute('aria-label', 'Today');
  todayFab.title = 'Today';
  todayFab.onclick = function () { openToday(); };
  bar.appendChild(todayFab);
  // M7: Mood button
  var moodFab = el('button', btnCss(), '😊');
  moodFab.setAttribute('aria-label', 'Mood check-in');
  moodFab.title = 'Mood';
  moodFab.onclick = function () { openMood(); };
  bar.appendChild(moodFab);
  // M7: Letters button
  var letterFab = el('button', btnCss(), '💌');
  letterFab.setAttribute('aria-label', 'Love letters');
  letterFab.title = 'Letters';
  letterFab.onclick = function () { openLetters(); };
  bar.appendChild(letterFab);
  // M7: Coupons button
  var couponFab = el('button', btnCss(), '🎟️');
  couponFab.setAttribute('aria-label', 'Coupons');
  couponFab.title = 'Coupons';
  couponFab.onclick = function () { openCoupons(); };
  bar.appendChild(couponFab);
  // M8: Miss You button (always available)
  var missFab = el('button', btnCss(), '💫');
  missFab.setAttribute('aria-label', 'Miss you');
  missFab.title = 'Miss you';
  missFab.onclick = function () { sendMissYou(); };
  bar.appendChild(missFab);
  // M5: Games button
  var gameFab = el('button', btnCss(), '🎮');
  gameFab.setAttribute('aria-label', 'Games');
  gameFab.title = 'Games';
  gameFab.onclick = function () { openGames(); };
  bar.appendChild(gameFab);
  // Decorate button
  var decorFab = el('button', btnCss(), '🌸');
  decorFab.setAttribute('aria-label', 'Decorate island');
  decorFab.title = 'Decorate';
  decorFab.onclick = function () { openDecorate(); };
  bar.appendChild(decorFab);
  document.body.appendChild(bar);

  // M3: show Today on app open (once per day)
  try {
    var todayShown = localStorage.getItem('kanavu-today-shown');
    var today = todayStr();
    if (todayShown !== today) {
      localStorage.setItem('kanavu-today-shown', today);
      setTimeout(function () { openToday(); }, 1500); // let the world settle first
    }
  } catch (e) {}

  if (!mp) return;

  mp.onMessage('chat', function (m) { pushChat('them', m.from, m.data.text || ''); });
  mp.onMessage('emote', function (m) {
    try { worldApi.playPartnerEmote(m.data.name); } catch (e) {}
  });
  mp.onMessage('gift', function (m) {
    try { worldApi.showGift(m.data.emoji); } catch (e) {}
    toast(m.from + ' sent you ' + (m.data.emoji || '🎁') + '!');
    // M2: nudge if the app is in background
    try {
      if (document.hidden && window.KanavuNudge) {
        window.KanavuNudge.nudge('Kanavu 💛', 'a gift arrived 🎁', 'gift');
      }
    } catch (e) {}
  });
  mp.onMessage('hug-request', function (m) { showHugRequest(m.from); });
  mp.onMessage('hug-accept', function () {
    try { worldApi.startHug(); } catch (e) {}
    toast('Hug! 🤗');
  });
  mp.onMessage('hug-decline', function () { toast('Maybe later 💛'); });
  mp.onMessage('question', function (m) {
    var key = (m.data.deck ? m.data.deck + ':' : '') + m.data.q;
    var rec = theatreAnswers[key] || (theatreAnswers[key] = {});
    rec.theirs = m.data.a; rec.theirName = m.from;
    if (theatreModal && key === answerKey()) renderTheatreQ();
    toast('💛 ' + m.from + ' answered your question — don\'t leave them hanging!');
  });
  mp.onMessage('notify', function (m) { toast(m.data.text || ''); });
  mp.onMessage('beacon', function (m) {
    if (m.data && m.data.lit) {
      toast('🔥 ' + m.from + ' lit their beacon — light yours too!');
      try { if (worldApi && worldApi.spawnHearts) worldApi.spawnHearts(6); } catch (e) {}
    }
  });
  mp.onMessage('mood', function (m) {
    if (m.data && m.data.mood) {
      toast('💛 ' + m.from + ' is feeling ' + m.data.mood.toLowerCase() + ' today');
    }
  });
  mp.onMessage('letter', function (m) {
    if (m.data && m.data.title) {
      var letters = getLetters();
      // Avoid duplicates
      var exists = letters.some(function (l) { return l.title === m.data.title && l.openDate === m.data.openDate; });
      if (!exists) {
        letters.push({ title: m.data.title, body: m.data.body, openDate: m.data.openDate, from: m.from, at: Date.now() });
        saveLetters(letters);
      }
      toast('💌 ' + m.from + ' wrote you a letter: "' + m.data.title + '"');
    }
  });
  mp.onMessage('coupon', function (m) {
    if (m.data && m.data.name) {
      toast('🎟️ ' + m.from + ' redeemed: ' + (m.data.icon || '') + ' ' + m.data.name + '!');
      try { if (worldApi && worldApi.spawnHearts) worldApi.spawnHearts(10); } catch (e) {}
    }
  });
  mp.onMessage('missyou', function (m) {
    toast('💫 ' + m.from + ' misses you!');
    try {
      if (navigator.vibrate) navigator.vibrate([50, 100, 50]);
      if (worldApi && worldApi.shootingStar) worldApi.shootingStar();
      if (worldApi && worldApi.spawnHearts) worldApi.spawnHearts(8);
    } catch (e) {}
    // M2: nudge if in background
    try {
      if (document.hidden && window.KanavuNudge) {
        window.KanavuNudge.nudge('Kanavu 💛', m.from + ' misses you 💫', 'missyou');
      }
    } catch (e) {}
  });
  /* M5: game sync */
  mp.onMessage('likely', function (m) {
    if (gameState && m.data && m.data.idx === gameState.idx && !gameState.theirs) {
      gameState.theirs = m.data.pick;
      gameState.theirName = m.from;
      renderLikely();
      toast('🤔 ' + m.from + ' picked!');
    }
  });
  mp.onMessage('thisthat', function (m) {
    if (gameState && m.data && m.data.idx === gameState.idx && (gameState.theirs === null || gameState.theirs === undefined)) {
      gameState.theirs = m.data.pick;
      gameState.theirName = m.from;
      renderThisThat();
      toast('⚖️ ' + m.from + ' picked!');
    }
  });
  mp.onMessage('fastqa', function (m) {
    if (gameState && m.data && gameState.answers[m.data.idx]) {
      gameState.answers[m.data.idx].theirs = m.data.a;
      gameState.answers[m.data.idx].theirName = m.from;
      if (gameModal) renderFastQA();
    }
  });
  mp.onMessage('watch', function (m) {
    if (m.data && m.data.vid) {
      toast('🎬 ' + m.from + ' wants to watch together!');
      openWatch();
      setTimeout(function () {
        var player = document.querySelector('#ks-watch-player');
        if (player) {
          player.innerHTML = '<iframe width="100%" height="220" src="https://www.youtube.com/embed/' + m.data.vid +
            '?autoplay=1" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen ' +
            'style="border-radius:12px;"></iframe>';
        }
      }, 300);
    }
  });

  mp.onPresence(function (p) {
    if (p.online) {
      toast('💛 ' + (p.name || 'Your partner') + ' is online');
      try { worldApi.spawnHearts(8); } catch (e) {}
    } else {
      toast((p.name || 'Your partner') + ' went offline');
    }
    if (theatreModal) renderTheatreQ();
  });
}

window.KanavuSocial = { init: init, openTheatre: openTheatre, openBuilding: openBuilding, toast: toast, BUILDING_INFO: BUILDING_INFO, addDreamPoints: addDreamPoints, version: 'social-2.0' };
})();
