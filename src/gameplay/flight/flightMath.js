import * as THREE from 'three';
import {stallSeverity} from './flightPerformance.js';

const increment=new THREE.Euler(0,0,0,'YXZ');
const turn=new THREE.Quaternion();
// Inputs are aircraft-local: positive pitch raises the nose, positive roll
// banks left, and positive yaw turns left. Keeping the orientation as a
// quaternion allows loops and inverted flight without Euler-angle snapping.
export function applyFlightInput(orientation,controls,dt,agility,airspeed=90,airbrake=false){
  // Keep roll authority when pitch or rudder is held at the same time. Each
  // surface has its own bounded travel; a diagonal key combination should not
  // make a barrel roll take almost twice as long.
  const pitch=THREE.MathUtils.clamp(controls.pitchInput,-1,1);
  const roll=THREE.MathUtils.clamp(controls.rollInput,-1,1);
  const yaw=THREE.MathUtils.clamp(controls.yawInput,-1,1);
  const authority=THREE.MathUtils.clamp(airspeed/55,.55,1.1)/(1+Math.max(0,airspeed-190)/420)*(airbrake?1.12:1);
  increment.set(pitch*dt*.86*agility*authority,yaw*dt*.42*agility*authority,roll*dt*1.55*agility*authority,'YXZ');
  orientation.multiply(turn.setFromEuler(increment)).normalize();
  return orientation;
}

export function compassHeading(forward){
  return ((Math.atan2(forward.x,-forward.z)*180/Math.PI)%360+360)%360;
}

export function createFlightMotion(){return {pitchRate:0,rollRate:0,yawRate:0,angleOfAttack:0,stallSink:0};}

// A rate controller adds angular inertia without auto-leveling the aircraft.
// Releasing a key settles the rotation but preserves the achieved bank.
export function stepFlightAttitude(orientation,motion,controls,dt,profile,airspeed,airbrake=false,highAlpha=false){
  const clamp=THREE.MathUtils.clamp;
  const stall=stallSeverity(airspeed,profile);
  const authority=clamp(airspeed/(profile.maneuverSpeed||85),profile.thrustVectoring ? .55 : .38,1.08)*(1-stall*.68);
  const structuralRate=profile.gLimit*9.81/Math.max(airspeed,57)*(airbrake?1.12:1);
  const scale=profile.gameSpeedScale||1;
  const assisted=highAlpha&&profile.thrustVectoring>0&&airspeed>38*scale&&airspeed<145*scale;
  const pitchLimit=Math.min(profile.pitchRate*authority*(assisted?1+profile.thrustVectoring*.65:1),structuralRate*(assisted?1.7:1));
  const rollLimit=profile.rollRate*clamp(airspeed/((profile.maneuverSpeed||85)*.86),.55,1.08)*(1-stall*.72);
  const yawLimit=Math.min(profile.yawRate*authority*(assisted?1.25:1),structuralRate*.85*(assisted?1.5:1));
  const commanded={pitchRate:clamp(controls.pitchInput,-1,1)*pitchLimit,rollRate:clamp(controls.rollInput,-1,1)*rollLimit,yawRate:clamp(controls.yawInput,-1,1)*yawLimit};
  const follow=1-Math.exp(-profile.response*dt);
  for(const axis of ['pitchRate','rollRate','yawRate']){
    const goal=motion[axis]+(commanded[axis]-motion[axis])*follow;
    motion[axis]+=clamp(goal-motion[axis],-profile.angularAcceleration*dt,profile.angularAcceleration*dt);
  }
  increment.set(motion.pitchRate*dt,motion.yawRate*dt,motion.rollRate*dt,'YXZ');
  orientation.multiply(turn.setFromEuler(increment)).normalize();
  return motion;
}

const flightPathDirection=new THREE.Vector3();
export function stepFlightPath(velocity,noseForward,airspeed,dt,profile,highAlpha=false){
  if(velocity.lengthSq()<.001)velocity.copy(noseForward).multiplyScalar(airspeed);
  flightPathDirection.copy(velocity).normalize();
  const scale=profile.gameSpeedScale||1;
  const assisted=highAlpha&&profile.thrustVectoring>0&&airspeed>38*scale&&airspeed<145*scale;
  const response=profile.pathResponse*(assisted ? .21 : 1)*(1-stallSeverity(airspeed,profile)*.72);
  flightPathDirection.lerp(noseForward,1-Math.exp(-response*dt)).normalize();
  velocity.copy(flightPathDirection).multiplyScalar(airspeed);
  return Math.acos(THREE.MathUtils.clamp(flightPathDirection.dot(noseForward),-1,1));
}
