/* Kanavu — Fresh World v1
   Clean rebuild: 260 island, bridge over water, no legacy.
*/
!function(){
"use strict";

// ---------- Setup ----------
var scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x1a1a3e, 80, 220);

var camera = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 0.1, 500);

var renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = false; // keep it light
document.getElementById('scene').appendChild(renderer.domElement);

addEventListener('resize', function(){
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- Lights ----------
var hemi = new THREE.HemisphereLight(0xbfd4ff, 0x3a5f4a, 0.9);
scene.add(hemi);
var sun = new THREE.DirectionalLight(0xfff2d9, 1.1);
sun.position.set(60, 80, 30);
scene.add(sun);
// Purple dusk tint
var dusk = new THREE.DirectionalLight(0xb9a7ff, 0.35);
dusk.position.set(-40, 30, -60);
scene.add(dusk);

// ---------- Sky ----------
(function(){
  var geo = new THREE.SphereGeometry(400, 16, 12);
  var mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite:false, fog:false,
    uniforms:{},
    vertexShader:'varying vec3 vP; void main(){vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:[
      'varying vec3 vP;',
      'void main(){',
      ' float h = normalize(vP).y;',
      ' vec3 top = vec3(0.12,0.10,0.28);',
      ' vec3 mid = vec3(0.45,0.28,0.45);',
      ' vec3 bot = vec3(0.95,0.55,0.55);',
      ' vec3 c = h>0.25 ? mix(mid,top,smoothstep(0.25,1.0,h)) : mix(bot,mid,smoothstep(-0.1,0.25,h));',
      ' gl_FragColor = vec4(c,1.0);',
      '}'
    ].join('\n')
  });
  scene.add(new THREE.Mesh(geo, mat));
  // Moon
  var moon = new THREE.Mesh(
    new THREE.SphereGeometry(12, 16, 16),
    new THREE.MeshBasicMaterial({color:0xfffbe8, fog:false})
  );
  moon.position.set(-120, 140, -200);
  scene.add(moon);
  // Stars
  var n=400, pos=new Float32Array(n*3);
  for(var i=0;i<n;i++){
    var th=Math.random()*Math.PI*2, ph=Math.random()*Math.PI*0.45;
    pos[i*3]=380*Math.cos(th)*Math.cos(ph);
    pos[i*3+1]=380*Math.sin(ph)+20;
    pos[i*3+2]=380*Math.sin(th)*Math.cos(ph);
  }
  var sg=new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos,3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({color:0xffffff,size:1.6,fog:false,transparent:true,opacity:0.8})));
})();

// ---------- Terrain ----------
var ISLAND = 260, SEG = 180;

function terrainHeight(x, z){
  var d = Math.sqrt(x*x + z*z);
  // Base island: raised center, falling to water at edge
  var h = 6 * Math.max(0, 1 - Math.pow(d/120, 2));
  // Hills
  h += 3.5 * Math.max(0, 1 - Math.pow(Math.hypot(x+45, z-40)/35, 2));
  h += 2.5 * Math.max(0, 1 - Math.pow(Math.hypot(x-50, z+45)/30, 2));
  // Gentle noise
  h += Math.sin(x*0.08)*Math.cos(z*0.07)*0.8 + Math.sin(x*0.21+z*0.13)*0.35;
  // Water channel for bridge along z-axis at x=0: carve to -2
  var chanW = 10; // half-width
  if(Math.abs(x) < chanW + 8){
    var f = 1 - Math.min(1, Math.abs(x)/ (chanW+8));
    f = f*f*(3-2*f);
    h = h*(1-f) + (-2.2)*f;
  }
  // Ocean floor beyond island
  if(d > 125){
    h = -3 - (d-125)*0.1;
  }
  return h;
}

