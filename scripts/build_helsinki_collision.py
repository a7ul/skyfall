"""Rasterize the bundled Helsinki mesh into a compact city collision height field.

Run from the repository root after building the level 16 mesh cells. This is a
gameplay proxy, not a new terrain source: each sample takes the highest upward
facing surface in the same photomesh that the player sees.
"""

import json
from pathlib import Path

import numpy as np
import trimesh


ROOT = Path(__file__).resolve().parents[1] / "public/assets/helsinki"
MANIFEST = json.loads((ROOT / "manifest.json").read_text())
STEP = 5.0
tiles = MANIFEST["tiles"]
xmin = min(t["x"] - 125 for t in tiles)
xmax = max(t["x"] + 125 for t in tiles)
zmin = min(t["z"] - 125 for t in tiles)
zmax = max(t["z"] + 125 for t in tiles)
width = int(np.ceil((xmax - xmin) / STEP)) + 1
depth = int(np.ceil((zmax - zmin) / STEP)) + 1
heights = np.full((depth, width), -32768, dtype=np.int16)

for tile_index, tile in enumerate(tiles, 1):
    mesh = trimesh.load(ROOT / tile["file"], force="mesh")
    verts = np.asarray(mesh.vertices, dtype=np.float64)
    for face in np.asarray(mesh.faces):
        a, b, c = verts[face]
        ax, az = a[0], a[2]
        bx, bz = b[0], b[2]
        cx, cz = c[0], c[2]
        area = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
        if abs(area) < 0.01:
            continue
        normal = np.cross(b - a, c - a)
        if abs(normal[1]) / max(np.linalg.norm(normal), 1e-6) < 0.28:
            continue
        ix0 = max(0, int(np.floor((min(ax, bx, cx) - xmin) / STEP)))
        ix1 = min(width - 1, int(np.ceil((max(ax, bx, cx) - xmin) / STEP)))
        iz0 = max(0, int(np.floor((min(az, bz, cz) - zmin) / STEP)))
        iz1 = min(depth - 1, int(np.ceil((max(az, bz, cz) - zmin) / STEP)))
        if ix0 > ix1 or iz0 > iz1:
            continue
        xs = xmin + np.arange(ix0, ix1 + 1) * STEP
        zs = zmin + np.arange(iz0, iz1 + 1) * STEP
        xx, zz = np.meshgrid(xs, zs)
        u = ((bz - cz) * (xx - cx) + (cx - bx) * (zz - cz)) / area
        v = ((cz - az) * (xx - cx) + (ax - cx) * (zz - cz)) / area
        mask = (u >= -0.001) & (v >= -0.001) & (u + v <= 1.001)
        if not mask.any():
            continue
        y = u * a[1] + v * b[1] + (1 - u - v) * c[1]
        values = np.clip(np.rint(y * 10), -32767, 32767).astype(np.int16)
        patch = heights[iz0 : iz1 + 1, ix0 : ix1 + 1]
        np.maximum(patch, np.where(mask, values, -32768), out=patch)
    if tile_index % 24 == 0:
        print(f"Rasterized {tile_index} / {len(tiles)} cells", flush=True)

(ROOT / "collision.bin").write_bytes(heights.tobytes())
(ROOT / "collision.json").write_text(json.dumps({
    "x": xmin, "z": zmin, "step": STEP, "width": width, "depth": depth,
    "valid": int(np.count_nonzero(heights != -32768)),
}, separators=(",", ":")))
print(f"Wrote {width} × {depth} height field; {np.count_nonzero(heights != -32768)} valid samples")
