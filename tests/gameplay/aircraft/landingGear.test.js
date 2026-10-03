import {test,expect} from 'bun:test';
import * as THREE from 'three';
import {retractLandingGear} from '../../../src/gameplay/aircraft/jet.js';

test('flying jets keep the closed gear mesh and hide extended gear and lights',()=>{
  const model=new THREE.Group();
  for(const name of ['SU57-airframe_0','SU57-landingOff_5','SU57-landingOn_6','SU57-landingOnLight_7']){
    const part=new THREE.Group();part.name=name;model.add(part);
  }
  retractLandingGear(model);
  expect(model.children.map(child=>child.name)).toEqual(['SU57-airframe_0','SU57-landingOff_5']);
});
