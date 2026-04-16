// ── Wordle Engine ────────────────────────────────────────────────────────────

const WORD_LIST = [
  'CRANE', 'STARE', 'SLATE', 'TRACE', 'GREAT', 'AUDIO', 'STORM', 'BRAVE', 'LIGHT',
  'PLANE', 'FLOCK', 'MAGIC', 'DREAM', 'CRISP', 'PIXEL', 'BEACH', 'HEART', 'QUEST',
  'BLAZE', 'CRIMP', 'DRAFT', 'EMBER', 'FROST', 'GLOOM', 'HASTE', 'IRONY', 'JUDGE',
  'KNEEL', 'LEMON', 'MIGHT', 'NOBLE', 'OPERA', 'PRIDE', 'QUILL', 'RIDER', 'SHAKE',
  'TIGER', 'ULTRA', 'VIVID', 'WALTZ', 'YACHT', 'ZEBRA', 'AMPLE', 'BLAND', 'CLOWN',
  'DAISY', 'EAGER', 'FAITH', 'GUARD', 'HAVEN', 'IDEAL', 'JEWEL', 'KNACK', 'LABOR',
  'MANOR', 'NAIVE', 'OCEAN', 'PAINT', 'QUEEN', 'RELIC', 'SCOUT', 'THROW', 'UNDER',
  'VAPOR', 'WATCH', 'XENON', 'YEARN', 'ZONAL', 'ABIDE', 'BLISS', 'CIVIL', 'DOZEN',
  'ELITE', 'FLORA', 'GLOBE', 'HUMOR', 'INFER', 'JOUST', 'KOALA', 'LUCID', 'MAPLE',
  'NERVE', 'OZONE', 'PEARL', 'QUIET', 'RALLY', 'SWAMP', 'TORCH', 'UNITY', 'VENUE',
  'WHIRL', 'AXIOM', 'BONUS', 'CHORD', 'DEBUT', 'ENVOY', 'FLINT', 'GRAIL', 'HAIKU',
  'INGOT', 'JELLY', 'KARMA', 'LLAMA', 'MOTTO', 'NICHE', 'ORBIT', 'PORCH', 'QUOTA',
  'RADAR', 'SPINE', 'TIDAL', 'URBAN', 'VIOLA', 'WHACK', 'EXTRA', 'YOUNG', 'ZIPPY',
];

const VALID_WORDS = new Set(WORD_LIST);

const MAX_GUESSES = 6;
const WORD_LENGTH = 5;

function pickWord(seed) {
  if (seed !== undefined) {
    return WORD_LIST[seed % WORD_LIST.length];
  }
  return WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
}

function createGame({ playerIds, seed }) {
  const word = pickWord(seed);
  const scores = {};
  playerIds.forEach(p => { scores[p] = { guesses: [], solved: false, solvedIn: null }; });

  return {
    players: playerIds,
    word,       // hidden from players in API response
    wordLength: WORD_LENGTH,
    maxGuesses: MAX_GUESSES,
    scores,
    status: 'playing',
    winner: null,
  };
}

function processMove(state, { guess }, playerId) {
  if (state.status !== 'playing') return { error: 'Game over' };
  const playerScore = state.scores[playerId];
  if (!playerScore) return { error: 'Player not in game' };
  if (playerScore.solved) return { error: 'Already solved' };
  if (playerScore.guesses.length >= MAX_GUESSES) return { error: 'No guesses remaining' };

  const word = guess.toUpperCase();
  if (word.length !== WORD_LENGTH) return { error: `Guess must be ${WORD_LENGTH} letters` };

  const next = structuredClone(state);
  const result = evaluateGuess(word, state.word);
  next.scores[playerId].guesses.push({ word, result });

  if (result.every(r => r === 'correct')) {
    next.scores[playerId].solved = true;
    next.scores[playerId].solvedIn = next.scores[playerId].guesses.length;
  }

  // Check if all players are done
  const allDone = next.players.every(p => {
    const s = next.scores[p];
    return s.solved || s.guesses.length >= MAX_GUESSES;
  });

  if (allDone) {
    next.status = 'finished';
    // Winner: solved with fewest guesses
    const solvers = next.players
      .filter(p => next.scores[p].solved)
      .sort((a, b) => next.scores[a].solvedIn - next.scores[b].solvedIn);
    next.winner = solvers[0] || null;
    next.revealWord = next.word;
  }

  return { state: next };
}

function evaluateGuess(guess, answer) {
  const result = Array(WORD_LENGTH).fill('absent');
  const answerChars = answer.split('');
  const guessChars = guess.split('');
  const used = Array(WORD_LENGTH).fill(false);

  // First pass: correct
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guessChars[i] === answerChars[i]) {
      result[i] = 'correct';
      used[i] = true;
    }
  }
  // Second pass: present
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i] === 'correct') continue;
    for (let j = 0; j < WORD_LENGTH; j++) {
      if (!used[j] && guessChars[i] === answerChars[j] && result[j] !== 'correct') {
        result[i] = 'present';
        used[j] = true;
        break;
      }
    }
  }
  return result;
}

function getValidMoves() { return [{ type: 'guess' }]; }
function getBotMove(state, difficulty) { return null; } // Wordle is solo

// Sanitize state for client (hide word)
function getClientState(state, playerId) {
  const s = structuredClone(state);
  if (s.status !== 'finished') delete s.word;
  return s;
}

module.exports = { createGame, processMove, getValidMoves, getBotMove, getClientState, evaluateGuess };
