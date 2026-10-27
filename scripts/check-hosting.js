import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const dockerfile = read('../Dockerfile');
const pkg = JSON.parse(read('../package.json'));
const server = read('../server.js');

if (pkg.engines?.node !== '24.x') throw new Error('Use Node.js 24.x for the hosted server.');
if (!/^FROM node:24[-.\w]* AS test$/m.test(dockerfile) || !/^FROM node:24[-.\w]*$/m.test(dockerfile)) {
  throw new Error('The Dockerfile must build a test stage and a runtime stage on Node.js 24.');
}
// BuildKit skips stages nothing depends on, so the runtime stage must copy from the test stage.
if (!/^RUN npm run build\b/m.test(dockerfile) || !/^COPY --from=test /m.test(dockerfile)) {
  throw new Error('The Docker build must run the tests and depend on their result.');
}
if (!/^ENV .*NODE_ENV=production/m.test(dockerfile) || !/^ENV .*HOST=0\.0\.0\.0/m.test(dockerfile)) {
  throw new Error('The runtime image must set NODE_ENV=production and listen on 0.0.0.0.');
}
if (!/^USER node$/m.test(dockerfile)) throw new Error('The server must not run as root.');
if (!/^CMD \["node", "server\.js"\]$/m.test(dockerfile)) throw new Error('The image must start server.js.');

for (const file of [
  '../public/palettes.css', '../public/pop.css', '../public/fonts/unbounded.woff2', '../public/index.html', '../public/brand.js', '../public/app.js', '../public/vendor/morphdom.js', '../public/cookbook-store.js', '../public/social.css', '../public/social-ui.css', '../public/social-demo.js',
  '../server.js', '../social-api.js', '../recipe-photos.js', '../import-error.js', '../hosting/social-schema.sql', '../hosting/backup-ssh.sh',
]) read(file);

// In production the server must refuse to start as the offline demo.
if (!server.includes("process.env.NODE_ENV === 'production' && !socialConfigured")) {
  throw new Error('Hosted startup must require Supabase account configuration.');
}
if (server.includes('PANTRY_PASSWORD') || server.includes('SUPABASE_SERVICE_ROLE_KEY')) {
  throw new Error('The social app uses individual accounts and user permissions, not a shared password or service-role key.');
}

console.log('Dockerfile and social app source are ready. Configure Supabase, its SQL schema and authentication email before deploying.');
