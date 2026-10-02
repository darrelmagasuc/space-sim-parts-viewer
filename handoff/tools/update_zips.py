#!/usr/bin/env python3
"""Bring the two download zips in line with models/: every part variant GLB (+ its nodes.json) from the manifest.

  python3 handoff/tools/update_zips.py MANIFEST.json     # e.g. a manifest built with build_manifest.py --out

Members that are not part GLBs / nodes files (README_GODOT.md, CONVENTIONS.md, previews) are kept as they are;
part files are (re)written from models/ when missing or different. Stdlib only.
"""
import hashlib, json, os, sys, zipfile, shutil, tempfile
REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
man = json.load(open(sys.argv[1]))
for key, folder, pk in (("lowpoly", "space_sim_lowpoly_glb_v2", "glb_lowpoly"), ("cad", "space_sim_glb_v3", "glb_cad")):
    zp = os.path.join(REPO, man["zips"][key]["path"])
    want = {}
    for p in man["parts"]:
        for v in p["variants"]:
            want[f"{folder}/{p['category']}/{v['vid']}.glb"] = v["paths"][pk]
        want[f"{folder}/{p['category']}/{os.path.basename(p['variants'][0]['paths']['nodes_json'])}"] = p["variants"][0]["paths"]["nodes_json"]
    tmp = zp + ".tmp"; added = replaced = kept = 0
    with zipfile.ZipFile(zp) as zi, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zo:
        have = set(zi.namelist())
        for n in zi.namelist():
            if n in want:
                src = open(os.path.join(REPO, want[n]), "rb").read()
                if hashlib.sha256(zi.read(n)).digest() != hashlib.sha256(src).digest(): zo.writestr(n, src); replaced += 1
                else: zo.writestr(zi.getinfo(n), zi.read(n)); kept += 1
            else: zo.writestr(zi.getinfo(n), zi.read(n)); kept += 1
        for n in sorted(set(want) - have):
            zo.write(os.path.join(REPO, want[n]), n); added += 1
    os.replace(tmp, zp)
    print(f"{os.path.basename(zp)}: +{added} added, {replaced} replaced, {kept} kept, {os.path.getsize(zp) / 1e6:.1f} MB")
