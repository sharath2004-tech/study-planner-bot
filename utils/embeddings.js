const OpenAI = require('openai');

let client = null;
function getClient() {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    client = new OpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL || undefined });
  }
  return client;
}

async function embedText(text) {
  const c = getClient();
  if (!c) throw new Error('OPENAI_API_KEY not set');
  const model = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';
  const res = await c.embeddings.create({ model, input: text });
  const vec = res.data?.[0]?.embedding || [];
  return vec;
}

async function embedMany(texts) {
  const c = getClient();
  if (!c) throw new Error('OPENAI_API_KEY not set');
  const model = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';
  const res = await c.embeddings.create({ model, input: texts });
  return res.data.map(d => d.embedding || []);
}

function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb) || 1;
  return dot / denom;
}

module.exports = { embedText, embedMany, cosineSim };
