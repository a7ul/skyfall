import * as THREE from 'three';
import {MeshBasicNodeMaterial} from 'three/webgpu';
import {materialOpacity,screenUV,sin,texture,time,uv,vec2,viewportSafeUV,viewportSharedTexture} from 'three/tsl';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {prepareControlSurfaces,bindControlSurfaces} from './controlSurfaces.js';

// The bundled, textured GLBs are credited in public/assets/aircraft/ATTRIBUTION.md.
export const AIRCRAFT = [
  {id:'f22', label:'F-22 RAPTOR', role:'STEALTH AIR SUPERIORITY', origin:'USAF · TWIN ENGINE', speed:1.08, turn:1.0, model:'f-22.glb', length:14.4, nozzles:[[-.62,-.79,5.35,.3],[.62,-.79,5.35,.3]]},
  {id:'f35', label:'F-35 LIGHTNING II', role:'MULTIROLE STRIKE', origin:'USAF · SINGLE ENGINE', speed:.98, turn:1.06, model:'f-35.glb', length:12.8, nozzles:[[0,-.62,5.32,.31]]},
  {id:'su57', label:'SU-57 FELON', role:'HIGH AGILITY INTERCEPTOR', origin:'VKS · TWIN ENGINE', speed:1.13, turn:1.14, model:'su-57.glb', length:15.1, nozzles:[[-1.13,.04,6.5,.32],[1.13,.04,6.5,.32]]},
  {id:'su35', label:'SU-35 FLANKER-E', role:'LONG RANGE MULTIROLE', origin:'VKS · TWIN ENGINE', speed:1.02, turn:1.10, model:'su-35.glb', length:16.1, exhaustToeIn:.035, nozzles:[[-1.02,-1.06,6.53,.33],[1.02,-1.06,6.53,.33]]},
  {id:'f15', label:'F-15E STRIKE EAGLE', role:'HEAVY STRIKE', origin:'USAF · TWIN ENGINE', speed:1.05, turn:.94, model:'f-15.glb', length:16, nozzles:[[-.64,-.78,7.05,.34],[.64,-.78,7.05,.34]]},
  {id:'f16', label:'F-16 FIGHTING FALCON', role:'LIGHT MULTIROLE', origin:'USAF · SINGLE ENGINE', speed:1.0, turn:1.17, model:'f-16.glb', length:12.8, nozzles:[[0,-.38,5.72,.37]]},
  {id:'a10', label:'A-10 THUNDERBOLT II', role:'CLOSE AIR SUPPORT', origin:'USAF · TWIN TURBOFAN', speed:.64, turn:.81, model:'a-10.glb', length:13.3, afterburner:false, nozzles:[[-2.15,.42,4.95,.42],[2.15,.42,4.95,.42]]}
];

const templates=new Map();
const loader=new GLTFLoader();
const textureLoader=new THREE.TextureLoader();
let exhaustTextures;

function plumeTexture(core=false){
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=512;
  const context=canvas.getContext('2d');
  const image=context.createImageData(canvas.width,canvas.height);
  const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
  for(let y=0;y<canvas.height;y++){
    const distance=1-y/(canvas.height-1);
    const envelope=Math.pow(1-distance,1.65)*clamp(distance*14+.55);
    const cell=Math.exp(-Math.pow((distance-.23)/.075,2))+.76*Math.exp(-Math.pow((distance-.53)/.09,2));
    const hot=Math.exp(-Math.pow(distance/.145,2));
    for(let x=0;x<canvas.width;x++){
      const around=x/(canvas.width-1)*Math.PI*2;
      const ripple=.72+.16*Math.sin(around*7+distance*47)+.1*Math.sin(around*13-distance*89)+.08*Math.sin(around*23+distance*171);
      const alpha=clamp(envelope*ripple*(core?.12+.94*cell+.8*hot:.29+.12*cell));
      const warmth=clamp(hot*.95+cell*.75);
      const offset=(y*canvas.width+x)*4;
      image.data[offset]=core?Math.round(173+82*warmth):139;
      image.data[offset+1]=core?Math.round(169+71*warmth):164;
      image.data[offset+2]=core?Math.round(250-101*warmth):248;
      image.data[offset+3]=Math.round(alpha*255);
    }
  }
  context.putImageData(image,0,0);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;
  return texture;
}

function throatTexture(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const context=canvas.getContext('2d');
  const glow=context.createRadialGradient(64,64,2,64,64,63);
  glow.addColorStop(0,'rgba(255,246,211,.88)');
  glow.addColorStop(.3,'rgba(255,213,154,.75)');
  glow.addColorStop(.65,'rgba(255,135,69,.24)');
  glow.addColorStop(1,'rgba(255,110,50,0)');
  context.fillStyle=glow;context.fillRect(0,0,128,128);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}

