export function sampleCollisionHeight(field,heights,x,z){
  const ix=Math.round((x-field.x)/field.step);
  const iz=Math.round((z-field.z)/field.step);
  if(ix<0||iz<0||ix>=field.width||iz>=field.depth)return -100;
  const decimetres=heights[iz*field.width+ix];
  return decimetres===-32768?-100:decimetres/10;
}

export function firstHeightIntersection(sampleHeight,origin,direction,distance,clearance=0){
  const steps=Math.max(1,Math.ceil(distance/5));
  for(let i=0;i<=steps;i++){
    const along=distance*i/steps;
    const x=origin.x+direction.x*along,y=origin.y+direction.y*along,z=origin.z+direction.z*along;
    if(y<=sampleHeight(x,z)+clearance)return along;
  }
  return null;
}

export function resolveSurfaceContact(position,height,clearance=8){
  const minimum=height+clearance;
  if(position.y>=minimum)return false;
  position.y=minimum;
  return true;
}
