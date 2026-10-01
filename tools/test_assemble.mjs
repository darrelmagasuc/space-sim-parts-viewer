import { readFileSync } from 'node:fs';
import { assemble, nodeInWorld, parseCraftJSON, planNeedsAnotherTry } from '../assemble.js';
import { buildCatalogue } from '../catalogue.js';
import { EXAMPLES } from '../examples.js';

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const cat = buildCatalogue(manifest);
let failed = 0;
function assert(cond, msg) {
  if (!cond) { failed++; console.error('FAIL', msg); }
  else console.log('ok', msg);
}
function close(a, b, eps, msg) {
  const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  assert(d < eps, `${msg} (distance ${d})`);
}

const prompt = cat.promptText();
console.log(`catalogue parts ${cat.partCount}, variants ${cat.variantCount}, prompt ${prompt.length} chars`);
let vids = 0;
for (const c of manifest.categories) for (const p of c.parts) for (const v of p.variants) {
  vids++;
  if (!prompt.includes(v.vid)) { failed++; console.error('FAIL missing from prompt', v.vid); }
}
assert(vids === cat.variantCount, `prompt lists all ${vids} variants`);
assert(prompt.includes('node_payload') && prompt.includes('node_wheel_1'), 'prompt includes special node names');
assert(prompt.includes('CRAFT') || prompt.includes('"connections"'), 'prompt documents the schema');

function checkJoints(name, result) {
  assert(result.ok, `${name} assembles without errors: ${result.errors.map(e => e.message).join('; ')}`);
  for (const j of result.joints) {
    const parent = result.instances.find(i => i.id === j.parentId);
    const child = result.instances.find(i => i.id === j.childId);
    assert(!!parent && !!child, `${name} joint ${j.childId} has both instances`);
    if (!parent || !child) continue;
    const pn = parent.nodes.find(n => n.name === j.parentNode);
    const cn = child.nodes.find(n => n.name === j.childNode);
    const pw = nodeInWorld(parent.matrix, pn, j.angleRad);
    const cw = nodeInWorld(child.matrix, cn, 0);
    close(pw.position, cw.position, 1e-4, `${name} ${j.childId} sits on ${j.parentId}.${j.parentNode}`);
    const dot = pw.direction[0] * cw.direction[0] + pw.direction[1] * cw.direction[1] + pw.direction[2] * cw.direction[2];
    assert(dot < -0.999, `${name} ${j.childId} direction opposes parent (dot ${dot.toFixed(4)})`);
  }
}

for (const ex of EXAMPLES) {
  const result = assemble(ex.craft, cat);
  console.log(`\n== ${ex.id} instances ${result.instances.length} warnings ${result.warnings.length}`);
  for (const w of result.warnings) console.log('  warn:', w.message);
  for (const i of result.instances) console.log(`  ${i.id.padEnd(16)} ${i.variant.padEnd(32)} y=${i.position[1].toFixed(2)} x=${i.position[0].toFixed(2)} z=${i.position[2].toFixed(2)}`);
  checkJoints(ex.id, result);
  assert(result.warnings.length === 0, `${ex.id} example has no warnings`);
}

const hopper = assemble(EXAMPLES[0].craft, cat);
const yOf = id => hopper.instances.find(i => i.id === id).position[1];
assert(yOf('capsule') > yOf('uppertank'), 'capsule is forward of the upper tank');
assert(yOf('uppertank') > yOf('lowertank'), 'upper tank is forward of the lower tank');
assert(yOf('lowereng') < yOf('lowertank'), 'first-stage engine is aft of the lower tank');
assert(yOf('chute') > yOf('capsule'), 'chute is on the nose');
const srb = hopper.instances.find(i => i.id === 'srb');
const srb2 = hopper.instances.find(i => i.id === 'srb@2');
assert(srb && srb2 && srb.position[0] * srb2.position[0] < 0, 'boosters sit on opposite sides');
const fins = hopper.instances.filter(i => i.seedId === 'fin');
assert(fins.length === 4, 'four grid fins');
assert(fins.every(f => Math.abs(f.position[0]) > 0.2 && Math.abs(f.position[2]) > 0.2), 'fins are clocked off the booster axes');

