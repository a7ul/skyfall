import * as THREE from 'three';

const local=new THREE.Vector3();

// Return a small screen-space contact marker. The camera-space bearing remains
// meaningful for targets behind the player, where projection would flip.
export function enemyIndicatorPosition(camera,target,width,height){
  local.copy(target).applyMatrix4(camera.matrixWorldInverse);
  const halfHeight=Math.tan(THREE.MathUtils.degToRad(camera.fov)*.5);
  const front=local.z<-.5;
  const depth=Math.max(.5,Math.abs(local.z));
  const x=local.x/(depth*halfHeight*camera.aspect);
  const y=local.y/(depth*halfHeight);
  const visible=front&&Math.abs(x)<=1&&Math.abs(y)<=1;
  if(visible)return {x:(x+1)*width*.5,y:(1-y)*height*.5,visible:true,angle:0};

  let dx=x,dy=-y;
  if(Math.abs(dx)+Math.abs(dy)<.015){dx=0;dy=1;}
  const centerX=.5,centerY=.46,left=.07,right=.93,top=.13,bottom=.79;
  const horizontal=dx>0?(right-centerX)/dx:dx<0?(left-centerX)/dx:Infinity;
  const vertical=dy>0?(bottom-centerY)/dy:dy<0?(top-centerY)/dy:Infinity;
  const t=Math.min(horizontal,vertical);
  return {x:(centerX+dx*t)*width,y:(centerY+dy*t)*height,visible:false,angle:THREE.MathUtils.radToDeg(Math.atan2(dx,-dy))};
}
