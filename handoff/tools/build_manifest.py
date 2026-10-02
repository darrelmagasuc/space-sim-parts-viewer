#!/usr/bin/env python3
"""Build handoff/parts_manifest.json: every part and variant with paths, URLs, nodes, slots, mass, triangle counts.

usage (from the repo root):
  python3 handoff/tools/build_manifest.py                      # uses manifest.json, models/**, handoff/tools/part_info.json
  python3 handoff/tools/build_manifest.py --version 0.3.1      # set manifest_version (default: keep the current one)
  python3 handoff/tools/build_manifest.py --out PATH           # write elsewhere (publish_update.py uses this to diff)
  python3 handoff/tools/build_manifest.py --refresh-info DIR   # first re-extract part_info.json from the catalogue
                                                               # sources in DIR (parts.py + new_parts_spec.json)
Only reads files in this repository (part_info.json is the committed extract of the catalogue text), so it can be
re-run after a parts update. Standard library only.
"""
import hashlib, json, math, os, re, struct, sys, glob, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(REPO, "handoff", "parts_manifest.json")
INFO = os.path.join(HERE, "part_info.json")
GH_OWNER, GH_REPO, BRANCH = "darrelmagasuc", "space-sim-parts-viewer", "main"
RAW = f"https://raw.githubusercontent.com/{GH_OWNER}/{GH_REPO}/{BRANCH}/"
PAGES = f"https://{GH_OWNER}.github.io/{GH_REPO}/"
CLASS_ORDER = ["XS", "S", "M", "L", "XL", "XXL"]
CLASS_D = {"XS": 0.625, "S": 1.25, "M": 2.5, "L": 3.75, "XL": 5.0, "XXL": 7.5}
# Rough bulk densities (t per m^3 of the default pose's bounding box) used only when the catalogue gives no mass.
EST_DENSITY = {"cmd": 0.25, "prop": 0.2, "tank": 0.55, "stage": 0.08, "station": 0.06, "power": 0.05, "rover": 0.12,
               "jet": 0.2, "cockpit": 0.12, "aero": 0.12, "struct": 0.04, "robo": 0.15, "sci": 0.15}
SLOT_ITEM_IDS = {"tank08": "Small", "rover07": "Small", "power04": "Small"}  # CONVENTIONS.md "Internal slots"


def refresh_info(src):
    sys.path.insert(0, src)
    from parts import S  # noqa: E402  (catalogue text for the original 108 parts)
    spec = json.load(open(os.path.join(src, "new_parts_spec.json")))
    info = {}
    for cat, rows in S.items():
        for i, (name, size, desc, ingame, real) in enumerate(rows):
            info[f"{cat}{i:02d}"] = dict(name=name, size_text=size, summary=desc, in_game=ingame, real_life=real, source="catalogue (parts.py)")
    for p in spec["parts"]:
        kd = p.get("key_dimensions") or {}
        info[p["id"]] = dict(name=p["name"], size_text=" / ".join(p.get("size_classes") or []), summary=p.get("summary", ""),
                             in_game=p.get("function", ""), real_life=(p.get("real_life") or {}).get("equivalent", ""),
                             group=p.get("group"), source="new_parts_spec.json",
                             key_mass_t=kd.get("mass_t") if isinstance(kd.get("mass_t"), (int, float)) else None)
    json.dump(info, open(INFO, "w"), indent=1, ensure_ascii=False)
    print("wrote", INFO, len(info), "parts")


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""): h.update(chunk)
    return h.hexdigest()


def sha256_obj(obj):
    return hashlib.sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def glb_tris(path):
    j = glb_json(path); n = 0
    for nd in j.get("nodes", []):
        if "mesh" not in nd: continue
        for prim in j["meshes"][nd["mesh"]]["primitives"]:
            if prim.get("mode", 4) != 4: continue
            acc = prim.get("indices", prim["attributes"]["POSITION"])
            n += j["accessors"][acc]["count"] // 3
    return n


def finish_hashes(rec, files):
    """files: {label: repo-relative path}. Adds sha256 per file, content_hash (files only) and meta_hash (everything else)."""
    rec["sha256"] = {k: sha256_file(os.path.join(REPO, v)) for k, v in files.items()}
    return rec


# Exterior meshes to hide when an interior is loaded, from the interiors README when the nodes JSON has no exterior_hide.
INTERIOR_EXTERIOR_HIDE = {
    "cockpit00": ["ejection_seat", "seat_handle", "instrument_panel", "hud", "side_stick"],
    "cockpit01": ["front_seat", "rear_seat", "seat_handles", "front_panel", "rear_panel", "sticks"],
}