const sparrow = assemble(EXAMPLES[2].craft, cat);
const wingR = sparrow.instances.find(i => i.id === 'wing');
const wingL = sparrow.instances.find(i => i.id === 'wing@2');
assert(wingR.position[0] > 0 && wingL.position[0] < 0, 'wings extend to opposite sides');
assert(yOf === yOf || sparrow.instances.find(i => i.id === 'nose').position[1] > sparrow.instances.find(i => i.id === 'engine').position[1], 'nose is forward of the engine');
assert(sparrow.instances.find(i => i.id === 'nose').position[1] > sparrow.instances.find(i => i.id === 'fuselage').position[1], 'cockpit is forward of the fuselage');
assert(sparrow.instances.find(i => i.id === 'engine').position[1] < sparrow.instances.find(i => i.id === 'fuselage').position[1], 'jet is aft of the fuselage');

const mule = assemble(EXAMPLES[1].craft, cat);
assert(mule.instances.filter(i => i.seedId === 'wfl' || i.variant.startsWith('rover04')).length === 4, 'four wheels');
const ant = mule.instances.find(i => i.id === 'antenna');
const chassis = mule.instances.find(i => i.id === 'chassis');
assert(ant.position[1] > chassis.position[1], 'antenna stands above the chassis origin');

const mismatch = assemble({
  name: 'mismatch',
  parts: [
    { id: 'tank', variant: 'tank00_kerolox_m' },
    { id: 'eng', variant: 'prop07_kestrel' }
  ],
  connections: [{ child: 'eng', childNode: 'node_top', parent: 'tank', parentNode: 'node_bottom' }],
  manual: 'x'
}, cat);
assert(mismatch.ok, 'size mismatch still places the craft');
assert(mismatch.warnings.some(w => /size mismatch/i.test(w.message)), 'size mismatch warns: ' + mismatch.warnings.map(w => w.message).join(' | '));
checkJoints('mismatch', mismatch);

const doubled = assemble({
  name: 'doubled',
  parts: [
    { id: 'tank', variant: 'tank00_kerolox_s' },
    { id: 'a', variant: 'prop07_kestrel' },
    { id: 'b', variant: 'prop13_rl10' }
  ],
  connections: [
    { child: 'a', childNode: 'node_top', parent: 'tank', parentNode: 'node_bottom' },
    { child: 'b', childNode: 'node_top', parent: 'tank', parentNode: 'node_bottom' }
  ],
  manual: 'x'
}, cat);
assert(doubled.warnings.some(w => /within 5 cm/i.test(w.message)), 'double occupancy warns');
assert(doubled.warnings.some(w => /overlap/i.test(w.message)), 'coincident parts warn about overlap');

const unknown = assemble({ name: 'nope', parts: [{ id: 'a', variant: 'not_a_real_part' }], connections: [], manual: '' }, cat);
assert(!unknown.ok && unknown.errors.some(e => /unknown part/i.test(e.message)), 'unknown variant is an error');
assert(unknown.instances.length === 0, 'unknown variant places nothing');

const badNode = assemble({
  name: 'badnode',
  parts: [
    { id: 'tank', variant: 'tank00_kerolox_s' },
    { id: 'eng', variant: 'prop07_kestrel' }
  ],
  connections: [{ child: 'eng', childNode: 'node_nope', parent: 'tank', parentNode: 'node_bottom' }],
  manual: 'm'
}, cat);
assert(badNode.ok, 'unknown node is repaired instead of dropping the part: ' + badNode.errors.map(e => e.message).join('; '));
assert(badNode.instances.some(i => i.id === 'eng') && badNode.instances.some(i => i.id === 'tank'), 'both parts place when the node name is wrong');
assert(badNode.instances.find(i => i.id === 'tank').position[1] > badNode.instances.find(i => i.id === 'eng').position[1], 'repaired engine sits under the tank');
assert(badNode.warnings.some(w => /nose-to-tail|node_nope|Rebuilt/i.test(w.message)), 'repair is reported');

