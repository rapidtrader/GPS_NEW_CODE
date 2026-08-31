const { fetchVehicleList, fetchVehicleDetailList, fetchDriverDetailList } = require('./tbtrack');
const { saveVehicleInfo } = require('./analyticsStore');
const { saveVehicleDetails } = require('./vehicleDetailStore');
const VehicleHistory = require('../models/VehicleHistory');

// Sync interval in milliseconds (default: 5 minutes)
const SYNC_INTERVAL_MS = process.env.GPS_SYNC_INTERVAL_MS ? Number(process.env.GPS_SYNC_INTERVAL_MS) : 5 * 60 * 1000;

let syncJob = null;
let isSyncing = false;

async function syncVehicleData() {
  // Prevent overlapping syncs
  if (isSyncing) {
    console.log('[Scheduler] Sync already in progress, skipping...');
    return;
  }
  
  isSyncing = true;
  const startTime = Date.now();
  
  try {
    console.log('[Scheduler] Starting GPS data sync...');
    
    // Fetch vehicle list with complete GPS data
    const vehicleList = await fetchVehicleList();
    const vehicleCount = Array.isArray(vehicleList) ? vehicleList.length : 0;
    console.log(`[Scheduler] Fetched ${vehicleCount} vehicles from TBTrack`);
    
    if (!vehicleList || vehicleCount === 0) {
      console.warn('[Scheduler] No vehicle data received from TBTrack');
      isSyncing = false;
      return;
    }
    
    // Save GPS history for each vehicle with real data
    try {
      const historyDocs = [];
      
      for (const vehicle of vehicleList) {
        if (!vehicle.ouid) continue;
        
        // Extract location from terminalPacketMeta
        let latitude = null;
        let longitude = null;
        if (vehicle.terminalPacketMeta?.pLoc && Array.isArray(vehicle.terminalPacketMeta.pLoc)) {
          [longitude, latitude] = vehicle.terminalPacketMeta.pLoc;
        }
        
        // Parse last update time
        let recordedAt = new Date();
        if (vehicle.lu) {
          try {
            const [date, time] = vehicle.lu.split(' ');
            const [d, m, y] = date.split('/');
            const parsedDate = new Date(`${y}-${m}-${d}T${time}`);
            if (!isNaN(parsedDate.getTime())) {
              recordedAt = parsedDate;
            }
          } catch (err) {
            console.warn(`[Scheduler] Could not parse time for ${vehicle.vehicleNo}: ${vehicle.lu}`);
          }
        }
        
        // Get speed from terminalPacketMeta or default to 0
        let speed = 0;
        if (vehicle.terminalPacketMeta?.speed) {
          speed = Number(vehicle.terminalPacketMeta.speed);
        } else if (vehicle.terminalPacketMeta?.pSpeed) {
          speed = Number(vehicle.terminalPacketMeta.pSpeed);
        }
        
        const doc = new VehicleHistory({
          ouid: String(vehicle.ouid),
          vehicleNo: vehicle.vehicleNo || '',
          state: vehicle.state || '',
          address: vehicle.address || '',
          odometer: vehicle.odometer ? Number(vehicle.odometer) : null,
          latitude: latitude ? Number(latitude) : null,
          longitude: longitude ? Number(longitude) : null,
          battery: vehicle.terminalPacketMeta?.battery ? Number(vehicle.terminalPacketMeta.battery) : null,
          speed: Number.isFinite(speed) ? speed : null,  // ← Fix: save as number, not undefined
          rawData: vehicle,
          recordedAt,
        });
        
        historyDocs.push(doc.save());
      }
      
      if (historyDocs.length > 0) {
        await Promise.all(historyDocs);
        console.log(`[Scheduler] Saved ${historyDocs.length} vehicle history records to VehicleHistory`);
      }
    } catch (err) {
      console.error('[Scheduler] Error saving vehicle history:', err.message);
    }
    
    // Fetch and save vehicle details
    try {
      const vehicleDetails = await fetchVehicleDetailList();
      if (Array.isArray(vehicleDetails) && vehicleDetails.length > 0) {
        await saveVehicleDetails(vehicleDetails);
        console.log(`[Scheduler] Saved ${vehicleDetails.length} vehicle details`);
      }
    } catch (err) {
      console.warn('[Scheduler] Warning fetching vehicle details:', err.message);
    }
    
    // Fetch and save driver details
    try {
      const driverDetails = await fetchDriverDetailList();
      if (Array.isArray(driverDetails) && driverDetails.length > 0) {
        console.log(`[Scheduler] Synced ${driverDetails.length} driver details`);
      }
    } catch (err) {
      console.warn('[Scheduler] Warning fetching driver details:', err.message);
    }
    
    const duration = Date.now() - startTime;
    console.log(`[Scheduler] GPS sync completed successfully in ${duration}ms`);
  } catch (error) {
    console.error('[Scheduler] Error syncing GPS data:', error.message);
    console.error('[Scheduler] Stack:', error.stack);
  } finally {
    isSyncing = false;
  }
}

function startScheduler() {
  if (syncJob) {
    console.warn('[Scheduler] Scheduler already running');
    return;
  }
  
  console.log(`[Scheduler] Starting GPS data synchronization (interval: ${SYNC_INTERVAL_MS}ms)`);
  
  // Run immediately on startup
  syncVehicleData().catch((err) => {
    console.error('[Scheduler] Initial sync failed:', err.message);
  });
  
  // Then run periodically
  syncJob = setInterval(() => {
    syncVehicleData().catch((err) => {
      console.error('[Scheduler] Periodic sync error:', err.message);
    });
  }, SYNC_INTERVAL_MS);
}

function stopScheduler() {
  if (syncJob) {
    clearInterval(syncJob);
    syncJob = null;
    console.log('[Scheduler] GPS data synchronization stopped');
  }
}

module.exports = {
  startScheduler,
  stopScheduler,
  syncVehicleData,
};
