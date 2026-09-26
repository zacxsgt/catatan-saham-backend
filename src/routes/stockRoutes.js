// src/routes/stockRoutes.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit'); // [FIX] helper wajib untuk key berbasis IP
const { analyzeStock } = require('../controllers/stockController');
const requireAuth = require('../middlewares/authMiddleware');

const router = express.Router();

// Gerbang pertama: throttle kasar berbasis IP, jalan SEBELUM auth.
// Tujuannya melindungi endpoint Supabase Auth itu sendiri dari spam token palsu.
const ipGateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 60,                   // longgar, cuma menahan spam brutal
  message: {
    success: false,
    error: 'Terlalu banyak permintaan dari jaringan ini. Silakan coba lagi nanti.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Gerbang kedua: limit ketat khusus operasi mahal (Yahoo Finance + AI), jalan SETELAH auth.
// Key berbasis user id, bukan IP, supaya adil per-akun dan tidak mudah dilewati ganti IP.
const analyzeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  // [FIX] ipKeyGenerator menormalisasi alamat IPv6 supaya tidak bisa dipakai
  // untuk melewati limit dengan membuat banyak alamat IPv6 "berbeda" secara teknis.
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip),
  message: {
    success: false,
    error: 'Terlalu banyak permintaan analisis. Silakan coba lagi dalam 15 menit.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Alur: Request -> Throttle IP kasar -> Cek Login -> Throttle per-user -> Controller
router.post('/analyze', ipGateLimiter, requireAuth, analyzeLimiter, analyzeStock);

module.exports = router;