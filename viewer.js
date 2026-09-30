import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => (Math.abs(n) >= 10 ? n.toFixed(1) : Math.abs(n) >= 1 ? n.toFixed(2) : n.toFixed(3)).replace(/\.?0+$/, '') || '0';
const NODE_COL = n => n === 'node_top' ? 0x00aa00 : n === 'node_bottom' ? 0xdd0000 : n === 'node_attach' ? 0xc800c8 : n.startsWith('node_side') ? 0x005ae6 : 0xff8c00;

const stage = $('stage');
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch (e) { $('msg').textContent = 'WebGL is not available in this browser (' + e.message + ').'; throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
stage.prepend(renderer.domElement);
const labels = new CSS2DRenderer(); labels.domElement.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none'; stage.append(labels.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xdfe4ea);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(3, 5, 4); scene.add(sun);
const fill = new THREE.DirectionalLight(0xffffff, 0.8); fill.position.set(-4, 2, -3); scene.add(fill);
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 5000);
const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
const loader = new GLTFLoader();
let model = null, nodeGroup = null, grid = null, axes = null, homeView = null;

function resize() { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h); labels.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); labels.render(scene, camera); });

function niceStep(span) { const raw = span / 8, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; }

function clearModel() {
  for (const o of [model, nodeGroup, grid, axes]) if (o) { scene.remove(o); o.traverse(c => { c.geometry?.dispose(); if (c.isCSS2DObject) c.element.remove(); }); }
  model = nodeGroup = grid = axes = null;
}

function buildNodes(root, span) {
  const g = new THREE.Group(); const r = span * 0.012, L = span * 0.09;
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.name.startsWith('node_') || o.isMesh) return;
    const p = new THREE.Vector3(), q = new THREE.Quaternion(); o.matrixWorld.decompose(p, q, new THREE.Vector3());
    const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize(); const col = NODE_COL(o.name);
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.9 }));
    s.position.copy(p); s.renderOrder = 10; g.add(s);
    const a = new THREE.ArrowHelper(dir, p, L, col, L * 0.3, L * 0.18); a.traverse(c => { if (c.material) { c.material.depthTest = false; c.material.transparent = true; } c.renderOrder = 10; }); g.add(a);
    const d = document.createElement('div'); d.className = 'nlabel'; d.textContent = o.name; const lab = new CSS2DObject(d); lab.position.copy(p); g.add(lab);
  });
  return g;
}

function frame(box) {
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3()), R = size.length() / 2 || 1;
  const dist = R / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.05;
  const dirv = new THREE.Vector3(1, 0.75, 1).normalize();
  camera.position.copy(c).addScaledVector(dirv, dist); camera.near = dist / 200; camera.far = dist * 20; camera.updateProjectionMatrix();
  controls.target.copy(c); controls.update(); homeView = { p: camera.position.clone(), t: c.clone() };
}

let man, cur;
async function init() {
  man = await (await fetch('manifest.json')).json();
  const idx = new Map(); const parts = [];
  for (const c of man.categories) for (const p of c.parts) { p.cat = c.key; parts.push(p); for (const v of p.variants) idx.set(v.vid.toLowerCase(), { p, v }); }
  const q = (new URLSearchParams(location.search).get('part') || '').trim().toLowerCase();
  let hit = idx.get(q), note = '';
  if (!hit && q) {                       // aliases: <id>, <id>_<size>[_<state>], <id>_<short> prefixes
    const m = q.match(/^([a-z]+\d\d)(?:_(.*))?$/); const p = m && parts.find(p => p.id === m[1]);
    if (p) {
      const rest = (m[2] || '').split('_').filter(Boolean);
      const sc = v => rest.reduce((s, t) => s + (v.size.toLowerCase() === t ? 2 : 0) + (v.state.toLowerCase() === t ? 2 : 0) + (v.vid.toLowerCase().split('_').includes(t) ? 1 : 0), 0) + (v.primary ? 0.5 : 0);
      const v = [...p.variants].sort((a, b) => sc(b) - sc(a))[0]; hit = { p, v };
      if (rest.length && sc(v) < 1) note = `No variant “${esc(q)}”; showing the primary variant of ${p.id}.`;
    }
  }
  if (!hit) { $('title').textContent = 'Part not found'; $('msg').innerHTML = q ? `No part “${esc(q)}”. <a href="index.html" style="pointer-events:auto">&nbsp;Back to the gallery</a>` : 'No part given.'; return; }
  if (note) $('warn').innerHTML = `<div class="warn">${note}</div>`;
  show(hit.p, hit.v, false);
}

