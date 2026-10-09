/* ============================================================
   Kanavu — Couple Profile / Progress (Stream 7 retention engine)
   Side-by-side partner progress: streaks, totals, stars, badges,
   purchases, gifts. Streak-at-risk nudges (pause, never shatter),
   daily check-in +2*, milestone celebrations, weekly recap card.
   Full-screen premium UI in the world's tones.

   Depends on: kanavu-daily.js (KVNav, kv* helpers, KVDaily),
   kanavu-shop.js (KVShop.OUTFITS for the shelf).
   Loads AFTER both.
   ============================================================ */
'use strict';

var KVProfile = (function(){
  /* ---------------- badges ---------------- */
  var BADGES = [
    {id:'first_daily', emoji:'\u{1F56F}', name:'First Ritual', desc:'answered your first daily question'},
    {id:'streak_7', emoji:'\u{1F525}', name:'7-Day Glow', desc:'7 days of daily rituals'},
    {id:'streak_30', emoji:'\u{1F525}', name:'30-Day Blaze', desc:'30 days of daily rituals'},
    {id:'streak_100', emoji:'\u{1F525}', name:'100-Day Inferno', desc:'100 days of daily rituals'},
    {id:'streak_365', emoji:'\u{1F525}', name:'Year of Us', desc:'365 days of daily rituals'},
    {id:'questions_50', emoji:'\u{1F4AB}', name:'50 Questions Deep', desc:'answered 50 daily questions'},
    {id:'first_match', emoji:'\u{1F49B}', name:'First Match!', desc:'picked the same answer on a this-or-that'},
    {id:'first_gift_sent', emoji:'\u{1F381}', name:'Gift Giver', desc:'sent your first shop gift'},
    {id:'first_gift_received', emoji:'\u{1F49D}', name:'Gifted', desc:'received your first shop gift'},
    {id:'first_purchase', emoji:'\u{1F6CD}', name:'First Treat', desc:'bought your first shop item'},
    {id:'beacon_7', emoji:'\u{1F54C}', name:'Beacon Keeper', desc:'7-day beacon ritual streak'}
  ];
  var MILESTONES = [7,30,100,365];

  /* ---------------- local state ---------------- */
  function myDays(){ return kvGet('kanavu_daily_days', []); }
  function myBadges(){ return kvGet('kanavu_badges', []); }
  function hasBadge(id){ return myBadges().indexOf(id)>=0; }
  function awardBadge(id){
    if(hasBadge(id)) return false;
    var b = myBadges(); b.push(id); kvSet('kanavu_badges', b);
    var def = BADGES.filter(function(x){ return x.id===id; })[0];
    kvToast((def?def.emoji+' ':'')+'badge earned: '+(def?def.name:id)+' \u{1F3C6}');
    syncProfile();
    return true;
  }
  function logEvent(key){
    var l = kvGet(key, []);
    l.push(Date.now()); kvSet(key, l.slice(-300));
  }
  function weekCount(key){
    var now = new Date(), dow = (now.getDay()+6)%7; /* Monday=0 */
    var mon = new Date(now); mon.setDate(now.getDate()-dow); mon.setHours(0,0,0,0);
    var t0 = mon.getTime();
    return kvGet(key, []).filter(function(t){ return t>=t0; }).length;
  }

  /* ---------------- events from the loop ---------------- */
  function recordDaily(dateStr){
    var days = myDays();
    if(days.indexOf(dateStr)<0){ days.push(dateStr); days.sort(); kvSet('kanavu_daily_days', days); }
    var n = days.length;
    awardBadge('first_daily');
    if(n>=50) awardBadge('questions_50');
    MILESTONES.forEach(function(m){ if(n>=m) awardBadge('streak_'+m); });
    if(MILESTONES.indexOf(n)>=0){
      kvToast('\u{1F525} '+n+'-day streak! you two are unstoppable');
    }
    logEvent('kanavu_daily_log');
    syncProfile();
  }
  function recordMatch(){ logEvent('kanavu_matches_log'); awardBadge('first_match'); }
  function recordGiftSent(){ awardBadge('first_gift_sent'); }
  function recordGiftReceived(){
    var n = kvGet('kanavu_gifts_received', 0)+1; kvSet('kanavu_gifts_received', n);
    awardBadge('first_gift_received');
  }
  function recordPurchase(){ awardBadge('first_purchase'); }
  function noteWorn(){}

  /* best-effort Supabase mirror so the partner sees live data */
  var lastSync = 0;
  function syncProfile(){
    try{
      var now = Date.now(); if(now-lastSync < 20000) return; lastSync = now;
      var me = kvMe(); if(!me || !kvOnline()) return;
      var sb = kvSb(); if(!sb) return;
      var days = myDays();
      var row = {
        question_streak: days.length,
        question_longest: days.length,
        last_daily_date: days.length? days[days.length-1] : null,
        badges: myBadges(),
        stars_lifetime: kvGet('kanavu_stars_lifetime', 0)
      };
      sb.from('profiles').update(row).eq('id', me).then(function(){},function(){});
    }catch(e){}
  }
  async function partnerProfile(){
    try{
      var pid = kvPartnerId(); if(!pid || !kvOnline()) return null;
      var sb = kvSb(); if(!sb) return null;
      var r = await sb.from('profiles')
        .select('display_name,question_streak,question_longest,beacon_streak,badges,stars_lifetime,last_daily_date')
        .eq('id', pid).maybeSingle();
      if(r.error || !r.data) return null;
      return r.data;
    }catch(e){ return null; }
  }

  /* ---------------- daily check-in +2* ---------------- */
  function checkIn(){
    var d = dqTodayStr();
    if(kvGet('kanavu_checkin_'+d, null)) return;
    kvSet('kanavu_checkin_'+d, 1);
    try{
      if(window.KVDaily) KVDaily.awardStars(2);
      else{
        var a = window.__kvApi;
        if(a && a.addStars) a.addStars(2);
      }
    }catch(e){}
    setTimeout(function(){ kvToast('daily check-in \u00B7 +2\u2B50 welcome back \u{1F49B}'); }, 3600);
  }

  /* ---------------- profile UI ---------------- */
  var root=null;
  var CSS = [
    '#kv-profile{position:fixed;inset:0;z-index:500;display:flex;flex-direction:column;overflow:hidden;',
    'font-family:Georgia,\'Times New Roman\',serif;color:var(--kv-ink,#fff3e2);',
    'background:',
    'radial-gradient(130% 70% at 50% 112%,rgba(255,217,174,.30) 0%,rgba(255,217,174,0) 55%),',
    'linear-gradient(180deg,#12122e 0%,#26215c 34%,#4e2c5e 62%,#7c4468 84%,#a86a72 100%);',
    'opacity:0;pointer-events:none;transition:opacity .6s ease;-webkit-font-smoothing:antialiased;}',
    '#kv-profile.on{opacity:1;pointer-events:auto;}',
    '#kv-profile .kv-head{flex:none;display:flex;align-items:center;gap:12px;padding:calc(14px + env(safe-area-inset-top)) 16px 6px;}',
    '#kv-profile .kv-back{min-width:52px;min-height:52px;width:52px;height:52px;border-radius:50%;cursor:pointer;',
    'border:2px solid var(--kv-line,rgba(255,217,174,.5));background:rgba(22,18,54,.6);color:var(--kv-ink,#fff3e2);font-size:22px;font-family:inherit;}',
    '#kv-profile .kv-back:active{transform:scale(.93);}',
    '#kv-profile .kv-kicker{flex:1;text-align:center;font-size:13px;letter-spacing:.34em;text-indent:.34em;',
    'color:var(--kv-ink-dim,rgba(255,243,226,.64));text-transform:uppercase;}',
    '#kv-profile .kv-scroll{flex:1;overflow-y:auto;padding:10px 18px calc(28px + env(safe-area-inset-bottom));touch-action:pan-y;}',
    '#kv-profile .kv-nudge{border:2px solid var(--kv-gold-hi,#fff6d8);border-radius:18px;padding:16px 18px;margin:8px 0 14px;',
    'background:linear-gradient(180deg,rgba(122,90,48,.5),rgba(52,40,88,.5));text-align:center;font-size:16px;line-height:1.6;}',
    '#kv-profile .kv-duo{display:flex;gap:12px;margin-bottom:14px;}',
    '#kv-profile .kv-person{flex:1;border:2px solid var(--kv-line,rgba(255,217,174,.5));border-radius:18px;',
    'background:rgba(30,26,72,.88);padding:18px 14px;text-align:center;}',
    '#kv-profile .kv-person h3{margin:0 0 4px;font-size:16px;letter-spacing:.08em;color:var(--kv-gold,#ffe28a);}',
    '#kv-profile .kv-flame{font-size:44px;line-height:1;}',
    '#kv-profile .kv-streakn{font-size:30px;font-weight:700;color:var(--kv-ink,#fff3e2);}',
    '#kv-profile .kv-streakl{font-size:12px;letter-spacing:.2em;color:var(--kv-ink-dim,rgba(255,243,226,.64));text-transform:uppercase;}',
    '#kv-profile .kv-stat{font-size:13px;color:var(--kv-ink-dim,rgba(255,243,226,.64));margin-top:10px;line-height:1.9;}',
    '#kv-profile .kv-stat b{color:var(--kv-ink,#fff3e2);}',
    '#kv-profile .kv-sec{font-size:13px;letter-spacing:.3em;text-transform:uppercase;color:var(--kv-gold,#ffe28a);',
    'margin:20px 2px 10px;}',
    '#kv-profile .kv-badges{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:10px;}',
    '#kv-profile .kv-badge{border:2px solid var(--kv-line,rgba(255,217,174,.5));border-radius:16px;background:rgba(30,26,72,.88);',
    'padding:12px 6px;text-align:center;min-height:96px;}',
    '#kv-profile .kv-badge .kv-be{font-size:30px;}',
    '#kv-profile .kv-badge .kv-bn{font-size:12px;margin-top:6px;line-height:1.4;color:var(--kv-ink,#fff3e2);}',
    '#kv-profile .kv-badge.locked{opacity:.32;}',
    '#kv-profile .kv-card{border:2px solid var(--kv-line,rgba(255,217,174,.5));border-radius:18px;background:rgba(30,26,72,.88);',
    'padding:18px;font-size:15px;line-height:2;}',
    '#kv-profile .kv-card b{color:var(--kv-gold,#ffe28a);}',
    '#kv-profile .kv-shelf{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;}',
    '#kv-profile .kv-chip{min-height:48px;display:inline-flex;align-items:center;padding:8px 16px;border-radius:999px;',
    'border:2px solid var(--kv-line,rgba(255,217,174,.5));background:rgba(24,20,60,.6);font-size:15px;}'
  ].join('\n');

  function el(t,c,h){ var e=document.createElement(t); if(c)e.className=c; if(h!=null)e.innerHTML=h; return e; }
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function bal(){
    try{ var a=window.__kvApi; if(a&&a.balance) return a.balance(); }catch(e){}
    try{ return Math.max(0,parseInt(localStorage.getItem('kanavu_stars')||'0',10)||0); }catch(e){ return 0; }
  }
  function beaconStreak(){
    try{
      if(window.KVBeacon && typeof KVBeacon.streak==='function') return KVBeacon.streak();
    }catch(e){}
    return null;
  }

  function build(){
    if(!document.getElementById('kv-profile-css')){
      var st=document.createElement('style'); st.id='kv-profile-css'; st.textContent=CSS;
      document.head.appendChild(st);
    }
    root = el('div'); root.id='kv-profile';
    root.innerHTML =
      '<div class="kv-head"><button class="kv-back" id="kv-profile-back">\u2039</button>'+
      '<div class="kv-kicker">us \u00B7 our story in stars</div><div style="width:52px"></div></div>'+
      '<div class="kv-scroll" id="kv-profile-scroll"></div>';
    document.body.appendChild(root);
    root.querySelector('#kv-profile-back').addEventListener('click', close);
  }

  async function render(){
    var sc = root.querySelector('#kv-profile-scroll');
    sc.innerHTML = '';
    var days = myDays(), n = days.length;
    var answered = false;
    try{ answered = window.KVDaily && KVDaily.answeredToday(); }catch(e){}

    /* streak-at-risk nudge: gentle, never punishment */
    if(n>0 && !answered){
      sc.appendChild(el('div','kv-nudge',
        '\u{1F525} your <b>'+n+'-day streak</b> needs you today \u2014 one little question keeps it glowing. no pressure, just love.'));
      try{ if(window.KVNav) KVNav.setDot('daily', true); }catch(e){}
    }

    /* side-by-side */
    var duo = el('div','kv-duo');
    var bs = beaconStreak();
    duo.appendChild(personCard('you', {
      streak:n, beacon:bs, dailies:n,
      stars:bal(), lifetime:kvGet('kanavu_stars_lifetime',0),
      badges:myBadges().length,
      sent:kvGet('kanavu_gifts_sent',0), recv:kvGet('kanavu_gifts_received',0),
      owned:(kvGet('kanavu_shop_owned',[])).length
    }));
    var pp = await partnerProfile();
    if(pp){
      duo.appendChild(personCard(esc(pp.display_name||'your love'), {
        streak:(pp.question_streak||0), beacon:(pp.beacon_streak==null?null:pp.beacon_streak),
        dailies:(pp.question_streak||0),
        stars:null, lifetime:(pp.stars_lifetime||0),
        badges:((pp.badges||[])).length, sent:null, recv:null, owned:null, remote:true
      }));
    }else{
      duo.appendChild(personCard('your love', {
        streak:0, beacon:null, dailies:0, stars:null, lifetime:0,
        badges:0, sent:null, recv:null, owned:null, remote:true, offline:true
      }));
    }
    sc.appendChild(duo);

    /* weekly recap */
    var wq = weekCount('kanavu_daily_log'), wg = weekCount('kanavu_gifts_log'),
        wm = weekCount('kanavu_matches_log');
    if(!kvGet('kanavu_gifts_log',null)) kvSet('kanavu_gifts_log', []);
    sc.appendChild(el('div','kv-sec','your week together'));
    var recap = el('div','kv-card',
      '\u{1F319} <b>'+wq+'</b> questions answered &nbsp;\u00B7&nbsp; \u{1F381} <b>'+wg+'</b> gifts exchanged &nbsp;\u00B7&nbsp; \u{1F49B} <b>'+wm+'</b> matches<br>'+
      (n>0 ? '\u{1F525} streak glowing at <b>'+n+' day'+(n===1?'':'s')+'</b> \u2014 keep it warm' : 'answer today\u2019s question to light your first flame \u{1F56F}'));
    sc.appendChild(recap);

    /* badges */
    sc.appendChild(el('div','kv-sec','badges'));
    var bg = el('div','kv-badges');
    var mine = myBadges();
    BADGES.forEach(function(b){
      var got = mine.indexOf(b.id)>=0;
      var d = el('div','kv-badge'+(got?'':' locked'),
        '<div class="kv-be">'+b.emoji+'</div><div class="kv-bn">'+esc(b.name)+'</div>');
      d.title = b.desc;
      bg.appendChild(d);
    });
    sc.appendChild(bg);

    /* shop shelf */
    var ownedIds = kvGet('kanavu_shop_owned', []);
    if(ownedIds.length){
      sc.appendChild(el('div','kv-sec','your shelf'));
      var shelf = el('div','kv-card');
      var wrap = el('div','kv-shelf');
      var names = {};
      try{ (KVShop.OUTFITS||[]).forEach(function(o){ names[o.id]=o.emoji+' '+o.name; }); }catch(e){}
      ownedIds.forEach(function(id){
        wrap.appendChild(el('span','kv-chip', esc(names[id]||id)));
      });
      shelf.appendChild(wrap);
      sc.appendChild(shelf);
    }
    sc.scrollTop = 0;
  }
  function personCard(name, s){
    var d = el('div','kv-person');
    var h = '<h3>'+name+'</h3><div class="kv-flame">'+(s.streak>0?'\u{1F525}':'\u{1F56F}')+'</div>'+
      '<div class="kv-streakn">'+s.streak+'</div><div class="kv-streakl">day streak</div><div class="kv-stat">';
    h += '\u{1F56F} beacon streak: <b>'+(s.beacon==null?'\u2014':s.beacon)+'</b><br>';
    h += '\u2753 questions answered: <b>'+s.dailies+'</b><br>';
    if(s.stars!=null) h += '\u2B50 balance: <b>'+s.stars+'</b><br>';
    h += '\u2728 lifetime earned: <b>'+s.lifetime+'</b><br>';
    h += '\u{1F3C6} badges: <b>'+s.badges+'</b><br>';
    if(s.sent!=null) h += '\u{1F381} gifts sent: <b>'+s.sent+'</b> \u00B7 received: <b>'+s.recv+'</b><br>';
    if(s.owned!=null) h += '\u{1F6CD} shelf: <b>'+s.owned+'</b> treasures';
    if(s.offline) h += '<br><span style="font-size:12px;font-style:italic">pair up to see live progress</span>';
    h += '</div>';
    d.innerHTML = h;
    return d;
  }

  function open(){
    if(!root) build();
    render();
    try{
      var sw = document.getElementById('scene-wrap');
      if(sw){ sw.dataset.kvWas3 = sw.style.visibility||''; sw.style.visibility='hidden'; }
      document.body.classList.add('kv-ritual-open');
    }catch(e){}
    root.classList.add('on');
  }
  function close(){
    if(!root) return;
    root.classList.remove('on');
    try{
      var sw = document.getElementById('scene-wrap');
      if(sw) sw.style.visibility = sw.dataset.kvWas3||'';
      document.body.classList.remove('kv-ritual-open');
    }catch(e){}
  }

  /* entry points: top-bar avatar + nav */
  function addTopBarBtn(){
    try{
      var star = document.getElementById('star-pill');
      if(!star || document.getElementById('kv-profile-btn')) return;
      var b = document.createElement('button');
      b.id = 'kv-profile-btn'; b.className = 'pill'; b.setAttribute('aria-label','our progress');
      b.innerHTML = '\u{1F491}';
      b.style.cssText = 'min-width:52px;min-height:52px;border-radius:50%;font-size:22px;padding:0 12px;';
      b.addEventListener('click', open);
      star.parentNode.insertBefore(b, star.nextSibling);
    }catch(e){}
  }

  function init(){
    addTopBarBtn();
    try{ if(window.KVNav) KVNav.register('us', '\u{1F491}', 'Us', open); }catch(e){}
    /* daily check-in when the world opens */
    var gs = document.getElementById('game-screen');
    var fired = false;
    function onOpen(){
      if(fired) return; fired = true;
      setTimeout(checkIn, 2500);
      setTimeout(function(){ fired = false; }, 60000);
    }
    if(gs){
      if(!gs.classList.contains('hidden')) setTimeout(checkIn, 2500);
      try{
        new MutationObserver(function(){ if(!gs.classList.contains('hidden')) onOpen(); })
          .observe(gs, {attributes:true, attributeFilter:['class']});
      }catch(e){}
    }
    setInterval(addTopBarBtn, 4000);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return {
    open:open, close:close,
    recordDaily:recordDaily, recordMatch:recordMatch,
    recordGiftSent:recordGiftSent, recordGiftReceived:recordGiftReceived,
    recordPurchase:recordPurchase, noteWorn:noteWorn,
    awardBadge:awardBadge, syncProfile:syncProfile
  };
})();
