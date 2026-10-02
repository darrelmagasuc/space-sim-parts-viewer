// Source definitions of the handoff test vehicles, in the save format (explicit connections).
// build_test_vehicles.mjs runs them through ../../assemble.js and writes test_vehicles/*.craft.json + *.expected.json.

export const VEHICLES = [
  {
    file: 'simple_rocket',
    craft: {
      name: 'Test Rocket A',
      summary: 'Single-stage M-class kerolox rocket: ogive nose cone, one tank, one Merlin, four fins clocked 45 degrees.',
      parts: [
        { id: 'tank', variant: 'tank00_kerolox_m', note: 'root' },
        { id: 'nose', variant: 'stage13_nose_cone_ogive_m' },
        { id: 'engine', variant: 'prop08_merlin' },
        { id: 'fin', variant: 'aero06_rocket_fin_m', note: 'symmetry 4, offset 45' }
      ],
      connections: [
        { child: 'nose', childNode: 'node_bottom', parent: 'tank', parentNode: 'node_top', symmetry: 1, rotation: 0, offset: 0 },
        { child: 'engine', childNode: 'node_top', parent: 'tank', parentNode: 'node_bottom', symmetry: 1, rotation: 0, offset: 0 },
        { child: 'fin', childNode: 'node_attach', parent: 'tank', parentNode: 'node_side_1', symmetry: 4, rotation: 0, offset: 45 }
      ],
      staging: [{ stage: 1, title: 'Liftoff', parts: ['engine'], note: 'Single stage.' }],
      manual: '# Test Rocket A\nStack along +Y: nose, tank, engine. Fins on the tank skin at 45/135/225/315 degrees.'
    }
  },
  {
    file: 'lander',
    craft: {
      name: 'Test Lander B',
      summary: 'M-class crewed lander: cabin, methalox tank, deep-throttle descent engine, four deployed legs, four RCS quads.',
      parts: [
        { id: 'tank', variant: 'tank01_methalox_m', note: 'root' },
        { id: 'cabin', variant: 'cmd09_lander_cabin' },
        { id: 'engine', variant: 'prop19_descent_engine_m' },
        { id: 'leg', variant: 'stage11_landing_leg_m_deployed', note: 'symmetry 4, offset 45' },
        { id: 'rcs', variant: 'prop00_rcs_quad', note: 'symmetry 4 on the cabin' }
      ],
      connections: [
        { child: 'cabin', childNode: 'node_bottom', parent: 'tank', parentNode: 'node_top', symmetry: 1, rotation: 0, offset: 0 },
        { child: 'engine', childNode: 'node_top', parent: 'tank', parentNode: 'node_bottom', symmetry: 1, rotation: 0, offset: 0 },
        { child: 'leg', childNode: 'node_attach', parent: 'tank', parentNode: 'node_side_1', symmetry: 4, rotation: 0, offset: 45 },
        { child: 'rcs', childNode: 'node_attach', parent: 'cabin', parentNode: 'node_side_1', symmetry: 4, rotation: 0, offset: 0 }
      ],
      staging: [{ stage: 1, title: 'Powered descent', parts: ['engine'], note: 'Throttle the descent engine; legs are already deployed.' }],
      manual: '# Test Lander B\nRoot is the tank. Legs at 45 degree offsets so they sit between the RCS quads.'
    }
  },
  {
    file: 'station_segment',
    craft: {
      name: 'Test Station Segment C',
      summary: 'L-class station segment: 6-port node, hab module on top, integrated truss below with a pair of deployed solar wings, and a radial omni antenna on a node port.',
      parts: [
        { id: 'node', variant: 'station03_node_6port', note: 'root' },
        { id: 'hab', variant: 'station00_hab_module' },
        { id: 'truss', variant: 'station07_truss_l', note: 'truss under the node' },
        { id: 'solar', variant: 'power01_solar_wing_deployed', note: 'symmetry 2 on the hab' },
        { id: 'antenna', variant: 'power10_omni_antenna', note: 'radial part on a node side port' }
      ],
      connections: [
        { child: 'hab', childNode: 'node_bottom', parent: 'node', parentNode: 'node_top', symmetry: 1, rotation: 0, offset: 0 },
        { child: 'truss', childNode: 'node_top', parent: 'node', parentNode: 'node_bottom', symmetry: 1, rotation: 0, offset: 0 },
        { child: 'solar', childNode: 'node_attach', parent: 'truss', parentNode: 'node_side_1', symmetry: 2, rotation: 0, offset: 0 },
        { child: 'antenna', childNode: 'node_attach', parent: 'node', parentNode: 'node_side_2', symmetry: 1, rotation: 0, offset: 0 }
      ],
      staging: [],
      manual: '# Test Station Segment C\nThe node is the root; the hab stacks on node_top, the truss hangs under node_bottom, the wings sit on the truss at +X / -X.'
    }
  },
  {
    file: 'kit_rover',
    craft: {
      name: 'Test Kit Rover D',
      summary: 'Rover kit: M chassis frame, four suspension arm -> hub motor -> wheel chains on the side rails, control core and antenna mast on the deck grid, a light bar hung under the deck.',
      parts: [
        { id: 'frame', variant: 'rover13_chassis_frame_m', note: 'root' },
        { id: 'armFL', variant: 'rover17_suspension_arm_m' },
        { id: 'motorFL', variant: 'rover19_hub_drive_motor_m' },
        { id: 'wheelFL', variant: 'rover04_wheel_m' },
        { id: 'armRL', variant: 'rover17_suspension_arm_m' },
        { id: 'motorRL', variant: 'rover19_hub_drive_motor_m' },
        { id: 'wheelRL', variant: 'rover04_wheel_m' },
        { id: 'armFR', variant: 'rover17_suspension_arm_m' },
        { id: 'motorFR', variant: 'rover19_hub_drive_motor_m' },
        { id: 'wheelFR', variant: 'rover04_wheel_m' },
        { id: 'armRR', variant: 'rover17_suspension_arm_m' },
        { id: 'motorRR', variant: 'rover19_hub_drive_motor_m' },
        { id: 'wheelRR', variant: 'rover04_wheel_m' },
        { id: 'core', variant: 'rover21_control_core' },
        { id: 'mast', variant: 'rover36_antenna_mast' },
        { id: 'bellyLight', variant: 'rover35_light_bar_xs', note: 'hung under the deck: exercises the +/-Y antiparallel case' }
      ],
      connections: [
        { child: 'armFL', childNode: 'node_attach', parent: 'frame', parentNode: 'node_rail_l_0', symmetry: 1, rotation: 0, offset: 0 },
        { child: 'motorFL', childNode: 'node_attach', parent: 'armFL', parentNode: 'node_outboard', symmetry: 1, rotation: 0, offset: 0 },
        { child: 'wheelFL', childNode: 'node_attach', parent: 'motorFL', parentNode: 'node_outboard', symmetry: 1, rotation: 0, offset: 0 },
        { child: 'armRL', childNode: 'node_attach', parent: 'frame', parentNode: 'node_rail_l_5', symmetry: 1, rotation: 0, offset: 0 },
        { child: 'motorRL', childNode: 'node_attach', parent: 'armRL', parentNode: 'node_outboard', symmetry: 1, rotation: 0, offset: 0 },
        { child: 'wheelRL', childNode: 'node_attach', parent: 'motorRL', parentNode: 'node_outboard', symmetry: 1, rotation: 0, offset: 0 },
        { child: 'armFR', childNode: 'node_attach', parent: 'frame', parentNode: 'node_rail_r_0', symmetry: 1, rotation: 0, offset: 0 },
        { child: 'motorFR', childNode: 'node_attach', parent: 'armFR', parentNode: 'node_outboard', symmetry: 1, rotation: 0, offset: 0 },
        { child: 'wheelFR', childNode: 'node_attach', parent: 'motorFR', parentNode: 'node_outboard', symmetry: 1, rotation: 0, offset: 0 },
        { child: 'armRR', childNode: 'node_attach', parent: 'frame', parentNode: 'node_rail_r_5', symmetry: 1, rotation: 0, offset: 0 },
        { child: 'motorRR', childNode: 'node_attach', parent: 'armRR', parentNode: 'node_outboard', symmetry: 1, rotation: 0, offset: 0 },
        { child: 'wheelRR', childNode: 'node_attach', parent: 'motorRR', parentNode: 'node_outboard', symmetry: 1, rotation: 0, offset: 0 },
        { child: 'core', childNode: 'node_bottom', parent: 'frame', parentNode: 'node_grid_2_1', symmetry: 1, rotation: 0, offset: 0 },
        { child: 'mast', childNode: 'node_bottom', parent: 'frame', parentNode: 'node_grid_5_2', symmetry: 1, rotation: 0, offset: 0 },
        { child: 'bellyLight', childNode: 'node_bottom', parent: 'frame', parentNode: 'node_under_0_2', symmetry: 1, rotation: 0, offset: 0 }
      ],
      staging: [{ stage: 1, title: 'Drive', parts: ['wheelFL', 'wheelRL', 'wheelFR', 'wheelRR'], note: 'Ground vehicle: up +Y, forward +Z, left +X.' }],
      manual: '# Test Kit Rover D\nLeft rail = +X (node_rail_l_K), right rail = -X (node_rail_r_K). Each wheel chain is rail -> arm -> motor -> wheel, one connection per link.'
    }
  },
  {
    file: 'ring_ship',
    // authored with the stack/attach/ring shorthand; the generator saves the repaired, explicit plan.
    shorthand: true,
    craft: {
      name: 'Test Ring Ship E',
      summary: 'Hermes-style spine with a spin hub, 6 spokes and a 12-segment gravity ring, deployed solar wings and radiators.',
      parts: [
        { id: 'nose', variant: 'station07_truss_l' },
        { id: 'fwd', variant: 'station07_truss_l' },
        { id: 'hub', variant: 'station09_spin_hub' },
        { id: 'aft', variant: 'station07_truss_l' },
        { id: 'engine', variant: 'prop04_ion_cluster' },
        { id: 'spoke', variant: 'station10_spoke' },
        { id: 'ring', variant: 'station11_ring_segment' },
        { id: 'solar', variant: 'power01_solar_wing_deployed' },
        { id: 'rad', variant: 'power08_radiator_l_deployed' }
      ],
      stack: ['nose', 'fwd', 'hub', 'aft', 'engine'],
      ring: { hub: 'hub', spokes: 6, segments: 12 },
      attach: [
        { part: 'solar', to: 'fwd', symmetry: 2 },
        { part: 'rad', to: 'aft', symmetry: 2, offset: 90 }
      ],
      staging: [{ stage: 1, title: 'Cruise', parts: ['engine'], note: 'Spin the ring up before the burn.' }],
      manual: '# Test Ring Ship E\nSpine along +Y. Spokes use layout "spoke", ring segments layout "ring" (rotated about the hub axis, hub origin).'
    }
  },
  {
    file: 'ax_ares_hopper',
    craft: {
      name: 'Test AX Ares Hopper F',
      summary: "AX line: Ares MDV-style hopper stack (the modern_set reference stack, re-keyed): LC-1 'Hopper' landing cluster, T-LS lander tank section, CM-8 'Ares' capsule in the cradle, four deployed LL-T L lander legs on the tank hardpoints (feet 0.82 m below the engine plate).",
      parts: [
        { id: 'tank', variant: 'ax_tank_02_lander_tank_section', note: 'root (AX-tank-02, alias tank15)' },
        { id: 'capsule', variant: 'ax_cmd_01_ares_capsule', note: 'AX-cmd-01, alias cmd11' },
        { id: 'engines', variant: 'ax_prop_02_hopper_cluster', note: 'AX-prop-02, alias prop28' },
        { id: 'leg', variant: 'ax_gear_04_lander_leg_l_deployed', note: 'AX-gear-04 L, symmetry 4 on the leg hardpoints' }
      ],
      connections: [
        { child: 'capsule', childNode: 'node_bottom', parent: 'tank', parentNode: 'node_top', symmetry: 1, rotation: 0, offset: 0 },
        { child: 'engines', childNode: 'node_top', parent: 'tank', parentNode: 'node_bottom', symmetry: 1, rotation: 0, offset: 0 },
        { child: 'leg', childNode: 'node_attach', parent: 'tank', parentNode: 'node_side_1', symmetry: 4, rotation: 0, offset: 0 }
      ],
      staging: [{ stage: 1, title: 'Hop', parts: ['engines'], note: 'Deep-throttle landing cluster; legs are already deployed.' }],
      manual: '# Test AX Ares Hopper F\nAX line ids only (old modern_set ids cmd11 / tank15 / prop28 resolve through parts_manifest.json "redirects"). Root is the tank section; capsule on node_top, engine cluster under node_bottom, legs on node_side_1..4.'
    }
  },
  {
    file: 'ax_capsule_stack',
    craft: {
      name: 'Test AX Capsule Stack G',
      summary: "AX line: CM-8 'Ares' capsule on the ST-L service trunk (Dragon-style: the trunk mates to the capsule's heat-shield carrier land; conformal solar cells + radiators, 4 Medium slots).",
      parts: [
        { id: 'capsule', variant: 'ax_cmd_01_ares_capsule', note: 'root (AX-cmd-01, alias cmd11)' },
        { id: 'trunk', variant: 'ax_cmd_12_service_trunk', note: 'AX-cmd-12 (4 Medium slots in slots.positions, jettisoned before entry)' }
      ],
      connections: [
        { child: 'trunk', childNode: 'node_top', parent: 'capsule', parentNode: 'node_bottom', symmetry: 1, rotation: 0, offset: 0 }
      ],
      staging: [{ stage: 1, title: 'Trunk sep', parts: ['trunk'], note: 'Jettison the trunk before entry; the capsule enters shield-first.' }],
      manual: '# Test AX Capsule Stack G\nCapsule node_bottom (heat-shield carrier land) -> trunk node_top. The separate HS-1 heat shield (AX-cmd-15) and the SM-L service module (AX-cmd-13) are left out: their bounding boxes are not centred between their stack nodes (shield dome / OMS nozzle hang below node_bottom), and assemble.js centres the overlap box between the nodes, so it would flag the joint as overlapping.'
    }
  }
];
