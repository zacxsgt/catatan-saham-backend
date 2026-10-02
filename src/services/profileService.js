const supabase = require('../config/supabase');
const { ValidationError, NotFoundError } = require('../utils/errors');

async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .eq('id', userId)
    .single();

  if (error || !data) {
    throw new NotFoundError('Profil tidak ditemukan.');
  }

  return data;
}

async function updateProfile(userId, { full_name, avatar_url }) {
  const updates = {};

  if (full_name !== undefined) {
    if (typeof full_name !== 'string' || full_name.trim().length === 0) {
      throw new ValidationError('Nama tidak boleh kosong.');
    }
    if (full_name.trim().length > 60) {
      throw new ValidationError('Nama maksimal 60 karakter.');
    }
    updates.full_name = full_name.trim();
  }

  if (avatar_url !== undefined) {
    if (typeof avatar_url !== 'string' || avatar_url.trim().length === 0) {
      throw new ValidationError('URL foto tidak valid.');
    }
    updates.avatar_url = avatar_url.trim();
  }

  if (Object.keys(updates).length === 0) {
    throw new ValidationError('Tidak ada data untuk diperbarui.');
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select('id, full_name, avatar_url')
    .single();

  if (error) {
    console.error(`[PROFILE SERVICE ERROR] Gagal update profil ${userId}:`, error.message);
    throw new Error('Gagal memperbarui profil.');
  }

  return data;
}

module.exports = { getProfile, updateProfile };