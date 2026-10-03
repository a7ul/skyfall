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

test('pitch stops at its limit while bank can pass through inverted flight',()=>{
  const pitch=new THREE.Quaternion(),bank=new THREE.Quaternion();
  let inverted=false;
  for(let i=0;i<400;i++){
    applyFlightInput(pitch,input(1),.05,1);
    applyFlightInput(bank,input(0,1),.05,1);
    if(new THREE.Vector3(0,1,0).applyQuaternion(bank).y<-.98)inverted=true;
  }
  const pe=new THREE.Euler().setFromQuaternion(pitch,'YXZ');
  expect(THREE.MathUtils.radToDeg(pe.x)).toBeCloseTo(75,4);
  expect(inverted).toBe(true);
});

test('a held bank completes a full roll and continues',()=>{
  const bank=new THREE.Quaternion();
  const total=2*Math.PI/1.23;
  const steps=240;
  for(let i=0;i<steps;i++)applyFlightInput(bank,input(0,1),total/steps,1);
  expect(new THREE.Vector3(0,1,0).applyQuaternion(bank).distanceTo(new THREE.Vector3(0,1,0))).toBeLessThan(.001);
  applyFlightInput(bank,input(0,1),.25,1);
  expect(new THREE.Vector3(0,1,0).applyQuaternion(bank).x).toBeLessThan(-.25);
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
