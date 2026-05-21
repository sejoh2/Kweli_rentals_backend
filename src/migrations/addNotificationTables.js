const pool = require("../config/db");

async function addNotificationTables() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_tokens (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id VARCHAR(128) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        token TEXT NOT NULL,
        platform VARCHAR(30) DEFAULT 'android',
        device_id TEXT,
        is_active BOOLEAN DEFAULT true,
        last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(token)
      )
    `);

    await client.query(`
      ALTER TABLE mover_bookings
      ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notification_tokens_user_id
      ON notification_tokens(user_id);

      CREATE INDEX IF NOT EXISTS idx_notification_tokens_token
      ON notification_tokens(token);

      CREATE INDEX IF NOT EXISTS idx_notification_tokens_active
      ON notification_tokens(user_id, is_active);

      CREATE INDEX IF NOT EXISTS idx_mover_bookings_reminder
      ON mover_bookings(move_date, status, reminder_sent_at);
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';

      DROP TRIGGER IF EXISTS update_notification_tokens_updated_at
      ON notification_tokens;

      CREATE TRIGGER update_notification_tokens_updated_at
        BEFORE UPDATE ON notification_tokens
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await client.query("COMMIT");
    console.log("Notification token tables initialized");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error creating notification token tables:", error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addNotificationTables;