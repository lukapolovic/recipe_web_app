import { PALETTES } from './palettes.js';
import { APP_NAME } from './brand.js';
import { CATEGORIES, UNITS, GRAMS_PER_UNIT } from './recipe-config.js';
import { nutritionFor, shoppingList, displayAmount, checkKey } from './recipe-math.js';
import { createHttpStore, createDemoStore } from './cookbook-store.js';

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ESCAPES[c]);
// Sample people and cookbooks are only needed for the local preview, so they
// are fetched on demand instead of with every signed-in page load.
const loadDemoData = () => import('./social-demo.js').then(module => module.demoData);
const clone = value => structuredClone(value);
const app = $('#app'), dialog = $('#app-dialog');
const DESIGN_PREVIEW = location.pathname === '/design-preview.html';
const PALETTE_KEY = 'cherichef-palette-v1';
function applyPalette(id,persist=false) {
  const palette=PALETTES.find(item=>item.id===id)||PALETTES[0];
  document.documentElement.dataset.palette=palette.id;
  if(persist&&!DESIGN_PREVIEW){try{localStorage.setItem(PALETTE_KEY,palette.id);}catch{}const url=new URL(location.href);url.searchParams.delete('palette');history.replaceState(null,'',url);}
  return palette;
}
let savedPalette='';
if(!DESIGN_PREVIEW){try{savedPalette=localStorage.getItem(PALETTE_KEY)||'';}catch{}}
applyPalette(new URLSearchParams(location.search).get('palette')||savedPalette);

