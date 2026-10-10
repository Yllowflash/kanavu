/* Kanavu — Lightweight Feature Buildings
   4 procedural buildings (no GLBs): Bookshop, Theatre, Memory Cottage, Shop
   Tap to open: questions, games, memories, shop
   Uses kanavu-daily.js question data if available.
*/
!function(){
"use strict";

var SITES = [
  {id:'bookshop', x:-22, z:-8,  ry:1.19, name:'Bookshop',  color:0xf6ead2, roof:0x2e8f8a, label:'📚 Bookshop'},
  {id:'theatre',  x:-45, z:30,  ry:0.5,  name:'Theatre',   color:0xd8cfc0, roof:0x8a3a3a, label:'🎭 Theatre'},
  {id:'cottage',  x:-25, z:-95, ry:0.3,  name:'Memories',  color:0xe8dcc8, roof:0x6a8a5a, label:'🏡 Memory Cottage'},
  {id:'shop',     x:18,  z:-20, ry:-0.6, name:'Shop',      color:0xf0d8e8, roof:0x8a5aa0, label:'🛍️ Shop'}
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

function makeBuilding(site, W){
  var T=window.THREE;
  var g=new T.Group();
  var gy=W.groundY(site.x, site.z);
  g.position.set(site.x, gy, site.z);
  g.rotation.y=site.ry||0;

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

  // Tap handler
  if(W.onTap){
    try{
      W.onTap(function(hit){
        if(!hit||!hit.point) return false;
        var dx=hit.point.x-site.x, dz=hit.point.z-site.z;
        if(Math.hypot(dx,dz)<5){
          openFeature(site.id);
          return true;
        }
        return false;
      });
    }catch(e){}
  }
  // Proximity: also open via collider
  if(W.staticColliders){
    try{ W.staticColliders.push({x:site.x, z:site.z, r:4.5, feature:site.id}); }catch(e){}
  }
}

function openFeature(id){
  if(id==='bookshop') openQuestions();
  else if(id==='theatre') openGames();
  else if(id==='cottage') openMemories();
  else if(id==='shop') openShop();
}

// ---------- Questions ----------
function getQuestions(){
  // Try kanavu-daily.js data
  try{
    if(window.KVDaily && window.KVDaily.decks) return window.KVDaily.decks;
    if(window.__kvDecks) return window.__kvDecks;
  }catch(e){}
  // Fallback: sample questions
  return [{
    name:'Getting Closer',
    questions:[
      "What's one small thing I do that makes you feel chosen?",
      "When do you feel closest to me?",
      "What's a dream you haven't told anyone?",
      "What does home feel like to you?"
    ]
  }];
}

function openQuestions(){
  var decks=getQuestions();
  var deck=decks[0];
  var qs=deck.questions||deck;
  var q=qs[Math.floor(Math.random()*qs.length)];
  showModal('📚 '+(deck.name||'Questions'), '<p style="font-size:20px;line-height:1.6;">'+q+'</p>'+
    '<button onclick="this.parentElement.parentElement.remove()" style="margin-top:16px;padding:10px 24px;border-radius:999px;border:none;background:#ffd9ec;color:#241b3f;font-size:15px;cursor:pointer;">New question</button>');
}

// ---------- Games ----------
function openGames(){
  showModal('🎭 Theatre', '<p>Choose a game:</p>'+
    '<div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;">'+
    ['Ludo','Snakes & Ladders','Tic-Tac-Toe','Memory Match'].map(function(g){
      return '<button style="padding:12px 20px;border-radius:12px;border:1px solid #b9a7ff;background:rgba(185,167,255,.15);color:#f4efff;cursor:pointer;font-size:15px;">'+g+'</button>';
    }).join('')+'</div><p style="margin-top:12px;opacity:.6;font-size:13px;">Games coming soon — pick one to play together!</p>');
}

// ---------- Memories ----------
function openMemories(){
  showModal('🏡 Memory Cottage', '<p>Your shared memories live here.</p>'+
    '<p style="margin-top:10px;opacity:.7;">Tap the journal to add a new memory together.</p>');
}

// ---------- Shop ----------
function openShop(){
  showModal('🛍️ Shop', '<p>Outfits & gifts:</p>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;">'+
    ['Straw Hat ⭐10','Ribbon Bow ⭐15','Star Wand ⭐20','Backpack ⭐25','Flower Earrings ⭐15','High Ponytail ⭐12'].map(function(it){
      return '<div style="padding:12px;border-radius:12px;background:rgba(255,255,255,.08);text-align:center;">'+it+'</div>';
    }).join('')+'</div>');
}

// ---------- Modal ----------
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
}

var n=0;
var t=setInterval(function(){
  n++;
  try{ if(boot()||n>40) clearInterval(t); }catch(e){}
},2000);

}();
