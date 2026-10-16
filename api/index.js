import { createApp } from '../server.js';

// Vercel must never fall back to the local preview or an ephemeral SQLite file.
if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY)) {
  throw new Error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY) before deployment.');
}

const app = createApp();
export default app.handler;
