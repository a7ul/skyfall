import * as THREE from 'three';

const CAPACITY=72;
const INTERVAL=.03;
const LIFETIME=1.65;
const puffGeometry=new THREE.PlaneGeometry(1,1);
const dummy=new THREE.Object3D();
const color=new THREE.Color();

// One instanced draw call per missile keeps long smoke trails affordable.
export function createMissileTrail(scene,smokeTexture){
  const material=new THREE.MeshBasicMaterial({map:smokeTexture,color:0xf1f2ef,transparent:true,opacity:.88,depthWrite:false,side:THREE.DoubleSide});
  const mesh=new THREE.InstancedMesh(puffGeometry,material,CAPACITY);
  dummy.position.set(0,-100000,0);dummy.quaternion.identity();dummy.scale.setScalar(0);dummy.updateMatrix();
  for(let i=0;i<CAPACITY;i++)mesh.setMatrixAt(i,dummy.matrix);
  mesh.instanceMatrix.needsUpdate=true;
  mesh.frustumCulled=false;
  mesh.renderOrder=2;
  scene.add(mesh);
  return {mesh,puffs:[],sampleTime:0,lastPosition:null,serial:0};
}

export function updateMissileTrail(trail,position,camera,dt){
  const previous=trail.lastPosition||position;
  if(position)trail.sampleTime+=dt;
  const emissions=position?Math.min(6,Math.floor(trail.sampleTime/INTERVAL)):0;
  for(let i=0;i<emissions;i++){
    const fraction=emissions===1?1:(i+1)/emissions;
    const seed=trail.serial++;
    trail.puffs.unshift({
      position:previous.clone().lerp(position,fraction),
      age:0,
      lateral:Math.sin(seed*2.39996)*(.6+seed%4*.17),
      vertical:Math.cos(seed*1.618)*.65,
      size:.85+(seed%5)*.13,
    });
  }
  if(emissions)trail.sampleTime%=INTERVAL;
  if(position)trail.lastPosition=position.clone();
  for(const puff of trail.puffs)puff.age+=dt;
  trail.puffs=trail.puffs.filter(puff=>puff.age<LIFETIME).slice(0,CAPACITY);
  const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);
  for(let i=0;i<trail.puffs.length;i++){
    const puff=trail.puffs[i],age=puff.age/LIFETIME;
    const width=puff.size*(3+age*9);
    dummy.position.copy(puff.position).addScaledVector(right,puff.lateral*age*2.6);
    dummy.position.y+=puff.vertical*age+age*age*4.2;
    dummy.quaternion.copy(camera.quaternion);
    dummy.rotateZ(Math.sin(i*2.1)*.45);
    dummy.scale.set(width,width*(.75+age*.55),1);
    dummy.updateMatrix();
    trail.mesh.setMatrixAt(i,dummy.matrix);
    color.setRGB(1-age*.52,1-age*.48,1-age*.43);
    trail.mesh.setColorAt(i,color);
  }
  dummy.scale.setScalar(0);dummy.updateMatrix();
  for(let i=trail.puffs.length;i<CAPACITY;i++)trail.mesh.setMatrixAt(i,dummy.matrix);
  trail.mesh.instanceMatrix.needsUpdate=true;
  if(trail.mesh.instanceColor)trail.mesh.instanceColor.needsUpdate=true;
}

export function disposeMissileTrail(scene,trail){
  scene.remove(trail.mesh);
  trail.mesh.material.dispose();
  trail.mesh.dispose();
}
