"""Bundle sharp 2024 NYC orthophotos for the central Manhattan flight corridor.

The eight 2 km cells match scripts/split_city.py. Source imagery is © City of
New York, CC BY 4.0: https://gis.nyc.gov/tiles/
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
import math
from pathlib import Path
from urllib.request import Request, urlopen

import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parents[1] / 'public/assets/city/ortho'
LAT, LON = 40.752, -73.985
ZOOM = 17
CELL = 2000
DEG_LAT = 111132.92 - 559.82 * math.cos(2 * math.radians(LAT))
DEG_LON = 111412.84 * math.cos(math.radians(LAT)) - 93.5 * math.cos(3 * math.radians(LAT))
BASE = 'https://tiles.arcgis.com/tiles/yG5s3afENB5iO9fj/arcgis/rest/services/NYC_Orthos_2024/MapServer/tile'


def tile_coord(x, z):
    lon = LON + x / DEG_LON
    lat = LAT - z / DEG_LAT
    return (lon + 180) / 360 * 2**ZOOM, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * 2**ZOOM


def fetch_tile(x, y):
    url = f'{BASE}/{ZOOM}/{y}/{x}'
    for attempt in range(3):
        try:
            data = urlopen(Request(url, headers={'User-Agent': 'SkyfallProtocol/0.4 (NYC CC-BY imagery)'}), timeout=30).read()
            return x, y, Image.open(BytesIO(data)).convert('RGB')
        except Exception:
            if attempt == 2:
                raise


def main():
    left, top = tile_coord(-CELL, -2 * CELL)
    right, bottom = tile_coord(CELL, 2 * CELL)
    ix0, iy0, ix1, iy1 = math.floor(left), math.floor(top), math.ceil(right), math.ceil(bottom)
    mosaic = Image.new('RGB', ((ix1 - ix0 + 1) * 256, (iy1 - iy0 + 1) * 256), (255, 255, 255))
    pairs = [(x, y) for y in range(iy0, iy1 + 1) for x in range(ix0, ix1 + 1)]
    print(f'Fetching {len(pairs)} NYC aerial tiles', flush=True)
    with ThreadPoolExecutor(max_workers=16) as pool:
        futures = [pool.submit(fetch_tile, x, y) for x, y in pairs]
        for number, future in enumerate(as_completed(futures), 1):
            x, y, image = future.result()
            mosaic.paste(image, ((x - ix0) * 256, (y - iy0) * 256))
            if number % 100 == 0:
                print(f'{number}/{len(pairs)} tiles', flush=True)
    OUT.mkdir(parents=True, exist_ok=True)
    for iz in range(-2, 2):
        for ix in range(-1, 1):
            a, b = tile_coord(ix * CELL, iz * CELL)
            c, d = tile_coord((ix + 1) * CELL, (iz + 1) * CELL)
            box = ((a - ix0) * 256, (b - iy0) * 256, (c - ix0) * 256, (d - iy0) * 256)
            image = mosaic.crop(tuple(round(n) for n in box)).resize((2048, 2048), Image.Resampling.LANCZOS)
            pixels = np.asarray(image).copy()
            alpha = np.where(np.all(pixels > 246, axis=2), 0, 255).astype(np.uint8)
            rgba = np.dstack((pixels, alpha))
            target = OUT / f'{ix}_{iz}.webp'
            Image.fromarray(rgba, 'RGBA').save(target, 'WEBP', quality=88, method=4)
            print(target.name, f'{target.stat().st_size / 1_000_000:.2f} MB', flush=True)


if __name__ == '__main__':
    main()