var terrain;
(function(){
  var geo = new THREE.PlaneGeometry(ISLAND, ISLAND, SEG, SEG);
  geo.rotateX(-Math.PI/2);
  var pos = geo.attributes.position;
  var colors = new Float32Array(pos.count*3);
  var cGrass = new THREE.Color(0x6faf6f);
  var cGrass2 = new THREE.Color(0x7fbf7f);
  var cSand = new THREE.Color(0xe8d5a3);
  var cRock = new THREE.Color(0x8a8a8a);
  var cWater = new THREE.Color(0x2a6a9a);
  var tmp = new THREE.Color();
  for(var i=0;i<pos.count;i++){
    var x = pos.getX(i), z = pos.getZ(i);
    var h = terrainHeight(x, z);
    pos.setY(i, h);
    // Color by height
    if(h < 0.15){
      tmp.copy(cWater); // underwater sand -> water tint (won't be visible, water plane covers)
    } else if(h < 0.9){
      tmp.copy(cSand);
    } else if(h > 5){
      tmp.copy(cRock).lerp(cGrass, 0.3);
    } else {
      tmp.copy(cGrass).lerp(cGrass2, Math.random()*0.5);
    }
    // Slight variation
    var v = 0.94 + Math.random()*0.12;
    colors[i*3]=tmp.r*v; colors[i*3+1]=tmp.g*v; colors[i*3+2]=tmp.b*v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors,3));
  geo.computeVertexNormals();
  var mat = new THREE.MeshLambertMaterial({vertexColors:true});
  terrain = new THREE.Mesh(geo, mat);
  scene.add(terrain);
})();

function groundY(x, z){
  return terrainHeight(x, z);
}

// ---------- Water ----------
var water;
(function(){
  var geo = new THREE.PlaneGeometry(600, 600, 1, 1);
  geo.rotateX(-Math.PI/2);
  var mat = new THREE.MeshLambertMaterial({
    color:0x2a6a9a, transparent:true, opacity:0.88
  });
  water = new THREE.Mesh(geo, mat);
  water.position.y = 0.1;
  scene.add(water);
})();

// ---------- Bridge (over the water channel at x=0) ----------
// Channel runs along z-axis. Bridge spans z from -22 to +22.
(function(){
  var g = new THREE.Group();
  var wood = new THREE.MeshLambertMaterial({color:0x8a5a2a});
  var woodDark = new THREE.MeshLambertMaterial({color:0x6a421e});
  var ropeMat = new THREE.MeshLambertMaterial({color:0xd9c39a});
  var teal = new THREE.MeshLambertMaterial({color:0x2a8a8a});

  var z0=-22, z1=22, deckY=2.2;
  // Planks
  for(var z=z0; z<=z1; z+=1.1){
    var p = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 1.0), wood);
    p.position.set(0, deckY + Math.sin((z-z0)/(z1-z0)*Math.PI)*-0.25, z);
    p.rotation.x = (Math.random()-0.5)*0.03;
    g.add(p);
  }
  // Ropes (sides)
  [-1.7, 1.7].forEach(function(x){
    var rope = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,z1-z0,6), ropeMat);
    rope.rotation.x = Math.PI/2;
    rope.position.set(x, deckY+1.1, (z0+z1)/2);
    g.add(rope);
    // Vertical ties
    for(var z=z0; z<=z1; z+=2.2){
      var tie = new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,1.1,5), ropeMat);
      tie.position.set(x, deckY+0.55, z);
      g.add(tie);
    }
  });
  // Towers at ends
  [z0, z1].forEach(function(z){
    [-1.9, 1.9].forEach(function(x){
      var t = new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.36,5.5,8), teal);
      t.position.set(x, deckY+1.2, z);
      g.add(t);
    });
    var beam = new THREE.Mesh(new THREE.BoxGeometry(4.4,0.35,0.35), teal);
    beam.position.set(0, deckY+3.8, z);
    g.add(beam);
  });
  scene.add(g);
})();

// ---------- Trees ----------
function makeTree(x, z, s){
  s = s||1;
  var g = new THREE.Group();
  var trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22*s, 0.32*s, 1.8*s, 7),
    new THREE.MeshLambertMaterial({color:0x6a4a2a})
  );
  trunk.position.y = 0.9*s;
  g.add(trunk);
  var leafC = [0x4a8f4a, 0x5aa05a, 0x3f7f3f][Math.floor(Math.random()*3)];
  for(var i=0;i<3;i++){
    var cone = new THREE.Mesh(
      new THREE.ConeGeometry((1.5-i*0.35)*s, 1.4*s, 8),
      new THREE.MeshLambertMaterial({color:leafC})
    );
    cone.position.y = (1.8 + i*0.9)*s;
    g.add(cone);
  }
  g.position.set(x, groundY(x,z), z);
  g.rotation.y = Math.random()*Math.PI*2;
  scene.add(g);
}
// Scatter trees (avoid channel and center)
for(var ti=0; ti<70; ti++){
  var tx=(Math.random()-0.5)*210, tz=(Math.random()-0.5)*210;
  if(Math.abs(tx)<14) continue; // keep channel clear
  if(Math.hypot(tx,tz)>115) continue;
  if(groundY(tx,tz)<1) continue;
  makeTree(tx, tz, 0.8+Math.random()*0.7);
}

