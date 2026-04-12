const pool = require("../config/db");

// ANSI color codes for console
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m"
};

async function initTables() {
  console.log(`${colors.blue}📦 Initializing database tables...${colors.reset}`);

  try {
    // Enable UUID extension
    await pool.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    `);
    console.log(`${colors.green}✅ UUID extension enabled${colors.reset}`);

    // Create users table (unified for all roles)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        firebase_uid VARCHAR(128) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        phone_number VARCHAR(20),
        location TEXT,
        profile_image_url TEXT,
        role VARCHAR(50) DEFAULT 'home_finder' CHECK (role IN ('home_finder', 'landlord', 'agent', 'movers', 'admin')),
        is_active BOOLEAN DEFAULT true,
        email_verified BOOLEAN DEFAULT false,
        auth_provider VARCHAR(50) DEFAULT 'email' CHECK (auth_provider IN ('email', 'google', 'apple')),
        is_verified BOOLEAN DEFAULT false,
        verification_status TEXT DEFAULT 'not_verified' CHECK (verification_status IN ('verified', 'in_progress', 'not_verified')),
        total_listings INT DEFAULT 0,
        rating DECIMAL(3,2) DEFAULT 0.0,
        last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log(`${colors.green}✅ Users table created${colors.reset}`);

    // Create properties table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS properties (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        owner_id VARCHAR(128) NOT NULL REFERENCES users(firebase_uid) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        property_type TEXT NOT NULL,
        location_text TEXT NOT NULL,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        monthly_rent NUMERIC NOT NULL,
        security_deposit NUMERIC,
        bedrooms INT,
        bathrooms INT,
        size_sqm NUMERIC,
        furnished BOOLEAN DEFAULT false,
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'pending', 'occupied')),
        likes INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log(`${colors.green}✅ Properties table created${colors.reset}`);

    // Create property_media table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS property_media (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        type TEXT CHECK (type IN ('image', 'video')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log(`${colors.green}✅ Property media table created${colors.reset}`);

    // Create property_amenities table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS property_amenities (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
        name TEXT NOT NULL
      );
    `);
    console.log(`${colors.green}✅ Property amenities table created${colors.reset}`);

    // Create indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_properties_owner_id ON properties(owner_id);
      CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
      CREATE INDEX IF NOT EXISTS idx_property_media_property_id ON property_media(property_id);
      CREATE INDEX IF NOT EXISTS idx_property_amenities_property_id ON property_amenities(property_id);
    `);
    console.log(`${colors.green}✅ Database indexes created${colors.reset}`);

    // Create trigger to auto-update updated_at
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
      
      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      DROP TRIGGER IF EXISTS update_properties_updated_at ON properties;
      
      CREATE TRIGGER update_users_updated_at
        BEFORE UPDATE ON users
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
        
      CREATE TRIGGER update_properties_updated_at
        BEFORE UPDATE ON properties
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);
    console.log(`${colors.green}✅ Created auto-update triggers${colors.reset}`);

    // Create trigger to auto-verify admin users when role changes to admin
    await pool.query(`
      CREATE OR REPLACE FUNCTION auto_verify_admin()
      RETURNS TRIGGER AS $$
      BEGIN
        -- If the role is being changed to 'admin'
        IF NEW.role = 'admin' AND OLD.role != 'admin' THEN
          NEW.is_verified := true;
          NEW.verification_status := 'verified';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      
      DROP TRIGGER IF EXISTS trigger_auto_verify_admin ON users;
      
      CREATE TRIGGER trigger_auto_verify_admin
        BEFORE UPDATE OF role ON users
        FOR EACH ROW
        EXECUTE FUNCTION auto_verify_admin();
    `);
    console.log(`${colors.green}✅ Created auto-verify admin trigger${colors.reset}`);

    console.log(`${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.green}✅ ALL TABLES CREATED SUCCESSFULLY!${colors.reset}`);
    console.log(`${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);

  } catch (error) {
    console.log(`${colors.red}❌ Error creating tables:${colors.reset}`, error.message);
    throw error;
  }
}

module.exports = initTables;