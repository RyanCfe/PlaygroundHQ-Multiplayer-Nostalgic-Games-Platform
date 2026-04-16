const admin = require('firebase-admin');
const logger = require('../utils/logger');

let db = null;
let auth = null;
let initialized = false;
let isMock = false;

function initFirebase() {
  if (initialized) return { db, auth, isMock };

  try {
    const serviceAccount = require('./serviceAccountKey.json');

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    db = admin.firestore();
    auth = admin.auth();
    initialized = true;
    isMock = false;

    logger.info('Firebase Admin initialized successfully');
  } catch (err) {
    logger.warn(`Firebase init failed — running in offline/mock mode: ${err.message}`);
    db = createMockFirestore();
    auth = createMockAuth();
    initialized = true;
    isMock = true;
  }

  return { db, auth, isMock };
}

// ── Mock Firestore for local dev without credentials ──────────────────────────
function createMockFirestore() {
  const store = {};

  const mockDoc = (path) => ({
    get: async () => ({
      exists: !!store[path],
      data: () => store[path] || null,
      id: path.split('/').pop(),
    }),
    set: async (data, opts) => {
      store[path] = opts && opts.merge
        ? { ...(store[path] || {}), ...data }
        : data;
    },
    update: async (data) => {
      store[path] = { ...(store[path] || {}), ...data };
    },
    delete: async () => {
      delete store[path];
    },
  });

  const mockCollection = (col) => ({
    doc: (id) => mockDoc(`${col}/${id}`),
    where: () => ({
      orderBy: () => ({
        limit: () => ({
          get: async () => ({ docs: [], empty: true, forEach: () => {} }),
        }),
        get: async () => ({ docs: [], empty: true, forEach: () => {} }),
      }),
      get: async () => ({ docs: [], empty: true, forEach: () => {} }),
    }),
    orderBy: () => ({
      limit: () => ({
        get: async () => ({ docs: [], empty: true, forEach: () => {} }),
      }),
      get: async () => ({ docs: [], empty: true, forEach: () => {} }),
    }),
    add: async (data) => {
      const id = `mock_${Date.now()}`;
      store[`${col}/${id}`] = data;
      return { id };
    },
    get: async () => ({ docs: [], empty: true, forEach: () => {} }),
  });

  return {
    collection: mockCollection,
    FieldValue: {
      serverTimestamp: () => new Date().toISOString(),
      increment: (n) => n,
    },
  };
}

function createMockAuth() {
  return {
    verifyIdToken: async (token) => {
      try {
        return JSON.parse(Buffer.from(token, 'base64').toString());
      } catch {
        return {
          uid: 'dev_user',
          email: 'dev@example.com',
          name: 'Dev User',
        };
      }
    },
  };
}

module.exports = { initFirebase };