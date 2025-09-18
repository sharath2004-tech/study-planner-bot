const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const db = require("../config/firebase");

function resolveSelfPhone(sock) {
  // Prefer explicit env override
  if (process.env.SELF_BOT_PHONE) return process.env.SELF_BOT_PHONE;
  // Derive from active socket identity when available
  try {
    const id = sock?.user?.id || sock?.user?.jid || '';
    if (id) {
      const bare = String(id).replace(/@.*/, '').split(':')[0];
      if (bare) return bare;
    }
  } catch (_) {}
  // Legacy fallback: local file (may not exist in current design)
  try {
    const infoPath = path.join(__dirname, "..", "data", "bot-info.json");
    if (fs.existsSync(infoPath)) {
      const { phone } = JSON.parse(fs.readFileSync(infoPath, "utf8"));
      if (phone) return String(phone);
    }
  } catch (_) {}
  return null;
}

function convertStartToMinutes(timeStr) {
  // Accepts: "h:mm AM/PM" or "h:mm AM/PM - h:mm AM/PM"; returns start mins since midnight
  try {
    if (!timeStr) return null;
    const start = String(timeStr).split('-')[0].trim();
    const m = start.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ap = m[3].toUpperCase();
    if (ap === 'PM' && h !== 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    if (min < 0 || min > 59 || h < 0 || h > 23) return null;
    return h * 60 + min;
  } catch (_) {
    return null;
  }
}

function dayMatchesToday(day) {
  if (!day) return true;
  const todayIdx = new Date().getDay(); // 0=Sun
  const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const two = { Su:0, Mo:1, Tu:2, We:3, Th:4, Fr:5, Sa:6 };
  const d = String(day).trim();
  if (!d || /^daily$/i.test(d)) return true;
  const up = d.slice(0,3).charAt(0).toUpperCase() + d.slice(1,3).toLowerCase();
  if (names.indexOf(up) === todayIdx) return true;
  const d2 = d.slice(0,2);
  if (two[d2] != null) return two[d2] === todayIdx;
  return false;
}

function startReminders(sock) {
  cron.schedule("* * * * *", async () => {
    const selfMode = (process.env.SELF_BOT || '').toLowerCase() !== 'false';
    const selfPhone = selfMode ? resolveSelfPhone(sock) : null;
    const users = await db.collection("users").get();
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const lead = Number(process.env.CLASS_NOTIFY_LEAD_MIN || 5);

    users.forEach(async (doc) => {
      // In self-bot mode, only deliver reminders to the owner's self chat
      if (selfMode) {
        if (!selfPhone) return; // no target, skip all
        if (String(doc.id) !== String(selfPhone)) return; // skip others
      }
      const data = doc.data() || {};

      // Support both shapes: schedule: [ ... ] or schedule: { items: [...] }
      const items = Array.isArray(data.schedule)
        ? data.schedule
        : (data.schedule && Array.isArray(data.schedule.items) ? data.schedule.items : []);

      if (items && items.length) {
        for (const s of items) {
          const startMin = convertStartToMinutes(s.time || s.start || s.startTime || '');
          if (startMin == null) continue;
          // Check day constraint if present
          const dayOk = dayMatchesToday(s.day || s.dayName || s.dayShort);
          if (!dayOk) continue;
          // Fire exactly at (start - lead) minute
          if (nowMin === startMin - lead) {
            const subj = s.subject || s.course || s.title || 'class';
            const where = s.location || s.room || '';
            const msg = `⏰ Class in ${lead} min: ${subj}${where ? ` (${where})` : ''}\n${s.time || ''}`;
            await sock.sendMessage(doc.id + "@s.whatsapp.net", { text: msg });
          }
        }
      }

      // One-off reminders (personal assistant)
      if (Array.isArray(data.reminders) && data.reminders.length) {
        const remaining = [];
        for (const r of data.reminders) {
          try {
            const due = new Date(r.dueAt);
            // Allow a small window of +/- 59 seconds for minute-based polling
            if (now >= due && now.getTime() - due.getTime() < 60 * 1000) {
              await sock.sendMessage(doc.id + "@s.whatsapp.net", {
                text: `🔔 Reminder: ${r.text}`,
              });
            } else if (now < due) {
              remaining.push(r);
            }
          } catch (_) {
            // keep malformed reminders to avoid silent data loss
            remaining.push(r);
          }
        }
        // Persist updated reminders list
        try {
          if (db.collection("users").doc(doc.id).update) {
            await db.collection("users").doc(doc.id).update({ reminders: remaining });
          } else if (db.collection("users").doc(doc.id).set) {
            await db.collection("users").doc(doc.id).set({ reminders: remaining }, { merge: true });
          }
        } catch (e) {
          // ignore persistence failures
        }
      }
    });
  });
}

module.exports = startReminders;
