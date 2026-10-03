import * as THREE from 'three';

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
