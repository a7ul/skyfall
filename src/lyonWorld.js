import * as THREE from 'three';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {TilesRenderer} from '3d-tiles-renderer';
import {LoadRegionPlugin,ReorientationPlugin,SphereRegion} from '3d-tiles-renderer/three/plugins';
import {createTraffic} from './traffic.js';
import {sampleCollisionHeight} from './collisionField.js';
import {approachTileError,tileErrorTarget} from './tileQuality.js';
import {fractureMesh} from './destruction.js';

export async function createLyonWorld(scene,onProgress=()=>{},renderer,camera){
  const loader=new THREE.TextureLoader();
  const [sky,lighting,collisionField,collisionBuffer]=await Promise.all([
    loader.loadAsync('/assets/sky.webp'),
    new HDRLoader().loadAsync('/assets/sky-lighting.hdr'),
    fetch('/assets/lyon/collision.json').then(r=>r.json()),
    fetch('/assets/lyon/collision.bin').then(r=>r.arrayBuffer())
  ]);
  const heights=new Int16Array(collisionBuffer);
  sky.mapping=THREE.EquirectangularReflectionMapping;sky.colorSpace=THREE.SRGBColorSpace;
  lighting.mapping=THREE.EquirectangularReflectionMapping;
  scene.background=sky;scene.backgroundIntensity=.85;
  scene.environment=lighting;scene.environmentIntensity=.75;
  scene.fog=new THREE.FogExp2(0xb3bfbe,.000095);
  scene.add(new THREE.HemisphereLight(0xe1efff,0x5d655e,1.25));
  const sun=new THREE.DirectionalLight(0xffe7c6,1.8);sun.position.set(-500,700,-900);scene.add(sun);

  const tiles=new TilesRenderer('/lyon-photomesh/tileset.json');
  // The camera gets finer visible tiles. A modest region ahead of the jet
  // loads the next blocks before they cross the frustum.
  tiles.errorTarget=9.5;
  tiles.errorFalloff=10;
  tiles.errorFalloffDensity=.001;
  tiles.downloadQueue.maxJobsPerOrigin=4;
  tiles.parseQueue.maxJobs=2;
  tiles.maxTilesProcessed=110;
  const memoryGB=navigator.deviceMemory||8;
  const cacheGB=Math.min(1.15,Math.max(.7,memoryGB*.14));
  tiles.lruCache.minBytesSize=cacheGB*.72*1024**3;
  tiles.lruCache.maxBytesSize=cacheGB*1024**3;
  const lookAhead=new SphereRegion({sphere:new THREE.Sphere(new THREE.Vector3(),300),errorTarget:12});
  const preloader=new LoadRegionPlugin();
  tiles.registerPlugin(preloader);
  tiles.registerPlugin(new ReorientationPlugin({lat:45.7578*Math.PI/180,lon:4.8320*Math.PI/180,height:170}));
  tiles.setCamera(camera);
  const setResolution=()=>tiles.setResolution(camera,Math.floor(innerWidth*renderer.getPixelRatio()),Math.floor(innerHeight*renderer.getPixelRatio()));
  setResolution();
  let loaded=0;
  const damageSites=[];
  const loadedScenes=new Set();
  const pendingDamageScenes=new Set();
  const appliedDamage=new WeakMap();
  let damageId=0;
  let resolveReady;
  const ready=new Promise(resolve=>{resolveReady=resolve;});
  let launchReady=false;
  let allowEarlyReady=false;
  const makeReady=()=>{if(!launchReady&&loaded>0){launchReady=true;resolveReady();}};
  const launchTimeout=setTimeout(()=>{allowEarlyReady=true;makeReady();},12000);
  tiles.addEventListener('load-root-tileset',()=>onProgress(0,1));
  tiles.addEventListener('load-model',({scene:tileScene})=>{
    // Aerial textures are often viewed at a grazing angle from the jet.
    tileScene?.traverse(object=>{
      if(!object.isMesh)return;
      for(const material of (Array.isArray(object.material)?object.material:[object.material])){
        if(material?.map)material.map.anisotropy=8;
      }
    });
    loaded++;onProgress(loaded,loaded);
    if(tileScene){
      loadedScenes.add(tileScene);
      if(damageSites.length)pendingDamageScenes.add(tileScene);
    }
    if(loaded>=90||allowEarlyReady){clearTimeout(launchTimeout);makeReady();}
  });
  tiles.addEventListener('dispose-model',({scene:tileScene})=>{
    loadedScenes.delete(tileScene);
    pendingDamageScenes.delete(tileScene);
  });
  tiles.addEventListener('load-error',event=>console.warn('Lyon tile failed',event));
  scene.add(tiles.group);
  const traffic=await createTraffic(scene,'/assets/lyon/traffic.json');
  const collisionHeight=(x,z)=>sampleCollisionHeight(collisionField,heights,x,z);
  // The OSM height field is only an approximation. Probe the actual loaded
  // photomesh for aircraft clearance and visible weapon impact placement.
  const cityRay=new THREE.Raycaster();cityRay.firstHitOnly=true;
  const down=new THREE.Vector3(0,-1,0);
  const sphere=new THREE.Sphere();
  function applyStoredDamage(tileScene){
    const originalParent=tileScene.parent;
    if(!originalParent)tileScene.parent=tiles.group;
    try{
      tileScene.updateWorldMatrix(true,true);
      tileScene.traverse(mesh=>{
        if(!mesh.isMesh||!mesh.geometry?.getAttribute('position'))return;
        if(!mesh.geometry.boundingSphere)mesh.geometry.computeBoundingSphere();
        sphere.copy(mesh.geometry.boundingSphere).applyMatrix4(mesh.matrixWorld);
        let applied=appliedDamage.get(mesh);
        for(const site of damageSites){
          if(applied?.has(site.id)||sphere.center.distanceTo(site.point)>sphere.radius+site.radius)continue;
          fractureMesh(mesh,site.point,site.radius,{makeFragments:false});
          if(!applied){applied=new Set();appliedDamage.set(mesh,applied);}
          applied.add(site.id);
        }
      });
    }finally{
      if(!originalParent)tileScene.parent=null;
    }
  }
  function fractureCity(hit,radius=12){
    if(!hit?.object?.isMesh)return [];
    const site={id:++damageId,point:hit.point.clone(),radius};
    damageSites.push(site);
    if(damageSites.length>120)damageSites.shift();
    for(const tileScene of loadedScenes)pendingDamageScenes.add(tileScene);
    const fragments=fractureMesh(hit.object,site.point,radius,{faceIndex:hit.faceIndex});
    let applied=appliedDamage.get(hit.object);
    if(!applied){applied=new Set();appliedDamage.set(hit.object,applied);}
    applied.add(site.id);
    return fragments;
  }
  function raycastCity(origin,direction,maxDistance=1200){
    cityRay.set(origin,direction);
    cityRay.far=maxDistance;
    return cityRay.intersectObject(tiles.group,false)[0]||null;
  }
  function visualHeight(x,z){
    const hit=raycastCity(new THREE.Vector3(x,1200,z),down,1500);
    return hit?.point.y??null;
  }
  const inverse=new THREE.Matrix4(),ahead=new THREE.Vector3();
  let frameAverage=16.7;
  const frameSamples=[];
  function update(dt,position,direction,speed=55,inFlight=false){
    traffic.update(dt,position);
    if(!position)return;
    if(!inFlight){preloader.removeRegion(lookAhead);return;}
    preloader.addRegion(lookAhead);
    tiles.group.updateMatrixWorld();
    inverse.copy(tiles.group.matrixWorld).invert();
    ahead.copy(position);
    if(direction)ahead.addScaledVector(direction,Math.min(700,Math.max(180,speed*3)));
    lookAhead.sphere.center.copy(ahead).applyMatrix4(inverse);
  }
  function updateTiles(frameMs=16.7,altitude=camera.position.y,inFlight=false){
    if(document.visibilityState==='visible'&&frameMs<250){
      frameAverage+=(frameMs-frameAverage)*.025;
      frameSamples.push(frameMs);
      if(frameSamples.length>120)frameSamples.shift();
    }
    const desired=tileErrorTarget(altitude,frameAverage,tiles.stats.refused>0,inFlight);
    tiles.errorTarget=approachTileError(tiles.errorTarget,desired,Math.min(frameMs/1000,.05));
    camera.updateMatrixWorld();tiles.update();
    if(damageSites.length&&pendingDamageScenes.size){
      tiles.group.updateWorldMatrix(true,false);
      const tileScene=pendingDamageScenes.values().next().value;
      pendingDamageScenes.delete(tileScene);
      applyStoredDamage(tileScene);
    }
  }
  return {
    tiles,traffic,collisionHeight,visualHeight,raycastCity,fractureCity,ready,
    city:{get loadedCount(){return loaded;}},
    update,updateTiles,
    get quality(){const sorted=[...frameSamples].sort((a,b)=>a-b);return {errorTarget:tiles.errorTarget,frameMs:frameAverage,p95FrameMs:sorted[Math.floor(sorted.length*.95)]??0,cacheMB:Math.round(tiles.lruCache.cachedBytes/1048576),cacheLimitMB:Math.round(tiles.lruCache.maxBytesSize/1048576),deviceMemoryGB:navigator.deviceMemory??null,...tiles.stats};},
    setResolution
  };
}
