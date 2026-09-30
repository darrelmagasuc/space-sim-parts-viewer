// Provider presets and request building for Vehicle Creation. No DOM, no three.js.
// Browser flags are from a real page fetch (fake key) on 2026-09-30:
// OpenRouter, Groq, xAI, and Anthropic returned a readable HTTP error.
// OpenAI's POST omits Access-Control-Allow-Origin, so the browser throws Failed to fetch.
// Anthropic only answers when anthropic-dangerous-direct-browser-access is set.

export const DEFAULT_PROVIDER = 'openrouter';

export const PRESETS = {
  openrouter: {
    label: 'OpenRouter',
    base: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
    kind: 'openai',
    browser: true
  },
  groq: {
    label: 'Groq',
    base: 'https://api.groq.com/openai/v1',
    // llama-3.3-70b-versatile shut down for developer keys on 2026-08-16.
    // openai/gpt-oss-120b is Groq's production replacement.
    model: 'openai/gpt-oss-120b',
    kind: 'openai',
    browser: true
  },
  xai: {
    label: 'xAI Grok',
    base: 'https://api.x.ai/v1',
    model: 'grok-3',
    kind: 'openai',
    browser: true
  },
  anthropic: {
    label: 'Anthropic',
    base: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-5',
    kind: 'anthropic',
    browser: true
  },
  openai: {
    label: 'OpenAI',
    base: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    kind: 'openai',
    browser: false
  },
  custom: {
    label: 'Custom OpenAI-compatible',
    base: 'https://api.openai.com/v1',
    model: '',
    kind: 'openai',
    browser: null
  }
};

export const LS = {
  provider: 'space-sim-vehicle-provider',
  base: 'space-sim-vehicle-base',
  model: 'space-sim-vehicle-model',
  key: 'space-sim-vehicle-key',
  proxy: 'space-sim-vehicle-proxy'
};

const KEY_SHAPES = [
  { id: 'groq', prefix: 'gsk_', label: 'Groq' },
  { id: 'xai', prefix: 'xai-', label: 'xAI Grok' },
  { id: 'anthropic', prefix: 'sk-ant-', label: 'Anthropic' },
  { id: 'openrouter', prefix: 'sk-or-', label: 'OpenRouter' }
];

export function preset(id) {
  return PRESETS[id] || PRESETS.custom;
}

export function optionLabel(p) {
  if (p.browser === true) return p.label + ' — works in the browser';
  if (p.browser === false) return p.label + ' — blocked in the browser';
  return p.label;
}

export function browserNote(providerId) {
  const p = preset(providerId);
  if (p.browser === false) {
    return p.label + ' blocks direct browser calls. Generate fails until you switch to OpenRouter or Groq, or set a CORS proxy URL.';
  }
  if (providerId === 'groq') {
    return 'Groq (api.groq.com) accepts requests from this page. It is not xAI Grok. The default model is openai/gpt-oss-120b. Leave the proxy blank unless a network filter blocks it.';
  }
  if (p.browser === true) {
    return p.label + ' accepts requests from this page. Leave the proxy blank unless a network filter blocks it.';
  }
  return 'A custom host may block browser calls. If Generate fails before any HTTP status, switch to OpenRouter or Groq, or set a CORS proxy URL.';
}

function recognizedKey(key) {
  const lower = key.toLowerCase();
  return KEY_SHAPES.find(shape => lower.startsWith(shape.prefix)) || null;
}

