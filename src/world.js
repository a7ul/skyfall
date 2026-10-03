import {createHelsinkiWorld,helsinkiTerrainHeight} from './helsinkiWorld.js';
import * as THREE from 'three';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {AIRCRAFT,createJet} from './jet.js';

const v=(x,y,z)=>new THREE.Vector3(x,y,z);
const groundColor=new THREE.Color();
const TERRAIN_SIZE=32000, TERRAIN_SAMPLES=513;
let heightData=null;
let helsinkiMode=true;
function sampleRawHeight(x,z){
  if(!heightData||Math.abs(x)>TERRAIN_SIZE*.5||Math.abs(z)>TERRAIN_SIZE*.5)return -100;
  const u=(x/TERRAIN_SIZE+.5)*(TERRAIN_SAMPLES-1),v=(z/TERRAIN_SIZE+.5)*(TERRAIN_SAMPLES-1);
  const ix=Math.floor(u),iz=Math.floor(v),fx=u-ix,fz=v-iz;
  const a=heightData[iz*TERRAIN_SAMPLES+ix],b=heightData[iz*TERRAIN_SAMPLES+Math.min(ix+1,TERRAIN_SAMPLES-1)];
  const c=heightData[Math.min(iz+1,TERRAIN_SAMPLES-1)*TERRAIN_SAMPLES+ix],d=heightData[Math.min(iz+1,TERRAIN_SAMPLES-1)*TERRAIN_SAMPLES+Math.min(ix+1,TERRAIN_SAMPLES-1)];
  return (a+(b-a)*fx)*(1-fz)+(c+(d-c)*fx)*fz;
}
export function terrainHeight(x,z){return helsinkiMode?helsinkiTerrainHeight(x,z):Math.max(-100,sampleRawHeight(x,z)-1);}
function hash(x,z){let n=Math.imul(Math.floor(x),374761393)+Math.imul(Math.floor(z),668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
function addCity(scene,data,ortho,cell,detail){
  const walls=[],wallColors=[],wallUvs=[],roofs=[],roofColors=[],roofUvs=[],roofUnits=[];
  const lowRise=[0xb7a294,0x9e8f84,0x9c796a,0xb6aa99,0x837d77,0xa8947e].map(c=>new THREE.Color(c));
  const highRise=[0x8398a2,0x8b979a,0xb1b8b5,0x768b98,0xa4a8a4,0x87919a].map(c=>new THREE.Color(c));
  const pushWall=(p,c,u,v,light=1)=>{walls.push(...p);wallColors.push(c.r*light,c.g*light,c.b*light);wallUvs.push(u,v);};
  const pushRoof=(p)=>{roofs.push(...p);roofColors.push(1,1,1);roofUvs.push(detail?(p[0]-(cell.x-1000))/2000:p[0]/14000+.5,detail?(cell.z+1000-p[2])/2000:.5-p[2]/14000);};
  for(const feature of data.features){
    const contour=feature.points.slice(0,-1).map(([x,z])=>new THREE.Vector2(x,z));
    if(contour.length<3||contour.length>90)continue;
    const cx=contour.reduce((sum,p)=>sum+p.x,0)/contour.length,cz=contour.reduce((sum,p)=>sum+p.y,0)/contour.length;
    const base=Math.max(-4,terrainHeight(cx,cz));
    const height=THREE.MathUtils.clamp(Number(feature.height)||10,4,450);
    const seed=hash(cx,cz),facades=height>75?highRise:lowRise,palette=facades[Math.floor(seed*facades.length)];
    if(height>35&&contour.length<28&&seed>.18){
      const xs=contour.map(p=>p.x),zs=contour.map(p=>p.y);
      const width=Math.max(3,Math.min(12,(Math.max(...xs)-Math.min(...xs))*.22));
      const depth=Math.max(3,Math.min(12,(Math.max(...zs)-Math.min(...zs))*.22));
      const unitHeight=2.4+seed*2.5;
      roofUnits.push({x:cx,y:base+height+unitHeight*.5,z:cz,width,depth,height:unitHeight});
    }
    const triangles=THREE.ShapeUtils.triangulateShape(contour,[]);
    for(const [i,j,k] of triangles)for(const index of [i,j,k]){const p=contour[index];pushRoof([p.x,base+height,p.y]);}
    for(let i=0;i<contour.length;i++){
      const a=contour[i],b=contour[(i+1)%contour.length];
      const shade=.79+.22*Math.abs((b.y-a.y)/Math.max(.1,Math.hypot(b.x-a.x,b.y-a.y)));
      const c=palette.clone().multiplyScalar(shade);
      const p=[a.x,base,a.y],q=[b.x,base,b.y],r=[a.x,base+height,a.y],t=[b.x,base+height,b.y];
      // One facade tile spans about eight real window bays and eight floors.
      const u=Math.hypot(b.x-a.x,b.y-a.y)/25,v=height/26;
      const face=[p,q,r,q,t,r],uv=[[0,0],[u,0],[0,v],[u,0],[u,v],[0,v]];
      for(let k=0;k<6;k++)pushWall(face[k],c,...uv[k],face[k][1]===base?.78:1.08);
    }
  }
  const facadeCanvas=document.createElement('canvas');facadeCanvas.width=256;facadeCanvas.height=256;
  const ctx=facadeCanvas.getContext('2d');ctx.fillStyle='#aeb8b9';ctx.fillRect(0,0,256,256);
  for(let row=0;row<8;row++)for(let col=0;col<8;col++){
    const x=col*32,y=row*32,lit=hash(col*9+row*3,row*13+col*7)>.78;
    ctx.fillStyle='#78878a';ctx.fillRect(x+2,y+2,28,28);
    ctx.fillStyle='#c1c7c2';ctx.fillRect(x+3,y+3,26,3);
    ctx.fillStyle='#44565f';ctx.fillRect(x+5,y+7,22,19);
    ctx.fillStyle=lit?'#d5d4b4':'#29424e';ctx.fillRect(x+7,y+9,18,15);
    ctx.fillStyle='rgba(210,231,231,.25)';ctx.fillRect(x+8,y+10,6,13);
    ctx.fillStyle='#899b9e';ctx.fillRect(x+15,y+7,2,19);
    ctx.fillStyle='#d0d2c9';ctx.fillRect(x+3,y+27,26,3);
  }
  const facade=new THREE.CanvasTexture(facadeCanvas);facade.colorSpace=THREE.SRGBColorSpace;facade.wrapS=facade.wrapT=THREE.RepeatWrapping;facade.anisotropy=8;
  const wallGeo=new THREE.BufferGeometry();wallGeo.setAttribute('position',new THREE.Float32BufferAttribute(walls,3));wallGeo.setAttribute('color',new THREE.Float32BufferAttribute(wallColors,3));wallGeo.setAttribute('uv',new THREE.Float32BufferAttribute(wallUvs,2));wallGeo.computeVertexNormals();
  const roofGeo=new THREE.BufferGeometry();roofGeo.setAttribute('position',new THREE.Float32BufferAttribute(roofs,3));roofGeo.setAttribute('color',new THREE.Float32BufferAttribute(roofColors,3));roofGeo.setAttribute('uv',new THREE.Float32BufferAttribute(roofUvs,2));roofGeo.computeVertexNormals();
  const wallMesh=new THREE.Mesh(wallGeo,new THREE.MeshStandardMaterial({map:facade,vertexColors:true,roughness:.81,metalness:.05,side:THREE.DoubleSide}));
  if(detail){detail.colorSpace=THREE.SRGBColorSpace;detail.anisotropy=8;}
  const roofMesh=new THREE.Mesh(roofGeo,new THREE.MeshBasicMaterial({map:detail||ortho,vertexColors:true,side:THREE.DoubleSide}));
  scene.add(wallMesh,roofMesh);
  let ground=null;
  if(detail){
    const geo=new THREE.PlaneGeometry(2000,2000,30,30);geo.rotateX(-Math.PI/2);
    const positions=geo.attributes.position;
    for(let i=0;i<positions.count;i++)positions.setY(i,terrainHeight(positions.getX(i)+cell.x,positions.getZ(i)+cell.z)+1.25);
    geo.computeVertexNormals();
    ground=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:detail,alphaTest:.5,side:THREE.DoubleSide}));
    ground.position.set(cell.x,0,cell.z);scene.add(ground);
  }
  let equipment=null;
  if(roofUnits.length){
    equipment=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0x9ba7aa,metalness:.24,roughness:.72}),roofUnits.length);
    const dummy=new THREE.Object3D();
    roofUnits.forEach((unit,i)=>{dummy.position.set(unit.x,unit.y,unit.z);dummy.scale.set(unit.width,unit.height,unit.depth);dummy.updateMatrix();equipment.setMatrixAt(i,dummy.matrix);});
    equipment.instanceMatrix.needsUpdate=true;scene.add(equipment);
  }
  return {wallMesh,roofMesh,ground,equipment,buildings:data.features.length,dispose(){scene.remove(wallMesh,roofMesh);if(ground){scene.remove(ground);ground.geometry.dispose();ground.material.dispose();}if(equipment){scene.remove(equipment);equipment.geometry.dispose();equipment.material.dispose();}wallGeo.dispose();roofGeo.dispose();wallMesh.material.dispose();roofMesh.material.dispose();facade.dispose();detail?.dispose();}};
}

