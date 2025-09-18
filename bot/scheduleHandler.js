const parsePDF = require("../utils/pdfPraser");
const ocr = require("../utils/ocr");
const extractSchedule = require("../utils/exractSchedule");
const db = require("../config/firebase");

async function handleSchedule(from, phone, fileType, buffer, sock) {
  let extractedText = "";

  if (fileType === "pdf") {
    // Parse PDF directly from buffer to avoid local file writes
    if (parsePDF && typeof parsePDF.parsePDFBuffer === 'function') {
      extractedText = await parsePDF.parsePDFBuffer(buffer);
    } else {
      // Fallback to legacy function by writing transiently (should not happen in current utils)
      // Note: legacy function expects a path; avoid when possible
      throw new Error('PDF buffer parser unavailable');
    }
  } else if (fileType === "image") {
    // Use OCR directly on the image buffer to avoid local file writes
    if (ocr && typeof ocr.extractTextFromImageBuffer === 'function') {
      extractedText = await ocr.extractTextFromImageBuffer(buffer);
    } else {
      throw new Error('Image buffer OCR unavailable');
    }
  }

  let schedule = await extractSchedule(extractedText);

  if (schedule.length > 0) {
    await db.collection("users").doc(phone).set({ schedule }, { merge: true });

    let reply = "📅 Your schedule has been saved:\n";
    schedule.forEach((s) => (reply += `- ${s.subject} at ${s.time}\n`));

    await sock.sendMessage(from, { text: reply });
  } else {
    await sock.sendMessage(from, { text: "⚠️ Could not detect schedule." });
  }
}

module.exports = handleSchedule;
