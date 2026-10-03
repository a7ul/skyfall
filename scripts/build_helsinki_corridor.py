"""Build medium detail cells north of the Cathedral, along the default flight path.

Source: City of Helsinki 2017 OBJ photogrammetry, CC BY 4.0.
The public archive is read by HTTP range and requires no API key.
"""
import json
import urllib.request
import zipfile
from pathlib import Path

from build_helsinki_mesh import RemoteZip, build_tile

ROOT='https://3d.hel.ninja/data/mesh/Helsinki3D-MESH_2017_OBJ_2km-250m_ZIP/'
OUT=Path('public/assets/helsinki')
ARCHIVES={'674496':2172340919,'676496':2389899783}


def merge_manifest(entries):
    path=OUT/'manifest.json'
    manifest=json.loads(path.read_text())
    by_file={tile['file']:tile for tile in manifest['tiles']}
    by_file.update({tile['file']:tile for tile in entries})
    manifest['tiles']=list(by_file.values())
    path.write_text(json.dumps(manifest,indent=2))


def main():
    entries=[]
    for name,size in ARCHIVES.items():
        url=ROOT+f'Helsinki3D_2017_OBJ_{name}x2.zip'
        archive=zipfile.ZipFile(RemoteZip(url,size))
        folders=sorted({item.filename.split('/')[0] for item in archive.infolist() if item.filename.endswith('_L16_000.obj')})
        for folder in folders:
            result=build_tile(archive,folder,16)
            if result:entries.append(result)
        print('ARCHIVE DONE',name,len(folders),flush=True)
    (OUT/'corridor.json').write_text(json.dumps(entries,indent=2))
    merge_manifest(entries)
    print('DONE',len(entries),'corridor cells',flush=True)

if __name__=='__main__':main()
