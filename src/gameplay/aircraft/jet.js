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
    const taper=Math.pow(1-distance,.7);
    const envelope=Math.sin(Math.PI*clamp(distance))*.42+.58*(1-distance);
    for(let x=0;x<canvas.width;x++){
      const across=Math.abs((x+.5)/canvas.width*2-1);
      const turbulence=.08*Math.sin(distance*86+across*17)+.045*Math.sin(distance*191-across*29);
      const width=(core?.28:.79)*taper*(1+turbulence);
      const edge=clamp((width-across)/Math.max(.025,width*.22));
      const diamond=Math.max(0,...[.18,.39,.61].map((center,index)=>
        clamp(1-Math.abs(distance-center)/(.075+index*.012)-across/(core?.35:.56))));
      const heat=Math.exp(-Math.pow(across/(core?.12:.2),2))*(1-distance);
      const grain=.88+.12*Math.sin(x*.73+y*.31)*Math.sin(x*.18-y*.57);
      const alpha=clamp(edge*envelope*grain*(core?.75:.62)+diamond*(core?.27:.18));
      const offset=(y*canvas.width+x)*4;
      image.data[offset]=Math.round(core?clamp(150+heat*95+diamond*45,0,255):clamp(31+heat*100+diamond*135,0,255));
      image.data[offset+1]=Math.round(core?clamp(204+heat*50+diamond*45,0,255):clamp(104+heat*107+diamond*95,0,255));
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
  gradient.addColorStop(0,'rgba(238,250,255,.95)');
  gradient.addColorStop(.28,'rgba(112,202,255,.75)');
  gradient.addColorStop(.56,'rgba(49,113,250,.32)');
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
    const glow=new THREE.Mesh(new THREE.PlaneGeometry(1.65,1.65),new THREE.MeshBasicMaterial({map:exhaustTextures.nozzle,transparent:true,opacity:.55,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,toneMapped:false}));
    glow.position.z=.04;glow.userData.baseOpacity=.55;plume.add(glow);
    for(const [core,length,width,opacity] of [[false,5.3,1.38,.4],[true,3.65,.66,.38]]){
      for(const angle of [0,Math.PI/2]){
        const geometry=new THREE.PlaneGeometry(width,length);
        geometry.rotateX(Math.PI/2);geometry.rotateZ(angle);
        const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:core?exhaustTextures.core:exhaustTextures.outer,transparent:true,opacity,depthWrite:false,blending:core?THREE.AdditiveBlending:THREE.NormalBlending,side:THREE.DoubleSide,toneMapped:false}));
        mesh.position.z=length*.5+.1;
        mesh.userData.baseOpacity=opacity;
        mesh.userData.core=core;
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
    exhaust.visible=power>.025;
    if(!exhaust.visible)continue;
    for(let index=0;index<exhaust.children.length;index++){
      const plume=exhaust.children[index];
      const flicker=1+.045*Math.sin(time*37+index*2.1)+.026*Math.sin(time*79-index);
      plume.scale.z=(.56+power*.56)*flicker;
      plume.scale.x=plume.scale.y=.84+power*.17;
      for(const mesh of plume.children){
        const pulse=1+.075*Math.sin(time*(mesh.userData.core?53:31)+index*2.7);
        mesh.material.opacity=mesh.userData.baseOpacity*(.42+power*.58)*pulse;
      }
    }
  }
}
