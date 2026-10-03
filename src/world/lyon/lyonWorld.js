import * as THREE from 'three';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {TilesRenderer} from '3d-tiles-renderer';
import {LoadRegionPlugin,ReorientationPlugin,SphereRegion} from '3d-tiles-renderer/three/plugins';
import {createTraffic} from './traffic.js';
import {sampleCollisionHeight} from './collisionField.js';
import {approachTileError,tileErrorTarget} from './tileQuality.js';
import {fractureMesh} from '../../gameplay/combat/destruction.js';
import {createBuildingIndex,distanceToFootprint} from './buildings.js';
import {blastRubbleHeight} from '../../gameplay/combat/nuclearBlast.js';

export async function createLyonWorld(scene,onProgress=()=>{},renderer,camera){
  const asset=path=>`${import.meta.env.BASE_URL}${path}`;
  const loader=new THREE.TextureLoader();
  const [sky,lighting,collisionField,collisionBuffer,buildingData]=await Promise.all([
    loader.loadAsync(asset('assets/environment/sky.webp')),
    new HDRLoader().loadAsync(asset('assets/environment/sky-lighting.hdr')),
    fetch(asset('assets/city/lyon/collision.json')).then(r=>r.json()),
    fetch(asset('assets/city/lyon/collision.bin')).then(r=>r.arrayBuffer()),
    fetch(asset('assets/city/lyon/buildings.json')).then(r=>r.json())
  ]);
  const heights=new Int16Array(collisionBuffer);
  const buildingIndex=createBuildingIndex(buildingData.buildings);
  sky.mapping=THREE.EquirectangularReflectionMapping;sky.colorSpace=THREE.SRGBColorSpace;
  lighting.mapping=THREE.EquirectangularReflectionMapping;
  scene.background=sky;scene.backgroundIntensity=.96;
  scene.environment=lighting;scene.environmentIntensity=.78;
  scene.fog=new THREE.FogExp2(0xcdb9a9,.000105);
  scene.add(new THREE.HemisphereLight(0xcddce9,0x8b7868,1.15));
  // Keep the key light near the photographed sun for a warm, low-angle pass.
  const sun=new THREE.DirectionalLight(0xffc991,2.22);sun.position.set(950,155,650);scene.add(sun);

  const tiles=new TilesRenderer(asset('lyon-photomesh/tileset.json'));
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
  const blastZones=[];
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
  const traffic=await createTraffic(scene,asset('assets/city/lyon/traffic.json'));
  const collisionHeight=(x,z)=>{
    let height=sampleCollisionHeight(collisionField,heights,x,z);
    for(const building of buildingIndex.nearby(x,z)){
      if(building.collapsed&&distanceToFootprint(x,z,building)<.5)height=Math.min(height,building.rubbleHeight);
    }
    for(const zone of blastZones){
      const ceiling=blastRubbleHeight(Math.hypot(x-zone.x,z-zone.z),zone.core,zone.outer);
      height=Math.min(height,ceiling);
    }
    return height;
  };
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
          fractureMesh(mesh,site.point,site.radius,{makeFragments:false,building:site.building,blastZone:site.blastZone});
          if(!applied){applied=new Set();appliedDamage.set(mesh,applied);}
          applied.add(site.id);
        }
      });
    }finally{
      if(!originalParent)tileScene.parent=null;
    }
  }
  function replayDamage(){
    for(const tileScene of loadedScenes)pendingDamageScenes.add(tileScene);
  }
  function fractureCity(hit,radius=12,{replay=true}={}){
    if(!hit?.object?.isMesh)return [];
    const site={id:++damageId,point:hit.point.clone(),radius};
    damageSites.push(site);
    if(damageSites.length>120){
      const oldestLocal=damageSites.findIndex(entry=>!entry.building&&!entry.blastZone);
      if(oldestLocal>=0)damageSites.splice(oldestLocal,1);
    }
    if(replay)replayDamage();
    const fragments=fractureMesh(hit.object,site.point,radius,{faceIndex:hit.faceIndex});
    let applied=appliedDamage.get(hit.object);
    if(!applied){applied=new Set();appliedDamage.set(hit.object,applied);}
    applied.add(site.id);
    return fragments;
  }
  function collapseBuildingAt(hit,{replay=true,force=false}={}){
    if(!hit?.object?.isMesh)return null;
    const building=buildingIndex.find(hit.point.x,hit.point.z,force?0:hit.point.y,3);
    if(!building||(!force&&hit.point.y>Math.max(7,building.height*.3)))return null;
    const centerX=(building.minX+building.maxX)/2,centerZ=(building.minZ+building.maxZ)/2;
    const visibleTop=visualHeight(centerX,centerZ);
    building.top=Math.max(building.height,visibleTop&&visibleTop>2?visibleTop:0);
    building.rubbleHeight=Math.min(4,Math.max(2,building.top*.08));
    const point=new THREE.Vector3(centerX,building.top*.5,centerZ);
    const radius=Math.hypot(building.maxX-building.minX,building.maxZ-building.minZ)*.5+building.top*.5+6;
    // If the OSM footprint misses the photomesh facade, keep the local-hit
    // behavior instead of hiding collision for a building still on screen.
    const fragments=fractureMesh(hit.object,point,radius,{building});
    if(!fragments.length)return null;
    building.collapsed=true;
    const site={id:++damageId,point,radius,building};
    damageSites.push(site);
    if(replay)replayDamage();
    // Remove the struck mesh immediately. Other currently loaded tiles, and
    // higher detail replacements, receive the same cut one tile per frame.
    let applied=appliedDamage.get(hit.object);
    if(!applied){applied=new Set();appliedDamage.set(hit.object,applied);}
    applied.add(site.id);
    let struckTile=hit.object;
    while(struckTile&&!loadedScenes.has(struckTile))struckTile=struckTile.parent;
    if(struckTile){applyStoredDamage(struckTile);pendingDamageScenes.delete(struckTile);}
    return {building,point,fragments};
  }
  function blastBuildingCandidates(position,radius=360){
    return buildingIndex.buildings.filter(building=>{
      const x=(building.minX+building.maxX)/2,z=(building.minZ+building.maxZ)/2;
      return !building.collapsed&&building.height>=18&&Math.hypot(x-position.x,z-position.z)<radius*.85;
    }).sort((a,b)=>b.height-a.height).slice(0,12).map(building=>({
      x:(building.minX+building.maxX)/2,z:(building.minZ+building.maxZ)/2,height:building.height
    })).sort((a,b)=>Math.hypot(a.x-position.x,a.z-position.z)-Math.hypot(b.x-position.x,b.z-position.z));
  }
  function blastRubbleSites(position,radius=210){
    const radiusSq=radius*radius;
    return buildingIndex.buildings.filter(building=>{
      const x=(building.minX+building.maxX)/2,z=(building.minZ+building.maxZ)/2;
      return (x-position.x)**2+(z-position.z)**2<radiusSq;
    }).map(building=>({
      x:(building.minX+building.maxX)/2,z:(building.minZ+building.maxZ)/2,
      width:building.maxX-building.minX,depth:building.maxZ-building.minZ,height:building.height
    }));
  }
  function flattenArea(position,core=210,outer=360){
    const blastZone={x:position.x,z:position.z,core,outer};
    blastZones.push(blastZone);
    const site={id:++damageId,point:new THREE.Vector3(position.x,50,position.z),radius:outer+150,blastZone};
    damageSites.push(site);
    replayDamage();
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
    tiles,traffic,collisionHeight,visualHeight,raycastCity,fractureCity,collapseBuildingAt,blastBuildingCandidates,blastRubbleSites,flattenArea,replayDamage,ready,
    city:{get loadedCount(){return loaded;}},
    update,updateTiles,
    get quality(){const sorted=[...frameSamples].sort((a,b)=>a-b);return {errorTarget:tiles.errorTarget,frameMs:frameAverage,p95FrameMs:sorted[Math.floor(sorted.length*.95)]??0,cacheMB:Math.round(tiles.lruCache.cachedBytes/1048576),cacheLimitMB:Math.round(tiles.lruCache.maxBytesSize/1048576),deviceMemoryGB:navigator.deviceMemory??null,...tiles.stats};},
    setResolution
  };
}
