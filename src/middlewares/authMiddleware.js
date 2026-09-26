// src/middlewares/authMiddleware.js
const supabase = require('../config/supabase');

async function requireAuth(req, res, next) {
  try {
    // 1. Ambil token dari header Authorization
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Akses ditolak. Token autentikasi tidak ditemukan.'
      });
    }

    // Ekstrak token (membuang kata "Bearer ")
    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Akses ditolak. Token autentikasi kosong.'
      });
    }

    // 2. Verifikasi token menggunakan Supabase
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({
        success: false,
        error: 'Token tidak valid atau telah kedaluwarsa. Silakan login kembali.'
      });
    }

    // 3. Simpan data user ke dalam request (dipakai controller & rate limiter per-user)
    req.user = data.user;

    // 4. Lolos pengecekan, lanjutkan ke middleware/controller berikutnya
    next();
  } catch (error) {
    console.error('[AUTH ERROR]:', error.message);
    res.status(500).json({
      success: false,
      error: 'Terjadi kesalahan server saat memverifikasi autentikasi.'
    });
  }
}

module.exports = requireAuth;