const { getProfile, updateProfile } = require('../services/profileService');
const { AppError } = require('../utils/errors');

function handleError(res, error, context, userId) {
  console.error(`[PROFILE CONTROLLER ERROR] ${context} (User: ${userId || 'Unknown'}):`, error.message);
  const isKnownError = error instanceof AppError;
  const statusCode = isKnownError ? error.statusCode : 500;
  return res.status(statusCode).json({
    success: false,
    error: isKnownError ? error.message : 'Terjadi kesalahan internal.'
  });
}

async function getProfileController(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Sesi tidak valid.' });

    const data = await getProfile(userId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'getProfile', req.user?.id);
  }
}

async function updateProfileController(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Sesi tidak valid.' });

    const { full_name, avatar_url } = req.body;
    const data = await updateProfile(userId, { full_name, avatar_url });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'updateProfile', req.user?.id);
  }
}

module.exports = { getProfileController, updateProfileController };