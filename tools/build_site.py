"""Build the static GLB viewer into ./site (GitHub Pages / any static host).
Sources (read-only): /workspace/space-sim/parts/<folder>/glb/*.glb + *.nodes.json, station_power/assembly/*,
/workspace/space-sim/export/space_sim_glb_v3.zip. Thumbnails come from make_thumbs.py (run it first).
Low-poly: /workspace/space-sim/parts_lowpoly/<id>/<vid>.glb + stats.json, assemblies/, space_sim_lowpoly_glb_v2.zip; thumbs/lp/ from make_thumbs_lp.py.
usage: python3 build_site.py"""
import os, json, glob, shutil, re, datetime
HERE = os.path.dirname(os.path.abspath(__file__)); SITE = os.path.join(HERE, "..") if os.path.basename(HERE) == "tools" else os.path.join(HERE, "site"); PARTS = "/workspace/space-sim/parts"
ZIP = "/workspace/space-sim/export/space_sim_glb_v3.zip"
ZIP_LP = "/workspace/space-sim/export/space_sim_lowpoly_glb_v2.zip"; LP = "/workspace/space-sim/parts_lowpoly"
def lp_info(pid, vid, key):
    """copy the low-poly GLB to models/<key>/lowpoly/ and return manifest fields (glb_lp, bytes_lp, tris_lp, tris_cad, thumb_lp)."""
    src = os.path.join(LP, "assemblies" if key == "assemblies" else pid, vid + ".glb"); os.makedirs(os.path.join(MODELS, key, "lowpoly"), exist_ok=True)
    shutil.copy2(src, os.path.join(MODELS, key, "lowpoly", vid + ".glb")); assert os.path.exists(os.path.join(SITE, "thumbs", "lp", vid + ".jpg")), vid
    if key == "assemblies": tl, tc = json.load(open(os.path.join(LP, "assemblies", "assemblies.json")))[vid]["tris"], None
    else: s = json.load(open(os.path.join(LP, pid, "stats.json")))[vid]; tl, tc = s["tris_total"], s["cad_tris"]
    return dict(glb_lp=f"models/{key}/lowpoly/{vid}.glb", bytes_lp=os.path.getsize(src), tris_lp=tl, tris_cad=tc, thumb_lp=f"thumbs/lp/{vid}.jpg")
CATS = [("cmd", "Command modules & probes", "cmd_prop"), ("prop", "Propulsion", "cmd_prop"), ("tank", "Tanks", "tank_stage"),
        ("stage", "Staging, fairings & landing", "tank_stage"), ("station", "Station modules & gravity ring", "station_power"),
        ("power", "Power, thermal & utilities", "station_power"), ("rover", "Rovers, rover kit & surface systems", "rover_jet"),
        ("jet", "Jets & aero parts", "rover_jet"), ("cockpit", "Aircraft cockpits", "cockpit"),
        ("aero", "Airframe: fuselages, cargo bays, fins & airbrakes", "aero"), ("struct", "Structure: girders, trusses, struts, ladders & pylons", "struct_robo"),
        ("robo", "Robotics: hinges, rotors, pistons & booms", "struct_robo"), ("sci", "Science instruments", "sci_power"),
        ("assemblies", "Reference assemblies", "station_power")]
SKIP = {"interiors", "np_lib", "modern_set", "interiors_modern", "ax_kit"}   # IVA interiors, shared libraries and the (re-coded) modern set are not gallery parts
# AX (Ares-line) source folders published in the gallery (parts/<folder>/ax_<axcat>_NN.nodes.json; category from the nodes.json).
# B1 adds "ax_cmd" here when its parts are ready (thumbs + low-poly present); AX parts missing a thumb / low-poly GLB are skipped with a warning.
AX_FOLDERS = ["ax_cmd", "ax_prop", "ax_tank", "ax_struct", "ax_gear", "ax_station", "ax_grav", "ax_util", "ax_power", "ax_rover", "ax_aero"]
AX_FILES = {}
for _d in AX_FOLDERS:
    for _f in sorted(glob.glob(os.path.join(PARTS, _d, "ax_*_[0-9][0-9].nodes.json"))):
        AX_FILES.setdefault(json.load(open(_f))["category"], []).append(_f)
def part_files(key):                                # <key>NN.nodes.json from every part folder (new parts live in rover_kit/, aero/, ...), then AX parts of that category
    base = sorted((f for f in glob.glob(os.path.join(PARTS, "*", f"{key}[0-9][0-9].nodes.json")) if f.split(os.sep)[-2] not in SKIP and not f.split(os.sep)[-2].startswith("ax_")), key=os.path.basename)
    return base + sorted(AX_FILES.get(key, []), key=os.path.basename)
