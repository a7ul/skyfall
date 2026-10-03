import * as THREE from 'three';

const increment=new THREE.Euler(0,0,0,'YXZ');
const turn=new THREE.Quaternion();
const attitude=new THREE.Euler(0,0,0,'YXZ');
const MAX_PITCH=THREE.MathUtils.degToRad(75);

// Inputs are aircraft-local: positive pitch raises the nose, positive roll
// banks left, and positive yaw turns left. Roll followed by pitch makes a turn.
export function applyFlightInput(orientation,controls,dt,agility){
  const length=Math.hypot(controls.pitchInput,controls.rollInput,controls.yawInput);
  const scale=length>1?1/length:1;
  increment.set(controls.pitchInput*scale*dt*.64*agility,controls.yawInput*scale*dt*.34*agility,controls.rollInput*scale*dt*1.23*agility,'YXZ');
  orientation.multiply(turn.setFromEuler(increment)).normalize();
  attitude.setFromQuaternion(orientation,'YXZ');
  attitude.x=THREE.MathUtils.clamp(attitude.x,-MAX_PITCH,MAX_PITCH);
  return orientation.setFromEuler(attitude).normalize();
}

export function compassHeading(forward){
  return ((Math.atan2(forward.x,-forward.z)*180/Math.PI)%360+360)%360;
}
