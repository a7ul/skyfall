import {test,expect} from 'bun:test';
import {approachTileError,tileErrorTarget} from '../src/tileQuality.js';

test('low city flight selects finer tiles than high flight',()=>{
  expect(tileErrorTarget(145,16.7,false)).toBe(4.5);
  expect(tileErrorTarget(450,16.7,false)).toBe(5.5);
  expect(tileErrorTarget(1200,16.7,false)).toBe(7);
  expect(tileErrorTarget(145,16.7,false,false)).toBe(9.5);
});

test('sustained slow frames or a full cache relax detail',()=>{
  expect(tileErrorTarget(145,32,false)).toBe(7.5);
  expect(tileErrorTarget(145,42,false)).toBe(9);
  expect(tileErrorTarget(145,16.7,true)).toBe(8.5);
});

test('quality degrades quickly and recovers gradually without overshoot',()=>{
  expect(approachTileError(5,9,1)).toBeCloseTo(6.3);
  expect(approachTileError(9,4.5,1)).toBeCloseTo(8.45);
  expect(approachTileError(5,5.1,1)).toBeCloseTo(5.1);
});
