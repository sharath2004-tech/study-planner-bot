/* Generate docs/models-overview.pdf summarizing LLM + RAG models in use. */
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const PDFDocument = require('pdfkit');

function envBool(name, def = false) {
  const v = process.env[name];
  if (v == null) return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

function providerFromBaseUrl(base) {
  if (!base) return 'OpenAI (api.openai.com)';
  if (/openrouter\.ai/.test(base)) return 'OpenRouter';
  return base;
}

function titleCase(s) {
  return s ? s.replace(/\b\w/g, c => c.toUpperCase()) : s;
}

function makePdf(outFile) {
  const now = new Date();
  const doc = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 48, left: 54, right: 54 } });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  doc.pipe(fs.createWriteStream(outFile));

  // Env values
  const baseUrl = process.env.OPENAI_BASE_URL || '';
  const provider = providerFromBaseUrl(baseUrl);
  const chatModel = process.env.OPENAI_MODEL || '(not set)';
  const embedModel = process.env.OPENAI_EMBED_MODEL || '(not set)';
  const useLLM = envBool('USE_LLM', true);
  const alwaysLLM = envBool('ALWAYS_USE_LLM', true);
  const useRAG = envBool('USE_RAG', true);
  const selfBot = envBool('SELF_BOT', false);
  const freeChat = envBool('SELF_BOT_FREE_CHAT', false);

  const isNemotron = /^nvidia\/nemotron/i.test(chatModel);
  const nemotronNote = isNemotron
    ? 'You have selected NVIDIA Nemotron (final choice noted: nvidia/nemotron-nano-9b-v2:free).'
    : 'Chat model is not NVIDIA Nemotron.';

  // Styles
  const H1 = 20, H2 = 14, P = 11;
  const sep = () => doc.moveDown(0.6);

  // Header
  doc.fontSize(H1).text('Study Planner Bot — Models Overview', { align: 'left' });
  doc.moveDown(0.2);
  doc.fontSize(P).fillColor('#666')
     .text(`Generated: ${now.toLocaleString()}`, { align: 'left' })
     .fillColor('#000');
  doc.moveDown();

  // Summary
  doc.fontSize(H2).text('Summary');
  sep();
  doc.fontSize(P).list([
    `Provider: ${provider}`,
    `Chat model: ${chatModel}`,
    `Embeddings model: ${embedModel}`,
    `RAG enabled: ${useRAG}`,
    `LLM enabled: ${useLLM} (always: ${alwaysLLM})`,
    `Self-chat mode: ${selfBot} (free-chat: ${freeChat})`,
  ]);
  doc.moveDown();

  // Chat LLM section
  doc.fontSize(H2).text('Chat LLM (answers to user)');
  sep();
  doc.fontSize(P)
     .text('The bot uses the Chat model to generate replies. It builds a prompt with:')
     .list([
       'A system prompt defining behavior (study planning assistant).',
       'Optional retrieved context from your knowledge base (RAG).',
       'The latest user message (and sometimes brief history).',
     ])
     .moveDown()
     .text(`Current chat model: ${chatModel}`)
     .moveDown()
     .text(nemotronNote);
  doc.moveDown();

  // Embeddings section
  doc.fontSize(H2).text('Embeddings (for RAG)');
  sep();
  doc.fontSize(P)
     .text('The embeddings model converts notes and queries into vectors to find relevant notes.')
     .moveDown()
     .text(`Current embeddings model: ${embedModel}`)
     .moveDown()
     .list([
       'Notes you add (e.g., via "kb add ...") are embedded and stored.',
       'At question time, the query is embedded and top matches are retrieved by cosine similarity.',
       'Those snippets are provided to the Chat LLM as context.',
     ]);
  doc.moveDown();

  // Flow
  doc.fontSize(H2).text('How an answer is produced');
  sep();
  doc.fontSize(P).list([
    'Receive message from WhatsApp.',
    useRAG ? 'Retrieve top notes via embeddings.' : 'RAG disabled: skip retrieval.',
    'Call Chat LLM with system prompt + (optional) retrieved context + user question.',
    'If LLM fails (auth/quota), send RAG-only fallback (if available) or a friendly error.',
  ]);
  doc.moveDown();

  // Tips
  doc.fontSize(H2).text('Tips and alternatives');
  sep();
  doc.fontSize(P).list([
    'Quality: openai/gpt-4o-mini via OpenRouter or OpenAI direct gives stronger reasoning than small free models.',
    'Access: some models (e.g., gpt‑5) require allow‑list; use public models if you see 403/404.',
    'Provider: set OPENAI_BASE_URL=https://openrouter.ai/api/v1 for OpenRouter, or leave it empty for OpenAI direct.',
    'Embeddings: openai/text-embedding-3-small is a solid default for RAG.',
  ]);

  // Footer
  doc.moveDown();
  doc.fontSize(P).fillColor('#666')
     .text('Note: API keys are not printed in this PDF for security.', { align: 'left' });

  doc.end();
  return outFile;
}

const out = path.resolve(__dirname, '..', 'docs', 'models-overview.pdf');
const file = makePdf(out);
console.log('✅ Wrote PDF:', file);