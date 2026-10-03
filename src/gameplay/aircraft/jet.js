import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {prepareControlSurfaces,bindControlSurfaces} from './controlSurfaces.js';

// The bundled, textured GLBs are credited in public/assets/aircraft/ATTRIBUTION.md.
export const AIRCRAFT = [
  {id:'f22', label:'F-22 RAPTOR', role:'STEALTH AIR SUPERIORITY', origin:'USAF · TWIN ENGINE', speed:1.08, turn:1.0, model:'f-22.glb', length:14.4, nozzles:[[-1.12,-.79,5.42,.33],[1.12,-.79,5.42,.33]]},
  {id:'f35', label:'F-35 LIGHTNING II', role:'MULTIROLE STRIKE', origin:'USAF · SINGLE ENGINE', speed:.98, turn:1.06, model:'f-35.glb', length:12.8, nozzles:[[0,-.62,5.1,.36]]},
  {id:'su57', label:'SU-57 FELON', role:'HIGH AGILITY INTERCEPTOR', origin:'VKS · TWIN ENGINE', speed:1.13, turn:1.14, model:'su-57.glb', length:15.1, nozzles:[[-1.19,.04,6.1,.34],[1.19,.04,6.1,.34]]},
  {id:'su35', label:'SU-35 FLANKER-E', role:'LONG RANGE MULTIROLE', origin:'VKS · TWIN ENGINE', speed:1.02, turn:1.10, model:'su-35.glb', length:16.1, nozzles:[[-1.02,-1.06,6.53,.33],[1.02,-1.06,6.53,.33]]}
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
    const envelope=Math.pow(1-distance,1.5)*clamp(distance*11+.12);
    const cell=Math.exp(-Math.pow((distance-.21)/.065,2))*.7+Math.exp(-Math.pow((distance-.5)/.075,2))*.45;
    for(let x=0;x<canvas.width;x++){
      const around=x/(canvas.width-1)*Math.PI*2;
      const ripple=.69+.18*Math.sin(around*7+distance*43)+.11*Math.sin(around*13-distance*81)+.06*Math.sin(around*23+distance*163);
      const alpha=clamp(envelope*ripple*(core?.39:.21)*(1+cell));
      const offset=(y*canvas.width+x)*4;
      image.data[offset]=core?255:91;
      image.data[offset+1]=core?228:168;
      image.data[offset+2]=core?185:242;
      image.data[offset+3]=Math.round(alpha*255);
    }
  }
  context.putImageData(image,0,0);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;
  return texture;
}

function plumeGeometry(length,radius){
  const radial=24,axial=36,positions=[],uvs=[],indices=[];
  for(let row=0;row<=axial;row++){
    const t=row/axial;
    const taper=1-.22*t-.7*t*t;
    for(let column=0;column<=radial;column++){
      const angle=column/radial*Math.PI*2;
      const wobble=1+.09*Math.sin(t*32+angle*5)+.035*Math.sin(t*77-angle*11);
      const r=radius*taper*wobble;
      positions.push(Math.cos(angle)*r,Math.sin(angle)*r,length*t);
      uvs.push(column/radial,t);
      if(row<axial&&column<radial){
        const a=row*(radial+1)+column,b=a+radial+1;
        indices.push(a,b,a+1,b,b+1,a+1);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  return geometry;
}

function makeExhausts(spec){
  exhaustTextures??={outer:plumeTexture(),core:plumeTexture(true)};
  const exhausts=new THREE.Group();
  for(const [x,y,z,radius] of spec.nozzles){
    const plume=new THREE.Group();
    plume.position.set(x,y,z);
    const liner=new THREE.Mesh(new THREE.CylinderGeometry(radius*.89,radius*.89,.25,24,1,true),new THREE.MeshBasicMaterial({color:0xc36b35,transparent:true,opacity:.1,depthWrite:false,side:THREE.DoubleSide}));
    liner.geometry.rotateX(Math.PI/2);liner.position.z=-.1;liner.userData.effect='liner';plume.add(liner);
    for(const [effect,length,baseRadius,opacity,map] of [
      ['sheath',3.3,radius*.87,.65,exhaustTextures.outer],
      ['core',2.15,radius*.47,.75,exhaustTextures.core]
    ]){
      const mesh=new THREE.Mesh(plumeGeometry(length,baseRadius),new THREE.MeshBasicMaterial({map,transparent:true,opacity,depthWrite:false,blending:effect==='core'?THREE.AdditiveBlending:THREE.NormalBlending,side:THREE.DoubleSide}));
      mesh.userData.baseOpacity=opacity;
      mesh.userData.effect=effect;
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
        if(effect==='liner')mesh.material.opacity=(.04+.08*power)*pulse;
        else mesh.material.opacity=mesh.userData.baseOpacity*power*pulse;
      }
    }
  }
}
