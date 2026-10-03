// Cars are instanced render meshes, so weapon checks use their live road
// positions instead of asking Three.js to raycast every wheel and body panel.
export function vehicleRayDistance(origin,direction,vehicle,maxDistance){
  const center=vehicle.position;
  const dx=center.x-origin.x,dy=center.y+vehicle.height*.55-origin.y,dz=center.z-origin.z;
  const along=dx*direction.x+dy*direction.y+dz*direction.z;
  const radius=Math.max(2.3,vehicle.length*.64);
  if(along < -radius || along > maxDistance+radius)return null;
  const lateralSquared=dx*dx+dy*dy+dz*dz-along*along;
  if(lateralSquared>radius*radius)return null;
  const offset=Math.sqrt(Math.max(0,radius*radius-lateralSquared));
  const entry=along-offset;
  if(along+offset<0||entry>maxDistance)return null;
  return Math.max(0,entry);
}

export function nearestVehicleHit(vehicles,origin,direction,maxDistance){
  let best=null,bestDistance=maxDistance;
  for(const vehicle of vehicles){
    if(!vehicle.alive||!vehicle.visible)continue;
    const distance=vehicleRayDistance(origin,direction,vehicle,bestDistance);
    if(distance!==null&&distance<bestDistance){best=vehicle;bestDistance=distance;}
  }
  return best?{vehicle:best,distance:bestDistance}:null;
}

export function nearestVehicleLock(vehicles,origin,direction,maxDistance,maxAngle){
  let best=null,bestScore=Infinity;
  const minDot=Math.cos(maxAngle);
  for(const vehicle of vehicles){
    if(!vehicle.alive||!vehicle.visible)continue;
    const dx=vehicle.position.x-origin.x,dy=vehicle.position.y+vehicle.height*.5-origin.y,dz=vehicle.position.z-origin.z;
    const distance=Math.hypot(dx,dy,dz);
    if(distance<12||distance>maxDistance)continue;
    const dot=(dx*direction.x+dy*direction.y+dz*direction.z)/distance;
    if(dot<minDot)continue;
    const score=(1-dot)*6000+distance;
    if(score<bestScore){best=vehicle;bestScore=score;}
  }
  return best;
}
