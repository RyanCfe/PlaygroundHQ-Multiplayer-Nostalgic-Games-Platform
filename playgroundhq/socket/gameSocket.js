// ── Socket.io Game Event Handlers ───────────────────────────────────────────

const {
  createRoom, getRoom, joinRoom, joinAsSpectator,
  setPlayerReady, startGame, processMove, removePlayer,
  addChatMessage, resetGame, listPublicRooms, playerRoom,
} = require('./roomManager');
const { getEngine } = require('../engines');
const logger = require('../utils/logger');

// Track online count
let onlineCount = 0;

function initSocket(io) {
  io.on('connection', (socket) => {
    onlineCount++;
    io.emit('server:online_count', onlineCount);
    logger.info(`Socket connected: ${socket.id} [online: ${onlineCount}]`);

    // ── ROOM MANAGEMENT ──────────────────────────────────────────────────────

    socket.on('room:create', (data, cb) => {
      try {
        const { gameId, playerName, maxPlayers, isPrivate, botDifficulty } = data || {};
        if (!gameId) return cb?.({ error: 'gameId required' });

        const playerId = socket.data.userId || socket.id;

        // Bot rooms should be human + bot
        const effectiveMaxPlayers = botDifficulty ? 2 : (maxPlayers || 2);

        const room = createRoom({
          gameId,
          hostId: playerId,
          hostName: playerName || 'Host',
          maxPlayers: effectiveMaxPlayers,
          isPrivate: !!isPrivate,
          botDifficulty: botDifficulty || null,
        });

        // Update host socketId
        room.players[0].socketId = socket.id;
        room.players[0].ready = true; // host is ready immediately
        playerRoom.set(socket.id, room.code);
        socket.join(room.code);

        logger.info(`Room ${room.code} created by ${playerId}`);

        // If bot mode is enabled, auto-start immediately.
        // roomManager.startGame() already injects the bot if needed.
        if (botDifficulty) {
          const started = startGame(room.code);
          if (started.error) {
            return cb?.({ error: started.error });
          }

          const sanitized = sanitizeRoom(started.room, playerId);
          const clientState = getClientState(started.room, playerId);

          cb?.({
            room: sanitized,
            gameStarted: true,
            state: clientState,
          });

          io.to(room.code).emit('game:started', {
            state: clientState,
          });

          scheduleBotMove(io, room.code);
          return;
        }

        cb?.({ room: sanitizeRoom(room, playerId) });
      } catch (err) {
        logger.error('room:create error', err);
        cb?.({ error: 'Failed to create room' });
      }
    });

    socket.on('room:join', (data, cb) => {
      try {
        const { code, playerName } = data || {};
        if (!code) return cb?.({ error: 'Room code required' });

        const playerId = socket.data.userId || socket.id;
        const result = joinRoom(code, {
          playerId,
          playerName: playerName || 'Guest',
          socketId: socket.id,
        });

        if (result.error) return cb?.({ error: result.error });
        socket.join(code);

        const room = result.room;
        const sanitized = sanitizeRoom(room, playerId);

        cb?.({ room: sanitized, reconnected: result.reconnected });
        socket.to(code).emit('room:player_joined', {
          player: room.players.find(p => p.id === playerId),
          playerCount: room.players.length,
        });

        // Auto-start if full
        if (room.players.length >= room.maxPlayers && room.status === 'waiting') {
          const started = startGame(code);
          if (!started.error) {
            io.to(code).emit('game:started', {
              state: getClientState(started.room, null),
            });
            scheduleBotMove(io, code);
          }
        }
      } catch (err) {
        logger.error('room:join error', err);
        cb?.({ error: 'Failed to join room' });
      }
    });

    socket.on('room:join_spectator', (data, cb) => {
      const { code } = data || {};
      const result = joinAsSpectator(code, { socketId: socket.id });
      if (result.error) return cb?.({ error: result.error });
      socket.join(code);
      cb?.({ room: sanitizeRoom(result.room, null) });
    });

    socket.on('room:ready', (data, cb) => {
      const { code } = data || {};
      const playerId = socket.data.userId || socket.id;
      const result = setPlayerReady(code, playerId, true);
      if (result.error) return cb?.({ error: result.error });

      io.to(code).emit('room:player_ready', { playerId });
      const room = result.room;

      // Start if everyone's ready
      if (room.players.every(p => p.ready) && room.players.length >= 2) {
        const started = startGame(code);
        if (!started.error) {
          io.to(code).emit('game:started', {
            state: getClientState(started.room, null),
          });
          scheduleBotMove(io, code);
        }
      }
      cb?.({ ok: true });
    });

    socket.on('room:start', (data, cb) => {
      const { code } = data || {};
      const playerId = socket.data.userId || socket.id;
      const room = getRoom(code);
      if (!room) return cb?.({ error: 'Room not found' });
      if (room.players[0]?.id !== playerId) return cb?.({ error: 'Only host can start' });

      const result = startGame(code);
      if (result.error) return cb?.({ error: result.error });

      io.to(code).emit('game:started', {
        state: getClientState(result.room, null),
      });
      scheduleBotMove(io, code);
      cb?.({ ok: true });
    });

    socket.on('room:list', (data, cb) => {
      const { gameId } = data || {};
      cb?.({ rooms: listPublicRooms(gameId) });
    });

    socket.on('room:get', (data, cb) => {
      const { code } = data || {};
      const room = getRoom(code);
      if (!room) return cb?.({ error: 'Room not found' });
      const playerId = socket.data.userId || socket.id;
      cb?.({ room: sanitizeRoom(room, playerId) });
    });

    // ── GAME MOVES ───────────────────────────────────────────────────────────

    socket.on('game:move', (data, cb) => {
      try {
        const { code, move } = data || {};
        const playerId = socket.data.userId || socket.id;
        if (!code || !move) return cb?.({ error: 'code and move required' });

        const result = processMove(code, move, playerId);
        if (result.error) return cb?.({ error: result.error });

        const room = result.room;
        const state = result.state;

        io.to(code).emit('game:state_update', {
          state: getClientState(room, null),
          lastMove: { playerId, move },
        });

        if (state.status === 'finished') {
          io.to(code).emit('game:finished', {
            winner: state.winner,
            finalState: state,
          });
        } else {
          scheduleBotMove(io, code, 800);
        }

        cb?.({ ok: true, state });
      } catch (err) {
        logger.error('game:move error', err);
        cb?.({ error: 'Move failed' });
      }
    });

    // Memory match unlock
    socket.on('game:unlock', (data, cb) => {
      const { code } = data || {};
      const room = getRoom(code);
      if (!room) return cb?.({ error: 'Room not found' });

      const engine = getEngine(room.gameId);
      if (!engine.processUnlock) return cb?.({ error: 'Engine has no unlock' });

      const result = engine.processUnlock(room.gameState);
      if (result.error) return cb?.({ error: result.error });

      room.gameState = result.state;
      io.to(code).emit('game:state_update', { state: room.gameState });

      // If unlock hands turn to bot, let bot move
      scheduleBotMove(io, code, 600);

      cb?.({ ok: true });
    });

    socket.on('game:valid_moves', (data, cb) => {
      const { code } = data || {};
      const playerId = socket.data.userId || socket.id;
      const room = getRoom(code);
      if (!room) return cb?.({ error: 'Room not found' });

      const engine = getEngine(room.gameId);
      if (!engine.getValidMoves) return cb?.({ moves: [] });

      const moves = engine.getValidMoves(room.gameState, playerId);
      cb?.({ moves });
    });

    socket.on('game:rematch', (data, cb) => {
      const { code } = data || {};
      const playerId = socket.data.userId || socket.id;
      const room = getRoom(code);
      if (!room) return cb?.({ error: 'Room not found' });
      if (room.status !== 'finished') return cb?.({ error: 'Game not finished' });

      if (!room.rematchVotes) room.rematchVotes = new Set();
      room.rematchVotes.add(playerId);

      io.to(code).emit('game:rematch_vote', {
        playerId,
        count: room.rematchVotes.size,
        needed: room.players.filter(p => !p.isBot).length,
      });

      if (room.rematchVotes.size >= room.players.filter(p => !p.isBot).length) {
        room.rematchVotes.clear();
        const result = resetGame(code);
        if (!result.error) {
          io.to(code).emit('game:started', {
            state: getClientState(result.room, null),
          });
          scheduleBotMove(io, code);
        }
      }

      cb?.({ ok: true });
    });

    // ── CHAT ─────────────────────────────────────────────────────────────────

    socket.on('chat:message', (data, cb) => {
      const { code, message } = data || {};
      if (!message?.trim()) return cb?.({ error: 'Empty message' });

      const playerId = socket.data.userId || socket.id;
      const room = getRoom(code);
      const player = room?.players.find(p => p.id === playerId);

      const msg = addChatMessage(code, {
        playerId,
        playerName: player?.name || 'Guest',
        message: message.trim(),
      });

      if (msg) {
        io.to(code).emit('chat:message', msg);
        cb?.({ ok: true });
      }
    });

    socket.on('chat:reaction', (data) => {
      const { code, reaction } = data || {};
      const playerId = socket.data.userId || socket.id;
      const allowed = ['👏','😂','🔥','😱','🎉','👍','😤','🤯'];
      if (!allowed.includes(reaction)) return;
      socket.to(code).emit('chat:reaction', { playerId, reaction });
    });

    // ── DISCONNECT ───────────────────────────────────────────────────────────

    socket.on('disconnect', () => {
      onlineCount = Math.max(0, onlineCount - 1);
      io.emit('server:online_count', onlineCount);

      const result = removePlayer(socket.id);
      if (result?.room) {
        socket.to(result.room.code).emit('room:player_disconnected', {
          playerId: result.player?.id,
          playerName: result.player?.name,
        });
      }

      logger.info(`Socket disconnected: ${socket.id} [online: ${onlineCount}]`);
    });

    socket.on('ping', (cb) => cb?.({ time: Date.now(), online: onlineCount }));
  });

  return io;
}

