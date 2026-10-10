/* Kanavu — Quaternius Avatar Integration
   Replaces the blocky character with premium Quaternius animated characters.
   - Male: quaternius-human.glb (683KB)
   - Female: quaternius-woman.glb (1.5MB)
   - Choice stored in localStorage (kanavu_avatar)
   - Revertable: remove this module to restore original
*/
!function(){
"use strict";

var MALE_URL = 'https://static.poly.pizza/170235d2-cdeb-4cb2-a82f-4828585138fe.glb';
var FEMALE_URL = 'https://static.poly.pizza/ba7a1955-ea51-4cb9-a561-188bdef0a6c7.glb';

var done=false;
function boot(){
  var W=null;
  try{ W=window.__kvWorld; }catch(e){}
  if(!W||!W.scene||!window.THREE) return false;
  if(!window.THREE.GLTFLoader) return false;
  if(done) return true;
  done=true;
  setTimeout(function(){ init(W); }, 6000);
  return true;
}

function getAvatarChoice(){
  try{
    return localStorage.getItem('kanavu_avatar') || 'male';
  }catch(e){ return 'male'; }
}

function init(W){
  var T=window.THREE;
  var choice=getAvatarChoice();
  var url=choice==='female'?FEMALE_URL:MALE_URL;

  try{
    var loader=new T.GLTFLoader();
    loader.load(url, function(gltf){
      try{
        var model=gltf.scene;
        // Scale to match game character size (Quaternius is ~1.8 units tall)
        // Game character is roughly 1.5 units, scale down slightly
        model.scale.set(0.85, 0.85, 0.85);
        
        // Find the player group and attach
        var playerGroup=null;
        W.scene.traverse(function(obj){
          if(obj.userData && obj.userData.player) playerGroup=obj;
        });
        
        if(playerGroup){
          // Hide original meshes
          playerGroup.traverse(function(obj){
            if(obj.isMesh) obj.visible=false;
          });
          // Add new model as child (follows movement automatically)
          // Offset so feet are at ground (model origin might be at center)
          model.position.y=-0.1;
          playerGroup.add(model);
          
          // Play idle animation if available
          if(gltf.animations && gltf.animations.length>0){
            try{
              var mixer=new T.AnimationMixer(model);
              // Find idle or first animation
              var clip=gltf.animations[0];
              for(var i=0;i<gltf.animations.length;i++){
                var n=gltf.animations[i].name.toLowerCase();
                if(n.indexOf('idle')!==-1){ clip=gltf.animations[i]; break; }
              }
              var action=mixer.clipAction(clip);
              action.play();
              // Update mixer each frame
              var clock=new T.Clock();
              (function animate(){
                requestAnimationFrame(animate);
                try{
                  var dt=clock.getDelta();
                  mixer.update(dt);
                }catch(e){}
              })();
            }catch(e){}
          }
        }
      }catch(e){}
    }, undefined, function(err){
      // Failed to load, keep original character
    });
  }catch(e){}
}

// UI to switch avatar (add to settings or as a button)
// For now, expose a global function
window.KVSetAvatar=function(gender){
  try{
    localStorage.setItem('kanavu_avatar', gender);
    location.reload();
  }catch(e){}
};

var n=0;
var t=setInterval(function(){
  n++;
  try{ if(boot()||n>40) clearInterval(t); }catch(e){}
},2000);

}();
