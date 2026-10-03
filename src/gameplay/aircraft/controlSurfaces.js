import * as THREE from 'three';

// Bounds are in each GLB's native coordinates: +X nose, +/-Y wings, -Z up.
// These models have no authored hinges, so triangles in the control panels are
// lifted out of the airframe and attached to pivots while keeping their UVs.
const SURFACE_BOUNDS={
  f22:{aileron:[-20,0,43,61,-2,3],elevator:[-55,-14,18,43,-3,3],rudder:[-35,-8,14,31,-33,-4]},
  f35:{aileron:[-24,6,44,67,-2,4],elevator:[-58,-24,7,43,-2,5],rudder:[-53,-20,16,26,-28,-3]},
  su57:{aileron:[-60,-22,35,72,-3,5],elevator:[-88,-45,20,34,-3,8],rudder:[-64,-52,29,35,-23,-4]},
  su35:{aileron:[-64,-19,45,75,-4,6],elevator:[-82,-26,18,44,-5,9],rudder:[-49,-27,19,24,-38,-5]},
  f15:{aileron:[-10,35,40,67,-8,10],elevator:[-52,-19,19,44,-10,10],rudder:[-52,-15,14,25,-36,-5]},
  f16:{aileron:[-15,17,29,48,-5,8],elevator:[-49,-23,8,30,-7,12],rudder:[-46,-23,0,5,-33,-4]},
  a10:{aileron:[-16,28,58,89,-8,8],elevator:[-73,-44,19,48,-8,8],rudder:[-70,-40,24,35,-27,-6]}
};
const KINDS=['aileron','elevator','rudder'];
const SIDES=['left','right'];
function inBounds(x,y,z,bounds,side){
  const [xmin,xmax,ymin,ymax,zmin,zmax]=bounds;
  return x>=xmin&&x<=xmax&&Math.abs(y)>=ymin&&Math.abs(y)<=ymax&&z>=zmin&&z<=zmax&&(side==='left'?y<0:y>0);
}
function makeGeometry(source,indices,pivot){
  const geometry=new THREE.BufferGeometry();
  for(const [name,attribute] of Object.entries(source.attributes)){
    const values=new Float32Array(indices.length*attribute.itemSize);
    let n=0;
    for(const index of indices)for(let k=0;k<attribute.itemSize;k++)values[n++]=attribute.getComponent(index,k)-(name==='position'?pivot.getComponent(k):0);
    geometry.setAttribute(name,new THREE.BufferAttribute(values,attribute.itemSize,attribute.normalized));
  }
  geometry.computeBoundingSphere();
  return geometry;
}
function boundsFor(source,indices){
  const position=source.getAttribute('position'),box=new THREE.Box3();
  for(const index of indices)box.expandByPoint(new THREE.Vector3(position.getX(index),position.getY(index),position.getZ(index)));
  return box;
}
export function prepareControlSurfaces(model,spec){
  const airframe=model.getObjectByName('Object_4');
  if(!airframe?.isMesh)return;
  const oldGeometry=airframe.geometry;
  const source=oldGeometry.index?oldGeometry.toNonIndexed():oldGeometry.clone();
  const positions=source.getAttribute('position'),regions=SURFACE_BOUNDS[spec.id];
  const groups={static:[]};
  for(const kind of KINDS)for(const side of SIDES)groups[`${kind}-${side}`]=[];
  for(let i=0;i<positions.count;i+=3){
    const x=(positions.getX(i)+positions.getX(i+1)+positions.getX(i+2))/3;
    const y=(positions.getY(i)+positions.getY(i+1)+positions.getY(i+2))/3;
    const z=(positions.getZ(i)+positions.getZ(i+1)+positions.getZ(i+2))/3;
    let name='static';
    for(const kind of KINDS){
      for(const side of SIDES)if(inBounds(x,y,z,regions[kind],side)){name=`${kind}-${side}`;break;}
      if(name!=='static')break;
    }
    groups[name].push(i,i+1,i+2);
  }
  airframe.geometry=makeGeometry(source,groups.static,new THREE.Vector3());
  for(const kind of KINDS)for(const side of SIDES){
    const name=`${kind}-${side}`,indices=groups[name];
    if(!indices.length)continue;
    const box=boundsFor(source,indices),size=box.getSize(new THREE.Vector3());
    const pivot=new THREE.Vector3(box.max.x-size.x*.1,(box.min.y+box.max.y)/2,(box.min.z+box.max.z)/2);
    const hinge=new THREE.Group();hinge.name=`flight-control-${name}`;hinge.position.copy(pivot);
    const surface=new THREE.Mesh(makeGeometry(source,indices,pivot),airframe.material);
    surface.castShadow=true;surface.receiveShadow=true;hinge.add(surface);airframe.parent.add(hinge);
  }
  source.dispose();oldGeometry.dispose();
}
export function bindControlSurfaces(jet){
  const surfaces={};
  for(const kind of KINDS)for(const side of SIDES)surfaces[`${kind}-${side}`]=jet.getObjectByName(`flight-control-${kind}-${side}`);
  jet.userData.controlSurfaces=surfaces;
}
export function animateControlSurfaces(jet,controls,dt,airbrake=false){
  const surfaces=jet?.userData.controlSurfaces;
  if(!surfaces)return;
  const pitch=THREE.MathUtils.clamp(controls.pitchInput,-1,1),roll=THREE.MathUtils.clamp(controls.rollInput,-1,1),yaw=THREE.MathUtils.clamp(controls.yawInput,-1,1);
  const targets={
    'aileron-left':[-roll*.37-(airbrake?.12:0),'y'],
    'aileron-right':[roll*.37-(airbrake?.12:0),'y'],
    'elevator-left':[-pitch*.31,'y'],
    'elevator-right':[-pitch*.31,'y'],
    'rudder-left':[yaw*.32,'z'],
    'rudder-right':[yaw*.32,'z']
  };
  for(const [name,[angle,axis]] of Object.entries(targets)){
    const hinge=surfaces[name];if(hinge)hinge.rotation[axis]=THREE.MathUtils.damp(hinge.rotation[axis],angle,14,dt);
  }
}
