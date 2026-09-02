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

// Reverse geocode proxy — Google Maps Geocoding API use karta hai
app.get('/api/geocode', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ address: null, error: 'lat and lng are required' });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  try {
    let url, response, data;

    if (apiKey) {
      // Google Maps Geocoding API
      url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(lat)},${encodeURIComponent(lng)}&key=${apiKey}&language=en&result_type=street_address|route|locality`;
      response = await fetch(url);
      data = await response.json();

      if (data.status === 'OK' && data.results?.[0]?.formatted_address) {
        return res.json({ address: data.results[0].formatted_address });
      }
      // Fall through to Nominatim if Google fails
      console.warn(`[Geocode] Google Maps returned status: ${data.status}, falling back to Nominatim`);
    }

    // Fallback: Nominatim (OpenStreetMap)
    url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=17&addressdetails=0`;
    response = await fetch(url, {
      headers: {
        'User-Agent': 'GPS-Tracking-App/1.0 (gps.dynacleanindustries.com)',
        'Accept': 'application/json',
        'Accept-Language': 'en',
      },
    });

    if (!response.ok) {
      throw new Error(`Nominatim HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(`Nominatim returned non-JSON: ${contentType}`);
    }

    data = await response.json();
    return res.json({ address: data.display_name || `${lat},${lng}` });

  } catch (err) {
    console.error('[Geocode] Error:', err.message);
    // Always return coordinates as fallback — never crash the frontend
    return res.json({ address: `${lat},${lng}` });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/distance-reports', require('./routes/distance-reports'));
app.use('/api/vehicle-history', require('./routes/vehicle-history'));


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
