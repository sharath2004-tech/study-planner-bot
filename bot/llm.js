const OpenAI = require('openai');
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || undefined,
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

  try {
    const r = await client.chat.completions.create({ model, messages, temperature: 0.3 });
    return r.choices?.[0]?.message?.content?.trim() || '';
  } catch (e) {
    // Gracefully degrade on quota/network/errors
    const msg = (e && (e.message || e.toString())) || 'unknown error';
    if (process.env.DEBUG_LLM?.toLowerCase() === 'true') {
      console.warn('⚠️ OpenAI chatComplete failed:', msg);
    }
    return '';
  }
}

module.exports = { chatComplete };