export function settingsHint(providerId, key, base) {
  const trimmed = String(key || '').trim();
  const p = preset(providerId);
  const parts = [];
  if (trimmed) {
    const found = recognizedKey(trimmed);
    const expected = KEY_SHAPES.find(shape => shape.id === providerId);
    if (expected) {
      if (found && found.id !== providerId) {
        parts.push('This key starts with ' + found.prefix + ', which belongs to ' + found.label + '. ' + p.label + ' keys start with ' + expected.prefix + '. Switch the provider to ' + found.label + '.');
      } else if (!found) {
        parts.push(p.label + ' keys start with ' + expected.prefix + '. This key does not match that prefix.');
      }
    } else if (found && found.id !== providerId) {
      parts.push('This key starts with ' + found.prefix + ', which belongs to ' + found.label + '. The selected provider is ' + p.label + '.');
    }
  }
  let host = '';
  try { host = new URL(String(base || '').trim()).hostname.toLowerCase(); }
  catch { /* an unfinished URL is not a hint */ }
  if (host === 'api.groq.com' && providerId !== 'groq') {
    parts.push('This base URL is Groq (api.groq.com), not xAI. Select the Groq preset.');
  } else if (host === 'api.x.ai' && providerId !== 'xai') {
    parts.push('This base URL is xAI (api.x.ai). Select the xAI Grok preset. Groq is a different provider (api.groq.com).');
  }
  return parts.join(' ');
}

export function describeFetchFailure(providerId, error, options) {
  const p = preset(providerId);
  const detail = (error && error.message) || String(error || 'Failed to fetch');
  const stayed = ' The key stayed in this browser.';
  const proxy = options && String(options.proxy || '').trim();
  if (proxy) {
    return 'Could not reach the CORS proxy for ' + p.label + ' (' + detail + '). Check the proxy URL and that tools/cors-proxy-worker.js is deployed.' + stayed;
  }
  if (p.browser === false) {
    return p.label + ' is known to block browsers, so this page cannot read the reply (' + detail + '). Switch to OpenRouter, which works directly, or paste a CORS proxy URL (see tools/cors-proxy-worker.js).' + stayed;
  }
  if (p.browser === true) {
    return 'Could not reach ' + p.label + ' (' + detail + '). This preset works directly from a browser, so the host may be down or a filter blocked it. Try OpenRouter, or set a CORS proxy URL.' + stayed;
  }
  return 'Could not reach ' + p.label + ' (' + detail + '). If this host blocks browsers, switch to OpenRouter or set a CORS proxy URL (tools/cors-proxy-worker.js).' + stayed;
}

export function chatUrl(base, kind) {
  const b = String(base || '').trim().replace(/\/+$/, '');
  if (kind === 'anthropic') return /\/messages$/.test(b) ? b : b + '/messages';
  return /\/chat\/completions$/.test(b) ? b : b + '/chat/completions';
}

function assertHttpUrl(value, label) {
  let url;
  try { url = new URL(value); }
  catch { throw new Error(label + ' is not a valid URL.'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(label + ' must start with http:// or https://.');
  return url;
}

export function buildProviderRequest(opts) {
  const providerId = opts.providerId;
  const p = preset(providerId);
  const kind = p.kind;
  const model = String(opts.model || '').trim();
  const apiKey = String(opts.key || '').trim();
  if (!apiKey) throw new Error('Add an API key first. It stays in this browser and is only sent to the endpoint you set.');
  if (!model) throw new Error('Enter a model name.');
  const target = assertHttpUrl(chatUrl(opts.base, kind), 'Base URL');
  const headers = { 'Content-Type': 'application/json' };
  let body;
  if (kind === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
    body = { model, max_tokens: 8192, temperature: 0.2, system: opts.system, messages: opts.messages };
  } else {
    headers.Authorization = 'Bearer ' + apiKey;
    if (target.hostname === 'openrouter.ai' || target.hostname.endsWith('.openrouter.ai')) {
      if (opts.pageUrl) headers['HTTP-Referer'] = opts.pageUrl;
      headers['X-Title'] = 'Space Sim Vehicle Creation';
    }
    body = {
      model,
      temperature: 0.2,
      max_tokens: 8192,
      messages: [{ role: 'system', content: opts.system }, ...(opts.messages || [])]
    };
  }
  let url = target.href;
  const proxy = String(opts.proxy || '').trim();
  if (proxy) {
    url = assertHttpUrl(proxy, 'CORS proxy URL').href;
    headers['X-Target-URL'] = target.href;
  }
  return { url, headers, body, kind };
}
