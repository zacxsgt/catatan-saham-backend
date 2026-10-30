// src/routes/stockRoutes.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { analyzeStock, getCachedPriceController, refreshWatchlistController } = require('../controllers/stockController');
const { getAllPricesController } = require('../controllers/priceController');
const requireAuth = require('../middlewares/authMiddleware');

const router = express.Router();

// Dilonggarkan dari 60 ke 150: satu halaman bisa memicu beberapa permintaan.
// Permintaan analisis AI yang mahal tetap dibatasi ketat di limiter terpisah.
const ipGateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
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

// Sebagian besar permintaan harga hanya membaca cache, dan panggilan ke Yahoo
// sudah diantre di service, jadi batas ini bisa lebih longgar.
const priceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip),
  message: {
    success: false,
    error: 'Terlalu banyak pencarian harga. Coba lagi dalam beberapa menit.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

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
router.get('/price/:symbol', ipGateLimiter, requireAuth, priceLimiter, getCachedPriceController);
router.get('/prices', ipGateLimiter, requireAuth, priceLimiter, getAllPricesController);
router.post('/refresh-watchlist', ipGateLimiter, requireAuth, refreshLimiter, refreshWatchlistController);

module.exports = router;