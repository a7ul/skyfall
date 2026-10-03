import {test,expect} from 'bun:test';
import {easeTurnaroundDistance} from '../../../src/world/lyon/traffic.js';
import {createTraffic,MAX_RENDERED_VEHICLES} from '../../../src/world/lyon/traffic.js';
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
  const origin=new THREE.Vector3(-1.4,2.2,-10),direction=new THREE.Vector3(0,0,1);
  expect(traffic.count).toBe(2);
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

test('only the nearest 200 road vehicles occupy render instances',async()=>{
  const scene=new THREE.Scene();
  const routes=Array.from({length:250},(_,i)=>({name:`road ${i}`,speed:8,points:[[i*10,1.4,0],[i*10,1.4,50],[i*10,1.4,100]]}));
  const traffic=await createTraffic(scene,'test',async()=>({json:async()=>({routes})}));
  traffic.update(0,new THREE.Vector3(0,30,30));
  expect(traffic.count).toBe(500);
  expect(traffic.visibleCount).toBe(MAX_RENDERED_VEHICLES);
  expect(scene.children.filter(child=>child.isInstancedMesh).slice(0,24).filter((_,i)=>i%4===0).reduce((total,mesh)=>total+mesh.count,0)).toBe(MAX_RENDERED_VEHICLES);
  traffic.update(0,new THREE.Vector3(100000,30,30));
  expect(traffic.visibleCount).toBe(0);
});
