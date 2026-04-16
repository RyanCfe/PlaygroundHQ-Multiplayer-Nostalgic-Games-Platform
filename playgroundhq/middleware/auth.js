const { initFirebase } = require('../config/firebase');
const logger = require('../utils/logger');

// Require valid Firebase ID token
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = header.split(' ')[1];
  try {
    const { auth } = initFirebase();
    const decoded = await auth.verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    logger.warn('Auth token verification failed', { error: err.message });
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Optionally decode token — attaches user if present, continues regardless
async function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return next();
  const token = header.split(' ')[1];
  try {
    const { auth } = initFirebase();
    req.user = await auth.verifyIdToken(token);
  } catch { /* ignore */ }
  next();
}

module.exports = { requireAuth, optionalAuth };
