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

async function loadOne(spec){
  const gltf=await loader.loadAsync(`/assets/aircraft/${spec.model}`);
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
  // The effect meshes are cached with the airframe and cloned for each aircraft.
  const exhausts=new THREE.Group();
  const offsets=spec.engines===1?[0]:[-.57,.57];
  for(const x of offsets){
    const plume=new THREE.Group();
    plume.position.set(x,-.05,spec.length*.49+.35);
    for(const [radius,length,color,opacity,offset] of [[.43,2.8,0x3984ff,.38,1.0],[.26,2.2,0x75d6ff,.68,.85],[.12,1.55,0xe5f9ff,.9,.58]]){
      const flame=new THREE.Mesh(new THREE.ConeGeometry(radius,length,16,1,true),new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
      flame.rotation.x=Math.PI/2;
      flame.position.z=offset;
      plume.add(flame);
    }
    exhausts.add(plume);
  }
  exhausts.visible=false;
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
  bindControlSurfaces(root);
  return root;
}
