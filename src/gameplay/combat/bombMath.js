import * as THREE from 'three';

export const BOMB_GRAVITY = 9.81;
export const BOMB_DRAG = .008;

export function advanceBomb(position, velocity, dt) {
  velocity.y -= BOMB_GRAVITY * dt;
  velocity.multiplyScalar(Math.max(0, 1 - BOMB_DRAG * dt));
  position.addScaledVector(velocity, dt);
}

export function predictBombImpact(origin, velocity, heightAt, maxTime = 18) {
  const position = origin.clone();
  const motion = velocity.clone();
  const dt = .05;
  for (let time = dt; time <= maxTime; time += dt) {
    const previous = position.clone();
    advanceBomb(position, motion, dt);
    const floor = heightAt(position.x, position.z);
    if (position.y <= floor) {
      const previousFloor = heightAt(previous.x, previous.z);
      const startClearance = previous.y - previousFloor;
      const endClearance = position.y - floor;
      const fraction = THREE.MathUtils.clamp(startClearance / Math.max(.0001, startClearance - endClearance), 0, 1);
      return {position: previous.lerp(position, fraction), time: time - dt + fraction * dt};
    }
  }
  return null;
}
