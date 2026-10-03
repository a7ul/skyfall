import {test,expect} from 'bun:test';
import {enemyHasShot,segmentHitsSphere} from '../src/combatMath.js';

test('bandits can attack only when close and facing the player',()=>{
  const enemy={x:0,y:200,z:-500},player={x:0,y:200,z:0};
  expect(enemyHasShot(enemy,{x:0,y:0,z:1},player)).toBe(true);
  expect(enemyHasShot(enemy,{x:0,y:0,z:-1},player)).toBe(false);
  expect(enemyHasShot({x:0,y:200,z:-2000},{x:0,y:0,z:1},player)).toBe(false);
});

test('fast incoming shot collides along its traveled segment',()=>{
  expect(segmentHitsSphere({x:0,y:0,z:0},{x:0,y:0,z:30},{x:0,y:0,z:15},3)).toBe(true);
  expect(segmentHitsSphere({x:8,y:0,z:0},{x:8,y:0,z:30},{x:0,y:0,z:15},3)).toBe(false);
});

test('missile proximity fuse can destroy a nearby road vehicle',()=>{
  const car={x:0,y:1,z:100};
  expect(segmentHitsSphere({x:18,y:10,z:80},{x:18,y:10,z:110},car,25)).toBe(true);
  expect(segmentHitsSphere({x:35,y:10,z:80},{x:35,y:10,z:110},car,25)).toBe(false);
});
