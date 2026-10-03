import {test,expect} from 'bun:test';
import {easeTurnaroundDistance} from '../../../src/world/lyon/traffic.js';
import {createTraffic} from '../../../src/world/lyon/traffic.js';
import * as THREE from 'three';

test('cars slow smoothly at route ends before reversing',()=>{
  const total=200;
  expect(easeTurnaroundDistance(1,total)).toBeLessThan(1);
  expect(easeTurnaroundDistance(199,total)).toBeGreaterThan(199);
  expect(easeTurnaroundDistance(100,total)).toBe(100);
});

test('a city blast affects local traffic and pedestrians until sortie reset',async()=>{
  const scene=new THREE.Scene();
  const load=async()=>({json:async()=>({routes:[{name:'test street',speed:9,points:[[0,1.4,0],[0,1.4,50],[0,1.4,100]]}]})});
  const traffic=await createTraffic(scene,'test',load);
  const origin=new THREE.Vector3(0,2.2,-10),direction=new THREE.Vector3(0,0,1);
  expect(traffic.count).toBe(1);
  expect(traffic.peopleCount).toBe(1);
  expect(traffic.findRayHit(origin,direction,20)).not.toBeNull();
  traffic.blast(new THREE.Vector3(4.6,1.4,0),3);
  expect(traffic.activePeopleCount).toBe(0);
  const car=traffic.findRayHit(origin,direction,20)?.vehicle;
  expect(traffic.destroy(car)).not.toBeNull();
  expect(traffic.findRayHit(origin,direction,20)).toBeNull();
  traffic.reset();
  expect(traffic.activePeopleCount).toBe(1);
  expect(traffic.findRayHit(origin,direction,20)).not.toBeNull();
});
