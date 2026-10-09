/* Kanavu house fix v3: position-based. Hides old houses at known
   locations and places new GLB houses there. No geometry detection. */
!function(){
"use strict";
var BASE='https://ersejxowxutsefalyjaf.supabase.co/storage/v1/object/public/game-assets/v2/';
// Known old house positions (from game source)
var HOUSE_SPOTS=[
  {x:-15, z:-3, glb:'village/house-teal-1.glb'},
  {x:12, z:10, glb:'village/house-teal-2.glb'},
];
function showMsg(t){
  try{
    var d=document.getElementById('kv-hfix');
    if(!d){
      d=document.createElement('div');
      d.id='kv-hfix';
      d.style.cssText='position:fixed;top:8px;left:8px;z-index:99999;background:rgba(0,0,0,0.8);color:#0f0;font:12px monospace;padding:8px;border-radius:6px;pointer-events:none;';
      (document.body||document.documentElement).appendChild(d);
    }
    d.textContent=t;
  }catch(e){}
}
var done=false;
function fix(){
  var W=null;
  try{ W=window.__kvWorld; }catch(e){}
  if(!W||!W.scene||!window.THREE||!window.THREE.GLTFLoader||!W.groundY) return false;
  if(done) return true;
  done=true;
  
  showMsg('hfix: hiding old houses...');
  var loader=new window.THREE.GLTFLoader();
  
  // Hide any group within 3 units of a known house spot
  var hidden=0;
  W.scene.traverse(function(obj){
    if(!obj.isGroup) return;
    for(var i=0;i<HOUSE_SPOTS.length;i++){
      var s=HOUSE_SPOTS[i];
      var dx=obj.position.x-s.x, dz=obj.position.z-s.z;
      if(Math.sqrt(dx*dx+dz*dz)<3){
        obj.visible=false;
        hidden++;
        break;
      }
    }
  });
  showMsg('hfix: hid '+hidden+', placing new...');
  
  // Place new GLB houses
  var placed=0;
  HOUSE_SPOTS.forEach(function(s){
    loader.load(BASE+s.glb,function(gltf){
      try{
        var m=gltf.scene||gltf.scenes[0];
        var y=0; try{ y=W.groundY(s.x,s.z); }catch(e){}
        m.position.set(s.x,y,s.z);
        m.scale.setScalar(1.2);
        m.traverse(function(c){ if(c.isMesh) c.castShadow=true; });
        W.scene.add(m);
        placed++;
        showMsg('hfix: '+placed+'/'+HOUSE_SPOTS.length+' new houses');
      }catch(e){}
    },undefined,function(){});
  });
  return true;
}
showMsg('hfix: loaded');
var n=0;
var t=setInterval(function(){
  n++;
  try{ if(fix()||n>60) clearInterval(t); }catch(e){}
},2000);
}();
