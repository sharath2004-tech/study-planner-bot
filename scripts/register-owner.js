// Register the connected WhatsApp number (from system/botInfo) as a user in Firestore
// Usage: node scripts/register-owner.js
try { require('dotenv').config(); } catch (_) {}
const db = require('../config/firebase');

async function main() {
  try {
    const botDoc = await db.collection('system').doc('botInfo').get();
    if (!botDoc.exists) {
      console.error('botInfo not found in Firestore. Start the bot once to populate it.');
      process.exit(1);
    }
    const data = botDoc.data() || {};
    const phone = data.phone;
    if (!phone) {
      console.error('No phone field in botInfo.');
      process.exit(1);
    }
    const userRef = db.collection('users').doc(phone);
    const userSnap = await userRef.get();
    if (userSnap.exists) {
      console.log(`User ${phone} already registered.`);
      process.exit(0);
    }
    await userRef.set({
      email: process.env.OWNER_EMAIL || 'owner@example.com',
      phone,
      schedule: [],
      todos: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    console.log(`Registered owner ${phone} successfully.`);
  } catch (e) {
    console.error('Failed to register owner:', e.message);
    process.exit(1);
  }
}

main();
