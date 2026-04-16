// ── Tic Tac Toe Engine ───────────────────────────────────────────────────────

const EMPTY = null;
const WIN_LINES = [
  [0,1,2],[3,4,5],[6,7,8],   // rows
  [0,3,6],[1,4,7],[2,5,8],   // cols
  [0,4,8],[2,4,6],           // diags
];

function createGame({ playerIds }) {
  return {
    board: Array(9).fill(EMPTY),
    players: playerIds.slice(0, 2),
    symbols: { [playerIds[0]]: 'X', [playerIds[1]]: 'O' },
    currentTurn: playerIds[0],
    winner: null,
    draw: false,
    winLine: null,
    moveCount: 0,
    status: 'playing', // playing | finished
  };
}

function getValidMoves(state, playerId) {
  if (state.status !== 'playing' || state.currentTurn !== playerId) return [];
  return state.board.reduce((acc, cell, i) => (cell === EMPTY ? [...acc, i] : acc), []);
}

function processMove(state, { index }, playerId) {
  if (state.status !== 'playing') return { error: 'Game is over' };
  if (state.currentTurn !== playerId) return { error: 'Not your turn' };
  if (state.board[index] !== EMPTY) return { error: 'Cell already occupied' };

  const next = structuredClone(state);
  next.board[index] = next.symbols[playerId];
  next.moveCount++;

  const win = checkWin(next.board, next.symbols[playerId]);
  if (win) {
    next.winner = playerId;
    next.winLine = win;
    next.status = 'finished';
  } else if (next.moveCount === 9) {
    next.draw = true;
    next.status = 'finished';
  } else {
    next.currentTurn = next.players.find(p => p !== playerId);
  }
  return { state: next };
}

function checkWin(board, symbol) {
  for (const line of WIN_LINES) {
    if (line.every(i => board[i] === symbol)) return line;
  }
  return null;
}

// Bot: minimax
function getBotMove(state, difficulty) {
  const valid = getValidMoves(state, state.currentTurn);
  if (!valid.length) return null;

  if (difficulty === 'easy') {
    // 40% random
    if (Math.random() < 0.4) return valid[Math.floor(Math.random() * valid.length)];
  }
  if (difficulty === 'medium') {
    if (Math.random() < 0.2) return valid[Math.floor(Math.random() * valid.length)];
  }

  const botSymbol = state.symbols[state.currentTurn];
  const oppSymbol = Object.values(state.symbols).find(s => s !== botSymbol);
  const [botId, oppId] = state.currentTurn === state.players[0]
    ? [state.players[0], state.players[1]]
    : [state.players[1], state.players[0]];

  let best = -Infinity, bestMove = valid[0];
  for (const idx of valid) {
    const result = processMove(state, { index: idx }, state.currentTurn);
    if (result.error) continue;
    const score = minimax(result.state, false, botId, oppId, -Infinity, Infinity);
    if (score > best) { best = score; bestMove = idx; }
  }
  return bestMove;
}

function minimax(state, isMax, botId, oppId, alpha, beta) {
  if (state.status === 'finished') {
    if (state.winner === botId) return 10 - state.moveCount;
    if (state.winner === oppId) return state.moveCount - 10;
    return 0;
  }
  const currentId = isMax ? botId : oppId;
  const moves = getValidMoves(state, currentId);
  let best = isMax ? -Infinity : Infinity;
  for (const idx of moves) {
    const result = processMove(state, { index: idx }, currentId);
    if (result.error) continue;
    const val = minimax(result.state, !isMax, botId, oppId, alpha, beta);
    best = isMax ? Math.max(best, val) : Math.min(best, val);
    if (isMax) alpha = Math.max(alpha, best); else beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

module.exports = { createGame, processMove, getValidMoves, getBotMove };
