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
    'width:52px;height:52px;border-radius:50%;border:1px solid rgba(245,200,110,.45);' +
    'background:rgba(26,14,18,.72);color:#f5d9a8;font-size:22px;cursor:pointer;' +
    'backdrop-filter:blur(6px);box-shadow:0 4px 14px rgba(0,0,0,.4);' +
    'display:flex;align-items:center;justify-content:center;position:relative;';
}

/* ---------------- toast notifications ---------------- */
var toastBox = null;
function toast(msg, ms) {
  if (!toastBox) {
    toastBox = el('div', 'position:fixed;left:50%;transform:translateX(-50%);bottom:110px;z-index:120;' +
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
  var pop = el('div', 'position:fixed;right:78px;top:50%;transform:translateY(-50%);z-index:115;display:none;' +
    'background:rgba(42,21,26,.96);border:1px solid rgba(245,200,110,.3);border-radius:16px;padding:12px;' +
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
  var pop = el('div', 'position:fixed;right:78px;top:50%;transform:translateY(-50%);z-index:115;display:none;' +
    'background:rgba(42,21,26,.96);border:1px solid rgba(245,200,110,.3);border-radius:16px;padding:14px;' +
    BASE_FONT + 'color:#ffe9b8;font-size:14px;text-align:center;');
  pop.innerHTML = '<div style="margin-bottom:10px;letter-spacing:.08em;">SEND A GIFT</div>';
  var row = el('div', 'display:flex;gap:8px;justify-content:center;');
  GIFTS.forEach(function (g) {
    var b = el('button', 'width:52px;height:52px;font-size:28px;border-radius:12px;cursor:pointer;' +
      'background:rgba(255,248,236,.07);border:1px solid rgba(245,200,110,.25);', g);
    b.onclick = function () {
      if (mp) {
        if (mp.sendMsg('gift', { emoji: g })) toast('Sent ' + g + ' to ' + partnerLabel());
        else toast('Your partner isn\'t here yet — gift saved for later 💛');
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
  hugFab.title = 'Hug?';
  hugFab.onclick = function () {
    hugCooldownUntil = Date.now() + 20000;
    hugFab.style.display = 'none';
    if (mp.sendMsg('hug-request', {})) toast('Hug request sent 💛');
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
var theatreAnswers = {}; // qIndex -> {mine, theirs, theirName}
var theatreModal = null, theatreQ = null, theatreA = null;

function openTheatre() {
  if (theatreModal) { document.body.removeChild(theatreModal); theatreModal = null; }
  var m = el('div', 'position:fixed;inset:0;z-index:130;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(20,10,14,.72);backdrop-filter:blur(4px);' + BASE_FONT);
  m.innerHTML =
    '<div style="background:linear-gradient(180deg,#3a2126,#241318);border:1px solid rgba(245,200,110,.4);' +
    'border-radius:20px;padding:28px 30px;max-width:420px;width:90%;color:#f4e8d8;text-align:center;' +
    'box-shadow:0 16px 60px rgba(0,0,0,.6);max-height:86vh;overflow-y:auto;">' +
    '<div style="font-size:13px;letter-spacing:.3em;color:rgba(245,200,110,.7);margin-bottom:6px;">★ THEATRE ★</div>' +
    '<div style="font-size:18px;margin-bottom:4px;">Questions for two</div>' +
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
    '<button id="ks-tclose" style="margin-top:16px;background:none;border:none;color:rgba(244,232,216,.45);' +
    'font-family:inherit;font-size:13px;cursor:pointer;">close</button></div>';
  document.body.appendChild(m);
  theatreModal = m;
  theatreQ = m.querySelector('#ks-tq');
  theatreA = m.querySelector('#ks-ta');
  renderTheatreQ();
  m.querySelector('#ks-tans').onclick = function () {
    var v = m.querySelector('#ks-tin').value.trim();
    if (!v) return;
    m.querySelector('#ks-tin').value = '';
    var rec = theatreAnswers[theatreIdx] || (theatreAnswers[theatreIdx] = {});
    rec.mine = v;
    if (mp) {
      if (mp.sendMsg('question', { q: theatreIdx, a: v })) {
        if (!partnerOnline()) toast('Answer saved — ' + partnerLabel() + ' will see it when they\'re here 💛');
      }
    }
    renderTheatreQ();
  };
  m.querySelector('#ks-tnext').onclick = function () {
    theatreIdx = (theatreIdx + 1) % QUESTIONS.length;
    renderTheatreQ();
  };
  m.querySelector('#ks-tclose').onclick = function () {
    document.body.removeChild(m); theatreModal = null;
  };
  m.addEventListener('click', function (e) { if (e.target === m) { document.body.removeChild(m); theatreModal = null; } });
}
function renderTheatreQ() {
  if (!theatreQ) return;
  theatreQ.textContent = '“' + QUESTIONS[theatreIdx] + '”';
  var rec = theatreAnswers[theatreIdx] || {};
  var html = '';
  if (rec.mine) html += '<div style="margin-bottom:8px;"><b style="color:#f5c98a;">You:</b> ' + escHtml(rec.mine) + '</div>';
  if (rec.theirs) html += '<div><b style="color:#f5c98a;">' + escHtml(rec.theirName || 'Partner') + ':</b> ' + escHtml(rec.theirs) + '</div>';
  if (!html) html = '<div style="color:rgba(244,232,216,.45);font-style:italic;">' +
    (partnerOnline() ? 'waiting for your answers… don\'t leave each other hanging 💛' : 'your partner isn\'t here yet — answer anyway, they\'ll see it 💛') + '</div>';
  else if (!rec.theirs && partnerOnline()) html += '<div style="color:rgba(244,232,216,.45);font-style:italic;margin-top:6px;">waiting for ' + escHtml(partnerLabel()) + '…</div>';
  theatreA.innerHTML = html;
}

/* ---------------- voice toggle ---------------- */
var voiceFab = null;
function buildVoice() {
  voiceFab = el('button', btnCss() + 'opacity:.45;', '🎙️');
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

  var bar = el('div', 'position:fixed;right:14px;top:50%;transform:translateY(-50%);z-index:60;' +
    'display:flex;flex-direction:column;gap:12px;');
  bar.appendChild(buildChat());
  bar.appendChild(buildEmotes());
  bar.appendChild(buildGifts());
  bar.appendChild(buildHug());
  bar.appendChild(buildVoice());
  document.body.appendChild(bar);

  if (!mp) return;

  mp.onMessage('chat', function (m) { pushChat('them', m.from, m.data.text || ''); });
  mp.onMessage('emote', function (m) {
    try { worldApi.playPartnerEmote(m.data.name); } catch (e) {}
  });
  mp.onMessage('gift', function (m) {
    try { worldApi.showGift(m.data.emoji); } catch (e) {}
    toast(m.from + ' sent you ' + (m.data.emoji || '🎁') + '!');
  });
  mp.onMessage('hug-request', function (m) { showHugRequest(m.from); });
  mp.onMessage('hug-accept', function () {
    try { worldApi.startHug(); } catch (e) {}
    toast('Hug! 🤗');
  });
  mp.onMessage('hug-decline', function () { toast('Maybe later 💛'); });
  mp.onMessage('question', function (m) {
    var rec = theatreAnswers[m.data.q] || (theatreAnswers[m.data.q] = {});
    rec.theirs = m.data.a; rec.theirName = m.from;
    if (theatreModal && m.data.q === theatreIdx) renderTheatreQ();
    toast('💛 ' + m.from + ' answered your question — don\'t leave them hanging!');
  });
  mp.onMessage('notify', function (m) { toast(m.data.text || ''); });

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

window.KanavuSocial = { init: init, openTheatre: openTheatre, toast: toast, version: 'social-1.0' };
})();
