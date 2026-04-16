// ── Mancala (Kalah) Engine ───────────────────────────────────────────────────
// Standard Kalah rules: 6 pits per player + 1 store each
// Pits 0-5: Player 1, Pit 6: P1 store, Pits 7-12: P2, Pit 13: P2 store

const P1_PITS = [0,1,2,3,4,5];
const P2_PITS = [7,8,9,10,11,12];
const P1_STORE = 6;
const P2_STORE = 13;
const TOTAL = 14;

function createGame({ playerIds }) {
  const board = Array(TOTAL).fill(4);
  board[P1_STORE] = 0;
  board[P2_STORE] = 0;
  return {
    players: playerIds.slice(0, 2),
    board,
    currentTurn: playerIds[0],
    status: 'playing',
    winner: null,
    lastSow: null,
  };
}

function getValidMoves(state, playerId) {
  if (state.status !== 'playing' || state.currentTurn !== playerId) return [];
  const pits = playerId === state.players[0] ? P1_PITS : P2_PITS;
  return pits.filter(i => state.board[i] > 0);
}

function processMove(state, { pit }, playerId) {
  if (state.status !== 'playing') return { error: 'Game over' };
  if (state.currentTurn !== playerId) return { error: 'Not your turn' };

  const pits = playerId === state.players[0] ? P1_PITS : P2_PITS;
  const myStore = playerId === state.players[0] ? P1_STORE : P2_STORE;
  const oppStore = playerId === state.players[0] ? P2_STORE : P1_STORE;

  if (!pits.includes(pit)) return { error: 'Not your pit' };
  if (state.board[pit] === 0) return { error: 'Empty pit' };

  const next = structuredClone(state);
  let seeds = next.board[pit];
  next.board[pit] = 0;
  let idx = pit;

  while (seeds > 0) {
    idx = (idx + 1) % TOTAL;
    if (idx === oppStore) continue; // skip opponent's store
    next.board[idx]++;
    seeds--;
  }

  next.lastSow = idx;
  let extraTurn = false;

  // Last seed in own store → extra turn
  if (idx === myStore) {
    extraTurn = true;
  }

  // Capture: last seed in own empty pit, opposite pit has seeds
  if (!extraTurn && pits.includes(idx) && next.board[idx] === 1) {
    const opposite = 12 - idx; // pit mirror
    if (next.board[opposite] > 0) {
      next.board[myStore] += next.board[idx] + next.board[opposite];
      next.board[idx] = 0;
      next.board[opposite] = 0;
    }
  }

  // Check game over
  const p1Empty = P1_PITS.every(i => next.board[i] === 0);
  const p2Empty = P2_PITS.every(i => next.board[i] === 0);
  if (p1Empty || p2Empty) {
    // Sweep remaining seeds
    P1_PITS.forEach(i => { next.board[P1_STORE] += next.board[i]; next.board[i] = 0; });
    P2_PITS.forEach(i => { next.board[P2_STORE] += next.board[i]; next.board[i] = 0; });
    next.status = 'finished';
    if (next.board[P1_STORE] > next.board[P2_STORE]) next.winner = next.players[0];
    else if (next.board[P2_STORE] > next.board[P1_STORE]) next.winner = next.players[1];
    else next.winner = 'tie';
  } else if (!extraTurn) {
    next.currentTurn = next.players.find(p => p !== playerId);
  }

  return { state: next };
}

function score(board, playerId, state) {
  const myStore = playerId === state.players[0] ? P1_STORE : P2_STORE;
  const oppStore = playerId === state.players[0] ? P2_STORE : P1_STORE;
  return board[myStore] - board[oppStore];
}

function minimax(state, depth, isMax, botId, alpha, beta) {
  if (state.status === 'finished') {
    if (state.winner === botId) return 1000;
    if (state.winner === 'tie') return 0;
    return -1000;
  }
  if (depth === 0) return score(state.board, botId, state);

  const playerId = isMax ? botId : state.players.find(p => p !== botId);
  const moves = getValidMoves(state, playerId);
  if (!moves.length) return score(state.board, botId, state);

  let best = isMax ? -Infinity : Infinity;
  for (const pit of moves) {
    const result = processMove(state, { pit }, playerId);
    if (result.error) continue;
    const v = minimax(result.state, depth - 1, !isMax, botId, alpha, beta);
    best = isMax ? Math.max(best, v) : Math.min(best, v);
    if (isMax) alpha = Math.max(alpha, best); else beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

function getBotMove(state, difficulty) {
  const botId = state.currentTurn;
  const valid = getValidMoves(state, botId);
  if (!valid.length) return null;
  const depths = { easy: 2, medium: 5, hard: 9 };
  const depth = depths[difficulty] || 5;

  let best = -Infinity, bestPit = valid[0];
  for (const pit of valid) {
    const result = processMove(state, { pit }, botId);
    if (result.error) continue;
    const v = minimax(result.state, depth - 1, false, botId, -Infinity, Infinity);
    if (v > best) { best = v; bestPit = pit; }
  }
  return bestPit;
}

module.exports = { createGame, processMove, getValidMoves, getBotMove };
