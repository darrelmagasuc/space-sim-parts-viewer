"""Build the static GLB viewer into ./site (GitHub Pages / any static host).
Sources (read-only): /workspace/space-sim/parts/<folder>/glb/*.glb + *.nodes.json, station_power/assembly/*,
/workspace/space-sim/export/space_sim_glb_v2.zip. Thumbnails come from make_thumbs.py (run it first).
usage: python3 build_site.py"""
import os, json, glob, shutil, re, datetime
HERE = os.path.dirname(os.path.abspath(__file__)); SITE = os.path.join(HERE, "..") if os.path.basename(HERE) == "tools" else os.path.join(HERE, "site"); PARTS = "/workspace/space-sim/parts"
ZIP = "/workspace/space-sim/export/space_sim_glb_v2.zip"
CATS = [("cmd", "Command modules & probes", "cmd_prop"), ("prop", "Propulsion", "cmd_prop"), ("tank", "Tanks", "tank_stage"),
        ("stage", "Staging, fairings & landing", "tank_stage"), ("station", "Station modules & gravity ring", "station_power"),
        ("power", "Power, thermal & utilities", "station_power"), ("rover", "Rovers & surface systems", "rover_jet"),
        ("jet", "Jets & aero parts", "rover_jet"), ("cockpit", "Aircraft cockpits", "cockpit"),
        ("assemblies", "Reference assemblies", "station_power")]
ASSEMBLY_NAMES = {"gravity_ring_assembly": "Gravity ring assembly (hub + 6 spokes + 12 segments + despun core)",
                  "counter_rotating_assembly": "Counter-rotating gravity ring assembly (2 rings)"}
MODELS = os.path.join(SITE, "models")
if os.path.isdir(MODELS): shutil.rmtree(MODELS)
cats_out = []; n_glb = 0; total = 0
for key, title, folder in CATS:
    os.makedirs(os.path.join(MODELS, key), exist_ok=True); parts = []
    if key == "assemblies":
        info = json.load(open(os.path.join(PARTS, folder, "assembly", "assemblies.json")))
        for vid, inf in info.items():
            src = os.path.join(PARTS, folder, "assembly", vid + ".glb"); shutil.copy2(src, os.path.join(MODELS, key, vid + ".glb"))
            sz = inf["size_m"]; b = os.path.getsize(src); n_glb += 1; total += b
            parts.append(dict(id=vid, name=ASSEMBLY_NAMES.get(vid, vid), primary=vid, json="models/assemblies/assemblies.json",
                              variants=[dict(vid=vid, size="assembly", state="flight", label=ASSEMBLY_NAMES.get(vid, vid), primary=True,
                                             dims={"size_cad_x_y_z_m": " x ".join(f"{v:g}" for v in sz)},
                                             bbox=[sz[0], sz[2], sz[1]], nodes=None, glb=f"models/assemblies/{vid}.glb",
                                             thumb=f"thumbs/{vid}.jpg", bytes=b)]))
        shutil.copy2(os.path.join(PARTS, folder, "assembly", "assemblies.json"), os.path.join(MODELS, key, "assemblies.json"))
    else:
        for f in sorted(glob.glob(os.path.join(PARTS, folder, f"{key}[0-9][0-9].nodes.json"))):
            js = json.load(open(f)); pid = js["id"]
            shutil.copy2(f, os.path.join(MODELS, key, os.path.basename(f)))
            vs = []
            for vid, v in js["variants"].items():
                src = os.path.join(PARTS, folder, "glb", vid + ".glb"); shutil.copy2(src, os.path.join(MODELS, key, vid + ".glb"))
                b = os.path.getsize(src); n_glb += 1; total += b
                assert os.path.exists(os.path.join(SITE, "thumbs", vid + ".jpg")), vid
                vs.append(dict(vid=vid, size=v["size"], state=v.get("state", "flight"), label=v.get("label", ""),
                               primary=vid == js["primary"], dims=v.get("dims", {}), bbox=v.get("bbox_godot_size"),
                               nodes=v.get("nodes"), glb=f"models/{key}/{vid}.glb", thumb=f"thumbs/{vid}.jpg", bytes=b))
            parts.append(dict(id=pid, name=js["name"], primary=js["primary"], json=f"models/{key}/{os.path.basename(f)}", variants=vs))
    cats_out.append(dict(key=key, title=title, parts=parts))
for old in glob.glob(os.path.join(SITE, "space_sim_glb_v*.zip")): os.remove(old)
shutil.copy2(ZIP, os.path.join(SITE, "space_sim_glb_v2.zip"))
shutil.copy2("/workspace/space-sim/CONVENTIONS.md", os.path.join(SITE, "CONVENTIONS.md"))
man = dict(title="Space Sim part blockouts", generated=datetime.datetime.now().astimezone().isoformat(timespec="minutes"),
           glb_count=n_glb, part_count=sum(len(c["parts"]) for c in cats_out if c["key"] != "assemblies"),
           zip="space_sim_glb_v2.zip", zip_bytes=os.path.getsize(ZIP), categories=cats_out)
json.dump(man, open(os.path.join(SITE, "manifest.json"), "w"), separators=(",", ":"))
open(os.path.join(SITE, ".nojekyll"), "w").close()
big = [p for p in glob.glob(SITE + "/**", recursive=True) if os.path.isfile(p) and os.path.getsize(p) > 50e6]
print(f"parts {man['part_count']}, glb {n_glb} ({total/1e6:.1f} MB), files >50MB: {big}")
