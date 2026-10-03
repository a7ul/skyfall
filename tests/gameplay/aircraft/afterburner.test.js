import {test,expect} from 'bun:test';
import {updateAfterburners} from '../../../src/gameplay/aircraft/jet.js';

test('bright exhaust appears only for a held boost and returns to dry thrust',()=>{
  const core={userData:{effect:'core',baseOpacity:.3},material:{opacity:0},rotation:{z:0}};
  const plume={scale:{x:1,y:1,z:1},children:[core]};
  const exhaust={visible:false,children:[plume]};
  const jet={userData:{afterburners:[exhaust]}};

  updateAfterburners(jet,1,0,false);
  const dryOpacity=core.material.opacity,dryLength=plume.scale.z;
  updateAfterburners(jet,1,0,true);
  expect(core.material.opacity).toBeGreaterThan(dryOpacity*4);
  expect(plume.scale.z).toBeGreaterThan(dryLength*2);
  updateAfterburners(jet,1,0,false);
  expect(core.material.opacity).toBeCloseTo(dryOpacity);
  expect(plume.scale.z).toBeCloseTo(dryLength);
});
