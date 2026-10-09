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
    for(var i=0;i<25;i++){
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
  
  // 5. Bridge water: find bridge by GLB and cover land with water plane
  try{
    var bridgePos=null;
    // Find the rope bridge by looking for its distinctive shape
    // or by checking loaded GLB URLs
    W.scene.traverse(function(obj){
      if(bridgePos) return;
      // Check if this is a loaded GLB (has userData from loader)
      if(obj.isGroup&&obj.children.length>5){
        try{
          var box=new window.THREE.Box3().setFromObject(obj);
          var size=new window.THREE.Vector3(); box.getSize(size);
          var center=new window.THREE.Vector3(); box.getCenter(center);
          // Bridge: long (>15) narrow (<8) low (<6)
          if((size.x>15&&size.z<8||size.z>15&&size.x<8)&&size.y<6){
            // Check if near center of map (bridges connect islands)
            if(Math.abs(center.x)<100&&Math.abs(center.z)<100){
              bridgePos={x:center.x, z:center.z, sx:size.x, sz:size.z};
            }
          }
        }catch(e){}
      }
    });
    if(bridgePos){
      // Place a water plane over the bridge area
      var wgeo=new window.THREE.PlaneGeometry(Math.max(bridgePos.sx,20)+20, Math.max(bridgePos.sz,20)+20);
      wgeo.rotateX(-Math.PI/2);
      var wmat=new window.THREE.MeshBasicMaterial({color:0x2a6a9a, transparent:true, opacity:0.95});
      var water=new window.THREE.Mesh(wgeo, wmat);
      water.position.set(bridgePos.x, 0.15, bridgePos.z);
      W.scene.add(water);
    }
  }catch(e){}
  
  // 6. Restore original island visual size (260 instead of 380)
  // Paint outer ring as water, clamp player to radius 125
  try{
    // Visual: make terrain beyond 130 look like water
    W.scene.traverse(function(obj){
      if(obj.isMesh&&obj.geometry&&obj.geometry.attributes&&obj.geometry.attributes.position&&obj.geometry.attributes.color){
        var pos=obj.geometry.attributes.position;
        var col=obj.geometry.attributes.color;
        if(pos.count<500) return;
        var modified=false;
        var water=new window.THREE.Color(0x2a6a9a);
        for(var i=0;i<pos.count;i++){
          var vx=pos.getX(i), vz=pos.getZ(i);
          var wx=obj.position.x+vx, wz=obj.position.z+vz;
          var d=Math.sqrt(wx*wx+wz*wz);
          if(d>130){
            col.setXYZ(i, water.r, water.g, water.b);
            modified=true;
          }
        }
        if(modified){ col.needsUpdate=true; }
      }
    });
    // Physical: clamp player
    if(W.player){
      setInterval(function(){
        try{
          var p=W.player.position;
          var d=Math.sqrt(p.x*p.x+p.z*p.z);
          if(d>125){
            var s=125/d;
            p.x*=s; p.z*=s;
          }
        }catch(e){}
      },100);
    }
  }catch(e){}
  
  return true;
}

var n=0;
var t=setInterval(function(){
  n++;
  try{ 
    if(run()&&n>30) clearInterval(t); 
    // Show coords - try multiple ways to find player
    try{
      var W=window.__kvWorld;
      var px=null, pz=null;
      if(W){
        if(W.player&&W.player.position){ px=W.player.position.x; pz=W.player.position.z; }
        else if(W.camera&&W.camera.position){ px=W.camera.position.x; pz=W.camera.position.z; }
      }
      if(px!==null){
        var d=document.getElementById('kv-coords');
        if(!d){
          d=document.createElement('div');
          d.id='kv-coords';
          d.style.cssText='position:fixed;bottom:50px;left:50%;transform:translateX(-50%);z-index:999999;background:#ff0;color:#000;font:20px monospace;padding:12px 20px;border-radius:8px;border:3px solid #f00;';
          document.body.appendChild(d);
        }
        d.textContent='X:'+Math.round(px)+' Z:'+Math.round(pz);
      }
    }catch(e){}
  }catch(e){}
  if(n>120) clearInterval(t);
},2000);
}();
