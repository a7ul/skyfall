import {test,expect} from 'bun:test';
import {targetAirspeed,effectiveEngineThrottle,advanceAirspeed} from '../../../src/gameplay/flight/flightPerformance.js';
import {flightProfile} from '../../../src/gameplay/aircraft/flightProfiles.js';

test('fighter boost is held while Shift is pressed and dry thrust returns on release',()=>{
  const fighter=flightProfile('f22'),attack=flightProfile('a10');
  expect(effectiveEngineThrottle(1,fighter,false)).toBe(.82);
  expect(effectiveEngineThrottle(.5,fighter,true)).toBe(1);
  expect(effectiveEngineThrottle(.5,fighter,false)).toBe(.5);
  expect(effectiveEngineThrottle(1,attack,false)).toBe(1);
  expect(targetAirspeed(effectiveEngineThrottle(.5,fighter,true),fighter)).toBeGreaterThan(targetAirspeed(effectiveEngineThrottle(.5,fighter,false),fighter));
});

test('normal throttle supports a controlled city pass while full throttle remains fast',()=>{
  expect(targetAirspeed(.55,1.08)).toBeGreaterThan(60);
  expect(targetAirspeed(.55,1.08)).toBeLessThan(75);
  expect(targetAirspeed(1,1.08)).toBeGreaterThan(240);
});

test('air brake slows every aircraft but keeps it flyable',()=>{
  const cruise=targetAirspeed(.55,.98);
  expect(targetAirspeed(.55,.98,true)).toBeLessThan(cruise);
  expect(targetAirspeed(.2,.98,true)).toBeGreaterThanOrEqual(42);
});

test('climb and high-G maneuvers spend energy while a dive restores it',()=>{
  const neutral={pitchInput:0,rollInput:0,yawInput:0};
  const hardTurn={pitchInput:1,rollInput:1,yawInput:0};
  const climb=advanceAirspeed(90,.55,1,false,1,hardTurn,1);
  const level=advanceAirspeed(90,.55,1,false,0,neutral,1);
  const dive=advanceAirspeed(90,.55,1,false,-1,neutral,1);
  expect(climb).toBeLessThan(level);
  expect(dive).toBeGreaterThan(level);
});

test('afterburner builds speed instead of jumping to top speed',()=>{
  const neutral={pitchInput:0,rollInput:0,yawInput:0};
  const next=advanceAirspeed(65,1,1,false,0,neutral,1);
  expect(next).toBeGreaterThan(65);
  expect(next).toBeLessThan(110);
});
