import * as THREE from 'three';
import {AIRCRAFT,createJet} from '../gameplay/aircraft/jet.js';

const v=(x,y,z)=>new THREE.Vector3(x,y,z);
export const terrainHeight=()=>0;

export function createRadar(scene,x,z,name,y=terrainHeight(x,z)){const group=new THREE.Group();group.position.set(x,y,z);scene.add(group);
  const concrete=new THREE.MeshStandardMaterial({color:0x87918b,roughness:.9});const steel=new THREE.MeshStandardMaterial({color:0x4e6568,metalness:.65,roughness:.52});const dark=new THREE.MeshStandardMaterial({color:0x1e3438,metalness:.7,roughness:.44});
  const base=new THREE.Mesh(new THREE.CylinderGeometry(35,46,12,10),concrete);base.position.y=6;group.add(base);
  const tower=new THREE.Mesh(new THREE.CylinderGeometry(5,8,55,8),steel);tower.position.y=38;group.add(tower);
  for(const h of [22,42,58]){const platform=new THREE.Mesh(new THREE.CylinderGeometry(14,14,2,8),dark);platform.position.y=h;group.add(platform);}
  const dish=new THREE.Group();dish.position.y=70;group.add(dish);const back=new THREE.Mesh(new THREE.CylinderGeometry(23,23,2,24),steel);back.rotation.x=Math.PI/2;dish.add(back);const face=new THREE.Mesh(new THREE.CylinderGeometry(20,20,2.4,24),new THREE.MeshStandardMaterial({color:0xc5cfcb,metalness:.38,roughness:.7}));face.rotation.x=Math.PI/2;face.position.z=-2;dish.add(face);const arm=new THREE.Mesh(new THREE.BoxGeometry(2,2,12),dark);arm.position.z=-8;dish.add(arm);
  const beacon=new THREE.Mesh(new THREE.SphereGeometry(2,8,6),new THREE.MeshBasicMaterial({color:0xff523b}));beacon.position.y=63;group.add(beacon);
  for(let i=0;i<4;i++){const a=i*Math.PI/2;const hut=new THREE.Mesh(new THREE.BoxGeometry(23,11,19),concrete);hut.position.set(Math.sin(a)*71,5.5,Math.cos(a)*71);hut.rotation.y=a;group.add(hut);}
  return {name,type:'radar',group,position:v(x,y+58,z),health:3,alive:true,dish,beacon};
}

export function createEnemy(scene,x,y,z,index,{name,ace=false,modelIndex,health,speed}={}){
  const spec=AIRCRAFT[modelIndex??(index%2===0?2:3)];
  const group=createJet(spec,.83);group.position.set(x,y,z);scene.add(group);
  return {name:name??`SABLE ${index+1}`,type:'enemy',group,position:group.position,health:health??(ace?5:3),maxHealth:health??(ace?5:3),alive:true,ace,evadeTime:0,phase:index*1.8,speed:speed??(ace?104:91),fireTimer:3+index*.8,aimTime:0,warningCooldown:0};
}

export function createExtraction(scene,x,z,y=570){const group=new THREE.Group();group.position.set(x,y,z);scene.add(group);const mat=new THREE.MeshBasicMaterial({color:0x8ff2d3,transparent:true,opacity:.64,side:THREE.DoubleSide});const torus=new THREE.Mesh(new THREE.TorusGeometry(115,3,8,60),mat);torus.rotation.y=.28;group.add(torus);const inner=new THREE.Mesh(new THREE.TorusGeometry(96,1.2,6,48),mat);inner.rotation.y=.28;group.add(inner);const beam=new THREE.Mesh(new THREE.CylinderGeometry(2,2,530,8),mat);beam.position.y=-270;group.add(beam);return{group,position:group.position};}
