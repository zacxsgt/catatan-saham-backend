// src/jobs/stockCron.js
const cron = require('node-cron');
const supabaseAdmin = require('../config/supabase');
const { getStockData } = require('../services/stockService');

const WATCHLIST = [
  'BBCA', 'BBRI', 'BMRI', 'BBNI', 'TLKM',
  'ASII', 'UNVR', 'ICBP', 'INDF', 'KLBF',
  'ANTM', 'PTBA', 'ADRO', 'UNTR', 'SIDO',
  'DMAS'
];

const DELAY_BETWEEN_REQUESTS_MS = 1500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWatchlistUpdate() {
  console.log(`[CRON] Mulai update watchlist (${WATCHLIST.length} simbol)...`);

  let successCount = 0;
  let failCount = 0;

  for (const symbol of WATCHLIST) {
    try {
      await getStockData(symbol);
      successCount++;
    } catch (error) {
      failCount++;
      console.error(`[CRON] ❌ Watchlist ${symbol} gagal diperbarui:`, error.message);
    }
    await sleep(DELAY_BETWEEN_REQUESTS_MS);
  }

  console.log(`[CRON] Update watchlist selesai. Berhasil: ${successCount}, Gagal: ${failCount}`);
}

async function runCacheCleanup() {
  console.log('[CRON] Menjalankan pembersihan cache saham lama...');

  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('stock_prices')
      .delete()
      .lt('last_updated', oneDayAgo)
      .select();

    if (error) {
      console.error('[CRON ERROR] Gagal membersihkan cache dari Supabase:', error.message);
    } else {
      const deletedCount = data ? data.length : 0;
      console.log(`[CRON SUCCESS] Berhasil menghapus ${deletedCount} cache saham usang.`);
    }
  } catch (error) {
    console.error('[CRON EXCEPTION] Terjadi kesalahan sistem saat pembersihan:', error.message);
  }
}

function startCronJobs() {
  const runSafely = () => {
    runWatchlistUpdate().catch((err) => {
      console.error('[CRON] Kesalahan tak terduga saat update watchlist:', err.message);
    });
  };

  // Sesuai jam bursa BEI (WIB), berbeda untuk Jumat karena istirahat siangnya lebih awal.
  cron.schedule('55 8 * * 1-5', runSafely);   // sesaat sebelum pasar buka, semua hari kerja
  cron.schedule('5 12 * * 1-4', runSafely);   // sesaat setelah Sesi I tutup, Senin-Kamis
  cron.schedule('35 11 * * 5', runSafely);    // sesaat setelah Sesi I tutup, khusus Jumat
  cron.schedule('55 15 * * 1-5', runSafely);  // sesaat setelah pasar tutup, semua hari kerja

  cron.schedule('0 0 * * *', () => {
    runCacheCleanup().catch((err) => {
      console.error('[CRON] Kesalahan tak terduga saat cleanup cache:', err.message);
    });
  });

  console.log('[CEK ZONA WAKTU] Server menganggap sekarang:', new Date().toString());
  console.log('⏰ Background Jobs (Cron) berhasil diinisialisasi: watchlist 4x sesuai jam bursa + cache cleanup (harian 00:00).');
}

module.exports = {
  startCronJobs,
  runWatchlistUpdate,
  runCacheCleanup
};