const express = require('express');
const cors = require('cors');
const path = require('path');
const userRoutes = require('./routes/userRoutes');
const db = require('../../config/firebase');
let QRCodeLib;
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;
const DATA_DIR = path.join(__dirname, '../../data');
// Keep AUTH_DIR consistent with bot.js logic; allow override via AUTH_DIR env
const os = require('os');
function resolveAuthDir() {
  try {
    const envDir = process.env.AUTH_DIR;
    if (envDir && envDir.trim()) {
      return path.isAbsolute(envDir) ? envDir : path.join(process.cwd(), envDir);
    }
    return path.join(os.tmpdir(), 'study-planner-bot', 'auth_info_baileys');
  } catch (_) {
    return path.join(__dirname, '../../auth_info_baileys');
  }
}
const AUTH_DIR = resolveAuthDir();

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5000'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the website directory
app.use(express.static(path.join(__dirname, '../')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Study Planner Bot API is running',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/users', userRoutes);

// Bot info endpoint (exposes connected WhatsApp number if available)
app.get('/api/bot-info', async (req, res) => {
  try {
    const doc = await db.collection('system').doc('botInfo').get();
    if (!doc.exists) return res.status(404).json({ error: 'Bot not connected' });
    return res.json(doc.data());
  } catch (e) {
    return res.status(500).json({ error: 'Failed to read bot info', message: e.message });
  }
});

// Redirect to WhatsApp chat with the bot's number
app.get('/chat', async (req, res) => {
  try {
    const doc = await db.collection('system').doc('botInfo').get();
    if (!doc.exists) return res.redirect('/');
    const data = doc.data() || {};
    const phone = data.phone;
    if (!phone) return res.redirect('/');
    return res.redirect(`https://wa.me/${phone}`);
  } catch (e) {
    return res.redirect('/');
  }
});

// Root endpoint - serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

// Registration page routes (both with and without .html)
app.get('/registration', (req, res) => {
  res.sendFile(path.join(__dirname, '../registration.html'));
});

app.get('/registration.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../registration.html'));
});

// QR endpoints
app.get('/api/qr', async (req, res) => {
  try {
    const doc = await db.collection('system').doc('latestQr').get();
    const data = doc.data() || {};
    if (!doc.exists || !data.qr) return res.status(404).json({ error: 'No QR available' });
    return res.json({ qr: data.qr, updatedAt: data.updatedAt });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load QR', message: e.message });
  }
});

