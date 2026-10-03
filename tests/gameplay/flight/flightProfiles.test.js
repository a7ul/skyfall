import {test,expect} from 'bun:test';
import * as THREE from 'three';
import {FLIGHT_PROFILES,flightProfile} from '../../../src/gameplay/aircraft/flightProfiles.js';
import {createFlightMotion,stepFlightAttitude,stepFlightPath} from '../../../src/gameplay/flight/flightMath.js';
import {targetAirspeed} from '../../../src/gameplay/flight/flightPerformance.js';

const controls=(pitchInput=0,rollInput=0,yawInput=0)=>({pitchInput,rollInput,yawInput});
const step=(q,m,c,profile,seconds,speed=80,highAlpha=false)=>{
  const frames=Math.round(seconds*60);
  for(let i=0;i<frames;i++)stepFlightAttitude(q,m,c,1/60,profile,speed,false,highAlpha);
};

test('every selectable jet has a distinct speed and handling envelope',()=>{
  expect(Object.keys(FLIGHT_PROFILES).sort()).toEqual(['a10','f15','f16','f22','f35','su35','su57']);
  expect(targetAirspeed(.55,flightProfile('a10'))).toBeLessThan(targetAirspeed(.55,flightProfile('f22')));
  expect(flightProfile('a10').maxSpeed).toBeLessThan(flightProfile('f22').maxSpeed);
  expect(flightProfile('f16').rollRate).toBeGreaterThan(flightProfile('f15').rollRate);
  expect(flightProfile('su35').thrustVectoring).toBeGreaterThan(flightProfile('f22').thrustVectoring);
  expect(flightProfile('f35').gLimit).toBe(9);
  expect(flightProfile('f15').maxSpeed).toBeGreaterThan(flightProfile('f16').maxSpeed);
});

test('A-10 launches at a usable attack speed without fighter-style afterburner',()=>{
  const a10=flightProfile('a10'),f22=flightProfile('f22');
  expect(a10.afterburner).toBe(false);
  expect(targetAirspeed(.5,a10)*1.944).toBeGreaterThan(140);
  expect(targetAirspeed(.5,a10)).toBeLessThan(targetAirspeed(.5,f22));
  expect(targetAirspeed(1,a10)).toBe(160);
  expect(targetAirspeed(1,a10)).toBeLessThan(targetAirspeed(1,f22));
  expect(targetAirspeed(.83,a10)-targetAirspeed(.81,a10)).toBeLessThan(6);
});

test('A-10 retains responsive low-speed roll but remains slower than the F-22',()=>{
  const a10Motion=createFlightMotion(),f22Motion=createFlightMotion();
  step(new THREE.Quaternion(),a10Motion,controls(0,1),flightProfile('a10'),1,73);
  step(new THREE.Quaternion(),f22Motion,controls(0,1),flightProfile('f22'),1,73);
  expect(a10Motion.rollRate).toBeGreaterThan(1.3);
  expect(a10Motion.rollRate).toBeLessThan(f22Motion.rollRate);
});

test('roll input completes a rotation and a reverse command changes rate gradually',()=>{
  const q=new THREE.Quaternion(),motion=createFlightMotion(),profile=flightProfile('f22');
  let accumulated=0;
  for(let i=0;i<220;i++){
    stepFlightAttitude(q,motion,controls(0,1),1/60,profile,80);
    accumulated+=motion.rollRate/60;
  }
  expect(accumulated).toBeGreaterThan(2*Math.PI);
  const before=motion.rollRate;
  stepFlightAttitude(q,motion,controls(0,-1),1/60,profile,80);
  expect(motion.rollRate).toBeLessThan(before);
  expect(motion.rollRate).toBeGreaterThan(0);
  step(q,motion,controls(0,-1),profile,1,80);
  expect(motion.rollRate).toBeLessThan(-1);
  step(q,motion,controls(),profile,1,80);
  expect(Math.abs(motion.rollRate)).toBeLessThan(.03);
});

test('roll, pitch and yaw remain independent during combined keyboard input',()=>{
  const profile=flightProfile('f16'),solo=createFlightMotion(),combined=createFlightMotion();
  step(new THREE.Quaternion(),solo,controls(0,1),profile,.5,85);
  step(new THREE.Quaternion(),combined,controls(1,1,1),profile,.5,85);
  expect(combined.rollRate).toBeCloseTo(solo.rollRate,5);
  expect(combined.pitchRate).toBeGreaterThan(0);
  expect(combined.yawRate).toBeGreaterThan(0);
});

test('vectoring jets can point away from their flight path during high alpha',()=>{
  const profile=flightProfile('su35');
  const q=new THREE.Quaternion(),motion=createFlightMotion();
  const velocity=new THREE.Vector3(0,0,-75),nose=new THREE.Vector3();
  for(let i=0;i<60;i++){
    stepFlightAttitude(q,motion,controls(1),1/60,profile,75,false,true);
    nose.set(0,0,-1).applyQuaternion(q);
    motion.angleOfAttack=stepFlightPath(velocity,nose,75,1/60,profile,true);
  }
  expect(motion.angleOfAttack).toBeGreaterThan(.3);
  expect(velocity.y).toBeGreaterThan(0);
});
