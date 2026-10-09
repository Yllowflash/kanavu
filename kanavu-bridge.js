/* Bridge sand fix: water plane under bridge area */
!function(){
"use strict";
var done=false;
function fix(){
  var W=null;
  try{ W=window.__kvWorld; }catch(e){}
  if(!W||!W.scene||!window.THREE) return false;
  if(done) return true;
  done=true;
  // Water plane under bridge (near 0,16 based on observed location)
  // Covers the pale sand/land with water
  var geo=new window.THREE.PlaneGeometry(60, 40);
  geo.rotateX(-Math.PI/2);
  var mat=new window.THREE.MeshBasicMaterial({color:0x2a6a9a, transparent:true, opacity:0.95});
  var water=new window.THREE.Mesh(geo, mat);
  water.position.set(0, 0.25, 16);
  W.scene.add(water);
  return true;
}
var n=0;
var t=setInterval(function(){
  n++;
  try{ if(fix()||n>30) clearInterval(t); }catch(e){}
},2000);
}();
