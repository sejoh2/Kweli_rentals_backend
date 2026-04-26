const pool = require("../config/db");

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  blue: "\x1b[34m"
};

async function addMessagingTables() {
  console.log(`${colors.blue}📦 Adding messaging tables...${colors.reset}`);

  try {
    // Create conversations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        participant1_id VARCHAR(128) NOT NULL REFERENCES users(firebase_uid) ON DELETE CASCADE,
        participant2_id VARCHAR(128) NOT NULL REFERENCES users(firebase_uid) ON DELETE CASCADE,
        last_message TEXT,
        last_message_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_message_sender_id VARCHAR(128),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(participant1_id, participant2_id),
        CHECK (participant1_id != participant2_id)
      );
    `);
    console.log(`${colors.green}✅ Conversations table created${colors.reset}`);

    // Create messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id VARCHAR(128) NOT NULL REFERENCES users(firebase_uid) ON DELETE CASCADE,
        receiver_id VARCHAR(128) NOT NULL REFERENCES users(firebase_uid) ON DELETE CASCADE,
        message_text TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        read_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log(`${colors.green}✅ Messages table created${colors.reset}`);

    // Create user_status table for online/offline tracking
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_status (
        user_id VARCHAR(128) PRIMARY KEY REFERENCES users(firebase_uid) ON DELETE CASCADE,
        is_online BOOLEAN DEFAULT false,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log(`${colors.green}✅ User status table created${colors.reset}`);

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_participant1 ON conversations(participant1_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_participant2 ON conversations(participant2_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_receiver_unread ON messages(receiver_id, is_read) WHERE is_read = false;
      CREATE INDEX IF NOT EXISTS idx_messages_sender_receiver ON messages(sender_id, receiver_id);
    `);
    console.log(`${colors.green}✅ Messaging indexes created${colors.reset}`);

    // Create trigger to update conversation on new message
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_conversation_on_message()
      RETURNS TRIGGER AS $$
      BEGIN
        UPDATE conversations
        SET last_message = NEW.message_text,
            last_message_time = NEW.created_at,
            last_message_sender_id = NEW.sender_id,
            updated_at = NEW.created_at
        WHERE id = NEW.conversation_id;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      
      DROP TRIGGER IF EXISTS trigger_update_conversation ON messages;
      
      CREATE TRIGGER trigger_update_conversation
        AFTER INSERT ON messages
        FOR EACH ROW
        EXECUTE FUNCTION update_conversation_on_message();
    `);
    console.log(`${colors.green}✅ Conversation update trigger created${colors.reset}`);

    // Ensure update_updated_at_column function exists
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);
    
    await pool.query(`
      DROP TRIGGER IF EXISTS update_user_status_updated_at ON user_status;
      
      CREATE TRIGGER update_user_status_updated_at
        BEFORE UPDATE ON user_status
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);
    console.log(`${colors.green}✅ User status trigger created${colors.reset}`);

    console.log(`${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.green}✅ MESSAGING TABLES CREATED SUCCESSFULLY!${colors.reset}`);
    console.log(`${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);

  } catch (error) {
    console.log(`${colors.red}❌ Error creating messaging tables:${colors.reset}`, error.message);
    throw error;
  }
}

module.exports = addMessagingTables;