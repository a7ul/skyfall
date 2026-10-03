import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {nearestVehicleHit,nearestVehicleLock} from './vehicleHits.js';

const PAINT=[0xdedfdc,0x252c34,0x9badaf,0x8c3330,0x30445c,0x605c55,0xc2c4be,0x425b52,0xd4d6d6,0x294255,0xc2a884];
export function easeTurnaroundDistance(distance,total){
  const approach=Math.min(14,total*.15);
  const ease=value=>{const t=value/approach;return approach*t*t*(2-t);};
  if(distance<approach)return ease(distance);
  if(total-distance<approach)return total-ease(total-distance);
  return distance;
}
const TYPES=[
  {length:4.5,width:1.82,height:1.45,roof:2.25,roofZ:-.12},
  {length:3.85,width:1.74,height:1.5,roof:2.35,roofZ:.16},
  {length:4.7,width:1.93,height:1.85,roof:2.8,roofZ:-.1},
  {length:5.2,width:2.04,height:2.15,roof:3.4,roofZ:.32},
];

function cabin(spec,glass=false){
  const width=spec.width*(glass?.465:.45),front=spec.roofZ-spec.roof*.5,rear=spec.roofZ+spec.roof*.5;
  const bottom=glass?.83:.73,top=spec.height-(glass?.1:.02);
  const profile=[[front,bottom],[rear,bottom],[rear-.32,top],[front+.48,top]];
  const vertices=[];
  for(const side of [-1,1])for(const [z,y] of profile)vertices.push(side*width,y,z);
  const faces=[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7];
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1],2));geometry.setIndex(faces);geometry.computeVertexNormals();return geometry;
}

function parts(scene,spec,count){
  const lower=new THREE.BoxGeometry(spec.width,.53,spec.length);lower.translate(0,.48,0);
  const hood=new THREE.BoxGeometry(spec.width*.94,.17,spec.length*.84);hood.translate(0,.78,0);
  const roof=cabin(spec),bodyGeometry=mergeGeometries([lower,hood,roof]);
  lower.dispose();hood.dispose();roof.dispose();
  const body=new THREE.InstancedMesh(bodyGeometry,new THREE.MeshStandardMaterial({color:0xffffff,metalness:.22,roughness:.43}),count);
  const glass=new THREE.InstancedMesh(cabin(spec,true),new THREE.MeshStandardMaterial({color:0x203844,metalness:.2,roughness:.18,side:THREE.DoubleSide}),count);
  const wheels=[];
  for(const x of [-spec.width*.47,spec.width*.47])for(const z of [-spec.length*.31,spec.length*.31]){
    const wheel=new THREE.CylinderGeometry(.34,.34,.15,10);wheel.rotateZ(Math.PI/2);wheel.translate(x,.35,z);wheels.push(wheel);
  }
  const wheelGeometry=mergeGeometries(wheels);wheels.forEach(g=>g.dispose());
  const tires=new THREE.InstancedMesh(wheelGeometry,new THREE.MeshStandardMaterial({color:0x161c20,roughness:.91}),count);
  const lamps=[];
  for(const x of [-spec.width*.36,spec.width*.36]){
    const lamp=new THREE.BoxGeometry(.22,.1,.06);lamp.translate(x,.66,-spec.length*.5-.01);lamps.push(lamp);
  }
  const lampGeometry=mergeGeometries(lamps);lamps.forEach(g=>g.dispose());
  const lights=new THREE.InstancedMesh(lampGeometry,new THREE.MeshBasicMaterial({color:0xfff3cf}),count);
  const meshes=[body,glass,tires,lights];
  for(const mesh of meshes){mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;scene.add(mesh);}
  return meshes;
}

function smoothRoad(points){
  const low=points.map((_,i)=>Math.min(...points.slice(Math.max(0,i-2),Math.min(points.length,i+3)).map(p=>p[1])));
  return points.map((p,i)=>[p[0],(low[Math.max(0,i-1)]+low[i]+low[Math.min(low.length-1,i+1)])/3,p[2]]);
}

