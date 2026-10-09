/* Kanavu 30fps cap */
!function(){
"use strict";
var orig=window.requestAnimationFrame.bind(window);
var last=0;
window.requestAnimationFrame=function(cb){
  return orig(function(t){
    if(t-last>=33){
      last=t;
      cb(t);
    }else{
      orig(function(t2){ setTimeout(function(){ cb(t2); }, 33-(t2-last)); });
    }
  });
};
}();