def build_interiors(parts_by_id):
    src = os.path.join(REPO, "models", "interiors", "interiors.json")
    if not os.path.isfile(src): return [], []
    rec = json.load(open(src))
    out = []
    for it in rec["interiors"]:
        pid = it["id"]; ext = parts_by_id.get(pid)
        nj_rel = f"models/interiors/{pid}_interior.nodes.json"
        nj = json.load(open(os.path.join(REPO, nj_rel)))
        hide = nj.get("exterior_hide") or INTERIOR_EXTERIOR_HIDE.get(pid, [])
        vs = []
        for vid, njv in nj["variants"].items():
            exv = njv["exterior_variant"]
            files = {k: f"models/interiors/{exv}{suf}.glb" for k, suf in (("glb_interior", "_interior"), ("glb_combined", "_combined"), ("glb_cutaway", "_cutaway"))}
            thumb = f"thumbs/interiors/{vid}.jpg"
            v = dict(vid=vid, exterior_variant=exv, state=njv.get("state"), primary=bool(njv.get("primary")), crew=njv.get("crew"),
                     nodes=[dict(name=n["name"], pos=n["position"], dir=n["direction"], up=n.get("up")) for n in njv.get("nodes", [])],
                     props=[dict(instance=p_["instance"], prop=p_["prop"], pos=p_["position"], basis_columns=p_["basis_columns"]) for p_ in njv.get("props", [])],
                     tris={k: glb_tris(os.path.join(REPO, f)) for k, f in files.items()},
                     bytes={k: os.path.getsize(os.path.join(REPO, f)) for k, f in files.items()},
                     paths=dict(**files, nodes_json=nj_rel, thumb=thumb if os.path.isfile(os.path.join(REPO, thumb)) else None,
                                exterior_glb_lowpoly=next((x["paths"]["glb_lowpoly"] for x in (ext or {}).get("variants", []) if x["vid"] == exv), None),
                                godot_suggested=f"res://parts/interiors/{exv}_interior.glb"),
                     urls={**{k + "_raw": RAW + f for k, f in files.items()}, **{k + "_pages": PAGES + f for k, f in files.items()},
                           "nodes_json_raw": RAW + nj_rel, "nodes_json_pages": PAGES + nj_rel})
            finish_hashes(v, files)
            vs.append(v)
        e = dict(id=pid + "_interior", exterior_part_id=pid, exterior_category=(ext or {}).get("category"), name=it["name"],
                 reference=it.get("reference"), crew=it.get("crew"), frame=nj.get("frame"), wall_t_m=nj.get("wall_t_m"),
                 cavity=nj.get("cavity"), exterior_hide=hide, moving_meshes=nj.get("moving_meshes", []),
                 hatches=nj.get("hatches"), windows=nj.get("windows"), notes=nj.get("notes"),
                 validation=it.get("validation"), known_issue=it.get("known_issue"),
                 skipped_variants=it.get("skipped_variants", []), variants=vs)
        e["sha256"] = {"nodes_json": sha256_file(os.path.join(REPO, nj_rel))}
        out.append(e)
    return out, rec.get("skipped", [])


def glb_json(path):
    with open(path, "rb") as f:
        b = f.read(20); n = struct.unpack("<I", b[12:16])[0]
        return json.loads(f.read(n))


def glb_info(path):
    """named meshes (with POSITION bounds) and material names of a GLB, from its JSON chunk only."""
    if not os.path.exists(path): return None
    j = glb_json(path); meshes = {}
    for nd in j.get("nodes", []):
        if "mesh" not in nd: continue
        lo, hi = [1e9] * 3, [-1e9] * 3
        for prim in j["meshes"][nd["mesh"]]["primitives"]:
            a = j["accessors"][prim["attributes"]["POSITION"]]
            lo = [min(x, y) for x, y in zip(lo, a["min"])]; hi = [max(x, y) for x, y in zip(hi, a["max"])]
        meshes[nd.get("name", "")] = dict(t=nd.get("translation", [0, 0, 0]), r=nd.get("rotation", [0, 0, 0, 1]), lo=lo, hi=hi)
    return dict(meshes=meshes, materials=[m.get("name") for m in j.get("materials", [])])


NUM = r"\d+(?:\.\d+)?"
LIST = rf"{NUM}(?:\s*/\s*{NUM})*"


