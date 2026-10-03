# Lyon map data

Skyfall uses the [Métropole de Lyon 2023 photomesh](https://www.data.gouv.fr/datasets/photomaillage-3d-de-la-metropole-de-lyon) under Licence Ouverte / Open Licence 2.0. The source imagery's 5.5 cm pixel figure is not a promise of equivalent facade texture resolution in the game. [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) provide roads and building footprints for traffic and an approximate collision field.

## Current pack

The current local pack is an **expanded central flight-corridor snapshot**, not the complete metropolitan tile tree. Its local manifest lists three ZIP parts and 3,414 files. Areas and fine tiles absent from that snapshot cannot appear in the game. The tile loader uses available parent tiles when finer references are missing and raises detail as the camera approaches populated areas.

The pack builder reads already converted tiles from the ignored local cache at .cache/lyon-photomesh/ and writes ZIP parts and a manifest to the ignored release-assets/maps/lyon/ directory. It splits parts below the GitHub Release asset size limit. A future full-coverage pack must pass the builder's --require-complete reference check before it is labeled complete.

## Browser loading

Players download all ZIP parts into one folder and grant the browser read/write access to it. zip.js validates and extracts the pack into a skyfall-lyon-map subfolder. Once the starting area is ready, the 3D Tiles renderer reads map files from that selected folder and continues refining the scene while flying. Both local development and a built site use this folder reader. There is **no runtime tile proxy** and no city-tile network request during flight.

The chosen directory handle is stored in IndexedDB for the same browser origin. Chrome may require one click to reconnect permission on a later visit. Changing the site origin, clearing site storage, moving the folder, or deleting ZIP parts can require choosing a folder again.

Collision heights and traffic roads are approximations derived from OpenStreetMap data. They can differ from visible photomesh rooftops or bridges. See [gameplay design](../design/gameplay-design.md) for how flight and impact checks use those approximations.
