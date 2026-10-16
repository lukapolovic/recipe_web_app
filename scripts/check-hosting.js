import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const config = JSON.parse(read('../vercel.json'));
const pkg = JSON.parse(read('../package.json'));

if (config.outputDirectory !== 'public') throw new Error('Vercel must serve the public directory.');
if (!config.rewrites?.some(rule => rule.source === '/api/:path*' && rule.destination === '/api/index')) {
  throw new Error('The same-origin API route is missing.');
}
if (!config.functions?.['api/index.js']) throw new Error('The Node.js API function is missing.');
if (pkg.engines?.node !== '24.x') throw new Error('Use Node.js 24.x for the hosted API.');

for (const file of [
  '../public/designs.html', '../public/designs.js', '../public/designs.css', '../public/design-preview.html', '../public/palettes.js', '../public/palettes.css', '../public/layouts.css', '../public/pop.css', '../public/fonts/unbounded.woff2', '../public/index.html', '../public/brand.js', '../public/wood.css', '../public/wood-assets/kitchen-table.svg', '../public/wood-assets/oak-grain.svg', '../public/app.js', '../public/cookbook-store.js', '../public/social.css', '../public/social-ui.css', '../public/social-demo.js',
  '../api/index.js', '../server.js', '../social-api.js', '../recipe-photos.js', '../import-error.js', '../hosting/social-schema.sql', '../hosting/migrations/001-performance.sql',
]) read(file);

const entry = read('../api/index.js');
if (!entry.includes('SUPABASE_URL') || !entry.includes('SUPABASE_PUBLISHABLE_KEY') || !entry.includes('SUPABASE_ANON_KEY')) {
  throw new Error('Hosted startup must require Supabase account configuration.');
}
if (entry.includes('PANTRY_PASSWORD') || entry.includes('SUPABASE_SERVICE_ROLE_KEY')) {
  throw new Error('The social app uses individual accounts and user permissions, not a shared password or service-role key.');
}

console.log('Hosting routes and social app source are ready. Configure Supabase, its SQL schema and authentication email before deploying.');
