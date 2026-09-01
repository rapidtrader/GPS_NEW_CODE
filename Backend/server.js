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
app.use('/api/vehicle-history', require('./routes/vehicle-history'));

// Geocoding proxy - cached, no CORS issues, no auth needed
const geocodeCache = new Map();

app.get('/api/geocode', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ status: 'ERROR', message: 'lat and lng required' });

  const key = `${parseFloat(lat).toFixed(5)},${parseFloat(lng).toFixed(5)}`;

  // Return from cache
  if (geocodeCache.has(key)) {
    return res.json({ status: 'OK', address: geocodeCache.get(key), cached: true });
  }

  try {
    // Use Photon API (free, no rate limit, CORS friendly alternative to Nominatim)
    const response = await fetch(
      `https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}`,
      {
        headers: {
          'Accept': 'application/json',
        }
      }
    );
    const data = await response.json();
    const props = data.features?.[0]?.properties || {};
    
    const parts = [
      props.street,
      props.suburb || props.district,
      props.city || props.town || props.village,
      props.state,
    ].filter(Boolean);

    const address = parts.length
      ? parts.join(', ')
      : `${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}`;

    geocodeCache.set(key, address);
    res.json({ status: 'OK', address });
  } catch (err) {
    console.error('[Geocode] Error:', err.message);
    res.json({ status: 'OK', address: key });
  }
});

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
