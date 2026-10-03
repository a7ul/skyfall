import * as THREE from 'three';

// A filled, shaded surface replaces the old open photomesh cut. Keeping the
// original terrain below it also preserves collision when a detail tile swaps.
export function createGroundCrater(position,radius){
  const group=new THREE.Group();group.name='Ground impact crater';group.position.copy(position);group.position.y+=.2;group.userData.radius=radius;
  const segments=48;
  const rings=[
    {r:0,y:.24,color:0x25282a},
    {r:.34,y:.16,color:0x292b2a},
    {r:.64,y:.36,color:0x3d3833},
    {r:.91,y:1.18,color:0x675d50},
    {r:1.17,y:.52,color:0x8d8170},
    {r:1.39,y:.14,color:0x8f877b}
  ];
  const positions=[],colors=[],indices=[];
  const tint=new THREE.Color();
  for(let ring=0;ring<rings.length;ring++){
    const layer=rings[ring];
    for(let column=0;column<=segments;column++){
      const angle=column/segments*Math.PI*2;
      const wobble=1+.045*Math.sin(angle*7+radius)+.035*Math.sin(angle*13-radius);
      positions.push(Math.cos(angle)*radius*layer.r*wobble,layer.y*(radius/10),Math.sin(angle)*radius*layer.r*wobble);
      tint.setHex(layer.color).multiplyScalar(.9+.1*Math.sin(angle*11+ring*2));
      colors.push(tint.r,tint.g,tint.b);
      if(ring<rings.length-1&&column<segments){
        const a=ring*(segments+1)+column,b=a+segments+1;
        indices.push(a,b,a+1,b,b+1,a+1);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const bowl=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2}));
  bowl.receiveShadow=true;group.add(bowl);
  const stoneCount=Math.min(42,Math.max(20,Math.round(radius*2.3)));
  const stones=new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:0x9a9184,roughness:1}),stoneCount);
  const dummy=new THREE.Object3D();
  for(let i=0;i<stoneCount;i++){
    const angle=i*2.399963+radius*.17,ring=radius*(.76+(i%5)*.13),size=.2+(i*17%13)/13*.65;
    dummy.position.set(Math.cos(angle)*ring,.4+size*.25,Math.sin(angle)*ring);
    dummy.rotation.set(i*.31,angle,i*.17);dummy.scale.set(size,size*.55,size*1.4);dummy.updateMatrix();stones.setMatrixAt(i,dummy.matrix);
  }
  stones.instanceMatrix.needsUpdate=true;stones.computeBoundingSphere();group.add(stones);
  return group;
}