def ax_ready(f, js):
    """AX part is publishable when every variant has a CAD thumb, a low-poly GLB + thumb and low-poly stats."""
    miss = [v for v in js["variants"] if not (os.path.exists(os.path.join(SITE, "thumbs", v + ".jpg")) and os.path.exists(os.path.join(SITE, "thumbs", "lp", v + ".jpg"))
                                              and os.path.exists(os.path.join(LP, js["id"], v + ".glb")))]
    if miss: print("WARN skipping AX part", js["id"], "missing thumb/low-poly for", miss[:3])
    return not miss
SPEC = {p["id"]: p for p in json.load(open("/workspace/space-sim/new_parts_spec.json"))["parts"]}   # 80 parts added 2026-09-30
GROUPS = {"rover kit": "Rover kit"}                 # sub-groupings shown inside a category
ASSEMBLY_NAMES = {"gravity_ring_assembly": "Gravity ring assembly (hub + 6 spokes + 12 segments + despun core)",
                  "counter_rotating_assembly": "Counter-rotating gravity ring assembly (2 rings)"}
MODELS = os.path.join(SITE, "models")
KEEP = {"interiors"}                                # models/interiors/ is written by handoff/tools/import_interiors.py, not by this script
if os.path.isdir(MODELS):
    for _e in os.listdir(MODELS):
        if _e not in KEEP: shutil.rmtree(os.path.join(MODELS, _e))
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
                                             thumb=f"thumbs/{vid}.jpg", bytes=b, **lp_info(vid, vid, key))]))
        shutil.copy2(os.path.join(PARTS, folder, "assembly", "assemblies.json"), os.path.join(MODELS, key, "assemblies.json"))
    else:
        for f in part_files(key):
            js = json.load(open(f)); pid = js["id"]
            if js.get("line") == "AX" and not ax_ready(f, js): continue
            shutil.copy2(f, os.path.join(MODELS, key, os.path.basename(f)))
            vs = []
            for vid, v in js["variants"].items():
                src = os.path.join(os.path.dirname(f), v["files"]["glb"]); shutil.copy2(src, os.path.join(MODELS, key, vid + ".glb"))
                b = os.path.getsize(src); n_glb += 1; total += b
                assert os.path.exists(os.path.join(SITE, "thumbs", vid + ".jpg")), vid
                vs.append(dict(vid=vid, size=v["size"], state=v.get("state", "flight"), label=v.get("label", ""),
                               primary=vid == js["primary"], dims=v.get("dims", {}), bbox=v.get("bbox_godot_size"),
                               nodes=v.get("nodes"), glb=f"models/{key}/{vid}.glb", thumb=f"thumbs/{vid}.jpg", bytes=b, **lp_info(pid, vid, key)))
            sp = SPEC.get(pid, {})
            if js.get("line") == "AX":
                sp = dict(group="AX line", summary=f"{js.get('display_id')} (AX line{', alias ' + '/'.join(js['aliases']) if js.get('aliases') else ''}): {js.get('summary') or ''}")
                GROUPS.setdefault("AX line", "AX line")
            parts.append(dict(id=pid, name=js["name"], primary=js["primary"], json=f"models/{key}/{os.path.basename(f)}", variants=vs,
                              group=GROUPS.get(sp.get("group")), new=bool(sp), summary=sp.get("summary"),
                              **({"line": "AX", "display_id": js.get("display_id"), "ax_category": js.get("ax_category"), "aliases": js.get("aliases") or []} if js.get("line") == "AX" else {})))
    cats_out.append(dict(key=key, title=title, parts=parts))
for old in glob.glob(os.path.join(SITE, "space_sim_*glb_v*.zip")): os.remove(old)
shutil.copy2(ZIP, os.path.join(SITE, os.path.basename(ZIP))); shutil.copy2(ZIP_LP, os.path.join(SITE, os.path.basename(ZIP_LP)))
shutil.copy2("/workspace/space-sim/CONVENTIONS.md", os.path.join(SITE, "CONVENTIONS.md"))
man = dict(title="Space Sim part blockouts", generated=datetime.datetime.now().astimezone().isoformat(timespec="minutes"),
           glb_count=n_glb, part_count=sum(len(c["parts"]) for c in cats_out if c["key"] != "assemblies"),
           zip=os.path.basename(ZIP), zip_bytes=os.path.getsize(ZIP), zip_lp=os.path.basename(ZIP_LP), zip_lp_bytes=os.path.getsize(ZIP_LP), categories=cats_out)
json.dump(man, open(os.path.join(SITE, "manifest.json"), "w"), separators=(",", ":"))
open(os.path.join(SITE, ".nojekyll"), "w").close()
big = [p for p in glob.glob(SITE + "/**", recursive=True) if os.path.isfile(p) and os.path.getsize(p) > 50e6]
print(f"parts {man['part_count']}, glb {n_glb} ({total/1e6:.1f} MB), files >50MB: {big}")
