// ── Hangman Engine ───────────────────────────────────────────────────────────

const WORD_BANK = {
  animals:   ['ELEPHANT','GIRAFFE','PENGUIN','KANGAROO','DOLPHIN','JAGUAR','PLATYPUS','CHIMPANZEE'],
  countries: ['BRAZIL','CANADA','ETHIOPIA','INDONESIA','UKRAINE','ARGENTINA','PORTUGAL','THAILAND'],
  sports:    ['BADMINTON','CRICKET','SWIMMING','GYMNASTICS','VOLLEYBALL','ARCHERY','WRESTLING'],
  food:      ['SPAGHETTI','CROISSANT','GUACAMOLE','DUMPLINGS','PAELLA','RATATOUILLE','CHURROS'],
  general:   ['ADVENTURE','BUTTERFLY','CHOCOLATE','DISCOVERY','ELEPHANT','FIREWORKS','MYSTERY'],
};

const MAX_WRONG = 6;

function pickWord(category) {
  const bank = WORD_BANK[category] || WORD_BANK.general;
  return bank[Math.floor(Math.random() * bank.length)];
}

function createGame({ playerIds, category = 'general' }) {
  const word = pickWord(category);
  const guessedBy = {};
  playerIds.forEach(p => { guessedBy[p] = []; });
  return {
    players: playerIds,
    word,         // hidden from guessers
    category,
    display: word.split('').map(() => '_'),
    guessedLetters: [],
    wrongGuesses: [],
    wrongCount: 0,
    maxWrong: MAX_WRONG,
    currentTurn: playerIds[0],
    status: 'playing',
    winner: null,
  };
}

function processMove(state, { letter }, playerId) {
  if (state.status !== 'playing') return { error: 'Game over' };
  if (state.currentTurn !== playerId) return { error: 'Not your turn' };
  const L = letter.toUpperCase();
  if (L.length !== 1 || !/[A-Z]/.test(L)) return { error: 'Invalid letter' };
  if (state.guessedLetters.includes(L)) return { error: 'Already guessed' };

  const next = structuredClone(state);
  next.guessedLetters.push(L);

  let hit = false;
  next.word.split('').forEach((ch, i) => {
    if (ch === L) { next.display[i] = L; hit = true; }
  });

  if (!hit) {
    next.wrongGuesses.push(L);
    next.wrongCount++;
  }

  // Check win
  if (!next.display.includes('_')) {
    next.status = 'finished';
    next.winner = playerId;
  } else if (next.wrongCount >= MAX_WRONG) {
    next.status = 'finished';
    next.winner = null; // word wins
    next.revealWord = next.word;
  } else {
    // Next player's turn
    const idx = next.players.indexOf(playerId);
    next.currentTurn = next.players[(idx + 1) % next.players.length];
  }
  return { state: next };
}

function getValidMoves(state, playerId) {
  if (state.status !== 'playing' || state.currentTurn !== playerId) return [];
  const all = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  return all.filter(l => !state.guessedLetters.includes(l));
}

function getBotMove(state, difficulty) {
  const valid = getValidMoves(state, state.currentTurn);
  if (!valid.length) return null;

  // Letter frequency in English
  const freq = 'ETAOINSHRDLCUMWFGYPBVKJXQZ'.split('').filter(l => valid.includes(l));

  if (difficulty === 'easy') return valid[Math.floor(Math.random() * valid.length)];
  if (difficulty === 'medium') return freq[Math.floor(Math.random() * 3)] || freq[0];
  return freq[0]; // hard: always best frequency
}

module.exports = { createGame, processMove, getValidMoves, getBotMove };
