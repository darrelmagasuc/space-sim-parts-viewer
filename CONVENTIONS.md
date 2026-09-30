# Space Sim — Part Modelling Conventions (shared)

Applies to every part blockout (cmd*, prop*, tank*, stage*, station*, power*, rover*, jet*) so parts from different designers snap together in Godot. **This file is the single authoritative copy**; per-folder READMEs only reference it.

## Units & size classes
- **Units: metres** (CAD and Godot). Mass in tonnes in docs only.
- Stack diameters (outer skin of the stack interface):

| Class | Diameter | Notes |
|---|---|---|
| XS  | 0.625 m | probes, RCS, small tanks |
| S   | 1.25 m  | |
| M   | 2.5 m   | |
| L   | 3.75 m  | catalogue says 3.75–4.2 m; **3.75 m is the stack standard**. 4.2 m (ISS-class hab, e.g. station00) is a hull size that uses an L interface ring |
| XL  | 5.0 m   | |
| XXL | 7.5 m   | catalogue says 7.5–9 m; **7.5 m is the stack standard**; 9 m allowed as a hull size only |

Adapters exist for XS-S, S-M, M-L, L-XL, XL-XXL plus S-L and M-XL skips (catalogue §3).

## Axes
- **CAD / STEP: Z-up** (build in CadQuery/Onshape with +Z = up the stack).
- **Godot / GLB: Y-up**, right-handed, as glTF requires. Exports are rotated −90° about X:
  `Godot (X, Y, Z) = CAD (X, Z, −Y)`.
  So CAD +X stays +X, CAD +Z (up) → Godot +Y, CAD −Y (front) → Godot +Z.
- Radial / surface-mount parts: the parent (the body they attach to) is on **−X**; the part points outward along **+X**; up is +Z (CAD) / +Y (Godot).

### Vehicle & ground frames
- **Stack / flight vehicles** (rockets, capsules, spaceplanes, KSP-style): the stack axis is CAD +Z = Godot +Y and is also the **direction of flight** (nose / intake end at +Z). Aircraft parts use this frame:
  - Engines (rocket and jet): `node_top` = front / mounting face (jet intake face), `node_bottom` = nozzle exit plane; exhaust leaves along −Y (Godot), thrust pushes the vehicle toward +Y.
  - Intakes: `node_bottom` mates the engine's `node_top`.
  - Nacelle / pylon engines, wings, fins, control surfaces, gear: radial parts (root on −X, extend along +X). Wings: span +X, leading edge +Z, thickness ±Y.
- **Ground vehicles & surface modules** (rovers, habs, ISRU plants): up = CAD +Z = Godot +Y, **forward = CAD −Y = Godot +Z**, vehicle left = +X. Origin = footprint centre (X = Y = 0) at bounding-box mid-height; `node_bottom` = ground-contact plane under the origin. Long horizontal modules (habs, greenhouse, ISRU tanks) lie along X.
- Wheels are radial parts too: mounting plate on −X, axle along X. Mount on the other side by rotating 180° about Y (Godot); wheels are symmetric.

## Origin
- Origin at the part's **geometric centre on the stack axis**: X = Y = 0 on the axis (CAD), and height = midpoint of the bounding box along the axis. Side features (raceways, feedlines, latches) do not move the origin off the axis.
- Parts with no stack axis (radial decouplers, grid fins, legs): origin = bounding-box centre.
- Wall-lining parts (e.g. water-wall panels): origin on the **host hull axis** at the panel's mid-height, so it drops in concentrically.
- **Deployable parts** (chutes, HIAD, legs, grid fins) ship a stowed model and a `_deployed` model; the deployed model **reuses the stowed origin**, so swapping meshes in Godot needs no offset.

## Attach nodes
- `node_top` / `node_bottom`: on the stack axis at the top / bottom interface faces.
- `node_side_N` (N = 1…): radial nodes on the outer skin, numbered counter-clockwise from CAD +X seen from above (CAD +X, +Y, −X, −Y for four nodes).
- Extra names used when needed (keep this list short):
  - `node_attach`: surface-attach face of a radial part (points toward the parent, −X)
  - `node_payload`: payload mounting plane inside a fairing
  - `node_port_N`: fluid/electrical ports (hose couplings, cryo lines)
  - `node_foot`: ground-contact point of a deployed leg / wheel / gear
  - `node_wheel_N`: wheel hub centre (spin pivot); direction = axle, pointing outboard
  - `node_hatch_N`: pressurised crew hatch / docking collar face (habs, pressurised rovers, airlocks)
  - `node_tool`: working tip of an arm or drill (deployed pose)
