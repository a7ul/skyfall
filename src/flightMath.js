import * as THREE from 'three';

const increment=new THREE.Euler(0,0,0,'YXZ');
const turn=new THREE.Quaternion();
// Inputs are aircraft-local: positive pitch raises the nose, positive roll
// banks left, and positive yaw turns left. Keeping the orientation as a
// quaternion allows loops and inverted flight without Euler-angle snapping.
export function applyFlightInput(orientation,controls,dt,agility,airspeed=90,airbrake=false){
  const length=Math.hypot(controls.pitchInput,controls.rollInput,controls.yawInput);
  const scale=length>1?1/length:1;
  const authority=THREE.MathUtils.clamp(airspeed/55,.55,1.1)/(1+Math.max(0,airspeed-190)/420)*(airbrake?1.12:1);
  increment.set(controls.pitchInput*scale*dt*.86*agility*authority,controls.yawInput*scale*dt*.42*agility*authority,controls.rollInput*scale*dt*1.55*agility*authority,'YXZ');
  orientation.multiply(turn.setFromEuler(increment)).normalize();
  return orientation;
}

export function compassHeading(forward){
  return ((Math.atan2(forward.x,-forward.z)*180/Math.PI)%360+360)%360;
}
