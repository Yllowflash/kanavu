/* Kanavu — Cleanup: remove pillars, statues (v2 - aggressive)
   Removes:
   - 4 glow pillars around the island
   - Flying statue (winged statue at sanctuary)
   - Far away statue
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
  setTimeout(function(){ cleanup(W); }, 8000);
  return true;
}

function cleanup(W){
  var T=window.THREE;
  var removed=0;
  try{
    var toRemove=[];

    // Building locations to protect (don't remove these)
    var buildings=[[-38,-12],[-28,-20],[10,30],[24,38]];
    function nearBuilding(x,z){
      for(var i=0;i<buildings.length;i++){
        var dx=x-buildings[i][0], dz=z-buildings[i][1];
        if(Math.hypot(dx,dz)<15) return true;
      }
      return false;
    }

    W.scene.traverse(function(obj){
      if(!obj.isMesh && obj.type!=='Group') return;
      var p=new T.Vector3();
      try{ obj.getWorldPosition(p); }catch(e){ return; }

      // Skip if near buildings
      if(nearBuilding(p.x, p.z)) return;

      // Skip the player character (near origin, small)
      var distC=Math.hypot(p.x, p.z);
      if(distC<10) return;

      try{
        var box=new T.Box3().setFromObject(obj);
        var h=box.max.y-box.min.y;
        var w=box.max.x-box.min.x;
        var d=box.max.z-box.min.z;
        var maxDim=Math.max(w,d);

        // --- PILLARS: tall and narrow ---
        // Glow pillars: very tall, relatively narrow
        if(h>10 && maxDim<8){
          // Check if it has emissive/glow material (pillars glow)
          var isGlow=false;
          obj.traverse(function(child){
            if(child.isMesh && child.material){
              var m=child.material;
              if(m.emissive && (m.emissive.r>0.1||m.emissive.g>0.1||m.emissive.b>0.1)) isGlow=true;
              if(m.emissiveIntensity && m.emissiveIntensity>0.5) isGlow=true;
            }
          });
          // Remove if glowing OR very tall and narrow and far out
          if(isGlow || (h>15 && maxDim<5 && distC>50)){
            toRemove.push(obj);
            return;
          }
        }

        // --- STATUES: large figures, not buildings/trees ---
        // Statues are large (h>6), not too wide, not near buildings
        // Exclude trees (cone geometry) and buildings (box geometry near building spots)
        if(obj.isMesh && h>6 && h<30 && maxDim<10 && distC>30){
          var g=obj.geometry;
          var gtype=g?(g.type||''):'';
          // Skip trees (cones) and simple boxes (likely building parts)
          if(gtype.indexOf('Cone')===-1){
            // Check if it's a complex shape (statues are detailed)
            // For now, flag large non-cone, non-box objects far from center
            if(gtype.indexOf('Box')===-1 || h>12){
              // Don't remove if it's clearly a building part (very wide)
              if(maxDim<12){
                toRemove.push(obj);
              }
            }
          }
        }
      }catch(e){}
    });

    // Remove duplicates and execute
    var seen=new Set();
    toRemove.forEach(function(obj){
      if(seen.has(obj)) return;
      seen.add(obj);
      try{
        if(obj.parent) obj.parent.remove(obj);
        removed++;
      }catch(e){}
    });
  }catch(e){}
}

var n=0;
var t=setInterval(function(){
  n++;
  try{ if(boot()||n>40) clearInterval(t); }catch(e){}
},2000);

}();
