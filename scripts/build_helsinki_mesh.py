"""Build locally bundled Helsinki photogrammetry tiles from the City of Helsinki's open OBJ archive.

Source: https://3d.hel.ninja/data/mesh/Helsinki3D-MESH_2017_OBJ_2km-250m_ZIP/
License: CC BY 4.0, City of Helsinki. Uses HTTP ranges; no API key.
"""
import io
import json
import math
import re
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
import trimesh
from PIL import Image
from trimesh.visual.texture import TextureVisuals
from trimesh.visual.material import PBRMaterial

ARCHIVE = 'Helsinki3D_2017_OBJ_672496x2.zip'
URL = 'https://3d.hel.ninja/data/mesh/Helsinki3D-MESH_2017_OBJ_2km-250m_ZIP/' + ARCHIVE
SIZE = 1937055920
OUT = Path('public/assets/helsinki')
ORIGIN = (7335, 5059)  # Helsinki Cathedral, in the mesh's local X/Y coordinates.


class RemoteZip(io.RawIOBase):
    def __init__(self, url=URL, size=SIZE):
        self.url = url
        self.size = size
        self.pos = 0
        self.cache = {}

    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.pos
    def seek(self, offset, whence=0):
        self.pos = (0, self.pos, self.size)[whence] + offset
        return self.pos

    def read(self, size=-1):
        if size < 0: size = self.size - self.pos
        pieces = []
        end = min(self.size, self.pos + size)
        while self.pos < end:
            block = self.pos // 1048576
            if block not in self.cache:
                start = block * 1048576
                finish = min(self.size, start + 1048576)
                request = urllib.request.Request(self.url, headers={'Range': f'bytes={start}-{finish-1}'})
                for attempt in range(3):
                    try:
                        with urllib.request.urlopen(request, timeout=60) as response:
                            self.cache[block] = response.read()
                        break
                    except Exception:
                        if attempt == 2: raise
            offset = self.pos % 1048576
            chunk = self.cache[block][offset:offset + end-self.pos]
            if not chunk: raise IOError('Empty archive range')
            pieces.append(chunk)
            self.pos += len(chunk)
        return b''.join(pieces)


def parse_obj(data):
    verts, uvs, textured, plain = [], [], [], []
    material = ''
    for line in data.decode('ascii').splitlines():
        if line.startswith('v '): verts.append(tuple(map(float, line.split()[1:4])))
        elif line.startswith('vt '): uvs.append(tuple(map(float, line.split()[1:3])))
        elif line.startswith('usemtl '): material = line[7:]
        elif line.startswith('f '):
            corners = line[2:].split()
            if len(corners) != 3: continue
            target = plain if material.endswith('_untextured') else textured
            target.append([(int(p.split('/')[0])-1, int(p.split('/')[1])-1 if '/' in p and p.split('/')[1] else 0) for p in corners])
    return np.array(verts, dtype=np.float32), np.array(uvs, dtype=np.float32), textured, plain


def bounds_from_obj(data):
    vertices, _, _, _ = parse_obj(data)
    return [float(vertices[:,0].min()), float(vertices[:,1].min()), float(vertices[:,0].max()), float(vertices[:,1].max())]


