import * as THREE from 'three';
import {WebGPURenderer} from 'three/webgpu';
import {AIRCRAFT,createJet,loadJetModels} from './jet.js';
import {animateControlSurfaces} from './controlSurfaces.js';
import {createWorld,createRadar,createEnemy,createExtraction,terrainHeight} from './world.js';
import {FlightAudio} from './audio.js';
import {applyFlightInput,compassHeading} from './flightMath.js';
import {keyboardAxes} from './inputMapping.js';
import {targetAirspeed} from './flightPerformance.js';

const $=id=>document.getElementById(id);
const ui={menu:$('menu'),hud:$('hud'),overlay:$('overlay'),gpu:$('gpu-status'),options:$('jet-options'),detail:$('jet-detail'),count:$('jet-count'),volume:$('volume'),volumeValue:$('volume-value')};
const audio=new FlightAudio();
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(67,innerWidth/innerHeight,.5,50000);
let renderer,world,selected=0,jet,previewJet,mode='menu',paused=false,ended=false,phase=0,elapsed=0,kills=0,shots=0,missiles=6,health=100,throttle=.68,speed=100,pitch=0,yaw=0,roll=0,gunTime=0,gunCooldown=0,missileCooldown=0,lockTime=0,target=null,radars=[],enemies=[],extraction=null,projectiles=[],particles=[],cameraMode=0,radioTime=0,radioText='',lastWarning=0,mouseX=0,mouseY=0,mouseActive=false,gamepadWasPressed=false,airbrake=false,hudTimer=0;
const keys=new Set();const forward=new THREE.Vector3(),quat=new THREE.Quaternion(),tmp=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);const euler=new THREE.Euler(0,0,0,'YXZ');const clock=new THREE.Clock();
const clamp=THREE.MathUtils.clamp;

function setRadio(message){radioText=message;radioTime=elapsed;$('radio').textContent=message;}
function updateJetOptions(){ui.options.innerHTML='';AIRCRAFT.forEach((spec,i)=>{const b=document.createElement('button');b.className='jet-option'+(selected===i?' active':'');b.innerHTML=`<small>0${i+1} / ${spec.role.split(' ')[0]}</small><strong>${spec.label}</strong>`;b.onclick=()=>{selected=i;audio.click();updateJetOptions();setPreviewJet();};ui.options.appendChild(b)});const a=AIRCRAFT[selected];ui.count.textContent=`0${selected+1} / 04`;ui.detail.textContent=`${a.origin}  /  ${a.role}  /  SPEED ${Math.round(a.speed*100)}  /  AGILITY ${Math.round(a.turn*100)}`;}
function setPreviewJet(){if(previewJet)scene.remove(previewJet);previewJet=createJet(AIRCRAFT[selected],2.15);previewJet.position.set(0,180,300);previewJet.rotation.set(.02,-.18,-.12);scene.add(previewJet);}

async function init(){
  updateJetOptions();
  $('start-mission').disabled=true;$('start-free').disabled=true;
  if(!navigator.gpu){ui.gpu.textContent='WEBGPU IS UNAVAILABLE IN THIS BROWSER. USE A CURRENT CHROME OR EDGE BUILD WITH GPU ACCELERATION.';ui.gpu.classList.add('error');$('start-mission').disabled=true;$('start-free').disabled=true;return;}
  try{renderer=new WebGPURenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;await renderer.init();$('game').appendChild(renderer.domElement);ui.gpu.textContent='LOADING HELSINKI CITY…';await Promise.all([createWorld(scene,(done,total)=>ui.gpu.textContent=`LOADING CITY ${done} / ${total}…`).then(value=>world=value),loadJetModels()]);setPreviewJet();ui.gpu.textContent='WEBGPU READY · RENDERER INITIALIZED';$('start-mission').disabled=false;$('start-free').disabled=false;animate();}
  catch(error){console.error(error);ui.gpu.textContent=`WEBGPU INITIALIZATION FAILED: ${error.message}`;ui.gpu.classList.add('error');$('start-mission').disabled=true;$('start-free').disabled=true;}
}

