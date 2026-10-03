#!/usr/bin/env python3
"""Fetch a denser playable Lyon corridor, then pack it as append-only ZIP parts.

Run select, fetch_lyon_expansion.mjs, then pack. The original two ZIPs remain
unchanged; the extra parts are required by the new external pack manifest.
"""

import argparse
import json
import math
import posixpath
import urllib.request
from pathlib import Path
from zipfile import ZIP_STORED, ZipFile

SOURCE = Path('.cache/lyon-photomesh')
OUTPUT = Path('release-assets/maps/lyon')
LIST = Path('.cache/lyon-expansion-files.json')
REMOTE = 'https://data.grandlyon.com/files/grandlyon/2023/mesh/'
LON, LAT = 4.8320, 45.7578
MAX_PART_BYTES = 1_700_000_000


def near(node: dict, metres: float) -> bool:
    region = (node.get('boundingVolume') or {}).get('region')
    if not region:
        return False
    west, south, east, north = region[:4]
    x1, x2 = (west * 180 / math.pi - LON) * 77400, (east * 180 / math.pi - LON) * 77400
    y1, y2 = (south * 180 / math.pi - LAT) * 111000, (north * 180 / math.pi - LAT) * 111000
    return max(x1, 0, -x2) ** 2 + max(y1, 0, -y2) ** 2 <= metres ** 2


def existing_pack_files() -> set[str]:
    names = set()
    for part in sorted(OUTPUT.glob('lyon-map-part-*.zip')):
        with ZipFile(part) as archive:
            names.update(archive.namelist())
    return names


def walk_tileset(name: str, document: dict, selection: set[str], existing: set[str], radius_by_depth: dict[int, int]):
    stack = [(document['root'], 0)]
    while stack:
        node, depth = stack.pop()
        radius = radius_by_depth.get(depth)
        if radius is None or not near(node, radius):
            continue
        content = node.get('content') or {}
        uri = content.get('uri') or content.get('url')
        if uri:
            target = posixpath.normpath(posixpath.join(posixpath.dirname(name), uri))
            if target not in existing:
                selection.add(target)
        stack.extend((child, depth + 1) for child in node.get('children', []))


def select():
    existing = existing_pack_files()
    selected = set()
    pyramid = json.loads((SOURCE / 'pyramid/tileset.json').read_text())
    # Complete the medium-detail photomesh over a 2 km flight radius.
    walk_tileset('pyramid/tileset.json', pyramid, selected, existing, {depth: 2000 for depth in range(9)} | {9: 500})
    # The central pyramid points at external tilesets. Include nearby roots.
    for name in sorted(path for path in selected if path.endswith('.json')):
        target = SOURCE / name
        if target.is_file():
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(REMOTE + name, timeout=30) as response:
            target.write_bytes(response.read())
    for file in SOURCE.glob('Tile-*/tileset.json'):
        name = file.relative_to(SOURCE).as_posix()
        if name not in existing and name not in selected:
            continue
        document = json.loads(file.read_text())
        # Lower-depth building tiles fill the ground over the central kilometre;
        # finer tiles focus on the launch neighbourhood.
        walk_tileset(name, document, selected, existing, {0: 1000, 1: 1000, 2: 300, 3: 100})
    selected -= existing
    LIST.parent.mkdir(parents=True, exist_ok=True)
    LIST.write_text(json.dumps(sorted(selected), indent=2) + '\n')
    print(f'Selected {len(selected)} missing tiles into {LIST}')
    print(f'JSON: {sum(name.endswith(".json") for name in selected)}, mesh: {sum(name.endswith(".b3dm") for name in selected)}')


def pack():
    selected = json.loads(LIST.read_text())
    missing = [name for name in selected if not (SOURCE / name).is_file()]
    if missing:
        raise SystemExit(f'{len(missing)} selected tiles have not been fetched: {missing[:3]}')
    # Extra parts can be selected beside the original two. Never rewrite the
    # multi-gigabyte base archives just to extend the playable area.
    for old in OUTPUT.glob('lyon-map-part-0[3-9].zip'):
        old.unlink()
    base = ['lyon-map-part-01.zip', 'lyon-map-part-02.zip']
    parts = []
    current = None
    part_bytes = 0
    try:
        for name in sorted(selected):
            size = (SOURCE / name).stat().st_size
            if current is None or (part_bytes and part_bytes + size > MAX_PART_BYTES):
                if current:
                    current.close()
                filename = f'lyon-map-part-{len(base) + len(parts) + 1:02d}.zip'
                current = ZipFile(OUTPUT / filename, 'w', compression=ZIP_STORED, allowZip64=True)
                parts.append(filename)
                part_bytes = 0
            current.write(SOURCE / name, name)
            part_bytes += size
    finally:
        if current:
            current.close()
    manifest = {'map': 'lyon', 'format': 1, 'coverage': 'visited-cache-snapshot',
                'parts': base + parts, 'files': 2619 + len(selected),
                'detail': 'expanded central flight corridor'}
    with ZipFile(OUTPUT / parts[0], 'a', compression=ZIP_STORED, allowZip64=True) as archive:
        archive.writestr('skyfall-map-v2.json', json.dumps(manifest, separators=(',', ':')))
    (OUTPUT / 'lyon-map-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    for filename in parts:
        print(filename, f'{(OUTPUT / filename).stat().st_size / 1048576:.0f} MiB')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['select', 'pack'])
    args = parser.parse_args()
    (select if args.command == 'select' else pack)()
