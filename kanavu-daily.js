/* ============================================================
   Kanavu — Daily Questions + Ritual (Stream 7)
   Full-screen candlelight question ritual: daily push, three
   question types (open / yes-no / this-or-that), 8 categories,
   side-by-side reveal with match celebration, star rewards,
   partner notifications, offline queue.

   Depends on: window.__kvApi (bridge injected in kanavu-game.js),
   THREE (for the storybook-nook tap marker only).
   Loads AFTER kanavu-game.js / kanavu-assets.js.
   ============================================================ */
'use strict';

/* ---------------- 1. question data ----------------
   112 questions: 8 categories x (8 open + 3 yes-no + 3 this-or-that).
   Voice: written for Adi & Tara (guitar, bubble tea, OK Kanmani,
   May 11, Tbilisi <-> Vancouver) but universal enough to ship.
   Spicy stays classy: romance-novel, never crude. */
var DQ_CATS = {
  romance:      { label:'Romance',       emoji:'\u{1F495}' },
  longdistance: { label:'Long Distance', emoji:'\u{1F319}' },
  emotional:    { label:'Emotional',     emoji:'\u{1F4A7}' },
  flirty:       { label:'Flirty',        emoji:'\u{1F60F}' },
  spicy:        { label:'Spicy',         emoji:'\u{1F525}' },
  fun:          { label:'Fun',           emoji:'\u{1F3B2}' },
  future:       { label:'Future',        emoji:'\u{1F52D}' },
  memories:     { label:'Memories',      emoji:'\u{1F4FC}' }
};
/* id, cat, type, text, options (this-or-that only) */
var DQ_QUESTIONS = [
/* ---------- ROMANCE ---------- */
{id:'r-o-01',cat:'romance',type:'open',text:"What's one small thing I do that makes you feel chosen, every single time?"},
{id:'r-o-02',cat:'romance',type:'open',text:"Describe the exact moment today you missed me most \u2014 what were you doing?"},
{id:'r-o-03',cat:'romance',type:'open',text:"If I could bottle one feeling I have for you and send it across the ocean, what would be in the bottle?"},
{id:'r-o-04',cat:'romance',type:'open',text:"What does my voice do to you on a rough day? Be honest."},
{id:'r-o-05',cat:'romance',type:'open',text:"Tell me about a time I made you feel beautiful without even trying."},
{id:'r-o-06',cat:'romance',type:'open',text:"What's your favorite tiny ritual of ours \u2014 the one you'd never trade?"},
{id:'r-o-07',cat:'romance',type:'open',text:"If our love story had a title track, which song is playing right now, and why?"},
{id:'r-o-08',cat:'romance',type:'open',text:"What do you want me to whisper to you the next time we're on a call and the world goes quiet?"},
{id:'r-y-01',cat:'romance',type:'yesno',text:"Do you still get butterflies when my name lights up your phone?"},
{id:'r-y-02',cat:'romance',type:'yesno',text:"Would you slow-dance with me in the kitchen at 2am if we lived together?"},
{id:'r-y-03',cat:'romance',type:'yesno',text:"Do you believe we were supposed to find each other, even across all these miles?"},
{id:'r-t-01',cat:'romance',type:'thisorthat',text:"Pick our perfect slow dance:",options:["Under the stars","In the rain"]},
{id:'r-t-02',cat:'romance',type:'thisorthat',text:"Which would melt you more?",options:["A handwritten love letter","A surprise voice note"]},
{id:'r-t-03',cat:'romance',type:'thisorthat',text:"Our ideal evening together:",options:["Sunset in comfortable silence","Talking until 3am"]},
/* ---------- LONG DISTANCE ---------- */
{id:'l-o-01',cat:'longdistance',type:'open',text:"What part of the day is hardest without me next to you \u2014 mornings, nights, or the in-between?"},
{id:'l-o-02',cat:'longdistance',type:'open',text:"What do you tell yourself on the nights the miles feel louder than my voice?"},
{id:'l-o-03',cat:'longdistance',type:'open',text:"If you could teleport to me for exactly one hour tonight, what would we do with it?"},
{id:'l-o-04',cat:'longdistance',type:'open',text:"What's the first thing you'll do when we finally stop counting time zones?"},
{id:'l-o-05',cat:'longdistance',type:'open',text:"How do you want me to love you from far away on the days a screen isn't enough?"},
{id:'l-o-06',cat:'longdistance',type:'open',text:"What small, ordinary moment do you most wish I was there for this week?"},
{id:'l-o-07',cat:'longdistance',type:'open',text:"When we're finally in the same city, what will our first lazy Sunday look like?"},
{id:'l-o-08',cat:'longdistance',type:'open',text:"What's one thing the distance taught you about us that closeness never could?"},
{id:'l-y-01',cat:'longdistance',type:'yesno',text:"Do you ever fall asleep on our calls just to feel close to me?"},
{id:'l-y-02',cat:'longdistance',type:'yesno',text:"Would you take a red-eye flight tomorrow if it meant one extra day together?"},
{id:'l-y-03',cat:'longdistance',type:'yesno',text:"Does the countdown to seeing me make the waiting better or harder?"},
{id:'l-t-01',cat:'longdistance',type:'thisorthat',text:"How do you want to stay close daily?",options:["One long call a day","Little messages all day long"]},
{id:'l-t-02',cat:'longdistance',type:'thisorthat',text:"Pick tonight's ritual:",options:["Falling asleep on a call together","Waking up to a good-morning voice note"]},
{id:'l-t-03',cat:'longdistance',type:'thisorthat',text:"Which would make your year?",options:["A surprise visit","A planned countdown trip"]},
/* ---------- EMOTIONAL ---------- */
{id:'e-o-01',cat:'emotional',type:'open',text:"What's one thing you're carrying right now that you haven't told me yet?"},
{id:'e-o-02',cat:'emotional',type:'open',text:"When do you feel most like yourself \u2014 and am I part of that version of you?"},
{id:'e-o-03',cat:'emotional',type:'open',text:"What are you afraid to want, because wanting it feels too big?"},
{id:'e-o-04',cat:'emotional',type:'open',text:"Tell me about a wound from before us that still aches sometimes. I want to understand it."},
{id:'e-o-05',cat:'emotional',type:'open',text:"What's something you're still learning to forgive yourself for?"},
{id:'e-o-06',cat:'emotional',type:'open',text:"What do you need to hear from me on the days you doubt yourself \u2014 not us, yourself?"},
{id:'e-o-07',cat:'emotional',type:'open',text:"What's the bravest thing you've ever done for love?"},
{id:'e-o-08',cat:'emotional',type:'open',text:"If you could ask me anything and I'd answer with total honesty, what would you ask?"},
{id:'e-y-01',cat:'emotional',type:'yesno',text:"Do you ever worry you're too much for someone to love \u2014 even me?"},
{id:'e-y-02',cat:'emotional',type:'yesno',text:"Have I ever hurt you without realizing it?"},
{id:'e-y-03',cat:'emotional',type:'yesno',text:"Do you feel truly seen by me, even from this far away?"},
{id:'e-t-01',cat:'emotional',type:'thisorthat',text:"When something's wrong, I should:",options:["Talk it out tonight","Sleep on it, talk tomorrow"]},
{id:'e-t-02',cat:'emotional',type:'thisorthat',text:"How do you open up best?",options:["A long honest letter","A raw late-night call"]},
{id:'e-t-03',cat:'emotional',type:'thisorthat',text:"When you're hurting, would you rather I:",options:["Sit with you in silence","Try to help fix it"]},
/* ---------- FLIRTY ---------- */
{id:'f-o-01',cat:'flirty',type:'open',text:"What's the most distracting thought you've had about me today?"},
{id:'f-o-02',cat:'flirty',type:'open',text:"If I was sitting next to you right now, what's the first thing you'd do?"},
{id:'f-o-03',cat:'flirty',type:'open',text:"Describe your favorite photo of me \u2014 and tell me exactly what it does to you."},
{id:'f-o-04',cat:'flirty',type:'open',text:"What's your move when you want my full attention?"},
{id:'f-o-05',cat:'flirty',type:'open',text:"If we were at a party and I caught your eye across the room, what would you be thinking?"},
{id:'f-o-06',cat:'flirty',type:'open',text:"What's the cheesiest line you've ever wanted to use on me but were too shy to say?"},
{id:'f-o-07',cat:'flirty',type:'open',text:"Rate my flirting 1\u201310, and give me one tip to do better."},
{id:'f-o-08',cat:'flirty',type:'open',text:"What's something small I do on video calls that drives you a little crazy \u2014 in the good way?"},
{id:'f-y-01',cat:'flirty',type:'yesno',text:"Do you ever rewatch our old photos just to stare at me a little longer?"},
{id:'f-y-02',cat:'flirty',type:'yesno',text:"Would you steal a kiss in public \u2014 even if people were watching?"},
{id:'f-y-03',cat:'flirty',type:'yesno',text:"Do I make you blush more over text or on video?"},
{id:'f-t-01',cat:'flirty',type:'thisorthat',text:"Pick your kiss:",options:["Forehead kiss","Kiss on the tip of your nose"]},
{id:'f-t-02',cat:'flirty',type:'thisorthat',text:"Cuddle positions \u2014 choose:",options:["Big spoon","Little spoon"]},
{id:'f-t-03',cat:'flirty',type:'thisorthat',text:"How do you want to flirt?",options:["Playful texts all day","One long flirty call at night"]},
/* ---------- SPICY ---------- */
{id:'s-o-01',cat:'spicy',type:'open',text:"Describe the slowest, most lingering kiss you can imagine us sharing \u2014 where are we?"},
{id:'s-o-02',cat:'spicy',type:'open',text:"What's one thing you've always wanted to try with me but haven't said out loud yet?"},
{id:'s-o-03',cat:'spicy',type:'open',text:"Tell me what you're wearing right now\u2026 and what you'd rather be wearing when I see you next."},
{id:'s-o-04',cat:'spicy',type:'open',text:"If we had the whole house to ourselves tonight, walk me through the first ten minutes."},
{id:'s-o-05',cat:'spicy',type:'open',text:"What's the most electric almost-moment we've ever had \u2014 the one that still gives you chills?"},
{id:'s-o-06',cat:'spicy',type:'open',text:"What's the one sentence that would completely undo me if you whispered it in person?"},
{id:'s-o-07',cat:'spicy',type:'open',text:"Describe how you'd wake me up if we woke up tangled together on a lazy morning."},
{id:'s-o-08',cat:'spicy',type:'open',text:"What's your favorite way I've ever made you feel wanted \u2014 even from miles away?"},
{id:'s-y-01',cat:'spicy',type:'yesno',text:"Do you ever think about me when you're trying to fall asleep\u2026 in that way?"},
{id:'s-y-02',cat:'spicy',type:'yesno',text:"Would you let me plan a whole evening where you don't have to think about anything but us?"},
{id:'s-y-03',cat:'spicy',type:'yesno',text:"Have you ever had a dream about us that you woke up blushing from?"},
{id:'s-t-01',cat:'spicy',type:'thisorthat',text:"Set the mood:",options:["Candlelight and slow music","Moonlight and the open sky"]},
{id:'s-t-02',cat:'spicy',type:'thisorthat',text:"Tonight we:",options:["A long massage that turns into more","Skip straight to the good part"]},
{id:'s-t-03',cat:'spicy',type:'thisorthat',text:"What undoes you faster?",options:["Whispered sweet nothings","Delicious silence and eye contact"]},
/* ---------- FUN ---------- */
{id:'n-o-01',cat:'fun',type:'open',text:"If we were a chaotic duo in a heist movie, what would our roles be \u2014 and what are we stealing?"},
{id:'n-o-02',cat:'fun',type:'open',text:"Invent our couple mascot: what is it, what's its name, what's its catchphrase?"},
{id:'n-o-03',cat:'fun',type:'open',text:"What would our couple theme song be if it had to be completely ridiculous?"},
{id:'n-o-04',cat:'fun',type:'open',text:"If we swapped lives for a day, what's the first thing you'd do as me?"},
{id:'n-o-05',cat:'fun',type:'open',text:"Design our dream food truck \u2014 what's on the menu and what's it called?"},
{id:'n-o-06',cat:'fun',type:'open',text:"What's the funniest misunderstanding we've ever had over text?"},
{id:'n-o-07',cat:'fun',type:'open',text:"Zombie apocalypse, just us: what's our survival strategy \u2014 and who panics first?"},
{id:'n-o-08',cat:'fun',type:'open',text:"What reality show would we absolutely win, and which one would destroy us?"},
{id:'n-y-01',cat:'fun',type:'yesno',text:"Would you survive 24 hours in an IKEA with me without a fight?"},
{id:'n-y-02',cat:'fun',type:'yesno',text:"Do you honestly think you'd beat me at Mario Kart?"},
{id:'n-y-03',cat:'fun',type:'yesno',text:"Would you do a silly dance with me in public if I asked?"},
{id:'n-t-01',cat:'fun',type:'thisorthat',text:"Our perfect date:",options:["Beach date","Mountain date"]},
{id:'n-t-02',cat:'fun',type:'thisorthat',text:"Friday night is:",options:["Karaoke night","Movie marathon"]},
{id:'n-t-03',cat:'fun',type:'thisorthat',text:"Dinner plans:",options:["Cook together (chaos)","Order in (peace)"]},
/* ---------- FUTURE ---------- */
{id:'u-o-01',cat:'future',type:'open',text:"Paint our first apartment together \u2014 what color are the walls, what's on the fridge?"},
{id:'u-o-02',cat:'future',type:'open',text:"What tradition should we start in our first year living in the same city?"},
{id:'u-o-03',cat:'future',type:'open',text:"Where in the world should we take our first real trip together \u2014 and why there?"},
{id:'u-o-04',cat:'future',type:'open',text:"What do you want our ordinary Tuesdays to look like five years from now?"},
{id:'u-o-05',cat:'future',type:'open',text:"If we had a garden together, what would we grow \u2014 and who'd actually water it?"},
{id:'u-o-06',cat:'future',type:'open',text:"What skill do you want us to learn together someday?"},
{id:'u-o-07',cat:'future',type:'open',text:"Describe the perfect version of the day we close the distance \u2014 morning to midnight."},
{id:'u-o-08',cat:'future',type:'open',text:"What do you hope we never lose about us, no matter how much life changes?"},
{id:'u-y-01',cat:'future',type:'yesno',text:"Do you picture us in a cozy apartment or a little house with a garden?"},
{id:'u-y-02',cat:'future',type:'yesno',text:"When we live together: dog, cat, or both?"},
{id:'u-y-03',cat:'future',type:'yesno',text:"Do you think we'll still do late-night calls when we're finally in the same city?"},
{id:'u-t-01',cat:'future',type:'thisorthat',text:"Our someday life:",options:["City life together","Quiet countryside"]},
{id:'u-t-02',cat:'future',type:'thisorthat',text:"When we make it official:",options:["Big celebration","Tiny ceremony, just us"]},
{id:'u-t-03',cat:'future',type:'thisorthat',text:"First order of togetherness:",options:["Travel the world","Build our nest"]},
/* ---------- MEMORIES ---------- */
{id:'m-o-01',cat:'memories',type:'open',text:"What was the very first voice note I ever sent you \u2014 do you remember what it said?"},
{id:'m-o-02',cat:'memories',type:'open',text:"What's a tiny detail from our early chats that still makes you smile?"},
{id:'m-o-03',cat:'memories',type:'open',text:"What song instantly teleports you back to our early days?"},
{id:'m-o-04',cat:'memories',type:'open',text:"Describe the night of May 11 in your own words \u2014 where were you, what did the air feel like?"},
{id:'m-o-05',cat:'memories',type:'open',text:"What's the sweetest thing I've ever done for you that I probably don't even remember?"},
{id:'m-o-06',cat:'memories',type:'open',text:"Which of our calls do you wish you could live inside for one more hour?"},
{id:'m-o-07',cat:'memories',type:'open',text:"What was the moment you knew \u2014 really knew \u2014 that this was real?"},
{id:'m-o-08',cat:'memories',type:'open',text:"What 'remember when' story of ours would you tell first, years from now?"},
{id:'m-y-01',cat:'memories',type:'yesno',text:"Do you still remember my very first profile photo, the one that started all this?"},
{id:'m-y-02',cat:'memories',type:'yesno',text:"Have you ever cried happy tears because of us?"},
{id:'m-y-03',cat:'memories',type:'yesno',text:"Do you keep any little thing that reminds you of me close by?"},
{id:'m-t-01',cat:'memories',type:'thisorthat',text:"If you could relive one night:",options:["Our first conversation","The night of May 11"]},
{id:'m-t-02',cat:'memories',type:'thisorthat',text:"Which memory do you replay more?",options:["Our funniest moment","Our sweetest moment"]},
{id:'m-t-03',cat:'memories',type:'thisorthat',text:"How should we keep us?",options:["A photo album of us","A playlist of our songs"]}
];