function removeObject(object){if(!object)return;scene.remove(object);if(object.userData.afterburners)return;object.traverse(child=>{if(child.isMesh){child.geometry.dispose();const materials=Array.isArray(child.material)?child.material:[child.material];for(const material of materials)material?.dispose();}});}
function clearSceneObjects(){removeObject(jet);jet=null;removeObject(previewJet);previewJet=null;for(const t of [...radars,...enemies])removeObject(t.group);for(const m of projectiles)removeObject(m.mesh);for(const p of particles){scene.remove(p.mesh);if(!p.sharedGeometry)p.mesh.geometry.dispose();p.mesh.material.dispose();}if(extraction)removeObject(extraction.group);radars=[];enemies=[];projectiles=[];particles=[];extraction=null;}
function start(free=false){if(!renderer)return;clearSceneObjects();audio.init();audio.ctx?.resume();mode=free?'free':'mission';paused=false;ended=false;phase=0;elapsed=0;kills=0;shots=0;missiles=free?99:6;health=100;throttle=.68;speed=100;pitch=0;yaw=0;roll=0;quat.identity();forward.set(0,0,-1);lockTime=0;target=null;cameraMode=0;mouseActive=false;mouseX=0;mouseY=0;gamepadWasPressed=false;airbrake=false;hudTimer=0;jet=createJet(AIRCRAFT[selected]);jet.position.set(0,430,1550);scene.add(jet);if(!free){radars=[createRadar(scene,-180,-1420,'RELAY ALPHA'),createRadar(scene,520,-2480,'RELAY BRAVO')];setRadio('Viper One, this is Echo. Two hostile relay sites are jamming the Helsinki evacuation corridor. Silence them.');}else{setRadio('Free flight authorized. Explore Helsinki at your own pace.');}
  ui.menu.classList.add('hidden');ui.overlay.classList.add('hidden');ui.hud.classList.remove('hidden');$('mode-label').textContent=free?'FREE FLIGHT':'MISSION 01';$('mission-name').textContent=free?'HELSINKI // FREE FLIGHT':'BREAK THE SILENCE';updateObjective();updateCamera(1);audio.click();}
function hangar(){paused=false;mode='menu';clearSceneObjects();setPreviewJet();ui.overlay.classList.add('hidden');ui.hud.classList.add('hidden');ui.menu.classList.remove('hidden');document.exitPointerLock?.();}
function finish(win){paused=true;ended=true;document.exitPointerLock?.();$('overlay-kicker').textContent=win?'MISSION COMPLETE':'AIRCRAFT LOST';$('overlay-title').textContent=win?'THE STRAIT IS OPEN':'SIGNAL LOST';$('overlay-text').textContent=win?'The radar net is silent and the evacuation route is clear. Echo confirms the convoy is moving.':'Echo has lost your transponder. The operation will have to be flown again.';$('overlay-stats').innerHTML=`<span>TIME ${formatTime(elapsed)}</span><span>TARGETS ${kills}</span><span>MISSILES FIRED ${shots}</span>`;$('pause-controls').classList.add('hidden');$('resume-button').classList.add('hidden');ui.overlay.classList.remove('hidden');if(win)audio.tone(460,.55,'triangle',.13,860);}
function showPause(){if(mode==='menu'||ended)return;paused=!paused;$('overlay-kicker').textContent='FLIGHT PAUSED';$('overlay-title').textContent='SYSTEMS HOLD';$('overlay-text').textContent='Flight paused. Review the controls below.';$('overlay-stats').innerHTML=`<span>TIME ${formatTime(elapsed)}</span><span>TARGETS ${kills}</span><span>HULL ${Math.ceil(health)}%</span>`;$('pause-controls').classList.remove('hidden');$('resume-button').classList.remove('hidden');ui.overlay.classList.toggle('hidden',!paused);if(paused){keys.clear();document.exitPointerLock?.();}}
function formatTime(t){return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;}

