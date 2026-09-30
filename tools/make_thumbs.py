"""Gallery thumbnails -> site/thumbs/<vid>.jpg (320x320).
Reuses the existing per-variant renders (renders/<vid>.png, top 640x640 = image area) where present,
otherwise renders from the folder's _cache/<vid>.npz with station_power/render.py's isometric rasterizer (read-only use)."""
import os, sys, json, glob, importlib.util
sys.dont_write_bytecode = True
import tempfile; os.environ["NUMBA_CACHE_DIR"] = tempfile.mkdtemp(prefix="numba_viewer_")   # fresh cache (module is loaded dynamically)
from PIL import Image
PARTS = "/workspace/space-sim/parts"; _H = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(_H, "..", "thumbs") if os.path.basename(_H) == "tools" else os.path.join(_H, "site", "thumbs")
os.makedirs(OUT, exist_ok=True)
spec = importlib.util.spec_from_file_location("sp_render", os.path.join(PARTS, "station_power", "render.py"))
sys.path.insert(0, os.path.join(PARTS, "station_power"))
R = importlib.util.module_from_spec(spec); spec.loader.exec_module(R)
jobs = []
for d in ("cmd_prop", "tank_stage", "station_power", "rover_jet", "cockpit", "rover_kit", "prop_stage_ext", "aero", "struct_robo", "sci_power"):
    for f in sorted(glob.glob(f"{PARTS}/{d}/*[0-9][0-9].nodes.json")):
        for vid in json.load(open(f))["variants"]: jobs.append((d, vid, os.path.join(PARTS, d, "renders", vid + ".png")))
for vid in ("gravity_ring_assembly", "counter_rotating_assembly"):
    jobs.append(("station_power", vid, os.path.join(PARTS, "station_power", "assembly", vid + ".png")))
reused = made = 0
for d, vid, png in jobs:
    dst = os.path.join(OUT, vid + ".jpg")
    if os.path.exists(png):
        im = Image.open(png).convert("RGB"); w = im.width
        im = im.crop((20, 36, w - 20, w)); reused += 1   # drop the top-right caption
    else:
        R.OUT = os.path.join(PARTS, d)
        im = R.view(vid, 640, 640, show_nodes=False).convert("RGB"); made += 1
    im.resize((320, 320), Image.LANCZOS).save(dst, quality=84, optimize=True)
print("thumbs reused", reused, "rendered", made)
