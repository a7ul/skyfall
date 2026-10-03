import * as THREE from 'three';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {TilesRenderer} from '3d-tiles-renderer';
import {ReorientationPlugin} from '3d-tiles-renderer/three/plugins';
import {createTraffic} from './traffic.js';
import {sampleCollisionHeight} from './collisionField.js';

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
  // The tileset's own screen-space selection progressively sharpens the city.
  tiles.errorTarget=8;
  tiles.registerPlugin(new ReorientationPlugin({lat:45.7578*Math.PI/180,lon:4.8320*Math.PI/180,height:170}));
  tiles.setCamera(camera);
  const setResolution=()=>tiles.setResolution(camera,Math.floor(innerWidth*renderer.getPixelRatio()),Math.floor(innerHeight*renderer.getPixelRatio()));
  setResolution();
  let loaded=0;
  let resolveReady;
  const ready=new Promise(resolve=>{resolveReady=resolve;});
  tiles.addEventListener('load-root-tileset',()=>onProgress(0,1));
  tiles.addEventListener('load-model',()=>{loaded++;onProgress(loaded,loaded);resolveReady();});
  tiles.addEventListener('load-error',event=>console.warn('Lyon tile failed',event));
  scene.add(tiles.group);
  const traffic=await createTraffic(scene,'/assets/lyon/traffic.json');
  const collisionHeight=(x,z)=>sampleCollisionHeight(collisionField,heights,x,z);
  return {
    tiles,traffic,collisionHeight,ready,
    city:{get loadedCount(){return loaded;}},
    update(dt,position){traffic.update(dt,position);},
    updateTiles(){camera.updateMatrixWorld();tiles.update();},
    setResolution
  };
}
