export function enemyHasShot(enemyPosition,enemyForward,playerPosition){
  const dx=playerPosition.x-enemyPosition.x;
  const dy=playerPosition.y-enemyPosition.y;
  const dz=playerPosition.z-enemyPosition.z;
  const distance=Math.hypot(dx,dy,dz);
  if(distance<150||distance>1200)return false;
  return (dx*enemyForward.x+dy*enemyForward.y+dz*enemyForward.z)/distance>Math.cos(.3);
}

export function segmentHitsSphere(start,end,center,radius){
  const vx=end.x-start.x,vy=end.y-start.y,vz=end.z-start.z;
  const wx=center.x-start.x,wy=center.y-start.y,wz=center.z-start.z;
  const lengthSquared=vx*vx+vy*vy+vz*vz;
  const t=lengthSquared?Math.max(0,Math.min(1,(wx*vx+wy*vy+wz*vz)/lengthSquared)):0;
  return Math.hypot(start.x+vx*t-center.x,start.y+vy*t-center.y,start.z+vz*t-center.z)<=radius;
}
