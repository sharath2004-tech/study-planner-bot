const path = require('path');
const fs = require('fs');
const xml2js = require('xml2js');

let categories = [];

function loadAiml() {
  try {
    const aimlDir = path.join(__dirname, '..', 'aiml');
    if (!fs.existsSync(aimlDir)) {
      console.warn('ℹ️ AIML directory not found:', aimlDir);
      return;
    }
    const files = fs.readdirSync(aimlDir).filter(f => f.toLowerCase().endsWith('.aiml'));
    const parser = new xml2js.Parser();
    for (const f of files) {
      const raw = fs.readFileSync(path.join(aimlDir, f), 'utf8');
      parser.parseString(raw, (err, res) => {
        if (err || !res) return;
        const cats = res.aiml?.category || [];
        cats.forEach(cat => {
          const pattern = (cat.pattern && cat.pattern[0] || '*').toString().trim().toUpperCase();
          const templateNode = cat.template && cat.template[0];
          const template = extractTemplate(templateNode);
          categories.push({ pattern, template });
        });
      });
    }
    console.log(`🧠 AIML loaded: ${categories.length} categories`);
  } catch (e) {
    console.warn('⚠️ Failed to load AIML:', e.message);
  }
}

function extractTemplate(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(extractTemplate).join(' ');
  // xml2js gives an object for mixed content; simplify by joining text nodes and placeholders
  let out = '';
  for (const key of Object.keys(node)) {
    if (key === '_') out += node._;
    else if (key === 'star') out += '<star/>';
    else if (key === 'now') out += '<now/>';
    else if (Array.isArray(node[key])) out += node[key].map(extractTemplate).join(' ');
  }
  return (out || '').trim();
}

function patternToRegex(pattern) {
  // Very simple: convert * to (.*) and anchor
  const esc = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = '^' + esc.replace(/\\\*/g, '(.*)') + '$';
  return new RegExp(rx, 'i');
}

function substitute(template, star) {
  if (!template) return '';
  let out = template.replace(/<star\/>/gi, star || '');
  out = out.replace(/<now\/>/gi, new Date().toLocaleString());
  return out;
}

async function getReply(input) {
  if (!input || !categories.length) return '';
  const normalized = input.trim();
  const upper = normalized.toUpperCase();
  // Try exact and wildcard patterns in order of definition
  for (const { pattern, template } of categories) {
    const rx = patternToRegex(pattern);
    const m = upper.match(rx);
    if (m) {
      const star = m[1] ? normalized.match(patternToRegex(pattern))[1] : '';
      return substitute(template, star);
    }
  }
  return '';
}

loadAiml();

module.exports = { getReply };
