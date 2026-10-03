// Screen-space error is measured in pixels: lower numbers request finer tiles.
// Keep the playable city sharper at low altitude and preserve headroom when
// sustained frame time or tile-cache pressure rises.
export function tileErrorTarget(altitude,frameMs,cacheBlocked,inFlight=true){
  if(!inFlight)return 9.5;
  const base=altitude<260?4.5:altitude<750?5.5:7;
  if(cacheBlocked)return Math.max(base,8.5);
  if(frameMs>39)return Math.max(base,9);
  if(frameMs>30)return Math.max(base,7.5);
  return base;
}

export function approachTileError(current,desired,seconds){
  const step=(desired>current?1.3:.55)*seconds;
  return Math.max(4.5,Math.min(10,current+Math.max(-step,Math.min(step,desired-current))));
}

// Keep several seconds of flight path warm before the camera reaches it.
export function tilePreloadDistance(speed){
  return Math.min(1600,Math.max(450,speed*5));
}

export function tileNearbyRadius(speed){
  return Math.min(850,Math.max(650,600+speed*.75));
}

export function tileRetryDelay(attempt){
  return [250,900,2500,6000,12000,20000,30000][Math.min(attempt,6)];
}