def parse_mass(text):
    """-> (values list, unit, kind, extra) from catalogue in-game / function text, or None."""
    if not text: return None
    t = text.strip()
    m = re.match(rf"^(?:(Wet|Hold|Dry)\s+)?({LIST})\s*(t|kg)\b(\s+wet)?", t)
    if m:
        vals = [float(x) for x in re.split(r"\s*/\s*", m.group(2))]
        kind = {"Wet": "wet", "Hold": "propellant_capacity", "Dry": "dry"}.get(m.group(1) or "", "wet" if m.group(4) else "unspecified")
        return vals, m.group(3), kind, t
    m = re.match(rf"^({NUM})\s*-\s*({NUM})\s*t\b", t)
    if m: return [float(m.group(1)), float(m.group(2))], "t", "range_by_size", t
    m = re.search(rf"\b(?:Mass|mass)\s*(?:~|about|approx\.?)?\s*({LIST})\s*(t|kg)\b(?!\s*/\s*m)", t)
    if m: return [float(x) for x in re.split(r"\s*/\s*", m.group(1))], m.group(2), "unspecified", t
    m = re.search(rf"\b({LIST})\s*(t|kg)\s+(?:wet|dry|each)\b", t)
    if m: return [float(x) for x in re.split(r"\s*/\s*", m.group(1))], m.group(2), "unspecified", t
    return None


def size_key(s):
    return CLASS_ORDER.index(s) if s in CLASS_ORDER else 99


MASS_OVERRIDES = {
    "prop19": {"S": (0.07, "catalogue text 'Mass 0.18 / 0.07 t' lists M first (M is described first and is 3x the thrust); S = 0.07 t"),
               "M": (0.18, "catalogue text 'Mass 0.18 / 0.07 t' lists M first; M = 0.18 t")},
}


def masses_for_part(pid, cat, variants, info):
    """mass per variant id. Poses share their size's mass."""
    sizes = []
    for v in variants:
        if v["size"] not in sizes: sizes.append(v["size"])
    ordered = sorted(sizes, key=size_key) if all(s in CLASS_ORDER for s in sizes) else sizes
    default_bbox = {}
    for v in variants:
        if v["size"] not in default_bbox or v["state"] == "flight" or v.get("primary"):
            if v["size"] not in default_bbox or v["state"] in ("flight",): default_bbox[v["size"]] = v.get("bbox")
    parsed = parse_mass(info.get("in_game", "")) if info else None
    dryfrac = None
    if info:
        m = re.search(r"[Dd]ry(?: mass)?\s*~?\s*(\d+(?:\.\d+)?)\s*%", info.get("in_game", ""))
        if m: dryfrac = float(m.group(1)) / 100
    out = {}
    for v in variants:
        rec = None
        dm = v.get("dims", {}).get("mass_t")
        if isinstance(dm, (int, float)):
            rec = dict(mass_t=dm, mass_kind="unspecified", mass_source="nodes.json dims.mass_t", mass_estimated=False)
        elif parsed:
            vals, unit, kind, txt = parsed
            k = 1.0 if unit == "t" else 0.001
            idx = ordered.index(v["size"]) if v["size"] in ordered else 0
            val = None
            if kind == "range_by_size" and len(ordered) > 1:
                val = vals[0] + (vals[1] - vals[0]) * idx / (len(ordered) - 1); est = True
            elif kind == "range_by_size":
                val = (vals[0] + vals[1]) / 2; est = True
            elif len(vals) == 1:
                val = vals[0]; est = False
            elif len(vals) == len(ordered):
                val = vals[idx]; est = False
            if val is not None:
                val *= k
                note = None
                if kind == "propellant_capacity":
                    note = f"catalogue gives propellant capacity {round(val, 4)} t"
                    if dryfrac: val = val * (1 + dryfrac); note += f"; mass_t = capacity x (1 + {dryfrac:g} dry fraction)"
                    est = True; kind = "wet"
                if kind == "range_by_size": kind = "unspecified"; note = "interpolated by size from a catalogue range"
                if "approx" in txt[:60] or "(approx" in txt: est = True
                rec = dict(mass_t=round(val, 4), mass_kind=kind, mass_source="catalogue in-game text", mass_estimated=est)
                if kind == "wet" and dryfrac: rec["dry_mass_t"] = round(val * dryfrac if parsed[2] == "wet" else val / (1 + dryfrac) * dryfrac, 4)
                if note: rec["mass_note"] = note
        if rec is None and info and isinstance(info.get("key_mass_t"), (int, float)) and len(ordered) == 1:
            rec = dict(mass_t=info["key_mass_t"], mass_kind="unspecified", mass_source="new_parts_spec key_dimensions.mass_t", mass_estimated=False)
        am = re.search(r"[Mm]ass\s*~?\s*(\d+(?:\.\d+)?)\s*kg/m2", info.get("in_game", "")) if info else None
        if rec is None and am:
            b = sorted(default_bbox.get(v["size"]) or v.get("bbox") or [1, 1, 1])
            areal = float(am.group(1)) / 1000
            if cat == "stage":   # cone/ogive shell: lateral area of a cone with the bbox radius and height
                bb = v.get("bbox") or b; h = bb[1]; r = max(bb[0], bb[2]) / 2
                area = math.pi * r * math.sqrt(r * r + h * h); how = "cone lateral area pi*r*sqrt(r^2+h^2) from bbox"
            else:                # wing-like plate: ~60% of the two largest bbox dims (planform)
                area = 0.6 * b[1] * b[2]; how = "0.6 x planform of the two largest bbox dims"
            rec = dict(mass_t=round(areal * area, 4), mass_kind="estimate", mass_source="estimate from catalogue areal density",
                       mass_estimated=True, mass_note=f"catalogue gives {am.group(1)} kg/m2; area ~{area:.3g} m^2 ({how})")
        if rec is None:
            b = default_bbox.get(v["size"]) or v.get("bbox") or [1, 1, 1]
            vol = max(1e-4, b[0] * b[1] * b[2]); rho = EST_DENSITY.get(cat, 0.1)
            rec = dict(mass_t=round(vol * rho, 3 if vol * rho < 10 else 1), mass_kind="estimate", mass_source="estimate",
                       mass_estimated=True, mass_note=f"no catalogue mass; bbox volume {vol:.3g} m^3 x {rho} t/m^3 ({cat} bulk density); replace with a designed value")
        if pid in MASS_OVERRIDES and v["size"] in MASS_OVERRIDES[pid]:
            val, why = MASS_OVERRIDES[pid][v["size"]]
            rec = dict(mass_t=val, mass_kind="unspecified", mass_source="catalogue in-game text (size order corrected)", mass_estimated=False, mass_note=why)
        if info and re.search(r"\bt per \d+ m\b", info.get("in_game", "")) and rec.get("mass_source", "").startswith("catalogue"):
            rec["mass_estimated"] = True
            rec["mass_note"] = "catalogue gives mass per length (" + re.search(r"[\d.]+ t per \d+ m", info["in_game"]).group(0) + "); value shown is for the modelled segment, scale by length"
        out[v["vid"]] = rec
    return out


