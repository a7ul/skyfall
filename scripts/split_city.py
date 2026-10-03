"""Split the bundled NYC building extract into flight-streamed 2 km cells."""

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'public/assets/new-york-buildings.json'
OUT = ROOT / 'public/assets/city'
CELL_SIZE = 2000


def main():
    features = json.loads(SOURCE.read_text())['features']
    cells = {}
    for feature in features:
        points = feature['points']
        x = sum(point[0] for point in points) / len(points)
        z = sum(point[1] for point in points) / len(points)
        ix, iz = math.floor(x / CELL_SIZE), math.floor(z / CELL_SIZE)
        cells.setdefault((ix, iz), []).append(feature)
    OUT.mkdir(exist_ok=True)
    for old in OUT.glob('*.json'):
        old.unlink()
    manifest = []
    for (ix, iz), buildings in sorted(cells.items()):
        filename = f'{ix}_{iz}.json'
        (OUT / filename).write_text(json.dumps({'features': buildings}, separators=(',', ':')))
        cell = {'x': (ix + .5) * CELL_SIZE, 'z': (iz + .5) * CELL_SIZE, 'file': filename, 'count': len(buildings)}
        if (OUT / 'ortho' / f'{ix}_{iz}.webp').exists():
            cell['ortho'] = f'{ix}_{iz}.webp'
        manifest.append(cell)
    (OUT / 'manifest.json').write_text(json.dumps({'cellSize': CELL_SIZE, 'cells': manifest}, separators=(',', ':')))
    print(f'{len(features)} buildings in {len(cells)} cells')


if __name__ == '__main__':
    main()