function plumeGeometry(length,radius,profile='outer'){
  const radial=24,axial=36,positions=[],uvs=[],indices=[];
  for(let row=0;row<=axial;row++){
    const t=row/axial;
    const first=Math.exp(-Math.pow((t-.23)/.1,2));
    const second=Math.exp(-Math.pow((t-.53)/.12,2));
    const shape=profile==='core' ? .67+.7*first+.49*second-.34*t : 1+.23*Math.sin(Math.PI*t)-.22*t;
    for(let column=0;column<=radial;column++){
      const angle=column/radial*Math.PI*2;
      const wobble=1+.085*Math.sin(t*31+angle*5)+.045*Math.sin(t*73-angle*11);
      const r=radius*shape*wobble;
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

function heatMaterial(map){
  const material=new MeshBasicNodeMaterial({transparent:true,depthWrite:false,side:THREE.FrontSide,opacity:.11});
  const mask=texture(map,uv()).a;
  const flow=uv().y.mul(52).sub(time.mul(31));
  const strength=mask.mul(.005);
  const offset=vec2(sin(flow.add(uv().x.mul(23))).mul(strength),sin(flow.mul(.71)).mul(strength.mul(.5)));
  // A shared viewport sample bends the city and sky behind the exhaust.
  material.colorNode=viewportSharedTexture(viewportSafeUV(screenUV.add(offset))).rgb;
  material.opacityNode=mask.mul(materialOpacity);
  return material;
}

function makeExhausts(spec){
  const exhausts=new THREE.Group();
  for(const [x,y,z,radius] of spec.nozzles){
    const plume=new THREE.Group();
    plume.position.set(x,y,z);
    plume.rotation.y=-Math.sign(x)*(spec.exhaustToeIn||0);
    if(spec.afterburner===false){
      // The A-10's turbofans do not have afterburners. Only a faint heat wake
      // is visible behind the nacelles at higher power settings.
      const heat=new THREE.Mesh(plumeGeometry(1.5,radius*.9),heatMaterial(exhaustTextures.outer));
      heat.userData.effect='heat';heat.userData.baseOpacity=.055;plume.add(heat);
      exhausts.add(plume);
      continue;
    }
    const liner=new THREE.Mesh(new THREE.CylinderGeometry(radius*.89,radius*.89,.25,24,1,true),new THREE.MeshBasicMaterial({color:0xd4783e,transparent:true,opacity:.2,depthWrite:false,side:THREE.DoubleSide}));
    liner.geometry.rotateX(Math.PI/2);liner.position.z=-.1;liner.userData.effect='liner';plume.add(liner);
    const throat=new THREE.Mesh(new THREE.CircleGeometry(radius*.78,32),new THREE.MeshBasicMaterial({map:exhaustTextures.throat,transparent:true,opacity:.62,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
    throat.position.z=-.16;throat.userData.effect='throat';plume.add(throat);
    for(const [effect,length,baseRadius,opacity,map] of [
      ['sheath',3.2,radius*.65,.27,exhaustTextures.outer],
      ['core',2.35,radius*.52,.3,exhaustTextures.core]
    ]){
      const mesh=new THREE.Mesh(plumeGeometry(length,baseRadius,effect),new THREE.MeshBasicMaterial({map,color:effect==='sheath'?0x9ebfff:0xffffff,transparent:true,opacity,depthWrite:false,blending:effect==='core'?THREE.AdditiveBlending:THREE.NormalBlending,side:THREE.DoubleSide}));
      mesh.userData.baseOpacity=opacity;
      mesh.userData.effect=effect;
      plume.add(mesh);
    }
    const heat=new THREE.Mesh(plumeGeometry(3.8,radius*.98),heatMaterial(exhaustTextures.outer));
    heat.userData.effect='heat';heat.userData.baseOpacity=.11;plume.add(heat);
    exhausts.add(plume);
  }
  exhausts.visible=false;
  return exhausts;
}

export function retractLandingGear(model){
  const extended=[];
  model.traverse(object=>{
    if(/-landingOn(?:Light)?_\d+$/i.test(object.name))extended.push(object);
  });
  for(const object of extended)object.removeFromParent();
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
  // Preserve the model's original center used by the hand-aligned exhausts.
  // Removing extended gear before measuring bounds shifts the jet vertically.
  retractLandingGear(model);
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

export async function loadJetModels(){
  let outer;
  try{
    outer=await textureLoader.loadAsync(`${import.meta.env.BASE_URL}assets/effects/afterburner-plasma.png`);
    outer.colorSpace=THREE.SRGBColorSpace;
    outer.anisotropy=4;
  }catch(error){console.warn('Afterburner texture unavailable; using procedural fallback',error);outer=plumeTexture();}
  exhaustTextures={outer,core:plumeTexture(true),throat:throatTexture()};
  await Promise.all(AIRCRAFT.map(loadOne));
}

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

export function updateAfterburners(jet,throttle,time,afterburner=false){
  // Dry thrust has a faint nozzle glow. The bright plume is a held boost.
  const boost=afterburner?1:0;
  const cruise=boost?1:THREE.MathUtils.clamp((throttle-.18)/.12,0,1);
  const intensity=cruise*boost;
  for(const exhaust of jet?.userData.afterburners||[]){
    if(exhaust.children[0]?.children[0]?.userData.effect==='heat'){
      exhaust.visible=throttle>.35;
      for(const plume of exhaust.children){
        plume.scale.z=.55+throttle*.45;
        plume.children[0].material.opacity=.015+throttle*.04;
      }
      continue;
    }
    exhaust.visible=cruise>.01;
    if(!exhaust.visible)continue;
    for(let index=0;index<exhaust.children.length;index++){
      const plume=exhaust.children[index];
      const flicker=1+.025*Math.sin(time*37+index*2.1)+.012*Math.sin(time*79-index);
      plume.scale.z=(.28+boost*.72)*flicker;
      plume.scale.x=plume.scale.y=.74+boost*.26;
      for(const mesh of plume.children){
        const effect=mesh.userData.effect;
        if(effect==='sheath'||effect==='core'||effect==='heat')mesh.visible=!!boost;
        const pulse=1+.045*Math.sin(time*(effect==='core'?53:31)+index*2.7);
        if(effect==='liner')mesh.material.opacity=cruise*(.035+.195*boost)*pulse;
        else if(effect==='throat')mesh.material.opacity=cruise*(.12+.5*boost)*pulse;
        else{mesh.material.opacity=mesh.userData.baseOpacity*intensity*pulse;mesh.rotation.z=.11*Math.sin(time*(effect==='core'?6.7:4.3)+index);}
      }
    }
  }
}
