# Space Sim part blockouts – static GLB viewer

A static site (no build step, no server code): `index.html` is the gallery, and `view.html?part=<variant>` is the 3D viewer. It uses three.js r186, vendored in `vendor/three/` (MIT, see LICENSE), so nothing loads from a CDN.

- `models/<category>/<variant>.glb`: the original GLBs (Godot Y-up, metres, `node_*` empties), uncompressed. `models/<category>/<id>.nodes.json` holds the node data.
- `thumbs/<variant>.jpg`: gallery thumbnails. `manifest.json`: the part/variant index the pages read.
- `space_sim_glb_v1.zip`: the full Godot package. `CONVENTIONS.md`: the modelling conventions.

Deep links: `view.html?part=<variant id>` (e.g. `station02_b330_deployed`). Aliases work too: `?part=station10` gives the primary variant, and `?part=tank00_l` or `?part=station02_deployed` match by size or pose.

## Updating
1. Rebuild the parts in their source folders (they write `glb/` and `<id>.nodes.json`), and rebuild the zip if needed.
2. `python3 tools/make_thumbs.py` (CadQuery venv python; reuses `renders/<variant>.png` or renders from `_cache/`), then `python3 tools/build_site.py`. That rewrites `models/`, `manifest.json` and the zip copy.
3. Commit and push. GitHub Pages serves the branch root (`.nojekyll` is present).

A new category needs a line in `CATS` in `tools/build_site.py`; its folder must follow `<cat>NN.nodes.json` + `glb/<variant>.glb`.
