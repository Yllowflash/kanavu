/* Kanavu populate: fills empty island areas with new GLB assets.
   Scatters trees, rocks, lamps sparsely for a premium look. */
!function(){
"use strict";
var BASE='https://ersejxowxutsefalyjaf.supabase.co/storage/v1/object/public/game-assets/v2/';
function showMsg(t){
  try{
    var d=document.getElementById('kv-pop');
    if(!d){
      d=document.createElement('div');
      d.id='kv-pop';
      d.style.cssText='position:fixed;top:72px;left:8px;z-index:99999;background:rgba(0,0,0,0.8);color:#ff0;font:12px monospace;padding:8px;border-radius:6px;pointer-events:none;';
      (document.body||document.documentElement).appendChild(d);
    }
    d.textContent=t;
  }catch(e){}
}
// Seeded random for consistent placement
function srand(seed){
  var s=seed;
  return function(){ s=(s*16807)%2147483647; return (s-1)/2147483646; };
}
var done=false;
function populate(){
  var W=null;
  try{ W=window.__kvWorld; }catch(e){}
  if(!W||!W.scene||!window.THREE||!window.THREE.GLTFLoader||!W.groundY) return false;
  if(done) return true;
  done=true;
  
  showMsg('populate: scattering assets...');
  var loader=new window.THREE.GLTFLoader();
  var rand=srand(12345);
  var placed=0;
  var target=60; // total assets to place
  
  // Define asset types with weights
  var assets=[
    {glb:'nature/pine-tall.glb', w:3, s:[1.0,1.6]},
    {glb:'nature/broadleaf.glb', w:3, s:[0.9,1.4]},
    {glb:'nature/rock.glb', w:1, s:[0.5,1.2]},
  ];
  // Note: rock.glb may not exist, will fail gracefully
  
  function pickAsset(){
    var total=0;
    for(var i=0;i<assets.length;i++) total+=assets[i].w;
    var r=rand()*total;
    for(var j=0;j<assets.length;j++){
      r-=assets[j].w;
      if(r<=0) return assets[j];
    }
    return assets[0];
  }
  
  // Scatter in a ring around center, avoiding village (center)
  for(var i=0;i<target;i++){
    (function(idx){
      var angle=rand()*Math.PI*2;
      var dist=25+rand()*80; // 25-105 units from center
      var x=Math.cos(angle)*dist;
      var z=Math.sin(angle)*dist;
      
      // Skip if too close to feature buildings
      var skip=false;
      var avoid=[[-22,-8],[-45,30],[-25,-115],[18,-20],[-15,-3],[12,10]];
      for(var a=0;a<avoid.length;a++){
        var dx=x-avoid[a][0], dz=z-avoid[a][1];
        if(Math.sqrt(dx*dx+dz*dz)<8){ skip=true; break; }
      }
      if(skip) return;
      
      var asset=pickAsset();
      loader.load(BASE+asset.glb,function(gltf){
        try{
          var m=gltf.scene||gltf.scenes[0];
          var y=0;
          try{ y=W.groundY(x,z); }catch(e){ return; }
          // Skip if in water (y too low)
          if(y<-0.5) return;
          m.position.set(x,y,z);
          m.rotation.y=rand()*Math.PI*2;
          var sc=asset.s[0]+rand()*(asset.s[1]-asset.s[0]);
          m.scale.setScalar(sc);
          m.traverse(function(c){ if(c.isMesh){ c.castShadow=true; } });
          W.scene.add(m);
          placed++;
          showMsg('populate: '+placed+'/'+target+' assets');
          if(placed>=target) showMsg('populate: DONE');
        }catch(e){}
      },undefined,function(){});
    })(i);
  }
  return true;
}
showMsg('populate: loaded');
var n=0;
var t=setInterval(function(){
  n++;
  try{ if(populate()||n>60) clearInterval(t); }catch(e){}
},3000);
}();
