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

// 2. After game loads, find the REAL bridge and lower terrain under it
var done=false;
function fixBridge(){
  var W=null;
  try{ W=window.__kvWorld; }catch(e){}
  if(!W||!W.scene) return false;
  if(done) return true;

  // Find bridge: long narrow group (deck + ropes + towers)
  var bridge=null, bestLen=0;
  W.scene.traverse(function(obj){
    if(!obj.isGroup||obj.children.length<4) return;
    try{
      var box=new window.THREE.Box3().setFromObject(obj);
      var size=new window.THREE.Vector3(); box.getSize(size);
      var center=new window.THREE.Vector3(); box.getCenter(center);
      var len=Math.max(size.x, size.z);
      var wid=Math.min(size.x, size.z);
      // Bridge: long (>12), narrow (<10), near ground level
      if(len>12&&len>bestLen&&wid<10&&center.y<8){
        bestLen=len; bridge={center:center, size:size};
      }
    }catch(e){}
  });
  if(!bridge) return false; // try again next tick
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

  // Lower terrain along the bridge span
  var pos=terrain.geometry.attributes.position;
  var bx=bridge.center.x, bz=bridge.center.z;
  var blen=Math.max(bridge.size.x, bridge.size.z);
  var bwid=Math.min(bridge.size.x, bridge.size.z);
  // Bridge direction: along longer axis
  var alongX = bridge.size.x >= bridge.size.z;
  var halfLen=blen/2+8, halfWid=bwid/2+10;
  for(var i=0;i<pos.count;i++){
    var vx=pos.getX(i), vz=pos.getZ(i);
    var wx=terrain.position.x + vx*terrain.scale.x;
    var wz=terrain.position.z + vz*terrain.scale.z;
    var dx=Math.abs(wx-bx), dz=Math.abs(wz-bz);
    var inSpan = alongX ? (dx<halfLen&&dz<halfWid) : (dz<halfLen&&dx<halfWid);
    if(inSpan){
      var y=pos.getY(i);
      if(y>-0.5){ pos.setY(i, -1.2); }
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
