/* ============================================================
   Kanavu — Question decks (Milestone 2)
   DOM overlay UI matching the KeeperBuilder (M1) storybook style:
   cozy burgundy + hunter green + candlelight gold, parchment cards,
   Georgia serif, rounded everything.
   Loads BEFORE game.js; game.js nav index 1 calls DecksUI.open().

   Demo honesty note: the partner (Tara) is simulated in this demo —
   she "sees" every card and reacts, but it's the island AI, not the
   real Tara. Progress persists in localStorage under kanavu.decks.v1.
   ============================================================ */
'use strict';

/* ---------------- deck data ----------------
   48 genuine couple questions written for Adi & Tara:
   long-distance (Tbilisi ↔ Vancouver), guitar, bubble tea, OK Kanmani,
   stars, reassurance, their rituals. NOT generic icebreakers. */
var DK_DECKS = [
  {
    id: 'first-hellos',
    title: 'First Hellos',
    desc: 'Where it all began — the guitar, the random questions, the night of May 11.',
    cards: [
      { id: 'fh-01', text: 'What was the very first thing about me that made you look twice?' },
      { id: 'fh-02', text: 'When I sent you the photo of my new guitar — "hey, I finally got one" — what were you feeling in that moment?' },
      { id: 'fh-03', text: 'What random question did I ask you back then that you still remember?' },
      { id: 'fh-04', text: 'On May 11, 2025, when we finally admitted our feelings — what were you doing right before you typed it?' },
      { id: 'fh-05', text: 'What song were you listening to on repeat when we first started talking?' },
      { id: 'fh-06', text: 'What is something small from our early chats that I probably forgot, but you kept?' },
      { id: 'fh-07', text: 'If you could relive one week from when we were just insta friends, which week would you pick?' },
      { id: 'fh-08', text: 'What did you assume about me in the beginning that turned out to be completely wrong?' },
      { id: 'fh-09', text: 'What was the first thing you told your friends about me?' },
      { id: 'fh-10', text: 'What did my guitar teach you about me before I ever said a word?' },
      { id: 'fh-11', text: 'What is the oldest screenshot you still have of our chats, and why did you keep it?' },
      { id: 'fh-12', text: 'When did "goodnight" first start feeling like a promise instead of just a word?' },
      { id: 'fh-13', text: 'Back when this was all new — what were you afraid I would think of you?' },
      { id: 'fh-14', text: 'If our first conversation had a movie title, what would it be?' },
      { id: 'fh-15', text: 'What tiny detail from my profile photo hooked you first?' },
      { id: 'fh-16', text: 'Who said "I like you" first in spirit, even if not in words — and how did you know?' }
    ]
  },
  {
    id: 'deep-questions',
    title: 'Deep Questions',
    desc: 'The 1am ones — distance, fears, reassurance, and everything we only tell each other.',
    cards: [
      { id: 'dq-01', text: "What's one small thing I do that instantly makes a hard day better?" },
      { id: 'dq-02', text: 'What are you most afraid to tell me — and why do you want to tell me anyway?' },
      { id: 'dq-03', text: 'When the distance feels heaviest, what do you need from me that you never ask for?' },
      { id: 'dq-04', text: 'What part of you do you secretly worry is not enough for me?' },
      { id: 'dq-05', text: 'What does "home" mean to you now that home is a person in another timezone?' },
      { id: 'dq-06', text: "What's a dream you haven't told anyone but me?" },
      { id: 'dq-07', text: 'When I reassure you, which words actually land — and which ones miss?' },
      { id: 'dq-08', text: "What's the hardest part of loving someone you can't just reach out and touch?" },
      { id: 'dq-09', text: 'What do you want our life to look like in five years — be specific, down to the street?' },
      { id: 'dq-10', text: 'What are you proud of about us that nobody else ever sees?' },
      { id: 'dq-11', text: "What's something you forgave me for that I never knew hurt you?" },
      { id: 'dq-12', text: 'If we had one teleport evening together, walk me through it minute by minute.' },
      { id: 'dq-13', text: 'What scares you most about the day we finally close the distance?' },
      { id: 'dq-14', text: 'What do you need to hear from me on the days you doubt us?' },
      { id: 'dq-15', text: "What's a memory of us you replay when you can't sleep?" },
      { id: 'dq-16', text: 'If our love had a colour tonight, what would it be — and why?' }
    ]
  },
  {
    id: 'dream-together',
    title: 'Dream Together',
    desc: 'Us, someday — teleport evenings, shared cities, bubble tea rituals, and silly old-age plans.',
    cards: [
      { id: 'dt-01', text: 'Design our dream date night — where are we, what are we eating, what is playing in the background?' },
      { id: 'dt-02', text: 'If we had a little cottage by the sea, what would our mornings sound like?' },
      { id: 'dt-03', text: 'Our bubble tea orders, side by side — and what does each choice say about us?' },
      { id: 'dt-04', text: 'Teach me one Tbilisi thing and one Vancouver thing we would do on the same perfect day.' },
      { id: 'dt-05', text: "We're scoring a montage of us — pick three songs and the scenes they play over." },
      { id: 'dt-06', text: 'If we could stargaze from one place on earth tonight, where would we go — and what would you point at first?' },
      { id: 'dt-07', text: 'Plan our first 24 hours in the same city — hour by hour, no skipping the boring parts.' },
      { id: 'dt-08', text: 'What would our couple superpower be, and how would we use it for good?' },
      { id: 'dt-09', text: "Invent a tiny ritual just for us — something we'd do every single day." },
      { id: 'dt-10', text: "You're directing a short film of our story — what's the opening shot?" },
      { id: 'dt-11', text: 'What would we cook together on a rainy Sunday — and who does the dishes?' },
      { id: 'dt-12', text: 'Which OK Kanmani song plays the moment we finally live in the same city?' },
      { id: 'dt-13', text: "Describe the home we'd decorate together — start at the front door." },
      { id: 'dt-14', text: "What's the silliest argument we'd have as old people?" },
      { id: 'dt-15', text: 'If we could send one object back in time to our first-chat selves, what would it be?' },
      { id: 'dt-16', text: 'We close the distance tomorrow — how do we spend the first week?' }
    ]
  }
];

