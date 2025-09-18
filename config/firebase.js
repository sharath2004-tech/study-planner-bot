const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Try to load environment variables from .env (project root or CWD)
try {
  const dotenv = require("dotenv");
  // First try CWD
  dotenv.config();
  // Also try project root (two levels up from this file)
  const rootEnv = path.join(__dirname, "..", ".env");
  if (fs.existsSync(rootEnv)) {
    dotenv.config({ path: rootEnv });
  }
} catch (_) {
  // dotenv is optional; ignore if not installed
}

let db = null;
const REQUIRE_FIREBASE = String(process.env.REQUIRE_FIREBASE || '').toLowerCase() === 'true';

function normalizePrivateKey(pk) {
  if (!pk) return pk;
  // Convert escaped newlines to real newlines
  return pk.replace(/\\n/g, "\n");
}

function resolveServiceAccount() {
  // 1) FIREBASE_CONFIG_JSON (raw JSON string)
  if (process.env.FIREBASE_CONFIG_JSON) {
    try {
      const json = JSON.parse(process.env.FIREBASE_CONFIG_JSON);
      if (json.private_key) json.private_key = normalizePrivateKey(json.private_key);
      return json;
    } catch (e) {
      console.warn("Invalid FIREBASE_CONFIG_JSON:", e.message);
    }
  }

  // 2) FIREBASE_CONFIG_BASE64 (base64-encoded JSON)
  if (process.env.FIREBASE_CONFIG_BASE64) {
    try {
      const raw = Buffer.from(process.env.FIREBASE_CONFIG_BASE64, "base64").toString("utf8");
      const json = JSON.parse(raw);
      if (json.private_key) json.private_key = normalizePrivateKey(json.private_key);
      return json;
    } catch (e) {
      console.warn("Invalid FIREBASE_CONFIG_BASE64:", e.message);
    }
  }

  // 3) GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_CREDENTIALS_FILE (path to JSON)
  const pathVar = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_CREDENTIALS_FILE;
  if (pathVar) {
    try {
      const p = path.isAbsolute(pathVar) ? pathVar : path.join(process.cwd(), pathVar);
      if (fs.existsSync(p)) {
        const json = JSON.parse(fs.readFileSync(p, "utf8"));
        if (json.private_key) json.private_key = normalizePrivateKey(json.private_key);
        return json;
      } else {
        console.warn("Credentials file not found:", p);
      }
    } catch (e) {
      console.warn("Failed to read credentials file:", e.message);
    }
  }

  // 4) Local file next to this module: config/firebase-key.json
  const localKey = path.join(__dirname, "firebase-key.json");
  if (fs.existsSync(localKey)) {
    try {
      const json = JSON.parse(fs.readFileSync(localKey, "utf8"));
      if (json.private_key) json.private_key = normalizePrivateKey(json.private_key);
      return json;
    } catch (e) {
      console.warn("Invalid firebase-key.json:", e.message);
    }
  }

  return null;
}

try {
  const serviceAccount = resolveServiceAccount();

  if (!serviceAccount) {
    throw new Error("No Firebase credentials provided");
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID,
  });

  db = admin.firestore();
  console.log("✅ Firebase initialized successfully (project:", serviceAccount.project_id || "unknown", ")");
} catch (error) {
  if (REQUIRE_FIREBASE) {
    // Fail hard if Firebase is required
    console.error("❌ Firebase required but not configured:", error.message);
    throw error;
  }
  console.log("⚠️ Firebase not configured - running in offline mode");
  console.log("💡 To enable Firebase, set GOOGLE_APPLICATION_CREDENTIALS, FIREBASE_CREDENTIALS_FILE, FIREBASE_CONFIG_JSON, or add config/firebase-key.json");

  // Persistent mock database (JSON file) for offline mode
  const dataDir = path.join(__dirname, "..", "data");
  const dbFile = path.join(dataDir, "mock-db.json");

  // Ensure data directory exists
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  } catch (e) {
    // ignore
  }

  // Load existing data or initialize
  let store = { users: {} };
  try {
    if (fs.existsSync(dbFile)) {
      const raw = fs.readFileSync(dbFile, "utf8");
      store = JSON.parse(raw);
    }
  } catch (e) {
    store = { users: {} };
  }

  function persist() {
    try {
      fs.writeFileSync(dbFile, JSON.stringify(store, null, 2), "utf8");
    } catch (e) {
      // ignore write errors in offline mode
    }
  }

  function deepMerge(target, source) {
    for (const key of Object.keys(source)) {
      if (
        source[key] &&
        typeof source[key] === "object" &&
        !Array.isArray(source[key])
      ) {
        if (!target[key] || typeof target[key] !== "object") {
          target[key] = {};
        }
        deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }

  // Minimal Firestore-like mock
  db = {
    _isMock: true,
    collection: (name) => {
      if (!store[name]) store[name] = {};

      return {
        doc: (id) => ({
          async get() {
            const data = store[name][id];
            return {
              id,
              exists: !!data,
              data: () => (data ? { ...data } : undefined),
            };
          },
          async set(data, options) {
            if (options && options.merge && store[name][id]) {
              store[name][id] = deepMerge({ ...store[name][id] }, data);
            } else {
              store[name][id] = { ...data };
            }
            persist();
            return;
          },
          async update(data) {
            if (!store[name][id]) {
              // Create if not exists to be forgiving in offline mode
              store[name][id] = {};
            }
            store[name][id] = deepMerge({ ...store[name][id] }, data);
            persist();
            return;
          },
        }),
        async get() {
          const entries = Object.entries(store[name] || {});
          return {
            forEach: (cb) => {
              entries.forEach(([id, data]) =>
                cb({ id, data: () => ({ ...data }) })
              );
            },
          };
        },
      };
    },
  };
}

module.exports = db;
