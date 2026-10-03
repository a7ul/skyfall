import * as THREE from 'three';
import {WebGPURenderer} from 'three/webgpu';
import {TilesRenderer} from '3d-tiles-renderer';
import {ReorientationPlugin} from '3d-tiles-renderer/three/plugins';
import {AIRCRAFT,createJet,loadJetModels} from './jet.js';
import {animateControlSurfaces} from './controlSurfaces.js';
import {keyboardAxes} from './inputMapping.js';
import {applyFlightInput} from './flightMath.js';
import {FlightAudio} from './audio.js';

const $=id=>document.getElementById(id);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(67,innerWidth/innerHeight,.5,12000);
const keys=new Set();
const quat=new THREE.Quaternion(),forward=new THREE.Vector3(0,0,-1),up=new THREE.Vector3(0,1,0);
const clock=new THREE.Clock(),audio=new FlightAudio();
let renderer,tiles,jet,mode='loading',throttle=.3,speed=32,cameraMode=0;
let loadedTiles=0;

async function init(){
  if(!navigator.gpu){$('status').textContent='WEBGPU IS UNAVAILABLE. OPEN IN CURRENT CHROME OR EDGE.';return;}
  try{
    renderer=new WebGPURenderer({antialias:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
    await renderer.init();$('game').appendChild(renderer.domElement);
    const [sky]=await Promise.all([
      new THREE.TextureLoader().loadAsync('/assets/sky.webp'),
      loadJetModels()
    ]);
    sky.mapping=THREE.EquirectangularReflectionMapping;sky.colorSpace=THREE.SRGBColorSpace;
    scene.background=sky;scene.fog=new THREE.FogExp2(0xb3bfbe,.00012);
    scene.add(new THREE.HemisphereLight(0xe1efff,0x5d655e,1.4));
    const sun=new THREE.DirectionalLight(0xffe7c6,2.1);sun.position.set(-500,700,-900);scene.add(sun);
    tiles=new TilesRenderer('/lyon-photomesh/tileset.json');
    tiles.errorTarget=12;
    tiles.registerPlugin(new ReorientationPlugin({lat:45.7578*Math.PI/180,lon:4.8320*Math.PI/180,height:170}));
    tiles.setCamera(camera);
    tiles.setResolution(camera,Math.floor(innerWidth*Math.min(devicePixelRatio,1.5)),Math.floor(innerHeight*Math.min(devicePixelRatio,1.5)));
    tiles.addEventListener('load-root-tileset',()=>{$('status').textContent='CITY INDEX READY · STREAMING TILES…';});
    tiles.addEventListener('load-model',()=>{
      loadedTiles++;
      if(mode==='loading'&&loadedTiles>=1){mode='ready';$('status').textContent='WEBGPU READY · CITY TILES STREAMING';$('launch').disabled=false;}
    });
    tiles.addEventListener('load-error',event=>{console.error('Lyon tile error',event);$('status').textContent='CITY TILE LOAD ERROR · CHECK LOCAL SERVER';});
    scene.add(tiles.group);
    jet=createJet(AIRCRAFT[0]);scene.add(jet);reset();
    animate();
  }catch(error){console.error(error);$('status').textContent=`LYON FAILED TO LOAD: ${error.message}`;}
}

function reset(){
  if(!jet)return;
  keys.clear();quat.identity();forward.set(0,0,-1);throttle=.3;speed=32;cameraMode=0;
  jet.position.set(0,260,500);jet.quaternion.identity();updateCamera();
  $('speed').textContent=String(Math.round(speed*1.944)).padStart(3,'0');
  $('altitude').textContent=String(Math.round(jet.position.y*3.281)).padStart(3,'0');
}
function start(){reset();audio.init();audio.ctx?.resume();mode='flight';$('intro').classList.add('hidden');$('pause').classList.add('hidden');$('hud').classList.remove('hidden');}
function togglePause(){if(mode==='flight'){mode='paused';keys.clear();$('pause').classList.remove('hidden');}else if(mode==='paused'){mode='flight';$('pause').classList.add('hidden');}}
function updateCamera(){
  if(!jet)return;
  const local=(cameraMode?new THREE.Vector3(0,.8,-3.2):new THREE.Vector3(0,3.5,19)).applyQuaternion(quat);
  camera.position.copy(jet.position).add(local);camera.up.copy(up);
  camera.lookAt(jet.position.clone().addScaledVector(forward,cameraMode?200:130));
  jet.visible=!cameraMode;
}
function update(dt){
  const input=keyboardAxes(keys);
  throttle=THREE.MathUtils.clamp(throttle+input.throttleInput*dt*.35,0,1);
  const desired=22+throttle*45;
  speed+=THREE.MathUtils.clamp(desired-speed,-28*dt,28*dt);
  applyFlightInput(quat,input,dt,AIRCRAFT[0].turn);
  jet.quaternion.copy(quat);animateControlSurfaces(jet,input,dt,false);
  forward.set(0,0,-1).applyQuaternion(quat).normalize();
  jet.position.addScaledVector(forward,speed*dt);
  jet.position.y=Math.max(25,jet.position.y);
  updateCamera();audio.update(throttle,speed);
  $('speed').textContent=String(Math.round(speed*1.944)).padStart(3,'0');
  $('altitude').textContent=String(Math.round(jet.position.y*3.281)).padStart(3,'0');
  $('message').textContent=`${loadedTiles} CITY TILES · PROGRESSIVE DETAIL`;
}
async function animate(){
  const dt=Math.min(clock.getDelta(),.05);
  if(mode==='flight')update(dt);
  camera.updateMatrixWorld();tiles.update();
  await renderer.renderAsync(scene,camera);
  requestAnimationFrame(animate);
}

$('launch').onclick=start;$('resume').onclick=togglePause;$('reset').onclick=()=>{reset();if(mode==='paused')togglePause();};
window.addEventListener('keydown',event=>{
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code))event.preventDefault();
  keys.add(event.code);if(event.repeat)return;
  if(['KeyP','Escape'].includes(event.code))togglePause();
  if(event.code==='KeyR'&&mode!=='loading')reset();
  if(event.code==='KeyC'&&mode==='flight')cameraMode=(cameraMode+1)%2;
});
window.addEventListener('keyup',event=>keys.delete(event.code));
window.addEventListener('blur',()=>{keys.clear();if(mode==='flight')togglePause();});
window.addEventListener('resize',()=>{if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);tiles.setResolution(camera,Math.floor(innerWidth*renderer.getPixelRatio()),Math.floor(innerHeight*renderer.getPixelRatio()));});
init();
