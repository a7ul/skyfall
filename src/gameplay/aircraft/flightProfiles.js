// Gameplay-scale flight envelopes, informed by published aircraft capabilities.
// Speeds are metres per game second and compressed for Lyon's playable area.
// Published high-altitude maximum speeds are not valid low-altitude targets.
// See docs/design/flight-model.md for the sources and design decisions.
export const FLIGHT_PROFILES={
  f22:{name:'High-alpha air dominance',minSpeed:43,cruiseSpeed:96,maxSpeed:260,stallSpeed:39,acceleration:38,brakeDeceleration:53,pitchRate:1.36,rollRate:2.18,yawRate:.62,response:5.3,angularAcceleration:5.3,gLimit:9,pathResponse:2.7,energyRetention:.93,thrustVectoring:.9,maneuverSpeed:85},
  f35:{name:'Stable multirole',minSpeed:43,cruiseSpeed:87,maxSpeed:225,stallSpeed:43,acceleration:28,brakeDeceleration:48,pitchRate:1.13,rollRate:1.78,yawRate:.49,response:4.6,angularAcceleration:4.3,gLimit:9,pathResponse:3.2,energyRetention:.87,thrustVectoring:0,maneuverSpeed:85},
  su57:{name:'Agile thrust vectoring',minSpeed:44,cruiseSpeed:98,maxSpeed:258,stallSpeed:40,acceleration:36,brakeDeceleration:51,pitchRate:1.48,rollRate:2.28,yawRate:.72,response:5,angularAcceleration:5.3,gLimit:9,pathResponse:2.5,energyRetention:.85,thrustVectoring:1.1,maneuverSpeed:82},
  su35:{name:'Supermaneuverable Flanker',minSpeed:43,cruiseSpeed:92,maxSpeed:248,stallSpeed:41,acceleration:33,brakeDeceleration:49,pitchRate:1.5,rollRate:2.02,yawRate:.77,response:4.6,angularAcceleration:5,gLimit:9,pathResponse:2.35,energyRetention:.8,thrustVectoring:1.35,maneuverSpeed:80},
  f15:{name:'Heavy high-energy strike',minSpeed:46,cruiseSpeed:99,maxSpeed:275,stallSpeed:48,acceleration:35,brakeDeceleration:46,pitchRate:1.1,rollRate:1.72,yawRate:.46,response:3.8,angularAcceleration:4,gLimit:8.5,pathResponse:2.8,energyRetention:.94,thrustVectoring:0,maneuverSpeed:86},
  f16:{name:'Light fast roll',minSpeed:42,cruiseSpeed:92,maxSpeed:246,stallSpeed:42,acceleration:32,brakeDeceleration:51,pitchRate:1.28,rollRate:2.55,yawRate:.56,response:5.7,angularAcceleration:5.9,gLimit:9,pathResponse:3.4,energyRetention:.85,thrustVectoring:0,maneuverSpeed:82},
  a10:{name:'Low-altitude attack',minSpeed:50,cruiseSpeed:92,maxSpeed:160,stallSpeed:42,acceleration:23,brakeDeceleration:36,pitchRate:1.04,rollRate:1.55,yawRate:.48,response:4.1,angularAcceleration:3.7,gLimit:6,pathResponse:2.8,energyRetention:.96,thrustVectoring:0,maneuverSpeed:62,afterburner:false},
};

export function flightProfile(id){
  const profile=FLIGHT_PROFILES[id];
  if(!profile)throw new RangeError(`Unknown aircraft flight profile: ${id}`);
  return profile;
}
