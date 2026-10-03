import {test,expect} from 'bun:test';
import * as THREE from 'three';
import {createMissileTrail,updateMissileTrail,disposeMissileTrail} from '../../../src/gameplay/combat/missileTrail.js';

test('missile smoke uses bounded puffs and lingers briefly after impact',()=>{
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
  const texture=new THREE.Texture();
  const trail=createMissileTrail(scene,texture);
  for(let i=0;i<100;i++)updateMissileTrail(trail,new THREE.Vector3(0,20,-i*4),camera,.03);
  expect(trail.mesh.isInstancedMesh).toBe(true);
  expect(trail.puffs.length).toBeGreaterThan(40);
  expect(trail.puffs.length).toBeLessThanOrEqual(72);
  updateMissileTrail(trail,null,camera,.5);
  expect(trail.puffs.length).toBeGreaterThan(0);
  updateMissileTrail(trail,null,camera,1.7);
  expect(trail.puffs.length).toBe(0);
  disposeMissileTrail(scene,trail);
  expect(scene.children.length).toBe(0);
  texture.dispose();
});
