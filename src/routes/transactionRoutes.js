// src/routes/transactionRoutes.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const {
  createTransactionController,
  getTransactionsController,
  getPortfolioController,
  updateTransactionController,
  deleteTransactionController
} = require('../controllers/transactionController');
const requireAuth = require('../middlewares/authMiddleware');

const router = express.Router();

const ipGateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { success: false, error: 'Terlalu banyak permintaan dari jaringan ini. Silakan coba lagi nanti.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limit menulis data (create/update/delete) per-user, lebih longgar dari analisis AI
// karena operasi ini jauh lebih murah (tidak memanggil AI/Yahoo Finance berulang).
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip),
  message: { success: false, error: 'Terlalu banyak permintaan. Silakan coba lagi dalam 15 menit.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/', ipGateLimiter, requireAuth, writeLimiter, createTransactionController);
router.get('/', ipGateLimiter, requireAuth, getTransactionsController);
router.get('/portfolio', ipGateLimiter, requireAuth, getPortfolioController);
router.put('/:id', ipGateLimiter, requireAuth, writeLimiter, updateTransactionController);
router.delete('/:id', ipGateLimiter, requireAuth, writeLimiter, deleteTransactionController);

module.exports = router;