// Compact part catalogue for the vehicle planner. Built from manifest.json, which
// build_site.py fills from each models/<category>/<id>.nodes.json. New parts show
// up here with no change to this file.

const PREFERRED_DIMS = [
  'diameter_m', 'stack_diameter_m', 'interface_diameter_m', 'top_diameter_m', 'bottom_diameter_m',
  'length_m', 'height_m', 'width_m', 'span_m', 'semi_span_m'
];

function fmt(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return String(n);
  const a = Math.abs(n);
  const s = (a >= 10 ? n.toFixed(1) : a >= 1 ? n.toFixed(2) : n.toFixed(3)).replace(/\.?0+$/, '');
  return s || '0';
}

function copyNode(n) {
  return {
    name: n.name,
    position: [n.position[0], n.position[1], n.position[2]],
    direction: [n.direction[0], n.direction[1], n.direction[2]]
  };
}

function shortDims(dims) {
  dims = dims || {};
  const chosen = [];
  for (const k of PREFERRED_DIMS) if (typeof dims[k] === 'number') chosen.push(k);
  for (const k of Object.keys(dims)) {
    if (chosen.length >= 4) break;
    if (typeof dims[k] === 'number' && !chosen.includes(k)) chosen.push(k);
  }
  return chosen.slice(0, 4).map(k => `${k.replace(/_m$/, '').replace(/_/g, ' ')} ${fmt(dims[k])}`).join(', ');
}

function nodeKey(nodes) {
  return (nodes || []).map(n => n.name).join(',');
}

export const CRAFT_SCHEMA = `{
  "name": "short craft name",
  "summary": "one sentence",
  "parts": [
    { "id": "core", "variant": "tank00_kerolox_m", "note": "optional role" }
  ],
  "connections": [
    {
      "child": "engine",
      "childNode": "node_top",
      "parent": "core",
      "parentNode": "node_bottom",
      "symmetry": 1,
      "rotation": 0,
      "offset": 0
    }
  ],
  "staging": [
    { "stage": 1, "title": "Liftoff", "parts": ["engine"], "note": "what happens" }
  ],
  "manual": "# Flight guide\\nmarkdown for a pilot"
}`;

const SYSTEM_RULES = `You design vehicles for a Kerbal-like space simulator with grounded sizes. Parts are metres, Godot Y-up. For rockets and aircraft the nose / flight direction is +Y. For rovers and surface modules, up is +Y and forward is +Z.

Reply with ONE JSON object only. No markdown fences, no commentary. The object must match this schema:
${CRAFT_SCHEMA}

How a joint works: the child's node is moved onto the parent's node so the two outward normals point at each other (they are opposite). "rotation" is extra twist in degrees, right-handed about the parent's node direction. "offset" clocks a radial pattern around the parent's +Y in degrees (use it so boosters and fins do not occupy the same angle). "symmetry" N copies the child (and anything later attached to that child) N times around the parent's +Y, starting at parentNode plus offset. List a symmetric child once in parts.

Attachment habits that fit these parts:
- Stack something above: child node_bottom on parent node_top.
- Stack something below (engine, decoupler under a tank): child node_top on parent node_bottom. Engine node_top is the forward / mounting face; node_bottom is the nozzle.
- Fairing: its node_bottom sits on the tank's node_top. Payload uses the fairing's node_payload only if you really need a part inside.
- Radial and surface parts (SRBs, grid fins, landing legs, RCS, wings, solar arrays, antennas, wheels) use child node_attach. Put it on parent node_side_N, node_wheel_N, or another outward node.
- symmetry 2 is a left/right or booster pair. symmetry 4 is a cross. Wheels are NOT one symmetry group: each node_wheel_N is a separate connection, because they sit at different stations.
- Size classes must match on node_top / node_bottom joints: XS 0.625, S 1.25, M 2.5, L 3.75, XL 5, XXL 7.5 metres. Adapter variants are named top-class then bottom-class (stage03_interstage_s_m: node_top is S, node_bottom is M).
- Aircraft: cockpit node_bottom is the aft face. A jet's node_top faces forward and mates a fuselage node_bottom. Wings use node_attach and symmetry 2 on a fuselage node_side_1; the copy spun 180° about Y keeps the leading edge forward.
- Rovers already in the catalogue include their own wheels. To use the separate WH wheels, attach rover04 node_attach to a chassis node_wheel_N. The preview hides the chassis mesh wheel that was replaced.
- Prefer state "flight". Use a "_deployed" variant only when the user wants that pose.
- Use only variant ids from the catalogue. Instance ids are short names you invent (letter first). Exactly one root: the part with no connection.
- staging is the flight sequence, earliest first. manual is markdown a pilot can follow: what the craft is, staging, how to fly or drive it, and one or two tips. Mention real instance ids.`;

