const sharp = require('sharp');
const Tesseract = require('tesseract.js');

const OCR_LANGS = process.env.OCR_LANGS || 'eng';
const OCR_PSM = parseInt(process.env.OCR_PSM || '6', 10);
const OCR_OEM = parseInt(process.env.OCR_OEM || '3', 10);
const OCR_DPI = parseInt(process.env.OCR_DPI || '300', 10);
const OCR_DEBUG = (process.env.OCR_DEBUG || 'false').toLowerCase() === 'true';

/**
 * Auto-rotate, upscale for higher DPI, denoise, sharpen, normalize, threshold
 * @param {Buffer} buffer - Image buffer data
 * @returns {Promise<Buffer>} - Processed image buffer
 */
async function preprocess(buffer) {
  // sharp v0.34+ expects failOn: 'none' | 'truncated' | 'error' | 'warning'
  let img = sharp(buffer, { failOn: 'none' }).rotate();

  const meta = await img.metadata();
  const minW = 1800; // target width for small images
  if ((meta.width || 0) < minW) {
    const scale = minW / Math.max(1, meta.width || 1);
    img = img.resize(Math.round((meta.width || 0) * scale), null, { withoutEnlargement: false });
  }

  img = img
    .grayscale()
    .normalize()
    .median(1)      // light denoise
    .sharpen(1.2)
    .threshold(180, { grayscale: true }); // binarize to help timings/grids

  const out = await img.png().toBuffer();
  if (OCR_DEBUG) console.log('🖼️ OCR preprocess size:', out.length);
  return out;
}

/**
 * Extract text from image buffer
 * @param {Buffer} imageBuffer - Image buffer data
 * @returns {Promise<string>} - Extracted text from the image
 */
async function extractTextFromImageBuffer(imageBuffer) {
  let pre = imageBuffer;
  try {
    pre = await preprocess(imageBuffer);
  } catch (e) {
    if (OCR_DEBUG) console.log('⚠️ OCR preprocess failed, using raw buffer:', e.message);
  }
  const options = {
    lang: OCR_LANGS,
    tessedit_pageseg_mode: OCR_PSM,
    tessedit_ocr_engine_mode: OCR_OEM,
    user_defined_dpi: OCR_DPI
  };

  const { data } = await Tesseract.recognize(pre, OCR_LANGS, {
    // Always provide a function; gate actual logging with OCR_DEBUG to avoid TypeError
    logger: (m) => { if (OCR_DEBUG) console.log('📖 OCR', m); }
  });

  // Clean text
  const text = (data.text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (OCR_DEBUG) console.log('🧾 OCR text sample:', text.slice(0, 300));
  return text;
}

module.exports = { extractTextFromImageBuffer };