let threw = false;
try { assemble({ parts: [{ id: 'a', variant: 'nope' }], connections: [{ child: 'a', parent: 'a', childNode: 'node_top', parentNode: 'node_bottom' }] }, cat); }
catch { threw = true; }
assert(!threw, 'invalid plan does not throw');

const cycle = assemble({
  name: 'cycle',
  parts: [
    { id: 'a', variant: 'tank00_kerolox_s' },
    { id: 'b', variant: 'tank00_kerolox_s' }
  ],
  connections: [
    { child: 'b', childNode: 'node_bottom', parent: 'a', parentNode: 'node_top' },
    { child: 'a', childNode: 'node_bottom', parent: 'b', parentNode: 'node_top' }
  ],
  manual: 'm'
}, cat);
assert(!cycle.ok && /cycle/i.test(cycle.errors.map(e => e.message).join(' ')), 'cycle is an error');

const adapt = assemble({
  name: 'adapt',
  parts: [
    { id: 'top', variant: 'tank00_kerolox_s' },
    { id: 'ad', variant: 'stage03_interstage_s_m' },
    { id: 'bot', variant: 'tank00_kerolox_m' }
  ],
  connections: [
    { child: 'ad', childNode: 'node_top', parent: 'top', parentNode: 'node_bottom' },
    { child: 'bot', childNode: 'node_top', parent: 'ad', parentNode: 'node_bottom' }
  ],
  manual: 'm'
}, cat);
assert(adapt.ok && !adapt.warnings.some(w => /mismatch/i.test(w.message)), 'adapter faces match S and M: ' + adapt.warnings.map(w => w.message).join('; '));

const resolved = assemble({
  name: 'alias',
  parts: [{ id: 'core', variant: 'tank00' }],
  connections: [],
  manual: 'm'
}, cat);
assert(resolved.ok && resolved.instances[0].variant === 'tank00_kerolox_m', 'part id resolves to the primary variant');
assert(resolved.warnings.some(w => /resolved/i.test(w.message)), 'resolution warns');

const jumbled = assemble({
  name: 'Jumbled hopper',
  parts: [
    { id: 'chute', variant: 'stage08_main_chute_m' },
    { id: 'capsule', variant: 'cmd04_soyuz_descent' },
    { id: 'uppertank', variant: 'tank00_kerolox_m' },
    { id: 'tank', variant: 'tank00_kerolox_m' },
    { id: 'engine', variant: 'prop08_merlin' },
    { id: 'booster', variant: 'prop05_srb_small' },
    { id: 'fin', variant: 'stage10_grid_fin_m_deployed' },
    { id: 'antenna', variant: 'power10_omni_antenna' }
  ],
  connections: [
    { child: 'capsule', childNode: 'node_top', parent: 'tank', parentNode: 'node_top' },
    { child: 'uppertank', childNode: 'node_top', parent: 'capsule', parentNode: 'node_bottom' },
    { child: 'engine', childNode: 'node_bottom', parent: 'tank', parentNode: 'node_bottom' },
    { child: 'chute', childNode: 'node_top', parent: 'capsule', parentNode: 'node_top' },
    { child: 'booster', childNode: 'node_bottom', parent: 'tank', parentNode: 'node_side_1', symmetry: 2 },
    { child: 'fin', childNode: 'node_attach', parent: 'tank', parentNode: 'node_side_1', symmetry: 4 },
    { child: 'antenna', childNode: 'node_bottom', parent: 'tank', parentNode: 'node_top' }
  ],
  manual: 'm'
}, cat);
const jy = id => jumbled.instances.find(i => i.id === id).position[1];
assert(jumbled.ok && jumbled.instances.length >= 11, 'backwards joints still place the rocket: ' + jumbled.errors.map(e => e.message).join('; '));
assert(jy('engine') < jy('tank') && jy('tank') < jy('uppertank') && jy('uppertank') < jy('capsule') && jy('capsule') < jy('chute'), 'rebuilt stack runs engine, tanks, capsule, chute');
const jb = jumbled.instances.filter(i => i.seedId === 'booster');
assert(jb.length === 2 && jb[0].position[0] * jb[1].position[0] < 0, 'boosters end up on opposite sides');
assert(!jumbled.warnings.some(w => /40|through each other/.test(w.message)) && !jumbled.warnings.some(w => /overlap/i.test(w.message) && /tank and uppertank/.test(w.message)), 'tanks are not driven through each other');
const heavy = jumbled.warnings.filter(w => /overlap/i.test(w.message) && parseFloat((w.message.match(/([\d.]+) m³/) || [])[1] || '0') > 1);
assert(heavy.length === 0, 'no multi-cubic-metre overlaps: ' + jumbled.warnings.map(w => w.message).join(' | '));

