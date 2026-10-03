// Metres per second. Normal throttle is tuned for deliberate city passes;
// the top of the throttle range is reserved for combat/afterburner flight.
export function targetAirspeed(throttle,aircraftMultiplier=1,airbrake=false){
  const cruise=45+Math.min(throttle,.82)*70;
  const afterburner=Math.max(0,throttle-.82)/.18*125;
  return Math.max(62,(cruise+afterburner)*aircraftMultiplier-(airbrake?38:0));
}
