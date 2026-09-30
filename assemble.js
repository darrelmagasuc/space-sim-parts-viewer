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

function rotYMatrix(angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  // Column-major. Matches rotY: x' = c x + s z, z' = -s x + c z.
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

function mulMat(a, b) {
  const out = new Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] = a[row] * b[col * 4] + a[4 + row] * b[col * 4 + 1] + a[8 + row] * b[col * 4 + 2] + a[12 + row] * b[col * 4 + 3];
    }
  }
  return out;
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
  let cx = 0, cy = 0, cz = 0;
  const nodes = variant.nodes || [];
  const attach = isRadialPart(variant) ? findNode(variant, 'node_attach') : null;
  if (attach && attach.direction && norm(attach.direction)) {
    // The mating face sits on the node. A centred box is right when that node is
    // already on the face; a one-sided wing (origin near the root) shifts out along the body.
    const dir = norm(attach.direction);
    const ax = Math.abs(dir[0]), ay = Math.abs(dir[1]), az = Math.abs(dir[2]);
    const extent = ax >= ay && ax >= az ? b[0] : ay >= az ? b[1] : b[2];
    cx = attach.position[0] - dir[0] * extent / 2;
    cy = attach.position[1] - dir[1] * extent / 2;
    cz = attach.position[2] - dir[2] * extent / 2;
  } else if (nodes.length) {
    for (const node of nodes) { cx += node.position[0]; cy += node.position[1]; cz += node.position[2]; }
    cx /= nodes.length; cy /= nodes.length; cz /= nodes.length;
    // Spokes and ring segments are authored with the origin on the hub axis, so the
    // mesh sits many metres from the part origin. A centred box would swallow the hub.
    if (Math.hypot(cx, cy, cz) <= Math.max(b[0], b[1], b[2]) * 0.5) cx = cy = cz = 0;
  }
  const hx = b[0] / 2, hy = b[1] / 2, hz = b[2] / 2;
  const corners = [
    [-hx + cx, -hy + cy, -hz + cz], [hx + cx, -hy + cy, -hz + cz],
    [-hx + cx, hy + cy, -hz + cz], [hx + cx, hy + cy, -hz + cz],
    [-hx + cx, -hy + cy, hz + cz], [hx + cx, -hy + cy, hz + cz],
    [-hx + cx, hy + cy, hz + cz], [hx + cx, hy + cy, hz + cz]
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

function canonicalNodeName(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const n = trimmed.toLowerCase().replace(/[\s-]+/g, '_');
  if (n === 'top' || n === 'node_top') return 'node_top';
  if (n === 'bottom' || n === 'node_bottom') return 'node_bottom';
  if (n === 'attach' || n === 'node_attach') return 'node_attach';
  if (n === 'payload' || n === 'node_payload') return 'node_payload';
  const side = n.match(/^(?:node_)?side_?(\d+)$/);
  if (side) return 'node_side_' + side[1];
  const wheel = n.match(/^(?:node_)?wheel_?(\d+)$/);
  if (wheel) return 'node_wheel_' + wheel[1];
  return trimmed;
}

function resolveNode(variant, raw) {
  if (!variant || typeof raw !== 'string' || !raw.trim()) return null;
  return findNode(variant, raw.trim()) || findNode(variant, canonicalNodeName(raw));
}

function nodeList(variant) {
  return (variant && variant.nodes) || [];
}

function isRadialPart(variant) {
  const names = nodeList(variant).map(n => n.name);
  return names.includes('node_attach') && !names.includes('node_top') && !names.includes('node_bottom');
}

function isWheelPart(variant) {
  return /wheel/i.test(variant.vid + ' ' + variant.partName);
}

function stackRank(variant) {
  const id = (variant.vid + ' ' + variant.partId + ' ' + variant.partName).toLowerCase();
  if (/chute|parachute|fairing/.test(id)) return 0;
  if (variant.category === 'cmd' || variant.category === 'cockpit' || /capsule|probe|nose/.test(id)) return 1;
  if (variant.category === 'tank' || /tank|interstage|decoupler|separator|truss|spin_hub|hab/.test(id)) return 2;
  if (variant.category === 'prop' || /engine|merlin|turbojet|nozzle|rocket/.test(id)) return 4;
  return 3;
}

function horizontalFaceDot(variant) {
  const top = findNode(variant, 'node_top');
  const bot = findNode(variant, 'node_bottom');
  if (!top || !bot) return null;
  if (Math.abs(top.direction[1]) > 0.45 || Math.abs(bot.direction[1]) > 0.45) return null;
  return dot(top.direction, bot.direction);
}

function isSpokePart(variant) {
  const align = horizontalFaceDot(variant);
  return align != null && align < -0.95;
}

function isArcPart(variant) {
  const align = horizontalFaceDot(variant);
  const side = findNode(variant, 'node_side_1');
  return align != null && align >= -0.95 && side && Math.abs(side.direction[1]) < 0.45;
}

function clampCount(value, fallback, min = 1) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < min) return fallback;
  return Math.min(MAX_SYMMETRY, n);
}

