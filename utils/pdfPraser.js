const fs = require('fs');
const pdfParse = require('pdf-parse');
// Try to load pdfjs from multiple known paths (version-dependent)
let pdfjsLib = null;
try { pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js'); }
catch (e1) {
  try { pdfjsLib = require('pdfjs-dist/build/pdf.js'); }
  catch (e2) { pdfjsLib = null; }
}
const { createCanvas } = require('canvas');
const ocr = require('./ocr');

function joinItemsAsLines(items, xGap = 4, yTol = 3) {
  // Group by y (line), then insert spaces for x gaps to keep columns readable.
  const lines = [];
  const sorted = items
    .map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5] }))
    .sort((a, b) => (b.y - a.y) || (a.x - b.x));
  let curY = null, cur = [];
  for (const it of sorted) {
    if (curY === null || Math.abs(it.y - curY) <= yTol) {
      cur.push(it);
      curY = curY ?? it.y;
    } else {
      lines.push(cur.sort((a, b) => a.x - b.x));
      cur = [it];
      curY = it.y;
    }
  }
  if (cur.length) lines.push(cur.sort((a, b) => a.x - b.x));

  return lines.map(line => {
    let s = '';
    for (let i = 0; i < line.length; i++) {
      s += line[i].str;
      if (i < line.length - 1) {
        const gap = line[i + 1].x - line[i].x;
        if (gap > xGap) s += ' ';
      }
    }
    return s.trim();
  }).join('\n');
}

async function renderPageAsPNGBuffer(page, scale = 2.0) {
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.max(1, viewport.width), Math.max(1, viewport.height));
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toBuffer('image/png');
}

async function parseWithPdfParse(pdfBuffer) {
  // Use custom pagerender to preserve layout
  const options = {
    pagerender: async (pageData) => {
      const textContent = await pageData.getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: false
      });
      return joinItemsAsLines(textContent.items);
    }
  };
  const data = await pdfParse(pdfBuffer, options);
  const cleaned = data.text
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text: cleaned, numpages: data.numpages };
}

async function parsePDFBuffer(pdfBuffer) {
  try {
    console.log('📄 PDF parsing with layout preservation…');
    const { text, numpages } = await parseWithPdfParse(pdfBuffer);
    console.log(`✅ PDF text extracted. Pages=${numpages}, Length=${text.length}`);

    // If almost no text, likely a scanned PDF → OCR fallback
    if (!text || text.length < 40) {
      if (!pdfjsLib || typeof pdfjsLib.getDocument !== 'function') {
        console.warn('⚠️ pdfjs-dist not available; skipping OCR fallback.');
        return text || '';
      }
      console.warn('⚠️ Low text from PDF; falling back to OCR per page…');
      const doc = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
      let all = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const png = await renderPageAsPNGBuffer(page, 2.5); // higher DPI for OCR
        const t = await ocr.extractTextFromImageBuffer(png);
        all.push(t);
      }
      const merged = all.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
      console.log(`🧾 OCR fallback text length: ${merged.length}`);
      return merged;
    }

    try { console.log('🧾 PDF text sample:', text.slice(0, 400)); } catch {}
    return text;
  } catch (err) {
    console.error('❌ PDF parsing error:', err.message);
    throw new Error(`PDF parsing failed: ${err.message}`);
  }
}

async function parsePDF(pdfPath) {
  const fs = require('fs');
  if (!fs.existsSync(pdfPath)) throw new Error(`PDF file not found: ${pdfPath}`);
  const buf = fs.readFileSync(pdfPath);
  return parsePDFBuffer(buf);
}

module.exports = parsePDF;
module.exports.parsePDFBuffer = parsePDFBuffer;