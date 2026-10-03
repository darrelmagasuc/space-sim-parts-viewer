#!/usr/bin/env python3
"""Copy finished AX interiors (Sergei / Anastasia, parts/interiors_modern/ax/<key>/) into the site.

  python3 handoff/tools/import_ax_interiors.py [--check]

Source is read-only. Run AFTER import_interiors.py (base-line interiors): this script merges its
records into models/interiors/interiors.json (replacing earlier ax_* records) and writes:
  models/interiors/<vid>_interior.glb   = the source *_interior_baked.glb (props embedded; same origin as <vid>.glb)
  models/interiors/<vid>_combined.glb / <vid>_cutaway.glb   review GLBs
  models/interiors/<key>_interior.nodes.json   site-format nodes (variants{} added; source build data dropped)
  thumbs/interiors/<vid>.jpg            from renders/<key>_interior_cutaway.png
Each import must be built against the site's exterior GLB (sha256), or the script stops. The interior team's
check results (containment / hatch keep-outs / aisles) are copied into validation.open_findings, not gated."""
import argparse, datetime, glob, hashlib, json, os, shutil, sys
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = "/workspace/space-sim/parts/interiors_modern/ax"
# 2026-10-03 (v0.5.0): signed off by Sergei / Anastasia
FINISHED = ["ax_cmd_01", "ax_cmd_02", "ax_cmd_03", "ax_cmd_04", "ax_cmd_06", "ax_cmd_07", "ax_cmd_08", "ax_aero_01",
            "ax_rover_01", "ax_rover_03", "ax_rover_05", "ax_rover_06", "ax_rover_07", "ax_rover_08", "ax_rover_10", "ax_rover_11", "ax_rover_12",
            "ax_aero_02", "ax_aero_04", "ax_aero_10", "ax_grav_01", "ax_grav_02", "ax_grav_03",
            "ax_util_01", "ax_util_03", "ax_util_04", "ax_util_05"] + [f"ax_station_{i:02d}" for i in (1, 2, 3, 4, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17)]
PENDING = {"ax_cmd_05": "round-4 update pending: jump-seat fold",
           "ax_aero_05": "round-4 update pending: aft-bulkhead interior handrails",
           "ax_station_05": "round-4 update pending: hand-controller stow pose / workstation over the hip",
           **{f"ax_grav_{i:02d}": "round-4 update pending: spin-gravity block (exterior gravity data)" for i in range(5, 10)}}
SKIP = {"ax_rover_02": "in progress (mid-rebuild, mixed LODs)",
        "ax_rover_04": "in progress (mid-rebuild, mixed LODs)", "ax_aero_03": "not built yet", "ax_aero_06": "still building (no REPORT.md)",
        "ax_aero_14": "not built yet"}
PROPS = "/workspace/space-sim/parts/interiors_modern/props_anastasia"   # Anastasia's eqm props (runtime instancing; the baked GLBs already embed them)
DROP = ("build_data", "prop_audit", "meshes_own", "comps", "render", "files", "handoff", "standard", "exterior", "runtime_note", "props", "cutaway", "axis_frame")


def sha(p): return hashlib.sha256(open(p, "rb").read()).hexdigest()


