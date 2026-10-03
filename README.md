# Skyfall Protocol

A playable WebGPU fighter jet prototype over **Lyon**. The main menu launches one story mission or free flight in the same city. The 2023 Métropole de Lyon photomesh streams progressively as 3D Tiles. Four textured fighter models have distinct flight tuning and moving ailerons, elevators, and rudders. Local OpenStreetMap road routes drive destructible traffic.

## Run

```sh
bun install
bun run dev
```

Open the URL printed by Vite in a current Chrome or Edge build with WebGPU and GPU acceleration. For a production preview using live Lyon tiles, run `bun run build && bun run preview`. Vite proxies the public tiles and converts their legacy glTF 1.0 payloads to glTF 2.0, with a small memory cache. No API key, company account, or billing project is needed.

## GitHub Pages readiness

The deployment workflow in `.github/workflows/deploy-pages.yml` stays skipped while this repository is private. GitHub Free does not support Pages for a private repository; GitHub's API currently rejects enabling it for this repo. When the repo is eligible, select **Settings → Pages → Build and deployment → GitHub Actions**, then run the workflow manually or push to `main`. The expected URL is `https://a7ul.github.io/skyfall/`. Pages sites are public, including sites built from private repositories on plans that support them.

The fighter `.glb` models and HDR sky use Git LFS. Install Git LFS before cloning or run `git lfs pull` after cloning; the Pages workflow pulls and checks these files before building. Old, unused Helsinki photomesh and orthophotos were removed from Git history so normal clones do not download them. The Lyon tile pack is generated for deployment and is never checked into Git or LFS.

For a local Pages build, run:

```sh
VITE_BASE_PATH=/skyfall/ bun run build:pages
```

This downloads and preconverts an approximately 810 MiB Lyon tile pack into `dist/lyon-photomesh/`. The generated files stay out of git. The pack covers a broad lower-detail city area, gives finer detail within roughly 2 km of the starting center, and reserves the finest tiles for a smaller core. The full 2 km radius at maximum source detail cannot fit within GitHub Pages' 1 GB published-site limit. A static server needs this preconverted pack because Lyon's upstream tile server does not allow direct cross-origin browser requests. The build checks tile references and site size before upload.

## Project layout

| Folder | Purpose |
| --- | --- |
| `src/app/` | Game loop, UI wiring, and styles |
| `src/gameplay/aircraft/` | Jet models and moving control surfaces |
| `src/gameplay/flight/` | Input mapping and flight dynamics |
| `src/gameplay/combat/` | Weapons, targeting, and destruction rules |
| `src/world/lyon/` | City streaming, buildings, collision, tiles, and traffic |
| `src/mission/` | Mission objects and enemy aircraft setup |
| `src/audio/` | Sound playback |
| `public/assets/` | Aircraft, audio, Lyon data, and environment assets |
| `tests/` | Tests grouped to match the source areas |
| `tools/vite/` | Lyon tile conversion middleware |
| `tools/lyon/` | Static Lyon tile pack builder for Pages |
| `scripts/data/`, `docs/` | Data generation, design notes, and screenshots |

The tile streamer gives nearby, low-altitude blocks a finer screen-space target, reduces distant detail, and preloads a small area ahead of the aircraft. Launch waits for an initial batch of city tiles (with a time limit on slow connections). Concurrent parsing is limited to avoid main-thread pauses. A device-sized tile cache and gradual frame-time adjustment keep detail from overwhelming memory on slower machines. Converted tiles are browser-cached for a day, so revisiting an area avoids another download and conversion. Add `?debug=1` in a development build to expose hidden tile and frame metrics for profiling.

## Mission

**Break the Silence:** A rogue defense network is jamming the evacuation route through Lyon. Destroy Relay Alpha and Relay Bravo, shoot down the hostile interceptors, and fly through the green extraction gate. Hold a target near the reticle for about 1.35 seconds to guide a missile; missiles also launch straight ahead without a lock. Free flight has 99 missiles and gravity bombs, plus unlimited nuclear bombs. The mission has one nuclear bomb.

## Controls