// ── Bot Move Scheduler ───────────────────────────────────────────────────────

const botTimers = new Map();

function scheduleBotMove(io, code, delayMs = 1200) {
  if (botTimers.has(code)) return;

  const room = getRoom(code);
  if (!room || room.status !== 'playing') return;

  const state = room.gameState;
  if (!state) return;

  const currentPlayer = room.players.find(p => p.id === state.currentTurn);
  if (!currentPlayer?.isBot) return;

  const timer = setTimeout(() => {
    botTimers.delete(code);
    executeBotMove(io, code, currentPlayer);
  }, delayMs);

  botTimers.set(code, timer);
}

async function executeBotMove(io, code, botPlayer) {
  const room = getRoom(code);
  if (!room || room.status !== 'playing') return;

  const engine = getEngine(room.gameId);
  if (!engine.getBotMove) return;

  try {
    const move = engine.getBotMove(room.gameState, botPlayer.difficulty || 'medium');
    if (move === null || move === undefined) return;

    let moveObj;
    if (typeof move === 'object') {
      moveObj = move;
    } else {
      // map primitive bot outputs to expected engine input
      moveObj = { index: move, col: move, pit: move, cardIndex: move, letter: move };
    }

    const result = processMove(code, moveObj, botPlayer.id);
    if (result.error) {
      logger.warn(`Bot move failed in ${code}: ${result.error}`);
      return;
    }

    io.to(code).emit('game:state_update', {
      state: getClientState(result.room, null),
      lastMove: { playerId: botPlayer.id, move: moveObj, isBot: true },
    });

    if (result.state?.status === 'finished') {
      io.to(code).emit('game:finished', {
        winner: result.state.winner,
        finalState: result.state,
      });
    } else {
      scheduleBotMove(io, code, 1000);
    }
  } catch (err) {
    logger.error('Bot move execution error', err);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeRoom(room, playerId) {
  return {
    code: room.code,
    gameId: room.gameId,
    status: room.status,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      ready: p.ready,
      disconnected: !!p.disconnected,
      isYou: p.id === playerId,
    })),
    maxPlayers: room.maxPlayers,
    isPrivate: room.isPrivate,
    createdAt: room.createdAt,
    chat: room.chat?.slice(-20) || [],
  };
}

function getClientState(roomOrState, playerId) {
  const state = roomOrState?.gameState || roomOrState;
  if (!state) return null;

  const s = structuredClone(state);

  // Remove hidden info
  if ('word' in s && s.status !== 'finished') delete s.word;
  if ('secret' in s && s.status !== 'finished') delete s.secret;

  // Hide opponent boards in battleship only when we know the requesting player
  if (s.boards && playerId) {
    const opp = s.players?.find(p => p !== playerId);
    if (opp && s.boards[opp]) s.boards[opp] = null;
  }

  return s;
}

module.exports = { initSocket, scheduleBotMove };