/* Restore original island size: scales 380 terrain back to 260 */
!function(){
"use strict";
var done=false;
function fix(){
  var W=null;
  try{ W=window.__kvWorld; }catch(e){}
  if(!W||!W.scene||!window.THREE) return false;
  if(done) return true;
  done=true;
  // Find the large terrain plane (380x380) and scale to 260
  W.scene.traverse(function(obj){
    if(obj.isMesh&&obj.geometry&&obj.geometry.type==='PlaneGeometry'){
      var p=obj.geometry.parameters;
      if(p&&Math.abs(p.width-380)<1){
        obj.scale.set(260/380, 1, 260/380);
      }
    }
  });
  return true;
}
var n=0;
var t=setInterval(function(){
  n++;
  try{ if(fix()||n>30) clearInterval(t); }catch(e){}
},2000);
}();
