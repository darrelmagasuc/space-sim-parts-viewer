# Changelog: Space Sim parts for the game

Each release is a git tag `parts-vX.Y.Z` and a GitHub release on `darrelmagasuc/space-sim-parts-viewer`. `handoff/parts_manifest.json` carries the same `manifest_version`. Releases are published **only when Darrel asks**; there is no schedule. The newest release is listed first.

How versions are bumped (`handoff/tools/publish_update.py`):
- **Minor:** parts or interiors were added or removed. Removals are listed as breaking.
- **Patch:** existing ids changed: files (GLB or nodes.json, by sha256) or manifest data only.

Each entry lists the ids that were added, changed or removed. Re-sync those ids by hash (see "Updates" in `AGENT_HANDOFF.md`).

## [0.3.0] - 2026-10-01

This is the first versioned release; earlier states of the repo were unversioned. It has 188 parts / 509 variants in 13 categories, 17 interiors (21 variants) and 2 assemblies. Tag `parts-v0.3.0`.

### Parts
- **Categories:**
  - 188 parts / 509 GLB variants in 13 categories: cmd 11, prop 27, tank 14, stage 18, station 17, power 18, rover 40, jet 13, cockpit 6, aero 8, struct 5, robo 4, sci 7.
  - 108 of the parts are original; 80 were added on 2026-10-01. The additions are the new categories `aero`, `struct`, `robo` and `sci`, the rover kit rover13–39, and additions to prop, tank, stage, station, power and jet.
  - There are also 2 reference assemblies: the gravity ring and the counter-rotating ring.
- **LODs and zips:**
  - The default is game-ready low-poly (≤ 5,000 triangles per variant, shared 35-material PBR library). The CAD meshes are also included, with identical origins and nodes.
  - Zips: `space_sim_lowpoly_glb_v2.zip`, `space_sim_glb_v3.zip`.

### Changed
- **`cockpit00`, `cockpit01`: canopies raised for 1.8 m crew** at a 30° seat recline. The minimum head clearance is now cockpit00 5.4 cm, cockpit01 front 5.4 cm and rear 5.3 cm. Affected variants are `cockpit00_fighter_canopy`, `cockpit00_fighter_canopy_open`, `cockpit01_tandem_canopy` and `cockpit01_tandem_canopy_open`. CAD and low-poly GLBs, nodes, thumbnails and both zips were rebuilt.

### Fixed (Vehicle Creation builder, `assemble.js`; spec in `vehicle_creation_spec.md`)
1. **Antiparallel flip for ±Y nodes:** `quatFromTo` used `a.x` where three.js uses `a.y`, so it produced a zero quaternion. As a result, a part hung by `node_bottom` from a −Y node (e.g. `node_under_R_C`) was not flipped. It now matches `setFromUnitVectors`.
2. **Rover kit and deck joints kept as written:** explicit `node_attach` joints onto `node_outboard[_N]`, `node_rail_l/r_K|c`, `node_grid_R_C`, `node_under_R_C`, `node_front`, `node_rear` and `node_hitch` are no longer discarded and laid out beside the craft. The same applies to stack faces on deck, payload and `node_bottom_N` nodes.
3. **Unique instance ids under nested symmetry:** a symmetric child of a copied parent used to reuse an id (`fin@2` twice). Copies are now `<seed><suffix>~k` for every k, e.g. `fin@2~1`, `fin@2~2`.

New regression tests for all three are in `tools/test_assemble.mjs`.

### Added
- **`handoff/`:**
  - `AGENT_HANDOFF.md`, a `CONVENTIONS.md` copy, `parts_manifest.json` (schema v2: `manifest_version`, `generated_at`, per-file sha256, per-id `content_hash` / `meta_hash`) and `vehicle_creation_spec.md` (with a GDScript porting guide).
  - `test_vehicles/`: 5 crafts plus expected world-space results.
  - `materials_library.json`.
  - Tools: `build_manifest.py`, `build_test_vehicles.mjs`, `reference_builder.py`, `sync_to_godot.py` (re-sync by hash), `import_interiors.py` and `publish_update.py`.
- **Interiors (IVA), 17 parts / 21 variants**, linked to their exterior part ids:
  - **Ids:** `cmd03_interior`, `cmd04_interior`, `cmd05_interior`, `cmd06_interior`, `cmd07_interior`, `cmd08_interior`, `cmd09_interior`, `cockpit00_interior`, `cockpit01_interior`, `cockpit02_interior`, `cockpit03_interior`, `cockpit04_interior`, `station00_interior`, `station01_interior`, `station02_interior`, `station03_interior`, `station04_interior`.
  - **Files:** in `models/interiors/`. Each interior has `<vid>_interior.glb` (interior only, same origin as the exterior), `_combined.glb` and `_cutaway.glb` for review, plus `<id>_interior.nodes.json` with the seat, camera and hatch nodes.
  - **Known issues:** in `cockpit02_interior` the crew does not fit; heads go 2.6–3.2 cm into the ceiling because the exterior deck is 1.26–1.28 m high. In `cockpit03_interior` the pilots fit only within tolerance (−0.2 cm).
  - **Not released yet:** `station09`–`station13` (gravity-ring interiors, still in progress) and the interior props library (the props are already embedded in the interior GLBs).
- **GitHub label `game-request`** for change requests from the game.
