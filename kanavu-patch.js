/* Kanavu proper house fix: intercepts house creation at the THREE level.
   Loads BEFORE kanavu-game.js. Patches Mesh creation to detect the
   old house pattern (Box 2.6x1.9x2.2 + Cone 2.15/1.3/4) and swaps in GLBs. */
!function(){
"use strict";
var BASE='https://ersejxowxutsefalyjaf.supabase.co/storage/v1/object/public/game-assets/v2/';
var houseGroups=new WeakSet();
var loader=null;

function getLoader(){
  if(!loader && window.THREE && window.THREE.GLTFLoader){
    loader=new window.THREE.GLTFLoader();
  }
  return loader;
}

function isHouseBody(geo){
  if(!geo||!geo.parameters) return false;
  var p=geo.parameters;
  // BoxGeometry(2.6, 1.9, 2.2)
  return Math.abs(p.width-2.6)<0.01 && Math.abs(p.height-1.9)<0.01 && Math.abs(p.depth-2.2)<0.01;
}

function isHouseRoof(geo){
  if(!geo||!geo.parameters) return false;
  var p=geo.parameters;
  // ConeGeometry(2.15, 1.3, 4)
  return Math.abs(p.radius-2.15)<0.01 && Math.abs(p.height-1.3)<0.01 && p.radialSegments===4;
}

function swapToGLB(group, isTeal){
  var l=getLoader();
  if(!l) return;
  var url=BASE+(isTeal?'village/house-teal-1.glb':'village/house-stone.glb');
  // Clear existing children
  while(group.children.length>0){
    group.remove(group.children[0]);
  }
  l.load(url,function(gltf){
    try{
      var model=gltf.scene||gltf.scenes[0];
      model.scale.setScalar(1.15);
      model.traverse(function(c){ if(c.isMesh) c.castShadow=true; });
      group.add(model);
    }catch(e){}
  },undefined,function(){});
}

// Patch THREE.Mesh when THREE becomes available
var checkCount=0;
var checkTimer=setInterval(function(){
  checkCount++;
  if(!window.THREE||!window.THREE.Mesh){
    if(checkCount>100) clearInterval(checkTimer);
    return;
  }
  clearInterval(checkTimer);
  
  var OrigMesh=window.THREE.Mesh;
  var OrigGroupAdd=window.THREE.Group.prototype.add;
  
  // Track meshes with house body geometry
  window.THREE.Mesh=function(geo,mat){
    var mesh=new OrigMesh(geo,mat);
    if(isHouseBody(geo)){
      mesh.userData.isHouseBody=true;
    }
    if(isHouseRoof(geo)){
      mesh.userData.isHouseRoof=true;
    }
    return mesh;
  };
  window.THREE.Mesh.prototype=OrigMesh.prototype;
  
  // Intercept Group.add to detect house assembly
  window.THREE.Group.prototype.add=function(){
    var result=OrigGroupAdd.apply(this,arguments);
    // Check if this group now has both body and roof
    var hasBody=false, hasRoof=false, bodyColor=0;
    for(var i=0;i<this.children.length;i++){
      var c=this.children[i];
      if(c.userData){
        if(c.userData.isHouseBody){ hasBody=true; }
        if(c.userData.isHouseRoof){ hasRoof=true; }
      }
    }
    if(hasBody&&hasRoof&&!houseGroups.has(this)){
      houseGroups.add(this);
      // Determine which GLB by checking material color of body
      var isTeal=true;
      for(var j=0;j<this.children.length;j++){
        var ch=this.children[j];
        if(ch.userData&&ch.userData.isHouseBody&&ch.material&&ch.material.color){
          var hex=ch.material.color.getHex();
          // 16181970 (0xF6EAD2) was teal house, 15915240 was stone
          isTeal=(hex===16181970);
          break;
        }
      }
      swapToGLB(this,isTeal);
    }
    return result;
  };
},100);
}();
