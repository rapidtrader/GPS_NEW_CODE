const mongoose = require('mongoose');
require('./config/db.js');
const VehicleRouteHistory = require('./models/VehicleRouteHistory');

(async () => {
  try {
    const count = await VehicleRouteHistory.countDocuments();
    console.log('Total VehicleRouteHistory records:', count);
    
    // Find duplicates - same vehicleNo + added + syncedBy
    const duplicates = await VehicleRouteHistory.aggregate([
      {
        $group: {
          _id: { vehicleNo: '$vehicleNo', added: '$added', syncedBy: '$syncedBy' },
          count: { $sum: 1 },
          ids: { $push: '$_id' }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]);
    
    console.log('Duplicate groups:', duplicates.length);
    duplicates.forEach(d => {
      console.log('  -', d._id.vehicleNo, d._id.added, 'count:', d.count);
      console.log('    IDs:', d.ids);
    });
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
