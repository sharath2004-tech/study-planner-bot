const OpenAI = require('openai');

function makeClient({ apiKey, baseURL }) {
  if (!apiKey) return null;
  // Allow forcing OpenAI direct by ignoring OpenRouter base URL
  if (process.env.DISABLE_OPENROUTER === 'true' && baseURL && /openrouter/i.test(baseURL)) {
    baseURL = undefined;
  }
  const isOpenRouter = !!baseURL && /openrouter/i.test(baseURL);
  const opts = {
    apiKey,
    baseURL: baseURL || undefined,
  };
  if (isOpenRouter) {
    opts.defaultHeaders = {
      'HTTP-Referer': process.env.OPENROUTER_REFERRER || 'http://localhost:5000',
      'X-Title': process.env.OPENROUTER_TITLE || 'Study Planner Bot',
    };
  }
  return new OpenAI(opts);
}

// Primary provider (e.g., OpenRouter or OpenAI based on env)
const primaryClient = makeClient({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || undefined,
});

// Optional fallback provider (e.g., direct OpenAI) used when primary fails with auth/quota errors
const fallbackClient = makeClient({
  apiKey: process.env.OPENAI_FALLBACK_API_KEY,
  baseURL: process.env.OPENAI_FALLBACK_BASE_URL || undefined,
});

function nowStr() {
  try { return new Date().toLocaleString(); } catch { return new Date().toISOString(); }
}

async function chatComplete(userText, history = [], ragContext = '') {
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const system = process.env.OPENAI_SYSTEM_PROMPT ||
    `You are Study Planner Bot. Be concise and helpful. Current datetime: ${nowStr()}.` +
    (ragContext ? ` Use this user context if relevant:\n${ragContext}` : '');

  const messages = [
    { role: 'system', content: system },
    ...history,
    { role: 'user', content: userText }
  ];

  const tryOnce = async (c, modelId) => {
    const r = await c.chat.completions.create({ model: modelId, messages, temperature: 0.3 });
    return r.choices?.[0]?.message?.content?.trim() || '';
  };

  // Try primary
  if (primaryClient) {
    try {
      const out = await tryOnce(primaryClient, model);
      if (out) return out;
    } catch (e) {
      const msg = (e && (e.message || e.toString())) || 'unknown error';
      const status = e?.status || e?.response?.status;
      const providerMsg = e?.response?.data?.error?.message || e?.error?.message;
      const detail = [msg, status ? `(status ${status})` : '', providerMsg ? `- ${providerMsg}` : '']
        .filter(Boolean)
        .join(' ');
      if (process.env.DEBUG_LLM?.toLowerCase() === 'true') {
        console.warn('⚠️ LLM primary failed:', detail);
      }
      // If the model is unavailable/not found, try an alternate model on the same provider
      const modelUnavailable = Number(status) === 404 || /model/i.test(String(providerMsg)) && /not|unavailable|unknown/i.test(String(providerMsg));
      const altModel = process.env.OPENAI_MODEL_FALLBACK || 'openai/gpt-4o-mini';
      if (modelUnavailable && altModel && altModel !== model) {
        try {
          if (process.env.DEBUG_LLM?.toLowerCase() === 'true') {
            console.warn(`↩️  Retrying on primary with fallback model: ${altModel}`);
          }
          const out2 = await tryOnce(primaryClient, altModel);
          if (out2) return out2;
        } catch (e2) {
          if (process.env.DEBUG_LLM?.toLowerCase() === 'true') {
            const status2 = e2?.status || e2?.response?.status;
            const msg2 = e2?.response?.data?.error?.message || e2?.message;
            console.warn('⚠️ Fallback model on primary also failed:', status2 || '', msg2 || '');
          }
        }
      }
      // Only consider falling back for auth/permission/quota/rate issues
      const shouldFallback = [401, 402, 403, 404, 429].includes(Number(status));
      if (!shouldFallback && !fallbackClient) return '';
    }
  }

  // Try fallback if configured
  if (fallbackClient) {
    try {
      const fallbackModel = process.env.OPENAI_FALLBACK_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
      const out = await tryOnce(fallbackClient, fallbackModel);
      if (out) return out;
    } catch (e) {
      const msg = (e && (e.message || e.toString())) || 'unknown error';
      const status = e?.status || e?.response?.status;
      const providerMsg = e?.response?.data?.error?.message || e?.error?.message;
      const detail = [msg, status ? `(status ${status})` : '', providerMsg ? `- ${providerMsg}` : '']
        .filter(Boolean)
        .join(' ');
      if (process.env.DEBUG_LLM?.toLowerCase() === 'true') {
        console.warn('⚠️ LLM fallback failed:', detail);
      }
    }
  }

  // Gracefully degrade
  return '';
}

module.exports = { chatComplete };