const stacked = assemble({
  name: 'stack',
  parts: [
    { id: 'chute', variant: 'stage08_main_chute_m' },
    { id: 'capsule', variant: 'cmd04_soyuz_descent' },
    { id: 'tank', variant: 'tank00_kerolox_m' },
    { id: 'engine', variant: 'prop08_merlin' },
    { id: 'booster', variant: 'prop05_srb_small' },
    { id: 'fin', variant: 'stage10_grid_fin_m_deployed' }
  ],
  stack: ['chute', 'capsule', 'tank', 'engine'],
  attach: [
    { part: 'booster', to: 'tank', symmetry: 2 },
    { part: 'fin', to: 'tank', symmetry: 4, offset: 45 }
  ],
  manual: 'm'
}, cat);
const sy = id => stacked.instances.find(i => i.id === id).position[1];
assert(stacked.ok && stacked.warnings.length === 0, 'explicit stack and attach need no repair notes: ' + stacked.warnings.map(w => w.message).join(' | '));
assert(sy('engine') < sy('tank') && sy('tank') < sy('capsule') && sy('capsule') < sy('chute'), 'stack array is nose to tail');
const finsS = stacked.instances.filter(i => i.seedId === 'fin');
assert(finsS.length === 4 && finsS.every(f => Math.abs(f.position[0]) > 0.2 && Math.abs(f.position[2]) > 0.2), 'stack-schema fins stay clocked between the boosters');

const bare = assemble({
  name: 'bare',
  parts: [
    { id: 'nose', variant: 'cmd04_soyuz_descent' },
    { id: 'tank', variant: 'tank00' },
    { id: 'eng', variant: 'prop08_merlin' },
    { id: 'booster', variant: 'prop05_srb_small' }
  ],
  connections: [
    { child: 'eng', parent: 'tank' },
    { child: 'nose', parent: 'tank' },
    { child: 'booster', parent: 'tank', symmetry: '2' }
  ],
  manual: 'm'
}, cat);
assert(bare.ok, 'parent/child without nodes assembles');
assert(bare.instances.find(i => i.id === 'nose').position[1] > bare.instances.find(i => i.id === 'tank').position[1], 'nose is placed above the tank');
assert(bare.instances.find(i => i.id === 'eng').position[1] < bare.instances.find(i => i.id === 'tank').position[1], 'engine is placed under the tank');
assert(bare.instances.filter(i => i.seedId === 'booster').length === 2, 'string symmetry still copies the booster');

const sized = assemble({
  name: 'sized',
  parts: [
    { id: 'tank', variant: 'tank00' },
    { id: 'eng', variant: 'prop07_kestrel' }
  ],
  connections: [{ child: 'eng', parent: 'tank' }],
  manual: 'm'
}, cat);
assert(sized.instances.find(i => i.id === 'tank').variant === 'tank00_kerolox_s', 'inexact tank id picks the engine size');

const loose = assemble({
  name: 'loose',
  parts: [
    { id: 'a', variant: 'tank00_kerolox_m' },
    { id: 'b', variant: 'cmd04_soyuz_descent' },
    { id: 'c', variant: 'power10_omni_antenna' }
  ],
  manual: 'm'
}, cat);
const xs = loose.instances.map(i => i.position[0]).sort((a, b) => a - b);
assert(loose.ok && loose.instances.length === 3, 'unconnected parts are still shown');
assert(xs[1] - xs[0] > 2 && xs[2] - xs[1] > 2, 'unconnected parts are spaced apart, not piled at the origin');
assert(loose.warnings.some(w => /laid out beside/i.test(w.message)), 'unconnected parts warn');

