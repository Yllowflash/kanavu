/* Kanavu — Aesthetic Match (Quaternius style)
   Restyles existing assets to match the premium Quaternius character:
   - Softer, muted color palette (sage greens, warm beiges, soft blues)
   - Reduces clutter: keeps only well-spaced trees (removes excess)
   - Updates feature buildings with cohesive colors
   - Structured, natural layout
*/
!function(){
"use strict";

var done=false;
function boot(){
  var W=null;
  try{ W=window.__kvWorld; }catch(e){}
  if(!W||!W.scene||!window.THREE) return false;
  if(done) return true;
  done=true;
  setTimeout(function(){ restyle(W); }, 12000);
  return true;
}

// Quaternius-inspired palette (soft, natural, cohesive)
var PALETTE = {
  treeGreen: 0x7aa87a,    // soft sage green
  treeDark: 0x5a8a5a,     // deeper green for variety
  trunkBrown: 0x8a6a4a,  // warm brown
  buildingCream: 0xf5f0e6,// warm cream
  buildingSage: 0xdde8d4, // sage tint
  roofTerracotta: 0xc48a6a, // soft terracotta
  roofSlate: 0x8a9aaa,    // soft slate blue
  stoneGray: 0xb8b8b0     // warm gray
};

function restyle(W){
  var T=window.THREE;
  try{
    var trees=[];
    // Find all tree-like objects (cone/sphere on cylinder)
    W.scene.traverse(function(obj){
      if(!obj.isMesh) return;
      var p=new T.Vector3();
      obj.getWorldPosition(p);
      var dist=Math.hypot(p.x, p.z);
      // Only process objects on land (not in water)
      if(dist>95) return;
      
      // Identify trees by shape: cone (foliage) or sphere
      var g=obj.geometry;
      if(!g) return;
      var type=g.type;
      if(type==='ConeGeometry'){
        trees.push(obj);
        // Soften the green to Quaternius sage
        if(obj.material && obj.material.color){
          // Vary slightly for natural look
          var v=Math.random();
          var c=v<0.5?PALETTE.treeGreen:PALETTE.treeDark;
          obj.material.color.setHex(c);
          // Make material softer
          if(obj.material.roughness!==undefined){
            obj.material.roughness=0.8;
          }
        }
      } else if(type==='CylinderGeometry'){
        // Trunk - warm brown
        var h=g.parameters?g.parameters.height:0;
        if(h>1 && h<4){ // tree trunk size
          if(obj.material && obj.material.color){
            obj.material.color.setHex(PALETTE.trunkBrown);
          }
        }
      }
    });

    // Remove excess trees: keep only every 3rd tree (reduce clutter)
    // But keep trees near buildings and paths
    var kept=0;
    for(var i=0;i<trees.length;i++){
      if(i%3!==0){
        // Check if near a feature building (keep those)
        var p=new T.Vector3();
        trees[i].getWorldPosition(p);
        var nearBuilding=false;
        // Feature building positions (approximate)
        var buildings=[[-38,-12],[-28,-20],[10,30],[24,38]];
        for(var b=0;b<buildings.length;b++){
          var dx=p.x-buildings[b][0], dz=p.z-buildings[b][1];
          if(Math.hypot(dx,dz)<12){ nearBuilding=true; break; }
        }
        if(!nearBuilding){
          try{
            if(trees[i].parent) trees[i].parent.remove(trees[i]);
          }catch(e){}
        } else {
          kept++;
        }
      } else {
        kept++;
      }
    }

    // Update feature buildings to Quaternius palette
    // (They're in kanavu-features.js, we tint them here)
    W.scene.traverse(function(obj){
      if(!obj.isMesh) return;
      var ud=obj.userData||{};
      // Feature buildings have _asset flag from kanavu-features.js
      // We'll tint by position (near our building sites)
      var p=new T.Vector3();
      obj.getWorldPosition(p);
      var buildings=[[-38,-12],[-28,-20],[10,30],[24,38]];
      for(var b=0;b<buildings.length;b++){
        var dx=p.x-buildings[b][0], dz=p.z-buildings[b][1];
        if(Math.hypot(dx,dz)<6){
          if(obj.material && obj.material.color){
            var g=obj.geometry;
            if(g && g.type==='BoxGeometry'){
              // Walls -> cream
              obj.material.color.setHex(PALETTE.buildingCream);
            } else if(g && g.type==='ConeGeometry'){
              // Roofs -> terracotta/slate (alternate)
              obj.material.color.setHex(b%2===0?PALETTE.roofTerracotta:PALETTE.roofSlate);
            }
          }
          break;
        }
      }
    });

  }catch(e){}
}

var n=0;
var t=setInterval(function(){
  n++;
  try{ if(boot()||n>40) clearInterval(t); }catch(e){}
},2000);

}();
