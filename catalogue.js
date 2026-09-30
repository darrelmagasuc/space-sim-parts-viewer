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
  "name": "Hopper",
  "summary": "Two-stage M-class rocket with side boosters and grid fins.",
  "parts": [
    { "id": "chute", "variant": "stage08_main_chute_m" },
    { "id": "capsule", "variant": "cmd04_soyuz_descent" },
    { "id": "tank", "variant": "tank00_kerolox_m" },
    { "id": "engine", "variant": "prop08_merlin" },
    { "id": "booster", "variant": "prop05_srb_small" },
    { "id": "fin", "variant": "stage10_grid_fin_m_deployed" }
  ],
  "stack": ["chute", "capsule", "tank", "engine"],
  "attach": [
    { "part": "booster", "to": "tank", "symmetry": 2 },
    { "part": "fin", "to": "tank", "symmetry": 4, "offset": 45 }
  ],
  "staging": [
    { "stage": 1, "title": "Liftoff", "parts": ["engine", "booster"], "note": "Light the core and both solids." }
  ],
  "manual": "# Flight guide\\nmarkdown for a pilot"
}`;

const SYSTEM_RULES = `You design vehicles for a Kerbal-like space simulator. Parts are metres, Godot Y-up. Nose and flight direction are +Y. Rovers: up is +Y, forward is +Z.

Reply with ONE JSON object and nothing else. No markdown fences. Use this shape. "stack" is the column from nose to tail (first id is highest, last id is the engine or the aft end). "attach" is only for parts that stick out of the side: boosters, fins, wings, legs, antennas, solar panels.

${CRAFT_SCHEMA}

The page mates each stack neighbour itself: the upper part's node_bottom sits on the lower part's node_top. It mates each attach part by node_attach onto a side node, and clocks the next pattern so boosters and fins do not share an angle. You do not need to name nodes. If you do send "connections" anyway, each needs child, parent, and optionally childNode and parentNode. Wrong or missing node names are repaired. Do not put the engine's nozzle node on the tank, and do not put two stack faces that both point +Y against each other.

Rules that keep the craft in one piece:
- One size along a stack. XS 0.625, S 1.25, M 2.5, L 3.75, XL 5, XXL 7.5 metres. Adapters are named top-class then bottom-class, such as stage03_interstage_s_m.
- symmetry 2 is a left/right pair. symmetry 4 is a cross. List that part once. offset 45 puts a cross between a pair.
- Wheels are not a symmetry group. A chassis already includes wheels. Extra wheels use one attach per node_wheel_N.
- Aircraft: put the cockpit, then the fuselage tank, then the jet engine in stack. Wings go in attach with symmetry 2.
- A gravity ship (a long spine and a rotating ring, like the Hermes) is not laid out on the ground. Put the spine in stack from nose to tail: truss sections such as station07_truss_l, the spin hub, then the engines last. Use one station09_spin_hub in that stack. Add one station10_spoke and one station11_ring_segment, and "ring": { "hub": "<hub id>", "spokes": 6, "segments": 12 }. The page radiates the spokes from the hub and rotates the segments into a ring about the hub axis. Do not put spokes or ring segments in stack, and do not copy them once per angle. Solar wings and radiators go in attach on a truss with symmetry 2. Use the deployed variants (power01_solar_wing_deployed, power08_radiator_l_deployed) when the arrays should be open.
- Prefer state "flight". Use a "_deployed" variant only when the user wants that pose.
- variant must be an id from the catalogue below. Instance ids are short names you invent, a letter first.
- staging is earliest first. manual is markdown a pilot can follow, and it should mention the instance ids.
- Every part in parts should appear in stack or attach. Parts left out are lined up beside the vehicle.`;

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
