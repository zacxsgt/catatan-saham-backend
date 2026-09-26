// src/services/pinService.js
const bcrypt = require('bcryptjs');
const supabaseAdmin = require('../config/supabase');
const {
  ValidationError,
  UnauthorizedError,
  NotFoundError,
  TooManyRequestsError
} = require('../utils/errors');

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 5;

// Memverifikasi PIN dan menangani sistem penguncian (Rate Limiting)
async function verifyPin(userId, pinCode) {
  if (typeof pinCode !== 'string' || !/^\d{6}$/.test(pinCode)) {
    throw new ValidationError('Format PIN tidak valid.');
  }

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('pin_hash, failed_pin_attempts, pin_locked_until')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    throw new NotFoundError('Profil tidak ditemukan');
  }

  // 1. Cek apakah akun sedang terkunci
  if (profile.pin_locked_until) {
    const lockedUntil = new Date(profile.pin_locked_until);
    const now = new Date();

    if (now < lockedUntil) {
      const remainingSeconds = Math.ceil((lockedUntil - now) / 1000);
      throw new TooManyRequestsError(
        `Terlalu banyak percobaan PIN. Terkunci selama ${remainingSeconds} detik lagi.`
      );
    }
  }

  // 2. Tolak jika PIN belum pernah diatur
  if (!profile.pin_hash) {
    throw new ValidationError('PIN belum diatur');
  }

  // 3. Verifikasi Hash
  const isMatch = await bcrypt.compare(pinCode, profile.pin_hash);

  if (!isMatch) {
    const previousAttempts = profile.failed_pin_attempts || 0;
    const newAttempts = previousAttempts + 1;
    let lockUntil = null;

    if (newAttempts >= MAX_ATTEMPTS) {
      lockUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString();
    }

    // Optimistic locking: mengurangi jendela race condition pada percobaan paralel.
    // Catatan: kolom failed_pin_attempts WAJIB punya constraint NOT NULL DEFAULT 0
    // di schema Supabase, supaya perbandingan .eq() di bawah ini tidak pernah
    // menabrak kasus NULL = 0 yang bernilai FALSE di SQL (lihat diskusi sebelumnya).
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ failed_pin_attempts: newAttempts, pin_locked_until: lockUntil })
      .eq('id', userId)
      .eq('failed_pin_attempts', previousAttempts)
      .select();

    if (updateError) {
      console.error(`[PIN SERVICE ERROR] Gagal update attempts untuk ${userId}:`, updateError.message);
    }

    throw new UnauthorizedError(
      newAttempts >= MAX_ATTEMPTS
        ? `PIN Salah ${MAX_ATTEMPTS}x. Akun dikunci selama ${LOCKOUT_MINUTES} menit.`
        : `PIN Salah. Sisa percobaan: ${MAX_ATTEMPTS - newAttempts}`
    );
  }

  // 4. Jika benar, reset counter kesalahan
  const { error: resetError } = await supabaseAdmin
    .from('profiles')
    .update({ failed_pin_attempts: 0, pin_locked_until: null })
    .eq('id', userId);

  if (resetError) {
    console.error(`[PIN SERVICE ERROR] Gagal reset attempts untuk ${userId}:`, resetError.message);
  }

  // Jalur sukses tetap return biasa — bukan kondisi error, tidak perlu throw.
  return { message: 'PIN Valid' };
}

// Menyimpan PIN baru (Di-hash sebelum masuk database)
async function setPin(userId, newPinCode) {
  if (typeof newPinCode !== 'string' || !/^\d{6}$/.test(newPinCode)) {
    throw new ValidationError('PIN harus berisi 6 angka');
  }

  const salt = await bcrypt.genSalt(10);
  const pinHash = await bcrypt.hash(newPinCode, salt);

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ pin_hash: pinHash, failed_pin_attempts: 0, pin_locked_until: null })
    .eq('id', userId);

  if (error) {
    // Kegagalan tulis ke DB di luar kendali user — bukan ValidationError.
    // Dibiarkan sebagai Error biasa, controller akan menangkapnya sebagai 500 generik
    // via instanceof AppError yang bernilai false.
    console.error(`[PIN SERVICE ERROR] Gagal simpan PIN untuk ${userId}:`, error.message);
    throw new Error('Gagal menyimpan PIN ke database.');
  }

  return { message: 'PIN berhasil diperbarui' };
}

module.exports = { verifyPin, setPin };