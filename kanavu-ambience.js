/* ============================================================================
 * Kanavu — kanavu-ambience.js
 * ----------------------------------------------------------------------------
 * Generative calming nature soundscape. No audio files: everything is
 * synthesized live with the Web Audio API.
 *
 *   - Soft footsteps while walking (synced to movement, never while riding)
 *   - Gentle wind + distant waves, always present and very soft
 *   - Birds by day, crickets by night (follows the island's local time)
 *   - Campfire crackle that grows as you walk closer to the fire
 *
 * Reads game state from window.KanavuWorldApi when available.
 *
 * API:
 *   KanavuAmbience.start()   -> Promise (call from a user gesture)
 *   KanavuAmbience.stop()
 *   KanavuAmbience.toggle()  -> bool (now playing?)
 *   KanavuAmbience.isPlaying()
 *
 * Vanilla JS, no dependencies.
 * ========================================================================== */
(function () {
'use strict';

var ctx = null, master = null;
var playing = false;
var pollTimer = null, birdTimer = null, cricketTimer = null;
var lastStep = 0, stepAlt = false;
var fireGain = null;

function rnd(a, b) { return a + Math.random() * (b - a); }

function api() { return window.KanavuWorldApi || null; }
function gameHour() {
  try {
    var h = api().phase2.getHour();
    if (h !== null && h !== undefined) return h;
  } catch (e) {}
  return new Date().getHours() + new Date().getMinutes() / 60;
}
function isDay() { var h = gameHour(); return h >= 5.5 && h < 18.5; }
function playerMoving() {
  try {
    var a = api();
    if (a.phase4.isRiding() || a.phase4.isSitting()) return false;
    return !!a.getPlayerAnim().moving;
  } catch (e) { return false; }
}
function distToFire() {
  try {
    var a = api(), p = a.getPlayerPos(), c = a.phase4.campfire();
    return Math.hypot(p.x - c.x, p.z - c.z);
  } catch (e) { return 999; }
}

function initCtx() {
  if (ctx) return;
  var AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.42; // gentle overall
  master.connect(ctx.destination);
  startWind();
  startWaves();
  startFire();
}

function noiseBuffer() {
  var len = ctx.sampleRate * 2;
  var buf = ctx.createBuffer(1, len, ctx.sampleRate);
  var d = buf.getChannelData(0);
  for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
var _nb = null;
function noiseSrc() {
  if (!_nb) _nb = noiseBuffer();
  var s = ctx.createBufferSource(); s.buffer = _nb; s.loop = true;
  return s;
}

/* ---- constant soft wind ---- */
function startWind() {
  var s = noiseSrc();
  var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380; f.Q.value = 0.3;
  var g = ctx.createGain(); g.gain.value = 0.045;
  var lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
  var lg = ctx.createGain(); lg.gain.value = 0.022;
  lfo.connect(lg); lg.connect(g.gain);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(); lfo.start();
}
/* ---- distant waves, slow swell ---- */
function startWaves() {
  var s = noiseSrc();
  var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 0.6;
  var g = ctx.createGain(); g.gain.value = 0.030;
  var lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
  var lg = ctx.createGain(); lg.gain.value = 0.020;
  lfo.connect(lg); lg.connect(g.gain);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(); lfo.start();
}
/* ---- campfire crackle (gain follows distance to the fire) ---- */
function startFire() {
  fireGain = ctx.createGain(); fireGain.gain.value = 0;
  var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 0.7;
  fireGain.connect(f); f.connect(master);
  (function crackle() {
    setTimeout(function () {
      if (playing && fireGain && fireGain.gain.value > 0.004) {
        var t = ctx.currentTime;
        var n = noiseSrc();
        var g = ctx.createGain();
        var v = rnd(0.05, 0.22) * Math.min(1, fireGain.gain.value * 8);
        g.gain.setValueAtTime(v, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + rnd(0.02, 0.07));
        n.connect(g); g.connect(fireGain);
        n.start(t); n.stop(t + 0.1);
      }
      setTimeout(crackle, rnd(60, 420));
    }, rnd(60, 420));
  })();
}

/* ---- soft footstep ---- */
function footstep() {
  var t = ctx.currentTime;
  var n = noiseSrc();
  var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = stepAlt ? 320 : 270;
  var g = ctx.createGain();
  g.gain.setValueAtTime(0.11, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);
  n.connect(f); f.connect(g); g.connect(master);
  n.start(t); n.stop(t + 0.14);
  var o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.value = stepAlt ? 96 : 84;
  var g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.06, t);
  g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  o.connect(g2); g2.connect(master); o.start(t); o.stop(t + 0.12);
  stepAlt = !stepAlt;
}
/* ---- daytime bird chirp: a few soft descending blips ---- */
function birdChirp() {
  if (!isDay()) return;
  var t = ctx.currentTime + 0.05;
  var n = 2 + Math.floor(Math.random() * 3);
  var base = rnd(2600, 3400);
  for (var i = 0; i < n; i++) {
    (function (i) {
      var tt = t + i * rnd(0.12, 0.2);
      var o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(base * rnd(0.98, 1.02), tt);
      o.frequency.exponentialRampToValueAtTime(base * 0.72, tt + 0.09);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.055, tt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.11);
      o.connect(g); g.connect(master);
      o.start(tt); o.stop(tt + 0.15);
    })(i);
  }
}
/* ---- nighttime crickets: soft pulsed trill ---- */
function cricketTrill() {
  if (isDay()) return;
  var t = ctx.currentTime + 0.05;
  var pulses = 14 + Math.floor(Math.random() * 10);
  var f = rnd(4100, 4400);
  for (var i = 0; i < pulses; i++) {
    (function (i) {
      var tt = t + i * 0.055;
      var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.028, tt);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.04);
      o.connect(g); g.connect(master);
      o.start(tt); o.stop(tt + 0.06);
    })(i);
  }
}

/* ---- state polling ---- */
function poll() {
  if (!playing) return;
  var now = performance.now();
  if (playerMoving() && now - lastStep > 460) {
    lastStep = now;
    try { footstep(); } catch (e) {}
  }
  try {
    var d = distToFire(); // crackle fades in within ~14u of the fire
    var target = Math.max(0, 1 - d / 14) * 0.5;
    fireGain.gain.setTargetAtTime(target, ctx.currentTime, 0.8);
  } catch (e) {}
}

/* ---- public API ---- */
function start() {
  initCtx();
  return ctx.resume().then(function () {
    if (playing) return;
    playing = true;
    pollTimer = setInterval(poll, 220);
    (function birdLoop() {
      birdTimer = setTimeout(function () {
        try { if (playing) birdChirp(); } catch (e) {}
        birdLoop();
      }, rnd(5000, 14000));
    })();
    (function cricketLoop() {
      cricketTimer = setTimeout(function () {
        try { if (playing) cricketTrill(); } catch (e) {}
        cricketLoop();
      }, rnd(4000, 9000));
    })();
  });
}
function stop() {
  playing = false;
  [pollTimer, birdTimer, cricketTimer].forEach(function (t) {
    if (t) { clearInterval(t); clearTimeout(t); }
  });
  pollTimer = birdTimer = cricketTimer = null;
  if (ctx) ctx.suspend();
}
function toggle() {
  if (playing) { stop(); return false; }
  start(); return true;
}

window.KanavuAmbience = {
  start: start, stop: stop, toggle: toggle,
  isPlaying: function () { return playing; },
  version: 'nature-1.0'
};
})();