def slots_for(pid, cat, v, info=None):
    d = v.get("dims", {}); prov, occ = None, None
    t = (info or {}).get("in_game", "") or ""
    m = re.search(r"\b(\d+)(?:\s*-\s*(\d+))?\s+(?:internal\s+)?(?:science\s+)?slots\b", t)
    if m and v["size"] != "slot":
        n = int(m.group(1)) if not m.group(2) else None
        prov = dict(small_units=n, text=m.group(0), source="catalogue in-game text") if n is not None else dict(small_units=None, text=m.group(0) + " (by size)", source="catalogue in-game text")
    for k in ("internal_slots", "slots_small"):
        if isinstance(d.get(k), int): prov = dict(small_units=d[k] if k == "internal_slots" else d[k], text=f"{d[k]} Small")
    s = d.get("slots")
    if isinstance(s, str):
        prov = dict(text=s, small_units=sum(int(n) * {"Small": 1, "Medium": 4, "Rack": 12}[c] for n, c in re.findall(r"(\d+)\s*(Small|Medium|Rack)", s)))
    if v["size"] == "slot" or "slot_class" in d or "slot_units" in d or pid in SLOT_ITEM_IDS or (isinstance(s, int) and cat == "power"):
        cls = d.get("slot_class")
        if not cls and "slot_units" in d: cls = {"2 x 2 x 1": "Medium", "2 x 2 x 3": "Rack"}.get(d["slot_units"], d["slot_units"])
        if not cls: cls = SLOT_ITEM_IDS.get(pid, "Small")
        occ = dict(slot_class=cls, mount_node="node_bottom")
    if not prov and not occ: return None
    out = {}
    if prov: out["provides"] = prov
    if occ: out["occupies"] = occ
    for k in ("slot_bay_m", "slot_m", "slot_units"):
        if k in d: out[k] = d[k]
    return out


