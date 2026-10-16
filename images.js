import { randomUUID } from 'node:crypto';

// sharp is a large native module; load it on the first photo, not on every cold start.
let sharpModule;
const loadSharp = () => (sharpModule ??= import('sharp').then(module => module.default));

export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export { PHOTO_ID } from './ids.js';
export class PhotoError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export async function normalizePhoto(input) {
  if (!input?.length || input.length > MAX_PHOTO_BYTES) throw new PhotoError('Choose a photo smaller than 3 MB.', 413);
  const sharp = await loadSharp();
  try {
    const image = sharp(input, { limitInputPixels: 25000000, animated: false, failOn: 'warning' });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format)) throw new PhotoError('Use a JPG, PNG or WebP photo.');
    // Re-encoding strips location/EXIF metadata and ensures stored files are actual images.
    const { data, info } = await image.rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
    if (data.length > 1500000) throw new PhotoError('This photo is too detailed. Try a smaller image.', 413);
    return { id: randomUUID(), data, contentType: 'image/webp', width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof PhotoError) throw error;
    throw new PhotoError('This photo could not be read. Choose a JPG, PNG or WebP image.');
  }
}
