// Individual OSM footprints let damage follow one structure, even where
// neighboring buildings share an edge or one photomesh tile.
export function createBuildingIndex(records,cellSize=80){
  const buildings=records.map(([height,polygon],id)=>{
    const xs=polygon.map(p=>p[0]),zs=polygon.map(p=>p[1]);
    return {id,height,polygon,minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs),collapsed:false};
  });
  const cells=new Map();
  const key=(x,z)=>`${x},${z}`;
  for(const building of buildings){
    for(let x=Math.floor((building.minX-3)/cellSize);x<=Math.floor((building.maxX+3)/cellSize);x++){
      for(let z=Math.floor((building.minZ-3)/cellSize);z<=Math.floor((building.maxZ+3)/cellSize);z++){
        const address=key(x,z);
        if(!cells.has(address))cells.set(address,[]);
        cells.get(address).push(building);
      }
    }
  }
  function nearby(x,z){return cells.get(key(Math.floor(x/cellSize),Math.floor(z/cellSize)))||[];}
  return {buildings,nearby,find(x,z,y=0,margin=2){
    let best=null,bestDistance=Infinity;
    for(const building of nearby(x,z)){
      if(building.collapsed||y>building.height+12)continue;
      const distance=distanceToFootprint(x,z,building);
      if(distance<=margin&&distance<bestDistance){best=building;bestDistance=distance;}
    }
    return best;
  }};
}

export function distanceToFootprint(x,z,building){
  if(x<building.minX-4||x>building.maxX+4||z<building.minZ-4||z>building.maxZ+4)return Infinity;
  let inside=false,closest=Infinity;
  const polygon=building.polygon;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const [ax,az]=polygon[j],[bx,bz]=polygon[i];
    if((az>z)!==(bz>z)&&x<(bx-ax)*(z-az)/(bz-az)+ax)inside=!inside;
    const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1)));
    closest=Math.min(closest,Math.hypot(x-ax-t*dx,z-az-t*dz));
  }
  return inside?0:closest;
}