// ---------- Houses ----------
function makeHouse(x, z, color){
  var g = new THREE.Group();
  var gy = groundY(x, z);
  var base = new THREE.Mesh(
    new THREE.BoxGeometry(5, 3.2, 4.2),
    new THREE.MeshLambertMaterial({color:color})
  );
  base.position.y = 1.6;
  g.add(base);
  var roof = new THREE.Mesh(
    new THREE.ConeGeometry(3.8, 2.2, 4),
    new THREE.MeshLambertMaterial({color:0x8a4a3a})
  );
  roof.position.y = 4.3;
  roof.rotation.y = Math.PI/4;
  g.add(roof);
  var door = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 2),
    new THREE.MeshLambertMaterial({color:0x4a2f1a})
  );
  door.position.set(0, 1.0, 2.12);
  g.add(door);
  // Windows
  [-1.4, 1.4].forEach(function(wx){
    var win = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.9),
      new THREE.MeshBasicMaterial({color:0xfff2b0})
    );
    win.position.set(wx, 2.0, 2.12);
    g.add(win);
  });
  g.position.set(x, gy, z);
  g.rotation.y = Math.random()*Math.PI*2;
  scene.add(g);
}
makeHouse(-18, -12, 0xf0e0c0);
makeHouse(16, 8, 0xd0e8f0);
makeHouse(-10, 30, 0xf0d0d0);

// ---------- Character ----------
var player = new THREE.Group();
(function(){
  var skin = new THREE.MeshLambertMaterial({color:0x8a5a3a});
  var shirt = new THREE.MeshLambertMaterial({color:0x2a6a9a});
  var pants = new THREE.MeshLambertMaterial({color:0x2a3a5a});
  var body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.9, 4, 10), shirt);
  body.position.y = 1.15;
  player.add(body);
  var head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), skin);
  head.position.y = 2.15;
  player.add(head);
  // Hair
  var hair = new THREE.Mesh(new THREE.SphereGeometry(0.44, 14, 12, 0, Math.PI*2, 0, 1.4), 
    new THREE.MeshLambertMaterial({color:0x1a1a1a}));
  hair.position.y = 2.22;
  player.add(hair);
  // Legs
  [-0.2, 0.2].forEach(function(x){
    var leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.7, 4, 8), pants);
    leg.position.set(x, 0.45, 0);
    leg.name = 'leg'+(x<0?'L':'R');
    player.add(leg);
  });
  // Arms
  [-0.55, 0.55].forEach(function(x){
    var arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.6, 4, 8), shirt);
    arm.position.set(x, 1.25, 0);
    arm.name = 'arm'+(x<0?'L':'R');
    player.add(arm);
  });
  player.position.set(0, groundY(0, 30), 30);
  scene.add(player);
})();

