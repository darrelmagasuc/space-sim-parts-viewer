# Vehicle Creation: builder specification and porting guide

This is an engine-agnostic spec of the viewer's spacecraft builder, followed by a GDScript porting guide. It was written from the viewer's code: `assemble.js` (the core, pure JS with no DOM), `catalogue.js` (lookup and LLM prompt), `vehicle.js` (UI, preview, import/export) and the tests in `tools/test_assemble.mjs`. Where this text and `assemble.js` disagree, **`assemble.js` is the reference**, and `test_vehicles/*.expected.json` are its outputs. `tools/reference_builder.py` is a second, ~200-line implementation of §3–§5 that reproduces every expected file. It is the closest template for GDScript.

Conventions: Godot frame (Y-up, right-handed, metres). Vectors are `[x, y, z]` and quaternions are `[x, y, z, w]`. Angles in files are **degrees**; the maths uses radians.

---

## 1. Concepts

| term | meaning |
|---|---|
| **variant** | one GLB: a part at one size and pose, with id `vid` (e.g. `tank00_kerolox_m`). It has `nodes`, `bbox`, `dims` and `size`. This is the unit a craft references. |
| **node** | `{name, position, direction}` in the variant's local frame. `direction` is the outward unit normal of the mating face. |
| **seed part** | an entry in `craft.parts`: `{id, variant}`. `id` is an instance name chosen by the designer. |
| **connection** | a directed edge `child → parent` that puts `child.childNode` on `parent.parentNode`, with `symmetry`, `offset`, `rotation` and an optional `layout`. |
| **instance** | one placed copy of a seed. A connection with symmetry *n* makes *n* instances of the child, and of the child's whole subtree. |
| **joint** | one placed mating: a parent instance, a child instance, both node names, and the world point and directions. |

The craft is a **forest of trees**. Each seed has at most one parent connection, and the root(s) are the seeds that never appear as a `child`.

## 2. Data model

### 2.1 Catalogue (input, from `parts_manifest.json` or the site `manifest.json`)
For each variant the builder needs:
```
Variant {
  vid: String              # "tank00_kerolox_m"
  partId: String           # "tank00"
  partName, category, label: String
  size: String             # "M", "S-M" (adapter, top class first), "slot", "Mk2", ...
  bbox: [x, y, z]          # bbox size, metres (parts_manifest: bbox_m)
  dims: Dictionary         # designer dims; diameters used by stackDiameter (§6.2)
  nodes: [ {name, position:[3], direction:[3]} ]   # parts_manifest: {name, pos, dir}
  glb: String              # path of the mesh to show
}
```
**Lookup** of a reference string `ref` (from `parts[].variant`), first match wins:
0. (game, schema v3) if `ref` is a key of `parts_manifest.json` → `redirects` (old modern_set ids such as `cmd11`, `cmd11_ares_capsule`), replace it with the new AX id first. The viewer's `assemble.js` does not do this step (its site manifest has no redirect map), so redirected ids only resolve in a port that implements it;
1. exact `vid`;
2. case-insensitive `vid`;
3. exact part id (`tank00`), which resolves to that part's **primary** variant;
4. case-insensitive part id.

Cases 2–4 set `via` and produce the warning `"<id>" used "<ref>"; resolved to variant <vid>.` A game builder should always save exact vids.

### 2.2 Craft plan: the save format (`*.craft.json`)
```json
{
  "format": "space-sim-craft",          // optional tag (written by handoff tools; viewer ignores it)
  "version": 1,                         // optional
  "name": "Test Rocket A",
  "summary": "one line",
  "root": "tank",                       // optional; which unattached seed is the main root
  "parts": [ { "id": "tank", "variant": "tank00_kerolox_m", "note": "optional" }, ... ],
  "connections": [
    { "child": "nose", "childNode": "node_bottom", "parent": "tank", "parentNode": "node_top",
      "symmetry": 1, "rotation": 0, "offset": 0 },
    { "child": "fin", "childNode": "node_attach", "parent": "tank", "parentNode": "node_side_1",
      "symmetry": 4, "rotation": 0, "offset": 45 },
    { "child": "spoke", "childNode": "node_top", "parent": "hub", "parentNode": "node_side_1",
      "symmetry": 6, "rotation": 0, "offset": 0, "layout": "spoke" }
  ],
  "staging": [ { "stage": 1, "title": "Liftoff", "parts": ["engine"], "note": "..." } ],
  "manual": "# markdown flight manual"
}
```
| field | type | rule |
|---|---|---|
| `parts[].id` | string | `^[A-Za-z][A-Za-z0-9_-]{0,40}$` and unique. These are **seed** ids. Copies get derived ids (§5.3) and are never listed. |
| `parts[].variant` | string | a variant id (§2.1 lookup) |
| `connections[].child/parent` | string | seed ids; the child is not the parent |
| `childNode/parentNode` | string | node names that exist on those variants |
| `symmetry` | int 1–12 | default 1 |
| `offset` | number, degrees | clocking of the whole pattern about the **parent's local +Y**; default 0 |
| `rotation` | number, degrees | roll of the child about the joint axis; default 0 |
| `layout` | `"spoke"` \| `"ring"` \| absent | gravity-ring placement (§5.4) |
| `staging[]` | array | `{stage, title, parts:[seed ids], note}`, earliest first; informational |
| `manual` | string | markdown; informational |

