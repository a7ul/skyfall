import {test,expect} from 'bun:test';
import * as THREE from 'three';
import {enemyIndicatorPosition} from '../../src/app/enemyIndicator.js';

const camera=new THREE.PerspectiveCamera(67,16/9,.5,10000);
camera.position.set(0,0,0);
camera.lookAt(0,0,-1);
camera.updateMatrixWorld();

test('enemy inside the view gets an unobtrusive on-screen marker',()=>{
  const marker=enemyIndicatorPosition(camera,new THREE.Vector3(0,0,-100),1600,900);
  expect(marker.visible).toBe(true);
  expect(marker.x).toBeCloseTo(800);
  expect(marker.y).toBeCloseTo(450);
});

test('off-screen contacts point to the correct safe edge',()=>{
  const right=enemyIndicatorPosition(camera,new THREE.Vector3(400,0,-100),1600,900);
  const up=enemyIndicatorPosition(camera,new THREE.Vector3(0,400,-100),1600,900);
  expect(right.visible).toBe(false);
  expect(right.x).toBeCloseTo(1600*.93);
  expect(right.angle).toBeCloseTo(90);
  expect(up.visible).toBe(false);
  expect(up.y).toBeCloseTo(900*.13);
  expect(up.angle).toBeCloseTo(0);
});

test('rear contacts stay within the HUD and give a bearing',()=>{
  const rear=enemyIndicatorPosition(camera,new THREE.Vector3(0,0,100),1600,900);
  const rearLeft=enemyIndicatorPosition(camera,new THREE.Vector3(-50,0,100),1600,900);
  expect(rear.visible).toBe(false);
  expect(rear.y).toBeCloseTo(900*.79);
  expect(rearLeft.visible).toBe(false);
  expect(rearLeft.x).toBeLessThan(800);
});
