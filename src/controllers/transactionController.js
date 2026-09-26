// src/controllers/transactionController.js
const {
  createTransaction,
  getTransactions,
  getPortfolioSummary,
  updateTransaction,
  deleteTransaction
} = require('../services/transactionService');
const { AppError } = require('../utils/errors');

function handleError(res, error, context, userId) {
  console.error(`[TX CONTROLLER ERROR] ${context} (User: ${userId || 'Unknown'}):`, error.message);
  const isKnownError = error instanceof AppError;
  const statusCode = isKnownError ? error.statusCode : 500;
  return res.status(statusCode).json({
    success: false,
    error: isKnownError ? error.message : 'Terjadi kesalahan internal.'
  });
}

async function createTransactionController(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Sesi tidak valid. Silakan login kembali.' });
    }

    const { symbol, type, lots, price_per_share, transaction_date } = req.body;

    const result = await createTransaction(userId, {
      symbol,
      type,
      lots: Number(lots),
      price_per_share: Number(price_per_share),
      transaction_date
    });

    return res.status(201).json({ success: true, data: result });
  } catch (error) {
    return handleError(res, error, 'createTransaction', req.user?.id);
  }
}

async function getTransactionsController(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Sesi tidak valid. Silakan login kembali.' });
    }

    const { symbol } = req.query;
    const data = await getTransactions(userId, symbol);

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'getTransactions', req.user?.id);
  }
}

async function getPortfolioController(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Sesi tidak valid. Silakan login kembali.' });
    }

    const data = await getPortfolioSummary(userId);

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'getPortfolioSummary', req.user?.id);
  }
}

async function updateTransactionController(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Sesi tidak valid. Silakan login kembali.' });
    }

    const { id } = req.params;
    const updates = { ...req.body };
    if (updates.lots !== undefined) updates.lots = Number(updates.lots);
    if (updates.price_per_share !== undefined) updates.price_per_share = Number(updates.price_per_share);

    const updated = await updateTransaction(userId, id, updates);

    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    return handleError(res, error, 'updateTransaction', req.user?.id);
  }
}

async function deleteTransactionController(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Sesi tidak valid. Silakan login kembali.' });
    }

    const { id } = req.params;
    const deleted = await deleteTransaction(userId, id);

    return res.status(200).json({ success: true, data: deleted });
  } catch (error) {
    return handleError(res, error, 'deleteTransaction', req.user?.id);
  }
}

module.exports = {
  createTransactionController,
  getTransactionsController,
  getPortfolioController,
  updateTransactionController,
  deleteTransactionController
};