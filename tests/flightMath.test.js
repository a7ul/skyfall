import {test,expect} from 'bun:test';
import * as THREE from 'three';
import {applyFlightInput,compassHeading} from '../src/flightMath.js';
const f=q=>new THREE.Vector3(0,0,-1).applyQuaternion(q);
const input=(pitchInput=0,rollInput=0,yawInput=0)=>({pitchInput,rollInput,yawInput});

test('pitch and yaw agree with the displayed controls and compass',()=>{
  const up=applyFlightInput(new THREE.Quaternion(),input(1),1,1);
  expect(f(up).y).toBeGreaterThan(0);
  const left=applyFlightInput(new THREE.Quaternion(),input(0,0,1),1,1);
  expect(f(left).x).toBeLessThan(0);
  expect(compassHeading(f(left))).toBeGreaterThan(270);
  const right=applyFlightInput(new THREE.Quaternion(),input(0,0,-1),1,1);
  expect(f(right).x).toBeGreaterThan(0);
  expect(compassHeading(f(right))).toBeLessThan(90);
});

test('bank then pull turns toward the bank',()=>{
  const left=applyFlightInput(new THREE.Quaternion(),input(0,1),1.2,1);
  applyFlightInput(left,input(1),1,1);
  expect(f(left).x).toBeLessThan(0);
  const right=applyFlightInput(new THREE.Quaternion(),input(0,-1),1.2,1);
  applyFlightInput(right,input(1),1,1);
  expect(f(right).x).toBeGreaterThan(0);
});

test('pitch completes a full loop without snapping at vertical',()=>{
  const pitch=new THREE.Quaternion();
  const steps=360,total=2*Math.PI/.86;
  let pastVertical=false,inverted=false;
  for(let i=0;i<steps;i++){
    applyFlightInput(pitch,input(1),total/steps,1,55);
    const nose=f(pitch);
    if(nose.z>.1)pastVertical=true;
    if(new THREE.Vector3(0,1,0).applyQuaternion(pitch).y<-.98)inverted=true;
  }
  expect(pastVertical).toBe(true);
  expect(inverted).toBe(true);
  expect(f(pitch).distanceTo(new THREE.Vector3(0,0,-1))).toBeLessThan(.001);
});

test('a held bank completes a full roll and continues',()=>{
  const bank=new THREE.Quaternion();
  const total=2*Math.PI/1.55;
  const steps=240;
  for(let i=0;i<steps;i++)applyFlightInput(bank,input(0,1),total/steps,1,55);
  expect(new THREE.Vector3(0,1,0).applyQuaternion(bank).distanceTo(new THREE.Vector3(0,1,0))).toBeLessThan(.001);
  applyFlightInput(bank,input(0,1),.25,1,55);
  expect(new THREE.Vector3(0,1,0).applyQuaternion(bank).x).toBeLessThan(-.35);
});

test('yaw, pitch, and roll affect distinct axes',()=>{
  const pitch=applyFlightInput(new THREE.Quaternion(),input(1),.2,1);
  const yaw=applyFlightInput(new THREE.Quaternion(),input(0,0,1),.2,1);
  const roll=applyFlightInput(new THREE.Quaternion(),input(0,1),.2,1);
  expect(f(pitch).y).toBeGreaterThan(.1);
  expect(Math.abs(f(pitch).x)).toBeLessThan(.001);
  expect(f(yaw).x).toBeLessThan(-.05);
  expect(Math.abs(f(yaw).y)).toBeLessThan(.001);
  expect(f(roll).distanceTo(new THREE.Vector3(0,0,-1))).toBeLessThan(.001);
  expect(new THREE.Vector3(0,1,0).applyQuaternion(roll).x).toBeLessThan(-.2);
});

test('combined inputs have a bounded total control rate',()=>{
  const solo=applyFlightInput(new THREE.Quaternion(),input(0,1),.1,1);
  const combined=applyFlightInput(new THREE.Quaternion(),input(1,1,1),.1,1);
  const soloRoll=new THREE.Euler().setFromQuaternion(solo,'YXZ').z;
  const combinedRoll=new THREE.Euler().setFromQuaternion(combined,'YXZ').z;
  expect(combinedRoll).toBeGreaterThan(0);
  expect(combinedRoll).toBeLessThan(soloRoll);
});

test('air brake gives more turn authority at the same speed',()=>{
  const normal=applyFlightInput(new THREE.Quaternion(),input(1),.25,1,90,false);
  const braking=applyFlightInput(new THREE.Quaternion(),input(1),.25,1,90,true);
  expect(f(braking).y).toBeGreaterThan(f(normal).y);
});
