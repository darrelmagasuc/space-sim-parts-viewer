// Snap a craft plan onto part attach nodes. Pure module: no DOM, no three.js.
// Godot / glTF frame: Y-up, metres, node direction = outward normal of the mating face.
// A joint places the child's node on the parent's node with those directions opposed.

const MAX_SYMMETRY = 12;
const MAX_INSTANCES = 80;
const CLASS_DIAMETER = { XS: 0.625, S: 1.25, M: 2.5, L: 3.75, XL: 5, XXL: 7.5 };

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function len(a) { return Math.hypot(a[0], a[1], a[2]); }
function norm(a) {
  const L = len(a);
  if (L < 1e-10) return null;
  return [a[0] / L, a[1] / L, a[2] / L];
}
function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

/** Right-handed rotation about +Y. */
export function rotY(v, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

function quatNorm(q) {
  const L = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / L, q[1] / L, q[2] / L, q[3] / L];
}

// Matches THREE.Quaternion.setFromUnitVectors, including the antiparallel fallback
// (180° about Y when mapping −X onto +X), so a left-side radial part stays upright.
function quatFromTo(a, b) {
  const r = dot(a, b) + 1;
  if (r < 1e-8) {
    if (Math.abs(a[0]) > Math.abs(a[2])) return quatNorm([-a[1], a[0], 0, 0]);
    return quatNorm([0, -a[2], a[0], 0]);
  }
  return quatNorm([
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
    r
  ]);
}

function quatAxisAngle(axis, angle) {
  const h = angle / 2, s = Math.sin(h);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(h)];
}

function quatMul(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}

function quatApply(q, v) {
  const [qx, qy, qz, qw] = q;
  const tx = 2 * (qy * v[2] - qz * v[1]);
  const ty = 2 * (qz * v[0] - qx * v[2]);
  const tz = 2 * (qx * v[1] - qy * v[0]);
  return [
    v[0] + qw * tx + (qy * tz - qz * ty),
    v[1] + qw * ty + (qz * tx - qx * tz),
    v[2] + qw * tz + (qx * ty - qy * tx)
  ];
}

export function identityMatrix() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function compose(p, q) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  // Column-major, same layout as THREE.Matrix4.elements.
  return [
    1 - (yy + zz), xy + wz, xz - wy, 0,
    xy - wz, 1 - (xx + zz), yz + wx, 0,
    xz + wy, yz - wx, 1 - (xx + yy), 0,
    p[0], p[1], p[2], 1
  ];
}

function transformPoint(m, v) {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]
  ];
}

function transformDir(m, v) {
  return norm([
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2]
  ]);
}

/** Node position and outward direction in the frame of `matrix` (angle clocks the node about local +Y). */
export function nodeInWorld(matrix, node, angleRad = 0) {
  const pos = rotY(node.position, angleRad);
  const dir = norm(rotY(node.direction, angleRad)) || [0, 1, 0];
  return {
    position: transformPoint(matrix, pos),
    direction: transformDir(matrix, dir) || [0, 1, 0]
  };
}

function findNode(variant, name) {
  return (variant.nodes || []).find(n => n.name === name) || null;
}

function isStackNode(name) {
  return name === 'node_top' || name === 'node_bottom';
}

/**
 * Diameter of a stack face, or null when this node is not a sized stack interface
 * (chutes, radial mounts, slot items). Adapters use size "TOP-BOTTOM" (top class first).
 */
export function stackDiameter(variant, nodeName) {
  if (!isStackNode(nodeName)) return null;
  const dims = variant.dims || {};
  if (nodeName === 'node_top' && typeof dims.top_diameter_m === 'number') return dims.top_diameter_m;
  if (nodeName === 'node_bottom' && typeof dims.bottom_diameter_m === 'number') return dims.bottom_diameter_m;
  if (typeof dims.interface_diameter_m === 'number') return dims.interface_diameter_m;
  if (typeof dims.stack_diameter_m === 'number') return dims.stack_diameter_m;
  const size = String(variant.size || '');
  const adapter = size.match(/^(XXL|XL|XS|S|M|L)-(XXL|XL|XS|S|M|L)$/);
  if (adapter) return CLASS_DIAMETER[nodeName === 'node_top' ? adapter[1] : adapter[2]];
  const names = new Set((variant.nodes || []).map(n => n.name));
  const bothFaces = names.has('node_top') && names.has('node_bottom');
  const classD = CLASS_DIAMETER[size];
  if (!classD) return null;
  if (bothFaces) return classD;
  // A single stack face (fairing base, docking port) still counts when diameter_m agrees with the class.
  if (typeof dims.diameter_m === 'number' && Math.abs(dims.diameter_m - classD) / classD < 0.2) return dims.diameter_m;
  return null;
}

