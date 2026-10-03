import * as THREE from 'three';
import {WebGPURenderer} from 'three/webgpu';
import {AIRCRAFT,createJet,loadJetModels,updateAfterburners} from '../gameplay/aircraft/jet.js';
import {animateControlSurfaces} from '../gameplay/aircraft/controlSurfaces.js';
import {createLyonWorld as createWorld} from '../world/lyon/lyonWorld.js';
import {createRadar,createEnemy,createExtraction,terrainHeight} from '../mission/entities.js';
import {FlightAudio} from '../audio/flightAudio.js';
import {applyFlightInput,compassHeading} from '../gameplay/flight/flightMath.js';
import {keyboardAxes} from '../gameplay/flight/inputMapping.js';
import {targetAirspeed,advanceAirspeed} from '../gameplay/flight/flightPerformance.js';
import {chooseLockTarget} from '../gameplay/combat/targeting.js';
import {enemyHasShot,segmentHitsSphere} from '../gameplay/combat/combatMath.js';
import {firstHeightIntersection,resolveSurfaceContact} from '../world/lyon/collisionField.js';
import {advanceBomb,predictBombImpact,sampleBombPath} from '../gameplay/combat/bombMath.js';
import {advanceMissile} from '../gameplay/combat/missileFlight.js';
import {createMissileTrail,updateMissileTrail,disposeMissileTrail} from '../gameplay/combat/missileTrail.js';
import {shockRadius} from '../gameplay/combat/nuclearBlast.js';
import {createRubbleField} from '../gameplay/combat/rubbleField.js';

const $=id=>document.getElementById(id);
const ui={menu:$('menu'),hud:$('hud'),overlay:$('overlay'),gpu:$('gpu-status'),options:$('jet-options'),detail:$('jet-detail'),count:$('jet-count'),volume:$('volume'),volumeValue:$('volume-value')};
const audio=new FlightAudio();
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(67,innerWidth/innerHeight,.5,50000);
let renderer,world,selected=0,jet,previewJet,mode='menu',paused=false,ended=false,phase=0,elapsed=0,kills=0,shots=0,missiles=6,bombAmmo=4,nuclearAmmo=1,health=100,throttle=.55,speed=68,pitch=0,yaw=0,roll=0,gunTime=0,gunCooldown=0,missileCooldown=0,bombCooldown=0,lockTime=0,target=null,radars=[],enemies=[],enemyShots=[],extraction=null,projectiles=[],bombProjectiles=[],nuclearEffects=[],bullets=[],particles=[],damageMarks=[],wrecks=[],fires=[],debris=[],cameraMode=0,radioTime=0,radioText='',lastWarning=0,mouseX=0,mouseY=0,mouseActive=false,gamepadWasPressed=false,bombWasPressed=false,nukeWasPressed=false,airbrake=false,hudTimer=0,cityFloor=-100,cityFloorTimer=0,weaponCueTimer=0,cameraShake=0,blastFlash=0;
const flightControls={pitchInput:0,rollInput:0,yawInput:0};
const keys=new Set();const forward=new THREE.Vector3(),quat=new THREE.Quaternion(),tmp=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);const euler=new THREE.Euler(0,0,0,'YXZ');const clock=new THREE.Clock();
const clamp=THREE.MathUtils.clamp;
const surfaceHeight=(x,z)=>Math.max(terrainHeight(x,z),world?.collisionHeight?.(x,z)??-100);
const debugOutput=import.meta.env.DEV&&new URLSearchParams(location.search).has('debug')?document.createElement('output'):null;
let lastDebug=0;
if(debugOutput){debugOutput.id='skyfall-debug';debugOutput.hidden=true;document.body.appendChild(debugOutput);}

function setRadio(message){radioText=message;radioTime=elapsed;$('radio').textContent=message;}
function updateJetOptions(){ui.options.innerHTML='';AIRCRAFT.forEach((spec,i)=>{const b=document.createElement('button');b.className='jet-option'+(selected===i?' active':'');b.innerHTML=`<small>0${i+1} / ${spec.role.split(' ')[0]}</small><strong>${spec.label}</strong>`;b.onclick=()=>{selected=i;audio.click();updateJetOptions();setPreviewJet();};ui.options.appendChild(b)});const a=AIRCRAFT[selected];ui.count.textContent=`0${selected+1} / 04`;ui.detail.textContent=`${a.origin}  /  ${a.role}  /  SPEED ${Math.round(a.speed*100)}  /  AGILITY ${Math.round(a.turn*100)}`;}
function setPreviewJet(){if(previewJet)removeObject(previewJet);previewJet=createJet(AIRCRAFT[selected],2.15);previewJet.position.set(0,180,300);previewJet.rotation.set(.02,-.18,-.12);scene.add(previewJet);}

async function init(){
  updateJetOptions();
  audio.preload().catch(error=>console.warn('Flight audio preload failed:',error));
  $('start-mission').disabled=true;$('start-free').disabled=true;
  if(!navigator.gpu){ui.gpu.textContent='WEBGPU IS UNAVAILABLE IN THIS BROWSER. USE A CURRENT CHROME OR EDGE BUILD WITH GPU ACCELERATION.';ui.gpu.classList.add('error');$('start-mission').disabled=true;$('start-free').disabled=true;return;}
  try{renderer=new WebGPURenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;await renderer.init();$('game').appendChild(renderer.domElement);ui.gpu.textContent='STREAMING LYON CITY…';await Promise.all([createWorld(scene,(done)=>ui.gpu.textContent=done?`LYON CITY · ${done} TILES LOADED`:'LYON CITY INDEX READY · STREAMING…',renderer,camera).then(value=>world=value),loadJetModels()]);setPreviewJet();animate();await world.ready;ui.gpu.textContent='WEBGPU READY · LYON TILES STREAMING';$('start-mission').disabled=false;$('start-free').disabled=false;}
  catch(error){console.error(error);ui.gpu.textContent=`WEBGPU INITIALIZATION FAILED: ${error.message}`;ui.gpu.classList.add('error');$('start-mission').disabled=true;$('start-free').disabled=true;}
}

function removeObject(object){if(!object)return;scene.remove(object);if(object.userData.afterburners){for(const exhaust of object.userData.afterburners)exhaust.traverse(child=>{if(child.isMesh)child.material.dispose();});return;}object.traverse(child=>{if(child.isMesh){child.geometry.dispose();const materials=Array.isArray(child.material)?child.material:[child.material];for(const material of materials)material?.dispose();}});}
function clearSceneObjects(){removeObject(jet);jet=null;removeObject(previewJet);previewJet=null;for(const t of [...radars,...enemies])removeObject(t.group);for(const m of [...projectiles,...bombProjectiles,...bullets])removeObject(m.mesh);for(const m of projectiles)disposeMissileTrail(scene,m.trail);for(const effect of nuclearEffects)disposeNuclearEffect(effect);for(const shot of enemyShots)removeObject(shot.mesh);for(const p of particles){scene.remove(p.mesh);if(!p.sharedGeometry)p.mesh.geometry.dispose();p.mesh.material.dispose();}for(const mark of damageMarks){scene.remove(mark);mark.geometry.dispose();mark.material.dispose();}for(const wreck of wrecks)removeObject(wreck.group);for(const fire of fires){scene.remove(fire.mesh);fire.mesh.material.dispose();}for(const piece of debris)removeObject(piece.mesh);world?.traffic?.reset();if(extraction)removeObject(extraction.group);radars=[];enemies=[];enemyShots=[];projectiles=[];bombProjectiles=[];nuclearEffects=[];bullets=[];particles=[];damageMarks=[];wrecks=[];fires=[];debris=[];extraction=null;blastFlash=0;$('blast-flash').style.opacity='0';$('nuke-countdown').classList.add('hidden');}
function start(free=false){if(!renderer)return;audio.setGunFiring(false);clearSceneObjects();audio.init();audio.ctx?.resume();audio.setActive(true);mode=free?'free':'mission';paused=false;ended=false;phase=0;elapsed=0;kills=0;shots=0;missiles=free?99:6;bombAmmo=free?99:4;nuclearAmmo=free?Infinity:1;bombCooldown=0;health=100;throttle=free?.3:.68;speed=targetAirspeed(throttle,AIRCRAFT[selected].speed);pitch=0;yaw=0;roll=0;flightControls.pitchInput=flightControls.rollInput=flightControls.yawInput=0;quat.identity();forward.set(0,0,-1);lockTime=0;target=null;cameraMode=0;mouseActive=false;mouseX=0;mouseY=0;gamepadWasPressed=bombWasPressed=nukeWasPressed=false;airbrake=false;hudTimer=0;cityFloor=-100;cityFloorTimer=0;weaponCueTimer=0;cameraShake=0;jet=createJet(AIRCRAFT[selected]);jet.position.set(0,free?145:430,free?550:950);scene.add(jet);if(!free){radars=[createRadar(scene,-180,-320,'RELAY ALPHA',surfaceHeight(-180,-320)),createRadar(scene,520,-760,'RELAY BRAVO',surfaceHeight(520,-760))];setRadio('Viper One, this is Echo. Two hostile relay sites are jamming the Lyon evacuation corridor. Silence them.');}else{setRadio('Free flight authorized. Weapons free. Fire a missile with or without a lock.');}
  ui.menu.classList.add('hidden');ui.overlay.classList.add('hidden');ui.hud.classList.remove('hidden');$('mode-label').textContent=free?'FREE FLIGHT':'MISSION 01';$('mission-name').textContent=free?'LYON // FREE FLIGHT':'BREAK THE SILENCE';updateObjective();updateCamera(1);updateHud();audio.click();}
