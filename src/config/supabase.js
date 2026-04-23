const { createClient } = require("@supabase/supabase-js");

// Create regular client with anon key
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Create admin client with service role key (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Export both, but also export the regular client as default for backward compatibility
module.exports = { 
  supabase, 
  supabaseAdmin,
  // For backward compatibility
  get default() { return supabase; }
};