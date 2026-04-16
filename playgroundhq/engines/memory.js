// ── Memory Match Engine ──────────────────────────────────────────────────────

const EMOJI_POOL = ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯',
                    '🦁','🐮','🐷','🐸','🐙','🦋','🌈','⭐','🍎','🍕',
                    '🚀','🎸','🎩','🌺','🔥','💎','🎪','🎭','🎯','🎲'];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createGame({ playerIds, gridSize = 4 }) {
  const pairCount = (gridSize * gridSize) / 2;
  const symbols = shuffle(EMOJI_POOL).slice(0, pairCount);
  const cards = shuffle([...symbols, ...symbols].map((sym, i) => ({
    id: i, symbol: sym, flipped: false, matched: false,
  })));

  const scores = {};
  playerIds.forEach(p => { scores[p] = 0; });

  return {
    players: playerIds,
    cards,
    scores,
    flipped: [],       // indices of currently flipped (unmatched) cards
    currentTurn: playerIds[0],
    lockBoard: false,
    totalPairs: pairCount,
    matchedPairs: 0,
    winner: null,
    status: 'playing',
    gridSize,
  };
}

function getValidMoves(state, playerId) {
  if (state.status !== 'playing' || state.currentTurn !== playerId || state.lockBoard) return [];
  return state.cards.reduce((acc, c, i) => (!c.flipped && !c.matched ? [...acc, i] : acc), []);
}

function processMove(state, { cardIndex }, playerId) {
  if (state.status !== 'playing') return { error: 'Game over' };
  if (state.currentTurn !== playerId) return { error: 'Not your turn' };
  if (state.lockBoard) return { error: 'Board locked — wait for flip animation' };
  if (state.cards[cardIndex].flipped || state.cards[cardIndex].matched) return { error: 'Card not available' };
  if (state.flipped.length >= 2) return { error: 'Already flipped two cards' };

  const next = structuredClone(state);
  next.cards[cardIndex].flipped = true;
  next.flipped.push(cardIndex);

  if (next.flipped.length === 2) {
    const [a, b] = next.flipped;
    if (next.cards[a].symbol === next.cards[b].symbol) {
      // Match!
      next.cards[a].matched = true;
      next.cards[b].matched = true;
      next.scores[playerId]++;
      next.matchedPairs++;
      next.flipped = [];
      if (next.matchedPairs === next.totalPairs) {
        // Find winner (highest score)
        let maxScore = -1, winner = null;
        let tie = false;
        for (const [pid, s] of Object.entries(next.scores)) {
          if (s > maxScore) { maxScore = s; winner = pid; tie = false; }
          else if (s === maxScore) { tie = true; }
        }
        next.winner = tie ? 'tie' : winner;
        next.status = 'finished';
      }
      // Same player goes again on match
    } else {
      // No match — lock board briefly, then flip back
      next.lockBoard = true;
      // Client should call 'unlock' after animation
    }
  }
  return { state: next };
}

function processUnlock(state) {
  if (!state.lockBoard) return { error: 'Board not locked' };
  const next = structuredClone(state);
  next.flipped.forEach(i => { next.cards[i].flipped = false; });
  next.flipped = [];
  next.lockBoard = false;
  const idx = next.players.indexOf(next.currentTurn);
  next.currentTurn = next.players[(idx + 1) % next.players.length];
  return { state: next };
}

function getBotMove(state, difficulty) {
  const botId = state.currentTurn;
  const valid = getValidMoves(state, botId);
  if (!valid.length) return null;

  // Hard bot: remembers previously seen cards
  if (difficulty === 'hard' && state.flipped.length === 1) {
    const target = state.cards[state.flipped[0]].symbol;
    const match = valid.find(i => state.cards[i].flipped === false && state.cards[i].symbol === target);
    if (match !== undefined) return match;
  }

  if (state.flipped.length === 1 && difficulty === 'medium' && Math.random() < 0.5) {
    const target = state.cards[state.flipped[0]].symbol;
    const match = valid.find(i => state.cards[i].symbol === target);
    if (match !== undefined) return match;
  }

  return valid[Math.floor(Math.random() * valid.length)];
}

module.exports = { createGame, processMove, processUnlock, getValidMoves, getBotMove };
