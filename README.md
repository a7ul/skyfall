# Skyfall Protocol

**A full air-combat game in your browser.** Fly modern fighter jets, take on air and ground targets, and explore a real 3D city. This first playable build gives you a story mission and free flight over Lyon.

**Lyon is going dark.** A rogue air-defense network has cut the evacuation route through the city. You are Viper One, the last fighter close enough to break the signal, clear the skies, and open a way out. Choose an F-22, F-35, Su-57, or Su-35 and take the fight from the open sky down among the rooftops.

[![F-22 above Lyon, promotional artwork](docs/art/f22-over-lyon.jpg)](https://github.com/a7ul/skyfall/releases/download/assets/f22-over-lyon.png)

*Promotional artwork showing the visual direction. Actual gameplay is shown below.*

## Your sortie

### Break the Silence — Mission 01

Two relay sites are jamming Lyon's evacuation corridor. Destroy both, survive the interceptors sent to stop you, and fly through the extraction gate. Echo guides you over the radio while the HUD tracks objectives and threats.

### Free flight

Pick a jet and explore without a mission timer. Skim the river, weave between blocks, practice barrel rolls and inverted flight, switch cameras, or test the weapons. Free flight provides ample missiles and bombs and unlimited nuclear bombs.

| In the air | Over the city | In combat |
| --- | --- | --- |
| Separate pitch, roll, and yaw; full rolls and loops; air brake and throttle control; animated control surfaces. | Lyon's textured 3D city streams around you, with finer detail near the aircraft, moving road traffic, and pedestrians. | Cannon, lock-on or unguided missiles, gravity bombs, and a stylized nuclear blast; impact cues, damage, smoke, fire, and debris. |

The four aircraft have different flight tuning. Chase, cockpit, and cinematic views let you change how close you feel to the jet and the streets.

## Actual gameplay

These are captures from the current Lyon build. The city, aircraft, targeting cue, and HUD shown here are in the game. Click an image for the copy in the [media release](https://github.com/a7ul/skyfall/releases/tag/assets).

| Golden-hour skyline | Su-35 at full throttle | F-35 cinematic view |
| --- | --- | --- |
| [![Su-35 approaching Lyon's hilltop landmarks at golden hour](docs/screenshots/golden-hour-sun.webp)](https://github.com/a7ul/skyfall/releases/download/assets/golden-hour-lyon-gameplay.png) | [![Su-35 flying above Lyon with both afterburners lit](docs/screenshots/su35-afterburner.webp)](https://github.com/a7ul/skyfall/releases/download/assets/su35-afterburner-gameplay.png) | [![F-35 cinematic camera over the Lyon photomesh](docs/screenshots/f35-cinematic.webp)](https://github.com/a7ul/skyfall/releases/download/assets/f35-cinematic-golden-hour.png) |

## Aircraft and combat artwork

The images below are **generated promotional artwork**, not screenshots or a promise of the current graphics. They show different aircraft and the visual direction for future polish. Click for the full-resolution files in the media release.

| Su-57 over the river | F-35 missile engagement |
| --- | --- |
| [![Su-57 promotional artwork above Lyon](docs/art/su57-over-lyon.jpg)](https://github.com/a7ul/skyfall/releases/download/assets/su57-over-lyon.png) | [![F-35 missile engagement promotional artwork](docs/art/f35-missile-engagement.jpg)](https://github.com/a7ul/skyfall/releases/download/assets/f35-missile-engagement.png) |

## Play locally

You need a desktop Chrome or Edge build with WebGPU and GPU acceleration, [Bun](https://bun.sh/), [Git LFS](https://git-lfs.com/), and an internet connection for Lyon's city tiles. No API key or billing account is required.

```sh
git clone git@github.com:a7ul/skyfall.git
cd skyfall
git lfs pull
bun install
bun run dev
```

Open the URL printed by Vite, choose an aircraft, then select **Launch Mission** or **Free Flight**.

### Flight controls

| Input | Action |
| --- | --- |
| W / S or ↑ / ↓ | Nose down / up |
| A / D | Roll left / right |
| Q / E or ← / → | Yaw left / right |
| Shift / Ctrl | Increase / decrease throttle |
| Mouse after clicking the game | Pitch and bank |
| Space / left click | Cannon |
| F / right click | Missile, with or without a lock |
| B / N | Gravity bomb / nuclear bomb |
| G / C / M | Air brake / camera / mute |
| P / Esc / HUD button | Pause and show all controls |

Bank with A or D, then hold S to turn. Hold roll or pitch to complete a full roll or loop. Gamepad controls are supported too.

## Current state

This is a **playable prototype** with one complete mission and free flight. Flight handling favors responsive arcade maneuvers. Building collapse, blast effects, and collision heights are game approximations; the promotional artwork above is more polished than the current renderer. City detail depends on altitude, location, and the tiles loaded around the aircraft.

## Tech stack

- **WebGPU rendering:** Three.js `WebGPURenderer` draws the aircraft, city, HUD effects, and destruction, with HDR sky lighting and ACES tone mapping. There is no WebGL fallback; a WebGPU-capable desktop browser and GPU are required.
- **Streaming 3D world:** `3d-tiles-renderer` loads the 2023 Lyon photomesh progressively. Detail rises near the aircraft and eases back in the distance. OpenStreetMap roads and building footprints support traffic and an approximate collision grid.
- **Aircraft and gameplay:** glTF fighter models, animated control surfaces, and custom flight, targeting, weapons, mission, traffic, audio, and damage systems run in the browser.
- **Build pipeline:** Vite and Bun serve the game locally. `gltf-pipeline` converts Lyon's legacy tile payloads for the renderer; the GitHub Pages build preconverts a bounded static tile pack. Large model and HDR files use Git LFS.

<details>
<summary>Development, city data, and deployment details</summary>

### How the city is built

The visible city is the [Métropole de Lyon 2023 photomesh](https://www.data.gouv.fr/datasets/photomaillage-3d-de-la-metropole-de-lyon), Licence Ouverte / Open Licence 2.0. [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL, provide road routes and building footprints used for traffic and an approximate collision grid. The mesh streams progressively, with finer tiles near low-altitude flight and lower detail farther away. OSM collision heights can differ from the visible photomesh. See the [city source notes](docs/data/city-source-trials.md).

Local development uses Vite to proxy public Lyon tiles and convert their legacy glTF payloads. The large city mesh is not committed to this repo. The four fighter models and HDR sky use Git LFS. Run `bun test` for flight, combat, and world tests; see the [gameplay design notes](docs/design/gameplay-design.md) for tuning and limitations.

### GitHub Pages

The repository is private, and its Pages workflow stays skipped on GitHub Free. When the repo becomes eligible, select **Settings → Pages → GitHub Actions**, then run the deployment workflow or push to `main`. The expected URL is `https://a7ul.github.io/skyfall/`.

A local static Pages build is available with `VITE_BASE_PATH=/skyfall/ bun run build:pages`. It creates an approximately 810 MiB preconverted Lyon tile pack in ignored `dist/`. The pack keeps broad lower-detail city coverage and finer detail around the starting area while staying under GitHub Pages' 1 GiB site limit.

</details>

## Credits and licenses

The fighter models are third-party assets with **noncommercial licenses**; check [aircraft attribution](public/assets/aircraft/ATTRIBUTION.md) before redistribution or commercial use. The golden-hour sky and HDR lighting come from [Poly Haven's Industrial Sunset 02 (Pure Sky)](https://polyhaven.com/a/industrial_sunset_02_puresky), CC0. Sound sources and licenses are in [audio credits](public/assets/audio/CREDITS.md). The Lyon and OpenStreetMap data retain the licenses linked above.
