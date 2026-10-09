/* Thorough bug fixes:
   1. Island size: 380 -> 260 (original)
   2. Bridge sand: lower terrain under bridge below water
   Runs BEFORE kanavu-game.js, patches at the source.
*/
!function(){
"use strict";
// 1. Patch PlaneGeometry to use 260 instead of 380
if(window.THREE && window.THREE.PlaneGeometry){
  var OrigPlane = window.THREE.PlaneGeometry;
  window.THREE.PlaneGeometry = function(w, h, ws, hs){
    if(Math.abs(w-380)<1) w=260;
    if(Math.abs(h-380)<1) h=260;
    // Adjust segments proportionally (280 -> 191)
    if(ws===280) ws=191;
    if(hs===280) hs=191;
    return new OrigPlane(w, h, ws, hs);
  };
  window.THREE.PlaneGeometry.prototype = OrigPlane.prototype;
}

// 2. After game loads, lower terrain under bridge
var done=false;
function fixBridge(){
  var W=null;
  try{ W=window.__kvWorld; }catch(e){}
  if(!W||!W.scene) return false;
  if(done) return true;
  done=true;
  // Find terrain (largest PlaneGeometry mesh)
  var terrain=null, maxN=0;
  W.scene.traverse(function(obj){
    if(obj.isMesh&&obj.geometry&&obj.geometry.attributes&&obj.geometry.attributes.position){
      var n=obj.geometry.attributes.position.count;
      if(n>maxN&&n>20000){ maxN=n; terrain=obj; }
    }
  });
  if(!terrain) return false;
  // Lower vertices near bridge (0, 16) to below water
  var pos=terrain.geometry.attributes.position;
  var bx=0, bz=16, radius=25;
  for(var i=0;i<pos.count;i++){
    var vx=pos.getX(i), vz=pos.getZ(i);
    // Account for terrain position/scale
    var wx=terrain.position.x + vx*terrain.scale.x;
    var wz=terrain.position.z + vz*terrain.scale.z;
    var d=Math.sqrt((wx-bx)*(wx-bx)+(wz-bz)*(wz-bz));
    if(d<radius){
      var y=pos.getY(i);
      // Lower to -1 (below water at 0)
      var factor=1-(d/radius);
      pos.setY(i, y - (y+1)*factor);
    }
  }
  pos.needsUpdate=true;
  terrain.geometry.computeVertexNormals();
  return true;
}
var n=0;
var t=setInterval(function(){
  n++;
  try{ if(fixBridge()||n>40) clearInterval(t); }catch(e){}
},2000);
}();
