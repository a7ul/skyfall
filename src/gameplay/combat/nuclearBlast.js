// Screen-scale damage envelope for the game's low-yield surface burst.
// The central area is reduced to rubble; the outer band loses upper floors.
export function blastRubbleHeight(distance,coreRadius=210,outerRadius=360){
  if(distance>=outerRadius)return Infinity;
  if(distance<=coreRadius)return 2.5;
  const t=(distance-coreRadius)/(outerRadius-coreRadius);
  return 2.5+28*t*t;
}

export function shockRadius(age,maxRadius=360){
  return Math.min(maxRadius,340*Math.max(0,age));
}