function updateObjective(){let title,progress;if(mode==='free'){title='FLY / EXPLORE HELSINKI';progress=100;}else if(phase===0){title='DESTROY RELAY SITES';progress=(2-radars.filter(r=>r.alive).length)/2*100;}else if(phase===1){title='CLEAR HOSTILE AIRCRAFT';progress=(2-enemies.filter(e=>e.alive).length)/2*100;}else{title='REACH EXTRACTION';progress=0;}$('objective').textContent=title;$('objective-progress').style.width=`${progress}%`;}
function advanceMission(){if(mode!=='mission')return;if(phase===0&&radars.every(r=>!r.alive)){phase=1;missiles=Math.max(missiles,4);const p=jet.position.clone().addScaledVector(forward,3300);enemies=[createEnemy(scene,p.x-430,Math.max(p.y+120,700),p.z-140,0),createEnemy(scene,p.x+520,Math.max(p.y-80,650),p.z-500,1)];setRadio('Relay net is down. Two fast movers inbound. Clear the airspace, Viper One.');audio.warning();updateObjective();}else if(phase===1&&enemies.every(e=>!e.alive)){phase=2;missiles=Math.max(missiles,2);const p=jet.position.clone().addScaledVector(forward,2200);extraction=createExtraction(scene,p.x,p.z,jet.position.y);setRadio('Airspace clear. Follow the green extraction gate. The convoy is moving.');updateObjective();}}
function onTargetDestroyed(t){t.alive=false;kills++;if(t.type==='radar'){t.dish.visible=false;t.beacon.visible=false;t.group.traverse(o=>{if(o.isMesh&&o.material?.color)o.material.color.multiplyScalar(.55)});}else{scene.remove(t.group);}explode(t.position,1.5);audio.explosion();setRadio(t.type==='radar'?`${t.name} destroyed. ${radars.filter(r=>r.alive).length} relay sites remain.`:`${t.name} splashed. ${enemies.filter(e=>e.alive).length} hostile aircraft remain.`);advanceMission();updateObjective();}

