import * as THREE from 'three';

const COLORS=[0x6c6963,0x8b857b,0xaaa194,0x565957,0x968675];

function randomFor(x,z){
  let seed=(Math.imul(Math.round(x*11),73856093)^Math.imul(Math.round(z*11),19349663)^0x9e3779b9)>>>0;
  return ()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
}

// Most chunks collect over former building footprints, with smaller debris
// swept into the streets. Keep the total bounded for repeated free-flight use.
export function planRubble(position,sites,coreRadius=210){
  const random=randomFor(position.x,position.z);
  const desired=sites.map(site=>Math.min(90,Math.max(12,Math.round(site.width*site.depth/10+site.height*.45))));
  const scale=Math.min(1,4500/Math.max(1,desired.reduce((sum,count)=>sum+count,0)));
  const pieces=[];
  for(let i=0;i<sites.length;i++){
    const site=sites[i],count=Math.max(4,Math.floor(desired[i]*scale));
    for(let j=0;j<count;j++){
      const x=site.x+(random()-.5)*Math.max(5,site.width*1.35);
      const z=site.z+(random()-.5)*Math.max(5,site.depth*1.35);
      if(Math.hypot(x-position.x,z-position.z)>coreRadius+12)continue;
      const kind=j%7<3?'slab':j%7<5?'rock':'beam';
      const size=.8+random()*2.4;
      pieces.push({kind,x,z,y:.25+random()*1.15,scale:kind==='slab'?[size*1.8,.22+random()*.48,size*1.65]:kind==='beam'?[.35+random()*.6,.35+random()*.6,2.4+random()*5]:[size,size*.6,size],rotation:random()*Math.PI*2,color:COLORS[Math.floor(random()*COLORS.length)]});
    }
  }
  // Fine debris fills the gaps, so the blast center no longer reads as a
  // pristine empty patch when seen from above.
  const loose=sites.length?700:2000;
  for(let i=0;i<loose;i++){
    const angle=random()*Math.PI*2,radius=Math.sqrt(random())*coreRadius;
    const size=.35+random()*1.3;
    pieces.push({kind:i%3?'rock':'slab',x:position.x+Math.cos(angle)*radius,z:position.z+Math.sin(angle)*radius,y:.1+random()*.45,scale:[size,size*.45,size],rotation:random()*Math.PI*2,color:COLORS[Math.floor(random()*COLORS.length)]});
  }
  return pieces;
}

export function createRubbleField(position,sites){
  const plans=planRubble(position,sites);
  const group=new THREE.Group();group.name='Nuclear blast rubble';
  const types=[
    ['slab',new THREE.BoxGeometry(1,1,1)],
    ['rock',new THREE.TetrahedronGeometry(1,0)],
    ['beam',new THREE.BoxGeometry(1,1,1)]
  ];
  const dummy=new THREE.Object3D(),color=new THREE.Color();
  for(const [kind,geometry] of types){
    const selected=plans.filter(piece=>piece.kind===kind);
    if(!selected.length){geometry.dispose();continue;}
    const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,metalness:0,side:THREE.DoubleSide});
    const mesh=new THREE.InstancedMesh(geometry,material,selected.length);
    mesh.name=`${kind} rubble`;
    for(let i=0;i<selected.length;i++){
      const piece=selected[i];
      dummy.position.set(piece.x,piece.y,piece.z);
      dummy.rotation.set(kind==='slab'?(i%5)*.11:randomFor(piece.x,piece.z)()*.7,piece.rotation,kind==='beam'?(i%3)*.22:0);
      dummy.scale.set(...piece.scale);dummy.updateMatrix();
      mesh.setMatrixAt(i,dummy.matrix);
      mesh.setColorAt(i,color.setHex(piece.color));
    }
    mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.computeBoundingSphere();group.add(mesh);
  }
  return group;
}

// A collapsed facade needs many small silhouettes at the footprint, without
// paying for one draw call per stone in the streamed city.
export function createCollapseRubble(building){
  const centerX=(building.minX+building.maxX)/2,centerZ=(building.minZ+building.maxZ)/2;
  const width=Math.max(4,building.maxX-building.minX),depth=Math.max(4,building.maxZ-building.minZ);
  const random=randomFor(centerX,centerZ);
  const count=Math.min(220,Math.max(75,Math.round(width*depth*.36+building.top*1.4)));
  const group=new THREE.Group();group.name='Collapsed building rubble';
  const dummy=new THREE.Object3D(),color=new THREE.Color();
  for(const kind of ['slab','stone']){
    const amount=kind==='slab'?Math.floor(count*.38):count-Math.floor(count*.38);
    const geometry=kind==='slab'?new THREE.BoxGeometry(1,1,1):new THREE.TetrahedronGeometry(1,0);
    const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1});
    const mesh=new THREE.InstancedMesh(geometry,material,amount);
    for(let i=0;i<amount;i++){
      const x=centerX+(random()-.5)*width*1.35,z=centerZ+(random()-.5)*depth*1.35;
      const size=kind==='slab'?.55+random()*2.1:.35+random()*1.25;
      dummy.position.set(x,building.rubbleHeight*.35+random()*1.4,z);
      dummy.rotation.set((random()-.5)*.65,random()*Math.PI*2,(random()-.5)*.65);
      dummy.scale.set(kind==='slab'?size*1.65:size,kind==='slab'?.22+random()*.55:size,kind==='slab'?size*1.3:size);
      dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      mesh.setColorAt(i,color.setHex(COLORS[Math.floor(random()*COLORS.length)]));
    }
    mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.computeBoundingSphere();group.add(mesh);
  }
  return group;
}
