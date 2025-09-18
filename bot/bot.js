const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, downloadMediaMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { handleText } = require('./messageHandler');
const handleSchedule = require('./scheduleHandler');
const startReminders = require('./reminder');
const db = require('../config/firebase');
const os = require('os');

// Load env if present (for SELF_BOT options)
try { require('dotenv').config(); } catch (_) {}

// Ensure fetch exists on Node < 18
if (typeof global.fetch === 'undefined') {
    global.fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
}

let sock;
const API_BASE = process.env.API_BASE_URL || 'http://localhost:5000';
let registeredUsers = new Set(); // Store registered user phone numbers

// Resolve auth directory (avoid OneDrive sync locks by defaulting to OS temp)
function resolveAuthDir() {
    try {
        const envDir = process.env.AUTH_DIR;
        if (envDir && envDir.trim()) {
            return path.isAbsolute(envDir) ? envDir : path.join(process.cwd(), envDir);
        }
        // Default: OS temp folder
        const base = path.join(os.tmpdir(), 'study-planner-bot', 'auth_info_baileys');
        return base;
    } catch (_) {
        return path.join(process.cwd(), 'auth_info_baileys');
    }
}
const AUTH_DIR = resolveAuthDir();
// Ensure directory exists
try { fs.mkdirSync(AUTH_DIR, { recursive: true }); } catch (_) {}

// Helper: determine if self-bot mode is enabled (default: true)
function selfBotEnabled() {
    const v = (process.env.SELF_BOT || '').toLowerCase();
    if (!v) return true; // default to true when unset
    return v === 'true' || v === '1' || v === 'yes' || v === 'y';
}

// Load registered users from backend API or local file
async function loadRegisteredUsers() {
    try {
        // Try primary endpoint
    let res = await fetch(`${API_BASE}/api/users/list`);
        if (res.ok) {
            const data = await res.json();
            const usersArr = Array.isArray(data) ? data : (Array.isArray(data.users) ? data.users : []);
            registeredUsers = new Set(usersArr.map(u => u.phone));
            console.log(`📋 Loaded ${registeredUsers.size} registered users from API (/list)`);
            return;
        }
        // Try fallback endpoint
    res = await fetch(`${API_BASE}/api/users`);
        if (res.ok) {
            const data = await res.json();
            const usersArr = Array.isArray(data) ? data : (Array.isArray(data.users) ? data.users : []);
            registeredUsers = new Set(usersArr.map(u => u.phone));
            console.log(`📋 Loaded ${registeredUsers.size} registered users from API (/)`);
            return;
        }
        throw new Error(`HTTP ${res.status}`);
    } catch (error) {
        console.log('⚠️ Could not load users from API, using local storage');
        // Fallback: load from local file
        try {
            const usersFile = path.join(__dirname, '../data/registered_users.json');
            if (fs.existsSync(usersFile)) {
                const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
                registeredUsers = new Set(users);
                console.log(`📋 Loaded ${registeredUsers.size} registered users from local file`);
            } else {
                console.log('📝 No existing users file found');
            }
        } catch (fileError) {
            console.log('📝 No existing users found, starting with empty list');
        }
    }
}

// Check if user is registered
function isUserRegistered(phoneNumber) {
    // Remove @ and c.us suffix, keep only the number
    const cleanPhone = phoneNumber.replace('@c.us', '').replace('@s.whatsapp.net', '');
    return registeredUsers.has(cleanPhone);
}

