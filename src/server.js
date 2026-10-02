require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const stockRoutes = require('./routes/stockRoutes');
const pinRoutes = require('./routes/pinRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const profileRoutes = require('./routes/profileRoutes');

const { startCronJobs } = require('./jobs/stockCron');

const app = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1);

app.use(helmet());

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5173'
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Akses diblokir oleh kebijakan CORS.'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json({ limit: '10kb' }));

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server Catatan Saham beroperasi normal.',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/stocks', stockRoutes);
app.use('/api/pin', pinRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/profile', profileRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint API tidak ditemukan.' });
});

app.use((err, req, res, next) => {
  if (err.message === 'Akses diblokir oleh kebijakan CORS.') {
    return res.status(403).json({ success: false, error: err.message });
  }

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ success: false, error: 'Format JSON pada request body tidak valid.' });
  }

  if (err.statusCode) {
    return res.status(err.statusCode).json({ success: false, error: err.message });
  }

  console.error('[SERVER GLOBAL ERROR]:', err.stack || err.message);
  res.status(500).json({ success: false, error: 'Terjadi kesalahan server internal.' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di port ${PORT}`);
  startCronJobs();
});