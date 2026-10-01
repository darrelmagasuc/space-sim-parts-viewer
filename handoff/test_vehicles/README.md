# Test vehicles

Five crafts in the save format (`*.craft.json`, see `../vehicle_creation_spec.md` §2.2), each with the result the viewer's builder (`assemble.js`) produces for it (`*.expected.json`). Use them to check a port of Vehicle Creation: **assemble each craft and compare against its expected file**.

| craft | name | parts / connections | instances / joints | what it checks |
|---|---|---|---|---|
| `simple_rocket` | Test Rocket A | 4 / 3 | 7 / 6 | stack `node_bottom`↔`node_top`; fins symmetry 4, offset 45° on `node_side_1` (ids `fin`, `fin@2..4`) |
| `lander` | Test Lander B | 5 / 4 | 11 / 10 | capsule on a tank, descent engine, legs symmetry 4 / offset 45°, RCS quads symmetry 4 on the capsule's side node |
| `station_segment` | Test Station Segment C | 5 / 4 | 6 / 5 | 6-port node as root, hab on top, truss below, solar wings symmetry 2 on the truss, antenna on a side port |
| `kit_rover` | Test Kit Rover D | 16 / 15 | 16 / 15 | rover kit: rails `node_rail_l_K` (+X) / `node_rail_r_K` (−X), arm → motor → wheel chains, deck grid, light under the deck; both antiparallel cases (180° about Y on the right rail, 180° about Z under the deck) |
| `ring_ship` | Test Ring Ship E | 9 / 8 | 27 / 14 | spine stack with a spin hub; `layout: "spoke"` ×6 (mated) and `layout: "ring"` ×12 (hub origin, rotated about the hub's +Y, no joints); symmetric solar wings and radiators |

## `*.expected.json`
```
{ craft, generator, frame, tolerance_m: 1e-4, tolerance_dir: 1e-4,
  counts: {instances, joints, errors: 0, warnings: 0},
  instances: [ { id, seedId, variant, parentId, symmetryIndex, layout,
                 origin: [x,y,z],                 # world position of the part origin (m)
                 quaternion: [x,y,z,w],           # world rotation (sign is arbitrary: q ≡ −q)
                 basis: [[x_axis], [y_axis], [z_axis]],   # rotation columns = Godot basis.x/.y/.z
                 nodes: [ {name, position, direction} ] } ],   # every node of the variant in world space
  joints: [ { parentId, parentNode, childId, childNode, symmetryIndex, angle_deg,
              position, parentDirection, childDirection } ] }
```
Values are rounded to 1e-6. All five assemble with **0 errors and 0 warnings**. In every joint the child node lies on the parent node (< 1e-6 m) and the directions are opposite (dot < −0.999999).

## How to check a port
1. Load `parts_manifest.json`, which provides the variants and their nodes (`pos`, `dir`).
2. For each craft, assemble it, then match instances by `id`. The counts must be equal.
3. For each instance, check:
   - `parentId` and `symmetryIndex` are equal;
   - `|origin − expected| ≤ 1e-4`;
   - each basis column is within 1e-4;
   - each world node position and direction is within 1e-4.
4. For each joint, check its position and directions are within 1e-4.
5. Compare quaternions only up to sign, or not at all, since the basis is unambiguous.

Reference checks in this repo:
```
node handoff/tools/build_test_vehicles.mjs --check     # the viewer's assemble.js vs these files
python3 handoff/tools/reference_builder.py             # independent minimal implementation vs these files
```
`build_test_vehicles.mjs` (without `--check`) regenerates the files from `../tools/test_vehicle_defs.mjs`. Only do this here, in the parts repo, never in the game; changes come via a `game-request` issue.
