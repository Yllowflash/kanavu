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

// Inject avatar switch into settings panel
function injectSettings(){
  try{
    // Watch for settings panel to appear
    var obs=new MutationObserver(function(muts){
      muts.forEach(function(m){
        m.addedNodes.forEach(function(node){
          if(node.nodeType!==1) return;
          // Look for settings panel (contains "Settings" text or gear icon)
          var txt=(node.textContent||'').toLowerCase();
          if(txt.indexOf('settings')!==-1 && !node.querySelector('#kv-avatar-setting')){
            // Found settings panel, add avatar section
            var div=document.createElement('div');
            div.id='kv-avatar-setting';
            div.style.cssText='margin:12px 0;padding:12px;border-top:1px solid rgba(255,255,255,.1);';
            var cur=getAvatarChoice();
            div.innerHTML='<div style="font-weight:bold;margin-bottom:8px;">Character</div>'+
              '<button onclick="KVSetAvatar(\'male\')" style="padding:8px 16px;margin-right:8px;border-radius:8px;border:'+(cur==='male'?'2px solid #ffd9ec':'1px solid rgba(255,255,255,.3)')+';background:'+(cur==='male'?'rgba(255,217,236,.2)':'transparent')+';color:#fff;cursor:pointer;">👨 Male</button>'+
              '<button onclick="KVSetAvatar(\'female\')" style="padding:8px 16px;border-radius:8px;border:'+(cur==='female'?'2px solid #ffd9ec':'1px solid rgba(255,255,255,.3)')+';background:'+(cur==='female'?'rgba(255,217,236,.2)':'transparent')+';color:#fff;cursor:pointer;">👩 Female</button>';
            node.appendChild(div);
          }
        });
      });
    });
    obs.observe(document.body, {childList:true, subtree:true});
  }catch(e){}
}
setTimeout(injectSettings, 3000);

var n=0;
var t=setInterval(function(){
  n++;
  try{ if(boot()||n>40) clearInterval(t); }catch(e){}
},2000);

}();