const wheels = assemble({
  name: 'wheels',
  parts: [
    { id: 'chassis', variant: 'rover02_lrv' },
    { id: 'wheel', variant: 'rover04_wheel_m' }
  ],
  connections: [{ child: 'wheel', parent: 'chassis', symmetry: 4 }],
  manual: 'm'
}, cat);
assert(wheels.instances.filter(i => i.variant === 'rover04_wheel_m').length === 4, 'wheel symmetry is split onto the four hubs');
const hubs = wheels.instances.filter(i => i.variant === 'rover04_wheel_m').map(i => [i.position[0], i.position[2]]);
const signs = new Set(hubs.map(([x, z]) => (x > 0 ? 'R' : 'L') + (z > 0 ? 'F' : 'B')));
assert(signs.size === 4, 'the four wheels sit in four quadrants');

const hermes = {
  name: 'Hermes Mars Cruiser',
  summary: 'Interplanetary ship with a gravity ring.',
  parts: [
    { id: 'hub', variant: 'station09_spin_hub' },
    { id: 'fwd', variant: 'station07_truss_l' },
    { id: 'mid', variant: 'station07_truss_l' },
    { id: 'aft', variant: 'station07_truss_l' },
    { id: 'spoke1', variant: 'station10_spoke' },
    { id: 'spoke2', variant: 'station10_spoke' },
    { id: 'spoke3', variant: 'station10_spoke' },
    { id: 'spoke4', variant: 'station10_spoke' },
    { id: 'seg1', variant: 'station11_ring_segment' },
    { id: 'seg2', variant: 'station11_ring_segment' },
    { id: 'seg3', variant: 'station11_ring_segment' },
    { id: 'seg4', variant: 'station11_ring_segment' },
    { id: 'hab', variant: 'station00_hab_module' },
    { id: 'hab2', variant: 'station02_b330' },
    { id: 'solar', variant: 'power01_solar_wing' },
    { id: 'solar2', variant: 'power01_solar_wing' },
    { id: 'rad', variant: 'power08_radiator_l' },
    { id: 'engine', variant: 'prop04_ion_cluster' },
    { id: 'tank', variant: 'tank04_xenon_copv_s' }
  ],
  connections: [
    { child: 'fwd', childNode: 'node_side_1', parent: 'hub', parentNode: 'node_side_2' },
    { child: 'mid', childNode: 'node_top', parent: 'hub', parentNode: 'node_side_3' },
    { child: 'aft', childNode: 'node_bottom', parent: 'hub', parentNode: 'node_side_4' },
    { child: 'spoke1', childNode: 'node_side_1', parent: 'hub', parentNode: 'node_side_1' },
    { child: 'spoke2', childNode: 'node_bottom', parent: 'hub', parentNode: 'node_side_2' },
    { child: 'spoke3', childNode: 'node_top', parent: 'hub', parentNode: 'node_top' },
    { child: 'spoke4', childNode: 'node_bottom', parent: 'spoke1', parentNode: 'node_bottom' },
    { child: 'seg1', childNode: 'node_side_1', parent: 'hub', parentNode: 'node_side_1' },
    { child: 'seg2', childNode: 'node_top', parent: 'seg1', parentNode: 'node_bottom' },
    { child: 'seg3', childNode: 'node_bottom', parent: 'seg2', parentNode: 'node_top' },
    { child: 'seg4', childNode: 'node_side_1', parent: 'hub', parentNode: 'node_side_5' },
    { child: 'hab', childNode: 'node_side_1', parent: 'hub', parentNode: 'node_side_1' },
    { child: 'hab2', childNode: 'node_bottom', parent: 'hab', parentNode: 'node_side_1' },
    { child: 'engine', childNode: 'node_side_1', parent: 'aft', parentNode: 'node_side_1' },
    { child: 'tank', childNode: 'node_bottom', parent: 'engine', parentNode: 'node_top' }
  ],
  manual: 'Coast to Mars.'
};
const hermesResult = assemble(hermes, cat);
console.log(`\n== hermes instances ${hermesResult.instances.length} warnings ${hermesResult.warnings.length}`);
for (const w of hermesResult.warnings) console.log('  warn:', w.message);
for (const i of hermesResult.instances) console.log(`  ${i.id.padEnd(16)} ${i.variant.padEnd(28)} y=${i.position[1].toFixed(2)} x=${i.position[0].toFixed(2)} z=${i.position[2].toFixed(2)} layout=${i.layout || ''}`);
assert(hermesResult.ok, 'messy Hermes plan places: ' + hermesResult.errors.map(e => e.message).join('; '));
const spineIds = ['fwd', 'mid', 'aft', 'hub', 'hab', 'hab2', 'engine', 'tank'];
const spine = spineIds.map(id => hermesResult.instances.find(i => i.id === id));
assert(spine.every(Boolean), 'spine parts are all placed');
const spineX = spine.map(i => i.position[0]);
const spineZ = spine.map(i => i.position[2]);
const spineY = spine.map(i => i.position[1]);
assert(Math.max(...spineX) - Math.min(...spineX) < 4 && Math.max(...spineZ) - Math.min(...spineZ) < 4, 'spine stays on one axis, not spread across the ground');
assert(Math.max(...spineY) - Math.min(...spineY) > 20, 'spine runs a long way along +Y');
assert(hermesResult.instances.find(i => i.id === 'engine').position[1] < hermesResult.instances.find(i => i.id === 'hub').position[1], 'engine is aft of the hub');
const spokes = hermesResult.instances.filter(i => i.variant === 'station10_spoke');
assert(spokes.length === 4, 'four listed spokes become one radial pattern');
const spokeR = spokes.map(i => Math.hypot(i.position[0] - hermesResult.instances.find(p => p.id === 'hub').position[0], i.position[2] - hermesResult.instances.find(p => p.id === 'hub').position[2]));
assert(spokeR.every(r => r < 1), 'spoke origins stay on the hub axis');
const spokeAng = spokes.map(i => Math.atan2(i.matrix[2], i.matrix[0]));
const spokeSpread = new Set(spokeAng.map(a => Math.round(((a * 180 / Math.PI) % 360 + 360) % 360 / 20)));
assert(spokeSpread.size === 4, 'spokes are clocked apart, not stacked');
const segs = hermesResult.instances.filter(i => i.variant === 'station11_ring_segment');
assert(segs.length === 12, 'four listed segments become a full ring of 12');
const hubPos = hermesResult.instances.find(i => i.id === 'hub').position;
const segR = segs.map(i => {
  const port = i.nodes.find(n => n.name === 'node_side_1');
  const world = nodeInWorld(i.matrix, port, 0).position;
  return Math.hypot(world[0] - hubPos[0], world[2] - hubPos[2]);
});
assert(segR.every(r => r > 22 && r < 24), 'ring ports sit on the spoke circle: ' + segR.map(r => r.toFixed(2)).join(', '));
const segAng = segs.map(i => Math.atan2(i.matrix[14] === i.matrix[14] ? nodeInWorld(i.matrix, i.nodes.find(n => n.name === 'node_side_1'), 0).position[2] - hubPos[2] : 0, nodeInWorld(i.matrix, i.nodes.find(n => n.name === 'node_side_1'), 0).position[0] - hubPos[0]));
const segBuckets = new Set(segAng.map(a => Math.round(((a * 180 / Math.PI) % 360 + 360) % 360 / 20)));
assert(segBuckets.size >= 10, 'ring segments go around the hub');
const solars = hermesResult.instances.filter(i => i.variant === 'power01_solar_wing' || i.variant === 'power08_radiator_l');
assert(solars.length === 6, 'solar wings and the radiator are patterned onto the spine');
const trussY = hermesResult.instances.filter(i => i.variant === 'station07_truss_l').map(i => i.position[1]);
assert(solars.every(i => trussY.some(y => Math.abs(i.position[1] - y) < 8)), 'power parts sit on a truss, not in a row at the origin');
assert(!hermesResult.warnings.some(w => /laid out beside/i.test(w.message)), 'Hermes parts are not parked beside the craft');
assert(!hermesResult.warnings.some(w => /within 5 cm/i.test(w.message)), 'Hermes parts do not share a node');
const hermesHeavy = hermesResult.warnings.filter(w => /overlap/i.test(w.message) && parseFloat((w.message.match(/about ([\d.]+) m³/) || [])[1] || '0') > 20);
assert(hermesHeavy.length === 0, 'Hermes has no large overlaps: ' + hermesResult.warnings.filter(w => /overlap/i.test(w.message)).map(w => w.message).join(' | '));
assert(planNeedsAnotherTry(hermesResult), 'a Hermes plan that still carries a pile of warnings is sent back');

