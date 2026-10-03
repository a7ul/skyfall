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
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=512;
  const context=canvas.getContext('2d');
  const image=context.createImageData(canvas.width,canvas.height);
  const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
  for(let y=0;y<canvas.height;y++){
    const distance=1-y/(canvas.height-1);
    const envelope=Math.pow(1-distance,1.15)*clamp(distance*13);
    const width=(core?.38:.7)*(1-distance*.72);
    const cell=Math.exp(-Math.pow((distance-.2)/.055,2))*.8+Math.exp(-Math.pow((distance-.49)/.065,2))*.45;
    for(let x=0;x<canvas.width;x++){
      const across=(x/(canvas.width-1)*2-1)-.045*Math.sin(distance*24)-.025*Math.sin(distance*57);
      const falloff=Math.exp(-Math.pow(across/width,2)*2.1);
      const ripple=.8+.09*Math.sin(distance*61+across*14)+.07*Math.sin(distance*113-across*29);
      const alpha=clamp(envelope*falloff*ripple*(core?.73:.48)*(1+cell));
      const offset=(y*canvas.width+x)*4;
      image.data[offset]=core?255:105;
      image.data[offset+1]=core?235:167;
      image.data[offset+2]=core?195:238;
      image.data[offset+3]=Math.round(alpha*255);
    }
  }
  context.putImageData(image,0,0);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;
  return texture;
}

function makeExhausts(spec){
  exhaustTextures??={outer:plumeTexture(),core:plumeTexture(true)};
  const exhausts=new THREE.Group();
  const offsets=spec.engines===1?[0]:[-.57,.57];
  for(const x of offsets){
    const plume=new THREE.Group();
    plume.position.set(x,-.05,spec.length*.49+.35);
    // The warm metal is set back inside the nozzle. A front-facing glow card
    // turns into a flat blue disc from the chase camera, especially in daylight.
    const liner=new THREE.Mesh(new THREE.CylinderGeometry(.255,.285,.17,20,1,true),new THREE.MeshBasicMaterial({color:0x9f5b31,transparent:true,opacity:.12,depthWrite:false,side:THREE.DoubleSide}));
    liner.geometry.rotateX(Math.PI/2);liner.position.z=-.18;liner.userData.effect='liner';plume.add(liner);
    for(const [effect,length,width,opacity,map] of [
      ['sheath',3.6,.95,.88,exhaustTextures.outer],
      ['core',2.35,.62,1,exhaustTextures.core]
    ]){
      const geometry=new THREE.PlaneGeometry(width,length);
      geometry.rotateX(Math.PI/2);
      for(let sheet=0;sheet<2;sheet++){
        const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map,transparent:true,opacity,depthWrite:false,blending:effect==='core'?THREE.AdditiveBlending:THREE.NormalBlending,side:THREE.DoubleSide}));
        mesh.position.z=length*.5+.03;
        mesh.rotation.z=sheet*Math.PI/2;
        mesh.userData.baseOpacity=opacity;
        mesh.userData.effect=effect;
        plume.add(mesh);
      }
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
    exhaust.visible=power>.015;
    if(!exhaust.visible)continue;
    for(let index=0;index<exhaust.children.length;index++){
      const plume=exhaust.children[index];
      const flicker=1+.025*Math.sin(time*37+index*2.1)+.012*Math.sin(time*79-index);
      plume.scale.z=(.72+power*.28)*flicker;
      plume.scale.x=plume.scale.y=.93+power*.07;
      for(const mesh of plume.children){
        const effect=mesh.userData.effect;
        const pulse=1+.045*Math.sin(time*(effect==='core'?53:31)+index*2.7);
        if(effect==='liner')mesh.material.opacity=(.06+.11*power)*pulse;
        else mesh.material.opacity=mesh.userData.baseOpacity*power*pulse;
      }
    }
  }
}
