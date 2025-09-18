// Migrate users from local mock DB (data/mock-db.json) into Firestore
// Usage: ensure Firebase credentials are configured, then run:
//   node scripts/migrate-mock-to-firestore.js

const path = require('path');
const fs = require('fs');

(async () => {
  const db = require('../config/firebase');
  if (db._isMock) {
    console.error('Firebase not configured. Configure credentials first; migration requires real Firestore.');
    process.exit(1);
  }

  const mockPath = path.join(__dirname, '..', 'data', 'mock-db.json');
  if (!fs.existsSync(mockPath)) {
    console.log('No mock DB found at', mockPath, '- nothing to migrate.');
    process.exit(0);
  }

  const store = JSON.parse(fs.readFileSync(mockPath, 'utf8'));
  const users = store.users || {};
  const ids = Object.keys(users);
  if (ids.length === 0) {
    console.log('No users in mock DB - nothing to migrate.');
    process.exit(0);
  }

  console.log(`Migrating ${ids.length} users to Firestore...`);
  let migrated = 0;
  for (const id of ids) {
    const data = users[id];
    await db.collection('users').doc(id).set(data, { merge: true });
    migrated++;
  }
  console.log(`Migration complete: ${migrated} users migrated.`);
})();
