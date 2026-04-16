// ── Dots & Boxes Engine ──────────────────────────────────────────────────────
// Grid of (size x size) boxes. Lines are stored as h[row][col] (horizontal) and v[row][col] (vertical)

function createGame({ playerIds, size = 5 }) {
  const h = Array.from({ length: size + 1 }, () => Array(size).fill(null));
  const v = Array.from({ length: size }, () => Array(size + 1).fill(null));
  const boxes = Array.from({ length: size }, () => Array(size).fill(null));
  const scores = {};
  playerIds.forEach(p => { scores[p] = 0; });

  return {
    players: playerIds.slice(0, 4),
    size,
    h, v, boxes,
    scores,
    currentTurn: playerIds[0],
    status: 'playing',
    winner: null,
    totalBoxes: size * size,
    claimedBoxes: 0,
  };
}

function getValidMoves(state, playerId) {
  if (state.status !== 'playing' || state.currentTurn !== playerId) return [];
  const moves = [];
  for (let r = 0; r <= state.size; r++) {
    for (let c = 0; c < state.size; c++) {
      if (!state.h[r][c]) moves.push({ type: 'h', row: r, col: c });
    }
  }
  for (let r = 0; r < state.size; r++) {
    for (let c = 0; c <= state.size; c++) {
      if (!state.v[r][c]) moves.push({ type: 'v', row: r, col: c });
    }
  }
  return moves;
}

function processMove(state, { type, row, col }, playerId) {
  if (state.status !== 'playing') return { error: 'Game over' };
  if (state.currentTurn !== playerId) return { error: 'Not your turn' };

  const next = structuredClone(state);
  if (type === 'h') {
    if (next.h[row][col]) return { error: 'Line taken' };
    next.h[row][col] = playerId;
  } else {
    if (next.v[row][col]) return { error: 'Line taken' };
    next.v[row][col] = playerId;
  }

  let captured = 0;
  const { h, v, boxes } = next;
  for (let r = 0; r < next.size; r++) {
    for (let c = 0; c < next.size; c++) {
      if (!boxes[r][c] && h[r][c] && h[r+1][c] && v[r][c] && v[r][c+1]) {
        boxes[r][c] = playerId;
        next.scores[playerId]++;
        next.claimedBoxes++;
        captured++;
      }
    }
  }

  if (next.claimedBoxes === next.totalBoxes) {
    next.status = 'finished';
    let maxScore = 0, winner = null, tie = false;
    for (const [pid, s] of Object.entries(next.scores)) {
      if (s > maxScore) { maxScore = s; winner = pid; tie = false; }
      else if (s === maxScore) tie = true;
    }
    next.winner = tie ? 'tie' : winner;
  } else if (captured === 0) {
    const idx = next.players.indexOf(playerId);
    next.currentTurn = next.players[(idx + 1) % next.players.length];
  }
  // Captured box → same player goes again

  return { state: next };
}

function countBoxLines(state, r, c) {
  const { h, v } = state;
  let count = 0;
  if (h[r][c]) count++;
  if (h[r+1][c]) count++;
  if (v[r][c]) count++;
  if (v[r][c+1]) count++;
  return count;
}

function getBotMove(state, difficulty) {
  const valid = getValidMoves(state, state.currentTurn);
  if (!valid.length) return null;
  if (difficulty === 'easy') return valid[Math.floor(Math.random() * valid.length)];

  // Look for a completing move (3 lines already)
  for (const move of valid) {
    const test = structuredClone(state);
    if (move.type === 'h') test.h[move.row][move.col] = 'test';
    else test.v[move.row][move.col] = 'test';
    let completes = false;
    for (let r = 0; r < test.size; r++) {
      for (let c = 0; c < test.size; c++) {
        if (!test.boxes[r][c] && test.h[r][c] && test.h[r+1][c] && test.v[r][c] && test.v[r][c+1]) {
          completes = true;
        }
      }
    }
    if (completes) return move;
  }

  // Avoid giving opponent a box (don't draw 3rd line of a box)
  const safe = valid.filter(move => {
    const test = structuredClone(state);
    if (move.type === 'h') test.h[move.row][move.col] = 'test';
    else test.v[move.row][move.col] = 'test';
    for (let r = 0; r < test.size; r++) {
      for (let c = 0; c < test.size; c++) {
        if (!test.boxes[r][c] && countBoxLines(test, r, c) === 3) return false;
      }
    }
    return true;
  });

  const pool = safe.length ? safe : valid;
  return pool[Math.floor(Math.random() * pool.length)];
}

module.exports = { createGame, processMove, getValidMoves, getBotMove };
