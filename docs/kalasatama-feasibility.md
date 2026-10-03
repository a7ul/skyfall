# Kalasatama high-resolution side experiment

Source: [Aalto University photorealistic mesh dataset](https://zenodo.org/records/7599228), version 2023, CC BY 4.0 (Aalto University, Arttu Julin and Toni Rantanen). No billing account or API key is needed.

The archive accepts HTTP range requests, so its metadata and individual textures can be inspected without downloading all 6.0 GB. It contains one 5.4 GB uncompressed OBJ with roughly 30 million faces and 15 million vertices, plus fifty 8192 × 8192 PNG textures. The OBJ is monolithic rather than spatially tiled. A WebGPU flight scene would need it divided into geographic cells, with lower detail versions, texture compression, and alignment to the existing Helsinki mesh before it could replace or supplement the current city.

I extracted and downsampled one diffuse texture to [kalasatama-texture-preview.jpg](kalasatama-texture-preview.jpg). This is a UV texture sheet, **not a screenshot or a playable 3D import**. It confirms the source has detailed ground-level photography, but a single sheet cannot show how the final mesh looks in flight. The high-resolution pilot that runs in the game uses level 21 of Helsinki's existing tiled 2017 source instead.
