require('dotenv').config({ path: '../.env' });
const trendingService = require('../src/services/trending.service');

async function resetWeeklyStats() {
  console.log('🔄 Running weekly stats reset...');
  console.log(`Time: ${new Date().toISOString()}`);
  
  try {
    await trendingService.resetWeeklyStats();
    console.log('✅ Weekly stats reset completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Weekly stats reset failed:', error);
    process.exit(1);
  }
}

resetWeeklyStats();