def moving_meshes(variants, nodes_json_variants, glbs):
    """moving_meshes per variant: from nodes.json when published, else meshes whose bounds/transform differ between poses."""
    res = {}
    names = {}
    for v in variants:
        g = glbs.get(v["vid"])
        if g: names[v["vid"]] = g["meshes"]
    by_size = {}
    for v in variants: by_size.setdefault(v["size"], []).append(v["vid"])
    for v in variants:
        nj = nodes_json_variants.get(v["vid"], {})
        if nj.get("moving_meshes"):
            res[v["vid"]] = (nj["moving_meshes"], "nodes.json")
            continue
        group = [x for x in by_size[v["size"]] if x in names]
        if len(group) < 2 or v["vid"] not in names: res[v["vid"]] = ([], "single pose"); continue
        moving = set()
        for other in group:
            if other == v["vid"]: continue
            a, b = names[v["vid"]], names[other]
            for mname in set(a) | set(b):
                if mname not in a or mname not in b: moving.add(mname); continue
                if any(abs(x - y) > 1e-3 for x, y in zip(a[mname]["lo"] + a[mname]["hi"] + a[mname]["t"] + a[mname]["r"],
                                                     b[mname]["lo"] + b[mname]["hi"] + b[mname]["t"] + b[mname]["r"])):
                    moving.add(mname)
        res[v["vid"]] = (sorted(moving), "derived: meshes that differ between this part's pose variants")
    return res


