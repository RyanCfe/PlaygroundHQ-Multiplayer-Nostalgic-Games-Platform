// ── Rooms API Routes ─────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const {
  createRoom,
  getRoom,
  listPublicRooms,
  startGame,
} = require('../socket/roomManager');

// ── POST /api/rooms ───────────────────────────────────────────────────────────
router.post('/', optionalAuth, (req, res) => {
  try {
    const { gameId, playerName, maxPlayers, isPrivate, botDifficulty } = req.body;

    if (!gameId) {
      return res.status(400).json({ error: 'gameId required' });
    }

    const playerId = req.user?.uid || `guest_${Date.now()}`;
    const wantsBot = !!botDifficulty;
    const effectiveMaxPlayers = wantsBot ? 2 : (maxPlayers || 2);

    const room = createRoom({
      gameId,
      hostId: playerId,
      hostName: playerName || req.user?.name || 'Host',
      maxPlayers: effectiveMaxPlayers,
      isPrivate: !!isPrivate,
      botDifficulty: botDifficulty || null,
    });

    if (room.players?.length > 0) {
      room.players[0].ready = true;
    }

    if (wantsBot) {
      const started = startGame(room.code);
      if (started.error) {
        return res.status(400).json({ error: started.error });
      }
      return res.status(201).json({ room: sanitize(started.room) });
    }

    return res.status(201).json({ room: sanitize(room) });
  } catch (err) {
    console.error('POST /api/rooms failed:', err);
    return res.status(500).json({ error: 'Failed to create room' });
  }
});

// ── GET /api/rooms ────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const { gameId } = req.query;
    return res.json({ rooms: listPublicRooms(gameId) });
  } catch (err) {
    console.error('GET /api/rooms failed:', err);
    return res.status(500).json({ error: 'Failed to list rooms' });
  }
});

// ── GET /api/rooms/:code ──────────────────────────────────────────────────────
router.get('/:code', (req, res) => {
  try {
    const room = getRoom(req.params.code.toUpperCase());
    if (!room) return res.status(404).json({ error: 'Room not found' });

    return res.json({ room: sanitize(room) });
  } catch (err) {
    console.error('GET /api/rooms/:code failed:', err);
    return res.status(500).json({ error: 'Failed to get room' });
  }
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
    gameState: room.gameState || null,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      isBot: !!p.isBot,
      ready: !!p.ready,
    })),
  };
}

module.exports = router;