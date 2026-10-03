import * as THREE from 'three';

const CAPACITY=36;
const right=new THREE.Vector3();
const tangent=new THREE.Vector3();
const towardCamera=new THREE.Vector3();

export function createMissileTrail(scene){
  const positions=new Float32Array(CAPACITY*2*3);
  const indices=[];
  for(let i=0;i<CAPACITY-1;i++){
    const a=i*2;
    indices.push(a,a+1,a+2,a+1,a+3,a+2);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(indices);
  geometry.setDrawRange(0,0);
  const material=new THREE.MeshBasicMaterial({color:0xd5e0e2,transparent:true,opacity:.58,depthWrite:false,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(geometry,material);
  mesh.frustumCulled=false;
  scene.add(mesh);
  return {mesh,points:[],sampleTime:0};
}

export function updateMissileTrail(trail,position,camera,dt){
  trail.sampleTime+=dt;
  if(!trail.points.length||trail.sampleTime>=.045){
    trail.points.unshift(position.clone());
    if(trail.points.length>CAPACITY)trail.points.pop();
    trail.sampleTime=0;
  }else trail.points[0].copy(position);
  const points=trail.points,attribute=trail.mesh.geometry.attributes.position;
  for(let i=0;i<points.length;i++){
    const point=points[i];
    tangent.copy(points[Math.max(0,i-1)]).sub(points[Math.min(points.length-1,i+1)]).normalize();
    towardCamera.copy(camera.position).sub(point).normalize();
    right.crossVectors(tangent,towardCamera).normalize();
    if(right.lengthSq()<.01)right.set(1,0,0);
    const taper=Math.min(1,(points.length-1-i)/3);
    const width=(.7+i*.055)*taper;
    attribute.setXYZ(i*2,point.x+right.x*width,point.y+right.y*width,point.z+right.z*width);
    attribute.setXYZ(i*2+1,point.x-right.x*width,point.y-right.y*width,point.z-right.z*width);
  }
  attribute.needsUpdate=true;
  trail.mesh.geometry.setDrawRange(0,Math.max(0,points.length-1)*6);
}

export function disposeMissileTrail(scene,trail){
  scene.remove(trail.mesh);
  trail.mesh.geometry.dispose();
  trail.mesh.material.dispose();
}
