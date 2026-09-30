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

The planner checks the plan instead of throwing: unknown variants, duplicate ids, cycles, and a part attached twice are errors (the valid remainder still places). A stack joint whose face diameters differ by more than about 8% is a warning. Overlapping bounding boxes are a warning when the clash is more than a glancing contact.

A smaller model often names nodes backwards, omits them, or leaves parts unattached. `assemble.js` repairs that before placing. `stack` is an ordered list from nose to tail and `attach` is the radial parts; the page picks `node_bottom`/`node_top` or `node_attach` itself. A `connections` list with missing or reversed nodes is rebuilt into the same nose-to-tail column when those joints would run parts through each other. An inexact part id such as `tank00` is swapped for the size that matches its neighbour. Parts that still cannot join are laid out in a row beside the craft, with a warning, instead of sitting on the origin. Generate sends the plan back once when it has errors, eight or more warnings, several overlaps, or a joint that was left beside the craft. The built-in examples are already explicit and are not rewritten. `node tools/test_assemble.mjs` checks the examples and a set of imperfect plans.

A gravity ring is not a stack. One `station10_spoke` is patterned around `station09_spin_hub`, and one `station11_ring_segment` is rotated about the hub axis into a closed ring (`"ring": { "hub", "spokes", "segments" }`). The spine of trusses, tanks, and engines stays on +Y. Loose solar wings and radiators are hung on a truss when the plan has one, instead of floating at the origin.

### Prompt to a plan

The system prompt is built from `manifest.json` (itself generated from each `models/<category>/<id>.nodes.json`). It lists every variant's category, size class, a few dimensions, state, and node names. A part added to the site later is usable with no change to the page.

The key stays in `localStorage` in this browser. Generate sends it only to the endpoint you set. Clear saved key removes it. The default preset for a new browser is OpenRouter. A saved provider is left as-is, so an older OpenAI choice is not silently retargeted.

Presets, and whether a browser on this page can read the reply (checked 2026-09-30 with a fake key: a readable HTTP 401/400 counts as direct; `Failed to fetch` does not):

| Preset | Endpoint | Direct from a browser |
| --- | --- | --- |
| OpenRouter (default) | `https://openrouter.ai/api/v1/chat/completions` | Yes. Optional `HTTP-Referer` and `X-Title` are on their CORS allow list. |
| Groq | `https://api.groq.com/openai/v1/chat/completions` | Yes. Preflight allows `authorization` and `content-type` only, so the page sends those and nothing else. Default model `openai/gpt-oss-120b` (Groq shut down `llama-3.3-70b-versatile` for developer keys on 2026-08-16). |
| xAI Grok | `https://api.x.ai/v1/chat/completions` | Yes. This is xAI, not Groq. |
| Anthropic | `https://api.anthropic.com/v1/messages` | Yes, with `anthropic-version` and `anthropic-dangerous-direct-browser-access: true`. Without that header the browser blocks the call. |
| OpenAI | `https://api.openai.com/v1/chat/completions` | No. The preflight echoes the page origin, but the POST response omits `Access-Control-Allow-Origin`, so the browser reports `Failed to fetch`. |
| Custom | whatever base URL you set | Depends on that host. |

Groq keys start with `gsk_`. xAI keys start with `xai-`. If the pasted key’s prefix belongs to a different preset, or the base URL host is `api.groq.com` while xAI is selected (or the reverse), the form says so. The request is still sent.

A network failure names the provider, says whether that preset is known to block browsers, and points at OpenRouter or the proxy. An HTTP error (a bad key, for example) shows that status instead. If the reply is not valid JSON, or `assemble.js` reports errors, the page asks the model once more with those errors attached, then shows whatever came back.

### CORS proxy

OpenAI, and any custom host that blocks browsers, needs a proxy you control. `tools/cors-proxy-worker.js` is a Cloudflare Worker: the page POSTs to the worker with the real URL in `X-Target-URL`, and the worker forwards only to `api.openai.com`, `api.groq.com`, `api.x.ai`, `openrouter.ai`, and `api.anthropic.com`. It adds `Access-Control-Allow-Origin: *` and does not log the key. Paste the worker URL into **CORS proxy URL**. Leave that field blank for OpenRouter, Groq, xAI, and Anthropic.

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
