// src/controllers/priceController.js
const { getAllCachedPrices } = require('../services/stockService');
const { AppError } = require('../utils/errors');

async function getAllPricesController(req, res) {
  try {
    const data = await getAllCachedPrices();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error(`[CONTROLLER ERROR] getAllPrices (User: ${req.user?.id || 'Unknown'}):`, error.message);

    const isKnownError = error instanceof AppError;
    return res.status(isKnownError ? error.statusCode : 500).json({
      success: false,
      error: isKnownError ? error.message : 'Terjadi kesalahan internal.'
    });
  }
}

module.exports = { getAllPricesController };