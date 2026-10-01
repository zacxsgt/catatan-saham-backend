// src/services/stockService.js

const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey']
});

const supabase = require('../config/supabase');
const { generateAIResponse } = require('../utils/aiClient');
const { ValidationError, NotFoundError, ExternalServiceError } = require('../utils/errors');

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 menit

function mapSectorToCategory(sector = '') {
  const s = sector.toLowerCase();

  if (s.includes('financial')) return 'Perbankan';
  if (s.includes('consumer')) return 'Konsumer/Ritel';
  if (s.includes('communication')) return 'Infrastruktur/Telco';
  if (s.includes('energy') || s.includes('basic materials')) return 'Komoditas';

  return 'Umum';
}

async function getStockData(symbol) {
  const cleanSymbol = symbol.toUpperCase().trim();

  if (!/^[A-Z]{4}$/.test(cleanSymbol)) {
    throw new ValidationError('Simbol saham harus berupa 4 huruf kapital.');
  }

  const { data: cachedData, error: cacheError } = await supabase
    .from('stock_prices')
    .select('*')
    .eq('symbol', cleanSymbol)
    .single();

  if (cacheError && cacheError.code !== 'PGRST116') {
    console.warn(`[CACHE WARNING] Gagal membaca cache untuk ${cleanSymbol}:`, cacheError.message);
  }

  const now = new Date();

  if (cachedData && (now - new Date(cachedData.last_updated)) < CACHE_TTL_MS) {
    console.log(`[CACHE HIT] Menggunakan data DB untuk ${cleanSymbol}`);
    return cachedData;
  }

  console.log(`[CACHE MISS] Fetching data Yahoo Finance untuk ${cleanSymbol}...`);
  const yfSymbol = `${cleanSymbol}.JK`;

  let quote;
  try {
    quote = await yahooFinance.quoteSummary(yfSymbol, {
      modules: ['financialData', 'defaultKeyStatistics', 'price', 'summaryDetail', 'assetProfile']
    });
  } catch (error) {
    console.error(`[FETCH ERROR] ${cleanSymbol}:`, error.message);

    const isRateLimited = error.message && error.message.includes('Too Many Requests');

    throw new ExternalServiceError(
      isRateLimited
        ? 'Yahoo Finance sedang membatasi permintaan untuk sementara. Coba lagi dalam beberapa menit.'
        : `Gagal mengambil data dari Yahoo Finance untuk ${cleanSymbol}. Coba lagi sebentar lagi.`
    );
  }

  const price = quote.price?.regularMarketPrice;
  if (price === undefined || price === null) {
    throw new NotFoundError(`Emiten dengan simbol ${cleanSymbol} tidak ditemukan.`);
  }

  const name = quote.price?.longName || cleanSymbol;
  const eps = quote.defaultKeyStatistics?.trailingEps ?? 0;
  const bvps = quote.defaultKeyStatistics?.bookValue ?? 0;
  const roe = quote.financialData?.returnOnEquity ?? 0;
  const per = quote.summaryDetail?.trailingPE ?? 0;
  const pbv = quote.defaultKeyStatistics?.priceToBook ?? 0;
  const der = quote.financialData?.debtToEquity ?? 0;
  const dividendYield = quote.summaryDetail?.dividendYield ?? 0;
  const ebitda = quote.financialData?.ebitda ?? 0;
  const enterpriseValue = quote.defaultKeyStatistics?.enterpriseValue ?? 0;
  const evToEbitda = quote.defaultKeyStatistics?.enterpriseToEbitda ?? 0;

  const category = mapSectorToCategory(quote.assetProfile?.sector);

  const stockData = {
    symbol: cleanSymbol,
    name,
    category,
    raw_sector: quote.assetProfile?.sector || null,
    raw_industry: quote.assetProfile?.industry || null,
    current_price: price,
    eps,
    bvps,
    roe,
    per,
    pbv,
    der,
    dividend_yield: dividendYield,
    ebitda,
    enterprise_value: enterpriseValue,
    ev_to_ebitda: evToEbitda,
    last_updated: now.toISOString()
  };

  const { error: upsertError } = await supabase
    .from('stock_prices')
    .upsert(stockData, { onConflict: 'symbol' });

  if (upsertError) {
    console.error(`[DB UPSERT ERROR] Gagal menyimpan cache ${cleanSymbol}:`, upsertError.message);
  }

  return stockData;
}

// [BARU] Khusus untuk kebutuhan ringan seperti formulir Beli/Jual: HANYA membaca
// dari cache Supabase, TIDAK PERNAH memanggil Yahoo Finance secara langsung.
// Kalau simbolnya belum pernah tersimpan (belum pernah masuk watchlist atau belum
// pernah dianalisis), fungsi ini melempar 404, bukan diam-diam fetch langsung —
// supaya formulir tidak memicu panggilan Yahoo yang bisa kena rate-limit.
async function getCachedStockData(symbol) {
  const cleanSymbol = symbol.toUpperCase().trim();

  if (!/^[A-Z]{4}$/.test(cleanSymbol)) {
    throw new ValidationError('Simbol saham harus berupa 4 huruf kapital.');
  }

  const { data, error } = await supabase
    .from('stock_prices')
    .select('symbol, name, current_price, last_updated')
    .eq('symbol', cleanSymbol)
    .single();

  if (error || !data) {
    throw new NotFoundError(`Harga untuk ${cleanSymbol} belum tersedia. Coba cek lewat menu Analisis dulu.`);
  }

  return data;
}

