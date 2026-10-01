#!/usr/bin/env python3
"""Publish a parts update for the game: diff, version bump, changelog, commit, tag, push.

Updates are published ONLY when Darrel asks. Nothing here runs on a schedule.

  python3 handoff/tools/publish_update.py --dry-run              # what changed since the last release, next version
  python3 handoff/tools/publish_update.py --notes "why"          # regenerate manifest + changelog, git add (staged only)
  python3 handoff/tools/publish_update.py --notes "why" --commit # ... and commit locally
  python3 handoff/tools/publish_update.py --notes "why" --push   # ... commit, rebase on origin, tag parts-vX.Y.Z, push, GitHub release

Options: --notes TEXT / --notes-file F (free text for the changelog entry), --version X.Y.Z (override the bump),
--import-interiors (re-run import_interiors.py first), --force (publish a patch even with no changes),
--skip-tests, --no-release, --allow-stale-zips.

How it works
1. Baseline = handoff/parts_manifest.json at the newest git tag parts-vX.Y.Z (the last published release).
   No tag yet -> initial release, --version is required.
2. The manifest is regenerated to a temp file and compared with the baseline per id (parts, interiors,
   assemblies): added / removed / changed files (content_hash = GLB + nodes.json sha256) / changed data
   only (meta_hash: mass, nodes, text, ...).
3. Version: added or removed ids -> minor bump; only changes -> patch bump; nothing -> stop (unless --force).
4. Tests: tools/test_assemble.mjs, tools/test_providers.mjs, test vehicles (--check) and reference_builder.py.
   The two zips are checked against models/ (stale zips stop the release unless --allow-stale-zips).
5. Writes handoff/parts_manifest.json (manifest_version, generated_at) and prepends a CHANGELOG.md entry
   (kept as is if an entry for that version already exists), then git add's the release paths.
6. --push: commits, fetches origin (rebases if origin moved), tags parts-vX.Y.Z (annotated), pushes main
   + tag with GH_TOKEN through a credential helper (the token is never printed), and creates a GitHub
   release whose body is the changelog entry.
"""
import argparse, datetime, json, os, re, subprocess, sys, tempfile, urllib.request, zipfile, hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "..", ".."))
OWNER, NAME, BRANCH = "darrelmagasuc", "space-sim-parts-viewer", "main"
URL = f"https://github.com/{OWNER}/{NAME}.git"
MANIFEST = "handoff/parts_manifest.json"
CHANGELOG = "handoff/CHANGELOG.md"
STAGE_PATHS = ["handoff", "models", "thumbs", "manifest.json", "space_sim_lowpoly_glb_v2.zip", "space_sim_glb_v3.zip",
               "README.md", ".gitignore", "CONVENTIONS.md", "assemble.js", "catalogue.js", "vehicle.js", "examples.js", "tools"]
CRED = ["-c", "credential.helper=",
        "-c", "credential.helper=!f() { echo username=x-access-token; echo \"password=$GH_TOKEN\"; }; f"]


def git(*args, check=True, capture=True):
    r = subprocess.run(["git", "-C", REPO, *args], capture_output=capture, text=True)
    if check and r.returncode != 0:
        sys.exit(f"git {args[0]} failed: {(r.stderr or '').strip()[:400]}")
    return (r.stdout or "").strip()


def git_remote(*args):
    if not os.environ.get("GH_TOKEN"): sys.exit("GH_TOKEN is not set")
    r = subprocess.run(["git", "-C", REPO, *CRED, *args], capture_output=True, text=True)
    out = (r.stdout + r.stderr).replace(os.environ["GH_TOKEN"], "***")
    if r.returncode != 0: sys.exit(f"git {args[0]} failed: {out.strip()[:400]}")
    return out


def semver(s): return tuple(int(x) for x in s.split("."))


def tags():
    t = [x for x in git("tag", "--list", "parts-v*").split() if re.match(r"^parts-v\d+\.\d+\.\d+$", x)]
    return sorted(t, key=lambda x: semver(x[7:]))


def build(out, version):
    cmd = [sys.executable, os.path.join(HERE, "build_manifest.py"), "--version", version, "--out", out]
    r = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True)
    if r.returncode: sys.exit("build_manifest failed:\n" + r.stdout + r.stderr)
    return json.load(open(out))


def index(man):
    out = {}
    for kind in ("parts", "interiors", "assemblies"):
        for e in man.get(kind, []):
            out[e["id"]] = dict(kind=kind, name=e.get("name", ""), content=e.get("content_hash"), meta=e.get("meta_hash"),
                                files={f"{v['vid']}:{k}": h for v in e.get("variants", []) for k, h in v.get("sha256", {}).items()}
                                      | {k: h for k, h in e.get("sha256", {}).items()})
    return out