/* ---------------- 2. scheduler ----------------
   Category rotates daily through all 8 (never 5-in-a-row, by
   construction). Type mixes across the week on a 10-day pattern.
   Deterministic per date: both partners get the SAME question. */
var DQ_CAT_ORDER = ['romance','longdistance','emotional','flirty','spicy','fun','future','memories'];
var DQ_TYPE_PATTERN = ['open','thisorthat','open','yesno','open','open','thisorthat','open','yesno','open'];
function dqTodayStr(d){
  d = d || new Date();
  var p = function(n){ return (n<10?'0':'')+n; };
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
}
var DQ_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function dqShortDate(dateStr){
  var p = String(dateStr).split('-');
  return DQ_MONTHS[parseInt(p[1],10)-1]+' '+parseInt(p[2],10);
}
function dqDayIndex(dateStr){
  var a = new Date(dateStr+'T12:00:00');
  var b = new Date('2026-01-01T12:00:00');
  return Math.max(0, Math.round((a-b)/86400000));
}
function dqQuestionForDate(dateStr){
  var di = dqDayIndex(dateStr);
  var cat = DQ_CAT_ORDER[di % DQ_CAT_ORDER.length];
  var type = DQ_TYPE_PATTERN[di % DQ_TYPE_PATTERN.length];
  var bucket = DQ_QUESTIONS.filter(function(q){ return q.cat===cat && q.type===type; });
  if(!bucket.length) return DQ_QUESTIONS[di % DQ_QUESTIONS.length];
  var n = 0;
  for(var d=0; d<di; d++){
    if(DQ_CAT_ORDER[d % DQ_CAT_ORDER.length]===cat && DQ_TYPE_PATTERN[d % DQ_TYPE_PATTERN.length]===type) n++;
  }
  return bucket[n % bucket.length];
}

