# 🎮 PlaygroundHQ

**80+ classic board, card & puzzle games — fully online, multiplayer, with AI bots.**

No downloads. No accounts required to play. Firebase auth for optional stat tracking.

---

## ✨ Features

| Feature | Details |
|---|---|
| **80+ Games** | Chess, Ludo, Monopoly, Battleship, Carrom, Mancala, Mastermind, Wordle, and dozens more |
| **Nostalgic Games** | Nine Men's Morris, Halma, Fox & Hounds, Pachisi, Mancala, Farkle, Bunco, Shut the Box, Crokinole |
| **Multiplayer** | Real-time via Socket.io — 2–10 players per room |
| **Room Codes** | 6-character codes (e.g. `KXP-772`) — share with friends, no sign-in needed |
| **AI Bots** | 3 difficulty levels with game-specific algorithms (minimax, alpha-beta, heuristics) |
| **Firebase Auth** | Google sign-in + email/password — saves stats and favorites |
| **Smart Search** | Search by name, mood, genre, origin, or describe the game |
| **Live Chat** | In-room chat with emoji reactions |
| **Spectator Mode** | Watch any room without playing |
| **Rematch System** | Vote-based rematch after each game |
| **No Sign-In Required** | Play instantly as a guest |

---

## 🏗 Architecture

```
playgroundhq/
├── server.js              # Express + Socket.io entry point
├── config/
│   └── firebase.js        # Firebase Admin SDK (with dev mock)
├── middleware/
│   └── auth.js            # Firebase token verification
├── routes/
│   ├── games.js           # GET /api/games, /api/games/:id, /api/games/search
│   ├── rooms.js           # POST/GET /api/rooms
│   └── users.js           # GET/PATCH /api/users/me, leaderboards, stats
├── socket/
│   ├── gameSocket.js      # All Socket.io event handlers + bot scheduler
│   └── roomManager.js     # In-memory room store + game lifecycle
├── engines/               # Game logic — one file per game
│   ├── index.js           # Engine registry
│   ├── tictactoe.js
│   ├── connect4.js
│   ├── battleship.js
│   ├── ludo.js
│   ├── snakesladders.js
│   ├── memory.js
│   ├── wordle.js
│   ├── mancala.js
│   ├── mastermind.js
│   ├── hangman.js
│   └── dotsandboxes.js
├── data/
│   └── games.js           # Master catalog of 80+ games with metadata
├── utils/
│   └── logger.js          # Winston structured logger
└── public/
    └── index.html         # Full frontend SPA with Firebase Auth
```

---

## 🚀 Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` — the server runs in mock/offline mode without Firebase credentials.

### 3. Firebase Setup (Optional but recommended)

