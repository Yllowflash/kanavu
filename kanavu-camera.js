/* Kanavu — Camera smoothing + obstacle clearing
   1. Smooths camera by damping position changes
   2. Removes obstacles/colliders near the main walking area (spawn)
*/
!function(){
"use strict";

var done=false;
function boot(){
  var W=null;
  try{ W=window.__kvWorld; }catch(e){}
  if(!W||!W.scene||!W.camera||!window.THREE) return false;
  if(done) return true;
  done=true;
  init(W);
  return true;
}

function init(W){
  var T=window.THREE;
  var cam=W.camera;

  // ---------- 1. Camera smoothing ----------
  // Store the game's intended camera position, then smooth towards it
  var targetPos=new T.Vector3();
  var targetLook=new T.Vector3();
  var hasTarget=false;
  var smoothPos=new T.Vector3();
  var smoothLook=new T.Vector3();
  var initialized=false;

  // Hook into the render loop via onBeforeRender or RAF
  // We use a RAF that runs and smooths AFTER the game's update
  var lastX=0, lastY=0, lastZ=0;
  function smoothLoop(){
    try{
      // The game sets cam.position each frame. We detect the change,
      // treat it as the target, and smooth our own position towards it.
      var gx=cam.position.x, gy=cam.position.y, gz=cam.position.z;
      if(!initialized){
        smoothPos.set(gx,gy,gz);
        initialized=true;
      }
      // If game moved the camera (target changed), update target
      var dx=gx-lastX, dy=gy-lastY, dz=gz-lastZ;
      if(Math.abs(dx)>0.001||Math.abs(dy)>0.001||Math.abs(dz)>0.001){
        targetPos.set(gx,gy,gz);
        hasTarget=true;
      }
      lastX=gx; lastY=gy; lastZ=gz;
      // Smooth towards target (lerp factor 0.12 = smooth but responsive)
      if(hasTarget){
        smoothPos.lerp(targetPos, 0.12);
        cam.position.copy(smoothPos);
      }
    }catch(e){}
    requestAnimationFrame(smoothLoop);
  }
  requestAnimationFrame(smoothLoop);

  // ---------- 2. Clear obstacles near spawn ----------
  // Remove colliders within 25 units of spawn (0,0)
  try{
    if(W.staticColliders && W.staticColliders.length){
      var kept=[];
      for(var i=0;i<W.staticColliders.length;i++){
        var c=W.staticColliders[i];
        var d=Math.hypot(c.x||0, c.z||0);
        // Keep colliders for our feature buildings (they have 'feature' flag)
        // and keep those far from spawn
        if(c.feature || d>25){
          kept.push(c);
        }
        // else: remove (near spawn, not a feature building)
      }
      W.staticColliders.length=0;
      for(var j=0;j<kept.length;j++) W.staticColliders.push(kept[j]);
    }
  }catch(e){}

  // Also remove visual obstacle meshes near spawn (trees/rocks within 20 units)
  // We do this after a delay to let the scene fully load
  setTimeout(function(){
    try{
      var toRemove=[];
      W.scene.traverse(function(obj){
        if(!obj.isMesh) return;
        // Skip the player, buildings, and ground
        if(obj.userData && (obj.userData._asset || obj.userData.player)) return;
        var wx=0, wz=0;
        obj.getWorldPosition(new T.Vector3());
        var p=new T.Vector3();
        obj.getWorldPosition(p);
        wx=p.x; wz=p.z;
        var d=Math.hypot(wx, wz);
        // If within 18 units of spawn and it's a small obstacle (tree/rock/bush)
        // We identify by size: objects between 1-6 units tall
        if(d<18 && d>3){
          var h=0;
          try{
            var box=new T.Box3().setFromObject(obj);
            h=box.max.y-box.min.y;
          }catch(e2){}
          if(h>0.8 && h<7){
            // Check if it's likely a tree/rock (not a building)
            // Buildings are bigger and have _asset flag
            toRemove.push(obj);
          }
        }
      });
      // Remove them (but limit to 15 to avoid clearing too much)
      for(var k=0;k<Math.min(15,toRemove.length);k++){
        try{
          var parent=toRemove[k].parent;
          if(parent) parent.remove(toRemove[k]);
        }catch(e){}
      }
    }catch(e){}
  }, 8000);
}

var n=0;
var t=setInterval(function(){
  n++;
  try{ if(boot()||n>40) clearInterval(t); }catch(e){}
},2000);

}();
