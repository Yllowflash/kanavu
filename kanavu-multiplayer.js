/* ============================================================================
 * Kanavu — kanavu-multiplayer.js  (Phase 5: invite-only multiplayer)
 * ----------------------------------------------------------------------------
 * Invite-only co-op for two partners using Supabase Realtime (Broadcast +
 * Presence). No database tables required — everything runs over ephemeral
 * realtime channels.
 *
 * Flow:
 *   A (host):  generateCode() → displays "KAN-XXX", subscribes to
 *              invite channel, waits for join-request.
 *   B (joiner): joinCode("KAN-XXX") → subscribes to invite channel,
 *              broadcasts join-request.
 *   A: receives request → creates pairId, broadcasts join-accept.
 *   Both: subscribe to pair channel, sync positions at 10Hz, track
 *         presence for online/offline.
 *
 * API:
 *   var mp = KanavuMultiplayer.init(worldApi, opts);
 *   mp.generateCode()          -> Promise<string>  ("KAN-4X2")
 *   mp.joinCode(code)          -> Promise<{pairId, partnerName}>
 *   mp.setOnline(bool)
 *   mp.onPartner(fn)           // fn({x,y,z,yaw,moving,sitting,name})
 *   mp.onPresence(fn)          // fn({online: bool, name})
 *   mp.getPartner()            // {name, online} | null
 *   mp.getPairId()
 *   mp.disconnect()
 *
 * Vanilla JS. Requires Supabase JS v2 loaded globally (window.supabase).
 * ========================================================================== */
