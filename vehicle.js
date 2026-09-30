import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { assemble, parseCraftJSON, planNeedsAnotherTry } from './assemble.js';
import { buildCatalogue } from './catalogue.js';
import { EXAMPLES } from './examples.js';
import {
  DEFAULT_PROVIDER, PRESETS, LS, optionLabel, browserNote, settingsHint,
  describeFetchFailure, buildProviderRequest
} from './providers.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const NODE_COL = n => n === 'node_top' ? 0x00aa00 : n === 'node_bottom' ? 0xdd0000 : n === 'node_attach' ? 0xc800c8 : n.startsWith('node_side') ? 0x005ae6 : 0xff8c00;


const stage = $('stage');
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
catch (e) { $('msg').textContent = 'WebGL is not available in this browser (' + e.message + ').'; throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
stage.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe4ea);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(3, 5, 4); scene.add(sun);
const fill = new THREE.DirectionalLight(0xffffff, 0.8); fill.position.set(-4, 2, -3); scene.add(fill);
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 5000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
const loader = new GLTFLoader();
const craftGroup = new THREE.Group();
scene.add(craftGroup);
const glbCache = new Map();
let grid = null, homeView = null, markerGroups = [], loadToken = 0;
let catalogue = null, currentCraft = null;

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (w < 2 || h < 2) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => resize()).observe(stage);
resize();
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

function niceStep(span) {
  const raw = span / 8, p = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-6))), f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}

function markDispose(o) { o.traverse(c => { c.userData.dispose = true; }); }

function clearCraft() {
  craftGroup.traverse(o => {
    if (!o.userData.dispose) return;
    o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    mats.forEach(m => m.dispose());
  });
  craftGroup.clear();
  markerGroups = [];
}

function setGrid(box) {
  if (grid) {
    scene.remove(grid);
    grid.geometry?.dispose();
    const mats = Array.isArray(grid.material) ? grid.material : [grid.material];
    mats.forEach(m => m && m.dispose());
    grid = null;
  }
  const size = box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.z, 1) * 1.8;
  const step = niceStep(span), n = Math.max(4, Math.ceil(span / step / 2) * 2);
  grid = new THREE.GridHelper(n * step, n, 0x6b7485, 0xa3abb8);
  grid.position.set((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
  grid.visible = $('tGrid').checked;
  scene.add(grid);
}

function frame(box) {
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const R = size.length() / 2 || 1;
  const dist = R / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.15;
  const dirv = new THREE.Vector3(1, 0.7, 1).normalize();
  camera.position.copy(c).addScaledVector(dirv, dist);
  camera.near = dist / 200; camera.far = dist * 40; camera.updateProjectionMatrix();
  controls.target.copy(c); controls.update();
  homeView = { p: camera.position.clone(), t: c.clone() };
  return size;
}

function buildMarkers(inst) {
  const g = new THREE.Group();
  const b = inst.bbox || [1, 1, 1];
  const span = Math.max(b[0], b[1], b[2]) || 1;
  const r = Math.min(0.16, Math.max(0.04, span * 0.018));
  const L = Math.min(1.5, Math.max(0.3, span * 0.1));
  for (const n of inst.nodes || []) {
    const dir = new THREE.Vector3(n.direction[0], n.direction[1], n.direction[2]);
    if (dir.lengthSq() < 1e-8) continue;
    dir.normalize();
    const pos = new THREE.Vector3(n.position[0], n.position[1], n.position[2]);
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshBasicMaterial({ color: NODE_COL(n.name) }));
    s.position.copy(pos); markDispose(s); g.add(s);
    const a = new THREE.ArrowHelper(dir, pos, L, NODE_COL(n.name), L * 0.28, L * 0.16);
    markDispose(a); g.add(a);
  }
  g.visible = $('tNodes').checked;
  return g;
}

function placeholder(bbox) {
  const [x, y, z] = bbox || [1, 1, 1];
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(x, 0.2), Math.max(y, 0.2), Math.max(z, 0.2)),
    new THREE.MeshBasicMaterial({ color: 0xb45309, wireframe: true })
  );
  markDispose(mesh);
  return mesh;
}

