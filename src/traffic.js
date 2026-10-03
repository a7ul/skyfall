import * as THREE from 'three';

export async function createTraffic(scene){
  const data=await fetch('/assets/helsinki/traffic.json').then(r=>r.json());
  const routes=data.routes.filter(r=>r.points.length>2).map(route=>{
    const cumulative=[0];
    for(let i=1;i<route.points.length;i++){
      const a=route.points[i-1],b=route.points[i];
      cumulative.push(cumulative.at(-1)+Math.hypot(b[0]-a[0],b[2]-a[2]));
    }
    return {...route,cumulative,length:cumulative.at(-1)};
  }).filter(r=>r.length>50);
  const cars=[];
  for(let i=0;i<routes.length;i++){
    const route=routes[i];
    if(i%2===0||route.length>150)cars.push({route,offset:(i*.61803398875%1)*route.length,direction:i%3===0?-1:1,speed:route.speed*(.85+(i%5)*.08),color:i%11});
    if(route.length>220&&i%3===0)cars.push({route,offset:route.length*.55,direction:-1,speed:route.speed*.92,color:(i+3)%11});
  }
  const body=new THREE.InstancedMesh(new THREE.BoxGeometry(1.85,.72,4.25),new THREE.MeshStandardMaterial({color:0xffffff,metalness:.45,roughness:.36}),cars.length);
  const cabin=new THREE.InstancedMesh(new THREE.BoxGeometry(1.46,.58,2.12),new THREE.MeshStandardMaterial({color:0x222e36,metalness:.28,roughness:.22}),cars.length);
  body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);cabin.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const colors=[0xdedfdc,0x252c34,0x9badaf,0x8c3330,0x30445c,0x605c55,0xc2c4be,0x425b52,0xd4d6d6,0x294255,0xc2a884];
  cars.forEach((car,i)=>body.setColorAt(i,new THREE.Color(colors[car.color])));
  body.instanceColor.needsUpdate=true;
  scene.add(body,cabin);
  const dummy=new THREE.Object3D();let elapsed=0;
  function update(dt,position){
    elapsed+=dt;
    for(let i=0;i<cars.length;i++){
      const car=cars[i],route=car.route,total=route.length;
      const phase=(car.offset+elapsed*car.speed)%(total*2);
      const distance=phase<total?phase:total*2-phase;
      let lo=0,hi=route.cumulative.length-1;
      while(lo<hi-1){const mid=(lo+hi)>>1;if(route.cumulative[mid]<distance)lo=mid;else hi=mid;}
      const a=route.points[lo],b=route.points[lo+1],length=route.cumulative[lo+1]-route.cumulative[lo];
      const t=length>0?(distance-route.cumulative[lo])/length:0;
      const x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t,z=a[2]+(b[2]-a[2])*t;
      const far=position&&Math.hypot(position.x-x,position.z-z)>1050;
      dummy.position.set(x,far?-1000:y+.4,z);
      dummy.rotation.set(0,Math.atan2(b[0]-a[0],b[2]-a[2])+(phase>=total?Math.PI:0),0);
      dummy.scale.setScalar(far?0.001:1);
      dummy.updateMatrix();body.setMatrixAt(i,dummy.matrix);
      dummy.position.y+=.58;dummy.updateMatrix();cabin.setMatrixAt(i,dummy.matrix);
    }
    body.instanceMatrix.needsUpdate=true;cabin.instanceMatrix.needsUpdate=true;
  }
  update(0,null);
  return {update,count:cars.length};
}
