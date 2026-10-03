import {test,expect} from 'bun:test';
import {chooseLockTarget} from '../../../src/gameplay/combat/targeting.js';

const origin={x:0,y:100,z:0},forward={x:0,y:0,z:-1};
const car=(x,z)=>({type:'car',alive:true,height:2,position:{x,y:100,z}});
const radar=(x,z)=>({type:'radar',alive:true,position:{x,y:100,z}});

test('mission missile lock can select a car aimed under the reticle',()=>{
  const vehicle=car(0,-550),objective=radar(200,-1800);
  expect(chooseLockTarget([objective],vehicle,origin,forward)).toBe(vehicle);
});

test('centered mission objective remains selectable near traffic',()=>{
  const vehicle=car(50,-550),objective=radar(0,-900);
  expect(chooseLockTarget([objective],vehicle,origin,forward)).toBe(objective);
});
