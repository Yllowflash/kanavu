/* Kanavu perfect pass: replaces ALL old procedural assets with GLBs.
   - Houses: position-based (already done, kept)
   - Trees: Cylinder+Icosahedron → pine-tall / broadleaf GLBs
   - Runs once, thoroughly. */
!function(){
"use strict";
var BASE='https://ersejxowxutsefalyjaf.supabase.co/storage/v1/object/public/game-assets/v2/';
var HOUSE_SPOTS=[
  {x:-15, z:-3, glb:'village/house-teal-1.glb'},
  {x:12, z:10, glb:'village/house-teal-2.glb'},
];
var TREE_GLBS=['nature/pine-tall.glb','nature/broadleaf.glb'];
function showMsg(t){
  try{
    var d=document.getElementById('kv-perfect');
    if(!d){
      d=document.createElement('div');
      d.id='kv-perfect';
      d.style.cssText='position:fixed;top:8px;left:8px;z-index:99999;background:rgba(0,0,0,0.85);color:#0f0;font:12px monospace;padding:8px;border-radius:6px;pointer-events:none;max-width:300px;';
      (document.body||document.documentElement).appendChild(d);
    }
    d.textContent=t;
  }catch(e){}
}
function isOldTree(g){
  if(!g||!g.isGroup) return false;
  var hasTrunk=false, hasFoliage=false;
  g.traverse(function(c){
    if(c.isMesh&&c.geometry){
      var t=c.geometry.type||'';
      var p=c.geometry.parameters||{};
      // Trunk: CylinderGeometry(0.06, 0.09, 0.9, 6)
      if(t.indexOf('Cylinder')>=0 && p.height && Math.abs(p.height-0.9)<0.2){
        hasTrunk=true;
      }
      // Foliage: IcosahedronGeometry(0.34, 0)
      if(t.indexOf('Icosahedron')>=0){
        hasFoliage=true;
      }
    }
  });
  return hasTrunk&&hasFoliage;
}
var done=false;
function perfect(){
  var W=null;
  try{ W=window.__kvWorld; }catch(e){}
  if(!W||!W.scene||!window.THREE||!window.THREE.GLTFLoader||!W.groundY) return false;
  if(done) return true;
  done=true;
  
  var loader=new window.THREE.GLTFLoader();
  var trees=[], housesHidden=0;
  
  // Scan scene
  W.scene.traverse(function(obj){
    if(!obj.isGroup) return;
    // Hide old houses by position
    for(var i=0;i<HOUSE_SPOTS.length;i++){
      var s=HOUSE_SPOTS[i];
      var dx=obj.position.x-s.x, dz=obj.position.z-s.z;
      if(Math.sqrt(dx*dx+dz*dz)<3){ obj.visible=false; housesHidden++; break; }
    }
    // Collect old trees
    if(isOldTree(obj)) trees.push(obj);
  });
  
  showMsg('perfect: '+housesHidden+' houses hidden, '+trees.length+' trees found');
  
  // Replace houses
  var hPlaced=0;
  HOUSE_SPOTS.forEach(function(s){
    loader.load(BASE+s.glb,function(gltf){
      try{
        var m=gltf.scene||gltf.scenes[0];
        var y=0; try{ y=W.groundY(s.x,s.z); }catch(e){}
        m.position.set(s.x,y,s.z); m.scale.setScalar(1.2);
        m.traverse(function(c){ if(c.isMesh) c.castShadow=true; });
        W.scene.add(m); hPlaced++;
        showMsg('perfect: houses '+hPlaced+'/'+HOUSE_SPOTS.length+', trees 0/'+trees.length);
      }catch(e){}
    },undefined,function(){});
  });
  
  // Replace trees
  var tPlaced=0;
  trees.forEach(function(old,idx){
    var glb=TREE_GLBS[idx%TREE_GLBS.length];
    loader.load(BASE+glb,function(gltf){
      try{
        var m=gltf.scene||gltf.scenes[0];
        m.position.copy(old.position);
        m.rotation.y=Math.random()*Math.PI*2;
        var sc=0.8+Math.random()*0.6;
        m.scale.setScalar(sc);
        m.traverse(function(c){ if(c.isMesh) c.castShadow=true; });
        if(old.parent){ old.parent.add(m); old.parent.remove(old); }
        tPlaced++;
        showMsg('perfect: houses '+hPlaced+'/'+HOUSE_SPOTS.length+', trees '+tPlaced+'/'+trees.length);
        if(tPlaced===trees.length) showMsg('perfect: DONE - all replaced');
      }catch(e){}
    },undefined,function(){ tPlaced++; });
  });
  
  return true;
}
showMsg('perfect: loaded');
var n=0;
var t=setInterval(function(){
  n++;
  try{ if(perfect()||n>60) clearInterval(t); }catch(e){}
},2000);
}();
