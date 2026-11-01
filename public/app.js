import { APP_NAME } from './brand.js';
import { CATEGORIES, UNITS, GRAMS_PER_UNIT } from './recipe-config.js';
import { nutritionFor, shoppingList, displayAmount, checkKey } from './recipe-math.js';
import { createHttpStore, createDemoStore } from './cookbook-store.js';
import morphdom from './vendor/morphdom.js';
import { startMotion } from './motion.js';

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ESCAPES[c]);
// Sample people and cookbooks are only needed for the local preview, so they
// are fetched on demand instead of with every signed-in page load.
const loadDemoData = () => import('./social-demo.js').then(module => module.demoData);
const clone = value => structuredClone(value);
const app = $('#app'), dialog = $('#app-dialog');

const meats = ['Vegetarian', 'Chicken', 'Beef', 'Pork', 'Lamb', 'Fish', 'Seafood', 'Turkey', 'Mixed', 'Other'];
let configured = false, feed = {}, user = null, profile = null;
let view = 'discover', selectedId = '', search = '', category = '', meatType = '', tag = '', servings = 1;
// True until the page that was just navigated to has been drawn once; CSS entrance animations key off it.
let entering = true;
let searchResult = null;
let plannerBook = '', planner = { cart: [], checked: {}, version: 0 };
let draft = null, toastTimer, authMode = 'login', menuOpen = false;
const photoCache = new Map();
const paths = { book:'M4 4h6a3 3 0 0 1 2 1 3 3 0 0 1 2-1h6v15h-6a3 3 0 0 0-2 1 3 3 0 0 0-2-1H4z M12 5v15', heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z', search:'M21 21l-5-5 M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0', plus:'M12 5v14M5 12h14', users:'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.9M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0', bag:'M5 7h14l1 14H4z M8 8V6a4 4 0 0 1 8 0v2', compass:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M16 8l-3 5-5 3 3-5z', arrow:'M4 12h16m-6-6 6 6-6 6', close:'m6 6 12 12M6 18 18 6', clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2', leaf:'M20 3C7 2 2 8 5 15s15 6 15-12ZM4 21 15 10', edit:'m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14z', star:'m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L2 9.6l6.2-.9z', logout:'M9 3H4v18h5M10 12h12m-5-5 5 5-5 5', check:'m5 12 4 4L19 6', camera:'M4 6h4l2-3h4l2 3h4v15H4z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0', chevronLeft:'m15 6-6 6 6 6', chevronRight:'m9 6 6 6-6 6', arrowDown:'M12 4v16m-6-6 6 6 6-6', arrowLeft:'M20 12H4m6-6-6 6 6 6' };
const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.book}"/></svg>`;
// The kitchen-garden decoration: organic blobs, wavy section edges and the
// dotted rule under display headlines. All of it is aria-hidden; app.css places and animates it.
const BLOBS = ["M100 8C142 6 186 34 192 80C198 126 172 170 128 186C84 202 32 186 14 144C-4 102 12 52 46 28C62 16 80 9 100 8Z", "M70 14C108 0 160 10 184 46C206 80 190 120 170 150C148 184 104 198 66 186C28 174 4 140 6 100C8 60 32 28 70 14Z", "M112 6C152 12 192 44 194 92C196 136 168 168 132 184C96 200 56 194 30 168C4 142 0 98 16 64C32 30 72 0 112 6Z", "M52 22C88 2 132 16 160 30C190 46 202 84 192 120C182 158 146 190 104 192C60 194 28 172 12 136C-4 100 16 42 52 22Z", "M96 10C130 4 170 18 186 54C202 90 186 118 178 146C168 178 132 196 94 192C56 188 18 166 10 126C2 86 22 54 46 34C60 22 76 13 96 10Z"];
const blob = (shape, tone, cls = '', speed = '', stretch = false) => `<svg class="blob blob-${tone}${cls ? ` ${cls}` : ''}" viewBox="0 0 200 200" data-shape="${shape % BLOBS.length}"${speed ? ` data-speed="${speed}"` : ''}${stretch ? ' preserveAspectRatio="none"' : ''} aria-hidden="true" focusable="false"><path d="${BLOBS[shape % BLOBS.length]}"/></svg>`;
const wave = (tone, cls = 'wave-top') => `<svg class="wave wave-${tone} ${cls}" viewBox="0 0 1440 90" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M0 46C160 18 320 10 520 34S900 84 1100 56 1340 20 1440 38V90H0Z"/></svg>`;
// Asset slots. Until the real photo, video, engraving or logo exists, its place on the page is a labelled dashed outline at
// the intended size, naming the file to supply (docs/PALAIS-GAP-ANALYSIS.md lists every slot).
const slot = (kind, title, file, cls = '', attrs = '') => `<span class="slot slot-${kind}${cls ? ` ${cls}` : ''}" aria-hidden="true"${attrs ? ` ${attrs}` : ''}><span class="slot-label"><strong>${title}</strong><small>${file}</small></span></span>`;
// An engraving or a food cut-out; with a speed it drifts while the page scrolls (motion.js).
// Artwork delivered so far (transparent WebP in public/assets); anything else still shows its labelled slot.
const ASSETS = new Set([
  'art/bring-herbs', 'art/community-leaves', 'art/community-plant', 'art/cookbook-hero', 'art/cookbooks-hero', 'art/empty-state',
  'art/following-hero', 'art/friends-hero', 'art/hero-bouquet', 'art/hero-top-left', 'art/intro-accent', 'art/intro-scene',
  'art/profile-hero', 'art/recipe-hero', 'art/s-basil', 'art/s-bay', 'art/s-beans', 'art/s-chickpeas',
  'art/s-garlic', 'art/s-knife', 'art/s-leaf', 'art/s-lentils', 'art/s-mint', 'art/s-onion',
  'art/s-peppercorns', 'art/s-rolling-pin', 'art/s-rosemary', 'art/s-sprig', 'art/s-thyme', 'art/s-whisk',
  'art/search-hero', 'art/shopping-hero', 'art/sign-in', 'food/bring-dish', 'food/community-dish', 'food/cookbooks-dish',
  'food/cookbooks-dish-2', 'food/following-dish', 'food/following-dish-2', 'food/friends-dish', 'food/friends-dish-2', 'food/intro-dish',
  'food/page-edge', 'food/profile-dish', 'food/recipes-dish', 'food/reviews-dish', 'food/saved-right', 'food/search-dish',
  'food/shopping-dish', 'food/shopping-dish-2', 'food/sign-in-dish',
]);
const asset = (path, cls, speed) => `<img class="asset ${cls}" src="/assets/${path}.webp" alt="" aria-hidden="true" loading="lazy" decoding="async" data-speed="${speed}">`;
const float = (name, cls, speed = '0') => ASSETS.has(`art/${name}`) ? asset(`art/${name}`, `slot-art ${cls}`, speed) : slot('art', `Engraving: ${name.replace(/-/g, ' ')}`, `assets/art/${name}.webp`, cls, `data-speed="${speed}"`);
const food = (name, cls, speed = '0') => ASSETS.has(`food/${name}`) ? asset(`food/${name}`, `asset-food food ${cls}`, speed) : slot('cutout', `Cut-out: ${name.replace(/-/g, ' ')}`, `assets/food/${name}.webp`, `food ${cls}`, `data-speed="${speed}"`);
// Small single drawings scattered in open space and margins, never under text (positions in app.css, "Sprinkles").
const sprinkle = (name, cls, speed = '0.06') => float(`s-${name}`, `sprinkle ${cls}`, speed);
// The hero's green shape: tall and irregular, with a notch on its right, drifting between three outlines (motion.js).
const HERO_BLOB = ['M58 6C96 -4 132 18 140 54C146 82 126 98 132 122C140 152 168 166 160 190C152 210 108 206 76 196C40 186 8 170 4 136C0 104 26 92 22 64C18 36 30 14 58 6Z', 'M70 14C108 2 146 30 148 66C150 92 116 104 122 132C128 160 160 172 148 192C136 210 98 200 66 190C32 180 12 160 10 126C8 94 36 86 32 58C28 34 42 22 70 14Z', 'M48 2C86 -6 120 10 130 46C138 78 136 94 144 118C152 146 174 158 168 186C162 208 118 214 86 202C48 190 2 178 -2 144C-6 112 16 96 12 68C8 40 20 10 48 2Z'];
const heroBlob = () => `<svg class="blob blob-sage hero-blob" viewBox="0 0 200 200" data-speed="-0.08" aria-hidden="true" focusable="false"><path d="${HERO_BLOB[0]}" data-morph="${HERO_BLOB.join('|')}"/></svg>`;
// The hero clip (portrait, muted, looping). Phones get the small encode; reduced motion shows the poster frame only.
const heroVideo = () => `<video class="hero-video" muted loop playsinline${matchMedia('(prefers-reduced-motion: reduce)').matches ? '' : ' autoplay'} preload="auto" poster="/assets/video/hero-poster.jpg" aria-hidden="true" tabindex="-1"><source src="/assets/video/hero-sm.mp4" type="video/mp4" media="(max-width: 900px)"><source src="/assets/video/hero.webm" type="video/webm"><source src="/assets/video/hero.mp4" type="video/mp4"></video>`;
const slug = text => String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// A recipe or cookbook without a photo: the slot for its photo in the preview kitchen, a quiet note for real accounts.
const noPhoto = (name, attrs = '') => store.demo ? slot('photo', `Photo: ${esc(name)}`, `assets/photos/${slug(name)}.jpg`, 'slot-fill', attrs) : `<span class="photo-empty"${attrs ? ` ${attrs}` : ''}>No photo yet</span>`;
const dots = '<span class="dots" aria-hidden="true"></span>';
// Cover colours keep their stored names; the style paints them with its own accents.
const TONES = { rose: 'blush', olive: 'sage', ochre: 'gold', terracotta: 'orange' };
const toneOf = color => TONES[color] || 'sage';
const PERSON_TONES = ['sage', 'gold', 'blush', 'sky', 'sand'];
const toneFor = id => { let hash = 0; for (const c of String(id ?? '')) hash = (hash * 31 + c.charCodeAt(0)) >>> 0; return PERSON_TONES[hash % PERSON_TONES.length]; };
// Text wordmark (the favicon mark plus the name in the script face) until assets/brand/logo.svg arrives.
const logo = (onDark = false) => `<span class="logo logo-text${onDark ? ' on-dark' : ''}">${onDark ? '' : '<img src="/favicon.svg" alt="" width="34" height="34">'}<span>${esc(APP_NAME)}</span></span>`;
// Section headings: an optional handwritten kicker, condensed caps, an optional handwritten tagline.
function heading(title, { kicker = '', tagline = '', cls = '' } = {}) { return `<div class="heading${cls ? ` ${cls}` : ''}">${kicker ? `<p class="kicker">${kicker}</p>` : ''}<h2>${title}</h2>${tagline ? `<p class="tagline">${tagline}</p>` : ''}</div>`; }
function pageHero({ kicker = '', title, lede = '', actions = '', extra = '', tone = 'sage', slots = '', cls = '' }) {
  const side = slots ? blob(0, 'sand', 'page-hero-blob-b', '-0.03') + float(`${slots}-hero`, 'page-hero-art', '0.14') + food(`${slots}-dish`, 'food-page-hero', '0.04') + food(`${slots}-dish-2`, 'food-page-hero-2', '0.08') + blob(1, 'gold', 'page-edge-blob', '-0.04') + food('page-edge', 'food-page-edge', '0.1') : '';
  return `<section class="page-hero tone-${tone}${cls ? ` ${cls}` : ''}">${blob(2, 'tone', 'page-hero-blob', '-0.06')}${side}<div class="wrap page-hero-inner"><div class="page-hero-copy">${kicker ? `<p class="kicker">${kicker}</p>` : ''}<h1>${title}</h1>${lede ? `<p class="lede">${lede}</p>` : ''}${actions ? `<div class="hero-actions">${actions}</div>` : ''}${extra}</div></div></section>`;
}
const pageContent = (html, [left, right] = ['rosemary', 'peppercorns']) => `<section class="band band-white page-content">${wave('white')}${sprinkle(left, 'sp-gutter sp-gutter-left')}${sprinkle(right, 'sp-gutter sp-gutter-right', '0.1')}<div class="wrap">${html}</div></section>`;
const initials = name => String(name || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
// Lookup tables over the feed, rebuilt lazily after any change (touch()).
// Cards call these helpers many times per render; maps keep that linear.
let lookup = null;
const touch = () => { lookup = null; };
function index() {
  if (lookup && lookup.userId === user?.id) return lookup;
  const first = (rows, key) => { const map = new Map(); for (const row of rows || []) if (!map.has(row[key])) map.set(row[key], row); return map; };
  const group = (rows, key) => { const map = new Map(); for (const row of rows || []) { const list = map.get(row[key]); if (list) list.push(row); else map.set(row[key], [row]); } return map; };
  const me = user?.id, friendships = new Map();
  for (const f of feed.friendships || []) {
    const other = f.requesterId === me ? f.recipientId : f.recipientId === me ? f.requesterId : undefined;
    if (other !== undefined && !friendships.has(other)) friendships.set(other, f);
  }
  return lookup = {
    userId: me, friendships,
    profiles: first(feed.profiles, 'id'), cookbooks: first(feed.cookbooks, 'id'), recipes: first(feed.recipes, 'id'),
    recipesByBook: group(feed.recipes, 'cookbookId'), reviewsByRecipe: group(feed.reviews, 'recipeId'), repliesByReview: group(feed.replies, 'reviewId'),
    membersByBook: group((feed.memberships || []).filter(m => m.status === 'accepted'), 'cookbookId'),
    follows: new Set((feed.follows || []).filter(f => f.userId === me).map(f => f.cookbookId)),
  };
}
const NONE = Object.freeze([]);
// A recipe keeps a null author once its writer has deleted their account.
const FORMER_MEMBER = Object.freeze({ id: null, displayName: 'Former member', username: '' });
const person = id => id === null ? FORMER_MEMBER : index().profiles.get(id) || (profile?.id === id ? profile : { id, displayName: 'A fellow cook', username: 'cook' });
const displayName = p => p?.displayName || p?.display_name || p?.username || 'A fellow cook';
const avatar = (id, small = false) => `<span class="avatar tone-${toneFor(id)}${small ? ' small' : ''}" title="${esc(displayName(person(id)))}">${esc(initials(displayName(person(id))))}</span>`;
const bookById = id => index().cookbooks.get(id);
const recipeById = id => index().recipes.get(id);
const acceptedMembers = id => index().membersByBook.get(id) || NONE;
const memberOf = book => !!book && (book.ownerId === user?.id || acceptedMembers(book.id).some(m => m.userId === user?.id));
const ownBooks = () => (feed.cookbooks || []).filter(memberOf);
const followExists = id => index().follows.has(id);
const bookRecipes = id => index().recipesByBook.get(id) || NONE;
const recipeReviews = id => index().reviewsByRecipe.get(id) || NONE;
const reviewReplies = id => index().repliesByReview.get(id) || NONE;
function ratingForBook(id) { const book=bookById(id); if(book?.reviewCount!=null)return {count:Number(book.reviewCount),average:Number(book.rating||0)}; return ratingStats(bookRecipes(id).flatMap(r => recipeReviews(r.id))); }
function ratingStats(rows) { return { count: rows.length, average: rows.length ? rows.reduce((sum,r) => sum + r.rating, 0) / rows.length : 0 }; }
function ratingLabel(stats) { return stats.count ? `${icon('star')}<strong>${stats.average.toFixed(1)}</strong><span>(${stats.count})</span>` : '<span>No reviews yet</span>'; }
function notify(message) { const toast = $('#toast'); toast.textContent = message; toast.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 4500); }
// Private photos are fetched with the session token and shown as blob URLs.
// Pages render immediately with placeholders; each <template data-photo>
// slot is filled once its card scrolls near the viewport (a few at a time).
const photoPending = new Map(), photoFailed = new Map(), photoQueue = [];
const PHOTO_CONCURRENCY = 4, PHOTO_RETRY_MS = 5 * 60 * 1000;
let photoEpoch = 0, photosActive = 0;
function loadPhoto(id) {
  if (!id || photoCache.has(id)) return Promise.resolve();
  if (photoPending.has(id)) return photoPending.get(id);
  const epoch = photoEpoch;
  const pending = store.fetchPhoto(id)
    .then(blob => {
      if (epoch !== photoEpoch) return;
      photoCache.set(id, URL.createObjectURL(blob)); photoFailed.delete(id); showPhoto(id);
    })
    .catch(() => { photoFailed.set(id, Date.now()); })
    .finally(() => { photoPending.delete(id); });
  photoPending.set(id, pending);
  return pending;
}
function pumpPhotos() {
  while (photosActive < PHOTO_CONCURRENCY && photoQueue.length) {
    const id = photoQueue.shift();
    if (photoCache.has(id) || photoPending.has(id)) continue;
    photosActive++;
    loadPhoto(id).finally(() => { photosActive--; pumpPhotos(); });
  }
}
// A new page replaces the DOM: drop waiting requests; hydratePhotos re-queues what is still shown.
function resetPhotoQueue() { photoQueue.length = 0; photoObserver?.disconnect(); }
function requestPhoto(id) { if (!photoQueue.includes(id)) { photoQueue.push(id); pumpPhotos(); } }
const photoObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    photoObserver.unobserve(entry.target);
    for (const slot of entry.target.querySelectorAll(':scope > template[data-photo]')) requestPhoto(slot.dataset.photo);
  }
}, { rootMargin: '800px 0px' }) : null;
function hydratePhotos(root) {
  if (!root) return;
  for (const slot of root.querySelectorAll('template[data-photo]')) {
    const id = slot.dataset.photo;
    if (photoCache.has(id)) { showPhoto(id); continue; }
    if (Date.now() - (photoFailed.get(id) || 0) < PHOTO_RETRY_MS) continue;
    if (photoObserver && slot.parentElement) photoObserver.observe(slot.parentElement); else requestPhoto(id);
  }
}
function showPhoto(id) {
  const src = photoCache.get(id);
  if (!src) return;
  for (const slot of document.querySelectorAll(`template[data-photo="${CSS.escape(id)}"]`)) {
    const img = slot.content.firstElementChild?.cloneNode(true);
    if (!img) continue;
    img.src = src;
    slot.parentElement?.querySelector(':scope > [data-photo-fallback]')?.remove();
    slot.replaceWith(img);
  }
}
// The <img> to show once a private photo has loaded (attrs exclude src).
function photoSlot(id, attrs) { return id ? `<template data-photo="${esc(id)}"><img ${attrs}></template>` : ''; }
function photoSrc(recipe) { return recipe?.imageId ? photoCache.get(recipe.imageId) || '' : ''; }
async function loadFeed(renderPage = true) {
  applyLoaded(await store.loadFeed());
  await store.hydrateSelection({ view, selectedId });
  if (renderPage) render();
}
function applyLoaded(loaded) {
  ({ feed, user, profile } = loaded);
  feed.friendships = (feed.friendships || []).map(f => ({ ...f, recipientId: f.recipientId || f.addresseeId }));
  for (const key of ['profiles','cookbooks','recipes','friendships','follows','reviews','replies','memberships']) feed[key] ||= [];
  touch();
}
function mergeRows(name, rows) { const map = new Map((feed[name] || []).map(item => [item.id, item])); rows.forEach(item => map.set(item.id, item)); feed[name] = [...map.values()]; touch(); }
// What the store may read and fill in on this page's cache of rows.
const host = {
  recipeById: id => recipeById(id), bookById: id => bookById(id), recipes: () => feed.recipes, mergeRows,
  setBook(book, recipes) { mergeRows('cookbooks', [book]); feed.recipes = feed.recipes.filter(recipe => recipe.cookbookId !== book.id); mergeRows('recipes', recipes); },
};
const http = createHttpStore({ host });
let store = http;
const hydrateBook = id => store.hydrateBook(id);
// Pages live at hash addresses (#/recipe/<id>, #/book/<id>, #/shopping), so Back, refresh and shared links work.
// A hash needs no server support: server.js answers 404 for unknown paths.
const ROUTE_VIEWS = new Set(['discover', 'mine', 'following', 'friends', 'shopping', 'search', 'book', 'recipe', 'profile']);
const PAGE_TITLES = { mine: 'Our cookbooks', following: 'Following', friends: 'Friends', shopping: 'Shopping list', search: 'Search' };
const routeHash = (next, id) => next === 'discover' ? '' : `#/${next}${id ? `/${encodeURIComponent(id)}` : ''}`;
function readRoute() {
  const [, next = '', id = ''] = decodeURIComponent(location.hash).match(/^#\/([a-z]+)(?:\/(.+))?$/) || [];
  return ROUTE_VIEWS.has(next) && (id || !['book', 'recipe', 'profile'].includes(next)) ? { view: next, id } : { view: 'discover', id: '' };
}
function pageTitle() {
  const name = view === 'book' ? bookById(selectedId)?.name : view === 'recipe' ? recipeById(selectedId)?.title : view === 'profile' ? person(selectedId)?.displayName : PAGE_TITLES[view];
  return name ? `${name} — ${APP_NAME}` : DEFAULT_TITLE;
}
const DEFAULT_TITLE = document.title;
// True when an earlier ChériChef page sits behind this one in history, so "Back" returns to where you came from.
const cameFromApp = () => (history.state?.depth || 0) > 0;
// A failed partner invite stays on the new cookbook's page (a toast is gone in seconds); it clears on leaving the page.
let bookNotice = null;
function nav(next, id = '', fromHistory = false) {
  if (bookNotice && (next !== 'book' || id !== bookNotice.id)) bookNotice = null;
  setMenu(false); const moved=next!==view||id!==selectedId; view = next; selectedId = id; entering = true; if (next === 'recipe') servings = recipeById(id)?.servings || 2;
  if (!fromHistory && moved && user) history.pushState({ depth: (history.state?.depth || 0) + 1 }, '', routeHash(next, id) || location.pathname + location.search);
  render(); if(next==='search')runSearch(); window.scrollTo({ top:0, behavior:moved?'instant':'smooth' }); if(moved)playWave();
}
// Back and Forward: read the address, fetch what that page needs, then draw it without adding history.
window.addEventListener('popstate', async () => {
  if (!user) return;
  const route = readRoute();
  try {
    await store.hydrateSelection({ view: route.view, selectedId: route.id });
    if (route.view === 'shopping' && ownBooks().length) await getPlan(plannerBook || ownBooks()[0]?.id);
  } catch (error) { notify(error.message); }
  nav(route.view, route.id, true);
});
// A wave of cream sweeps up off the screen as a new page appears (the reference site's page transition).
const pageWave = $('#page-wave');
function playWave() { if(!pageWave||matchMedia('(prefers-reduced-motion: reduce)').matches)return; pageWave.classList.remove('run'); pageWave.getBoundingClientRect(); pageWave.classList.add('run'); }
// The small-screen menu is a body class, so redraws of #app leave it alone.
// While it is open the page behind is inert (Tab stays in the menu); focus goes to its first link, and back to the button on close.
function setMenu(open) {
  if(menuOpen===open)return; menuOpen=open; document.body.classList.toggle('menu-open',open);
  for(const part of $$('.app-shell > main, .app-shell > .site-footer'))part.inert=open;
  const button=$('.menu-button'); if(button){button.setAttribute('aria-expanded',String(open));button.textContent=open?'Close':'Menu';}
  if(open)$('.main-nav .nav-link')?.focus();
  else if(button&&(!document.activeElement||document.activeElement===document.body||document.activeElement.closest('.site-header')))button.focus({preventScroll:true});
}
const MENUS = [['discover','Discover'],['mine','Our cookbooks'],['following','Following'],['friends','Friends'],['shopping','Shopping list']];
function shell(content) {
  const links=MENUS.map(([v,n])=>`<button class="nav-link ${view===v?'active':''}" data-view="${v}" ${view===v?'aria-current="page"':''}>${n}</button>`).join(''), leave=store.demo?'Sign in / join':'Sign out';
  return `<div class="app-shell"><header class="site-header"><div class="utility-bar"><div class="wrap utility-inner"><div class="global-search" role="search">${icon('search')}<label class="visually-hidden" for="global-search">Search people, cookbooks and recipes</label><input id="global-search" type="search" maxlength="100" placeholder="Recipes, cookbooks, cooks…" value="${esc(search)}"></div><span class="utility-divider" aria-hidden="true"></span>${store.demo?'<p class="demo-note" title="Sample cooks and cookbooks, saved on this device."><span class="pulse-dot" aria-hidden="true"></span>Preview kitchen<span class="visually-hidden">: sample cooks and cookbooks, saved on this device.</span></p><span class="utility-divider" aria-hidden="true"></span><button class="link-button utility-link" data-action="show-auth">Sign in / join</button>':`<button class="user-chip" data-action="profile" data-id="${user?.id}" aria-label="My profile">${avatar(user?.id,true)}<span>${esc(displayName(profile))}</span></button><button class="icon-button" data-action="logout" aria-label="${leave}" title="${leave}">${icon('logout')}</button>`}</div></div>`
  +`<div class="wrap main-bar"><button class="brand" data-view="discover" aria-label="${esc(APP_NAME)}, discover">${logo()}</button><nav class="main-nav" id="main-nav" aria-label="Main navigation">${links}<div class="nav-extras"><button class="button primary" data-action="new-book">${icon('plus')}New cookbook</button><button class="nav-link" data-action="profile" data-id="${user?.id}">My profile</button><button class="nav-link" data-action="logout">${leave}</button></div></nav><button class="button primary header-cta" data-action="new-book">New cookbook</button><button class="menu-button" data-action="menu" aria-expanded="${menuOpen}" aria-controls="main-nav">${menuOpen?'Close':'Menu'}</button></div></header>`
  +`<main class="page-body${entering?' page-enter':''}" id="main">${content}</main>`
  +`<footer class="site-footer"><div class="wrap footer-grid"><div class="footer-brand">${logo(true)}</div><div><h2 class="footer-title">Menu</h2><ul>${MENUS.map(([v,n])=>`<li><button data-view="${v}">${n}</button></li>`).join('')}</ul></div><div><h2 class="footer-title">Our kitchen</h2><ul><li><button data-action="new-book">Start a cookbook</button></li><li><button data-view="search">Find a recipe</button></li><li><button data-action="profile" data-id="${user?.id}">My profile</button></li></ul></div><div><h2 class="footer-title">Questions?</h2><p>A recipe gone wrong, an idea, or just hello: write to us.</p><a class="footer-mail" href="mailto:cherichef.app@gmail.com">cherichef.app@gmail.com</a></div></div><div class="wrap footer-bottom"><span class="legal-links"><a href="/privacy.html">Privacy notice</a><a href="/terms.html">Terms of use</a></span><span class="footer-club">${esc(APP_NAME)} · your little cookbook club</span></div></footer></div>`;
}
// A cookbook's cover is never a photo: it is drawn as a book in the cookbook's colour, with a spine and page edges,
// its name and kitchen printed on it, and one of the line-art drawings on a round sticker (picked per cookbook).
const COVER_ART = ['s-basil', 's-bay', 's-garlic', 's-mint', 's-onion', 's-rosemary', 's-sprig', 's-thyme', 's-whisk', 's-leaf', 's-rolling-pin', 's-knife'];
function cookbookCover(book) {
  const cooks = [book.ownerId,...acceptedMembers(book.id).filter(m=>m.userId!==book.ownerId).map(m=>m.userId)].map(id=>displayName(person(id))).join(' & ');
  const art = COVER_ART[[...String(book.id||book.name)].reduce((sum, c) => sum + c.charCodeAt(0), 0) % COVER_ART.length];
  return `<span class="book-art"><span class="book-spine"></span><span class="book-face"><span class="book-title">${esc(book.name)}</span><span class="book-by">from ${esc(cooks)}'s kitchen</span></span><span class="book-sticker"><img src="/assets/art/${art}.webp" alt="" loading="lazy" decoding="async"></span></span>`;
}
function cookbookCard(book) {
  const following=followExists(book.id);
  return `<article class="cookbook-card tone-${toneOf(book.coverColor)}"><button class="book-cover" data-action="book" data-id="${book.id}" aria-label="Open ${esc(book.name)}"><span class="frame"><span class="cover-photo">${cookbookCover(book)}</span></span></button><div class="book-info"><div class="book-info-row"><h3><button data-action="book" data-id="${book.id}">${esc(book.name)}</button></h3>${!memberOf(book)?`<button class="button small follow-button ${following?'is-following':''}" data-action="follow" data-id="${book.id}" aria-label="${following?'Unfollow':'Follow'} ${esc(book.name)}" aria-pressed="${following}">${icon('heart')}${following?'Following':'Follow'}</button>`:'<span class="badge cover-badge">Ours</span>'}</div></div></article>`;
}
// Photo cards carry only the time and, for meat-free recipes, a leaf in a white disc (as the reference's diet icons).
const dietIcon = recipe => {
  const diet = (recipe.tags||[]).includes('Plant based') ? 'Plant based' : recipe.meatType==='Vegetarian' ? 'Vegetarian' : '';
  return diet ? `<span class="diet-icon" title="${diet}">${icon('leaf')}<span class="visually-hidden">${diet}</span></span>` : '';
};
function recipeCard(recipe, { showBook = false } = {}) {
  const image = photoSrc(recipe), book=bookById(recipe.cookbookId);
  return `<article class="recipe-card tone-${toneOf(book?.coverColor)}"><button class="recipe-photo" data-action="recipe" data-id="${recipe.id}" aria-label="Open ${esc(recipe.title)}"><span class="frame">${image?`<img src="${esc(image)}" alt="" loading="lazy">`:`${photoSlot(recipe.imageId,'alt="" loading="lazy"')}${noPhoto(recipe.title,recipe.imageId?'data-photo-fallback':'')}`}</span>${dietIcon(recipe)}<span class="time-pill">${icon('clock')}${recipe.minutes} min</span></button><div class="recipe-body"><h3><button data-action="recipe" data-id="${recipe.id}">${esc(recipe.title)}</button></h3>${showBook?`<span class="recipe-book-name">from ${esc(book?.name||'a shared cookbook')}</span>`:''}</div></article>`;
}
// The home carousel's card: a square hand-cut photo with everything printed on it, as on the reference.
function recipeTile(recipe) {
  const image = photoSrc(recipe);
  return `<article class="recipe-tile"><button class="recipe-photo" data-action="recipe" data-id="${recipe.id}" aria-label="Open ${esc(recipe.title)}"><span class="frame">${image?`<img src="${esc(image)}" alt="" loading="lazy">`:`${photoSlot(recipe.imageId,'alt="" loading="lazy"')}${noPhoto(recipe.title,recipe.imageId?'data-photo-fallback':'')}`}</span>${dietIcon(recipe)}<span class="time-pill">${icon('clock')}${recipe.minutes} min</span><span class="tile-title">${esc(recipe.title)}</span></button></article>`;
}
// Hosted recipes carry authorId (null for a former member); sample recipes may have none.
function recipeCredit(recipe) {
  const author = 'authorId' in recipe ? recipe.authorId : recipe.createdBy;
  return author === undefined ? '' : `<span class="recipe-credit">By ${esc(displayName(person(author)))}</span>`;
}
// Reports exist for real accounts only; the sample kitchen hides the control.
const REPORT_REASONS = [['spam','Spam or advertising'],['offensive','Offensive or abusive'],['copyright','Copied without permission'],['other','Something else']];
const reportButton = (type, id, label = 'Report') => store.demo || !id ? '' : `<button class="text-button report-button" data-action="report" data-type="${type}" data-id="${esc(id)}">${label}</button>`;
function openReport(type, id) {
  const what = { profile:'this cook', cookbook:'this cookbook', recipe:'this recipe', review:'this review', reply:'this reply' }[type] || 'this';
  openDialog('Something not right?',`<form id="report-form" data-type="${esc(type)}" data-id="${esc(id)}"><div class="dialog-content"><p class="muted">Tell us what is wrong with ${what}. Reports are private: only the people who run ${esc(APP_NAME)} see them, never the person you report.</p><label class="form-field">Reason<select name="reason" required>${REPORT_REASONS.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><label class="form-field">A note for us (optional)<textarea name="note" maxlength="500" placeholder="Anything that helps us understand, e.g. where the recipe was copied from."></textarea></label><p class="form-error" role="alert" hidden></p></div><div class="dialog-actions"><button type="button" class="button" data-action="close-dialog">Cancel</button><button type="submit" class="button primary">Send report</button></div></form>`);
}
function openDeleteAccount() {
  openDialog('Delete your account?',`<form id="delete-account-form"><div class="dialog-content"><p>This permanently deletes your ${esc(APP_NAME)} account. It cannot be undone.</p><ul class="delete-account-list"><li>Cookbooks only you keep are deleted, with their recipes, photos and reviews.</li><li>A cookbook you share with a partner stays with them. If you own it, your partner becomes its owner. Your recipes there stay, shown as written by a “Former member”.</li><li>Pending invitations to your cookbooks are cancelled.</li><li>Your reviews, replies, follows, friendships, reports and profile are removed.</li></ul><p class="muted">To confirm, type your username and your current password.</p><label class="form-field">Username<input name="username" required maxlength="31" autocomplete="off" spellcheck="false" placeholder="${esc(profile?.username)}"></label><label class="form-field">Current password<input name="password" type="password" required maxlength="128" autocomplete="current-password"></label><p class="form-error" role="alert" hidden></p></div><div class="dialog-actions"><button type="button" class="button" data-action="close-dialog">Keep my account</button><button type="submit" class="button danger">Delete my account for good</button></div></form>`,'','');
}
function empty(title, text, action = '') { return `<div class="empty-state">${float('empty-state','empty-art')}<h2>${title}</h2><p>${text}</p>${action}</div>`; }
function discover() {
  const books=feed.cookbooks.filter(b=>b.visibility==='public'||!memberOf(b));
  const list=books.length?books:feed.cookbooks;
  return `<section class="hero">${heroBlob()}${float('hero-top-left','hero-leaves','0.1')}${float('hero-bouquet','hero-bouquet','0.04')}<div class="hero-visual">${blob(2,'gold','hero-gold')}<div class="hero-photo">${heroVideo()}</div></div><div class="wrap hero-grid"><div class="hero-copy"><h1 class="display">A cookbook for two</h1>${dots}<p class="tagline">made with love, passed around the table</p><button class="scroll-cue" data-action="scroll-to" data-target="intro" aria-label="Scroll down">${icon('arrowDown')}</button></div></div></section>`
  +`<section class="band band-white intro" id="intro">${wave('white')}${float('intro-scene','intro-scene','0.14')}${food('intro-dish','food-intro-dish')}<div class="wrap intro-inner">${sprinkle('bay','sp-text-tl','0.03')}${float('intro-accent','intro-accent','0.03')}<p class="statement">${esc(APP_NAME)} exists because the best recipes have a little history. Keep yours in one shared cookbook, cook them side by side, and borrow a little inspiration from the people you love.</p><button class="button outline" data-view="friends">${icon('arrow')}Meet the club</button></div></section>`
  +`<section class="recipes-band">${blob(3,'orange','recipes-blob')}<div class="wrap recipes-band-grid"><div class="carousel" data-carousel>${feed.recipes.length?`<div class="carousel-track" tabindex="0" role="region" aria-label="Recipes to fall for">${feed.recipes.slice(0,8).map(recipeTile).join('')}</div><div class="carousel-controls"><button class="carousel-button" data-action="carousel" data-dir="-1" aria-label="Previous recipe">${icon('chevronLeft')}</button><button class="carousel-button" data-action="carousel" data-dir="1" aria-label="Next recipe">${icon('chevronRight')}</button></div>`:empty('Your next favourite is waiting.','Add a recipe to get things cooking.')}</div><div class="recipes-band-copy"><h2>Recipes to fall for</h2><p class="tagline">something good is always cooking</p><p>Weeknight suppers, slow Sunday lunches and the thing you make when it rains, fresh from the club's cookbooks.</p><button class="button primary" data-view="search">Explore all recipes</button></div></div></section>`
  +`<section class="band band-white saved">${blob(0,'sand','saved-blob-left','-0.05')}${blob(4,'gold','saved-blob-right','-0.05')}${food('recipes-dish','food-saved-bagel','0.04')}${food('saved-right','food-saved-right','0.04')}${sprinkle('mint','sp-saved-b','0.1')}<div class="wrap saved-inner"><h2>Saved, shared, savoured</h2><p class="tagline dash-line">and never lost again!</p><p class="saved-text">Paste a link, type it out or copy it from grandma's notebook. Every recipe lands in your shared cookbook, sorted and ready for the next time someone asks how you make it.</p></div></section>`
  +`<section class="split-bands"><div class="split-band band-sage">${wave('sage')}${sprinkle('basil','sp-split-a')}<div class="split-copy"><h2>Two cooks, one cookbook</h2><p class="tagline">our recipes, together</p><p>Invite your person, bring recipes home from any link, and keep every family favourite in one place.</p><button class="button light" data-view="mine">Open our cookbooks</button></div></div><div class="split-band band-gold">${wave('gold','wave-top flip')}${sprinkle('garlic','sp-split-c')}<div class="split-copy"><h2>The list writes itself</h2><p class="tagline">plan it, then shop it</p><p>Pick the week's meals and their ingredients add up into one shared shopping list, ready to tick off.</p><button class="button light" data-view="shopping">Plan our meals</button></div></div></section>`
  +`<section class="band band-white community" id="community">${wave('white')}${blob(1,'blush','community-blob','-0.04')}${blob(4,'sky','community-blob-sky','-0.03')}${food('community-dish','food-community-pizza')}${float('community-plant','community-cherries','0.12')}${float('community-leaves','community-leaves','0.1')}<div class="wrap">${heading('Cookbooks from the community',{kicker:'well-loved &amp; well-shared',cls:'centered'})}<div class="cookbook-grid community-cards">${list.slice(0,3).map(cookbookCard).join('')||empty('A fresh page.','Be the first to share a cookbook with the club.')}</div></div></section>`
  +`<section class="band band-white features">${sprinkle('onion','sp-features-b','0.1')}<div class="wrap feature-grid"><article class="feature-card">${blob(3,'gold','feature-blob-back','',true)}${blob(1,'sky-deep','feature-blob','',true)}<div class="feature-copy"><h2>Find a recipe</h2><p>Search every cookbook in the club by name, meal or main ingredient, and save the good ones to your own.</p><button class="button light" data-view="search">Start looking</button></div></article><article class="feature-card">${blob(0,'blush','feature-blob-back','',true)}${blob(2,'sky-deep','feature-blob','',true)}<div class="feature-copy"><h2>Cook as a pair</h2><p>Invite your partner to your cookbook. You both add recipes, plan the week and share one shopping list.</p><button class="button light" data-action="invite-partner">Invite your partner</button></div></article></div></section>`
  +`<section class="band band-sage bring">${wave('sage')}${food('bring-dish','food-bring-dish','0.04')}<span class="bring-sticker" aria-hidden="true">${blob(2,'gold','bring-sticker-blob')}<span>pass it on!</span></span>${float('bring-herbs','bring-herbs','0.1')}${sprinkle('thyme','sp-bring-a')}<div class="wrap bring-inner"><h2>Found a recipe you love?</h2><p class="tagline">bring it home with one link</p><form id="bring-form" class="bring-form"><label class="bring-field"><span class="visually-hidden">Recipe link</span><input name="url" type="url" required maxlength="2000" placeholder="Paste a recipe link"></label><button class="bring-submit" type="submit">Bring it home</button></form></div></section>`;
}
function collection(mode) {
  const mine=mode==='mine', books=mine?ownBooks():feed.cookbooks.filter(b=>followExists(b.id));
  return pageHero({kicker:mine?'our little corner of the kitchen':'borrowed inspiration',title:mine?'Our cookbooks':'Cookbooks we follow',lede:mine?'A place for your shared favourites, happy accidents and Sunday traditions.':'Keep the kitchens you love close by.',actions:mine?`<button class="button primary" data-action="new-book">${icon('plus')}Create a cookbook</button>`:'',tone:mine?'gold':'blush',slots:mine?'cookbooks':'following'})
  +pageContent(`<div class="cookbook-grid">${books.map(cookbookCard).join('')||empty(mine?'Every good cookbook starts with a blank page.':'Find your kind of kitchen.',mine?'Create one, then invite your partner to add recipes with you.':'Follow a cookbook to find it here.',`<button class="button primary" ${mine?'data-action="new-book"':'data-view="discover"'}>${mine?'Create our cookbook':'Explore cookbooks'}</button>`)}</div>`);
}
// A cookbook holds one partner: the owner sees who it is (or who has been invited) in place of the Invite button.
function partnerStatus(book) {
  const partner=(feed.memberships||[]).find(m=>m.cookbookId===book.id&&m.role==='partner'&&m.userId!==book.ownerId);
  if(!partner)return `<button class="button" data-action="invite" data-id="${book.id}">${icon('users')}Invite partner</button>`;
  const who=person(partner.userId);
  return `<span class="partner-note">${icon('users')}${partner.status==='accepted'?`Cooking with ${esc(displayName(who))}`:`Invitation sent to @${esc(who.username)}`}</span>`;
}
function cookbookPage() {
  const book=bookById(selectedId); if(!book)return pageContent(empty('This cookbook is tucked away.','It may be private, or no longer available.'));
  const rows=bookRecipes(book.id), stats=ratingForBook(book.id), writable=memberOf(book), following=followExists(book.id);
  const cooks=[book.ownerId,...acceptedMembers(book.id).filter(m=>m.userId!==book.ownerId).map(m=>m.userId)].map(id=>displayName(person(id))).join(' & ');
  const actions=writable?`<button class="button primary" data-action="add-recipe" data-id="${book.id}">${icon('plus')}Add recipe</button>${book.ownerId===user.id?`${partnerStatus(book)}<button class="button" data-action="edit-book" data-id="${book.id}">${icon('edit')}Edit cookbook</button>`:''}`:`<button class="button primary" data-action="follow" data-id="${book.id}" aria-pressed="${following}">${icon('heart')}${following?'Following':'Follow cookbook'}</button>${reportButton('cookbook',book.id)}`;
  return `<section class="page-hero book-hero tone-${toneOf(book.coverColor)}">${float('cookbook-hero','page-hero-art','0.14')}<div class="wrap page-hero-inner">${cameFromApp()?`<button class="breadcrumb" data-action="back">${icon('arrowLeft')}Back</button>`:`<button class="breadcrumb" data-view="${writable?'mine':'discover'}">${icon('arrowLeft')}Back to ${writable?'our cookbooks':'Discover'}</button>`}<div class="book-hero-grid"><div class="page-hero-copy"><p class="kicker">${esc(book.visibility)} cookbook · @${esc(person(book.ownerId).username)}</p><h1>${esc(book.name)}</h1><p class="tagline">from ${esc(cooks)}'s kitchen</p><p class="lede">${esc(book.description)}</p><div class="fact-row"><span class="fact"><strong>${rows.length}</strong>${rows.length===1?'recipe':'recipes'}</span><span class="rating">${ratingLabel(stats)}</span><span class="fact muted">Average of all recipe reviews</span></div><div class="hero-actions">${actions}</div></div><div class="book-hero-cover">${blob(4,'tone')}<span class="frame"><span class="cover-photo">${cookbookCover(book)}</span></span></div></div></div></section>`
  +pageContent(`${bookNotice?.id===book.id?`<p class="notice" role="status">Your cookbook is saved, but the partner invite did not go out: ${esc(bookNotice.text)} You can try again with Invite partner.</p>`:''}${heading('The recipes inside',{tagline:'a collection to make your own traditions with',cls:'centered dashed'})}<div class="recipe-grid">${rows.map(recipeCard).join('')||empty('The first recipe is the sweetest.','Add a recipe by link, paste its text, or write it yourself.',writable?`<button class="button primary" data-action="add-recipe" data-id="${book.id}">Add our first recipe</button>`:'')}</div>`,['bay','chickpeas']);
}
const kcalLabel = n => `${Math.round(n.perServing)} kcal / serving${n.source==='website'?' · source estimate':n.complete?'':' · partial'}`;
// A servings change only rescales numbers, so it updates them in place: ticked ingredients, focus and animations stay put.
function updateServings() {
  const recipe=recipeById(selectedId); if(!recipe)return;
  $$('[data-amount]',app).forEach(el=>{const i=recipe.ingredients[Number(el.dataset.amount)];if(i)el.textContent=displayAmount(i.quantity*servings/recipe.servings,i.unit);});
  const kcal=$('[data-kcal]',app), n=nutritionFor(recipe,servings); if(kcal&&n.known)kcal.textContent=kcalLabel(n);
}
function recipePage() {
  const recipe=recipeById(selectedId); if(!recipe)return pageContent(empty('That recipe is not on the table.','It may belong to a private cookbook.'));
  const book=bookById(recipe.cookbookId), image=photoSrc(recipe), own=memberOf(book), stats=recipe.reviewCount!=null?{count:Number(recipe.reviewCount),average:Number(recipe.rating||0)}:ratingStats(recipeReviews(recipe.id)), n=nutritionFor(recipe,servings);
  const photo=image?`<img src="${esc(image)}" alt="${esc(recipe.title)}">`:`${photoSlot(recipe.imageId,`alt="${esc(recipe.title)}"`)}${noPhoto(recipe.title,recipe.imageId?'data-photo-fallback':'')}`;
  return `<section class="recipe-hero tone-${toneOf(book?.coverColor)}">${float('recipe-hero','recipe-hero-leaves','0.12')}<div class="wrap"><button class="breadcrumb" data-action="book" data-id="${recipe.cookbookId}">${icon('arrowLeft')}${esc(book?.name||'Cookbook')}</button><div class="recipe-hero-grid"><div class="recipe-hero-copy"><p class="kicker">${esc(recipe.category)}</p><h1 class="recipe-title">${esc(recipe.title)}</h1><p class="recipe-description">${esc(recipe.description||'One to keep, make, and pass around.')}</p><div class="recipe-tags">${[recipe.meatType,...(recipe.tags||[])].filter(Boolean).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div><div class="recipe-summary">${recipeCredit(recipe)}<span class="fact">${icon('clock')}${recipe.minutes} minutes</span><label class="servings-field">Servings <input id="recipe-servings" aria-label="Recipe servings" type="number" min="1" max="100" step="1" value="${servings}"></label><span class="rating">${ratingLabel(stats)}</span>${n.known?`<span class="fact" data-kcal>${kcalLabel(n)}</span>`:''}</div></div><figure class="recipe-hero-photo">${blob(4,'tone')}<span class="frame">${photo}</span></figure></div></div></section>`
  +`<section class="band band-white recipe-main">${wave('white')}${sprinkle('thyme','sp-gutter sp-gutter-left')}${sprinkle('leaf','sp-gutter sp-gutter-right','0.1')}<div class="wrap"><div class="recipe-columns"><section class="steps-column" aria-labelledby="steps-title"><div class="heading"><h2 id="steps-title">How we make it</h2><p class="tagline">a little love, step by step</p></div><ol class="instructions-list">${recipe.instructions.map((step,i)=>`<li><span class="step-label">Step ${i+1}</span><p>${esc(step)}</p></li>`).join('')}</ol></section><aside class="ingredients-panel" aria-labelledby="ingredients-title"><div class="heading"><h2 id="ingredients-title">Ingredients</h2><p class="tagline">a little of this, a little of that</p></div><ul class="ingredients-list">${recipe.ingredients.map((i,index)=>`<li><label><input type="checkbox"><span>${esc(i.name)}${i.note?`<small>${esc(i.note)}</small>`:''}</span></label><strong data-amount="${index}">${displayAmount(i.quantity*servings/recipe.servings,i.unit)}</strong></li>`).join('')}</ul></aside></div><p class="paper-footnote">${recipe.sourceUrl?`<a href="${esc(recipe.sourceUrl)}" target="_blank" rel="noopener noreferrer">Original recipe ↗</a><span> · </span>`:''}Ingredient amounts scale with servings. Adjust cooking time and equipment as needed.${n.known&&!n.complete?' Calories exclude ingredients without values.':''}</p><div class="paper-actions"><button class="button primary" data-action="plan" data-id="${recipe.id}">${icon('bag')}Add to shopping list</button>${own?`<button class="button" data-action="edit-recipe" data-id="${recipe.id}">${icon('edit')}Edit recipe</button>`:`<button class="button" data-action="save-copy" data-id="${recipe.id}">${icon('book')}Save to our cookbook</button>${reportButton('recipe',recipe.id,'Report recipe')}`}</div></div></section>${reviewsSection(recipe, own)}${otherRecipes(recipe)}`;
}
// Three more to cook next: the same cookbook first, then the rest of the club.
function otherRecipes(recipe) {
  const seen=new Set([recipe.id]), picks=[...bookRecipes(recipe.cookbookId),...feed.recipes].filter(r=>!seen.has(r.id)&&seen.add(r.id)).slice(0,3);
  return picks.length?`<section class="band band-white other-recipes">${wave('white')}${sprinkle('lentils','sp-other-a')}${sprinkle('rolling-pin','sp-other-b','0.1')}<div class="wrap">${heading('Other recipes',{cls:'centered dashed'})}<div class="recipe-grid">${picks.map(r=>recipeCard(r)).join('')}</div></div></section>`:'';
}
function reviewsSection(recipe, own) {
  const reviews=recipeReviews(recipe.id), mine=reviews.find(r=>r.userId===user.id), stats=recipe.reviewCount!=null?{count:Number(recipe.reviewCount),average:Number(recipe.rating||0)}:ratingStats(reviews);
  const form=!own?`<form id="review-form" data-id="${recipe.id}" class="review-form"><h3>${mine?'Your kitchen notes':'Leave a kitchen note'}</h3><fieldset class="rating-input"><legend>Your rating</legend>${[1,2,3,4,5].map(i=>`<label><input type="radio" name="rating" value="${i}" required ${mine?.rating===i?'checked':''}><span aria-label="${i} out of 5">${i} ★</span></label>`).join('')}</fieldset><label class="form-field">Your comment<textarea name="comment" required maxlength="2000" placeholder="Did you add a twist? Would you make it again?">${esc(mine?.comment)}</textarea></label><div class="review-form-actions"><button class="button primary small" type="submit">${mine?'Update review':'Share review'}</button>${mine?`<button type="button" class="button subtle small" data-action="delete-review" data-id="${recipe.id}">Remove my review</button>`:''}</div><p class="form-error" role="alert" hidden></p></form>`:'<p class="notice">This is a recipe from your cookbook. You can reply to your visitors’ notes here.</p>';
  return `<section class="band band-cream reviews-section">${wave('cream')}${food('reviews-dish','food-reviews-salad')}<div class="wrap"><div class="reviews-head">${heading('Made it? Tell us how it went.',{kicker:'around the table'})}<span class="rating">${ratingLabel(stats)}</span></div><div class="reviews-layout">${form}<div class="review-list">${reviews.map(review=>`<article class="review-card"><div class="review-author">${avatar(review.userId)}<div><button class="text-button" data-action="profile" data-id="${review.userId}">${esc(displayName(person(review.userId)))}</button><small>@${esc(person(review.userId).username)} · ${dateLabel(review.createdAt)}</small></div><span class="review-stars" aria-label="${review.rating} out of 5">${'★'.repeat(review.rating)}<span>${'☆'.repeat(5-review.rating)}</span></span></div><p>${esc(review.comment)}</p>${review.userId!==user.id?reportButton('review',review.id):''}${reviewReplies(review.id).map(reply=>`<div class="reply"><strong>${esc(displayName(person(reply.userId)))}</strong><span class="muted"> · ${dateLabel(reply.createdAt)}</span><p>${esc(reply.comment)}</p>${reply.userId!==user.id?reportButton('reply',reply.id):''}</div>`).join('')}${own||review.userId===user.id?`<button class="text-button reply-toggle" data-action="reply" data-id="${review.id}">Reply to this note</button>`:''}</article>`).join('')||'<p class="muted empty-reviews">No notes yet. Be the first to bring this recipe to your table.</p>'}</div></div></div></section>`;
}
function dateLabel(value) { if(!value)return 'Just now'; const date=new Date(value);return Number.isNaN(+date)?'Just now':date.toLocaleDateString('en',{month:'short',day:'numeric'}); }
function personCard(p) {
  const relation=index().friendships.get(p.id);
  return `<article class="person-card tone-${toneFor(p.id)}">${avatar(p.id)}<h3><button class="text-button" data-action="profile" data-id="${p.id}">${esc(displayName(p))}</button></h3><span class="muted">@${esc(p.username)}</span><p>${esc(p.bio||'Finding joy in everyday cooking.')}</p>${relation?.status==='accepted'?'<span class="badge">At our table · friends</span>':relation?relation.recipientId===user.id?`<button class="button small primary" data-action="accept-friend" data-id="${relation.id}">Accept friend request</button>`:'<span class="badge">Request sent</span>':`<button class="button small" data-action="add-friend" data-id="${p.id}">${icon('plus')}Add friend</button>`}</article>`;
}
function friendsPage() {
  const relations=feed.friendships.filter(f=>f.status==='accepted'&&(f.requesterId===user.id||f.recipientId===user.id));
  const ids=new Set(relations.map(f=>f.requesterId===user.id?f.recipientId:f.requesterId));
  const invitations=feed.memberships.filter(m=>m.userId===user.id&&['invited','pending'].includes(m.status));
  const incoming=feed.friendships.filter(f=>f.recipientId===user.id&&f.status==='pending');
  const form=`<form id="friend-form" class="inline-form"><label class="form-field">Find someone by username<input name="username" maxlength="30" required placeholder="e.g. flourandflowers"></label><button class="button primary" type="submit">${icon('plus')}Add friend</button><p class="form-error" hidden role="alert"></p></form>`;
  return pageHero({kicker:'there’s always room for one more',title:'Our people',lede:'Friends, fellow cooks and the person you share your kitchen with.',extra:form,tone:'sky',slots:'friends'})
  +pageContent(`${invitations.length?`<section class="page-section">${heading('A place in their cookbook',{tagline:'an invitation to cook together'})}${invitations.map(m=>`<div class="invitation notice"><span>You've been invited to cook together in <strong>${esc(m.cookbookName||bookById(m.cookbookId)?.name||'a shared cookbook')}</strong>.</span><button class="button small primary" data-action="accept-invite" data-id="${m.id}">Accept invitation</button></div>`).join('')}</section>`:''}${incoming.length?`<section class="page-section">${heading('New faces at the door',{tagline:'friend requests waiting for you'})}<div class="people-grid">${incoming.map(f=>personCard(person(f.requesterId))).join('')}</div></section>`:''}<section class="page-section"><div class="section-row">${heading('Friends at our table')}<span class="count">${ids.size} ${ids.size===1?'friend':'friends'}</span></div><div class="people-grid">${feed.profiles.filter(p=>ids.has(p.id)).map(personCard).join('')||empty('Good food brings people together.','Search for a username to send your first friend request.')}</div></section><section class="page-section">${heading('Meet the cookbook club',{tagline:'kindred cooks to befriend'})}<div class="people-grid">${feed.profiles.filter(p=>p.id!==user.id&&!ids.has(p.id)&&!incoming.some(f=>f.requesterId===p.id)).slice(0,6).map(personCard).join('')}</div></section>`,['basil','onion']);
}
function searchPage() {
  const q=search.toLowerCase().trim();
  const matches=values=>!q||values.filter(Boolean).some(v=>String(v).toLowerCase().includes(q));
  const remote=searchResult?.key===JSON.stringify([search,category,meatType,tag])?searchResult:null;
  const recipes=remote?remote.recipes:feed.recipes.filter(r=>matches([r.title,r.category,r.meatType,...(r.tags||[]),...r.ingredients.map(i=>i.name)])&&(!category||r.category===category)&&(!meatType||r.meatType===meatType)&&(!tag||(r.tags||[]).includes(tag)));
  const books=remote?remote.cookbooks:feed.cookbooks.filter(b=>matches([b.name,b.description]));
  const people=(remote?remote.profiles:feed.profiles.filter(p=>matches([p.username,displayName(p)]))).filter(p=>p.id!==user.id);
  return pageHero({kicker:'a little curiosity goes a long way',title:q?`At the table: “${esc(search)}”`:'Find your next favourite',lede:'Search usernames, cookbook names, recipes, ingredients and labels.',tone:'gold',slots:'search',cls:'compact'})
  +`<section class="filter-band">${wave('indigo')}<div class="wrap filter-row"><label class="form-field">Meal<select id="category-filter"><option value="">Any meal</option>${optionList(CATEGORIES,category)}</select></label><label class="form-field">Main ingredient<select id="meat-filter"><option value="">Any ingredient</option>${optionList(meats,meatType)}</select></label><label class="form-field">Label<select id="tag-filter"><option value="">Any label</option>${optionList([...new Set(feed.recipes.flatMap(r=>r.tags||[]))].sort(),tag)}</select></label><button class="text-button" data-action="reset-search">Clear filters</button></div>${wave('indigo','wave-bottom flip')}</section>`
  +`<section class="band band-white page-content search-results">${sprinkle('leaf','sp-gutter sp-gutter-left')}${sprinkle('chickpeas','sp-gutter sp-gutter-right','0.1')}<div class="wrap"><section class="page-section"><div class="section-row">${heading('Recipes')}<span class="count">${recipes.length} found</span></div><div class="recipe-grid">${recipes.map(r=>recipeCard(r,{showBook:true})).join('')||empty('No recipes found.','Try another name or give the filters a little more room.')}</div></section>${!category&&!meatType&&!tag&&books.length?`<section class="page-section"><div class="section-row">${heading('Cookbooks')}<span class="count">${books.length} found</span></div><div class="cookbook-grid">${books.map(cookbookCard).join('')}</div></section>`:''}${!category&&!meatType&&!tag&&people.length?`<section class="page-section"><div class="section-row">${heading('People')}<span class="count">${people.length} found</span></div><div class="people-grid">${people.slice(0,12).map(personCard).join('')}</div></section>`:''}</div></section>`;
}
function renderMain(page) { const main=$('#main'); if(!main)return; touch(); resetPhotoQueue(); patch(main,page()); hydratePhotos(main); }
let searchController;
async function runSearch() {
  const key=JSON.stringify([search,category,meatType,tag]);
  // Only the latest query matters; cancel any request it supersedes.
  searchController?.abort();
  const controller=searchController=new AbortController();
  try{
    const result=await store.search({q:search,category,meatType,tag},controller.signal);
    if(controller.signal.aborted||key!==JSON.stringify([search,category,meatType,tag]))return;
    // No server-side result (the sample kitchen): the page filters the feed itself.
    searchResult=result?{...result,key}:null;
    if(view==='search')renderMain(searchPage);
  }catch(error){if(!controller.signal.aborted)notify(error.message);}
}
function profilePage() {
  const p=person(selectedId), own=p.id===user.id;
  const actions=own?'<div class="profile-actions"><button class="button" data-action="edit-profile">Edit profile</button><button class="button subtle" data-action="logout">'+(store.demo?'Sign in / join':'Sign out')+'</button></div>'+(store.demo?'<p class="account-danger muted">Deleting an account is available for real accounts, not in the preview kitchen.</p>':'<p class="account-danger"><button class="text-button danger-text" data-action="delete-account">Delete my account</button></p>'):`<div class="profile-actions"><button class="button" data-action="add-friend" data-id="${p.id}">${icon('users')}Add friend</button>${reportButton('profile',p.id)}</div>`;
  return `<section class="page-hero profile-hero tone-${toneFor(p.id)}">${blob(0,'tone','page-hero-blob','-0.06')}${float('profile-hero','page-hero-art','0.14')}${food('profile-dish','food-page-hero','0.04')}<div class="wrap page-hero-inner"><div class="page-hero-copy"><div class="profile-avatar">${blob(3,'tone')}${avatar(p.id)}</div><p class="kicker">a fellow cook in the club</p><h1>${esc(displayName(p))}</h1><p class="handle">@${esc(p.username)}</p><p class="tagline">${esc(p.bio||'A few favourite recipes, and a little room for new traditions.')}</p>${actions}</div></div></section>`
  +pageContent(`${heading(own?'Our cookbooks':`${esc(displayName(p).split(' ')[0])}'s cookbooks`,{cls:'centered dashed'})}<div class="cookbook-grid">${feed.cookbooks.filter(b=>b.ownerId===p.id||acceptedMembers(b.id).some(m=>m.userId===p.id)).map(cookbookCard).join('')||empty('A cookbook is on its way.','There are no cookbooks visible here yet.')}</div>`,['mint','garlic']);
}
function shoppingPage() {
  const books=ownBooks(), hero={kicker:'from our kitchen to the market',title:'A little list. All we need.',lede:'A shared plan for the meals you want to make together.',tone:'sage',slots:'shopping',cls:'page-hero-long'};
  if(!books.length)return pageHero(hero)+pageContent(empty('A little planning starts in our kitchen.','Create a cookbook before making a shared meal plan.','<button class="button primary" data-action="new-book">Create a cookbook</button>'));
  plannerBook=books.some(b=>b.id===plannerBook)?plannerBook:books[0].id;
  const rows=shoppingList(feed.recipes,planner.cart||[]), done=rows.filter(row=>planner.checked?.[checkKey(row)]===true).length;
  const select=`<label class="form-field planner-select">Our cookbook<select id="planner-book">${books.map(b=>`<option value="${b.id}" ${plannerBook===b.id?'selected':''}>${esc(b.name)}</option>`).join('')}</select></label>`;
  return pageHero({...hero,extra:select})
  +pageContent(`<div class="shopping-layout"><section class="shopping-paper"><div class="shopping-head">${heading('The shopping list',{tagline:`${done} of ${rows.length} ingredients checked`})}<button class="button small" data-action="download-list"${rows.length?'':' disabled'}>Save list</button></div>${rows.map((row,i)=>`<label class="shopping-row ${planner.checked?.[checkKey(row)]===true?'checked':''}"><input type="checkbox" data-shopping="${i}" ${planner.checked?.[checkKey(row)]===true?'checked':''}><span>${esc(row.name)}<small>${esc(row.notes.join(' · '))}</small></span><strong>${displayAmount(row.quantity,row.unit)}</strong></label>`).join('')||empty('Nothing on the list just yet.','Open any recipe you want to try and add it to your meal plan.')}<p class="paper-footnote">Matching ingredient names combine. Grams/kilograms/ounces/pounds and millilitres/litres are converted; cups and spoon measures stay separate. Ticks reset when you change servings, because the amounts change.</p></section><aside class="meal-plan"><p class="kicker">on the menu</p><h2>What we're making</h2>${(planner.cart||[]).map(e=>{const r=recipeById(e.recipeId);return r?`<div class="planned-meal"><button class="text-button" data-action="recipe" data-id="${r.id}">${esc(r.title)}</button>${r.cookbookId!==plannerBook?`<p class="trial-source">Trying it out · From ${esc(bookById(r.cookbookId)?.name||'a friend’s cookbook')}</p><button class="text-button trial-save" data-action="save-copy" data-id="${r.id}">${icon('book')}Save to our cookbook</button>`:''}<div><label>Servings <input type="number" min="1" max="100" step="1" value="${e.servings}" data-plan-servings="${r.id}" aria-label="Servings for ${esc(r.title)}"></label><button class="icon-button" data-action="unplan" data-id="${r.id}" aria-label="Remove ${esc(r.title)} from plan">${icon('close')}</button></div></div>`:''}).join('')||'<p class="muted">Choose a few recipes. We’ll bring the ingredients together.</p>'}<button class="button primary full" data-view="search">Find recipes to try${icon('arrow')}</button></aside></div>`,['beans','whisk']);
}
// Redraws patch the DOM to match the new markup instead of replacing it, so focus, scroll,
// half-typed text, ticked boxes and open <details> survive, and entrance animations do not replay.
// What each form control or <details> was last drawn with: the markup only overrides what the
// person changed when it says something new, and never the field they are typing in.
const drawnState=new WeakMap();
const markupState=el=>el.tagName==='DETAILS'?el.hasAttribute('open'):el.type==='checkbox'||el.type==='radio'?el.hasAttribute('checked'):el.tagName==='TEXTAREA'?el.textContent:el.getAttribute('value');
function keepLiveState(from,to){
  if(from.type==='file')return;
  const drawn=drawnState.has(from)?drawnState.get(from):markupState(from), next=markupState(to);
  drawnState.set(from,next);
  const typing=from===document.activeElement&&from.tagName!=='DETAILS'&&from.type!=='checkbox'&&from.type!=='radio';
  if(drawn!==next&&!typing)return;
  if(from.tagName==='DETAILS')to.open=from.open;
  else if(from.type==='checkbox'||from.type==='radio')to.checked=from.checked;
  else to.value=from.value;
}
function patch(root,html){
  morphdom(root,`<div>${html}</div>`,{childrenOnly:true,onBeforeElUpdated(from,to){
    if(from.id==='main'){
      // A newly navigated-to page is drawn fresh so its entrance animations play; otherwise keep
      // .page-enter until the next navigation, so animations still running are not cut short.
      if(entering){from.className=to.className;from.replaceChildren(...to.childNodes);return false;}
      if(from.classList.contains('page-enter'))to.classList.add('page-enter');
    }
    // A photo slot's <img> lives in template.content, which morphing does not reach.
    if(from.tagName==='TEMPLATE'&&from.innerHTML!==to.innerHTML)from.innerHTML=to.innerHTML;
    if(['INPUT','TEXTAREA','DETAILS'].includes(from.tagName))keepLiveState(from,to);
    // Motion state lives on the drawn element: its parallax offset and whether it has been revealed.
    if(from.dataset?.speed!==undefined)to.style.translate=from.style.translate;
    if(from.classList?.contains('in-view'))to.classList.add('in-view');
    return !from.isEqualNode(to);
  }});
}
// A carousel opens one card in, so the card before it peeks in from the left edge as on the reference.
const openedTracks = new WeakSet();
function openCarousels() {
  for(const track of app.querySelectorAll('.carousel-track')){
    if(openedTracks.has(track))continue;
    openedTracks.add(track);
    const second=track.children[1];
    if(second&&matchMedia('(min-width: 1101px)').matches)track.scrollLeft=second.offsetLeft+second.offsetWidth-track.clientWidth;
  }
  for(const track of app.querySelectorAll('.carousel-track'))syncCarousel(track);
}
// Previous and Next switch off at the ends of the track.
function syncCarousel(track){
  const [prev,next]=track.closest('[data-carousel]')?.querySelectorAll('.carousel-button')||[];
  if(prev)prev.disabled=track.scrollLeft<=4;
  if(next)next.disabled=track.scrollLeft>=track.scrollWidth-track.clientWidth-4;
}
document.addEventListener('scroll',event=>{if(event.target.classList?.contains('carousel-track'))syncCarousel(event.target);},true);
function render() {
  if(!user)return renderAuth();
  const pages={discover, mine:()=>collection('mine'),following:()=>collection('following'),book:cookbookPage,recipe:recipePage,friends:friendsPage,search:searchPage,profile:profilePage,shopping:shoppingPage};
  touch(); resetPhotoQueue();
  patch(app,shell((pages[view]||discover)()));
  document.title=pageTitle();
  entering=false;
  hydratePhotos(app);
  openCarousels();
  // A redraw can leave an autoplay video paused; muted is set as a property too, which is what lets it start on its own.
  for(const video of app.querySelectorAll('video[autoplay]')){video.muted=true;if(video.paused)video.play().catch(()=>{});}
}
function optionList(values, current) { return values.map(value=>`<option value="${esc(value)}" ${value===current?'selected':''}>${esc(value)}</option>`).join(''); }
// Editors that carry a draft set data-guard on their form; closing one after a change asks first (requestClose).
let dialogDirty = false;
// Delete lives at the foot of an editor's form; its confirmation opens in place, so "Keep it" returns to the draft.
const deleteZone = (kind, id, label, message) => `<div class="delete-zone"><button type="button" class="text-button danger-text" data-action="ask-delete">${label}</button><div class="delete-confirm" hidden><p>${message}</p><div class="delete-confirm-actions"><button type="button" class="button" data-action="cancel-delete">Keep it</button><button type="button" class="button danger" data-action="confirm-delete" data-kind="${kind}" data-id="${id}">Yes, delete</button></div></div></div>`;
function requestClose() {
  if (!dialogDirty || !dialog.querySelector('form[data-guard]')) { dialog.close(); return; }
  let bar = dialog.querySelector('.discard-confirm');
  if (!bar) {
    bar = document.createElement('div'); bar.className = 'discard-confirm'; bar.setAttribute('role', 'alert');
    bar.innerHTML = '<p>Leave without saving? Your changes will be lost.</p><div><button type="button" class="button" data-action="keep-editing">Keep editing</button><button type="button" class="button danger" data-action="discard-changes">Discard</button></div>';
    dialog.querySelector('.dialog-actions').prepend(bar);
  }
  bar.querySelector('[data-action="keep-editing"]').focus();
}
function openDialog(title, content, actions='', kicker='A little something for our kitchen') { dialog.innerHTML=`<div class="dialog-header"><div>${kicker?`<p class="label">${kicker}</p>`:''}<h2 id="dialog-title">${title}</h2></div><button class="icon-button" data-action="close-dialog" aria-label="Close dialog">${icon('close')}</button></div>${content}${actions}`;if(!dialog.open){dialogDirty=false;dialog.showModal();} }
function openBookEditor(id='') {
  const book=bookById(id);
  openDialog(book?'A new note on the cover.':'Every good story starts here.',`<form id="book-form" data-id="${id}" data-guard><div class="dialog-content form-grid"><label class="form-field wide">Cookbook name<input name="name" required maxlength="100" placeholder="e.g. Our Sunday table" value="${esc(book?.name)}" autofocus></label><label class="form-field wide">A little about your cookbook<textarea name="description" maxlength="600" placeholder="The recipes, rituals and happy accidents we're keeping.">${esc(book?.description)}</textarea></label><label class="form-field">Who can peek inside?<select name="visibility">${optionList(['private','friends','public'],book?.visibility||'private')}</select><small>Private: you and invited editors. Friends: accepted friends. Public: anyone in the club.</small></label><fieldset class="form-field swatch-field"><legend>Cover colour</legend><div class="swatches">${[['rose','Blush'],['olive','Sage'],['ochre','Gold'],['terracotta','Orange']].map(([value,label])=>`<label class="swatch swatch-${toneOf(value)}"><input type="radio" name="coverColor" value="${value}" ${value===(book?.coverColor||'rose')?'checked':''}><span>${label}</span></label>`).join('')}</div></fieldset>${!book?'<label class="form-field wide">Invite your partner (optional username)<input name="partner" maxlength="30" placeholder="Their username, once they have an account"><small>They’ll accept an invitation before they can add recipes.</small></label>':''}<p class="form-error wide" role="alert" hidden></p>${book?`<div class="wide">${deleteZone('cookbooks',book.id,'Delete this cookbook','The cookbook, its recipes, reviews and conversations will be permanently removed.')}</div>`:''}</div><div class="dialog-actions"><button type="button" class="button" data-action="close-dialog">Cancel</button><button class="button primary" type="submit">${book?'Save cookbook':'Create our cookbook'}</button></div></form>`);
}
function ingredientRow(i={},index=0) {
  const unit=i.unit||'g', mass=!!GRAMS_PER_UNIT[unit];
  return `<div class="ingredient-row"><label class="form-field">Ingredient<input data-ingredient="name" required maxlength="120" aria-label="Ingredient ${index+1}" placeholder="e.g. Cherry tomatoes" value="${esc(i.name)}"></label><label class="form-field">Amount<input type="number" data-ingredient="quantity" required min="0.001" max="1000000" step="any" aria-label="Amount ${index+1}" value="${esc(i.quantity)}"></label><label class="form-field">Unit<select data-ingredient="unit" aria-label="Unit ${index+1}">${optionList(UNITS,unit)}</select></label><label class="form-field">Preparation<input data-ingredient="note" maxlength="200" aria-label="Preparation ${index+1}" placeholder="optional" value="${esc(i.note)}"></label><button type="button" class="icon-button" data-action="remove-ingredient" aria-label="Remove ingredient ${index+1}">${icon('close')}</button><details class="ingredient-calories"><summary>Optional calories</summary><label class="form-field"><span data-calorie-label>${mass?'kcal per 100 g':`kcal per ${esc(unit)}`}</span><input data-ingredient="calories" type="number" min="0" max="${mass?1000:100000}" step="any" value="${esc(mass?i.kcalPer100g:i.kcalPerUnit)}" aria-label="Calories ${index+1}"></label></details></div>`;
}
function stepRow(step='',i=0) { return `<div class="step-row"><span>${i+1}</span><label class="form-field"><span class="visually-hidden">Instruction ${i+1}</span><textarea data-step required maxlength="2000" placeholder="A little of this, a little of that…">${esc(step)}</textarea></label><button class="icon-button" type="button" data-action="remove-step" aria-label="Remove step ${i+1}">${icon('close')}</button></div>`; }
async function openRecipeEditor(id='',bookId='', imported=null) {
  const existing=recipeById(id);
  draft=imported?{...imported.recipe,id:existing?.id,cookbookId:bookId||existing?.cookbookId||ownBooks()[0]?.id,meatType:existing?.meatType||'Other',tags:existing?.tags||[],warnings:imported.warnings||[],originalSource:clone(imported.recipe)}:existing?{...clone(existing),originalSource:clone(existing)}:{title:'',description:'',cookbookId:bookId||ownBooks()[0]?.id,category:'Dinner',meatType:'Other',tags:[],servings:2,minutes:30,ingredients:[{}],instructions:[''],imageId:'',sourceUrl:''};
  if(!draft.cookbookId){openBookEditor();notify('Create a cookbook first, then add your recipe.');return;}
  await loadPhoto(draft.imageId);
  renderRecipeEditor();
}
function renderRecipeEditor() {
  const image=photoSrc(draft);
  openDialog(draft.id?'A recipe, with your touch.':'One worth keeping.',`<form id="recipe-form" data-id="${draft.id||''}" data-guard><div class="dialog-content"><div class="import-box"><span class="label">Bring a recipe home</span><div class="inline-form"><label class="form-field"><span class="visually-hidden">Recipe link</span><input id="import-url" type="url" placeholder="Paste a recipe link…" maxlength="2000"></label><button type="button" class="button" data-action="import-url">Import link</button></div><details><summary>Or paste recipe text</summary><label class="form-field"><span class="visually-hidden">Pasted recipe text</span><textarea id="import-text" maxlength="120000" placeholder="Recipe name\nIngredients\n…\nInstructions\n…"></textarea></label><button type="button" class="button small" data-action="import-text">Clean up recipe</button></details><p id="import-status" class="muted" role="status"></p></div>${draft.warnings?.length?`<details class="notice"><summary>Review ${draft.warnings.length} import notes</summary><ul>${draft.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></details>`:''}<div class="form-grid"><label class="form-field wide">Recipe name<input name="title" required maxlength="120" placeholder="e.g. Sunday tomato pasta" value="${esc(draft.title)}"></label><label class="form-field wide">A short kitchen note<textarea name="description" maxlength="600" placeholder="Why we love it, or where it came from.">${esc(draft.description)}</textarea></label><label class="form-field">Cookbook<select name="cookbookId" ${draft.id?'disabled':''}>${ownBooks().map(b=>`<option value="${b.id}" ${b.id===draft.cookbookId?'selected':''}>${esc(b.name)}</option>`).join('')}</select></label><label class="form-field">Meal<select name="category">${optionList(CATEGORIES,draft.category)}</select></label><label class="form-field">Main ingredient<select name="meatType">${optionList(meats,draft.meatType||'Other')}</select></label><label class="form-field">Servings<input name="servings" type="number" required min="1" max="100" step="1" value="${draft.servings}"></label><label class="form-field">Time (minutes)<input name="minutes" type="number" required min="1" max="1440" step="1" value="${draft.minutes}"></label><label class="form-field">Labels, separated by commas<input name="tags" maxlength="300" placeholder="comfort food, quick, date night" value="${esc((draft.tags||[]).join(', '))}"></label></div><section class="form-section"><div class="section-head"><h3>A photo for the page</h3><button type="button" class="text-button" data-action="remove-photo"${image?'':' hidden'}>Remove photo</button></div><div id="photo-preview" class="editor-photo">${image?`<img src="${esc(image)}" alt="Recipe photo preview">`:`<span>${icon('camera')}A little glimpse of the good stuff.</span>`}</div><label class="button small photo-upload">${icon('camera')}Choose a photo<input id="photo-file" type="file" accept="image/jpeg,image/png,image/webp"></label><p id="photo-status" class="muted" role="status">A recipe link can bring its main photo along. Or add your own JPG, PNG or WebP.</p></section><section class="form-section"><div class="section-head"><h3>Ingredients</h3><button type="button" class="button small" data-action="add-ingredient">${icon('plus')}Add ingredient</button></div><p class="muted form-hint">Use the same name for the same ingredient and your shopping list will add them together.</p><div id="ingredient-rows">${draft.ingredients.map(ingredientRow).join('')}</div><button type="button" class="button small add-more" data-action="add-ingredient">${icon('plus')}Add ingredient</button></section><section class="form-section"><div class="section-head"><h3>How to make it</h3><button type="button" class="button small" data-action="add-step">${icon('plus')}Add step</button></div><div id="step-rows">${draft.instructions.map(stepRow).join('')}</div><button type="button" class="button small add-more" data-action="add-step">${icon('plus')}Add step</button></section><p class="form-error" role="alert" hidden></p>${draft.id?deleteZone('recipes',draft.id,'Delete this recipe','This recipe and its reviews will be permanently removed.'):''}</div><div class="dialog-actions"><button type="button" class="button" data-action="close-dialog">Cancel</button><button class="button primary" type="submit">${icon('check')}Save recipe</button></div></form>`);
}
function readRecipeDraft() {
  const form=$('#recipe-form'), values=new FormData(form);
  const ingredients=$$('.ingredient-row',form).map(row=>{
    const val=key=>$(`[data-ingredient="${key}"]`,row).value;
    const unit=val('unit'), calories=val('calories')===''?null:Number(val('calories'));
    return {name:val('name').trim(),quantity:val('quantity')===''?null:Number(val('quantity')),unit,note:val('note').trim(),kcalPer100g:GRAMS_PER_UNIT[unit]?calories:null,kcalPerUnit:GRAMS_PER_UNIT[unit]?null:calories};
  });
  const result={title:values.get('title'),description:values.get('description'),cookbookId:values.get('cookbookId')||draft.cookbookId,category:values.get('category'),meatType:values.get('meatType'),tags:[...new Set(values.get('tags').split(',').map(v=>v.trim()).filter(Boolean))].slice(0,12),servings:Number(values.get('servings')),minutes:Number(values.get('minutes')),ingredients,instructions:$$('[data-step]',form).map(t=>t.value.trim()),imageId:draft.imageId||'',sourceUrl:draft.sourceUrl||'',sourceCaloriesPerServing:null};
  const signature=r=>JSON.stringify([r.servings,r.ingredients.map(i=>[i.name.trim().toLowerCase(),i.quantity,i.unit,i.kcalPer100g??null,i.kcalPerUnit??null])]);
  if(draft.originalSource&&signature(result)===signature(draft.originalSource))result.sourceCaloriesPerServing=draft.originalSource.sourceCaloriesPerServing;
  return result;
}
async function doImport(mode,button) {
  const input=mode==='url'?{url:$('#import-url').value.trim()}:{text:$('#import-text').value};
  const status=$('#import-status');
  if(!Object.values(input)[0]){status.textContent='Add a link or recipe text first.';return;}
  const current=readRecipeDraft();button.disabled=true;status.textContent='Finding the ingredients, steps and main photo…';
  try {const imported=await store.importRecipe(input);if(!button.isConnected)return;await openRecipeEditor(draft.id||'',current.cookbookId,imported);dialogDirty=true;}
  catch(error){status.textContent=error.message;}
  finally{button.disabled=false;}
}
async function uploadPhoto(file) {
  if(!file)return;
  const status=$('#photo-status'),form=$('#recipe-form'),save=$('button[type="submit"]',form);
  status.textContent='Preparing your photo…';save.disabled=true;
  try {
    if(file.size>15*1024*1024)throw new Error('Choose a photo smaller than 15 MB.');
    const bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>25000000){bitmap.close();throw new Error('Choose a smaller photo (up to 25 megapixels).');}
    const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.82));if(!blob)throw new Error('This photo could not be read. Try a JPG or PNG.');
    const result=await store.uploadPhoto(blob);if(!form.isConnected)return;
    draft.imageId=result.imageId;await loadPhoto(draft.imageId);$('#photo-preview').innerHTML=`<img src="${esc(photoSrc(draft))}" alt="Recipe photo preview">`;$('[data-action="remove-photo"]').hidden=false;status.textContent='Photo ready. Save the recipe to keep it.';
  }catch(error){status.textContent=error.message;}finally{save.disabled=false;}
}
const cleanupDraftPhotos = () => store.discardDrafts();
async function getPlan(bookId) {
  await hydrateBook(bookId);
  planner=await store.loadPlan(bookId);
  plannerBook=bookId;
  return planner;
}
let planQueue=Promise.resolve();
function changePlan(operation,bookId=plannerBook) {
  planQueue=planQueue.catch(()=>{}).then(async()=>{
    const saved=await store.changePlan(bookId,operation,plannerBook===bookId?planner:null);
    if(plannerBook===bookId)planner=saved;if(view==='shopping')render();return true;
  }).catch(error=>{notify(`Meal plan was not saved: ${error.message}`);return false;});
  return planQueue;
}
async function addRecipeToPlan(id,bookId,count) {
  if(!memberOf(bookById(bookId)))throw new Error('Choose one of your shared cookbooks for the meal plan.');
  await getPlan(bookId);
  const saved=await changePlan(state=>{const existing=state.cart.find(entry=>entry.recipeId===id);if(existing)existing.servings=count;else state.cart.push({recipeId:id,servings:count});},bookId);
  if(saved)notify('Added to your shared shopping list.');
  return saved;
}
async function planRecipe(id) {
  const recipe=recipeById(id),books=ownBooks();
  if(!books.length){openBookEditor();notify('Create your shared cookbook to keep a meal plan together.');return;}
  if(memberOf(bookById(recipe.cookbookId)))return addRecipeToPlan(id,recipe.cookbookId,servings);
  if(books.length===1)return addRecipeToPlan(id,books[0].id,servings);
  openDialog('Let’s try something new.',`<form id="plan-form" data-id="${id}"><div class="dialog-content"><p class="muted">Add ${esc(recipe.title)} to a shopping list. You can save it to your cookbook after trying it.</p><label class="form-field">Our shared meal plan<select name="cookbookId">${books.map(book=>`<option value="${book.id}" ${book.id===plannerBook?'selected':''}>${esc(book.name)}</option>`).join('')}</select></label><input type="hidden" name="servings" value="${servings}"><p class="form-error" role="alert" hidden></p></div><div class="dialog-actions"><button type="button" class="button" data-action="close-dialog">Cancel</button><button class="button primary" type="submit">Add to shopping list</button></div></form>`);
}
function openCopyRecipe(id) {
  const recipe=recipeById(id);
  if(!ownBooks().length){openBookEditor();notify('Create your cookbook, then save this favourite to it.');return;}
  openDialog('A favourite for our pages.',`<form id="copy-form" data-id="${id}"><div class="dialog-content"><p class="muted">Keep your own editable copy of ${esc(recipe.title)}. The original recipe stays in its creator’s cookbook.</p><label class="form-field">Our cookbook<select name="cookbookId">${ownBooks().map(book=>`<option value="${book.id}">${esc(book.name)}</option>`).join('')}</select></label><p class="form-error" role="alert" hidden></p></div><div class="dialog-actions"><button type="button" class="button" data-action="close-dialog">Cancel</button><button class="button primary" type="submit">Save a copy</button></div></form>`);
}

