export function keyboardAxes(keys){
  const pressed=codes=>codes.some(code=>keys.has(code));
  const axis=(positive,negative)=>Number(pressed(positive))-Number(pressed(negative));
  return{
    pitchInput:axis(['KeyS','ArrowDown'],['KeyW','ArrowUp']),
    rollInput:axis(['KeyD'],['KeyA']),
    yawInput:axis(['KeyQ','ArrowLeft'],['KeyE','ArrowRight']),
    throttleInput:axis(['ShiftLeft','ShiftRight'],['ControlLeft','ControlRight'])
  };
}
