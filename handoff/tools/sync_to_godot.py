#!/usr/bin/env python3
"""Copy the parts from a clone of this repo into a Godot project as res://parts/<cat>/.

  python3 handoff/tools/sync_to_godot.py /path/to/godot_project            # low-poly GLBs (default)
  python3 handoff/tools/sync_to_godot.py /path/to/godot_project --lod cad  # CAD GLBs instead
  python3 handoff/tools/sync_to_godot.py /path/to/godot_project --dry-run

Writes, under <project>/parts/:
  <cat>/<variant>.glb          one file per variant (same name for low-poly and CAD)
  <cat>/<id>.nodes.json        attach nodes per part
  assemblies/*.glb             reference-only gravity-ring assemblies
  parts_manifest.json          handoff/parts_manifest.json
  materials_library.json       low-poly shared material library (names, PBR values)
  CONVENTIONS.md, SYNC_INFO.json (source commit, lod, file count)
Only copies files whose bytes changed, never deletes anything in the project (it lists
files that are no longer in the repo so you can decide). Stdlib only. Never edits this repo.
"""
import argparse, filecmp, json, os, shutil, subprocess, sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("project", help="Godot project folder (the one with project.godot)")
    ap.add_argument("--lod", choices=["lowpoly", "cad"], default="lowpoly")
    ap.add_argument("--dest", default="parts", help="folder under the project (default parts -> res://parts/)")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    if not os.path.isfile(os.path.join(a.project, "project.godot")):
        print(f"warning: no project.godot in {a.project}", file=sys.stderr)
    man = json.load(open(os.path.join(REPO, "handoff", "parts_manifest.json")))
    dest = os.path.join(a.project, a.dest)
    plan = []  # (src, dst)
    for p in man["parts"]:
        for v in p["variants"]:
            src = os.path.join(REPO, v["paths"]["glb_lowpoly" if a.lod == "lowpoly" else "glb_cad"])
            plan.append((src, os.path.join(dest, p["category"], v["vid"] + ".glb")))
        nj = p["variants"][0]["paths"]["nodes_json"]
        plan.append((os.path.join(REPO, nj), os.path.join(dest, p["category"], os.path.basename(nj))))
    for asm in man.get("assemblies", []):
        rel = asm["paths"]["glb_lowpoly" if a.lod == "lowpoly" else "glb_cad"]
        plan.append((os.path.join(REPO, rel), os.path.join(dest, "assemblies", os.path.basename(rel))))
    for name in ("parts_manifest.json", "materials_library.json", "CONVENTIONS.md"):
        plan.append((os.path.join(REPO, "handoff", name), os.path.join(dest, name)))
    copied = same = 0
    for src, dst in plan:
        if not os.path.isfile(src): sys.exit(f"missing in repo: {src}")
        if os.path.isfile(dst) and filecmp.cmp(src, dst, shallow=False): same += 1; continue
        copied += 1
        if a.dry_run: print("would copy", os.path.relpath(src, REPO), "->", os.path.relpath(dst, a.project)); continue
        os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copyfile(src, dst)
    wanted = {os.path.normpath(d) for _, d in plan}
    stale = []
    if os.path.isdir(dest):
        for root, _, files in os.walk(dest):
            for f in files:
                full = os.path.normpath(os.path.join(root, f))
                if f.endswith((".glb", ".nodes.json")) and full not in wanted: stale.append(os.path.relpath(full, a.project))
    try: commit = subprocess.run(["git", "-C", REPO, "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    except Exception: commit = ""
    if not a.dry_run:
        os.makedirs(dest, exist_ok=True)
        json.dump(dict(source_repo="darrelmagasuc/space-sim-parts-viewer", commit=commit, lod=a.lod, files=len(plan),
                       schema_version=man.get("schema_version")), open(os.path.join(dest, "SYNC_INFO.json"), "w"), indent=2)
    print(f"{'dry run: ' if a.dry_run else ''}{copied} copied, {same} unchanged, {len(plan)} files from commit {commit[:7] or '?'} ({a.lod})")
    if stale:
        print(f"{len(stale)} GLB/nodes files in the project are no longer in the repo (not deleted):")
        for s in stale[:50]: print("  ", s)


if __name__ == "__main__":
    main()
