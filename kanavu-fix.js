/* Kanavu thorough fixes v2
   1. Island: 380 -> 260 via PlaneGeometry patch (segments unchanged)
   2. Bridge: lower terrain gradually under actual bridge span
   Loads BEFORE kanavu-game.js.
*/
!function(){
"use strict";

// --- 1. Island size: patch PlaneGeometry ---
// Only change the size, NOT the segments. Changing segments broke normals.
try{
  if(window.THREE && window.THREE.PlaneGeometry){
    var OrigPlane = window.THREE.PlaneGeometry;
    window.THREE.PlaneGeometry = function(w, h, ws, hs){
      // Original island was 260; it was extended to 380. Restore 260.
      if(Math.abs(w-380)<1) w=260;
      if(Math.abs(h-380)<1) h=260;
      return new OrigPlane(w, h, ws, hs);
    };
    window.THREE.PlaneGeometry.prototype = OrigPlane.prototype;
  }
}catch(e){}

// --- 2. Bridge sand: lower terrain under the real bridge ---
// Waits for world, finds bridge by shape, lowers terrain smoothly.
var done=false;
function fixBridge(){
  var W=null;
  try{ W=window.__kvWorld; }catch(e){}
  if(!W||!W.scene||!window.THREE) return false;
  if(done) return true;

  // Find bridge: longest narrow group near ground
  var bridge=null, bestLen=0;
  try{
    W.scene.traverse(function(obj){
      if(!obj.isGroup||obj.children.length<4) return;
      try{
        var box=new window.THREE.Box3().setFromObject(obj);
        var size=new window.THREE.Vector3(); box.getSize(size);
        var center=new window.THREE.Vector3(); box.getCenter(center);
        var len=Math.max(size.x,size.z), wid=Math.min(size.x,size.z);
        if(len>12&&len>bestLen&&wid<10&&center.y<10){
          bestLen=len; bridge={center:center,size:size};
        }
      }catch(e){}
    });
  }catch(e){}
  if(!bridge) return false;
  done=true;

  // Find terrain: largest vertex-count mesh
  var terrain=null, maxN=0;
  try{
    W.scene.traverse(function(obj){
      if(obj.isMesh&&obj.geometry&&obj.geometry.attributes&&obj.geometry.attributes.position){
        var n=obj.geometry.attributes.position.count;
        if(n>maxN&&n>20000){ maxN=n; terrain=obj; }
      }
    });
  }catch(e){}
  if(!terrain||!terrain.geometry) return true;

  // Lower terrain along bridge span with smooth falloff.
  // Target: just below water (y=-0.4), smooth edges to avoid cliffs/holes.
  try{
    var pos=terrain.geometry.attributes.position;
    var bx=bridge.center.x, bz=bridge.center.z;
    var alongX = bridge.size.x >= bridge.size.z;
    var halfLen=Math.max(bridge.size.x,bridge.size.z)/2+6;
    var halfWid=Math.min(bridge.size.x,bridge.size.z)/2+8;
    var sx=terrain.scale.x||1, sz=terrain.scale.z||1;
    var ox=terrain.position.x||0, oz=terrain.position.z||0;
    for(var i=0;i<pos.count;i++){
      var wx=ox+pos.getX(i)*sx, wz=oz+pos.getZ(i)*sz;
      var dx=Math.abs(wx-bx), dz=Math.abs(wz-bz);
      var inX = dx<halfLen, inZ = dz<halfWid;
      var inSpan = alongX ? (inX&&inZ) : (inZ&&inX);
      if(!inSpan) continue;
      // Smooth falloff: 1 at center, 0 at edges
      var fx = alongX ? 1-(dx/halfLen) : 1-(dz/halfLen);
      var fz = alongX ? 1-(dz/halfWid) : 1-(dx/halfWid);
      var f=Math.max(0,Math.min(1,fx))*Math.max(0,Math.min(1,fz));
      f=f*f*(3-2*f); // smoothstep
      var y=pos.getY(i);
      if(y>-0.4){
        pos.setY(i, y + (-0.4-y)*f);
      }
    }
    pos.needsUpdate=true;
    terrain.geometry.computeVertexNormals();
  }catch(e){}
  return true;
}
var n=0;
var t=setInterval(function(){
  n++;
  try{ if(fixBridge()||n>50) clearInterval(t); }catch(e){}
},2000);
}();
