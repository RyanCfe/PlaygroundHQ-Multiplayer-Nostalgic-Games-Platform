// ── Room Manager ─────────────────────────────────────────────────────────────

const { v4: uuidv4 } = require('uuid');
const { getEngine } = require('../engines');
const logger = require('../utils/logger');

// In-memory store. In production, back this with Redis.
const rooms = new Map();
const playerRoom = new Map(); // socketId → roomCode
const ROOM_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  let code = '';
  for (let i = 0; i < 3; i++) code += chars[Math.floor(Math.random() * chars.length)];
  code += '-';
  for (let i = 0; i < 3; i++) code += digits[Math.floor(Math.random() * digits.length)];
  // Guarantee uniqueness
  if (rooms.has(code)) return generateCode();
  return code;
}

function createRoom({ gameId, hostId, hostName, maxPlayers, isPrivate = false, botDifficulty = null }) {
  const code = generateCode();
  const room = {
    code,
    gameId,
    hostId,
    maxPlayers: maxPlayers || 2,
    isPrivate,
    botDifficulty,
    players: [{ id: hostId, name: hostName || 'Player 1', isBot: false, socketId: null, ready: false }],
    spectators: [],
    gameState: null,
    status: 'waiting',   // waiting | playing | finished
    createdAt: Date.now(),
    chat: [],
  };
  rooms.set(code, room);
  logger.info(`Room created: ${code} for game ${gameId} by ${hostId}`);
  return room;
}

function getRoom(code) {
  return rooms.get(code.toUpperCase()) || null;
}

function joinRoom(code, { playerId, playerName, socketId }) {
  const room = getRoom(code);
  if (!room) return { error: 'Room not found' };
  if (room.status === 'playing') return { error: 'Game already in progress' };
  if (room.players.length >= room.maxPlayers) return { error: 'Room is full' };
  if (room.players.find(p => p.id === playerId)) {
    // Reconnect
    const p = room.players.find(p => p.id === playerId);
    p.socketId = socketId;
    return { room, reconnected: true };
  }

  room.players.push({ id: playerId, name: playerName || `Player ${room.players.length + 1}`, isBot: false, socketId, ready: false });
  playerRoom.set(socketId, code);
  return { room };
}

function joinAsSpectator(code, { socketId }) {
  const room = getRoom(code);
  if (!room) return { error: 'Room not found' };
  room.spectators.push(socketId);
  return { room };
}

function setPlayerReady(code, playerId, ready = true) {
  const room = getRoom(code);
  if (!room) return { error: 'Room not found' };
  const p = room.players.find(p => p.id === playerId);
  if (p) p.ready = ready;
  return { room };
}

function startGame(code) {
  const room = getRoom(code);
  if (!room) return { error: 'Room not found' };
  if (room.status !== 'waiting') return { error: 'Room not waiting' };
  if (room.players.length < 1) return { error: 'Not enough players' };

  // Add bot if enabled and not enough human players
  if (room.botDifficulty && room.players.length < room.maxPlayers) {
    const botCount = room.maxPlayers - room.players.length;
    for (let i = 0; i < botCount; i++) {
      room.players.push({
        id: `bot_${uuidv4()}`,
        name: `Bot (${room.botDifficulty})`,
        isBot: true, socketId: null, ready: true,
        difficulty: room.botDifficulty,
      });
    }
  }

  const engine = getEngine(room.gameId);
  const playerIds = room.players.map(p => p.id);
  room.gameState = engine.createGame({ playerIds, ...room.gameOptions });
  room.status = 'playing';
  logger.info(`Game started in room ${code}: ${room.gameId} with ${playerIds.length} players`);
  return { room };
}

function processMove(code, move, playerId) {
  const room = getRoom(code);
  if (!room) return { error: 'Room not found' };
  if (room.status !== 'playing') return { error: 'Game not in progress' };

  const engine = getEngine(room.gameId);
  const result = engine.processMove(room.gameState, move, playerId);
  if (result.error) return result;

  room.gameState = result.state;
  if (room.gameState.status === 'finished') {
    room.status = 'finished';
  }
  return { room, state: result.state };
}

function removePlayer(socketId) {
  const code = playerRoom.get(socketId);
  if (!code) return null;
  const room = getRoom(code);
  if (!room) return null;

  const player = room.players.find(p => p.socketId === socketId);
  if (player) {
    player.socketId = null; // Mark disconnected but don't remove
    player.disconnected = true;
  }
  playerRoom.delete(socketId);
  return { room, player };
}

function addChatMessage(code, { playerId, playerName, message }) {
  const room = getRoom(code);
  if (!room) return null;
  const msg = { playerId, playerName, message: message.slice(0, 200), timestamp: Date.now() };
  room.chat.push(msg);
  if (room.chat.length > 100) room.chat.shift(); // Keep last 100
  return msg;
}

function resetGame(code) {
  const room = getRoom(code);
  if (!room) return { error: 'Room not found' };
  const engine = getEngine(room.gameId);
  const playerIds = room.players.filter(p => !p.isBot).map(p => p.id);
  room.gameState = engine.createGame({ playerIds });
  room.status = 'playing';
  return { room };
}

function listPublicRooms(gameId) {
  const list = [];
  for (const room of rooms.values()) {
    if (!room.isPrivate && room.status === 'waiting') {
      if (!gameId || room.gameId === gameId) {
        list.push({
          code: room.code,
          gameId: room.gameId,
          hostName: room.players[0]?.name,
          playerCount: room.players.length,
          maxPlayers: room.maxPlayers,
          createdAt: room.createdAt,
        });
      }
    }
  }
  return list.sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
}

// Cleanup expired rooms every 30 minutes
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [code, room] of rooms.entries()) {
    if (now - room.createdAt > ROOM_TTL_MS) {
      rooms.delete(code);
      cleaned++;
    }
  }
  if (cleaned) logger.info(`Cleaned up ${cleaned} expired rooms`);
}, 30 * 60 * 1000);

module.exports = {
  createRoom, getRoom, joinRoom, joinAsSpectator, setPlayerReady,
  startGame, processMove, removePlayer, addChatMessage, resetGame,
  listPublicRooms, rooms, playerRoom,
};
