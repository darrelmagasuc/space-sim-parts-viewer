#!/usr/bin/env python3
"""Minimal, engine-agnostic reference of the Vehicle Creation placement rules.

Reads a saved craft (handoff/test_vehicles/*.craft.json) and handoff/parts_manifest.json,
places every instance with the core rules from vehicle_creation_spec.md (no repair pass,
no validation warnings), and compares against the matching *.expected.json.

This is a second, independent implementation of the spec (the first is assemble.js), kept
deliberately small so it can be translated line by line to GDScript.

  python3 handoff/tools/reference_builder.py            # check every test vehicle
  python3 handoff/tools/reference_builder.py lander     # one vehicle, prints instances
Stdlib only.
"""
import json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
HANDOFF = os.path.dirname(HERE)


# ---- vectors / quaternions [x, y, z, w] -----------------------------------------------
def add(a, b): return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
def sub(a, b): return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
def dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def norm(a):
    L = math.sqrt(dot(a, a))
    return [a[0] / L, a[1] / L, a[2] / L]
def qnorm(q):
    L = math.sqrt(sum(c * c for c in q)) or 1.0
    return [c / L for c in q]


def rot_y(v, ang):
    """Right-handed rotation about +Y: x' = c x + s z, z' = -s x + c z."""
    c, s = math.cos(ang), math.sin(ang)
    return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]


def quat_from_to(a, b):
    """Shortest rotation taking unit a onto unit b. Antiparallel fallback is part of the spec."""
    r = dot(a, b) + 1.0
    if r < 1e-8:
        if abs(a[0]) > abs(a[2]): return qnorm([-a[1], a[0], 0.0, 0.0])
        return qnorm([0.0, -a[2], a[1], 0.0])
    return qnorm([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0], r])


def quat_axis_angle(axis, ang):
    s = math.sin(ang / 2)
    return [axis[0] * s, axis[1] * s, axis[2] * s, math.cos(ang / 2)]


def quat_mul(a, b):
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return [aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
            aw * bw - ax * bx - ay * by - az * bz]


def quat_apply(q, v):
    x, y, z, w = q
    tx, ty, tz = 2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])
    return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)]


def quat_rot_y(ang): return [0.0, math.sin(ang / 2), 0.0, math.cos(ang / 2)]


class Xform:
    """Rigid transform: world = q * local + origin."""
    def __init__(self, origin=None, q=None):
        self.origin = origin or [0.0, 0.0, 0.0]; self.q = q or [0.0, 0.0, 0.0, 1.0]
    def point(self, v): return add(quat_apply(self.q, v), self.origin)
    def dir(self, v): return norm(quat_apply(self.q, v))
    def basis(self):  # columns
        return [self.dir([1, 0, 0]), self.dir([0, 1, 0]), self.dir([0, 0, 1])]


def mate(parent, pnode, cnode, angle, roll_deg):
    """Child transform that puts cnode on pnode (pnode clocked by angle about parent local +Y)."""
    p_point = parent.point(rot_y(pnode["pos"], angle))
    p_dir = parent.dir(norm(rot_y(pnode["dir"], angle)))
    c_dir = norm(cnode["dir"])
    q = quat_from_to(c_dir, [-p_dir[0], -p_dir[1], -p_dir[2]])
    if roll_deg:
        q = qnorm(quat_mul(quat_axis_angle(p_dir, math.radians(roll_deg)), q))
    origin = sub(p_point, quat_apply(q, cnode["pos"]))
    return Xform(origin, q), p_point, p_dir


def instance_id(seed, parent_inst, parent_seed, k, symmetry=1):
    suffix = parent_inst[len(parent_seed):] if parent_inst != parent_seed else ""
    if not suffix: return seed if k == 0 else f"{seed}@{k + 1}"
    return f"{seed}{suffix}" if symmetry <= 1 else f"{seed}{suffix}~{k + 1}"


def load_variants():
    man = json.load(open(os.path.join(HANDOFF, "parts_manifest.json")))
    out = {}
    for p in man["parts"]:
        for v in p["variants"]:
            out[v["vid"]] = {n["name"]: n for n in v["nodes"]} | {"__bbox": v["bbox_m"]}
    return out