def main():
    if "--refresh-info" in sys.argv: refresh_info(sys.argv[sys.argv.index("--refresh-info") + 1])
    man = json.load(open(os.path.join(REPO, "manifest.json")))
    info_all = json.load(open(INFO))
    parts, assemblies = [], []
    n_var = n_est = 0
    for c in man["categories"]:
        cat = c["key"]
        for p in c["parts"]:
            if cat == "assemblies":
                v = p["variants"][0]
                assemblies.append(dict(id=p["id"], name=p["name"], bbox_m=v["bbox"], tris_lowpoly=v.get("tris_lp"),
                                       paths=dict(glb_lowpoly=v["glb_lp"], glb_cad=v["glb"], json=p["json"]),
                                       urls=dict(glb_lowpoly_raw=RAW + v["glb_lp"], glb_lowpoly_pages=PAGES + v["glb_lp"], glb_cad_raw=RAW + v["glb"], glb_cad_pages=PAGES + v["glb"]),
                                       note="reference layout built from the individual parts (instanced meshes); not a buildable part, no nodes"))
                continue
            nj = json.load(open(os.path.join(REPO, p["json"])))
            info = info_all.get(p["id"], {})
            glbs = {v["vid"]: glb_info(os.path.join(REPO, v["glb_lp"])) for v in p["variants"]}
            mass = masses_for_part(p["id"], cat, p["variants"], info)
            mov = moving_meshes(p["variants"], nj["variants"], glbs)
            vs = []
            for v in p["variants"]:
                njv = nj["variants"].get(v["vid"], {})
                g = glbs.get(v["vid"]) or {"meshes": {}, "materials": []}
                rec = dict(
                    vid=v["vid"], label=v.get("label", ""), size=v["size"], state=v["state"], primary=v["primary"],
                    default_state=bool(njv.get("default_state", v["state"] == "flight" or v["primary"])),
                    default_of=njv.get("default_of"),
                    bbox_m=v["bbox"], dims=v.get("dims", {}), notes=njv.get("notes", ""),
                    **mass[v["vid"]],
                    slots=slots_for(p["id"], cat, v, info),
                    nodes=[dict(name=n["name"], pos=n["position"], dir=n["direction"]) for n in (v.get("nodes") or [])],
                    meshes=sorted(g["meshes"].keys()), moving_meshes=mov[v["vid"]][0], moving_meshes_source=mov[v["vid"]][1],
                    materials_lowpoly=g["materials"],
                    tris=dict(lowpoly=v.get("tris_lp"), cad=v.get("tris_cad")),
                    bytes=dict(lowpoly=v.get("bytes_lp"), cad=v.get("bytes")),
                    paths=dict(glb_lowpoly=v["glb_lp"], glb_cad=v["glb"], nodes_json=p["json"], thumb_lowpoly=v.get("thumb_lp"), thumb_cad=v.get("thumb"),
                               zip_lowpoly=f"space_sim_lowpoly_glb_v2/{cat}/{v['vid']}.glb", zip_cad=f"space_sim_glb_v3/{cat}/{v['vid']}.glb",
                               godot_suggested=f"res://parts/{cat}/{v['vid']}.glb"),
                    urls=dict(glb_lowpoly_raw=RAW + v["glb_lp"], glb_lowpoly_pages=PAGES + v["glb_lp"],
                              glb_cad_raw=RAW + v["glb"], glb_cad_pages=PAGES + v["glb"],
                              nodes_json_raw=RAW + p["json"], nodes_json_pages=PAGES + p["json"],
                              viewer=PAGES + "view.html?part=" + v["vid"]))
                finish_hashes(rec, {"glb_lowpoly": v["glb_lp"], "glb_cad": v["glb"]})
                if rec["slots"] is None: del rec["slots"]
                if rec["default_of"] is None: del rec["default_of"]
                if nj.get("line"):  # schema v3 (AX line): per-variant line, old vid it replaces, slot positions
                    rec["line"] = nj["line"]
                    old = redirects_for(nj).get(v["vid"]) if nj.get("aliases") else None
                    if old is not None: rec["alias_of"] = old
                    pos = (njv.get("extra") or {}).get("slots")
                    if pos: rec.setdefault("slots", {})["positions"] = pos
                    if nj.get("slot"):  # AX slot item: nodes.json top-level 'slot' = its class ("Small / Medium" -> by variant size)
                        cls = {"S": "Small", "M": "Medium"}.get(v["size"], v["size"]) if "/" in nj["slot"] else nj["slot"]
                        rec.setdefault("slots", {})["occupies"] = dict(slot_class=cls, mount_node="node_bottom")
                vs.append(rec); n_var += 1; n_est += rec["mass_estimated"]
            sizes = []
            for v in p["variants"]:
                if v["size"] not in sizes: sizes.append(v["size"])
            parts.append(dict(id=p["id"], name=p["name"], category=cat, category_title=c["title"], group=info.get("group") or p.get("group"),
                              sizes=sizes, size_text=info.get("size_text", ""), primary=p["primary"],
                              summary=info.get("summary") or p.get("summary") or "", in_game_role=info.get("in_game", ""),
                              real_life=info.get("real_life", ""), text_source=info.get("source", "none"),
                              variants=vs, sha256={"nodes_json": sha256_file(os.path.join(REPO, p["json"]))}))
            if nj.get("line"):  # schema v3 fields (AX line); base-line parts carry none of them (no line field = "base")
                parts[-1].update(line=nj["line"], display_id=nj.get("display_id"), key=nj.get("key") or p["id"],
                                 ax_category=nj.get("ax_category"), batch=nj.get("batch"), code=nj.get("code"),
                                 aliases=list(nj.get("aliases") or []), redirects={o: n for n, o in redirects_for(nj).items()},
                                 interior=nj.get("interior"))
    redirects = {}
    for p_ in parts:
        for a in p_.get("aliases", []): redirects[a] = p_["id"]
        redirects.update(p_.get("redirects", {}))
    lines = {}
    for p_ in parts:
        L = lines.setdefault(p_.get("line", "base"), dict(parts=0, variants=0)); L["parts"] += 1; L["variants"] += len(p_["variants"])
    for a_ in assemblies:
        a_["sha256"] = {k: sha256_file(os.path.join(REPO, a_["paths"][k])) for k in ("glb_lowpoly", "glb_cad")}
    interiors, interiors_skipped = build_interiors({p_["id"]: p_ for p_ in parts})
    for e in parts + interiors + assemblies:
        add_part_hashes(e)
    version = arg("--version") or previous_version() or "0.0.0"
    if not re.match(r"^\d+\.\d+\.\d+$", version): sys.exit(f"bad --version {version!r} (semver X.Y.Z)")
    doc = dict(
        manifest_version=version,
        generated_at=datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        schema_version=3,
        generator="handoff/tools/build_manifest.py",
        source=dict(repo=f"https://github.com/{GH_OWNER}/{GH_REPO}", branch=BRANCH, site=PAGES, site_manifest="manifest.json"),
        zips=dict(lowpoly=dict(path=man["zip_lp"], bytes=man["zip_lp_bytes"], url=PAGES + man["zip_lp"], raw=RAW + man["zip_lp"]),
                  cad=dict(path=man["zip"], bytes=man["zip_bytes"], url=PAGES + man["zip"], raw=RAW + man["zip"])),
        frame=dict(axes="Godot / glTF Y-up, right-handed; metres", stack_axis="+Y (nose / flight direction)",
                   ground_vehicles="up +Y, forward +Z, vehicle left +X", node_dir="outward unit normal of the mating face; GLB empty local +Y = dir"),
        size_classes=CLASS_D,
        counts=dict(parts=len(parts), variants=n_var, mass_estimated_variants=n_est, assemblies=len(assemblies),
                    interiors=len(interiors), interior_variants=sum(len(e["variants"]) for e in interiors)),
        lines=lines,
        redirects=dict(sorted(redirects.items())),
        changelog="handoff/CHANGELOG.md",
        schema=SCHEMA,
        parts=parts, interiors=interiors, interiors_skipped=interiors_skipped, assemblies=assemblies)
    out = arg("--out") or OUT
    json.dump(doc, open(out, "w"), indent=1, ensure_ascii=False)
    print(f"wrote {out}: v{version}, {len(parts)} parts, {n_var} variants ({n_est} with estimated mass), "
          f"{len(interiors)} interiors ({doc['counts']['interior_variants']} variants), {len(assemblies)} assemblies, {os.path.getsize(out) // 1024} KB")


