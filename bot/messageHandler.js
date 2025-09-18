const handleTodoCommand = require('./todoHandler');
const handleSchedule = require('./scheduleHandler');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { getReply: getAimlReply } = require('./aimlEngine');
const { chatComplete } = require('./llm');
const rag = require('./rag');
const db = require('../config/firebase');

const HELP_INTENT = /^(?:!?\s*)?(help|menu|\?|commands)$/i;
const GENERIC_AIML = /(here to help|how can i help|ask me|i can assist)/i;
const REMIND_INTENT = /(notify|remind).*(before|prior)\s*(class|lecture)|remind me before class/i;

function buildHelp() {
  return [
    'Here’s what I can do:',
    '• Study plans: plan math for 7 days, 2h/day',
    '• Analyze timetable: send image/PDF with caption "!schedule"',
    '• Todos: todo add Read ch 3 · todo list · done 1',
    '• Reminders: remind me at 5:30 pm · remind me in 20 minutes',
    '• KB (RAG): kb add <note> · kb clear',
    '• Reset chat memory: reset chat',
  ].join('\n');
}

async function loadHistory(phone, limit = Number(process.env.CHAT_HISTORY_MAX || 8)) {
  const doc = await db.collection('users').doc(phone).get();
  const h = (doc.exists && doc.data().chatHistory) || [];
  return h.slice(-limit);
}
async function saveHistory(phone, user, assistant, limit = Number(process.env.CHAT_HISTORY_MAX || 8)) {
  const ref = db.collection('users').doc(phone);
  const snap = await ref.get();
  const prev = (snap.exists && snap.data().chatHistory) || [];
  const next = [...prev, { role: 'user', content: user }, { role: 'assistant', content: assistant }].slice(-2*limit);
  await ref.set({ chatHistory: next }, { merge: true });
}

exports.handleText = async ({ phone, text, send, aiml }) => {
  const msg = text.trim();

  // 1) Explicit help only
  if (HELP_INTENT.test(msg)) {
    return send(buildHelp());
  }

  // 1.1) If user asks about notifications before class, guide them
  if (REMIND_INTENT.test(msg)) {
    return send(
      [
        'I can notify you 5 minutes before each class. To set this up:',
        '1) Send your timetable as an image or PDF (a clear screenshot works).',
        '2) I’ll extract times and save your schedule.',
        '3) You’ll get a DM 5 minutes before each class time on the correct weekday.',
        '',
        'Tip: You can also caption the image with "!schedule" if you like, but it’s not required.',
      ].join('\n')
    );
  }

  // 2) Try AIML, but treat generic responses as weak
  let aimlReply = null;
  try { aimlReply = aiml ? await aiml.reply(msg) : null; } catch {}
  const aimlIsWeak = !aimlReply || GENERIC_AIML.test(aimlReply) || aimlReply.length < 20;

  // 3) LLM fallback for general questions or weak AIML
  const useLLM = ((process.env.USE_LLM ?? process.env.USE_OPENAI) ?? 'true').toLowerCase() === 'true';
  const alwaysLLM = ((process.env.ALWAYS_USE_LLM) ?? 'true').toLowerCase() === 'true';
  if (useLLM && (alwaysLLM || aimlIsWeak || /^[a-z]/i.test(msg))) {
    const useRag = process.env.USE_RAG === 'true';
    const ctx = useRag ? await rag.retrieveContext(phone, msg, 3, 1200) : '';
    const history = await loadHistory(phone);
    const answer = await chatComplete(msg, history, ctx);
    if (answer) {
      await send(answer);
      await saveHistory(phone, msg, answer);
      return;
    }
    // LLM failed (quota, network, etc.)
    await send('I\'m having trouble reaching the AI right now. Please try again in a bit or update your API key. You can still use commands like "help", "todo", and send schedules.');
    return;
  }

  // 4) If AIML had a specific answer, use it; else friendly fallback
  if (aimlReply && !aimlIsWeak) return send(aimlReply);
  return useLLM ? send('Sorry, I could not understand that. Try again.') : send(buildHelp());
};