1. Go to [Firebase Console](https://console.firebase.google.com) → Create Project
2. **Authentication** → Enable Google and Email/Password providers
3. **Firestore Database** → Create in production mode
4. **Project Settings** → Service Accounts → Generate new private key
5. Copy the JSON, minify it, and set as `FIREBASE_SERVICE_ACCOUNT` in `.env`
6. Copy the web config keys into `.env` as `FIREBASE_API_KEY`, etc.

### 4. Update frontend Firebase config

In `public/index.html`, find `FIREBASE_CONFIG` and replace with your project values.  
Or inject them via nginx/CDN using `window.ENV_*` variables.

### 5. Run

```bash
# Development (with auto-restart)
npm run dev

# Production
npm start
```

Open `http://localhost:3000`

---

## 🐳 Docker

```bash
# Build and run with Docker Compose (includes Redis)
docker-compose up --build

# Or just Docker
docker build -t playgroundhq .
docker run -p 3000:3000 --env-file .env playgroundhq
```

---

## ☁️ Deploy to Production

### Render.com (Easiest)

1. Push to GitHub
2. New Web Service → connect repo
3. Build command: `npm install`
4. Start command: `node server.js`
5. Add all env vars from `.env.example`

### Railway

```bash
railway login
railway init
railway up
railway variables set NODE_ENV=production PORT=3000 ...
```

### Google Cloud Run

```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/playgroundhq
gcloud run deploy playgroundhq \
  --image gcr.io/PROJECT_ID/playgroundhq \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production,PORT=8080
```

### Fly.io

```bash
fly launch
fly secrets set NODE_ENV=production FIREBASE_SERVICE_ACCOUNT='...'
fly deploy
```

---

## 🔌 API Reference

### Games

| Endpoint | Description |
|---|---|
| `GET /api/games` | List games with filtering & pagination |
| `GET /api/games/search?q=` | Smart search with relevance scoring |
| `GET /api/games/genres` | Genre list with counts |
| `GET /api/games/nostalgic` | Nostalgic/forgotten games only |
| `GET /api/games/:id` | Single game details + related games |

### Rooms

| Endpoint | Description |
|---|---|
| `GET /api/rooms` | List public waiting rooms |
| `POST /api/rooms` | Create a room (REST fallback) |
| `GET /api/rooms/:code` | Get room by code |

### Users (requires Firebase auth header)

| Endpoint | Description |
|---|---|
| `GET /api/users/me` | Get or create user profile |
| `PATCH /api/users/me` | Update display name, preferences |
| `GET /api/users/me/stats` | Get win/loss stats per game |
| `POST /api/users/me/stats` | Record game result |
| `GET /api/users/leaderboard/:gameId` | Top 20 players for a game |
| `POST /api/users/me/favorites` | Add/remove favorite game |

### Health

| Endpoint | Description |
|---|---|
| `GET /api/health` | Server health + uptime |

---

## 🎮 Socket.io Events

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `room:create` | `{gameId, playerName, maxPlayers, isPrivate, botDifficulty}` | Create a room |
| `room:join` | `{code, playerName}` | Join by code |
| `room:join_spectator` | `{code}` | Join as spectator |
| `room:ready` | `{code}` | Mark self as ready |
| `room:start` | `{code}` | Host starts game |
| `room:list` | `{gameId?}` | List public rooms |
| `game:move` | `{code, move}` | Submit a move |
| `game:valid_moves` | `{code}` | Get legal moves |
| `game:rematch` | `{code}` | Vote for rematch |
| `game:unlock` | `{code}` | Memory match: flip cards back |
| `chat:message` | `{code, message}` | Send chat |
| `chat:reaction` | `{code, reaction}` | Send emoji reaction |

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `game:started` | `{state}` | Game begins |
| `game:state_update` | `{state, lastMove}` | State after each move |
| `game:finished` | `{winner, finalState}` | Game ended |
| `room:player_joined` | `{player, playerCount}` | Someone joined |
| `room:player_disconnected` | `{playerId, playerName}` | Someone left |
| `room:player_ready` | `{playerId}` | Player marked ready |
| `game:rematch_vote` | `{playerId, count, needed}` | Rematch vote update |
| `chat:message` | `{playerName, message, timestamp}` | Incoming chat |
| `chat:reaction` | `{playerId, reaction}` | Incoming reaction |
| `server:online_count` | `number` | Live player count |

---

## 🧠 Game Engines

Fully implemented engines with bot AI:

| Game | Algorithm |
|---|---|
| Tic Tac Toe | Minimax with alpha-beta pruning |
| Connect 4 | Minimax depth 7 + window heuristics |
| Battleship | Hunt/Target/Parity strategy bot |
| Ludo | Capture-prioritizing heuristic bot |
| Snakes & Ladders | Pure luck (no strategy) |
| Memory Match | Memory-based bot (hard mode remembers all cards) |
| Wordle | Frequency-based letter deduction |
| Mancala (Kalah) | Minimax depth 9 with store differential |
| Mastermind | Consistent-candidate filtering |
| Hangman | English letter frequency ordering |
| Dots & Boxes | Chain-avoiding / completing strategy |

All other games use a stub engine that accepts moves and rotates turns — ready for full engine implementation.

---

## 🗺 Roadmap

- [ ] Full Chess engine (or integrate chess.js)
- [ ] UNO card engine
- [ ] Monopoly engine
- [ ] Redis-backed room store (for multi-instance scaling)
- [ ] Tournament bracket system
- [ ] Spectator count and live game watching
- [ ] Achievements system
- [ ] Mobile PWA with push notifications
- [ ] Internationalization (Hindi, Mandarin, Spanish, Portuguese)

---

## 📄 License

MIT — build something wonderful.
