import {test,expect} from 'bun:test';
import * as THREE from 'three';
import {fractureMesh} from '../../../src/gameplay/combat/destruction.js';
import {createBuildingIndex} from '../../../src/world/lyon/buildings.js';
import {blastRubbleHeight,shockRadius} from '../../../src/gameplay/combat/nuclearBlast.js';

test('a missile removes a local patch of a transformed tile and produces textured falling pieces',()=>{
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(20,20,20,20),new THREE.MeshStandardMaterial());
  mesh.position.set(250,82,-130);
  mesh.rotation.y=.3;
  mesh.updateWorldMatrix(true,false);
  const before=mesh.geometry.getIndex().array.slice();
  const fragments=fractureMesh(mesh,new THREE.Vector3(250,82,-130),3);
  const after=mesh.geometry.getIndex().array;
  const changed=before.filter((value,i)=>value!==after[i]).length;
  expect(changed).toBeGreaterThan(0);
  expect(changed).toBeLessThan(before.length/2);
  expect(fragments.length).toBeGreaterThan(4);
  expect(fragments.every(piece=>piece.geometry.getAttribute('uv'))).toBe(true);
  expect(fragments.every(piece=>piece.position.distanceTo(new THREE.Vector3(250,82,-130))<5)).toBe(true);
});

test('a later detail tile can receive the same hole without spawning another burst',()=>{
  const point=new THREE.Vector3(0,0,0);
  const makeMesh=()=>new THREE.Mesh(new THREE.PlaneGeometry(12,12,12,12),new THREE.MeshStandardMaterial());
  const first=makeMesh(),later=makeMesh();
  fractureMesh(first,point,2);
  const fragments=fractureMesh(later,point,2,{makeFragments:false});
  expect(fragments).toEqual([]);
  expect(Array.from(later.geometry.getIndex().array)).toEqual(Array.from(first.geometry.getIndex().array));
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
});