def diff(old, new):
    a, b = index(old), index(new)
    added = sorted(i for i in b if i not in a)
    removed = sorted(i for i in a if i not in b)
    changed, data_only = [], []
    for i in sorted(set(a) & set(b)):
        if a[i]["content"] != b[i]["content"]:
            fa, fb = a[i]["files"], b[i]["files"]
            what = sorted({k.split(":")[0] for k in set(fa) | set(fb) if fa.get(k) != fb.get(k)})
            changed.append((i, what))
        elif a[i]["meta"] != b[i]["meta"]:
            data_only.append(i)
    return dict(added=added, removed=removed, changed=changed, data_only=data_only, names={**{i: a[i]["name"] for i in a}, **{i: b[i]["name"] for i in b}})


def bump(base, d, force):
    M, m, p = semver(base)
    if d["added"] or d["removed"]: return f"{M}.{m + 1}.0", "minor"
    if d["changed"] or d["data_only"] or force: return f"{M}.{m}.{p + 1}", "patch"
    return None, None


def run_tests():
    cmds = [["node", "tools/test_assemble.mjs"], ["node", "tools/test_providers.mjs"],
            ["node", "handoff/tools/build_test_vehicles.mjs", "--check"], [sys.executable, "handoff/tools/reference_builder.py"]]
    for c in cmds:
        r = subprocess.run(c, cwd=REPO, capture_output=True, text=True)
        last = (r.stdout.strip().splitlines() or [""])[-1]
        print(f"  {'ok  ' if r.returncode == 0 else 'FAIL'} {' '.join(c[-2:])}: {last}")
        if r.returncode: sys.exit("tests failed; nothing published")


def zip_check(man):
    """GLBs inside the zips must match models/ byte for byte."""
    stale = []
    for key, folder, path_key in (("lowpoly", "space_sim_lowpoly_glb_v2", "glb_lowpoly"), ("cad", "space_sim_glb_v3", "glb_cad")):
        zp = os.path.join(REPO, man["zips"][key]["path"])
        with zipfile.ZipFile(zp) as z:
            names = set(z.namelist())
            for p in man["parts"]:
                for v in p["variants"]:
                    n = f"{folder}/{p['category']}/{v['vid']}.glb"
                    if n not in names: stale.append(n + " (missing)"); continue
                    if hashlib.sha256(z.read(n)).hexdigest() != v["sha256"][path_key]: stale.append(n)
    return stale


def entry_text(version, d, new, notes, today):
    c = new["counts"]
    nm = d["names"]
    L = [f"## [{version}] - {today}", ""]
    L.append(f"{c['parts']} parts / {c['variants']} variants, {c.get('interiors', 0)} interiors ({c.get('interior_variants', 0)} variants), "
             f"{c['assemblies']} assemblies. Tag `parts-v{version}`.")
    if notes: L += ["", notes.strip()]
    if d["added"]: L += ["", "### Added"] + [f"- `{i}` {nm.get(i, '')}" for i in d["added"]]
    if d["changed"] or d["data_only"]:
        L += ["", "### Changed"]
        L += [f"- `{i}` {nm.get(i, '')}: files changed ({', '.join(f'`{w}`' for w in what)})" for i, what in d["changed"]]
        L += [f"- `{i}` {nm.get(i, '')}: data only (manifest values, no file changes)" for i in d["data_only"]]
    if d["removed"]: L += ["", "### Removed", "Breaking for crafts that use these ids."] + [f"- `{i}` {nm.get(i, '')}" for i in d["removed"]]
    return "\n".join(L) + "\n"


def write_changelog(version, text):
    p = os.path.join(REPO, CHANGELOG)
    s = open(p).read() if os.path.isfile(p) else "# Changelog\n\n"
    if re.search(rf"^## \[{re.escape(version)}\]", s, re.M):
        print(f"  CHANGELOG.md already has [{version}]; kept as written")
        return changelog_entry(version)
    i = s.find("\n## [")
    s = (s.rstrip("\n") + "\n\n" + text) if i < 0 else (s[:i + 1] + text + "\n" + s[i + 1:])
    open(p, "w").write(s)
    return text


def changelog_entry(version):
    s = open(os.path.join(REPO, CHANGELOG)).read()
    m = re.search(rf"^## \[{re.escape(version)}\].*?(?=^## \[|\Z)", s, re.M | re.S)
    return m.group(0).strip() + "\n" if m else ""


