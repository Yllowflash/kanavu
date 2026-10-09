/* ============================================================
   Kanavu — Starlight Shop (Stream 7)
   3D shop dressing (sign + window displays) on the village shop,
   walk-up-and-tap + bottom-nav dual access, full-screen premium
   shop UI in the world's tones: Outfits (signature looks that
   apply to the wardrobe) + Gifts (priced, sent to partner).

   Depends on: kanavu-daily.js (KVNav, kv* helpers, tokens),
   window.__kvApi bridge. Loads AFTER kanavu-daily.js.
   ============================================================ */
'use strict';

var KVShop = (function(){
  /* ---------------- inventory ---------------- */
  /* outfits: signature looks = existing wardrobe geometry (base)
     + signature colorway. Wear applies outfit+color to character. */
  var OUTFITS = [
    {id:'look-midnight-gown', name:'Midnight Gown', emoji:'\u{1F319}', base:'gown', color:0x2c2658, price:60, style:'her', blurb:'deep indigo, for slow dances'},
    {id:'look-rose-saree', name:'Rose Quartz Saree', emoji:'\u{1F339}', base:'saree', color:0xf2a7c3, price:70, style:'her', blurb:'soft rose with a golden glow'},
    {id:'look-goldengown', name:'Golden Hour Gown', emoji:'\u2728', base:'gown', color:0xe8a93e, price:80, style:'her', blurb:'wears the sunset itself'},
    {id:'look-peacock-churidar', name:'Peacock Churidar', emoji:'\u{1F99A}', base:'churidar', color:0x1f7a6d, price:60, style:'her', blurb:'teal, proud, a little dramatic'},
    {id:'look-lavender-dress', name:'Lavender Dream Dress', emoji:'\u{1F49C}', base:'dress', color:0xb9a7ff, price:55, style:'her', blurb:'light as a daydream'},
    {id:'look-velvet-puffer', name:'Velvet Night Puffer', emoji:'\u{1F5A4}', base:'puffer', color:0x3a2a5e, price:65, style:'her', blurb:'cozy with a mysterious edge'},
    {id:'look-ocean-kurta', name:'Ocean Kurta', emoji:'\u{1F30A}', base:'kurta', color:0x2a5a86, price:60, style:'him', blurb:'deep water, steady heart'},
    {id:'look-ember-flannel', name:'Ember Flannel', emoji:'\u{1F525}', base:'flannel', color:0xb5462a, price:55, style:'him', blurb:'warmth you can lean on'},
    {id:'look-forest-puffer', name:'Forest Puffer', emoji:'\u{1F332}', base:'puffer', color:0x2e5a44, price:65, style:'him', blurb:'mountain-air cozy'},
    {id:'look-sandal-shirt', name:'Sandalwood Shirt', emoji:'\u2600\uFE0F', base:'shirt', color:0xe3d3a1, price:50, style:'him', blurb:'easy, golden, kind'},
    {id:'look-glacier-tee', name:'Glacier Tee', emoji:'\u{1F9CA}', base:'tee', color:0x9be7ff, price:45, style:'him', blurb:'cool and effortless'},
    {id:'look-starlight-dhoti', name:'Starlight Dhoti-Kurta', emoji:'\u{1F30C}', base:'dhotikurta', color:0x2c2658, price:75, style:'him', blurb:'for nights that matter'}
  ];
  /* gifts: same payload shape as the game's premade gifts
     {emoji, name} so the existing receive/open flow just works */
  var GIFTS = [
    {id:'gift-loveletters', name:'Love Letter Set', emoji:'\u{1F48C}', price:20, blurb:'three sealed letters, for rainy days'},
    {id:'gift-chocolates', name:'Chocolates', emoji:'\u{1F36B}', price:25, blurb:'sweet, like you'},
    {id:'gift-bouquet', name:'Bouquet', emoji:'\u{1F490}', price:30, blurb:'fresh from the meadow'},
    {id:'gift-cake', name:'Cake', emoji:'\u{1F370}', price:35, blurb:'for no reason at all'},
    {id:'gift-teddy', name:'Teddy', emoji:'\u{1F9F8}', price:40, blurb:'for cuddles when I can\u2019t be there'},
    {id:'gift-candle', name:'Scented Candle', emoji:'\u{1F56F}', price:40, blurb:'vanilla + sandalwood evenings'},
    {id:'gift-roses', name:'Dozen Roses', emoji:'\u{1F339}', price:45, blurb:'a little dramatic, like us'},
    {id:'gift-bubbletea', name:'Bubble Tea Date', emoji:'\u{1F9CB}', price:50, blurb:'her favorite \u2014 an IOU for two cups'},
    {id:'gift-necklace', name:'Star Necklace', emoji:'\u{1F48E}', price:90, blurb:'a tiny constellation to wear'},
    {id:'gift-guitar', name:'Mini Guitar', emoji:'\u{1F3B8}', price:100, blurb:'for the one who finally got one'}
  ];

  /* ---------------- helpers (shared with daily) ---------------- */
  function api(){ return window.__kvApi || null; }
  function toast(m){ kvToast(m); }
  function balance(){
    try{ var a=api(); if(a&&a.balance) return a.balance(); }catch(e){}
    try{ return Math.max(0, parseInt(localStorage.getItem('kanavu_stars')||'0',10)||0); }catch(e){ return 0; }
  }
  function ownedIds(){ return kvGet('kanavu_shop_owned', []); }
  function isOwned(id){ return ownedIds().indexOf(id)>=0; }
  function markOwned(id){
    var o = ownedIds();
    if(o.indexOf(id)<0){ o.push(id); kvSet('kanavu_shop_owned', o); }
  }
  async function spend(price){
    var a = api();
    if(a && a.spendStars){
      try{ return await a.spendStars(price); }catch(e){ return false; }
    }
    if(balance() < price){ kvToast('not enough stars yet \u2B50'); return false; }
    var b = balance()-price;
    try{ localStorage.setItem('kanavu_stars', String(b)); }catch(e){}
    var p = document.getElementById('star-pill'); if(p) p.textContent = '\u2B50 '+b;
    return true;
  }

  /* ---------------- 3D: dress the village shop ----------------
     The GLB shop lives at village (-15,-3). We add: a hanging
     SHOP sign, two window-display pedestals, a floating label.
     Tap target group: W._kvShopTap (userData.kvTap='shop'). */
  var SHOP_POS = {x:-15, z:-3};
  function buildShopDressing(){
    try{
      var W = window.__kvWorld, T = window.THREE;
      if(!W || !W.scene || !T || W._kvShopTap) return;
      var g = new T.Group();
      var mat = function(c, e){ return new T.MeshStandardMaterial({color:c, roughness:.85, emissive:e||0x000000}); };
      var gy = W.groundY ? W.groundY(SHOP_POS.x, SHOP_POS.z) : 0;

      /* hanging sign */
      var cv = document.createElement('canvas'); cv.width=512; cv.height=160;
      var cx = cv.getContext('2d');
      cx.fillStyle = '#2c2658'; roundRect(cx, 8, 8, 496, 144, 36); cx.fill();
      cx.strokeStyle = '#ffe28a'; cx.lineWidth = 6; roundRect(cx, 8, 8, 496, 144, 36); cx.stroke();
      /* hand-drawn gift icon (no emoji-font dependency) */
      cx.fillStyle = '#b96a7e'; cx.fillRect(56, 52, 64, 56);
      cx.fillStyle = '#ffe28a'; cx.fillRect(80, 52, 16, 56); cx.fillRect(56, 72, 64, 14);
      cx.beginPath(); cx.arc(72, 44, 12, 0, 6.283); cx.arc(104, 44, 12, 0, 6.283); cx.fill();
      cx.font = '700 72px Georgia'; cx.textAlign='center'; cx.fillStyle = '#fff3e2';
      cx.fillText('SHOP', 300, 108);
      var signTex = new T.CanvasTexture(cv);
      var sign = new T.Mesh(new T.PlaneGeometry(4.6,1.44),
        new T.MeshBasicMaterial({map:signTex, transparent:true, side:T.DoubleSide}));
      sign.position.set(SHOP_POS.x, gy+6.6, SHOP_POS.z);
      sign.rotation.y = 0.35;
      g.add(sign);
      g.userData.sign = sign;

      /* window displays: pedestal + rotating treasure */
      function pedestal(px, pz, buildTop){
        var grp = new T.Group();
        var ped = new T.Mesh(new T.CylinderGeometry(.55,.7,1.0,8), mat(0x6b422a));
        ped.position.y = .5; grp.add(ped);
        var top = buildTop(); top.position.y = 1.35; grp.add(top); grp.userData.spin = top;
        var pgy = W.groundY ? W.groundY(px, pz) : gy;
        grp.position.set(px, pgy, pz);
        g.add(grp);
        try{ (W.staticColliders=W.staticColliders||[]).push({x:px, z:pz, r:.9}); }catch(e){}
        return grp;
      }
      /* left: mini dress form in rose-gold */
      pedestal(-12.2, -0.2, function(){
        var t = new T.Group();
        var pole = new T.Mesh(new T.CylinderGeometry(.06,.06,1.1,6), mat(0x8a5a3a)); t.add(pole);
        var dressM = mat(0xf2a7c3); dressM.emissive = new T.Color(0x3a1020);
        var bod = new T.Mesh(new T.CylinderGeometry(.16,.30,.62,8), dressM); bod.position.y=.28; t.add(bod);
        var skirt = new T.Mesh(new T.CylinderGeometry(.30,.44,.5,8), dressM); skirt.position.y=-.18; t.add(skirt);
        return t;
      });
      /* right: gift box */
      pedestal(-11.3, -4.5, function(){
        var t = new T.Group();
        var box = new T.Mesh(new T.BoxGeometry(.62,.44,.62), mat(0xb96a7e)); t.add(box);
        var ribM = mat(0xffe28a); ribM.emissive = new T.Color(0x4a3a10);
        var r1 = new T.Mesh(new T.BoxGeometry(.66,.1,.14), ribM); t.add(r1);
        var r2 = new T.Mesh(new T.BoxGeometry(.14,.1,.66), ribM); t.add(r2);
        var bow = new T.Mesh(new T.SphereGeometry(.12,8,6), ribM); bow.position.y=.3; t.add(bow);
        return t;
      });

      /* floating label */
      var lc = document.createElement('canvas'); lc.width=256; lc.height=80;
      var lx = lc.getContext('2d');
      lx.font = '700 46px Georgia'; lx.textAlign='center';
      lx.fillStyle = '#fff3e2'; lx.shadowColor='rgba(0,0,0,.65)'; lx.shadowBlur=8;
      lx.fillText('\u2728 starlight shop', 128, 54);
      var spr = new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(lc), transparent:true, depthWrite:false}));
      spr.scale.set(4.6,1.44,1); spr.position.set(SHOP_POS.x, gy+8.1, SHOP_POS.z);
      g.add(spr);

      g.userData.kvTap = 'shop';
      W.scene.add(g);
      W._kvShopTap = g;

      /* gentle idle motion: sign sway + pedestal spin */
      var t0 = performance.now();
      (function tick(){
        try{
          if(!W._kvShopTap) return;
          var t = (performance.now()-t0)/1000;
          if(g.userData.sign) g.userData.sign.rotation.z = Math.sin(t*.8)*.04;
          g.children.forEach(function(ch){
            if(ch.userData.spin) ch.userData.spin.rotation.y = t*.9;
          });
          requestAnimationFrame(tick);
        }catch(e){}
      })();
    }catch(e){ console.warn('[kvshop] dressing', e); }
  }
  function roundRect(cx,x,y,w,h,r){
    cx.beginPath();
    cx.moveTo(x+r,y); cx.arcTo(x+w,y,x+w,y+h,r); cx.arcTo(x+w,y+h,x,y+h,r);
    cx.arcTo(x,y+h,x,y,r); cx.arcTo(x,y,x+w,y,r); cx.closePath();
  }

  /* ---------------- full-screen shop UI ---------------- */
  var root=null, tab='outfits';
  var CSS = [
    '#kv-shop{position:fixed;inset:0;z-index:500;display:flex;flex-direction:column;overflow:hidden;',
    'font-family:Georgia,\'Times New Roman\',serif;color:var(--kv-ink,#fff3e2);',
    'background:',
    'radial-gradient(130% 70% at 50% 112%,rgba(255,217,174,.30) 0%,rgba(255,217,174,0) 55%),',
    'linear-gradient(180deg,#12122e 0%,#26215c 34%,#4e2c5e 62%,#7c4468 84%,#a86a72 100%);',
    'opacity:0;pointer-events:none;transition:opacity .6s ease;-webkit-font-smoothing:antialiased;}',
    '#kv-shop.on{opacity:1;pointer-events:auto;}',
    '#kv-shop .kv-head{flex:none;display:flex;align-items:center;gap:12px;padding:calc(14px + env(safe-area-inset-top)) 16px 6px;z-index:3;}',
    '#kv-shop .kv-back{min-width:52px;min-height:52px;width:52px;height:52px;border-radius:50%;cursor:pointer;',
    'border:2px solid var(--kv-line,rgba(255,217,174,.5));background:rgba(22,18,54,.6);color:var(--kv-ink,#fff3e2);font-size:22px;font-family:inherit;}',
    '#kv-shop .kv-back:active{transform:scale(.93);}',
    '#kv-shop .kv-kicker{flex:1;text-align:center;font-size:13px;letter-spacing:.34em;text-indent:.34em;color:var(--kv-ink-dim,rgba(255,243,226,.64));text-transform:uppercase;}',
    '#kv-shop .kv-stars{min-height:52px;display:flex;align-items:center;padding:0 20px;border-radius:999px;',
    'border:2px solid var(--kv-line,rgba(255,217,174,.5));background:rgba(22,18,54,.6);font-size:18px;font-weight:700;color:var(--kv-gold,#ffe28a);}',
    '#kv-shop .kv-tabs{flex:none;display:flex;gap:12px;padding:12px 18px 4px;z-index:2;}',
    '#kv-shop .kv-tab{flex:1;min-height:60px;border-radius:16px;cursor:pointer;font-family:inherit;font-size:19px;font-weight:700;',
    'border:2px solid var(--kv-line,rgba(255,217,174,.5));background:rgba(30,26,72,.88);color:var(--kv-ink,#fff3e2);}',
    '#kv-shop .kv-tab.active{border:2px solid var(--kv-gold-hi,#fff6d8);background:linear-gradient(180deg,#7a5a30,#2c2658);',
    'box-shadow:0 0 22px rgba(255,226,138,.4);}',
    '#kv-shop .kv-scroll{flex:1;overflow-y:auto;padding:14px 18px calc(26px + env(safe-area-inset-bottom));z-index:2;touch-action:pan-y;}',
    '#kv-shop .kv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px;}',
    '#kv-shop .kv-item{border:2px solid var(--kv-line,rgba(255,217,174,.5));border-radius:18px;background:rgba(30,26,72,.88);',
    'padding:18px 14px;text-align:center;display:flex;flex-direction:column;gap:8px;}',
    '#kv-shop .kv-item .kv-emoji{font-size:44px;line-height:1;}',
    '#kv-shop .kv-item h3{margin:0;font-size:17px;color:var(--kv-ink,#fff3e2);}',
    '#kv-shop .kv-item .kv-blurb{font-size:13px;font-style:italic;color:var(--kv-ink-dim,rgba(255,243,226,.64));line-height:1.5;min-height:40px;}',
    '#kv-shop .kv-item .kv-price{font-size:19px;font-weight:700;color:var(--kv-gold,#ffe28a);}',
    '#kv-shop .kv-item .kv-buy{min-height:52px;border-radius:14px;cursor:pointer;font-family:inherit;font-size:17px;font-weight:700;',
    'border:2px solid #a87c2a;color:#4a3410;background:linear-gradient(180deg,var(--kv-gold-hi,#fff6d8),var(--kv-gold,#ffe28a));}',
    '#kv-shop .kv-item .kv-buy:active{transform:scale(.96);}',
    '#kv-shop .kv-item .kv-buy.owned{border:2px solid var(--kv-gold-hi,#fff6d8);color:var(--kv-ink,#fff3e2);background:rgba(24,20,60,.6);}',
    '#kv-shop .kv-note{text-align:center;font-size:13px;font-style:italic;color:var(--kv-ink-dim,rgba(255,243,226,.64));padding:14px 20px 4px;}',
    /* confirm dialog */
    '#kv-confirm{position:fixed;inset:0;z-index:520;display:none;align-items:center;justify-content:center;background:rgba(10,8,24,.72);padding:24px;}',
    '#kv-confirm.on{display:flex;}',
    '#kv-confirm .kv-box{width:100%;max-width:400px;border:2px solid var(--kv-gold-hi,#fff6d8);border-radius:22px;',
    'background:linear-gradient(180deg,#2c2658,#1a1848);padding:28px 24px;text-align:center;}',
    '#kv-confirm .kv-box .kv-emoji{font-size:56px;}',
    '#kv-confirm .kv-box h3{margin:10px 0 6px;font-size:24px;color:var(--kv-ink,#fff3e2);}',
    '#kv-confirm .kv-box p{font-size:16px;font-style:italic;color:var(--kv-ink-dim,rgba(255,243,226,.64));line-height:1.6;margin:0 0 18px;}',
    '#kv-confirm .kv-box .kv-row{display:flex;gap:12px;}',
    '#kv-confirm .kv-box button{flex:1;min-height:60px;border-radius:16px;cursor:pointer;font-family:inherit;font-size:19px;font-weight:700;}',
    '#kv-confirm .kv-go{border:2px solid #a87c2a;color:#4a3410;background:linear-gradient(180deg,var(--kv-gold-hi,#fff6d8),var(--kv-gold,#ffe28a));}',
    '#kv-confirm .kv-no{border:2px solid var(--kv-line,rgba(255,217,174,.5));color:var(--kv-ink,#fff3e2);background:rgba(24,20,60,.6);font-weight:400;}'
  ].join('\n');

  function el(t,c,h){ var e=document.createElement(t); if(c)e.className=c; if(h!=null)e.innerHTML=h; return e; }
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function build(){
    if(document.getElementById('kv-shop-css')){ /* css already there */ }
    else{
      var st=document.createElement('style'); st.id='kv-shop-css'; st.textContent=CSS;
      document.head.appendChild(st);
    }
    root = el('div'); root.id='kv-shop';
    root.innerHTML =
      '<div class="kv-head"><button class="kv-back" id="kv-shop-back">\u2039</button>'+
      '<div class="kv-kicker">starlight shop</div><div class="kv-stars" id="kv-shop-stars">\u2B50 0</div></div>'+
      '<div class="kv-tabs"><button class="kv-tab active" id="kv-tab-outfits">\u{1F457} Outfits</button>'+
      '<button class="kv-tab" id="kv-tab-gifts">\u{1F381} Gifts</button></div>'+
      '<div class="kv-scroll"><div class="kv-grid" id="kv-grid"></div>'+
      '<div class="kv-note">earn stars with daily rituals \u2014 about a week of dailies buys something lovely \u2B50</div></div>';
    document.body.appendChild(root);
    root.querySelector('#kv-shop-back').addEventListener('click', close);
    root.querySelector('#kv-tab-outfits').addEventListener('click', function(){ setTab('outfits'); });
    root.querySelector('#kv-tab-gifts').addEventListener('click', function(){ setTab('gifts'); });
    var c = el('div'); c.id='kv-confirm';
    c.innerHTML = '<div class="kv-box"><div class="kv-emoji" id="kv-c-emoji"></div><h3 id="kv-c-name"></h3>'+
      '<p id="kv-c-text"></p><div class="kv-row"><button class="kv-no" id="kv-c-no">not yet</button>'+
      '<button class="kv-go" id="kv-c-go">yes \u2728</button></div></div>';
    document.body.appendChild(c);
    c.querySelector('#kv-c-no').addEventListener('click', function(){ c.classList.remove('on'); });
  }
  function setTab(t){
    tab = t;
    root.querySelector('#kv-tab-outfits').classList.toggle('active', t==='outfits');
    root.querySelector('#kv-tab-gifts').classList.toggle('active', t==='gifts');
    render();
  }
  function syncStars(){
    var s = root.querySelector('#kv-shop-stars');
    if(s) s.textContent = '\u2B50 '+balance();
  }
  function render(){
    var grid = root.querySelector('#kv-grid');
    grid.innerHTML = '';
    if(tab==='outfits'){
      OUTFITS.forEach(function(it){
        var owned = isOwned(it.id);
        var card = el('div','kv-item');
        card.innerHTML = '<div class="kv-emoji">'+it.emoji+'</div><h3>'+esc(it.name)+'</h3>'+
          '<div class="kv-blurb">'+esc(it.blurb)+'</div>'+
          '<div class="kv-price">'+(owned?'owned \u2713':'\u2B50 '+it.price)+'</div>';
        var b = el('button','kv-buy'+(owned?' owned':''), owned?'wear \u2728':'buy');
        b.addEventListener('click', function(){
          if(owned) wearOutfit(it);
          else confirmBuy(it, 'outfit');
        });
        card.appendChild(b);
        grid.appendChild(card);
      });
    }else{
      GIFTS.forEach(function(it){
        var card = el('div','kv-item');
        card.innerHTML = '<div class="kv-emoji">'+it.emoji+'</div><h3>'+esc(it.name)+'</h3>'+
          '<div class="kv-blurb">'+esc(it.blurb)+'</div><div class="kv-price">\u2B50 '+it.price+'</div>';
        var b = el('button','kv-buy','send \u{1F49B}');
        b.addEventListener('click', function(){ confirmBuy(it, 'gift'); });
        card.appendChild(b);
        grid.appendChild(card);
      });
    }
    syncStars();
  }

  function confirmBuy(it, kind){
    var c = document.getElementById('kv-confirm');
    c.querySelector('#kv-c-emoji').textContent = it.emoji;
    c.querySelector('#kv-c-name').textContent = it.name;
    c.querySelector('#kv-c-text').textContent =
      (kind==='gift' ? 'send this to your love? it\u2019ll appear on their island \u{1F381}'
                     : 'unlock this signature look? wear it anytime from the shop \u2728')+
      ' \u2014 \u2B50'+it.price+' (you have \u2B50'+balance()+')';
    c.classList.add('on');
    var go = c.querySelector('#kv-c-go');
    go.onclick = function(){
      c.classList.remove('on');
      doBuy(it, kind);
    };
  }
  async function doBuy(it, kind){
    if(!(await spend(it.price))) return;
    var me=null; try{ me = kvMe(); }catch(e){}
    if(me) kvSend('purchases', {user_id:me, item_id:it.id, stars_spent:it.price, created_at:new Date().toISOString()});
    if(kind==='outfit'){
      markOwned(it.id);
      try{ if(window.KVProfile) KVProfile.recordPurchase(it.id); }catch(e){}
      kvToast(it.name+' is yours \u2728');
      wearOutfit(it);
    }else{
      await sendGift(it);
    }
    render();
  }
  async function wearOutfit(it){
    var a = api();
    try{
      if(a && a.saveCharacter){
        await a.saveCharacter({outfit:it.base, outfitColor:it.color});
      }
    }catch(e){}
    kvToast('wearing '+it.name+' \u2728');
    try{ if(window.KVProfile) KVProfile.noteWorn(it.id); }catch(e){}
  }
  async function sendGift(it){
    var me=null, pair=null, partner=null;
    try{ me = kvMe(); pair = kvPair(); partner = kvPartnerId(); }catch(e){}
    var payload = {emoji:it.emoji, name:it.name};
    if(pair && me){
      kvSend('gifts', {pair_id:pair.id, from_id:me, kind:'premade', payload:payload, deliver_at:null});
    }
    if(partner){
      kvSend('notifications', {
        to_user:partner, type:'gift', read:false,
        message: kvMyName()+' sent you a gift \u{1F381} it\u2019s waiting on your island',
        data:{gift:it.id, from:me}
      });
    }
    /* local counts for profile + weekly recap */
    try{
      var n = kvGet('kanavu_gifts_sent', 0)+1; kvSet('kanavu_gifts_sent', n);
      var gl = kvGet('kanavu_gifts_log', []); gl.push(Date.now()); kvSet('kanavu_gifts_log', gl.slice(-300));
      if(window.KVProfile) KVProfile.recordGiftSent();
    }catch(e){}
    kvToast(it.name+' is on its way \u{1F49B}');
  }

  function open(){
    if(!root) build();
    render();
    try{
      var sw = document.getElementById('scene-wrap');
      if(sw){ sw.dataset.kvWas2 = sw.style.visibility||''; sw.style.visibility='hidden'; }
      document.body.classList.add('kv-ritual-open');
    }catch(e){}
    root.classList.add('on');
  }
  function close(){
    if(!root) return;
    root.classList.remove('on');
    try{
      var sw = document.getElementById('scene-wrap');
      if(sw) sw.style.visibility = sw.dataset.kvWas2||'';
      document.body.classList.remove('kv-ritual-open');
    }catch(e){}
  }
  function tapTarget(){
    try{ return window.__kvWorld && window.__kvWorld._kvShopTap; }catch(e){ return null; }
  }

  function init(){
    try{
      if(window.KVNav) KVNav.register('shop', '\u{1F6CD}', 'Shop', function(){ open(); });
    }catch(e){}
    var tries=0;
    var t=setInterval(function(){
      try{
        if(window.__kvWorld && window.__kvWorld.scene){ clearInterval(t); buildShopDressing(); }
        else if(++tries>60) clearInterval(t);
      }catch(e){}
    }, 1000);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return { open:open, close:close, tapTarget:tapTarget, OUTFITS:OUTFITS, GIFTS:GIFTS };
})();
