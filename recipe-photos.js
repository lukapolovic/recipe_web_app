import { randomUUID } from 'node:crypto';
import { normalizePhoto } from './images.js';

// The life of a recipe photo on the server: bytes are normalized into a stored
// draft, may be attached to a recipe by id, read back, discarded, or copied.
// Where bytes live is the `store`'s business: { put(photo, who), get(id, who), remove(id, who) }.
// `who` is whatever the store needs to act for the caller ({ user, headers } when signed in).
export function createRecipePhotos({ store, fetchImage }) {
  return {
    // Normalize uploaded bytes and keep them as a draft photo.
    async stage(bytes, who) {
      const photo = await normalizePhoto(bytes);
      await store.put(photo, who);
      return { imageId: photo.id, width: photo.width, height: photo.height };
    },
    // Bring a remote recipe's main photo along. Rejects if it cannot be fetched or stored.
    async importFrom(url, who) {
      const photo = await normalizePhoto((await fetchImage(url)).data);
      await store.put(photo, who);
      return photo.id;
    },
    open: (id, who) => store.get(id, who),
    // False when the photo is missing, not the caller's, or already used by a recipe.
    discard: (id, who) => store.remove(id, who),
    // A recipe copied into another cookbook gets its own photo; null if the original is unreadable.
    async copy(id, who) {
      const original = await store.get(id, who);
      if (!original) return null;
      const photo = { ...original, id: randomUUID() };
      await store.put(photo, who);
      return photo.id;
    },
  };
}

export function socialPhotoStore(social) {
  return {
    put: (photo, who) => social.putPhoto(who.user, photo),
    get: (id, who) => social.getPhoto(who.headers, id),
    remove: (id, who) => social.removePhoto(who.user, id),
  };
}

// The local demo has no account storage, so its draft photos live in memory
// and reset with the server. Hosted deployments never use it.
export function demoPhotoStore({ limit = 100 } = {}) {
  const photos = new Map();
  return {
    put(photo) {
      photos.set(photo.id, photo);
      if (photos.size > limit) photos.delete(photos.keys().next().value);
    },
    get: id => photos.get(id) || null,
    remove: id => photos.delete(id),
  };
}
