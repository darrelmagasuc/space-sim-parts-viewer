#!/usr/bin/env python3
"""Copy finished, validated IVA interiors from Sergei's source folder into the site.

  python3 handoff/tools/import_interiors.py [--src /workspace/space-sim/parts/interiors] [--check]

Source is read-only (nothing there is written). Only the ids in INCLUDE are imported; every
one must pass validate() or the script stops. Output (repo-relative):
  models/interiors/<vid>_interior.glb     interior only, same origin as the exterior <vid>.glb
  models/interiors/<vid>_combined.glb     interior + ghosted exterior (review)
  models/interiors/<vid>_cutaway.glb      interior + exterior sliced through the axis (review)
  models/interiors/<id>_interior.nodes.json   copied verbatim (its "files" paths are source-relative)
  models/interiors/interiors.json         what was imported, from where, validation summary, skips
  thumbs/interiors/<vid>_interior.jpg     cutaway preview (from renders/<vid>_interior.png)
--check only validates and reports. Stdlib only, except Pillow for the JPEG previews (skipped if missing).
"""
import argparse, datetime, glob, hashlib, json, os, shutil, sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_SRC = "/workspace/space-sim/parts/interiors"

# Finished and validated per the interiors README (2026-10-01) and Darrel: crewed capsules,
# cockpits, station modules. station09-13 (gravity ring) are still being iterated -> SKIP until
# they are signed off; the props library (props/) is also in flux and the interior GLBs already
# embed their props, so it is not imported.
# Finished and validated per the interiors README (sources unchanged since 2026-10-02 08:09): crewed capsules,
# cockpits, station modules, the gravity ring (station09-13, all station checks ok) and the surface habs / rovers.
# rover12 is skipped: its interior is built against an exterior revision (hull-axis openings) that is not released.
# The props library (props/) is not imported (the interior GLBs embed their props).
INCLUDE = ["cmd03", "cmd04", "cmd05", "cmd06", "cmd07", "cmd08", "cmd09",
           "cockpit00", "cockpit01", "cockpit02", "cockpit03", "cockpit04",
           "station00", "station01", "station02", "station03", "station04",
           "station09", "station10", "station11", "station12", "station13",
           "rover03", "rover10", "rover11", "rover24"]
SKIP = {"rover12": "built against an unreleased rover12 exterior revision (hull-axis hatch openings); released with that exterior"}
# Known, accepted limits (exterior shell too small); imported with a flag, see the interiors README.
KNOWN_ISSUES = {
    "cockpit02": "crew does not fit: heads 2.6-3.2 cm into the ceiling (exterior flight deck is 1.26-1.28 m high)",
    "cockpit03": "pilots fit only within tolerance (-0.2 cm) in 40 deg reclined seats; floor hatch needs an exterior opening",
}


def sha(p): return hashlib.sha256(open(p, "rb").read()).hexdigest()


def site_glb(vid):
    c = glob.glob(os.path.join(REPO, "models", "*", vid + ".glb"))
    return c[0] if c else None