| Input | Action |
| --- | --- |
| W / S or ↑ / ↓ | Nose down / up |
| A / D | Roll left / right; hold for a full roll |
| Q / E or ← / → | Yaw left / right |
| Shift / Ctrl | Increase / decrease throttle |
| Mouse movement after clicking the game | Pitch and bank (returns to center) |
| Space / left click | Cannon |
| F / right click | Missile; guided with a lock, straight flight without one |
| B | Drop a gravity bomb; the amber marker predicts its impact |
| N | Drop a nuclear bomb; it arms for 4.5 seconds after landing |
| G | Toggle air brake |
| C | Cycle chase, cockpit, and cinematic cameras |
| M | Mute / unmute |
| P / Esc / bottom HUD button | Pause and show all controls |

Free flight starts at about 55 m/s (106 knots) in the F-22. Bank with A or D, then hold S to turn. Holding A or D completes a full roll, and holding S completes a loop. Pitch, roll, and yaw stay separate in the aircraft's local frame, including inverted flight. Climbing and hard turns spend speed; diving restores it. The air brake slows the jet and improves turn authority. Gamepad: left stick pitch/bank, shoulders yaw, triggers throttle, A cannon, B missile, X bomb, Y nuclear.

## Data and assets

The city is the [Métropole de Lyon 2023 photomesh](https://www.data.gouv.fr/datasets/photomaillage-3d-de-la-metropole-de-lyon), Licence Ouverte / Open Licence 2.0. Its public 3D Tiles stream on demand and are not bundled in this repository. The published 5.5 cm figure describes the source aerial imagery, not guaranteed facade texture sharpness. See [Lyon source notes](docs/data/city-source-trials.md).

Road routes, individual building footprints, and an approximate 5 m building collision grid are generated from [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL, and bundled under `public/assets/city/lyon/`. To regenerate them, fetch the four OSM map squares documented in `scripts/data/build_lyon_gameplay.py`, then run that script. The grid uses OSM building footprints and tagged or estimated heights. Its building tops can differ from the photomesh, and bridges or overhangs are approximate.

The F-22, F-35, Su-57, and Su-35 use off-the-shelf textured models. Their sources and noncommercial licenses are in [public/assets/aircraft/ATTRIBUTION.md](public/assets/aircraft/ATTRIBUTION.md). The sky and HDR lighting are adapted from Poly Haven's [Kloppenheim 05 (Pure Sky)](https://polyhaven.com/a/kloppenheim_05_puresky), CC0.

Afterburners pulse with throttle. The HUD draws a predicted missile path and impact point. Missiles have visible motors and smoke trails; cannon rounds travel through the scene. Missile hits high on a building remove a local patch of photomesh, throw textured fragments, and leave fire and smoke. Base hits use an individual OSM footprint to cut the visible upper structure, drop facade pieces, raise a dust cloud, and leave rubble. Collision height falls to rubble height; the cut is replayed as other detail tiles load. This is an approximate visual collapse, with OSM and photomesh footprints sometimes differing, rather than a structural physics simulation. Relay towers break into falling sections when destroyed. Gravity bombs inherit the aircraft's speed and arc into the city. A nuclear bomb has a 4.5 second ground fuse, then a short white flash, expanding fireball and shock front, rolling ground dust, delayed rumble, and a rising mushroom cloud of smoke. The inner 210 m of the blast is cut down to rubble height and filled with thousands of instanced concrete slabs, angular chunks, and beams concentrated over former building footprints; upper floors break across an outer band reaching 360 m. Taller buildings are split into more falling sections before the wider flattening pass. City damage is processed over several frames to keep the blast playable. These are stylized game effects, not a yield-calibrated physics simulation. Cannon impacts leave scorch marks. More cars and lightweight pedestrians populate local roads; blasts affect both, and car wrecks persist until restart or the capped wreck budget is reached. Restarting restores traffic. Recorded sound sources and licenses are listed in [audio credits](public/assets/audio/CREDITS.md). Mission bandits bank into pursuit, warn before firing, and use visible projectiles. See [gameplay tuning notes](docs/design/gameplay-design.md).

The blast sequence follows the broad visual stages described by the [CDC](https://www.cdc.gov/radiation-emergencies/about/nuclear-blast-faq.html) and [HHS Radiation Emergency Medical Management](https://remm.hhs.gov/mushroomcloud.htm): intense light and fireball, outward blast, then rising vapor and dust that form a mushroom cloud. The game deliberately does not model radiation, fallout, or real weapon yields.
