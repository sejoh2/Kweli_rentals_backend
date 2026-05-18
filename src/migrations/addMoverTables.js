const pool = require("../config/db");

async function addMoverTables() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS mover_profiles (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        owner_user_id VARCHAR(128) UNIQUE NOT NULL,
        company_name VARCHAR(255) NOT NULL,
        business_logo_url TEXT,
        business_logo_storage_path TEXT,
        license_number VARCHAR(100),
        years_in_operation INTEGER,
        business_address TEXT,
        business_phone VARCHAR(50),
        business_email VARCHAR(255),
        website TEXT,
        base_location TEXT,
        service_areas JSONB DEFAULT '[]',
        moving_types JSONB DEFAULT '[]',
        fleet_details JSONB DEFAULT '[]',
        base_fee NUMERIC(12, 2),
        rate_per_km NUMERIC(12, 2),
        hourly_rate NUMERIC(12, 2),
        notice_period_days INTEGER,
        working_hours JSONB DEFAULT '{}',
        registration_status VARCHAR(30) DEFAULT 'pending_verification'
          CHECK (registration_status IN ('pending_verification', 'verified', 'rejected')),
        rejection_reason TEXT,
        admin_notes TEXT,
        verified_by VARCHAR(128),
        verified_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS mover_documents (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        mover_profile_id UUID NOT NULL REFERENCES mover_profiles(id) ON DELETE CASCADE,
        document_type VARCHAR(80) NOT NULL,
        file_name TEXT NOT NULL,
        file_url TEXT NOT NULL,
        file_size INTEGER,
        mime_type VARCHAR(120),
        storage_path TEXT NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (mover_profile_id, document_type)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mover_profiles_owner_user_id
      ON mover_profiles(owner_user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mover_profiles_status
      ON mover_profiles(registration_status)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mover_documents_profile_id
      ON mover_documents(mover_profile_id)
    `);

    await client.query("COMMIT");
    console.log("Mover tables initialized");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error creating mover tables:", error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addMoverTables;