def github(method, path, body=None):
    req = urllib.request.Request(f"https://api.github.com/repos/{OWNER}/{NAME}{path}", method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": "Bearer " + os.environ["GH_TOKEN"], "Accept": "application/vnd.github+json"})
    try:
        with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--notes"); ap.add_argument("--notes-file"); ap.add_argument("--version")
    ap.add_argument("--import-interiors", action="store_true"); ap.add_argument("--force", action="store_true")
    ap.add_argument("--skip-tests", action="store_true"); ap.add_argument("--allow-stale-zips", action="store_true")
    ap.add_argument("--dry-run", action="store_true"); ap.add_argument("--commit", action="store_true")
    ap.add_argument("--push", action="store_true"); ap.add_argument("--no-release", action="store_true")
    a = ap.parse_args()
    notes = open(a.notes_file).read() if a.notes_file else (a.notes or "")

    if a.push:  # get origin's tags first so the baseline is the real last release
        git_remote("fetch", "-q", URL, "+refs/tags/parts-v*:refs/tags/parts-v*")
    if a.import_interiors and not a.dry_run:
        subprocess.run([sys.executable, os.path.join(HERE, "import_interiors.py")], cwd=REPO, check=True)

    t = tags()
    if t:
        base_tag = t[-1]; base_version = base_tag[7:]
        old = json.loads(git("show", f"{base_tag}:{MANIFEST}"))
        print(f"last release: {base_tag} (manifest_version {old.get('manifest_version')})")
    else:
        base_tag = None; base_version = None; old = {"parts": [], "interiors": [], "assemblies": []}
        print("no parts-v* tag yet: initial release")
    with tempfile.TemporaryDirectory() as td:
        new = build(os.path.join(td, "m.json"), base_version or a.version or "0.0.0")
    d = diff(old, new)
    print(f"added {len(d['added'])}, changed {len(d['changed'])} (+{len(d['data_only'])} data only), removed {len(d['removed'])}")
    for k in ("added", "removed", "data_only"):
        if d[k]: print(f"  {k}: {', '.join(d[k][:60])}{' ...' if len(d[k]) > 60 else ''}")
    for i, what in d["changed"][:60]: print(f"  changed: {i} ({', '.join(what[:6])}{' ...' if len(what) > 6 else ''})")

    if base_version is None:
        if not a.version: sys.exit("initial release: pass --version X.Y.Z")
        version, kind = a.version, "initial"
    else:
        version, kind = bump(base_version, d, a.force)
        if a.version: version, kind = a.version, "explicit"
        if version is None:
            print("nothing changed since the last release; nothing to publish (use --force for a patch)"); return
        if semver(version) <= semver(base_version): sys.exit(f"version {version} must be greater than {base_version}")
    if f"parts-v{version}" in t: sys.exit(f"tag parts-v{version} already exists")
    print(f"next version: {version} ({kind})")
    if d["removed"]: print("WARNING: ids were removed; crafts using them will no longer load")
    if a.dry_run: return

    if not a.skip_tests:
        print("tests:"); run_tests()
    man_now = build(os.path.join(REPO, MANIFEST), version)
    stale = zip_check(man_now)
    if stale:
        print(f"zips are stale ({len(stale)} GLBs differ from models/), e.g. {stale[:3]}")
        if not a.allow_stale_zips: sys.exit("rebuild the zips first (or --allow-stale-zips)")
    today = datetime.date.today().isoformat()
    entry = write_changelog(version, entry_text(version, d, man_now, notes, today))
    git("add", "-A", "--", *[p for p in STAGE_PATHS if os.path.exists(os.path.join(REPO, p))])
    staged = git("diff", "--cached", "--stat").splitlines()
    print(f"staged: {staged[-1] if staged else 'nothing'}")
    if not (a.commit or a.push):
        print("staged only. Re-run with --commit or --push (or commit by hand) to publish."); return

    msg = f"Parts release v{version}\n\n{entry}"
    if staged:
        subprocess.run(["git", "-C", REPO, "-c", "user.name=space-sim-viewer", "-c", "user.email=space-sim-viewer@users.noreply.github.com",
                        "commit", "-q", "-F", "-"], input=msg, text=True, check=True)
    if not a.push:
        print("committed", git("rev-parse", "--short", "HEAD"), "(not pushed)"); return

    git_remote("fetch", "-q", URL, BRANCH)
    if subprocess.run(["git", "-C", REPO, "merge-base", "--is-ancestor", "FETCH_HEAD", "HEAD"]).returncode != 0:
        print("origin moved: rebasing")
        r = subprocess.run(["git", "-C", REPO, "rebase", "FETCH_HEAD"], capture_output=True, text=True)
        if r.returncode:
            subprocess.run(["git", "-C", REPO, "rebase", "--abort"])
            sys.exit("rebase failed (conflict); resolve by hand, nothing was pushed")
        check = build(os.path.join(tempfile.gettempdir(), "publish_check.json"), version)
        committed = json.loads(git("show", f"HEAD:{MANIFEST}"))
        for x in (check, committed): x.pop("generated_at", None)
        if check != committed: sys.exit("after the rebase the manifest no longer matches the parts; re-run publish_update.py")
        if not a.skip_tests: run_tests()
    head = git("rev-parse", "HEAD")
    git("-c", "user.name=space-sim-viewer", "-c", "user.email=space-sim-viewer@users.noreply.github.com",
        "tag", "-a", f"parts-v{version}", "-m", f"Parts release v{version}", head)
    git_remote("push", "-q", URL, f"HEAD:{BRANCH}")
    git_remote("push", "-q", URL, f"refs/tags/parts-v{version}")
    print(f"pushed {head[:7]} to {BRANCH} and tag parts-v{version}")
    if a.no_release: return
    st, body = github("POST", "/releases", dict(tag_name=f"parts-v{version}", name=f"Parts v{version}", body=entry,
                                                 draft=False, prerelease=False))
    if st == 201: print("release:", body.get("html_url"))
    else: print(f"release not created (HTTP {st}): {body.get('message')}")


if __name__ == "__main__":
    main()