function hangar(){audio.setActive(false);paused=false;mode='menu';clearSceneObjects();setPreviewJet();ui.overlay.classList.add('hidden');ui.hud.classList.add('hidden');ui.menu.classList.remove('hidden');document.exitPointerLock?.();}
function finish(win){audio.setActive(false);paused=true;ended=true;document.exitPointerLock?.();$('overlay-kicker').textContent=win?'MISSION COMPLETE':'AIRCRAFT LOST';$('overlay-title').textContent=win?'THE STRAIT IS OPEN':'SIGNAL LOST';$('overlay-text').textContent=win?'The radar net is silent and the evacuation route is clear. Echo confirms the convoy is moving.':'Echo has lost your transponder. The operation will have to be flown again.';$('overlay-stats').innerHTML=`<span>TIME ${formatTime(elapsed)}</span><span>TARGETS ${kills}</span><span>MISSILES FIRED ${shots}</span>`;$('pause-controls').classList.add('hidden');$('resume-button').classList.add('hidden');ui.overlay.classList.remove('hidden');if(win)audio.tone(460,.55,'triangle',.13,860);}
function showPause(){if(mode==='menu'||ended)return;paused=!paused;audio.setActive(!paused);$('overlay-kicker').textContent='FLIGHT PAUSED';$('overlay-title').textContent='SYSTEMS HOLD';$('overlay-text').textContent='Flight paused. Review the controls below.';$('overlay-stats').innerHTML=`<span>TIME ${formatTime(elapsed)}</span><span>TARGETS ${kills}</span><span>HULL ${Math.ceil(health)}%</span>`;$('pause-controls').classList.remove('hidden');$('resume-button').classList.remove('hidden');ui.overlay.classList.toggle('hidden',!paused);if(paused){keys.clear();document.exitPointerLock?.();}}
function formatTime(t){return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;}

function updateObjective(){let title,progress;if(mode==='free'){title='FLY / EXPLORE LYON';progress=100;}else if(phase===0){title='DESTROY RELAY SITES';progress=(2-radars.filter(r=>r.alive).length)/2*100;}else if(phase===1){title='CLEAR HOSTILE AIRCRAFT';progress=(2-enemies.filter(e=>e.alive).length)/2*100;}else{title='REACH EXTRACTION';progress=0;}$('objective').textContent=title;$('objective-progress').style.width=`${progress}%`;}
function advanceMission(){if(mode!=='mission')return;if(phase===0&&radars.every(r=>!r.alive)){phase=1;missiles=Math.max(missiles,4);const p=jet.position.clone().addScaledVector(forward,1750);enemies=[createEnemy(scene,p.x-650,Math.max(p.y+110,570),p.z-100,0),createEnemy(scene,p.x+690,Math.max(p.y+60,520),p.z-370,1)];setRadio('Relay net down. Bandits approaching from both sides. Bank toward a contact, then pull to bring it into your sight.');audio.warning();updateObjective();}else if(phase===1&&enemies.every(e=>!e.alive)){phase=2;missiles=Math.max(missiles,2);const p=jet.position.clone().addScaledVector(forward,1900).add(new THREE.Vector3(380,0,0));extraction=createExtraction(scene,p.x,p.z,jet.position.y);setRadio('Airspace clear. Turn toward the green extraction gate. The convoy is moving.');updateObjective();}}
function onTargetDestroyed(t){
  if(t.type==='car'){destroyCar(t);return;}
  t.alive=false;kills++;
  if(t.type==='radar'){
    breakRadar(t);
    ignite(t.position,12);
  }else scene.remove(t.group);
  explode(t.position,1.5);audio.explosion();
  const remaining=t.type==='radar'?radars.filter(r=>r.alive).length:enemies.filter(e=>e.alive).length;
  setRadio(t.type==='radar'?`${t.name} destroyed. ${remaining} relay site${remaining===1?'':'s'} remain${remaining===1?'s':''}.`:`${t.name} splashed. ${remaining} hostile aircraft remain${remaining===1?'s':''}.`);
  advanceMission();updateObjective();
}

