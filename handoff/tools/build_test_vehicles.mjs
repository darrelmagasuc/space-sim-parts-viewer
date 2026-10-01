// node handoff/tools/build_test_vehicles.mjs [--check]
// Runs every vehicle in test_vehicle_defs.mjs through the viewer's assemble.js (the reference
// implementation) and writes handoff/test_vehicles/<file>.craft.json (save format) and
// <file>.expected.json (world-space transforms and node positions). --check re-runs and compares
// with the files on disk instead of writing (exit 1 on a difference > 1e-6).
import { readFileSync, writeFileSync } from 'node:fs';
import { assemble, nodeInWorld } from '../../assemble.js';
import { buildCatalogue } from '../../catalogue.js';
import { VEHICLES } from './test_vehicle_defs.mjs';

const root = new URL('../../', import.meta.url);
const out = new URL('../test_vehicles/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
const cat = buildCatalogue(manifest);
const check = process.argv.includes('--check');
const r6 = x => Math.round(x * 1e6) / 1e6 + 0;
const v6 = a => a.map(r6);
let failed = 0;

function savePlan(plan) {
  // Canonical save format: explicit connections only. The authoring shorthand (stack / attach / ring)
  // has already been expanded into connections by assemble(), so it is dropped here.
  const keep = { format: 'space-sim-craft', version: 1, name: plan.name, summary: plan.summary || '', root: null, parts: [], connections: [], staging: plan.staging || [], manual: plan.manual || '' };
  keep.parts = plan.parts.map(p => ({ id: p.id, variant: p.variant, ...(p.note ? { note: p.note } : {}) }));
  keep.connections = plan.connections.map(c => {
    const o = { child: c.child, childNode: c.childNode, parent: c.parent, parentNode: c.parentNode, symmetry: c.symmetry ?? 1, rotation: c.rotation || 0, offset: c.offset || 0 };
    if (c.layout) o.layout = c.layout;
    return o;
  });
  const children = new Set(keep.connections.map(c => c.child));
  keep.root = keep.parts.map(p => p.id).find(id => !children.has(id)) || null;
  return keep;
}

function expected(name, craftFile, result) {
  return {
    craft: craftFile,
    generator: 'assemble.js (space-sim-parts-viewer) via handoff/tools/build_test_vehicles.mjs',
    frame: 'Godot Y-up, metres, right-handed. quaternion = [x, y, z, w]; basis = columns [x_axis, y_axis, z_axis] of the instance rotation; nodes in world space.',
    tolerance_m: 1e-4,
    tolerance_dir: 1e-4,
    counts: { instances: result.instances.length, joints: result.joints.length, errors: result.errors.length, warnings: result.warnings.length },
    instances: result.instances.map(i => ({
      id: i.id, seedId: i.seedId, variant: i.variant, parentId: i.parentId, symmetryIndex: i.symmetryIndex, layout: i.layout,
      origin: v6(i.position),
      quaternion: v6(i.quaternion),
      basis: [v6([i.matrix[0], i.matrix[1], i.matrix[2]]), v6([i.matrix[4], i.matrix[5], i.matrix[6]]), v6([i.matrix[8], i.matrix[9], i.matrix[10]])],
      nodes: (i.nodes || []).map(n => { const w = nodeInWorld(i.matrix, n, 0); return { name: n.name, position: v6(w.position), direction: v6(w.direction) }; })
    })),
    joints: result.joints.map(j => ({
      parentId: j.parentId, parentNode: j.parentNode, childId: j.childId, childNode: j.childNode, symmetryIndex: j.symmetryIndex,
      angle_deg: r6(j.angleRad * 180 / Math.PI), position: v6(j.position), parentDirection: v6(j.parentDirection), childDirection: v6(j.childDirection)
    })),
    warnings: result.warnings.map(w => w.message),
    errors: result.errors.map(e => e.message)
  };
}

function maxDiff(a, b, path = '') {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b);
  if (Array.isArray(a) && Array.isArray(b)) { if (a.length !== b.length) return Infinity; return Math.max(0, ...a.map((x, k) => maxDiff(x, b[k]))); }
  if (a && b && typeof a === 'object') { const ks = new Set([...Object.keys(a), ...Object.keys(b)]); return Math.max(0, ...[...ks].map(k => k === 'generator' ? 0 : maxDiff(a[k], b[k]))); }
  return a === b ? 0 : Infinity;
}

for (const v of VEHICLES) {
  const first = assemble(structuredClone(v.craft), cat);
  const saved = savePlan(first.plan);
  // The saved plan must reproduce itself exactly with no repair notes.
  const again = assemble(structuredClone(saved), cat);
  const exp = expected(v.file, `${v.file}.craft.json`, again);
  const problems = [...again.errors.map(e => 'error: ' + e.message), ...again.warnings.map(w => 'warning: ' + w.message)];
  if (problems.length) { failed++; console.error(`FAIL ${v.file}:\n  ` + problems.join('\n  ')); }
  if (!v.shorthand && JSON.stringify(first.instances.map(i => i.position)) !== JSON.stringify(again.instances.map(i => i.position))) { failed++; console.error(`FAIL ${v.file}: re-assembled save differs`); }
  for (const j of again.joints) {
    const p = again.instances.find(i => i.id === j.parentId), c = again.instances.find(i => i.id === j.childId);
    const pw = nodeInWorld(p.matrix, p.nodes.find(n => n.name === j.parentNode), j.angleRad);
    const cw = nodeInWorld(c.matrix, c.nodes.find(n => n.name === j.childNode), 0);
    const d = Math.hypot(...pw.position.map((x, k) => x - cw.position[k]));
    const dot = pw.direction.reduce((s, x, k) => s + x * cw.direction[k], 0);
    if (d > 1e-6 || dot > -0.999999) { failed++; console.error(`FAIL ${v.file}: joint ${j.childId} off by ${d}, dot ${dot}`); }
  }
  const craftPath = new URL(`${v.file}.craft.json`, out), expPath = new URL(`${v.file}.expected.json`, out);
  if (check) {
    const diskC = JSON.parse(readFileSync(craftPath, 'utf8')), diskE = JSON.parse(readFileSync(expPath, 'utf8'));
    const dc = maxDiff(diskC, saved), de = maxDiff(diskE, exp);
    if (dc > 0 || de > 1e-6) { failed++; console.error(`FAIL ${v.file}: files on disk differ (craft ${dc}, expected ${de})`); }
    else console.log(`ok ${v.file}: ${again.instances.length} instances, ${again.joints.length} joints match the files`);
  } else {
    writeFileSync(craftPath, JSON.stringify(saved, null, 2) + '\n');
    writeFileSync(expPath, JSON.stringify(exp, null, 1) + '\n');
    console.log(`wrote ${v.file}: ${again.instances.length} instances, ${again.joints.length} joints, ${again.warnings.length} warnings`);
  }
}
if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log(check ? 'all test vehicles match' : 'done');