const hermesClean = assemble({
  name: 'Hermes',
  parts: [
    { id: 'nose', variant: 'station07_truss_l' },
    { id: 'fwd', variant: 'station07_truss_l' },
    { id: 'hub', variant: 'station09_spin_hub' },
    { id: 'aft', variant: 'station07_truss_l' },
    { id: 'tail', variant: 'station07_truss_l' },
    { id: 'engine', variant: 'prop04_ion_cluster' },
    { id: 'spoke', variant: 'station10_spoke' },
    { id: 'ring', variant: 'station11_ring_segment' },
    { id: 'solar', variant: 'power01_solar_wing_deployed' },
    { id: 'rad', variant: 'power08_radiator_l_deployed' }
  ],
  stack: ['nose', 'fwd', 'hub', 'aft', 'tail', 'engine'],
  ring: { hub: 'hub', spokes: 6, segments: 12 },
  attach: [
    { part: 'solar', to: 'fwd', symmetry: 2 },
    { part: 'rad', to: 'aft', symmetry: 2, offset: 90 }
  ],
  manual: 'Spin the ring up before the Mars burn.'
}, cat);
console.log(`\n== hermes clean warnings ${hermesClean.warnings.length}`);
for (const w of hermesClean.warnings) console.log('  warn:', w.message);
assert(hermesClean.ok && hermesClean.instances.filter(i => i.variant === 'station10_spoke').length === 6, 'clean Hermes has six spokes');
assert(hermesClean.instances.filter(i => i.layout === 'ring').length === 12, 'clean Hermes has twelve ring segments');
assert(hermesClean.instances.find(i => i.id === 'engine').position[1] < hermesClean.instances.find(i => i.id === 'hub').position[1], 'clean Hermes engine is aft');
assert(hermesClean.instances.find(i => i.id === 'nose').position[1] > hermesClean.instances.find(i => i.id === 'hub').position[1], 'clean Hermes nose is forward');
assert(hermesClean.warnings.length === 0, 'an explicit ring needs no repair notes: ' + hermesClean.warnings.map(w => w.message).join(' | '));
assert(!planNeedsAnotherTry(hermesClean), 'a formed ring is not sent back to the model: ' + hermesClean.warnings.map(w => w.message).join(' | '));

