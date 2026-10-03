import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {createTraffic} from './traffic.js';

const ASSET='/assets/helsinki/';
export function helsinkiTerrainHeight(x,z){return Math.abs(x)>1000||Math.abs(z)>1000?0:8;}

export async function createHelsinkiWorld(scene,onProgress=()=>{},renderer){
  const textureLoader=new THREE.TextureLoader();
  const [manifest,sky,lighting,oceanNormal]=await Promise.all([
    fetch(ASSET+'manifest.json').then(r=>{if(!r.ok)throw new Error('Helsinki mesh manifest missing');return r.json();}),
    textureLoader.loadAsync('/assets/sky.webp'),
    new HDRLoader().loadAsync('/assets/sky-lighting.hdr'),
    textureLoader.loadAsync('/assets/ocean-normal.png')
  ]);
  sky.mapping=THREE.EquirectangularReflectionMapping;sky.colorSpace=THREE.SRGBColorSpace;
  lighting.mapping=THREE.EquirectangularReflectionMapping;
  scene.background=sky;scene.backgroundIntensity=.86;scene.environment=lighting;scene.environmentIntensity=.68;
  scene.fog=new THREE.FogExp2(0xaabdc7,.000105);
  scene.add(new THREE.HemisphereLight(0xe2eaf0,0x50605c,.82));
  const sun=new THREE.DirectionalLight(0xffefd7,1.55);sun.position.set(-2300,4200,-3700);scene.add(sun);
  oceanNormal.wrapS=oceanNormal.wrapT=THREE.RepeatWrapping;oceanNormal.repeat.set(70,70);
  const sea=new THREE.Mesh(new THREE.PlaneGeometry(80000,80000),new THREE.MeshStandardMaterial({color:0x2b5b6d,metalness:.33,roughness:.43,normalMap:oceanNormal,normalScale:new THREE.Vector2(.12,.12)}));
  sea.rotation.x=-Math.PI/2;sea.position.y=-.5;scene.add(sea);
  const traffic=await createTraffic(scene);
  const loader=new GLTFLoader();
  const loaded=new Map(),pending=new Set(),ready=[];
  let nextCheck=0;

  function prepareMesh(group,depthBias){
    group.traverse(object=>{
      if(!object.isMesh)return;
      object.frustumCulled=true;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      object.material=materials.map(source=>{
        const material=source.map
          ? new THREE.MeshBasicMaterial({map:source.map.clone(),side:THREE.DoubleSide})
          : new THREE.MeshBasicMaterial({color:source.color??0x777777,side:THREE.DoubleSide});

        if(material.map){material.map.anisotropy=4;material.map.needsUpdate=true;}
        source.dispose();
        return material;
      });
      if(object.material.length===1)object.material=object.material[0];
    });
    return group;
  }
  function disposeTile(group){
    scene.remove(group);
    group.traverse(object=>{
      if(!object.isMesh)return;
      object.geometry.dispose();
      for(const material of (Array.isArray(object.material)?object.material:[object.material])){
        material.map?.dispose();material.dispose();
      }
    });
  }
  async function loadMesh(file,depthBias){
    const gltf=await loader.loadAsync(ASSET+file);
    gltf.scene.name=file;
    gltf.scene.position.y=depthBias===-3?.55:depthBias===-2?.3:0;
    return prepareMesh(gltf.scene,depthBias);
  }

  // Broad coverage is ready before the player can launch. It stays resident, so
  // crossing the city never causes a blank map or repeated large mesh uploads.
  const overview=[];
  const overviewTiles=manifest.overview||[];
  for(const tile of overviewTiles){
    const group=await loadMesh(tile.file,0);
    scene.add(group);overview.push(group);
    onProgress(overview.length,overviewTiles.length);
  }

  function applyTile(tile,detail,group){
    const key=tile.file,previous=loaded.get(key);
    group.traverse(object=>{
      if(!object.isMesh)return;
      for(const material of (Array.isArray(object.material)?object.material:[object.material])){
        if(material.map)renderer?.initTexture(material.map);
      }
    });
    if(previous)disposeTile(previous.group);
    scene.add(group);loaded.set(key,{group,detail});
  }
  async function loadTile(tile,detail,immediate=false){
    const key=tile.file;
    if(pending.has(key))return;
    pending.add(key);
    try{
      const group=await loadMesh(detail?tile.detail:tile.file,detail?-3:-2);
      if(immediate)applyTile(tile,detail,group);
      else ready.push({tile,detail,group});
    }catch(error){console.warn('Helsinki mesh tile failed',tile.file,error);}finally{pending.delete(key);}
  }
  async function warmup(position,onWarmup=()=>{}){
    const nearby=manifest.tiles
      .filter(tile=>Math.hypot(tile.x-position.x,tile.z-position.z)<=2000)
      .sort((a,b)=>Math.hypot(a.x-position.x,a.z-position.z)-Math.hypot(b.x-position.x,b.z-position.z));
    for(let i=0;i<nearby.length;i++){
      const tile=nearby[i];
      await loadTile(tile,!!tile.detail,true);
      onWarmup(i+1,nearby.length);
    }
  }
  function update(dt,position,direction){
    // GLTF decoding is asynchronous. Attach and retire render resources only
    // between renderAsync calls, never from a loader callback mid-frame.
    for(const item of ready.splice(0))applyTile(item.tile,item.detail,item.group);
    oceanNormal.offset.x=(oceanNormal.offset.x+dt*.0017)%1;
    oceanNormal.offset.y=(oceanNormal.offset.y+dt*.0011)%1;
    if(!position)return;
    traffic.update(dt,position);
    nextCheck-=dt;if(nextCheck>0)return;nextCheck=.12;
    const mediumRadius=position.y>850?2000:3000;
    const candidates=[];
    for(const tile of manifest.tiles){
      const distance=Math.hypot(tile.x-position.x,tile.z-position.z);
      const existing=loaded.get(tile.file);
      if(distance>mediumRadius+350){
        if(existing){disposeTile(existing.group);loaded.delete(tile.file);}
        continue;
      }
      if(distance>mediumRadius)continue;
      const wantsDetail=!!tile.detail&&distance<(existing?.detail?2200:2000)&&position.y<(existing?.detail?1050:850);
      if(existing?.detail===wantsDetail||pending.has(tile.file))continue;
      const ahead=direction?Math.max(0,(tile.x-position.x)*direction.x+(tile.z-position.z)*direction.z):0;
      candidates.push({tile,distance,wantsDetail,priority:distance-ahead*.35-(wantsDetail?350:0)});
    }
    if(pending.size>=2||!candidates.length)return;
    candidates.sort((a,b)=>a.priority-b.priority);
    for(const {tile,wantsDetail} of candidates.slice(0,2-pending.size))loadTile(tile,wantsDetail);
  }
  return {sea,city:{get loadedCount(){return overview.length+loaded.size;}},update,warmup};
}
