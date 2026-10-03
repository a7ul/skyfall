import {test,expect} from 'bun:test';
import * as THREE from 'three';
import {advanceMissile,MISSILE_IGNITION_DELAY} from '../../../src/gameplay/combat/missileFlight.js';

test('missile ejects before motor ignition, then accelerates and straightens for free fire',()=>{
  const missile={mesh:{position:new THREE.Vector3(0,145,0),quaternion:new THREE.Quaternion()},velocity:new THREE.Vector3(0,-18,-55),launchDirection:new THREE.Vector3(0,0,-1),age:0};
  const initialSpeed=missile.velocity.length();
  expect(advanceMissile(missile,MISSILE_IGNITION_DELAY/2,null)).toBe(false);
  expect(missile.velocity.length()).toBeCloseTo(initialSpeed);
  expect(missile.mesh.position.y).toBeLessThan(145);
  expect(advanceMissile(missile,MISSILE_IGNITION_DELAY/2,null)).toBe(true);
  for(let i=0;i<90;i++)advanceMissile(missile,1/60,null);
  expect(missile.velocity.length()).toBeGreaterThan(500);
  expect(missile.velocity.length()).toBeLessThanOrEqual(680);
  expect(missile.velocity.clone().normalize().angleTo(missile.launchDirection)).toBeLessThan(.05);
});

test('locked missile turns toward a target without an instant direction snap',()=>{
  const missile={mesh:{position:new THREE.Vector3(0,100,0),quaternion:new THREE.Quaternion()},velocity:new THREE.Vector3(0,0,-200),launchDirection:new THREE.Vector3(0,0,-1),age:MISSILE_IGNITION_DELAY};
  const target=new THREE.Vector3(100,100,-500);
  const before=missile.velocity.clone().normalize();
  advanceMissile(missile,1/60,target);
  const after=missile.velocity.clone().normalize();
  expect(after.x).toBeGreaterThan(0);
  expect(before.angleTo(after)).toBeLessThan(.04);
});
