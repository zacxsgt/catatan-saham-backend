// src/services/transactionService.js
const supabase = require('../config/supabase');
const { getCachedStockData } = require('./stockService');
const { ValidationError, NotFoundError, ConflictError } = require('../utils/errors');

function validateTransactionInput({ symbol, type, lots, price_per_share, transaction_date }) {
  if (!symbol || typeof symbol !== 'string') {
    throw new ValidationError('Simbol saham wajib diisi.');
  }

  if (type !== 'BUY' && type !== 'SELL') {
    throw new ValidationError('Tipe transaksi harus "BUY" atau "SELL".');
  }

  if (!Number.isInteger(lots) || lots <= 0) {
    throw new ValidationError('Jumlah lot harus berupa angka bulat positif.');
  }

  const price = Number(price_per_share);
  if (!Number.isFinite(price) || price <= 0) {
    throw new ValidationError('Harga per saham harus berupa angka positif.');
  }

  if (transaction_date && isNaN(Date.parse(transaction_date))) {
    throw new ValidationError('Format tanggal transaksi tidak valid.');
  }
}

async function computePosition(userId, symbol) {
  const { data: txs, error } = await supabase
    .from('transactions')
    .select('type, lots, price_per_share')
    .eq('user_id', userId)
    .eq('symbol', symbol)
    .order('transaction_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error(`[TX SERVICE ERROR] Gagal membaca riwayat ${symbol}:`, error.message);
    throw new Error('Gagal membaca riwayat transaksi.');
  }

  let totalShares = 0;
  let totalCost = 0;

  for (const tx of txs || []) {
    const shares = tx.lots * 100;

    if (tx.type === 'BUY') {
      totalCost += shares * tx.price_per_share;
      totalShares += shares;
    } else {
      const avgPrice = totalShares > 0 ? totalCost / totalShares : 0;
      totalCost -= shares * avgPrice;
      totalShares -= shares;
    }
  }

  const netLots = totalShares / 100;
  const averagePrice = totalShares > 0 ? totalCost / totalShares : 0;

  return { netLots, averagePrice, totalShares, totalCost };
}

async function createTransaction(userId, payload) {
  const { symbol, type, lots, price_per_share, transaction_date } = payload;

  validateTransactionInput(payload);

  const cleanSymbol = symbol.toUpperCase().trim();

  // [FIX] Dulu memanggil getStockData (bisa memicu Yahoo Finance langsung kalau
  // cache sudah basi). Sekarang pakai getCachedStockData, murni baca cache,
  // konsisten dengan endpoint harga ringan yang dipakai formulir Beli/Jual.
  const stockData = await getCachedStockData(cleanSymbol);

  if (type === 'SELL') {
    const position = await computePosition(userId, cleanSymbol);
    if (lots > position.netLots) {
      throw new ConflictError(
        `Lot yang dijual (${lots}) melebihi lot yang dimiliki (${position.netLots}) untuk ${cleanSymbol}.`
      );
    }
  }

  const totalAmount = lots * 100 * price_per_share;
  const finalDate = transaction_date || new Date().toISOString().slice(0, 10);

  const { data: inserted, error } = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      symbol: cleanSymbol,
      stock_name: stockData.name,
      type,
      lots,
      price_per_share,
      total_amount: totalAmount,
      transaction_date: finalDate
    })
    .select()
    .single();

  if (error) {
    console.error(`[TX SERVICE ERROR] Gagal insert transaksi ${cleanSymbol}:`, error.message);
    throw new Error('Gagal menyimpan transaksi ke database.');
  }

  const updatedPosition = await computePosition(userId, cleanSymbol);

  return { transaction: inserted, position: updatedPosition };
}

async function getTransactions(userId, symbolFilter) {
  let query = supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (symbolFilter) {
    query = query.eq('symbol', symbolFilter.toUpperCase().trim());
  }

  const { data, error } = await query;

  if (error) {
    console.error('[TX SERVICE ERROR] Gagal membaca riwayat transaksi:', error.message);
    throw new Error('Gagal mengambil riwayat transaksi.');
  }

  return data;
}

