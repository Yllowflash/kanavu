/* ============================================================================
 * Kanavu — kanavu-music.js
 * ----------------------------------------------------------------------------
 * Background music: a real lofi hip-hop track with a lush dreamy reverb
 * ("lofi-reverb.mp3"), looped gaplessly through the Web Audio API.
 * If the track cannot be fetched/decoded, falls back to the built-in
 * generative lofi engine (Rhodes-style 7th chords, tanpura drone,
 * sitar-ish lead, boom-bap drums, vinyl texture) so music never breaks.
 *
 * API:
 *   KanavuMusic.start()   -> Promise (call from a user gesture)
 *   KanavuMusic.stop()
 *   KanavuMusic.toggle()  -> bool (now playing?)
 *   KanavuMusic.isPlaying()
 *
 * Vanilla JS, no dependencies.
 * ========================================================================== */
(function () {
'use strict';

var TRACK_URL = 'lofi-reverb.mp3?v=1';

var ctx = null, master = null, comp = null;
var musicBus = null;              // generative engine bus
var trackGain = null;             // track bus (for fades)
var playing = false;
var genTimer = null;              // generative scheduler handle
var genMode = false;              // true when generative fallback is active
var trackBuf = null, trackSrc = null, trackLoad = null;
var startSeq = 0;                 // guards late load completions

/* ================= shared audio graph ================= */
function initCtx() {
  if (ctx) return;
  var AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.55;
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 4;
  master.connect(comp); comp.connect(ctx.destination);

  musicBus = ctx.createGain();
  musicBus.gain.value = getVolume() * 0.9; // saved music volume
  var lp = ctx.createBiquadFilter(); // lofi warmth for the generative engine
  lp.type = 'lowpass'; lp.frequency.value = 2200; lp.Q.value = 0.4; // darker, warmer: no harsh highs
  musicBus.connect(lp); lp.connect(master);
  // gentle wow/flutter on the generative mix
  var lfo = ctx.createOscillator(); lfo.frequency.value = 0.45;
  var lfoG = ctx.createGain(); lfoG.gain.value = 0.02;
  lfo.connect(lfoG); lfoG.connect(musicBus.gain); lfo.start();

  trackGain = ctx.createGain();
  trackGain.gain.value = 0.0001;
  trackGain.connect(master);
}

/* ================= reverbed track playback ================= */
function ensureTrackLoaded() {
  if (trackBuf) return Promise.resolve(trackBuf);
  if (trackLoad) return trackLoad;
  trackLoad = fetch(TRACK_URL, { cache: 'force-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error('track HTTP ' + r.status);
      return r.arrayBuffer();
    })
    .then(function (ab) {
      return new Promise(function (resolve, reject) {
        ctx.decodeAudioData(ab, resolve, reject);
      });
    })
    .then(function (buf) { trackBuf = buf; return buf; })
    .catch(function (err) { trackLoad = null; throw err; });
  return trackLoad;
}

function playTrack() {
  stopTrackNow();
  trackSrc = ctx.createBufferSource();
  trackSrc.buffer = trackBuf;
  trackSrc.loop = true;
  trackSrc.connect(trackGain);
  trackSrc.start();
  var t = ctx.currentTime;
  trackGain.gain.cancelScheduledValues(t);
  trackGain.gain.setValueAtTime(Math.max(trackGain.gain.value, 0.0001), t);
  trackGain.gain.exponentialRampToValueAtTime(0.9, t + 3.0); // slow dreamy fade-in
  genMode = false;
}

function stopTrackNow() {
  if (trackSrc) {
    try { trackSrc.stop(); } catch (e) {}
    try { trackSrc.disconnect(); } catch (e) {}
    trackSrc = null;
  }
}

function fadeOutTrack() {
  if (!trackSrc) return;
  var src = trackSrc;
  var t = ctx.currentTime;
  trackGain.gain.cancelScheduledValues(t);
  trackGain.gain.setValueAtTime(Math.max(trackGain.gain.value, 0.0001), t);
  trackGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  setTimeout(function () {
    try { src.stop(); } catch (e) {}
    try { src.disconnect(); } catch (e) {}
    if (trackSrc === src) trackSrc = null;
  }, 800);
}

/* ================= generative lofi engine (fallback) ================= */
var nextTime = 0, step = 0;

var BPM = 58; // chill slow lofi: deep and unhurried, no rush
var SIXTEENTH = 60 / BPM / 4;
var SWING = 0.52; // barely swung: indie, not hip-hop

/* dreamy indie progression: Cmaj9 - Am9 - Fmaj9 - Em7 (midi) */
var CHORDS = [
  [48, 52, 55, 59, 62], // Cmaj9
  [45, 48, 52, 55, 59], // Am9
  [41, 45, 48, 52, 55], // Fmaj9
  [40, 43, 47, 50, 55]  // Em7(11)
];
/* soft indie lead: pentatonic-ish, sparse */
var SCALE = [72, 74, 76, 79, 81, 84, 81, 79, 76, 74];
/* minimal indie percussion: soft kick / brush / shaker (16 steps) */
var KICK  = [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0];
var SNARE = [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,0,0]; // soft brush on 2
var HAT   = [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0]; // gentle shaker 8ths

function midi(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function rnd(a, b) { return a + Math.random() * (b - a); }

/* ---- vinyl crackle + hiss ---- */
function startVinyl() {
  var len = ctx.sampleRate * 2;
  var buf = ctx.createBuffer(1, len, ctx.sampleRate);
  var d = buf.getChannelData(0);
  for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
  var src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 4200;
  var g = ctx.createGain(); g.gain.value = 0.016;
  src.connect(f); f.connect(g); g.connect(master); src.start();
  // random pops
  (function pop() {
    if (!playing) { setTimeout(pop, 800); return; }
    setTimeout(function () {
      if (!playing) { pop(); return; }
      var t = ctx.currentTime;
      var o = ctx.createOscillator(); o.type = 'square';
      o.frequency.value = rnd(900, 2600);
      var og = ctx.createGain();
      og.gain.setValueAtTime(rnd(0.02, 0.06), t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + rnd(0.01, 0.03));
      o.connect(og); og.connect(master);
      o.start(t); o.stop(t + 0.05);
      pop();
    }, rnd(300, 2400));
  })();
}

/* ---- instruments ---- */
function rhodesChord(notes, t, dur) {
  notes.forEach(function (m) {
    var f = midi(m) * rnd(0.998, 1.002);
    var o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f;
    var o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
    var fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1100;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    var g2 = ctx.createGain(); g2.gain.value = 0.25;
    o1.connect(fl); o2.connect(g2); g2.connect(fl); fl.connect(g); g.connect(musicBus);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  });
}
function drone(t, dur) { // tanpura sa + pa
  [36, 43].forEach(function (m, i) {
    var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = midi(m);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(i ? 0.028 : 0.04, t + 1.2);
    g.gain.setValueAtTime(i ? 0.028 : 0.04, t + dur - 1.2);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    // soft pluck shimmer on the drone
    var lfo = ctx.createOscillator(); lfo.frequency.value = rnd(4, 7);
    var lg = ctx.createGain(); lg.gain.value = 0.012;
    lfo.connect(lg); lg.connect(g.gain); lfo.start(t); lfo.stop(t + dur);
    o.connect(g); g.connect(musicBus);
    o.start(t); o.stop(t + dur);
  });
}
function pluck(m, t, dur) { // indie fingerpicked guitar: warm triangle, soft attack
  var f = midi(m);
  var o = ctx.createOscillator(); o.type = 'triangle';
  o.frequency.value = f;
  var o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
  var g2 = ctx.createGain(); g2.gain.value = 0.15;
  var fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1200; // warm, no high pitch
  var g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(fl); o2.connect(g2); g2.connect(fl); fl.connect(g); g.connect(musicBus);
  o.start(t); o2.start(t); o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
}
function kick(t, soft) {
  var o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(soft ? 90 : 120, t);
  o.frequency.exponentialRampToValueAtTime(soft ? 45 : 38, t + 0.11);
  var g = ctx.createGain();
  g.gain.setValueAtTime(soft ? 0.22 : 0.5, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (soft ? 0.3 : 0.42));
  o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.5);
}
function brush(t) { // soft brushed snare: airy, no crack
  var n = noiseSrc(0.22);
  var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 0.6;
  var g = ctx.createGain();
  g.gain.setValueAtTime(0.10, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  n.connect(f); f.connect(g); g.connect(musicBus); n.start(t);
}
function shaker(t) { // gentle egg-shaker 8ths (soft, low)
  var n = noiseSrc(0.06);
  var f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 4000; // lower, less harsh
  var g = ctx.createGain();
  g.gain.setValueAtTime(0.025, t); // quieter
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  n.connect(f); f.connect(g); g.connect(musicBus); n.start(t);
}
function snare(t) { // (legacy, unused in indie mode)
  var n = noiseSrc(0.16);
  var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
  var g = ctx.createGain();
  g.gain.setValueAtTime(0.30, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  n.connect(f); f.connect(g); g.connect(musicBus); n.start(t);
  var o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 190;
  var g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.18, t);
  g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
  o.connect(g2); g2.connect(musicBus); o.start(t); o.stop(t + 0.12);
}
function hat(t, open) { // (legacy, unused in indie mode)
  var n = noiseSrc(open ? 0.18 : 0.045);
  var f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7200;
  var g = ctx.createGain();
  g.gain.setValueAtTime(open ? 0.10 : 0.07, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (open ? 0.18 : 0.045));
  n.connect(f); f.connect(g); g.connect(musicBus); n.start(t);
}
var _noiseBuf = null;
function noiseSrc(dur) {
  if (!_noiseBuf) {
    var len = ctx.sampleRate * 1;
    _noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = _noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  var s = ctx.createBufferSource(); s.buffer = _noiseBuf; s.loop = true;
  s.stop(ctx.currentTime + dur + 0.05);
  return s;
}

/* ---- scheduler: 4-bar loop ---- */
function scheduleStep(s, t) {
  var bar = Math.floor(s / 16) % 4;   // 0..3
  var stp = s % 16;
  var swingT = t + (stp % 2 === 1 ? SIXTEENTH * (SWING - 0.5) * 2 : 0);
  var barDur = SIXTEENTH * 16;
  if (stp === 0) {
    rhodesChord(CHORDS[bar], t, barDur * 1.05);
    if (bar === 0) drone(t, barDur * 4);
    if (bar % 2 === 0) scheduleMelody(t); // sparse dreamy phrase every 2 bars
  }
  // Fingerpicked indie arpeggio: gentle 8th-note pattern on chord tones
  if (stp % 2 === 0) {
    var chord = CHORDS[bar];
    var noteIdx = [0, 1, 2, 3, 2, 1, 2, 3][stp / 2]; // Travis-ish picking
    pluck(chord[noteIdx] - 12, swingT, 0.5); // low, warm (one octave down)
  }
  if (KICK[stp]) kick(swingT, true); // soft
  if (SNARE[stp]) brush(swingT); // brushed snare, not cracked
  if (HAT[stp]) shaker(swingT);
}
function scheduleMelody(t) {
  // Very sparse, low: only 1-2 notes per phrase, one octave down
  if (Math.random() < 0.5) return; // half the phrases are silent (space to breathe)
  var n = 1 + Math.floor(Math.random() * 2);
  var idx = Math.floor(Math.random() * SCALE.length);
  var tt = t + SIXTEENTH * 4;
  for (var i = 0; i < n; i++) {
    idx += Math.floor(rnd(-2, 3));
    idx = Math.max(0, Math.min(SCALE.length - 1, idx));
    pluck(SCALE[idx] - 12, tt, rnd(0.8, 1.2)); // low, warm
    tt += SIXTEENTH * 8;
  }
}
function scheduler() {
  while (nextTime < ctx.currentTime + 0.35) {
    scheduleStep(step, nextTime);
    nextTime += SIXTEENTH;
    step++;
  }
}

function startGenerative() {
  if (genTimer) return;
  genMode = true;
  step = 0;
  nextTime = ctx.currentTime + 0.1;
  startVinyl();
  // Slow dreamy fade-in: 8 seconds from silence
  var t = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setValueAtTime(0.0001, t);
  musicBus.gain.exponentialRampToValueAtTime(0.9, t + 8.0);
  genTimer = setInterval(scheduler, 90);
}
function stopGenerative() {
  if (genTimer) { clearInterval(genTimer); genTimer = null; }
  genMode = false;
}

/* ---- public API ---- */
function start() {
  initCtx();
  var seq = ++startSeq;
  return ctx.resume().then(function () {
    if (playing) return;
    if (seq !== startSeq) return; // superseded
    playing = true;
    // Lofi indie slow generative is the primary background music
    startGenerative();
  });
}
function stop() {
  startSeq++; // invalidate any in-flight load
  playing = false;
  stopGenerative();
  if (ctx) {
    fadeOutTrack();
    // suspend after the fade so a later start() resumes cleanly
    setTimeout(function () { if (!playing && ctx) ctx.suspend(); }, 900);
  }
}
function toggle() {
  if (playing) { stop(); return false; }
  start(); return true;
}

function setVolume(v) { // 0..1
  try {
    var vol = Math.max(0, Math.min(1, v));
    localStorage.setItem('kanavu-vol-music', String(vol));
    if (musicBus) musicBus.gain.setTargetAtTime(vol * 0.9, ctx.currentTime, 0.5);
  } catch (e) {}
}
function getVolume() {
  try {
    var v = parseFloat(localStorage.getItem('kanavu-vol-music'));
    return isNaN(v) ? 0.8 : v;
  } catch (e) { return 0.8; }
}
window.KanavuMusic = {
  start: start, stop: stop, toggle: toggle,
  isPlaying: function () { return playing; },
  setVolume: setVolume, getVolume: getVolume,
  version: 'lofi-indie-1.0'
};
})();
