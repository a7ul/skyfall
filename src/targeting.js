export function chooseLockTarget(objectives,car,origin,forward){
  let best=null,bestScore=Infinity;
  for(const target of [...objectives,car].filter(Boolean)){
    if(!target.alive)continue;
    const dx=target.position.x-origin.x;
    const dy=target.position.y+(target.type==='car'?target.height*.5:0)-origin.y;
    const dz=target.position.z-origin.z;
    const distance=Math.hypot(dx,dy,dz);
    if(distance<1||distance>(target.type==='car'?1800:7500))continue;
    const dot=Math.max(-1,Math.min(1,(dx*forward.x+dy*forward.y+dz*forward.z)/distance));
    const angle=Math.acos(dot);
    if(angle>(target.type==='car'?.18:.55))continue;
    const score=angle*8500+distance;
    if(score<bestScore){best=target;bestScore=score;}
  }
  return best;
}