export async function createTraffic(scene){
  const data=await fetch('/assets/helsinki/traffic.json').then(r=>r.json());
  const routes=data.routes.filter(r=>r.points.length>2).map(route=>{
    const points=smoothRoad(route.points),cumulative=[0];
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i];
      cumulative.push(cumulative.at(-1)+Math.hypot(b[0]-a[0],b[2]-a[2]));
    }
    return {...route,points,cumulative,length:cumulative.at(-1)};
  }).filter(r=>r.length>50);
  const cars=[];
  for(let i=0;i<routes.length;i++){
    const route=routes[i];
    if(i%2===0||route.length>150)cars.push({route,offset:(i*.61803398875%1)*route.length,speed:route.speed*(.36+(i%5)*.025),variant:i%4,color:i%PAINT.length});
    if(route.length>220&&i%3===0)cars.push({route,offset:route.length*.55,speed:route.speed*.4,variant:(i+2)%4,color:(i+3)%PAINT.length});
  }
  for(const car of cars){
    const spec=TYPES[car.variant];
    car.type='car';car.name='ROAD VEHICLE';car.alive=true;car.visible=true;car.health=1;
    car.position=new THREE.Vector3();car.heading=0;car.width=spec.width;car.length=spec.length;car.height=spec.height;
  }
  const groups=TYPES.map((spec,type)=>{
    const entries=cars.filter(car=>car.variant===type),meshes=parts(scene,spec,entries.length);
    entries.forEach((car,index)=>{car.instance=index;meshes[0].setColorAt(index,new THREE.Color(PAINT[car.color]));});
    meshes[0].instanceColor.needsUpdate=true;
    return meshes;
  });
  const dummy=new THREE.Object3D();let elapsed=0;
  function update(dt,position){
    elapsed+=dt;
    for(const car of cars){
      if(!car.alive)continue;
      const route=car.route,total=route.length;
      const phase=(car.offset+elapsed*car.speed)%(total*2);
      const distance=easeTurnaroundDistance(phase<total?phase:total*2-phase,total);
      let lo=0,hi=route.cumulative.length-1;
      while(lo<hi-1){const mid=(lo+hi)>>1;if(route.cumulative[mid]<distance)lo=mid;else hi=mid;}
      const a=route.points[lo],b=route.points[lo+1],length=route.cumulative[lo+1]-route.cumulative[lo];
      const t=length>0?(distance-route.cumulative[lo])/length:0;
      const angle=Math.atan2(b[0]-a[0],b[2]-a[2])+Math.PI+(phase>=total?Math.PI:0),lane=1.4;
      const x=a[0]+(b[0]-a[0])*t+Math.cos(angle)*lane;
      const y=a[1]+(b[1]-a[1])*t;
      const z=a[2]+(b[2]-a[2])*t-Math.sin(angle)*lane;
      const far=position&&Math.hypot(position.x-x,position.z-z)>1300;
      car.position.set(x,y,z);car.heading=angle;car.visible=!far;
      dummy.position.set(x,far?-1000:y,z);dummy.rotation.set(0,angle,0);dummy.scale.setScalar(far?.001:1);dummy.updateMatrix();
      for(const mesh of groups[car.variant])mesh.setMatrixAt(car.instance,dummy.matrix);
    }
    for(const meshes of groups)for(const mesh of meshes)mesh.instanceMatrix.needsUpdate=true;
  }
  function destroy(car){
    if(!car?.alive)return null;
    car.alive=false;car.visible=false;
    const hit={position:car.position.clone(),heading:car.heading,width:car.width,length:car.length,height:car.height};
    dummy.position.set(0,-10000,0);dummy.rotation.set(0,0,0);dummy.scale.setScalar(.001);dummy.updateMatrix();
    for(const mesh of groups[car.variant]){mesh.setMatrixAt(car.instance,dummy.matrix);mesh.instanceMatrix.needsUpdate=true;}
    return hit;
  }
  function reset(){
    for(const car of cars){car.alive=true;car.health=1;}
    elapsed=0;update(0,null);
  }
  update(0,null);
  return {update,reset,destroy,findRayHit:(origin,direction,maxDistance=1500)=>nearestVehicleHit(cars,origin,direction,maxDistance),findLockTarget:(origin,direction,maxDistance=1800,isAvailable)=>nearestVehicleLock(cars,origin,direction,maxDistance,.18,isAvailable),count:cars.length};
}