- **Order matters only for instance order:** connections are expanded in file order for each parent. Placement does not depend on it.
- **Unknown fields are ignored.**
- **What the viewer exports:** `JSON.stringify(result.plan, null, 2)` to `<slug>.craft.json`. `result.plan` is the plan after the repair pass (§8), so exported files always have explicit `connections` in this canonical shape.
- **What the viewer imports:** this shape, or the shorthand of §8 (LLM style).
- **Interchange:** a game-saved file must use the canonical shape above, so it round-trips through the viewer unchanged.

### 2.3 Result (output)
```
Instance { id, seedId, variant(vid), partId, category, size, glb, bbox, nodes,
           matrix (4x4 column-major) | transform, position = origin, quaternion [x,y,z,w],
           parentId (instance id or null), symmetryIndex (1..n), layout (null|"spoke"|"ring") }
Joint    { parentId, childId, parentNode, childNode, position (world), parentDirection (world),
           childDirection (world), angleRad, symmetryIndex }
Result   { ok = errors.empty(), name, errors[], warnings[], instances[], joints[], plan }
```

## 3. Math primitives (implement exactly)

```
rotY(v, a):          # right-handed rotation about +Y; rotY([1,0,0], +90°) = [0,0,-1]
  c = cos a; s = sin a
  return [ c*v.x + s*v.z,  v.y,  -s*v.x + c*v.z ]

quatFromTo(a, b):    # unit a → unit b, shortest arc, [x,y,z,w]
  r = dot(a, b) + 1
  if r < 1e-8:                                    # antiparallel: 180° about a perpendicular axis
      if |a.x| > |a.z|: return normalize([-a.y, a.x, 0, 0])
      else:             return normalize([0, -a.z, a.y, 0])
  return normalize([ a.y*b.z - a.z*b.y,  a.z*b.x - a.x*b.z,  a.x*b.y - a.y*b.x,  r ])

quatAxisAngle(axis, ang) = [axis*sin(ang/2), cos(ang/2)]
quatMul(a, b)  = Hamilton product a⊗b   (apply b first, then a)
quatApply(q, v) = q v q*
compose(origin, q) = rigid transform with rotation q, translation origin
```
**The antiparallel branch is part of the spec.** It decides which way an opposite-facing part is flipped:
- **x-dominant directions:** `node_attach` (−X) onto a −X right-rail node gives a 180° turn about **Y**, so the part stays upright.
- **±Y directions:** `node_bottom` (−Y) onto a −Y underside node gives a 180° turn about **Z**.

