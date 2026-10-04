// src/routes/stockRoutes.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { analyzeStock, getCachedPriceController, refreshWatchlistController } = require('../controllers/stockController');
const requireAuth = require('../middlewares/authMiddleware');

const router = express.Router();

const ipGateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: {
    success: false,
    error: 'Terlalu banyak permintaan dari jaringan ini. Silakan coba lagi nanti.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const analyzeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip),
  message: {
    success: false,
    error: 'Terlalu banyak permintaan analisis. Silakan coba lagi dalam 15 menit.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// [BARU] Dibatasi ketat, cuma 2 kali per jam, supaya tidak dipakai berulang-ulang
// memicu banyak panggilan Yahoo Finance sekaligus.
const refreshLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 2,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip),
  message: {
    success: false,
    error: 'Pembaruan watchlist baru saja dilakukan. Coba lagi nanti.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/analyze', ipGateLimiter, requireAuth, analyzeLimiter, analyzeStock);
router.get('/price/:symbol', ipGateLimiter, requireAuth, getCachedPriceController);
router.post('/refresh-watchlist', ipGateLimiter, requireAuth, refreshLimiter, refreshWatchlistController);

module.exports = router;