function getControls(){const gp=navigator.getGamepads?.()[0];let {pitchInput,rollInput,yawInput,throttleInput}=keyboardAxes(keys),fire=keys.has('Space')||keys.has('MouseLeft'),missile=keys.has('KeyF')||keys.has('MouseRight');if(mouseActive){pitchInput=clamp(pitchInput+mouseY*.7,-1,1);rollInput=clamp(rollInput-mouseX*.7,-1,1);}if(gp){const dz=a=>Math.abs(a)<.12?0:a;pitchInput=clamp(pitchInput+dz(gp.axes[1]||0),-1,1);rollInput=clamp(rollInput-dz(gp.axes[0]||0),-1,1);yawInput=clamp(yawInput+(gp.buttons[4]?.pressed?1:0)-(gp.buttons[5]?.pressed?1:0),-1,1);throttleInput=clamp(throttleInput+(gp.buttons[7]?.value||0)-(gp.buttons[6]?.value||0),-1,1);fire=fire||gp.buttons[0]?.pressed;missile=missile||gp.buttons[1]?.pressed;}return{pitchInput,rollInput,yawInput,throttleInput,fire,missile};}
function updateFlight(dt){const c=getControls(),spec=AIRCRAFT[selected];throttle=clamp(throttle+c.throttleInput*dt*.34,.2,1);const desired=targetAirspeed(throttle,spec.speed,airbrake);speed+=clamp(desired-speed,(airbrake?-42:-22)*dt,28*dt);applyFlightInput(quat,c,dt,spec.turn);jet.quaternion.copy(quat);animateControlSurfaces(jet,c,dt,airbrake);forward.set(0,0,-1).applyQuaternion(quat).normalize();yaw=Math.atan2(-forward.x,-forward.z);euler.setFromQuaternion(quat,'YXZ');pitch=euler.x;roll=euler.z;if(mouseActive){const returnRate=Math.exp(-dt*5);mouseX*=returnRate;mouseY*=returnRate;}jet.position.addScaledVector(forward,speed*dt);jet.position.y-=Math.max(0,60-speed)*.18*dt;for(const flame of jet.userData.afterburners||[]){flame.visible=throttle>.82&&!airbrake;flame.scale.z=.75+throttle*.8+Math.sin(elapsed*43)*.08;}const floor=Math.max(-1.4,terrainHeight(jet.position.x,jet.position.z));if(jet.position.y<floor+9){health=0;explode(jet.position,2);audio.explosion();finish(false);return;}if(speed<62&&elapsed-lastWarning>5){setRadio('Stall warning. Add throttle and lower the nose.');lastWarning=elapsed;}if(c.fire)fireGun(dt);else gunTime=0;if(c.missile&&!gamepadWasPressed)fireMissile();gamepadWasPressed=!!c.missile;audio.update(throttle,speed);}
function findTarget(){const candidates=(mode==='mission'&&phase===0?radars:enemies).filter(t=>t.alive);let best=null,bestScore=Infinity;for(const t of candidates){const delta=tmp.copy(t.position).sub(jet.position),distance=delta.length();if(distance>7500)continue;const angle=forward.angleTo(delta);const score=angle*8500+distance;if(angle<.55&&score<bestScore){best=t;bestScore=score;}}return best;}
function updateLock(dt){const next=findTarget();if(next!==target){target=next;lockTime=0;}$('target-label').classList.toggle('hidden',!target);if(!target){$('lock-ring').classList.remove('active');return;}const distance=target.position.distanceTo(jet.position),angle=forward.angleTo(tmp.copy(target.position).sub(jet.position));const acquiring=angle<.31&&distance<6000;lockTime=clamp(lockTime+(acquiring?dt:-dt*1.8),0,1.35);const locked=lockTime>=1.35;$('lock-ring').classList.toggle('active',acquiring);$('lock-ring').style.opacity=acquiring?String(.3+lockTime/1.35*.7):'0';const projected=target.position.clone().project(camera);const label=$('target-label');label.style.left=clamp((projected.x*.5+.5)*innerWidth,140,innerWidth-140)+'px';label.style.top=clamp((-projected.y*.5+.5)*innerHeight+40,90,innerHeight-170)+'px';label.textContent=`${locked?'◆ LOCK':'◇ TRACK'}  ${target.name}  ${(distance/1000).toFixed(1)} KM`;if(locked&&lockTime-dt<1.35)audio.lock();}
function fireMissile(){
  if(!jet||missiles<=0||missileCooldown>0||!target||lockTime<1.35)return;
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
  const motor=new THREE.Mesh(new THREE.SphereGeometry(.25,10,8),new THREE.MeshBasicMaterial({color:0x8bdcff,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false}));
  motor.position.y=-1.85;motor.scale.set(1,1.8,1);mesh.add(motor);
  const railOffset=new THREE.Vector3((shots%2?1:-1)*2.35,-1.1,-.5).applyQuaternion(quat);
  mesh.position.copy(jet.position).add(railOffset);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),forward);
  scene.add(mesh);
  projectiles.push({mesh,target,velocity:forward.clone().multiplyScalar(speed+500),life:11,smokeTime:0,motor});
  audio.missile();setRadio('Fox two. Missile away.');
}
function fireGun(dt){gunTime+=dt;if(gunCooldown>0)return;gunCooldown=.065;audio.gun();if(target&&target.alive){const delta=tmp.copy(target.position).sub(jet.position);if(delta.length()<1900&&forward.angleTo(delta)<.065){target.health-=.23;if(target.health<=0)onTargetDestroyed(target);}}const tracer=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,38,5),new THREE.MeshBasicMaterial({color:0xffe2aa}));tracer.rotation.x=Math.PI/2;tracer.position.copy(jet.position).addScaledVector(forward,28).addScaledVector(up,-.3);tracer.quaternion.copy(quat).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2));scene.add(tracer);particles.push({mesh:tracer,velocity:forward.clone().multiplyScalar(1250),life:.25,maxLife:.25});}
const smokeGeometry=new THREE.IcosahedronGeometry(1,1);
function emitSmoke(position,size=2,life=.9){
  const mesh=new THREE.Mesh(smokeGeometry,new THREE.MeshBasicMaterial({color:0x63717a,transparent:true,opacity:.27,depthWrite:false}));
  mesh.position.copy(position);mesh.scale.setScalar(size);scene.add(mesh);
  particles.push({mesh,velocity:new THREE.Vector3((Math.random()-.5)*13,9+Math.random()*12,(Math.random()-.5)*13),life,maxLife:life,baseOpacity:.27,growth:12,sharedGeometry:true});
}
function explode(position,scale=1){
  const flash=new THREE.Mesh(new THREE.IcosahedronGeometry(7*scale,2),new THREE.MeshBasicMaterial({color:0xffd392,transparent:true,opacity:.95,depthWrite:false,blending:THREE.AdditiveBlending}));
  flash.position.copy(position);scene.add(flash);
  particles.push({mesh:flash,velocity:new THREE.Vector3(),life:.23,maxLife:.23,baseOpacity:.95,growth:30*scale});
  const ring=new THREE.Mesh(new THREE.TorusGeometry(6*scale,.45*scale,6,32),new THREE.MeshBasicMaterial({color:0xffb26c,transparent:true,opacity:.7,depthWrite:false,blending:THREE.AdditiveBlending}));
  ring.position.copy(position);ring.quaternion.copy(camera.quaternion);scene.add(ring);
  particles.push({mesh:ring,velocity:new THREE.Vector3(),life:.43,maxLife:.43,baseOpacity:.7,growth:40*scale});
  for(let i=0;i<16;i++){
    const color=i%4===0?0xffe3a3:i%3===0?0xf85b35:0xff9d4f;
    const mesh=new THREE.Mesh(new THREE.IcosahedronGeometry((.8+Math.random()*1.5)*scale,0),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9,depthWrite:false}));
    mesh.position.copy(position);scene.add(mesh);
    const velocity=new THREE.Vector3((Math.random()-.5)*170,(Math.random()-.2)*140,(Math.random()-.5)*170);
    particles.push({mesh,velocity,life:.45+Math.random()*.5,maxLife:1,baseOpacity:.9});
  }
  for(let i=0;i<8;i++)emitSmoke(position.clone().add(new THREE.Vector3((Math.random()-.5)*12,Math.random()*5,(Math.random()-.5)*12)),(4+Math.random()*5)*scale,1.1+Math.random()*.7);
}
function updateProjectiles(dt){
  for(let i=projectiles.length-1;i>=0;i--){
    const m=projectiles[i];m.life-=dt;
    if(m.target.alive){const desired=tmp.copy(m.target.position).sub(m.mesh.position).normalize().multiplyScalar(920);m.velocity.lerp(desired,clamp(dt*3,0,1));}
    m.mesh.position.addScaledVector(m.velocity,dt);
    m.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),m.velocity.clone().normalize());
    m.motor.scale.y=1.5+Math.sin(elapsed*63+i)*.3;
    m.smokeTime+=dt;
    if(m.smokeTime>.07){m.smokeTime=0;emitSmoke(m.mesh.position.clone().addScaledVector(m.velocity.clone().normalize(),-2.3),1.2,.7);}
    if(m.target.alive&&m.mesh.position.distanceTo(m.target.position)<(m.target.type==='radar'?55:30)){
      m.target.health-=3;explode(m.mesh.position,.55);if(m.target.health<=0)onTargetDestroyed(m.target);m.life=0;
    }
    if(m.life<=0){scene.remove(m.mesh);m.mesh.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});projectiles.splice(i,1);}
  }
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];p.life-=dt;p.mesh.position.addScaledVector(p.velocity,dt);
    if(p.mesh.material.transparent)p.mesh.material.opacity=(p.baseOpacity??1)*clamp(p.life/p.maxLife,0,1);
    if(p.growth)p.mesh.scale.addScalar(dt*p.growth);else p.mesh.scale.multiplyScalar(1+dt*.9);
    if(p.life<=0){scene.remove(p.mesh);if(!p.sharedGeometry)p.mesh.geometry.dispose();p.mesh.material.dispose();particles.splice(i,1);}
  }
}
function updateEnemies(dt){for(const enemy of enemies){if(!enemy.alive)continue;enemy.phase+=dt*.32;const offset=enemy.position.clone().sub(jet.position);const distance=offset.length();if(distance<7500){const desired=jet.position.clone().addScaledVector(forward,1350).add(new THREE.Vector3(Math.sin(enemy.phase)*390,120+Math.sin(enemy.phase*1.8)*130,Math.cos(enemy.phase)*220));const move=desired.sub(enemy.position);const direction=move.clone().normalize();enemy.group.quaternion.slerp(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1),direction),dt*.7);enemy.position.addScaledVector(direction,Math.min(enemy.speed*dt,move.length()));enemy.position.y=Math.max(enemy.position.y,terrainHeight(enemy.position.x,enemy.position.z)+180);enemy.fireTimer-=dt;if(distance<1350&&enemy.fireTimer<=0){enemy.fireTimer=6+Math.random()*2;health=Math.max(0,health-(8+Math.random()*5));audio.warning();setRadio('Viper One, hostile fire! Break hard!');$('warning').classList.remove('hidden');setTimeout(()=>$('warning').classList.add('hidden'),1150);if(health<=0){explode(jet.position,2);finish(false);}}}else{enemy.group.rotation.y+=dt*.05;}}}
function updateCamera(dt){if(!jet)return;const local=cameraMode===0?new THREE.Vector3(0,3.6,19):cameraMode===1?new THREE.Vector3(0,.74,-3.1):new THREE.Vector3(14,5.5,22);const desired=local.applyQuaternion(quat).add(jet.position);camera.position.copy(desired);const look=jet.position.clone().addScaledVector(forward,cameraMode===1?350:210);if(cameraMode===2)look.add(new THREE.Vector3(0,1,0));const aircraftUp=up.clone().applyQuaternion(quat);camera.up.copy(cameraMode===1?aircraftUp:up.clone().lerp(aircraftUp,.18).normalize());camera.lookAt(look);jet.visible=cameraMode!==1;$('cockpit').classList.toggle('hidden',cameraMode!==1);$('camera-state').textContent=['CHASE CAM','COCKPIT CAM','CINEMATIC CAM'][cameraMode];}
function updateMenuCamera(dt){if(!previewJet)return;const t=performance.now()*.00014;animateControlSurfaces(previewJet,{pitchInput:Math.sin(t*7)*.35,rollInput:Math.sin(t*5)*.45,yawInput:Math.sin(t*4)*.3},dt);previewJet.rotation.y=-.22+Math.sin(t)*.07;previewJet.rotation.z=-.09+Math.sin(t*1.4)*.025;camera.position.set(80+Math.sin(t)*5,265,530);camera.up.set(0,1,0);camera.lookAt(-20,65,30);}
function updateRadar(){const wrap=$('radar-contacts');wrap.innerHTML='';if(!jet)return;const contacts=[...radars,...enemies].filter(t=>t.alive);if(extraction)contacts.push({position:extraction.position,type:'friendly'});for(const t of contacts){const d=t.position.clone().sub(jet.position);const planar=new THREE.Vector3(d.x,0,d.z).applyAxisAngle(up,-yaw);const x=clamp(50+planar.x/80,-1,101),y=clamp(50+planar.z/80,-1,101);if(x<0||x>100||y<0||y>100)continue;const dot=document.createElement('div');dot.className='contact'+(t.type==='friendly'?' friendly':'');dot.style.left=x+'%';dot.style.top=y+'%';wrap.appendChild(dot);}}
function updateHud(){const knots=speed*1.944;$('speed').textContent=String(Math.round(knots)).padStart(3,'0');$('altitude').textContent=String(Math.max(0,Math.round(jet.position.y*3.281))).padStart(4,'0');const heading=Math.round(compassHeading(forward))%360;$('heading').textContent=String(heading).padStart(3,'0');$('flight-attitude').textContent=`PITCH ${THREE.MathUtils.radToDeg(pitch)>=0?'+':''}${Math.round(THREE.MathUtils.radToDeg(pitch))}° · ROLL ${THREE.MathUtils.radToDeg(roll)>=0?'+':''}${Math.round(THREE.MathUtils.radToDeg(roll))}° · YAW ${String(heading).padStart(3,'0')}°`;$('throttle').textContent=String(Math.round(throttle*100)).padStart(2,'0');$('missiles').textContent=String(missiles).padStart(2,'0');$('health').textContent=Math.ceil(health)+'%';$('health-bar').style.width=health+'%';$('clock').textContent=formatTime(elapsed);$('flight-state').textContent=airbrake?'AIR BRAKE':speed<62?'STALL WARNING':Math.abs(roll)>1.1?'HIGH BANK ANGLE':throttle>.88?'AFTERBURNER':'FLIGHT STABLE';updateRadar();if(mode==='mission'){const waypoint=phase===0?radars.find(r=>r.alive)?.position:phase===1?enemies.find(e=>e.alive)?.position:extraction?.position;if(waypoint){const d=waypoint.clone().sub(jet.position);$('objective').textContent=(phase===0?'DESTROY RELAY SITES':phase===1?'CLEAR HOSTILE AIRCRAFT':'REACH EXTRACTION')+` · ${(d.length()/1000).toFixed(1)} KM`;}}}
function tick(dt){elapsed+=dt;gunCooldown=Math.max(0,gunCooldown-dt);missileCooldown=Math.max(0,missileCooldown-dt);updateFlight(dt);if(paused)return;updateEnemies(dt);updateProjectiles(dt);updateCamera(dt);updateLock(dt);if(mode==='mission'&&phase===2&&extraction&&jet.position.distanceTo(extraction.position)<170)finish(true);hudTimer+=dt;if(hudTimer>.1){hudTimer=0;updateHud();}}
async function animate(){const dt=Math.min(clock.getDelta(),.05);world?.update(dt,jet?.position||previewJet?.position);if(mode==='menu')updateMenuCamera(dt);else if(!paused)tick(dt);await renderer.renderAsync(scene,camera);requestAnimationFrame(animate);}