(Fixed 2026-10-01: the viewer's ±Y branch had a typo, `[0, −a.z, a.x, 0]`, which gave a zero quaternion, so parts hung under a deck were not flipped. The test vehicles use the fixed rule.) Godot's `Quaternion(arc_from, arc_to)` and `Basis.looking_at` choose differently in this case. **Don't use them for mating.** It matches three.js `Quaternion.setFromUnitVectors`.

## 4. The mating rule

Given the parent's world transform `P`, the parent node `pn`, the child node `cn`, a pattern angle `θ` (radians) and a roll `ρ` (degrees):
```
mate(P, pn, cn, θ, ρ):
  pLocalPos = rotY(pn.position, θ)                  # clock the parent node about parent local +Y
  pLocalDir = normalize(rotY(pn.direction, θ))
  pPoint = P · pLocalPos                            # world point (P applied to a point)
  pDir   = normalize(P.basis · pLocalDir)           # world direction
  cDir   = normalize(cn.direction)
  q = quatFromTo(cDir, -pDir)                       # child node faces the parent node
  if ρ ≠ 0:  q = normalize( quatAxisAngle(pDir, radians(ρ)) ⊗ q )   # roll about the joint axis
  origin = pPoint − quatApply(q, cn.position)       # child node lands exactly on pPoint
  return Transform(rotation q, origin), pPoint, pDir, quatApply(q, cDir)
```
**Invariants**, which are what the test files check:
- `|child_world(cn.position) − pPoint| < 1e-6`;
- `dot(child_world_dir(cn.direction), pDir) < −0.999999`.

Notes:
- **Child rotation:** the child's rotation is in **world** terms. It is not composed with the parent's rotation beyond the mating itself, so the parent's roll about the joint axis is not inherited. Only the node directions and `rotation` determine the child's spin about the axis. For axisymmetric stacks this has no visible effect. To roll a whole sub-tree, use `rotation` on its top connection.
- **Clocking:** the parent node is rotated about the **parent's local +Y** (the stack axis) even when the node is not on that axis. So a side node `node_side_1` at +X, clocked by θ = 45°, ends up at `rotY(+X, 45°) = (0.707, 0, −0.707)`.

## 5. Building the instance tree

### 5.1 Roots
- **Root seeds:** seeds that are not the `child` of any accepted connection and whose variant resolved.
- **Order:** if `craft.root` names one of them it goes first; otherwise use `parts` order.
- **Placement:** the first root is placed at the **identity** transform. If there are more roots (warning: *"More than one root (…). The extra parts are laid out beside the main craft…"*), each extra root `i` gets the identity rotation at `x = maxX + 2 + span/2` (y = z = 0), where:
  - `maxX` = max over the instances already placed of `inst.position.x + bbox.x/2`;
  - `span` = `max(bbox.x or 2, bbox.z or 2)` of the new root.
- **In a game:** treat extra roots as loose parts, and keep their saved placement your own way.

### 5.2 Recursive placement
```
place(seedId, T, parentInstId, symIndex, instId, layout):
  if instances.size >= 80: truncated = true; return          # MAX_INSTANCES
  emit Instance(instId, seedId, T, parentInstId, symIndex, layout)
  for c in connections where c.parent == seedId and c is valid:      # file order
    for k in 0 .. c.symmetry-1:
      if instances.size >= 80: truncated = true; return
      childId = instanceIdFor(c.child, instId, seedId, k, c.symmetry)
      θ = radians(k * 360 / c.symmetry + c.offset)
      if c.layout == "ring":                                  # §5.4
        place(c.child, T * RotY(θ), instId, k+1, childId, "ring")
        continue
      (Tc, pPoint, pDir, cDir) = mate(T, c.parentNodeObj, c.childNodeObj, θ, c.rotation)
      emit Joint(instId, childId, c.parentNode, c.childNode, pPoint, pDir, cDir, θ, k+1)
      if c.layout != "spoke" and k == 0 and instId == seedId: sizeCheck(c)        # §6.2
      place(c.child, Tc, instId, k+1, childId, c.layout == "spoke" ? "spoke" : null)
```
- **Symmetry:** each copy is a separate mating at angle `k·360/n + offset` about the **parent's** local +Y, and the whole subtree below the child is re-placed for every copy. Example: 4 boosters each carry a nose cone, which gives 4 nose cones.
- **Nested symmetry:** a symmetry-2 child on each of the 4 copies gives 8 instances.
- **Limits:** symmetry is 1–12 (`MAX_SYMMETRY`). At most 80 instances (`MAX_INSTANCES`); at the limit placement stops with the error *"Stopped at 80 instances…"*.
- **Size check:** it runs once per connection (k = 0, first copy of the parent only).

### 5.3 Instance ids
```
instanceIdFor(seed, parentInstId, parentSeedId, k, symmetry):
  suffix = (parentInstId == parentSeedId) ? "" : parentInstId[len(parentSeedId):]
  if suffix == "":       return k == 0 ? seed : seed + "@" + (k+1)
  if symmetry <= 1:      return seed + suffix
  return seed + suffix + "~" + (k+1)          # every copy, ~1 included
```
- **Simple pattern:** `fin`, `fin@2`, `fin@3`, `fin@4`.
- **Children of copies:** a nose on each booster gives `nose`, `nose@2`, … (the suffix is inherited).
- **Nested symmetry:** a symmetry-2 `fin` on each copy of a symmetry-2 `boost` gives `fin`, `fin@2` (on `boost`) and `fin@2~1`, `fin@2~2` (on `boost@2`). Before 2026-10-01 the viewer gave the first fin on `boost@2` the id `fin@2`, which collided. `tools/test_assemble.mjs` now pins the fixed scheme.

Ids are deterministic, and the expected files use them.

### 5.4 Gravity ring layouts
- **`layout: "spoke"`:** a normal `mate()`, usually `spoke.node_top` → `hub.node_side_1` with symmetry 6. Spokes skip the size check, and overlap checks between ring and spoke instances are skipped.
- **`layout: "ring"`:** no node mating. Child transform = `T_parent * RotY(θ)`, i.e. same origin as the hub and rotated about the hub's local +Y. No joint is emitted, and the node names are kept only for the record (`node_side_1`/`node_side_1`). Ring segments are authored with their origin on the hub axis. Usually symmetry 12, with segment k at 30k°.
- **Viewer defaults:** 6 spokes and 12 segments (`craft.ring = {hub, spokes, segments}` in the shorthand).

## 6. Validation, compatibility and size matching

### 6.1 Errors (the result is not ok; bad connections are skipped)
- the plan is not an object; `parts` is missing; there are no parts
- an id fails the regex; a duplicate id
- an unknown variant (`Unknown part "<ref>" on "<id>"`). The seed is marked bad and never placed.
- a connection is missing `child`, `childNode`, `parent` or `parentNode`; a child equals its parent; an unknown child or parent id
- **a child attached more than once** (each seed has at most one parent)
- symmetry is not an integer in 1..12; `rotation` or `offset` is not a finite number
- a node name is not on the variant (the message lists the available nodes); a node direction is zero
- **a cycle** in the seed graph, which aborts placement
- no root while the parts are not all bad (*"links do not form a tree"*)
- the 80-instance limit; a valid seed that was never placed (its parent link is invalid)

### 6.2 Warnings (the craft is still built)
- **Extra roots** (§5.1). `root` names a seed that isn't unattached.
- **Stack size mismatch:** `dP = stackDiameter(parentVariant, parentNode)`, `dC = stackDiameter(childVariant, childNode)`. If both are non-null and `|dP − dC| > max(0.05, 0.08 × max(dP, dC))`, warn. This only applies when both nodes are `node_top`/`node_bottom`. `stackDiameter(v, nodeName)`:
  1. null unless `nodeName` is `node_top` or `node_bottom`
  2. `node_top` and `dims.top_diameter_m` set → use it; `node_bottom` and `dims.bottom_diameter_m` set → use it
  3. else `dims.interface_diameter_m`, else `dims.stack_diameter_m`
  4. else, if the size is an adapter `A-B` (classes XS/S/M/L/XL/XXL): the class diameter of A for `node_top`, of B for `node_bottom`
  5. else, if the size is a class (XS 0.625, S 1.25, M 2.5, L 3.75, XL 5, XXL 7.5) **and the variant has both `node_top` and `node_bottom`**: the class diameter
  6. else, if the size is a class and `dims.diameter_m` is within 20% of it: `dims.diameter_m` (single-face parts such as fairing bases and docking ports)
  7. else null (no check)
- **Crowding:** two joints on the same parent instance within 5 cm of each other.
- **Overlap:** for every pair of instances not joined parent–child (and not ring–ring, ring–spoke or spoke–ring), the world AABB overlap volume (shrunk by 0.05 m padding per side) must stay at or below 0.2 m³. Above that, warn *"Possible overlap between A and B"*. The local box:
  - **Radial parts** (a `node_attach`, no `node_top`/`node_bottom`): a box of size `bbox` centred at `attach.position − attach.direction × extent/2`, where `extent` is the bbox component along the node direction's dominant axis.
  - **Other parts with nodes:** the box is centred at the mean of the node positions. If that point is within `max(bbox)/2` of the origin, use the origin instead.
  - The 8 corners are transformed to world space and the box is re-axis-aligned.
- Also: no `connections`; no `manual`, or a non-string one; `staging` is not an array or mentions unknown ids; a variant without nodes.

### 6.3 Node compatibility: which joints are "right"
The core placement (§4–5) will mate **any** two nodes. Joints are judged by the repair pass (§8), which keeps an explicit connection **as written** ("sticky") only if it passes one of these tests. Otherwise it rebuilds the joint. **A game editor should offer only joints that pass**, so saved crafts survive a round trip through the viewer unchanged.

| child node | parent node | accept when |
|---|---|---|
| `node_bottom` / `node_top` | `node_top` / `node_bottom` | **stackJointOk**: after `mate(I, pn, cn, 0, 0)` the child's local +Y has world y ≥ 0.5 (the child stays upright, so faces that both point +Y are not mated), and the AABB overlap of the pair (padding 0.02) is < `max(0.35, 0.12 × min(boxVol(parent), boxVol(child)))` |
| `node_bottom` / `node_top` | `node_grid_R_C`, `node_under_R_C`, `node_bottom_N`, `node_payload` (**DECK_MOUNT**) | **deckJointOk**: the same overlap test (no upright test, so hanging under a deck is allowed) |
| `node_attach` | `node_side_N`, `node_wheel_N`, `node_top`, `node_bottom`, or **KIT_MOUNT**: `node_outboard[_N]`, `node_rail_l_K`/`node_rail_r_K`/`_c`, `node_grid_R_C`, `node_under_R_C`, `node_front`, `node_rear`, `node_hitch` | **radialJointOk**: overlap < `max(1.5, 0.35 × min(boxVol(parent), boxVol(child)))` |
| anything else | anything | not sticky: the repair pass may move it |

`boxVol(v)` = `max(0.001, |bbox.x × bbox.y × bbox.z|)` (1 if the variant has no bbox). `pairOverlap` places the parent at the identity, mates the child with θ = 0, and measures the overlap of their §6.2 boxes with 0.02 padding.

**Recommended rules for the game editor** (they reproduce the reference behaviour):
1. **Stack faces:** a stack face (`node_top`/`node_bottom`) mates the *opposite* stack face (bottom↔top) and the child must stay upright. The diameters should match (§6.2): **offer only same-diameter faces, or show the mismatch warning.** For a different size, use an adapter (`stage03_interstage_<top>_<bottom>`, or tank12 propellant adapters).
2. **Radial parts:** a radial part mates by `node_attach` onto side, wheel, stack or kit nodes, with symmetry and clocking.
3. **Deck parts:** deck items mate by `node_bottom` onto deck-grid or payload nodes.
4. **Ports:** `node_port_N`, `node_hatch_N`, `node_tool`, `node_foot`, `node_crew_N` and `node_attach_2` are **not structural** in the builder. Don't snap to them; docking (`node_hatch_N`, docking ports' `node_top`) is a flight-time join.
5. **One node, one child:** a node takes at most one child per symmetry angle. Two joints within 5 cm on one parent produce a warning.