assert(planNeedsAnotherTry({ errors: [], warnings: Array.from({ length: 35 }, () => ({ message: 'note' })) }), '35 warnings with 0 errors asks for another try');
assert(!planNeedsAnotherTry({ errors: [], warnings: [] }), 'no warnings does not retry');
assert(!planNeedsAnotherTry(hopper), 'hopper example does not retry');
assert(planNeedsAnotherTry({ errors: [{ message: 'bad' }], warnings: [] }), 'errors ask for another try');
assert(planNeedsAnotherTry({ errors: [], warnings: [{ message: 'Possible overlap a' }, { message: 'Possible overlap b' }, { message: 'Possible overlap c' }] }), 'three overlaps ask for another try');
assert(!planNeedsAnotherTry({ errors: [], warnings: [{ message: 'Possible overlap between fin and tank (about 0.40 m³).' }] }), 'one graze overlap does not replace a good craft');

const kit = assemble({
  name: 'kit rover',
  parts: [
    { id: 'frame', variant: 'rover13_chassis_frame_m' },
    { id: 'arm', variant: 'rover17_suspension_arm_m' },
    { id: 'motor', variant: 'rover19_hub_drive_motor_m' },
    { id: 'wheel', variant: 'rover04_wheel_m' },
    { id: 'armR', variant: 'rover17_suspension_arm_m' },
    { id: 'core', variant: 'rover21_control_core' }
  ],
  connections: [
    { child: 'arm', childNode: 'node_attach', parent: 'frame', parentNode: 'node_rail_l_0' },
    { child: 'motor', childNode: 'node_attach', parent: 'arm', parentNode: 'node_outboard' },
    { child: 'wheel', childNode: 'node_attach', parent: 'motor', parentNode: 'node_outboard' },
    { child: 'armR', childNode: 'node_attach', parent: 'frame', parentNode: 'node_rail_r_5' },
    { child: 'core', childNode: 'node_bottom', parent: 'frame', parentNode: 'node_grid_2_1' }
  ],
  manual: 'm'
}, cat);
assert(kit.ok && kit.warnings.length === 0, 'explicit rover-kit rail, outboard and deck-grid joints are kept as written: ' + kit.warnings.map(w => w.message).join(' | '));
checkJoints('kit', kit);
const kitPos = id => kit.instances.find(i => i.id === id).position;
assert(kitPos('arm')[0] > 1 && kitPos('motor')[0] > kitPos('arm')[0] && kitPos('wheel')[0] > kitPos('motor')[0], 'left wheel chain runs outboard along +X');
assert(kitPos('armR')[0] < -1 && kitPos('armR')[2] < -1, 'right rear arm sits on the -X rail at the back');
assert(kitPos('core')[1] > 0.3, 'control core stands on the deck grid');