function lookupVariant(catalogue, ref) {
  if (catalogue && typeof catalogue.lookup === 'function') return catalogue.lookup(ref);
  if (catalogue && typeof catalogue.get === 'function') {
    const v = catalogue.get(ref);
    return v ? { variant: v, via: null } : null;
  }
  return null;
}

function num(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function instanceIdFor(seedId, parentInstanceId, parentSeedId, k) {
  const parentSuffix = parentInstanceId === parentSeedId ? '' : parentInstanceId.slice(parentSeedId.length);
  if (!parentSuffix && k === 0) return seedId;
  if (!parentSuffix) return `${seedId}@${k + 1}`;
  if (k === 0) return `${seedId}${parentSuffix}`;
  return `${seedId}${parentSuffix}~${k + 1}`;
}

function partAABB(variant, matrix) {
  const b = variant.bbox;
  if (!b || b.length < 3) return null;
  const hx = b[0] / 2, hy = b[1] / 2, hz = b[2] / 2;
  const corners = [
    [-hx, -hy, -hz], [hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz],
    [-hx, -hy, hz], [hx, -hy, hz], [-hx, hy, hz], [hx, hy, hz]
  ].map(c => transformPoint(matrix, c));
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const c of corners) for (let i = 0; i < 3; i++) {
    min[i] = Math.min(min[i], c[i]);
    max[i] = Math.max(max[i], c[i]);
  }
  return { min, max };
}

function overlapVolume(a, b, pad) {
  const dx = Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]) - pad * 2;
  const dy = Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]) - pad * 2;
  const dz = Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]) - pad * 2;
  if (dx <= 0 || dy <= 0 || dz <= 0) return 0;
  return dx * dy * dz;
}

function emptyResult(errors, warnings, name) {
  return { ok: errors.length === 0, name: name || 'Untitled craft', errors, warnings, instances: [], joints: [] };
}

/**
 * @param {object} craft plan: { name, parts, connections, staging, manual }
 * @param {{ lookup: (id: string) => { variant: object, via: string|null }|null }} catalogue
 * @returns {{ ok: boolean, name: string, errors: {message:string}[], warnings: {message:string}[], instances: object[], joints: object[] }}
 */
