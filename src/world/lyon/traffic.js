import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {nearestVehicleHit,nearestVehicleLock} from './vehicleHits.js';
import {segmentDistance} from './waterMask.js';

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
  {length:8.4,width:2.45,height:3.2,roof:2.1,roofZ:-2.45,style:'truck'},
  {length:10.8,width:2.5,height:3.05,roof:8.7,roofZ:0,style:'bus'},
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
  const roof=spec.style==='bus'?new THREE.BoxGeometry(spec.width*.98,.26,spec.length*.94):cabin(spec);
  if(spec.style==='bus')roof.translate(0,3.02,0);
  const additions=[];
  if(spec.style==='truck'){
    const cargo=new THREE.BoxGeometry(spec.width*.98,2.12,spec.length*.56);
    cargo.translate(0,1.82,spec.length*.19);additions.push(cargo);
  }else if(spec.style==='bus'){
    const skirt=new THREE.BoxGeometry(spec.width*.98,1.3,spec.length*.94);
    skirt.translate(0,1.17,0);additions.push(skirt);
    for(const side of [-1,1])for(let i=0;i<7;i++){
      const pillar=new THREE.BoxGeometry(.09,1.06,.11);
      pillar.translate(side*spec.width*.485,2.34,-spec.length*.39+i*spec.length*.13);
      additions.push(pillar);
    }
  }
  const bodyGeometry=mergeGeometries([lower,hood,roof,...additions]);
  lower.dispose();hood.dispose();roof.dispose();additions.forEach(geometry=>geometry.dispose());
  const body=new THREE.InstancedMesh(bodyGeometry,new THREE.MeshStandardMaterial({color:0xffffff,metalness:.22,roughness:.43}),count);
  const glassGeometry=spec.style==='bus'?new THREE.BoxGeometry(spec.width*.99,.8,spec.length*.84):cabin(spec,true);
  if(spec.style==='bus')glassGeometry.translate(0,2.32,0);
  const glass=new THREE.InstancedMesh(glassGeometry,new THREE.MeshStandardMaterial({color:0x203844,metalness:.2,roughness:.18,side:THREE.DoubleSide}),count);
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