// Antiparallel fallback for a +/-Y child node: node_bottom (-Y) under a -Y deck node must flip the part upside down.
const under = assemble({
  name: 'under-deck mount',
  parts: [
    { id: 'frame', variant: 'rover13_chassis_frame_m' },
    { id: 'pod', variant: 'rover21_control_core' }
  ],
  connections: [{ child: 'pod', childNode: 'node_bottom', parent: 'frame', parentNode: 'node_under_2_1' }],
  manual: 'm'
}, cat);
assert(under.ok && under.warnings.length === 0, 'under-deck mount assembles cleanly: ' + under.warnings.map(w => w.message).join(' | '));
checkJoints('under', under);
const podInst = under.instances.find(i => i.id === 'pod');
assert(podInst.position[1] < -0.3, 'part hung from node_under sits below the deck');
assert(Math.abs(Math.hypot(...podInst.quaternion) - 1) < 1e-9, 'antiparallel quaternion is a unit quaternion');

// Nested symmetry under a copied parent must not reuse an id (fin@2 on core's copy 2 vs fin on booster@2).
const nested = assemble({
  name: 'nested symmetry', manual: 'm',
  parts: [
    { id: 'core', variant: 'tank00_kerolox_m' },
    { id: 'boost', variant: 'stage01_radial_decoupler' },
    { id: 'fin', variant: 'aero06_rocket_fin_s' }
  ],
  connections: [
    { child: 'boost', childNode: 'node_attach', parent: 'core', parentNode: 'node_side_1', symmetry: 2, offset: 0 },
    { child: 'fin', childNode: 'node_attach', parent: 'boost', parentNode: 'node_side_1', symmetry: 2, offset: 90 }
  ]
}, cat);
const nestedIds = nested.instances.map(i => i.id);
assert(nested.ok && nestedIds.length === 7, 'nested symmetry places 1 + 2 + 4 instances: ' + nestedIds.join(' '));
assert(new Set(nestedIds).size === nestedIds.length, 'nested symmetry instance ids are unique: ' + nestedIds.join(' '));
assert(nestedIds.join(' ') === 'core boost fin fin@2 boost@2 fin@2~1 fin@2~2', 'nested symmetry ids follow the documented scheme: ' + nestedIds.join(' '));

const fenced = parseCraftJSON('Here you go:\n```json\n{"name":"X","parts":[],"connections":[],"manual":"brace } inside"}\n```\nThanks');
assert(fenced.name === 'X' && fenced.manual.includes('}'), 'parser strips fences and keeps braces inside strings');
let badParse = false;
try { parseCraftJSON('no object here'); } catch { badParse = true; }
assert(badParse, 'parser rejects prose with no object');

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
