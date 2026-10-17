import { APP_NAME } from './public/brand.js';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ValidationError } from './recipe-model.js';
import { fetchPublicHtml, fetchPublicImage } from './public-fetch.js';
import { MAX_PHOTO_BYTES, PHOTO_ID } from './images.js';
import { createRecipePhotos, socialPhotoStore, demoPhotoStore } from './recipe-photos.js';
import { createSocialApi } from './social-api.js';

const root = dirname(fileURLToPath(import.meta.url));
const publicRoot = resolve(root, 'public');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
const MAX_BODY = 256 * 1024;
// Keep in sync with vercel.json, which applies the same headers in production.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
const PHOTO_TYPE = /^image\/(?:jpeg|png|webp)(?:;|$)/i;
const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
async function rawBody(request, limit) {
  if (request.body !== undefined) {
    const data = Buffer.isBuffer(request.body) ? request.body : Buffer.from(typeof request.body === 'string' ? request.body : JSON.stringify(request.body));
    if (data.length > limit) throw new HttpError(413, 'This upload is too large.');
    return data;
  }
  const chunks = []; let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > limit) throw new HttpError(413, 'This upload is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function body(request) {
  if (!(request.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415, 'Send JSON with Content-Type: application/json.');
  try { return JSON.parse((await rawBody(request, MAX_BODY)).toString('utf8')); }
  catch (error) { if (error.status) throw error; throw new HttpError(400, 'The request must contain valid JSON.'); }
}
async function photoBytes(request) {
  if (!PHOTO_TYPE.test(request.headers['content-type'] || '')) throw new HttpError(415, 'Choose a JPG, PNG or WebP photo.');
  return rawBody(request, MAX_PHOTO_BYTES);
}
function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

export function createApp({
  fetchHtml = fetchPublicHtml, fetchImage = fetchPublicImage, socialApi: suppliedSocialApi,
} = {}) {
  const socialKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  const socialConfigured = suppliedSocialApi || process.env.SUPABASE_URL && socialKey;
  if (!suppliedSocialApi && (process.env.SUPABASE_URL || socialKey) && !socialConfigured) throw new Error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY).');
  if (process.env.VERCEL && !socialConfigured) throw new Error('Hosted deployments require Supabase accounts and storage.');
  const social = suppliedSocialApi || (socialConfigured ? createSocialApi({ url: process.env.SUPABASE_URL, key: socialKey }) : null);
  const photos = createRecipePhotos({ store: social ? socialPhotoStore(social) : demoPhotoStore(), fetchImage });
  // Hosted accounts live under /api/social; the local demo uses the same routes without the prefix.
  const base = social ? '/api/social' : '/api';
  let importBusy = false;
  // Parse a link or pasted text into a draft, then try to bring the main photo
  // along without failing the draft.
  async function importDraft(input, who) {
    // The HTML parser (cheerio) is only needed here, so it stays out of cold starts.
    const { extractHtml, extractText } = await import('./recipe-import.js');
    let result;
    if (typeof input.url === 'string' && input.url.trim()) {
      if (input.url.length > 2000) throw new HttpError(400, 'The recipe link is too long.');
      const page = await fetchHtml(input.url.trim());
      result = extractHtml(page.html, page.url);
    } else result = extractText(input.text);
    if (result.imageUrl) {
      try { result.recipe.imageId = await photos.importFrom(result.imageUrl, who); }
      catch { result.warnings.push('The main photo could not be imported. You can upload your own photo instead.'); }
    }
    delete result.imageUrl;
    return result;
  }
  const handler = async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('Content-Security-Policy', CSP);
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        const protocol = request.headers['x-forwarded-proto'] === 'https' || request.socket?.encrypted ? 'https' : 'http';
        const origin = request.headers.origin;
        if (origin && origin !== `${protocol}://${request.headers.host}`) throw new HttpError(403, 'Cross-origin requests are not allowed.');
        if (request.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Cross-site requests are not allowed.');
        if (url.pathname === '/api/social/config' && !social) return json(response, 200, { configured: false, authRequired: false, appName: APP_NAME });
        if (!social && url.pathname.startsWith('/api/social/')) throw new HttpError(503, 'Connect your Supabase project before creating real accounts or sharing cookbooks.');
        const route = url.pathname.startsWith(`${base}/`) ? url.pathname.slice(base.length) : '';
        // Signing in comes first, so unauthenticated requests stop before any body is read.
        const who = async () => ({ user: social ? await social.authenticate(request.headers) : undefined, headers: request.headers });
        if (route === '/import' && request.method === 'POST') {
          const caller = await who();
          if (!social && importBusy) throw new HttpError(429, 'An import is already running. Please wait.');
          const input = await body(request);
          if (!isObject(input)) throw new HttpError(400, 'Provide a recipe link or pasted text.');
          importBusy = !social;
          try { return json(response, 200, await importDraft(input, caller)); }
          finally { importBusy = false; }
        }
        if (route === '/photos' && request.method === 'POST') {
          const caller = await who();
          return json(response, 201, await photos.stage(await photoBytes(request), caller));
        }
        const photoRoute = route.match(/^\/photos\/([0-9a-f-]{36})(\/copy)?$/i);
        if (photoRoute && PHOTO_ID.test(photoRoute[1])) {
          const id = photoRoute[1];
          if (photoRoute[2]) {
            if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
            const imageId = await photos.copy(id, await who());
            if (!imageId) throw new HttpError(404, 'Photo not found or unavailable.');
            return json(response, 201, { imageId });
          }
          if (request.method === 'DELETE') {
            if (!await photos.discard(id, await who())) throw new HttpError(404, 'Photo not found or still in use.');
            return json(response, 200, { deleted: true });
          }
          if (['GET', 'HEAD'].includes(request.method)) {
            // Reading checks access itself, so a hidden photo and a missing one look the same.
            const photo = await photos.open(id, { headers: request.headers });
            if (!photo) throw new HttpError(404, 'Photo not found or unavailable.');
            response.writeHead(200, { 'Content-Type': photo.contentType, 'Cache-Control': social ? 'private, no-store' : 'private, max-age=3600', 'Content-Length': photo.data.length });
            return response.end(request.method === 'HEAD' ? undefined : photo.data);
          }
          if (!social) throw new HttpError(405, 'Method not allowed.');
        }
        if (social && route) {
          const input = ['POST', 'PUT', 'PATCH'].includes(request.method) ? await body(request) : undefined;
          const result = await social.handle({ method: request.method, pathname: url.pathname, query: url.searchParams, headers: request.headers, body: input });
          if (!result) throw new HttpError(404, 'Endpoint not found.');
          return json(response, result.status, result.body);
        }
        throw new HttpError(404, 'Endpoint not found.');
      }
      if (!['GET', 'HEAD'].includes(request.method)) throw new HttpError(405, 'Method not allowed.');
      let pathname;
      try { pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname); } catch { throw new HttpError(400, 'Invalid path.'); }
      const path = resolve(publicRoot, `.${pathname}`);
      if (!path.startsWith(publicRoot + sep)) throw new HttpError(403, 'Forbidden.');
      // Revalidate with a cheap stat-based ETag so unchanged files are not resent.
      let info;
      try { info = await stat(path); } catch { throw new HttpError(404, 'File not found.'); }
      if (!info.isFile()) throw new HttpError(404, 'File not found.');
      const etag = `W/"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}"`;
      const headers = { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ETag: etag };
      if (request.headers['if-none-match'] === etag) { response.writeHead(304, headers); return response.end(); }
      let file;
      try { file = await readFile(path); } catch { throw new HttpError(404, 'File not found.'); }
      response.writeHead(200, { ...headers, 'Content-Length': file.length });
      response.end(request.method === 'HEAD' ? undefined : file);
    } catch (error) {
      const status = error instanceof ValidationError ? 400 : error.status || 500;
      if (status === 500) console.error(error);
      if (!response.headersSent) json(response, status, { error: status === 500 ? 'Something went wrong. Please try again.' : error.message });
      else response.end();
    }
  };
  const server = http.createServer(handler);
  return { server, handler };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const envPath = resolve(root, '.env');
  if (existsSync(envPath)) process.loadEnvFile(envPath);
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  const { server } = createApp();
  server.listen(port, host, () => console.log(`Recipe app ready at http://${host}:${server.address().port}`));
  server.on('error', error => { console.error(`Could not start server: ${error.message}`); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}
