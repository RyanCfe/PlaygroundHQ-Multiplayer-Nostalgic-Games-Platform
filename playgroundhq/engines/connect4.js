// ── Connect 4 Engine ─────────────────────────────────────────────────────────

const ROWS = 6, COLS = 7;

function createGame({ playerIds }) {
  return {
    board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
    players: playerIds.slice(0, 2),
    symbols: { [playerIds[0]]: 1, [playerIds[1]]: 2 },
    currentTurn: playerIds[0],
    winner: null,
    draw: false,
    winCells: null,
    moveCount: 0,
    status: 'playing',
  };
}

function dropRow(board, col) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (!board[r][col]) return r;
  }
  return -1; // full
}

function getValidMoves(state, playerId) {
  if (state.status !== 'playing' || state.currentTurn !== playerId) return [];
  return Array.from({ length: COLS }, (_, c) => c).filter(c => dropRow(state.board, c) >= 0);
}

function processMove(state, { col }, playerId) {
  if (state.status !== 'playing') return { error: 'Game is over' };
  if (state.currentTurn !== playerId) return { error: 'Not your turn' };
  const row = dropRow(state.board, col);
  if (row < 0) return { error: 'Column is full' };

  const next = structuredClone(state);
  const sym = next.symbols[playerId];
  next.board[row][col] = sym;
  next.moveCount++;

  const win = checkWin(next.board, row, col, sym);
  if (win) {
    next.winner = playerId;
    next.winCells = win;
    next.status = 'finished';
  } else if (next.moveCount === ROWS * COLS) {
    next.draw = true;
    next.status = 'finished';
  } else {
    next.currentTurn = next.players.find(p => p !== playerId);
  }
  return { state: next };
}

function checkWin(board, row, col, sym) {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (const [dr, dc] of dirs) {
    const cells = [[row, col]];
    for (const sign of [1, -1]) {
      for (let i = 1; i < 4; i++) {
        const r = row + dr * i * sign, c = col + dc * i * sign;
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r][c] !== sym) break;
        cells.push([r, c]);
      }
    }
    if (cells.length >= 4) return cells;
  }
  return null;
}

// Heuristic score for a window of 4
function scoreWindow(window, sym, opp) {
  const s = window.filter(c => c === sym).length;
  const o = window.filter(c => c === opp).length;
  const e = window.filter(c => !c).length;
  if (s === 4) return 100;
  if (s === 3 && e === 1) return 5;
  if (s === 2 && e === 2) return 2;
  if (o === 3 && e === 1) return -4;
  return 0;
}

function heuristicScore(board, sym, opp) {
  let score = 0;
  // center column preference
  const centerCol = board.map(r => r[Math.floor(COLS/2)]);
  score += centerCol.filter(c => c === sym).length * 3;

  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of dirs) {
        const window = [];
        for (let i = 0; i < 4; i++) {
          const nr = r + dr*i, nc = c + dc*i;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
          window.push(board[nr][nc]);
        }
        if (window.length === 4) score += scoreWindow(window, sym, opp);
      }
    }
  }
  return score;
}

function minimax(board, depth, isMax, botSym, oppSym, botId, oppId, alpha, beta) {
  const validCols = Array.from({ length: COLS }, (_, c) => c).filter(c => dropRow(board, c) >= 0);
  if (depth === 0 || !validCols.length) return heuristicScore(board, botSym, oppSym);

  let best = isMax ? -Infinity : Infinity;
  for (const col of validCols) {
    const row = dropRow(board, col);
    const next = board.map(r => [...r]);
    next[row][col] = isMax ? botSym : oppSym;
    if (checkWin(next, row, col, isMax ? botSym : oppSym)) {
      if (isMax) return 1000 + depth;
      else return -(1000 + depth);
    }
    const val = minimax(next, depth - 1, !isMax, botSym, oppSym, botId, oppId, alpha, beta);
    best = isMax ? Math.max(best, val) : Math.min(best, val);
    if (isMax) alpha = Math.max(alpha, best); else beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

function getBotMove(state, difficulty) {
  const valid = getValidMoves(state, state.currentTurn);
  if (!valid.length) return null;

  const depths = { easy: 1, medium: 4, hard: 7 };
  const depth = depths[difficulty] || 4;

  const botId = state.currentTurn;
  const oppId = state.players.find(p => p !== botId);
  const botSym = state.symbols[botId];
  const oppSym = state.symbols[oppId];

  if (difficulty === 'easy' && Math.random() < 0.35) {
    return valid[Math.floor(Math.random() * valid.length)];
  }

  let best = -Infinity, bestCol = valid[Math.floor(valid.length / 2)];
  for (const col of valid) {
    const row = dropRow(state.board, col);
    const next = state.board.map(r => [...r]);
    next[row][col] = botSym;
    if (checkWin(next, row, col, botSym)) return col;
    const val = minimax(next, depth - 1, false, botSym, oppSym, botId, oppId, -Infinity, Infinity);
    if (val > best) { best = val; bestCol = col; }
  }
  return bestCol;
}

module.exports = { createGame, processMove, getValidMoves, getBotMove };