### 6.4 Symmetry and clocking rules
- **Pattern angles:** `θ_k = k·360/n + offset` (degrees) about the parent's local +Y. So symmetry 2 is a left/right pair and symmetry 4 a cross; offset 45 puts the cross between a pair.
- **Shared node:** all copies use the **same** parent node, rotated. Don't pick `node_side_1..4` for a symmetry-4 group: use `node_side_1` with symmetry 4.
- **Complete rovers:** wheel hubs (`node_wheel_N`) are not evenly spaced, so wheels on a complete rover are **one connection per hub** with symmetry 1, never a symmetry group.
- **Rover kit:** the rails, front/rear and grid are also explicit nodes, so use one connection per wheel chain (see `test_vehicles/kit_rover`).
- **Clash avoidance (editor helper):** when several patterns share a parent, the repair pass picks an offset that keeps every angle ≥ 15° from the angles already used. Trials are offsets 0, 45, 30, 90, 15, 60, 20, 10; the fallback is 45. Use this as the default offset when the player adds a second symmetric group to the same parent.

## 7. Save / load contract

- **Save:** the canonical plan (§2.2) with `format: "space-sim-craft"` and `version: 1`, the seed parts in creation order and explicit connections. The viewer writes the same shape without `format`/`version`, and both are valid.
  - **Never save instances**: copies are regenerated from `symmetry`.
  - Use exact variant ids.
  - Round degrees to sensible precision; the reference stores what it was given.
