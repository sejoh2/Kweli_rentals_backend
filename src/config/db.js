const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  // Add these settings to prevent connection termination
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 20000, // How long to wait for a connection
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
});

// Handle application shutdown
process.on('SIGINT', async () => {
  await pool.end();
  console.log('Pool has ended');
  process.exit(0);
});

module.exports = pool;