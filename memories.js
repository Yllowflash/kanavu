/* ============================================================
   Kanavu — Memories: daily photo prompt + journal + gift a memory
   (Milestone 5)
   DOM overlay UI matching the DecksUI (M2) storybook style:
   cozy burgundy + hunter green + candlelight gold, parchment cards,
   Georgia serif, rounded everything.
   Loads BEFORE game.js; game.js nav index 3 calls MemoriesUI.open().

   Demo honesty note: the partner (Tara) is simulated in this demo —
   her journal entries and her gifts are written by the island AI,
   not the real Tara. Everything persists in localStorage under
   kanavu.memories.v1 (photos capped at 7 to bound storage size).

   World integration (wired from game.js):
   - MemoriesUI.nearbyGift(px, py, radius) → pending gift for Adi,
     used by game.js nearestHotspot() to show the "Open gift" button.
   - MemoriesUI.openGift('Adi')            → warm reveal overlay.
   - MemoriesUI.drawWorldGift(ctx, w2sx, w2sy, s, now) → glowing
     gift marker drawn in the world, called from game.js draw().
   ============================================================ */
'use strict';

/* ---------------- daily photo prompts ----------------
   One per day, BeReal-style — cozy, couple-shaped, never generic. */
var MM_PROMPTS = [
  'tonight: your evening sky — snap it as it is',
  'something golden you saw today',
  'your corner of calm',
  'show me your sky right now',
  'something that made you think of us today',
  'your warmest light — a lamp, a candle, the sun',
  'a little detail only you would notice',
  'where you would take me on a slow evening',
  'something growing — a plant, an idea, a feeling',
  'tonight\u2019s tea, coffee, or comfort drink',
  'a colour that feels like us today',
  'your window view, right now'
];

/* ---------------- simulated Tara journal entries ----------------
   Clearly demo-simulated (island AI, not the real Tara). */
var MM_TARA_NOTES = [
  'The sky over Tbilisi went pink and gold tonight. I took the long way home just to walk under it — for Adi, who always looks up.',
  'Played a little guitar before bed. The G chord still buzzes. You\u2019d fix it in two seconds, kanmani.',
  'Bubble tea run: brown sugar, 70% ice. Saved you the mental sip. Come collect the real one soon.',
  'Counted three shooting stars from my window. Wished the same wish three times. You know the one.',
  'Found our song in a caf\u00e9 today. Sat there smiling like a fool. The waiter definitely noticed.',
  'Rainy day here. Made tea and watched the drops race down the glass. Yours would have won, obviously.'
];
var MM_TARA_GIFTS = [
  'a little pressed flower from my evening walk — it smelled like rain and made me think of you',
  'tonight\u2019s sky, bottled: pink at the edges, gold in the middle, all yours',
  'I hummed our song the whole way home. This memory is the humming.'
];

/* ---------------- gift marker spots (map coords) ---------------- */
var MM_GIFT_SPOTS = {
  Adi:  { x: 250, y: 716 },    // his island, by his doorstep
  Tara: { x: 860, y: 1000 }    // her island, in the garden light
};

