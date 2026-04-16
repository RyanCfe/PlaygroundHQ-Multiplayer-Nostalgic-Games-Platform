// ── Game Engine Registry ─────────────────────────────────────────────────────

const engines = {
  tictactoe:    require('./tictactoe'),
  connect4:     require('./connect4'),
  battleship:   require('./battleship'),
  ludo:         require('./ludo'),
  'snakes-ladders': require('./snakesladders'),
  'memory-match':   require('./memory'),
  wordle:       require('./wordle'),
  mancala:      require('./mancala'),
  mastermind:   require('./mastermind'),
  hangman:      require('./hangman'),
  'dots-boxes': require('./dotsandboxes'),
};

// Generic stub for games whose engine isn't implemented yet
// Maintains state, accepts moves, but doesn't validate rules deeply
function createStubEngine(gameId) {
  return {
    createGame({ playerIds }) {
      return {
        gameId,
        players: playerIds,
        currentTurn: playerIds[0],
        status: 'playing',
        winner: null,
        moves: [],
        state: {},
      };
    },
    processMove(state, move, playerId) {
      if (state.currentTurn !== playerId) return { error: 'Not your turn' };
      const next = structuredClone(state);
      next.moves.push({ playerId, move, timestamp: Date.now() });
      const idx = next.players.indexOf(playerId);
      next.currentTurn = next.players[(idx + 1) % next.players.length];
      return { state: next };
    },
    getValidMoves(state, playerId) {
      if (state.currentTurn !== playerId) return [];
      return [{ type: 'any' }];
    },
    getBotMove(state) {
      return { type: 'pass' };
    },
  };
}

// Games using stub engines (not yet fully implemented)
const STUB_GAMES = [
  'chess', 'checkers', 'othello', 'go', 'nim', 'nine-mens-morris', 'halma',
  'chinese-checkers', 'fox-hounds', 'blokus', 'monopoly', 'clue', 'risk',
  'backgammon', 'carrom', 'pachisi', 'jenga', 'mahjong', 'shut-the-box',
  'crokinole', 'yahtzee', 'liar-dice', 'farkle', 'bunco', 'dominoes',
  'uno', 'crazy-eights', 'snap', 'war', 'go-fish', 'old-maid', 'slapjack',
  'rummy', 'solitaire', 'hearts', 'spades', 'scrabble', 'boggle', 'ghost',
  'sudoku', '2048', 'minesweeper', 'trivia', 'pictionary',
  'twenty-questions', 'bingo', 'taboo',
];

STUB_GAMES.forEach(id => {
  if (!engines[id]) engines[id] = createStubEngine(id);
});

function getEngine(gameId) {
  return engines[gameId] || createStubEngine(gameId);
}

function isImplemented(gameId) {
  return !!engines[gameId] && !STUB_GAMES.includes(gameId);
}

module.exports = { getEngine, isImplemented, engines };