def redirects_for(nj):
    """{new vid: old vid} for a re-keyed part (AX line re-coding of modern_set parts): nodes.json 'redirects'
    {old: new} if present, else derived (old vid = new vid with the key replaced by the alias)."""
    r = {n: o for o, n in (nj.get("redirects") or {}).items()}
    al = nj.get("aliases") or []
    if len(al) == 1:
        for vid in nj.get("variants", {}):
            if vid not in r and vid.startswith(nj["key"]): r[vid] = al[0] + vid[len(nj["key"]):]
    return r


def arg(name):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else None


def previous_version():
    try: return json.load(open(OUT)).get("manifest_version")
    except (OSError, ValueError): return None


HASH_KEYS = ("sha256", "content_hash", "meta_hash")


def add_part_hashes(e):
    """content_hash: sha256 over every file hash of the entry (GLBs + nodes.json); changes when any file changes.
    meta_hash: sha256 over the entry's data without hashes, bytes and URLs (mass, nodes, text, ...)."""
    files = dict(e.get("sha256", {}))
    for v in e.get("variants", []):
        for k, h in v.get("sha256", {}).items(): files[f"{v['vid']}:{k}"] = h
    e["content_hash"] = sha256_obj(files)
    strip = lambda o: {k: (strip(x) if isinstance(x, dict) else [strip(y) if isinstance(y, dict) else y for y in x] if isinstance(x, list) else x)
                       for k, x in o.items() if k not in HASH_KEYS and k not in ("bytes", "urls")}
    e["meta_hash"] = sha256_obj(strip(e))


