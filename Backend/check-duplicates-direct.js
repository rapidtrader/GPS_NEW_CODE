const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://apshadev:Asp2000@cluster0.ej7ow.mongodb.net/gps_tracking';

(async () => {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db('gps_tracking');
    const collection = db.collection('vehicleroutehistories');
    
    const count = await collection.countDocuments();
    console.log('Total VehicleRouteHistory records:', count);
    
    // Get first few records to check
    const first5 = await collection.find().limit(5).toArray();
    console.log('\nFirst 5 records:');
    first5.forEach((rec, i) => {
      console.log(`  ${i+1}. ${rec.vehicleNo} | added: ${rec.added} | syncedBy: ${rec.syncedBy}`);
    });
    
    // Find records for a specific vehicle
    const vehicle1CBM = await collection.find({ vehicleNo: '1CBM' }).toArray();
    console.log(`\nRecords for vehicle 1CBM: ${vehicle1CBM.length}`);
    vehicle1CBM.slice(0, 5).forEach((rec, i) => {
      console.log(`  ${i+1}. ${rec.added} | speed: ${rec.speed} | syncedBy: ${rec.syncedBy}`);
    });
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
})();