var MemoriesUI = (function () {
  var LS_KEY = 'kanavu.memories.v1';
  var MAX_PHOTOS = 7;          // cap stored photos to bound localStorage size
  var els = {}, opened = false;
  var revealOpen = false;
  var cssInjected = false;
  function ensureCss() {
    if (cssInjected) return;
    cssInjected = true;
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  var CSS = [
    '#mm{position:fixed;inset:0;z-index:220;display:none;flex-direction:column;font-family:Georgia,serif;',
    'background:linear-gradient(180deg,#4a2333 0%,#3a1c30 42%,#25332a 100%);}',
    '#mm.on{display:flex;}',
    '.mm-head{margin:12px 14px 6px;background:#2b1a24;border-radius:22px;display:flex;align-items:center;',
    'padding:10px 12px;box-shadow:0 4px 14px rgba(20,8,14,.45);flex:none;}',
    '.mm-head button{background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.22);color:#f3ddab;',
    'width:38px;height:38px;border-radius:50%;font-size:19px;font-family:Georgia,serif;cursor:pointer;flex:none;}',
    '.mm-title{flex:1;text-align:center;color:#f3ddab;font-size:21px;letter-spacing:.5px;}',
    '.mm-scroll{flex:1;overflow-y:auto;padding:6px 16px 24px;touch-action:pan-y;-webkit-overflow-scrolling:touch;}',
    '.mm-sec{color:#e8c87a;font-size:13px;letter-spacing:2.5px;text-transform:uppercase;text-align:center;',
    'margin:14px 0 8px;font-style:normal;}',
    '.mm-prompt{background:#f8f1e3;border-radius:20px;padding:20px 20px 18px;border:2px solid rgba(232,182,76,.55);',
    'box-shadow:0 8px 24px rgba(20,8,14,.45);position:relative;}',
    '.mm-prompt::before{content:"";position:absolute;inset:8px;border:1px solid rgba(160,118,46,.35);',
    'border-radius:13px;pointer-events:none;}',
    '.mm-pdate{font-size:12px;color:#a0762e;font-style:italic;text-align:center;margin-bottom:6px;}',
    '.mm-ptext{font-size:20px;line-height:1.6;color:#3a2415;text-align:center;font-style:italic;margin:4px 0 14px;}',
    '.mm-cap{display:block;width:240px;margin:0 auto;border:none;border-radius:26px;padding:14px 0;',
    'font-family:Georgia,serif;font-size:18px;font-weight:700;color:#5a2c0c;cursor:pointer;',
    'background:linear-gradient(180deg,#ffe9b0,#e8a93e);box-shadow:0 4px 14px rgba(200,140,40,.5);}',
    '.mm-cap:active{transform:scale(.97);}',
    '.mm-thumbwrap{margin:14px auto 0;text-align:center;}',
    '.mm-thumb{width:190px;border-radius:12px;border:2px solid rgba(160,118,46,.5);',
    'box-shadow:0 4px 12px rgba(20,8,14,.3);}',
    '.mm-thumblabel{font-size:12px;color:#a0762e;font-style:italic;margin-top:5px;}',
    '.mm-giftphoto{display:block;margin:10px auto 0;background:none;border:1px solid rgba(160,118,46,.5);',
    'color:#7a5a22;font-family:Georgia,serif;font-style:italic;font-size:14px;padding:8px 18px;',
    'border-radius:20px;cursor:pointer;}',
    '.mm-entry{background:#f8f1e3;border-radius:18px;padding:16px 18px 14px;margin:0 0 12px;',
    'border:1.5px solid rgba(200,150,70,.35);box-shadow:0 5px 16px rgba(20,8,14,.35);position:relative;}',
    '.mm-meta{display:flex;align-items:center;gap:8px;margin-bottom:8px;}',
    '.mm-date{font-size:12px;color:#a0762e;font-style:italic;flex:1;}',
    '.mm-who{font-size:11.5px;font-style:italic;padding:3px 12px;border-radius:12px;}',
    '.mm-who.adi{background:#e8d5b5;color:#5a3a1a;}',
    '.mm-who.tara{background:#e6c8d8;color:#6b2a44;}',
    '.mm-text{font-size:16.5px;line-height:1.65;color:#4a3220;font-style:italic;}',
    '.mm-ethumb{width:100%;margin-top:10px;border-radius:10px;border:1.5px solid rgba(160,118,46,.4);}',
    '.mm-ecap{font-size:12.5px;color:#a0762e;font-style:italic;margin-top:6px;}',
    '.mm-gifted{display:inline-block;margin-top:8px;font-size:12.5px;color:#a0762e;font-style:italic;}',
    '.mm-wrap{display:block;margin:10px 0 0 auto;background:none;border:1px solid rgba(160,118,46,.5);',
    'color:#7a5a22;font-family:Georgia,serif;font-style:italic;font-size:13.5px;padding:7px 16px;',
    'border-radius:18px;cursor:pointer;}',
    '.mm-wrap:active{transform:scale(.96);}',
    '.mm-write{background:rgba(248,241,227,.07);border:1.5px dashed rgba(232,200,122,.45);border-radius:18px;',
    'padding:14px;margin:0 0 12px;}',
    '.mm-write textarea{width:100%;min-height:74px;border:none;border-radius:12px;padding:12px 14px;',
    'font-family:Georgia,serif;font-style:italic;font-size:16px;color:#3a2415;background:#f8f1e3;resize:vertical;}',
    '.mm-save{display:block;width:200px;margin:10px auto 0;border:none;border-radius:24px;padding:12px 0;',
    'font-family:Georgia,serif;font-size:16.5px;font-weight:700;color:#5a2c0c;cursor:pointer;',
    'background:linear-gradient(180deg,#ffe9b0,#e8a93e);box-shadow:0 4px 12px rgba(200,140,40,.45);}',
    '.mm-save:active{transform:scale(.97);}',
    '.mm-writenote{display:block;width:250px;margin:2px auto 0;background:rgba(248,241,227,.08);',
    'border:1.5px dashed rgba(232,200,122,.55);color:#f3ddab;font-family:Georgia,serif;font-style:italic;',
    'font-size:15px;padding:11px 0;border-radius:22px;cursor:pointer;}',
    '.mm-writenote:active{transform:scale(.97);}',
    '.mm-note{font-size:13px;color:#d9c49a;font-style:italic;text-align:center;margin:14px 6px 0;line-height:1.6;}',
    '.mm-empty{text-align:center;color:#d9c49a;font-style:italic;font-size:15px;margin:18px 0;}',
    '#mmQaLog{display:none;}',
    /* --- gift reveal overlay --- */
    '#mmgift{position:fixed;inset:0;z-index:230;display:none;align-items:center;justify-content:center;',
    'background:rgba(24,10,16,.72);font-family:Georgia,serif;padding:26px;}',
    '#mmgift.on{display:flex;}',
    '.mm-reveal{background:#f8f1e3;border-radius:24px;padding:30px 26px 24px;max-width:330px;width:100%;',
    'text-align:center;border:2px solid rgba(232,182,76,.6);box-shadow:0 12px 44px rgba(0,0,0,.6);position:relative;',
    'animation:mmpop .5s cubic-bezier(.2,1.4,.4,1);}',
    '@keyframes mmpop{0%{opacity:0;transform:scale(.7) rotate(-3deg);}100%{opacity:1;transform:none;}}',
    '.mm-reveal::before{content:"";position:absolute;inset:9px;border:1px solid rgba(160,118,46,.35);',
    'border-radius:16px;pointer-events:none;}',
    '.mm-rhead{font-size:15px;color:#a0762e;font-style:italic;margin-bottom:10px;}',
    '.mm-rbow{font-size:44px;margin-bottom:6px;}',
    '.mm-rtext{font-size:18px;line-height:1.7;color:#3a2415;font-style:italic;margin:8px 0 4px;}',
    '.mm-rphoto{width:100%;margin-top:12px;border-radius:12px;border:1.5px solid rgba(160,118,46,.4);}',
    '.mm-keep{display:block;width:220px;margin:18px auto 0;border:none;border-radius:26px;padding:14px 0;',
    'font-family:Georgia,serif;font-size:17px;font-weight:700;color:#5a2c0c;cursor:pointer;',
    'background:linear-gradient(180deg,#ffe9b0,#e8a93e);box-shadow:0 4px 14px rgba(200,140,40,.5);}',
    '.mm-keep:active{transform:scale(.97);}'
  ].join('\n');

  /* ------- persistence ------- */
  function freshState() {
    return { entries: [], gifts: [], taraSimDay: null, taraGiftSeeded: false, seeded: false };
  }
  var state = freshState();
  var stateLoaded = false;
  function ensureLoaded() {
    // the world draws gift markers every frame without the hub ever
    // opening — load once, cheaply, instead of parsing storage per frame
    if (!stateLoaded) { stateLoaded = true; loadState(); }
  }
  function loadState() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && Array.isArray(d.entries)) {
          state.entries = d.entries.filter(function (e) {
            return e && e.id && (e.author === 'Adi' || e.author === 'Tara') && typeof e.text === 'string';
          });
          state.gifts = Array.isArray(d.gifts) ? d.gifts.filter(function (g) {
            return g && g.id && (g.to === 'Adi' || g.to === 'Tara');
          }) : [];
          state.taraSimDay = d.taraSimDay || null;
          state.taraGiftSeeded = !!d.taraGiftSeeded;
          state.seeded = !!d.seeded;
        }
      }
    } catch (e) { state = freshState(); }
  }
  function saveState() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function newId() {
    return 'm' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);
  }

  /* ------- dates & prompts ------- */
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function dayIndex() { return Math.floor(Date.now() / 86400000); }
  function todayPrompt() { return MM_PROMPTS[dayIndex() % MM_PROMPTS.length]; }
  function fmtDate(ds) {
    var d = new Date(ds + 'T12:00:00');
    try { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch (e) { return ds; }
  }
  function shiftDate(ds, days) {
    var d = new Date(ds + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  /* ------- seeding (demo) ------- */
  function ensureSeed() {
    if (state.seeded) return;
    var t = todayStr();
    state.entries.push({
      id: newId(), author: 'Adi', kind: 'note', date: shiftDate(t, -1), ts: Date.now() - 86400000,
      text: 'First page. This little journal is ours now — every photo, every note, every small forever. \u2661',
      photo: null
    });
    state.entries.push({
      id: newId(), author: 'Tara', kind: 'note', date: shiftDate(t, -2), ts: Date.now() - 2 * 86400000,
      text: MM_TARA_NOTES[0], photo: null
    });
    state.seeded = true;
    saveState();
  }
  function unusedTaraNote() {
    var used = {};
    state.entries.forEach(function (e) { if (e.author === 'Tara') used[e.text] = true; });
    var pool = MM_TARA_NOTES.filter(function (n) { return !used[n]; });
    if (!pool.length) pool = MM_TARA_NOTES.slice();
    return pool[Math.floor(Math.random() * pool.length)];
  }
  // simulated Tara: occasionally adds a journal entry of her own (island AI)
  function maybeTaraEntry() {
    var t = todayStr();
    if (state.taraSimDay === t) return;
    if (Math.random() < 0.6) {
      state.entries.push({
        id: newId(), author: 'Tara', kind: 'note', date: t, ts: Date.now(),
        text: unusedTaraNote(), photo: null
      });
      state.taraSimDay = t;
      saveState();
    }
  }
  // simulated Tara: occasionally wraps a little note as a gift for Adi
  function maybeTaraGift(force) {
    if (state.taraGiftSeeded && !force) return null;
    if (!force && (Math.random() >= 0.35 || pendingGiftFor('Adi'))) return null;
    var used = {};
    state.gifts.forEach(function (g) { if (g.from === 'Tara') used[g.text] = true; });
    var pool = MM_TARA_GIFTS.filter(function (n) { return !used[n]; });
    if (!pool.length) pool = MM_TARA_GIFTS.slice();
    var gift = {
      id: newId(), from: 'Tara', to: 'Adi', entryId: null,
      text: pool[Math.floor(Math.random() * pool.length)],
      photo: null, ts: Date.now(), opened: false
    };
    state.gifts.push(gift);
    state.taraGiftSeeded = true;
    saveState();
    return gift;
  }

  /* ------- photos ------- */
  function photoCount() {
    var n = 0;
    state.entries.forEach(function (e) { if (e.photo) n++; });
    return n;
  }
  function prunePhotos() {
    // keep at most MAX_PHOTOS stored photos — drop from the oldest photo entries first
    while (photoCount() > MAX_PHOTOS) {
      var oldest = null;
      state.entries.forEach(function (e) {
        if (e.photo && (!oldest || e.ts < oldest.ts)) oldest = e;
      });
      if (!oldest) break;
      oldest.photo = null;
    }
  }
  function todayPhotoEntry() {
    var d = todayStr();
    for (var i = 0; i < state.entries.length; i++) {
      var e = state.entries[i];
      if (e.date === d && e.author === 'Adi' && e.kind === 'photo') return e;
    }
    return null;
  }
  function doCapture() {
    var cv = document.getElementById('game');
    if (!cv || !cv.width) { toast('the island isn\u2019t awake yet — try again'); return null; }
    var tw = 360, th = Math.max(1, Math.round(tw * cv.height / cv.width));
    var tmp = document.createElement('canvas');
    tmp.width = tw; tmp.height = th;
    var g = tmp.getContext('2d');
    try { g.drawImage(cv, 0, 0, tw, th); }
    catch (e) { toast('couldn\u2019t catch that moment'); return null; }
    var url;
    try { url = tmp.toDataURL('image/jpeg', 0.62); }
    catch (e) { toast('couldn\u2019t keep that photo'); return null; }
    var e = todayPhotoEntry();
    if (!e) {
      e = { id: newId(), author: 'Adi', kind: 'photo', text: todayPrompt(), date: todayStr(),
            ts: Date.now(), photo: null };
      state.entries.push(e);
    }
    e.photo = url; e.ts = Date.now();
    prunePhotos();
    saveState();
    renderHub();
    toast('kept in today\u2019s journal \u2661');
    return url;
  }

  /* ------- journal ------- */
  function saveNote() {
    var ta = els.writeBox;
    var text = ta ? ta.value.replace(/^\s+|\s+$/g, '') : '';
    if (!text) { toast('write a little something first'); return; }
    state.entries.push({
      id: newId(), author: 'Adi', kind: 'note', text: text,
      date: todayStr(), ts: Date.now(), photo: null
    });
    saveState();
    renderHub();
    toast('written into our journal \u2661');
  }
  function entryById(id) {
    for (var i = 0; i < state.entries.length; i++) if (state.entries[i].id === id) return state.entries[i];
    return null;
  }
  function wrapAsGift(entryId) {
    var e = entryById(entryId);
    if (!e || e.gifted) return;
    e.gifted = true;
    state.gifts.push({
      id: newId(), from: 'Adi', to: 'Tara', entryId: e.id,
      text: e.text, photo: e.photo || null, ts: Date.now(), opened: false
    });
    state.entries.push({
      id: newId(), author: 'Adi', kind: 'milestone', text: 'Adi wrapped a memory as a gift for Tara \u{1F381}',
      date: todayStr(), ts: Date.now(), photo: null
    });
    saveState();
    renderHub();
    toast('wrapped with love \u2014 it\u2019s waiting on Tara\u2019s island \u{1F381}');
  }

  /* M6: notes as gifts — plain-text notes from Adi arrive as floating
     envelopes on Tara's island, through the same gift pipeline. */
  function sendNoteGift(text) {
    var t = String(text == null ? '' : text).replace(/^\s+|\s+$/g, '');
    if (!t) return null;
    ensureLoaded();
    var gift = {
      id: newId(), from: 'Adi', to: 'Tara', entryId: null, kind: 'note',
      text: t, photo: null, ts: Date.now(), opened: false
    };
    state.gifts.push(gift);
    // GDD §3.6: notes also appear in the journal
    state.entries.push({
      id: newId(), author: 'Adi', kind: 'note', text: t,
      date: todayStr(), ts: Date.now(), photo: null
    });
    saveState();
    var spot = MM_GIFT_SPOTS.Tara;
    return { id: gift.id, x: spot.x, y: spot.y };
  }

  /* ------- gifts ------- */
  function pendingGiftFor(who) {
    ensureLoaded();
    for (var i = 0; i < state.gifts.length; i++) {
      var g = state.gifts[i];
      if (g.to === who && !g.opened) {
        var spot = MM_GIFT_SPOTS[who] || { x: 0, y: 0 };
        return { id: g.id, x: spot.x, y: spot.y, gift: g };
      }
    }
    return null;
  }
  function nearbyGift(px, py, radius) {
    var p = pendingGiftFor('Adi');
    if (!p) return null;
    var dist = Math.hypot(px - p.x, py - p.y);
    if (dist > radius) return null;
    return { x: p.x, y: p.y, dist: dist, id: p.id };
  }

  function openGift(who) {
    var p = pendingGiftFor(who);
    if (!p) { toast('no gifts waiting right now'); return; }
    var g = p.gift;
    buildReveal();
    els.rHead.textContent = g.from === 'Tara'
      ? 'a gift from Tara \u2661'
      : 'a gift from Adi \u2661';
    els.rText.textContent = g.text || '';
    if (g.photo) {
      els.rPhoto.src = g.photo;
      els.rPhoto.style.display = 'block';
    } else {
      els.rPhoto.style.display = 'none';
    }
    els.reveal.dataset.giftId = g.id;
    els.revealRoot.classList.add('on');
    revealOpen = true;
    // a little gold sparkle in the world, where the gift was
    try {
      if (window.__kanavu2d && __kanavu2d.world) {
        __kanavu2d.world.burst(p.x, p.y - 12, '#ffd97a', 20);
        __kanavu2d.world.toast('a memory, unwrapped \u2661');
      }
    } catch (e) {}
  }
  function closeReveal(keep) {
    var id = els.reveal ? els.reveal.dataset.giftId : null;
    if (keep && id) {
      for (var i = 0; i < state.gifts.length; i++) {
        if (state.gifts[i].id === id) {
          var g = state.gifts[i];
          g.opened = true; g.openedTs = Date.now();
          // simulated partner gifts land in the journal on opening
          if (!g.entryId) {
            state.entries.push({
              id: newId(), author: g.from, kind: 'note', text: g.text,
              date: todayStr(), ts: Date.now(), photo: g.photo || null
            });
            prunePhotos();
          }
          break;
        }
      }
      saveState();
    }
    revealOpen = false;
    if (els.revealRoot) els.revealRoot.classList.remove('on');
    if (keep) {
      renderHub();
      try { if (window.__kanavu2d && __kanavu2d.world) __kanavu2d.world.toast('kept in your journal \u2661'); } catch (e) {}
    }
  }

  /* ------- gift marker, drawn in the world (called from game.js draw) ------- */
  function rrPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function drawWorldGift(ctx, w2sx, w2sy, s, now) {
    // one glowing marker per recipient: Adi's by his doorstep, Tara's on her island
    drawGiftMarker(ctx, w2sx, w2sy, s, now, pendingGiftFor('Adi'));
    drawGiftMarker(ctx, w2sx, w2sy, s, now, pendingGiftFor('Tara'));
  }
  function drawGiftMarker(ctx, w2sx, w2sy, s, now, p) {
    if (!p) return;
    var t = now / 1000;
    var gx = w2sx(p.x), gy = w2sy(p.y);
    var bob = Math.sin(now / 620) * 3.2 * s;
    gy += bob;

    // painterly radial glow — tiny, warm, pulsing
    var R = 46 * s;
    var pulse = 0.72 + 0.28 * Math.sin(t * 3.1);
    var gr = ctx.createRadialGradient(gx, gy, 2, gx, gy, R);
    gr.addColorStop(0, 'rgba(255,208,120,' + (0.60 * pulse).toFixed(3) + ')');
    gr.addColorStop(0.5, 'rgba(255,182,92,' + (0.24 * pulse).toFixed(3) + ')');
    gr.addColorStop(1, 'rgba(255,182,92,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(gx, gy, R, 0, 6.29); ctx.fill();

    // soft contact shadow
    ctx.fillStyle = 'rgba(20,10,14,0.28)';
    ctx.beginPath();
    ctx.ellipse(gx, gy + 12 * s, 17 * s, 4.6 * s, 0, 0, 6.29);
    ctx.fill();

    // M6: notes render as floating envelopes; wrapped memories keep the gift box
    if (p.gift && p.gift.kind === 'note') {
      drawNoteEnvelope(ctx, gx, gy, s, t);
    } else {
    // box body — burgundy, unlit-flat like the world
    var bw = 34 * s, bh = 24 * s;
    var bx = gx - bw / 2, by = gy - bh - 2 * s;
    ctx.fillStyle = '#7a2b3a';
    rrPath(ctx, bx, by, bw, bh, 4 * s); ctx.fill();
    ctx.strokeStyle = 'rgba(232,200,122,0.55)'; ctx.lineWidth = 1.2 * s;
    rrPath(ctx, bx, by, bw, bh, 4 * s); ctx.stroke();
    // lid
    var lw = 38 * s, lh = 10 * s;
    ctx.fillStyle = '#93384a';
    rrPath(ctx, gx - lw / 2, by - lh + 2 * s, lw, lh, 3.5 * s); ctx.fill();
    ctx.strokeStyle = 'rgba(232,200,122,0.6)'; ctx.lineWidth = 1 * s;
    rrPath(ctx, gx - lw / 2, by - lh + 2 * s, lw, lh, 3.5 * s); ctx.stroke();
    // ribbon — candlelight gold
    ctx.fillStyle = '#e8b04b';
    ctx.fillRect(gx - 3.5 * s, by - lh + 2 * s, 7 * s, lh + bh - 2 * s);
    ctx.fillRect(bx, by + bh / 2 - 3 * s, bw, 6 * s);
    // bow — two loops + knot
    var bowY = by - lh + 2 * s;
    ctx.fillStyle = '#f3d189';
    ctx.beginPath();
    ctx.moveTo(gx, bowY); ctx.lineTo(gx - 11 * s, bowY - 9 * s); ctx.lineTo(gx - 4 * s, bowY - 1 * s);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(gx, bowY); ctx.lineTo(gx + 11 * s, bowY - 9 * s); ctx.lineTo(gx + 4 * s, bowY - 1 * s);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(gx, bowY, 3.4 * s, 0, 6.29); ctx.fill();
    }

    // twinkling sparkles around the gift
    for (var i = 0; i < 3; i++) {
      var a = t * 1.4 + i * 2.1;
      var sx = gx + Math.cos(a) * 26 * s, sy = gy - 8 * s + Math.sin(a * 1.3) * 18 * s;
      var sa = 0.25 + 0.55 * Math.abs(Math.sin(t * 2.2 + i * 1.7));
      ctx.fillStyle = 'rgba(255,225,160,' + sa.toFixed(3) + ')';
      var sr = (1.6 + 0.9 * Math.abs(Math.sin(t * 2.2 + i))) * s;
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, 6.29); ctx.fill();
    }
  }
  /* M6: a floating love-letter envelope — parchment body, folded flap,
     burgundy wax seal, faint address lines. Same glow/bob language. */
  function drawNoteEnvelope(ctx, gx, gy, s, t) {
    var ew = 46 * s, eh = 30 * s;
    ctx.save();
    ctx.translate(gx, gy - eh / 2 - 6 * s);
    ctx.rotate(Math.sin(t * 0.8) * 0.05);
    // body — parchment
    ctx.fillStyle = '#f3e7c8';
    rrPath(ctx, -ew / 2, -eh / 2, ew, eh, 4 * s); ctx.fill();
    ctx.strokeStyle = 'rgba(160,118,46,0.8)'; ctx.lineWidth = 1.4 * s;
    rrPath(ctx, -ew / 2, -eh / 2, ew, eh, 4 * s); ctx.stroke();
    // folded flap
    ctx.fillStyle = '#e6d0a0';
    ctx.beginPath();
    ctx.moveTo(-ew / 2 + 3 * s, -eh / 2 + 2 * s);
    ctx.lineTo(0, 5 * s);
    ctx.lineTo(ew / 2 - 3 * s, -eh / 2 + 2 * s);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(140,100,50,0.6)'; ctx.lineWidth = 1 * s; ctx.stroke();
    // wax seal
    ctx.fillStyle = '#a33b4e';
    ctx.beginPath(); ctx.arc(0, 3 * s, 7.5 * s, 0, 6.29); ctx.fill();
    ctx.strokeStyle = 'rgba(232,200,122,0.7)'; ctx.lineWidth = 1 * s;
    ctx.beginPath(); ctx.arc(0, 3 * s, 7.5 * s, 0, 6.29); ctx.stroke();
    ctx.fillStyle = '#f6d9a0';
    ctx.font = '700 ' + Math.round(9 * s) + 'px Georgia';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('\u2665', 0, 3.5 * s);
    ctx.textAlign = 'left';
    // faint address lines
    ctx.fillStyle = 'rgba(140,110,70,0.75)';
    ctx.fillRect(-13 * s, 11 * s, 26 * s, 2 * s);
    ctx.fillRect(-9 * s, 15.5 * s, 18 * s, 2 * s);
    ctx.restore();
  }

  /* ------- DOM ------- */
  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function toast(msg) {
    try {
      if (window.__kanavu2d && __kanavu2d.world) __kanavu2d.world.toast(msg);
    } catch (e) {}
  }

  function buildDom() {
    ensureCss();

    var root = el('div'); root.id = 'mm';

    var head = el('div', 'mm-head');
    var back = el('button', 'mm-back', '&#8592;');
    var title = el('div', 'mm-title', '\u2726 Memories \u2726');
    var closeB = el('button', 'mm-close', '\u2715');
    head.appendChild(back); head.appendChild(title); head.appendChild(closeB);

    var scroll = el('div', 'mm-scroll');
    var qalog = el('div'); qalog.id = 'mmQaLog';

    root.appendChild(head); root.appendChild(scroll); root.appendChild(qalog);
    document.body.appendChild(root);
    els = { root: root, scroll: scroll, qalog: qalog, back: back, title: title };

    back.addEventListener('click', close);
    closeB.addEventListener('click', close);
  }
  function buildReveal() {
    if (els.revealRoot) return;
    ensureCss();
    var root = el('div'); root.id = 'mmgift';
    var card = el('div', 'mm-reveal');
    var rhead = el('div', 'mm-rhead');
    var rbow = el('div', 'mm-rbow', '\u{1F381}');
    var rtext = el('div', 'mm-rtext');
    var rphoto = el('img', 'mm-rphoto');
    var keep = el('button', 'mm-keep', 'Keep it close \u2661');
    card.appendChild(rhead); card.appendChild(rbow); card.appendChild(rtext);
    card.appendChild(rphoto); card.appendChild(keep);
    root.appendChild(card);
    document.body.appendChild(root);
    keep.addEventListener('click', function () { closeReveal(true); });
    els.revealRoot = root; els.reveal = card;
    els.rHead = rhead; els.rText = rtext; els.rPhoto = rphoto;
  }

  function renderHub() {
    if (!els.scroll) return;   // hub never opened (e.g. gift opened straight from the world)
    var s = els.scroll;
    s.innerHTML = '';

    /* --- today's prompt --- */
    s.appendChild(el('div', 'mm-sec', '\u2726 today\u2019s prompt \u2726'));
    var pc = el('div', 'mm-prompt');
    pc.appendChild(el('div', 'mm-pdate', fmtDate(todayStr())));
    pc.appendChild(el('div', 'mm-ptext', '\u201c' + esc(todayPrompt()) + '\u201d'));
    var cap = el('button', 'mm-cap', '\u{1F4F7} Capture this moment');
    cap.addEventListener('click', function () { doCapture(); });
    pc.appendChild(cap);
    var tp = todayPhotoEntry();
    if (tp && tp.photo) {
      var tw = el('div', 'mm-thumbwrap');
      var img = el('img', 'mm-thumb'); img.src = tp.photo; img.alt = 'today\u2019s memory photo';
      tw.appendChild(img);
      tw.appendChild(el('div', 'mm-thumblabel', 'today\u2019s memory, kept \u2661'));
      var gp = el('button', 'mm-giftphoto', '\u{1F381} gift this photo to Tara');
      gp.addEventListener('click', function () { wrapAsGift(tp.id); });
      tw.appendChild(gp);
      pc.appendChild(tw);
    }
    s.appendChild(pc);

    /* --- journal --- */
    s.appendChild(el('div', 'mm-sec', '\u2726 our journal \u2726'));
    var wbox = el('div', 'mm-write');
    var ta = el('textarea');
    ta.placeholder = 'write a little note for the journal\u2026';
    var sv = el('button', 'mm-save', 'Save to journal \u2661');
    sv.addEventListener('click', saveNote);
    wbox.appendChild(ta); wbox.appendChild(sv);
    s.appendChild(wbox);
    els.writeBox = ta;

    /* M6: write a note — travels as a floating envelope to Tara's island */
    var wn = el('button', 'mm-writenote', '\u2709 write a note for Tara\u2019s island');
    wn.addEventListener('click', function () {
      if (window.WarmthUI && WarmthUI.openNotes) WarmthUI.openNotes();
    });
    s.appendChild(wn);

    var entries = state.entries.slice().sort(function (a, b) { return b.ts - a.ts; });
    if (!entries.length) {
      s.appendChild(el('div', 'mm-empty', 'no memories yet \u2014 capture today\u2019s prompt above \u2726'));
    }
    entries.forEach(function (e) {
      var card = el('div', 'mm-entry');
      var meta = el('div', 'mm-meta');
      meta.appendChild(el('div', 'mm-date', fmtDate(e.date)));
      var who = el('div', 'mm-who ' + (e.author === 'Tara' ? 'tara' : 'adi'),
        e.author === 'Tara' ? '\u2661 Tara' : '\u2661 Adi');
      meta.appendChild(who);
      card.appendChild(meta);
      if (e.kind === 'photo') {
        card.appendChild(el('div', 'mm-text', '\u201c' + esc(e.text) + '\u201d'));
      } else {
        card.appendChild(el('div', 'mm-text', esc(e.text)));
      }
      if (e.photo) {
        var im = el('img', 'mm-ethumb'); im.src = e.photo; im.alt = 'memory photo';
        card.appendChild(im);
        if (e.kind === 'photo') card.appendChild(el('div', 'mm-ecap', 'today\u2019s prompt, answered \u2726'));
      }
      if (e.gifted) {
        card.appendChild(el('div', 'mm-gifted', '\u{1F381} wrapped as a gift'));
      } else if (e.author === 'Adi' && e.kind !== 'milestone') {
        var wb = el('button', 'mm-wrap', '\u{1F381} wrap as a gift for Tara');
        (function (id) { wb.addEventListener('click', function () { wrapAsGift(id); }); })(e.id);
        card.appendChild(wb);
      }
      s.appendChild(card);
    });

    s.appendChild(el('div', 'mm-note',
      'Tara\u2019s entries and gifts here are imagined by the island AI for this demo \u2726'));
  }

  /* ------- open / close ------- */
  function open() {
    if (!els.root) buildDom();
    loadState();
    stateLoaded = true;
    ensureSeed();
    maybeTaraEntry();
    maybeTaraGift(false);
    opened = true;
    els.root.classList.add('on');
    renderHub();
    els.scroll.scrollTop = 0;
  }
  function close() {
    opened = false;
    if (els.root) els.root.classList.remove('on');
  }

  /* ------- QA hooks (invisible in normal use):
     #memories=1        → opens the memories hub
     #memoriesclear=1    → clears kanavu.memories.v1 first
     #memoriesgift=1    → seeds a Tara→Adi gift, logs marker in title
     #memoriescap=1     → opens hub, captures a world photo, logs in title
     #memoriesopen=1    → seeds a Tara→Adi gift and opens the reveal */
  function qaLog(msg) {
    if (els.qalog) els.qalog.textContent = msg;
    var errs = (window.__qaErrors || []).length;
    document.title = 'MEMORIESQA:' + msg + '|errs:' + errs;
  }
  function whenWorldReady(fn) {
    var n = 0;
    (function p() {
      var l = document.getElementById('loader');
      if ((l && l.style.display === 'none') || n > 60) fn();
      else { n++; setTimeout(p, 300); }
    })();
  }
  var hashTries = 0;
  function hashCheck() {
    var h = location.hash;
    if (h.indexOf('memoriesclear=1') >= 0) {
      try { localStorage.removeItem(LS_KEY); } catch (e) {}
      state = freshState();
    }
    var wantOpen = h.indexOf('memories=1') >= 0;
    var wantCap = h.indexOf('memoriescap=1') >= 0;
    var wantGift = h.indexOf('memoriesgift=1') >= 0;
    var wantReveal = h.indexOf('memoriesopen=1') >= 0;
    if (!wantOpen && !wantCap && !wantGift && !wantReveal) return;
    if (document.readyState !== 'complete' && document.readyState !== 'interactive') {
      if (++hashTries < 40) setTimeout(hashCheck, 300);
      return;
    }
    loadState();
    ensureSeed();
    if (wantGift || wantReveal) {
      var g = maybeTaraGift(true);
      if (g) qaLog('gift@' + MM_GIFT_SPOTS.Adi.x + ',' + MM_GIFT_SPOTS.Adi.y);
    }
    if (wantReveal) {
      whenWorldReady(function () {
        openGift('Adi');
        qaLog('revealed');
      });
      return;
    }
    if (wantOpen || wantCap) {
      open();
      if (wantCap) {
        whenWorldReady(function () {
          var url = doCapture();
          qaLog(url ? 'captured:' + url.length : 'capture-failed');
        });
      }
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(hashCheck, 400); });
  } else {
    setTimeout(hashCheck, 400);
  }

  /* exposed for QA (parent agent / screenshots only) */
  function _testState() { return JSON.parse(JSON.stringify({ entries: state.entries.length, gifts: state.gifts.length })); }

  return {
    open: open, close: close, isOpen: function () { return opened || revealOpen; },
    openGift: openGift, closeReveal: closeReveal,
    pendingGiftFor: pendingGiftFor, nearbyGift: nearbyGift,
    sendNoteGift: sendNoteGift,
    drawWorldGift: drawWorldGift, doCapture: doCapture,
    todayPrompt: todayPrompt, _testState: _testState, _prompts: MM_PROMPTS
  };
})();

window.MemoriesUI = MemoriesUI;
