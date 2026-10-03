import {test,expect} from 'bun:test';
import {targetAirspeed} from '../src/flightPerformance.js';

test('normal throttle supports a controlled city pass while full throttle remains fast',()=>{
  expect(targetAirspeed(.68,1.08)).toBeGreaterThan(85);
  expect(targetAirspeed(.68,1.08)).toBeLessThan(120);
  expect(targetAirspeed(1,1.08)).toBeGreaterThan(240);
});

test('air brake slows every aircraft but keeps it flyable',()=>{
  const cruise=targetAirspeed(.68,.98);
  expect(targetAirspeed(.68,.98,true)).toBeLessThan(cruise);
  expect(targetAirspeed(.2,.98,true)).toBeGreaterThanOrEqual(62);
});
