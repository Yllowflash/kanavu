/* Kanavu house override: replaces old procedural houses with GLB models.
   Runs after kanavu-game.js, finds Box+Cone houses and swaps them. */
!function(){
"use strict";
var BASE='https://ersejxowxutsefalyjaf.supabase.co/storage/v1/object/public/game-assets/v2/';
function showMsg(t){
  try{
    var d=document.getElementById('kv-house-msg');
    if(!d){
      d=document.createElement('div');
      d.id='kv-house-msg';
      d.style.cssText='position:fixed;top:8px;left:8px;z-index:99999;background:rgba(0,0,0,0.8);color:#0f0;font:12px monospace;padding:8px;border-radius:6px;pointer-events:none;';
      (document.body||document.documentElement).appendChild(d);
    }
    d.textContent=t;
  }catch(e){}
}
function isOldHouse(g){
  if(!g||!g.isGroup) return false;
  var hasBox=false, hasCone=false;
  g.traverse(function(c){
    if(c.isMesh&&c.geometry){
      var t=c.geometry.type;
      if(t==='BoxGeometry') hasBox=true;
      if(t==='ConeGeometry') hasCone=true;
    }
  });
  return hasBox&&hasCone;
}
function replaceHouses(){
  var W=null;
  try{ W=window.__kvWorld; }catch(e){}
  if(!W||!W.scene||!window.THREE||!window.THREE.GLTFLoader) return false;
  
  showMsg('house-override: scanning...');
  var loader=new window.THREE.GLTFLoader();
  var replaced=0;
  var toReplace=[];
  
  W.scene.traverse(function(obj){
    if(isOldHouse(obj)) toReplace.push(obj);
  });
  
  showMsg('house-override: found '+toReplace.length+' old houses');
  
  toReplace.forEach(function(old,idx){
    var url=BASE+((idx%2===0)?'village/house-teal-1.glb':'village/house-stone.glb');
    loader.load(url,function(gltf){
      try{
        var model=gltf.scene||gltf.scenes[0];
        model.position.copy(old.position);
        model.rotation.copy(old.rotation);
        model.scale.setScalar(1.2);
        model.traverse(function(c){ if(c.isMesh) c.castShadow=true; });
        if(old.parent){
          old.parent.add(model);
          old.parent.remove(old);
        }
        replaced++;
        showMsg('house-override: replaced '+replaced+'/'+toReplace.length);
      }catch(e){}
    },undefined,function(){});
  });
  
  return toReplace.length>0;
}
var attempts=0;
var timer=setInterval(function(){
  attempts++;
  try{
    if(replaceHouses()||attempts>120){
      clearInterval(timer);
      if(attempts>120) showMsg('house-override: timed out');
    }
  }catch(e){}
},1000);
// Also try immediately
setTimeout(function(){ try{ replaceHouses(); }catch(e){} }, 3000);
}();
