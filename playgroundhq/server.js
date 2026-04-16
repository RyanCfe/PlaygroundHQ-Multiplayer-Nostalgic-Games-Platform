// ╔══════════════════════════════════════════════════════════╗
// ║  PlaygroundHQ — Main Server                             ║
// ║  Express + Socket.io + Firebase Admin                   ║
// ╚══════════════════════════════════════════════════════════╝

require('dotenv').config();
const http = require('http');
const path = require('path');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

const logger = require('./utils/logger');
const { initFirebase } = require('./config/firebase');
const { initSocket } = require('./socket/gameSocket');

// Routes
const gamesRouter = require('./routes/games');
const roomsRouter = require('./routes/rooms');
const usersRouter = require('./routes/users');

// ── App Setup ────────────────────────────────────────────────────────────────

const app = express();
const server = http.createServer(app);

// Initialize Firebase early and keep status
const firebaseState = initFirebase();

// ── Security ────────────────────────────────────────────────────────────────

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        'https://www.gstatic.com',
        'https://apis.google.com',
        'https://cdn.jsdelivr.net',
        'https://fonts.googleapis.com',
      ],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      connectSrc: [
        "'self'",
        'wss:',
        'ws:',
        'https://*.firebaseio.com',
        'https://identitytoolkit.googleapis.com',
        'https://securetoken.googleapis.com',
        'https://www.gstatic.com',
      ],
      imgSrc: ["'self'", 'data:', 'https:'],
      frameSrc: ["'self'", 'https://accounts.google.com'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ── CORS ─────────────────────────────────────────────────────────────────────

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return cb(null, true);
    }
    return cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// ── Body Parsing ─────────────────────────────────────────────────────────────

app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false }));

// ── Request Logging ──────────────────────────────────────────────────────────

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(
    process.env.NODE_ENV === 'production' ? 'combined' : 'dev',
    {
      stream: {
        write: (msg) => logger.http(msg.trim()),
      },
    }
  ));
}

// ── Rate Limiting ────────────────────────────────────────────────────────────

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Search rate limit exceeded.' },
});

app.use('/api', apiLimiter);
app.use('/api/games/search', searchLimiter);

// ── Static Files ─────────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  etag: true,
}));

// ── API Routes ───────────────────────────────────────────────────────────────

app.use('/api/games', gamesRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/users', usersRouter);

// ── Health Check ─────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: process.env.npm_package_version || '1.0.0',
    env: process.env.NODE_ENV || 'development',
    uptime: Math.floor(process.uptime()),
    firebase: firebaseState.isMock ? 'mock' : 'configured',
    timestamp: new Date().toISOString(),
  });
});

// ── SPA Fallback ─────────────────────────────────────────────────────────────

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }

  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Error Handler ────────────────────────────────────────────────────────────

app.use((err, req, res, _next) => {
  logger.error(err.message, {
    stack: err.stack,
    path: req.path,
  });

  const status = err.status || err.statusCode || 500;

  res.status(status).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
});

// ── Socket.io ────────────────────────────────────────────────────────────────

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 30000,
  pingInterval: 15000,
  transports: ['websocket', 'polling'],
});

// Firebase token verification middleware for Socket.io
io.use(async (socket, next) => {
  const token =
    socket.handshake.auth?.token ||
    socket.handshake.headers?.authorization?.split(' ')[1];

  if (!token) {
    socket.data.userId = `guest_${socket.id}`;
    socket.data.userName = 'Guest';
    return next();
  }

  try {
    const { auth } = initFirebase();
    const decoded = await auth.verifyIdToken(token);

    socket.data.userId = decoded.uid;
    socket.data.userName = decoded.name || decoded.email || 'Player';
  } catch (err) {
    logger.warn(`Socket token verification failed: ${err.message}`);
    socket.data.userId = `guest_${socket.id}`;
    socket.data.userName = 'Guest';
  }

  return next();
});

initSocket(io);

// ── Start Server ─────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3000', 10);

server.listen(PORT, () => {
  logger.info(`🎮 PlaygroundHQ server running on port ${PORT}`);
  logger.info(`   Mode: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`   Firebase: ${firebaseState.isMock ? 'mock mode' : 'configured'}`);
});

// ── Graceful Shutdown ────────────────────────────────────────────────────────

process.on('SIGTERM', () => {
  logger.info('SIGTERM received — shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10000);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', {
    message: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { reason });
});

module.exports = { app, server, io };