const meats = ['Vegetarian', 'Chicken', 'Beef', 'Pork', 'Lamb', 'Fish', 'Seafood', 'Turkey', 'Mixed', 'Other'];
let configured = false, feed = {}, user = null, profile = null;
let view = 'discover', selectedId = '', search = '', category = '', meatType = '', tag = '', servings = 1;
// True until the page that was just navigated to has been drawn once; CSS entrance animations key off it.
let entering = true;
let searchResult = null;
let plannerBook = '', planner = { cart: [], checked: {}, version: 0 };
let draft = null, toastTimer, authMode = 'login';
const photoCache = new Map();
const paths = { book:'M4 4h6a3 3 0 0 1 2 1 3 3 0 0 1 2-1h6v15h-6a3 3 0 0 0-2 1 3 3 0 0 0-2-1H4z M12 5v15', heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z', search:'M21 21l-5-5 M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0', plus:'M12 5v14M5 12h14', users:'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.9M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0', bag:'M5 7h14l1 14H4z M8 8V6a4 4 0 0 1 8 0v2', compass:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M16 8l-3 5-5 3 3-5z', arrow:'M4 12h16m-6-6 6 6-6 6', close:'m6 6 12 12M6 18 18 6', clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2', leaf:'M20 3C7 2 2 8 5 15s15 6 15-12ZM4 21 15 10', edit:'m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14z', star:'m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L2 9.6l6.2-.9z', logout:'M9 3H4v18h5M10 12h12m-5-5 5 5-5 5', check:'m5 12 4 4L19 6', camera:'M4 6h4l2-3h4l2 3h4v15H4z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0' };
const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.book}"/></svg>`;
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
const person = id => index().profiles.get(id) || (profile?.id === id ? profile : { id, displayName: 'A fellow cook', username: 'cook' });
const displayName = p => p?.displayName || p?.display_name || p?.username || 'A fellow cook';
const avatar = (id, small = false) => `<span class="avatar ${small ? 'small' : ''}" title="${esc(displayName(person(id)))}">${esc(initials(displayName(person(id))))}</span>`;
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
  if (DESIGN_PREVIEW || !id || photoCache.has(id)) return Promise.resolve();
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
  if (DESIGN_PREVIEW || !root) return;
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
function photoSlot(id, attrs) { return id && !DESIGN_PREVIEW ? `<template data-photo="${esc(id)}"><img ${attrs}></template>` : ''; }
function photoSrc(recipe) { return recipe?.imageId ? photoCache.get(recipe.imageId) || '' : recipe?.imageUrl?.startsWith('/demo-assets/') ? recipe.imageUrl : ''; }
function bookPhoto(book) { return book.coverImageId ? photoCache.get(book.coverImageId) || '' : book.coverImage?.startsWith('/demo-assets/') ? book.coverImage : ''; }
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
function nav(next, id = '') { view = next; selectedId = id; entering = true; if (next === 'recipe') servings = recipeById(id)?.servings || 2; render(); if(next==='search')runSearch(); window.scrollTo({ top:0, behavior:'smooth' }); }
function herbDrawing() { return '<img src="/wood-assets/kitchen-table.svg" class="hero-illustration" alt="" aria-hidden="true">'; }
function shell(content) {
  const menus = [['discover','compass','Discover'],['mine','book','Our cookbooks'],['following','heart','Following'],['friends','users','Friends'],['shopping','bag','Shopping list']];
  return `<div class="app-shell"><aside class="app-sidebar"><button aria-label="${esc(APP_NAME)}" class="brand" data-view="discover"><span class="brand-symbol">${icon('leaf')}</span><span>${esc(APP_NAME)}<small>GOOD FOOD. OUR PEOPLE.</small></span></button><nav class="sidebar-nav" aria-label="Main navigation">${menus.map(([v,i,n])=>`<button aria-label="${n}" title="${n}" class="nav-link ${view===v?'active':''}" data-view="${v}" ${view===v?'aria-current="page"':''}>${icon(i)}<span>${n}</span></button>`).join('')}</nav><div class="sidebar-note"><span class="little-heart">♡</span><p>The best recipes<br>have a little history.</p></div><div class="sidebar-bottom"><button class="user-chip" aria-label="My profile" data-action="profile" data-id="${user?.id}">${avatar(user?.id)}<span><strong>${esc(displayName(profile))}</strong><small>@${esc(profile?.username)}</small></span></button><button class="icon-button" data-action="logout" aria-label="${store.demo?'Show sign in':'Sign out'}">${icon('logout')}</button></div></aside><div class="app-content"><header class="topbar"><button class="mobile-brand" data-view="discover">${esc(APP_NAME)}</button><div class="global-search">${icon('search')}<label class="visually-hidden" for="global-search">Search people, cookbooks and recipes</label><input id="global-search" type="search" maxlength="100" placeholder="Find a recipe, a cookbook, a kindred cook…" value="${esc(search)}"><kbd>↵</kbd></div><button class="button primary small" data-action="new-book">${icon('plus')}New cookbook</button><button class="mobile-user" data-action="profile" data-id="${user?.id}" aria-label="My profile">${avatar(user?.id)}</button></header>${store.demo?'<div class="demo-banner"><span>Preview kitchen · Sample people and cookbooks. Changes are saved locally on this device.</span><button data-action="show-auth">Sign in / join</button></div>':''}<main class="page-body${entering?' page-enter':''}" id="main">${content}</main><footer class="app-footer"><span>Made for a table of two. And the people around it.</span><span>${esc(APP_NAME)} · your little cookbook club</span></footer></div></div>`;
}
function cookbookCard(book) {
  const recipeCount = book.recipeCount!=null?Number(book.recipeCount):bookRecipes(book.id).length;
  const coauthors = [book.ownerId,...acceptedMembers(book.id).filter(m=>m.userId!==book.ownerId).map(m=>m.userId)];
  const photo = bookPhoto(book);
  return `<article class="cookbook-card"><button class="book-cover ${esc(book.coverColor || 'rose')}" data-action="book" data-id="${book.id}" aria-label="Open ${esc(book.name)}">${photo?`<img src="${esc(photo)}" alt="" loading="lazy">`:photoSlot(book.coverImageId,'alt="" loading="lazy"')}<span class="book-spine"></span><span class="book-cover-eyebrow">A little collection of favourites</span><span class="book-cover-title">${esc(book.name)}</span><span class="book-cover-flourish">${icon('leaf')}</span><span class="book-cover-owner">From ${esc(coauthors.map(id=>displayName(person(id))).join(' & '))}'s kitchen</span></button><div class="book-info"><div class="book-heading"><h3><button data-action="book" data-id="${book.id}">${esc(book.name)}</button></h3>${!memberOf(book)?`<button class="icon-button follow-button ${followExists(book.id)?'is-following':''}" data-action="follow" data-id="${book.id}" aria-label="${followExists(book.id)?'Unfollow':'Follow'} ${esc(book.name)}">${icon('heart')}</button>`:'<span class="badge">Ours</span>'}</div><p class="muted">${esc(book.description || 'Recipes worth keeping, and sharing.')}</p><div class="book-meta"><div class="avatar-stack">${coauthors.slice(0,2).map(id=>avatar(id,true)).join('')}<span>${recipeCount} ${recipeCount===1?'recipe':'recipes'}</span></div><span class="rating">${ratingLabel(ratingForBook(book.id))}</span></div></div></article>`;
}
function recipeCard(recipe) {
  const image = photoSrc(recipe), book=bookById(recipe.cookbookId), stats=recipe.reviewCount!=null?{count:Number(recipe.reviewCount),average:Number(recipe.rating||0)}:ratingStats(recipeReviews(recipe.id));
  return `<article class="recipe-card"><button class="recipe-photo ${esc(book?.coverColor||'olive')}" data-action="recipe" data-id="${recipe.id}" aria-label="Open ${esc(recipe.title)}">${image?`<img src="${esc(image)}" alt="${esc(recipe.title)}" loading="lazy">`:`${photoSlot(recipe.imageId,`alt="${esc(recipe.title)}" loading="lazy"`)}<div class="recipe-placeholder"${recipe.imageId?' data-photo-fallback':''}>${icon('leaf')}<span>From our kitchen</span></div>`}<span class="photo-category">${esc(recipe.category)}</span></button><div class="recipe-body"><span class="recipe-book-name">${esc(book?.name||'A shared cookbook')}</span><h3><button data-action="recipe" data-id="${recipe.id}">${esc(recipe.title)}</button></h3><div class="recipe-card-meta"><span>${icon('clock')}${recipe.minutes} min</span><span class="rating">${ratingLabel(stats)}</span></div><div class="recipe-tags">${[recipe.meatType,...(recipe.tags||[])].filter(Boolean).slice(0,3).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div></div></article>`;
}
function empty(title, text, action = '') { return `<div class="empty-state">${icon('book')}<h2>${title}</h2><p>${text}</p>${action}</div>`; }
function discover() {
  const books=feed.cookbooks.filter(b=>b.visibility==='public'||!memberOf(b));
  const list=books.length?books:feed.cookbooks;
  return `<section class="welcome-hero"><div class="hero-copy"><span class="eyebrow">A COOKBOOK FOR US. A LITTLE INSPIRATION FROM EVERYONE.</span><h1>Made with love.<br><em>Passed around the table.</em></h1><p>Keep your favourites together. Borrow a little inspiration.<br>Make something worth remembering.</p><div class="hero-actions"><button class="button primary" data-action="new-book">Start our cookbook${icon('arrow')}</button><button class="text-button" data-view="mine">Visit our kitchen</button></div></div>${herbDrawing()}</section><section><div class="section-head"><div><span class="eyebrow">WELL-LOVED & WELL-SHARED</span><h2>Cookbooks from the community</h2></div><span class="handwritten">a pinch of inspiration ♡</span></div><div class="cookbook-grid">${list.slice(0,4).map(cookbookCard).join('')||empty('A fresh page.','Be the first to share a cookbook with the club.')}</div></section><section class="page-section"><div class="section-head"><div><span class="eyebrow">SOMETHING GOOD IS COOKING</span><h2>Recipes to fall for</h2></div><button class="text-button" data-view="search">Explore all recipes${icon('arrow')}</button></div><div class="recipe-grid">${feed.recipes.slice(0,4).map(recipeCard).join('')||empty('Your next favourite is waiting.','Add a recipe to get things cooking.')}</div></section>`;
}
function collection(mode) {
  const mine=mode==='mine', books=mine?ownBooks():feed.cookbooks.filter(b=>followExists(b.id));
  return `<div class="section-head page-heading"><div><span class="eyebrow">${mine?'OUR LITTLE CORNER OF THE KITCHEN':'BORROWED INSPIRATION'}</span><h1>${mine?'Our cookbooks.':'Cookbooks we follow.'}</h1><p class="muted">${mine?'A place for your shared favourites, happy accidents and Sunday traditions.':'Keep the kitchens you love close by.'}</p></div>${mine?'<button class="button primary" data-action="new-book">'+icon('plus')+'Create a cookbook</button>':''}</div><div class="cookbook-grid">${books.map(cookbookCard).join('')||empty(mine?'Every good cookbook starts with a blank page.':'Find your kind of kitchen.',mine?'Create one, then invite your partner to add recipes with you.':'Follow a cookbook to find it here.',`<button class="button primary" ${mine?'data-action="new-book"':'data-view="discover"'}>${mine?'Create our cookbook':'Explore cookbooks'}</button>`)}</div>`;
}
function cookbookPage() {
  const book=bookById(selectedId); if(!book)return empty('This cookbook is tucked away.','It may be private, or no longer available.');
  const rows=bookRecipes(book.id), stats=ratingForBook(book.id), writable=memberOf(book);
  return `<button class="breadcrumb" data-view="${writable?'mine':'discover'}">← Back to cookbooks</button><section class="cookbook-hero ${esc(book.coverColor||'rose')}"><div class="mini-book">${icon('book')}</div><div><span class="eyebrow">${esc(book.visibility)} cookbook · @${esc(person(book.ownerId).username)}</span><h1>${esc(book.name)}</h1><p>${esc(book.description)}</p><div class="cookbook-hero-meta"><span>${rows.length} recipes</span><span class="rating">${ratingLabel(stats)}</span><span>Average of all recipe reviews</span></div></div><div class="hero-actions">${writable?`<button class="button primary" data-action="add-recipe" data-id="${book.id}">${icon('plus')}Add recipe</button>${book.ownerId===user.id?`<button class="button" data-action="invite" data-id="${book.id}">${icon('users')}Invite partner</button><button class="icon-button" data-action="edit-book" data-id="${book.id}" aria-label="Edit cookbook">${icon('edit')}</button>`:''}`:`<button class="button primary" data-action="follow" data-id="${book.id}">${icon('heart')}${followExists(book.id)?'Following':'Follow cookbook'}</button>`}</div></section><div class="section-head"><h2>The recipes inside</h2><span class="muted">A collection to make your own traditions with.</span></div><div class="recipe-grid">${rows.map(recipeCard).join('')||empty('The first recipe is the sweetest.','Add a recipe by link, paste its text, or write it yourself.',writable?`<button class="button primary" data-action="add-recipe" data-id="${book.id}">Add our first recipe</button>`:'')}</div>`;
}
const kcalLabel = n => `${Math.round(n.perServing)} kcal / serving${n.source==='website'?' · source estimate':n.complete?'':' · partial'}`;
// A servings change only rescales numbers, so it updates them in place: ticked ingredients, focus and animations stay put.
function updateServings() {
  const recipe=recipeById(selectedId); if(!recipe)return;
  $$('[data-amount]',app).forEach(el=>{const i=recipe.ingredients[Number(el.dataset.amount)];if(i)el.textContent=displayAmount(i.quantity*servings/recipe.servings,i.unit);});
  const kcal=$('[data-kcal]',app), n=nutritionFor(recipe,servings); if(kcal&&n.known)kcal.textContent=kcalLabel(n);
}
function recipePage() {
  const recipe=recipeById(selectedId); if(!recipe)return empty('That recipe is not on the table.','It may belong to a private cookbook.');
  const book=bookById(recipe.cookbookId), image=photoSrc(recipe), own=memberOf(book), stats=recipe.reviewCount!=null?{count:Number(recipe.reviewCount),average:Number(recipe.rating||0)}:ratingStats(recipeReviews(recipe.id)), n=nutritionFor(recipe,servings);
  return `<button class="breadcrumb" data-action="book" data-id="${recipe.cookbookId}">← ${esc(book?.name||'Cookbook')}</button><article class="recipe-paper"><div class="paper-header"><span class="eyebrow">From ${esc(book?.name||'our cookbook')} · ${esc(recipe.category)}</span><div class="paper-flourish">♡</div><h1 class="recipe-title">${esc(recipe.title)}</h1><p class="recipe-description">${esc(recipe.description||'One to keep, make, and pass around.')}</p><div class="recipe-summary"><span>${icon('clock')}${recipe.minutes} minutes</span><label>Servings <input id="recipe-servings" aria-label="Recipe servings" type="number" min="1" max="100" step="1" value="${servings}"></label><span class="rating">${ratingLabel(stats)}</span>${n.known?`<span data-kcal>${kcalLabel(n)}</span>`:''}</div><div class="recipe-tags">${[recipe.category,recipe.meatType,...(recipe.tags||[])].filter(Boolean).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>${image?`<img class="paper-recipe-photo" src="${esc(image)}" alt="${esc(recipe.title)}">`:photoSlot(recipe.imageId,`class="paper-recipe-photo" alt="${esc(recipe.title)}"`)}</div><div class="recipe-columns"><section><div class="section-head"><h2>What you'll need</h2><span class="handwritten">a little of this</span></div><ul class="ingredients-list">${recipe.ingredients.map((i,index)=>`<li><label><input type="checkbox"><span>${esc(i.name)}${i.note?`<small>${esc(i.note)}</small>`:''}</span></label><strong data-amount="${index}">${displayAmount(i.quantity*servings/recipe.servings,i.unit)}</strong></li>`).join('')}</ul></section><section><div class="section-head"><h2>How we make it</h2><span class="handwritten">a little love</span></div><ul class="instructions-list">${recipe.instructions.map(step=>`<li>${esc(step)}</li>`).join('')}</ul></section></div><div class="paper-footnote">${recipe.sourceUrl?`<a href="${esc(recipe.sourceUrl)}" target="_blank" rel="noopener noreferrer">Original recipe ↗</a><span> · </span>`:''}Ingredient amounts scale with servings. Adjust cooking time and equipment as needed.${n.known&&!n.complete?' Calories exclude ingredients without values.':''}</div><div class="paper-actions"><button class="button primary" data-action="plan" data-id="${recipe.id}">${icon('bag')}Add to shopping list</button>${own?`<button class="button" data-action="edit-recipe" data-id="${recipe.id}">${icon('edit')}Edit recipe</button>`:`<button class="button" data-action="save-copy" data-id="${recipe.id}">${icon('book')}Save to our cookbook</button>`}</div></article>${reviewsSection(recipe, own)}`;
}
function reviewsSection(recipe, own) {
  const reviews=recipeReviews(recipe.id), mine=reviews.find(r=>r.userId===user.id), stats=recipe.reviewCount!=null?{count:Number(recipe.reviewCount),average:Number(recipe.rating||0)}:ratingStats(reviews);
  return `<section class="reviews-section"><div class="section-head"><div><span class="eyebrow">AROUND THE TABLE</span><h2>Made it? Tell us how it went.</h2></div><span class="rating">${ratingLabel(stats)}</span></div>${!own?`<form id="review-form" data-id="${recipe.id}" class="review-form"><h3>${mine?'Your kitchen notes':'Leave a little kitchen note'}</h3><fieldset class="rating-input"><legend>Your rating</legend>${[1,2,3,4,5].map(i=>`<label><input type="radio" name="rating" value="${i}" required ${mine?.rating===i?'checked':''}><span aria-label="${i} out of 5">${i} ★</span></label>`).join('')}</fieldset><label class="form-field">Your comment<textarea name="comment" required maxlength="2000" placeholder="Did you add a twist? Would you make it again?">${esc(mine?.comment)}</textarea></label><div class="review-form-actions"><button class="button primary small" type="submit">${mine?'Update review':'Share review'}</button>${mine?`<button type="button" class="button subtle small" data-action="delete-review" data-id="${recipe.id}">Remove my review</button>`:''}</div><p class="form-error" role="alert" hidden></p></form>`:'<p class="notice">This is a recipe from your cookbook. You can reply to your visitors’ notes below.</p>'}<div class="review-list">${reviews.map(review=>`<article class="review-card"><div class="review-author">${avatar(review.userId)}<div><button class="text-button" data-action="profile" data-id="${review.userId}">${esc(displayName(person(review.userId)))}</button><small>@${esc(person(review.userId).username)} · ${dateLabel(review.createdAt)}</small></div><span class="review-stars" aria-label="${review.rating} out of 5">${'★'.repeat(review.rating)}<span>${'☆'.repeat(5-review.rating)}</span></span></div><p>${esc(review.comment)}</p>${reviewReplies(review.id).map(reply=>`<div class="reply"><strong>${esc(displayName(person(reply.userId)))}</strong><span class="muted"> · ${dateLabel(reply.createdAt)}</span><p>${esc(reply.comment)}</p></div>`).join('')}${own||review.userId===user.id?`<button class="text-button reply-toggle" data-action="reply" data-id="${review.id}">Reply to this note</button>`:''}</article>`).join('')||'<p class="muted empty-reviews">No notes yet. Be the first to bring this recipe to your table.</p>'}</div></section>`;
}
function dateLabel(value) { if(!value)return 'Just now'; const date=new Date(value);return Number.isNaN(+date)?'Just now':date.toLocaleDateString('en',{month:'short',day:'numeric'}); }
function personCard(p) {
  const relation=index().friendships.get(p.id);
  return `<article class="person-card">${avatar(p.id)}<h3><button class="text-button" data-action="profile" data-id="${p.id}">${esc(displayName(p))}</button></h3><span class="muted">@${esc(p.username)}</span><p>${esc(p.bio||'Finding joy in everyday cooking.')}</p>${relation?.status==='accepted'?'<span class="badge">At our table · friends</span>':relation?relation.recipientId===user.id?`<button class="button small primary" data-action="accept-friend" data-id="${relation.id}">Accept friend request</button>`:'<span class="badge">Request sent</span>':`<button class="button small" data-action="add-friend" data-id="${p.id}">${icon('plus')}Add friend</button>`}</article>`;
}
function friendsPage() {
  const relations=feed.friendships.filter(f=>f.status==='accepted'&&(f.requesterId===user.id||f.recipientId===user.id));
  const ids=new Set(relations.map(f=>f.requesterId===user.id?f.recipientId:f.requesterId));
  const invitations=feed.memberships.filter(m=>m.userId===user.id&&['invited','pending'].includes(m.status));
  const incoming=feed.friendships.filter(f=>f.recipientId===user.id&&f.status==='pending');
  return `<div class="section-head page-heading"><div><span class="eyebrow">THERE'S ALWAYS ROOM FOR ONE MORE</span><h1>Our people.</h1><p class="muted">Friends, fellow cooks and the person you share your kitchen with.</p></div></div><form id="friend-form" class="inline-form"><label class="form-field">Find someone by username<input name="username" maxlength="30" required placeholder="e.g. flourandflowers"></label><button class="button primary" type="submit">Add friend${icon('plus')}</button><p class="form-error" hidden role="alert"></p></form>${invitations.length?`<section class="page-section"><h2>A place in their cookbook</h2>${invitations.map(m=>`<div class="invitation notice"><span>You've been invited to cook together in <strong>${esc(m.cookbookName||bookById(m.cookbookId)?.name||'a shared cookbook')}</strong>.</span><button class="button small primary" data-action="accept-invite" data-id="${m.id}">Accept invitation</button></div>`).join('')}</section>`:''}${incoming.length?`<section class="page-section"><h2>New faces at the door</h2><div class="people-grid">${incoming.map(f=>personCard(person(f.requesterId))).join('')}</div></section>`:''}<section class="page-section"><div class="section-head"><h2>Friends at our table</h2><span class="muted">${ids.size} ${ids.size===1?'friend':'friends'}</span></div><div class="people-grid">${feed.profiles.filter(p=>ids.has(p.id)).map(personCard).join('')||empty('Good food brings people together.','Search for a username to send your first friend request.')}</div></section><section class="page-section"><div class="section-head"><h2>Meet the cookbook club</h2></div><div class="people-grid">${feed.profiles.filter(p=>p.id!==user.id&&!ids.has(p.id)&&!incoming.some(f=>f.requesterId===p.id)).slice(0,6).map(personCard).join('')}</div></section>`;
}
function searchPage() {
  const q=search.toLowerCase().trim();
  const matches=values=>!q||values.filter(Boolean).some(v=>String(v).toLowerCase().includes(q));
  const remote=searchResult?.key===JSON.stringify([search,category,meatType,tag])?searchResult:null;
  const recipes=remote?remote.recipes:feed.recipes.filter(r=>matches([r.title,r.category,r.meatType,...(r.tags||[]),...r.ingredients.map(i=>i.name)])&&(!category||r.category===category)&&(!meatType||r.meatType===meatType)&&(!tag||(r.tags||[]).includes(tag)));
  const books=remote?remote.cookbooks:feed.cookbooks.filter(b=>matches([b.name,b.description]));
  const people=(remote?remote.profiles:feed.profiles.filter(p=>matches([p.username,displayName(p)]))).filter(p=>p.id!==user.id);
  return `<div class="page-heading"><span class="eyebrow">A LITTLE CURIOSITY GOES A LONG WAY</span><h1>${q?`At the table: “${esc(search)}”`:'Find your next favourite.'}</h1><p class="muted">Search usernames, cookbook names, recipes, ingredients and labels.</p></div><div class="filter-row"><label class="form-field">Meal<select id="category-filter"><option value="">Any meal</option>${optionList(CATEGORIES,category)}</select></label><label class="form-field">Main ingredient<select id="meat-filter"><option value="">Any ingredient</option>${optionList(meats,meatType)}</select></label><label class="form-field">Label<select id="tag-filter"><option value="">Any label</option>${optionList([...new Set(feed.recipes.flatMap(r=>r.tags||[]))].sort(),tag)}</select></label><button class="text-button" data-action="reset-search">Clear filters</button></div><section class="page-section"><div class="section-head"><h2>Recipes</h2><span class="muted">${recipes.length} found</span></div><div class="recipe-grid">${recipes.map(recipeCard).join('')||empty('No recipes found.','Try another name or give the filters a little more room.')}</div></section>${!category&&!meatType&&!tag?`<section class="page-section"><div class="section-head"><h2>Cookbooks</h2><span class="muted">${books.length} found</span></div><div class="cookbook-grid">${books.map(cookbookCard).join('')}</div></section><section class="page-section"><div class="section-head"><h2>People</h2><span class="muted">${people.length} found</span></div><div class="people-grid">${people.slice(0,12).map(personCard).join('')}</div></section>`:''}`;
}
function renderMain(page) { const main=$('#main'); if(!main)return; touch(); resetPhotoQueue(); main.innerHTML=page(); hydratePhotos(main); }
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
  return `<section class="profile-hero">${avatar(p.id)}<span class="eyebrow">A FELLOW COOK IN THE CLUB</span><h1>${esc(displayName(p))}</h1><p class="muted">@${esc(p.username)}</p><p>${esc(p.bio||'A few favourite recipes, and a little room for new traditions.')}</p>${own?'<div class="profile-actions"><button class="button" data-action="edit-profile">Edit profile</button><button class="button" data-action="appearance">Kitchen style</button><button class="button subtle" data-action="logout">Sign out</button></div>':`<button class="button" data-action="add-friend" data-id="${p.id}">${icon('users')}Add friend</button>`}</section><div class="section-head"><h2>${own?'Our cookbooks':`${esc(displayName(p).split(' ')[0])}'s cookbooks`}</h2></div><div class="cookbook-grid">${feed.cookbooks.filter(b=>b.ownerId===p.id||acceptedMembers(b.id).some(m=>m.userId===p.id)).map(cookbookCard).join('')||empty('A cookbook is on its way.','There are no cookbooks visible here yet.')}</div>`;
}
function shoppingPage() {
  const books=ownBooks();
  if(!books.length)return empty('A little planning starts in our kitchen.','Create a cookbook before making a shared meal plan.','<button class="button primary" data-action="new-book">Create a cookbook</button>');
  plannerBook=books.some(b=>b.id===plannerBook)?plannerBook:books[0].id;
  const rows=shoppingList(feed.recipes,planner.cart||[]), done=rows.filter(row=>planner.checked?.[checkKey(row)]===true).length;
  return `<div class="page-heading"><span class="eyebrow">FROM OUR KITCHEN TO THE MARKET</span><h1>A little list. All we need.</h1><p class="muted">A shared plan for the meals you want to make together.</p></div><label class="form-field planner-select">Our cookbook<select id="planner-book">${books.map(b=>`<option value="${b.id}" ${plannerBook===b.id?'selected':''}>${esc(b.name)}</option>`).join('')}</select></label><div class="shopping-layout"><section class="shopping-paper"><div class="section-head"><h2>The shopping list</h2><button class="button small" data-action="download-list">Save list</button></div><p class="muted">${done} of ${rows.length} ingredients checked</p>${rows.map((row,i)=>`<label class="shopping-row ${planner.checked?.[checkKey(row)]===true?'checked':''}"><input type="checkbox" data-shopping="${i}" ${planner.checked?.[checkKey(row)]===true?'checked':''}><span>${esc(row.name)}<small>${esc(row.notes.join(' · '))}</small></span><strong>${displayAmount(row.quantity,row.unit)}</strong></label>`).join('')||empty('Nothing on the list just yet.','Open any recipe you want to try and add it to your meal plan.')}<p class="paper-footnote">Matching ingredient names combine. Grams/kilograms/ounces/pounds and millilitres/litres are converted; cups and spoon measures stay separate.</p></section><aside class="meal-plan"><span class="eyebrow">ON THE MENU</span><h2>What we're making</h2>${(planner.cart||[]).map(e=>{const r=recipeById(e.recipeId);return r?`<div class="planned-meal"><button class="text-button" data-action="recipe" data-id="${r.id}">${esc(r.title)}</button>${r.cookbookId!==plannerBook?`<p class="trial-source">Trying it out · From ${esc(bookById(r.cookbookId)?.name||'a friend’s cookbook')}</p><button class="text-button trial-save" data-action="save-copy" data-id="${r.id}">${icon('book')}Save to our cookbook</button>`:''}<div><label>Servings <input type="number" min="1" max="100" step="1" value="${e.servings}" data-plan-servings="${r.id}" aria-label="Servings for ${esc(r.title)}"></label><button class="icon-button" data-action="unplan" data-id="${r.id}" aria-label="Remove ${esc(r.title)} from plan">${icon('close')}</button></div></div>`:''}).join('')||'<p class="muted">Choose a few recipes. We’ll bring the ingredients together.</p>'}<button class="button full" data-view="search">Find recipes to try${icon('arrow')}</button></aside></div>`;
}
function render() {
  if(!user)return renderAuth();
  const pages={discover, mine:()=>collection('mine'),following:()=>collection('following'),book:cookbookPage,recipe:recipePage,friends:friendsPage,search:searchPage,profile:profilePage,shopping:shoppingPage};
  touch(); resetPhotoQueue();
  app.innerHTML=shell((pages[view]||discover)());
  entering=false;
  hydratePhotos(app);
  if(DESIGN_PREVIEW)app.inert=true;
}
function optionList(values, current) { return values.map(value=>`<option value="${esc(value)}" ${value===current?'selected':''}>${esc(value)}</option>`).join(''); }
function openDialog(title, content, actions='') { dialog.innerHTML=`<div class="dialog-header"><div><span class="eyebrow">A LITTLE SOMETHING FOR OUR KITCHEN</span><h2 id="dialog-title">${title}</h2></div><button class="icon-button" data-action="close-dialog" aria-label="Close dialog">${icon('close')}</button></div>${content}${actions}`;if(!dialog.open)dialog.showModal(); }
function openBookEditor(id='') {
  const book=bookById(id);
  openDialog(book?'A new note on the cover.':'Every good story starts here.',`<form id="book-form" data-id="${id}"><div class="dialog-content form-grid"><label class="form-field wide">Cookbook name<input name="name" required maxlength="100" placeholder="e.g. Our Sunday table" value="${esc(book?.name)}" autofocus></label><label class="form-field wide">A little about your cookbook<textarea name="description" maxlength="600" placeholder="The recipes, rituals and happy accidents we're keeping.">${esc(book?.description)}</textarea></label><label class="form-field">Who can peek inside?<select name="visibility">${optionList(['private','friends','public'],book?.visibility||'private')}</select><small>Private: you and invited editors. Friends: accepted friends. Public: anyone in the club.</small></label><label class="form-field">Cover colour<select name="coverColor">${optionList(['rose','olive','ochre','terracotta'],book?.coverColor||'rose')}</select></label>${!book?'<label class="form-field wide">Invite your partner (optional username)<input name="partner" maxlength="30" placeholder="Their username, once they have an account"><small>They’ll accept an invitation before they can add recipes.</small></label>':''}<p class="form-error wide" role="alert" hidden></p></div><div class="dialog-actions"><button type="button" class="button" data-action="close-dialog">Cancel</button>${book?`<button type="button" class="button danger" data-action="delete-book" data-id="${book.id}">Delete cookbook</button>`:''}<button class="button primary" type="submit">${book?'Save cookbook':'Create our cookbook'}</button></div></form>`);
}
function ingredientRow(i={},index=0) {
  const unit=i.unit||'g', mass=!!GRAMS_PER_UNIT[unit];
  return `<div class="ingredient-row" data-original="${esc(JSON.stringify(i))}"><label class="form-field">Ingredient<input data-ingredient="name" required maxlength="120" aria-label="Ingredient ${index+1}" placeholder="e.g. Cherry tomatoes" value="${esc(i.name)}"></label><label class="form-field">Amount<input type="number" data-ingredient="quantity" required min="0.001" max="1000000" step="any" aria-label="Amount ${index+1}" value="${esc(i.quantity)}"></label><label class="form-field">Unit<select data-ingredient="unit" aria-label="Unit ${index+1}">${optionList(UNITS,unit)}</select></label><label class="form-field">Preparation<input data-ingredient="note" maxlength="200" aria-label="Preparation ${index+1}" placeholder="optional" value="${esc(i.note)}"></label><button type="button" class="icon-button" data-action="remove-ingredient" aria-label="Remove ingredient ${index+1}">${icon('close')}</button><details class="ingredient-calories"><summary>Optional calories</summary><label class="form-field"><span data-calorie-label>${mass?'kcal per 100 g':`kcal per ${esc(unit)}`}</span><input data-ingredient="calories" type="number" min="0" max="${mass?1000:100000}" step="any" value="${esc(mass?i.kcalPer100g:i.kcalPerUnit)}" aria-label="Calories ${index+1}"></label></details></div>`;
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
  openDialog(draft.id?'A recipe, with your touch.':'One worth keeping.',`<form id="recipe-form" data-id="${draft.id||''}"><div class="dialog-content"><div class="import-box"><span class="eyebrow">BRING A RECIPE HOME</span><div class="inline-form"><label class="form-field"><span class="visually-hidden">Recipe link</span><input id="import-url" type="url" placeholder="Paste a recipe link…" maxlength="2000"></label><button type="button" class="button" data-action="import-url">Import link</button></div><details><summary>Or paste recipe text</summary><label class="form-field"><span class="visually-hidden">Pasted recipe text</span><textarea id="import-text" maxlength="120000" placeholder="Recipe name\nIngredients\n…\nInstructions\n…"></textarea></label><button type="button" class="button small" data-action="import-text">Clean up recipe</button></details><p id="import-status" class="muted" role="status"></p></div>${draft.warnings?.length?`<details class="notice"><summary>Review ${draft.warnings.length} import notes</summary><ul>${draft.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></details>`:''}<div class="form-grid"><label class="form-field wide">Recipe name<input name="title" required maxlength="120" placeholder="e.g. Sunday tomato pasta" value="${esc(draft.title)}"></label><label class="form-field wide">A short kitchen note<textarea name="description" maxlength="600" placeholder="Why we love it, or where it came from.">${esc(draft.description)}</textarea></label><label class="form-field">Cookbook<select name="cookbookId" ${draft.id?'disabled':''}>${ownBooks().map(b=>`<option value="${b.id}" ${b.id===draft.cookbookId?'selected':''}>${esc(b.name)}</option>`).join('')}</select></label><label class="form-field">Meal<select name="category">${optionList(CATEGORIES,draft.category)}</select></label><label class="form-field">Main ingredient<select name="meatType">${optionList(meats,draft.meatType||'Other')}</select></label><label class="form-field">Servings<input name="servings" type="number" required min="1" max="100" step="1" value="${draft.servings}"></label><label class="form-field">Time (minutes)<input name="minutes" type="number" required min="1" max="1440" step="1" value="${draft.minutes}"></label><label class="form-field">Labels, separated by commas<input name="tags" maxlength="300" placeholder="comfort food, quick, date night" value="${esc((draft.tags||[]).join(', '))}"></label></div><section class="form-section"><div class="section-head"><h3>A photo for the page</h3><button type="button" class="text-button" data-action="remove-photo">Remove photo</button></div><div id="photo-preview" class="editor-photo">${image?`<img src="${esc(image)}" alt="Recipe photo preview">`:`<span>${icon('camera')}A little glimpse of the good stuff.</span>`}</div><label class="button small photo-upload">${icon('camera')}Choose a photo<input id="photo-file" type="file" accept="image/jpeg,image/png,image/webp"></label><p id="photo-status" class="muted" role="status">A recipe link can bring its main photo along. Or add your own JPG, PNG or WebP.</p></section><section class="form-section"><div class="section-head"><h3>Ingredients</h3><button type="button" class="button small" data-action="add-ingredient">${icon('plus')}Add ingredient</button></div><p class="muted form-hint">Use consistent names to combine ingredients in your shopping list. Automatic calorie estimates are paused for now. Values from the recipe’s source or your own entries are kept.</p><div id="ingredient-rows">${draft.ingredients.map(ingredientRow).join('')}</div></section><section class="form-section"><div class="section-head"><h3>How to make it</h3><button type="button" class="button small" data-action="add-step">${icon('plus')}Add step</button></div><div id="step-rows">${draft.instructions.map(stepRow).join('')}</div></section><p class="form-error" role="alert" hidden></p></div><div class="dialog-actions"><button type="button" class="button" data-action="close-dialog">Cancel</button>${draft.id?`<button type="button" class="button danger" data-action="delete-recipe" data-id="${draft.id}">Delete recipe</button>`:''}<button class="button primary" type="submit">${icon('check')}Save recipe</button></div></form>`);
}
function readRecipeDraft() {
  const form=$('#recipe-form'), values=new FormData(form);
  const ingredients=$$('.ingredient-row',form).map(row=>{
    const val=key=>$(`[data-ingredient="${key}"]`,row).value;
    const unit=val('unit'), calories=val('calories')===''?null:Number(val('calories'));
    const original=JSON.parse(row.dataset.original||'{}');
    return {name:val('name').trim(),quantity:val('quantity')===''?null:Number(val('quantity')),unit,note:val('note').trim(),kcalPer100g:GRAMS_PER_UNIT[unit]?calories:null,kcalPerUnit:GRAMS_PER_UNIT[unit]?null:calories,nutritionMatch:original.name===val('name')&&original.unit===unit?original.nutritionMatch:null};
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
  try {const imported=await store.importRecipe(input);if(!button.isConnected)return;await openRecipeEditor(draft.id||'',current.cookbookId,imported);}
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
    draft.imageId=result.imageId;await loadPhoto(draft.imageId);$('#photo-preview').innerHTML=`<img src="${esc(photoSrc(draft))}" alt="Recipe photo preview">`;status.textContent='Photo ready. Save the recipe to keep it.';
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

async function mutate(path,method,input) {const result=await store.mutate(path,method,input);touch();return result;}
async function afterMutation(){searchResult=null;if(!store.demo)await loadFeed(false);render();}
function formError(form,message){const field=$('.form-error',form);if(field){field.textContent=message;field.hidden=false;}else notify(message);}
async function submitForm(event){
  event.preventDefault();if(DESIGN_PREVIEW)return;const form=event.target,values=new FormData(form),button=$('button[type="submit"]',form);if(button)button.disabled=true;
  const error=$('.form-error',form);if(error)error.hidden=true;
  try{
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
      dialog.close();await afterMutation();nav('book',book.id||id);notify(invitationError?`Cookbook saved. Partner invite: ${invitationError}`:id?'Cookbook updated.':'Your cookbook is ready for its first recipe.');
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
    }else if(form.id==='profile-form'){
      await mutate('/profile','PUT',{username:values.get('username').trim().toLowerCase(),displayName:values.get('displayName').trim(),bio:values.get('bio').trim()});dialog.close();await afterMutation();notify('Your profile is updated.');
    }
  }catch(problem){formError(form,problem.message);}finally{if(button)button.disabled=false;}
}
function renderAuth(message=''){
  app.innerHTML=`<main class="auth-shell"><section class="auth-art"><div class="brand auth-brand">${icon('leaf')}<span>${esc(APP_NAME)}</span></div><span class="eyebrow">A COOKBOOK FOR US</span><h1>A little love.<br>A little joy.<br>A place for our recipes.</h1><p>For the dinners that become traditions,<br>and the people who make them special.</p>${herbDrawing()}<span class="handwritten">good food tastes better together</span></section><section class="auth-card"><div class="auth-tabs"><button class="${authMode==='login'?'active':''}" data-auth-mode="login">Welcome back</button><button class="${authMode==='signup'?'active':''}" data-auth-mode="signup">Join the table</button></div><span class="eyebrow">${authMode==='signup'?'THERE’S A PLACE FOR YOU':'YOUR KITCHEN IS WAITING'}</span><h2>${authMode==='signup'?'Start a new tradition.':'Come on in.'}</h2><p class="muted">${authMode==='signup'?'Create your account. Invite your person. Share what you love.':'Sign in to your recipes, your people, and a little inspiration.'}</p>${message?`<p class="notice">${esc(message)}</p>`:''}<form id="auth-form">${authMode==='signup'?'<label class="form-field">Your name<input name="displayName" required maxlength="80" autocomplete="name" placeholder="The name at your table"></label><label class="form-field">Username<input name="username" required pattern="[a-z0-9_]{3,30}" maxlength="30" autocomplete="username" placeholder="e.g. flourandflowers"><small>3–30 lowercase letters, numbers or underscores.</small></label>':''}<label class="form-field">Email<input name="email" type="email" required maxlength="254" autocomplete="email" placeholder="you@example.com"></label><label class="form-field">Password<input name="password" type="password" minlength="8" maxlength="128" required autocomplete="${authMode==='signup'?'new-password':'current-password'}" placeholder="At least 8 characters"></label><p class="form-error" role="alert" hidden></p><button type="submit" class="button primary full">${authMode==='signup'?'Create my account':'Sign in'}${icon('arrow')}</button></form>${!configured?'<p class="notice">The local preview uses sample people and cookbooks. Real accounts require your Supabase project.</p><button class="button full" data-action="enter-demo">Explore the preview kitchen</button>':''}</section></main>`;
}
async function enterDemo(){store=await createDemoStore({loadDemoData,notify});view='discover';await loadFeed();}
async function bootstrap(){
  if(DESIGN_PREVIEW){
    store=await createDemoStore({loadDemoData,preview:true});applyLoaded(await store.loadFeed());
    view=new URLSearchParams(location.search).get('designPreview')==='recipe'?'recipe':'discover';selectedId=view==='recipe'?'demo-lemon-chicken':'';servings=recipeById(selectedId)?.servings||2;render();return;
  }
  try{const config=await http.config();configured=!!config.configured;
    if(!configured){await enterDemo();return;}
    store=http;
    if(!http.restoreSession()){user=null;renderAuth();return;}
    await loadFeed();
  }catch(error){if(error.status===401){http.dropSession();user=null;renderAuth('Your session expired. Sign in to return to your kitchen.');}else{app.innerHTML=empty('We couldn’t open the kitchen.',esc(error.message),'<button class="button" data-action="retry">Try again</button>');}}
}
function downloadShoppingList(){const rows=shoppingList(feed.recipes,planner.cart);const text=[`${APP_NAME.toLocaleUpperCase()} — OUR SHOPPING LIST`,bookById(plannerBook)?.name||'', '',...rows.map(row=>`${planner.checked[checkKey(row)]===true?'[x]':'[ ]'} ${displayAmount(row.quantity,row.unit)} ${row.name}${row.notes.length?' · '+row.notes.join('; '):''}`)].join('\n');const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='our-shopping-list.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
document.addEventListener('submit',submitForm);
document.addEventListener('click',async event=>{
  if(DESIGN_PREVIEW)return;
  const auth=event.target.closest('[data-auth-mode]');if(auth){authMode=auth.dataset.authMode;renderAuth();return;}
  const navigation=event.target.closest('[data-view]');if(navigation){if(navigation.dataset.view==='shopping'&&ownBooks().length){try{await getPlan(plannerBook||ownBooks()[0]?.id);}catch(error){notify(error.message);return;}}nav(navigation.dataset.view);return;}
  const button=event.target.closest('[data-action]');if(!button||button.disabled)return;const action=button.dataset.action,id=button.dataset.id;
  try{
    if(action==='book'){await hydrateBook(id);nav('book',id);}
    else if(action==='recipe')nav('recipe',id);
    else if(action==='profile')nav('profile',id);
    else if(action==='new-book')openBookEditor();
    else if(action==='appearance')openDialog('Make this kitchen yours.',`<div class="dialog-content"><div class="palette-options">${PALETTES.map(palette=>`<button class="palette-option" data-action="choose-palette" data-id="${palette.id}" data-palette-card="${palette.id}" aria-pressed="${document.documentElement.dataset.palette===palette.id}"><span class="palette-swatches">${palette.colors.map((color,index)=>`<span data-swatch="${index}" aria-label="${esc(color.name)} ${color.hex}"></span>`).join('')}</span><strong>${esc(palette.name)}</strong><small>${esc(palette.description)}</small></button>`).join('')}</div><p class="form-hint">Your choice is remembered on this device.</p><a class="text-button" href="/designs.html">Compare all three designs →</a></div>`);
    else if(action==='choose-palette'){applyPalette(id,true);dialog.close();notify('Your kitchen has a new style.');}
    else if(action==='edit-book')openBookEditor(id);
    else if(action==='add-recipe')await openRecipeEditor('',id);
    else if(action==='edit-recipe')await openRecipeEditor(id);
    else if(action==='close-dialog')dialog.close();
    else if(action==='retry')await bootstrap();
    else if(action==='show-auth'){user=null;renderAuth();}
    else if(action==='enter-demo')await enterDemo();
    else if(action==='logout'){if(!store.demo){await store.signOut();photoEpoch++;photoQueue.length=0;photoFailed.clear();for(const src of photoCache.values())URL.revokeObjectURL(src);photoCache.clear();}user=null;renderAuth();}
    else if(action==='follow'){button.disabled=true;await mutate(`/cookbooks/${id}/follow`,followExists(id)?'DELETE':'PUT',{});await afterMutation();}
    else if(action==='add-friend'){button.disabled=true;await mutate('/friends','POST',{username:person(id).username});await afterMutation();notify('Friend request sent.');}
    else if(action==='accept-friend'){button.disabled=true;await mutate(`/friends/${id}/accept`,'POST',{});await afterMutation();notify('A new friend at your table.');}
    else if(action==='accept-invite'){button.disabled=true;await mutate(`/invitations/${id}/accept`,'POST',{});await afterMutation();notify('Welcome to your shared cookbook.');}
    else if(action==='invite')openDialog('Two cooks. One cookbook.',`<form id="invite-form" data-id="${id}"><div class="dialog-content"><p class="muted">Invite your partner by username. Once they accept, you can both add and edit recipes in this cookbook.</p><label class="form-field">Partner’s username<input name="username" required maxlength="30" placeholder="Their username"></label><p class="form-error" role="alert" hidden></p></div><div class="dialog-actions"><button type="button" class="button" data-action="close-dialog">Cancel</button><button type="submit" class="button primary">Send invitation</button></div></form>`);
    else if(action==='reply')openDialog('A note back.',`<form id="reply-form" data-id="${id}"><div class="dialog-content"><label class="form-field">Your reply<textarea name="comment" required maxlength="2000" placeholder="Thank you, a little tip, or a question…"></textarea></label><p class="form-error" role="alert" hidden></p></div><div class="dialog-actions"><button type="button" class="button" data-action="close-dialog">Cancel</button><button type="submit" class="button primary">Share reply</button></div></form>`);
    else if(action==='delete-review'){openDialog('Remove your kitchen note?',`<div class="dialog-content"><p>Your rating and its conversation will be removed.</p></div><div class="dialog-actions"><button class="button" data-action="close-dialog">Keep it</button><button class="button danger" data-action="confirm-delete-review" data-id="${id}">Remove my review</button></div>`);}
    else if(action==='confirm-delete-review'){await mutate(`/recipes/${id}/review`,'DELETE');dialog.close();await afterMutation();}
    else if(action==='delete-recipe'||action==='delete-book'){
      const book=action==='delete-book';openDialog(book?'Close this cookbook for good?':'Remove this recipe?',`<div class="dialog-content"><p>${book?'The cookbook, its recipes, reviews and conversations will be permanently removed.':'This recipe and its reviews will be permanently removed.'}</p></div><div class="dialog-actions"><button class="button" data-action="close-dialog">Keep it</button><button class="button danger" data-action="confirm-delete" data-kind="${book?'cookbooks':'recipes'}" data-id="${id}">Yes, delete ${book?'cookbook':'recipe'}</button></div>`);
    }
    else if(action==='confirm-delete'){const kind=button.dataset.kind;await mutate(`/${kind}/${id}`,'DELETE');dialog.close();await afterMutation();nav('mine');notify('Removed from your cookbook.');}
    else if(action==='reset-search'){search='';category='';meatType='';tag='';nav('search');}
    else if(action==='import-url'||action==='import-text')await doImport(action==='import-url'?'url':'text',button);
    else if(action==='add-ingredient'){if($$('.ingredient-row',dialog).length>=100)return notify('A recipe can have up to 100 ingredients.');$('#ingredient-rows').insertAdjacentHTML('beforeend',ingredientRow({},$$('.ingredient-row',dialog).length));}
    else if(action==='remove-ingredient'){if($$('.ingredient-row',dialog).length<=1)return notify('Keep at least one ingredient.');button.closest('.ingredient-row').remove();}
    else if(action==='add-step'){if($$('.step-row',dialog).length>=100)return notify('A recipe can have up to 100 steps.');$('#step-rows').insertAdjacentHTML('beforeend',stepRow('',$$('.step-row',dialog).length));}
    else if(action==='remove-step'){if($$('.step-row',dialog).length<=1)return notify('Keep at least one step.');button.closest('.step-row').remove();}
    else if(action==='remove-photo'){draft.imageId='';$('#photo-preview').innerHTML=`<span>${icon('camera')}A little glimpse of the good stuff.</span>`;}
    else if(action==='plan'){button.disabled=true;await planRecipe(id);}
    else if(action==='save-copy')openCopyRecipe(id);
    else if(action==='unplan')await changePlan(state=>{state.cart=state.cart.filter(e=>e.recipeId!==id);});
    else if(action==='download-list')downloadShoppingList();
    else if(action==='edit-profile')openDialog('The cook behind the pages.',`<form id="profile-form"><div class="dialog-content form-grid"><label class="form-field wide">Display name<input name="displayName" required maxlength="80" value="${esc(displayName(profile))}"></label><label class="form-field wide">Username<input name="username" required maxlength="30" pattern="[a-z0-9_]{3,30}" value="${esc(profile.username)}"></label><label class="form-field wide">About your kitchen<textarea name="bio" maxlength="500">${esc(profile.bio)}</textarea></label><p class="form-error" hidden role="alert"></p></div><div class="dialog-actions"><button type="button" class="button" data-action="close-dialog">Cancel</button><button type="submit" class="button primary">Save profile</button></div></form>`);
  }catch(error){notify(error.message);if(error.status===401&&!store.demo){store.dropSession();user=null;renderAuth('Sign in to continue.');}}
  finally{if(button.isConnected)button.disabled=false;}
});
let searchTimer;
document.addEventListener('input',event=>{if(DESIGN_PREVIEW)return;if(event.target.id==='global-search'){search=event.target.value;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{view='search';renderMain(searchPage);$$('.nav-link').forEach(link=>link.classList.remove('active'));runSearch();},180);}});
document.addEventListener('keydown',event=>{if(DESIGN_PREVIEW)return;if(event.target.id==='global-search'&&event.key==='Enter'){clearTimeout(searchTimer);nav('search');$('#global-search')?.focus();}});
document.addEventListener('change',async event=>{
  if(DESIGN_PREVIEW)return;
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
dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const bounds=dialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)dialog.close();});
// Background refresh. Re-render only when something actually changed, so an
// idle page keeps its scroll position, open details and loaded images.
const feedSignature=()=>JSON.stringify([feed.profiles,feed.cookbooks,feed.recipes,feed.friendships,feed.follows,feed.reviews,feed.replies,feed.memberships,view==='shopping'?planner:null]);
setInterval(async()=>{if(DESIGN_PREVIEW||store.demo||!user||dialog.open||document.visibilityState!=='visible')return;try{const focused=document.activeElement?.tagName;if(['INPUT','TEXTAREA','SELECT'].includes(focused))return;const before=feedSignature();await loadFeed(false);if(view==='shopping'&&plannerBook)await getPlan(plannerBook);if(feedSignature()!==before)render();}catch{}},30000);
await bootstrap();
