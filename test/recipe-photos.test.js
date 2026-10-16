import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createRecipePhotos, demoPhotoStore } from '../recipe-photos.js';
import { PHOTO_ID } from '../images.js';

const png = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#a53e4a' } }).png().toBuffer();

test('staging stores a normalized draft that can be read back and discarded once', async () => {
  const photos = createRecipePhotos({ store: demoPhotoStore() });
  const staged = await photos.stage(png);
  assert.match(staged.imageId, PHOTO_ID);
  assert.deepEqual([staged.width, staged.height], [8, 6]);
  const stored = await photos.open(staged.imageId);
  assert.equal(stored.contentType, 'image/webp');
  assert.equal(stored.data.subarray(8, 12).toString(), 'WEBP');
  assert.equal(await photos.discard(staged.imageId), true);
  assert.equal(await photos.open(staged.imageId), null);
  assert.equal(await photos.discard(staged.imageId), false);
});

test('unreadable bytes are rejected before anything is stored', async () => {
  const puts = [];
  const photos = createRecipePhotos({ store: { put: photo => puts.push(photo), get: () => null, remove: () => false } });
  await assert.rejects(photos.stage(Buffer.from('not an image')), /could not be read/);
  assert.equal(puts.length, 0);
});

test('importing fetches the remote image, normalizes it and fails cleanly when the fetch does', async () => {
  const seen = [];
  const photos = createRecipePhotos({ store: demoPhotoStore(), fetchImage: async url => { seen.push(url); if (url.includes('bad')) throw new Error('denied'); return { data: png }; } });
  const id = await photos.importFrom('https://example.com/photo.png');
  assert.match(id, PHOTO_ID);
  assert.ok(await photos.open(id));
  await assert.rejects(photos.importFrom('https://example.com/bad.png'), /denied/);
  assert.equal(seen.length, 2);
});

test('copying gives the recipe its own photo and reports an unreadable original', async () => {
  const photos = createRecipePhotos({ store: demoPhotoStore() });
  const { imageId } = await photos.stage(png);
  const copy = await photos.copy(imageId);
  assert.notEqual(copy, imageId);
  assert.match(copy, PHOTO_ID);
  assert.deepEqual((await photos.open(copy)).data, (await photos.open(imageId)).data);
  await photos.discard(imageId);
  assert.ok(await photos.open(copy), 'the copy outlives the original');
  assert.equal(await photos.copy('00000000-0000-4000-8000-000000000000'), null);
});

test('the demo draft store forgets its oldest photos past the limit', async () => {
  const store = demoPhotoStore({ limit: 2 });
  const photos = createRecipePhotos({ store });
  const ids = [];
  for (let n = 0; n < 3; n++) ids.push((await photos.stage(png)).imageId);
  assert.equal(await photos.open(ids[0]), null);
  assert.ok(await photos.open(ids[2]));
});
