// Built-in craft plans. Variant ids are real catalogue entries; assemble.js places them.

export const EXAMPLES = [
  {
    id: 'hopper',
    title: 'Two-stage rocket',
    blurb: 'Soyuz-class capsule, kerolox core, side boosters, grid fins.',
    craft: {
      name: 'Hopper II',
      summary: 'Two-stage M-class kerolox rocket with a pair of solid boosters and grid fins on the first stage.',
      parts: [
        { id: 'lowertank', variant: 'tank00_kerolox_m', note: 'first-stage tank, root' },
        { id: 'lowereng', variant: 'prop08_merlin', note: 'first-stage engine' },
        { id: 'decoupler', variant: 'stage00_decoupler_m', note: 'stage separator' },
        { id: 'uppereng', variant: 'prop09_merlin_vac', note: 'upper-stage vacuum engine' },
        { id: 'uppertank', variant: 'tank00_kerolox_m', note: 'upper-stage tank' },
        { id: 'capsule', variant: 'cmd04_soyuz_descent', note: 'crew capsule' },
        { id: 'chute', variant: 'stage08_main_chute_m', note: 'packed main chute' },
        { id: 'srb', variant: 'prop05_srb_small', note: 'radial solid, symmetry 2' },
        { id: 'fin', variant: 'stage10_grid_fin_m_deployed', note: 'grid fin, symmetry 4, clocked 45°' }
      ],
      connections: [
        { child: 'lowereng', childNode: 'node_top', parent: 'lowertank', parentNode: 'node_bottom' },
        { child: 'decoupler', childNode: 'node_bottom', parent: 'lowertank', parentNode: 'node_top' },
        { child: 'uppereng', childNode: 'node_bottom', parent: 'decoupler', parentNode: 'node_top' },
        { child: 'uppertank', childNode: 'node_bottom', parent: 'uppereng', parentNode: 'node_top' },
        { child: 'capsule', childNode: 'node_bottom', parent: 'uppertank', parentNode: 'node_top' },
        { child: 'chute', childNode: 'node_bottom', parent: 'capsule', parentNode: 'node_top' },
        { child: 'srb', childNode: 'node_attach', parent: 'lowertank', parentNode: 'node_side_1', symmetry: 2 },
        { child: 'fin', childNode: 'node_attach', parent: 'lowertank', parentNode: 'node_side_1', symmetry: 4, offset: 45 }
      ],
      staging: [
        { stage: 1, title: 'Liftoff', parts: ['lowereng', 'srb'], note: 'Light the core and both solids together.' },
        { stage: 2, title: 'Booster sep', parts: ['srb'], note: 'Drop the solids when they burn out. The core keeps burning.' },
        { stage: 3, title: 'Stage sep', parts: ['decoupler', 'uppereng'], note: 'Cut the core, separate at the decoupler, light the vacuum engine.' },
        { stage: 4, title: 'Recovery', parts: ['chute', 'capsule'], note: 'Jettison the upper tank and deploy the chute on the capsule.' }
      ],
      manual: `# Hopper II

Two-stage kerolox launcher. Nose and flight direction are **+Y**. The root is \`lowertank\`.

## What is on it
- \`capsule\` — CM-2 Soyuz descent module. The wide end is the heat shield (−Y).
- \`chute\` — packed main chute on the capsule's \`node_top\`.
- \`uppertank\` and \`uppereng\` — upper stage. \`uppereng\` is the vacuum Merlin; its nozzle points down onto the decoupler.
- \`decoupler\` — M stack separator between the stages.
- \`lowertank\` and \`lowereng\` — first stage. \`lowereng\` is the sea-level Merlin under the tank.
- \`srb\` — two Castor solids, symmetry 2, on the core's side nodes.
- \`fin\` — four deployed grid fins, clocked 45° so they sit between the boosters.

## Staging
1. **Liftoff.** Arm \`lowereng\` and both \`srb\` copies. Pitch a few degrees toward the horizon after clearing the tower. The fins are for the first stage.
2. **Booster sep.** When the solids are spent, separate \`srb\`. Keep the core at throttle.
3. **Stage sep.** Shut down \`lowereng\`, fire \`decoupler\`, then light \`uppereng\`. Coast is fine; the vacuum nozzle is the one above the decoupler.
4. **Recovery.** Separate \`uppertank\` (and \`uppereng\` with it) from \`capsule\`. Deploy \`chute\`. The heat shield is the capsule base, already pointing −Y if you hold retrograde.

## Tips
- Every stack joint is size M (2.5 m). The solids are size S and only touch the core sideways, through \`node_attach\`.
- Do not put a second part on the same side node as a booster. The fins use the same \`node_side_1\` but with \`offset: 45\`.
`
    }
  },
  {
    id: 'mule',
    title: 'Rover',
    blurb: 'Open LRV chassis, four wheel assemblies, omni antenna.',
    craft: {
      name: 'Mule',
      summary: 'Open rover: LRV chassis with four WH-M wheels surface-mounted on the hub nodes, plus an omni antenna.',
      parts: [
        { id: 'chassis', variant: 'rover02_lrv', note: 'open rover, root' },
        { id: 'wfl', variant: 'rover04_wheel_m', note: 'front-left hub' },
        { id: 'wrl', variant: 'rover04_wheel_m', note: 'rear-left hub' },
        { id: 'wfr', variant: 'rover04_wheel_m', note: 'front-right hub' },
        { id: 'wrr', variant: 'rover04_wheel_m', note: 'rear-right hub' },
        { id: 'antenna', variant: 'power10_omni_antenna', note: 'mast on the deck node' }
      ],
      connections: [
        { child: 'wfr', childNode: 'node_attach', parent: 'chassis', parentNode: 'node_wheel_1' },
        { child: 'wrr', childNode: 'node_attach', parent: 'chassis', parentNode: 'node_wheel_2' },
        { child: 'wfl', childNode: 'node_attach', parent: 'chassis', parentNode: 'node_wheel_3' },
        { child: 'wrl', childNode: 'node_attach', parent: 'chassis', parentNode: 'node_wheel_4' },
        { child: 'antenna', childNode: 'node_attach', parent: 'chassis', parentNode: 'node_top' }
      ],
      staging: [
        { stage: 1, title: 'Drive', parts: ['chassis', 'wfl', 'wfr', 'wrl', 'wrr'], note: 'No flight stages. Power the hub motors and roll.' }
      ],
      manual: `# Mule

Surface rover. **Up is +Y, forward is +Z.** This is not a stack rocket: every joint is a surface attach.

## Layout
- \`chassis\` is the RV-3 LRV. Its \`node_wheel_N\` hubs point outboard.
- \`wfr\` / \`wrr\` are WH-M wheels on \`node_wheel_1\` and \`node_wheel_2\` (+X side).
- \`wfl\` / \`wrl\` are the −X pair (\`node_wheel_3\`, \`node_wheel_4\`). The snap turns those wheels 180° about Y so the axle still points outboard. Wheels are symmetric, so that flip is the correct other side.
- \`antenna\` is the omni mast. Its \`node_attach\` sits on \`chassis.node_top\`, which is the deck fitting aft of the seats (−Z). The mast stands up (+Y).

The preview hides the chassis meshes named \`wheel_1\` … \`wheel_4\` when a part is snapped to that hub, so the separate wheel assemblies are the ones you see.

## Driving
1. Treat \`node_bottom\` as the ground frame under the chassis. Do not attach a flight stage there.
2. Roll along +Z. The four wheels are independent instances, not a symmetry copy, because each hub is in a different place.
3. \`antenna\` is a short local antenna, not a high-gain dish. It rides with the chassis.

## Tips
- A \`*_steer_left\` wheel variant exists if you want a posed front wheel. This plan uses the flight pose.
- The mount plate of WH-M is \`node_attach\`. Snapping the hub node instead would fight the outward normals (both point outboard).
`
    }
  },
  {
    id: 'sparrow',
    title: 'Spaceplane',
    blurb: 'S-class fighter nose, tank fuselage, tail turbojet, swept wings.',
    craft: {
      name: 'Sparrow',
      summary: 'Small S-class spaceplane: fighter cockpit, kerolox-tank fuselage, tail turbojet, and a symmetric swept wing.',
      parts: [
        { id: 'fuselage', variant: 'tank00_kerolox_s', note: 'fuselage tank, root' },
        { id: 'nose', variant: 'cockpit00_fighter_canopy', note: 'single-seat nose' },
        { id: 'engine', variant: 'jet00_turbojet', note: 'tail turbojet' },
        { id: 'wing', variant: 'jet08_wing_swept_s', note: 'swept panel, symmetry 2' }
      ],
      connections: [
        { child: 'nose', childNode: 'node_bottom', parent: 'fuselage', parentNode: 'node_top' },
        { child: 'engine', childNode: 'node_top', parent: 'fuselage', parentNode: 'node_bottom' },
        { child: 'wing', childNode: 'node_attach', parent: 'fuselage', parentNode: 'node_side_1', symmetry: 2 }
      ],
      staging: [
        { stage: 1, title: 'Takeoff', parts: ['engine'], note: 'Light the turbojet. There is no separate booster stage.' },
        { stage: 2, title: 'Climb', parts: ['nose', 'wing'], note: 'Hold the nose on +Y and let the wings lift.' }
      ],
      manual: `# Sparrow

Small spaceplane. **Forward is +Y**, same axis as a rocket stack. The fuselage is an S kerolox tank used as a body, not a wing tank.

## Layout
- \`nose\` — CK-1 single-seat cockpit. \`node_bottom\` is the aft ring and mates \`fuselage.node_top\`, so the canopy points forward.
- \`fuselage\` — T-K1 size S. Side nodes are on the skin at mid-length.
- \`engine\` — JT-1 turbojet in the tail. \`node_top\` is the front flange and mates \`fuselage.node_bottom\`. Exhaust leaves along −Y.
- \`wing\` — WG-1 swept panel, size S, symmetry 2 on \`node_side_1\`. The second copy is spun 180° about Y: span goes out the other side and the leading edge stays forward.

## Flying it
1. Light \`engine\`. This blockout has no separate intake part; the cockpit closes the nose, and the jet's front face is against the tank.
2. Rotate gently once you have speed. The wings are at the tank's side nodes, about the middle of the body.
3. There is no landing gear on this plan. Cut the throttle and hold a nose-up attitude for a belly landing on the tank.
4. The tank is the whole fuel load. When it is dry the turbojet quits; there is no second stage.

## Tips
- Keep stack classes on S. The cockpit, tank, and jet are all size S (1.25 m class). The wing is a radial part and does not use a stack face.
- Do not attach the wing with symmetry 1 on both \`node_side_1\` and \`node_side_3\` unless you also set the twist yourself. Symmetry 2 already builds the pair.
`
    }
  }
];

export function exampleById(id) {
  return EXAMPLES.find(e => e.id === id) || null;
}
