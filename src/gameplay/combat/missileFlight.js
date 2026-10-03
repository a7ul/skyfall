import * as THREE from 'three';

export const MISSILE_IGNITION_DELAY=.16;
const MISSILE_ACCELERATION=410;
const MISSILE_TOP_SPEED=680;

export function advanceMissile(missile,dt,targetPosition){
  missile.age+=dt;
  const ignited=missile.age>=MISSILE_IGNITION_DELAY;
  const heading=missile.velocity.clone().normalize();
  if(ignited){
    const nextSpeed=Math.min(MISSILE_TOP_SPEED,missile.velocity.length()+MISSILE_ACCELERATION*dt);
    const desired=targetPosition?targetPosition.clone().sub(missile.mesh.position).normalize():missile.launchDirection;
    if(desired){
      const angle=heading.angleTo(desired);
      const turnRate=(targetPosition?(missile.age<.45?1.5:2.5):4)*dt;
      if(angle>0)heading.lerp(desired,Math.min(1,turnRate/angle)).normalize();
    }
    missile.velocity.copy(heading).multiplyScalar(nextSpeed);
  }
  missile.mesh.position.addScaledVector(missile.velocity,dt);
  missile.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),missile.velocity.clone().normalize());
  return ignited;
}
