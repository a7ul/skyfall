import {test,expect} from 'bun:test';
import * as THREE from 'three';
import {createRiverWater} from '../../../src/world/lyon/riverWater.js';

test('water detail follows actual river triangles without covering neighboring land',()=>{
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([
    -600,1.4,260,-590,1.4,260,-595,1.4,270,
    -750,1.4,260,-740,1.4,260,-745,1.4,270,
    -600,12,280,-590,12,280,-595,12,290
  ],3));
  const tileScene=new THREE.Group();
  tileScene.add(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial()));
  const water=createRiverWater();
  water.enhance(tileScene,new THREE.Group());
  water.update(1/60);
  const overlay=tileScene.children.find(child=>child.userData.waterOverlay);
  expect(overlay?.geometry.getAttribute('position').count).toBe(3);
  expect(overlay?.raycast).toBeDefined();
  water.forget(tileScene);
  expect(tileScene.children).toHaveLength(1);
  water.dispose();
  geometry.dispose();
});
