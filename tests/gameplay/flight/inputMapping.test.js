import {test,expect} from 'bun:test';
import {keyboardAxes} from '../../../src/gameplay/flight/inputMapping.js';
const keys=(...codes)=>new Set(codes);

test('W/S and A/D match nose and bank directions',()=>{
  expect(keyboardAxes(keys('KeyW')).pitchInput).toBe(-1);
  expect(keyboardAxes(keys('KeyS')).pitchInput).toBe(1);
  expect(keyboardAxes(keys('KeyA')).rollInput).toBe(1);
  expect(keyboardAxes(keys('KeyD')).rollInput).toBe(-1);
});

test('opposing and combined keys remain bounded',()=>{
  expect(keyboardAxes(keys('KeyW','KeyS')).pitchInput).toBe(0);
  expect(keyboardAxes(keys('KeyA','KeyD')).rollInput).toBe(0);
  const combined=keyboardAxes(keys('KeyW','KeyD','KeyQ'));
  expect(combined).toMatchObject({pitchInput:-1,rollInput:-1,yawInput:1});
});

test('arrow keys provide pitch and yaw without doubling an axis',()=>{
  expect(keyboardAxes(keys('ArrowUp')).pitchInput).toBe(-1);
  expect(keyboardAxes(keys('ArrowDown')).pitchInput).toBe(1);
  expect(keyboardAxes(keys('ArrowLeft')).yawInput).toBe(1);
  expect(keyboardAxes(keys('ArrowRight')).yawInput).toBe(-1);
  expect(keyboardAxes(keys('KeyQ','ArrowLeft')).yawInput).toBe(1);
  expect(keyboardAxes(keys('KeyE','ArrowLeft')).yawInput).toBe(0);
});
