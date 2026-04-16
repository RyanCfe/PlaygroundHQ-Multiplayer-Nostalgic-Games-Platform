// ── Ludo Engine ──────────────────────────────────────────────────────────────
// Full Ludo with safe squares, home column, captures, bonus rolls on 6/capture

const COLORS = ['red', 'green', 'yellow', 'blue'];

// Main track positions (52 squares). Each piece starts off-board, enters at
// their color's start square, and goes around to the home column.
const START_SQUARES = { red: 0, green: 13, yellow: 26, blue: 39 };
const HOME_ENTRY    = { red: 50, green: 11, yellow: 24, blue: 37 };
const SAFE_SQUARES  = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

function createGame({ playerIds }) {
  const count = Math.min(Math.max(playerIds.length, 2), 4);
  const players = playerIds.slice(0, count);
  const colors = {};
  players.forEach((pid, i) => { colors[pid] = COLORS[i]; });

  const pieces = {};
  for (const pid of players) {
    pieces[pid] = Array.from({ length: 4 }, (_, i) => ({
      id: i,
      position: -1,   // -1 = home base, 0-51 = track, 52-57 = home column, 58 = finished
      finished: false,
    }));
  }

  return {
    players,
    colors,
    pieces,
    currentTurn: players[0],
    dice: null,
    extraRoll: false,
    mustRoll: true,
    winner: null,
    status: 'playing',
  };
}

function rollDice() { return Math.floor(Math.random() * 6) + 1; }

function getTrackPos(color, steps) {
  return (START_SQUARES[color] + steps) % 52;
}

function processMove(state, action, playerId) {
  if (state.status !== 'playing') return { error: 'Game over' };
  if (state.currentTurn !== playerId) return { error: 'Not your turn' };

  const next = structuredClone(state);

  // Roll dice
  if (action.type === 'roll') {
    if (!next.mustRoll) return { error: 'Already rolled' };
    const die = rollDice();
    next.dice = die;
    next.mustRoll = false;

    // Get movable pieces
    const color = next.colors[playerId];
    const movable = getMovablePieces(next.pieces[playerId], die, color);
    if (!movable.length) {
      // No valid moves — pass turn
      next.currentTurn = nextPlayer(next.players, playerId);
      next.mustRoll = true;
      next.dice = null;
    }
    return { state: next };
  }

  // Move piece
  if (action.type === 'move') {
    if (next.mustRoll) return { error: 'Must roll first' };
    const die = next.dice;
    const color = next.colors[playerId];
    const piece = next.pieces[playerId][action.pieceIndex];
    if (!piece) return { error: 'Invalid piece' };

    const movable = getMovablePieces(next.pieces[playerId], die, color);
    if (!movable.includes(action.pieceIndex)) return { error: 'Cannot move this piece' };

    let extraRoll = false;
    const oldPos = piece.position;

    if (piece.position === -1) {
      // Bring out from base (requires a 6)
      piece.position = 0; // steps from start
    } else {
      piece.position += die;
    }

    // Check home column transition
    if (piece.position >= 52) {
      piece.position = 58; // finished
      piece.finished = true;
      extraRoll = true;
    }

    // Capture check
    if (!piece.finished && piece.position >= 0 && piece.position < 52) {
      const trackPos = getTrackPos(color, piece.position);
      if (!SAFE_SQUARES.has(trackPos)) {
        for (const oppId of next.players) {
          if (oppId === playerId) continue;
          const oppColor = next.colors[oppId];
          for (const opp of next.pieces[oppId]) {
            if (!opp.finished && opp.position >= 0 && opp.position < 52) {
              const oppTrack = getTrackPos(oppColor, opp.position);
              if (oppTrack === trackPos) {
                opp.position = -1; // send back home
                extraRoll = true;
              }
            }
          }
        }
      }
    }

    // Bonus roll on 6
    if (die === 6) extraRoll = true;

    // Check winner
    if (next.pieces[playerId].every(p => p.finished)) {
      next.winner = playerId;
      next.status = 'finished';
      return { state: next };
    }

    next.dice = null;
    next.mustRoll = true;
    if (!extraRoll) {
      next.currentTurn = nextPlayer(next.players, playerId);
    }
    return { state: next };
  }

  return { error: 'Unknown action type' };
}

function getMovablePieces(pieces, die, color) {
  return pieces.reduce((acc, p, i) => {
    if (p.finished) return acc;
    if (p.position === -1 && die === 6) return [...acc, i];
    if (p.position >= 0) {
      const newPos = p.position + die;
      if (newPos <= 52) return [...acc, i]; // 52 = exactly home
    }
    return acc;
  }, []);
}

function getValidMoves(state, playerId) {
  if (state.mustRoll) return [{ type: 'roll' }];
  const color = state.colors[playerId];
  const movable = getMovablePieces(state.pieces[playerId], state.dice, color);
  return movable.map(i => ({ type: 'move', pieceIndex: i }));
}

function nextPlayer(players, current) {
  const idx = players.indexOf(current);
  return players[(idx + 1) % players.length];
}

function getBotMove(state, difficulty) {
  const playerId = state.currentTurn;
  const valid = getValidMoves(state, playerId);
  if (!valid.length) return null;
  if (valid[0].type === 'roll') return { type: 'roll' };

  // Strategy: prefer captures > bringing out pieces > advancing furthest piece
  const color = state.colors[playerId];
  let best = null, bestScore = -Infinity;

  for (const move of valid) {
    let score = 0;
    const piece = state.pieces[playerId][move.pieceIndex];
    if (piece.position === -1) score = 50; // bring out
    score += piece.position; // prefer advancing furthest

    // Check capture opportunity
    const newPos = piece.position === -1 ? 0 : piece.position + state.dice;
    const trackPos = (START_SQUARES[color] + newPos) % 52;
    for (const opp of state.players) {
      if (opp === playerId) continue;
      const oppColor = state.colors[opp];
      for (const op of state.pieces[opp]) {
        if (!op.finished && op.position >= 0) {
          const oppTrack = (START_SQUARES[oppColor] + op.position) % 52;
          if (oppTrack === trackPos && !SAFE_SQUARES.has(trackPos)) score += 200;
        }
      }
    }

    if (score > bestScore) { bestScore = score; best = move; }
  }

  return best || valid[Math.floor(Math.random() * valid.length)];
}

module.exports = { createGame, processMove, getValidMoves, getBotMove };
