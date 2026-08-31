require('dotenv').config();
const connectDB = require('./config/db');
const VehicleHistory = require('./models/VehicleHistory');

async function debug() {
  try {
    await connectDB();
    console.log('✅ Connected to MongoDB');
    
    // Check total records
    const total = await VehicleHistory.countDocuments();
    console.log(`\n📊 Total VehicleHistory records: ${total}`);
    
    // Check recent records
    const recent = await VehicleHistory.find()
      .sort({ recordedAt: -1 })
      .limit(5)
      .lean();
    
    console.log('\n📋 Recent 5 records:');
    recent.forEach((doc, i) => {
      console.log(`\n${i+1}. OUID: ${doc.ouid}`);
      console.log(`   Vehicle: ${doc.vehicleNo}`);
      console.log(`   recordedAt: ${doc.recordedAt}`);
      console.log(`   Speed: ${doc.speed}`);
      console.log(`   Latitude: ${doc.latitude}`);
      console.log(`   Longitude: ${doc.longitude}`);
    });
    
    // Check date range for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const todayCount = await VehicleHistory.countDocuments({
      recordedAt: { $gte: today, $lt: tomorrow }
    });
    
    console.log(`\n📅 Records for today (${today.toLocaleDateString()}): ${todayCount}`);
    
    // Check if recordedAt field exists in all docs
    const withRecordedAt = await VehicleHistory.countDocuments({
      recordedAt: { $exists: true }
    });
    
    console.log(`✅ Records with recordedAt field: ${withRecordedAt}/${total}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

debug();
