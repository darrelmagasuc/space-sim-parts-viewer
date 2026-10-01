# Agent handoff: Space Sim parts → Godot game

**Who this is for:** the coding agent building Darrel's Godot space sim. It explains how to import the parts from this repo and port the viewer's *Vehicle Creation* (spacecraft builder) into the game. This folder is self-contained. Read it top to bottom once, then use the [start-here checklist](#start-here-checklist).

> **Standing instruction for the game agent:** before working on anything that uses parts, pull `darrelmagasuc/space-sim-parts-viewer`. Compare `handoff/parts_manifest.json` → `manifest_version` with `manifest_version` in `res://parts/SYNC_INFO.json`. If they differ, read the new entries in `handoff/CHANGELOG.md` and run `python3 handoff/tools/sync_to_godot.py <project>`, which re-syncs only the ids whose `content_hash` changed. Then re-check the affected crafts. Never edit parts in either repo; request changes with a `game-request` issue. Details: [§13 Updates](#13-updates).

| File | What it is |
|---|---|
| `AGENT_HANDOFF.md` | this file: project, layout, conventions, Godot import, workflow |
| `CONVENTIONS.md` | copy of the authoritative modelling conventions (axes, origins, node names) |
| `parts_manifest.json` | every part and variant, plus the released interiors: ids, sizes, roles, mass, nodes, slots, tris, paths, URLs and sha256 hashes. It also carries `manifest_version`, `generated_at` and its schema, under `"schema"` |
| `CHANGELOG.md` | what changed in each release (`parts-vX.Y.Z`), listing added, changed and removed ids |
| `vehicle_creation_spec.md` | precise, engine-agnostic spec of the builder (snap rules, symmetry, compatibility, data model, save format) plus a GDScript porting guide |
| `test_vehicles/` | 5 saved crafts (`*.craft.json`) and their expected world-space results (`*.expected.json`) for checking your port |
| `materials_library.json` | the shared low-poly PBR material library (names and values) |
| `tools/` | `build_manifest.py` (regenerates the manifest), `build_test_vehicles.mjs` (regenerates/checks the test vehicles with the viewer's own code), `reference_builder.py` (a ~175-line second implementation of the placement rules, a good template for GDScript), `sync_to_godot.py` (copies the parts and interiors into a Godot project and re-syncs changed ids by hash), `import_interiors.py` (brings released interiors into the site), `publish_update.py` (cuts a release; run only on Darrel's request) |

---

## 1. The project

A **KSP-like spaceflight sim, grounded near-future**: parts are modelled on real or credible hardware (Merlin/Raptor-class engines, Soyuz/Orion-class capsules, ISS-class habs, Mars-rover-class rovers, a Hermes-style gravity-ring ship), at plausible real sizes, and built from a shared set of stack diameters. Players assemble vehicles from parts that snap together at **attach nodes**, as in Kerbal Space Program.

This repo, **`darrelmagasuc/space-sim-parts-viewer`**, is the **parts library and web viewer**. It is the single source of truth for part geometry and attach data:

- **Catalogue:** 188 parts in 13 categories. Each part has size and pose variants, for **509 GLB variants** in total, plus 2 reference assemblies.
- **Viewer:** https://darrelmagasuc.github.io/space-sim-parts-viewer/ (gallery). `view.html?part=<variant id>` shows one part; add `&lod=cad` for the CAD mesh.
- **Vehicle Creation:** https://darrelmagasuc.github.io/space-sim-parts-viewer/vehicle.html. Try `?example=hopper` (two-stage rocket), `?example=mule` (rover) and `?example=sparrow` (spaceplane). Plans are assembled locally from the attach nodes (`assemble.js`). The page can also ask an LLM to draft a plan. It imports and exports `*.craft.json`.

| category | parts | variants | ids | contents |
|---|---|---|---|---|
| `cmd` | 11 | 13 | cmd00–cmd10 | command modules & probes |
| `prop` | 27 | 40 | prop00–prop26 | engines, RCS, solids, electric |
| `tank` | 14 | 38 | tank00–tank13 | propellant tanks |
| `stage` | 18 | 73 | stage00–stage17 | decouplers, interstages/adapters, fairings, heat shields, chutes, legs, nose cones |
| `station` | 17 | 26 | station00–station16 | habs, nodes, airlocks, docking, truss, arm, gravity ring |
| `power` | 18 | 31 | power00–power17 | solar, RTG, batteries, reactors, radiators, antennas, life support |
| `rover` | 40 | 124 | rover00–rover39 | complete rovers, surface plant, and the **rover kit** (rover13–39) |
| `jet` | 13 | 52 | jet00–jet12 | jet engines, intakes, wings, control surfaces, gear |
| `cockpit` | 6 | 10 | cockpit00–cockpit05 | aircraft / spaceplane cockpits |
| `aero` | 8 | 45 | aero00–aero07 | fuselages, adapters, cargo bays, strakes, tail and rocket fins, airbrakes |
| `struct` | 5 | 19 | struct00–struct04 | girders, trusses, struts, ladders, pylons |
| `robo` | 4 | 22 | robo00–robo03 | hinges, rotors, pistons, booms |
| `sci` | 7 | 16 | sci00–sci06 | science instruments |

## 2. Repo layout (where things live)

```
/                          static site (GitHub Pages serves the repo root)
├─ index.html, view.html, viewer.js       gallery + single-part viewer
├─ vehicle.html, vehicle.js               Vehicle Creation UI (three.js)
├─ assemble.js                            ★ builder core: pure JS, no DOM (port this)
├─ catalogue.js                           manifest → catalogue lookup + LLM prompt text
├─ examples.js                            built-in example crafts (hopper, mule, sparrow)
├─ providers.js                           LLM provider plumbing (not needed in the game)
├─ manifest.json                          site manifest: every part/variant, bbox, nodes, file paths
├─ models/<cat>/lowpoly/<vid>.glb         ★ game-ready low-poly GLB (default; ≤ 5,000 tris)
├─ models/<cat>/<vid>.glb                 CAD-tessellated GLB (heavier, same frame/nodes)
├─ models/<cat>/<id>.nodes.json           attach nodes + dims for every variant of part <id>
├─ models/assemblies/[lowpoly/]*.glb      2 reference assemblies (gravity ring), no nodes
├─ models/interiors/                      released IVA interiors (§12): <vid>_interior.glb, _combined.glb, _cutaway.glb,
│                                         <id>_interior.nodes.json, interiors.json (what was imported, skips)
├─ thumbs/interiors/<vid>_interior.jpg    interior cutaway previews
├─ thumbs/lp/<vid>.jpg, thumbs/<vid>.jpg  thumbnails (low-poly / CAD)
├─ space_sim_lowpoly_glb_v2.zip           all low-poly GLBs + nodes.json + material library
├─ space_sim_glb_v3.zip                   all CAD GLBs + nodes.json
├─ CONVENTIONS.md                         authoritative conventions (copied to handoff/)
├─ tools/test_assemble.mjs, test_providers.mjs   builder tests (node)
└─ handoff/                               this folder
```

`<cat>` is the category key, `<id>` the part id (e.g. `tank00`), `<vid>` the **variant id** (e.g. `tank00_kerolox_m`, `stage11_landing_leg_m_deployed`). The variant id is the GLB file stem and is what craft files reference.

### Download options
| what | URL | size |
|---|---|---|
| low-poly zip (use this) | https://darrelmagasuc.github.io/space-sim-parts-viewer/space_sim_lowpoly_glb_v2.zip | 36.3 MB |
| CAD zip | https://darrelmagasuc.github.io/space-sim-parts-viewer/space_sim_glb_v3.zip | 24.3 MB |
| one GLB (raw) | `https://raw.githubusercontent.com/darrelmagasuc/space-sim-parts-viewer/main/models/<cat>/lowpoly/<vid>.glb` | |
| one GLB (Pages) | `https://darrelmagasuc.github.io/space-sim-parts-viewer/models/<cat>/lowpoly/<vid>.glb` | |
| nodes | `.../models/<cat>/<id>.nodes.json` | |
| manifest | `https://raw.githubusercontent.com/darrelmagasuc/space-sim-parts-viewer/main/handoff/parts_manifest.json` | 1.8 MB |

Inside the zips the layout is `space_sim_lowpoly_glb_v2/<cat>/<vid>.glb` + `<cat>/<id>.nodes.json` (+ `assemblies/`, `library/materials.json`, `library/textures/`, `README_GODOT.md`, `CONVENTIONS.md`), and likewise `space_sim_glb_v3/<cat>/<vid>.glb`. **File names, origins and nodes are identical between low-poly and CAD**, so you can swap one for the other without changing offsets. Every variant's exact paths and URLs are in `parts_manifest.json` (`variants[].paths`, `variants[].urls`).

The easiest route is a git clone plus `python3 handoff/tools/sync_to_godot.py <godot_project>`. It copies the low-poly GLBs (`--lod cad` copies the CAD ones), the nodes.json files, the manifest and the material library into `res://parts/<cat>/`. It only rewrites files that changed and never deletes anything.

## 3. Frame, units, origin

- **Axes: GLB / Godot Y-up, right-handed**, exactly as glTF requires, so import with no rotation. The CAD sources are Z-up and were converted as `Godot (X, Y, Z) = CAD (X, Z, −Y)`.
- **Units: metres**, so import at scale 1.0. Mass is in tonnes (`mass_t`).
- **Flight vehicles:** the **stack axis is +Y**, which is also the flight direction (the nose is up). Engines thrust toward +Y, and their exhaust leaves along −Y. Cockpits have the nose along +Y, the dorsal side on +Z and the right side on +X.
- **Ground vehicles and surface modules:** up is +Y, **forward is +Z**, vehicle left is +X.
- **Origin:**
  - Stack parts: on the stack axis at the bounding-box mid-height.
  - Parts with no stack axis (radial decouplers, legs, grid fins): the bbox centre.
  - Ground vehicles: the footprint centre at bbox mid-height, with `node_bottom` on the ground plane.
  - Gravity-ring parts (station09–12): on the hub axis, so a spoke or segment is placed by a rotation about Y alone.
- **Radial / surface-mount parts:** the parent body is on **−X** and the part points outward along **+X**. Wings span +X with the leading edge toward +Y.
- **All pose variants of a part share the default pose's origin.** These include `_deployed`, `_stowed`, `_open`, `_steer_left`, `_defl_pos` and others, so swapping one for another needs no offset.

### Size classes (stack diameter, outer skin of the interface)
| class | diameter | | class | diameter |
|---|---|---|---|---|
| XS | 0.625 m | | L | 3.75 m |
| **S** | **1.25 m** | | XL | 5.0 m |
| **M** | **2.5 m** | | **XXL** | **7.5 m** |

Adapters are named top class first (`stage03_interstage_m_l`, size label `"M-L"`). The available pairs are XS-S, S-M, M-L, L-XL and XL-XXL, plus the skips S-L and M-XL. Other size labels: `slot` (internal slot items), `Mk2` / `Mk3` (spaceplane fuselages), `swept-S` and similar (wings), and free labels such as `17 m` (the station arm). Station00 has a 4.2 m hull on an L (3.75 m) interface ring.

## 4. Attach nodes (summary of `CONVENTIONS.md`)

An **attach node** is a point plus an **outward unit direction**, the normal of the mating face pointing away from this part toward whatever attaches there. **Two parts join by putting their nodes at the same point with opposite directions.** Each node exists twice:
- in `<id>.nodes.json` and `parts_manifest.json`, as a position and a direction in the part's local frame (Godot axes, metres);
- in each GLB, as an empty `Node3D` with the same name at that position, **local +Y along the node direction**.

| node | where | direction | mates with |
|---|---|---|---|
| `node_top` / `node_bottom` | stack axis, top / bottom interface face | +Y / −Y | stack neighbour (`node_bottom` of the upper part on `node_top` of the lower) |
| `node_side_N` | radial nodes on the outer skin, N = 1…, counter-clockwise seen from above starting at +X (for 4 nodes: Godot +X, −Z, −X, +Z) | outward | a radial part's `node_attach` |
| `node_attach` | surface-attach face of a radial part | toward the parent (usually −X, see note) | a parent side / kit node |
| `node_payload` | payload plane inside a fairing / cargo bay | +Y (+Z in spaceplane cargo bays) | payload `node_bottom` |
| `node_port_N` | fluid / electrical ports | outward | hoses (not structural) |
| `node_foot` | ground-contact point of a deployed leg / wheel / gear | usually −Y | ground |
| `node_wheel_N` | wheel hub centre on a complete rover | axle, outboard | a wheel's `node_attach` (replaces the built-in `wheel_N` mesh) |
| `node_hatch_N` | crew hatch / docking collar face | outward | docking / crew transfer |
| `node_tool` | arm or drill tip (deployed pose) | working direction | — |
| `node_outboard[_N]` | outer face of a radial chain module (suspension arm, steering, hub motor, pylon) | +X | next part's `node_attach` |
| `node_bottom_N` | extra bottom mounts on couplers / tails | −Y | engines / smaller stacks |
| `node_attach_2` | second end of a two-ended strut (struct02) | toward 2nd parent | — |
| `node_front` / `node_rear` | ground-vehicle frame ends | +Z / −Z | bumpers, blades, hitch, articulated joint, another frame |
| `node_hitch` | tow coupling | outward | the other hitch half |
| `node_crew_N` | seated crew reference on open seats | — | — |
| `node_grid_R_C` / `node_under_R_C` | rover-kit deck grid, top / underside | +Y / −Y | deck parts' `node_bottom` |
| `node_rail_l_K` / `node_rail_r_K` (+ `_c`) | rover-kit side rails, left (+X) / right (−X) | ±X | wheel-chain `node_attach` |

Note on directions: `node_attach` is −X on most radial parts. Trailing-edge control surfaces (elevons, rudders) use +Z, because their parent is the wing ahead of them. A few parts store other directions: tilted fronts, `node_bottom` along +X on parts that mount sideways, and `node_payload` +Z on cargo bays. **Always use the stored position and direction; never assume one from the name.**

**nodes.json format** (per part, `models/<cat>/<id>.nodes.json`):
```json
{ "id": "tank00", "name": "Kerolox tank", "primary": "tank00_kerolox_m",
  "nodes": [ {"name": "node_top", "position": [0, 3.419, 0], "direction": [0, 1, 0]} ],
  "variants": {
    "tank00_kerolox_m": { "size": "M", "state": "flight", "default_state": true,
                          "dims": {"diameter_m": 2.5, "length_m": 6.84, "...": "..."},
                          "nodes": [ {"name": "node_top", "position": [0, 3.419, 0], "direction": [0, 1, 0]}, "..." ],
                          "moving_meshes": ["..."], "files": {"step": "...", "glb": "..."} } } }
```
`state` is `flight` for the default pose of every part, including ground parts. Other values name the pose. The top-level `nodes` belong to the primary variant; **use the per-variant `nodes`**. `parts_manifest.json` repeats them as `{name, pos, dir}`.

## 5. Slots (internal equipment)

- **Unit envelope:** 0.5 × 0.5 × 0.6 m (W × D × H), 0.15 m³. A slot item mounts by its `node_bottom` at the centre of its bottom face, with ports on top (≤ 0.1 m proud).
- **Classes:** **Small** = 1 unit; **Medium** = 2 × 2 × 1 units (1.0 × 1.0 × 0.6 m); **Rack** = 2 × 2 × 3 units (1.0 × 1.0 × 1.8 m), pressurised only.
- **Slot items** have size `"slot"` (e.g. tank08 cryocooler, power04 fuel cell, power12 life support, rover07 MOXIE, sci00/02/04/06). In the manifest they carry `slots.occupies = {slot_class, mount_node}`.
- **Slot bays / hosts** carry `slots.provides = {small_units, text}`, e.g. cmd00–cmd10, station00/02/03/11, rover01/03/10/21/24/26, sci03. The count comes from nodes.json dims or the catalogue text.
- **Placement:** slots are a game-side inventory, not geometry. Hosts don't expose per-slot nodes; the game decides placement. Treat `small_units` as the capacity in Small units (Medium = 4, Rack = 12).

## 6. Materials

- **Low-poly GLBs** (the default) use a **shared PBR library of 35 named materials**, so a name means the same thing in every file. The names, metallic/roughness values and texture names are in `materials_library.json`.
  - Families: `aluminium`, `titanium`, `steel_dark`, `anodised_dark`, `carbon`, `paint_white`, `paint_grey`, `paint_grey_dark`, `paint_black_matte`, `paint_yellow`, `paint_orange`, `paint_tan`, `paint_green`, `paint_red`, `paint_blue`, `mli_gold`, `beta_cloth`, `tile_black`, `tile_white`, `rcc_grey`, `ablator`, `glass_tinted` (alpha 0.28, BLEND, double-sided), `nozzle_copper`, `nozzle_hot`, `nozzle_gold`, `nozzle_steel`, `radiator_black`, `radiator_white`, `solar_blue`, `solar_bronze`, `rubber_tyre`, `seat_fabric`, `regolith` and `mirror`.
  - Small tiling detail maps (256–512 px JPEG) are embedded. UVs are in world-scale metres.
- **CAD GLBs** use simple per-designer colour keys (`paint`, `glass`, `dark`, …). Use them for reference only.
- **In Godot:** replace by name project-wide. Either use *Advanced Import Settings → Materials → Use External* to point each name at `res://parts/_materials/<name>.tres`, or remap in an `EditorScenePostImport` script (§9). `parts_manifest.json` lists each variant's `materials_lowpoly`.

## 7. Moving parts

- **Moving pieces are separate named meshes** inside each GLB, named by function, so scripts can animate or jettison them. Examples: `wheel_1`, `canopy`, `nozzle_extension`, `surface`, `spike`, `reverser_sleeve`, `rotor_drum`, `robotic_arm`, `half_a`/`half_b` (fairing halves), `footpad`, `telescoping_strut`. The manifest gives `meshes` (all mesh node names) and `moving_meshes` (those that move between poses; 335 variants have some).
- **Pose variants** (`_deployed`, `_open`, `_steer_left`, `_defl_pos`, …) are **reference key-frames with the pose baked into the vertices**. The mesh node transforms are identity, so there are no animation tracks. The simplest correct approach is to swap the whole GLB, or swap only the moving meshes, when the state changes; origins are shared. For smooth animation, derive a pivot for each moving mesh by comparing the two poses. jet09 control surfaces record `dims.hinge_axis`, and `_defl_pos` / `_defl_neg` are ±25° about it by the right-hand rule.
- **Complete rovers** (rover00–03, …) have built-in `wheel_N` meshes plus `node_wheel_N` hubs. When a separate wheel part is attached to `node_wheel_N`, the viewer hides that `wheel_N` mesh and also the `fenders` / `suspension_arms` meshes. Do the same.

## 8. Rover kit grid (rover13–39)

The rover kit uses the ground frame (up +Y, forward +Z, left +X). The chassis origin is at the footprint centre, bbox mid-height.
- **Deck grid, 0.5 m pitch:**
  - **Which parts:** frames (rover13), deck plates (rover14), trailers (rover38) and cargo floors (rover25).
  - **Nodes:** `node_grid_R_C` sits at the centre of each 0.5 × 0.5 m cell on the top face (+Y), and `node_under_R_C` on the underside (−Y).
  - **Indexing:** R is the row from the front (R = 0 at +Z) and C is the column from vehicle left (C = 0 at +X), so `x = W/2 − (C + 0.5)·0.5`, `z = L/2 − (R + 0.5)·0.5`, `y = ±H/2`.
  - **Deck parts:** they have whole-cell footprints with `node_bottom` at the footprint centre.
- **Frame sizes:**

  | variant | footprint (W × L) | grid (rows × cols) |
  |---|---|---|
  | `rover13_chassis_frame_xs` | 0.5 × 1.0 m | 2 × 1 |
  | `rover13_chassis_frame_s` | 1.0 × 1.5 m | 3 × 2 |
  | `rover13_chassis_frame_m` | 2.0 × 3.0 m | 6 × 4 |
  | `rover13_chassis_frame_l` | 3.0 × 5.0 m | 10 × 6 |
- **Side rails:** `node_rail_l_K` (x = +W/2, dir +X) and `node_rail_r_K` (x = −W/2, dir −X) every 0.5 m, where K is the grid row. With an even row count there is also a mid-length pair `node_rail_l_c` / `node_rail_r_c` at z = 0.
- **Wheel chain:** rail node → rover17 suspension arm (or rover16 rocker-bogie, `node_outboard_1..3`) → rover18 steering (optional) → rover19 hub motor → rover04 wheel. Each `node_outboard` mates the next part's `node_attach`. **On the right rail the same parts are rotated 180° about Y**; the builder math does this automatically (antiparallel case, §4 of the spec).
- **Front / rear:** `node_front` / `node_rear` take bumpers (rover34), dozer blades (rover32), the hitch (rover37), the articulated joint (rover15) or another frame.
- **Rover bus:** every grid, rail and end node carries power, data and coolant. There are no external battery packs.

`test_vehicles/kit_rover.craft.json` is a worked example: an M frame, 4 wheel chains, a core and a mast on the grid, and a light under the deck.

## 9. Godot import (recommended)

**Folder layout**
```
res://parts/<cat>/<vid>.glb          # low-poly by default (sync_to_godot.py --lod lowpoly)
res://parts/<cat>/<id>.nodes.json
res://parts/assemblies/*.glb         # reference only
res://parts/parts_manifest.json      # load at startup → part catalogue
res://parts/interiors/<vid>_interior.glb + <id>_interior.nodes.json   # IVA (§12)
res://parts/materials_library.json
res://parts/CHANGELOG.md
res://parts/_materials/<name>.tres   # your own materials, one per library name (optional)
res://parts/SYNC_INFO.json           # last sync: commit, manifest_version, content_hash per id (§13)
res://crafts/*.craft.json            # saved vehicles (format in vehicle_creation_spec.md)
```
Keep the file names unchanged: craft files reference variant ids, and the manifest gives `paths.godot_suggested = res://parts/<cat>/<vid>.glb`.

**Import settings** (Godot 4.x, Scene importer; set them once on the folder via *Import Defaults* or a preset):
- **Basic:** Root Type `Node3D`, Root Scale `1.0`, and no extra rotation (the files are already Y-up, in metres).
- **Meshes:**
  - *Ensure Tangents* on: the normal maps need them.
  - *Generate LODs* on: fine, but the parts are already ≤ 5k tris.
  - *Create Shadow Meshes* on.
  - *Light Baking*: `Static Lightmaps` only for static props.
- **Materials:** see §6. glTF import gives `glass_tinted` as transparent automatically.
- **Animation:** the files have no animations, so you can turn import off.
- **Physics:**
  - Don't let the importer generate colliders on every mesh.
  - For **vehicle rigid bodies**, add a `CollisionShape3D` per part from `create_convex_shape()` on each sub-mesh, or from simple primitives sized from `bbox_m`.
  - Static props can use `create_trimesh_shape()`.
- **Node names:** no part uses Godot's import-hint suffixes (`-col`, `-noimp`, …), so all names come through as-is. Find attach nodes with `find_child("node_top", true, false)` or by iterating the children whose names start with `node_`. Don't rely on GLB node order.
- **Post-import script** (optional, e.g. `res://parts/_import/part_post_import.gd`) to remap materials by name:
  ```gdscript
  @tool
  extends EditorScenePostImport
  func _post_import(scene):
      _remap(scene)
      return scene
  func _remap(n):
      if n is MeshInstance3D:
          for i in n.mesh.get_surface_count():
              var m = n.mesh.surface_get_material(i)
              if m:
                  var p = "res://parts/_materials/%s.tres" % m.resource_name
                  if ResourceLoader.exists(p): n.set_surface_override_material(i, load(p))
      for c in n.get_children(): _remap(c)
  ```
- **Data:** at runtime, prefer the **manifest / nodes.json** for attach maths, not the imported Node3D empties. They match (all 1,754 nodes were checked), but the JSON is what the test vehicles use. The empties are handy for gizmos and debugging.
- **Mass:** use `mass_t` × 1000 for the `RigidBody3D` mass in kg. When `mass_estimated` is true, the value is a placeholder: see `mass_note`, and flag it in your game data. 230 of 509 variants are estimates or approximate figures.

## 10. Assemblies

`models/assemblies/gravity_ring_assembly.glb` contains the station09 hub, 6 × station10 spokes, 12 × station11 segments and the station13 despun core. `counter_rotating_assembly.glb` contains station12 and 2 rings. Low-poly copies are under `models/assemblies/lowpoly/`. They use instanced meshes and are **reference only**: they have no nodes, so don't snap them. In a craft, a gravity ring is built from the individual parts with the `spoke` / `ring` layouts; see the spec and `test_vehicles/ring_ship`. The ring geometry is spoke j at 60j° and segment k at 30k° about the hub's +Y.

## 11. Workflow and rules

1. **Never edit parts in this repo.** That covers GLBs, nodes.json, manifest.json, the zips and `handoff/parts_manifest.json`. They are generated from the CAD sources by a separate pipeline, and local edits would be overwritten. Treat `res://parts/` in the game as a read-only mirror too. Game-side overrides (tuned masses, thrust, costs) belong in your own data files keyed by variant id.
2. **Request changes by GitHub issue** on `darrelmagasuc/space-sim-parts-viewer`, **labelled `game-request`**: https://github.com/darrelmagasuc/space-sim-parts-viewer/issues/new?labels=game-request . Use one issue per request, with:
   - **Title:** `[game-request] <part id / variant id>: <what>`
   - **Body:** what you need (new part, size, pose, node, moving-mesh split, mass, fix), why the game needs it, the affected variant ids, and the expected node names / positions / sizes, with screenshots if useful. For a mismatch, give the craft file and the numbers you got against those you expected.
3. **Pull when the issue is closed.** The fix ships in the next release; the closing comment names the commit or the `parts-vX.Y.Z` tag. Then follow §13 Updates. `SYNC_INFO.json` records which version and commit you have.
4. **Contract:**
   - **Stable (renames come only through a versioned change):** variant ids, node names, origins and frames. `parts_manifest.json` has a `schema_version` and a `manifest_version` (§13).
   - **Stable for a given repo commit:** the test vehicles.
   - **Not stable:** new parts and variants get added, so don't hard-code counts.
5. **Vehicle Creation in the viewer stays the reference implementation.** If the port disagrees with `test_vehicles/*.expected.json`, the port is wrong. If you believe the reference is wrong, open a `game-request` issue.

## 12. Interiors (IVA)

Blockout crew interiors for the crewed parts are released in `models/interiors/` and listed in `parts_manifest.json` under **`interiors[]`**. Each entry is linked to its exterior by **`exterior_part_id`**, and each variant by `exterior_variant`. The authoring source is Sergei's `parts/interiors/` pipeline. It is copied here by `handoff/tools/import_interiors.py`, and only finished, validated interiors are copied.

| released (0.3.0) | exterior variants | crew | notes |
|---|---|---|---|
| `cmd03_interior` … `cmd09_interior` | Gemini, Soyuz DM, Dragon, Orion, MAV, Hermes flight deck, LM cabin | 2–6 | all crew fit |
| `cockpit00_interior`, `cockpit01_interior` | fighter / tandem canopy, plus the `_open` variants | 1 / 2 | raised canopies (0.3.0), ~5 cm head clearance |
| `cockpit02_interior` | spaceplane flight deck | 4 | **known issue:** heads 2.6–3.2 cm into the ceiling (the exterior deck is too low) |
| `cockpit03_interior` | airliner flight deck, plus `_open` | 3 | pilots fit only within tolerance (−0.2 cm) |
| `cockpit04_interior` | Concorde-style, plus `_droop` | 3 | |
| `station00_interior` … `station04_interior` | Destiny-style hab, BEAM (deployed), B330 (deployed), 6-port node, airlock | 1–12 positions | microgravity; station checks pass (aisles, hatch keep-outs, cavity) |

**Not released yet:**
- **The gravity-ring interiors `station09`–`station13`** are still in progress; they are listed in `interiors_skipped[]`.
- **The interior props library** is not released. Its props are already embedded in the interior GLBs as `eqNN_k` nodes.
- **BEAM and B330:** only the deployed variants have interiors. The packed modules have no habitable volume.

**Files per interior variant** (`<ext>` = exterior variant id):
- `models/interiors/<ext>_interior.glb` is **the one to ship**. It contains only the interior, and its **origin and axes are identical to the exterior `<ext>.glb`**.
- `<ext>_combined.glb` (interior plus ghosted exterior) and `<ext>_cutaway.glb` are for review only.
- `<id>_interior.nodes.json` is a verbatim copy of the source file. Its `files` paths are source-relative, so use the manifest's `paths`/`urls` instead.
- The manifest gives `tris`, `bytes`, `sha256` and a preview `thumbs/interiors/<vid>.jpg`.
- **Interiors are CAD-tessellated only.** There is no low-poly version yet. `*_interior.glb` ranges from 8.6k to 122k triangles (station02 is the heaviest). Load them on demand when the camera enters IVA, and use them as LOD0 only.

**Using one in Godot:**
1. Instance `<ext>_interior.glb` as a child of the exterior part's scene with an **identity transform**.
2. **Hide the exterior meshes listed in `exterior_hide`** while the interior is shown:
   - cockpit00: `ejection_seat`, `seat_handle`, `instrument_panel`, `hud`, `side_stick`;
   - cockpit01: `front_seat`, `rear_seat`, `seat_handles`, `front_panel`, `rear_panel`, `sticks`;
   - station02: `rigid_core`.
3. **Cameras:** put a `Camera3D` under `node_camera_N` rotated **+90° about local X**. The node's +Y is the view direction and its +Z is up, and a Camera3D looks down its −Z. `node_camera_N` is crew member N's eye point; higher numbers are extra viewpoints.
4. **IVA nodes:** these are named in `CONVENTIONS.md` → "Interiors (IVA)". Each node has `pos`, `dir` and **`up`**: local +Y = `dir`, local +Z = `up` (towards the head, or the hatch's up).
   - `node_seat_N`: seat reference point; `dir` = facing direction, `up` = along the spine. In stations it is a standing or sleeping crew position.
   - `node_camera_N`: eye point.
   - `node_hatch_N`: centre of the hatch opening's **inner** face, pointing outward. It pairs with the exterior's stack or side node of the same port; the manifest `hatches` text names the port.
5. **Moving meshes** are separate nodes, listed in `moving_meshes`: `hatch_door_N`, `stick_N`, `throttle_N`, `yoke_N`, `hand_controller_N*` and `canopy_frame_inner`. The canopy frames follow the exterior canopy; the `_open` variants hold the open key-frame.
6. **Props** are `eqNN_k` nodes inside the GLB, with their position and basis in `variants[].props[]`, so the game can swap or hide them.
7. **Validation** data per interior: `crew_fit` (seats, fitted, minimum clearance), `station_checks_ok` and `known_issue`.

## 13. Updates

Parts releases are **published only when Darrel asks**; there is no schedule.
- **Versioning:** each release is a semver **`manifest_version`** in `parts_manifest.json`, a git tag **`parts-vX.Y.Z`**, a GitHub release, and an entry at the top of **`handoff/CHANGELOG.md`**. Minor = ids added or removed; patch = existing ids changed.
- **Change detection:** every variant file has a `sha256`, and every part, interior and assembly has a **`content_hash`** (all its files) and a **`meta_hash`** (its manifest data).

**Before working on parts (every session):**
1. `git pull` the parts repo (or `git fetch --tags` and check out the newest `parts-v*` tag).
2. **Compare versions:** `handoff/parts_manifest.json` → `manifest_version` against `res://parts/SYNC_INFO.json` → `manifest_version` (the last version you imported). If they're equal and `content_hash` values match, there is nothing to do.
3. **Read `handoff/CHANGELOG.md`** from the top down to your last version. Note the added, changed and **removed** ids. Removed ids break crafts that use them, so migrate those crafts.
4. **Re-sync only what changed:** `python3 handoff/tools/sync_to_godot.py <project>`. It compares each id's `content_hash` with the hashes stored in `SYNC_INFO.json`. It copies only added, changed or missing ids, prints them, and never deletes. Removed ids are only listed. Then it records the new version and hashes. `--dry-run` shows the plan; `--all` forces a full copy.
5. **Re-validate what the change touches:**
   - re-run your test-vehicle check (§11 of the spec);
   - re-open saved crafts that use changed ids;
   - review game-side overrides (mass, stats) for ids with a changed `meta_hash`.
6. **Close the loop:** if a release resolves one of your `game-request` issues, verify it and comment on the issue.

**Publishing (parts side only, on Darrel's request):** run `python3 handoff/tools/publish_update.py --notes "…" [--push]`.
1. It diffs against the manifest at the newest `parts-v*` tag, by hash.
2. It regenerates the manifest and bumps the version.
3. It runs the tests and checks that the zips match `models/`.
4. It prepends the changelog entry and stages the commit.
5. **Only with `--push`** does it commit, rebase on origin, tag `parts-vX.Y.Z`, push and create the GitHub release. `--dry-run` only reports.

The game agent never runs this.

## Start-here checklist

1. ☐ Clone the repo, or download `space_sim_lowpoly_glb_v2.zip` together with `handoff/`.
2. ☐ Read this file and `CONVENTIONS.md` (frames, origins, node directions).
3. ☐ Run `python3 handoff/tools/sync_to_godot.py <your Godot project>` to get `res://parts/<cat>/…`, the manifest and the material library.
4. ☐ Set the import defaults for `res://parts/` (§9): scale 1, no rotation, tangents on, materials remapped by name.
5. ☐ Write a catalogue loader for `res://parts/parts_manifest.json`. Read the `schema` block at the top; the key is `variants[].vid` and attach data is in `variants[].nodes[]`.
6. ☐ Spot-check in the editor:
   - drop `tank00_kerolox_m` and `prop08_merlin` into a scene;
   - their `node_bottom` / `node_top` empties should face each other (+Y vs −Y);
   - the tank's `node_side_1` should be on +X.
7. ☐ Read `vehicle_creation_spec.md` and port the **core placement** (§3–5 of the spec) as a pure GDScript class, with no scene nodes in the maths.
8. ☐ Load each `handoff/test_vehicles/*.craft.json` and compare every instance origin, basis and world node against `*.expected.json` (tolerance 1e-4 m). Compare quaternions up to sign, or compare the basis. All 5 must pass, including the right-side kit wheels and the under-deck light, which exercise the antiparallel case.
9. ☐ Add validation (§6 of the spec) and the editor interactions (pick a node, preview the snap, symmetry 1–12, clocking, roll).
10. ☐ Save and load `*.craft.json` (§7). A craft saved by the game must load in the viewer (`vehicle.html` → Import) and vice versa.
11. ☐ Raise any gaps (missing node, wrong mass, need a moving-mesh split) as **`game-request` issues**, then pull when they close.
12. ☐ IVA: load `res://parts/interiors/<ext>_interior.glb` under the exterior with an identity transform, hide `exterior_hide`, and put a camera on `node_camera_1` (§12).
13. ☐ Every session: follow **§13 Updates**. Compare `manifest_version` with `SYNC_INFO.json`, read `CHANGELOG.md` and re-sync the changed ids by hash.