def summary(c):
    c = c.get("flight", c)
    ct = c.get("containment") or {}
    aisles = c.get("aisles") or []
    s = dict(crew_stations=len(c.get("crew_fit_iml") or []), items_outside_cavity=len(ct.get("items_outside_cavity") or []),
             hatch_keepout_intrusions=len(c.get("hatch_keepouts_m3") or []), crew_vs_crew=len(c.get("crew_vs_crew_m3") or []),
             aisles_ok=all(a.get("ok") for a in aisles), unexpected_crew_clash=len([x for x in c.get("crew_clash_m3") or [] if not x.get("expected")]))
    # The interior team's own check results are recorded, not gated: these interiors were signed off with them (open_findings).
    s["open_findings"] = ([f"items outside the cavity: {', '.join(f'{n} {g}' for n, g in ct.get('items_outside_cavity')[:6])}"] if s["items_outside_cavity"] else []) \
        + [f"hatch keep-out {h[0]}: {h[1]} {h[2]} m3" for h in (c.get("hatch_keepouts_m3") or [])[:6]] \
        + [f"aisle {x.get('aisle') or x.get('name')}: {x.get('clear_diameter_m')} m clear (< {x.get('required_m')} m)" for x in aisles if not x.get("ok")]
    return s, []


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--check", action="store_true"); a = ap.parse_args()
    out_m = os.path.join(REPO, "models", "interiors"); out_t = os.path.join(REPO, "thumbs", "interiors")
    recp = os.path.join(out_m, "interiors.json"); rec = json.load(open(recp))
    rec["interiors"] = [r for r in rec["interiors"] if not r["id"].startswith("ax_")]
    rec["skipped"] = [s for s in rec.get("skipped", []) if not s["id"].startswith("ax_")] + [dict(id=k, reason=v) for k, v in sorted(SKIP.items())]
    rec["ax_source"] = SRC; rec["ax_imported_at"] = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
    failed = False; n = 0
    for key in FINISHED + sorted(PENDING):
        d = os.path.join(SRC, key); j = json.load(open(os.path.join(d, f"{key}_interior.nodes.json"))); f = j["files"]
        ex = os.path.normpath(os.path.join(d, j["exterior"])); vid = os.path.basename(ex)[:-4]
        sg = glob.glob(os.path.join(REPO, "models", "*", vid + ".glb"))
        errs = [] if sg and sha(ex) == sha(sg[0]) else [f"built against a different exterior than the site's {vid}.glb"]
        summ, ce = summary(j.get("checks") or {}); errs += ce
        print(("ok   " if not errs else "FAIL ") + key + ("" if not errs else ": " + "; ".join(errs)))
        if errs: failed = True; continue
        nj = {k: v for k, v in j.items() if k not in DROP}
        nj["source_note"] = ("site copy of parts/interiors_modern/ax/%s/%s_interior.nodes.json (build data dropped); glb_interior is the BAKED GLB "
                             "(props embedded), so no prop instancing is needed; props_baked lists them" % (key, key))
        nj["props_baked"] = [dict(instance=p["instance"], prop=p["prop"], role=p.get("role")) for p in j.get("props", [])]
        nj["moving_meshes"] = [dict(name=k, **v) for k, v in (j.get("moving") or {}).items()]
        nj["variants"] = {vid + "_interior": dict(exterior_variant=vid, primary=True, crew=j.get("crew"), nodes=j.get("nodes", []), props=[])}
        rec["interiors"].append(dict(id=key, name=j["name"], reference=j.get("display_id"), crew=j.get("crew"), line="AX",
                                     variants={vid + "_interior": vid}, skipped_variants=[], validation=summ, known_issue=PENDING.get(key)))
        n += 1
        if a.check: continue
        json.dump(nj, open(os.path.join(out_m, f"{key}_interior.nodes.json"), "w"), indent=1)
        for k, suf in (("glb_baked", "_interior"), ("glb_combined", "_combined"), ("glb_cutaway", "_cutaway")):
            shutil.copyfile(os.path.join(d, f[k]), os.path.join(out_m, vid + suf + ".glb"))
        prev = os.path.join(d, "renders", f"{key}_interior_cutaway.png")
        if os.path.isfile(prev):
            from PIL import Image
            im = Image.open(prev).convert("RGB"); im.thumbnail((800, 800)); im.save(os.path.join(out_t, vid + "_interior.jpg"), quality=85)
    if failed: sys.exit("validation failed; nothing written" if a.check else "validation failed for some AX interiors")
    pidx = json.load(open(os.path.join(PROPS, "props.index.json")))
    pg = sorted(f[:-4] for f in os.listdir(PROPS) if f.endswith(".glb"))
    rec["props_library"] = dict(source=PROPS, path="models/interiors/props/", props=pg,
                                note="Anastasia's interior props (eqm*): GLB + nodes.json each; the AX interior GLBs in this release are baked (props embedded), "
                                     "so these are only needed to instance props at runtime (see nodes.json props_baked)")
    if not a.check:
        od = os.path.join(out_m, "props"); os.makedirs(od, exist_ok=True)
        for n_ in pg:
            for ext in (".glb", ".nodes.json"): shutil.copyfile(os.path.join(PROPS, n_ + ext), os.path.join(od, n_ + ext))
        json.dump(pidx, open(os.path.join(od, "props.index.json"), "w"), indent=1)
        json.dump(rec, open(recp, "w"), indent=2)
    print(f"props library: {len(pg)} props")
    print(f"AX interiors: {n} ok ({len(FINISHED)} finished + {len(PENDING)} with pending updates), skipped {len(SKIP)}")


if __name__ == "__main__":
    main()
