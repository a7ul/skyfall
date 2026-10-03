"""Build a continuous 8 x 10 km low-detail Helsinki reality mesh.

Source: City of Helsinki 2017 OBJ photogrammetry, CC BY 4.0.
Only the L14 members are read from the public ZIP archives by HTTP range.
No API key is used.
"""
import io
import json
import re
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
import trimesh
from PIL import Image
from trimesh.visual.material import PBRMaterial
from trimesh.visual.texture import TextureVisuals

from build_helsinki_mesh import RemoteZip, parse_obj, ORIGIN

ROOT = 'https://3d.hel.ninja/data/mesh/Helsinki3D-MESH_2017_OBJ_2km-250m_ZIP/'
OUT = Path('public/assets/helsinki')
CORE = ['670494','670496','670498','672494','672496','672498','674494','674496','674498']
OUTER = ['670492','672492','674492','676492','676494','676496','676498','678492','678494','678496','678498']
ARCHIVES = CORE + OUTER


def archive_sizes():
    html=urllib.request.urlopen(ROOT,timeout=20).read().decode()
    sizes={}
    for name in ARCHIVES:
        match=re.search(rf'Helsinki3D_2017_OBJ_{name}x2\.zip</a>[^\n]*?\s(\d+)\s*$',html,re.MULTILINE)
        if not match: raise ValueError(f'Missing public archive {name}')
        sizes[name]=int(match.group(1))
    return sizes


def build(name,size,level):
    filename=f'Helsinki3D_2017_OBJ_{name}x2.zip'
    url=ROOT+filename
    archive=zipfile.ZipFile(RemoteZip(url,size))
    suffix=f'_L14_0.obj' if level==14 else '_L13.obj'
    folders=sorted({item.filename.split('/')[0] for item in archive.infolist() if item.filename.endswith(suffix)})
    atlas=Image.new('RGB',(1024,1024),(82,105,110))
    positions=[];texcoords=[];faces=[];plain_positions=[];plain_faces=[]
    minx=miny=float('inf');maxx=maxy=float('-inf')
    for slot,folder in enumerate(folders):
        obj=next((n for n in archive.namelist() if n.startswith(folder+'/') and n.endswith(suffix)),None)
        if not obj:continue
        vertices,uvs,textured,plain=parse_obj(archive.read(obj))
        if not len(vertices):continue
        minx=min(minx,float(vertices[:,0].min()));maxx=max(maxx,float(vertices[:,0].max()))
        miny=min(miny,float(vertices[:,1].min()));maxy=max(maxy,float(vertices[:,1].max()))
        jpg=obj[:-4]+'_0.jpg'
        if jpg in archive.NameToInfo:
            image=Image.open(io.BytesIO(archive.read(jpg))).convert('RGB').resize((128,128),Image.Resampling.LANCZOS)
            atlas.paste(image,((slot%8)*128,(slot//8)*128))
        for face in textured:
            base=len(positions)
            for vi,ti in face:
                x,y,h=vertices[vi]
                positions.append((x-ORIGIN[0],h,-(y-ORIGIN[1])))
                u,v=uvs[ti] if len(uvs) else (0,0)
                texcoords.append(((slot%8+u)/8,1-(slot//8+1-v)/8))
            faces.append((base,base+1,base+2))
        for face in plain:
            base=len(plain_positions)
            for vi,_ in face:
                x,y,h=vertices[vi]
                plain_positions.append((x-ORIGIN[0],h,-(y-ORIGIN[1])))
            plain_faces.append((base,base+1,base+2))
    if not faces:return None
    scene=trimesh.Scene()
    mesh=trimesh.Trimesh(vertices=np.asarray(positions),faces=np.asarray(faces),process=False)
    mesh.visual=TextureVisuals(uv=np.asarray(texcoords),material=PBRMaterial(baseColorFactor=[255,255,255,255],baseColorTexture=atlas,roughnessFactor=1,metallicFactor=0))
    scene.add_geometry(mesh)
    if plain_faces:
        mesh=trimesh.Trimesh(vertices=np.asarray(plain_positions),faces=np.asarray(plain_faces),process=False)
        mesh.visual.vertex_colors=[112,115,112,255]
        scene.add_geometry(mesh)
    output=OUT/(f'overview-{name}.glb' if level==14 else f'overview-{name}-l13.glb')
    scene.export(output)
    print(name,len(folders),'cells',len(faces),'faces',round(output.stat().st_size/1e6,2),'MB',flush=True)
    return {'file':output.name,'x':(minx+maxx)/2-ORIGIN[0],'z':-((miny+maxy)/2-ORIGIN[1]),'bounds':[minx,miny,maxx,maxy]}


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    sizes=archive_sizes()
    overview=[]
    for name in ARCHIVES:
        level=14 if name in CORE else 13
        output=OUT/(f'overview-{name}.glb' if level==14 else f'overview-{name}-l13.glb')
        if output.exists() and name in CORE:
            # The existing core entries preserve their exact source bounds.
            manifest=json.loads((OUT/'manifest.json').read_text())
            overview.append(next(tile for tile in manifest['overview'] if tile['file']==output.name))
            print('REUSE',name,flush=True)
            continue
        result=build(name,sizes[name],level)
        if result:overview.append(result)
    manifest_path=OUT/'manifest.json'
    manifest=json.loads(manifest_path.read_text())
    manifest['overview']=overview
    manifest['coverageMeters']=[8000,10000]
    manifest_path.write_text(json.dumps(manifest,indent=2))
    print('DONE',len(overview),'2 km overview tiles',flush=True)

if __name__=='__main__':main()
