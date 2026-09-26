// src/controllers/pinController.js
const { verifyPin, setPin } = require('../services/pinService');
const { AppError } = require('../utils/errors');

async function verifyPinController(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Sesi tidak valid. Silakan login kembali.' });
    }

    const { pin } = req.body;
    const result = await verifyPin(userId, pin);

    return res.status(200).json({ success: true, message: result.message });
  } catch (error) {
    console.error(`[PIN CONTROLLER ERROR] verifyPin (User: ${req.user?.id || 'Unknown'}):`, error.message);

    const isKnownError = error instanceof AppError;
    const statusCode = isKnownError ? error.statusCode : 500;

    return res.status(statusCode).json({
      success: false,
      error: isKnownError ? error.message : 'Terjadi kesalahan internal saat memverifikasi PIN.'
    });
  }
}

async function setPinController(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Sesi tidak valid. Silakan login kembali.' });
    }

    const { pin } = req.body;

    if (!pin || typeof pin !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'PIN wajib diisi dan harus berupa teks 6 digit angka.'
      });
    }

    const result = await setPin(userId, pin);

    return res.status(200).json({ success: true, message: result.message });
  } catch (error) {
    console.error(`[PIN CONTROLLER ERROR] setPin (User: ${req.user?.id || 'Unknown'}):`, error.message);

    const isKnownError = error instanceof AppError;
    const statusCode = isKnownError ? error.statusCode : 500;

    return res.status(statusCode).json({
      success: false,
      error: isKnownError ? error.message : 'Terjadi kesalahan internal saat menyimpan PIN.'
    });
  }
}

module.exports = { verifyPinController, setPinController };