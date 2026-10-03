// Metres per second. Normal throttle is tuned for deliberate city passes;
// the top of the throttle range is reserved for combat/afterburner flight.
export function targetAirspeed(throttle,aircraftMultiplier=1,airbrake=false){
  if(typeof aircraftMultiplier==='object'){
    const profile=aircraftMultiplier;
    // The brake can induce a stall at ordinary power; full power can recover it.
    if(airbrake){
      const fullPower=Math.max(0,Math.min(1,(throttle-.65)/.35));
      return profile.stallSpeed*(.14+fullPower*1.25);
    }
    if(profile.afterburner===false){
      const power=Math.max(.2,Math.min(1,throttle));
      const target=power<=.72
        ?profile.minSpeed+(profile.cruiseSpeed-profile.minSpeed)*(power-.2)/.52
        :profile.cruiseSpeed+(profile.maxSpeed-profile.cruiseSpeed)*(power-.72)/.28;
      return Math.max(profile.minSpeed,target);
    }
    const normal=Math.min(Math.max(throttle,0),.82)/.82;
    const boost=Math.max(0,Math.min(1,(throttle-.82)/.18));
    const target=profile.minSpeed+(profile.cruiseSpeed-profile.minSpeed)*normal+(profile.maxSpeed-profile.cruiseSpeed)*boost;
    return Math.max(profile.minSpeed,target);
  }
  const cruise=35+Math.min(throttle,.82)*52;
  const afterburner=Math.max(0,throttle-.82)/.18*145;
  return Math.max(42,(cruise+afterburner)*aircraftMultiplier-(airbrake?28:0));
}

// An arcade energy model: climbing and hard turns bleed speed, a dive restores
// it, and a brake trades speed for turn authority. It remains flyable downtown.
export function advanceAirspeed(speed,throttle,multiplier,airbrake,verticalDirection,controls,dt,angleOfAttack=0,highAlpha=false){
  const target=targetAirspeed(throttle,multiplier,airbrake);
  if(typeof multiplier==='object'){
    const profile=multiplier;
    const acceleration=profile.acceleration*(throttle>.82&&profile.afterburner!==false?1.24:1);
    const engine=Math.max(-(airbrake?profile.brakeDeceleration:profile.acceleration)*dt,Math.min(acceleration*dt,(target-speed)*.9*dt));
    const scale=profile.gameSpeedScale||1;
    const gravity=9.81*verticalDirection*.4*dt*scale;
    const turnLoad=Math.abs(controls.pitchInput)*28+Math.abs(controls.rollInput)*8+Math.abs(controls.yawInput)*10;
    const turnDrag=turnLoad*(1-profile.energyRetention)*dt*scale;
    const alphaDrag=Math.max(0,angleOfAttack-.22)*(highAlpha?26:14)*dt*scale;
    return Math.max(airbrake?profile.stallSpeed*.08:profile.minSpeed*.68,Math.min(profile.maxSpeed*1.13,speed+engine-gravity-turnDrag-alphaDrag));
  }
  const response=Math.max(0,Math.min(1,dt*.65));
  const engine=Math.max(-(airbrake?48:26)*dt,Math.min((throttle>.82?38:26)*dt,(target-speed)*response));
  const gravity=9.81*verticalDirection*.38*dt;
  const turnDrag=(Math.abs(controls.pitchInput)*.95+Math.abs(controls.yawInput)*.4+Math.abs(controls.rollInput)*.2)*dt;
  return Math.max(25,Math.min(350,speed+engine-gravity-turnDrag));
}

export function stallSeverity(speed,profile){
  return Math.max(0,Math.min(1,(profile.stallSpeed-speed)/(profile.stallSpeed*.7)));
}

export const STALL_GRACE_SECONDS=10;
export function advanceStallTimer(seconds,speed,profile,dt){
  return speed<profile.stallSpeed?Math.min(STALL_GRACE_SECONDS,seconds+dt):0;
}