async function startBot() {
    try {
        console.log('🤖 Starting WhatsApp Study Planner Bot...');
        
        // Load registered users
        await loadRegisteredUsers();
        
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
        
        sock = makeWASocket({
            auth: state,
            printQRInTerminal: false, // Disable automatic QR display
        });

    sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            // Display QR code when received (for initial setup only)
            if (qr) {
                console.log('\n📱 QR Code available for WhatsApp Web connection:');
                console.log('🌐 Users should register at: http://localhost:5000/');
                // Persist to Firestore
                try {
                    await db.collection('system').doc('latestQr').set({ qr, updatedAt: new Date().toISOString() }, { merge: true });
                } catch (e) {
                    console.log('⚠️ Failed to save QR to Firestore:', e.message);
                }
                
                // Only show QR if explicitly requested (for admin setup)
                if (process.env.SHOW_QR === 'true') {
                    console.log('\n📲 Admin QR Code:');
                    qrcode.generate(qr, { small: true });
                    console.log('\n📲 Open WhatsApp → Settings → Linked Devices → Link a Device');
                }
                console.log('🔗 Alternatively, open http://localhost:5000/qr to scan the QR');
            }
            
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                
                console.log('📱 Connection closed due to:', lastDisconnect?.error);
                
                if (shouldReconnect) {
                    console.log('🔄 Reconnecting...');
                    setTimeout(() => startBot(), 3000);
                }
            } else if (connection === 'open') {
                console.log('🎉 WhatsApp connection opened successfully!');
                console.log('🌐 Registration portal: http://localhost:5000/');
                console.log(`🎯 Bot ready for ${registeredUsers.size} registered users`);
                // Persist bot info (jid and phone) for website to use
                try {
                    const jid = sock?.user?.id || '';
                    // Extract plain phone without device suffix (e.g., ':80') and without domain
                    const withoutDomain = jid.replace(/@.*/, '');
                    const phone = withoutDomain.includes(':') ? withoutDomain.split(':')[0] : withoutDomain;
                    const info = { jid, phone, updatedAt: new Date().toISOString() };
                    // Persist to Firestore
                    try {
                        await db.collection('system').doc('botInfo').set(info, { merge: true });
                    } catch (e) {
                        console.log('⚠️ Failed to save bot info to Firestore:', e.message);
                    }
                    console.log(`📇 Bot WhatsApp number available: +${phone}`);
                } catch (e) {
                    console.log('⚠️ Failed to persist bot info:', e.message);
                }
                // Clear Firestore QR document
                try {
                    await db.collection('system').doc('latestQr').set({ qr: null, updatedAt: new Date().toISOString() }, { merge: true });
                } catch (_) {}
                
                // Start reminders; they will self-gate in SELF_BOT mode
                startReminders(sock);
                
                // Refresh registered users periodically (every 60s)
                setInterval(loadRegisteredUsers, 60 * 1000);
            }
        });

        sock.ev.on('creds.update', saveCreds);
        
        // Adapt message into the shape expected by handleText()
        async function processIncomingMessage(msg) {
            const from = msg.key.remoteJid;
            const text = (msg.message?.conversation)
                            || (msg.message?.extendedTextMessage?.text)
                            || (msg.message?.imageMessage?.caption)
                            || (msg.message?.documentMessage?.caption)
                            || '';
            const phone = (from || '').replace(/@.*/, '').split(':')[0];
            const send = async (reply) => {
                if (!reply) return;
                await sock.sendMessage(from, { text: String(reply) });
            };
            // If this message contains media (image/PDF), try to parse schedule first
            try {
                const m = msg.message || {};
                const doc = m.documentMessage;
                const mimetype = (doc && doc.mimetype) || '';
                const fileName = (doc && doc.fileName) || '';
                const isImage = !!m.imageMessage || (!!doc && /^image\//i.test(mimetype));
                const isPdf = !!doc && (/pdf/i.test(mimetype) || /\.pdf$/i.test(fileName));
                if (isImage || isPdf) {
                    // Download media as Buffer via Baileys helper
                    const buffer = await downloadMediaMessage(msg, 'buffer');
                    const fileType = isImage ? 'image' : 'pdf';
                    await handleSchedule(from, phone, fileType, buffer, sock);
                    return; // handled
                }
            } catch (e) {
                // Fall through to text handling on any media errors
                if ((process.env.DEBUG_MEDIA || '').toLowerCase() === 'true') {
                    console.log('⚠️ Media handling failed, falling back to text:', e.message);
                }
            }

            // We don't wire AIML object here; handleText will LLM-fallback when configured
            await handleText({ phone, text, send, aiml: null });
        }

        sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages && m.messages[0];
            if (!msg || m.type !== 'notify') return;

            const selfBot = selfBotEnabled();
            const remoteJid = msg.key.remoteJid;

            if (selfBot) {
                // Only ever respond in our own self-chat, and only to prefixed messages
                if (!msg.key.fromMe) {
                    if ((process.env.DEBUG_SELF_BOT || '').toLowerCase() === 'true') {
                        console.log('🔇 Self-bot: ignoring message not from me');
                    }
                    return; // never react to others in self-bot mode
                }
                const myJid = sock?.user?.id || '';
                const myBare = (myJid || '').replace(/@.*/, '').split(':')[0];
                const remoteBare = (remoteJid || '').replace(/@.*/, '').split(':')[0];
                const isSelfChat = myBare && remoteBare && myBare === remoteBare;
                if (!isSelfChat) {
                    if ((process.env.DEBUG_SELF_BOT || '').toLowerCase() === 'true') {
                        console.log(`🔇 Self-bot: ignoring my message to non-self chat (${remoteBare})`);
                    }
                    return; // ignore our own messages to others
                }

                // require the owner's number to be registered
                if (!registeredUsers.has(myBare)) {
                    console.log(`🔒 SELF_BOT: ignoring self-chat because owner ${myBare} is not registered`);
                    return;
                }

                                const prefix = process.env.SELF_BOT_PREFIX || '!';
                                const freeChat = (process.env.SELF_BOT_FREE_CHAT || '').toLowerCase() === 'true';
                                // Consider captions on media too, so users can trigger processing for images/PDFs
                                const text = (msg.message?.conversation)
                                                    || (msg.message?.extendedTextMessage?.text)
                                                    || (msg.message?.imageMessage?.caption)
                                                    || (msg.message?.documentMessage?.caption)
                                                    || '';
                                if (!freeChat && !text.startsWith(prefix)) {
                                    if ((process.env.DEBUG_SELF_BOT || '').toLowerCase() === 'true') {
                                        console.log('🔇 Self-bot: ignoring self message without required prefix');
                                    }
                                    return; // require prefix to avoid loops unless free chat enabled
                                }
                await processIncomingMessage(msg);
                return;
            }

            // Normal mode: ignore our own messages
            if (msg.key.fromMe) return;

            // Allow only registered users
            let allowFromRegistered = isUserRegistered(remoteJid);
            if (!allowFromRegistered) {
                // Try reloading in case just registered, then re-check
                await loadRegisteredUsers();
                allowFromRegistered = isUserRegistered(remoteJid);
            }
            if (!allowFromRegistered) {
                // Respect suppression flag (default: suppress)
                const shouldPrompt = (process.env.SEND_REGISTRATION_PROMPTS || '').toLowerCase() === 'true';
                if (shouldPrompt) {
                    const cleanPhone = remoteJid.replace('@c.us', '').replace('@s.whatsapp.net', '');
                    const registrationMessage = `
🤖 *Welcome to Study Planner Bot!*

📝 To use this bot, please register first at:
🌐 *http://localhost:5000/*

📱 Use this phone number when registering: *${cleanPhone}*

After registration, you can use commands like:
• *help* - Show all commands
• *todo add [task]* - Add a new task  
• *schedule* - View your schedule
• Send PDF/images of your class schedule

*Thank you for your interest in Study Planner Bot!* 📚
                    `;
                    await sock.sendMessage(remoteJid, { text: registrationMessage });
                    console.log(`📝 Sent registration info to unregistered user: ${cleanPhone}`);
                } else {
                    // silently ignore when prompts are disabled
                    console.log(`🔒 Registration prompt suppressed for ${remoteJid}`);
                }
                return;
            }

            await processIncomingMessage(msg);
        });

        return sock;
    } catch (error) {
        console.error('❌ Error starting bot:', error);
        setTimeout(() => startBot(), 5000);
    }
}

function getSock() {
  return sock;
}

module.exports = { startBot, getSock };