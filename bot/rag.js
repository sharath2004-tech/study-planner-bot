const db = require('../config/firebase');
const { embedText, cosineSim } = require('../utils/embeddings');

const USE_RAG = (process.env.USE_RAG || '').toLowerCase() === 'true';

function assertRealFirestore() {
  if (db && db._isMock) {
    throw new Error('RAG requires real Firestore. Set REQUIRE_FIREBASE=true and provide Firebase credentials.');
  }
}

async function addNote(phone, text) {
  assertRealFirestore();
  if (!USE_RAG) throw new Error('RAG disabled. Set USE_RAG=true');
  let embedding = [];
  try { embedding = await embedText(text); } catch (e) {
    if (process.env.DEBUG_RAG?.toLowerCase() === 'true') {
      console.warn('⚠️ RAG embed failed in addNote:', e.message || e.toString());
    }
    // store empty embedding but keep text
  }
  const id = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const col = db.collection('users').doc(phone).collection('kb');
  await col.doc(id).set({ id, text, embedding, createdAt: new Date().toISOString() });
  return { id };
}

async function clearKB(phone) {
  assertRealFirestore();
  if (!USE_RAG) throw new Error('RAG disabled. Set USE_RAG=true');
  const col = db.collection('users').doc(phone).collection('kb');
  const snap = await col.get();
  const batchOps = [];
  if (snap.forEach) {
    const batch = db.batch ? db.batch() : null;
    if (batch) {
      snap.forEach(doc => batch.delete(col.doc(doc.id)));
      await batch.commit();
    } else {
      snap.forEach(async doc => { await col.doc(doc.id).delete(); });
    }
  }
  return true;
}

async function retrieveContext(phone, query, k = 3, maxChars = 1200) {
  assertRealFirestore();
  if (!USE_RAG) return '';
  const col = db.collection('users').doc(phone).collection('kb');
  const snap = await col.get();
  const items = [];
  if (snap.forEach) {
    snap.forEach(doc => {
      const d = doc.data();
      if (d && Array.isArray(d.embedding) && typeof d.text === 'string') {
        items.push(d);
      }
    });
  }
  if (!items.length) return '';
  let qVec = [];
  try { qVec = await embedText(query); } catch (e) {
    if (process.env.DEBUG_RAG?.toLowerCase() === 'true') {
      console.warn('⚠️ RAG embed failed in retrieveContext:', e.message || e.toString());
    }
    return '';
  }
  items.forEach(it => it._score = cosineSim(qVec, it.embedding));
  items.sort((a,b) => b._score - a._score);
  const top = items.slice(0, k);
  let context = '';
  for (const t of top) {
    if ((context + t.text + '\n').length > maxChars) break;
    context += `- ${t.text}\n`;
  }
  if (!context) return '';
  return `Relevant notes:\n${context}`;
}

module.exports = { addNote, clearKB, retrieveContext };