function show(p, v, push = true) {
  cur = { p, v };
  if (push) history.replaceState(null, '', '?part=' + encodeURIComponent(v.vid));
  document.title = `${v.vid} – Space Sim part viewer`;
  $('title').textContent = `${p.id} · ${p.name}`; $('sub').textContent = `${p.cat} · ${v.vid}`;
  $('vars').innerHTML = p.variants.map(x => `<button data-v="${esc(x.vid)}" class="${x.vid === v.vid ? 'on' : ''}" title="${esc(x.vid)}">${esc(x.size)}${x.state !== 'flight' ? ' · ' + esc(x.state) : ''}${x.primary ? ' ★' : ''}</button>`).join('');
  $('vars').querySelectorAll('button').forEach(b => b.onclick = () => show(p, p.variants.find(x => x.vid === b.dataset.v)));
  const mb = (v.bytes / 1e6).toFixed(2);
  $('dl').innerHTML = `<a class="btn" href="${v.glb}" download>GLB (${mb} MB)</a><a class="btn sec" href="${p.json}" download>nodes.json</a><a class="btn sec" href="${man.zip}" download>All (.zip, ${(man.zip_bytes / 1e6).toFixed(1)} MB)</a>`;
  const dimRows = Object.entries(v.dims || {}).map(([k, x]) => `<tr><td>${esc(k.replace(/_m$/, ' (m)').replace(/_/g, ' '))}</td><td>${esc(typeof x === 'number' ? fmt(x) : x)}</td></tr>`).join('');
  $('dims').innerHTML = (v.bbox ? `<tr><th>bbox X × Y × Z</th><th>${v.bbox.map(fmt).join(' × ')} m</th></tr>` : '') + dimRows;
  $('nodes').innerHTML = v.nodes ? '<tr><th>node</th><th>position</th><th>dir</th></tr>' + v.nodes.map(n => `<tr><td>${esc(n.name)}</td><td>${n.position.map(fmt).join(', ')}</td><td>${n.direction.map(x => +x.toFixed(2)).join(', ')}</td></tr>`).join('') : '<tr><td class="muted">see the assembly GLB (node empties included)</td></tr>';
  $('msg').textContent = `Loading ${v.vid}.glb (${mb} MB)…`; $('msg').style.display = '';
  const want = v.vid;
  loader.load(v.glb, gltf => {
    if (cur.v.vid !== want) return;
    clearModel(); model = gltf.scene; scene.add(model);
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), span = Math.max(size.x, size.y, size.z) || 1;
    nodeGroup = buildNodes(model, span); nodeGroup.visible = $('tNodes').checked; scene.add(nodeGroup);
    const step = niceStep(Math.max(size.x, size.z) * 1.6 || span), n = Math.max(4, Math.ceil(Math.max(size.x, size.z) * 1.6 / step / 2) * 2);
    grid = new THREE.GridHelper(n * step, n, 0x6b7485, 0xa3abb8); grid.position.set((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2); grid.visible = $('tGrid').checked; scene.add(grid);
    axes = new THREE.AxesHelper(span * 0.35); axes.visible = $('tAxes').checked; axes.renderOrder = 9; scene.add(axes);
    $('hud').innerHTML = `<b>${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} m</b> (X × Y × Z)<br>grid square = ${fmt(step)} m · origin = axes (X red, Y green, Z blue)`;
    const k = frame(box); $('msg').style.display = 'none';
  }, ev => { if (ev.total) $('msg').textContent = `Loading ${v.vid}.glb… ${Math.round(ev.loaded / ev.total * 100)}%`; },
    err => { $('msg').textContent = 'Failed to load ' + v.glb + ': ' + (err.message || err); });
}
$('tNodes').onchange = e => nodeGroup && (nodeGroup.visible = e.target.checked);
$('tGrid').onchange = e => grid && (grid.visible = e.target.checked);
$('tAxes').onchange = e => axes && (axes.visible = e.target.checked);
$('reset').onclick = e => { e.preventDefault(); if (homeView) { camera.position.copy(homeView.p); controls.target.copy(homeView.t); } };
init().catch(e => { $('msg').textContent = 'Error: ' + e.message; console.error(e); });
