/* Kanavu — Cleanup: remove pillars, statues
   Removes via scene traversal (safe, no core file edits):
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
  // Wait for scene to fully load
  setTimeout(function(){ cleanup(W); }, 10000);
  return true;
}

function cleanup(W){
  var T=window.THREE;
  var removed=0;
  try{
    var toRemove=[];
    W.scene.traverse(function(obj){
      if(!obj.isMesh) return;
      // Get world position
      var p=new T.Vector3();
      obj.getWorldPosition(p);
      
      // --- Pillars: tall cylinders (height > 15, radius < 3) ---
      // The 4 glow pillars around the island
      try{
        var box=new T.Box3().setFromObject(obj);
        var h=box.max.y-box.min.y;
        var w=box.max.x-box.min.x;
        var d=box.max.z-box.min.z;
        // Pillar: very tall, narrow
        if(h>15 && w<4 && d<4){
          // Check if it's far from center (pillars are around the island edge)
          var dist=Math.hypot(p.x, p.z);
          if(dist>80){
            toRemove.push(obj);
          }
        }
      }catch(e){}

      // --- Statues: large humanoid or winged figures ---
      // Flying statue (winged) at sanctuary, and far away statue
      // We identify by: large size, or having 'statue' in name/userData
      var name=(obj.name||'').toLowerCase();
      var ud=obj.userData||{};
      if(name.indexOf('statue')!==-1 || name.indexOf('wing')!==-1 ||
         ud.statue || ud.winged){
        toRemove.push(obj);
      }
    });

    // Also check groups (statues might be groups)
    W.scene.traverse(function(obj){
      if(obj.type==='Group'){
        var name=(obj.name||'').toLowerCase();
        if(name.indexOf('statue')!==-1){
          toRemove.push(obj);
        }
      }
    });

    // Remove them
    toRemove.forEach(function(obj){
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
