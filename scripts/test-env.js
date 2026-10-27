// Preloaded by npm test. Tests also run inside the Docker build (npm run build),
// where hosting variables may be set. Clear them so every test starts from the
// offline demo defaults and only uses what it passes in explicitly.
for (const name of ['NODE_ENV', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY', 'CRON_SECRET']) delete process.env[name];
