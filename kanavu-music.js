/* ============================================================================
 * Kanavu — kanavu-music.js
 * ----------------------------------------------------------------------------
 * Generative lofi Desi chill-hop for the islands. No audio files: everything
 * is synthesized live with the Web Audio API and loops forever.
 *
 *   - Rhodes-style jazzy 7th chords (I - vi - IV - V), lowpassed for warmth
 *   - Tanpura-like sa/pa drone underneath
 *   - Sitar-ish plucked lead phrasing in Raga Khamaj (flat 7th = desi flavor)
 *   - Boom-bap drums with swing: soft kick, snare, hats
 *   - Vinyl crackle + hiss for the cozy lofi texture
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

var ctx = null, master = null, musicBus = null;
var playing = false, schedTimer = null;
var nextTime = 0, step = 0;

var BPM = 76;
var SIXTEENTH = 60 / BPM / 4;
var SWING = 0.58; // >0.5 = swung

/* chord progression: Cmaj7 - Am7 - Fmaj7 - G7 (midi note numbers) */
var CHORDS = [
  [48, 52, 55, 59], // Cmaj7
  [45, 48, 52, 55], // Am7
  [41, 45, 48, 52], // Fmaj7
  [43, 47, 50, 53]  // G7
];
/* Raga Khamaj-ish lead scale (C D E F G A Bb), around C5 */
var SCALE = [72, 74, 76, 77, 79, 81, 82, 84, 79, 77, 76, 74];
/* boom-bap: 16 steps, 1 = hit. kick / snare / hat */
var KICK  = [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0];
var SNARE = [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1];
var HAT   = [1,0,1,1, 1,0,1,0, 1,0,1,1, 1,0,1,0];

function midi(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function rnd(a, b) { return a + Math.random() * (b - a); }

function initCtx() {
  if (ctx) return;
  var AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.55;
  var comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 4;
  master.connect(comp); comp.connect(ctx.destination);
  musicBus = ctx.createGain();
  var lp = ctx.createBiquadFilter(); // lofi warmth
  lp.type = 'lowpass'; lp.frequency.value = 3400; lp.Q.value = 0.4;
  musicBus.connect(lp); lp.connect(master);
  // gentle wow/flutter on the whole mix
  var lfo = ctx.createOscillator(); lfo.frequency.value = 0.45;
  var lfoG = ctx.createGain(); lfoG.gain.value = 0.02;
  lfo.connect(lfoG); lfoG.connect(musicBus.gain); lfo.start();
  startVinyl();
}

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
function pluck(m, t, dur) { // sitar-ish lead: triangle + buzz, meend glide on some notes
  var f = midi(m);
  var o = ctx.createOscillator(); o.type = 'triangle';
  o.frequency.setValueAtTime(f * (Math.random() < 0.3 ? 1.03 : 1.0), t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.09); // settle (meend touch)
  var bz = ctx.createOscillator(); bz.type = 'sawtooth'; bz.frequency.value = f;
  var bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = f * 3; bf.Q.value = 2;
  var bg = ctx.createGain(); bg.gain.value = 0.06;
  var fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 2600;
  var g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(fl); bz.connect(bf); bf.connect(bg); bg.connect(fl); fl.connect(g); g.connect(musicBus);
  o.start(t); bz.start(t); o.stop(t + dur + 0.1); bz.stop(t + dur + 0.1);
}
function kick(t) {
  var o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(38, t + 0.11);
  var g = ctx.createGain();
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.5);
}
function snare(t) {
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
function hat(t, open) {
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
    if (stp === 0 && bar % 2 === 0) scheduleMelody(t); // phrase every 2 bars
  }
  if (stp === 10 && (bar === 1 || bar === 3)) rhodesChord(CHORDS[bar].slice(1), swingT, SIXTEENTH * 5); // lazy stab
  if (KICK[stp]) kick(swingT);
  if (SNARE[stp]) snare(swingT);
  if (HAT[stp]) hat(swingT, stp === 14);
}
function scheduleMelody(t) {
  var n = 3 + Math.floor(Math.random() * 3); // 3-5 notes per phrase
  var idx = Math.floor(Math.random() * SCALE.length);
  var tt = t + SIXTEENTH * 2;
  for (var i = 0; i < n; i++) {
    idx += Math.floor(rnd(-3, 4));
    idx = Math.max(0, Math.min(SCALE.length - 1, idx));
    pluck(SCALE[idx], tt, rnd(0.5, 0.9));
    tt += SIXTEENTH * (Math.random() < 0.4 ? 6 : 4); // laid-back spacing
  }
}
function scheduler() {
  while (nextTime < ctx.currentTime + 0.35) {
    scheduleStep(step, nextTime);
    nextTime += SIXTEENTH;
    step++;
  }
}

/* ---- public API ---- */
function start() {
  initCtx();
  return ctx.resume().then(function () {
    if (playing) return;
    playing = true;
    step = 0;
    nextTime = ctx.currentTime + 0.1;
    schedTimer = setInterval(scheduler, 90);
  });
}
function stop() {
  playing = false;
  if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
  if (ctx) ctx.suspend();
}
function toggle() {
  if (playing) { stop(); return false; }
  start(); return true;
}

window.KanavuMusic = {
  start: start, stop: stop, toggle: toggle,
  isPlaying: function () { return playing; },
  version: 'lofi-desi-1.0'
};
})();