async function analyzeStockWithAI(stockData, budget) {
  const prompt = `
Anda adalah analis saham profesional. Analisis saham berikut dan berikan rekomendasi aksi.
Hitung lot maksimal yang bisa dibeli dengan budget pengguna, serta harga wajar saham ini.

=== DATA SAHAM ===
Simbol: ${stockData.symbol}
Nama: ${stockData.name}
Harga Saat Ini: Rp ${stockData.current_price}
Budget User: Rp ${budget}

Sektor (kategori sistem): ${stockData.category}
Sektor asli (Yahoo Finance): ${stockData.raw_sector || 'tidak tersedia'} / ${stockData.raw_industry || 'tidak tersedia'}

Catatan: Kategori sistem di atas adalah hasil pemetaan otomatis dan bisa kurang presisi untuk sub-industri tertentu (misal asuransi/multifinance ikut tergolong "Perbankan"). Jika sektor asli dari Yahoo Finance menunjukkan sub-industri yang berbeda karakteristiknya, sesuaikan metode valuasi secara wajar dan sebutkan penyesuaian ini di field "catatan_keterbatasan_data".

Metrik Keuangan:
- EPS: ${stockData.eps}
- BVPS: ${stockData.bvps}
- ROE: ${(stockData.roe * 100).toFixed(2)}%
- PER: ${stockData.per}
- PBV: ${stockData.pbv}
- DER: ${stockData.der}
- Dividend Yield: ${(stockData.dividend_yield * 100).toFixed(2)}%
- EBITDA: Rp ${stockData.ebitda}
- Enterprise Value: Rp ${stockData.enterprise_value}
- EV/EBITDA (dari Yahoo Finance): ${stockData.ev_to_ebitda}x

=== METODE VALUASI ===
Pilih metode yang paling cocok berdasarkan Sektor (atau penyesuaian dari Sektor Asli):
- Perbankan: Justified PBV (berbasis ROE)
- Konsumer/Ritel: PE Historical Band
- Infrastruktur/Telco: Gunakan rasio EV/EBITDA yang tersedia untuk menilai valuasi relatif terhadap rata-rata sektor telco Indonesia (kisaran wajar 5-8x). Jika EBITDA atau Enterprise Value bernilai 0/tidak tersedia, gunakan Justified PBV sebagai cadangan.
- Komoditas: Valuasi berbasis siklus / Graham Number
- Umum: Gunakan Justified PBV sebagai metode standar utama. Jika data ROE tidak tersedia, gunakan Graham Number sebagai cadangan.

! PENTING (ATURAN MATEMATIS): Jika EPS atau BVPS bernilai negatif atau nol, JANGAN gunakan Graham Number karena hasilnya tidak valid secara matematis. Gunakan metode cadangan (seperti PBV) dan sebutkan alasannya di "catatan_keterbatasan_data".

Berikan respons HANYA dalam format JSON dengan struktur persis seperti ini, tanpa teks atau markdown lain di luar JSON:
{
  "keputusan": "BELI / TAHAN / JUAL",
  "harga_wajar": <angka_hasil_valuasi>,
  "margin_of_safety": <persentase_potensi_upside/downside>,
  "analisis": "Penjelasan singkat 2-3 kalimat kenapa valuasi ini didapat dan rasionalisasi keputusan.",
  "maks_lot": <jumlah_lot_maksimal_sesuai_budget>,
  "catatan_keterbatasan_data": "Penjelasan jika ada penyesuaian sektor, anomali data, atau asumsi khusus yang Anda buat."
}`;

  let aiResultText;
  try {
    aiResultText = await generateAIResponse(prompt);
  } catch (error) {
    console.error('[AI ERROR]:', error.message);
    throw new ExternalServiceError('Layanan AI sedang tidak dapat dihubungi. Coba lagi sebentar lagi.');
  }

  if (!aiResultText || typeof aiResultText !== 'string') {
    throw new ExternalServiceError('AI tidak mengembalikan respons yang valid.');
  }

  const jsonMatch = aiResultText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('Tidak ditemukan blok JSON di respons AI:', aiResultText);
    throw new ExternalServiceError('AI memberikan format yang tidak valid.');
  }

  let parsedData;
  try {
    parsedData = JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Gagal mem-parsing output AI:', aiResultText);
    throw new ExternalServiceError('AI memberikan format yang tidak valid.');
  }

  const requiredFields = ['keputusan', 'harga_wajar', 'maks_lot'];
  const missing = requiredFields.filter((f) => parsedData[f] === undefined);
  if (missing.length > 0) {
    console.error(`Field wajib hilang dari respons AI: ${missing.join(', ')}`, parsedData);
    throw new ExternalServiceError('AI memberikan hasil analisis yang tidak lengkap.');
  }

  return parsedData;
}

async function processStockRequest(symbol, budget) {
  const stockData = await getStockData(symbol);
  const analysis = await analyzeStockWithAI(stockData, budget);

  return {
    saham: stockData,
    analisis: analysis
  };
}

module.exports = {
  getStockData,
  getCachedStockData,
  analyzeStockWithAI,
  processStockRequest
};