def validate(src, it, nj):
    """Return (errors, summary). Errors block the import."""
    errs, summ = [], {}
    pid = it["id"]
    for vid, v in it["variants"].items():
        for k in ("glb", "glb_combined", "glb_cutaway"):
            p = os.path.join(src, v["files"][k])
            if not os.path.isfile(p): errs.append(f"{vid}: missing {v['files'][k]}")
        ex = v["exterior_variant"]
        sg = site_glb(ex)
        if not sg: errs.append(f"{vid}: exterior {ex} not in the site"); continue
        srcex = os.path.normpath(os.path.join(src, v["files"]["exterior_glb"]))
        if not os.path.isfile(srcex) or sha(srcex) != sha(sg):
            errs.append(f"{vid}: built against a different exterior than the site's {ex}.glb")
        if vid not in nj["variants"]: errs.append(f"{vid}: not in {pid}_interior.nodes.json")
        elif not nj["variants"][vid].get("nodes"): errs.append(f"{vid}: no nodes")
    checks = nj.get("checks") or {}
    fit = checks.get("crew_fit") or []
    summ["crew_fit"] = {"seats": len(fit), "fit": sum(1 for f in fit if f.get("fits")),
                        "min_clearance_m": min((f["min_clearance_m"] for f in fit), default=None)}
    if not fit: errs.append("no crew_fit checks")
    sc = nj.get("station_checks")
    if sc is not None:
        ok = (not sc.get("items_outside_cavity") and not sc.get("hatch_keepout_intrusions_m3")
              and all(a.get("ok") for a in sc.get("aisles", [])) and not sc.get("crew_vs_crew_m3"))
        summ["station_checks_ok"] = ok
        if not ok: errs.append("station_checks failed")
    if summ["crew_fit"]["fit"] < summ["crew_fit"]["seats"] and pid not in KNOWN_ISSUES:
        errs.append("crew does not fit and no accepted known issue")
    summ["clash_with_crew_items"] = len(checks.get("clash_with_crew_m3") or [])
    return errs, summ


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=DEFAULT_SRC)
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    idx = json.load(open(os.path.join(a.src, "interiors.index.json")))
    by_id = {it["id"]: it for it in idx["interiors"]}
    unknown = sorted(set(by_id) - set(INCLUDE) - set(SKIP))
    if unknown: print("note: interiors in the source that are neither included nor skipped:", ", ".join(unknown))
    out_m = os.path.join(REPO, "models", "interiors"); out_t = os.path.join(REPO, "thumbs", "interiors")
    record = dict(source=a.src, imported_at=datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
                  note="Copied by handoff/tools/import_interiors.py; do not edit here. Nodes JSON files are verbatim copies "
                       "(their 'files' paths are relative to the source folder; use the paths in handoff/parts_manifest.json).",
                  interiors=[], skipped=[dict(id=k, reason=v) for k, v in sorted(SKIP.items())])
    failed = False
    for pid in INCLUDE:
        it = by_id.get(pid)
        if not it: print(f"FAIL {pid}: not in the source index"); failed = True; continue
        nj = json.load(open(os.path.join(a.src, it["nodes_json"])))
        errs, summ = validate(a.src, it, nj)
        print(("ok   " if not errs else "FAIL ") + pid + ("" if not errs else ": " + "; ".join(errs)))
        if errs: failed = True; continue
        record["interiors"].append(dict(id=pid, name=it["name"], reference=it.get("reference"), crew=it.get("crew"),
                                        variants={vid: v["exterior_variant"] for vid, v in it["variants"].items()},
                                        skipped_variants=it.get("skipped_variants", []), validation=summ,
                                        known_issue=KNOWN_ISSUES.get(pid)))
        if a.check: continue
        os.makedirs(out_m, exist_ok=True); os.makedirs(out_t, exist_ok=True)
        shutil.copyfile(os.path.join(a.src, it["nodes_json"]), os.path.join(out_m, f"{pid}_interior.nodes.json"))
        for vid, v in it["variants"].items():
            base = v["exterior_variant"]
            for k, suf in (("glb", "_interior"), ("glb_combined", "_combined"), ("glb_cutaway", "_cutaway")):
                shutil.copyfile(os.path.join(a.src, v["files"][k]), os.path.join(out_m, base + suf + ".glb"))
            prev = os.path.join(a.src, v["files"].get("preview", ""))
            if os.path.isfile(prev):
                try:
                    from PIL import Image
                    Image.open(prev).convert("RGB").save(os.path.join(out_t, vid + ".jpg"), quality=85)
                except ImportError:
                    pass
    if failed: sys.exit("validation failed; nothing written" if a.check else "validation failed for some interiors (see above)")
    if not a.check:
        # drop files of interiors that are no longer included
        keep = {f"{r['id']}_interior.nodes.json" for r in record["interiors"]} | {"interiors.json"}
        for r in record["interiors"]:
            for ex in r["variants"].values(): keep |= {ex + s + ".glb" for s in ("_interior", "_combined", "_cutaway")}
        for f in os.listdir(out_m):
            if f not in keep: os.remove(os.path.join(out_m, f)); print("removed stale", f)
        json.dump(record, open(os.path.join(out_m, "interiors.json"), "w"), indent=2)
        print(f"imported {len(record['interiors'])} interiors ({sum(len(r['variants']) for r in record['interiors'])} variants); skipped {len(SKIP)}")


if __name__ == "__main__":
    main()
