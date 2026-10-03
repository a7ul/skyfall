# City photomesh trials

## Lyon — playable trial

- Source: [Métropole de Lyon 2023 photomaillage](https://www.data.gouv.fr/datasets/photomaillage-3d-de-la-metropole-de-lyon), [public 3D Tiles root](https://data.grandlyon.com/files/grandlyon/2023/mesh/tileset.json).
- License: Licence Ouverte / Open Licence 2.0. The 5.5 cm figure is the aerial source pixel size, not a guaranteed facade texture resolution.
- `/lyon.html` runs on WebGPU and flies over the live tiled mesh near central Lyon. The tile tree selects finer content as it approaches the camera. The prototype uses its normal screen-space error logic, so it does not yet guarantee maximum detail for every tile within a fixed 2 km radius.
- The public server has no browser CORS header and its b3dm files embed glTF 1.0 with `CESIUM_RTC` coordinates. `vite.config.js` fetches tiles through the local server, converts each requested glTF to version 2, and preserves the geographic origin in the b3dm feature table. It keeps up to 96 recent responses in memory and writes no copy of Lyon to disk.
- This is a flight and image-quality trial. Helsinki still holds the story mission, weapons, traffic, and locally bundled terrain. Lyon currently needs a running Vite server and internet access.

## Melbourne — evaluated, not downloaded

The [City of Melbourne 2018 photomesh](https://data.melbourne.vic.gov.au/explore/dataset/city-of-melbourne-3d-textured-mesh-photomesh-2018/) covers the municipality in OBJ/MTL/JPG tiles at levels L13–L20. Its published capture pixel size is 7.5 cm and the full download is 9.7 GB. It is not published as an immediately streamable 3D Tiles endpoint on that page. I did not download it because the local project has limited free disk space and Lyon is newer and streams without copying the city to disk. Melbourne remains a source option if a selective tile converter is worth building later.

## Kalasatama — source assessment

The [Aalto University Kalasatama dataset](https://zenodo.org/records/7599228) is a much larger 2023 OBJ and texture archive. A small extraction did not give a representative flyable city block, so no pilot layer was added. The temporary OBJ stream and parse files were deleted after that test. The earlier [texture preview](kalasatama-texture-preview.jpg) is only a UV sheet.
