// Preloaded by npm test. Tests also run inside the Vercel build (npm run build),
// where the project's hosting variables are set. Clear them so every test starts
// from the offline demo defaults and only uses what it passes in explicitly.
for (const name of ['VERCEL', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY', 'CRON_SECRET']) delete process.env[name];