function streamCity(scene,manifest,ortho){
  const loaded=new Map(),pending=new Set(),cells=manifest.cells;
  const textureLoader=new THREE.TextureLoader();
  let nextCheck=0,active=0;
  const near=6300,far=8500;
  function update(position,dt){
    if(!position)return;
    nextCheck-=dt;
    if(nextCheck>0)return;
    nextCheck=.45;
    for(const [file,chunk] of loaded){
      const cell=cells.find(c=>c.file===file);
      if(Math.hypot(cell.x-position.x,cell.z-position.z)>far){chunk.dispose();loaded.delete(file);}
    }
    const candidates=cells.filter(c=>Math.hypot(c.x-position.x,c.z-position.z)<near&&!loaded.has(c.file)&&!pending.has(c.file));
    candidates.sort((a,b)=>Math.hypot(a.x-position.x,a.z-position.z)-Math.hypot(b.x-position.x,b.z-position.z));
    for(const cell of candidates.slice(0,Math.max(0,2-active))){
      active++;pending.add(cell.file);
      const geometry=fetch(`/assets/city/${cell.file}`).then(response=>{if(!response.ok)throw new Error(`City cell ${response.status}`);return response.json();});
      const detail=cell.ortho?textureLoader.loadAsync(`/assets/city/ortho/${cell.ortho}`).catch(error=>{console.warn('City imagery failed to load',cell.ortho,error);return null;}):Promise.resolve(null);
      Promise.all([geometry,detail]).then(([data,texture])=>{
        loaded.set(cell.file,addCity(scene,data,ortho,cell,texture));
      }).catch(error=>console.warn('City cell failed to load',cell.file,error)).finally(()=>{pending.delete(cell.file);active--;});
    }
  }
  return {update,get loadedCount(){return loaded.size;},get buildingCount(){return [...loaded.values()].reduce((total,chunk)=>total+chunk.buildings,0);}};
}

