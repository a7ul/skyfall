import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {prepareControlSurfaces,bindControlSurfaces} from './controlSurfaces.js';

// The bundled, textured GLBs are credited in public/assets/aircraft/ATTRIBUTION.md.
export const AIRCRAFT = [
  {id:'f22', label:'F-22 RAPTOR', role:'STEALTH AIR SUPERIORITY', origin:'USAF · TWIN ENGINE', speed:1.08, turn:1.0, model:'f-22.glb', length:14.4, engines:2},
  {id:'f35', label:'F-35 LIGHTNING II', role:'MULTIROLE STRIKE', origin:'USAF · SINGLE ENGINE', speed:.98, turn:1.06, model:'f-35.glb', length:12.8, engines:1},
  {id:'su57', label:'SU-57 FELON', role:'HIGH AGILITY INTERCEPTOR', origin:'VKS · TWIN ENGINE', speed:1.13, turn:1.14, model:'su-57.glb', length:15.1, engines:2},
  {id:'su35', label:'SU-35 FLANKER-E', role:'LONG RANGE MULTIROLE', origin:'VKS · TWIN ENGINE', speed:1.02, turn:1.10, model:'su-35.glb', length:16.1, engines:2}
];

const templates=new Map();
const loader=new GLTFLoader();
let exhaustTextures;

function plumeTexture(core=false){
  const canvas=document.createElement('canvas');canvas.width=96;canvas.height=256;
  const context=canvas.getContext('2d');
  const image=context.createImageData(canvas.width,canvas.height);
  const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
  for(let y=0;y<canvas.height;y++){
    const distance=1-y/(canvas.height-1);
    const envelope=Math.pow(1-distance,1.55)*clamp(distance*13+.35);
    for(let x=0;x<canvas.width;x++){
      const around=x/canvas.width*Math.PI*2;
      const ripple=.8+.11*Math.sin(around*7+distance*27)+.09*Math.sin(around*13-distance*51);
      const cell=Math.max(0,Math.exp(-Math.pow((distance-.24)/.055,2))*.5+Math.exp(-Math.pow((distance-.52)/.07,2))*.28);
      const alpha=clamp(envelope*ripple*(core?.52:.29)+cell*(core?.15:.075));
      const offset=(y*canvas.width+x)*4;
      image.data[offset]=core?189:74;
      image.data[offset+1]=core?235:159;
      image.data[offset+2]=255;
      image.data[offset+3]=Math.round(alpha*255);
    }
  }
  context.putImageData(image,0,0);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;
  return texture;
}

function nozzleTexture(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const context=canvas.getContext('2d');
  const gradient=context.createRadialGradient(64,64,3,64,64,63);
  gradient.addColorStop(0,'rgba(210,235,255,.08)');
  gradient.addColorStop(.22,'rgba(215,239,255,.22)');
  gradient.addColorStop(.48,'rgba(152,213,255,.72)');
  gradient.addColorStop(.7,'rgba(57,120,217,.18)');
  gradient.addColorStop(1,'rgba(24,54,181,0)');
  context.fillStyle=gradient;context.fillRect(0,0,128,128);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}

function makeExhausts(spec){
  exhaustTextures??={outer:plumeTexture(),core:plumeTexture(true),nozzle:nozzleTexture()};
  const exhausts=new THREE.Group();
  const offsets=spec.engines===1?[0]:[-.57,.57];
  for(const x of offsets){
    const plume=new THREE.Group();
    plume.position.set(x,-.05,spec.length*.49+.35);
    const glow=new THREE.Mesh(new THREE.PlaneGeometry(.72,.72),new THREE.MeshBasicMaterial({map:exhaustTextures.nozzle,transparent:true,opacity:.24,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,toneMapped:false}));
    glow.position.z=.05;glow.userData.baseOpacity=.24;plume.add(glow);
    for(const [core,length,baseRadius,tipRadius,opacity] of [[false,2.25,.36,.045,.48],[true,1.48,.19,.025,.38]]){
      const geometry=new THREE.CylinderGeometry(tipRadius,baseRadius,length,14,8,true);
      geometry.rotateX(Math.PI/2);
      const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:core?exhaustTextures.core:exhaustTextures.outer,transparent:true,opacity,depthWrite:false,blending:core?THREE.AdditiveBlending:THREE.NormalBlending,side:THREE.DoubleSide,toneMapped:false}));
      mesh.position.z=length*.5+.08;
      mesh.userData.baseOpacity=opacity;
      mesh.userData.core=core;
      plume.add(mesh);
    }
    exhausts.add(plume);
  }
  exhausts.visible=false;
  return exhausts;
}

async function loadOne(spec){
  const gltf=await loader.loadAsync(`${import.meta.env.BASE_URL}assets/aircraft/${spec.model}`);
  const model=gltf.scene;
  prepareControlSurfaces(model,spec);
  model.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(model);
  const center=bounds.getCenter(new THREE.Vector3());
  const dimensions=bounds.getSize(new THREE.Vector3());
  const scale=spec.length/dimensions.x;
  const airframe=new THREE.Group();
  model.position.sub(center);
  model.updateMatrixWorld(true);
  airframe.add(model);
  airframe.rotation.y=Math.PI/2;
  airframe.scale.setScalar(scale);
  model.traverse(object=>{
    if(!object.isMesh)return;
    object.castShadow=true;
    object.receiveShadow=true;
    const materials=Array.isArray(object.material)?object.material:[object.material];
    for(const material of materials){
      if(material?.isMeshStandardMaterial){material.envMapIntensity=.9;material.needsUpdate=true;}
    }
  });
  // The effect geometry is shared across aircraft; each instance owns its
  // materials so throttle animation never changes another jet's plume.
  const exhausts=makeExhausts(spec);
  const root=new THREE.Group();root.name=spec.label;root.add(airframe,exhausts);root.userData.exhausts=exhausts;
  templates.set(spec.id,root);
}

export async function loadJetModels(){await Promise.all(AIRCRAFT.map(loadOne));}

export function createJet(spec,scale=1){
  const template=templates.get(spec.id);
  if(!template)throw new Error(`Aircraft model not loaded: ${spec.id}`);
  const root=template.clone(true);
  root.scale.setScalar(scale);
  root.userData.afterburners=[root.children[1]];
  root.children[1].traverse(object=>{if(object.isMesh)object.material=object.material.clone();});
  bindControlSurfaces(root);
  return root;
}

export function updateAfterburners(jet,throttle,time,airbrake=false){
  const power=airbrake?0:THREE.MathUtils.clamp((throttle-.8)/.2,0,1);
  for(const exhaust of jet?.userData.afterburners||[]){
    exhaust.visible=throttle>.15;
    if(!exhaust.visible)continue;
    for(let index=0;index<exhaust.children.length;index++){
      const plume=exhaust.children[index];
      const flicker=1+.035*Math.sin(time*37+index*2.1)+.018*Math.sin(time*79-index);
      plume.scale.z=(.58+power*.42)*flicker;
      plume.scale.x=plume.scale.y=.9+power*.1;
      for(const mesh of plume.children){
        const pulse=1+.06*Math.sin(time*(mesh.userData.core?53:31)+index*2.7);
        if(mesh===plume.children[0]){
          mesh.material.color.setRGB(1,.45+power*.55,.28+power*.72);
          mesh.material.opacity=(.06+throttle*.08+power*.1)*pulse;
        }else{
          mesh.material.opacity=mesh.userData.baseOpacity*power*pulse;
          mesh.rotation.z=Math.sin(time*(mesh.userData.core?4.3:3.1)+index)*.1;
        }
      }
    }
  }
}