def build(craft, variants):
    seeds = {p["id"]: p["variant"] for p in craft["parts"]}
    conns = craft["connections"]
    children = {c["child"] for c in conns}
    roots = [p["id"] for p in craft["parts"] if p["id"] not in children]
    if craft.get("root") in roots: roots.remove(craft["root"]); roots.insert(0, craft["root"])
    instances, joints = [], []

    def place(seed, xf, parent_id, sym_index, inst_id, layout):
        instances.append(dict(id=inst_id, seedId=seed, variant=seeds[seed], parentId=parent_id,
                              symmetryIndex=sym_index, layout=layout, xf=xf))
        for c in conns:                      # file order = placement order
            if c["parent"] != seed: continue
            n = int(c.get("symmetry") or 1)
            for k in range(n):
                cid = instance_id(c["child"], inst_id, seed, k, n)
                ang = math.radians(k * 360.0 / n + float(c.get("offset") or 0))
                if c.get("layout") == "ring":    # ring segments share the hub origin, rotated about its +Y
                    place(c["child"], Xform(list(xf.origin), qnorm(quat_mul(xf.q, quat_rot_y(ang)))), inst_id, k + 1, cid, "ring")
                    continue
                pnode = variants[seeds[seed]][c["parentNode"]]
                cnode = variants[seeds[c["child"]]][c["childNode"]]
                cxf, p_point, p_dir = mate(xf, pnode, cnode, ang, float(c.get("rotation") or 0))
                joints.append(dict(parentId=inst_id, childId=cid, position=p_point, parentDirection=p_dir))
                place(c["child"], cxf, inst_id, k + 1, cid, "spoke" if c.get("layout") == "spoke" else None)

    for i, r in enumerate(roots):
        if i == 0: place(r, Xform(), None, 1, r, None)
        else:
            maxx = max(inst["xf"].origin[0] + variants[inst["variant"]]["__bbox"][0] / 2 for inst in instances)
            b = variants[seeds[r]]["__bbox"]; span = max(b[0] or 2, b[2] or 2)
            place(r, Xform([maxx + 2 + span / 2, 0.0, 0.0]), None, 1, r, None)
    return instances, joints


def compare(name, variants, verbose=False):
    craft = json.load(open(os.path.join(HANDOFF, "test_vehicles", name + ".craft.json")))
    exp = json.load(open(os.path.join(HANDOFF, "test_vehicles", name + ".expected.json")))
    tol = exp["tolerance_m"]
    inst, joints = build(craft, variants)
    bad = []
    if len(inst) != len(exp["instances"]): bad.append(f"instance count {len(inst)} != {len(exp['instances'])}")
    by_id = {i["id"]: i for i in inst}
    for e in exp["instances"]:
        g = by_id.get(e["id"])
        if not g: bad.append("missing " + e["id"]); continue
        if g["parentId"] != e["parentId"] or g["symmetryIndex"] != e["symmetryIndex"]: bad.append("tree differs at " + e["id"])
        d = math.dist(g["xf"].origin, e["origin"])
        if d > tol: bad.append(f"{e['id']} origin off by {d:.2e}")
        for col_g, col_e in zip(g["xf"].basis(), e["basis"]):
            if math.dist(col_g, col_e) > exp["tolerance_dir"]: bad.append(f"{e['id']} basis differs"); break
        nodes = variants[g["variant"]]
        for en in e["nodes"]:
            n = nodes[en["name"]]
            if math.dist(g["xf"].point(n["pos"]), en["position"]) > tol: bad.append(f"{e['id']}.{en['name']} position"); break
            if math.dist(g["xf"].dir(n["dir"]), en["direction"]) > exp["tolerance_dir"]: bad.append(f"{e['id']}.{en['name']} direction"); break
        if verbose:
            print(f"  {e['id']:<14} {g['variant']:<34} origin {[round(x, 4) for x in g['xf'].origin]}")
    if len(joints) != len(exp["joints"]): bad.append(f"joint count {len(joints)} != {len(exp['joints'])}")
    print(("ok   " if not bad else "FAIL ") + f"{name}: {len(inst)} instances, {len(joints)} joints" + ("" if not bad else "\n   " + "\n   ".join(bad[:10])))
    return not bad


if __name__ == "__main__":
    variants = load_variants()
    names = sys.argv[1:] or sorted(f[:-11] for f in os.listdir(os.path.join(HANDOFF, "test_vehicles")) if f.endswith(".craft.json"))
    ok = all([compare(n, variants, verbose=len(sys.argv) > 1) for n in names])
    print("reference builder matches every expected file" if ok else "MISMATCH")
    sys.exit(0 if ok else 1)