def build_tile(archive, folder, level):
    prefix = folder + '/'
    names = sorted(n for n in archive.namelist() if n.startswith(prefix) and re.search(fr'_L{level}(?:_|\.)', n) and n.endswith('.obj'))
    if not names: return None
    # Adaptive child tiles are packed into one atlas per 250 m cell, keeping
    # each detail level to one textured draw call.
    columns = math.ceil(math.sqrt(len(names)))
    cell_size = 512
    atlas = Image.new('RGB', (columns*cell_size, columns*cell_size), (120,120,120))
    positions, uv_out, faces = [], [], []
    plain_positions, plain_faces = [], []
    bounds = [1e9, 1e9, -1e9, -1e9]
    for slot, name in enumerate(names):
        data = archive.read(name)
        vertices, uvs, textured, plain = parse_obj(data)
        if not len(vertices): continue
        bounds[0] = min(bounds[0], float(vertices[:,0].min()))
        bounds[1] = min(bounds[1], float(vertices[:,1].min()))
        bounds[2] = max(bounds[2], float(vertices[:,0].max()))
        bounds[3] = max(bounds[3], float(vertices[:,1].max()))
        jpg = name[:-4] + '_0.jpg'
        if jpg in archive.namelist():
            img = Image.open(io.BytesIO(archive.read(jpg))).convert('RGB')
            img=img.resize((cell_size,cell_size), Image.Resampling.LANCZOS)
            x = (slot % columns)*cell_size
            y = (slot // columns)*cell_size
            atlas.paste(img, (x,y))
        for face in textured:
            base = len(positions)
            for vi,ti in face:
                vx,vy,vz = vertices[vi]
                positions.append((vx-ORIGIN[0],vz,-(vy-ORIGIN[1])))
                u,v = uvs[ti] if len(uvs) else (0,0)
                uv_out.append(((slot%columns+u)/columns, 1-(slot//columns+1-v)/columns))
            faces.append((base,base+1,base+2))
        for face in plain:
            base = len(plain_positions)
            for vi,_ in face:
                vx,vy,vz = vertices[vi]
                plain_positions.append((vx-ORIGIN[0],vz,-(vy-ORIGIN[1])))
            plain_faces.append((base,base+1,base+2))
    if not positions: return None
    scene = trimesh.Scene()
    mesh = trimesh.Trimesh(vertices=np.asarray(positions), faces=np.asarray(faces), process=False)
    mesh.visual = TextureVisuals(uv=np.asarray(uv_out), material=PBRMaterial(baseColorFactor=[255,255,255,255],baseColorTexture=atlas,roughnessFactor=1.0,metallicFactor=0.0))
    scene.add_geometry(mesh)
    if plain_positions:
        plain_mesh = trimesh.Trimesh(vertices=np.asarray(plain_positions), faces=np.asarray(plain_faces), process=False)
        plain_mesh.visual.vertex_colors = [112, 115, 112, 255]
        scene.add_geometry(plain_mesh)
    out = OUT / f'{folder}-l{level}.glb'
    scene.export(out)
    print(folder, level, len(faces), f'{out.stat().st_size/1e6:.1f} MB', flush=True)
    return {'file':out.name,'bounds':bounds,'x':(bounds[0]+bounds[2])/2-ORIGIN[0], 'z':-((bounds[1]+bounds[3])/2-ORIGIN[1]), 'level':level}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    z = zipfile.ZipFile(RemoteZip())
    folders = sorted({n.split('/')[0] for n in z.namelist() if re.match(r'67[23]49[67][a-d][1-4]/',n)})
    manifest=[]
    for folder in folders:
        p=next((n for n in z.namelist() if n.startswith(folder+'/') and n.endswith('_L16_000.obj')),None)
        if not p: continue
        b=bounds_from_obj(z.read(p))
        if b[2]<5950 or b[0]>8050 or b[3]<3950 or b[1]>6050: continue
        print('BASE',folder, [round(v) for v in b],flush=True)
        base=build_tile(z,folder,16)
        if not base: continue
        center_dist=((base['x'])**2+(base['z'])**2)**.5
        # Detailed 1 km district around the Cathedral, Senate Square and Market Square.
        if center_dist < 720:
            detailed=build_tile(z,folder,18)
            if detailed: base['detail']=detailed['file']
        manifest.append(base)
    (OUT/'manifest.json').write_text(json.dumps({'origin':'Helsinki Cathedral','source':URL,'license':'CC BY 4.0','tiles':manifest},indent=2))
    print('DONE',len(manifest),'tiles',flush=True)

if __name__=='__main__': main()