async function getPortfolioSummary(userId) {
  const { data: symbolRows, error } = await supabase
    .from('transactions')
    .select('symbol')
    .eq('user_id', userId);

  if (error) {
    console.error('[TX SERVICE ERROR] Gagal membaca daftar simbol:', error.message);
    throw new Error('Gagal mengambil ringkasan portfolio.');
  }

  const uniqueSymbols = [...new Set((symbolRows || []).map((r) => r.symbol))];

  const holdings = [];
  let totalInvested = 0;
  let totalCurrentValue = 0;

  for (const symbol of uniqueSymbols) {
    const position = await computePosition(userId, symbol);

    if (position.netLots <= 0) continue;

    let currentPrice = null;
    let unrealizedGainLoss = null;
    let unrealizedGainLossPercent = null;

    try {
      const stockData = await getCachedStockData(symbol);
      currentPrice = stockData.current_price;
      const currentValue = position.totalShares * currentPrice;
      unrealizedGainLoss = currentValue - position.totalCost;
      unrealizedGainLossPercent = position.totalCost > 0
        ? (unrealizedGainLoss / position.totalCost) * 100
        : 0;

      totalInvested += position.totalCost;
      totalCurrentValue += currentValue;
    } catch (err) {
      console.warn(`[PORTFOLIO WARNING] Gagal ambil harga terkini ${symbol}:`, err.message);
    }

    holdings.push({
      symbol,
      net_lots: position.netLots,
      average_price: Math.round(position.averagePrice),
      total_invested: Math.round(position.totalCost),
      current_price: currentPrice,
      unrealized_gain_loss: unrealizedGainLoss !== null ? Math.round(unrealizedGainLoss) : null,
      unrealized_gain_loss_percent: unrealizedGainLossPercent !== null
        ? Number(unrealizedGainLossPercent.toFixed(2))
        : null
    });
  }

  const totalUnrealizedGainLoss = totalCurrentValue - totalInvested;

  return {
    holdings,
    summary: {
      total_invested: Math.round(totalInvested),
      total_current_value: Math.round(totalCurrentValue),
      total_unrealized_gain_loss: Math.round(totalUnrealizedGainLoss),
      total_unrealized_gain_loss_percent: totalInvested > 0
        ? Number(((totalUnrealizedGainLoss / totalInvested) * 100).toFixed(2))
        : 0
    }
  };
}

async function updateTransaction(userId, transactionId, updates) {
  const { data: existing, error: fetchError } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', transactionId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !existing) {
    throw new NotFoundError('Transaksi tidak ditemukan.');
  }

  const merged = {
    type: updates.type ?? existing.type,
    lots: updates.lots ?? existing.lots,
    price_per_share: updates.price_per_share ?? existing.price_per_share,
    transaction_date: updates.transaction_date ?? existing.transaction_date
  };

  validateTransactionInput({ symbol: existing.symbol, ...merged });

  const totalAmount = merged.lots * 100 * merged.price_per_share;

  const { data: updated, error: updateError } = await supabase
    .from('transactions')
    .update({ ...merged, total_amount: totalAmount })
    .eq('id', transactionId)
    .eq('user_id', userId)
    .select()
    .single();

  if (updateError) {
    console.error(`[TX SERVICE ERROR] Gagal update transaksi ${transactionId}:`, updateError.message);
    throw new Error('Gagal memperbarui transaksi.');
  }

  return updated;
}

async function deleteTransaction(userId, transactionId) {
  const { data: deleted, error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', transactionId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error || !deleted) {
    throw new NotFoundError('Transaksi tidak ditemukan.');
  }

  return deleted;
}

module.exports = {
  createTransaction,
  getTransactions,
  getPortfolioSummary,
  updateTransaction,
  deleteTransaction
};