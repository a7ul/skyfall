import * as THREE from 'three';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {TilesRenderer} from '3d-tiles-renderer';
import {LoadRegionPlugin,ReorientationPlugin,SphereRegion} from '3d-tiles-renderer/three/plugins';
import {createTraffic} from './traffic.js';
import {sampleCollisionHeight} from './collisionField.js';
import {approachTileError,tileErrorTarget} from './tileQuality.js';

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
  let resolveReady;
  const ready=new Promise(resolve=>{resolveReady=resolve;});
  tiles.addEventListener('load-root-tileset',()=>onProgress(0,1));
  tiles.addEventListener('load-model',({scene:tileScene})=>{
    // Aerial textures are often viewed at a grazing angle from the jet.
    tileScene?.traverse(object=>{
      if(!object.isMesh)return;
      for(const material of (Array.isArray(object.material)?object.material:[object.material])){
        if(material?.map)material.map.anisotropy=8;
      }
    });
    loaded++;onProgress(loaded,loaded);resolveReady();
  });
  tiles.addEventListener('load-error',event=>console.warn('Lyon tile failed',event));
  scene.add(tiles.group);
  const traffic=await createTraffic(scene,'/assets/lyon/traffic.json');
  const collisionHeight=(x,z)=>sampleCollisionHeight(collisionField,heights,x,z);
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
  }
  return {
    tiles,traffic,collisionHeight,ready,
    city:{get loadedCount(){return loaded;}},
    update,updateTiles,
    get quality(){const sorted=[...frameSamples].sort((a,b)=>a-b);return {errorTarget:tiles.errorTarget,frameMs:frameAverage,p95FrameMs:sorted[Math.floor(sorted.length*.95)]??0,cacheMB:Math.round(tiles.lruCache.cachedBytes/1048576),cacheLimitMB:Math.round(tiles.lruCache.maxBytesSize/1048576),deviceMemoryGB:navigator.deviceMemory??null,...tiles.stats};},
    setResolution
  };
}
