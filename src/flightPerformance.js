// Metres per second. Normal throttle is tuned for deliberate city passes;
// the top of the throttle range is reserved for combat/afterburner flight.
export function targetAirspeed(throttle,aircraftMultiplier=1,airbrake=false){
  const cruise=35+Math.min(throttle,.82)*52;
  const afterburner=Math.max(0,throttle-.82)/.18*145;
  return Math.max(42,(cruise+afterburner)*aircraftMultiplier-(airbrake?28:0));
}

// An arcade energy model: climbing and hard turns bleed speed, a dive restores
// it, and a brake trades speed for turn authority. It remains flyable downtown.
export function advanceAirspeed(speed,throttle,multiplier,airbrake,verticalDirection,controls,dt){
  const target=targetAirspeed(throttle,multiplier,airbrake);
  const response=Math.max(0,Math.min(1,dt*.65));
  const engine=Math.max(-(airbrake?48:26)*dt,Math.min((throttle>.82?38:26)*dt,(target-speed)*response));
  const gravity=9.81*verticalDirection*.38*dt;
  const turnDrag=(Math.abs(controls.pitchInput)*.95+Math.abs(controls.yawInput)*.4+Math.abs(controls.rollInput)*.2)*dt;
  return Math.max(25,Math.min(350,speed+engine-gravity-turnDrag));
}
