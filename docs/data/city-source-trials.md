# Lyon city source

- Source: [Métropole de Lyon 2023 photomaillage](https://www.data.gouv.fr/datasets/photomaillage-3d-de-la-metropole-de-lyon), [public 3D Tiles root](https://data.grandlyon.com/files/grandlyon/2023/mesh/tileset.json).
- License: Licence Ouverte / Open Licence 2.0. The 5.5 cm figure is the aerial source pixel size, not a guaranteed facade texture resolution.
- The main game, including mission and free flight, renders the live tiled mesh near central Lyon. The tile tree chooses progressively finer content as the camera approaches. Screen-space error does not guarantee maximum detail for every tile within an exact 2 km radius.
- The public tile server has no browser CORS header and its b3dm files embed glTF 1.0 with `CESIUM_RTC` coordinates. `vite.config.js` fetches tiles through the local server, converts each requested glTF to version 2, and preserves the geographic origin in the b3dm feature table. It keeps up to 96 recent responses in memory and writes no copy of the mesh to disk.
- Lyon requires Vite and an internet connection to the public dataset. No company API key or billing project is used.
