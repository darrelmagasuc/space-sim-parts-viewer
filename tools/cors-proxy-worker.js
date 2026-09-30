/**
 * Cloudflare Worker: browser CORS proxy for Vehicle Creation.
 *
 * The page POSTs to this worker and puts the real provider URL in X-Target-URL.
 * Only the hosts below are forwarded. The API key is copied onto the upstream
 * request and is not logged.
 *
 * Deploy:
 *   1. Cloudflare dashboard → Workers → Create → paste this file as the module.
 *   2. On vehicle.html, open "API key" and set CORS proxy URL to
 *      https://<worker>.<account>.workers.dev
 *
 * Use it for providers that omit Access-Control-Allow-Origin (OpenAI does).
 * OpenRouter, Groq, xAI, and Anthropic answer the browser directly, so leave
 * the proxy blank for those.
 */

const ALLOWED_HOSTS = new Set([
  'api.openai.com',
  'api.groq.com',
  'api.x.ai',
  'openrouter.ai',
  'api.anthropic.com'
]);

const FORWARD_HEADERS = [
  'authorization',
  'content-type',
  'x-api-key',
  'anthropic-version',
  'anthropic-dangerous-direct-browser-access',
  'http-referer',
  'x-title'
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access, http-referer, x-title, x-target-url',
  'Access-Control-Max-Age': '86400'
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'POST') return new Response('POST only', { status: 405, headers: CORS });
    let dest;
    try { dest = new URL(request.headers.get('X-Target-URL') || ''); }
    catch { return new Response('X-Target-URL must be an absolute https URL', { status: 400, headers: CORS }); }
    if (dest.protocol !== 'https:' || !ALLOWED_HOSTS.has(dest.hostname)) {
      return new Response('Host is not on the proxy allow list', { status: 403, headers: CORS });
    }
    const headers = new Headers();
    for (const name of FORWARD_HEADERS) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const upstream = await fetch(dest.href, { method: 'POST', headers, body: request.body });
    const out = new Headers(CORS);
    const type = upstream.headers.get('content-type');
    if (type) out.set('Content-Type', type);
    return new Response(upstream.body, { status: upstream.status, headers: out });
  }
};
