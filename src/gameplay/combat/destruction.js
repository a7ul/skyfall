import * as THREE from 'three';
import {distanceToFootprint} from '../../world/lyon/buildings.js';
import {blastRubbleHeight} from './nuclearBlast.js';

const center = new THREE.Vector3();

// Remove only the triangles of a collapsed building or broad blast zone.
// Ordinary surface hits never cut an open patch in the streamed tile.
export function fractureMesh(mesh, point, radius, {makeFragments=true,building=null,blastZone=null}={}) {
  if(!building&&!blastZone)return [];
  const geometry = mesh.geometry;
  const position = geometry?.getAttribute('position');
  if (!position || !mesh.isMesh) return [];
  const index = geometry.getIndex();
  const triangleCount = (index?.count || position.count) / 3;
  if (triangleCount > 300000) return [];
  const uv = geometry.getAttribute('uv');
  mesh.updateWorldMatrix(true, false);
  const cellSize=building?3.2:Math.max(1.3,radius/5);
  const shardLimit=building?180:48;
  const shards = makeFragments ? new Map() : null;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const original = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  let removed = 0;
  let captured = 0;
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
    }
    if (a.distanceToSquared(b) < .0001 || b.distanceToSquared(c) < .0001) continue;

    if (shards && removed % 2 === 0 && captured < 2400) {
      original[0].copy(a).applyMatrix4(mesh.matrixWorld);
      original[1].copy(b).applyMatrix4(mesh.matrixWorld);
      original[2].copy(c).applyMatrix4(mesh.matrixWorld);
      center.copy(original[0]).add(original[1]).add(original[2]).multiplyScalar(1 / 3);
      const key=`${Math.floor(center.x/cellSize)},${Math.floor(center.y/cellSize)},${Math.floor(center.z/cellSize)}`;
      let shard=shards.get(key);
      if(!shard&&shards.size<shardLimit){shard={positions:[],uvs:[],sum:new THREE.Vector3(),count:0};shards.set(key,shard);}
      if(shard){
        captured++;
        for (let i = 0; i < 3; i++) {
          shard.positions.push(original[i].x, original[i].y, original[i].z);
          if (uv) shard.uvs.push(uv.getX(ids[i]), uv.getY(ids[i]));
          shard.sum.add(original[i]);
          shard.count++;
        }
      }
    }
    if (index) {
      index.setX(triangle * 3 + 1, ids[0]);
      index.setX(triangle * 3 + 2, ids[0]);
    } else {
      position.setXYZ(ids[1], a.x, a.y, a.z);
      position.setXYZ(ids[2], a.x, a.y, a.z);
    }
    removed++;
  }
  if (!removed) return [];
  if (index) index.needsUpdate = true;
  else position.needsUpdate = true;
  if (!shards) return [];

  const sourceMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  return [...shards.values()].map(shard => {
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
