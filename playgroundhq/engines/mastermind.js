// ── Mastermind Engine ─────────────────────────────────────────────────────────

const COLORS_MM = ['R','G','B','Y','O','P']; // Red Green Blue Yellow Orange Purple
const CODE_LENGTH = 4;
const MAX_GUESSES = 10;

function randomCode() {
  return Array.from({ length: CODE_LENGTH }, () => COLORS_MM[Math.floor(Math.random() * COLORS_MM.length)]);
}

function createGame({ playerIds }) {
  // Player 1 sets code OR it's random for solo vs bot
  const secret = randomCode();
  return {
    players: playerIds.slice(0, 2),
    secret,           // hidden from guesser
    guesser: playerIds[0],
    codemaker: playerIds.length > 1 ? playerIds[1] : 'bot',
    guesses: [],      // [{code, blacks, whites}]
    maxGuesses: MAX_GUESSES,
    status: 'playing',
    winner: null,
    colors: COLORS_MM,
    codeLength: CODE_LENGTH,
  };
}

function processMove(state, { code }, playerId) {
  if (state.status !== 'playing') return { error: 'Game over' };
  if (playerId !== state.guesser) return { error: 'Not the guesser' };
  if (!Array.isArray(code) || code.length !== CODE_LENGTH) return { error: `Code must be ${CODE_LENGTH} pegs` };
  if (code.some(c => !COLORS_MM.includes(c))) return { error: 'Invalid color' };

  const next = structuredClone(state);
  const { blacks, whites } = evaluate(code, state.secret);
  next.guesses.push({ code, blacks, whites, turn: next.guesses.length + 1 });

  if (blacks === CODE_LENGTH) {
    next.status = 'finished';
    next.winner = state.guesser;
  } else if (next.guesses.length >= MAX_GUESSES) {
    next.status = 'finished';
    next.winner = state.codemaker;
    next.revealSecret = state.secret;
  }

  return { state: next };
}

function evaluate(guess, secret) {
  let blacks = 0, whites = 0;
  const secretLeft = [], guessLeft = [];
  for (let i = 0; i < CODE_LENGTH; i++) {
    if (guess[i] === secret[i]) blacks++;
    else { secretLeft.push(secret[i]); guessLeft.push(guess[i]); }
  }
  for (const g of guessLeft) {
    const idx = secretLeft.indexOf(g);
    if (idx >= 0) { whites++; secretLeft.splice(idx, 1); }
  }
  return { blacks, whites };
}

function getValidMoves() { return [{ type: 'guess' }]; }

function getBotMove(state, difficulty) {
  if (state.codemaker !== 'bot' && state.guesser !== 'bot') return null;
  // Simple bot: random valid code
  if (difficulty === 'easy' || !state.guesses.length) {
    return Array.from({ length: CODE_LENGTH }, () => COLORS_MM[Math.floor(Math.random() * COLORS_MM.length)]);
  }
  // Medium/Hard: filter candidates
  const allCodes = generateAll();
  let candidates = allCodes.filter(c => isConsistent(c, state.guesses));
  if (!candidates.length) candidates = [randomCode()];
  return candidates[Math.floor(Math.random() * Math.min(5, candidates.length))];
}

function isConsistent(code, guesses) {
  for (const g of guesses) {
    const { blacks, whites } = evaluate(code, g.code);
    if (blacks !== g.blacks || whites !== g.whites) return false;
  }
  return true;
}

function generateAll() {
  const codes = [];
  function gen(cur) {
    if (cur.length === CODE_LENGTH) { codes.push([...cur]); return; }
    for (const c of COLORS_MM) { cur.push(c); gen(cur); cur.pop(); }
  }
  gen([]);
  return codes;
}

module.exports = { createGame, processMove, getValidMoves, getBotMove, evaluate };
