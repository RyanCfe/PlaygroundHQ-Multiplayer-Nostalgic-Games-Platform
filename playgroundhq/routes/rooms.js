// ── Rooms API Routes ─────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const { optionalAuth, requireAuth } = require('../middleware/auth');
const {
  createRoom, getRoom, listPublicRooms, startGame,
} = require('../socket/roomManager');

// ── POST /api/rooms ───────────────────────────────────────────────────────────
router.post('/', optionalAuth, (req, res) => {
  const { gameId, playerName, maxPlayers, isPrivate, botDifficulty } = req.body;
  if (!gameId) return res.status(400).json({ error: 'gameId required' });

  const playerId = req.user?.uid || `guest_${Date.now()}`;
  const room = createRoom({
    gameId,
    hostId: playerId,
    hostName: playerName || req.user?.name || 'Host',
    maxPlayers: maxPlayers || 2,
    isPrivate: !!isPrivate,
    botDifficulty: botDifficulty || null,
  });

  res.status(201).json({ room: sanitize(room) });
});

// ── GET /api/rooms ────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { gameId } = req.query;
  res.json({ rooms: listPublicRooms(gameId) });
});

// ── GET /api/rooms/:code ──────────────────────────────────────────────────────
router.get('/:code', (req, res) => {
  const room = getRoom(req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({ room: sanitize(room) });
});

function sanitize(room) {
  return {
    code: room.code,
    gameId: room.gameId,
    status: room.status,
    playerCount: room.players.length,
    maxPlayers: room.maxPlayers,
    isPrivate: room.isPrivate,
    createdAt: room.createdAt,
    players: room.players.map(p => ({ name: p.name, isBot: p.isBot, ready: p.ready })),
  };
}

module.exports = router;