/* ---------------- 3. tiny helpers ---------------- */
function kvApi(){ return window.__kvApi || null; }
function kvToast(msg){
  var a = kvApi();
  if(a && a.toast){ try{ a.toast(msg); }catch(e){} return; }
  try{
    var t = document.getElementById('toast');
    if(!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._kvT); t._kvT = setTimeout(function(){ t.classList.remove('show'); }, 2600);
  }catch(e){}
}
function kvMe(){ try{ var s=kvApi().state(); return s && s.user ? s.user.id : null; }catch(e){ return null; } }
function kvPair(){ try{ var s=kvApi().state(); return s && s.pair ? s.pair : null; }catch(e){ return null; } }
function kvPartnerId(){ try{ return kvApi().partnerId(); }catch(e){ return null; } }
function kvMyName(){ try{ var s=kvApi().state(); return (s && s.profile && s.profile.display_name) || 'your love'; }catch(e){ return 'your love'; } }
function kvOnline(){ return (typeof navigator==='undefined' || navigator.onLine!==false); }
function kvSb(){
  try{
    var a = kvApi();
    if(a && a.sb){ var c = a.sb(); if(c) return c; }
  }catch(e){}
  /* fallback: own client (shares the game's localStorage session) */
  try{
    if(!kvSb._c && window.supabase && window.KANAVU_CONFIG){
      kvSb._c = window.supabase.createClient(window.KANAVU_CONFIG.SUPABASE_URL, window.KANAVU_CONFIG.SUPABASE_ANON_KEY);
    }
    return kvSb._c || null;
  }catch(e){ return null; }
}
function kvGet(k, fb){ try{ var v = localStorage.getItem(k); return v==null ? fb : JSON.parse(v); }catch(e){ return fb; } }
function kvSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }

/* offline write queue: [{table,row,ts}] — flushed when online */
function kvEnqueue(table, row){
  var q = kvGet('kanavu_sync_q', []);
  q.push({table:table, row:row, ts:Date.now()});
  kvSet('kanavu_sync_q', q.slice(-200));
}
async function kvFlushQueue(){
  var sb = kvSb();
  if(!sb || !kvOnline()) return;
  var q = kvGet('kanavu_sync_q', []);
  if(!q.length) return;
  var rest = [];
  for(var i=0;i<q.length;i++){
    try{
      var r = await sb.from(q[i].table).insert(q[i].row);
      if(r.error) rest.push(q[i]);
    }catch(e){ rest.push(q[i]); }
  }
  kvSet('kanavu_sync_q', rest);
}
function kvSend(table, row){
  /* best-effort immediate send, queued on failure.
     Promise.resolve() assimilates any thenable into a real promise,
     so unusual clients can't break the purchase/answer flow. */
  var sb = kvSb();
  if(!sb || !kvOnline()){ kvEnqueue(table, row); return Promise.resolve(false); }
  try{
    return Promise.resolve(sb.from(table).insert(row)).then(function(r){
      if(r && r.error) kvEnqueue(table, row);
      return !(r && r.error);
    }).catch(function(){ kvEnqueue(table, row); return false; });
  }catch(e){ kvEnqueue(table, row); return Promise.resolve(false); }
}

/* ---------------- 4. KVNav — bottom-nav shortcuts ----------------
   Dual-access pattern: every feature reachable by tapping its
   3D building AND by a nav pill. Other streams register their
   handlers via KVNav.register(id, handler). */