export function buildCatalogue(manifest) {
  const exactVid = new Map();
  const byPart = new Map();
  const categories = [];

  for (const cat of manifest.categories || []) {
    const parts = [];
    for (const part of cat.parts || []) {
      const variants = [];
      for (const v of part.variants || []) {
        const nodes = Array.isArray(v.nodes) ? v.nodes.map(copyNode) : [];
        const entry = {
          vid: v.vid,
          partId: part.id,
          partName: part.name,
          category: cat.key,
          categoryTitle: cat.title,
          size: v.size,
          state: v.state,
          label: v.label || '',
          primary: !!v.primary,
          dims: v.dims || {},
          bbox: Array.isArray(v.bbox) ? v.bbox.slice() : null,
          nodes,
          glb: v.glb || ''
        };
        exactVid.set(v.vid, entry);
        variants.push(entry);
      }
      const primary = variants.find(v => v.primary) || variants[0];
      if (primary) byPart.set(part.id, primary);
      parts.push({ id: part.id, name: part.name, variants, primary });
    }
    categories.push({ key: cat.key, title: cat.title, parts });
  }

  const lowerVid = new Map();
  for (const [vid, entry] of exactVid) lowerVid.set(vid.toLowerCase(), entry);
  const lowerPart = new Map();
  for (const [id, entry] of byPart) lowerPart.set(id.toLowerCase(), entry);

  function lookup(ref) {
    if (ref == null) return null;
    const key = String(ref).trim();
    if (!key) return null;
    if (exactVid.has(key)) return { variant: exactVid.get(key), via: null };
    const ci = lowerVid.get(key.toLowerCase());
    if (ci) return { variant: ci, via: key };
    if (byPart.has(key)) return { variant: byPart.get(key), via: key };
    const cp = lowerPart.get(key.toLowerCase());
    if (cp) return { variant: cp, via: key };
    return null;
  }

  function promptText() {
    const lines = [SYSTEM_RULES, '', 'CATALOGUE (every variant you may use):'];
    for (const cat of categories) {
      lines.push('', `# ${cat.key} — ${cat.title}`);
      for (const part of cat.parts) {
        const groups = new Map();
        for (const v of part.variants) {
          const key = nodeKey(v.nodes);
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(v);
        }
        lines.push(`part ${part.id} ${part.name}`);
        for (const group of groups.values()) {
          const nodes = group[0].nodes.map(n => n.name).join(', ') || '(no attach nodes — do not use)';
          lines.push(`  nodes: ${nodes}`);
          for (const v of group) {
            const bits = [v.vid, `size ${v.size}`, v.state !== 'flight' ? v.state : '', v.label && v.label !== part.name ? v.label : '', shortDims(v.dims)];
            lines.push('  - ' + bits.filter(Boolean).join(' | '));
          }
        }
      }
    }
    lines.push('', 'End of catalogue. Return the JSON object now when the user describes a craft.');
    return lines.join('\n');
  }

  return {
    byVid: exactVid, byPart, categories, lookup, promptText,
    partCount: [...byPart.keys()].length,
    variantCount: countVariants(categories)
  };
}

function countVariants(categories) {
  let n = 0;
  for (const c of categories) for (const p of c.parts) n += p.variants.length;
  return n;
}