// ---------- Controls ----------
var keys = {};
addEventListener('keydown', function(e){ keys[e.code]=true; });
addEventListener('keyup', function(e){ keys[e.code]=false; });
// Touch joystick
var joy = {x:0, y:0, active:false};
var joyBase=null, joyKnob=null;
(function(){
  joyBase = document.createElement('div');
  joyBase.style.cssText = 'position:fixed;left:24px;bottom:24px;width:110px;height:110px;border-radius:50%;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);z-index:20;touch-action:none';
  joyKnob = document.createElement('div');
  joyKnob.style.cssText = 'position:absolute;left:35px;top:35px;width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.35)';
  joyBase.appendChild(joyKnob);
  document.body.appendChild(joyBase);
  var sid=null, cx=0, cy=0;
  joyBase.addEventListener('touchstart', function(e){
    var t=e.changedTouches[0]; sid=t.identifier;
    var r=joyBase.getBoundingClientRect(); cx=r.left+55; cy=r.top+55;
    joy.active=true; e.preventDefault();
  }, {passive:false});
  addEventListener('touchmove', function(e){
    for(var i=0;i<e.changedTouches.length;i++){
      var t=e.changedTouches[i];
      if(t.identifier===sid){
        var dx=t.clientX-cx, dy=t.clientY-cy;
        var m=Math.hypot(dx,dy), max=40;
        if(m>max){ dx*=max/m; dy*=max/m; }
        joy.x=dx/max; joy.y=dy/max;
        joyKnob.style.left=(35+dx)+'px'; joyKnob.style.top=(35+dy)+'px';
      }
    }
  }, {passive:true});
  addEventListener('touchend', function(e){
    for(var i=0;i<e.changedTouches.length;i++){
      if(e.changedTouches[i].identifier===sid){
        sid=null; joy.x=0; joy.y=0; joy.active=false;
        joyKnob.style.left='35px'; joyKnob.style.top='35px';
      }
    }
  });
})();
// Camera orbit (drag)
var camYaw=0, camPitch=0.42;
(function(){
  var dragging=false, lx=0, ly=0;
  renderer.domElement.addEventListener('pointerdown', function(e){ dragging=true; lx=e.clientX; ly=e.clientY; });
  addEventListener('pointermove', function(e){
    if(!dragging) return;
    camYaw -= (e.clientX-lx)*0.005;
    camPitch = Math.max(0.12, Math.min(1.2, camPitch + (e.clientY-ly)*0.004));
    lx=e.clientX; ly=e.clientY;
  });
  addEventListener('pointerup', function(){ dragging=false; });
})();

// ---------- Game loop ----------
var clock = new THREE.Clock();
var walkT = 0;
function animate(){
  requestAnimationFrame(animate);
  var dt = Math.min(clock.getDelta(), 0.05);

  // Movement
  var mx=0, mz=0;
  if(keys['KeyW']||keys['ArrowUp']) mz-=1;
  if(keys['KeyS']||keys['ArrowDown']) mz+=1;
  if(keys['KeyA']||keys['ArrowLeft']) mx-=1;
  if(keys['KeyD']||keys['ArrowRight']) mx+=1;
  if(joy.active){ mx+=joy.x; mz+=joy.y; }
  var ml=Math.hypot(mx,mz);
  if(ml>0.01){
    mx/=Math.max(1,ml); mz/=Math.max(1,ml);
    // Camera-relative
    var sin=Math.sin(camYaw), cos=Math.cos(camYaw);
    var wx = mx*cos - mz*sin, wz = mx*sin + mz*cos;
    var speed = 7;
    var nx = player.position.x + wx*speed*dt;
    var nz = player.position.z + wz*speed*dt;
    // Stay on island
    if(Math.hypot(nx,nz) < 122){
      player.position.x = nx; player.position.z = nz;
    }
    player.position.y = groundY(player.position.x, player.position.z);
    player.rotation.y = Math.atan2(wx, wz);
    // Walk anim
    walkT += dt*10;
    var sw = Math.sin(walkT)*0.5;
    player.getObjectByName('legL').rotation.x = sw;
    player.getObjectByName('legR').rotation.x = -sw;
    player.getObjectByName('armL').rotation.x = -sw*0.7;
    player.getObjectByName('armR').rotation.x = sw*0.7;
  } else {
    player.getObjectByName('legL').rotation.x *= 0.9;
    player.getObjectByName('legR').rotation.x *= 0.9;
    player.getObjectByName('armL').rotation.x *= 0.9;
    player.getObjectByName('armR').rotation.x *= 0.9;
  }

  // Camera follow
  var cd = 11, ch = 4.2;
  var cx = player.position.x - Math.sin(camYaw)*Math.cos(camPitch)*cd;
  var cz = player.position.z - Math.cos(camYaw)*Math.cos(camPitch)*cd;
  var cy = player.position.y + Math.sin(camPitch)*cd + ch*0.4;
  camera.position.lerp(new THREE.Vector3(cx, cy, cz), 1-Math.pow(0.001, dt));
  camera.lookAt(player.position.x, player.position.y+1.6, player.position.z);

  // Water shimmer
  water.position.y = 0.1 + Math.sin(performance.now()*0.001)*0.04;

  renderer.render(scene, camera);
}
animate();

}();
