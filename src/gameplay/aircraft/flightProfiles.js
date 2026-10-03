// Gameplay-scale flight envelopes. Speeds are metres per game second; their
// relative ordering and control traits follow the aircraft, while the absolute
// speeds remain compressed so a player can fly through Lyon.
export const FLIGHT_PROFILES={
  f22:{name:'High-alpha air dominance',minSpeed:42,cruiseSpeed:88,maxSpeed:250,stallSpeed:39,acceleration:34,brakeDeceleration:53,pitchRate:1.36,rollRate:2.18,yawRate:.62,response:5.1,angularAcceleration:5.1,gLimit:9,pathResponse:2.7,energyRetention:.91,thrustVectoring:.9},
  f35:{name:'Stable multirole',minSpeed:42,cruiseSpeed:79,maxSpeed:226,stallSpeed:43,acceleration:27,brakeDeceleration:48,pitchRate:1.08,rollRate:1.78,yawRate:.49,response:4.4,angularAcceleration:4.1,gLimit:7.5,pathResponse:3.2,energyRetention:.87,thrustVectoring:0},
  su57:{name:'Agile thrust vectoring',minSpeed:43,cruiseSpeed:90,maxSpeed:253,stallSpeed:40,acceleration:35,brakeDeceleration:51,pitchRate:1.48,rollRate:2.28,yawRate:.72,response:4.9,angularAcceleration:5.2,gLimit:9,pathResponse:2.5,energyRetention:.84,thrustVectoring:1.1},
  su35:{name:'Supermaneuverable Flanker',minSpeed:42,cruiseSpeed:84,maxSpeed:238,stallSpeed:41,acceleration:31,brakeDeceleration:49,pitchRate:1.5,rollRate:2.02,yawRate:.77,response:4.5,angularAcceleration:4.8,gLimit:8.5,pathResponse:2.35,energyRetention:.79,thrustVectoring:1.35},
  f15:{name:'Heavy high-energy strike',minSpeed:45,cruiseSpeed:91,maxSpeed:255,stallSpeed:48,acceleration:32,brakeDeceleration:46,pitchRate:1.07,rollRate:1.72,yawRate:.46,response:3.6,angularAcceleration:3.8,gLimit:7.5,pathResponse:2.8,energyRetention:.93,thrustVectoring:0},
  f16:{name:'Light fast roll',minSpeed:41,cruiseSpeed:84,maxSpeed:241,stallSpeed:42,acceleration:31,brakeDeceleration:51,pitchRate:1.28,rollRate:2.55,yawRate:.56,response:5.5,angularAcceleration:5.8,gLimit:9,pathResponse:3.4,energyRetention:.85,thrustVectoring:0},
  a10:{name:'Slow low-altitude attack',minSpeed:31,cruiseSpeed:62,maxSpeed:132,stallSpeed:32,acceleration:15,brakeDeceleration:32,pitchRate:.88,rollRate:1.35,yawRate:.43,response:3.2,angularAcceleration:2.8,gLimit:5,pathResponse:2.5,energyRetention:.96,thrustVectoring:0},
};

export function flightProfile(id){
  const profile=FLIGHT_PROFILES[id];
  if(!profile)throw new RangeError(`Unknown aircraft flight profile: ${id}`);
  return profile;
}