- **Direction** = outward unit normal of the mating face (points away from this part, toward the part that attaches there). `node_top` → +Y (Godot), `node_bottom` → −Y. `node_attach` points toward the parent: −X for radial parts; +Z for trailing-edge control surfaces (elevons, rudders), whose parent is the wing ahead of them.
- Node data: per part, `<id>.nodes.json` in Godot Y-up metres. In the GLB, every node is also an empty `Node3D` with the same name, positioned there, with its **local +Y along the node direction**.

### Per-part node table format (use in READMEs / docs)
| node | position (x, y, z) m, Godot | direction | mates with |
|---|---|---|---|
| node_top | (0, +h/2, 0) | (0, 1, 0) | stack above |
| node_bottom | (0, −h/2, 0) | (0, −1, 0) | stack below |
| node_side_1 | (r, y, 0) | (1, 0, 0) | radial decoupler / booster |

JSON schema (`<id>.nodes.json`):
```json
{ "id": "tank00", "name": "...", "primary": "<variant id>",
  "nodes": [ {"name": "node_top", "position": [0, 3.419, 0], "direction": [0, 1, 0]} ],
  "variants": { "<variant id>": { "size": "M", "state": "flight|<pose>", "dims": {...}, "nodes": [...],
                                   "default_state": true, "files": {"step": "...", "glb": "..."} } } }
```
`state` is `flight` for the default pose of any part (including ground parts); other values name the pose (see Naming).

## Naming
- Part / file names: `<id>_<short_name>` in lower snake case, e.g. `tank00_kerolox`.
- Size variant suffix when a part has several sizes: `_<class>` (`tank00_kerolox_m`); adapters use both classes (`stage03_interstage_m_l`, top class first).
- State suffix: the first (default) pose has no suffix; every other pose is suffixed with its state name, e.g. `_deployed`, `_stowed` (when the default is deployed, like hab levelling legs), `_steer_left`, `_susp_up`, `_arm_deployed`, `_digging`, `_ab` (afterburner nozzle open), `_reverser`, `_spike_aft`, `_defl_pos` / `_defl_neg` (±25° about the hinge axis by the right-hand rule).
- **All states of a part share the default pose's origin**, and moving pieces are separate named sub-meshes (`wheel_N`, `surface`, `spike`, `reverser_sleeve`, `robotic_arm`, …), so Godot can animate them itself; the pose files are reference key-frames.
- Sub-meshes inside a GLB/STEP are named by function (`half_a`, `half_b`, `lower_ring`, `lattice_panel`, …) so Godot scripts can find jettisoned or animated pieces.

## Detail level: blockout
Model: correct silhouette, diameters and lengths, and the key recognisable features: tank domes & skirts, ring frames/stringers, intertanks, decoupler rings and latches, fairing shells (as separate halves), heat-shield dish, lattice fins, struts and pads, parachute canopies. **No fine greebles** (bolts, rivets, labels, cables, small brackets). Thin shells may be 1–6 cm thick for robust meshing.

## Exports
- STEP (Z-up) per part/variant, coloured sub-solids, for Onshape.
- GLB (Y-up) per part/variant, one mesh per sub-solid with simple PBR colours, plus node empties.
- A combined STEP per category with parts laid out in a row along +X (1 m gaps, bottoms at Z = 0) for bulk Onshape import.

## Materials
- Simple PBR colours per sub-mesh. Transparent parts (greenhouse glazing, windows if needed) use material `glass`: alpha 0.3, `alphaMode: BLEND`, double-sided.

## Internal slots (confirmed)
- **Standard slot envelope: 0.5 × 0.5 × 0.6 m (W × D × H)**, mounted by `node_bottom` at the centre of the bottom face; ports (`node_port_N`) on the top face. Slot items must stay inside the envelope (ports may stick up ≤ 0.1 m). Used by tank08 (cryocooler), rover07 (MOXIE), cmd01/cmd02/cmd10 slot bays, power05 batteries.
- **Slot classes (decided 2026-09-29, Chief Designer):** one grid unit of 0.5 × 0.5 × 0.6 m (0.15 m³); the catalogue's three classes are multiples of it, so nothing already built changes.
  - **Small** = 1 unit, 0.5 × 0.5 × 0.6 m, 0.15 m³ (catalogue's 0.1 m³ to be corrected). Examples: tank08, rover07, power04, power05 M; power05 S is a half-height Small.
  - **Medium** = 2 × 2 × 1 units, 1.0 × 1.0 × 0.6 m, 0.6 m³ (catalogue 0.5 m³). Examples: power13, power05 L.
  - **Rack** = 2 × 2 × 3 units, 1.0 × 1.0 × 1.8 m, 1.8 m³, pressurised only (catalogue 1.5 m³). Example: power12.
  - Slot bays expose a grid of units; a Medium or Rack occupies the corresponding block. The catalogue §2.1 volumes will be updated to 0.15 / 0.6 / 1.8 m³ in the next doc revision.