SCHEMA = {
    "parts[]": {
        "id": "part id, e.g. tank00 (stable; never reused)",
        "name": "display name", "category": "category key = folder under models/ (cmd, prop, tank, stage, station, power, rover, jet, cockpit, aero, struct, robo, sci)",
        "group": "optional sub-group (e.g. 'rover kit')", "sizes": "size labels of the variants, in file order (stack classes XS..XXL, adapters 'S-M', or labels like 'slot', 'Mk2', 'swept-S')",
        "primary": "default variant id", "summary": "one-line description", "in_game_role": "catalogue gameplay text (mass, power, crew, slots, rules)",
        "real_life": "real-world reference", "text_source": "where summary/in_game_role came from",
        "variants[]": "one entry per GLB (size x pose)"},
    "variants[]": {
        "vid": "variant id = GLB file stem; use this in craft files",
        "size": "size label", "state": "'flight' for the default pose, otherwise the pose name (deployed, stowed, open, steer_left, ...)",
        "primary": "true for the part's default variant", "default_state": "true when this is the default pose of its size",
        "default_of": "(poses) vid of the default pose this pose belongs to (shares its origin)",
        "bbox_m": "[x, y, z] bounding-box size in Godot axes (m)", "dims": "designer dimensions from nodes.json (diameters, lengths, slots, energy, ...)",
        "mass_t": "mass in tonnes for gameplay", "mass_kind": "wet | dry | unspecified | estimate",
        "dry_mass_t": "(tanks) dry mass when the catalogue gives a dry fraction",
        "mass_source": "nodes.json dims.mass_t | catalogue in-game text | new_parts_spec key_dimensions.mass_t | estimate",
        "mass_estimated": "true = not a designed value (approximate catalogue figure, interpolated, or bbox-volume estimate): flag it in game data",
        "mass_note": "how an estimate was made",
        "slots": "{provides: {small_units, text}} for slot bays, {occupies: {slot_class: Small|Medium|Rack, mount_node}} for slot items. 1 Small = 0.5 x 0.5 x 0.6 m; Medium = 2x2x1 units; Rack = 2x2x3 units",
        "nodes[]": "{name, pos [x,y,z] m, dir [x,y,z] unit} in the part's local Godot frame",
        "meshes": "named mesh nodes in the low-poly GLB (same names in the CAD GLB)",
        "moving_meshes": "meshes that move between poses (animate these; others are static)", "moving_meshes_source": "nodes.json or derived",
        "materials_lowpoly": "material names used (shared library, see AGENT_HANDOFF.md)",
        "tris": "{lowpoly, cad} triangle counts", "bytes": "{lowpoly, cad} GLB file sizes",
        "paths": "repo-relative paths (glb_lowpoly default, glb_cad, nodes_json, thumbs), paths inside the two zips, suggested Godot res:// path",
        "urls": "raw.githubusercontent.com and GitHub Pages URLs for the GLBs and nodes.json, plus the web viewer link"},
    "assemblies[]": "reference-only layouts (gravity rings), no nodes",
    "schema v3 (AX line)": {
        "parts[].line": "product line: 'AX' for the AX line; absent on base-line parts (treat absent as 'base'). Filter with p.get('line', 'base') == 'AX'",
        "parts[].display_id": "human id, e.g. AX-cmd-01 (AX-<category>-<NN>, stable, never reused)",
        "parts[].key": "file-safe form of display_id (ax_cmd_01) = parts[].id; file stems and vids start with it",
        "parts[].ax_category": "AX category (cmd, prop, tank, stage, station, power, rover, aero, ...); 'category' is the site/folder category",
        "parts[].batch, code, interior": "AX build batch (B1..B10), designer code (e.g. CM-8), interior kind (full / none / ...)",
        "parts[].aliases": "old part ids this part replaces (modern_set: cmd11 -> ax_cmd_01, prop27-29 -> ax_prop_01-03, tank14/15 -> ax_tank_01/02)",
        "parts[].redirects": "{old vid: new vid} for those aliases",
        "variants[].line": "same as the part's line (AX variants only)",
        "variants[].alias_of": "old vid this variant replaces (aliased parts only)",
        "variants[].slots.occupies (AX)": "AX slot items (nodes.json 'slot'): {slot_class Small|Medium|Rack, mount_node node_bottom}",
        "variants[].slots.positions": "AX slot bays: [{name, cls, node_bottom_mount [x,y,z] m, up, access?}] from nodes.json variants[].extra.slots",
        "lines": "{line: {parts, variants}} counts",
        "redirects": "top-level map old id -> new id for both part ids and vids; resolve craft-file ids through it before lookup"},
    "versioning": {
        "manifest_version": "semver of this parts release (X.Y.Z). Minor = parts/interiors added (or removed), patch = existing ones changed. Released only on request; see handoff/CHANGELOG.md and the git tag parts-vX.Y.Z",
        "generated_at": "ISO 8601 time the manifest was generated (box time, UTC+2)",
        "parts[].sha256 / interiors[].sha256": "{nodes_json: sha256 hex} of the part's nodes file",
        "variants[].sha256": "parts: {glb_lowpoly, glb_cad}; interiors: {glb_interior, glb_combined, glb_cutaway}: sha256 hex of each file",
        "content_hash": "per part / interior / assembly: sha256 over all its file hashes. Compare with your last import to detect changed files",
        "meta_hash": "per part / interior / assembly: sha256 over its manifest data except hashes, byte sizes and URLs (mass, nodes, text, slots, ...). Changes when only data changed",
    },
    "interiors[]": {
        "id": "<exterior part id>_interior, e.g. cmd05_interior",
        "exterior_part_id": "the part this interior belongs to (parts[].id)", "exterior_category": "its category",
        "name, reference, crew": "display name, real-world reference, crew count",
        "frame": "same origin and axes as the exterior GLB; node +Y = direction, node +Z = up (crew head / hatch up)",
        "wall_t_m, cavity": "pressure-vessel wall thickness; cavity {volume_m3, size_godot_xyz_m}",
        "exterior_hide": "exterior mesh names to hide while the interior is shown",
        "moving_meshes": "separate interior meshes that animate (hatch_door_N, stick_N, throttle_N, yoke_N, hand_controller_N*, canopy_frame_inner)",
        "hatches, windows, notes": "as authored in the interior nodes JSON",
        "validation": "crew_fit {seats, fit, min_clearance_m}, station_checks_ok (stations), clash_with_crew_items",
        "known_issue": "accepted limitation (null if none)",
        "variants[]": "{vid (<exterior vid>_interior), exterior_variant, state, primary, crew, nodes[] {name, pos, dir, up}, props[] {instance, prop, pos, basis_columns}, tris, bytes, paths, urls, sha256}",
    },
    "interiors_skipped[]": "{id, reason}: interiors that exist upstream but are not released yet",
}

if __name__ == "__main__":
    main()