function hubScore(variant) {
  const sides = nodeList(variant).filter(n => /^node_side_\d+$/.test(n.name) && Math.abs(n.direction[1]) < 0.45);
  const top = findNode(variant, 'node_top');
  if (sides.length < 4 || !top || Math.abs(top.direction[1]) < 0.7) return 0;
  const id = (variant.vid + ' ' + variant.partId + ' ' + variant.partName).toLowerCase();
  let score = sides.length;
  if (/spin_hub|station09/.test(id)) score += 100;
  else if (/counter_ring|station12/.test(id)) score += 50;
  return score;
}

function uprightY(parentNode, childNode) {
  const joint = mate(identityMatrix(), parentNode, childNode, 0, 0);
  const up = transformDir(joint.matrix, [0, 1, 0]);
  return up ? up[1] : 0;
}

function pairOverlap(parentVar, parentNode, childVar, childNode) {
  const m = identityMatrix();
  const joint = mate(m, parentNode, childNode, 0, 0);
  const a = partAABB(parentVar, m);
  const b = partAABB(childVar, joint.matrix);
  if (!a || !b) return 0;
  return overlapVolume(a, b, 0.02);
}

function boxVol(variant) {
  const b = variant && variant.bbox;
  if (!b || b.length < 3) return 1;
  return Math.max(0.001, Math.abs(b[0] * b[1] * b[2]));
}

function stackJointOk(parentVar, parentNode, childVar, childNode) {
  if (!parentNode || !childNode) return false;
  if (!isStackNode(parentNode.name) || !isStackNode(childNode.name)) return false;
  if (uprightY(parentNode, childNode) < 0.5) return false;
  const overlap = pairOverlap(parentVar, parentNode, childVar, childNode);
  return overlap < Math.max(0.35, 0.12 * Math.min(boxVol(parentVar), boxVol(childVar)));
}

function radialParentName(name) {
  return /^node_side_\d+$/.test(name) || /^node_wheel_\d+$/.test(name) || name === 'node_top' || name === 'node_bottom';
}

function radialJointOk(parentVar, parentNode, childVar, childNode) {
  if (!parentNode || !childNode || childNode.name !== 'node_attach') return false;
  if (!radialParentName(parentNode.name)) return false;
  const overlap = pairOverlap(parentVar, parentNode, childVar, childNode);
  return overlap < Math.max(1.5, 0.35 * Math.min(boxVol(parentVar), boxVol(childVar)));
}

function asInt(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return value;
}

function asNum(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return value;
}

function readId(obj, keys) {
  if (!obj || typeof obj !== 'object') return '';
  for (const key of keys) {
    if (typeof obj[key] === 'string' && obj[key].trim()) return obj[key].trim();
  }
  return '';
}

function usableId(raw, used) {
  let id = String(raw || '').trim();
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,40}$/.test(id)) id = 'p' + (used.size + 1);
  const base = id;
  let n = 2;
  while (used.has(id)) {
    id = (base + '_' + n).slice(0, 41);
    n++;
  }
  used.add(id);
  return id;
}

function faceDiameters(variant) {
  const found = [];
  for (const name of ['node_top', 'node_bottom']) {
    const d = stackDiameter(variant, name);
    if (d != null) found.push(d);
  }
  if (!found.length && CLASS_DIAMETER[variant.size]) found.push(CLASS_DIAMETER[variant.size]);
  return found;
}

function siblingForDiameter(catalogue, variant, target) {
  if (!catalogue || !catalogue.byVid || target == null) return null;
  let best = null, bestDiff = Infinity;
  for (const candidate of catalogue.byVid.values()) {
    if (candidate.partId !== variant.partId) continue;
    for (const d of faceDiameters(candidate)) {
      const diff = Math.abs(d - target);
      if (diff < bestDiff) { bestDiff = diff; best = candidate; }
    }
  }
  if (!best || best.vid === variant.vid) return null;
  if (bestDiff > Math.max(0.08, target * 0.08)) return null;
  return best;
}

