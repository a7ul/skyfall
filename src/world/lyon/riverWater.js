import * as THREE from 'three';
import {RIVERS} from './waterMask.js';

const segments=RIVERS.flatMap(river=>{
  let along=0;
  return river.points.slice(1).map(([bx,bz],i)=>{
    const [ax,az]=river.points[i],dx=bx-ax,dz=bz-az,length=Math.hypot(dx,dz);
    const segment={ax,az,dx,dz,length,along,width:river.width*.72};
    along+=length;
    return segment;
  });
});

function riverCoordinates(x,z){
  let nearest=null,best=Infinity;
  for(const segment of segments){
    const {ax,az,dx,dz,length,along,width}=segment;
    const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(length*length)));
    const ox=x-ax-t*dx,oz=z-az-t*dz,distanceSq=ox*ox+oz*oz;
    if(distanceSq>=width*width||distanceSq>=best)continue;
    best=distanceSq;
    nearest=[(ox*dz-oz*dx)/length/35,(along+t*length)/35];
  }
  return nearest;
}

function nearRiver(x,z,radius){
  return segments.some(({ax,az,dx,dz,length,width})=>{
    const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(length*length)));
    const ox=x-ax-t*dx,oz=z-az-t*dz;
    return ox*ox+oz*oz<(width+radius)**2;
  });
}

function rippleNormals(size=128){
  const pixels=new Uint8Array(size*size*4);
  const height=(x,y)=>{
    const a=Math.PI*2;
    return Math.sin(a*(4*x+2*y))*.4+Math.sin(a*(11*x-7*y))*.2+Math.sin(a*(23*x+17*y))*.07;
  };
  const step=1/size;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x*step,v=y*step;
    const dx=height(u+step,v)-height(u-step,v);
    const dy=height(u,v+step)-height(u,v-step);
    const normal=new THREE.Vector3(-dx*2,-dy*2,1).normalize();
    const offset=(y*size+x)*4;
    pixels[offset]=Math.round((normal.x*.5+.5)*255);
    pixels[offset+1]=Math.round((normal.y*.5+.5)*255);
    pixels[offset+2]=Math.round((normal.z*.5+.5)*255);
    pixels[offset+3]=255;
  }
  const texture=new THREE.DataTexture(pixels,size,size,THREE.RGBAFormat);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;
  texture.needsUpdate=true;
  return texture;
}

// Apply moving reflections only to triangles supplied by the photomesh itself.
// The source river texture and shore geometry remain intact; nothing is drawn
// over a street or into a hole where the selected map has no water mesh.
export function createRiverWater(isBridge=()=>false){
  const normalMap=rippleNormals();
  const material=new THREE.MeshPhysicalMaterial({
    color:0x6a8790,metalness:.08,roughness:.3,clearcoat:.72,clearcoatRoughness:.2,
    normalMap,normalScale:new THREE.Vector2(.18,.18),transparent:true,opacity:.22,
    depthWrite:false,side:THREE.DoubleSide,envMapIntensity:.7
  });
  const pending=[];
  const overlays=new Map();
  function enhance(tileScene,tilesGroup){
    if(!tileScene||overlays.has(tileScene))return;
    const source=[];
    tileScene.traverse(object=>{if(object.isMesh&&!object.userData.waterOverlay&&object.geometry?.getAttribute('position'))source.push(object);});
    const originalParent=tileScene.parent;
    if(!originalParent)tileScene.parent=tilesGroup;
    tileScene.updateWorldMatrix(true,true);
    const inverse=tileScene.matrixWorld.clone().invert();
    const normal=new THREE.Vector3(0,1,0).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(inverse)).normalize();
    const meshes=source.filter(mesh=>{
      const bounds=mesh.geometry.boundingSphere;
      if(!bounds)return true;
      const sphere=bounds.clone().applyMatrix4(mesh.matrixWorld);
      return sphere.center.y-sphere.radius<5.5&&sphere.center.y+sphere.radius>-4&&nearRiver(sphere.center.x,sphere.center.z,sphere.radius);
    }).map(mesh=>({
      geometry:mesh.geometry,
      world:mesh.matrixWorld.clone(),
      next:0,
      count:mesh.geometry.getIndex()?.count||mesh.geometry.getAttribute('position').count
    }));
    if(!originalParent)tileScene.parent=null;
    const job={tileScene,inverse,normal,meshes,meshIndex:0,positions:[],normals:[],uvs:[]};
    overlays.set(tileScene,null);
    pending.push(job);
  }
  function process(job,budget){
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
    let checked=0;
    while(job.meshIndex<job.meshes.length&&checked<budget){
      const mesh=job.meshes[job.meshIndex];
      const position=mesh.geometry.getAttribute('position'),index=mesh.geometry.getIndex();
      if(mesh.next+2>=mesh.count){job.meshIndex++;continue;}
      const i=mesh.next;mesh.next+=3;checked++;
      a.fromBufferAttribute(position,index?index.getX(i):i).applyMatrix4(mesh.world);
      b.fromBufferAttribute(position,index?index.getX(i+1):i+1).applyMatrix4(mesh.world);
      c.fromBufferAttribute(position,index?index.getX(i+2):i+2).applyMatrix4(mesh.world);
      const low=Math.min(a.y,b.y,c.y),high=Math.max(a.y,b.y,c.y);
      if(low < -4||high>5.5||high-low>.4)continue;
      const riverUV=[riverCoordinates(a.x,a.z),riverCoordinates(b.x,b.z),riverCoordinates(c.x,c.z)];
      if(riverUV.some(uv=>!uv))continue;
      if(isBridge((a.x+b.x+c.x)/3,(a.z+b.z+c.z)/3))continue;
      const cross=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      if(Math.abs(cross.y)<.85)continue;
      for(const [vertex,point] of [a,b,c].entries()){
        point.y+=.08;
        point.applyMatrix4(job.inverse);
        job.positions.push(point.x,point.y,point.z);
        job.normals.push(job.normal.x,job.normal.y,job.normal.z);
        job.uvs.push(...riverUV[vertex]);
      }
    }
    return checked;
  }
  function finish(job){
    if(!job.positions.length)return;
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(job.positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(job.normals,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(job.uvs,2));
    geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,material);
    mesh.name='Water reflections';
    mesh.userData.waterOverlay=true;
    mesh.raycast=()=>{};
    job.tileScene.add(mesh);
    overlays.set(job.tileScene,mesh);
  }
  function forget(tileScene){
    const overlay=overlays.get(tileScene);
    if(overlay){overlay.removeFromParent();overlay.geometry.dispose();}
    overlays.delete(tileScene);
    for(let i=pending.length-1;i>=0;i--)if(pending[i].tileScene===tileScene)pending.splice(i,1);
  }
  return {
    enhance,forget,
    update(dt){
      normalMap.offset.x=(normalMap.offset.x+dt*.012)%1;
      normalMap.offset.y=(normalMap.offset.y+dt*.005)%1;
      let budget=3500;
      while(pending.length&&budget>0){
        const job=pending[0];
        budget-=process(job,budget);
        if(job.meshIndex<job.meshes.length)break;
        pending.shift();
        if(overlays.has(job.tileScene))finish(job);
      }
    },
    dispose(){for(const tileScene of overlays.keys())forget(tileScene);material.dispose();normalMap.dispose();}
  };
}
