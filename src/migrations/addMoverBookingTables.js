const pool = require("../config/db");

async function addMoverBookingTables() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS mover_bookings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        homefinder_user_id VARCHAR(128) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        mover_profile_id UUID NOT NULL REFERENCES mover_profiles(id) ON DELETE CASCADE,
        mover_user_id VARCHAR(128) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        pickup_address TEXT NOT NULL,
        delivery_address TEXT NOT NULL,
        move_date DATE NOT NULL,
        move_time VARCHAR(40) NOT NULL,
        inventory_size VARCHAR(80),
        distance_km NUMERIC(10, 2) DEFAULT 10,
        estimated_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
        final_price NUMERIC(12, 2),
        status VARCHAR(40) NOT NULL DEFAULT 'pending_mover_confirmation'
          CHECK (status IN (
            'pending_mover_confirmation',
            'confirmed',
            'declined',
            'in_progress',
            'completed',
            'cancelled_by_homefinder',
            'cancelled_by_mover'
          )),
        mover_response_note TEXT,
        cancellation_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS mover_reviews (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        booking_id UUID UNIQUE NOT NULL REFERENCES mover_bookings(id) ON DELETE CASCADE,
        homefinder_user_id VARCHAR(128) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        mover_profile_id UUID NOT NULL REFERENCES mover_profiles(id) ON DELETE CASCADE,
        mover_user_id VARCHAR(128) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        rating NUMERIC(2, 1) NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS mover_earnings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        booking_id UUID UNIQUE NOT NULL REFERENCES mover_bookings(id) ON DELETE CASCADE,
        mover_profile_id UUID NOT NULL REFERENCES mover_profiles(id) ON DELETE CASCADE,
        mover_user_id VARCHAR(128) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        gross_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
        platform_fee NUMERIC(12, 2) NOT NULL DEFAULT 0,
        net_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
        status VARCHAR(30) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'paid', 'cancelled')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mover_bookings_homefinder
      ON mover_bookings(homefinder_user_id);

      CREATE INDEX IF NOT EXISTS idx_mover_bookings_mover_profile
      ON mover_bookings(mover_profile_id);

      CREATE INDEX IF NOT EXISTS idx_mover_bookings_mover_user
      ON mover_bookings(mover_user_id);

      CREATE INDEX IF NOT EXISTS idx_mover_bookings_status
      ON mover_bookings(status);

      CREATE INDEX IF NOT EXISTS idx_mover_bookings_move_date
      ON mover_bookings(move_date);

      CREATE INDEX IF NOT EXISTS idx_mover_reviews_mover_profile
      ON mover_reviews(mover_profile_id);

      CREATE INDEX IF NOT EXISTS idx_mover_earnings_mover_profile
      ON mover_earnings(mover_profile_id);

      CREATE INDEX IF NOT EXISTS idx_mover_earnings_created_at
      ON mover_earnings(created_at);
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';

      DROP TRIGGER IF EXISTS update_mover_bookings_updated_at ON mover_bookings;
      DROP TRIGGER IF EXISTS update_mover_reviews_updated_at ON mover_reviews;
      DROP TRIGGER IF EXISTS update_mover_earnings_updated_at ON mover_earnings;

      CREATE TRIGGER update_mover_bookings_updated_at
        BEFORE UPDATE ON mover_bookings
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_mover_reviews_updated_at
        BEFORE UPDATE ON mover_reviews
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_mover_earnings_updated_at
        BEFORE UPDATE ON mover_earnings
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await client.query("COMMIT");
    console.log("Mover booking tables initialized");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error creating mover booking tables:", error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addMoverBookingTables;