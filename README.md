# Skyfall Protocol

A playable WebGPU fighter jet prototype over central Helsinki. Fly one story mission or explore in free flight. Four bundled modern aircraft models have distinct flight tuning and animated ailerons, elevators, and rudders. The city is a locally bundled photogrammetric mesh of real streets, buildings, waterfront, and landmarks including Helsinki Cathedral, Senate Square, and Market Square. An 8 × 10 km low detail mesh loads before flight. All 192 cells in the 2 × 6 km flight corridor also have sharp 250 m meshes. The game preloads a 2 km radius around the free flight start and keeps level 18 meshes within 2 km of the jet, medium meshes out to 3 km, and the broader overview beyond. A 12-cell central pilot area adds level 21 geometry and textures within 220 m of the jet below 350 m altitude. Moving sedans, hatchbacks, SUVs, and vans follow locally bundled OpenStreetMap street routes.

## Run

```sh
bun install
bun run dev
```

Open the local URL printed by Vite in a current Chrome or Edge build with WebGPU and hardware acceleration. Build with `bun run build` and serve `dist/` over HTTP. The game is WebGPU only. No API key, company account, or billing project is required. The 3D city assets are bundled locally. The broad city loads at launch; sharper cells load by distance and altitude.

The menu also links to a **Lyon 2023 photomesh flight trial** at `/lyon.html`. It streams the Métropole de Lyon's public 3D Tiles through the local Vite server, which converts their older glTF 1.0 payloads for Three's WebGPU renderer and keeps a small in-memory tile cache. Run this mode with `bun run dev` or `bun run build && bun run preview`; a plain static file server cannot provide the tile conversion. Lyon uses progressive screen-space detail, starts at a slower inspection speed, and has no mission or traffic yet. It needs an internet connection to the public Lyon dataset, but no key or billing. See [docs/city-source-trials.md](docs/city-source-trials.md).

## Mission

**Break the Silence:** A rogue defense network is jamming the Helsinki harbor evacuation corridor. Destroy Relay Alpha and Relay Bravo, shoot down the hostile interceptors, and fly through the green extraction gate. Hold a target near the reticle for about 1.35 seconds to lock a missile.

## Controls

| Input | Action |
| --- | --- |
| W / S or ↑ / ↓ | Nose down / up |
| A / D | Roll left / right; hold for a full roll |
| Q / E or ← / → | Yaw left / right |
| Shift / Ctrl | Increase / decrease throttle |
| Mouse movement after clicking the game | Pitch and bank (returns to center) |
| Space / left click | Cannon |
| F / right click | Guided missile (requires lock) |
| G | Toggle air brake |
| C | Cycle chase, cockpit, and cinematic cameras |
| M | Mute / unmute |
| P / Esc / bottom HUD button | Pause and show all controls |

Free flight starts at about 55 m/s (106 knots) in the F-22. Full throttle engages the fast combat range; press G for the air brake. Bank with A or D, then hold S to turn in that direction. Pitch is limited to 75°, while roll can continue through a full 360°; combined pitch, roll, and yaw input is normalized. Yaw turns more slowly than pitch or roll. The left and right ailerons deflect in opposite directions for roll; both elevators follow pitch; the tail rudders follow yaw. Gamepad: left stick pitch/bank, shoulders yaw, triggers throttle, A cannon, B missile.

## Data and assets

The city mesh is the City of Helsinki's [2017 reality mesh](https://www.hel.fi/en/decision-making/information-on-helsinki/maps-and-geospatial-data/helsinki-3d), licensed CC BY 4.0. Its public OBJ archive is downloaded by HTTP range by `scripts/build_helsinki_mesh.py` and converted to local GLB cells; the game makes no request to that archive. Road geometry comes from [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL, converted by `scripts/build_helsinki_traffic.py` to bundled traffic routes. The source XML must be downloaded to `/tmp/helsinki-osm.xml` as documented in that script. The overview mesh covers 8 × 10 km around the Cathedral. All 192 corridor cells have medium and level 18 meshes. The level 21 pilot covers 12 cells along the central flight pass; outside those cells the game stays at level 18 near the jet. The outer ring stays coarse near the ground, and outside the overview the world is simplified water. The source photogrammetry itself has blurry facades and rough edges at very low altitude; the denser level 21 mesh cannot add detail absent from the aerial capture. To regenerate the meshes, install `scripts/requirements.txt`, then run `build_helsinki_mesh.py`, `build_helsinki_overview.py`, `build_helsinki_corridor.py`, `extend_helsinki_detail.py`, and `extend_helsinki_ultra.py` from the project root in that order. The bundled assets are ready to run after cloning. The flight model remains arcade tuned and city building collisions are not yet modeled.

The F-22, F-35, Su-57, and Su-35 use off-the-shelf textured models. Their sources and noncommercial licenses are in [public/models/ATTRIBUTION.md](public/models/ATTRIBUTION.md). The sky and HDR lighting are adapted from Poly Haven's [Kloppenheim 05 (Pure Sky)](https://polyhaven.com/a/kloppenheim_05_puresky), CC0.

The newer Aalto University Kalasatama scan has been assessed separately in [docs/kalasatama-feasibility.md](docs/kalasatama-feasibility.md). It is not yet a playable city layer.

Afterburners use layered blue exhaust that pulses with throttle. Guided missiles have a visible motor, fins, and smoke trail. Impacts add a flash, shockwave, sparks, and smoke; audio effects are synthesized locally. Traffic cars can be locked and destroyed with missiles or the cannon in either flight mode. Hits remove the moving car and leave a briefly burning, smoking wreck. Restarting a flight restores traffic.