function componentGroups(ids, edges) {
  const parent = new Map(ids.map(id => [id, id]));
  const find = id => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    let cursor = id;
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor);
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };
  for (const edge of edges) {
    if (parent.has(edge.child) && parent.has(edge.parent)) parent.set(find(edge.child), find(edge.parent));
  }
  const groups = new Map();
  for (const id of ids) {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(id);
  }
  return [...groups.values()];
}

/**
 * Turn a sloppy model plan into connections the snapper can place.
 * Accepts an ordered `stack` (nose to tail) plus `attach` list, fills in
 * missing nodes, flips stack faces that run parts through each other, and
 * keeps joints that were already right.
 * Does not mutate `craft`.
 */
function repairCraft(craft, catalogue) {
  const notes = [];
  if (!craft || typeof craft !== 'object' || Array.isArray(craft)) return { craft, notes };
  const plan = JSON.parse(JSON.stringify(craft));
  if (!Array.isArray(plan.parts)) plan.parts = [];
  if (!Array.isArray(plan.connections)) plan.connections = [];

  const usedIds = new Set();
  const byId = new Map();
  for (const part of plan.parts) {
    if (!part || typeof part !== 'object' || typeof part.id !== 'string') continue;
    const id = part.id.trim();
    if (!id || usedIds.has(id)) continue;
    usedIds.add(id);
    part.id = id;
    byId.set(id, part);
  }

  function ensurePart(ref) {
    if (byId.has(ref)) return ref;
    const found = lookupVariant(catalogue, ref);
    if (!found) return null;
    const id = usableId(ref, usedIds);
    const part = { id, variant: found.variant.vid };
    plan.parts.push(part);
    byId.set(id, part);
    return id;
  }

  function variantOf(id) {
    const part = byId.get(id);
    if (!part) return null;
    const ref = typeof part.variant === 'string' ? part.variant.trim() : '';
    const found = ref ? lookupVariant(catalogue, ref) : null;
    if (!found) return null;
    return { part, variant: found.variant, inexact: !!found.via, ref };
  }

  function matchSize(id, neighbor) {
    const info = variantOf(id);
    if (!info || !info.inexact || !neighbor) return info && info.variant;
    const targets = faceDiameters(neighbor);
    if (!targets.length) return info.variant;
    const next = siblingForDiameter(catalogue, info.variant, targets[0]);
    if (!next) return info.variant;
    info.part.variant = next.vid;
    notes.push(`"${id}" used ${info.ref}; chose ${next.vid} so the stack face matches ${fmtM(targets[0])} m.`);
    return next;
  }

  if (Array.isArray(plan.stack)) {
    const ids = [];
    for (const item of plan.stack) {
      const ref = typeof item === 'string' ? item.trim() : readId(item, ['id', 'part', 'variant']);
      if (!ref) continue;
      const id = byId.has(ref) ? ref : ensurePart(ref);
      if (id && !ids.includes(id)) ids.push(id);
    }
    for (let i = 0; i < ids.length - 1; i++) {
      const upper = variantOf(ids[i]);
      const lower = variantOf(ids[i + 1]);
      if (upper && lower) {
        matchSize(ids[i], lower.variant);
        matchSize(ids[i + 1], upper.variant);
      }
      plan.connections = plan.connections.filter(c => {
        const a = readId(c, ['child', 'part', 'from']);
        const b = readId(c, ['parent', 'to', 'on']);
        return !((a === ids[i] && b === ids[i + 1]) || (a === ids[i + 1] && b === ids[i]));
      });
      plan.connections.push({
        child: ids[i], parent: ids[i + 1], childNode: 'node_bottom', parentNode: 'node_top', source: 'stack'
      });
    }
  }

  if (Array.isArray(plan.attach)) {
    for (const item of plan.attach) {
      if (!item || typeof item !== 'object') continue;
      const childRef = readId(item, ['part', 'child', 'id']);
      const parentRef = readId(item, ['to', 'parent', 'on']);
      const child = byId.has(childRef) ? childRef : ensurePart(childRef);
      const parent = byId.has(parentRef) ? parentRef : ensurePart(parentRef);
      if (!child || !parent) continue;
      const taken = plan.connections.some(c => readId(c, ['child', 'part', 'from']) === child);
      if (taken) continue;
      plan.connections.push({
        child, parent,
        childNode: readId(item, ['childNode', 'child_node']) || 'node_attach',
        parentNode: readId(item, ['parentNode', 'parent_node']) || '',
        symmetry: item.symmetry, rotation: item.rotation, offset: item.offset,
        source: 'attach'
      });
    }
  }

  const normalized = [];
  for (const raw of plan.connections) {
    if (!raw || typeof raw !== 'object') continue;
    const child = readId(raw, ['child', 'part', 'from']);
    const parent = readId(raw, ['parent', 'to', 'on']);
    if (!child || !parent) continue;
    normalized.push({
      child, parent,
      childNode: readId(raw, ['childNode', 'child_node', 'fromNode']),
      parentNode: readId(raw, ['parentNode', 'parent_node', 'toNode']),
      symmetry: raw.symmetry == null ? 1 : asInt(raw.symmetry),
      rotation: raw.rotation == null || raw.rotation === '' ? 0 : asNum(raw.rotation),
      offset: raw.offset == null || raw.offset === '' ? null : asNum(raw.offset),
      source: raw.source || 'connections'
    });
  }

  const resolved = new Map();
  for (const id of byId.keys()) {
    const info = variantOf(id);
    if (info) resolved.set(id, info.variant);
  }

  const ringEdges = [];
  const spokeIds = [];
  const arcIds = [];
  for (const [id, variant] of resolved) {
    if (isSpokePart(variant)) spokeIds.push(id);
    else if (isArcPart(variant)) arcIds.push(id);
  }
  const consumed = new Set();
  let hubId = null;
  if (spokeIds.length || arcIds.length) {
    const ringSpec = plan.ring && typeof plan.ring === 'object' ? plan.ring : null;
    const named = ringSpec && typeof ringSpec.hub === 'string' ? ringSpec.hub.trim() : '';
    if (named && resolved.has(named) && !spokeIds.includes(named) && !arcIds.includes(named)) hubId = named;
    else {
      let best = 0;
      for (const [id, variant] of resolved) {
        if (spokeIds.includes(id) || arcIds.includes(id)) continue;
        const score = hubScore(variant);
        if (score > best) { best = score; hubId = id; }
      }
    }
    if (hubId) {
      for (const id of [...spokeIds, ...arcIds]) consumed.add(id);
      for (let i = normalized.length - 1; i >= 0; i--) {
        if (consumed.has(normalized[i].child) || consumed.has(normalized[i].parent)) normalized.splice(i, 1);
      }
      const dropIds = [];
      if (spokeIds.length) {
        const keep = spokeIds[0];
        const symmetry = spokeIds.length === 1
          ? clampCount(ringSpec && ringSpec.spokes, 6)
          : Math.min(MAX_SYMMETRY, spokeIds.length);
        dropIds.push(...spokeIds.slice(1));
        ringEdges.push({
          child: keep, parent: hubId,
          childNode: 'node_top', parentNode: 'node_side_1',
          symmetry, rotation: 0, offset: 0, source: 'spoke', layout: 'spoke'
        });
      }
      if (arcIds.length) {
        const keep = arcIds[0];
        const symmetry = clampCount(ringSpec && ringSpec.segments, 12, 3);
        dropIds.push(...arcIds.slice(1));
        ringEdges.push({
          child: keep, parent: hubId,
          childNode: 'node_side_1', parentNode: 'node_side_1',
          symmetry, rotation: 0, offset: 0, source: 'ring', layout: 'ring'
        });
      }
      if (dropIds.length) {
        const gone = new Set(dropIds);
        plan.parts = plan.parts.filter(part => !part || !gone.has(part.id));
        for (const id of dropIds) {
          byId.delete(id);
          resolved.delete(id);
          consumed.delete(id);
        }
        notes.push('Dropped extra spoke and ring copies (' + dropIds.join(', ') + '). One of each is patterned around the hub.');
      }
    }
  }

  const trussId = [...resolved.keys()].find(id => !consumed.has(id) && /truss/i.test(resolved.get(id).vid + ' ' + resolved.get(id).partId));
  const spineId = trussId || (hubId && resolved.has(hubId) ? hubId : null);
  if (spineId) {
    let powerN = 0;
    for (const [id, variant] of resolved) {
      if (id === spineId || consumed.has(id)) continue;
      if (variant.category !== 'power' || !isRadialPart(variant)) continue;
      if (normalized.some(edge => edge.child === id) || ringEdges.some(edge => edge.child === id)) continue;
      normalized.push({
        child: id, parent: spineId,
        childNode: 'node_attach', parentNode: 'node_side_1',
        symmetry: 2, rotation: 0, offset: powerN * 45, source: 'attach'
      });
      powerN += 1;
      notes.push(`Put "${id}" on the spine ("${spineId}") instead of leaving it floating.`);
    }
  }

  const stackEdges = [];
  const radialEdges = [];
  for (const edge of normalized) {
    const childVar = resolved.get(edge.child);
    const parentVar = resolved.get(edge.parent);
    if (!childVar || !parentVar) {
      stackEdges.push(edge);
      continue;
    }
    const childNode = resolveNode(childVar, edge.childNode);
    const parentNode = resolveNode(parentVar, edge.parentNode);
    const radialPart = isRadialPart(childVar) || edge.source === 'attach';
    if (radialPart || (childNode && childNode.name === 'node_attach')) {
      if (edge.source === 'attach') {
        const attachNode = findNode(childVar, 'node_attach');
        const parentGuess = resolveNode(parentVar, edge.parentNode) || findNode(parentVar, 'node_side_1') || findNode(parentVar, 'node_top');
        edge.sticky = !!(attachNode && parentGuess && radialJointOk(parentVar, parentGuess, childVar, attachNode));
        if (edge.sticky) {
          edge.childNode = attachNode.name;
          edge.parentNode = parentGuess.name;
        }
      } else {
        edge.sticky = edge.source === 'connections' && radialJointOk(parentVar, parentNode, childVar, childNode);
      }
      radialEdges.push(edge);
    } else if (edge.source === 'stack') {
      const upperNode = findNode(childVar, 'node_bottom') || findNode(childVar, 'node_top');
      const lowerNode = findNode(parentVar, 'node_top') || findNode(parentVar, 'node_bottom');
      edge.sticky = !!(upperNode && lowerNode && uprightY(lowerNode, upperNode) >= 0.5);
      if (edge.sticky) {
        edge.childNode = upperNode.name;
        edge.parentNode = lowerNode.name;
      }
      stackEdges.push(edge);
    } else {
      edge.sticky = edge.source === 'connections' && stackJointOk(parentVar, parentNode, childVar, childNode);
      if (edge.sticky) {
        edge.childNode = childNode.name;
        edge.parentNode = parentNode.name;
      }
      stackEdges.push(edge);
    }
  }

  const finalEdges = [];
  const stackIds = [...new Set(stackEdges.flatMap(e => [e.child, e.parent]))].filter(id => resolved.has(id));
  for (const group of componentGroups(stackIds, stackEdges)) {
    const edges = stackEdges.filter(e => group.includes(e.child) && group.includes(e.parent));
    const loose = edges.filter(e => !e.sticky);
    if (!loose.length) {
      finalEdges.push(...edges);
      continue;
    }
    // One backwards joint is enough to thread a tank through the capsule.
    // Rebuild the whole column nose-to-tail instead of keeping the other links.
    const tie = id => /upper|nose|fwd|forward/.test(id) ? 0 : /lower|aft|tail|bottom/.test(id) ? 2 : 1;
    const ordered = group.slice().sort((a, b) => stackRank(resolved.get(a)) - stackRank(resolved.get(b)) || tie(a) - tie(b) || group.indexOf(a) - group.indexOf(b));
    for (let i = 0; i < ordered.length - 1; i++) {
      matchSize(ordered[i], resolved.get(ordered[i + 1]));
      matchSize(ordered[i + 1], resolved.get(ordered[i]));
      const upper = variantOf(ordered[i]);
      const lower = variantOf(ordered[i + 1]);
      if (upper) resolved.set(ordered[i], upper.variant);
      if (lower) resolved.set(ordered[i + 1], lower.variant);
    }
    notes.push('Rebuilt the stack nose-to-tail (' + ordered.join(', ') + ') because the joints were missing or backwards.');
    for (let i = 0; i < ordered.length - 1; i++) {
      const upperVar = resolved.get(ordered[i]);
      const lowerVar = resolved.get(ordered[i + 1]);
      const childNode = findNode(upperVar, 'node_bottom') || findNode(upperVar, 'node_top');
      const parentNode = findNode(lowerVar, 'node_top') || findNode(lowerVar, 'node_bottom');
      if (!childNode || !parentNode) {
        notes.push(`Could not stack "${ordered[i]}" on "${ordered[i + 1]}"; it is laid out beside the craft.`);
        continue;
      }
      finalEdges.push({
        child: ordered[i], parent: ordered[i + 1],
        childNode: childNode.name, parentNode: parentNode.name,
        symmetry: 1, rotation: 0, offset: 0, source: 'rebuilt'
      });
    }
  }

  const radialOut = [];
  const usedWheels = new Map();
  const usedSides = new Map();
  const patterns = new Map();
  const radialOrdered = [...radialEdges.filter(e => e.sticky), ...radialEdges.filter(e => !e.sticky)];
  radialOrdered.sort((a, b) => Number(b.sticky) - Number(a.sticky) || (b.symmetry || 1) - (a.symmetry || 1));
  for (const edge of radialOrdered) {
    const childVar = resolved.get(edge.child);
    const parentVar = resolved.get(edge.parent);
    if (!childVar || !parentVar) continue;
    if (isWheelPart(childVar)) {
      const wheels = nodeList(parentVar).filter(n => /^node_wheel_\d+$/.test(n.name));
      const symmetry = typeof edge.symmetry === 'number' ? edge.symmetry : 1;
      if (wheels.length >= 2 && symmetry > 1 && !edge.sticky) {
        const count = Math.min(symmetry, wheels.length);
        for (let k = 0; k < count; k++) {
          const id = k === 0 ? edge.child : usableId(edge.child + '_' + (k + 1), usedIds);
          if (!byId.has(id)) {
            plan.parts.push({ id, variant: childVar.vid });
            byId.set(id, plan.parts[plan.parts.length - 1]);
            resolved.set(id, childVar);
          }
          radialOut.push({
            child: id, parent: edge.parent, childNode: 'node_attach', parentNode: wheels[k].name,
            symmetry: 1, rotation: edge.rotation || 0, offset: 0, source: 'wheel'
          });
          if (!usedWheels.has(edge.parent)) usedWheels.set(edge.parent, new Set());
          usedWheels.get(edge.parent).add(wheels[k].name);
        }
        notes.push(`Split "${edge.child}" across ${parentVar.vid} wheel nodes. Hubs are not evenly spaced, so symmetry would pile the wheels.`);
        continue;
      }
    }
    if (edge.sticky) {
      let offset = edge.offset == null ? 0 : edge.offset;
      const symmetry = typeof edge.symmetry === 'number' ? edge.symmetry : 1;
      if (edge.offset == null && symmetry > 1) {
        const clocked = freeOffset(patterns.get(edge.parent) || [], symmetry);
        if (clocked !== 0) notes.push(`Clocked "${edge.child}" by ${clocked}° so it does not sit on another part of "${edge.parent}".`);
        offset = clocked;
      }
      radialOut.push({ ...edge, symmetry, offset });
      rememberPattern(patterns, edge.parent, symmetry, offset);
      continue;
    }
    const attach = findNode(childVar, 'node_attach') || resolveNode(childVar, edge.childNode);
    let parentNode = resolveNode(parentVar, edge.parentNode);
    const sideNodes = nodeList(parentVar).filter(n => /^node_side_\d+$/.test(n.name));
    const wheelNodes = nodeList(parentVar).filter(n => /^node_wheel_\d+$/.test(n.name));
    const taken = nodeName => finalEdges.some(item => item.parent === edge.parent && item.parentNode === nodeName)
      || radialOut.some(item => item.parent === edge.parent && item.parentNode === nodeName);
    if (isWheelPart(childVar) && wheelNodes.length) {
      const used = usedWheels.get(edge.parent) || new Set();
      parentNode = wheelNodes.find(n => !used.has(n.name)) || wheelNodes[0];
      if (!usedWheels.has(edge.parent)) usedWheels.set(edge.parent, used);
      used.add(parentNode.name);
    } else {
      const symmetry = typeof edge.symmetry === 'number' ? edge.symmetry : 1;
      const claimed = usedSides.get(edge.parent) || new Set();
      const blocked = node => {
        if (!node || !node.direction) return false;
        const ang = (Math.atan2(node.direction[2], node.direction[0]) * 180 / Math.PI + 360) % 360;
        return (patterns.get(edge.parent) || []).some(angles => anglesCollide([ang], angles));
      };
      const sideFree = sideNodes.find(n => !claimed.has(n.name) && !taken(n.name) && !blocked(n));
      const proposedOk = parentNode && attach && !taken(parentNode.name) && !blocked(parentNode) && radialJointOk(parentVar, parentNode, childVar, attach);
      if (!proposedOk) parentNode = (symmetry > 1 ? (sideNodes.find(n => !blocked(n)) || sideNodes[0]) : sideFree) || null;
      if (symmetry <= 1 && parentNode && blocked(parentNode)) parentNode = sideFree || null;
      if (parentNode && /^node_side_\d+$/.test(parentNode.name) && symmetry <= 1) {
        if (!usedSides.has(edge.parent)) usedSides.set(edge.parent, claimed);
        claimed.add(parentNode.name);
      }
    }
    if (!attach || !parentNode) {
      notes.push(`Could not attach "${edge.child}" to "${edge.parent}"; it is laid out beside the craft.`);
      continue;
    }
    let offset = edge.offset == null ? 0 : edge.offset;
    const symmetry = typeof edge.symmetry === 'number' ? edge.symmetry : 1;
    if (edge.offset == null && symmetry > 1) offset = freeOffset(patterns.get(edge.parent) || [], symmetry);
    rememberPattern(patterns, edge.parent, symmetry, offset);
    const givenChild = resolveNode(childVar, edge.childNode);
    const givenParent = resolveNode(parentVar, edge.parentNode);
    const changed = !givenChild || givenChild.name !== attach.name || !givenParent || givenParent.name !== parentNode.name || (edge.offset != null && offset !== edge.offset) || (edge.offset == null && offset !== 0);
    if (changed) {
      const given = [edge.childNode, edge.parentNode].filter(Boolean).join(' → ');
      notes.push(`Attached "${edge.child}" to "${edge.parent}" with ${attach.name} on ${parentNode.name}` + (given ? ` instead of ${given}` : '') + (offset ? `, clocked ${offset}°` : '') + '.');
    }
    radialOut.push({
      child: edge.child, parent: edge.parent,
      childNode: attach.name, parentNode: parentNode.name,
      symmetry, rotation: typeof edge.rotation === 'number' ? edge.rotation : 0,
      offset, source: edge.source
    });
  }

  for (const edge of [...stackEdges, ...radialEdges]) {
    if (resolved.has(edge.child) && resolved.has(edge.parent)) continue;
    if (finalEdges.some(item => item.child === edge.child) || radialOut.some(item => item.child === edge.child)) continue;
    finalEdges.push(edge);
  }

  plan.connections = [...finalEdges, ...radialOut, ...ringEdges].map(edge => {
    const out = {
      child: edge.child,
      parent: edge.parent,
      childNode: edge.childNode,
      parentNode: edge.parentNode,
      symmetry: edge.symmetry == null ? 1 : edge.symmetry,
      rotation: edge.rotation || 0,
      offset: edge.offset || 0
    };
    if (edge.layout === 'ring' || edge.layout === 'spoke') out.layout = edge.layout;
    return out;
  });
  return { craft: plan, notes };
}

