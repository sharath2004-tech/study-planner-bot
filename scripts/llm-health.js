require('dotenv').config({ override: true });
// Normalize base URL so empty string truly disables provider override
if (typeof process.env.OPENAI_BASE_URL === 'string' && !process.env.OPENAI_BASE_URL.trim()) {
  delete process.env.OPENAI_BASE_URL;
}
// Override quota/rate-limited key with a test-only env var if specified
if (process.env.OPENAI_TEST_API_KEY) {
  process.env.OPENAI_API_KEY = process.env.OPENAI_TEST_API_KEY;
  console.log('📝 Using OPENAI_TEST_API_KEY for health check');
}
const { chatComplete } = require('../bot/llm');

(async () => {
  const provider = process.env.OPENAI_BASE_URL ? 'OpenRouter-compatible' : 'OpenAI';
  const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const key = process.env.OPENAI_API_KEY || '';

  console.log('🔎 LLM health check');
  console.log(`• Provider: ${provider}`);
  console.log(`• Base URL: ${baseURL}`);
  console.log(`• Model: ${model}`);
  console.log(`• Key present: ${key ? 'yes' : 'no'}`);

  if (!key) {
    console.error('❌ No OPENAI_API_KEY provided. Set your key in .env and re-run.');
    process.exit(1);
  }

  try {
    const answer = await chatComplete('Say "ok" if you can read this.', [], '');
    if (answer && /ok/i.test(answer)) {
      console.log('✅ LLM responded:', answer);
      process.exit(0);
    } else if (answer) {
      console.log('🟨 LLM responded (unexpected text):', answer);
      process.exit(0);
    } else {
      console.error('❌ LLM returned empty response. Check your key, base URL, and model.');
      console.error('   - If using OpenRouter, set OPENAI_BASE_URL=https://openrouter.ai/api/v1');
      console.error('   - Ensure model ID matches the provider (e.g., openai/gpt-4o-mini for OpenRouter)');
      process.exit(2);
    }
  } catch (e) {
    console.error('❌ LLM call threw an error:', e?.message || e);
    process.exit(3);
  }
})();