app.get('/qr', async (req, res) => {
  // Try to pre-render QR as data URL from Firestore
  let qrDataUrl = '';
  try {
    const doc = await db.collection('system').doc('latestQr').get();
    const data = doc.data() || {};
    if (doc.exists && data.qr) {
      try {
        QRCodeLib = QRCodeLib || require('qrcode');
        qrDataUrl = await QRCodeLib.toDataURL(data.qr);
      } catch (e) {
        // ignore; client-side will render
      }
    }
  } catch (_) {}

  res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>Scan WhatsApp QR</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>body{font-family:Segoe UI,Tahoma,Arial,sans-serif;background:#f6f7fb;margin:0;padding:40px;display:flex;align-items:center;justify-content:center;min-height:100vh} .card{background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.1);padding:24px;max-width:520px;width:100%;text-align:center} h1{margin:0 0 12px} #qr{margin:16px auto} .muted{color:#666} .err{color:#c0392b;background:#fdecea;padding:10px;border-radius:8px;margin-top:10px} button{padding:10px 16px;border-radius:8px;border:1px solid #ddd;background:#fff;cursor:pointer} button:hover{background:#f3f3f3} img{max-width:280px;border-radius:8px}</style>
</head><body>
<div class="card">
 <h1>Link WhatsApp</h1>
 <p class="muted">Open WhatsApp → Settings → Linked Devices → Link a Device</p>
 <div id="qr"></div>
 ${qrDataUrl ? `<img alt="QR Code" src="${qrDataUrl}" />` : ''}
 <div id="status" class="muted">Waiting for QR...</div>
 <div style="margin-top:12px"><button onclick="loadQr()">Refresh QR</button></div>
</div>
<script>
async function loadQr(){
  const el = document.getElementById('qr');
  const status = document.getElementById('status');
  status.textContent = 'Loading QR...';
  try{
    const res = await fetch('/api/qr');
    if(!res.ok){
      el.innerHTML = '';
      status.innerHTML = '<div class="err">QR not available. Keep this page open—QR refreshes when the bot requests pairing.</div>';
      return;
    }
    const data = await res.json();
    const qrData = data.qr;
    // Render QR using browser API
    // Use a simple QR library via CDN
    if(!window.QRCode){
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';
      await new Promise(r=>{s.onload=r;document.head.appendChild(s);});
    }
    el.innerHTML = '';
    const canvas = document.createElement('canvas');
    el.appendChild(canvas);
    await window.QRCode.toCanvas(canvas, qrData, { width: 280 });
    status.textContent = 'Scan this QR in WhatsApp';
  }catch(err){
    el.innerHTML = '';
    status.innerHTML = '<div class="err">Failed to load QR: '+err.message+'</div>';
  }
}
loadQr();
setInterval(loadQr, 10000);
</script>
</body></html>`);
});

// Bot relink: clear local auth to force a fresh QR on next bot start
async function clearDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) await clearDirectory(full);
    else try { fs.unlinkSync(full); } catch (_) {}
  }
  try { fs.rmdirSync(dirPath); } catch (_) {}
}

app.post('/api/bot/relink', async (req, res) => {
  try {
    // Try to delete QR file
    const qrFile = path.join(DATA_DIR, 'latest-qr.json');
    if (fs.existsSync(qrFile)) {
      try { fs.unlinkSync(qrFile); } catch (_) {}
    }
    // Try to delete bot-info so /chat hides until reconnected
    const botInfo = path.join(DATA_DIR, 'bot-info.json');
    if (fs.existsSync(botInfo)) {
      try { fs.unlinkSync(botInfo); } catch (_) {}
    }
    // Also clear Firestore state
    try {
      await db.collection('system').doc('latestQr').set({ qr: null, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (_) {}
    try {
      await db.collection('system').doc('botInfo').set({ phone: null, jid: null, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (_) {}
    // Remove auth directory
    if (fs.existsSync(AUTH_DIR)) {
      await clearDirectory(AUTH_DIR);
    }
    return res.json({ status: 'OK', message: 'Cleared local WhatsApp auth. Restart the bot (node index.js) and open /qr to scan a new code.' });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to clear auth', message: e.message });
  }
});

// Convenience GET for relink (easier to call from browser)
app.get('/api/bot/relink', async (req, res) => {
  try {
    const qrFile = path.join(DATA_DIR, 'latest-qr.json');
    if (fs.existsSync(qrFile)) {
      try { fs.unlinkSync(qrFile); } catch (_) {}
    }
    const botInfo = path.join(DATA_DIR, 'bot-info.json');
    if (fs.existsSync(botInfo)) {
      try { fs.unlinkSync(botInfo); } catch (_) {}
    }
    // Also clear Firestore state
    try {
      await db.collection('system').doc('latestQr').set({ qr: null, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (_) {}
    try {
      await db.collection('system').doc('botInfo').set({ phone: null, jid: null, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (_) {}
    if (fs.existsSync(AUTH_DIR)) {
      await clearDirectory(AUTH_DIR);
    }
    return res.json({ status: 'OK', message: 'Cleared local WhatsApp auth. Restart the bot (node index.js) and open /qr to scan a new code.' });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to clear auth', message: e.message });
  }
});

// 404 handler - must be after all other routes
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    availableEndpoints: [
      'GET /',
      'GET /api/health',
      'GET /api/bot-info',
  'POST /api/bot/relink',
  'GET /api/bot/relink',
      'GET /chat',
      'GET /api/users',
      'POST /api/users/register',
      'POST /api/users/login',
      'GET /api/users/profile/:phone',
      'PUT /api/users/profile/:phone',
      'GET /api/users/:phone/schedule',
      'POST /api/users/:phone/schedule',
      'GET /api/users/:phone/todos',
      'POST /api/users/:phone/todos',
      'PUT /api/users/:phone/todos/:todoId',
      'DELETE /api/users/:phone/todos/:todoId'
    ]
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  
  res.status(error.status || 500).json({
    error: 'Internal Server Error',
    message: error.message || 'Something went wrong',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Study Planner Bot API server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🌐 Registration portal: http://localhost:${PORT}/`);
  console.log(`📝 Direct registration: http://localhost:${PORT}/registration.html`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down server gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down server gracefully...');
  process.exit(0);
});

module.exports = app;