(function () {
'use strict';

/* ---------------- config ---------------- */
var SUPABASE_URL = 'https://ersejxowxutsefalyjaf.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_lGEyfvUYZqa5B5l5uwNizQ_APQcmK8i';
// Allow override via window.KANAVU_CONFIG (loaded from config.js if present)
try {
  if (window.KANAVU_CONFIG && window.KANAVU_CONFIG.SUPABASE_URL) {
    SUPABASE_URL = window.KANAVU_CONFIG.SUPABASE_URL;
    SUPABASE_ANON_KEY = window.KANAVU_CONFIG.ANON_KEY || window.KANAVU_CONFIG.SUPABASE_ANON_KEY;
  }
} catch (e) {}

var CODE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
var SYNC_HZ = 10;
var SYNC_INTERVAL = 1000 / SYNC_HZ;
var POS_EPSILON = 0.4;   // min units moved before re-broadcast
var YAW_EPSILON = 0.12;  // min radians turned before re-broadcast
var LS_KEY = 'kanavu_mp_pair';

/* ---------------- utils ---------------- */
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
function randomCode() {
  var chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I, L, O, 0, 1 (confusable)
  var s = '';
  for (var i = 0; i < 3; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return 'KAN-' + s;
}
function loadPair() {
  try {
    var raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function savePair(p) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch (e) {}
}
function clearPair() {
  try { localStorage.removeItem(LS_KEY); } catch (e) {}
}

function stubWorld() {
  return {
    getPlayerPos: function () { return { x: 0, y: 0, z: 0 }; },
    getPlayerAnim: function () { return { moving: false, sitting: false, yaw: 0 }; },
    setPartnerRemote: function () {},
    setPartnerNet: function () {},
    setPartnerOnline: function () {}
  };
}

/* ================= main ================= */
function init(worldApi, opts) {
  opts = opts || {};
  var playerName = opts.playerName || 'Player';
  var myId = opts.userId || ('u_' + uuid().slice(0, 8));
  // worldApi may be a stub until the 3D world loads; swap with setWorldApi()
  if (!worldApi) worldApi = stubWorld();
  if (!window.supabase) throw new Error('[mp] Supabase JS v2 not loaded (window.supabase missing)');

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    realtime: { params: { eventsPerSecond: 20 } }
  });

  var state = {
    role: null,           // 'host' | 'joiner'
    myRole: opts.myRole === 'girl' ? 'girl' : 'boy', // character I play
    code: null,
    codeCreatedAt: 0,
    pairId: null,
    partnerName: null,
    partnerOnline: false,
    inviteChannel: null,
    pairChannel: null,
    syncTimer: null,
    lastSent: { x: 0, y: 0, z: 0, yaw: 0, moving: false, sitting: false },
    partnerCbs: [],
    presenceCbs: [],
    destroyed: false
  };

  /* ---------- internal: broadcast position ---------- */
  function broadcastPos(force) {
    if (!state.pairChannel || state.destroyed) return;
    var pos, anim;
    try {
      pos = worldApi.getPlayerPos();
      anim = worldApi.getPlayerAnim ? worldApi.getPlayerAnim() : { moving: false, sitting: false, yaw: 0 };
    } catch (e) { return; }
    var dx = pos.x - state.lastSent.x, dz = pos.z - state.lastSent.z;
    var moved = Math.hypot(dx, dz) > POS_EPSILON;
    var turned = Math.abs(anim.yaw - state.lastSent.yaw) > YAW_EPSILON;
    var animChanged = anim.moving !== state.lastSent.moving || anim.sitting !== state.lastSent.sitting;
    if (!force && !moved && !turned && !animChanged) return;
    state.lastSent = { x: pos.x, y: pos.y, z: pos.z, yaw: anim.yaw, moving: anim.moving, sitting: anim.sitting };
    state.pairChannel.send({
      type: 'broadcast',
      event: 'pos',
      payload: {
        id: myId, name: playerName,
        x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2),
        yaw: +anim.yaw.toFixed(3),
        moving: anim.moving, sitting: anim.sitting,
        t: Date.now()
      }
    });
  }

  function startSync() {
    stopSync();
    // Send initial position immediately
    broadcastPos(true);
    state.syncTimer = setInterval(function () { broadcastPos(false); }, SYNC_INTERVAL);
  }
  function stopSync() {
    if (state.syncTimer) { clearInterval(state.syncTimer); state.syncTimer = null; }
  }

  /* ---------- generic social messaging (chat, emotes, gifts, hugs, questions) ---------- */
  var msgCbs = {}; // type -> [fn]
  function onMessage(type, fn) {
    if (typeof fn !== 'function') return;
    (msgCbs[type] = msgCbs[type] || []).push(fn);
  }
  function sendMsg(type, data) {
    if (!state.pairChannel || state.destroyed) return false;
    try {
      state.pairChannel.send({
        type: 'broadcast',
        event: 'kvmsg',
        payload: { id: myId, name: playerName, type: type, data: data || {}, t: Date.now() }
      });
      return true;
    } catch (e) { return false; }
  }
  function handleKvMsg(msg) {
    var p = msg.payload;
    if (!p || p.id === myId || !p.type) return;
    var cbs = msgCbs[p.type] || [];
    for (var i = 0; i < cbs.length; i++) {
      try { cbs[i]({ type: p.type, data: p.data, from: p.name || 'partner', t: p.t }); } catch (e) {}
    }
  }

  /* ---------- voice chat (WebRTC, Supabase Realtime signaling) ---------- */
  var voice = { want: false, peer: false, pc: null, stream: null, audioEl: null };
  var voiceCbs = [];
  function onVoiceState(fn) { if (typeof fn === 'function') voiceCbs.push(fn); }
  function emitVoice() {
    for (var i = 0; i < voiceCbs.length; i++) {
      try { voiceCbs[i]({ mine: voice.want, peer: voice.peer, live: !!(voice.pc) }); } catch (e) {}
    }
  }
  function ensureMic() {
    if (voice.stream) return Promise.resolve(voice.stream);
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then(function (s) { voice.stream = s; return s; });
  }
  function remoteAudio(stream) {
    try {
      if (!voice.audioEl) { voice.audioEl = new Audio(); voice.audioEl.autoplay = true; }
      voice.audioEl.srcObject = stream;
      var pr = voice.audioEl.play();
      if (pr && pr.catch) pr.catch(function () {});
    } catch (e) {}
  }
  function voiceStopPc() {
    if (voice.pc) { try { voice.pc.close(); } catch (e) {} voice.pc = null; }
    emitVoice();
  }
  function maybeVoiceStart() {
    if (!voice.want || !voice.peer || voice.pc || !state.pairChannel || state.destroyed) return;
    if (state.role !== 'host') return; // host calls; joiner answers
    startVoicePc(true);
  }
  function startVoicePc(isCaller) {
    try {
      var pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      voice.pc = pc;
      voice.stream.getTracks().forEach(function (tr) { pc.addTrack(tr, voice.stream); });
      pc.onicecandidate = function (e) {
        if (e.candidate) sendMsg('voice-signal', { kind: 'ice', c: e.candidate.toJSON() });
      };
      pc.ontrack = function (e) { if (e.streams && e.streams[0]) remoteAudio(e.streams[0]); };
      pc.onconnectionstatechange = function () {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') voiceStopPc();
      };
      if (isCaller) {
        pc.createOffer().then(function (o) { return pc.setLocalDescription(o); })
          .then(function () { sendMsg('voice-signal', { kind: 'offer', sdp: pc.localDescription.toJSON() }); })
          .catch(function () { voiceStopPc(); });
      }
      emitVoice();
    } catch (e) { voiceStopPc(); }
  }
  function setVoice(on) {
    voice.want = !!on;
    sendMsg('voice-state', { on: voice.want });
    if (voice.want) {
      ensureMic().then(function () { maybeVoiceStart(); emitVoice(); })
        .catch(function () { voice.want = false; emitVoice(); });
    } else {
      voiceStopPc();
    }
    emitVoice();
    return voice.want;
  }
  onMessage('voice-state', function (m) {
    voice.peer = !!(m.data && m.data.on);
    if (voice.peer && voice.want) maybeVoiceStart();
    else if (!voice.peer) voiceStopPc();
    else emitVoice();
  });
  onMessage('voice-signal', function (m) {
    var d = m.data || {};
    try {
      if (d.kind === 'offer' && voice.want && !voice.pc) {
        ensureMic().then(function () {
          startVoicePc(false);
          var pc = voice.pc;
          pc.setRemoteDescription(new RTCSessionDescription(d.sdp))
            .then(function () { return pc.createAnswer(); })
            .then(function (a) { return pc.setLocalDescription(a); })
            .then(function () { sendMsg('voice-signal', { kind: 'answer', sdp: pc.localDescription.toJSON() }); })
            .catch(function () { voiceStopPc(); });
        }).catch(function () {});
      } else if (d.kind === 'answer' && voice.pc) {
        voice.pc.setRemoteDescription(new RTCSessionDescription(d.sdp)).catch(function () {});
      } else if (d.kind === 'ice' && voice.pc) {
        voice.pc.addIceCandidate(new RTCIceCandidate(d.c)).catch(function () {});
      }
    } catch (e) {}
  });

  /* ---------- internal: pair channel ---------- */
  function subscribePairChannel(pairId) {
    if (state.pairChannel) { try { sb.removeChannel(state.pairChannel); } catch (e) {} }
    var ch = sb.channel('kanavu-pair-' + pairId, {
      config: { broadcast: { self: false }, presence: { key: myId } }
    });

    ch.on('broadcast', { event: 'pos' }, function (msg) {
      var p = msg.payload;
      if (!p || p.id === myId) return;
      try {
        if (worldApi.setPartnerRemote) worldApi.setPartnerRemote(true);
        if (worldApi.setPartnerNet) worldApi.setPartnerNet(p.x, p.y, p.z, p.yaw, p.moving, p.sitting);
      } catch (e) {}
      // Notify listeners
      state.partnerCbs.forEach(function (fn) {
        try { fn({ x: p.x, y: p.y, z: p.z, yaw: p.yaw, moving: p.moving, sitting: p.sitting, name: p.name || state.partnerName }); } catch (e) {}
      });
    });

    ch.on('broadcast', { event: 'kvmsg' }, handleKvMsg);

    ch.on('presence', { event: 'sync' }, function () {
      var pres = ch.presenceState();
      var others = Object.keys(pres).filter(function (k) { return k !== myId; });
      var online = others.length > 0;
      if (online !== state.partnerOnline) {
        state.partnerOnline = online;
        try {
          if (worldApi.setPartnerRemote) worldApi.setPartnerRemote(online);
          if (worldApi.setPartnerOnline) worldApi.setPartnerOnline(true); // AI fallback when offline
        } catch (e) {}
        state.presenceCbs.forEach(function (fn) {
          try { fn({ online: online, name: state.partnerName }); } catch (e) {}
        });
      }
    });

    ch.subscribe(function (status) {
      if (status === 'SUBSCRIBED') {
        ch.track({ id: myId, name: playerName, at: Date.now() });
        startSync();
      }
    });

    state.pairChannel = ch;
  }

  /* ---------- public: host flow ---------- */
  function generateCode() {
    return new Promise(function (resolve, reject) {
      cleanupInvite();
      var code = randomCode();
      state.role = 'host';
      state.code = code;
      state.codeCreatedAt = Date.now();

      var ch = sb.channel('kanavu-invite-' + code, {
        config: { broadcast: { self: false } }
      });

      ch.on('broadcast', { event: 'join-request' }, function (msg) {
        var p = msg.payload;
        if (!p || !p.id || p.id === myId) return;
        // Check code not expired
        if (Date.now() - state.codeCreatedAt > CODE_TTL_MS) {
          ch.send({ type: 'broadcast', event: 'join-reject', payload: { to: p.id, reason: 'expired' } });
          return;
        }
        // Create pairing
        var pairId = uuid();
        state.pairId = pairId;
        state.partnerName = p.name || 'Partner';
        savePair({ pairId: pairId, partnerName: state.partnerName, role: 'host', myRole: state.myRole, at: Date.now() });
        // Tell joiner
        ch.send({
          type: 'broadcast', event: 'join-accept',
          payload: { to: p.id, pairId: pairId, hostName: playerName, hostRole: state.myRole }
        });
        // Switch to pair channel
        cleanupInvite();
        subscribePairChannel(pairId);
        resolve_pair();
      });

      var resolved = false;
      function resolve_pair() {
        if (!resolved) { resolved = true; /* keep promise pending for host — code stays valid */ }
      }

      ch.subscribe(function (status) {
        if (status === 'SUBSCRIBED') resolve(code);
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error('Realtime unavailable'));
      });

      state.inviteChannel = ch;
      // Safety: auto-cleanup invite after TTL
      setTimeout(function () { if (state.role === 'host' && !state.pairId) cleanupInvite(); }, CODE_TTL_MS);
    });
  }

  function cleanupInvite() {
    if (state.inviteChannel) {
      try { sb.removeChannel(state.inviteChannel); } catch (e) {}
      state.inviteChannel = null;
    }
  }

  /* ---------- public: joiner flow ---------- */
  function joinCode(code) {
    return new Promise(function (resolve, reject) {
      code = (code || '').trim().toUpperCase();
      if (!/^KAN-[A-Z2-9]{3}$/.test(code)) {
        reject(new Error('Invalid code format. Expected like KAN-4X2.'));
        return;
      }
      cleanupInvite();
      state.role = 'joiner';

      var ch = sb.channel('kanavu-invite-' + code, {
        config: { broadcast: { self: false } }
      });
      var done = false;
      var timeout = setTimeout(function () {
        if (!done) { done = true; cleanupInvite(); reject(new Error('No host found. Check the code and try again.')); }
      }, 15000);

      ch.on('broadcast', { event: 'join-accept' }, function (msg) {
        var p = msg.payload;
        if (!p || p.to !== myId || done) return;
        done = true; clearTimeout(timeout);
        state.pairId = p.pairId;
        state.partnerName = p.hostName || 'Partner';
        state.myRole = (p.hostRole === 'boy') ? 'girl' : 'boy'; // joiner takes the other character
        savePair({ pairId: p.pairId, partnerName: state.partnerName, role: 'joiner', myRole: state.myRole, at: Date.now() });
        cleanupInvite();
        subscribePairChannel(p.pairId);
        resolve({ pairId: p.pairId, partnerName: state.partnerName, myRole: state.myRole });
      });

      ch.on('broadcast', { event: 'join-reject' }, function (msg) {
        var p = msg.payload;
        if (!p || p.to !== myId || done) return;
        done = true; clearTimeout(timeout);
        cleanupInvite();
        reject(new Error(p.reason === 'expired' ? 'This invite code has expired.' : 'Join rejected.'));
      });

      ch.subscribe(function (status) {
        if (status === 'SUBSCRIBED') {
          ch.send({
            type: 'broadcast', event: 'join-request',
            payload: { id: myId, name: playerName, role: state.myRole, at: Date.now() }
          });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (!done) { done = true; clearTimeout(timeout); reject(new Error('Realtime unavailable')); }
        }
      });

      state.inviteChannel = ch;
    });
  }

  /* ---------- public: misc ---------- */
  function setOnline(b) {
    // Toggle presence tracking (graceful degradation)
    try {
      if (state.pairChannel) {
        if (b) state.pairChannel.track({ id: myId, name: playerName, at: Date.now() });
        else state.pairChannel.untrack();
      }
      if (worldApi.setPartnerRemote) worldApi.setPartnerRemote(!!b && state.partnerOnline);
    } catch (e) {}
  }

  function onPartner(fn) { if (typeof fn === 'function') state.partnerCbs.push(fn); }
  function onPresence(fn) { if (typeof fn === 'function') state.presenceCbs.push(fn); }
  function getPartner() {
    return state.pairId ? { name: state.partnerName, online: state.partnerOnline, pairId: state.pairId } : null;
  }
  function getPairId() { return state.pairId; }

  function disconnect() {
    state.destroyed = true;
    stopSync();
    cleanupInvite();
    if (state.pairChannel) { try { sb.removeChannel(state.pairChannel); } catch (e) {} state.pairChannel = null; }
    try {
      if (worldApi.setPartnerRemote) worldApi.setPartnerRemote(false);
      if (worldApi.setPartnerOnline) worldApi.setPartnerOnline(true);
    } catch (e) {}
    state.pairId = null; state.partnerName = null; state.partnerOnline = false;
  }

  /* ---------- auto-rejoin saved pair ---------- */
  (function autoRejoin() {
    var saved = loadPair();
    if (saved && saved.pairId) {
      // Don't auto-subscribe immediately — wait for explicit user action via UI,
      // but pre-fill so the UI can show "Reconnect to {name}".
      state._savedPair = saved;
    }
  })();

  function reconnectSaved() {
    var s = state._savedPair || loadPair();
    if (!s || !s.pairId) return Promise.reject(new Error('No saved pairing.'));
    state.pairId = s.pairId;
    state.partnerName = s.partnerName;
    if (s.myRole) state.myRole = s.myRole;
    subscribePairChannel(s.pairId);
    return Promise.resolve({ pairId: s.pairId, partnerName: s.partnerName, myRole: state.myRole });
  }

  function setWorldApi(api) {
    if (api) worldApi = api;
  }

  /* ================= invite UI ================= */
  var uiEl = null;
  function showUI() {
    hideUI();
    var el = document.createElement('div');
    el.id = 'kv-mp-ui';
    el.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(20,10,14,.72);backdrop-filter:blur(4px);font-family:Georgia,serif;';
    el.innerHTML =
      '<div style="background:linear-gradient(180deg,#3a2126,#2a151a);border:1px solid rgba(245,200,110,.35);border-radius:18px;padding:28px 32px;max-width:340px;width:88%;text-align:center;color:#f4e8d8;box-shadow:0 12px 48px rgba(0,0,0,.5);">' +
      '<div style="font-size:20px;letter-spacing:.15em;margin-bottom:6px;">WALK TOGETHER</div>' +
      '<div style="font-size:13px;color:rgba(244,232,216,.6);margin-bottom:20px;font-style:italic;">invite-only · just the two of you</div>' +
      '<div id="kvmp-name-row" style="margin-bottom:14px;">' +
      '<input id="kvmp-name" placeholder="Your name" value="' + escHtml(playerName === 'Player' ? '' : playerName) + '" ' +
      'style="width:100%;padding:10px 14px;border-radius:10px;border:1px solid rgba(245,200,110,.3);background:rgba(0,0,0,.3);color:#f4e8d8;font-family:inherit;font-size:15px;text-align:center;"/>' +
      '</div>' +
      '<div id="kvmp-main">' +
      '<button id="kvmp-host" style="display:block;width:100%;margin-bottom:10px;padding:13px;border:none;border-radius:12px;background:linear-gradient(180deg,#ffe9b8,#f5a86e);color:#2a1a12;font-family:inherit;font-size:15px;letter-spacing:.08em;cursor:pointer;">Invite Partner</button>' +
      '<button id="kvmp-join" style="display:block;width:100%;padding:13px;border:1px solid rgba(245,200,110,.4);border-radius:12px;background:transparent;color:#f5d9a8;font-family:inherit;font-size:15px;letter-spacing:.08em;cursor:pointer;">Enter Invite Code</button>' +
      (state._savedPair ? '<button id="kvmp-reconnect" style="display:block;width:100%;margin-top:10px;padding:11px;border:none;border-radius:12px;background:rgba(245,200,110,.15);color:#f5d9a8;font-family:inherit;font-size:14px;cursor:pointer;">Reconnect to ' + escHtml(state._savedPair.partnerName || 'partner') + '</button>' : '') +
      '</div>' +
      '<div id="kvmp-pane" style="display:none;"></div>' +
      '<button id="kvmp-close" style="margin-top:16px;background:none;border:none;color:rgba(244,232,216,.45);font-family:inherit;font-size:13px;cursor:pointer;letter-spacing:.1em;">close</button>' +
      '</div>';
    document.body.appendChild(el);
    uiEl = el;

    function currentName() {
      var v = (document.getElementById('kvmp-name') || {}).value || '';
      v = v.trim();
      if (v) playerName = v;
      return playerName;
    }
    function pane(html) {
      document.getElementById('kvmp-main').style.display = 'none';
      var p = document.getElementById('kvmp-pane');
      p.style.display = 'block'; p.innerHTML = html;
    }

    document.getElementById('kvmp-close').onclick = hideUI;
    el.addEventListener('click', function (e) { if (e.target === el) hideUI(); });

    var rc = document.getElementById('kvmp-reconnect');
    if (rc) rc.onclick = function () {
      currentName();
      pane('<div style="font-size:14px;">Reconnecting…</div>');
      reconnectSaved().then(function (r) {
        pane('<div style="font-size:15px;color:#a8e6a1;">Connected — walking together.</div>');
        setTimeout(hideUI, 1400);
      }).catch(function (err) {
        pane('<div style="font-size:14px;color:#e6a1a1;">' + escHtml(err.message) + '</div>');
      });
    };

    document.getElementById('kvmp-host').onclick = function () {
      currentName();
      pane('<div style="font-size:14px;">Creating invite…</div>');
      generateCode().then(function (code) {
        pane(
          '<div style="font-size:13px;color:rgba(244,232,216,.6);margin-bottom:8px;">Share this code with your partner<br/>(expires in 24 hours)</div>' +
          '<div style="font-size:34px;letter-spacing:.25em;font-weight:bold;color:#ffe9b8;margin:10px 0;" id="kvmp-code">' + escHtml(code) + '</div>' +
          '<button id="kvmp-copy" style="padding:9px 22px;border:1px solid rgba(245,200,110,.4);border-radius:10px;background:transparent;color:#f5d9a8;font-family:inherit;font-size:14px;cursor:pointer;">Copy code</button>' +
          '<div style="font-size:13px;color:rgba(244,232,216,.55);margin-top:14px;" id="kvmp-wait">Waiting for partner…</div>'
        );
        document.getElementById('kvmp-copy').onclick = function () {
          try {
            if (navigator.clipboard) navigator.clipboard.writeText(code);
            this.textContent = 'Copied!';
          } catch (e) { this.textContent = code; }
        };
        // When partner joins, the pair channel subscribes and presence fires.
        // Poll lightly for pairId to update the waiting text.
        var iv = setInterval(function () {
          if (state.pairId) {
            clearInterval(iv);
            var w = document.getElementById('kvmp-wait');
            if (w) w.innerHTML = '<span style="color:#a8e6a1;">Partner joined — walking together.</span>';
            setTimeout(hideUI, 1600);
          }
        }, 800);
      }).catch(function (err) {
        pane('<div style="font-size:14px;color:#e6a1a1;">' + escHtml(err.message) + '</div>');
      });
    };

    document.getElementById('kvmp-join').onclick = function () {
      currentName();
      pane(
        '<input id="kvmp-code-in" placeholder="KAN-XXX" maxlength="7" ' +
        'style="width:100%;padding:12px;border-radius:10px;border:1px solid rgba(245,200,110,.3);background:rgba(0,0,0,.3);color:#ffe9b8;font-family:inherit;font-size:20px;letter-spacing:.2em;text-align:center;text-transform:uppercase;margin-bottom:12px;"/>' +
        '<button id="kvmp-go" style="width:100%;padding:13px;border:none;border-radius:12px;background:linear-gradient(180deg,#ffe9b8,#f5a86e);color:#2a1a12;font-family:inherit;font-size:15px;cursor:pointer;">Join</button>' +
        '<div id="kvmp-err" style="font-size:13px;color:#e6a1a1;margin-top:10px;min-height:18px;"></div>'
      );
      var inp = document.getElementById('kvmp-code-in');
      inp.focus();
      document.getElementById('kvmp-go').onclick = function () {
        var c = inp.value.trim().toUpperCase();
        document.getElementById('kvmp-err').textContent = 'Connecting…';
        joinCode(c).then(function (r) {
          pane('<div style="font-size:15px;color:#a8e6a1;">Joined ' + escHtml(r.partnerName) + ' — walking together.</div>');
          setTimeout(hideUI, 1400);
        }).catch(function (err) {
          document.getElementById('kvmp-err').textContent = err.message;
        });
      };
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') document.getElementById('kvmp-go').click(); });
    };
  }
  function hideUI() {
    if (uiEl && uiEl.parentNode) uiEl.parentNode.removeChild(uiEl);
    uiEl = null;
  }
  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- public API ---------- */
  return {
    generateCode: generateCode,
    joinCode: joinCode,
    reconnectSaved: reconnectSaved,
    setOnline: setOnline,
    setWorldApi: setWorldApi,
    onPartner: onPartner,
    onPresence: onPresence,
    getPartner: getPartner,
    getPairId: getPairId,
    getMyRole: function () { return state.myRole; },
    setMyRole: function (r) { state.myRole = (r === 'girl') ? 'girl' : 'boy'; },
    sendMsg: sendMsg,
    onMessage: onMessage,
    setVoice: setVoice,
    isVoiceOn: function () { return voice.want; },
    onVoiceState: onVoiceState,
    hasSavedPair: function () { return !!(state._savedPair || loadPair()); },
    getSavedPair: function () { return state._savedPair || loadPair(); },
    showUI: showUI,
    hideUI: hideUI,
    disconnect: disconnect,
    version: 'phase5-2.0'
  };
}

window.KanavuMultiplayer = { init: init };

})();