/* ---------------- DecksUI ---------------- */
/* M6: date-idea card tags (long-distance aware) */
var DK_TAG_LABELS = {
  'together-online': '\u2726 online together',
  'tonight-apart': '\u2726 tonight \u00b7 apart but together',
  'someday': '\u2726 someday \u00b7 in person'
};

var DecksUI = (function () {
  var LS_KEY = 'kanavu.decks.v1';
  var els = {}, opened = false;
  var view = 'picker';       // 'picker' | 'card'
  var curDeck = null, curCard = null, reshuffleNote = false;
  var partnerTimer = 0;

  var PARTNER_REACTS = [
    'Tara is thinking…',
    'Tara smiled at this one \u2661',
    'Tara is typing a long answer…',
    'Tara sent a \u2665 with her answer'
  ];

  var CSS = [
    '#dk{position:fixed;inset:0;z-index:210;display:none;flex-direction:column;font-family:Georgia,serif;',
    'background:linear-gradient(180deg,#4a2333 0%,#3a1c30 42%,#25332a 100%);}',
    '#dk.on{display:flex;}',
    '.dk-head{margin:12px 14px 6px;background:#2b1a24;border-radius:22px;display:flex;align-items:center;',
    'padding:10px 12px;box-shadow:0 4px 14px rgba(20,8,14,.45);flex:none;}',
    '.dk-head button{background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.22);color:#f3ddab;',
    'width:38px;height:38px;border-radius:50%;font-size:19px;font-family:Georgia,serif;cursor:pointer;flex:none;}',
    '.dk-title{flex:1;text-align:center;color:#f3ddab;font-size:21px;letter-spacing:.5px;}',
    '.dk-scroll{flex:1;overflow-y:auto;padding:6px 16px 20px;touch-action:pan-y;-webkit-overflow-scrolling:touch;}',
    '.dk-deck{display:block;width:100%;margin:0 0 14px;border:2px solid rgba(232,182,76,.35);border-radius:20px;',
    'padding:18px 18px 16px;font-family:Georgia,serif;background:#f8f1e3;color:#4a2f1c;cursor:pointer;text-align:left;',
    'box-shadow:0 6px 20px rgba(20,8,14,.35);}',
    '.dk-deck:active{transform:scale(.985);}',
    '.dk-deck h3{font-size:22px;margin:0 0 4px;color:#3a2415;font-weight:700;}',
    '.dk-deck .dk-count{font-size:13px;color:#a0762e;font-style:italic;margin-bottom:8px;}',
    '.dk-deck .dk-desc{font-size:15px;line-height:1.5;color:#6b4a2e;}',
    '.dk-deck .dk-star{color:#c8952e;font-size:18px;}',
    '.dk-note{font-size:13px;color:#d9c49a;font-style:italic;text-align:center;margin:10px 6px 0;line-height:1.6;}',
    '.dk-prog{text-align:center;color:#e8c87a;font-size:14px;font-style:italic;margin:2px 0 12px;}',
    '.dk-card{background:#f8f1e3;border-radius:22px;padding:30px 24px 26px;margin:0 0 16px;position:relative;',
    'box-shadow:0 8px 26px rgba(20,8,14,.45);border:2px solid rgba(232,182,76,.5);cursor:pointer;}',
    '.dk-card::before{content:"";position:absolute;inset:9px;border:1px solid rgba(160,118,46,.35);border-radius:15px;pointer-events:none;}',
    '.dk-q{font-size:21px;line-height:1.65;color:#3a2415;min-height:150px;display:flex;align-items:center;justify-content:center;text-align:center;}',
    '.dk-tag{display:inline-block;margin-top:14px;font-size:12.5px;font-style:italic;color:#a0762e;',
    'border:1px solid rgba(160,118,46,.45);border-radius:14px;padding:4px 14px;background:rgba(232,182,76,.10);}',
    '.dk-sees{margin-top:18px;text-align:center;font-size:13px;color:#a0762e;font-style:italic;}',
    '.dk-card.pop .dk-q{animation:dkpop .45s ease;}',
    '@keyframes dkpop{0%{opacity:0;transform:translateY(14px) scale(.98);}100%{opacity:1;transform:none;}}',
    '.dk-new{display:block;width:230px;margin:2px auto 0;border:none;border-radius:26px;padding:15px 0;',
    'font-family:Georgia,serif;font-size:20px;font-weight:700;color:#5a2c0c;cursor:pointer;',
    'background:linear-gradient(180deg,#ffe9b0,#e8a93e);box-shadow:0 4px 14px rgba(200,140,40,.5);}',
    '.dk-new:active{transform:scale(.97);}',
    '.dk-reshuf{text-align:center;color:#ffe9b0;font-size:15px;font-style:italic;margin:12px 0 0;}',
    '.dk-ptoast{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);background:rgba(30,15,18,.9);',
    'color:#f7e6c4;font-size:14px;padding:10px 20px;border-radius:18px;opacity:0;transition:opacity .3s;',
    'pointer-events:none;white-space:nowrap;z-index:6;}',
    '.dk-ptoast.show{opacity:1;}',
    '#dkQaLog{display:none;}'
  ].join('\n');

  /* ------- persistence ------- */
  function freshState() {
    var s = { seen: {} };
    DK_DECKS.forEach(function (d) { s.seen[d.id] = []; });
    return s;
  }
  var state = freshState();
  function loadState() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && d.seen) {
          DK_DECKS.forEach(function (dk) {
            var arr = d.seen[dk.id];
            state.seen[dk.id] = Array.isArray(arr) ? arr.filter(function (id) {
              return dk.cards.some(function (c) { return c.id === id; });
            }) : [];
          });
        }
      }
    } catch (e) { /* fresh start */ }
  }
  function saveState() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
  }

  /* ------- draw logic: no repeats until the deck is exhausted ------- */
  function deckById(id) {
    for (var i = 0; i < DK_DECKS.length; i++) if (DK_DECKS[i].id === id) return DK_DECKS[i];
    return null;
  }
  function unanswered(deck) {
    var seen = state.seen[deck.id];
    return deck.cards.filter(function (c) { return seen.indexOf(c.id) < 0; });
  }
  function drawCard(deck) {
    reshuffleNote = false;
    var pool = unanswered(deck);
    if (pool.length === 0) {
      // deck exhausted — reshuffle and start fresh
      state.seen[deck.id] = [];
      pool = deck.cards.slice();
      reshuffleNote = true;
    }
    var card = pool[Math.floor(Math.random() * pool.length)];
    state.seen[deck.id].push(card.id);
    saveState();
    return card;
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

  function buildDom() {
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);

    var root = el('div'); root.id = 'dk';

    var head = el('div', 'dk-head');
    var back = el('button', 'dk-back', '&#8592;');
    var title = el('div', 'dk-title', '\u2726 Question decks \u2726');
    var close = el('button', 'dk-close', '\u2715');
    head.appendChild(back); head.appendChild(title); head.appendChild(close);
    els.back = back; els.title = title;

    var scroll = el('div', 'dk-scroll');
    var ptoast = el('div', 'dk-ptoast');
    var qalog = el('div'); qalog.id = 'dkQaLog';

    root.appendChild(head); root.appendChild(scroll); root.appendChild(ptoast); root.appendChild(qalog);
    document.body.appendChild(root);
    els = { root: root, scroll: scroll, ptoast: ptoast, qalog: qalog, back: back, title: title };

    back.addEventListener('click', function () {
      if (view === 'card') renderPicker(); else close();
    });
    close.addEventListener('click', close);
  }

  function partnerToast(msg, ms) {
    clearTimeout(partnerTimer);
    els.ptoast.textContent = msg;
    els.ptoast.classList.add('show');
    partnerTimer = setTimeout(function () { els.ptoast.classList.remove('show'); }, ms || 2200);
  }

  function schedulePartnerReact() {
    clearTimeout(partnerTimer);
    if (Math.random() < 0.55) {
      var msg = PARTNER_REACTS[Math.floor(Math.random() * PARTNER_REACTS.length)];
      partnerTimer = setTimeout(function () { partnerToast(msg); }, 1300);
    }
  }

  function renderPicker() {
    view = 'picker'; curDeck = null; curCard = null; reshuffleNote = false;
    clearTimeout(partnerTimer);
    els.title.innerHTML = '\u2726 Question decks \u2726';
    var s = els.scroll; s.innerHTML = '';
    DK_DECKS.forEach(function (dk) {
      var b = el('button', 'dk-deck',
        '<div class="dk-star">\u2726 \u2726 \u2726</div>' +
        '<h3>' + esc(dk.title) + '</h3>' +
        '<div class="dk-count">' + dk.cards.length + ' cards' +
        (state.seen[dk.id].length ? ' · ' + state.seen[dk.id].length + ' answered' : '') + '</div>' +
        '<div class="dk-desc">' + esc(dk.desc) + '</div>');
      b.addEventListener('click', function () { renderCard(dk); });
      s.appendChild(b);
    });
    s.appendChild(el('div', 'dk-note',
      'Here, Tara is your island AI \u2014 she sees every card with you, and her reactions are imagined for now \u2726'));
  }

  function renderCard(deck) {
    view = 'card'; curDeck = deck;
    curCard = drawCard(deck);
    els.title.textContent = deck.title;
    paintCard();
  }

  function paintCard() {
    var s = els.scroll; s.innerHTML = '';
    var deck = curDeck, card = curCard;
    var n = state.seen[deck.id].length;

    s.appendChild(el('div', 'dk-prog', 'card ' + n + ' of ' + deck.cards.length));

    var c = el('div', 'dk-card pop',
      '<div class="dk-q">' + esc(card.text) + '</div>' +
      (card.tag && DK_TAG_LABELS[card.tag]
        ? '<div style="text-align:center"><span class="dk-tag">' + esc(DK_TAG_LABELS[card.tag]) + '</span></div>'
        : '') +
      '<div class="dk-sees">\u2726 Tara sees this too \u2726</div>');
    c.addEventListener('click', nextCard);
    s.appendChild(c);

    var nb = el('button', 'dk-new', 'New card \u2726');
    nb.addEventListener('click', function (e) { e.stopPropagation(); nextCard(); });
    s.appendChild(nb);

    if (reshuffleNote) {
      s.appendChild(el('div', 'dk-reshuf', 'deck complete \u2726 starting fresh'));
    }
    schedulePartnerReact();
  }

  function nextCard() {
    if (!curDeck) return;
    curCard = drawCard(curDeck);
    paintCard();
  }

  /* ------- open / close ------- */
  function open() {
    if (!els.root) buildDom();
    loadState();
    opened = true;
    els.root.classList.add('on');
    renderPicker();
    els.scroll.scrollTop = 0;
  }
  function close() {
    opened = false;
    clearTimeout(partnerTimer);
    if (els.root) els.root.classList.remove('on');
  }

  /* QA hooks (invisible in normal use):
     #decks=1            → opens the deck picker
     #decksqa=N          → opens picker, opens the first deck, draws N cards,
                            logs drawn ids into #dkQaLog + document.title
     #decksclear=1       → clears kanavu.decks.v1 first */
  function qaLog(ids) {
    if (els.qalog) els.qalog.textContent = ids.join(',');
    document.title = 'DECKSQA:' + ids.join(',');
  }
  var hashTries = 0;
  function hashCheck() {
    var m = location.hash.match(/decksqa=(\d+)/);
    if (m) {
      if (location.hash.indexOf('decksclear=1') >= 0) {
        try { localStorage.removeItem(LS_KEY); } catch (e) {}
      }
      open();
      var deck = DK_DECKS[0];
      var ids = [];
      for (var i = 0, n = parseInt(m[1], 10); i < n; i++) ids.push(drawCard(deck).id);
      curDeck = deck; curCard = deckById(deck.id).cards.filter(function (c) { return c.id === ids[ids.length - 1]; })[0];
      view = 'card';
      els.title.textContent = deck.title;
      paintCard();
      qaLog(ids);
      return;
    }
    if (location.hash.indexOf('decks=1') < 0) return;
    if (document.readyState === 'complete' || document.readyState === 'interactive') open();
    else if (++hashTries < 40) setTimeout(hashCheck, 300);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(hashCheck, 400); });
  } else {
    setTimeout(hashCheck, 400);
  }

  /* ------- public deck registration (M6: date-ideas deck) ------- */
  function registerDeck(deck) {
    if (!deck || !deck.id || !Array.isArray(deck.cards) || !deck.cards.length) return false;
    if (deckById(deck.id)) return false;
    DK_DECKS.push(deck);
    if (!state.seen[deck.id]) {
      var arr = [];
      try {
        var raw = localStorage.getItem(LS_KEY);
        if (raw) {
          var d = JSON.parse(raw);
          if (d && d.seen && Array.isArray(d.seen[deck.id])) {
            arr = d.seen[deck.id].filter(function (id) {
              return deck.cards.some(function (c) { return c.id === id; });
            });
          }
        }
      } catch (e) { /* fresh deck */ }
      state.seen[deck.id] = arr;
    }
    return true;
  }

  /* exposed for QA (parent agent / screenshots only) */
  function _testDraw(deckId) {
    var d = deckById(deckId || 'first-hellos');
    return drawCard(d).id;
  }
  function _testState() { return JSON.parse(JSON.stringify(state)); }

  return {
    open: open, close: close, isOpen: function () { return opened; },
    registerDeck: registerDeck,
    _testDraw: _testDraw, _testState: _testState, _decks: DK_DECKS
  };
})();

window.DecksUI = DecksUI;
