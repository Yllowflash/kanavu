/* Kanavu v5: Direct building replacement — no sweep, no classification.
   Removes old procedural houses and places new GLB houses at fixed positions.
   Runs aggressively until it succeeds. */
!function(){
"use strict";
var BASE='https://ersejxowxutsefalyjaf.supabase.co/storage/v1/object/public/game-assets/v2/';
var HOUSES=[
  {x:-15,z:-3, url:'village/house-teal-1.glb', s:1.0, ry:0.5},
  {x:12, z:10, url:'village/house-teal-2.glb', s:1.0, ry:-0.4},
  {x:0,  z:-14,url:'village/house-stone.glb',  s:1.0, ry:0.2},
  {x:28, z:12, url:'village/house-teal-1.glb', s:1.0, ry:1.1},
  {x:-14,z:-58,url:'village/house-stone.glb',  s:1.4, ry:0.0}
];
var done=false, attempts=0;
function boot(){
  var W=null; try{ W=window.__kvWorld; }catch(e){}
  if(!W||!W.scene||!W.player) return false;
  if(!window.THREE||!window.THREE.GLTFLoader) return false;
  init(W); return true;
}
function init(W){
  var THREE_=window.THREE;
  var loader=new THREE_.GLTFLoader();
  // Debug overlay
  try{
    var dbg=document.createElement('div');
    dbg.id='kv-v5-debug';
    dbg.style.cssText='position:fixed;top:8px;left:8px;z-index:99999;background:rgba(0,0,0,0.75);color:#0f0;font:12px monospace;padding:8px;border-radius:6px;pointer-events:none;';
    dbg.textContent='v5: starting...';
    document.body.appendChild(dbg);
  }catch(e){}
  function setDbg(t){ try{ document.getElementById('kv-v5-debug').textContent=t; }catch(e){} }

  // Step 1: Remove old houses (box + cone roof groups near village positions)
  var removed=0;
  var toRemove=[];
  W.scene.traverse(function(o){
    if(!o.isGroup||o===W.scene) return;
    var p=new THREE_.Vector3(); o.getWorldPosition(p);
    for(var i=0;i<HOUSES.length;i++){
      var h=HOUSES[i];
      var d=Math.hypot(p.x-h.x,p.z-h.z);
      if(d<6){
        // Check if it looks like a house (has box and cone children)
        var hasBox=false, hasCone=false;
        o.traverse(function(c){
          if(c.isMesh){
            if(c.geometry&&c.geometry.type==='BoxGeometry') hasBox=true;
            if(c.geometry&&c.geometry.type==='ConeGeometry') hasCone=true;
          }
        });
        if(hasBox&&hasCone){
          toRemove.push(o);
          break;
        }
      }
    }
  });
  toRemove.forEach(function(o){ try{ o.parent.remove(o); removed++; }catch(e){} });
  setDbg('v5: removed '+removed+' old houses, loading new...');

  // Step 2: Place new GLB houses
  var loaded=0;
  HOUSES.forEach(function(h,idx){
    loader.load(BASE+h.url, function(gltf){
      var o=gltf.scene;
      o.position.set(h.x, 0, h.z);
      o.rotation.y=h.ry;
      o.scale.setScalar(h.s);
      // Ground the house (find terrain height)
      try{
        if(W.groundY) o.position.y=W.groundY(h.x,h.z);
      }catch(e){}
      o.traverse(function(m){ if(m.isMesh){ m.castShadow=true; m.receiveShadow=true; } });
      W.scene.add(o);
      loaded++;
      setDbg('v5: removed '+removed+', new houses '+loaded+'/'+HOUSES.length);
      if(loaded>=HOUSES.length){ setDbg('v5: DONE - '+loaded+' new houses placed'); done=true; }
    }, undefined, function(err){
      setDbg('v5: FAILED to load '+h.url);
    });
  });
}
// Retry until world exists, then run once
if(!boot()){
  var timer=setInterval(function(){
    try{
      if(boot()||++attempts>1200){ clearInterval(timer); }
    }catch(e){}
  },500);
}
}();