function loadGLB(url) {
  let pending = glbCache.get(url);
  if (!pending) {
    pending = new Promise((resolve, reject) => loader.load(url, gltf => resolve(gltf.scene), undefined, reject));
    pending.catch(() => glbCache.delete(url));
    glbCache.set(url, pending);
  }
  return pending;
}

function hideReplacedWheels(model, wheelSet) {
  if (!wheelSet || !wheelSet.size) return;
  model.traverse(o => {
    if (/^wheel_\d+$/.test(o.name) && wheelSet.has(o.name.slice(6))) o.visible = false;
    if (o.name === 'fenders' || o.name === 'suspension_arms') o.visible = false;
  });
}

async function renderAssembly(result) {
  const my = ++loadToken;
  clearCraft();
  if (!result.instances.length) {
    $('msg').style.display = '';
    $('msg').textContent = 'Nothing placed. See the errors in the side panel.';
    $('hud').textContent = '';
    if (grid) grid.visible = false;
    return;
  }
  $('msg').style.display = '';
  $('msg').textContent = 'Loading parts…';
  const replaced = new Map();
  for (const j of result.joints) {
    const m = /^node_wheel_(\d+)$/.exec(j.parentNode);
    if (!m) continue;
    if (!replaced.has(j.parentId)) replaced.set(j.parentId, new Set());
    replaced.get(j.parentId).add(m[1]);
  }
  const groups = await Promise.all(result.instances.map(async inst => {
    const g = new THREE.Group();
    g.name = inst.id;
    g.matrixAutoUpdate = false;
    g.matrix.fromArray(inst.matrix);
    g.matrixWorldNeedsUpdate = true;
    const markers = buildMarkers(inst);
    g.add(markers);
    g.userData.markers = markers;
    try {
      if (!inst.glb) throw new Error('no GLB path');
      const src = await loadGLB(inst.glb);
      if (my !== loadToken) return null;
      const model = src.clone(true);
      hideReplacedWheels(model, replaced.get(inst.id));
      g.add(model);
    } catch (e) {
      g.add(placeholder(inst.bbox));
      g.userData.loadError = `${inst.variant}: ${e && e.message ? e.message : e}`;
    }
    return g;
  }));
  if (my !== loadToken) return;
  markerGroups = [];
  for (const g of groups) {
    if (!g) continue;
    craftGroup.add(g);
    if (g.userData.markers) markerGroups.push(g.userData.markers);
  }
  craftGroup.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(craftGroup);
  if (box.isEmpty()) { $('msg').textContent = 'The craft has no geometry.'; return; }
  setGrid(box);
  const size = frame(box);
  $('hud').innerHTML = `<b>${result.instances.length} parts</b> · ${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} m`;
  const fails = groups.filter(g => g && g.userData.loadError).map(g => g.userData.loadError);
  if (fails.length) $('msg').textContent = 'Some parts did not load. ' + fails.join(' · ');
  else $('msg').style.display = 'none';
}

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}

function renderMarkdown(md) {
  const lines = String(md).replace(/\r\n/g, '\n').split('\n');
  let html = '', list = null, para = [];
  const flushPara = () => { if (!para.length) return; html += `<p>${inline(para.join(' '))}</p>`; para = []; };
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const line of lines) {
    const t = line.trim();
    if (!t) { flushPara(); closeList(); continue; }
    let m;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(t))) {
      flushPara(); closeList();
      const tag = 'h' + m[1].length;
      html += `<${tag}>${inline(m[2])}</${tag}>`;
    } else if ((m = /^[-*]\s+(.*)$/.exec(t))) {
      flushPara();
      if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; }
      html += `<li>${inline(m[1])}</li>`;
    } else if ((m = /^\d+\.\s+(.*)$/.exec(t))) {
      flushPara();
      if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; }
      html += `<li>${inline(m[1])}</li>`;
    } else { closeList(); para.push(t); }
  }
  flushPara(); closeList();
  return html;
}

