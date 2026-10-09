/* Kanavu Premium: complete asset replacement in one clean pass.
   - Old houses → new GLB houses (position-based)
   - Old trees → new GLB trees (icosahedron detection)
   - Feature buildings: bookshop, theatre, memory cottage, shop
   - Populates empty areas with trees/rocks
   No debug UI. */
!function(){
"use strict";
var BASE='https://ersejxowxutsefalyjaf.supabase.co/storage/v1/object/public/game-assets/v2/';
var HOUSES=[
  {x:-15, z:-3, glb:'village/house-teal-1.glb'},
  {x:12, z:10, glb:'village/house-teal-2.glb'},
];
var PLACES=[
  {url:'buildings/bookshop.glb', x:-22, z:-8, s:1.3, ry:0.5},
  {url:'buildings/theatre.glb', x:-45, z:30, s:1.4, ry:-0.3},
  {url:'buildings/memory-cottage.glb', x:-25, z:-115, s:1.2, ry:0.2},
  {url:'buildings/shop.glb', x:18, z:-20, s:1.3, ry:-0.5},
];
var TREE_GLBS=['nature/pine-tall.glb','nature/broadleaf.glb'];
function srand(seed){ var s=seed; return function(){ s=(s*16807)%2147483647; return (s-1)/2147483646; }; }

var state={houses:false, trees:false, places:false, pop:false};
var replacedTrees=new WeakSet();

function isOldTree(g){
  if(!g) return false;
  var found=false;
  try{
    g.traverse(function(c){
      if(found) return;
      if(c.isMesh&&c.geometry){
        var t=c.geometry.type||'';
        if(t.indexOf('Icosahedron')>=0) found=true;
      }
    });
  }catch(e){}
  return found;
}

function run(){
  var W=null;
  try{ W=window.__kvWorld; }catch(e){}
  if(!W||!W.scene||!window.THREE||!window.THREE.GLTFLoader||!W.groundY) return false;
  var loader=new window.THREE.GLTFLoader();
  var rand=srand(12345);
  
  // 1. Houses (once)
  if(!state.houses){
    state.houses=true;
    W.scene.traverse(function(obj){
      if(!obj.isGroup) return;
      for(var i=0;i<HOUSES.length;i++){
        var s=HOUSES[i];
        var dx=obj.position.x-s.x, dz=obj.position.z-s.z;
        if(Math.sqrt(dx*dx+dz*dz)<3){ obj.visible=false; break; }
      }
    });
    HOUSES.forEach(function(s){
      loader.load(BASE+s.glb,function(gltf){
        try{
          var m=gltf.scene||gltf.scenes[0];
          var y=0; try{ y=W.groundY(s.x,s.z); }catch(e){}
          m.position.set(s.x,y,s.z); m.scale.setScalar(1.2);
          m.traverse(function(c){ if(c.isMesh) c.castShadow=true; });
          W.scene.add(m);
        }catch(e){}
      },undefined,function(){});
    });
  }
  
  // 2. Feature buildings (once)
  if(!state.places){
    state.places=true;
    PLACES.forEach(function(p){
      loader.load(BASE+p.url,function(gltf){
        try{
          var m=gltf.scene||gltf.scenes[0];
          var y=0; try{ y=W.groundY(p.x,p.z); }catch(e){}
          m.position.set(p.x,y,p.z); m.rotation.y=p.ry; m.scale.setScalar(p.s);
          m.traverse(function(c){ if(c.isMesh){ c.castShadow=true; c.receiveShadow=true; } });
          W.scene.add(m);
        }catch(e){}
      },undefined,function(){});
    });
  }
  
  // 3. Trees (continuous - they load late)
  var newTrees=[];
  W.scene.traverse(function(obj){
    if(!obj.isGroup||replacedTrees.has(obj)) return;
    if(isOldTree(obj)){ replacedTrees.add(obj); newTrees.push(obj); }
  });
  if(newTrees.length>0){
    if(!state.trees){ state.trees=true; }
    newTrees.forEach(function(old,idx){
      var glb=TREE_GLBS[idx%TREE_GLBS.length];
      loader.load(BASE+glb,function(gltf){
        try{
          var m=gltf.scene||gltf.scenes[0];
          m.position.copy(old.position);
          m.rotation.y=rand()*Math.PI*2;
          m.scale.setScalar(0.8+rand()*0.6);
          m.traverse(function(c){ if(c.isMesh) c.castShadow=true; });
          if(old.parent){ old.parent.add(m); old.parent.remove(old); }
        }catch(e){}
      },undefined,function(){});
    });
  }
  
  // 4. Populate empty areas (once)
  if(!state.pop){
    state.pop=true;
    var avoid=[[-22,-8],[-45,30],[-25,-115],[18,-20],[-15,-3],[12,10]];
    for(var i=0;i<50;i++){
      (function(){
        var angle=rand()*Math.PI*2;
        var dist=25+rand()*80;
        var x=Math.cos(angle)*dist, z=Math.sin(angle)*dist;
        for(var a=0;a<avoid.length;a++){
          var dx=x-avoid[a][0], dz=z-avoid[a][1];
          if(Math.sqrt(dx*dx+dz*dz)<8) return;
        }
        var glb=TREE_GLBS[Math.floor(rand()*TREE_GLBS.length)];
        loader.load(BASE+glb,function(gltf){
          try{
            var m=gltf.scene||gltf.scenes[0];
            var y=0; try{ y=W.groundY(x,z); }catch(e){ return; }
            if(y<-0.5) return;
            m.position.set(x,y,z);
            m.rotation.y=rand()*Math.PI*2;
            m.scale.setScalar(0.9+rand()*0.7);
            m.traverse(function(c){ if(c.isMesh) c.castShadow=true; });
            W.scene.add(m);
          }catch(e){}
        },undefined,function(){});
      })();
    }
  }
  
  // 5. Carve water under bridge (remove sand)
  // Find rope bridge and lower terrain beneath it
  try{
    var bridge=null;
    W.scene.traverse(function(obj){
      if(bridge) return;
      // Bridge is a Group with planks (Box) in a line
      if(obj.isGroup){
        var box=new window.THREE.Box3().setFromObject(obj);
        var size=new window.THREE.Vector3(); box.getSize(size);
        // Bridge is long and narrow: ~20+ long, ~3 wide
        if(size.x>15&&size.z<6&&size.y<5) bridge=obj;
        else if(size.z>15&&size.x<6&&size.y<5) bridge=obj;
      }
    });
    if(bridge){
      var bb=new window.THREE.Box3().setFromObject(bridge);
      // Lower terrain vertices under bridge to deep water
      W.scene.traverse(function(obj){
        if(obj.isMesh&&obj.geometry&&obj.geometry.attributes&&obj.geometry.attributes.position){
          var pos=obj.geometry.attributes.position;
          var modified=false;
          for(var i=0;i<pos.count;i++){
            var vx=pos.getX(i), vy=pos.getY(i), vz=pos.getZ(i);
            // Convert to world coords (assuming terrain at origin)
            var wx=obj.position.x+vx, wz=obj.position.z+vz;
            if(wx>bb.min.x-2&&wx<bb.max.x+2&&wz>bb.min.z-2&&wz<bb.max.z+2){
              if(vy>-0.5&&vy<1.0){
                pos.setY(i,-1.2);
                modified=true;
              }
            }
          }
          if(modified){ pos.needsUpdate=true; obj.geometry.computeVertexNormals(); }
        }
      });
    }
  }catch(e){}
  
  return true;
}

var n=0;
var t=setInterval(function(){
  n++;
  try{ if(run()&&n>30) clearInterval(t); }catch(e){}
  if(n>120) clearInterval(t);
},2000);
}();
