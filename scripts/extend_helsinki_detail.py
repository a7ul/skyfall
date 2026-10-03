"""Add L18 photogrammetry along the central low-altitude flight corridor.

Uses the City of Helsinki's public CC BY 4.0 archive via HTTP ranges.
No account or API key is required.
"""
import json
import urllib.request
import zipfile
from pathlib import Path

from build_helsinki_mesh import RemoteZip, build_tile

OUT = Path('public/assets/helsinki')
ROOT = 'https://3d.hel.ninja/data/mesh/Helsinki3D-MESH_2017_OBJ_2km-250m_ZIP/'
ARCHIVES = {'672496', '674496'}


def main():
    manifest_path = OUT / 'manifest.json'
    manifest = json.loads(manifest_path.read_text())
    candidates = [tile for tile in manifest['tiles']
                  if not tile.get('detail') and abs(tile['x']) < 520
                  and -2600 < tile['z'] < 800]
    candidates.sort(key=lambda tile: tile['z'], reverse=True)
    archives = {}
    for index, tile in enumerate(candidates, 1):
        folder = tile['file'].split('-')[0]
        archive_key = str(int(folder[:3]) // 2 * 2) + '496'
        if archive_key not in archives:
            if archive_key not in ARCHIVES:
                raise ValueError(f'Unexpected Helsinki archive {archive_key}')
            url = ROOT + f'Helsinki3D_2017_OBJ_{archive_key}x2.zip'
            size = int(urllib.request.urlopen(urllib.request.Request(url, method='HEAD')).headers['Content-Length'])
            archives[archive_key] = zipfile.ZipFile(RemoteZip(url, size))
        output = OUT / f'{folder}-l18.glb'
        if not output.exists():
            result = build_tile(archives[archive_key], folder, 18)
            if not result:
                print('SKIP', folder, flush=True)
                continue
        tile['detail'] = output.name
        manifest_path.write_text(json.dumps(manifest, indent=2))
        print('PROGRESS', index, '/', len(candidates), flush=True)


if __name__ == '__main__':
    main()