export function assemble(craft, catalogue) {
  const errors = [];
  const warnings = [];
  const err = message => errors.push({ message });
  const warn = message => warnings.push({ message });

  if (!craft || typeof craft !== 'object' || Array.isArray(craft)) {
    err('Craft JSON must be an object with "parts" and "connections".');
    return emptyResult(errors, warnings);
  }
  // Some models wrap the plan one level down.
  if (!Array.isArray(craft.parts) && craft.craft && typeof craft.craft === 'object') craft = craft.craft;

  const name = typeof craft.name === 'string' && craft.name.trim() ? craft.name.trim() : 'Untitled craft';
  if (!Array.isArray(craft.parts)) err('Missing "parts" array.');
  if (!Array.isArray(craft.connections)) err('Missing "connections" array.');
  if (!Array.isArray(craft.parts) || !Array.isArray(craft.connections)) return emptyResult(errors, warnings, name);

  if (craft.manual == null || craft.manual === '') warn('No flight manual was included.');
  else if (typeof craft.manual !== 'string') warn('Flight manual should be a markdown string.');
  if (craft.staging != null && !Array.isArray(craft.staging)) warn('"staging" should be an array.');

  const seeds = new Map();
  for (const part of craft.parts) {
    if (!part || typeof part !== 'object') { err('A parts entry is not an object.'); continue; }
    const id = typeof part.id === 'string' ? part.id.trim() : '';
    if (!id || !/^[A-Za-z][A-Za-z0-9_-]{0,40}$/.test(id)) {
      err(`Part id "${id || '(missing)'}" must start with a letter and use only letters, digits, "_" or "-".`);
      continue;
    }
    if (seeds.has(id)) { err(`Duplicate part id "${id}".`); continue; }
    const ref = typeof part.variant === 'string' ? part.variant.trim() : '';
    const found = ref ? lookupVariant(catalogue, ref) : null;
    if (!found) {
      err(`Unknown part "${ref || '(missing)'}" on "${id}". Use a variant id from the catalogue.`);
      seeds.set(id, { id, variant: null, bad: true });
      continue;
    }
    if (found.via) warn(`"${id}" used "${ref}"; resolved to variant ${found.variant.vid}.`);
    if (!found.variant.nodes || !found.variant.nodes.length) {
      warn(`"${id}" (${found.variant.vid}) has no attach nodes.`);
    }
    seeds.set(id, { id, variant: found.variant, bad: false, note: part.note || '' });
  }

  const conns = [];
  const childToConn = new Map();
  craft.connections.forEach((c, i) => {
    const where = `Connection ${i + 1}`;
    if (!c || typeof c !== 'object') { err(`${where} is not an object.`); return; }
    const child = typeof c.child === 'string' ? c.child.trim() : '';
    const parent = typeof c.parent === 'string' ? c.parent.trim() : '';
    const childNodeName = typeof c.childNode === 'string' ? c.childNode.trim() : '';
    const parentNodeName = typeof c.parentNode === 'string' ? c.parentNode.trim() : '';
    if (!child || !parent || !childNodeName || !parentNodeName) {
      err(`${where} needs child, childNode, parent, and parentNode.`);
      return;
    }
    if (child === parent) { err(`${where} attaches "${child}" to itself.`); return; }
    if (!seeds.has(child)) { err(`${where}: unknown child instance "${child}".`); return; }
    if (!seeds.has(parent)) { err(`${where}: unknown parent instance "${parent}".`); return; }
    if (childToConn.has(child)) { err(`"${child}" is attached more than once.`); return; }
    const symmetry = c.symmetry == null || c.symmetry === '' ? 1 : c.symmetry;
    if (typeof symmetry !== 'number' || !Number.isInteger(symmetry) || symmetry < 1 || symmetry > MAX_SYMMETRY) {
      err(`${where}: symmetry must be an integer from 1 to ${MAX_SYMMETRY}.`);
      return;
    }
    if (c.rotation != null && c.rotation !== '' && (typeof c.rotation !== 'number' || !Number.isFinite(c.rotation))) {
      err(`${where}: rotation must be a number of degrees.`);
      return;
    }
    if (c.offset != null && c.offset !== '' && (typeof c.offset !== 'number' || !Number.isFinite(c.offset))) {
      err(`${where}: offset must be a number of degrees around the parent's +Y axis.`);
      return;
    }
    const childSeed = seeds.get(child);
    const parentSeed = seeds.get(parent);
    let childNode = null, parentNode = null;
    if (childSeed.variant) {
      childNode = findNode(childSeed.variant, childNodeName);
      if (!childNode) {
        const have = (childSeed.variant.nodes || []).map(n => n.name).join(', ') || '(none)';
        err(`${where}: "${child}" (${childSeed.variant.vid}) has no ${childNodeName}. Nodes: ${have}.`);
      } else if (!norm(childNode.direction)) {
        err(`${where}: ${childNodeName} on "${child}" has no direction.`);
        childNode = null;
      }
    }
    if (parentSeed.variant) {
      parentNode = findNode(parentSeed.variant, parentNodeName);
      if (!parentNode) {
        const have = (parentSeed.variant.nodes || []).map(n => n.name).join(', ') || '(none)';
        err(`${where}: "${parent}" (${parentSeed.variant.vid}) has no ${parentNodeName}. Nodes: ${have}.`);
      } else if (!norm(parentNode.direction)) {
        err(`${where}: ${parentNodeName} on "${parent}" has no direction.`);
        parentNode = null;
      }
    }
    const bad = !childNode || !parentNode || childSeed.bad || parentSeed.bad;
    childToConn.set(child, true);
    conns.push({
      child, parent, childNodeName, parentNodeName, childNode, parentNode,
      symmetry, rotation: num(c.rotation, 0), offset: num(c.offset, 0), bad, index: i
    });
  });

  // Cycles in the seed graph.
  const kids = new Map();
  for (const id of seeds.keys()) kids.set(id, []);
  for (const c of conns) if (kids.has(c.parent)) kids.get(c.parent).push(c.child);
  const color = new Map();
  let cyclic = false;
  function dfs(id) {
    color.set(id, 1);
    for (const k of kids.get(id) || []) {
      const col = color.get(k) || 0;
      if (col === 1) cyclic = true;
      else if (col === 0) dfs(k);
    }
    color.set(id, 2);
  }
  for (const id of seeds.keys()) if (!color.get(id)) dfs(id);
  if (cyclic) err('Connections contain a cycle, so there is no single root to build from.');

  const roots = [...seeds.keys()].filter(id => !childToConn.has(id) && !seeds.get(id).bad);
  if (!seeds.size) err('The plan has no parts.');
  else if (!roots.length && !cyclic) err('Every part is a child of another part, but the links do not form a tree.');
  if (roots.length > 1) {
    warn(`More than one root (${roots.join(', ')}). Extra roots are parked beside the main craft.`);
  }
  if (craft.root && !roots.includes(craft.root)) {
    warn(`"root" is "${craft.root}", which is not an unattached part. Using "${roots[0] || '(none)'}".`);
  }

  if (Array.isArray(craft.staging)) {
    for (const stage of craft.staging) {
      const ids = stage && Array.isArray(stage.parts) ? stage.parts : [];
      for (const id of ids) {
        if (typeof id === 'string' && !seeds.has(id)) warn(`Staging mentions unknown part "${id}".`);
      }
    }
  }

  if (cyclic) return emptyResult(errors, warnings, name);

  const orderedRoots = roots.slice();
  if (craft.root && orderedRoots.includes(craft.root)) {
    orderedRoots.splice(orderedRoots.indexOf(craft.root), 1);
    orderedRoots.unshift(craft.root);
  }

  const instances = [];
  const joints = [];
  const placedSeeds = new Set();
  let truncated = false;

  function place(seedId, matrix, parentInstanceId, symmetryIndex, instanceId) {
    if (instances.length >= MAX_INSTANCES) { truncated = true; return; }
    const seed = seeds.get(seedId);
    if (!seed || seed.bad || !seed.variant) return;
    const id = instanceId || seedId;
    placedSeeds.add(seedId);
    const q = matrixToQuat(matrix);
    instances.push({
      id,
      seedId,
      variant: seed.variant.vid,
      partId: seed.variant.partId,
      partName: seed.variant.partName,
      category: seed.variant.category,
      label: seed.variant.label || '',
      size: seed.variant.size,
      glb: seed.variant.glb,
      bbox: seed.variant.bbox,
      nodes: seed.variant.nodes,
      matrix,
      position: [matrix[12], matrix[13], matrix[14]],
      quaternion: q,
      parentId: parentInstanceId,
      symmetryIndex
    });
    for (const c of conns) {
      if (c.parent !== seedId || c.bad) continue;
      for (let k = 0; k < c.symmetry; k++) {
        if (instances.length >= MAX_INSTANCES) { truncated = true; return; }
        const childInstanceId = instanceIdFor(c.child, id, seedId, k);
        const angle = (k * 360 / c.symmetry + c.offset) * Math.PI / 180;
        const joint = mate(matrix, c.parentNode, c.childNode, angle, c.rotation);
        joints.push({
          parentId: id,
          childId: childInstanceId,
          parentNode: c.parentNodeName,
          childNode: c.childNodeName,
          position: joint.parentPoint,
          parentDirection: joint.parentDir,
          childDirection: joint.childDir,
          angleRad: angle,
          symmetryIndex: k + 1
        });
        if (k === 0 && id === seedId) {
          const dParent = stackDiameter(seeds.get(c.parent).variant, c.parentNodeName);
          const dChild = stackDiameter(seeds.get(c.child).variant, c.childNodeName);
          if (dParent != null && dChild != null && Math.abs(dParent - dChild) > Math.max(0.05, 0.08 * Math.max(dParent, dChild))) {
            warn(`Stack size mismatch on ${c.parent}.${c.parentNodeName} (${fmtM(dParent)} m, ${seeds.get(c.parent).variant.size}) and ${c.child}.${c.childNodeName} (${fmtM(dChild)} m, ${seeds.get(c.child).variant.size}).`);
          }
        }
        place(c.child, joint.matrix, id, k + 1, childInstanceId);
      }
    }
  }

  // Park extra roots along +X so they stay visible and do not occupy the origin.
  let parkX = 0;
  orderedRoots.forEach((id, i) => {
    const variant = seeds.get(id).variant;
    const width = (variant && variant.bbox && variant.bbox[0]) || 2;
    if (i > 0) parkX += width / 2 + 1.5;
    const matrix = identityMatrix();
    matrix[12] = i === 0 ? 0 : parkX;
    if (i > 0) parkX += width / 2 + 1.5;
    place(id, matrix, null, 1, id);
  });
  if (truncated) err(`Stopped at ${MAX_INSTANCES} instances. Lower symmetry or use fewer parts.`);

  for (const id of seeds.keys()) {
    if (!placedSeeds.has(id) && !seeds.get(id).bad && !childToConn.has(id)) continue;
    if (!placedSeeds.has(id) && !seeds.get(id).bad) {
      err(`"${id}" was not placed. Its parent link is missing or invalid.`);
    }
  }

  // Two joints landing on the same point of one parent.
  for (let i = 0; i < joints.length; i++) {
    for (let j = i + 1; j < joints.length; j++) {
      if (joints[i].parentId !== joints[j].parentId) continue;
      if (dist(joints[i].position, joints[j].position) < 0.05) {
        warn(`${joints[i].childId} and ${joints[j].childId} both sit on ${joints[i].parentId} within 5 cm (${joints[i].parentNode} / ${joints[j].parentNode}).`);
      }
    }
  }

  const skipPair = new Set(joints.map(j => `${j.parentId}|${j.childId}`));
  const boxes = instances.map(inst => ({ inst, box: partAABB(seeds.get(inst.seedId).variant, inst.matrix) })).filter(x => x.box);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].inst, b = boxes[j].inst;
      if (skipPair.has(`${a.id}|${b.id}`) || skipPair.has(`${b.id}|${a.id}`)) continue;
      const vol = overlapVolume(boxes[i].box, boxes[j].box, 0.05);
      // Skin-mounted neighbours graze by a few litres of AABB. Only flag a real clash.
      if (vol > 0.2) {
        warn(`Possible overlap between ${a.id} and ${b.id} (about ${vol.toFixed(2)} m³). Bounding boxes only — thin shells and radial gaps can false-alarm.`);
      }
    }
  }

  return { ok: errors.length === 0, name, errors, warnings, instances, joints };
}

