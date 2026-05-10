require('dotenv').config({ path: '../.env' });
const pool = require('../src/config/db');
const trendingService = require('../src/services/trending.service');

async function updateTrending() {
  console.log('🔄 Running trending update job...');
  console.log(`Time: ${new Date().toISOString()}`);
  
  try {
    await trendingService.updateAllTrendingScores();
    console.log('✅ Trending update completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Trending update failed:', error);
    process.exit(1);
  }
}

updateTrending();