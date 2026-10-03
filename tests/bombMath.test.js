import {test,expect} from 'bun:test';
import * as THREE from 'three';
import {advanceBomb,predictBombImpact} from '../src/bombMath.js';

test('bomb impact cue follows the same gravity and inherited forward speed as the dropped bomb',()=>{
  const origin=new THREE.Vector3(0,145,0);
  const velocity=new THREE.Vector3(0,-9,-55);
  const cue=predictBombImpact(origin,velocity,()=>0);
  expect(cue).not.toBeNull();
  const position=origin.clone(),motion=velocity.clone();
  let time=0;
  while(position.y>0&&time<18){advanceBomb(position,motion,.016);time+=.016;}
  expect(Math.abs(cue.time-time)).toBeLessThan(.08);
  expect(Math.abs(cue.position.z-position.z)).toBeLessThan(5);
  expect(cue.position.z).toBeLessThan(-200);
});

test('roof height and an upward inverted release change the drop cue',()=>{
  const origin=new THREE.Vector3(0,145,0);
  const level=predictBombImpact(origin,new THREE.Vector3(0,-9,-55),()=>0);
  const roof=predictBombImpact(origin,new THREE.Vector3(0,-9,-55),()=>45);
  const inverted=predictBombImpact(origin,new THREE.Vector3(0,9,-55),()=>0);
  expect(roof.time).toBeLessThan(level.time);
  expect(inverted.time).toBeGreaterThan(level.time);
});