- **Load:**
  1. Parse the JSON. The viewer also accepts JSON inside a markdown fence or prose, taking the first balanced `{…}` object.
  2. If `parts` is missing and `craft` holds an object, use `craft.craft`.
  3. Then run §5.
- **Stability:** the same plan always yields the same instances, ids, transforms and joints, which makes the format diff-friendly. `expected.json` stores values rounded to 1e-6.

## 8. The repair pass (optional for the game)

`assemble()` always runs `repairCraft()` first. It exists because LLM-written plans are sloppy. For a **canonical, editor-made plan whose joints all pass §6.3 it changes nothing**: the seven test vehicles re-assemble with 0 warnings, and `reference_builder.py` (no repair pass) matches them exactly. Port it only if the game must import LLM / shorthand plans. What it does:

1. **Shorthand:**
   - `stack: [nose … tail]` becomes connections `upper.node_bottom → lower.node_top`.
   - `attach: [{part, to, symmetry, offset, rotation, childNode?, parentNode?}]` becomes radial connections (default child node `node_attach`).
   - `ring: {hub, spokes, segments}` is applied with the gravity-ring rules below.
   - Aliases are accepted: `part`/`from` for child, `to`/`on` for parent, `child_node`/`fromNode`, `parent_node`/`toNode`. Numeric strings are coerced.
   - Unknown ids that are variant refs become new seeds.