function patternAngles(symmetry, offset) {
  const angles = [];
  const n = Math.max(1, symmetry || 1);
  for (let k = 0; k < n; k++) angles.push(((k * 360 / n + (offset || 0)) % 360 + 360) % 360);
  return angles;
}

function anglesCollide(a, b) {
  return a.some(x => b.some(y => {
    const d = Math.abs(x - y) % 360;
    return Math.min(d, 360 - d) < 15;
  }));
}

function freeOffset(existing, symmetry) {
  const trials = [0, 45, 30, 90, 15, 60, 20, 10];
  for (const offset of trials) {
    const mine = patternAngles(symmetry, offset);
    if (existing.every(other => !anglesCollide(mine, other))) return offset;
  }
  return 45;
}

function rememberPattern(patterns, parent, symmetry, offset) {
  if (!patterns.has(parent)) patterns.set(parent, []);
  patterns.get(parent).push(patternAngles(symmetry, offset));
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
  const repaired = repairCraft(craft, catalogue);
  craft = repaired.craft;
  for (const note of repaired.notes) warn(note);

  const name = typeof craft.name === 'string' && craft.name.trim() ? craft.name.trim() : 'Untitled craft';
  if (!Array.isArray(craft.parts)) err('Missing "parts" array.');
  if (!Array.isArray(craft.connections)) {
    warn('No connections were given, so each part is laid out on its own.');
    craft.connections = [];
  }
  if (!Array.isArray(craft.parts)) return emptyResult(errors, warnings, name);

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
      symmetry, rotation: num(c.rotation, 0), offset: num(c.offset, 0),
      layout: c.layout === 'ring' || c.layout === 'spoke' ? c.layout : null,
      bad, index: i
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
  else if (!roots.length && !cyclic) {
    const unattached = [...seeds.keys()].filter(id => !childToConn.has(id));
    const onlyBadRoots = unattached.length > 0 && unattached.every(id => seeds.get(id).bad);
    if (!onlyBadRoots) err('Every part is a child of another part, but the links do not form a tree.');
  }
  if (roots.length > 1) {
    warn(`More than one root (${roots.join(', ')}). The extra parts are laid out beside the main craft instead of stacked at the origin.`);
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

  function place(seedId, matrix, parentInstanceId, symmetryIndex, instanceId, layout) {
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
      symmetryIndex,
      layout: layout || null
    });
    for (const c of conns) {
      if (c.parent !== seedId || c.bad) continue;
      for (let k = 0; k < c.symmetry; k++) {
        if (instances.length >= MAX_INSTANCES) { truncated = true; return; }
        const childInstanceId = instanceIdFor(c.child, id, seedId, k);
        const angle = (k * 360 / c.symmetry + c.offset) * Math.PI / 180;
        if (c.layout === 'ring') {
          // Ring segments share the hub origin. Mating the spoke port would pull the tube inward.
          place(c.child, mulMat(matrix, rotYMatrix(angle)), id, k + 1, childInstanceId, 'ring');
          continue;
        }
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
        if (c.layout !== 'spoke' && k === 0 && id === seedId) {
          const dParent = stackDiameter(seeds.get(c.parent).variant, c.parentNodeName);
          const dChild = stackDiameter(seeds.get(c.child).variant, c.childNodeName);
          if (dParent != null && dChild != null && Math.abs(dParent - dChild) > Math.max(0.05, 0.08 * Math.max(dParent, dChild))) {
            warn(`Stack size mismatch on ${c.parent}.${c.parentNodeName} (${fmtM(dParent)} m, ${seeds.get(c.parent).variant.size}) and ${c.child}.${c.childNodeName} (${fmtM(dChild)} m, ${seeds.get(c.child).variant.size}).`);
          }
        }
        place(c.child, joint.matrix, id, k + 1, childInstanceId, c.layout === 'spoke' ? 'spoke' : null);
      }
    }
  }

  // Extra roots go in a row along +X, clear of whatever was already placed.
  orderedRoots.forEach((id, i) => {
    const variant = seeds.get(id).variant;
    const span = Math.max((variant && variant.bbox && variant.bbox[0]) || 2, (variant && variant.bbox && variant.bbox[2]) || 2);
    let x = 0;
    if (i > 0) {
      let maxX = 0;
      for (const inst of instances) {
        const box = seeds.get(inst.seedId).variant.bbox;
        maxX = Math.max(maxX, inst.position[0] + ((box && box[0]) || span) / 2);
      }
      x = maxX + 2 + span / 2;
    }
    const matrix = identityMatrix();
    matrix[12] = x;
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
      if (a.layout === 'ring' && (b.layout === 'ring' || b.layout === 'spoke')) continue;
      if (b.layout === 'ring' && a.layout === 'spoke') continue;
      const vol = overlapVolume(boxes[i].box, boxes[j].box, 0.05);
      // Skin-mounted neighbours graze by a few litres of AABB. Only flag a real clash.
      if (vol > 0.2) {
        warn(`Possible overlap between ${a.id} and ${b.id} (about ${vol.toFixed(2)} m³). Bounding boxes only — thin shells and radial gaps can false-alarm.`);
      }
    }
  }

  return { ok: errors.length === 0, name, errors, warnings, instances, joints, plan: craft };
}

/** A clean rocket can carry a note or two. A pile of warnings, or joints that never landed, should be sent back to the model. */
export function planNeedsAnotherTry(result) {
  if (!result) return false;
  const errors = result.errors || [];
  const warnings = result.warnings || [];
  if (errors.length) return true;
  if (warnings.length >= 8) return true;
  const overlaps = warnings.filter(w => /overlap/i.test(w.message || ''));
  if (overlaps.length >= 3) return true;
  return warnings.some(w => /laid out beside|size mismatch|could not attach/i.test(w.message || ''));
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