var KVNav = (function(){
  var handlers = {};
  function pill(id, emoji, label){
    var old = document.getElementById('kv-nav-'+id);
    if(old) return old;
    var b = document.createElement('button');
    b.className = 'pill'; b.id = 'kv-nav-'+id;
    b.innerHTML = '<span style="margin-right:8px">'+emoji+'</span>'+label+'<span class="kv-nav-dot hidden-el" id="kv-nav-dot-'+id+'"></span>';
    b.addEventListener('click', function(){
      var h = handlers[id];
      if(h){ try{ h(); }catch(e){ console.warn('[kvnav]', e); } }
      else kvToast(label+' is arriving soon \u{1F4AB}');
    });
    var menu = document.getElementById('hud-bottom');
    if(menu){
      var first = menu.querySelector('.pill');
      if(first) menu.insertBefore(b, first); else menu.appendChild(b);
    }
    return b;
  }
  return {
    register: function(id, emoji, label, handler){
      pill(id, emoji, label);
      if(handler) handlers[id] = handler;
    },
    setDot: function(id, on){
      var d = document.getElementById('kv-nav-dot-'+id);
      if(d) d.classList.toggle('hidden-el', !on);
    },
    has: function(id){ return !!handlers[id]; }
  };
})();

/* ---------------- 5. KVRitual — full-screen candlelight takeover ----------------
   Design tokens (shared by shop + profile for one premium language):
   - touch targets >= 48px (primary actions >= 56px)
   - sharp 2px outlines, consistent radii (18px cards / 999px pills)
   - Georgia serif, warm cream ink on deep amber/burgundy
   - crisp rendering: no blur filters on text, 1px sharp shadows */

