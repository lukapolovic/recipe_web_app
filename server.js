import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openDatabase, ValidationError, validateRecipe } from './database.js';
import { extractHtml, extractText, ImportError } from './recipe-import.js';
import { fetchPublicHtml } from './public-fetch.js';
import { createNutritionService } from './nutrition.js';

const root = dirname(fileURLToPath(import.meta.url));
const publicRoot = resolve(root, 'public');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const MAX_BODY = 256 * 1024;
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
async function body(request) {
  if (!(request.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415, 'Send JSON with Content-Type: application/json.');
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY) throw new HttpError(413, 'Recipe is too large.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'The request must contain valid JSON.'); }
}
function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

export function createApp({ databasePath = resolve(root, 'data', 'recipes.sqlite'), fetchHtml = fetchPublicHtml, nutritionService = createNutritionService() } = {}) {
  const repository = openDatabase(databasePath);
  let importBusy = false;
  const server = http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        // Protect local data from cross-origin browser writes. No CORS is enabled.
        const origin = request.headers.origin;
        if (origin && origin !== `http://${request.headers.host}`) throw new HttpError(403, 'Cross-origin requests are not allowed.');
        if (request.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Cross-site requests are not allowed.');
        if (['/api/import', '/api/nutrition'].includes(url.pathname) && request.method === 'POST') {
          if (importBusy) throw new HttpError(429, 'An import or nutrition lookup is already running. Please wait.');
          const input = await body(request);
          if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Provide an import object.');
          importBusy = true;
          try {
            if (url.pathname === '/api/nutrition') {
              const draft = validateRecipe(input);
              return json(response, 200, await nutritionService.estimate(draft.ingredients));
            }
            let result;
            if (typeof input.url === 'string' && input.url.trim()) {
              if (input.url.length > 2000) throw new ImportError('The recipe link is too long.', 400);
              const page = await fetchHtml(input.url.trim());
              result = extractHtml(page.html, page.url);
            } else result = extractText(input.text);
            if (result.recipe.sourceCaloriesPerServing == null) {
              const nutrition = await nutritionService.estimate(result.recipe.ingredients);
              result.recipe.ingredients = nutrition.ingredients;
              result.warnings.push(...nutrition.warnings);
              result.demo = nutrition.demo;
            }
            return json(response, 200, result);
          } finally { importBusy = false; }
        }
        if (url.pathname === '/api/recipes') {
          if (request.method === 'GET') return json(response, 200, repository.list(Object.fromEntries(url.searchParams)));
          if (request.method === 'POST') return json(response, 201, repository.create(await body(request)));
        } else if (url.pathname === '/api/examples' && request.method === 'POST') {
          await body(request);
          return json(response, 201, repository.loadExamples());
        } else {
          const match = url.pathname.match(/^\/api\/recipes\/([1-9]\d*)$/);
          if (match) {
            const id = Number(match[1]);
            if (!Number.isSafeInteger(id)) throw new HttpError(400, 'Invalid recipe ID.');
            if (request.method === 'GET') {
              const recipe = repository.get(id);
              if (!recipe) throw new HttpError(404, 'Recipe not found.');
              return json(response, 200, recipe);
            }
            if (request.method === 'PUT') {
              const recipe = repository.update(id, await body(request));
              if (!recipe) throw new HttpError(404, 'Recipe not found.');
              return json(response, 200, recipe);
            }
            if (request.method === 'DELETE') {
              if (!repository.remove(id)) throw new HttpError(404, 'Recipe not found.');
              return json(response, 200, { deleted: true });
            }
          }
          throw new HttpError(404, 'Endpoint not found.');
        }
        throw new HttpError(405, 'Method not allowed.');
      }
      if (!['GET', 'HEAD'].includes(request.method)) throw new HttpError(405, 'Method not allowed.');
      const path = resolve(publicRoot, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
      if (!path.startsWith(publicRoot + sep)) throw new HttpError(403, 'Forbidden.');
      let file;
      try { file = await readFile(path); } catch { throw new HttpError(404, 'File not found.'); }
      response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      response.end(request.method === 'HEAD' ? undefined : file);
    } catch (error) {
      const status = error instanceof ValidationError ? 400 : error.status || 500;
      if (status === 500) console.error(error);
      if (!response.headersSent) json(response, status, { error: status === 500 ? 'Something went wrong. Please try again.' : error.message });
      else response.end();
    }
  });
  server.on('close', () => repository.close());
  return { server, repository };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const envPath = resolve(root, '.env');
  if (existsSync(envPath)) process.loadEnvFile(envPath);
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  const { server } = createApp({ databasePath: process.env.DATABASE_PATH || undefined });
  server.listen(port, host, () => console.log(`Recipe app ready at http://${host}:${server.address().port}`));
  server.on('error', error => { console.error(`Could not start server: ${error.message}`); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}
