// ── Snakes & Ladders Engine ──────────────────────────────────────────────────

const SNAKES  = { 99:1, 90:59, 78:40, 62:18, 50:36, 32:12, 24:3 };
const LADDERS = { 2:37, 7:14, 8:31, 15:26, 21:42, 28:84, 36:44, 51:67, 71:91, 78:98 };
// Merged teleport map
const TELEPORT = { ...SNAKES, ...LADDERS };

function createGame({ playerIds }) {
  const players = playerIds.slice(0, 4);
  const positions = {};
  players.forEach(p => { positions[p] = 0; });
  return {
    players,
    positions,
    currentTurn: players[0],
    dice: null,
    lastEvent: null, // snake|ladder|null
    winner: null,
    status: 'playing',
    mustRoll: true,
  };
}

function rollDice() { return Math.floor(Math.random() * 6) + 1; }

function processMove(state, action, playerId) {
  if (state.status !== 'playing') return { error: 'Game over' };
  if (state.currentTurn !== playerId) return { error: 'Not your turn' };
  if (!state.mustRoll) return { error: 'Already moved this turn' };

  const die = rollDice();
  const next = structuredClone(state);
  next.dice = die;

  let newPos = next.positions[playerId] + die;
  if (newPos > 100) {
    // Bounce back
    newPos = 100 - (newPos - 100);
  }

  let event = null;
  if (SNAKES[newPos])  { event = { type: 'snake',  from: newPos, to: SNAKES[newPos]  }; newPos = SNAKES[newPos];  }
  if (LADDERS[newPos]) { event = { type: 'ladder', from: newPos, to: LADDERS[newPos] }; newPos = LADDERS[newPos]; }

  next.positions[playerId] = newPos;
  next.lastEvent = event;

  if (newPos === 100) {
    next.winner = playerId;
    next.status = 'finished';
    return { state: next };
  }

  // 6 = roll again
  if (die !== 6) {
    const idx = next.players.indexOf(playerId);
    next.currentTurn = next.players[(idx + 1) % next.players.length];
  }
  // mustRoll stays true (next turn auto-rolls in Snakes & Ladders)
  return { state: next };
}

function getValidMoves(state, playerId) {
  if (state.currentTurn !== playerId || state.status !== 'playing') return [];
  return [{ type: 'roll' }];
}

function getBotMove() { return { type: 'roll' }; }

module.exports = { createGame, processMove, getValidMoves, getBotMove, SNAKES, LADDERS };
