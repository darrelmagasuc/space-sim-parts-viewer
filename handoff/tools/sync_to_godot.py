#!/usr/bin/env python3
"""Copy the parts (and released interiors) from a clone of this repo into a Godot project.

  python3 handoff/tools/sync_to_godot.py /path/to/godot_project            # low-poly GLBs (default)
  python3 handoff/tools/sync_to_godot.py /path/to/godot_project --lod cad  # CAD GLBs instead
  python3 handoff/tools/sync_to_godot.py /path/to/godot_project --dry-run  # show what would change
  python3 handoff/tools/sync_to_godot.py /path/to/godot_project --all      # ignore hashes, re-copy everything

Re-sync by hash: <project>/parts/SYNC_INFO.json remembers the manifest_version and every id's
content_hash from the last sync. Only ids whose content_hash changed (or that are new, or whose files
are missing locally) are copied; the ids are printed as added / changed / removed. Removed ids are
listed, never deleted. Writes under <project>/parts/:
  <cat>/<variant>.glb, <cat>/<id>.nodes.json      parts
  interiors/<exterior vid>_interior.glb (+ _combined/_cutaway with --interior-review), <id>_interior.nodes.json
  assemblies/*.glb                                reference-only
  parts_manifest.json, materials_library.json, CONVENTIONS.md, CHANGELOG.md, SYNC_INFO.json
Stdlib only. Never edits this repo.
"""
import argparse, json, os, shutil, subprocess, sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def entries(man, lod, review):
    """id -> (content_hash, [(src, dst_rel)])"""
    out = {}
    for p in man["parts"]:
        files = [(v["paths"]["glb_lowpoly" if lod == "lowpoly" else "glb_cad"], f"{p['category']}/{v['vid']}.glb") for v in p["variants"]]
        nj = p["variants"][0]["paths"]["nodes_json"]
        files.append((nj, f"{p['category']}/{os.path.basename(nj)}"))
        out[p["id"]] = (p["content_hash"], files)
    for e in man.get("interiors", []):
        files = []
        for v in e["variants"]:
            for k in (("glb_interior", "glb_combined", "glb_cutaway") if review else ("glb_interior",)):
                files.append((v["paths"][k], "interiors/" + os.path.basename(v["paths"][k])))
        nj = e["variants"][0]["paths"]["nodes_json"]
        files.append((nj, "interiors/" + os.path.basename(nj)))
        out[e["id"]] = (e["content_hash"], files)
    for a in man.get("assemblies", []):
        rel = a["paths"]["glb_lowpoly" if lod == "lowpoly" else "glb_cad"]
        out[a["id"]] = (a["content_hash"], [(rel, "assemblies/" + os.path.basename(rel))])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("project", help="Godot project folder (the one with project.godot)")
    ap.add_argument("--lod", choices=["lowpoly", "cad"], default="lowpoly")
    ap.add_argument("--dest", default="parts", help="folder under the project (default parts -> res://parts/)")
    ap.add_argument("--interior-review", action="store_true", help="also copy the _combined / _cutaway interior review GLBs")
    ap.add_argument("--all", action="store_true", help="re-copy every id regardless of hashes")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    if not os.path.isfile(os.path.join(a.project, "project.godot")):
        print(f"warning: no project.godot in {a.project}", file=sys.stderr)
    man = json.load(open(os.path.join(REPO, "handoff", "parts_manifest.json")))
    dest = os.path.join(a.project, a.dest)
    info_path = os.path.join(dest, "SYNC_INFO.json")
    prev = json.load(open(info_path)) if os.path.isfile(info_path) else {}
    if prev.get("lod") not in (None, a.lod) or prev.get("interior_review", False) != a.interior_review:
        print("lod / review option differs from the last sync: re-copying everything"); a.all = True
    old = prev.get("hashes", {})
    cur = entries(man, a.lod, a.interior_review)
    added = sorted(i for i in cur if i not in old)
    changed = sorted(i for i in cur if i in old and old[i] != cur[i][0])
    removed = sorted(i for i in old if i not in cur)
    missing = sorted(i for i in cur if i not in added and i not in changed
                     and any(not os.path.isfile(os.path.join(dest, d)) for _, d in cur[i][1]))
    todo = sorted(cur) if a.all else sorted(set(added) | set(changed) | set(missing))
    n = 0
    for i in todo:
        for src, d in cur[i][1]:
            s, t = os.path.join(REPO, src), os.path.join(dest, d)
            if not os.path.isfile(s): sys.exit(f"missing in repo: {src}")
            n += 1
            if a.dry_run: continue
            os.makedirs(os.path.dirname(t), exist_ok=True); shutil.copyfile(s, t)
    for name in ("parts_manifest.json", "materials_library.json", "CONVENTIONS.md", "CHANGELOG.md"):
        if not a.dry_run and os.path.isfile(os.path.join(REPO, "handoff", name)):
            os.makedirs(dest, exist_ok=True); shutil.copyfile(os.path.join(REPO, "handoff", name), os.path.join(dest, name))
    try: commit = subprocess.run(["git", "-C", REPO, "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    except Exception: commit = ""
    print(f"manifest {prev.get('manifest_version', '(none)')} -> {man.get('manifest_version')} (commit {commit[:7] or '?'}, {a.lod})")
    for label, ids in (("added", added), ("changed", changed), ("removed (not deleted)", removed), ("missing locally", missing)):
        if ids: print(f"  {label}: {', '.join(ids)}")
    print(f"{'dry run: would copy' if a.dry_run else 'copied'} {n} files for {len(todo)} ids; {len(cur) - len(todo)} ids unchanged")
    if not a.dry_run:
        json.dump(dict(source_repo="darrelmagasuc/space-sim-parts-viewer", commit=commit, manifest_version=man.get("manifest_version"),
                       generated_at=man.get("generated_at"), lod=a.lod, interior_review=a.interior_review,
                       hashes={i: h for i, (h, _) in cur.items()}), open(info_path, "w"), indent=1)


if __name__ == "__main__":
    main()
