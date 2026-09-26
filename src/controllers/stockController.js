// src/controllers/stockController.js
const { processStockRequest } = require('../services/stockService');
const { AppError } = require('../utils/errors');

const MAX_BUDGET = 1000000000000; // 1 Triliun

async function analyzeStock(req, res) {
  try {
    const { symbol, budget } = req.body;

    // --- 1. VALIDASI SYMBOL ---
    if (!symbol || typeof symbol !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Simbol saham wajib diisi dan harus berupa teks.'
      });
    }

    const cleanSymbol = symbol.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(cleanSymbol)) {
      return res.status(400).json({
        success: false,
        error: 'Format tidak valid. Simbol saham harus berupa 4 huruf kapital (contoh: BBCA).'
      });
    }

    // --- 2. VALIDASI BUDGET ---
    if (
      budget === undefined ||
      budget === null ||
      typeof budget === 'boolean' ||
      typeof budget === 'object'
    ) {
      return res.status(400).json({
        success: false,
        error: 'Budget tidak valid. Harus berupa angka.'
      });
    }

    const numericBudget = Number(budget);

    if (!Number.isFinite(numericBudget) || numericBudget <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Budget harus berupa angka positif lebih dari 0.'
      });
    }

    if (numericBudget > MAX_BUDGET) {
      return res.status(400).json({
        success: false,
        error: `Budget terlalu besar. Maksimal budget yang diizinkan adalah Rp ${MAX_BUDGET.toLocaleString('id-ID')}.`
      });
    }

    // --- 3. EKSEKUSI SERVICE ---
    const result = await processStockRequest(cleanSymbol, numericBudget);

    // --- 4. RESPONSE SUKSES ---
    return res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error(`[CONTROLLER ERROR] analyzeStock (User: ${req.user?.id || 'Unknown'}):`, error.message);

    // instanceof memastikan hanya error yang sengaja kita buat (AppError dan turunannya:
    // ValidationError/404/502 dll) yang pesannya diloloskan ke user. Error tak terduga
    // dari library lain atau bug internal otomatis jatuh ke 500 generik.
    const isKnownError = error instanceof AppError;
    const statusCode = isKnownError ? error.statusCode : 500;

    return res.status(statusCode).json({
      success: false,
      error: isKnownError ? error.message : 'Terjadi kesalahan internal saat memproses analisis saham.'
    });
  }
}

module.exports = {
  analyzeStock
};