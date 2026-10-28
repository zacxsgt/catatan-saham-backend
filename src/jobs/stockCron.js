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
const TIMEZONE = 'Asia/Jakarta';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mengambil semua simbol saham yang sedang dipegang user mana pun,
// supaya harganya ikut disegar meski tidak ada di watchlist tetap.
async function getHeldSymbols() {
  const { data, error } = await supabaseAdmin
    .from('transactions')
    .select('symbol')

  if (error || !data) {
    console.warn('[CRON] Gagal membaca daftar saham yang dipegang:', error?.message)
    return []
  }

  return [...new Set(data.map((r) => r.symbol))]
}

async function runWatchlistUpdate() {
  const heldSymbols = await getHeldSymbols()

  // Gabungkan watchlist tetap dengan saham yang sedang dipegang, tanpa duplikat.
  const allSymbols = [...new Set([...WATCHLIST, ...heldSymbols])]

  console.log(`[CRON] Mulai update ${allSymbols.length} simbol (${WATCHLIST.length} watchlist + ${allSymbols.length - WATCHLIST.length} kepemilikan)...`)

  let successCount = 0
  let failCount = 0

  for (const symbol of allSymbols) {
    try {
      await getStockData(symbol)
      successCount++
    } catch (error) {
      failCount++
      console.error(`[CRON] ❌ ${symbol} gagal diperbarui:`, error.message)
    }
    await sleep(DELAY_BETWEEN_REQUESTS_MS)
  }

  console.log(`[CRON] Update selesai. Berhasil: ${successCount}, Gagal: ${failCount}`)
  return { successCount, failCount }
}

async function runCacheCleanup() {
  console.log('[CRON] Menjalankan pembersihan cache saham lama...')

  try {
    // Ambil semua simbol yang masih relevan, tidak boleh dihapus.
    const heldSymbols = await getHeldSymbols()
    const protectedSymbols = [...new Set([...WATCHLIST, ...heldSymbols])]

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    // Hanya hapus cache yang lebih dari 24 jam DAN tidak ada di daftar terlindungi.
    const { data, error } = await supabaseAdmin
      .from('stock_prices')
      .delete()
      .lt('last_updated', oneDayAgo)
      .not('symbol', 'in', `(${protectedSymbols.map((s) => `"${s}"`).join(',')})`)
      .select()

    if (error) {
      console.error('[CRON ERROR] Gagal membersihkan cache:', error.message)
    } else {
      console.log(`[CRON SUCCESS] Menghapus ${data?.length ?? 0} cache saham usang yang tidak lagi relevan.`)
    }
  } catch (error) {
    console.error('[CRON EXCEPTION] Kesalahan saat pembersihan:', error.message)
  }
}

function startCronJobs() {
  const runSafely = () => {
    runWatchlistUpdate().catch((err) => {
      console.error('[CRON] Kesalahan tak terduga saat update watchlist:', err.message)
    })
  }

  cron.schedule('55 8 * * 1-5', runSafely, { timezone: TIMEZONE })
  cron.schedule('5 12 * * 1-4', runSafely, { timezone: TIMEZONE })
  cron.schedule('35 11 * * 5', runSafely, { timezone: TIMEZONE })
  cron.schedule('55 15 * * 1-5', runSafely, { timezone: TIMEZONE })

  cron.schedule('0 0 * * *', () => {
    runCacheCleanup().catch((err) => {
      console.error('[CRON] Kesalahan tak terduga saat cleanup:', err.message)
    })
  }, { timezone: TIMEZONE })

  console.log('⏰ Background Jobs (Cron) berhasil diinisialisasi, memakai zona waktu Asia/Jakarta.')
}

module.exports = {
  startCronJobs,
  runWatchlistUpdate,
  runCacheCleanup
}