export async function createWorld(scene,onProgress,renderer){
  if(helsinkiMode)return createHelsinkiWorld(scene,onProgress,renderer);
  const loader=new THREE.TextureLoader();
  const [sky,lighting,oceanNormal,ortho,heightBuffer,cityManifest]=await Promise.all([
    loader.loadAsync('/assets/sky.webp'),new HDRLoader().loadAsync('/assets/sky-lighting.hdr'),loader.loadAsync('/assets/ocean-normal.png'),loader.loadAsync('/assets/new-york-ortho.webp'),fetch('/assets/new-york-elevation.bin').then(r=>r.arrayBuffer()),fetch('/assets/city/manifest.json').then(r=>r.json())
  ]);
  heightData=new Float32Array(heightBuffer);
  sky.mapping=THREE.EquirectangularReflectionMapping;sky.colorSpace=THREE.SRGBColorSpace;
  lighting.mapping=THREE.EquirectangularReflectionMapping;
  scene.background=sky;scene.backgroundIntensity=.85;scene.environment=lighting;scene.environmentIntensity=.82;
  scene.fog=new THREE.FogExp2(0xa7bac6,.000052);
  scene.add(new THREE.HemisphereLight(0xdce8ee,0x3c4b41,.75));
  const sun=new THREE.DirectionalLight(0xfff1d8,1.55);sun.position.set(-5200,7800,-9000);scene.add(sun);
  const fill=new THREE.DirectionalLight(0xc8dce4,.62);fill.position.set(4400,5200,6100);scene.add(fill);
  oceanNormal.wrapS=oceanNormal.wrapT=THREE.RepeatWrapping;oceanNormal.repeat.set(58,58);oceanNormal.anisotropy=8;
  const waterMaterial=new THREE.MeshStandardMaterial({color:0x225670,metalness:.43,roughness:.42,normalMap:oceanNormal,normalScale:new THREE.Vector2(.15,.15),envMapIntensity:.85});
  const sea=new THREE.Mesh(new THREE.PlaneGeometry(90000,90000),waterMaterial);sea.rotation.x=-Math.PI/2;sea.position.y=-1.4;scene.add(sea);
  const size=32000,div=384,g=new THREE.PlaneGeometry(size,size,div,div);g.rotateX(-Math.PI/2);const p=g.attributes.position,colors=[];
  const sand=new THREE.Color(0x697768),grass=new THREE.Color(0x618064),forest=new THREE.Color(0x45684e),rock=new THREE.Color(0x727d76),snow=new THREE.Color(0xa3aaa1);
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),z=p.getZ(i),h=terrainHeight(x,z),variation=(hash(x*.04,z*.04)-.5)*.35;p.setY(i,h);
    const above=h+variation*24;if(above<12)groundColor.copy(sand);else if(above<100)groundColor.copy(sand).lerp(grass,THREE.MathUtils.smoothstep(above,12,100));else if(above<300)groundColor.copy(grass).lerp(forest,THREE.MathUtils.smoothstep(above,100,300));else if(above<630)groundColor.copy(forest).lerp(rock,THREE.MathUtils.smoothstep(above,300,630));else groundColor.copy(rock).lerp(snow,THREE.MathUtils.smoothstep(above,630,900));
    const broadPatch=(hash(x*.0013-44,z*.0013+31)-.5)*.5;
    groundColor.multiplyScalar(.87+variation*.18+broadPatch*.12);colors.push(groundColor.r,groundColor.g,groundColor.b);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();
  const land=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,metalness:0,side:THREE.DoubleSide}));land.receiveShadow=true;scene.add(land);
  ortho.colorSpace=THREE.SRGBColorSpace;ortho.anisotropy=8;
  const photoGeo=new THREE.PlaneGeometry(14000,14000,220,220);photoGeo.rotateX(-Math.PI/2);
  const photoPos=photoGeo.attributes.position;
  for(let i=0;i<photoPos.count;i++)photoPos.setY(i,terrainHeight(photoPos.getX(i),photoPos.getZ(i))+.9);
  photoGeo.computeVertexNormals();
  const photoGround=new THREE.Mesh(photoGeo,new THREE.MeshBasicMaterial({map:ortho,alphaTest:.5,side:THREE.DoubleSide}));scene.add(photoGround);
  // A broken white surf line gives the shore scale when viewed from altitude.
  const shore=[];for(let iz=0;iz<div;iz++)for(let ix=0;ix<div;ix++){
    const i=iz*(div+1)+ix,j=i+1,k=i+div+1;const h=p.getY(i);for(const n of [j,k]){const hn=p.getY(n);if((h+5)*(hn+5)<0){const f=(-5-h)/(hn-h);shore.push(p.getX(i)+(p.getX(n)-p.getX(i))*f,-4.65,p.getZ(i)+(p.getZ(n)-p.getZ(i))*f);}}
  }
  const surfPositions=[];for(let i=0;i+5<shore.length;i+=6){surfPositions.push(...shore.slice(i,i+3),...shore.slice(i+3,i+6));}
  if(surfPositions.length){const foamGeo=new THREE.BufferGeometry();foamGeo.setAttribute('position',new THREE.Float32BufferAttribute(surfPositions,3));scene.add(new THREE.LineSegments(foamGeo,new THREE.LineBasicMaterial({color:0xd8e5e2,transparent:true,opacity:.28,depthWrite:false})));}
  // Small, instanced tree crowns break up the ground without large draw-call cost.
  let seed=13925;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const treeGeo=new THREE.ConeGeometry(4,15,5),treeMat=new THREE.MeshStandardMaterial({color:0x3f5947,roughness:1});const trees=new THREE.InstancedMesh(treeGeo,treeMat,1500),dummy=new THREE.Object3D();let count=0;
  for(let i=0;i<6000&&count<1500;i++){const x=(random()-.5)*23000,z=(random()-.5)*23000,h=terrainHeight(x,z);if(h<35||h>330||Math.abs(x)<7200&&Math.abs(z)<7200||random()<.55)continue;dummy.position.set(x,h+7,z);const size=.55+random()*1.3;dummy.scale.setScalar(size);dummy.rotation.y=random()*Math.PI*2;dummy.updateMatrix();trees.setMatrixAt(count++,dummy.matrix);}trees.count=count;trees.instanceMatrix.needsUpdate=true;scene.add(trees);
  const city=streamCity(scene,cityManifest,ortho);
  return {sea,land,photoGround,trees,city,update(dt,position){oceanNormal.offset.x=(oceanNormal.offset.x+dt*.0019)%1;oceanNormal.offset.y=(oceanNormal.offset.y+dt*.0011)%1;city.update(position,dt);}};
}