function getControls(){const gp=navigator.getGamepads?.()[0];let {pitchInput,rollInput,yawInput,throttleInput}=keyboardAxes(keys),fire=keys.has('Space')||keys.has('MouseLeft'),missile=keys.has('KeyF')||keys.has('MouseRight'),bomb=keys.has('KeyB'),nuke=keys.has('KeyN');if(mouseActive){pitchInput=clamp(pitchInput+mouseY*.7,-1,1);rollInput=clamp(rollInput-mouseX*.7,-1,1);}if(gp){const dz=a=>Math.abs(a)<.12?0:a;pitchInput=clamp(pitchInput+dz(gp.axes[1]||0),-1,1);rollInput=clamp(rollInput-dz(gp.axes[0]||0),-1,1);yawInput=clamp(yawInput+(gp.buttons[4]?.pressed?1:0)-(gp.buttons[5]?.pressed?1:0),-1,1);throttleInput=clamp(throttleInput+(gp.buttons[7]?.value||0)-(gp.buttons[6]?.value||0),-1,1);fire=fire||gp.buttons[0]?.pressed;missile=missile||gp.buttons[1]?.pressed;bomb=bomb||gp.buttons[2]?.pressed;nuke=nuke||gp.buttons[3]?.pressed;}return{pitchInput,rollInput,yawInput,throttleInput,fire,missile,bomb,nuke};}
function updateFlight(dt){
  const c=getControls(),spec=AIRCRAFT[selected];
  throttle=clamp(throttle+c.throttleInput*dt*.34,.2,1);
  for(const axis of ['pitchInput','rollInput','yawInput'])flightControls[axis]=THREE.MathUtils.damp(flightControls[axis],c[axis],12,dt);
  speed=advanceAirspeed(speed,throttle,spec.speed,airbrake,forward.y,flightControls,dt);
  applyFlightInput(quat,flightControls,dt,spec.turn,speed,airbrake);
  jet.quaternion.copy(quat);
  animateControlSurfaces(jet,flightControls,dt,airbrake);
  forward.set(0,0,-1).applyQuaternion(quat).normalize();
  yaw=Math.atan2(-forward.x,-forward.z);
  euler.setFromQuaternion(quat,'YXZ');pitch=euler.x;roll=euler.z;
  if(mouseActive){const returnRate=Math.exp(-dt*5);mouseX*=returnRate;mouseY*=returnRate;}
  const previousPosition=jet.position.clone();
  jet.position.addScaledVector(forward,speed*dt);
  jet.position.y-=Math.max(0,44-speed)*.48*dt;
  updateAfterburners(jet,throttle,elapsed,airbrake);
  const right=tmp.set(1,0,0).applyQuaternion(quat);
  cityFloorTimer-=dt;
  if(cityFloorTimer<=0){
    cityFloorTimer=.12;
    const here=world?.visualHeight?.(jet.position.x,jet.position.z);
    const ahead=world?.visualHeight?.(jet.position.x+forward.x*7,jet.position.z+forward.z*7);
    cityFloor=Math.max(here??-100,ahead??-100);
  }
  const floor=Math.max(-1.4,cityFloor,
    surfaceHeight(jet.position.x,jet.position.z),
    surfaceHeight(previousPosition.x,previousPosition.z),
    surfaceHeight(jet.position.x+forward.x*7,jet.position.z+forward.z*7),
    surfaceHeight(jet.position.x+right.x*6,jet.position.z+right.z*6),
    surfaceHeight(jet.position.x-right.x*6,jet.position.z-right.z*6));
  if(resolveSurfaceContact(jet.position,floor)){health=0;explode(jet.position,2);audio.explosion();finish(false);return;}
  if(jet.position.y-floor<35&&forward.y<-.04&&elapsed-lastWarning>3){setRadio('Terrain! Pull up!');audio.warning();lastWarning=elapsed;}
  if(speed<42&&elapsed-lastWarning>5){setRadio('Stall warning. Add throttle and lower the nose.');lastWarning=elapsed;}
  audio.setGunFiring(c.fire);
  if(c.fire)fireGun(dt);else gunTime=0;
  if(c.missile&&!gamepadWasPressed)fireMissile();gamepadWasPressed=!!c.missile;
  if(c.bomb&&!bombWasPressed)dropBomb(false);bombWasPressed=!!c.bomb;
  if(c.nuke&&!nukeWasPressed)dropBomb(true);nukeWasPressed=!!c.nuke;
  audio.update(throttle,speed);
}
function findTarget(){
  const clearCar=car=>{
    const aim=car.position.clone();aim.y+=car.height*.55;aim.sub(jet.position);
    const distance=aim.length();
    return firstHeightIntersection(surfaceHeight,jet.position,aim.normalize(),Math.max(0,distance-4))===null;
  };
  let car=null;
  if(target?.type==='car'&&target.alive&&target.visible){
    const delta=tmp.copy(target.position).sub(jet.position);
    delta.y+=target.height*.5;
    if(delta.length()<1800&&forward.angleTo(delta)<.18&&clearCar(target))car=target;
  }
  car ||= world?.traffic?.findLockTarget(jet.position,forward,1800,clearCar)||null;
  if(mode==='free')return car;
  return chooseLockTarget(phase===0?radars:enemies,car,jet.position,forward);
}
function updateLock(dt){const next=findTarget();if(next!==target){target=next;lockTime=0;}$('target-label').classList.toggle('hidden',!target);if(!target){$('lock-ring').classList.remove('active');return;}const distance=target.position.distanceTo(jet.position),angle=forward.angleTo(tmp.copy(target.position).sub(jet.position));const acquiring=angle<.31&&distance<6000;lockTime=clamp(lockTime+(acquiring?dt:-dt*1.8),0,1.35);const locked=lockTime>=1.35;$('lock-ring').classList.toggle('active',acquiring);$('lock-ring').style.opacity=acquiring?String(.3+lockTime/1.35*.7):'0';const projected=target.position.clone().project(camera);const label=$('target-label');label.style.left=clamp((projected.x*.5+.5)*innerWidth,140,innerWidth-140)+'px';label.style.top=clamp((-projected.y*.5+.5)*innerHeight+40,90,innerHeight-170)+'px';label.textContent=`${locked?'◆ LOCK':'◇ TRACK'}  ${target.name}  ${(distance/1000).toFixed(1)} KM`;if(locked&&lockTime-dt<1.35)audio.lock();}
function updateWeaponCue(dt){
  weaponCueTimer-=dt;if(weaponCueTimer>0)return;weaponCueTimer=.12;
  const locked=target?.alive&&lockTime>=1.35;
  const origin=jet.position.clone().addScaledVector(forward,12);
  let endpoint,distance;
  if(locked){endpoint=target.position.clone();if(target.type==='car')endpoint.y+=target.height*.5;distance=origin.distanceTo(endpoint);}
  else{
    const hit=world?.raycastCity?.(origin,forward,1900);
    const fieldDistance=firstHeightIntersection(surfaceHeight,origin,forward,1900,1);
    distance=Math.min(hit?.distance??Infinity,fieldDistance??Infinity,1900);
    endpoint=hit&&hit.distance<=distance?hit.point.clone():origin.clone().addScaledVector(forward,distance);
  }
  const state=$('weapon-state');state.classList.toggle('locked',!!locked);
  state.textContent=locked?`MSL LOCK · ${(distance/1000).toFixed(1)} KM`:`MSL FREE FIRE · ${distance<1900?(distance/1000).toFixed(1)+' KM':'OPEN SKY'}`;
  const svg=$('weapon-trajectory');svg.classList.toggle('locked',!!locked);svg.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);
  const screen=[];
  for(let i=0;i<=10;i++){
    const t=i/10;
    const point=origin.clone().lerp(endpoint,t);
    if(locked)point.addScaledVector(forward,Math.sin(t*Math.PI)*Math.min(110,distance*.13));
    const p=point.project(camera);
    if(p.z>=-1&&p.z<=1&&Math.abs(p.x)<2&&Math.abs(p.y)<2)screen.push(`${Math.round((p.x*.5+.5)*innerWidth)},${Math.round((-p.y*.5+.5)*innerHeight)}`);
  }
  $('weapon-path').setAttribute('points',screen.join(' '));
  const p=endpoint.project(camera),pipper=$('weapon-pipper');
  const visible=distance<1900&&p.z>=-1&&p.z<=1&&Math.abs(p.x)<=1&&Math.abs(p.y)<=1;
  pipper.classList.toggle('hidden',!visible);
  if(visible){pipper.style.left=`${(p.x*.5+.5)*innerWidth}px`;pipper.style.top=`${(-p.y*.5+.5)*innerHeight}px`;}
  const down=new THREE.Vector3(0,-1,0).applyQuaternion(quat);
  const bombOrigin=jet.position.clone().addScaledVector(down,3.1).addScaledVector(forward,2);
  const bombVelocity=forward.clone().multiplyScalar(speed).addScaledVector(down,9);
  const prediction=predictBombImpact(bombOrigin,bombVelocity,surfaceHeight);
  const bombMarker=$('bomb-pipper');
  if(prediction&&(bombAmmo>0||nuclearAmmo>0)){
    const projected=prediction.position.project(camera);
    const show=projected.z>=-1&&projected.z<=1&&Math.abs(projected.x)<1&&Math.abs(projected.y)<1;
    bombMarker.classList.toggle('hidden',!show);
    if(show){
      bombMarker.style.left=`${(projected.x*.5+.5)*innerWidth}px`;
      bombMarker.style.top=`${(-projected.y*.5+.5)*innerHeight}px`;
      bombMarker.querySelector('span').textContent=`BOMB IMPACT · ${prediction.time.toFixed(1)} S`;
    }
    const arc=sampleBombPath(bombOrigin,bombVelocity,prediction.time);
    const points=[];
    for(const point of arc){
      const screenPoint=point.project(camera);
      if(screenPoint.z>=-1&&screenPoint.z<=1&&Math.abs(screenPoint.x)<1.2&&Math.abs(screenPoint.y)<1.2)
        points.push(`${Math.round((screenPoint.x*.5+.5)*innerWidth)},${Math.round((-screenPoint.y*.5+.5)*innerHeight)}`);
    }
    $('bomb-path').setAttribute('points',show?points.join(' '):'');
  }else{bombMarker.classList.add('hidden');$('bomb-path').setAttribute('points','');}
}
function fireMissile(){
  if(!jet||paused||missiles<=0||missileCooldown>0)return;
  const lockedTarget=target?.alive&&lockTime>=1.35?target:null;
  missiles--;shots++;missileCooldown=.42;
  const mesh=new THREE.Group();
  const metal=new THREE.MeshStandardMaterial({color:0xd8e1e4,metalness:.72,roughness:.36});
  const dark=new THREE.MeshStandardMaterial({color:0x41525a,metalness:.6,roughness:.5});
  const body=new THREE.Mesh(new THREE.CylinderGeometry(.16,.19,3.3,10),metal);mesh.add(body);
  const nose=new THREE.Mesh(new THREE.ConeGeometry(.16,.7,10),metal);nose.position.y=2;mesh.add(nose);
  for(let i=0;i<4;i++){
    const fin=new THREE.Mesh(new THREE.BoxGeometry(.04,.7,.47),dark);
    fin.position.set(0,-1.25,.35);fin.rotation.y=i*Math.PI/2;fin.position.applyAxisAngle(new THREE.Vector3(0,1,0),i*Math.PI/2);mesh.add(fin);
  }
  const motor=new THREE.Group();motor.position.y=-2;motor.visible=false;
  const plume=new THREE.Mesh(new THREE.ConeGeometry(.27,2.1,12,1,true),new THREE.MeshBasicMaterial({color:0xffd7a2,transparent:true,opacity:.72,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
  plume.rotation.z=Math.PI;plume.position.y=-.9;motor.add(plume);
  const core=new THREE.Mesh(new THREE.ConeGeometry(.13,1.4,10,1,true),new THREE.MeshBasicMaterial({color:0xd9f5ff,transparent:true,opacity:.88,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
  core.rotation.z=Math.PI;core.position.y=-.65;motor.add(core);mesh.add(motor);
  const side=shots%2?1:-1;
  const railOffset=new THREE.Vector3(side*2.35,-1.1,-.5).applyQuaternion(quat);
  mesh.position.copy(jet.position).add(railOffset);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),forward);
  scene.add(mesh);
  const down=new THREE.Vector3(0,-1,0).applyQuaternion(quat);
  const right=new THREE.Vector3(1,0,0).applyQuaternion(quat);
  const velocity=forward.clone().multiplyScalar(speed).addScaledVector(down,18).addScaledVector(right,side*5);
  projectiles.push({mesh,target:lockedTarget,velocity,launchDirection:forward.clone(),age:0,life:11,smokeTime:0,motor,trail:createMissileTrail(scene),rayTimer:0,cityHit:null});
  emitSpark(mesh.position.clone().addScaledVector(down,1.5),3);
  cameraShake=Math.max(cameraShake,.15);
  audio.missile();setRadio(lockedTarget?`Fox two. Tracking ${lockedTarget.name}.`:'Fox two. Missile away, free flight.');
}
function fireGun(dt){
  gunTime+=dt;if(gunCooldown>0)return;gunCooldown=.075;
  const direction=forward.clone().add(new THREE.Vector3((Math.random()-.5)*.004,(Math.random()-.5)*.004,(Math.random()-.5)*.004)).normalize();
  const tracer=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,2.6,5),new THREE.MeshBasicMaterial({color:0xffe4aa,transparent:true,opacity:.95,blending:THREE.AdditiveBlending,depthWrite:false}));
  tracer.position.copy(jet.position).addScaledVector(direction,7).add(new THREE.Vector3(.65,-.55,0).applyQuaternion(quat));
  tracer.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);scene.add(tracer);
  const cityHit=world?.raycastCity?.(tracer.position,direction,1600);
  bullets.push({mesh:tracer,velocity:direction.multiplyScalar(1250),life:1.45,travelled:0,cityHit});
  cameraShake=Math.max(cameraShake,.045);
  emitSpark(tracer.position,1.7);
}
function createBombMesh(nuclear){
  const group=new THREE.Group();
  const shell=new THREE.MeshStandardMaterial({color:nuclear?0x343b33:0x525b58,metalness:.48,roughness:.46,emissive:nuclear?0xff7837:0x000000,emissiveIntensity:0});
  const trim=new THREE.MeshStandardMaterial({color:nuclear?0xd2ae49:0x343e42,metalness:.7,roughness:.3});
  const radius=nuclear ? .55 : .36,length=nuclear?3.6:2.5;
  group.add(new THREE.Mesh(new THREE.CylinderGeometry(radius*.92,radius,length,12),shell));
  const nose=new THREE.Mesh(new THREE.ConeGeometry(radius*.92,radius*1.35,12),trim);
  nose.position.y=length*.5+radius*.55;group.add(nose);
  const band=new THREE.Mesh(new THREE.CylinderGeometry(radius*1.025,radius*1.025,.16,12),trim);
  band.position.y=length*.14;group.add(band);
  const tailBand=new THREE.Mesh(new THREE.CylinderGeometry(radius*1.03,radius*1.03,.2,12),trim);
  tailBand.position.y=-length*.43;group.add(tailBand);
  for(let i=0;i<4;i++){
    const fin=new THREE.Mesh(new THREE.BoxGeometry(.08,length*.32,radius*.95),trim);
    const angle=i*Math.PI/2;
    fin.position.set(Math.sin(angle)*radius*.8,-length*.43,Math.cos(angle)*radius*.8);
    fin.rotation.y=angle;group.add(fin);
  }
  group.userData.body=group.children[0];
  return group;
}
function dropBomb(nuclear=false){
  if(!jet||paused||ended||bombCooldown>0||(nuclear?nuclearAmmo:bombAmmo)<=0)return;
  if(nuclear)nuclearAmmo--;else bombAmmo--;
  bombCooldown=nuclear ? .8 : .34;
  const down=new THREE.Vector3(0,-1,0).applyQuaternion(quat);
  const mesh=createBombMesh(nuclear);
  mesh.position.copy(jet.position).addScaledVector(down,3.1).addScaledVector(forward,2);
  const velocity=forward.clone().multiplyScalar(speed).addScaledVector(down,9);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),velocity.clone().normalize());
  scene.add(mesh);
  bombProjectiles.push({mesh,velocity,nuclear,life:0,armed:false,fuse:0});
  audio.drop();
  setRadio(nuclear?'Special weapon released. Clear the impact zone.':'Bomb away. Watch the impact marker.');
  updateHud();
}
function effectTexture(kind){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(64,64,1,64,64,62);
  if(kind==='fire'){
    gradient.addColorStop(0,'rgba(255,250,219,1)');gradient.addColorStop(.22,'rgba(255,195,83,.95)');
    gradient.addColorStop(.5,'rgba(237,83,26,.78)');gradient.addColorStop(.78,'rgba(90,24,13,.24)');
  }else if(kind==='scorch'){
    gradient.addColorStop(0,'rgba(12,11,10,.92)');gradient.addColorStop(.4,'rgba(23,18,16,.8)');
    gradient.addColorStop(.73,'rgba(48,33,27,.36)');gradient.addColorStop(.96,'rgba(66,45,38,.02)');
  }else{
    gradient.addColorStop(0,'rgba(46,49,47,.6)');gradient.addColorStop(.43,'rgba(58,61,58,.42)');
    gradient.addColorStop(.78,'rgba(75,77,73,.17)');gradient.addColorStop(1,'rgba(75,77,73,0)');
  }
  gradient.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
  if(kind==='smoke'){
    const pixels=ctx.getImageData(0,0,128,128);
    const hash=(x,y)=>{let n=Math.imul(x,374761393)+Math.imul(y,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
    const layer=(x,y,scale)=>{
      const fx=x/scale,fy=y/scale,ix=Math.floor(fx),iy=Math.floor(fy);
      const tx=fx-ix,ty=fy-iy,sx=tx*tx*(3-2*tx),sy=ty*ty*(3-2*ty);
      const a=hash(ix,iy)*(1-sx)+hash(ix+1,iy)*sx;
      const b=hash(ix,iy+1)*(1-sx)+hash(ix+1,iy+1)*sx;
      return a*(1-sy)+b*sy;
    };
    for(let y=0;y<128;y++)for(let x=0;x<128;x++){
      const offset=(y*128+x)*4,radial=Math.max(0,1-Math.hypot(x-64,y-64)/62);
      const noise=layer(x,y,28)*.5+layer(x,y,13)*.32+layer(x,y,6)*.18;
      const shade=150+noise*90;
      pixels.data[offset]=shade;pixels.data[offset+1]=shade;pixels.data[offset+2]=shade*.96;
      pixels.data[offset+3]=Math.round(255*Math.pow(radial,.83)*Math.max(0,(noise-.19)*1.24));
    }
    ctx.putImageData(pixels,0,0);
  }
  if(kind!=='fire'){
    for(let i=0;i<150;i++){
      const angle=Math.random()*Math.PI*2,r=Math.sqrt(Math.random())*55;
      ctx.fillStyle=kind==='scorch'?'rgba(12,10,9,.08)':'rgba(15,20,20,.025)';
      ctx.beginPath();ctx.arc(64+Math.cos(angle)*r,64+Math.sin(angle)*r,1+Math.random()*5,0,Math.PI*2);ctx.fill();
    }
  }
  if(kind==='scorch'){
    ctx.strokeStyle='rgba(18,14,12,.46)';ctx.lineWidth=1.3;
    for(let i=0;i<13;i++){
      const angle=i*Math.PI*2/13+Math.random()*.2,reach=25+Math.random()*30;
      ctx.beginPath();ctx.moveTo(64,64);
      for(let k=1;k<=4;k++){
        const r=reach*k/4,a=angle+(Math.random()-.5)*.18;
        ctx.lineTo(64+Math.cos(a)*r,64+Math.sin(a)*r);
      }
      ctx.stroke();
    }
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
const fireTexture=effectTexture('fire'),smokeTexture=effectTexture('smoke'),scorchTexture=effectTexture('scorch');
const blastRubble=[];
function trimParticles(){
  while(particles.length>420){const old=particles.shift();scene.remove(old.mesh);if(!old.sharedGeometry)old.mesh.geometry.dispose();old.mesh.material.dispose();}
}
function effectSprite(position,size,life,texture,color,opacity,velocity,growth,additive=false,options={}){
  const mesh=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,color,transparent:true,opacity,depthWrite:false,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending}));
  mesh.position.copy(position);mesh.scale.set(size,size,1);mesh.visible=!options.delay;mesh.material.rotation=Math.random()*Math.PI*2;scene.add(mesh);
  particles.push({mesh,velocity,life,maxLife:life,baseOpacity:opacity,growth,sharedGeometry:true,...options});
  trimParticles();
  return mesh;
}
function emitSmoke(position,size=2,life=.9,color=0x63717a){
  effectSprite(position,size,life,smokeTexture,color,.58,new THREE.Vector3((Math.random()-.5)*3,2+Math.random()*5,(Math.random()-.5)*3),size*.55,false,{drag:.55,fadeIn:.22,rotationSpeed:(Math.random()-.5)*.7});
}
function emitSpark(position,size=1){
  effectSprite(position,size,.14,fireTexture,0xffd893,.75,new THREE.Vector3(),size*5,true);
}
function impactRing(position,normal,size,color,life){
  const mesh=new THREE.Mesh(new THREE.RingGeometry(.78,1,32),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.38,depthWrite:false,side:THREE.DoubleSide}));
  mesh.position.copy(position).addScaledVector(normal,.35);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);mesh.scale.setScalar(Math.max(.1,size*.14));scene.add(mesh);
  particles.push({mesh,velocity:new THREE.Vector3(),life,maxLife:life,baseOpacity:.38,growth:size/life,ring:true});
  trimParticles();
}
function explode(position,scale=1,{surface=false,normal=new THREE.Vector3(0,1,0),kind='air'}={}){
  if(jet&&position.distanceTo(jet.position)<250)cameraShake=Math.max(cameraShake,Math.min(.9,scale*.42));
  const distance=jet?.position.distanceTo(position)??0;
  const detail=distance>1800?.35:distance>850?.6:1;
  const axis=normal.clone().normalize();
  const lateral=new THREE.Vector3(1,0,0).cross(axis).normalize();
  if(lateral.lengthSq()<.1)lateral.set(1,0,0);
  const other=new THREE.Vector3().crossVectors(axis,lateral).normalize();
  // The bright core is brief. Most of the visible volume is opaque fire,
  // followed by dust and buoyant smoke rather than one additive fireball.
  effectSprite(position,8*scale,.09,fireTexture,0xffefcc,.9,new THREE.Vector3(),48*scale,true);
  const flameCount=Math.max(2,Math.round((kind==='vehicle'?3:5)*detail));
  for(let i=0;i<flameCount;i++){
    const angle=Math.random()*Math.PI*2,spread=(2+Math.random()*6)*scale;
    const offset=lateral.clone().multiplyScalar(Math.cos(angle)*spread).addScaledVector(other,Math.sin(angle)*spread).addScaledVector(axis,Math.random()*3*scale);
    effectSprite(position.clone().add(offset),(5+Math.random()*6)*scale,.22+Math.random()*.25,fireTexture,i%2?0xffa04c:0xffd684,.58,offset.clone().multiplyScalar(1.2),11*scale,false,{drag:1.7,fadeIn:.08,rotationSpeed:(Math.random()-.5)*2});
  }
  const smokeCount=Math.max(2,Math.round((kind==='vehicle'?4:surface?9:6)*detail));
  for(let i=0;i<smokeCount;i++){
    const angle=Math.random()*Math.PI*2,radius=Math.random()*5*scale;
    const offset=lateral.clone().multiplyScalar(Math.cos(angle)*radius).addScaledVector(other,Math.sin(angle)*radius);
    const velocity=offset.clone().multiplyScalar(.35).add(new THREE.Vector3((Math.random()-.5)*2,3+Math.random()*5,(Math.random()-.5)*2));
    effectSprite(position.clone().add(offset),(5+Math.random()*5)*scale,1.8+Math.random()*1.6,smokeTexture,i%3?0x4e5050:0x292b2c,.53,velocity,5*scale,false,{delay:.12+Math.random()*.28,drag:.48,fadeIn:.3,rotationSpeed:(Math.random()-.5)*.55});
  }
  if(surface){
    impactRing(position,axis,24*scale,0xa49b8a,.42);
    for(let i=0,n=Math.round(8*detail);i<n;i++){
      const angle=Math.random()*Math.PI*2;
      const velocity=lateral.clone().multiplyScalar(Math.cos(angle)).addScaledVector(other,Math.sin(angle)).multiplyScalar(9+Math.random()*11).addScaledVector(axis,2+Math.random()*5);
      effectSprite(position.clone().addScaledVector(axis,.5),(3+Math.random()*3)*scale,1.1+Math.random()*.8,smokeTexture,kind==='vehicle'?0x55534e:0xaca397,.39,velocity,5*scale,false,{delay:.07+Math.random()*.14,drag:1.3,fadeIn:.14,rotationSpeed:(Math.random()-.5)*.7});
    }
  }
  for(let i=0,n=Math.round((kind==='vehicle'?4:7)*detail);i<n;i++){
    const mesh=new THREE.Mesh(new THREE.TetrahedronGeometry((.2+Math.random()*.38)*scale),new THREE.MeshBasicMaterial({color:i%3?0xffab55:0xffdf9b,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false}));
    mesh.position.copy(position);scene.add(mesh);
    const velocity=new THREE.Vector3((Math.random()-.5)*50,10+Math.random()*30,(Math.random()-.5)*50).multiplyScalar(scale).addScaledVector(axis,15*scale);
    const life=.2+Math.random()*.3;
    particles.push({mesh,velocity,life,maxLife:life,baseOpacity:.8,gravity:30});
    trimParticles();
  }
}
function markDamage(position,normal=new THREE.Vector3(0,1,0),size=10){
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(size,size),new THREE.MeshBasicMaterial({map:scorchTexture,transparent:true,opacity:.83,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,side:THREE.DoubleSide}));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal.clone().normalize());
  mesh.position.copy(position).addScaledVector(normal,.18);scene.add(mesh);damageMarks.push(mesh);
  if(damageMarks.length>100){const old=damageMarks.shift();scene.remove(old);old.geometry.dispose();old.material.dispose();}
}
function addDebris(mesh,impact,floor=0){
  scene.add(mesh);
  const outward=mesh.position.clone().sub(impact);
  outward.y=Math.max(.2,outward.y*.3);
  outward.normalize();
  const velocity=outward.multiplyScalar(8+Math.random()*20).add(new THREE.Vector3((Math.random()-.5)*9,6+Math.random()*13,(Math.random()-.5)*9));
  debris.push({mesh,velocity,spin:new THREE.Vector3((Math.random()-.5)*3,(Math.random()-.5)*3,(Math.random()-.5)*3),floor,age:0,settled:false});
  while(debris.length>130)removeObject(debris.shift().mesh);
}
function addCollapseDebris(fragment,building){
  const mesh=new THREE.Mesh(fragment.geometry,fragment.material);
  mesh.position.copy(fragment.position);scene.add(mesh);
  const center=new THREE.Vector3((building.minX+building.maxX)/2,0,(building.minZ+building.maxZ)/2);
  const outward=mesh.position.clone().sub(center);outward.y=0;outward.normalize();
  debris.push({mesh,velocity:new THREE.Vector3(outward.x*(3+Math.random()*8),-2-Math.random()*5,outward.z*(3+Math.random()*8)),spin:new THREE.Vector3((Math.random()-.5)*1.6,(Math.random()-.5)*1.6,(Math.random()-.5)*1.6),floor:building.rubbleHeight,age:0,settled:false});
  while(debris.length>180)removeObject(debris.shift().mesh);
}
function showCollapse(collapse){
  const {building,point,fragments}=collapse;
  for(const fragment of fragments.slice(0,36))addCollapseDebris(fragment,building);
  const width=Math.max(12,building.maxX-building.minX,building.maxZ-building.minZ);
  const base=point.clone().setY(building.rubbleHeight);
  for(let i=0;i<14;i++){
    const angle=Math.random()*Math.PI*2,radius=Math.random()*width*.65;
    const position=base.clone().add(new THREE.Vector3(Math.cos(angle)*radius,Math.random()*building.top*.34,Math.sin(angle)*radius));
    const velocity=new THREE.Vector3(Math.cos(angle)*(6+Math.random()*8),2+Math.random()*4,Math.sin(angle)*(6+Math.random()*8));
    effectSprite(position,7+Math.random()*width*.45,2+Math.random()*1.5,smokeTexture,i%4?0xaaa397:0x66625c,.46,velocity,4+width*.14,false,{delay:.16+Math.random()*.48,drag:1.1,fadeIn:.3,rotationSpeed:(Math.random()-.5)*.6});
  }
  const rubble=new THREE.Group();
  for(let i=0;i<12;i++){
    const piece=new THREE.Mesh(new THREE.BoxGeometry(2+Math.random()*5,.5+Math.random()*2,2+Math.random()*5),new THREE.MeshStandardMaterial({color:i%3?0x77746d:0x4c4a47,roughness:1}));
    piece.position.set((Math.random()-.5)*width,building.rubbleHeight*.4,(Math.random()-.5)*width);
    piece.rotation.set((Math.random()-.5)*.4,Math.random()*Math.PI,(Math.random()-.5)*.4);
    rubble.add(piece);
  }
  rubble.position.set(point.x,0,point.z);scene.add(rubble);
  ignite(base.clone().add(new THREE.Vector3(width*.2,1,0)),Math.min(22,width*.8));
  explode(base,Math.min(2.2,width/14),{surface:true,kind:'building'});
  cameraShake=Math.max(cameraShake,jet?Math.max(0,1-jet.position.distanceTo(base)/280)*.9:0);
}
function breakRadar(target){
  target.group.updateWorldMatrix(true,true);
  const meshes=[];
  target.group.traverse(child=>{if(child.isMesh)meshes.push(child);});
  for(const child of meshes){
    const material=()=>Array.isArray(child.material)?child.material.map(m=>m.clone()):child.material.clone();
    const parameters=child.geometry.parameters;
    if(child.geometry.type==='CylinderGeometry'&&parameters?.height>35){
      const base=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();
      child.getWorldPosition(base);child.getWorldQuaternion(rotation);child.getWorldScale(scale);
      const count=4,height=parameters.height/count;
      for(let i=0;i<count;i++){
        const bottom=parameters.radiusBottom+(parameters.radiusTop-parameters.radiusBottom)*i/count;
        const top=parameters.radiusBottom+(parameters.radiusTop-parameters.radiusBottom)*(i+1)/count;
        const piece=new THREE.Mesh(new THREE.CylinderGeometry(top,bottom,height,10),material());
        const offset=new THREE.Vector3(0,-parameters.height/2+height*(i+.5),0).applyQuaternion(rotation);
        piece.position.copy(base).add(offset);piece.quaternion.copy(rotation);piece.scale.copy(scale);
        addDebris(piece,target.position,target.group.position.y);
      }
    }else{
      const piece=new THREE.Mesh(child.geometry.clone(),material());
      child.getWorldPosition(piece.position);child.getWorldQuaternion(piece.quaternion);child.getWorldScale(piece.scale);
      addDebris(piece,target.position,target.group.position.y);
    }
  }
  removeObject(target.group);
}
function ignite(position,size=12){
  const existing=fires.find(fire=>fire.mesh.position.distanceTo(position)<size*.7);
  if(existing){existing.size=Math.max(existing.size,size);return;}
  const mesh=new THREE.Sprite(new THREE.SpriteMaterial({map:fireTexture,color:0xffa455,transparent:true,opacity:.67,depthWrite:false,blending:THREE.NormalBlending}));
  mesh.position.copy(position);mesh.scale.set(size*.7,size,1);scene.add(mesh);
  fires.push({mesh,size,smoke:Math.random()*.2,age:0});
  if(fires.length>24){const old=fires.shift();scene.remove(old.mesh);old.mesh.material.dispose();}
}
function updateDestruction(dt){
  for(const piece of debris){
    if(piece.settled)continue;
    piece.age+=dt;
    const previousHeight=piece.mesh.position.y;
    piece.velocity.y-=21*dt;
    piece.mesh.position.addScaledVector(piece.velocity,dt);
    piece.mesh.rotation.x+=piece.spin.x*dt;
    piece.mesh.rotation.y+=piece.spin.y*dt;
    piece.mesh.rotation.z+=piece.spin.z*dt;
    const rooftop=world?.collisionHeight?.(piece.mesh.position.x,piece.mesh.position.z)??-100;
    const floor=previousHeight>rooftop+.1?Math.max(piece.floor,rooftop):piece.floor;
    if(piece.mesh.position.y<=floor){
      piece.mesh.position.y=floor;
      if(!piece.landed&&piece.velocity.y<-7&&piece.age<7&&jet&&piece.mesh.position.distanceTo(jet.position)<650&&Math.random()<.27){
        emitSmoke(piece.mesh.position.clone().add(new THREE.Vector3(0,.4,0)),2+Math.random()*3,.65,0x9b968c);
      }
      piece.landed=true;
      piece.velocity.y=Math.abs(piece.velocity.y)*.2;
      piece.velocity.x*=.58;piece.velocity.z*=.58;
      piece.spin.multiplyScalar(.6);
      if(Math.abs(piece.velocity.y)<1.5||piece.age>8)piece.settled=true;
    }
    if(piece.age>12)piece.settled=true;
  }
  for(const fire of fires){
    fire.age+=dt;fire.smoke-=dt;
    const flicker=1+Math.sin(fire.age*17)*.12+Math.sin(fire.age*29)*.08;
    fire.mesh.scale.set(fire.size*.7*flicker,fire.size*flicker,1);
    fire.mesh.material.opacity=.57+Math.sin(fire.age*21)*.09;
    if(fire.smoke<=0){
      fire.smoke=.2+Math.random()*.13;
      emitSmoke(fire.mesh.position.clone().add(new THREE.Vector3((Math.random()-.5)*2,fire.size*.36,(Math.random()-.5)*2)),fire.size*.8,2.4,0x2b2d2d);
      if(Math.random()<.3)emitSpark(fire.mesh.position.clone().add(new THREE.Vector3(0,fire.size*.3,0)),fire.size*.3);
    }
  }
}
function cityImpact(origin,direction,distance,fallback,size=10){
  const hit=world?.raycastCity?.(origin,direction,Math.max(5,distance+(size>=8?35:8)));
  let position=fallback,normal=new THREE.Vector3(0,1,0);
  if(hit){position=hit.point;normal=hit.face?.normal?.clone().transformDirection(hit.object.matrixWorld)||normal;if(normal.dot(direction)>0)normal.negate();}
  let fragments=[];
  let collapsed=false;
  if(size>=8&&hit){
    const collapse=world?.collapseBuildingAt?.(hit);
    if(collapse){showCollapse(collapse);collapsed=true;}
    else if(position.y>3){
      fragments=world?.fractureCity?.(hit,size*.9)||[];
      for(const fragment of fragments){
        const mesh=new THREE.Mesh(fragment.geometry,fragment.material);
        mesh.position.copy(fragment.position);
        addDebris(mesh,position);
      }
    }
  }
  if(!collapsed&&!fragments.length)markDamage(position,normal,size);
  if(size>=8&&!collapsed)ignite(position.clone().addScaledVector(normal,1.2),size);
  for(const car of world?.traffic?.blast?.(position,size*1.5)||[])destroyCar(car);
  return {position,normal,fractured:fragments.length>0,collapsed};
}
function destroyCar(car){
  const hit=world?.traffic?.destroy(car);
  if(!hit)return;
  world?.traffic?.blast?.(hit.position,8);
  markDamage(hit.position.clone().add(new THREE.Vector3(0,.08,0)),new THREE.Vector3(0,1,0),6);
  explode(hit.position.clone().add(new THREE.Vector3(0,1.2,0)),.8,{surface:true,kind:'vehicle'});
  audio.explosion();setRadio('Vehicle destroyed.');
  const group=new THREE.Group();group.position.copy(hit.position);group.rotation.y=hit.heading;
  const body=new THREE.Mesh(new THREE.BoxGeometry(hit.width,.55,hit.length),new THREE.MeshStandardMaterial({color:0x171b1d,metalness:.22,roughness:.9,emissive:0x241008,emissiveIntensity:.35}));
  body.position.y=.4;group.add(body);
  const roof=new THREE.Mesh(new THREE.BoxGeometry(hit.width*.7,.34,hit.length*.48),new THREE.MeshStandardMaterial({color:0x292a28,roughness:1}));
  roof.position.set(0,.86,.2);roof.rotation.z=.12;group.add(roof);
  const flame=new THREE.Mesh(new THREE.SphereGeometry(.68,8,6),new THREE.MeshBasicMaterial({color:0xff7131,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));
  flame.position.set(.35,1.15,0);group.add(flame);scene.add(group);
  wrecks.push({group,flame,age:0,smoke:0});
  if(wrecks.length>30)removeObject(wrecks.shift().group);
}
function updateWrecks(dt){
  for(let i=wrecks.length-1;i>=0;i--){
    const wreck=wrecks[i];wreck.age+=dt;wreck.smoke+=dt;
    wreck.flame.visible=wreck.age<9;
    wreck.flame.scale.setScalar(.8+Math.sin(elapsed*27+i)*.18);
    if(wreck.age<22&&wreck.smoke>.4){wreck.smoke=0;emitSmoke(wreck.group.position.clone().add(new THREE.Vector3((Math.random()-.5)*1.5,1.4,(Math.random()-.5)*1.5)),2.5,1.2,0x252a2b);}
  }
}
function updateProjectiles(dt){
  for(let i=projectiles.length-1;i>=0;i--){
    const m=projectiles[i];m.life-=dt;
    const previous=m.mesh.position.clone();
    const aim=m.target?.alive?m.target.position.clone().add(new THREE.Vector3(0,m.target.type==='car'?m.target.height*.55:0,0)):null;
    const ignited=advanceMissile(m,dt,aim);
    m.motor.visible=ignited;
    if(ignited){
      m.motor.scale.y=.8+Math.sin(elapsed*63+i)*.12;
      updateMissileTrail(m.trail,m.mesh.position,camera,dt);
      m.smokeTime+=dt;
      if(m.smokeTime>.12){m.smokeTime=0;emitSmoke(m.mesh.position.clone().addScaledVector(m.velocity.clone().normalize(),-2.3),4.2,1.35,0xb5b9b5);}
    }
    const direction=m.velocity.clone().normalize(),travel=m.velocity.length()*dt;
    m.rayTimer-=dt;
    if(m.rayTimer<=0){m.rayTimer=.08;m.cityHit=world?.raycastCity?.(previous,direction,m.velocity.length()*.18+8)||null;}
    const meshHit=m.cityHit&&segmentHitsSphere(previous,m.mesh.position,m.cityHit.point,2)?m.cityHit:null;
    const fieldHit=firstHeightIntersection(surfaceHeight,previous,direction,travel,1);
    const meshDistance=meshHit?previous.distanceTo(meshHit.point):Infinity;
    const obstruction=Math.min(meshDistance,fieldHit??Infinity);
    const carHit=world?.traffic?.findRayHit(previous,direction,travel);
    let hitTarget=null,hitDistance=Infinity;
    if(carHit&&carHit.distance<=obstruction){hitTarget=carHit.vehicle;hitDistance=carHit.distance;}
    for(const candidate of [...radars,...enemies]){
      if(!candidate.alive)continue;
      const radius=candidate.type==='radar'?38:15;
      if(segmentHitsSphere(previous,m.mesh.position,candidate.position,radius)){
        const distance=previous.distanceTo(candidate.position)-radius;
        if(distance<hitDistance&&distance<=obstruction){hitTarget=candidate;hitDistance=distance;}
      }
    }
    if(hitTarget){
      m.mesh.position.copy(previous).addScaledVector(direction,Math.max(0,hitDistance));
      hitTarget.health-=3;
      if(hitTarget.health<=0)onTargetDestroyed(hitTarget);else{explode(m.mesh.position,.45);audio.explosion();}
      m.life=0;
    }else if(obstruction<Infinity){
      m.mesh.position.copy(meshHit&&meshDistance<=obstruction?meshHit.point:previous.clone().addScaledVector(direction,obstruction));
      const impact=cityImpact(previous,direction,obstruction,m.mesh.position,14);
      m.mesh.position.copy(impact.position);
      if(!impact.collapsed)explode(m.mesh.position,.75,{surface:true,normal:impact.normal,kind:'building'});audio.explosion();setRadio(impact.collapsed?'Structural failure! Building coming down!':impact.fractured?'Structure breached. Fire and debris!':'Missile impact. Surface damaged.');m.life=0;
    }
    if(m.life<=0){scene.remove(m.mesh);m.mesh.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});disposeMissileTrail(scene,m.trail);projectiles.splice(i,1);}
  }
  for(let i=bullets.length-1;i>=0;i--){
    const bullet=bullets[i],previous=bullet.mesh.position.clone(),direction=bullet.velocity.clone().normalize();
    bullet.mesh.position.addScaledVector(bullet.velocity,dt);bullet.velocity.y-=9.8*dt;
    bullet.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);
    bullet.life-=dt;
    const travel=previous.distanceTo(bullet.mesh.position),lastTravel=bullet.travelled;
    bullet.travelled+=travel;
    const carHit=world?.traffic?.findRayHit(previous,direction,travel);
    const personHit=world?.traffic?.findPersonRayHit(previous,direction,travel);
    const tileDistance=bullet.cityHit&&bullet.cityHit.distance<=bullet.travelled?Math.max(0,bullet.cityHit.distance-lastTravel):Infinity;
    const fieldDistance=firstHeightIntersection(surfaceHeight,previous,direction,travel,.25)??Infinity;
    const surfaceDistance=Math.min(tileDistance,fieldDistance);
    let targetHit=null,targetDistance=Infinity;
    if(carHit&&carHit.distance<surfaceDistance){targetHit=carHit.vehicle;targetDistance=carHit.distance;}
    if(personHit&&personHit.distance<targetDistance&&personHit.distance<surfaceDistance){targetHit=personHit.person;targetDistance=personHit.distance;}
    for(const candidate of [...radars,...enemies]){
      if(!candidate.alive||!segmentHitsSphere(previous,bullet.mesh.position,candidate.position,candidate.type==='radar'?33:11))continue;
      const distance=Math.max(0,previous.distanceTo(candidate.position)-(candidate.type==='radar'?33:11));
      if(distance<targetDistance&&distance<surfaceDistance){targetHit=candidate;targetDistance=distance;}
    }
    if(targetHit){
      bullet.mesh.position.copy(previous).addScaledVector(direction,targetDistance);
      if(!('health' in targetHit)){world?.traffic?.hitPerson(targetHit);emitSpark(bullet.mesh.position,2);}
      else{targetHit.health-=targetHit.type==='car'?1:.22;if(targetHit.health<=0)onTargetDestroyed(targetHit);else emitSpark(bullet.mesh.position,3);}
      bullet.life=0;
    }else if(surfaceDistance<Infinity){
      bullet.mesh.position.copy(previous).addScaledVector(direction,surfaceDistance);
      if(tileDistance<=fieldDistance&&bullet.cityHit)bullet.mesh.position.copy(bullet.cityHit.point);
      cityImpact(previous,direction,surfaceDistance,bullet.mesh.position,3.5);
      emitSpark(bullet.mesh.position,4);
      if(Math.random()<.25)emitSmoke(bullet.mesh.position,1.5,.7,0x57514c);
      bullet.life=0;
    }
    if(bullet.life<=0){removeObject(bullet.mesh);bullets.splice(i,1);}
  }
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];
    if(p.delay>0){p.delay-=dt;if(p.delay>0)continue;p.mesh.visible=true;}
    p.life-=dt;
    if(p.gravity)p.velocity.y-=p.gravity*dt;
    p.mesh.position.addScaledVector(p.velocity,dt);
    if(p.drag)p.velocity.multiplyScalar(Math.exp(-p.drag*dt));
    if(p.rotationSpeed)p.mesh.material.rotation+=p.rotationSpeed*dt;
    const age=p.maxLife-p.life;
    if(p.mesh.material.transparent)p.mesh.material.opacity=(p.baseOpacity??1)*clamp(p.life/p.maxLife,0,1)*(p.fadeIn?clamp(age/p.fadeIn,0,1):1);
    if(p.growth)p.mesh.scale.addScalar(dt*p.growth);else p.mesh.scale.multiplyScalar(1+dt*.9);
    if(p.life<=0){scene.remove(p.mesh);if(!p.sharedGeometry)p.mesh.geometry.dispose();p.mesh.material.dispose();particles.splice(i,1);}
  }
}
function applyAreaBlast(position,radius,nuclear=false){
  const targets=[...radars,...enemies];
  for(const candidate of targets){
    if(!candidate.alive||candidate.position.distanceTo(position)>radius+(candidate.type==='radar'?35:12))continue;
    candidate.health-=nuclear?100:4;
    if(candidate.health<=0)onTargetDestroyed(candidate);
  }
  const cars=world?.traffic?.blast?.(position,radius,nuclear?Infinity:10)||[];
  for(let i=0;i<cars.length;i++){
    if(nuclear&&i>=6)world.traffic.destroy(cars[i]);
    else destroyCar(cars[i]);
  }
}
function makeBlastRubble(position){
  const sites=world?.blastRubbleSites?.(position,210)||[];
  const field=createRubbleField(position,sites);
  scene.add(field);blastRubble.push(field);
  while(blastRubble.length>10)removeObject(blastRubble.shift());
}
function makeNuclearEffect(position){
  const group=new THREE.Group();group.position.copy(position);scene.add(group);
  const ring=new THREE.Mesh(new THREE.RingGeometry(.96,1.04,96),new THREE.MeshBasicMaterial({color:0xfff1d1,transparent:true,opacity:.9,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));
  ring.rotation.x=-Math.PI/2;ring.position.y=1;group.add(ring);
  const dust=new THREE.Mesh(new THREE.RingGeometry(.78,1.12,96),new THREE.MeshBasicMaterial({color:0x8d8171,transparent:true,opacity:.53,depthWrite:false,side:THREE.DoubleSide}));
  dust.rotation.x=-Math.PI/2;dust.position.y=1.2;group.add(dust);
  const fireball=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),new THREE.MeshBasicMaterial({color:0xffca79,transparent:true,opacity:.9,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));
  fireball.position.y=24;group.add(fireball);
  const flash=new THREE.Sprite(new THREE.SpriteMaterial({map:fireTexture,color:0xfff7d9,transparent:true,opacity:1,depthWrite:false,blending:THREE.AdditiveBlending}));
  flash.position.y=35;group.add(flash);
  const light=new THREE.PointLight(0xffd5a0,0,650);light.position.y=55;group.add(light);
  const cloud=[];
  for(let i=0;i<120;i++){
    const type=i<40?'stem':i<90?'cap':i<106?'rim':'ground';
    const angle=i*2.399963,radial=Math.sqrt(Math.random()),phase=Math.random()*Math.PI*2;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:smokeTexture,color:type==='ground'?0x8d8271:type==='rim'?0x5e5c58:i%4?0x474947:0x77736d,transparent:true,opacity:0,depthWrite:false}));
    group.add(sprite);
    cloud.push({sprite,type,angle,radial,phase,level:i%12,size:type==='cap'?36+Math.random()*31:type==='rim'?46+Math.random()*33:type==='stem'?22+Math.random()*27:24+Math.random()*26});
  }
  const distance=jet?.position.distanceTo(position)??Infinity;
  const candidates=world?.blastBuildingCandidates?.(position,360)||[];
  const effect={group,ring,dust,fireball,flash,light,cloud,age:0,candidates,damageIndex:0,flattened:false,blastStage:0,playerDistance:distance,playerHit:false};
  nuclearEffects.push(effect);
  while(nuclearEffects.length>4)disposeNuclearEffect(nuclearEffects.shift());
  blastFlash=1;
  cameraShake=Math.max(cameraShake,.12);
  audio.nuclear(distance);
  return effect;
}
function disposeNuclearEffect(effect){
  scene.remove(effect.group);
  effect.group.traverse(child=>{
    if(child.isMesh)child.geometry.dispose();
    if((child.isMesh||child.isSprite)&&child.material)child.material.dispose();
  });
}
function detonateNuclear(position){
  makeNuclearEffect(position);
  setRadio('Special weapon detonation. Shockwave expanding—clear the area.');
}
function updateNuclearEffects(dt){
  for(let i=nuclearEffects.length-1;i>=0;i--){
    const effect=nuclearEffects[i];effect.age+=dt;
    const age=effect.age;
    const radius=shockRadius(age);
    for(const threshold of [90,210,360]){
      if(effect.blastStage<3&&radius>=threshold&&effect.blastStage===[90,210,360].indexOf(threshold)){
        applyAreaBlast(effect.group.position,threshold,true);
        effect.blastStage++;
      }
    }
    effect.ring.scale.setScalar(Math.max(1,radius));
    effect.ring.material.opacity=.9*Math.max(0,1-age/1.25);
    effect.dust.scale.setScalar(Math.max(1,radius*.75));
    effect.dust.material.opacity=.55*Math.max(0,1-age/2.8);
    const fireballRadius=age<.65?70*(1-Math.exp(-age*6)):70*Math.exp(-(age-.65)*1.8);
    effect.fireball.scale.setScalar(Math.max(.01,fireballRadius));
    effect.fireball.material.opacity=.8*Math.max(0,1-Math.max(0,age-.6)/1.6);
    effect.fireball.material.color.setHex(age<.25?0xfff4cf:age<.7?0xffc26d:0x9d4c2f);
    effect.flash.scale.setScalar(120+age*120);
    effect.flash.material.opacity=Math.max(0,1-age*2.8);
    effect.light.intensity=age<1.3?65*Math.exp(-age*4):0;
    if(!effect.playerHit&&age>=effect.playerDistance/340){
      effect.playerHit=true;
      const exposure=Math.max(0,1-effect.playerDistance/320);
      cameraShake=Math.max(cameraShake,exposure*1.8);
      if(exposure>0){
        health=Math.max(0,health-exposure*85);
        if(health<=0)finish(false);
      }
    }
    const rise=Math.min(1,age/13);
    for(const item of effect.cloud){
      const swirl=item.angle+rise*.85+Math.sin(age*.6+item.phase)*.13;
      let radial,height;
      if(item.type==='cap'){
        radial=(40+item.radial*115)*(.25+rise*.75);
        height=110+rise*330+(1-item.radial)*45+Math.sin(item.phase+age*.9)*8;
      }else if(item.type==='rim'){
        radial=(115+item.radial*55)*(.25+rise*.75);
        height=115+rise*290+Math.sin(item.phase+age*.7)*12;
      }else if(item.type==='stem'){
        radial=(12+item.radial*26)*(.4+rise*.6);
        height=20+((item.level+.5)/12)*(115+rise*300)+Math.sin(item.phase+age)*5;
      }else{
        radial=(55+item.radial*170)*Math.min(1,age/2.4);
        height=6+item.radial*16+Math.sin(item.phase+age)*3;
      }
      item.sprite.position.set(Math.cos(swirl)*radial,height,Math.sin(swirl)*radial);
      const scale=item.size*(.45+rise*.75);
      item.sprite.scale.set(scale,scale,1);
      item.sprite.material.opacity=Math.max(0,(item.type==='ground'?.43:item.type==='rim'?.66:.6)*Math.min(1,age/(item.type==='ground'?.4:1.3))*(1-Math.max(0,age-31)/11));
    }
    if(effect.damageIndex<effect.candidates.length&&age>=.15){
      // Cut a few tall buildings into sections before the broad flattening
      // pass. Spreading this over frames avoids a long main-thread stall.
      for(let n=0;n<2&&effect.damageIndex<effect.candidates.length;n++){
        const candidate=effect.candidates[effect.damageIndex];
        if(Math.hypot(candidate.x-effect.group.position.x,candidate.z-effect.group.position.z)>radius)break;
        effect.damageIndex++;
        const sample=new THREE.Vector3(candidate.x,650,candidate.z);
        const hit=world?.raycastCity?.(sample,new THREE.Vector3(0,-1,0),900);
        if(hit){const collapse=world?.collapseBuildingAt?.(hit,{force:true,replay:false});if(collapse)showCollapse(collapse);}
      }
    }
    if(!effect.flattened&&effect.damageIndex===effect.candidates.length){
      effect.flattened=true;
      world?.flattenArea?.(effect.group.position,210,360);
      makeBlastRubble(effect.group.position);
      for(let j=0;j<7;j++){
        const angle=j*Math.PI*2/7,radius=45+(j%3)*48;
        ignite(effect.group.position.clone().add(new THREE.Vector3(Math.cos(angle)*radius,2.5,Math.sin(angle)*radius)),14+(j%3)*4);
      }
    }
    if(age>42){disposeNuclearEffect(effect);nuclearEffects.splice(i,1);}
  }
}
function updateBombs(dt){
  for(let i=bombProjectiles.length-1;i>=0;i--){
    const bomb=bombProjectiles[i];bomb.life+=dt;
    if(bomb.armed){
      bomb.fuse-=dt;
      const body=bomb.mesh.userData.body;
      body.material.emissiveIntensity=.15+Math.abs(Math.sin(bomb.fuse*11))*.7;
      if(bomb.fuse>0)continue;
      detonateNuclear(bomb.mesh.position.clone());
      removeObject(bomb.mesh);bombProjectiles.splice(i,1);
      continue;
    }
    const previous=bomb.mesh.position.clone();
    advanceBomb(bomb.mesh.position,bomb.velocity,dt);
    bomb.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),bomb.velocity.clone().normalize());
    const motion=bomb.mesh.position.clone().sub(previous);
    const travel=motion.length();
    if(travel<.001)continue;
    const direction=motion.multiplyScalar(1/travel);
    const meshHit=world?.raycastCity?.(previous,direction,travel+1);
    const fieldDistance=firstHeightIntersection(surfaceHeight,previous,direction,travel,.4);
    const struck=!!meshHit||fieldDistance!==null;
    if(!struck&&bomb.life<18)continue;
    const impact=meshHit&&meshHit.distance<=((fieldDistance??Infinity)+4)?meshHit.point.clone():previous.clone().addScaledVector(direction,fieldDistance??travel);
    bomb.mesh.position.copy(impact);
    if(bomb.nuclear){
      bomb.mesh.position.y+=1.4;
      bomb.armed=true;bomb.fuse=4.5;
      setRadio('Special weapon armed. 4.5 seconds to clear the area.');
      audio.warning();
    }else{
      const result=cityImpact(previous,direction,Math.min(travel,previous.distanceTo(impact)),impact,22);
      bomb.mesh.position.copy(result.position);
      if(!result.collapsed)explode(result.position,2,{surface:true,normal:result.normal,kind:'building'});audio.explosion();
      ignite(result.position.clone().add(new THREE.Vector3(0,2,0)),10);
      applyAreaBlast(result.position,55);
      setRadio('Bomb impact. Check target damage.');
      removeObject(bomb.mesh);bombProjectiles.splice(i,1);
    }
  }
}
function fireEnemyShot(enemy,heading){
  const start=enemy.position.clone().addScaledVector(heading,10);
  const distance=start.distanceTo(jet.position);
  const lead=jet.position.clone().addScaledVector(forward,speed*distance/390*.95);
  const direction=lead.sub(start).normalize();
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,11,6),new THREE.MeshBasicMaterial({color:0xff5947,transparent:true,opacity:.92,blending:THREE.AdditiveBlending,depthWrite:false}));
  mesh.position.copy(start);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);scene.add(mesh);
  enemyShots.push({mesh,velocity:direction.multiplyScalar(390),life:4});
  audio.gun();
}
function updateEnemies(dt){
  for(const enemy of enemies){
    if(!enemy.alive)continue;
    enemy.phase+=dt*.55;
    enemy.fireTimer=Math.max(0,enemy.fireTimer-dt);
    enemy.warningCooldown=Math.max(0,enemy.warningCooldown-dt);
    const distance=enemy.position.distanceTo(jet.position);
    if(distance>7500)continue;
    const desired=jet.position.clone().addScaledVector(forward,240).add(new THREE.Vector3(Math.sin(enemy.phase)*340,110+Math.sin(enemy.phase*1.7)*100,Math.cos(enemy.phase)*160));
    const direction=desired.sub(enemy.position).normalize();
    const turnTo=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1),direction);
    const oldHeading=new THREE.Vector3(0,0,-1).applyQuaternion(enemy.group.quaternion).normalize();
    const bank=clamp((oldHeading.z*direction.x-oldHeading.x*direction.z)*1.8,-.65,.65);
    turnTo.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),bank));
    enemy.group.quaternion.slerp(turnTo,Math.min(1,dt*1.1));
    animateControlSurfaces(enemy.group,{pitchInput:clamp((direction.y-oldHeading.y)*2,-1,1),rollInput:bank/.65,yawInput:clamp(bank/.65,-1,1)},dt);
    updateAfterburners(enemy.group,.96,elapsed+enemy.phase);
    const heading=new THREE.Vector3(0,0,-1).applyQuaternion(enemy.group.quaternion).normalize();
    enemy.position.addScaledVector(heading,enemy.speed*dt);
    enemy.position.y=Math.max(enemy.position.y,(world?.collisionHeight?.(enemy.position.x,enemy.position.z)??terrainHeight(enemy.position.x,enemy.position.z))+100);
    if(enemyHasShot(enemy.position,heading,jet.position)){
      enemy.aimTime+=dt;
      if(enemy.aimTime>.18&&enemy.warningCooldown===0){
        enemy.warningCooldown=4;
        $('warning').textContent='INCOMING FIRE';$('warning').classList.remove('hidden');
        setTimeout(()=>$('warning').classList.add('hidden'),1300);
        audio.warning();setRadio('Bandit lining up a shot. Break!');
      }
      if(enemy.aimTime>.7&&enemy.fireTimer===0){fireEnemyShot(enemy,heading);enemy.fireTimer=3.4;enemy.aimTime=0;}
    }else enemy.aimTime=Math.max(0,enemy.aimTime-dt*2);
  }
}
function updateEnemyShots(dt){
  for(let i=enemyShots.length-1;i>=0;i--){
    const shot=enemyShots[i],previous=shot.mesh.position.clone();
    shot.mesh.position.addScaledVector(shot.velocity,dt);shot.life-=dt;
    const travel=shot.velocity.length()*dt;
    const blocked=firstHeightIntersection(surfaceHeight,previous,shot.velocity.clone().normalize(),travel)!==null;
    const hit=!blocked&&segmentHitsSphere(previous,shot.mesh.position,jet.position,9);
    if(hit){
      health=Math.max(0,health-12);audio.warning();setRadio('Aircraft hit. Break and regain altitude.');
      explode(shot.mesh.position,.25);
      if(health<=0){explode(jet.position,2);audio.explosion();finish(false);}
    }
    if(hit||blocked||shot.life<=0){removeObject(shot.mesh);enemyShots.splice(i,1);}
  }
}
function updateCamera(dt){if(!jet)return;const local=cameraMode===0?new THREE.Vector3(0,3.6,19):cameraMode===1?new THREE.Vector3(0,.74,-3.1):new THREE.Vector3(14,5.5,22);const desired=local.applyQuaternion(quat).add(jet.position);camera.position.copy(desired);cameraShake=THREE.MathUtils.damp(cameraShake,0,9,dt);if(cameraShake>.005)camera.position.add(new THREE.Vector3((Math.random()-.5)*cameraShake,(Math.random()-.5)*cameraShake,(Math.random()-.5)*cameraShake));const look=jet.position.clone().addScaledVector(forward,cameraMode===1?350:210);if(cameraMode===2)look.add(new THREE.Vector3(0,1,0));const aircraftUp=up.clone().applyQuaternion(quat);camera.up.copy(cameraMode===1?aircraftUp:up.clone().lerp(aircraftUp,.18).normalize());camera.lookAt(look);jet.visible=cameraMode!==1;$('cockpit').classList.toggle('hidden',cameraMode!==1);$('camera-state').textContent=['CHASE CAM','COCKPIT CAM','CINEMATIC CAM'][cameraMode];}
function updateMenuCamera(dt){if(!previewJet)return;const t=performance.now()*.00014;animateControlSurfaces(previewJet,{pitchInput:Math.sin(t*7)*.35,rollInput:Math.sin(t*5)*.45,yawInput:Math.sin(t*4)*.3},dt);updateAfterburners(previewJet,.91,t*140);previewJet.rotation.y=-.22+Math.sin(t)*.07;previewJet.rotation.z=-.09+Math.sin(t*1.4)*.025;camera.position.set(80+Math.sin(t)*5,265,530);camera.up.set(0,1,0);camera.lookAt(-20,65,30);}
function updateRadar(){const wrap=$('radar-contacts');wrap.innerHTML='';if(!jet)return;const contacts=[...radars,...enemies].filter(t=>t.alive);if(extraction)contacts.push({position:extraction.position,type:'friendly'});for(const t of contacts){const d=t.position.clone().sub(jet.position);const planar=new THREE.Vector3(d.x,0,d.z).applyAxisAngle(up,-yaw);const x=clamp(50+planar.x/80,-1,101),y=clamp(50+planar.z/80,-1,101);if(x<0||x>100||y<0||y>100)continue;const dot=document.createElement('div');dot.className='contact'+(t.type==='friendly'?' friendly':'');dot.style.left=x+'%';dot.style.top=y+'%';wrap.appendChild(dot);}}
function updateHud(){
  $('speed').textContent=String(Math.round(speed*1.944)).padStart(3,'0');
  $('altitude').textContent=String(Math.max(0,Math.round(jet.position.y*3.281))).padStart(4,'0');
  const ground=Math.max(terrainHeight(jet.position.x,jet.position.z),world?.collisionHeight?.(jet.position.x,jet.position.z)??-100);
  const agl=jet.position.y-ground;
  $('agl').textContent=String(Math.max(0,Math.round(agl*3.281))).padStart(4,'0');
  const heading=Math.round(compassHeading(forward))%360;
  $('heading').textContent=String(heading).padStart(3,'0');
  $('flight-attitude').textContent=`PITCH ${THREE.MathUtils.radToDeg(pitch)>=0?'+':''}${Math.round(THREE.MathUtils.radToDeg(pitch))}° · ROLL ${THREE.MathUtils.radToDeg(roll)>=0?'+':''}${Math.round(THREE.MathUtils.radToDeg(roll))}° · YAW ${String(heading).padStart(3,'0')}°`;
  $('throttle').textContent=String(Math.round(throttle*100)).padStart(2,'0');
  $('missiles').textContent=String(missiles).padStart(2,'0');
  $('health').textContent=Math.ceil(health)+'%';$('health-bar').style.width=health+'%';$('clock').textContent=formatTime(elapsed);
  $('bombs').textContent=String(bombAmmo).padStart(2,'0');
  $('nukes').textContent=Number.isFinite(nuclearAmmo)?String(nuclearAmmo).padStart(2,'0'):'∞';
  const armed=bombProjectiles.find(bomb=>bomb.nuclear&&bomb.armed);
  $('nuke-countdown').classList.toggle('hidden',!armed);
  if(armed)$('nuke-countdown').textContent=`SPECIAL WEAPON ARMED · ${Math.max(0,armed.fuse).toFixed(1)} S · CLEAR AREA`;
  $('flight-state').textContent=agl<35&&forward.y<-.04?'TERRAIN WARNING':airbrake?'AIR BRAKE':speed<42?'STALL WARNING':Math.abs(roll)>1.1?'HIGH BANK ANGLE':throttle>.88?'AFTERBURNER':'FLIGHT STABLE';
  updateRadar();
  if(mode==='mission'){
    const waypoint=phase===0?radars.find(r=>r.alive)?.position:phase===1?enemies.find(e=>e.alive)?.position:extraction?.position;
    if(waypoint){const d=waypoint.clone().sub(jet.position);$('objective').textContent=(phase===0?'DESTROY RELAY SITES':phase===1?'CLEAR HOSTILE AIRCRAFT':'REACH EXTRACTION')+` · ${(d.length()/1000).toFixed(1)} KM`;}
  }
}
function tick(dt){elapsed+=dt;gunCooldown=Math.max(0,gunCooldown-dt);missileCooldown=Math.max(0,missileCooldown-dt);bombCooldown=Math.max(0,bombCooldown-dt);updateFlight(dt);if(paused)return;updateEnemies(dt);updateEnemyShots(dt);if(paused)return;updateProjectiles(dt);updateBombs(dt);updateNuclearEffects(dt);if(paused)return;updateWrecks(dt);updateDestruction(dt);updateCamera(dt);updateLock(dt);updateWeaponCue(dt);if(mode==='mission'&&phase===2&&extraction&&jet.position.distanceTo(extraction.position)<170)finish(true);hudTimer+=dt;if(hudTimer>.1){hudTimer=0;updateHud();}}
async function animate(){const frameMs=clock.getDelta()*1000,dt=Math.min(frameMs/1000,.05),inFlight=mode!=='menu';if(!paused)world?.update(dt,jet?.position||previewJet?.position,forward,speed,inFlight);if(mode==='menu')updateMenuCamera(dt);else if(!paused)tick(dt);blastFlash=Math.max(0,blastFlash-dt*1.35);$('blast-flash').style.opacity=String(blastFlash*.85);world?.updateTiles?.(frameMs,jet?.position.y??camera.position.y,inFlight);if(debugOutput&&performance.now()-lastDebug>1000){debugOutput.textContent=JSON.stringify({mode,position:jet?.position.toArray(),speed,quality:world?.quality});lastDebug=performance.now();}await renderer.renderAsync(scene,camera);requestAnimationFrame(animate);}

