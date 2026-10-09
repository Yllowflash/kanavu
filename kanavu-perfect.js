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
  if(!g) return false;
  // Look for icosahedron foliage (distinctive to old trees)
  // Check the object itself and its children
  var found=false;
  try{
    g.traverse(function(c){
      if(found) return;
      if(c.isMesh&&c.geometry){
        var t=c.geometry.type||'';
        if(t.indexOf('Icosahedron')>=0) found=true;
      }
    });
  }catch(e){}
  return found;
}
var done=false;
var treeQueue=[];
function perfect(){
  var W=null;
  try{ W=window.__kvWorld; }catch(e){}
  if(!W||!W.scene||!window.THREE||!window.THREE.GLTFLoader||!W.groundY) return false;
  
  var loader=new window.THREE.GLTFLoader();
  
  // Houses: hide by position (once)
  if(!done){
    done=true;
    var housesHidden=0;
    W.scene.traverse(function(obj){
      if(!obj.isGroup) return;
      for(var i=0;i<HOUSE_SPOTS.length;i++){
        var s=HOUSE_SPOTS[i];
        var dx=obj.position.x-s.x, dz=obj.position.z-s.z;
        if(Math.sqrt(dx*dx+dz*dz)<3){ obj.visible=false; housesHidden++; break; }
      }
    });
    // Place new houses
    HOUSE_SPOTS.forEach(function(s){
      loader.load(BASE+s.glb,function(gltf){
        try{
          var m=gltf.scene||gltf.scenes[0];
          var y=0; try{ y=W.groundY(s.x,s.z); }catch(e){}
          m.position.set(s.x,y,s.z); m.scale.setScalar(1.2);
          m.traverse(function(c){ if(c.isMesh) c.castShadow=true; });
          W.scene.add(m);
        }catch(e){}
      },undefined,function(){});
    });
    showMsg('perfect: houses done, scanning trees...');
  }
  
  // Trees: continuous scan (they may load late)
  var newTrees=[];
  W.scene.traverse(function(obj){
    if(!obj.isGroup||obj.userData.replaced) return;
    if(isOldTree(obj)){
      obj.userData.replaced=true;
      newTrees.push(obj);
    }
  });
  
  if(newTrees.length>0){
    showMsg('perfect: replacing '+newTrees.length+' trees...');
    newTrees.forEach(function(old,idx){
      var glb=TREE_GLBS[(idx+treeQueue.length)%TREE_GLBS.length];
      loader.load(BASE+glb,function(gltf){
        try{
          var m=gltf.scene||gltf.scenes[0];
          m.position.copy(old.position);
          m.rotation.y=Math.random()*Math.PI*2;
          m.scale.setScalar(0.8+Math.random()*0.6);
          m.traverse(function(c){ if(c.isMesh) c.castShadow=true; });
          if(old.parent){ old.parent.add(m); old.parent.remove(old); }
        }catch(e){}
      },undefined,function(){});
    });
    treeQueue=treeQueue.concat(newTrees);
    showMsg('perfect: '+treeQueue.length+' trees replaced total');
  }
  
  return true;
}
showMsg('perfect: loaded');
var n=0;
var t=setInterval(function(){
  n++;
  try{ if(perfect()||n>60) clearInterval(t); }catch(e){}
},2000);
}();
