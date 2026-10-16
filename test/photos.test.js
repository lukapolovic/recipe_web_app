import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { normalizePhoto, MAX_PHOTO_BYTES, PHOTO_ID } from '../images.js';
import { extractHtml } from '../recipe-import.js';
import { fetchPublicImage } from '../public-fetch.js';

test('photo upload is resized, converted to WebP and stripped of embedded metadata', async () => {
  const input = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#a53e4a' } })
    .jpeg().withMetadata({ orientation: 1 }).toBuffer();
  const photo = await normalizePhoto(input);
  const metadata = await sharp(photo.data).metadata();
  assert.match(photo.id, PHOTO_ID);
  assert.equal(photo.contentType, 'image/webp');
  assert.equal(metadata.format, 'webp');
  assert.equal(photo.width, 1200);
  assert.equal(photo.height, 600);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
});

test('photo upload rejects oversized files, invalid images and SVG content', async () => {
  await assert.rejects(normalizePhoto(Buffer.alloc(MAX_PHOTO_BYTES + 1)), error => error.status === 413);
  await assert.rejects(normalizePhoto(Buffer.from('not an image')), /could not be read/);
  await assert.rejects(normalizePhoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>')), /JPG, PNG or WebP/);
});

test('recipe photo import uses structured photo metadata and resolves relative links', () => {
  const recipe = { '@type': 'Recipe', name: 'Lunch', recipeYield: 2, totalTime: 'PT20M', recipeIngredient: ['100 g rice'], recipeInstructions: ['Cook rice.'], image: [{ '@type': 'ImageObject', url: '/photos/rice.jpg' }] };
  const page = `<script type="application/ld+json">${JSON.stringify(recipe)}</script><meta property="og:image" content="/fallback.jpg">`;
  assert.equal(extractHtml(page, 'https://example.com/recipes/rice').imageUrl, 'https://example.com/photos/rice.jpg');
  delete recipe.image;
  const fallback = `<script type="application/ld+json">${JSON.stringify(recipe)}</script><meta property="og:image" content="/fallback.jpg">`;
  assert.equal(extractHtml(fallback, 'https://example.com/rice').imageUrl, 'https://example.com/fallback.jpg');
});

function imageRequest({ status = 200, headers = { 'content-type': 'image/png' }, content = Buffer.from('image') } = {}) {
  return (_url, _options, callback) => {
    const request = new EventEmitter();
    request.end = () => setImmediate(() => {
      const response = Readable.from([content]);
      response.statusCode = status;
      response.headers = headers;
      callback(response);
    });
    return request;
  };
}

test('remote recipe photos reject private destinations, redirect targets and unsupported content', async () => {
  const resolveHost = async () => [{ address: '93.184.216.34', family: 4 }];
  const photo = await fetchPublicImage('https://example.com/photo.png', { resolveHost, requestFor: () => imageRequest() });
  assert.equal(photo.contentType, 'image/png');
  assert.equal(photo.data.toString(), 'image');
  await assert.rejects(fetchPublicImage('http://169.254.169.254/photo.png'), /public recipe websites/);
  await assert.rejects(fetchPublicImage('https://example.com/photo.png', { resolveHost, requestFor: () => imageRequest({ status: 302, headers: { location: 'http://127.0.0.1/photo.png' } }) }), /public recipe websites/);
  await assert.rejects(fetchPublicImage('https://example.com/photo.svg', { resolveHost, requestFor: () => imageRequest({ headers: { 'content-type': 'image/svg+xml' } }) }), /not a supported image/);
  await assert.rejects(fetchPublicImage('https://example.com/photo.png', { resolveHost: async () => [{ address: '192.168.1.2', family: 4 }] }), /public recipe website/);
});