window.addEventListener('resize',()=>{if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));world?.setResolution?.();});
window.addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.repeat)return;if((e.code==='Escape'||e.code==='KeyP')&&mode!=='menu')showPause();if(e.code==='KeyC'&&mode!=='menu'&&!paused){cameraMode=(cameraMode+1)%3;audio.click();}if(e.code==='KeyG'&&mode!=='menu'&&!paused){airbrake=!airbrake;audio.click();}if(e.code==='KeyF'&&mode!=='menu'&&!paused)fireMissile();if(e.code==='KeyB'&&mode!=='menu'&&!paused)dropBomb(false);if(e.code==='KeyN'&&mode!=='menu'&&!paused)dropBomb(true);if(e.code==='KeyM'){const value=audio.toggleMute();ui.volume.value=String(Math.round(value*100));ui.volumeValue.textContent=`${Math.round(value*100)}%`;}});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();if(mode!=='menu'&&!paused)showPause();});
window.addEventListener('mousemove',e=>{if(document.pointerLockElement===renderer?.domElement){mouseActive=true;mouseX=clamp(mouseX+e.movementX/260,-1,1);mouseY=clamp(mouseY+e.movementY/260,-1,1);}});
window.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==renderer?.domElement){mouseActive=false;mouseX=0;mouseY=0;}});
$('game').addEventListener('click',()=>{if(mode!=='menu'&&!paused)renderer?.domElement.requestPointerLock?.();});
window.addEventListener('mousedown',e=>{if(mode==='menu'||paused||e.target!==renderer?.domElement)return;if(e.button===0)keys.add('MouseLeft');if(e.button===2)keys.add('MouseRight');});window.addEventListener('mouseup',e=>{if(e.button===0)keys.delete('MouseLeft');if(e.button===2)keys.delete('MouseRight');});window.addEventListener('contextmenu',e=>{if(mode!=='menu')e.preventDefault();});
ui.volume.addEventListener('input',()=>{const value=Number(ui.volume.value)/100;audio.setVolume(value);ui.volumeValue.textContent=`${Math.round(value*100)}%`;});
$('start-mission').onclick=()=>start(false);$('start-free').onclick=()=>start(true);$('pause-button').onclick=showPause;$('controls-button').onclick=showPause;$('resume-button').onclick=showPause;$('restart-button').onclick=()=>start(mode==='free');$('hangar-button').onclick=hangar;
init();
