import { readFileSync } from 'node:fs';
import { assemble, nodeInWorld, parseCraftJSON } from '../assemble.js';
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
assert(!badNode.ok && /node_nope/.test(badNode.errors.map(e => e.message).join(' ')), 'unknown node is an error');
assert(badNode.instances.some(i => i.id === 'tank'), 'root still placed when a child node is wrong');

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
