/* Lions Gate bridge for main game: hides old rope bridge, adds suspension bridge */
!function(){
"use strict";
var done=false;
function init(){
  var W=null;
  try{ W=window.__kvWorld; }catch(e){}
  if(!W||!W.scene||!window.THREE) return false;
  if(done) return true;
  done=true;

  try{
    // Hide old bridge: find by teal towers (CylinderGeometry, teal color)
    var tealColor = 0x2a8a8a;
    W.scene.traverse(function(obj){
      if(obj.isMesh && obj.geometry && obj.geometry.type==='CylinderGeometry'){
        if(obj.material && obj.material.color && Math.abs(obj.material.color.getHex()-tealColor)<1000){
          // Found a teal tower, hide its parent group
          var p=obj.parent;
          // Walk up to find the bridge group (not the whole scene)
          while(p && p!==W.scene && p.parent!==W.scene){ p=p.parent; }
          if(p && p!==W.scene){ p.visible=false; }
        }
      }
    });
  }catch(e){}

  try{
    // Add Lions Gate bridge
    var g = new THREE.Group();
    var deckMat = new THREE.MeshLambertMaterial({color:0x3a3a4a});
    var teal = new THREE.MeshLambertMaterial({color:0x2a9a8a});
    var cableMat = new THREE.MeshLambertMaterial({color:0xbbbbbb});
    var lightMat = new THREE.MeshBasicMaterial({color:0xfff2b0});
    var z0=26, z1=62, deckY=3.0, span=z1-z0, midZ=(z0+z1)/2;
    var deck = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.4, span), deckMat);
    deck.position.set(0, deckY, midZ); g.add(deck);
    var line = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, span), new THREE.MeshBasicMaterial({color:0xffd66e}));
    line.position.set(0, deckY+0.23, midZ); g.add(line);
    var towerZ = [z0+span*0.32, z0+span*0.68];
    var towerH = 14, towerTopY = deckY+towerH-1;
    towerZ.forEach(function(z){
      [-2.4, 2.4].forEach(function(x){
        var t = new THREE.Mesh(new THREE.BoxGeometry(0.7, towerH, 0.7), teal);
        t.position.set(x, deckY+towerH/2-1, z); g.add(t);
      });
      [deckY+4, deckY+9].forEach(function(y){
        var beam = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.5, 0.5), teal);
        beam.position.set(0, y, z); g.add(beam);
      });
      var glow = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8),
        new THREE.MeshBasicMaterial({color:0x4affd9}));
      glow.position.set(0, towerTopY+0.5, z); g.add(glow);
    });
    [-2.4, 2.4].forEach(function(x){
      var pts = [];
      for(var i=0;i<=40;i++){
        var z = z0-6 + (span+12)*i/40, y, f;
        if(z < towerZ[0]){ f=(z-(z0-6))/(towerZ[0]-(z0-6)); y = deckY+0.5 + (towerTopY-(deckY+0.5))*f; }
        else if(z <= towerZ[1]){ f=(z-towerZ[0])/(towerZ[1]-towerZ[0]); y = towerTopY - (towerTopY-(deckY+1.2))*4*f*(1-f); }
        else { f=(z-towerZ[1])/((z1+6)-towerZ[1]); y = towerTopY - (towerTopY-(deckY+0.5))*f; }
        pts.push(new THREE.Vector3(x, y, z));
      }
      var curve = new THREE.CatmullRomCurve3(pts);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.09, 6), cableMat));
      for(var li=0; li<pts.length; li+=4){
        var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), lightMat);
        bulb.position.copy(pts[li]); g.add(bulb);
      }
    });
    for(var z=towerZ[0]; z<=towerZ[1]; z+=2.5){
      var f2=(z-towerZ[0])/(towerZ[1]-towerZ[0]);
      var cy = towerTopY - (towerTopY-(deckY+1.2))*4*f2*(1-f2);
      [-2.4, 2.4].forEach(function(x){
        var h = cy - deckY;
        if(h>0.5){
          var s = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,h,5), cableMat);
          s.position.set(x, deckY+h/2, z); g.add(s);
        }
      });
    }
    W.scene.add(g);
  }catch(e){}
  return true;
}
var n=0;
var t=setInterval(function(){ n++; try{ if(init()||n>40) clearInterval(t); }catch(e){} }, 2500);
}();
