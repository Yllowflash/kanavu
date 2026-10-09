/* Kanavu feature places: bookshop, theatre, memory cottage, shop.
   Places GLB buildings at fixed locations. */
!function(){
"use strict";
var BASE='https://ersejxowxutsefalyjaf.supabase.co/storage/v1/object/public/game-assets/v2/';
var PLACES=[
  {url:BASE+'buildings/bookshop.glb', x:-22, z:-8, s:1.3, ry:0.5, name:'Bookshop'},
  {url:BASE+'buildings/theatre.glb', x:-45, z:30, s:1.4, ry:-0.3, name:'Theatre'},
  {url:BASE+'buildings/memory-cottage.glb', x:-25, z:-115, s:1.2, ry:0.2, name:'Memory Cottage'},
  {url:BASE+'buildings/shop.glb', x:18, z:-20, s:1.3, ry:-0.5, name:'Shop'},
];
function showMsg(t){
  try{
    var d=document.getElementById('kv-places-msg');
    if(!d){
      d=document.createElement('div');
      d.id='kv-places-msg';
      d.style.cssText='position:fixed;top:40px;left:8px;z-index:99999;background:rgba(0,0,0,0.8);color:#0ff;font:12px monospace;padding:8px;border-radius:6px;pointer-events:none;';
      (document.body||document.documentElement).appendChild(d);
    }
    d.textContent=t;
  }catch(e){}
}
function placeBuildings(){
  var W=null;
  try{ W=window.__kvWorld; }catch(e){}
  if(!W||!W.scene||!window.THREE||!window.THREE.GLTFLoader) return false;
  if(!W.groundY) return false;
  
  showMsg('places: loading...');
  var loader=new window.THREE.GLTFLoader();
  var loaded=0;
  
  PLACES.forEach(function(p){
    // Skip if already placed
    if(p.placed) return;
    p.placed=true;
    
    loader.load(p.url,function(gltf){
      try{
        var model=gltf.scene||gltf.scenes[0];
        var y=0;
        try{ y=W.groundY(p.x,p.z); }catch(e){}
        model.position.set(p.x,y,p.z);
        model.rotation.y=p.ry;
        model.scale.setScalar(p.s);
        model.traverse(function(c){ if(c.isMesh){ c.castShadow=true; c.receiveShadow=true; } });
        W.scene.add(model);
        loaded++;
        showMsg('places: '+loaded+'/'+PLACES.length+' ('+p.name+')');
      }catch(e){ showMsg('places: error '+p.name); }
    },undefined,function(){ showMsg('places: failed '+p.name); });
  });
  return true;
}
showMsg('places: loaded, waiting for game...');
var attempts=0;
var timer=setInterval(function(){
  attempts++;
  try{
    if(placeBuildings()||attempts>120) clearInterval(timer);
  }catch(e){}
},1000);
setTimeout(function(){ try{ placeBuildings(); }catch(e){} }, 3000);
}();
