import {
  DEFAULT_PROVIDER, PRESETS, optionLabel, browserNote, settingsHint,
  describeFetchFailure, buildProviderRequest
} from '../providers.js';

let failed = 0;
function assert(cond, msg) {
  if (!cond) { failed++; console.error('FAIL', msg); }
  else console.log('ok', msg);
}

assert(DEFAULT_PROVIDER === 'openrouter', 'default provider is OpenRouter');
assert(PRESETS.groq.base === 'https://api.groq.com/openai/v1', 'Groq base URL');
assert(PRESETS.groq.model === 'openai/gpt-oss-120b', 'Groq default model is the production replacement');
assert(PRESETS.groq.label === 'Groq' && PRESETS.xai.label === 'xAI Grok', 'Groq and xAI labels are distinct');
assert(optionLabel(PRESETS.groq).includes('works in the browser'), 'Groq marked browser-direct');
assert(optionLabel(PRESETS.xai).includes('xAI Grok'), 'xAI option says xAI Grok');
assert(optionLabel(PRESETS.openai).includes('blocked'), 'OpenAI marked blocked');
assert(PRESETS.openrouter.browser && PRESETS.xai.browser && PRESETS.anthropic.browser, 'direct presets flagged');
assert(browserNote('openai').includes('blocks direct browser calls'), 'OpenAI note');
assert(browserNote('groq').includes('not xAI'), 'Groq note distinguishes xAI');

const page = 'https://darrelmagasuc.github.io/space-sim-parts-viewer/vehicle.html';
const groq = buildProviderRequest({
  providerId: 'groq', base: PRESETS.groq.base, model: PRESETS.groq.model,
  key: 'gsk_test', pageUrl: page, system: 'sys', messages: [{ role: 'user', content: 'hi' }]
});
assert(groq.url === 'https://api.groq.com/openai/v1/chat/completions', 'Groq chat URL');
assert(groq.headers.Authorization === 'Bearer gsk_test', 'Groq bearer');
assert(!groq.headers['HTTP-Referer'] && !groq.headers['X-Title'] && !groq.headers['X-Target-URL'], 'Groq sends no extra preflight headers');

const router = buildProviderRequest({
  providerId: 'openrouter', base: PRESETS.openrouter.base, model: 'openai/gpt-4o-mini',
  key: 'sk-or-test', pageUrl: page, system: 'sys', messages: []
});
assert(router.headers['HTTP-Referer'] === page && router.headers['X-Title'] === 'Space Sim Vehicle Creation', 'OpenRouter attribution headers');

const anth = buildProviderRequest({
  providerId: 'anthropic', base: PRESETS.anthropic.base, model: 'claude-sonnet-4-5',
  key: 'sk-ant-test', system: 'sys', messages: [{ role: 'user', content: 'hi' }]
});
assert(anth.url.endsWith('/messages'), 'Anthropic messages URL');
assert(anth.headers['anthropic-dangerous-direct-browser-access'] === 'true', 'Anthropic browser header');
assert(anth.headers['anthropic-version'] === '2023-06-01' && anth.headers['x-api-key'] === 'sk-ant-test', 'Anthropic auth headers');
assert(!anth.headers.Authorization, 'Anthropic does not send Authorization');

const via = buildProviderRequest({
  providerId: 'openai', base: PRESETS.openai.base, model: 'gpt-4o-mini',
  key: 'sk-test', proxy: 'https://proxy.example.workers.dev/', system: 'sys', messages: []
});
assert(via.url === 'https://proxy.example.workers.dev/', 'proxy URL is the fetch target');
assert(via.headers['X-Target-URL'] === 'https://api.openai.com/v1/chat/completions', 'proxy receives the provider URL');

const openaiErr = describeFetchFailure('openai', new TypeError('Failed to fetch'));
assert(openaiErr.includes('OpenAI') && openaiErr.includes('block browsers') && openaiErr.includes('OpenRouter') && openaiErr.includes('proxy'), 'OpenAI error is actionable');
const groqErr = describeFetchFailure('groq', new TypeError('Failed to fetch'));
assert(groqErr.includes('Groq') && groqErr.includes('works directly'), 'Groq error says it normally works');
const proxyErr = describeFetchFailure('openai', new TypeError('Failed to fetch'), { proxy: 'https://proxy.example/' });
assert(proxyErr.includes('CORS proxy') && !proxyErr.includes('known to block'), 'proxy failure names the proxy');

assert(settingsHint('xai', 'gsk_live_key', PRESETS.xai.base).includes('Groq'), 'gsk_ key on xAI hints Groq');
assert(settingsHint('groq', 'xai-live', PRESETS.groq.base).includes('xAI Grok'), 'xai- key on Groq hints xAI');
assert(settingsHint('groq', 'gsk_ok', PRESETS.groq.base) === '', 'matching Groq key is quiet');
assert(settingsHint('xai', 'xai-ok', PRESETS.xai.base) === '', 'matching xAI key is quiet');
assert(settingsHint('xai', 'gsk_ok', 'https://api.groq.com/openai/v1').includes('api.groq.com'), 'Groq base URL on xAI is called out');
assert(settingsHint('openai', 'gsk_ok', PRESETS.openai.base).includes('Groq'), 'gsk_ key on OpenAI hints Groq');
assert(settingsHint('custom', '', 'https://api.x.ai/v1').includes('xAI Grok'), 'xAI base on custom hints');

let threw = false;
try { buildProviderRequest({ providerId: 'groq', base: 'ftp://api.groq.com', model: 'm', key: 'gsk_x', system: '', messages: [] }); }
catch (e) { threw = /http/.test(e.message); }
assert(threw, 'non-http base URL is rejected');

if (failed) { console.error(failed + ' failed'); process.exit(1); }
console.log('all passed');