export async function createTraffic(scene,url,load=fetch){
  const data=await load(url).then(r=>r.json());
  const routes=data.routes.filter(r=>r.points.length>2).map(route=>{
    const points=smoothRoad(route.points),cumulative=[0];
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i];
      cumulative.push(cumulative.at(-1)+Math.hypot(b[0]-a[0],b[2]-a[2]));
    }
    const xs=points.map(point=>point[0]),zs=points.map(point=>point[2]);
    return {...route,points,cumulative,length:cumulative.at(-1),minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};
  }).filter(r=>r.length>50);
  const cars=[];
  let serial=0;
  for(let i=0;i<routes.length;i++){
    const route=routes[i];
    const count=Math.min(6,Math.max(1,Math.round(route.length/50)));
    for(let j=0;j<count;j++){
      const id=serial++;
      const variant=route.length>250&&id%29===0?5:route.length>140&&id%11===0?4:id%4;
      cars.push({route,offset:route.length*((j+.17+(i*.61803398875%1)*.55)/count),speed:route.speed*(.33+(id%5)*.022),variant,color:(id*7+i)%PAINT.length});
    }
  }
  for(const car of cars){
    const spec=TYPES[car.variant];
    car.type='car';car.name=car.variant===4?'TRUCK':car.variant===5?'BUS':'ROAD VEHICLE';car.alive=true;car.visible=true;car.health=1;
    car.position=new THREE.Vector3();car.heading=0;car.width=spec.width;car.length=spec.length;car.height=spec.height;
  }
  const groups=TYPES.map((spec,type)=>{
    const entries=cars.filter(car=>car.variant===type),meshes=parts(scene,spec,entries.length);
    entries.forEach((car,index)=>{car.instance=index;meshes[0].setColorAt(index,new THREE.Color(PAINT[car.color]));});
    if(meshes[0].instanceColor)meshes[0].instanceColor.needsUpdate=true;
    return meshes;
  });
  const pedestrians=routes.filter(route=>route.length>75).slice(0,350).map((route,i)=>({
    route,offset:(i*.75487766%1)*route.length,speed:1.05+(i%5)*.13,side:i%2?1:-1,
    position:new THREE.Vector3(),alive:true,visible:false,panic:0,color:i%6
  }));
  const body=new THREE.InstancedMesh(new THREE.CapsuleGeometry(.24,.83,3,5),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.95}),pedestrians.length);
  const heads=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.19,1),new THREE.MeshStandardMaterial({color:0xc4a68c,roughness:1}),pedestrians.length);
  const clothing=[0x293e4b,0x68604f,0x353b3d,0x72534d,0x595e68,0x77766f];
  pedestrians.forEach((person,i)=>body.setColorAt(i,new THREE.Color(clothing[person.color])));
  body.instanceColor.needsUpdate=true;
  for(const mesh of [body,heads]){mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;scene.add(mesh);}
  const dummy=new THREE.Object3D();let elapsed=0,updateAccumulator=0,surfaceSampler=null;
  function update(dt,position){
    elapsed+=dt;
    updateAccumulator+=dt;
    if(dt>0&&updateAccumulator<.05)return;
    updateAccumulator=0;
    let vehicleSamples=6,personSamples=2;
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
      const roadY=a[1]+(b[1]-a[1])*t;
      const z=a[2]+(b[2]-a[2])*t-Math.sin(angle)*lane;
      const distanceToPlane=position?Math.hypot(position.x-x,position.z-z):Infinity;
      const far=!!position&&distanceToPlane>1600;
      if(distanceToPlane<850&&surfaceSampler&&vehicleSamples>0&&elapsed>=(car.sampleAfter??0)&&(car.sampleX===undefined||Math.hypot(x-car.sampleX,z-car.sampleZ)>8)){
        vehicleSamples--;
        const surface=surfaceSampler(x,z);
        if(surface!==null){car.sampledY=surface+.45;car.sampleX=x;car.sampleZ=z;car.sampleAfter=elapsed+2.2;}
        else car.sampleAfter=elapsed+.5;
      }
      const y=car.sampledY??roadY;
      car.position.set(x,y,z);car.heading=angle;car.visible=!far;
      dummy.position.set(x,far?-1000:y,z);dummy.rotation.set(0,angle,0);dummy.scale.setScalar(far?.001:1);dummy.updateMatrix();
      for(const mesh of groups[car.variant])mesh.setMatrixAt(car.instance,dummy.matrix);
    }
    for(const meshes of groups)for(const mesh of meshes)mesh.instanceMatrix.needsUpdate=true;
    for(let i=0;i<pedestrians.length;i++){
      const person=pedestrians[i],route=person.route,total=route.length;
      const phase=(person.offset+elapsed*person.speed*(person.panic>0?2.8:1))%(total*2);
      const distance=easeTurnaroundDistance(phase<total?phase:total*2-phase,total);
      let lo=0,hi=route.cumulative.length-1;
      while(lo<hi-1){const mid=(lo+hi)>>1;if(route.cumulative[mid]<distance)lo=mid;else hi=mid;}
      const a=route.points[lo],b=route.points[lo+1],length=route.cumulative[lo+1]-route.cumulative[lo],t=length>0?(distance-route.cumulative[lo])/length:0;
      const angle=Math.atan2(b[0]-a[0],b[2]-a[2])+Math.PI,sidewalk=person.side*4.6;
      const x=a[0]+(b[0]-a[0])*t+Math.cos(angle)*sidewalk,z=a[2]+(b[2]-a[2])*t-Math.sin(angle)*sidewalk,roadY=a[1]+(b[1]-a[1])*t;
      if(surfaceSampler&&personSamples>0&&(!position||Math.hypot(position.x-x,position.z-z)<650)&&elapsed>=(person.sampleAfter??0)&&(person.sampleX===undefined||Math.hypot(x-person.sampleX,z-person.sampleZ)>8)){
        personSamples--;
        const surface=surfaceSampler(x,z);
        if(surface!==null){person.sampledY=surface+.12;person.sampleX=x;person.sampleZ=z;person.sampleAfter=elapsed+2.5;}
        else person.sampleAfter=elapsed+.6;
      }
      const y=person.sampledY??roadY;
      person.position.set(x,y,z);person.panic=Math.max(0,person.panic-dt);
      const far=!person.alive||(position&&Math.hypot(position.x-x,position.z-z)>650);
      person.visible=!far;
      dummy.position.set(x,far?-1000:y+1.03,z);dummy.rotation.set(0,angle,0);dummy.scale.setScalar(far?.001:1);dummy.updateMatrix();body.setMatrixAt(i,dummy.matrix);
      dummy.position.y=far?-1000:y+1.84;dummy.updateMatrix();heads.setMatrixAt(i,dummy.matrix);
    }
    body.instanceMatrix.needsUpdate=true;heads.instanceMatrix.needsUpdate=true;
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
    for(const car of cars){car.alive=true;car.health=1;car.sampleAfter=0;car.sampleX=undefined;car.sampledY=undefined;}
    for(const person of pedestrians){person.alive=true;person.panic=0;person.sampleAfter=0;person.sampleX=undefined;person.sampledY=undefined;}
    elapsed=0;update(0,null);
  }
  function blast(point,radius,maxVehicles=6){
    const nearby=[];
    for(const car of cars)if(car.alive&&car.position.distanceTo(point)<radius)nearby.push(car);
    for(const person of pedestrians){
      if(!person.alive)continue;
      const distance=person.position.distanceTo(point);
      if(distance<radius*.55)person.alive=false;
      else if(distance<radius*2.3)person.panic=Math.max(person.panic,8);
    }
    nearby.sort((a,b)=>a.position.distanceToSquared(point)-b.position.distanceToSquared(point));
    return nearby.slice(0,maxVehicles);
  }
  function findPersonRayHit(origin,direction,maxDistance){
    let nearest=null,best=maxDistance;
    for(const person of pedestrians){
      if(!person.alive||!person.visible)continue;
      const dx=person.position.x-origin.x,dy=person.position.y+1.15-origin.y,dz=person.position.z-origin.z;
      const along=dx*direction.x+dy*direction.y+dz*direction.z;
      if(along<0||along>best)continue;
      if(dx*dx+dy*dy+dz*dz-along*along<.55*.55){nearest=person;best=along;}
    }
    return nearest?{person:nearest,distance:best}:null;
  }
  function hitPerson(person){if(!person?.alive)return false;person.alive=false;person.visible=false;return true;}
  const bridges=routes.filter(route=>/^(Pont |Passerelle )/i.test(route.name));
  function isRoadBridge(x,z){
    for(const route of bridges){
      if(x<route.minX-12||x>route.maxX+12||z<route.minZ-12||z>route.maxZ+12)continue;
      for(let i=1;i<route.points.length;i++){
        const a=route.points[i-1],b=route.points[i];
        if(segmentDistance(x,z,a[0],a[2],b[0],b[2])<9)return true;
      }
    }
    return false;
  }
  update(0,null);
  return {update,reset,destroy,blast,hitPerson,isRoadBridge,setSurfaceSampler(sampler){surfaceSampler=sampler;},findPersonRayHit,findRayHit:(origin,direction,maxDistance=1500)=>nearestVehicleHit(cars,origin,direction,maxDistance),findLockTarget:(origin,direction,maxDistance=1800,isAvailable)=>nearestVehicleLock(cars,origin,direction,maxDistance,.18,isAvailable),count:cars.length,get visibleCount(){return cars.filter(car=>car.alive&&car.visible).length;},get sampleVehicle(){return cars.find(car=>car.visible);},peopleCount:pedestrians.length,get activePeopleCount(){return pedestrians.filter(person=>person.alive).length;}};
}