// Private photos of the account that just signed out or was deleted.
function forgetPhotos(){photoEpoch++;photoQueue.length=0;photoFailed.clear();for(const src of photoCache.values())URL.revokeObjectURL(src);photoCache.clear();}
async function mutate(path,method,input) {const result=await store.mutate(path,method,input);touch();return result;}
async function afterMutation(){searchResult=null;if(!store.demo)await loadFeed(false);render();}
function formError(form,message){const field=$('.form-error',form);if(field){field.textContent=message;field.hidden=false;}else notify(message);}
async function submitForm(event){
  event.preventDefault();const form=event.target,values=new FormData(form),button=$('button[type="submit"]',form);if(button)button.disabled=true;
  const error=$('.form-error',form);if(error)error.hidden=true;
  try{
    if(form.id==='bring-form'){
      await openRecipeEditor();
      const link=$('#import-url'),go=$('[data-action="import-url"]');
      if(link&&go){link.value=values.get('url');form.reset();await doImport('url',go);}
      return;
    }
    if(form.id==='auth-form'){
      if(!configured)throw new Error('This is the preview kitchen. Connect your Supabase project before creating real accounts. You can explore the preview below.');
      const input={email:values.get('email'),password:values.get('password'),username:values.get('username'),displayName:values.get('displayName')};
      const result=await http.signIn(authMode,input);
      if(result.confirmationRequired){formError(form,'Check your email to confirm your account, then sign in.');return;}
      store=http;await loadFeed(false);nav('discover');
    }else if(form.id==='book-form'){
      const id=form.dataset.id,input={name:values.get('name').trim(),description:values.get('description').trim(),visibility:values.get('visibility'),coverColor:values.get('coverColor')};
      const result=await mutate(id?`/cookbooks/${id}`:'/cookbooks',id?'PUT':'POST',input);
      const book=result.cookbook||result;
      let invitationError='';if(values.get('partner')?.trim()){try{await mutate(`/cookbooks/${book.id}/invite`,'POST',{username:values.get('partner').trim().replace(/^@/,'')});}catch(e){invitationError=e.message;}}
      dialog.close();await afterMutation();bookNotice=invitationError?{id:book.id||id,text:invitationError}:null;nav('book',book.id||id);notify(invitationError?'Cookbook saved.':id?'Cookbook updated.':'Your cookbook is ready for its first recipe.');
    }else if(form.id==='recipe-form'){
      const input=readRecipeDraft();const id=form.dataset.id;
      const result=await mutate(id?`/recipes/${id}`:'/recipes',id?'PUT':'POST',input);const recipe=result.recipe||result;
      if(input.imageId)store.keepPhoto(input.imageId);dialog.close();await afterMutation();nav('recipe',recipe.id||id);notify('Recipe saved. A new favourite on your pages.');
    }else if(form.id==='review-form'){
      await mutate(`/recipes/${form.dataset.id}/review`,'PUT',{rating:Number(values.get('rating')),comment:values.get('comment').trim()});await afterMutation();notify('Your kitchen note has been shared.');
    }else if(form.id==='reply-form'){
      await mutate(`/reviews/${form.dataset.id}/replies`,'POST',{comment:values.get('comment').trim()});dialog.close();await afterMutation();notify('Reply added to the conversation.');
    }else if(form.id==='friend-form'){
      await mutate('/friends','POST',{username:values.get('username').trim().replace(/^@/,'')});await afterMutation();notify('Friend request sent.');
    }else if(form.id==='invite-form'){
      await mutate(`/cookbooks/${form.dataset.id}/invite`,'POST',{username:values.get('username').trim().replace(/^@/,'')});dialog.close();await afterMutation();notify('Invitation sent. Your partner can accept it from Friends.');
    }else if(form.id==='plan-form'){
      if(await addRecipeToPlan(form.dataset.id,values.get('cookbookId'),Number(values.get('servings')))){dialog.close();nav('shopping');}
      else formError(form,'The recipe could not be added. Please try again.');
    }else if(form.id==='copy-form'){
      const original=recipeById(form.dataset.id);const {id,createdAt,createdBy,...input}=clone(original);input.cookbookId=values.get('cookbookId');input.sourceUrl=original.sourceUrl||'';
      if(original.imageId)input.imageId=await store.copyPhoto(original.imageId);
      const result=await mutate('/recipes','POST',input);const recipe=result.recipe||result;if(input.imageId)store.keepPhoto(input.imageId);dialog.close();await afterMutation();nav('recipe',recipe.id);notify('A copy saved in your cookbook.');
    }else if(form.id==='report-form'){
      await mutate('/reports','POST',{targetType:form.dataset.type,targetId:form.dataset.id,reason:values.get('reason'),note:values.get('note').trim()});dialog.close();notify('Thank you. Your report was sent privately.');
    }else if(form.id==='delete-account-form'){
      await mutate('/account/delete','POST',{username:values.get('username'),password:values.get('password')});
      store.dropSession();forgetPhotos();user=null;profile=null;feed={};view='discover';selectedId='';clearAddress();dialog.close();renderAuth();notify('Your account has been deleted. Goodbye, and thank you for cooking with us.');
    }else if(form.id==='profile-form'){
      await mutate('/profile','PUT',{username:values.get('username').trim().toLowerCase(),displayName:values.get('displayName').trim(),bio:values.get('bio').trim()});dialog.close();await afterMutation();notify('Your profile is updated.');
    }
  }catch(problem){formError(form,problem.message);}finally{if(button)button.disabled=false;}
}
function renderAuth(message=''){
  setMenu(false);document.title=DEFAULT_TITLE;
  const signup=authMode==='signup';
  app.innerHTML=`<main class="auth-shell"><section class="auth-art">${blob(1,'gold','auth-blob-a')}${blob(3,'sage','auth-blob-b')}${float('sign-in','auth-leaves','0.1')}${food('sign-in-dish','food-auth-pizza')}<div class="auth-art-inner"><div class="auth-brand">${logo()}</div><h1 class="display">A little love.<br>A little joy.<br>A place for our recipes.</h1>${dots}<p class="tagline">good food tastes better together</p><p class="lede">For the dinners that become traditions, and the people who make them special.</p></div></section><section class="auth-card-wrap"><div class="auth-card"><div class="auth-tabs"><button class="${!signup?'active':''}" data-auth-mode="login" aria-pressed="${!signup}">Welcome back</button><button class="${signup?'active':''}" data-auth-mode="signup" aria-pressed="${signup}">Join the table</button></div><p class="kicker">${signup?'there’s a place for you':'your kitchen is waiting'}</p><h2>${signup?'Start a new tradition.':'Come on in.'}</h2><p class="muted">${signup?'Create your account. Invite your person. Share what you love.':'Sign in to your recipes, your people, and a little inspiration.'}</p>${message?`<p class="notice">${esc(message)}</p>`:''}<form id="auth-form">${signup?'<label class="form-field">Your name<input name="displayName" required maxlength="80" autocomplete="name" placeholder="The name at your table"></label><label class="form-field">Username<input name="username" required pattern="[a-z0-9_]{3,30}" maxlength="30" autocomplete="username" placeholder="e.g. flourandflowers"><small>3–30 lowercase letters, numbers or underscores.</small></label>':''}<label class="form-field">Email<input name="email" type="email" required maxlength="254" autocomplete="email" placeholder="you@example.com"></label><label class="form-field">Password<input name="password" type="password" minlength="8" maxlength="128" required autocomplete="${signup?'new-password':'current-password'}" placeholder="At least 8 characters"></label><p class="form-error" role="alert" hidden></p>${signup?'<p class="legal-consent">By creating an account you agree to the <a href="/terms.html">terms</a>. The <a href="/privacy.html">privacy notice</a> explains what we keep and why.</p>':''}<button type="submit" class="button primary full">${signup?'Create my account':'Sign in'}${icon('arrow')}</button></form>${signup?'':'<p class="legal-links"><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></p>'}${!configured?'<p class="notice">The local preview uses sample people and cookbooks. Real accounts require your Supabase project.</p><button class="button full" data-action="enter-demo">Explore the preview kitchen</button>':''}</div></section></main>`;
}
async function enterDemo(){store=await createDemoStore({loadDemoData,notify});openAddress();await loadFeed();}
// Start on the page the address names (a shared link, a refresh); an empty address is Discover.
function openAddress(){const route=readRoute();view=route.view;selectedId=route.id;}
const clearAddress=()=>history.replaceState(null,'',location.pathname+location.search);
async function bootstrap(){
  try{const config=await http.config();configured=!!config.configured;
    if(!configured){await enterDemo();return;}
    store=http;
    if(!http.restoreSession()){user=null;renderAuth();return;}
    openAddress();
    await loadFeed();
  }catch(error){if(error.status===401){http.dropSession();user=null;renderAuth('Your session expired. Sign in to return to your kitchen.');}else{app.innerHTML=`<main class="wrap">${empty('We couldn’t open the kitchen.',esc(error.message),'<button class="button" data-action="retry">Try again</button>')}</main>`;}}
}
function downloadShoppingList(){const rows=shoppingList(feed.recipes,planner.cart);const text=[`${APP_NAME.toLocaleUpperCase()} — OUR SHOPPING LIST`,bookById(plannerBook)?.name||'', '',...rows.map(row=>`${planner.checked[checkKey(row)]===true?'[x]':'[ ]'} ${displayAmount(row.quantity,row.unit)} ${row.name}${row.notes.length?' · '+row.notes.join('; '):''}`)].join('\n');const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='our-shopping-list.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
document.addEventListener('submit',submitForm);
document.addEventListener('click',async event=>{
  const auth=event.target.closest('[data-auth-mode]');if(auth){authMode=auth.dataset.authMode;renderAuth();return;}
  const navigation=event.target.closest('[data-view]');if(navigation){if(navigation.dataset.view==='shopping'&&ownBooks().length){try{await getPlan(plannerBook||ownBooks()[0]?.id);}catch(error){notify(error.message);return;}}nav(navigation.dataset.view);return;}
  const button=event.target.closest('[data-action]');if(!button||button.disabled)return;const action=button.dataset.action,id=button.dataset.id;
  if(action!=='menu')setMenu(false);
  try{
    if(action==='book'){await hydrateBook(id);nav('book',id);}
    else if(action==='menu')setMenu(!menuOpen);
    else if(action==='carousel'){const track=button.closest('[data-carousel]')?.querySelector('.carousel-track'),[a,b]=track?.children||[];track?.scrollBy({left:Number(button.dataset.dir)*(b?b.offsetLeft-a.offsetLeft:track.clientWidth),behavior:'smooth'});}
    else if(action==='scroll-to')document.getElementById(button.dataset.target)?.scrollIntoView({behavior:'smooth',block:'start'});
    else if(action==='recipe')nav('recipe',id);
    else if(action==='profile')nav('profile',id);
    else if(action==='new-book')openBookEditor();
    else if(action==='edit-book')openBookEditor(id);
    else if(action==='report')openReport(button.dataset.type,id);
    else if(action==='delete-account'){if(!store.demo)openDeleteAccount();}
    else if(action==='add-recipe')await openRecipeEditor('',id);
    else if(action==='edit-recipe')await openRecipeEditor(id);
    else if(action==='close-dialog')requestClose();
    else if(action==='back')history.back();
    else if(action==='keep-editing')button.closest('.discard-confirm').remove();
    else if(action==='discard-changes'){dialogDirty=false;dialog.close();}
    else if(action==='ask-delete'){const zone=button.closest('.delete-zone'),panel=zone.querySelector('.delete-confirm');panel.hidden=false;button.hidden=true;panel.querySelector('button').focus();panel.scrollIntoView({block:'nearest'});}
    else if(action==='cancel-delete'){const zone=button.closest('.delete-zone'),ask=zone.querySelector('[data-action="ask-delete"]');zone.querySelector('.delete-confirm').hidden=true;ask.hidden=false;ask.focus();}
    else if(action==='retry')await bootstrap();
    else if(action==='show-auth'){user=null;renderAuth();}
    else if(action==='enter-demo')await enterDemo();
    else if(action==='logout'){if(!store.demo){await store.signOut();forgetPhotos();}user=null;clearAddress();renderAuth();}
    else if(action==='follow'){button.disabled=true;await mutate(`/cookbooks/${id}/follow`,followExists(id)?'DELETE':'PUT',{});await afterMutation();}
    else if(action==='add-friend'){button.disabled=true;await mutate('/friends','POST',{username:person(id).username});await afterMutation();notify('Friend request sent.');}
    else if(action==='accept-friend'){button.disabled=true;await mutate(`/friends/${id}/accept`,'POST',{});await afterMutation();notify('A new friend at your table.');}
    else if(action==='accept-invite'){button.disabled=true;await mutate(`/invitations/${id}/accept`,'POST',{});await afterMutation();notify('Welcome to your shared cookbook.');}
    // The home page's "Invite your partner" has no cookbook yet: it uses your first, or starts one.
    else if(action==='invite-partner'&&!ownBooks().length)openBookEditor();
    else if(action==='invite'||action==='invite-partner')openDialog('Two cooks. One cookbook.',`<form id="invite-form" data-id="${action==='invite'?id:ownBooks()[0].id}"><div class="dialog-content"><p class="muted">Invite your partner by username. Once they accept, you can both add and edit recipes in this cookbook.</p><label class="form-field">Partner’s username<input name="username" required maxlength="30" placeholder="Their username"></label><p class="form-error" role="alert" hidden></p></div><div class="dialog-actions"><button type="button" class="button" data-action="close-dialog">Cancel</button><button type="submit" class="button primary">Send invitation</button></div></form>`);
    else if(action==='reply')openDialog('A note back.',`<form id="reply-form" data-id="${id}"><div class="dialog-content"><label class="form-field">Your reply<textarea name="comment" required maxlength="2000" placeholder="Thank you, a little tip, or a question…"></textarea></label><p class="form-error" role="alert" hidden></p></div><div class="dialog-actions"><button type="button" class="button" data-action="close-dialog">Cancel</button><button type="submit" class="button primary">Share reply</button></div></form>`);
    else if(action==='delete-review'){openDialog('Remove your kitchen note?',`<div class="dialog-content"><p>Your rating and its conversation will be removed.</p></div><div class="dialog-actions"><button class="button" data-action="close-dialog">Keep it</button><button class="button danger" data-action="confirm-delete-review" data-id="${id}">Remove my review</button></div>`,'','');}
    else if(action==='confirm-delete-review'){await mutate(`/recipes/${id}/review`,'DELETE');dialog.close();await afterMutation();}
    else if(action==='delete-recipe'||action==='delete-book'){
      const book=action==='delete-book';openDialog(book?'Close this cookbook for good?':'Remove this recipe?',`<div class="dialog-content"><p>${book?'The cookbook, its recipes, reviews and conversations will be permanently removed.':'This recipe and its reviews will be permanently removed.'}</p></div><div class="dialog-actions"><button class="button" data-action="close-dialog">Keep it</button><button class="button danger" data-action="confirm-delete" data-kind="${book?'cookbooks':'recipes'}" data-id="${id}">Yes, delete ${book?'cookbook':'recipe'}</button></div>`);
    }
    else if(action==='confirm-delete'){const kind=button.dataset.kind,bookId=kind==='recipes'?recipeById(id)?.cookbookId:'';await mutate(`/${kind}/${id}`,'DELETE');dialog.close();await afterMutation();if(bookId&&bookById(bookId))nav('book',bookId);else nav('mine');notify('Removed from your cookbook.');}
    else if(action==='reset-search'){search='';category='';meatType='';tag='';const box=$('#global-search');if(box)box.value='';nav('search');}
    else if(action==='import-url'||action==='import-text')await doImport(action==='import-url'?'url':'text',button);
    else if(action==='add-ingredient'){if($$('.ingredient-row',dialog).length>=100)return notify('A recipe can have up to 100 ingredients.');$('#ingredient-rows').insertAdjacentHTML('beforeend',ingredientRow({},$$('.ingredient-row',dialog).length));}
    else if(action==='remove-ingredient'){if($$('.ingredient-row',dialog).length<=1)return notify('Keep at least one ingredient.');button.closest('.ingredient-row').remove();}
    else if(action==='add-step'){if($$('.step-row',dialog).length>=100)return notify('A recipe can have up to 100 steps.');$('#step-rows').insertAdjacentHTML('beforeend',stepRow('',$$('.step-row',dialog).length));}
    else if(action==='remove-step'){if($$('.step-row',dialog).length<=1)return notify('Keep at least one step.');button.closest('.step-row').remove();}
    else if(action==='remove-photo'){draft.imageId='';button.hidden=true;$('#photo-preview').innerHTML=`<span>${icon('camera')}A little glimpse of the good stuff.</span>`;}
    else if(action==='plan'){button.disabled=true;await planRecipe(id);}
    else if(action==='save-copy')openCopyRecipe(id);
    else if(action==='unplan')await changePlan(state=>{state.cart=state.cart.filter(e=>e.recipeId!==id);});
    else if(action==='download-list')downloadShoppingList();
    else if(action==='edit-profile')openDialog('The cook behind the pages.',`<form id="profile-form"><div class="dialog-content form-grid"><label class="form-field wide">Display name<input name="displayName" required maxlength="80" value="${esc(displayName(profile))}"></label><label class="form-field wide">Username<input name="username" required maxlength="30" pattern="[a-z0-9_]{3,30}" value="${esc(profile.username)}"></label><label class="form-field wide">About your kitchen<textarea name="bio" maxlength="500">${esc(profile.bio)}</textarea></label><p class="form-error" hidden role="alert"></p></div><div class="dialog-actions"><button type="button" class="button" data-action="close-dialog">Cancel</button><button type="submit" class="button primary">Save profile</button></div></form>`);
  }catch(error){notify(error.message);if(error.status===401&&!store.demo){store.dropSession();user=null;renderAuth('Sign in to continue.');}}
  finally{if(button.isConnected)button.disabled=false;}
});
let searchTimer;
document.addEventListener('input',event=>{if(event.target.id==='global-search'){search=event.target.value;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{view='search';renderMain(searchPage);$$('.nav-link').forEach(link=>link.classList.remove('active'));runSearch();},180);}});
document.addEventListener('keydown',event=>{if(event.target.id==='global-search'&&event.key==='Enter'){clearTimeout(searchTimer);nav('search');$('#global-search')?.focus();}if(event.key==='Escape'&&menuOpen)setMenu(false);});
// The header scrolls away with the page and comes back, on cream, as soon as the reader scrolls up (like the reference).
let lastScroll=0;
addEventListener('scroll',()=>{const y=scrollY,body=document.body;body.classList.toggle('scrolled',y>8);if(y<160||y<lastScroll-4)body.classList.remove('header-away');else if(y>lastScroll+4)body.classList.add('header-away');lastScroll=y;},{passive:true});
document.addEventListener('change',async event=>{
  const target=event.target;
  try{
    if(target.id==='category-filter'){category=target.value;render();await runSearch();}
    else if(target.id==='meat-filter'){meatType=target.value;render();await runSearch();}
    else if(target.id==='tag-filter'){tag=target.value;render();await runSearch();}
    else if(target.id==='recipe-servings'){const value=Number(target.value);if(!Number.isInteger(value)||value<1||value>100){target.value=servings;return notify('Choose a whole number of servings from 1 to 100.');}servings=value;updateServings();}
    else if(target.id==='photo-file')await uploadPhoto(target.files[0]);
    else if(target.dataset.ingredient==='unit'){const row=target.closest('.ingredient-row'),mass=!!GRAMS_PER_UNIT[target.value];$('[data-calorie-label]',row).textContent=mass?'kcal per 100 g':`kcal per ${target.value}`;$('[data-ingredient="calories"]',row).value='';$('[data-ingredient="calories"]',row).max=mass?1000:100000;}
    else if(target.id==='planner-book'){await getPlan(target.value);render();}
    else if(target.dataset.planServings){const count=Number(target.value);if(!Number.isInteger(count)||count<1||count>100)return notify('Choose 1–100 servings.');await changePlan(state=>{const entry=state.cart.find(e=>e.recipeId===target.dataset.planServings);if(entry)entry.servings=count;});}
    else if(target.dataset.shopping!==undefined){const row=shoppingList(feed.recipes,planner.cart)[Number(target.dataset.shopping)],checked=target.checked;await changePlan(state=>{if(checked)state.checked[checkKey(row)]=true;else delete state.checked[checkKey(row)];});}
  }catch(error){notify(error.message);}
});
dialog.addEventListener('close',()=>{cleanupDraftPhotos();});
// Esc and a click on the backdrop ask first when an editor holds unsaved changes.
dialog.addEventListener('cancel',event=>{if(dialogDirty&&dialog.querySelector('form[data-guard]')){event.preventDefault();requestClose();}});
dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const bounds=dialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)requestClose();});
for(const type of ['input','change'])dialog.addEventListener(type,event=>{if(event.target.closest('form[data-guard]'))dialogDirty=true;});
// Background refresh. Re-render only when something actually changed, so an
// idle page keeps its scroll position, open details and loaded images.
const feedSignature=()=>JSON.stringify([feed.profiles,feed.cookbooks,feed.recipes,feed.friendships,feed.follows,feed.reviews,feed.replies,feed.memberships,view==='shopping'?planner:null]);
setInterval(async()=>{if(store.demo||!user||dialog.open||document.visibilityState!=='visible')return;try{const focused=document.activeElement?.tagName;if(['INPUT','TEXTAREA','SELECT'].includes(focused))return;const before=feedSignature();await loadFeed(false);if(view==='shopping'&&plannerBook)await getPlan(plannerBook);if(feedSignature()!==before)render();}catch{}},30000);
startMotion(BLOBS);
await bootstrap();
