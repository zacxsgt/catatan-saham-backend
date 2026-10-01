// src/utils/aiClient.js

const DEFAULT_FALLBACK_MODELS = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',      // AI 1: Reasoning & matematika kuat
  'nvidia/nemotron-3-super-120b-a12b:free',      // AI 2: Nama slug diperbaiki, kuat di AIME/SWE-Bench
  'dots-studio/dots-3-note-preview:free',        // AI 3: Umum, reasoning & multi-step
  'qwen/qwen3.8-27b:free',                       // AI 4: Umum, cadangan tambahan
  'openrouter/free'                              // AI 5: Jaring pengaman otomatis dari OpenRouter
];

const REQUEST_TIMEOUT_MS = 25000;

async function callOpenRouter(prompt, model, apiKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:3000',
        'X-Title': 'Catatan Saham App',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Model ${model} merespons error ${response.status}: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error(`Model ${model} mengembalikan respons kosong.`);
    }

    return content;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Model ${model} timeout setelah ${REQUEST_TIMEOUT_MS / 1000} detik.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function generateAIResponse(prompt) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY belum dikonfigurasi di file .env');
  }

  const customModel = process.env.OPENROUTER_MODEL;
  const modelsToTry = customModel
    ? [customModel, ...DEFAULT_FALLBACK_MODELS.filter((m) => m !== customModel)]
    : DEFAULT_FALLBACK_MODELS;

  const errors = [];

  for (const model of modelsToTry) {
    try {
      console.log(`[AI CLIENT] Mencoba model: ${model}`);
      const content = await callOpenRouter(prompt, model, apiKey);
      return content;
    } catch (error) {
      console.error(`[AI CLIENT] Gagal dengan ${model}:`, error.message);
      errors.push(`${model}: ${error.message}`);
    }
  }

  throw new Error(`Semua model AI gagal merespons. Detail: ${errors.join(' | ')}`);
}

module.exports = {
  generateAIResponse
};