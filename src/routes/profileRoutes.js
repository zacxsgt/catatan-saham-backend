const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { getProfileController, updateProfileController } = require('../controllers/profileController');
const requireAuth = require('../middlewares/authMiddleware');

const router = express.Router();

const ipGateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { success: false, error: 'Terlalu banyak permintaan dari jaringan ini. Silakan coba lagi nanti.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip),
  message: { success: false, error: 'Terlalu banyak permintaan. Coba lagi dalam 15 menit.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/', ipGateLimiter, requireAuth, getProfileController);
router.put('/', ipGateLimiter, requireAuth, writeLimiter, updateProfileController);

module.exports = router;