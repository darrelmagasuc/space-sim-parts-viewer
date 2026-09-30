# Space Sim part blockouts – static GLB viewer

A static site (no build step, no server code): `index.html` is the gallery, and `view.html?part=<variant>` is the 3D viewer. It uses three.js r186, vendored in `vendor/three/` (MIT, see LICENSE), so nothing loads from a CDN.

- `models/<category>/<variant>.glb`: the original GLBs (Godot Y-up, metres, `node_*` empties), uncompressed. `models/<category>/<id>.nodes.json` holds the node data.
- `thumbs/<variant>.jpg`: gallery thumbnails. `manifest.json`: the part/variant index the pages read.
- `space_sim_glb_v2.zip`: the full Godot package. `CONVENTIONS.md`: the modelling conventions.

Deep links: `view.html?part=<variant id>` (e.g. `station02_b330_deployed`). Aliases work too: `?part=station10` gives the primary variant, and `?part=tank00_l` or `?part=station02_deployed` match by size or pose.

## Vehicle Creation

`vehicle.html` is a proof of concept that builds a craft from the parts on this site. It is static (vanilla JS modules, the same vendored three.js) and uses relative URLs, so it works on a GitHub Pages project subpath. Open it from the header link or the banner on the gallery. `?example=hopper`, `?example=mule`, or `?example=sparrow` opens a built-in craft.

The built-in plans are a two-stage rocket (Hopper II), an open rover (Mule), and a small spaceplane (Sparrow). They use real variant ids from `manifest.json`. Paste JSON and Assemble runs the same placer with no API key. Export downloads the plan; Import reads a file back.

### Snapping

`assemble.js` places each GLB so the child's node sits on the parent's node and the outward normals are opposed (they point at each other). `rotation` is extra twist in degrees, right-handed about the parent's node direction. `symmetry` copies that child, and anything later attached to it, around the parent's local +Y. `offset` clocks the pattern around +Y in degrees, which is how the rocket's grid fins sit between its boosters.

Stack above: child `node_bottom` on parent `node_top`. Stack below: child `node_top` on parent `node_bottom`. Radial and surface parts (boosters, fins, wings, wheels, antennas) use child `node_attach`. Wheels are one connection per `node_wheel_N`, not one symmetry group, because the hubs are not evenly spaced around +Y. The rover preview hides a chassis `wheel_N` mesh when a part is snapped to that hub.

The planner checks the plan instead of throwing: unknown variants or nodes, duplicate ids, cycles, and a part attached twice are errors (the valid remainder still places). A stack joint whose face diameters differ by more than about 8% is a warning. Overlapping bounding boxes are a warning when the clash is more than a glancing contact. `node tools/test_assemble.mjs` checks the examples and those cases.

### Prompt to a plan

The system prompt is built from `manifest.json` (itself generated from each `models/<category>/<id>.nodes.json`). It lists every variant's category, size class, a few dimensions, state, and node names. A part added to the site later is usable with no change to the page.

The key stays in `localStorage` in this browser. Generate sends it only to the endpoint you set. Clear saved key removes it. Providers:

- **OpenAI-compatible** chat completions (`/chat/completions`), with a base URL and model. The presets are OpenAI, xAI/Grok, and OpenRouter; Custom is the same protocol with your own URL.
- **Anthropic** Messages (`/messages`), including the browser-access header that endpoint requires.

Many providers block browser CORS. A network failure, an HTTP error, or an empty reply is shown in the panel; the page does not pretend the craft assembled. If the reply is not valid JSON, or `assemble.js` reports errors, the page asks the model once more with those errors attached, then shows whatever came back.

### Craft JSON

```json
{
  "name": "Hopper II",
  "summary": "one sentence",
  "parts": [
    { "id": "lowertank", "variant": "tank00_kerolox_m", "note": "optional" }
  ],
  "connections": [
    {
      "child": "lowereng",
      "childNode": "node_top",
      "parent": "lowertank",
      "parentNode": "node_bottom",
      "symmetry": 1,
      "rotation": 0,
      "offset": 0
    }
  ],
  "staging": [
    { "stage": 1, "title": "Liftoff", "parts": ["lowereng"], "note": "what happens" }
  ],
  "manual": "# Flight guide\nmarkdown"
}
```

`parts[].id` is an instance name you invent (letter first). `variant` is a variant id from the catalogue; a bare part id such as `tank00` resolves to that part's primary variant and warns. `child` and `parent` refer to instance ids. The root is the part that is not a child. `symmetry` above 1 lists the child once; copies are named `id@2`, `id@3`, …. `manual` is the flight guide rendered next to the view. `staging` is a short ordered list.

## Updating
1. Rebuild the parts in their source folders (they write `glb/` and `<id>.nodes.json`), and rebuild the zip if needed.
2. `python3 tools/make_thumbs.py` (CadQuery venv python; reuses `renders/<variant>.png` or renders from `_cache/`), then `python3 tools/build_site.py`. That rewrites `models/`, `manifest.json` and the zip copy.
3. Commit and push. GitHub Pages serves the branch root (`.nojekyll` is present).

A new category needs a line in `CATS` in `tools/build_site.py`; its folder must follow `<cat>NN.nodes.json` + `glb/<variant>.glb`.
