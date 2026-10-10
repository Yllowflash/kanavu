/* Kanavu — Lightweight Feature Buildings
   4 procedural buildings (no GLBs): Bookshop, Theatre, Memory Cottage, Shop
   Tap to open: questions, games, memories, shop
   Uses kanavu-daily.js question data if available.
*/
!function(){
"use strict";

var SITES = [
  // Left open space (west)
  {id:'bookshop', x:-38, z:-12, ry:1.19, name:'Bookshop',  color:0xf6ead2, roof:0x2e8f8a, label:'📚 Bookshop'},
  {id:'shop',     x:-28, z:-20, ry:-0.6, name:'Shop',      color:0xf0d8e8, roof:0x8a5aa0, label:'🛍️ Shop'},
  // Right open space (north)
  {id:'theatre',  x:10,  z:30,  ry:0.5,  name:'Theatre',   color:0xd8cfc0, roof:0x8a3a3a, label:'🎭 Theatre'},
  {id:'cottage',  x:24,  z:38,  ry:0.3,  name:'Memories',  color:0xe8dcc8, roof:0x6a8a5a, label:'🏡 Memory Cottage'}
];

var done=false;
function boot(){
  var W=null;
  try{ W=window.__kvWorld; }catch(e){}
  if(!W||!W.scene||!window.THREE) return false;
  if(!W.groundY && W.terrainY) W.groundY = W.terrainY;
  if(!W.groundY) return false;
  if(done) return true;
  done=true;
  init(W);
  return true;
}

function mat(c){ return new THREE.MeshLambertMaterial({color:c}); }

function findLand(W, x, z){
  // Search outward for ground above water
  if(W.groundY(x,z) > 1.2) return {x:x, z:z};
  for(var r=5; r<60; r+=5){
    for(var a=0; a<12; a++){
      var nx=x+Math.cos(a/12*Math.PI*2)*r;
      var nz=z+Math.sin(a/12*Math.PI*2)*r;
      if(W.groundY(nx,nz) > 1.5) return {x:nx, z:nz};
    }
  }
  return {x:x, z:z};
}

function makeBuilding(site, W){
  var T=window.THREE;
  var g=new T.Group();
  var spot=findLand(W, site.x, site.z);
  var gy=W.groundY(spot.x, spot.z);
  g.position.set(spot.x, gy, spot.z);
  g.rotation.y=site.ry||0;
  // Store actual position for tap detection
  site._ax=spot.x; site._az=spot.z;

  // Main structure
  var walls=new T.Mesh(new T.BoxGeometry(5.5,3.4,4.5), mat(site.color));
  walls.position.y=1.7; g.add(walls);
  // Roof
  var roof=new T.Mesh(new T.ConeGeometry(4.2,2.2,4), mat(site.roof));
  roof.position.y=4.5; roof.rotation.y=Math.PI/4; g.add(roof);
  // Door
  var door=new T.Mesh(new T.BoxGeometry(1.1,2.2,0.12), mat(0x5a3a22));
  door.position.set(0,1.1,2.28); g.add(door);
  // Windows (glowing)
  [-1.7,1.7].forEach(function(x){
    var win=new T.Mesh(new T.BoxGeometry(1.0,0.9,0.12),
      new T.MeshBasicMaterial({color:0xffe28a}));
    win.position.set(x,2.0,2.28); g.add(win);
  });
  // Sign post
  var post=new T.Mesh(new T.CylinderGeometry(0.09,0.11,2.6,6), mat(0x6b4a2a));
  post.position.set(3.2,1.3,2.5); g.add(post);
  var sign=new T.Mesh(new T.BoxGeometry(2.4,0.9,0.1), mat(0x3a2f1a));
  sign.position.set(3.2,2.6,2.5); g.add(sign);
  // Label sprite
  var cv=document.createElement('canvas'); cv.width=256; cv.height=64;
  var cx=cv.getContext('2d');
  cx.fillStyle='#3a2f1a'; cx.fillRect(0,0,256,64);
  cx.fillStyle='#ffe28a'; cx.font='bold 28px Georgia'; cx.textAlign='center'; cx.textBaseline='middle';
  cx.fillText(site.name, 128, 34);
  var tex=new T.CanvasTexture(cv);
  var spr=new T.Sprite(new T.SpriteMaterial({map:tex, transparent:true}));
  spr.scale.set(4,1,1); spr.position.set(3.2,3.4,2.5);
  g.add(spr);

  // Purpose-specific decor
  if(site.id==='bookshop'){
    // Bookshelf
    var shelf=new T.Mesh(new T.BoxGeometry(2.2,2.0,0.5), mat(0x6b422a));
    shelf.position.set(-3.5,1.0,1.5); g.add(shelf);
    for(var i=0;i<3;i++){
      var row=new T.Mesh(new T.BoxGeometry(2.0,0.28,0.4),
        mat([0xc0392b,0x2980b9,0x27ae60][i]));
      row.position.set(-3.5,0.6+i*0.6,1.55); g.add(row);
    }
  } else if(site.id==='theatre'){
    // Stage curtains
    [-1.2,1.2].forEach(function(x){
      var cur=new T.Mesh(new T.BoxGeometry(0.5,2.4,0.15), mat(0x8a1a1a));
      cur.position.set(x,1.6,2.28); g.add(cur);
    });
    // Marquee lights
    for(var li=-2;li<=2;li++){
      var bulb=new T.Mesh(new T.SphereGeometry(0.09,6,6),
        new T.MeshBasicMaterial({color:0xfff2b0}));
      bulb.position.set(li*0.9,3.1,2.32); g.add(bulb);
    }
  } else if(site.id==='cottage'){
    // Heart + photo frame
    var heart=new T.Mesh(new T.SphereGeometry(0.35,8,8), mat(0xe06a8a));
    heart.position.set(-3.2,1.8,1.8); heart.scale.set(1,1.2,0.6); g.add(heart);
    var frame=new T.Mesh(new T.BoxGeometry(1.2,0.9,0.08), mat(0x8a6a3a));
    frame.position.set(3.4,1.6,1.2); g.add(frame);
  } else if(site.id==='shop'){
    // Awning
    var awn=new T.Mesh(new T.BoxGeometry(4.0,0.15,1.6),
      mat(0xe06a8a));
    awn.position.set(0,2.9,2.9); awn.rotation.x=0.25; g.add(awn);
    // Display boxes
    [-1.2,0,1.2].forEach(function(x,i){
      var box=new T.Mesh(new T.BoxGeometry(0.7,0.7,0.7),
        mat([0xffd66e,0x9be7ff,0xf2a7c3][i]));
      box.position.set(x,0.35,3.2); g.add(box);
    });
  }

  W.scene.add(g);

  // Tap handler (uses actual placed position)
  if(W.onTap){
    try{
      W.onTap(function(hit){
        if(!hit||!hit.point) return false;
        var ax=site._ax||site.x, az=site._az||site.z;
        var dx=hit.point.x-ax, dz=hit.point.z-az;
        if(Math.hypot(dx,dz)<5){
          openFeature(site.id);
          return true;
        }
        return false;
      });
    }catch(e){}
  }
  // Proximity collider (uses actual position)
  if(W.staticColliders){
    try{
      var ax2=site._ax||site.x, az2=site._az||site.z;
      W.staticColliders.push({x:ax2, z:az2, r:4.5, feature:site.id});
    }catch(e){}
  }
}

function openFeature(id){
  if(id==='bookshop') openQuestions();
  else if(id==='theatre') openGames();
  else if(id==='cottage') openMemories();
  else if(id==='shop') openShop();
}

// ---------- FEATURE DATA ----------
var KV_DECKS = [{"name": "Getting Closer", "questions": ["What's one small thing I do that makes you feel chosen, every single time?", "Describe the exact moment today you missed me most \u2014 what were you doing?", "If I could bottle one feeling I have for you and send it across the ocean, what would be in the bottle?", "What's your favorite tiny ritual of ours \u2014 the one you'd never trade?", "If our love story had a title track, which song is playing right now, and why?", "What do you want me to whisper to you the next time we're on a call and the world goes quiet?", "Do you still get butterflies when my name lights up your phone?", "Would you slow-dance with me in the kitchen at 2am if we lived together?", "Do you believe we were supposed to find each other, even across all these miles?", "Which would melt you more?", "What part of the day is hardest without me next to you \u2014 mornings, nights, or the in-between?", "What do you tell yourself on the nights the miles feel louder than my voice?", "If you could teleport to me for exactly one hour tonight, what would we do with it?", "What's the first thing you'll do when we finally stop counting time zones?", "How do you want me to love you from far away on the days a screen isn't enough?", "What small, ordinary moment do you most wish I was there for this week?", "When we're finally in the same city, what will our first lazy Sunday look like?", "What's one thing the distance taught you about us that closeness never could?", "Do you ever fall asleep on our calls just to feel close to me?", "Would you take a red-eye flight tomorrow if it meant one extra day together?", "Does the countdown to seeing me make the waiting better or harder?", "How do you want to stay close daily?"]}, {"name": "Sweet Memories", "questions": ["Which would make your year?", "What's one thing you're carrying right now that you haven't told me yet?", "When do you feel most like yourself \u2014 and am I part of that version of you?", "What are you afraid to want, because wanting it feels too big?", "What's something you're still learning to forgive yourself for?", "What do you need to hear from me on the days you doubt yourself \u2014 not us, yourself?", "What's the bravest thing you've ever done for love?", "If you could ask me anything and I'd answer with total honesty, what would you ask?", "Do you ever worry you're too much for someone to love \u2014 even me?", "Have I ever hurt you without realizing it?", "Do you feel truly seen by me, even from this far away?", "How do you open up best?", "What's the most distracting thought you've had about me today?", "If I was sitting next to you right now, what's the first thing you'd do?", "What's your move when you want my full attention?", "If we were at a party and I caught your eye across the room, what would you be thinking?", "What's the cheesiest line you've ever wanted to use on me but were too shy to say?", "What's something small I do on video calls that drives you a little crazy \u2014 in the good way?", "Do you ever rewatch our old photos just to stare at me a little longer?", "Would you steal a kiss in public \u2014 even if people were watching?", "Do I make you blush more over text or on video?", "How do you want to flirt?"]}, {"name": "Deep Dive", "questions": ["Describe the slowest, most lingering kiss you can imagine us sharing \u2014 where are we?", "What's one thing you've always wanted to try with me but haven't said out loud yet?", "What's the most electric almost-moment we've ever had \u2014 the one that still gives you chills?", "What's the one sentence that would completely undo me if you whispered it in person?", "What's your favorite way I've ever made you feel wanted \u2014 even from miles away?", "Do you ever think about me when you're trying to fall asleep\\u2026 in that way?", "Would you let me plan a whole evening where you don't have to think about anything but us?", "Have you ever had a dream about us that you woke up blushing from?", "What undoes you faster?", "If we were a chaotic duo in a heist movie, what would our roles be \u2014 and what are we stealing?", "Invent our couple mascot: what is it, what's its name, what's its catchphrase?", "What would our couple theme song be if it had to be completely ridiculous?", "If we swapped lives for a day, what's the first thing you'd do as me?", "Design our dream food truck \u2014 what's on the menu and what's it called?", "What's the funniest misunderstanding we've ever had over text?", "Zombie apocalypse, just us: what's our survival strategy \u2014 and who panics first?", "What reality show would we absolutely win, and which one would destroy us?", "Would you survive 24 hours in an IKEA with me without a fight?", "Do you honestly think you'd beat me at Mario Kart?", "Would you do a silly dance with me in public if I asked?", "Paint our first apartment together \u2014 what color are the walls, what's on the fridge?", "What tradition should we start in our first year living in the same city?"]}, {"name": "Dream Together", "questions": ["Where in the world should we take our first real trip together \u2014 and why there?", "What do you want our ordinary Tuesdays to look like five years from now?", "If we had a garden together, what would we grow \u2014 and who'd actually water it?", "What skill do you want us to learn together someday?", "What do you hope we never lose about us, no matter how much life changes?", "Do you picture us in a cozy apartment or a little house with a garden?", "When we live together: dog, cat, or both?", "Do you think we'll still do late-night calls when we're finally in the same city?", "What was the very first voice note I ever sent you \u2014 do you remember what it said?", "What's a tiny detail from our early chats that still makes you smile?", "What song instantly teleports you back to our early days?", "Describe the night of May 11 in your own words \u2014 where were you, what did the air feel like?", "What's the sweetest thing I've ever done for you that I probably don't even remember?", "Which of our calls do you wish you could live inside for one more hour?", "What was the moment you knew \u2014 really knew \u2014 that this was real?", "What 'remember when' story of ours would you tell first, years from now?", "Do you still remember my very first profile photo, the one that started all this?", "Have you ever cried happy tears because of us?", "Do you keep any little thing that reminds you of me close by?", "Which memory do you replay more?", "How should we keep us?"]}];

// ---------- Questions ----------
var kvDeckIdx=0;
function openQuestions(){
  showQuestions(0);
}
function showQuestions(deckIdx){
  kvDeckIdx=deckIdx;
  var deck=KV_DECKS[deckIdx];
  var q=deck.questions[Math.floor(Math.random()*deck.questions.length)];
  var deckBtns=KV_DECKS.map(function(d,i){
    var sel=i===deckIdx?'background:#ffd9ec;color:#241b3f;border:none;':'background:transparent;color:#f4efff;border:1px solid rgba(244,239,255,.3);';
    return '<button onclick="KVShowDeck('+i+')" style="padding:8px 14px;margin:4px;border-radius:999px;cursor:pointer;'+sel+'">'+d.name+'</button>';
  }).join('');
  showModal('📚 '+deck.name,
    '<div style="margin-bottom:12px;">'+deckBtns+'</div>'+
    '<p style="font-size:20px;line-height:1.7;min-height:100px;">'+q+'</p>'+
    '<button onclick="KVNewQ()" style="margin-top:12px;padding:10px 24px;border-radius:999px;border:none;background:#ffd9ec;color:#241b3f;font-size:15px;cursor:pointer;">✨ New question</button>');
}
window.KVShowDeck=function(i){ showQuestions(i); };
window.KVNewQ=function(){ showQuestions(kvDeckIdx); };

// ---------- Games ----------
function openGames(){
  showModal('🎭 Theatre',
    '<p>Choose a game to play together:</p>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;">'+
    '<button onclick="KVTTT()" style="padding:16px;border-radius:12px;border:1px solid #b9a7ff;background:rgba(185,167,255,.15);color:#f4efff;cursor:pointer;font-size:16px;">⭕ Tic-Tac-Toe</button>'+
    '<button onclick="KVMemory()" style="padding:16px;border-radius:12px;border:1px solid #b9a7ff;background:rgba(185,167,255,.15);color:#f4efff;cursor:pointer;font-size:16px;">🃏 Memory Match</button>'+
    '<button disabled style="padding:16px;border-radius:12px;border:1px solid rgba(244,239,255,.2);background:rgba(255,255,255,.05);color:rgba(244,239,255,.4);font-size:16px;">🎲 Ludo<br><small>soon</small></button>'+
    '<button disabled style="padding:16px;border-radius:12px;border:1px solid rgba(244,239,255,.2);background:rgba(255,255,255,.05);color:rgba(244,239,255,.4);font-size:16px;">🐍 Snakes<br><small>soon</small></button>'+
    '</div>');
}
var kvTTT=['','','','','','','','',''], kvTTTX=true;
window.KVTTT=function(){
  kvTTT=['','','','','','','','','']; kvTTTX=true;
  renderTTT();
};
function renderTTT(){
  var cells=kvTTT.map(function(v,i){
    return '<button onclick="KVTTTM('+i+')" style="width:70px;height:70px;font-size:32px;border-radius:10px;border:1px solid #b9a7ff;background:rgba(255,255,255,.08);color:#f4efff;cursor:pointer;">'+(v||'')+'</button>';
  }).join('');
  var win=tttWin();
  var status=win?('🎉 '+(win==='D'?'Draw!':win+' wins!')):((kvTTTX?'⭕ X':'❌ O')+"'s turn");
  showModal('⭕ Tic-Tac-Toe',
    '<div style="text-align:center;"><div style="display:grid;grid-template-columns:repeat(3,70px);gap:8px;justify-content:center;margin:16px 0;">'+cells+'</div>'+
    '<p>'+status+'</p>'+
    (win?'<button onclick="KVTTT()" style="margin-top:8px;padding:8px 20px;border-radius:999px;border:none;background:#ffd9ec;color:#241b3f;cursor:pointer;">Play again</button>':'')+
    '</div>');
}
window.KVTTTM=function(i){
  if(kvTTT[i]||tttWin()) return;
  kvTTT[i]=kvTTTX?'X':'O'; kvTTTX=!kvTTTX;
  renderTTT();
};
function tttWin(){
  var w=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for(var i=0;i<w.length;i++){
    var a=w[i][0],b=w[i][1],c=w[i][2];
    if(kvTTT[a]&&kvTTT[a]===kvTTT[b]&&kvTTT[a]===kvTTT[c]) return kvTTT[a];
  }
  return kvTTT.indexOf('')===-1?'D':null;
}
var kvMem=[], kvMemFlip=[], kvMemLock=false;
window.KVMemory=function(){
  var em=['💕','🌙','⭐','🌸','🐱','🦋','🍓','🎵'];
  kvMem=em.concat(em).sort(function(){return Math.random()-0.5;});
  kvMemFlip=[]; kvMemLock=false;
  renderMem();
};
function renderMem(){
  var cards=kvMem.map(function(v,i){
    var show=kvMemFlip.indexOf(i)!==-1;
    return '<button onclick="KVMemF('+i+')" style="width:60px;height:60px;font-size:28px;border-radius:10px;border:1px solid #b9a7ff;background:'+(show?'rgba(255,217,236,.3)':'rgba(255,255,255,.08)')+';color:#f4efff;cursor:pointer;">'+(show?v:'?')+'</button>';
  }).join('');
  var done=kvMemFlip.length===16;
  showModal('🃏 Memory Match',
    '<div style="text-align:center;"><div style="display:grid;grid-template-columns:repeat(4,60px);gap:8px;justify-content:center;margin:16px 0;">'+cards+'</div>'+
    (done?'<p>🎉 All matched!</p><button onclick="KVMemory()" style="margin-top:8px;padding:8px 20px;border-radius:999px;border:none;background:#ffd9ec;color:#241b3f;cursor:pointer;">Play again</button>':'<p>Find all the pairs!</p>')+
    '</div>');
}
window.KVMemF=function(i){
  if(kvMemLock||kvMemFlip.indexOf(i)!==-1) return;
  kvMemFlip.push(i);
  if(kvMemFlip.length%2===0){
    var a=kvMemFlip[kvMemFlip.length-2], b=kvMemFlip[kvMemFlip.length-1];
    if(kvMem[a]!==kvMem[b]){
      kvMemLock=true;
      renderMem();
      setTimeout(function(){
        kvMemFlip.splice(kvMemFlip.indexOf(a),1);
        kvMemFlip.splice(kvMemFlip.indexOf(b),1);
        kvMemLock=false;
        renderMem();
      },800);
      return;
    }
  }
  renderMem();
};

// ---------- Memories ----------
function getMems(){
  try{ return JSON.parse(localStorage.getItem('kanavu_memories')||'[]'); }catch(e){ return []; }
}
function saveMems(m){ try{ localStorage.setItem('kanavu_memories', JSON.stringify(m)); }catch(e){} }
function openMemories(){
  var mems=getMems();
  var list=mems.length?mems.map(function(m,i){
    return '<div style="padding:12px;margin:8px 0;border-radius:12px;background:rgba(255,255,255,.07);">'+
      '<div style="font-size:13px;opacity:.6;">'+m.date+'</div>'+
      '<div style="margin-top:4px;">'+m.text+'</div>'+
      '<button onclick="KVDelMem('+i+')" style="margin-top:6px;font-size:12px;background:none;border:none;color:#ff8a8a;cursor:pointer;">delete</button></div>';
  }).join(''):'<p style="opacity:.6;">No memories yet. Add your first one below!</p>';
  showModal('🏡 Memory Cottage',
    '<div style="max-height:300px;overflow-y:auto;">'+list+'</div>'+
    '<div style="margin-top:12px;"><textarea id="kvmemtext" placeholder="Write a memory..." style="width:100%;height:60px;border-radius:10px;padding:10px;background:rgba(255,255,255,.1);border:1px solid rgba(244,239,255,.2);color:#f4efff;resize:none;"></textarea>'+
    '<button onclick="KVAddMem()" style="margin-top:8px;padding:10px 24px;border-radius:999px;border:none;background:#ffd9ec;color:#241b3f;cursor:pointer;">💕 Save memory</button></div>');
}
window.KVAddMem=function(){
  var t=document.getElementById('kvmemtext');
  if(!t||!t.value.trim()) return;
  var mems=getMems();
  mems.unshift({text:t.value.trim(), date:new Date().toLocaleDateString()});
  saveMems(mems);
  openMemories();
};
window.KVDelMem=function(i){
  var mems=getMems(); mems.splice(i,1); saveMems(mems); openMemories();
};

// ---------- Shop ----------
var KV_SHOP=[
  {n:'Straw Hat', e:'👒', c:10}, {n:'Ribbon Bow', e:'🎀', c:15},
  {n:'Star Wand', e:'⭐', c:20}, {n:'Backpack', e:'🎒', c:25},
  {n:'Flower Earrings', e:'🌸', c:15}, {n:'High Ponytail', e:'💇', c:12}
];
function getStars(){ try{ return parseInt(localStorage.getItem('kanavu_stars')||'0'); }catch(e){ return 0; } }
function setStars(s){ try{ localStorage.setItem('kanavu_stars', String(s)); }catch(e){} }
function getOwned(){ try{ return JSON.parse(localStorage.getItem('kanavu_owned')||'[]'); }catch(e){ return []; } }
function openShop(){
  var stars=getStars(), owned=getOwned();
  var items=KV_SHOP.map(function(it,i){
    var has=owned.indexOf(it.n)!==-1;
    return '<div style="padding:14px;border-radius:12px;background:rgba(255,255,255,.07);text-align:center;">'+
      '<div style="font-size:32px;">'+it.e+'</div>'+
      '<div style="margin:6px 0;">'+it.n+'</div>'+
      '<div style="font-size:13px;opacity:.7;">⭐ '+it.c+'</div>'+
      (has?'<div style="margin-top:6px;color:#8aff8a;">✓ Owned</div>':
       '<button onclick="KVBuy('+i+')" style="margin-top:6px;padding:6px 16px;border-radius:999px;border:none;background:#ffd9ec;color:#241b3f;cursor:pointer;font-size:13px;">Buy</button>')+
      '</div>';
  }).join('');
  showModal('🛍️ Shop',
    '<p>Your stars: ⭐ <b>'+stars+'</b></p>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;">'+items+'</div>');
}
window.KVBuy=function(i){
  var it=KV_SHOP[i], stars=getStars(), owned=getOwned();
  if(owned.indexOf(it.n)!==-1) return;
  if(stars<it.c){ alert('Not enough stars! You have '+stars+', need '+it.c); return; }
  setStars(stars-it.c);
  owned.push(it.n);
  try{ localStorage.setItem('kanavu_owned', JSON.stringify(owned)); }catch(e){}
  openShop();
};

function showModal(title, html){
  var old=document.getElementById('kv-feature-modal');
  if(old) old.remove();
  var m=document.createElement('div');
  m.id='kv-feature-modal';
  m.style.cssText='position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(10,8,30,.7);backdrop-filter:blur(4px);';
  m.innerHTML='<div style="max-width:420px;width:90%;background:linear-gradient(180deg,#2a2148,#1a1430);border:1px solid #b9a7ff;border-radius:20px;padding:28px;color:#f4efff;font-family:Georgia,serif;">'+
    '<h2 style="margin:0 0 16px;font-weight:400;letter-spacing:.1em;">'+title+'</h2>'+
    '<div>'+html+'</div>'+
    '<button onclick="document.getElementById(\'kv-feature-modal\').remove()" style="margin-top:20px;padding:8px 20px;border-radius:999px;border:1px solid rgba(244,239,255,.3);background:transparent;color:#f4efff;cursor:pointer;">Close</button></div>';
  m.addEventListener('click', function(e){ if(e.target===m) m.remove(); });
  document.body.appendChild(m);
}

function init(W){
  SITES.forEach(function(s){ makeBuilding(s, W); });
  // Tap detection via renderer canvas
  try{
    var cv = W.renderer && W.renderer.domElement;
    if(cv){
      var ray = new THREE.Raycaster();
      var ptr = new THREE.Vector2();
      cv.addEventListener('pointerdown', function(e){
        // Only handle taps (not drags) - check after short delay
        var sx=e.clientX, sy=e.clientY;
        setTimeout(function(){
          // Simple: if it was a tap (no significant move), check buildings
          ptr.x = (sx/window.innerWidth)*2-1;
          ptr.y = -(sy/window.innerHeight)*2+1;
          ray.setFromCamera(ptr, W.camera);
          // Check each building (sphere at building center)
          for(var i=0;i<SITES.length;i++){
            var s=SITES[i];
            var ax=s._ax||s.x, az=s._az||s.z;
            var gy=W.groundY(ax,az);
            var bp=new THREE.Vector3(ax, gy+2, az);
            var dist=ray.ray.distanceToPoint(bp);
            if(dist<4){
              openFeature(s.id);
              break;
            }
          }
        }, 150);
      });
    }
  }catch(e){}
}

var n=0;
var t=setInterval(function(){
  n++;
  try{ if(boot()||n>40) clearInterval(t); }catch(e){}
},2000);

}();
