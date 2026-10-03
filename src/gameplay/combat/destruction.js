import * as THREE from 'three';
import {distanceToFootprint} from '../../world/lyon/buildings.js';
import {blastRubbleHeight} from './nuclearBlast.js';

const vertex = new THREE.Vector3();
const center = new THREE.Vector3();

// Remove only triangles near the strike from the streamed tile. Keep its
// textures and UVs on a small set of detached pieces.
export function fractureMesh(mesh, point, radius, {makeFragments=true, faceIndex=-1,building=null,blastZone=null}={}) {
  const geometry = mesh.geometry;
  const position = geometry?.getAttribute('position');
  if (!position || !mesh.isMesh) return [];
  const index = geometry.getIndex();
  const triangleCount = (index?.count || position.count) / 3;
  if (triangleCount > 300000) return [];
  const uv = geometry.getAttribute('uv');
  const impact = point instanceof THREE.Vector3 ? point : new THREE.Vector3(...point);
  mesh.updateWorldMatrix(true, false);
  const localImpact = impact.clone().applyMatrix4(mesh.matrixWorld.clone().invert());
  const scale = new THREE.Vector3();
  mesh.getWorldScale(scale);
  const minimumScale = Math.max(.0001, Math.min(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z)));
  const localRadiusSq = (radius / minimumScale) ** 2;
  const tierCount=building?(building.top>40?5:building.top>24?4:3):0;
  const sectors=building?(building.top>40?12:building.top>24?9:6):0;
  const shardCount=building?tierCount*sectors:10;
  const shards = makeFragments ? Array.from({length: shardCount}, () => ({positions: [], uvs: [], sum: new THREE.Vector3(), count: 0})) : null;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const original = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  let removed = 0;
  let captured = 0;
  let surfaceAxis = null;
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const ids = index
      ? [index.getX(triangle * 3), index.getX(triangle * 3 + 1), index.getX(triangle * 3 + 2)]
      : [triangle * 3, triangle * 3 + 1, triangle * 3 + 2];
    a.fromBufferAttribute(position, ids[0]);
    b.fromBufferAttribute(position, ids[1]);
    c.fromBufferAttribute(position, ids[2]);
    center.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    if(blastZone){
      center.applyMatrix4(mesh.matrixWorld);
      const distance=Math.hypot(center.x-blastZone.x,center.z-blastZone.z);
      if(center.y<=blastRubbleHeight(distance,blastZone.core,blastZone.outer))continue;
    }else if(building){
      center.applyMatrix4(mesh.matrixWorld);
      if(center.y<1.5||center.y>building.top+3||distanceToFootprint(center.x,center.z,building)>2.2)continue;
    }else if (center.distanceToSquared(localImpact) > localRadiusSq && triangle !== faceIndex) continue;
    if (a.distanceToSquared(b) < .0001 || b.distanceToSquared(c) < .0001) continue;

    if (shards && removed % (building?Math.max(1,Math.floor(triangleCount/1500)):2) === 0 && captured < (building?1500:550)) {
      captured++;
      if (surfaceAxis === null) {
        const normal=b.clone().sub(a).cross(c.clone().sub(a));
        const axes=[Math.abs(normal.x),Math.abs(normal.y),Math.abs(normal.z)];
        surfaceAxis=axes.indexOf(Math.max(...axes));
      }
      const u=surfaceAxis===0?center.y-localImpact.y:center.x-localImpact.x;
      const v=surfaceAxis===2?center.y-localImpact.y:center.z-localImpact.z;
      const angle=Math.atan2(v,u);
      const bucket=building
        ? Math.min(shardCount-1,Math.floor(Math.max(0,Math.min(.999,(center.y-2)/Math.max(1,building.top)))*tierCount)*sectors+Math.floor((angle+Math.PI)/(Math.PI*2)*sectors))
        : Math.min(9,Math.max(0,Math.floor((angle+Math.PI)/(Math.PI*2)*10)));
      original[0].copy(a).applyMatrix4(mesh.matrixWorld);
      original[1].copy(b).applyMatrix4(mesh.matrixWorld);
      original[2].copy(c).applyMatrix4(mesh.matrixWorld);
      center.copy(original[0]).add(original[1]).add(original[2]).multiplyScalar(1 / 3);
      const shard = shards[bucket];
      for (let i = 0; i < 3; i++) {
        shard.positions.push(original[i].x, original[i].y, original[i].z);
        if (uv) shard.uvs.push(uv.getX(ids[i]), uv.getY(ids[i]));
        shard.sum.add(original[i]);
        shard.count++;
      }
    }
    if (index) {
      index.setX(triangle * 3 + 1, ids[0]);
      index.setX(triangle * 3 + 2, ids[0]);
    } else {
      vertex.fromBufferAttribute(position, ids[0]);
      position.setXYZ(ids[1], vertex.x, vertex.y, vertex.z);
      position.setXYZ(ids[2], vertex.x, vertex.y, vertex.z);
    }
    removed++;
  }
  if (!removed) return [];
  if (index) index.needsUpdate = true;
  else position.needsUpdate = true;
  if (!shards) return [];

  const sourceMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  return shards.filter(shard => shard.count).map(shard => {
    const origin = shard.sum.multiplyScalar(1 / shard.count);
    const vertices = new Float32Array(shard.positions.length);
    for (let i = 0; i < vertices.length; i += 3) {
      vertices[i] = shard.positions[i] - origin.x;
      vertices[i + 1] = shard.positions[i + 1] - origin.y;
      vertices[i + 2] = shard.positions[i + 2] - origin.z;
    }
    const piece = new THREE.BufferGeometry();
    piece.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    if (uv) piece.setAttribute('uv', new THREE.Float32BufferAttribute(shard.uvs, 2));
    piece.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      map: sourceMaterial?.map || null,
      color: sourceMaterial?.color || 0xb5b3ae,
      roughness: .95,
      side: THREE.DoubleSide,
    });
    return {geometry: piece, material, position: origin.clone()};
  });
}