function renderReport(result) {
  $('title').textContent = result.name || 'Vehicle Creation';
  document.title = (result.name || 'Vehicle Creation') + ' – Space Sim';
  $('sub').textContent = `${result.instances.length} placed · ${result.errors.length} errors · ${result.warnings.length} warnings`;
  $('summary').textContent = currentCraft && currentCraft.summary ? currentCraft.summary : '';
  const blocks = [];
  for (const e of result.errors) blocks.push(`<div class="err">${esc(e.message)}</div>`);
  for (const w of result.warnings) blocks.push(`<div class="warn">${esc(w.message)}</div>`);
  $('issues').innerHTML = blocks.join('');
  $('parts').innerHTML = result.instances.length ? result.instances.map(inst => {
    const j = result.joints.find(x => x.childId === inst.id);
    const link = `<a href="view.html?part=${encodeURIComponent(inst.variant)}">${esc(inst.variant)}</a>`;
    const joint = j
      ? `${esc(j.childNode)} → ${esc(j.parentId)}.${esc(j.parentNode)}${j.symmetryIndex > 1 ? ' · copy ' + j.symmetryIndex : ''}`
      : inst.layout === 'ring' && inst.parentId
        ? `ring around ${esc(inst.parentId)}${inst.symmetryIndex > 1 ? ' · copy ' + inst.symmetryIndex : ''}`
        : inst.parentId ? `on ${esc(inst.parentId)}` : 'root';
    return `<div class="partrow"><b>${esc(inst.id)}</b> <span class="muted">${esc(inst.partName || '')}</span><div>${link}${inst.size ? ' · ' + esc(inst.size) : ''}</div><div class="muted">${joint}</div></div>`;
  }).join('') : '<p class="muted">No parts placed.</p>';
  const stages = currentCraft && Array.isArray(currentCraft.staging) ? currentCraft.staging : [];
  $('staging').innerHTML = stages.length
    ? '<ol class="manual">' + stages.map(s => `<li><b>${esc(s.title || ('Stage ' + (s.stage ?? '')))}</b> ${esc(s.note || '')}${Array.isArray(s.parts) && s.parts.length ? ' <span class="muted">(' + esc(s.parts.join(', ')) + ')</span>' : ''}</li>`).join('') + '</ol>'
    : '<p class="muted">No staging.</p>';
  const manual = currentCraft && typeof currentCraft.manual === 'string' ? currentCraft.manual.trim() : '';
  $('manual').innerHTML = manual ? renderMarkdown(manual) : '<p class="muted">No manual on this plan.</p>';
}

function showCraft(craft) {
  const plan = structuredClone(craft);
  if (Array.isArray(plan.manual)) plan.manual = plan.manual.join('\n');
  const result = assemble(plan, catalogue);
  currentCraft = result.plan || plan;
  renderReport(result);
  renderAssembly(result);
  return result;
}

function renderExampleButtons(active) {
  $('examples').innerHTML = EXAMPLES.map(ex =>
    `<button type="button" data-ex="${ex.id}" class="${ex.id === active ? 'on' : ''}" title="${esc(ex.blurb)}">${esc(ex.title)}</button>`
  ).join('');
  $('examples').querySelectorAll('button').forEach(b => { b.onclick = () => loadExample(b.dataset.ex); });
}

function setExampleParam(id) {
  const url = new URL(location.href);
  if (id) url.searchParams.set('example', id); else url.searchParams.delete('example');
  history.replaceState(null, '', url.pathname + url.search);
}

function loadExample(id) {
  const ex = EXAMPLES.find(e => e.id === id);
  if (!ex) return;
  renderExampleButtons(id);
  $('prompt').value = '';
  $('json').value = JSON.stringify(ex.craft, null, 2);
  setLlmError('');
  $('status').textContent = 'Assembled the built-in example locally.';
  setExampleParam(id);
  showCraft(ex.craft);
}

function setLlmError(message) {
  $('llmerr').innerHTML = message ? `<div class="err">${esc(message)}</div>` : '';
}

function store(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch (e) {
    setLlmError('Could not write localStorage (' + e.message + '). The key is only kept in the form.');
  }
}

