// Quick Firestore read/write health check
const db = require('../config/firebase');

(async () => {
  try {
    const col = db.collection('system');
    const doc = col.doc('health');
    const now = new Date().toISOString();
    await doc.set({ lastCheck: now }, { merge: true });
    const snap = await doc.get();
    if (!snap.exists) throw new Error('Health doc not found after write');
    const data = snap.data();
    console.log('✅ Firestore health OK:', data);
    process.exit(0);
  } catch (e) {
    console.error('❌ Firestore health FAILED:', e.message);
    if (db && db._isMock) console.error('Running with mock DB — set REQUIRE_FIREBASE=true and provide credentials.');
    process.exit(1);
  }
})();
