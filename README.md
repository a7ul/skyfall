# Skyfall Protocol

A playable WebGPU fighter jet prototype over **Lyon**. The main menu launches one story mission or free flight in the same city. The 2023 Métropole de Lyon photomesh streams progressively as 3D Tiles. Four textured fighter models have distinct flight tuning and moving ailerons, elevators, and rudders. Local OpenStreetMap road routes drive destructible traffic.

## Run

```sh
bun install
bun run dev
```

Open the URL printed by Vite in a current Chrome or Edge build with WebGPU and GPU acceleration. For a production preview, run `bun run build && bun run preview`. The Lyon tiles require a running Vite server and internet access. Vite proxies the public tiles and converts their legacy glTF 1.0 payloads to glTF 2.0, with a small memory cache. A plain static server cannot perform this conversion. No API key, company account, or billing project is needed.

The tile streamer gives nearby, low-altitude blocks a finer screen-space target, reduces distant detail, and preloads a small area ahead of the aircraft. Concurrent parsing is limited to avoid main-thread pauses. A device-sized tile cache and gradual frame-time adjustment keep detail from overwhelming memory on slower machines. Converted tiles are browser-cached for a day, so revisiting an area avoids another download and conversion. Add `?debug=1` in a development build to expose hidden tile and frame metrics for profiling.

## Mission

**Break the Silence:** A rogue defense network is jamming the evacuation route through Lyon. Destroy Relay Alpha and Relay Bravo, shoot down the hostile interceptors, and fly through the green extraction gate. Hold a target near the reticle for about 1.35 seconds to lock a missile. Free flight has unlimited missiles and destructible road traffic.

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

Free flight starts at about 55 m/s (106 knots) in the F-22. Bank with A or D, then hold S to turn. Holding A or D completes a full roll, and holding S completes a loop. Pitch, roll, and yaw stay separate in the aircraft's local frame, including inverted flight. Climbing and hard turns spend speed; diving restores it. The air brake slows the jet and improves turn authority. Gamepad: left stick pitch/bank, shoulders yaw, triggers throttle, A cannon, B missile.

## Data and assets

The city is the [Métropole de Lyon 2023 photomesh](https://www.data.gouv.fr/datasets/photomaillage-3d-de-la-metropole-de-lyon), Licence Ouverte / Open Licence 2.0. Its public 3D Tiles stream on demand and are not bundled in this repository. The published 5.5 cm figure describes the source aerial imagery, not guaranteed facade texture sharpness. See [Lyon source notes](docs/city-source-trials.md).

Road routes and an approximate 5 m building collision grid are generated from [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL, and bundled under `public/assets/lyon/`. To regenerate them, fetch the four OSM map squares documented in `scripts/build_lyon_gameplay.py`, then run that script. The grid uses OSM building footprints and tagged or estimated heights. Its building tops can differ from the photomesh, and bridges or overhangs are approximate.

The F-22, F-35, Su-57, and Su-35 use off-the-shelf textured models. Their sources and noncommercial licenses are in [public/models/ATTRIBUTION.md](public/models/ATTRIBUTION.md). The sky and HDR lighting are adapted from Poly Haven's [Kloppenheim 05 (Pure Sky)](https://polyhaven.com/a/kloppenheim_05_puresky), CC0.

Afterburners pulse with throttle. Guided missiles have visible motors and smoke trails. Impacts add flash, shockwave, sparks, smoke, and synthesized audio. Traffic can be locked and destroyed with missiles or the cannon. Restarting restores traffic. Mission bandits bank into pursuit, warn before firing, and use visible projectiles. See [gameplay tuning notes](docs/gameplay-design.md).