function messageText(data, kind) {
  if (kind === 'anthropic') return (data.content || []).map(c => c.text || '').join('');
  const msg = data.choices && data.choices[0] && data.choices[0].message;
  if (!msg) return '';
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) return msg.content.map(p => p.text || p.content || '').join('');
  return '';
}

async function callProvider(system, messages) {
  const providerId = $('provider').value;
  const built = buildProviderRequest({
    providerId,
    base: $('base').value,
    model: $('model').value,
    key: $('key').value,
    proxy: $('proxy').value,
    pageUrl: location.href,
    system,
    messages
  });
  let res;
  try { res = await fetch(built.url, { method: 'POST', headers: built.headers, body: JSON.stringify(built.body) }); }
  catch (e) {
    throw new Error(describeFetchFailure(providerId, e, { proxy: $('proxy').value }));
  }
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* body kept as text */ }
  if (!res.ok) {
    const msg = (data && (data.error && (data.error.message || (data.error.error && data.error.error.message)) || data.message)) || text.slice(0, 500);
    throw new Error((PRESETS[providerId] || PRESETS.custom).label + ' returned HTTP ' + res.status + '. ' + msg);
  }
  if (!data) throw new Error('Provider returned a non-JSON body: ' + text.slice(0, 300));
  const content = messageText(data, built.kind);
  if (!content || !content.trim()) throw new Error('The provider returned an empty message. ' + text.slice(0, 300));
  return content;
}

function setBusy(on) {
  $('generate').disabled = on;
  $('assembleBtn').disabled = on;
}

async function generate() {
  setLlmError('');
  const request = $('prompt').value.trim();
  if (!request) { setLlmError('Describe the craft you want first.'); return; }
  if (!catalogue) { setLlmError('The part catalogue has not loaded yet.'); return; }
  setBusy(true);
  renderExampleButtons(null);
  setExampleParam(null);
  const system = catalogue.promptText();
  let messages = [{ role: 'user', content: request }];
  let lastText = '', craft = null, result = null;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      $('status').textContent = attempt === 0 ? 'Contacting the provider…' : 'Validation failed. Asking the model to fix the plan…';
      lastText = await callProvider(system, messages);
      try { craft = parseCraftJSON(lastText); }
      catch (e) {
        if (attempt === 0) {
          messages = [...messages, { role: 'assistant', content: lastText }, { role: 'user', content: 'That was not usable JSON (' + e.message + '). Reply with only the JSON object, no markdown.' }];
          continue;
        }
        $('json').value = lastText;
        throw new Error(e.message + ' The raw reply is in the Craft JSON box.');
      }
      result = showCraft(craft);
      $('json').value = JSON.stringify(currentCraft, null, 2);
      if (planNeedsAnotherTry(result) && attempt === 0) {
        const lines = [
          ...result.errors.map(e => '- ' + e.message),
          ...result.warnings.map(w => '- ' + w.message)
        ].slice(0, 12);
        messages = [...messages, { role: 'assistant', content: lastText }, {
          role: 'user',
          content: 'The plan does not assemble cleanly:\n' + lines.join('\n') + '\nBuild the ship along +Y, nose to tail, not flat on the ground. Prefer "stack" for the spine and "attach" for solar panels, radiators, wings, and boosters. For a gravity ring use one spin hub (station09_spin_hub), one spoke (station10_spoke), and one ring segment (station11_ring_segment), plus "ring": {"hub":"<hub id>","spokes":6,"segments":12}. Do not stack spokes or ring segments. Return one JSON object only, using variant ids from the catalogue.'
        }];
        continue;
      }
      break;
    }
    $('status').textContent = result.errors.length
      ? 'The model replied, but the plan still has errors. See the list below.'
      : 'Assembled the model’s plan' + (result.warnings.length ? ' with warnings.' : '.');
  } catch (e) {
    $('status').textContent = '';
    const hint = settingsHint($('provider').value, $('key').value, $('base').value);
    const msg = e.message || String(e);
    setLlmError(hint ? hint + ' ' + msg : msg);
  } finally {
    setBusy(false);
  }
}

