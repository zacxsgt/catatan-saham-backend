// src/routes/pinRoutes.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit'); // [FIX] helper wajib untuk key berbasis IP
const { verifyPinController, setPinController } = require('../controllers/pinController');
const requireAuth = require('../middlewares/authMiddleware');

const router = express.Router();

// Gerbang kasar berbasis IP, jalan sebelum auth — melindungi endpoint Supabase Auth
// dari spam token palsu (pola sama seperti stockRoutes.js).
const ipGateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { success: false, error: 'Terlalu banyak permintaan dari jaringan ini. Silakan coba lagi nanti.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter ketat khusus verifikasi PIN, per-user.
// Lapisan pertahanan TAMBAHAN di luar lockout yang sudah ada di pinService.js —
// mencegah brute force cepat sebelum lockout MAX_ATTEMPTS sempat berlaku efektif.
const verifyPinLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 menit
  max: 8, // sedikit di atas MAX_ATTEMPTS (5) di service, memberi margin untuk retry wajar
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip), // [FIX]
  message: { success: false, error: 'Terlalu banyak percobaan verifikasi PIN. Coba lagi beberapa menit lagi.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter untuk ganti/set PIN — lebih longgar karena bukan operasi rawan brute force,
// tapi tetap dibatasi supaya tidak dipakai untuk spam ganti PIN berulang-ulang.
const setPinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip), // [FIX]
  message: { success: false, error: 'Terlalu banyak permintaan ganti PIN. Coba lagi dalam 15 menit.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/verify', ipGateLimiter, requireAuth, verifyPinLimiter, verifyPinController);
router.post('/set', ipGateLimiter, requireAuth, setPinLimiter, setPinController);

module.exports = router;