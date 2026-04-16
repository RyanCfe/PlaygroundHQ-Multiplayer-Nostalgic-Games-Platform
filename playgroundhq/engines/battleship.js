// ── Battleship Engine ────────────────────────────────────────────────────────

const GRID = 10;
const SHIPS = [
  { name: 'Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Cruiser', size: 3 },
  { name: 'Submarine', size: 3 },
  { name: 'Destroyer', size: 2 },
];

function emptyGrid() {
  return Array.from({ length: GRID }, () => Array(GRID).fill(null));
}

function createGame({ playerIds, fleets }) {
  // fleets: { [playerId]: [{ name, cells: [[r,c]...] }] }
  const players = playerIds.slice(0, 2);
  const boards = {};
  const hits = {};
  const sunkShips = {};

  for (const pid of players) {
    boards[pid] = emptyGrid();
    hits[pid] = emptyGrid();
    sunkShips[pid] = [];
    const fleet = (fleets && fleets[pid]) || autoPlace(players.indexOf(pid));
    for (const ship of fleet) {
      for (const [r, c] of ship.cells) boards[pid][r][c] = ship.name;
    }
  }

  return {
    players,
    boards,        // hidden from opponent
    hits,          // what attacks have landed
    sunkShips,
    fleets: fleets || null,
    currentTurn: players[0],
    status: 'playing',
    winner: null,
    lastShot: null,
  };
}

function autoPlace(seed) {
  const grid = emptyGrid();
  const placed = [];
  const rng = mulberry32(seed * 12345 + 9999);
  for (const ship of SHIPS) {
    let tries = 0;
    while (tries < 200) {
      const horiz = rng() > 0.5;
      const r = Math.floor(rng() * (GRID - (horiz ? 0 : ship.size)));
      const c = Math.floor(rng() * (GRID - (horiz ? ship.size : 0)));
      const cells = Array.from({ length: ship.size }, (_, i) => horiz ? [r, c+i] : [r+i, c]);
      if (cells.every(([cr, cc]) => !grid[cr][cc])) {
        cells.forEach(([cr, cc]) => grid[cr][cc] = ship.name);
        placed.push({ name: ship.name, size: ship.size, cells });
        break;
      }
      tries++;
    }
  }
  return placed;
}

function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function getValidMoves(state, playerId) {
  if (state.status !== 'playing' || state.currentTurn !== playerId) return [];
  const oppId = state.players.find(p => p !== playerId);
  const moves = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (state.hits[oppId][r][c] === null) moves.push([r, c]);
    }
  }
  return moves;
}

function processMove(state, { row, col }, playerId) {
  if (state.status !== 'playing') return { error: 'Game over' };
  if (state.currentTurn !== playerId) return { error: 'Not your turn' };
  const oppId = state.players.find(p => p !== playerId);
  if (state.hits[oppId][row][col] !== null) return { error: 'Already fired there' };

  const next = structuredClone(state);
  const shipName = next.boards[oppId][row][col];
  const hit = !!shipName;
  next.hits[oppId][row][col] = hit ? 'hit' : 'miss';
  next.lastShot = { row, col, hit, shipName };

  if (hit) {
    // Check if sunk
    const fleet = getFleet(next.boards[oppId]);
    const ship = fleet.find(s => s.name === shipName);
    if (ship && ship.cells.every(([r, c]) => next.hits[oppId][r][c] === 'hit')) {
      next.sunkShips[oppId].push(shipName);
      next.lastShot.sunk = shipName;
    }
    if (next.sunkShips[oppId].length === SHIPS.length) {
      next.winner = playerId;
      next.status = 'finished';
      return { state: next };
    }
  }
  next.currentTurn = oppId;
  return { state: next };
}

function getFleet(board) {
  const ships = {};
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const s = board[r][c];
      if (s) {
        if (!ships[s]) ships[s] = { name: s, cells: [] };
        ships[s].cells.push([r, c]);
      }
    }
  }
  return Object.values(ships);
}

// Sanitize state for a specific player (hide opponent's board)
function getPlayerView(state, playerId) {
  const oppId = state.players.find(p => p !== playerId);
  const view = structuredClone(state);
  // Mask opponent's board
  view.boards[oppId] = emptyGrid();
  return view;
}

function getBotMove(state, difficulty) {
  const botId = state.currentTurn;
  const oppId = state.players.find(p => p !== botId);
  const hitMap = state.hits[oppId];

  if (difficulty === 'easy') {
    const valid = getValidMoves(state, botId);
    return valid[Math.floor(Math.random() * valid.length)];
  }

  // Hunt mode: find adjacent cells to existing hits
  const hitCells = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (hitMap[r][c] === 'hit') hitCells.push([r, c]);
    }
  }

  // Check for direction pattern
  if (hitCells.length > 0 && difficulty !== 'easy') {
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    for (const [hr, hc] of hitCells) {
      for (const [dr, dc] of dirs) {
        const nr = hr + dr, nc = hc + dc;
        if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID && hitMap[nr][nc] === null) {
          return [nr, nc];
        }
      }
    }
  }

  // Parity targeting for hard mode
  if (difficulty === 'hard') {
    const parityMoves = [];
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if ((r + c) % 2 === 0 && hitMap[r][c] === null) parityMoves.push([r, c]);
      }
    }
    if (parityMoves.length) return parityMoves[Math.floor(Math.random() * parityMoves.length)];
  }

  const valid = getValidMoves(state, botId);
  return valid[Math.floor(Math.random() * valid.length)];
}

module.exports = { createGame, processMove, getValidMoves, getBotMove, getPlayerView, autoPlace };
