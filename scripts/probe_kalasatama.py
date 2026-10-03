"""Inspect Aalto's Kalasatama archive and preview one texture by HTTP range.

This does not download or install the 6 GB model in the game.
Source: https://zenodo.org/records/7599228 (CC BY 4.0).
"""
import io
import json
import urllib.request
import zipfile
from pathlib import Path

from PIL import Image

from build_helsinki_mesh import RemoteZip

RECORD = 'https://zenodo.org/api/records/7599228'
OUT = Path('docs/kalasatama-texture-preview.jpg')


def main():
    with urllib.request.urlopen(RECORD) as response:
        record = json.load(response)
    assert record['metadata']['license']['id'] == 'cc-by-4.0'
    file = record['files'][0]
    archive = zipfile.ZipFile(RemoteZip(file['links']['self'], file['size']))
    obj = next(info for info in archive.infolist() if info.filename.endswith('.obj'))
    textures = [info for info in archive.infolist() if info.filename.endswith('.png')]
    print(f'OBJ: {obj.file_size / 1e9:.2f} GB, {len(textures)} textures')
    sample = next(info for info in textures if 'u3_v3_diffuse' in info.filename)
    image = Image.open(io.BytesIO(archive.read(sample)))
    print(f'Sample texture: {image.width} × {image.height}')
    image.thumbnail((2048, 2048))
    OUT.parent.mkdir(exist_ok=True)
    image.convert('RGB').save(OUT, quality=88)
    print(OUT)


if __name__ == '__main__':
    main()
