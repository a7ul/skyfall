import {test,expect} from 'bun:test';
import {easeTurnaroundDistance} from '../src/traffic.js';

test('cars slow smoothly at route ends before reversing',()=>{
  const total=200;
  expect(easeTurnaroundDistance(1,total)).toBeLessThan(1);
  expect(easeTurnaroundDistance(199,total)).toBeGreaterThan(199);
  expect(easeTurnaroundDistance(100,total)).toBe(100);
});