var KVRitual = (function(){
  /* shared premium tokens — shop & profile reuse these */
  var CSS = [
    ':root{--kv-ink:#fff3e2;--kv-ink-dim:rgba(255,243,226,.64);--kv-gold:#ffe28a;--kv-gold-hi:#fff6d8;',
    '--kv-line:rgba(255,217,174,.5);--kv-panel:#241f4e;--kv-panel2:#3a2a5e;--kv-btn:64px;--kv-r:18px;',
    '--kv-rose:#ffd9ec;--kv-peri:#9be7ff;}',
    '#kv-ritual{position:fixed;inset:0;z-index:500;display:flex;flex-direction:column;overflow:hidden;',
    'font-family:Georgia,\'Times New Roman\',serif;color:var(--kv-ink);',
    'background:',
    'radial-gradient(130% 70% at 50% 112%,rgba(255,217,174,.34) 0%,rgba(255,217,174,0) 55%),',
    'radial-gradient(90% 55% at 82% 88%,rgba(196,166,216,.20) 0%,rgba(196,166,216,0) 60%),',
    'linear-gradient(180deg,#12122e 0%,#26215c 34%,#4e2c5e 62%,#7c4468 84%,#a86a72 100%);',
    'opacity:0;pointer-events:none;transition:opacity .6s ease;-webkit-font-smoothing:antialiased;}',
    '#kv-ritual.on{opacity:1;pointer-events:auto;}',
    '#kv-ritual .kv-glow{position:absolute;border-radius:50%;pointer-events:none;filter:blur(2px);}',
    '#kv-ritual .kv-glow.g1{width:78vmax;height:78vmax;left:-14vmax;bottom:-34vmax;',
    'background:radial-gradient(circle,rgba(255,217,174,.26) 0%,rgba(255,217,174,0) 62%);animation:kvflick1 4.2s ease-in-out infinite;}',
    '#kv-ritual .kv-glow.g2{width:60vmax;height:60vmax;right:-16vmax;bottom:-24vmax;',
    'background:radial-gradient(circle,rgba(255,217,236,.13) 0%,rgba(255,217,236,0) 60%);animation:kvflick2 6.8s ease-in-out infinite;}',
    '@keyframes kvflick1{0%,100%{opacity:.85;transform:scale(1);}30%{opacity:1;transform:scale(1.03);}55%{opacity:.78;transform:scale(.99);}80%{opacity:.95;transform:scale(1.015);}}',
    '@keyframes kvflick2{0%,100%{opacity:.7;transform:scale(1);}40%{opacity:.9;transform:scale(1.05);}70%{opacity:.6;transform:scale(.98);}}',
    '#kv-ember{position:absolute;inset:0;pointer-events:none;}',
    '#kv-ritual .kv-vig{position:absolute;inset:0;pointer-events:none;',
    'background:radial-gradient(115% 100% at 50% 45%,rgba(0,0,0,0) 55%,rgba(8,3,6,.55) 100%);}',
    '#kv-ritual .kv-head{flex:none;display:flex;align-items:center;gap:12px;padding:calc(14px + env(safe-area-inset-top)) 16px 6px;z-index:3;}',
    '#kv-ritual .kv-back{min-width:52px;min-height:52px;width:52px;height:52px;border-radius:50%;cursor:pointer;',
    'border:2px solid var(--kv-line);background:rgba(22,18,54,.6);color:var(--kv-ink);font-size:22px;font-family:inherit;}',
    '#kv-ritual .kv-back:active{transform:scale(.93);}',
    '#kv-ritual .kv-kicker{flex:1;text-align:center;font-size:13px;letter-spacing:.34em;text-indent:.34em;color:var(--kv-ink-dim);text-transform:uppercase;}',
    '#kv-ritual .kv-cat{display:inline-block;margin:10px auto 0;padding:9px 20px;min-height:40px;border:2px solid var(--kv-line);border-radius:999px;',
    'font-size:15px;letter-spacing:.14em;color:var(--kv-gold-hi);background:rgba(24,20,60,.62);z-index:2;}',
    '#kv-ritual .kv-scroll{flex:1;overflow-y:auto;padding:18px 26px calc(30px + env(safe-area-inset-bottom));',
    'display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:2;touch-action:pan-y;}',
    '#kv-ritual .kv-q{font-size:clamp(26px,6.4vw,40px);line-height:1.55;text-align:center;color:var(--kv-ink);',
    'max-width:640px;margin:26px 0 8px;text-shadow:0 1px 0 rgba(0,0,0,.6),0 0 26px rgba(255,170,90,.28);}',
    '#kv-ritual .kv-sub{font-size:15px;font-style:italic;color:var(--kv-ink-dim);text-align:center;max-width:480px;line-height:1.7;margin-bottom:8px;}',
    /* type: open */
    '#kv-ritual .kv-ta{width:100%;max-width:560px;min-height:132px;margin:22px 0 14px;padding:18px 20px;font-family:inherit;font-size:19px;line-height:1.6;',
    'color:#33305a;background:#fff8ec;border:2px solid var(--kv-gold);border-radius:var(--kv-r);resize:vertical;}',
    '#kv-ritual .kv-ta:focus{outline:2px solid var(--kv-gold-hi);outline-offset:2px;}',
    /* primary buttons: >=56px, sharp 2px outline */
    '#kv-ritual .kv-btn{display:block;min-height:var(--kv-btn);padding:16px 40px;margin:10px auto;border-radius:999px;cursor:pointer;',
    'font-family:inherit;font-size:20px;font-weight:700;letter-spacing:.04em;color:#4a3410;',
    'border:2px solid #a87c2a;background:linear-gradient(180deg,var(--kv-gold-hi),var(--kv-gold));',
    'box-shadow:0 4px 18px rgba(255,226,138,.35),inset 0 1px 0 rgba(255,255,255,.5);}',
    '#kv-ritual .kv-btn:active{transform:scale(.97);}',
    '#kv-ritual .kv-btn.ghost{background:rgba(24,20,60,.6);color:var(--kv-ink);border:2px solid var(--kv-line);box-shadow:none;font-weight:400;}',
    /* type: yes-no — two BIG buttons */
    '#kv-ritual .kv-yn{display:flex;gap:18px;width:100%;max-width:560px;margin:26px 0 10px;}',
    '#kv-ritual .kv-yn button{flex:1;min-height:88px;border-radius:22px;cursor:pointer;font-family:inherit;font-size:26px;font-weight:700;',
    'border:2px solid var(--kv-line);background:rgba(30,26,72,.88);color:var(--kv-ink);}',
    '#kv-ritual .kv-yn button small{display:block;font-size:14px;font-weight:400;color:var(--kv-ink-dim);margin-top:6px;}',
    '#kv-ritual .kv-yn button.picked{border:2px solid var(--kv-gold-hi);background:linear-gradient(180deg,#7a5a30,#2c2658);',
    'box-shadow:0 0 26px rgba(255,226,138,.5);}',
    '#kv-ritual .kv-yn button:active{transform:scale(.96);}',
    /* type: this-or-that — two BIG tappable cards */
    '#kv-ritual .kv-tot{display:flex;flex-direction:column;gap:16px;width:100%;max-width:560px;margin:26px 0 10px;}',
    '#kv-ritual .kv-tot button{min-height:96px;padding:20px 22px;border-radius:22px;cursor:pointer;text-align:center;',
    'font-family:inherit;font-size:22px;line-height:1.45;color:var(--kv-ink);',
    'border:2px solid var(--kv-line);background:rgba(30,26,72,.88);}',
    '#kv-ritual .kv-tot button .kv-vs{display:block;font-size:12px;letter-spacing:.3em;color:var(--kv-gold);margin-bottom:8px;}',
    '#kv-ritual .kv-tot button.picked{border:2px solid var(--kv-gold-hi);background:linear-gradient(180deg,#7a5a30,#2c2658);',
    'box-shadow:0 0 26px rgba(255,226,138,.5);}',
    '#kv-ritual .kv-tot button:active{transform:scale(.97);}',
    /* reveal */
    '#kv-ritual .kv-reveal{width:100%;max-width:600px;display:flex;flex-direction:column;gap:14px;margin:20px 0;}',
    '#kv-ritual .kv-acard{border:2px solid var(--kv-line);border-radius:var(--kv-r);background:rgba(30,26,72,.88);padding:18px 20px;}',
    '#kv-ritual .kv-acard h4{margin:0 0 8px;font-size:14px;letter-spacing:.22em;color:var(--kv-gold);text-transform:uppercase;}',
    '#kv-ritual .kv-acard p{margin:0;font-size:19px;line-height:1.6;color:var(--kv-ink);}',
    '#kv-ritual .kv-match{margin:6px auto 0;padding:22px 30px;border:2px solid var(--kv-gold-hi);border-radius:24px;text-align:center;',
    'background:linear-gradient(180deg,rgba(122,90,48,.92),rgba(52,40,88,.94));box-shadow:0 0 44px rgba(255,226,138,.55);',
    'animation:kvmatch .7s ease;}',
    '#kv-ritual .kv-match .kv-mbig{font-size:44px;}',
    '#kv-ritual .kv-match h3{margin:8px 0 4px;font-size:28px;color:var(--kv-gold-hi);letter-spacing:.06em;}',
    '#kv-ritual .kv-match p{margin:0;font-size:15px;font-style:italic;color:var(--kv-ink-dim);}',
    '@keyframes kvmatch{0%{opacity:0;transform:scale(.8);}60%{transform:scale(1.05);}100%{opacity:1;transform:scale(1);}}',
    '#kv-ritual .kv-wait{margin:24px 0;text-align:center;}',
    '#kv-ritual .kv-wait .kv-moon{font-size:46px;animation:kvmatch 2.4s ease-in-out infinite;}',
    '#kv-ritual .kv-wait p{font-size:17px;font-style:italic;color:var(--kv-ink-dim);line-height:1.7;}',
    '#kv-ritual .kv-foot{flex:none;padding:0 20px calc(18px + env(safe-area-inset-bottom));z-index:3;text-align:center;}',
    '#kv-ritual .kv-foot .kv-note{font-size:13px;font-style:italic;color:var(--kv-ink-dim);}',
    '#kv-ritual .kv-toast{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);background:rgba(22,18,54,.94);',
    'border:2px solid var(--kv-line);color:var(--kv-ink);font-size:15px;font-style:italic;padding:12px 24px;border-radius:999px;',
    'opacity:0;transition:opacity .3s;pointer-events:none;white-space:nowrap;z-index:9;}',
    '#kv-ritual .kv-toast.show{opacity:1;}',
    '@media (min-width:640px){#kv-ritual .kv-tot{flex-direction:row;}#kv-ritual .kv-tot button{flex:1;min-height:150px;}}'
  ].join('\n');

  var root=null, scrollEl=null, ember=null, emberCtx=null, emberRAF=0, embers=[];
  var dismissedSession = false, opened = false, swipeY0 = -1;

  function el(tag, cls, html){
    var e = document.createElement(tag);
    if(cls) e.className = cls;
    if(html!=null) e.innerHTML = html;
    return e;
  }
  function injectCSS(){
    if(document.getElementById('kv-ritual-css')) return;
    var st = document.createElement('style');
    st.id = 'kv-ritual-css'; st.textContent = CSS;
    document.head.appendChild(st);
  }
  function build(){
    injectCSS();
    root = el('div'); root.id = 'kv-ritual';
    root.setAttribute('aria-label','question ritual');
    root.innerHTML =
      '<div class="kv-glow g1"></div><div class="kv-glow g2"></div>'+
      '<canvas id="kv-ember"></canvas><div class="kv-vig"></div>'+
      '<div class="kv-head"><button class="kv-back" id="kv-back" aria-label="back to world">\u2039</button>'+
      '<div class="kv-kicker" id="kv-kicker">daily ritual</div>'+
      '<div style="width:52px"></div></div>'+
      '<div class="kv-scroll" id="kv-scroll"></div>'+
      '<div class="kv-foot" id="kv-foot"></div>'+
      '<div class="kv-toast" id="kv-toast"></div>';
    document.body.appendChild(root);
    scrollEl = root.querySelector('#kv-scroll');
    root.querySelector('#kv-back').addEventListener('click', function(){ close(true); });
    /* swipe-down on the header to dismiss */
    var head = root.querySelector('.kv-head');
    head.addEventListener('touchstart', function(e){ swipeY0 = e.touches[0].clientY; }, {passive:true});
    head.addEventListener('touchend', function(e){
      if(swipeY0<0) return;
      var dy = e.changedTouches[0].clientY - swipeY0; swipeY0 = -1;
      if(dy > 90) close(true);
    }, {passive:true});
    ember = root.querySelector('#kv-ember');
    try{ emberCtx = ember.getContext('2d'); }catch(e){}
  }

  /* cheap ember particles — subtle, candlelit */
  function emberSize(){
    if(!ember) return;
    ember.width = root.clientWidth; ember.height = root.clientHeight;
  }
  function emberSpawn(){
    embers = [];
    var n = Math.min(42, Math.floor(root.clientWidth/22));
    for(var i=0;i<n;i++) embers.push({
      x: Math.random()*ember.width, y: ember.height*(0.35+Math.random()*0.65),
      r: 1+Math.random()*2.4, s: .25+Math.random()*.7, ph: Math.random()*6.28,
      c: Math.random()<.5 ? '255,226,138' : '255,217,174'
    });
  }
  function emberTick(){
    if(!opened || !emberCtx) return;
    emberCtx.clearRect(0,0,ember.width,ember.height);
    for(var i=0;i<embers.length;i++){
      var p = embers[i];
      p.y -= p.s; p.ph += .02; p.x += Math.sin(p.ph)*.35;
      if(p.y < ember.height*0.08){ p.y = ember.height*(0.9+Math.random()*.1); p.x = Math.random()*ember.width; }
      emberCtx.beginPath();
      emberCtx.fillStyle = 'rgba('+p.c+','+(0.25+0.35*Math.abs(Math.sin(p.ph)))+')';
      emberCtx.arc(p.x, p.y, p.r, 0, 6.283);
      emberCtx.fill();
    }
    emberRAF = requestAnimationFrame(emberTick);
  }

  function open(){
    if(!root) build();
    if(opened) return;
    opened = true;
    /* crossfade the 3D world out — overlay is fully opaque; hide the
       canvas so the GPU isn't compositing a hidden scene */
    try{
      var sw = document.getElementById('scene-wrap');
      if(sw){ sw.dataset.kvWas = sw.style.visibility || ''; sw.style.visibility = 'hidden'; }
      document.body.classList.add('kv-ritual-open');
    }catch(e){}
    scrollEl.scrollTop = 0;
    root.classList.add('on');
    emberSize(); emberSpawn();
    cancelAnimationFrame(emberRAF); emberTick();
  }
  function close(dismissed){
    if(!root || !opened) return;
    opened = false;
    if(dismissed) dismissedSession = true;
    cancelAnimationFrame(emberRAF);
    root.classList.remove('on');
    try{
      var sw = document.getElementById('scene-wrap');
      if(sw) sw.style.visibility = sw.dataset.kvWas || '';
      document.body.classList.remove('kv-ritual-open');
    }catch(e){}
  }
  function isOpen(){ return opened; }
  function wasDismissed(){ return dismissedSession; }
  function resetDismiss(){ dismissedSession = false; }

  function ensure(){ if(!root) build(); }
  function setKicker(t){ ensure(); var k = root.querySelector('#kv-kicker'); if(k) k.textContent = t; }
  function setBody(node){ ensure(); scrollEl.innerHTML=''; scrollEl.appendChild(node); scrollEl.scrollTop = 0; }
  function setFoot(html){
    ensure();
    var f = root.querySelector('#kv-foot');
    f.innerHTML = html || '';
  }
  function rToast(msg){
    var t = root.querySelector('#kv-toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._t); t._t = setTimeout(function(){ t.classList.remove('show'); }, 2400);
  }
  function catPill(q){
    var c = DQ_CATS[q.cat] || {label:q.cat, emoji:'\u2728'};
    var d = el('div','kv-cat', c.emoji+' &nbsp;'+c.label);
    return d;
  }
  function qHero(q, sub){
    var w = el('div');
    w.appendChild(catPill(q));
    var h = el('div','kv-q', q.text);
    w.appendChild(h);
    if(sub){ var s = el('div','kv-sub', sub); w.appendChild(s); }
    return w;
  }

  return {
    open:open, close:close, isOpen:isOpen, wasDismissed:wasDismissed, resetDismiss:resetDismiss,
    setKicker:setKicker, setBody:setBody, setFoot:setFoot, toast:rToast,
    el:el, catPill:catPill, qHero:qHero, injectCSS:injectCSS
  };
})();

/* ---------------- 6. KVDaily — the engagement loop ---------------- */
var KVDaily = (function(){
  var pushedToday = false;

  function myAnswer(dateStr){
    return kvGet('kanavu_daily_'+dateStr, null);
  }
  function answeredToday(){
    var a = myAnswer(dqTodayStr());
    return !!(a && a.answer!=null && a.answer!=='');
  }

  /* ----- star helpers (bridge-safe) ----- */
  function awardStars(n, why){
    var a = kvApi();
    try{
      if(a && a.addStars){ a.addStars(n); }
      else{
        var b = Math.max(0, parseInt(localStorage.getItem('kanavu_stars')||'0',10)+n);
        try{ localStorage.setItem('kanavu_stars', String(b)); }catch(e){}
        var p = document.getElementById('star-pill'); if(p) p.textContent = '\u2B50 '+b;
      }
      /* lifetime ledger (never decreases) */
      if(n>0){
        var lt = kvGet('kanavu_stars_lifetime', 0)+n;
        kvSet('kanavu_stars_lifetime', lt);
      }
    }catch(e){}
  }

  /* ----- question screens ----- */
  function showDaily(){
    var dateStr = dqTodayStr();
    var q = dqQuestionForDate(dateStr);
    var mine = myAnswer(dateStr);
    if(mine && mine.answer!=null && mine.answer!==''){
      /* already answered: reveal if partner did too, else the waiting room */
      checkReveal(dateStr, q, true).then(function(ok){
        if(!ok && !KVRitual.isOpen()) showWaiting(q);
      });
      return;
    }
    KVRitual.setKicker('daily ritual \u00B7 '+dqShortDate(dateStr));
    var body = KVRitual.el('div');
    body.appendChild(KVRitual.qHero(q, typeHint(q)));
    if(q.type==='open'){
      var ta = KVRitual.el('textarea','kv-ta');
      ta.placeholder = 'write from the heart\u2026';
      ta.setAttribute('aria-label','your answer');
      body.appendChild(ta);
      var send = KVRitual.el('button','kv-btn','send to the stars \u2728');
      send.addEventListener('click', function(){
        var v = ta.value.trim();
        if(!v){ KVRitual.toast('write a little something first \u{1F4AD}'); ta.focus(); return; }
        submitAnswer(q, v);
      });
      body.appendChild(send);
    }else if(q.type==='yesno'){
      var yn = KVRitual.el('div','kv-yn');
      var yb = KVRitual.el('button',null,'Yes \u{1F90D}<small>from the heart</small>');
      var nb = KVRitual.el('button',null,'No <small>honestly</small>');
      yb.addEventListener('click', function(){ yb.classList.add('picked'); submitAnswer(q, 'Yes'); });
      nb.addEventListener('click', function(){ nb.classList.add('picked'); submitAnswer(q, 'No'); });
      yn.appendChild(yb); yn.appendChild(nb);
      body.appendChild(yn);
    }else{ /* thisorthat */
      var tot = KVRitual.el('div','kv-tot');
      q.options.forEach(function(opt, i){
        var b = KVRitual.el('button',null,'<span class="kv-vs">'+(i===0?'this':'that')+'</span>'+escapeHtml(opt));
        b.addEventListener('click', function(){ b.classList.add('picked'); submitAnswer(q, opt); });
        tot.appendChild(b);
      });
      body.appendChild(tot);
    }
    KVRitual.setBody(body);
    KVRitual.setFoot('<div class="kv-note">your answer stays hidden until you both answer \u{1F512}</div>');
    KVRitual.open();
  }
  function typeHint(q){
    if(q.type==='yesno') return 'no typing needed \u2014 just tap what\u2019s true';
    if(q.type==='thisorthat') return 'both are lovely \u2014 that\u2019s the fun of choosing';
    return 'take your time \u2014 there\u2019s no wrong answer here';
  }
  function escapeHtml(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ----- submit ----- */
  async function submitAnswer(q, answer){
    var dateStr = dqTodayStr();
    var rec = { date:dateStr, qid:q.id, qtype:q.type, answer:answer, at:new Date().toISOString() };
    kvSet('kanavu_daily_'+dateStr, rec);
    awardStars(10, 'daily');
    try{ if(window.KVProfile) KVProfile.recordDaily(dateStr); }catch(e){}
    var me = kvMe(), partner = kvPartnerId();
    if(me){
      kvSend('daily_answers', { user_id:me, question_date:dateStr, question_id:q.id, answer_text:answer, answered_at:rec.at });
    }
    if(partner){
      kvSend('notifications', {
        to_user: partner, type:'daily_answered', read:false,
        message: kvMyName()+" answered today's question \u2014 waiting for you \u{1F49B}",
        data: { date:dateStr, from:me }
      });
    }
    kvToast('daily ritual complete \u00B7 +10\u2B50');
    showWaiting(q);
    /* maybe partner already answered -> reveal */
    setTimeout(function(){ checkReveal(dateStr, q, false); }, 1200);
  }

  function showWaiting(q){
    KVRitual.setKicker('sent to the stars');
    var body = KVRitual.el('div');
    body.appendChild(KVRitual.qHero(q, null));
    var w = KVRitual.el('div','kv-wait',
      '<div class="kv-moon">\u{1F319}</div><p>your answer is drifting across the sky\u2026<br>'+
      'you\u2019ll both see the reveal when your love answers \u{1F49B}</p>');
    body.appendChild(w);
    var again = KVRitual.el('button','kv-btn ghost','back to the island');
    again.addEventListener('click', function(){ KVRitual.close(true); });
    body.appendChild(again);
    KVRitual.setBody(body);
    KVRitual.setFoot('<div class="kv-note">+10\u2B50 earned \u00B7 answers unlock side-by-side</div>');
    if(!KVRitual.isOpen()) KVRitual.open();
  }

  /* ----- reveal (no peeking: partner text only fetched after BOTH exist) ----- */
  async function checkReveal(dateStr, q, openIfReady){
    var me = kvMe(), partner = kvPartnerId();
    var mine = myAnswer(dateStr);
    if(!mine || mine.answer==null || mine.answer==='') return false;
    if(!me || !partner){ return false; }
    var sb = kvSb();
    if(!sb || !kvOnline()) return false;
    try{
      /* step 1: ids only — never fetch text before both exist */
      var ids = await sb.from('daily_answers').select('user_id')
        .eq('question_date', dateStr).in('user_id', [me, partner]);
      if(ids.error || !ids.data) return false;
      var have = {};
      ids.data.forEach(function(r){ have[r.user_id]=1; });
      if(!have[me] || !have[partner]) return false;
      /* step 2: both answered — safe to fetch */
      var res = await sb.from('daily_answers').select('user_id,answer_text')
        .eq('question_date', dateStr).in('user_id', [me, partner]);
      if(res.error || !res.data || res.data.length<2) return false;
      var answers = {};
      res.data.forEach(function(r){ answers[r.user_id]=r.answer_text; });
      if(openIfReady || KVRitual.isOpen()) showReveal(q, answers[me], answers[partner]);
      /* tell partner the reveal is ready */
      kvSend('notifications', {
        to_user: partner, type:'daily_reveal', read:false,
        message: "today's answers are revealed \u2728 come see them side-by-side",
        data: { date:dateStr }
      });
      return true;
    }catch(e){ return false; }
  }

  function showReveal(q, myA, partnerA){
    KVRitual.setKicker('the reveal \u2728');
    var body = KVRitual.el('div');
    body.appendChild(KVRitual.qHero(q, 'side by side, at last'));
    var rev = KVRitual.el('div','kv-reveal');
    rev.appendChild(answerCard('you', myA));
    rev.appendChild(answerCard('your love', partnerA));
    body.appendChild(rev);
    var match = false;
    if(q.type==='thisorthat' && myA===partnerA) match = true;
    if(q.type==='yesno' && myA===partnerA && myA==='Yes') match = true;
    if(match){
      var m = KVRitual.el('div','kv-match',
        '<div class="kv-mbig">\u{1F49B}</div><h3>it\u2019s a match!</h3><p>two hearts, one answer</p>');
      body.appendChild(m);
      setTimeout(matchBurst, 450);
      try{ if(window.KVProfile) KVProfile.recordMatch(); }catch(e){}
    }
    var done = KVRitual.el('button','kv-btn','back to the island \u{1F3DD}');
    done.addEventListener('click', function(){ KVRitual.close(true); });
    body.appendChild(done);
    KVRitual.setBody(body);
    KVRitual.setFoot('<div class="kv-note">tomorrow brings a new question \u{1F319}</div>');
    if(!KVRitual.isOpen()) KVRitual.open();
  }
  function answerCard(who, text){
    var d = KVRitual.el('div','kv-acard');
    d.appendChild(KVRitual.el('h4',null,escapeHtml(who)));
    d.appendChild(KVRitual.el('p',null,escapeHtml(text)));
    return d;
  }
  /* match celebration: heart + firefly burst on the ember canvas */
  function matchBurst(){
    try{
      var cv = document.getElementById('kv-ember');
      if(!cv) return;
      var ctx = cv.getContext('2d');
      var parts = [];
      for(var i=0;i<70;i++){
        parts.push({ x:cv.width/2+(Math.random()-.5)*120, y:cv.height*0.42,
          vx:(Math.random()-.5)*5, vy:-2-Math.random()*4, r:2+Math.random()*3.5,
          life:1, heart:Math.random()<.45 });
      }
      var t0 = performance.now();
      (function tick(){
        var dt = Math.min(50, performance.now()-t0); t0 = performance.now();
        var done = true;
        for(var i=0;i<parts.length;i++){
          var p = parts[i];
          if(p.life<=0) continue; done = false;
          p.x+=p.vx; p.y+=p.vy; p.vy+=.06; p.life-=.012;
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.fillStyle = p.heart ? '#ffd9ec' : '#ffe28a';
          if(p.heart){ ctx.font = (p.r*4)+'px serif'; ctx.fillText('\u2665', p.x, p.y); }
          else{ ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,6.283); ctx.fill(); }
        }
        ctx.globalAlpha = 1;
        if(!done) requestAnimationFrame(tick);
      })();
    }catch(e){}
  }

  /* ----- notifications ----- */
  var lastNotifCheck = 0;
  async function checkNotifications(){
    var now = Date.now();
    if(now - lastNotifCheck < 45000) return;
    lastNotifCheck = now;
    var me = kvMe();
    if(!me) return;
    var sb = kvSb();
    if(!sb || !kvOnline()) return;
    try{
      var res = await sb.from('notifications').select('id,type,message,data,created_at')
        .eq('to_user', me).eq('read', false).order('created_at', {ascending:true}).limit(10);
      if(res.error || !res.data || !res.data.length) return;
      for(var i=0;i<res.data.length;i++){
        handleNotification(res.data[i]);
      }
      var ids = res.data.map(function(n){ return n.id; });
      await sb.from('notifications').update({read:true}).in('id', ids);
    }catch(e){}
  }
  function handleNotification(n){
    KVNav.setDot('daily', true);
    setFabDot(true);
    if(n.type==='gift'){
      kvToast('\u{1F381} '+(n.message || 'a gift waits on your island'));
      try{ if(window.KVProfile) KVProfile.recordGiftReceived(); }catch(e){}
    }else if(n.type==='daily_reveal'){
      kvToast('\u2728 today\u2019s answers are revealed');
      var q = dqQuestionForDate(dqTodayStr());
      checkReveal(dqTodayStr(), q, true);
    }else if(n.type==='daily_answered'){
      kvToast('\u{1F49B} '+(n.message || 'your love answered today\u2019s question'));
      if(!answeredToday() && !KVRitual.wasDismissed()) showDaily();
    }else{
      kvToast(n.message || 'something new \u2728');
    }
  }
  function setFabDot(on){
    try{
      var fab = document.getElementById('fab-btn');
      if(!fab) return;
      var d = document.getElementById('kv-fab-dot');
      if(!d){
        d = document.createElement('span'); d.id = 'kv-fab-dot';
        fab.style.position = 'relative';
        fab.appendChild(d);
      }
      d.style.cssText = 'position:absolute;top:6px;right:6px;width:14px;height:14px;border-radius:50%;'+
        'background:#ffe28a;border:2px solid #fff;box-shadow:0 0 10px rgba(255,226,138,.9);display:'+(on?'block':'none');
    }catch(e){}
  }

  /* ----- push on game open ----- */
  function onGameOpen(){
    kvFlushQueue();
    checkNotifications();
    var dateStr = dqTodayStr();
    if(pushedToday === dateStr) return;
    pushedToday = dateStr;
    if(answeredToday() || KVRitual.wasDismissed() || KVRitual.isOpen()) return;
    setTimeout(function(){
      if(answeredToday() || KVRitual.wasDismissed() || KVRitual.isOpen()) return;
      showDaily();
    }, 1600);
  }
  function watchGameOpen(){
    var gs = document.getElementById('game-screen');
    if(!gs) return;
    if(!gs.classList.contains('hidden')) setTimeout(onGameOpen, 1200);
    try{
      new MutationObserver(function(){
        if(!gs.classList.contains('hidden')) onGameOpen();
      }).observe(gs, {attributes:true, attributeFilter:['class']});
    }catch(e){}
    setInterval(function(){
      var g = document.getElementById('game-screen');
      if(g && !g.classList.contains('hidden')){ kvFlushQueue(); checkNotifications(); }
    }, 60000);
  }

  /* ----- storybook nook: fixed 3D tap target for questions ----- */
  var nookPos = {x:24, z:19};
  function buildNook(){
    try{
      var W = window.__kvWorld;
      if(!W || !W.scene || W._kvNook) return;
      var T = window.THREE;
      var g = new THREE.Group();
      var mat = function(c){ return new T.MeshStandardMaterial({color:c, roughness:.9}); };
      /* little wooden stall */
      var wood = mat(0x8a5a3a), woodD = mat(0x6b422a), cream = mat(0xfff6e8);
      var counter = new T.Mesh(new T.BoxGeometry(2.2,.9,1.1), wood); counter.position.y=.45; g.add(counter);
      var roof = new T.Mesh(new T.ConeGeometry(1.9,1.1,4), mat(0xb96a7e)); roof.position.y=2.2; roof.rotation.y=Math.PI/4; g.add(roof);
      [-0.95,0.95].forEach(function(x){
        var post = new T.Mesh(new T.CylinderGeometry(.09,.09,1.7,6), woodD);
        post.position.set(x,1.25,-.35); g.add(post);
      });
      /* book stack */
      var cols = [0xc4a6d8,0x9be7ff,0xffd9ec,0xffe28a];
      cols.forEach(function(c,i){
        var b = new T.Mesh(new T.BoxGeometry(.55,.16,.4), mat(c));
        b.position.set(-.5,.98+i*.17,0); b.rotation.y = (i%2? .12 : -.1); g.add(b);
      });
      var open = new T.Mesh(new T.BoxGeometry(.7,.06,.5), cream);
      open.position.set(.55,1.0,0); open.rotation.z = .18; g.add(open);
      /* lantern glow */
      var lampM = new T.MeshStandardMaterial({color:0xffe28a, emissive:0xffc46a, emissiveIntensity:1.4});
      var lamp = new T.Mesh(new T.SphereGeometry(.22,10,8), lampM);
      lamp.position.set(0,2.05,.3); g.add(lamp);
      var halo = new T.Mesh(new T.SphereGeometry(.5,10,8),
        new T.MeshBasicMaterial({color:0xffd9ae, transparent:true, opacity:.18}));
      halo.position.copy(lamp.position); g.add(halo);
      /* floating label */
      var cv = document.createElement('canvas'); cv.width=256; cv.height=80;
      var cx = cv.getContext('2d');
      cx.font = '700 44px Georgia'; cx.textAlign='center';
      cx.fillStyle = '#fff3e2'; cx.shadowColor='rgba(0,0,0,.6)'; cx.shadowBlur=6;
      cx.fillText('\u{1F4D6} stories', 128, 52);
      var tex = new T.CanvasTexture(cv);
      var spr = new T.Sprite(new T.SpriteMaterial({map:tex, transparent:true, depthWrite:false}));
      spr.scale.set(3.4,1.06,1); spr.position.y = 3.6; g.add(spr);
      var gy = W.groundY ? W.groundY(nookPos.x, nookPos.z) : 0;
      g.position.set(nookPos.x, gy, nookPos.z);
      g.rotation.y = -0.5;
      W.scene.add(g);
      W._kvNook = g;
      g.userData.kvTap = 'nook';
      try{
        (W.staticColliders = W.staticColliders||[]).push({x:nookPos.x, z:nookPos.z, r:1.6});
      }catch(e){}
    }catch(e){ console.warn('[kvdaily] nook', e); }
  }
  /* tap wrapper: check our tap zones first, then the game's handler */
  var myTap = null, ray = null, v2 = null;
  function zoneTap(x, y){
    try{
      var W = window.__kvWorld, T = window.THREE;
      if(!T || !W || !W.camera) return false;
      ray = ray || new T.Raycaster();
      v2 = v2 || new T.Vector2();
      v2.x = (x/window.innerWidth)*2-1;
      v2.y = -(y/window.innerHeight)*2+1;
      ray.setFromCamera(v2, W.camera);
      var targets = [];
      if(W._kvNook) targets.push(W._kvNook);
      if(window.KVShop && KVShop.tapTarget){ var st = KVShop.tapTarget(); if(st) targets.push(st); }
      if(!targets.length) return false;
      var hits = ray.intersectObjects(targets, true);
      if(!hits.length) return false;
      var o = hits[0].object;
      while(o && !o.userData.kvTap) o = o.parent;
      if(!o) return false;
      if(o.userData.kvTap==='nook'){ showDaily(); return true; }
      if(o.userData.kvTap==='shop' && window.KVShop){ KVShop.open(); return true; }
    }catch(e){}
    return false;
  }
  function makeTap(prev){
    var fn = function(x, y){
      if(zoneTap(x, y)) return;
      if(prev) return prev(x, y);
    };
    fn._kvWrapped = true;
    return fn;
  }
  function wrapTap(){
    try{
      var W = window.__kvWorld;
      if(!W || myTap) return;
      myTap = makeTap(W.onTap);
      W.onTap = myTap;
      /* re-chain if the game swaps its handler (e.g. deco mode enter/exit) */
      setInterval(function(){
        try{
          if(W.onTap !== myTap){
            myTap = makeTap(W.onTap);
            W.onTap = myTap;
          }
        }catch(e){}
      }, 3000);
    }catch(e){}
  }

  function init(){
    KVNav.register('daily', '\u2753', 'Daily', function(){
      var dateStr = dqTodayStr();
      var q = dqQuestionForDate(dateStr);
      if(answeredToday()){
        checkReveal(dateStr, q, true).then(function(ok){
          if(!ok && !KVRitual.isOpen()) showWaiting(q);
        });
      }else showDaily();
    });
    KVNav.register('decks', '\u{1F0CF}', 'Decks', null);
    KVNav.register('memories', '\u{1F4D6}', 'Memories', null);
    KVNav.register('beacon', '\u{1F56F}', 'Beacon', null);
    watchGameOpen();
    var tries = 0;
    var t = setInterval(function(){
      try{
        if(window.__kvWorld && window.__kvWorld.scene){
          clearInterval(t);
          buildNook();
          wrapTap();
        }else if(++tries > 60) clearInterval(t);
      }catch(e){}
    }, 1000);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', init);
  }else init();

  return {
    questionForDate: dqQuestionForDate,
    openDaily: showDaily,
    answeredToday: answeredToday,
    checkNotifications: checkNotifications,
    awardStars: awardStars
  };
})();
