// src/controllers/stockController.js
const { processStockRequest, getStockData } = require('../services/stockService');
const { runWatchlistUpdate } = require('../jobs/stockCron');
const { AppError } = require('../utils/errors');

const MAX_BUDGET = 1000000000000;

async function analyzeStock(req, res) {
  try {
    const { symbol, budget } = req.body;

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

    const result = await processStockRequest(cleanSymbol, numericBudget);

    return res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error(`[CONTROLLER ERROR] analyzeStock (User: ${req.user?.id || 'Unknown'}):`, error.message);

    const isKnownError = error instanceof AppError;
    const statusCode = isKnownError ? error.statusCode : 500;

    return res.status(statusCode).json({
      success: false,
      error: isKnownError ? error.message : 'Terjadi kesalahan internal saat memproses analisis saham.'
    });
  }
}

// [UBAH] Sekarang memakai getStockData (cek cache, kalau basi ambil langsung dari
// Yahoo lalu simpan), bukan lagi getCachedStockData yang cuma baca cache tanpa
// pernah mengisi yang kosong. Ini memungkinkan simbol di luar watchlist otomatis
// tersimpan begitu dicari, tanpa memanggil AI sama sekali.
async function getCachedPriceController(req, res) {
  try {
    const { symbol } = req.params;
    const data = await getStockData(symbol);

    return res.status(200).json({
      success: true,
      data: {
        symbol: data.symbol,
        name: data.name,
        current_price: data.current_price,
        last_updated: data.last_updated,
      }
    });
  } catch (error) {
    console.error(`[CONTROLLER ERROR] getCachedPrice (User: ${req.user?.id || 'Unknown'}):`, error.message);

    const isKnownError = error instanceof AppError;
    const statusCode = isKnownError ? error.statusCode : 500;

    return res.status(statusCode).json({
      success: false,
      error: isKnownError ? error.message : 'Terjadi kesalahan internal.'
    });
  }
}

async function refreshWatchlistController(req, res) {
  try {
    const result = await runWatchlistUpdate();
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error(`[CONTROLLER ERROR] refreshWatchlist (User: ${req.user?.id || 'Unknown'}):`, error.message);
    return res.status(500).json({ success: false, error: 'Gagal memperbarui watchlist.' });
  }
}

module.exports = {
  analyzeStock,
  getCachedPriceController,
  refreshWatchlistController
};