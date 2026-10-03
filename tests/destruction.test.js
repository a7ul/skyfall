import {test,expect} from 'bun:test';
import * as THREE from 'three';
import {fractureMesh} from '../src/destruction.js';

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
