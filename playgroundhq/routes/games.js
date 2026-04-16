// ── Games API Routes ─────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const { GAMES, GAMES_BY_ID, GAMES_BY_SLUG, GENRES, TAGS } = require('../data/games');
const { optionalAuth } = require('../middleware/auth');

// ── GET /api/games ────────────────────────────────────────────────────────────
// Query params: genre, tag, minPlayers, maxPlayers, botSupport, search, sort, page, limit
router.get('/', optionalAuth, (req, res) => {
  let list = [...GAMES];
  const {
    genre, tag, minPlayers, maxPlayers, botSupport,
    search, sort = 'popular', page = 1, limit = 50,
  } = req.query;

  // Filters
  if (genre) list = list.filter(g => g.genre === genre);
  if (tag)   list = list.filter(g => g.tags.includes(tag));
  if (botSupport === 'true')  list = list.filter(g => g.botSupport);
  if (minPlayers) list = list.filter(g => g.maxPlayers >= parseInt(minPlayers));
  if (maxPlayers) list = list.filter(g => g.minPlayers <= parseInt(maxPlayers));

  // Full-text search
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(g =>
      g.name.toLowerCase().includes(q) ||
      g.description.toLowerCase().includes(q) ||
      g.genre.toLowerCase().includes(q) ||
      g.subgenre?.toLowerCase().includes(q) ||
      g.tags.some(t => t.includes(q)) ||
      g.origin?.toLowerCase().includes(q)
    );
  }

  // Sort
  const sortFns = {
    popular: (a, b) => (b.tags.includes('hot') ? 1 : 0) - (a.tags.includes('hot') ? 1 : 0),
    newest:  (a, b) => (b.tags.includes('new') ? 1 : 0) - (a.tags.includes('new') ? 1 : 0),
    name:    (a, b) => a.name.localeCompare(b.name),
    players: (a, b) => b.maxPlayers - a.maxPlayers,
    quick:   (a, b) => a.estimatedMinutes - b.estimatedMinutes,
  };
  if (sortFns[sort]) list.sort(sortFns[sort]);

  // Pagination
  const pageNum = Math.max(1, parseInt(page));
  const pageSize = Math.min(100, Math.max(1, parseInt(limit)));
  const start = (pageNum - 1) * pageSize;
  const paginated = list.slice(start, start + pageSize);

  res.json({
    games: paginated.map(publicGame),
    total: list.length,
    page: pageNum,
    pages: Math.ceil(list.length / pageSize),
    genres: GENRES,
    tags: TAGS,
  });
});

// ── GET /api/games/search?q= ──────────────────────────────────────────────────
router.get('/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q) return res.json({ results: [] });

  const scored = GAMES.map(g => {
    let score = 0;
    if (g.name.toLowerCase() === q) score += 100;
    else if (g.name.toLowerCase().startsWith(q)) score += 60;
    else if (g.name.toLowerCase().includes(q)) score += 40;
    if (g.description.toLowerCase().includes(q)) score += 20;
    if (g.genre.includes(q)) score += 15;
    if (g.tags.some(t => t.includes(q))) score += 10;
    if (g.origin?.toLowerCase().includes(q)) score += 5;
    return { game: g, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

  res.json({ results: scored.slice(0, 10).map(x => publicGame(x.game)) });
});

// ── GET /api/games/genres ─────────────────────────────────────────────────────
router.get('/genres', (req, res) => {
  const genreMap = {};
  GAMES.forEach(g => {
    if (!genreMap[g.genre]) genreMap[g.genre] = { name: g.genre, count: 0, games: [] };
    genreMap[g.genre].count++;
    genreMap[g.genre].games.push(g.id);
  });
  res.json({ genres: Object.values(genreMap).sort((a, b) => b.count - a.count) });
});

// ── GET /api/games/nostalgic ──────────────────────────────────────────────────
router.get('/nostalgic', (req, res) => {
  const nostalgic = GAMES.filter(g =>
    g.tags.some(t => ['nostalgic', 'forgotten', 'ancient', 'historical'].includes(t))
  );
  res.json({ games: nostalgic.map(publicGame) });
});

// ── GET /api/games/:id ────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const game = GAMES_BY_ID[req.params.id] || GAMES_BY_SLUG[req.params.id];
  if (!game) return res.status(404).json({ error: 'Game not found' });

  // Include related games
  const related = GAMES
    .filter(g => g.id !== game.id && (g.genre === game.genre || g.tags.some(t => game.tags.includes(t))))
    .slice(0, 6)
    .map(publicGame);

  res.json({ game: publicGame(game, true), related });
});

// ── Helper: strip internal fields ─────────────────────────────────────────────
function publicGame(g, full = false) {
  const base = {
    id: g.id,
    name: g.name,
    slug: g.slug,
    genre: g.genre,
    subgenre: g.subgenre,
    minPlayers: g.minPlayers,
    maxPlayers: g.maxPlayers,
    estimatedMinutes: g.estimatedMinutes,
    botSupport: g.botSupport,
    description: g.description,
    tags: g.tags,
    art: g.art,
    symbol: g.symbol,
    difficulty: g.difficulty,
  };
  if (full) {
    base.year = g.year;
    base.origin = g.origin;
  }
  return base;
}

module.exports = router;