function refreshHints() {
  $('corsnote').textContent = browserNote($('provider').value);
  const hint = settingsHint($('provider').value, $('key').value, $('base').value);
  $('keyhint').hidden = !hint;
  $('keyhint').textContent = hint;
  if (hint) $('keys').open = true;
}

function loadSettings() {
  const sel = $('provider');
  sel.innerHTML = Object.entries(PRESETS).map(([id, p]) => `<option value="${id}">${esc(optionLabel(p))}</option>`).join('');
  let provider = DEFAULT_PROVIDER;
  try { provider = localStorage.getItem(LS.provider) || DEFAULT_PROVIDER; } catch { /* private mode */ }
  if (!PRESETS[provider]) provider = DEFAULT_PROVIDER;
  sel.value = provider;
  try {
    $('base').value = localStorage.getItem(LS.base) || PRESETS[provider].base;
    $('model').value = localStorage.getItem(LS.model) || PRESETS[provider].model;
    $('key').value = localStorage.getItem(LS.key) || '';
    $('proxy').value = localStorage.getItem(LS.proxy) || '';
  } catch {
    $('base').value = PRESETS[provider].base;
    $('model').value = PRESETS[provider].model;
  }
  refreshHints();
}

function saveSettings() {
  store(LS.provider, $('provider').value);
  store(LS.base, $('base').value.trim());
  store(LS.model, $('model').value.trim());
  store(LS.key, $('key').value);
  store(LS.proxy, $('proxy').value.trim());
  refreshHints();
}

$('provider').onchange = () => {
  const p = PRESETS[$('provider').value] || PRESETS.custom;
  $('base').value = p.base;
  $('model').value = p.model;
  saveSettings();
};
$('base').oninput = saveSettings;
$('model').oninput = saveSettings;
$('key').oninput = saveSettings;
$('proxy').oninput = saveSettings;
$('clearKey').onclick = () => {
  $('key').value = '';
  try { localStorage.removeItem(LS.key); } catch { /* ignore */ }
  refreshHints();
  setLlmError('');
  $('status').textContent = 'Saved key cleared from this browser.';
};
$('generate').onclick = () => generate();
$('prompt').onkeydown = e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); generate(); } };
$('assembleBtn').onclick = () => {
  setLlmError('');
  renderExampleButtons(null);
  setExampleParam(null);
  try {
    showCraft(parseCraftJSON($('json').value));
    $('status').textContent = 'Assembled the pasted JSON.';
  } catch (e) {
    $('status').textContent = '';
    setLlmError(e.message || String(e));
  }
};
$('exportBtn').onclick = () => {
  if (!currentCraft) { setLlmError('Nothing to export yet. Assemble an example or a plan first.'); return; }
  const blob = new Blob([JSON.stringify(currentCraft, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const slug = String(currentCraft.name || 'craft').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'craft';
  a.href = URL.createObjectURL(blob);
  a.download = slug + '.craft.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
};
$('importFile').onchange = async () => {
  const file = $('importFile').files && $('importFile').files[0];
  $('importFile').value = '';
  if (!file) return;
  try {
    const text = await file.text();
    $('json').value = text;
    renderExampleButtons(null);
    setExampleParam(null);
    showCraft(parseCraftJSON(text));
    $('status').textContent = 'Imported ' + file.name + '.';
    setLlmError('');
  } catch (e) {
    setLlmError(e.message || String(e));
  }
};
$('tNodes').onchange = () => markerGroups.forEach(m => { m.visible = $('tNodes').checked; });
$('tGrid').onchange = () => { if (grid) grid.visible = $('tGrid').checked; };
$('reset').onclick = e => { e.preventDefault(); if (homeView) { camera.position.copy(homeView.p); controls.target.copy(homeView.t); } };

async function init() {
  loadSettings();
  const manifest = await (await fetch('manifest.json')).json();
  catalogue = buildCatalogue(manifest);
  renderExampleButtons(null);
  const requested = new URLSearchParams(location.search).get('example');
  const ex = EXAMPLES.find(e => e.id === requested) || EXAMPLES[0];
  loadExample(ex.id);
}
init().catch(e => { $('msg').textContent = 'Could not load the catalogue: ' + (e.message || e); console.error(e); });
