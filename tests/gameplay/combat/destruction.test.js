import {test,expect} from 'bun:test';
import * as THREE from 'three';
import {fractureMesh} from '../../../src/gameplay/combat/destruction.js';
import {createBuildingIndex} from '../../../src/world/lyon/buildings.js';
import {blastRubbleHeight,shockRadius} from '../../../src/gameplay/combat/nuclearBlast.js';
import {createCollapseRubble} from '../../../src/gameplay/combat/rubbleField.js';
import {createGroundCrater} from '../../../src/gameplay/combat/groundCrater.js';
import {isWaterImpact} from '../../../src/world/lyon/waterMask.js';

test('a ground strike leaves a filled crater instead of open tile geometry',()=>{
  const crater=createGroundCrater(new THREE.Vector3(15,1.4,-20),12);
  const surface=crater.children[0];
  expect(surface.geometry.getIndex().count).toBeGreaterThan(100);
  expect(surface.geometry.getAttribute('color')).toBeDefined();
  expect(crater.children[1].isInstancedMesh).toBe(true);
  expect(crater.position.y).toBeCloseTo(1.6);
  crater.traverse(child=>{if(child.isMesh){child.geometry.dispose();child.material.dispose();}});
});

test('river strikes splash, while nearby streets and bridges stay solid',()=>{
  expect(isWaterImpact(-595,260,1.4)).toBe(true);
  expect(isWaterImpact(105,610,1.4)).toBe(true);
  expect(isWaterImpact(0,0,1.4)).toBe(false);
  expect(isWaterImpact(-595,260,10)).toBe(false);
  expect(isWaterImpact(-595,260,1.4,()=>true)).toBe(false);
});

test('a base strike selects one building and removes its upper structure across tile detail changes',()=>{
  const index=createBuildingIndex([
    [20,[[-5,-5],[5,-5],[5,5],[-5,5]]],
    [20,[[5,-5],[15,-5],[15,5],[5,5]]]
  ]);
  const first=index.find(-4.8,0,2,2);
  expect(first?.id).toBe(0);
  expect(index.find(-4.8,0,17,2)?.id).toBe(0);
  const building={...first,top:20};
  const makeMesh=x=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(10,20,10,6,12,6),new THREE.MeshStandardMaterial());
    mesh.position.set(x,10,0);
    mesh.updateWorldMatrix(true,false);
    return mesh;
  };
  const struck=makeMesh(0),adjacent=makeMesh(14),replacement=makeMesh(0);
  const priorAdjacent=adjacent.geometry.getIndex().array.slice();
  const pieces=fractureMesh(struck,new THREE.Vector3(0,2,0),20,{building});
  fractureMesh(adjacent,new THREE.Vector3(0,2,0),20,{building,makeFragments:false});
  fractureMesh(replacement,new THREE.Vector3(0,2,0),20,{building,makeFragments:false});
  expect(pieces.length).toBeGreaterThan(0);
  expect(Array.from(struck.geometry.getIndex().array)).toEqual(Array.from(replacement.geometry.getIndex().array));
  expect(Array.from(adjacent.geometry.getIndex().array)).toEqual(Array.from(priorAdjacent));
  expect(Array.from(struck.geometry.getIndex().array)).not.toEqual(Array.from(priorAdjacent));
});

test('blast core clears upper floors while the outer city and ground survive',()=>{
  const meshAt=x=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(20,30,20,8,12,8),new THREE.MeshStandardMaterial());
    mesh.position.set(x,15,0);mesh.updateWorldMatrix(true,false);return mesh;
  };
  const core=meshAt(0),outside=meshAt(390);
  const coreBefore=core.geometry.getIndex().array.slice();
  const outsideBefore=outside.geometry.getIndex().array.slice();
  const blastZone={x:0,z:0,core:210,outer:360};
  fractureMesh(core,new THREE.Vector3(0,50,0),510,{makeFragments:false,blastZone});
  fractureMesh(outside,new THREE.Vector3(0,50,0),510,{makeFragments:false,blastZone});
  expect(Array.from(core.geometry.getIndex().array)).not.toEqual(Array.from(coreBefore));
  expect(Array.from(outside.geometry.getIndex().array)).toEqual(Array.from(outsideBefore));
  expect(blastRubbleHeight(0)).toBe(2.5);
  expect(blastRubbleHeight(360)).toBe(Infinity);
  expect(shockRadius(1.1)).toBe(360);
});

test('tall structures break into more falling pieces than low ones',()=>{
  const polygon=[[-5,-5],[5,-5],[5,5],[-5,5]];
  const make=(height)=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(10,height,10,12,24,12),new THREE.MeshStandardMaterial());
    mesh.position.y=height/2;mesh.updateWorldMatrix(true,false);
    return mesh;
  };
  const low=fractureMesh(make(20),new THREE.Vector3(0,2,0),30,{building:{polygon,minX:-5,maxX:5,minZ:-5,maxZ:5,top:20}});
  const tall=fractureMesh(make(50),new THREE.Vector3(0,2,0),60,{building:{polygon,minX:-5,maxX:5,minZ:-5,maxZ:5,top:50}});
  expect(tall.length).toBeGreaterThan(low.length);
  expect(tall.length).toBeGreaterThan(100);
  expect(low.length).toBeGreaterThan(40);
});

test('a collapsed building leaves many stones with only two draw calls',()=>{
  const rubble=createCollapseRubble({minX:-8,maxX:8,minZ:-7,maxZ:7,top:42,rubbleHeight:3});
  expect(rubble.children.length).toBe(3);
  expect(rubble.children[0].isMesh).toBe(true);
  expect(rubble.children.slice(1).every(child=>child.isInstancedMesh)).toBe(true);
  expect(rubble.children.slice(1).reduce((count,child)=>count+child.count,0)).toBeGreaterThan(100);
  rubble.traverse(child=>{if(child.isMesh){child.geometry.dispose();child.material.dispose();}});
});