export function createRadar(scene,x,z,name){
  const y=terrainHeight(x,z);const group=new THREE.Group();group.position.set(x,y,z);scene.add(group);
  const concrete=new THREE.MeshStandardMaterial({color:0x87918b,roughness:.9});const steel=new THREE.MeshStandardMaterial({color:0x4e6568,metalness:.65,roughness:.52});const dark=new THREE.MeshStandardMaterial({color:0x1e3438,metalness:.7,roughness:.44});
  const base=new THREE.Mesh(new THREE.CylinderGeometry(35,46,12,10),concrete);base.position.y=6;group.add(base);
  const tower=new THREE.Mesh(new THREE.CylinderGeometry(5,8,55,8),steel);tower.position.y=38;group.add(tower);
  for(const h of [22,42,58]){const platform=new THREE.Mesh(new THREE.CylinderGeometry(14,14,2,8),dark);platform.position.y=h;group.add(platform);}
  const dish=new THREE.Group();dish.position.y=70;group.add(dish);const back=new THREE.Mesh(new THREE.CylinderGeometry(23,23,2,24),steel);back.rotation.x=Math.PI/2;dish.add(back);const face=new THREE.Mesh(new THREE.CylinderGeometry(20,20,2.4,24),new THREE.MeshStandardMaterial({color:0xc5cfcb,metalness:.38,roughness:.7}));face.rotation.x=Math.PI/2;face.position.z=-2;dish.add(face);const arm=new THREE.Mesh(new THREE.BoxGeometry(2,2,12),dark);arm.position.z=-8;dish.add(arm);
  const beacon=new THREE.Mesh(new THREE.SphereGeometry(2,8,6),new THREE.MeshBasicMaterial({color:0xff523b}));beacon.position.y=63;group.add(beacon);
  for(let i=0;i<4;i++){const a=i*Math.PI/2;const hut=new THREE.Mesh(new THREE.BoxGeometry(23,11,19),concrete);hut.position.set(Math.sin(a)*71,5.5,Math.cos(a)*71);hut.rotation.y=a;group.add(hut);}
  return {name,type:'radar',group,position:v(x,y+58,z),health:3,alive:true,dish,beacon};
}

export function createEnemy(scene,x,y,z,index){const spec=AIRCRAFT[index%2===0?2:3];const group=createJet(spec,.83);group.position.set(x,y,z);scene.add(group);return{name:index===0?'BANDIT LEAD':'BANDIT TWO',type:'enemy',group,position:group.position,health:3,alive:true,phase:index*1.8,speed:125,fireTimer:3+index*2};}

export function createExtraction(scene,x,z,y=570){const group=new THREE.Group();group.position.set(x,y,z);scene.add(group);const mat=new THREE.MeshBasicMaterial({color:0x8ff2d3,transparent:true,opacity:.64,side:THREE.DoubleSide});const torus=new THREE.Mesh(new THREE.TorusGeometry(115,3,8,60),mat);torus.rotation.y=.28;group.add(torus);const inner=new THREE.Mesh(new THREE.TorusGeometry(96,1.2,6,48),mat);inner.rotation.y=.28;group.add(inner);const beam=new THREE.Mesh(new THREE.CylinderGeometry(2,2,530,8),mat);beam.position.y=-270;group.add(beam);return{group,position:group.position};}
