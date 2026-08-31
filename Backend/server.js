require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const vehicleRoutes = require('./routes/vehicles');
const driverRoutes = require('./routes/drivers');
const analyticsRoutes = require('./routes/analytics');
const { startScheduler, stopScheduler } = require('./services/scheduler');

const app = express();
const PORT = process.env.PORT || 5000;

// Dev CORS
// app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));

// Production CORS — override via CORS_ORIGIN in .env (comma-separated)
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : [
      'https://gps.dynacleanindustries.com',
      // Dev (uncomment for local frontend testing):
      // 'http://localhost:5173',
      // 'http://127.0.0.1:5173',
    ];

app.use(cors({ origin: corsOrigins }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'OK', message: 'GPS Tracking Backend is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/distance-reports', require('./routes/distance-reports'));

async function start() {
  try {
    await connectDB();
    
    // Start GPS data synchronization scheduler
    startScheduler();
    
    app.listen(PORT, () => {
      // Dev
      // console.log(`Backend running on http://localhost:${PORT}`);
      const appUrl = process.env.APP_URL || 'https://gps.dynacleanindustries.com';
      console.log(`Backend running on port ${PORT}`);
      console.log(`App URL: ${appUrl}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

start();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  stopScheduler();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  stopScheduler();
  process.exit(0);
});
