import {test,expect} from 'bun:test';
import {nearestVehicleHit,nearestVehicleLock,vehicleRayDistance} from '../src/vehicleHits.js';

const car=(x,y,z,alive=true,visible=true)=>({position:{x,y,z},length:4.5,height:1.5,alive,visible});
const origin={x:0,y:12,z:0};
const toward=(x,y,z)=>{const length=Math.hypot(x,y,z);return{x:x/length,y:y/length,z:z/length};};

test('gun ray picks the nearest visible car under the nose',()=>{
  const near=car(0,0,-100),far=car(0,0,-180),side=car(20,0,-80);
  const hit=nearestVehicleHit([far,side,near],origin,toward(0,-11,-100),500);
  expect(hit?.vehicle).toBe(near);
  expect(hit.distance).toBeGreaterThan(90);
  expect(hit.distance).toBeLessThan(110);
});

test('gun ray ignores off-axis, hidden, and destroyed traffic',()=>{
  const aim=toward(0,-11,-100);
  expect(nearestVehicleHit([car(8,0,-100)],origin,aim,500)).toBeNull();
  expect(nearestVehicleHit([car(0,0,-100,false),car(0,0,-120,true,false)],origin,aim,500)).toBeNull();
  expect(nearestVehicleHit([car(0,0,-600)],origin,aim,500)).toBeNull();
});

test('missile lock chooses a nearby car in the sight cone',()=>{
  const aim=toward(0,-11,-100);
  const centered=car(0,0,-100),offAxis=car(60,0,-100);
  expect(nearestVehicleLock([offAxis,centered],origin,aim,500,.18)).toBe(centered);
  expect(nearestVehicleLock([offAxis],origin,aim,500,.18)).toBeNull();
});

test('fast missile segment still strikes a car crossed between frames',()=>{
  const moving=car(0,0,-100);
  const from={x:0,y:1,z:-78};
  expect(vehicleRayDistance(from,{x:0,y:0,z:-1},moving,45)).toBeGreaterThan(15);
  expect(vehicleRayDistance(from,{x:0,y:0,z:-1},moving,45)).toBeLessThan(25);
  expect(vehicleRayDistance(from,{x:0,y:0,z:-1},moving,10)).toBeNull();
});
