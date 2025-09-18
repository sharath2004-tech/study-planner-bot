const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');

let sock;

async function startBot() {
  console.log('🔧 Initializing WhatsApp connection...');
  
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  
  sock = makeWASocket({
    auth: state,
    // Removed deprecated printQRInTerminal option
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    // Display QR code when received
    if (qr) {
      console.log('\n📱 Scan this QR code with WhatsApp:');
      qrcode.generate(qr, { small: true });
      console.log('\n📲 Open WhatsApp → Settings → Linked Devices → Link a Device');
    }
    
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      
      console.log('📱 Connection closed due to:', lastDisconnect?.error);
      
      if (shouldReconnect) {
        console.log('🔄 Reconnecting...');
        startBot();
      }
    } else if (connection === 'open') {
      console.log('🎉 WhatsApp connection opened successfully!');
      console.log('📱 Bot is ready to receive messages!');
      console.log('💡 Try sending: "help" to see available commands');
    }
  });

  sock.ev.on('creds.update', saveCreds);
  
  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.key.fromMe && m.type === 'notify') {
      await handleTestMessage(msg, sock);
    }
  });

  return sock;
}

async function handleTestMessage(msg, sock) {
  const from = msg.key.remoteJid;
  const phone = from.replace('@s.whatsapp.net', '');
  let text = '';

  // Handle different message types
  if (msg.message?.conversation) {
    text = msg.message.conversation;
  } else if (msg.message?.extendedTextMessage?.text) {
    text = msg.message.extendedTextMessage.text;
  } else {
    return; // Ignore other message types for now
  }

  console.log(`📩 Message from ${phone}: ${text}`);

  const lowerText = text.toLowerCase().trim();

  // Help command
  if (lowerText === 'help' || lowerText === '/help') {
    const helpText = `
🎉 *Study Planner Bot - Test Mode*

📝 *Available Commands:*
• \`help\` - Show this help message
• \`test\` - Test bot response
• \`status\` - Show bot status

⚠️ *Note:* This is test mode without Firebase.
Full features require Firebase setup.

*Example:*
\`test\`
    `;
    return await sock.sendMessage(from, { text: helpText });
  }

  // Test command
  if (lowerText === 'test') {
    return await sock.sendMessage(from, { 
      text: "✅ Bot is working perfectly! 🚀\n\nAll systems operational in test mode." 
    });
  }

  // Status command
  if (lowerText === 'status') {
    return await sock.sendMessage(from, { 
      text: `📊 *Bot Status:*\n\n✅ WhatsApp: Connected\n⚠️ Firebase: Not configured\n🔧 Mode: Test Mode\n\nTime: ${new Date().toLocaleString()}` 
    });
  }

  // Default response
  await sock.sendMessage(from, { 
    text: "🤖 Test mode active! Type 'help' to see available commands.\n\n⚠️ Full features require Firebase setup." 
  });
}

function getSock() {
  return sock;
}

module.exports = { startBot, getSock };