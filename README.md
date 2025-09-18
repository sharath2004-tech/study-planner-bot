# Study Planner Bot

This bot helps manage study schedules, todos, and reminders via WhatsApp. It stores data in Firebase Firestore and supports optional AI chat and Retrieval-Augmented Generation (RAG).

## Features

- WhatsApp chatbot (Baileys) with AIML quick replies and optional OpenAI chat
- Todos: add/list/done
- Schedule extraction from PDF/image (OCR)
- Reminders: “remind me at/in …”
- Short-term chat memory per user
- Optional per-user Knowledge Base with RAG for grounded answers

## Prerequisites

- Node.js 18+
- Firebase project + service account for Admin SDK
- If using AI features: OpenAI API key

## Environment

Server/bot `.env` (root):

- FIREBASE_… (your Admin credentials or GOOGLE_APPLICATION_CREDENTIALS path)
- REQUIRE_FIREBASE=true (recommended)
- USE_OPENAI=true
- OPENAI_API_KEY=sk-…
- OPENAI_MODEL=gpt-4o-mini (default)
- OPENAI_EMBED_MODEL=text-embedding-3-small (default)
- USE_RAG=true (enable Knowledge Base + retrieval)
- CHAT_HISTORY_MAX=8
- SELF_BOT=false (set true if self-botting your own account)
- SHOW_QR=true

Frontend `.env` is under `website/frontend/.env` (see `.env.example`).

## Run

In two terminals:

```powershell
# 1) Start API server
npm run server

# 2) Start WhatsApp bot
npm run bot
```

Then open the QR at http://localhost:5000/qr if newly linking.

## RAG: Personal Knowledge Base

When `USE_RAG=true` and OpenAI credentials are set, you can save personal notes and the bot will retrieve the most relevant ones to ground its answers.

- Add a note: `kb add <text>`
- Clear your KB: `kb clear`

During normal chat, if RAG is enabled the bot retrieves top-matching notes and injects them as context into the AI reply. This helps provide answers consistent with your own notes (study materials, class details, syllabus, policies, etc.).

Notes are stored per user in Firestore under `users/{phone}/kb` with fields `{ id, text, embedding, createdAt }`.

## Commands Cheat Sheet

- `help` – Show help
- `todo add <task>` – Add task
- `todo list` – List tasks
- `done <number>` – Complete task
- `reset chat` – Clear chat memory
- `kb add <note>` – Save note (when RAG enabled)
- `kb clear` – Clear KB (when RAG enabled)

## Troubleshooting

- API not responding: ensure `npm run server` is running and Firebase creds are valid.
- QR not showing: make sure `SHOW_QR=true` and check Firestore `system/latestQr`.
- AI replies empty: check `USE_OPENAI`, `OPENAI_API_KEY` and logs. For RAG, ensure `USE_RAG=true`.

# Study Planner Bot — Firebase Configuration

This project uses Firebase in two places:

- Backend (Node.js / Express / Bot): Firebase Admin SDK for users, schedules, and todos
- Frontend (React app): Firebase Web SDK (Auth, Firestore) for the dashboard

If Firebase isn’t configured, the backend falls back to a local JSON mock DB so you can still develop. Follow the steps below to connect to your real Firebase project.

## 1) Backend: Firebase Admin SDK

The backend loads credentials via `config/firebase.js`. It supports multiple methods in this priority:

1. `FIREBASE_CONFIG_JSON` — full JSON string (with `\n`-escaped private key)
2. `FIREBASE_CONFIG_BASE64` — base64 string of the JSON
3. `GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_CREDENTIALS_FILE` — path to JSON file
4. A local file at `config/firebase-key.json`

If none are found, you’ll see: `⚠️ Firebase not configured - running in offline mode` and data will be stored in `data/mock-db.json`.

### A. Get a Service Account JSON

Firebase Console → Project Settings → Service accounts → Generate new private key → Download the JSON.

### B. Configure via file path (easy)

PowerShell (session-only):

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\\Users\\<you>\\Downloads\\service-account.json"
# or copy to the repo and point to it
$env:FIREBASE_CREDENTIALS_FILE=".\\config\\firebase-key.json"
```

You can also place the file at `config/firebase-key.json` — the loader will find it automatically.

### C. Configure via JSON string

Paste your JSON into an env var (escape newlines in `private_key` as `\n`):

```powershell
$env:FIREBASE_CONFIG_JSON='{"type":"service_account","project_id":"your-id","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk@your-id.iam.gserviceaccount.com","client_id":"...","token_uri":"https://oauth2.googleapis.com/token"}'
```

### D. Configure via Base64

```powershell
$raw = Get-Content -Raw .\\config\\firebase-key.json
$env:FIREBASE_CONFIG_BASE64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($raw))
```

### E. Optional project id override

```powershell
$env:FIREBASE_PROJECT_ID='your-project-id'
```

### F. Verify backend

```powershell
npm run server
```

Look for: `✅ Firebase initialized successfully (project: <your-id>)`.

If not configured, you’ll see offline mode.

## 2) Frontend: Firebase Web SDK

Edit `website/frontend/src/firebase.js` and replace the `firebaseConfig` with your Web App credentials (Firebase Console → Project Settings → General → Your apps → SDK setup and configuration).

Shape:

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "<project>.firebaseapp.com",
  projectId: "<project>",
  storageBucket: "<project>.appspot.com",
  messagingSenderId: "...",
  appId: "..."
};
```

Save the file. The React app will use your Firebase project for Auth and Firestore.

## 3) Environment file (.env)

There’s a `.env.example` at the project root. Copy it to `.env` and fill in values you need. `config/firebase.js` will auto-load `.env` if present.

## 4) Run the stack

- API server:

```powershell
npm run server
```

- Bot (self only + no prompts):

```powershell
$env:SELF_BOT='true'
$env:SEND_REGISTRATION_PROMPTS='false'
node index.js
```

Relink WhatsApp quickly: open http://localhost:5000/api/bot/relink, restart the bot, then visit http://localhost:5000/qr to scan.

## 5) Troubleshooting

- Offline mode? Re-check env vars or ensure `config/firebase-key.json` exists and is valid.
- PowerShell env vars are per-window. Set them again in each new session or use a `.env` file.
- If the bot exits immediately, run it in a dedicated PowerShell (outside the editor) and check for errors. Also ensure Node 18+ for built-in `fetch`.

Happy building! 📚
