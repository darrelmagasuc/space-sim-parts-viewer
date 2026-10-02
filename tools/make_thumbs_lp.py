"""Low-poly gallery thumbnails -> site/thumbs/lp/<vid>.jpg (320 px), rendered in batches with parts_lowpoly/tools/contact.html."""
import json, glob, os, subprocess, http.server, threading, functools
from PIL import Image
LP = "/workspace/space-sim/parts_lowpoly"; OUT = "/workspace/space-sim/viewer/site/thumbs/lp"; PORT = 8783; CELL = 320; COLS = 6
import sys
AX_FOLDERS = ["ax_prop", "ax_tank", "ax_struct", "ax_gear", "ax_station", "ax_grav", "ax_util", "ax_power", "ax_rover", "ax_aero"]   # keep in sync with build_site.py
SKIP = {"interiors", "np_lib", "modern_set", "interiors_modern", "ax_kit"}
ALL = "--all" in sys.argv          # default: only (re)render thumbs that are missing or older than their low-poly GLB
items = []
for f in sorted(glob.glob("/workspace/space-sim/parts/*/*[0-9][0-9].nodes.json")):
    d = f.split(os.sep)[-2]
    if d in SKIP or (d.startswith("ax_") and d not in AX_FOLDERS): continue
    js = json.load(open(f))
    for v in js["variants"]:
        src = f"/workspace/space-sim/parts_lowpoly/{js['id']}/{v}.glb"; dst = f"{OUT}/{v}.jpg"
        if not os.path.exists(src): continue
        if ALL or not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(src): items.append((v, "/space-sim/parts_lowpoly/" + src.split("/parts_lowpoly/")[1]))
if ALL: items += [(a, f"/space-sim/parts_lowpoly/assemblies/{a}.glb") for a in ("gravity_ring_assembly", "counter_rotating_assembly")]
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory="/workspace")
http.server.ThreadingHTTPServer.allow_reuse_address = True
srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), lambda *a: h(*a)); srv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
for b in range(0, len(items), 36):
    chunk = items[b:b + 36]; rows = (len(chunk) + COLS - 1) // COLS; tmp = f"/workspace/_lpthumb_{b}.png"
    url = f"http://127.0.0.1:{PORT}/space-sim/parts_lowpoly/tools/contact.html?cols={COLS}&cell={CELL}&files=" + ",".join(p for _, p in chunk) + "&labels=" + "|".join(" " for _ in chunk)
    subprocess.run(["node", f"{LP}/tools/shot.js", url, tmp, str(COLS * CELL), str(rows * (CELL + 34))], check=True, capture_output=True)
    im = Image.open(tmp).convert("RGB")
    for i, (vid, _) in enumerate(chunk):
        x, y = i % COLS * CELL, i // COLS * (CELL + 34); im.crop((x, y, x + CELL, y + CELL)).save(f"{OUT}/{vid}.jpg", quality=85)
    os.remove(tmp); print("batch", b, len(chunk), flush=True)
srv.shutdown(); print("thumbs", len(items))