2. **Node names** are canonicalised: `top`→`node_top`, `side1`/`side_1`→`node_side_1`, `wheel2`→`node_wheel_2`, case and spaces/hyphens normalised.
3. **Sizes:** when a seed's `variant` was an inexact ref (a part id), the sibling variant of the same part whose face diameter best matches the stack neighbour is chosen (within max(0.08, 8%)).
4. **Gravity ring:**
   - **Classifying parts:**
     - A *spoke part* has horizontal `node_top`/`node_bottom` (|dir.y| ≤ 0.45) that are opposite (dot < −0.95).
     - An *arc (ring segment) part* has horizontal faces that are not opposite, plus a horizontal `node_side_1`.
     - The *hub* is `ring.hub`, or else the best `hubScore`: ≥ 4 horizontal `node_side_N` and a vertical `node_top`, with a bonus for station09 (+100) and station12 (+50).
   - **Building the ring:** all existing connections touching spokes or arcs are dropped. One spoke (`node_top → hub.node_side_1`, `layout "spoke"`, symmetry = `ring.spokes` or 6, or the number of spoke seeds) and one ring connection (`node_side_1 → hub.node_side_1`, `layout "ring"`, symmetry = `ring.segments` or 12, minimum 3) are emitted. Extra spoke/arc seeds are removed.
5. **Loose power parts:** radial power parts without a parent go onto the spine (the first truss, else the hub) via `node_attach → node_side_1`, symmetry 2, offset 45° × index.
6. **Stack edges:**
   - Edges from `stack` are sticky when the upright test passes.
   - Explicit edges are sticky when `stackJointOk || deckJointOk`.
   - If any edge in a connected stack group is not sticky, the **whole group is rebuilt nose-to-tail**:
     - sort by `stackRank`: 0 chute/fairing, 1 cmd/cockpit/capsule/probe/nose, 2 tank/interstage/decoupler/separator/truss/spin_hub/hab, 3 other, 4 prop/engine;
     - ties are broken by the id hint (`upper|nose|fwd|forward` < plain < `lower|aft|tail|bottom`), then by list order;
     - each upper `node_bottom` (or `node_top`) goes on the lower `node_top` (or `node_bottom`).
7. **Radial edges:**
   - Sticky edges (radialJointOk) are kept. When no offset was given and symmetry > 1, the offset is clocked with §6.4.
   - Wheel parts with symmetry > 1 on a parent with ≥ 2 `node_wheel_N` are split into one connection per hub. New seeds are named `<id>_2`, ….
   - Other non-sticky radial parts go to a free `node_side_N`: one not taken, and not within 15° of an existing pattern. Wheels go to the next free `node_wheel_N`.
   - If no node can be found, the part is left loose ("laid out beside the craft").
8. **Output:** the canonical connections in the order stack, radial, ring, each with `symmetry`, `rotation`, `offset` and `layout`. Every change adds a warning note.

The viewer also has `planNeedsAnotherTry()`, which re-asks the LLM on errors, ≥ 8 warnings, ≥ 3 overlaps, or a mismatch / loose-part note. It is LLM-only; ignore it.

## 9. Preview rules (viewer behaviour worth copying)
- Each instance is a group whose transform is the instance matrix, with the variant's GLB loaded under it unchanged. A load failure shows a bbox placeholder.
- **Wheel replacement:** for every joint whose `parentNode` is `node_wheel_N`, hide the parent model's mesh `wheel_N`, and also its `fenders` and `suspension_arms` meshes.
- **Node markers:** a small marker per node, oriented along the direction, togglable.
- **Report:** errors and warnings, the part count and the overall size, i.e. the world AABB of the meshes.

---

## 10. GDScript porting guide

