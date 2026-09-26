// src/jobs/stockCron.js
const cron = require('node-cron');
const supabaseAdmin = require('../config/supabase');

function startCronJobs() {
  // Jadwal: Berjalan setiap hari pada jam 00:00 (Tengah Malam)
  cron.schedule('0 0 * * *', async () => {
    console.log('[CRON] Menjalankan tugas pembersihan cache saham lama...');
    
    try {
      // Tentukan batas waktu: 24 jam ke belakang dari waktu sekarang
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Hapus baris di tabel 'stock_prices' yang kolom last_updated-nya lebih tua dari 24 jam
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
  });

  console.log('⏰ Background Jobs (Cron) berhasil diinisialisasi.');
}

module.exports = {
  startCronJobs
};