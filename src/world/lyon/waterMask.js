// Approximate the two visible Lyon river corridors in game coordinates. The
// control points follow the river crossings in the bundled OSM road data.
export const RIVERS=[
  {width:66,points:[[-620,1180],[-605,640],[-595,260],[-530,-120],[-300,-600],[-95,-1160]]},
  {width:53,points:[[210,1180],[105,610],[260,190],[435,-185],[715,-720],[850,-1160]]}
];

export function segmentDistance(x,z,ax,az,bx,bz){
  const dx=bx-ax,dz=bz-az;
  const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(x-ax-t*dx,z-az-t*dz);
}

export function isWaterImpact(x,z,y,isBridge=()=>false){
  if(y>5.5||isBridge(x,z))return false;
  for(const river of RIVERS){
    for(let i=1;i<river.points.length;i++){
      const [ax,az]=river.points[i-1],[bx,bz]=river.points[i];
      if(segmentDistance(x,z,ax,az,bx,bz)<river.width)return true;
    }
  }
  return false;
}
