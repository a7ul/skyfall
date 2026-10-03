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
  // Keep the daylight panorama, reflections, and key light on the same side
  // of the initial flight path so the aircraft and rooftops read consistently.
  const skyYaw=3.8;
  scene.background=sky;scene.backgroundIntensity=1.02;scene.backgroundRotation.y=skyYaw;
  scene.environment=lighting;scene.environmentIntensity=.8;scene.environmentRotation.y=skyYaw;
  scene.fog=new THREE.FogExp2(0xc5d4dc,.000075);
  scene.add(new THREE.HemisphereLight(0xe2efff,0xa39682,1.35));
  const sun=new THREE.DirectionalLight(0xffe1bc,2.8);sun.position.set(-690,690,-900);scene.add(sun);

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
  const launchRegions=[
    new SphereRegion({sphere:new THREE.Sphere(new THREE.Vector3(),380),errorTarget:11}),
    new SphereRegion({sphere:new THREE.Sphere(new THREE.Vector3(),380),errorTarget:11}),
  ];
  const launchCenters=[new THREE.Vector3(0,145,550),new THREE.Vector3(0,430,950)];
  const preloader=new LoadRegionPlugin();
  tiles.registerPlugin(preloader);
  // The photomesh uses ellipsoid heights; its local street level is roughly
  // 52 m above the OSM roads. Recenter at the matching ellipsoid height.
  tiles.registerPlugin(new ReorientationPlugin({lat:45.7578*Math.PI/180,lon:4.8320*Math.PI/180,height:222}));
  tiles.setCamera(camera);
  const setResolution=()=>tiles.setResolution(camera,Math.floor(innerWidth*renderer.getPixelRatio()),Math.floor(innerHeight*renderer.getPixelRatio()));
  setResolution();
  let loaded=0;
  const damageSites=[];
  const blastZones=[];
  const loadedScenes=new Set();
  const pendingDamageScenes=new Set();
  let appliedDamage=new WeakMap();
  let originalGeometry=new WeakMap();
  let damageId=0;
  let resolveReady;
  const ready=new Promise(resolve=>{resolveReady=resolve;});
  let launchReady=false;
  let launchIdle=0;
  const makeReady=()=>{if(!launchReady){launchReady=true;resolveReady();}};
  tiles.addEventListener('load-root-tileset',()=>onProgress(0));
  tiles.addEventListener('load-model',({scene:tileScene})=>{
    // Aerial textures are often viewed at a grazing angle from the jet.
    tileScene?.traverse(object=>{
      if(!object.isMesh)return;
      for(const material of (Array.isArray(object.material)?object.material:[object.material])){
        if(material?.map)material.map.anisotropy=8;
      }
    });
    loaded++;onProgress(loaded);
    if(tileScene){
      loadedScenes.add(tileScene);
      if(damageSites.length)pendingDamageScenes.add(tileScene);
    }
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
  function rememberGeometry(mesh){
    if(originalGeometry.has(mesh))return;
    const index=mesh.geometry.getIndex(),position=mesh.geometry.getAttribute('position');
    originalGeometry.set(mesh,{index:index?.array.slice(),position:position?.array.slice()});
  }
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
          rememberGeometry(mesh);
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
  function collapseBuildingAt(hit,{replay=true,force=false}={}){
    if(!hit?.object?.isMesh)return null;
    // Photogrammetry facades and OSM footprints can differ by several metres.
    // Match in plan first; source roof heights are often also quite different.
    let building=buildingIndex.find(hit.point.x,hit.point.z,0,force?5:9);
    if(!building&&!force&&hit.point.y>7&&(hit.point.y>18||Math.abs(hit.face?.normal?.y??0)<.72)){
      const {x,z,y}=hit.point,half=8;
      building={id:`mesh-${damageId+1}`,height:y+8,polygon:[[x-half,z-half],[x+half,z-half],[x+half,z+half],[x-half,z+half]],minX:x-half,maxX:x+half,minZ:z-half,maxZ:z+half,collapsed:false};
    }
    if(!building||building.collapsed)return null;
    const centerX=(building.minX+building.maxX)/2,centerZ=(building.minZ+building.maxZ)/2;
    const visibleTop=visualHeight(centerX,centerZ);
    building.top=Math.max(building.height,visibleTop&&visibleTop>2?visibleTop:0);
    building.rubbleHeight=Math.min(4,Math.max(2,building.top*.08));
    const point=new THREE.Vector3(centerX,building.top*.5,centerZ);
    const radius=Math.hypot(building.maxX-building.minX,building.maxZ-building.minZ)*.5+building.top*.5+6;
    // If the OSM footprint misses the photomesh facade, keep the local-hit
    // behavior instead of hiding collision for a building still on screen.
    rememberGeometry(hit.object);
    let fragments=fractureMesh(hit.object,point,radius,{building,footprintMargin:typeof building.id==='string'?4.5:2.2});
    if(!fragments.length&&building.id>=0){
      // A footprint can still miss a slanted mesh facade. Use the struck
      // patch as a local structure proxy so the hit does not merely scorch.
      const {x,z,y}=hit.point,half=9;
      const proxy={...building,polygon:[[x-half,z-half],[x+half,z-half],[x+half,z+half],[x-half,z+half]],minX:x-half,maxX:x+half,minZ:z-half,maxZ:z+half,top:Math.max(y+8,building.top)};
      fragments=fractureMesh(hit.object,hit.point,20,{building:proxy,footprintMargin:4.5});
      if(fragments.length)building=proxy;
    }
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
  function resetDamage(){
    for(const tileScene of loadedScenes)tileScene.traverse(mesh=>{
      const saved=originalGeometry.get(mesh);
      if(!saved)return;
      const index=mesh.geometry.getIndex(),position=mesh.geometry.getAttribute('position');
      if(index&&saved.index){index.array.set(saved.index);index.needsUpdate=true;}
      if(position&&saved.position){position.array.set(saved.position);position.needsUpdate=true;}
    });
    damageSites.length=0;blastZones.length=0;pendingDamageScenes.clear();
    for(const building of buildingIndex.buildings)building.collapsed=false;
    appliedDamage=new WeakMap();originalGeometry=new WeakMap();
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
  traffic.setSurfaceSampler(visualHeight);
  const inverse=new THREE.Matrix4(),ahead=new THREE.Vector3();
  let frameAverage=16.7;
  const frameSamples=[];
  function update(dt,position,direction,speed=55,inFlight=false){
    traffic.update(dt,position);
    if(!position)return;
    if(!inFlight){
      preloader.removeRegion(lookAhead);
      tiles.group.updateMatrixWorld();
      inverse.copy(tiles.group.matrixWorld).invert();
      for(let i=0;i<launchRegions.length;i++){
        launchRegions[i].sphere.center.copy(launchCenters[i]).applyMatrix4(inverse);
        preloader.addRegion(launchRegions[i]);
      }
      return;
    }
    for(const region of launchRegions)preloader.removeRegion(region);
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
    if(!launchReady){
      const stats=tiles.stats;
      const idle=loaded>=90&&!tiles.isLoading&&stats.queued===0&&stats.downloading===0&&stats.parsing===0;
      launchIdle=idle?launchIdle+Math.min(frameMs/1000,.05):0;
      if(launchIdle>=.65)makeReady();
    }
    if(damageSites.length&&pendingDamageScenes.size){
      tiles.group.updateWorldMatrix(true,false);
      const tileScene=pendingDamageScenes.values().next().value;
      pendingDamageScenes.delete(tileScene);
      applyStoredDamage(tileScene);
    }
  }
  return {
    tiles,traffic,collisionHeight,visualHeight,raycastCity,collapseBuildingAt,blastBuildingCandidates,blastRubbleSites,flattenArea,replayDamage,resetDamage,ready,
    city:{get loadedCount(){return loaded;}},
    update,updateTiles,
    get quality(){const sorted=[...frameSamples].sort((a,b)=>a-b);return {errorTarget:tiles.errorTarget,frameMs:frameAverage,p95FrameMs:sorted[Math.floor(sorted.length*.95)]??0,cacheMB:Math.round(tiles.lruCache.cachedBytes/1048576),cacheLimitMB:Math.round(tiles.lruCache.maxBytesSize/1048576),deviceMemoryGB:navigator.deviceMemory??null,...tiles.stats};},
    setResolution
  };
}
