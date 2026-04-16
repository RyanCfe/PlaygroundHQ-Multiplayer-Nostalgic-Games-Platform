// ── User / Stats API Routes ──────────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { initFirebase } = require('../config/firebase');
const logger = require('../utils/logger');

// ── GET /api/users/me ─────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { db } = initFirebase();
    const doc = await db.collection('users').doc(req.user.uid).get();
    if (!doc.exists) {
      // Create profile on first login
      const profile = {
        uid: req.user.uid,
        displayName: req.user.name || req.user.email?.split('@')[0] || 'Player',
        email: req.user.email || null,
        photoURL: req.user.picture || null,
        createdAt: new Date().toISOString(),
        stats: {},
        achievements: [],
        favoriteGames: [],
      };
      await db.collection('users').doc(req.user.uid).set(profile);
      return res.json({ user: profile });
    }
    res.json({ user: doc.data() });
  } catch (err) {
    logger.error('GET /me error', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// ── PATCH /api/users/me ───────────────────────────────────────────────────────
router.patch('/me', requireAuth, async (req, res) => {
  try {
    const { db } = initFirebase();
    const allowed = ['displayName', 'favoriteGames', 'avatar', 'preferences'];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    update.updatedAt = new Date().toISOString();
    await db.collection('users').doc(req.user.uid).set(update, { merge: true });
    res.json({ ok: true });
  } catch (err) {
    logger.error('PATCH /me error', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ── GET /api/users/me/stats ───────────────────────────────────────────────────
router.get('/me/stats', requireAuth, async (req, res) => {
  try {
    const { db } = initFirebase();
    const doc = await db.collection('users').doc(req.user.uid).get();
    if (!doc.exists) return res.json({ stats: {} });
    res.json({ stats: doc.data()?.stats || {} });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ── POST /api/users/me/stats ──────────────────────────────────────────────────
// Called by server after game ends
router.post('/me/stats', requireAuth, async (req, res) => {
  try {
    const { db, FieldValue } = initFirebase();
    const { gameId, won, lost, drew } = req.body;
    if (!gameId) return res.status(400).json({ error: 'gameId required' });

    const inc = db.FieldValue?.increment || ((n) => n);
    const updates = {};
    if (won)  updates[`stats.${gameId}.wins`]   = inc(1);
    if (lost) updates[`stats.${gameId}.losses`] = inc(1);
    if (drew) updates[`stats.${gameId}.draws`]  = inc(1);
    updates[`stats.${gameId}.played`] = inc(1);

    await db.collection('users').doc(req.user.uid).set(updates, { merge: true });
    res.json({ ok: true });
  } catch (err) {
    logger.error('POST /me/stats error', err);
    res.status(500).json({ error: 'Failed to update stats' });
  }
});

// ── GET /api/users/leaderboard/:gameId ────────────────────────────────────────
router.get('/leaderboard/:gameId', async (req, res) => {
  try {
    const { db } = initFirebase();
    const { gameId } = req.params;
    // This query needs a composite index in Firestore for production
    const snap = await db.collection('users')
      .orderBy(`stats.${gameId}.wins`, 'desc')
      .limit(20)
      .get();

    const leaders = [];
    snap.forEach(doc => {
      const data = doc.data();
      leaders.push({
        uid: data.uid,
        displayName: data.displayName,
        wins: data.stats?.[gameId]?.wins || 0,
        played: data.stats?.[gameId]?.played || 0,
        winRate: data.stats?.[gameId]?.played
          ? Math.round((data.stats[gameId].wins / data.stats[gameId].played) * 100)
          : 0,
      });
    });

    res.json({ leaderboard: leaders, gameId });
  } catch (err) {
    logger.error('Leaderboard error', err);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// ── POST /api/users/me/favorites ──────────────────────────────────────────────
router.post('/me/favorites', requireAuth, async (req, res) => {
  try {
    const { db } = initFirebase();
    const { gameId, action } = req.body; // action: 'add' | 'remove'
    const doc = await db.collection('users').doc(req.user.uid).get();
    const favs = doc.data()?.favoriteGames || [];
    const updated = action === 'remove'
      ? favs.filter(id => id !== gameId)
      : [...new Set([...favs, gameId])];
    await db.collection('users').doc(req.user.uid).set({ favoriteGames: updated }, { merge: true });
    res.json({ ok: true, favoriteGames: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update favorites' });
  }
});

module.exports = router;