function fmtM(n) {
  return (Math.round(n * 1000) / 1000).toString();
}

function matrixToQuat(m) {
  // From the rotation part of a column-major matrix. Assumes no scale.
  const m00 = m[0], m10 = m[1], m20 = m[2];
  const m01 = m[4], m11 = m[5], m21 = m[6];
  const m02 = m[8], m12 = m[9], m22 = m[10];
  const trace = m00 + m11 + m22;
  let q;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  return quatNorm(q);
}

/** Pull the first JSON object out of a model reply, ignoring fences and prose. */
export function parseCraftJSON(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('The response was empty.');
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  if (start < 0) throw new Error('No JSON object in the response.');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(s.slice(start, i + 1)); }
        catch (e) { throw new Error('JSON parse failed: ' + e.message); }
      }
    }
  }
  throw new Error('The JSON object was not closed.');
}

/** Child world matrix that mates childNode onto parentNode (parentNode clocked about local +Y by angleRad). */
function mate(parentMatrix, parentNode, childNode, angleRad, rollDeg) {
  const parentLocalPos = rotY(parentNode.position, angleRad);
  const parentLocalDir = norm(rotY(parentNode.direction, angleRad));
  const parentPoint = transformPoint(parentMatrix, parentLocalPos);
  const parentDir = transformDir(parentMatrix, parentLocalDir);
  const childDirLocal = norm(childNode.direction);
  const target = scale(parentDir, -1);
  let q = quatFromTo(childDirLocal, target);
  if (rollDeg) {
    const qRoll = quatAxisAngle(parentDir, rollDeg * Math.PI / 180);
    q = quatNorm(quatMul(qRoll, q));
  }
  const origin = sub(parentPoint, quatApply(q, childNode.position));
  const childDir = quatApply(q, childDirLocal);
  return { matrix: compose(origin, q), parentPoint, parentDir, childDir };
}