window.addEventListener('resize',()=>{if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));});
window.addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.repeat)return;if((e.code==='Escape'||e.code==='KeyP')&&mode!=='menu')showPause();if(e.code==='KeyC'&&mode!=='menu'&&!paused){cameraMode=(cameraMode+1)%3;audio.click();}if(e.code==='KeyG'&&mode!=='menu'&&!paused){airbrake=!airbrake;audio.click();}if(e.code==='KeyF'&&mode!=='menu'&&!paused)fireMissile();if(e.code==='KeyM'){const value=audio.toggleMute();ui.volume.value=String(Math.round(value*100));ui.volumeValue.textContent=`${Math.round(value*100)}%`;}});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();if(mode!=='menu'&&!paused)showPause();});
window.addEventListener('mousemove',e=>{if(document.pointerLockElement===renderer?.domElement){mouseActive=true;mouseX=clamp(mouseX+e.movementX/260,-1,1);mouseY=clamp(mouseY+e.movementY/260,-1,1);}});
window.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==renderer?.domElement){mouseActive=false;mouseX=0;mouseY=0;}});
$('game').addEventListener('click',()=>{if(mode!=='menu'&&!paused)renderer?.domElement.requestPointerLock?.();});
window.addEventListener('mousedown',e=>{if(mode==='menu'||paused||e.target!==renderer?.domElement)return;if(e.button===0)keys.add('MouseLeft');if(e.button===2)keys.add('MouseRight');});window.addEventListener('mouseup',e=>{if(e.button===0)keys.delete('MouseLeft');if(e.button===2)keys.delete('MouseRight');});window.addEventListener('contextmenu',e=>{if(mode!=='menu')e.preventDefault();});
ui.volume.addEventListener('input',()=>{const value=Number(ui.volume.value)/100;audio.setVolume(value);ui.volumeValue.textContent=`${Math.round(value*100)}%`;});
$('start-mission').onclick=()=>start(false);$('start-free').onclick=()=>start(true);$('pause-button').onclick=showPause;$('controls-button').onclick=showPause;$('resume-button').onclick=showPause;$('restart-button').onclick=()=>start(mode==='free');$('hangar-button').onclick=hangar;
init();
