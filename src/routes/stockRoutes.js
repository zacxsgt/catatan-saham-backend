// src/routes/stockRoutes.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { analyzeStock, getCachedPriceController } = require('../controllers/stockController');
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

router.post('/analyze', ipGateLimiter, requireAuth, analyzeLimiter, analyzeStock);

// [BARU] Ringan, cuma baca cache, jadi tidak perlu limiter seketat /analyze
router.get('/price/:symbol', ipGateLimiter, requireAuth, getCachedPriceController);

module.exports = router;