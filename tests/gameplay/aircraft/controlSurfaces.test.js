import {test,expect} from 'bun:test';
import * as THREE from 'three';
import {prepareControlSurfaces,bindControlSurfaces,animateControlSurfaces} from '../../../src/gameplay/aircraft/controlSurfaces.js';

function testModel(){
  const model=new THREE.Group(),parent=new THREE.Group();model.add(parent);
  const triangles=[
    // Left and right F-22 outer wing panels, plus an unchanged airframe face.
    [[-12,-50,0],[-5,-50,0],[-8,-55,0]],
    [[-12,50,0],[-5,50,0],[-8,55,0]],
    [[50,0,0],[51,1,0],[52,0,0]]
  ];
  const positions=triangles.flat(2),uvs=new Array(positions.length/3*2).fill(.5);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());mesh.name='Object_4';parent.add(mesh);
  return{model,mesh};
}

test('airframe panels retain geometry and UVs when hinged',()=>{
  const {model,mesh}=testModel();
  prepareControlSurfaces(model,{id:'f22'});
  const left=model.getObjectByName('flight-control-aileron-left');
  const right=model.getObjectByName('flight-control-aileron-right');
  expect(left?.children[0].geometry.getAttribute('position').count).toBe(3);
  expect(right?.children[0].geometry.getAttribute('uv').count).toBe(3);
  expect(mesh.geometry.getAttribute('position').count).toBe(3);
});

test('roll, pitch, and yaw drive the intended surfaces',()=>{
  const jet=new THREE.Group();
  for(const kind of ['aileron','elevator','rudder'])for(const side of ['left','right']){
    const hinge=new THREE.Group();hinge.name=`flight-control-${kind}-${side}`;jet.add(hinge);
  }
  bindControlSurfaces(jet);
  animateControlSurfaces(jet,{pitchInput:1,rollInput:1,yawInput:1},.2);
  const surface=jet.userData.controlSurfaces;
  expect(surface['aileron-left'].rotation.y).toBeLessThan(0);
  expect(surface['aileron-right'].rotation.y).toBeGreaterThan(0);
  expect(surface['elevator-left'].rotation.y).toBeLessThan(0);
  expect(surface['rudder-left'].rotation.z).toBeGreaterThan(0);
});
