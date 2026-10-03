#!/usr/bin/env python3
"""Package the already converted Lyon cache into GitHub Release sized ZIP parts.

The cache is a visited-area snapshot, not the complete metro. Use this for local
testing; publish only packs built from a verified complete tile tree.
"""

import argparse
import json
import posixpath
from pathlib import Path
from zipfile import ZIP_STORED, ZipFile

MAX_PART_BYTES = 1_700_000_000


def missing_references(source: Path) -> set[str]:
    pending = ["tileset.json"]
    visited = set()
    missing = set()
    while pending:
        tileset = pending.pop()
        if tileset in visited:
            continue
        visited.add(tileset)
        file = source / tileset
        if not file.is_file():
            missing.add(tileset)
            continue
        data = json.loads(file.read_text())
        nodes = [data.get("root", {})]
        while nodes:
            node = nodes.pop()
            nodes.extend(node.get("children", []))
            contents = node.get("contents", [])
            if node.get("content"):
                contents = [node["content"], *contents]
            for content in contents:
                uri = content.get("uri") or content.get("url")
                if not uri:
                    continue
                relative = posixpath.normpath(posixpath.join(posixpath.dirname(tileset), uri))
                if relative.startswith("../") or relative.startswith("/"):
                    raise ValueError(f"Tile path escapes the pack: {relative}")
                if relative.endswith(".json"):
                    pending.append(relative)
                elif not (source / relative).is_file():
                    missing.add(relative)
    return missing


def build(source: Path, output: Path, max_bytes: int = MAX_PART_BYTES, require_complete: bool = False) -> list[Path]:
    if not (source / "tileset.json").is_file() or not (source / "pyramid/tileset.json").is_file():
        raise SystemExit(f"No converted Lyon tile tree at {source}")
    if require_complete:
        missing = missing_references(source)
        if missing:
            examples = ", ".join(sorted(missing)[:5])
            raise SystemExit(f"Map is incomplete: {len(missing)} referenced tiles missing. Examples: {examples}")
    files = sorted(path for path in source.rglob("*") if path.is_file() and path.suffix in {".json", ".b3dm"})
    output.mkdir(parents=True, exist_ok=True)
    parts = []
    archive = None
    part_bytes = 0
    try:
        for path in files:
            size = path.stat().st_size
            if archive is None or (part_bytes + size > max_bytes and part_bytes):
                if archive:
                    archive.close()
                part = output / f"lyon-map-part-{len(parts) + 1:02d}.zip"
                archive = ZipFile(part, "w", compression=ZIP_STORED, allowZip64=True)
                parts.append(part)
                part_bytes = 0
            archive.write(path, path.relative_to(source).as_posix())
            part_bytes += size
    finally:
        if archive:
            archive.close()
    manifest = {"map": "lyon", "format": 1, "coverage": "complete" if require_complete else "visited-cache-snapshot", "parts": [part.name for part in parts], "files": len(files)}
    with ZipFile(parts[0], "a", compression=ZIP_STORED, allowZip64=True) as archive:
        archive.writestr("skyfall-map.json", json.dumps(manifest, separators=(",", ":")))
    (output / "lyon-map-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return parts


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path(".cache/lyon-photomesh"))
    parser.add_argument("--output", type=Path, default=Path("release-assets/maps/lyon"))
    parser.add_argument("--max-part-bytes", type=int, default=MAX_PART_BYTES)
    parser.add_argument("--require-complete", action="store_true", help="verify all referenced tiles before building a release pack")
    args = parser.parse_args()
    for pack in build(args.source, args.output, args.max_part_bytes, args.require_complete):
        print(f"{pack}: {pack.stat().st_size / 1024**3:.2f} GiB")