### 10.1 Type mapping
| spec | Godot 4 |
|---|---|
| vector `[x,y,z]` | `Vector3` |
| quaternion `[x,y,z,w]` | `Quaternion(x, y, z, w)`: same component order |
| `quatMul(a, b)` | `a * b`: same Hamilton order (b first) |
| `quatApply(q, v)` | `q * v` |
| `compose(origin, q)` | `Transform3D(Basis(q), origin)` |
| `rotY(v, a)` | `v.rotated(Vector3.UP, a)`, or `Basis(Vector3.UP, a) * v`: same sign (+X → −Z for a > 0) |
| `T * RotY(θ)` (ring) | `Transform3D(T.basis * Basis(Vector3.UP, θ), T.origin)` |
| world point `P · p` | `P * p` (`Transform3D * Vector3`) |
| world dir `P.basis · d` | `(P.basis * d).normalized()` |
| basis columns in expected.json | `basis.x`, `basis.y`, `basis.z` (Godot's Basis columns) |
| quaternion from basis | `t.basis.get_rotation_quaternion()` (compare up to sign) |
| `quatFromTo` | **implement by hand** (§3); don't use `Quaternion(from, to)` |

### 10.2 Suggested classes
```
PartCatalogue (RefCounted)     # loads res://parts/parts_manifest.json
  variants: Dictionary vid -> PartVariant ; parts: Dictionary id -> primary vid
  func lookup(ref: String) -> Dictionary   # {variant, via}
PartVariant (RefCounted)       # vid, part_id, category, size, bbox: Vector3, dims, nodes: Dictionary name -> PartNode, glb_path
PartNode (RefCounted)          # name, pos: Vector3, dir: Vector3
CraftPlan (RefCounted)         # name, summary, root, parts: Array[{id, variant, note}], connections: Array[Connection], staging, manual
  static func from_dict(d) / func to_dict() -> Dictionary
Connection (RefCounted)        # child, child_node, parent, parent_node, symmetry=1, rotation=0.0, offset=0.0, layout=""
CraftAssembler (RefCounted)    # pure maths: assemble(plan, catalogue) -> AssemblyResult
AssemblyResult (RefCounted)    # ok, errors, warnings, instances: Array[PlacedInstance], joints: Array[Joint]
PlacedInstance                 # id, seed_id, vid, parent_id, symmetry_index, layout, xform: Transform3D
VehicleBuilder (Node3D)        # scene side: instantiates GLBs at xform, hides replaced wheels, gizmos, picking
```
Keep `CraftAssembler` free of scene nodes so it can be unit-tested headless against `test_vehicles/`.

### 10.3 Core pseudocode (GDScript 4)
```gdscript
class_name CraftAssembler extends RefCounted

const MAX_SYMMETRY := 12
const MAX_INSTANCES := 80

static func quat_from_to(a: Vector3, b: Vector3) -> Quaternion:
	var r := a.dot(b) + 1.0
	if r < 1e-8:
		if absf(a.x) > absf(a.z):
			return Quaternion(-a.y, a.x, 0.0, 0.0).normalized()
		return Quaternion(0.0, -a.z, a.y, 0.0).normalized()
	var c := a.cross(b)
	return Quaternion(c.x, c.y, c.z, r).normalized()

# Returns [child_xform, parent_point, parent_dir, child_dir]
static func mate(parent: Transform3D, pn: PartNode, cn: PartNode, theta: float, roll_deg: float) -> Array:
	var p_local_pos := pn.pos.rotated(Vector3.UP, theta)
	var p_local_dir := pn.dir.rotated(Vector3.UP, theta).normalized()
	var p_point: Vector3 = parent * p_local_pos
	var p_dir: Vector3 = (parent.basis * p_local_dir).normalized()
	var c_dir := cn.dir.normalized()
	var q := quat_from_to(c_dir, -p_dir)
	if roll_deg != 0.0:
		q = (Quaternion(p_dir, deg_to_rad(roll_deg)) * q).normalized()
	var origin := p_point - q * cn.pos
	return [Transform3D(Basis(q), origin), p_point, p_dir, q * c_dir]

static func instance_id_for(seed_id: String, parent_inst: String, parent_seed: String, k: int, symmetry: int) -> String:
	var suffix := "" if parent_inst == parent_seed else parent_inst.substr(parent_seed.length())
	if suffix == "":
		return seed_id if k == 0 else "%s@%d" % [seed_id, k + 1]
	if symmetry <= 1:
		return seed_id + suffix
	return "%s%s~%d" % [seed_id, suffix, k + 1]

var _plan: CraftPlan
var _cat: PartCatalogue
var _seed_vid := {}            # seed id -> vid (valid seeds only)
var _conns: Array[Connection] = []   # validated, file order
var result := AssemblyResult.new()

func _place(seed_id: String, xf: Transform3D, parent_id, sym_index: int, inst_id: String, layout: String) -> void:
	if result.instances.size() >= MAX_INSTANCES:
		result.truncated = true
		return
	result.instances.append(PlacedInstance.new(inst_id, seed_id, _seed_vid[seed_id], parent_id, sym_index, layout, xf))
	for c in _conns:
		if c.parent != seed_id:
			continue
		for k in c.symmetry:
			if result.instances.size() >= MAX_INSTANCES:
				result.truncated = true
				return
			var child_id := instance_id_for(c.child, inst_id, seed_id, k, c.symmetry)
			var theta := deg_to_rad(k * 360.0 / c.symmetry + c.offset)
			if c.layout == "ring":
				_place(c.child, Transform3D(xf.basis * Basis(Vector3.UP, theta), xf.origin), inst_id, k + 1, child_id, "ring")
				continue
			var pn: PartNode = _cat.variants[_seed_vid[seed_id]].nodes[c.parent_node]
			var cn: PartNode = _cat.variants[_seed_vid[c.child]].nodes[c.child_node]
			var m := mate(xf, pn, cn, theta, c.rotation)
			result.joints.append(Joint.new(inst_id, child_id, c.parent_node, c.child_node, m[1], m[2], m[3], theta, k + 1))
			if c.layout != "spoke" and k == 0 and inst_id == seed_id:
				_size_check(c)
			_place(c.child, m[0], inst_id, k + 1, child_id, "spoke" if c.layout == "spoke" else "")

func assemble(plan: CraftPlan, cat: PartCatalogue) -> AssemblyResult:
	_plan = plan; _cat = cat
	_validate()                  # §6.1: fills _seed_vid, _conns, errors; detects cycles
	if result.has_cycle:
		return result
	var roots := _roots()        # §5.1 order (craft.root first)
	for i in roots.size():
		var xf := Transform3D.IDENTITY
		if i > 0:
			xf.origin.x = _next_root_x(roots[i])
		_place(roots[i], xf, null, 1, roots[i], "")
	if result.truncated:
		result.errors.append("Stopped at %d instances." % MAX_INSTANCES)
	_warn_crowding(); _warn_overlaps()   # §6.2 (optional for gameplay, useful in the editor)
	result.ok = result.errors.is_empty()
	return result
```
`_validate`, `_roots`, `_size_check` (`stack_diameter` §6.2) and the overlap test translate directly from §6. Port `stack_diameter` exactly if you show size warnings.

### 10.4 Editor interaction (game-side; the viewer has no drag-and-drop)
- **Picking a target:** raycast the craft, take the nearest **free, structural** parent node (§6.3) of the hit instance, and preview the held part with `mate()` at θ = offset.
- **Candidate nodes on the held part:**
  - **Stack face:** for a stack target use the held part's opposite face. For a target `node_top`, prefer the child's `node_bottom`; for a target `node_bottom`, the child's `node_top`.
  - **Radial:** for side, kit or wheel targets use `node_attach`.
  - **Deck:** for grid or payload targets use `node_bottom`.
  - **Rejection:** reject candidates that fail §6.3. Flag diameter mismatches (§6.2).
- **Controls:**
  - **Symmetry:** cycle 1, 2, 3, 4, 6, 8 (max 12). Preview all copies.
  - **Offset:** step 15° or 45°. The default is the §6.4 free offset.
  - **Rotation:** roll about the joint axis, step 15° or 90°.
- **Commit:** append `{id, variant}` to `parts` (generate an id matching the regex, e.g. `<partId>_<n>`) and the connection to `connections`. Re-run `assemble()`; it is cheap enough to call on every edit.
- **Detach:** remove the connection and the seeds of the detached subtree, or keep them as extra roots if you support loose parts. Moving a subtree means changing its top connection.
- **Re-rooting** (picking up the root) means reversing the connections along the path to the new root, and node pairs stay the same. The viewer has no such operation.

## 11. Checking the port with `test_vehicles/`

For each `X.craft.json`:
1. Assemble it with your port.
2. Load `X.expected.json`.
3. Check the counts.
4. For every expected instance, find yours by `id` and check:
   - `parentId` and `symmetryIndex` are equal;
   - `|origin − expected.origin| ≤ tolerance_m` (1e-4);
   - every basis column is within `tolerance_dir`;
   - for each listed node, `xform * node.pos` matches `nodes[].position` and `(xform.basis * node.dir).normalized()` matches `nodes[].direction`.
5. Compare **quaternions up to sign** (`q ≈ e` or `q ≈ −e`), or skip them and use the basis.
6. Check that each joint's `position`/`parentDirection` matches, that the child node lands on the joint point within 1e-6 m, and that the directions oppose (dot < −0.999999).

| file | exercises |
|---|---|
| `simple_rocket` | stack top/bottom, symmetry 4 with offset 45° on `node_side_1` (instance ids `fin@2..4`) |
| `lander` | capsule on tank, descent engine, legs symmetry 4/offset 45, RCS quads symmetry 4 on the capsule's side node |
| `station_segment` | 6-port node root, hab on top, truss below, solar wings symmetry 2 on the truss, antenna on a node side port |
| `kit_rover` | rover-kit rails (left = +X, right = −X: the antiparallel 180°-about-Y case), rail → arm → motor → wheel chains, deck-grid mounts, a light under the deck (the antiparallel ±Y case, 180° about Z) |
| `ax_ares_hopper` | AX line: landing cluster under a lander tank section, Ares capsule in the cradle, 4 AX lander legs symmetry 4 on the tank's leg hardpoints |
| `ax_capsule_stack` | AX line: Ares capsule on its service trunk (capsule `node_bottom` = heat-shield carrier land) |
| `ring_ship` | Hermes-style spine (truss, truss, spin hub, truss, ion cluster), `spoke` layout ×6 and `ring` layout ×12 on the hub, solar wings symmetry 2 and radiators symmetry 2 offset 90 on the trusses |

To regenerate the files (needs Node.js): run `node handoff/tools/build_test_vehicles.mjs`. Use `--check` to compare without writing. `python3 handoff/tools/reference_builder.py` runs the independent check.
