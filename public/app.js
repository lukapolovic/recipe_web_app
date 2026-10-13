import { nutritionFor, shoppingList, displayAmount } from './recipe-math.js';
import { CATEGORIES as categories, UNITS, GRAMS_PER_UNIT } from './recipe-config.js';

const $ = (selector, context = document) => context.querySelector(selector);
const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const diets = ['None', 'Vegetarian', 'Vegan', 'Gluten-free'];
const main = $('#main');
const detail = $('#recipe-dialog');
const editor = $('#editor-dialog');
const importer = $('#import-dialog');
let editorOriginal = null;
const storageKey = 'pantry-planner-v1';
let recipes = [], cart = [], checked = {}, view = 'recipes', category = '', query = '';
let detailId = null, detailServings = 1, editingId = null, toastTimer;
let loadError = '';
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
  cart = Array.isArray(saved.cart) ? saved.cart.filter(e => Number.isSafeInteger(e?.recipeId) && e.recipeId > 0 && Number.isInteger(e.servings) && e.servings > 0 && e.servings <= 100).filter((e, index, rows) => rows.findIndex(r => r.recipeId === e.recipeId) === index) : [];
  checked = saved.checked && typeof saved.checked === 'object' && !Array.isArray(saved.checked) ? saved.checked : {};
} catch { /* A damaged or unavailable browser store should not prevent loading recipes. */ }

function notify(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}
function persist() {
  // Quantity is included in the checked state so changed amounts become unchecked.
  const current = new Map(shoppingList(recipes, cart).map(row => [row.key, row.quantity]));
  checked = Object.fromEntries(Object.entries(checked).filter(([key, quantity]) => current.get(key) === quantity));
  try { localStorage.setItem(storageKey, JSON.stringify({ cart, checked })); }
  catch { notify('Browser storage is unavailable. Your meal cart will last for this session.'); }
}
async function api(path, options = {}) {
  let response;
  try { response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } }); }
  catch { throw new Error('Cannot reach the recipe server. Check that it is running, then try again.'); }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request failed. Please try again.');
  return result;
}
async function load() {
  try {
    recipes = await api('/api/recipes');
    loadError = '';
    cart = cart.filter(e => recipes.some(r => r.id === e.recipeId));
    persist();
  } catch (error) { loadError = error.message; }
  render();
}
function setView(next) {
  view = next;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function navigation() {
  for (const button of $$('[data-view]')) {
    button.classList.toggle('active', button.dataset.view === view);
    if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  const count = $('#shopping-count');
  count.textContent = cart.length;
  count.hidden = cart.length === 0;
}
function hero(shopping = false) {
  return `<section class="hero"><div><div class="eyebrow">${shopping ? 'FROM YOUR KITCHEN TO THE STORE' : 'A HOME FOR YOUR EVERYDAY FAVOURITES'}</div><h1>${shopping ? 'A little list. All you need.' : 'Your recipe collection.'}</h1><p>${shopping ? 'Everything for your planned meals, brought together in one place.' : 'Save what you love. Plan a few meals. Make shopping simple.'}</p></div><div class="hero-note">${icon('leaf')}<span>Good food starts<br>with a little inspiration.</span></div></section>`;
}
function dishArt(recipe) {
  const breakfast = recipe.category === 'Breakfast' || recipe.category === 'Snack';
  const marks = breakfast
    ? '<circle cx="75" cy="54" r="9" fill="#8c86a4"/><circle cx="96" cy="66" r="10" fill="#767397"/><circle cx="104" cy="46" r="8" fill="#a79ab3"/><circle cx="65" cy="75" r="8" fill="#7d789a"/><circle cx="94" cy="87" r="7" fill="#9990aa"/><path d="m57 53 7-4m15 19 7 3m25 8 5-6M78 90l-6-5m33-54 6 3" stroke="#d5b997" stroke-width="5"/>'
    : '<path d="M59 49q30-19 54 8M55 64q23-14 56 4M62 80q26-17 51 2M77 39q-15 25-4 48M95 39q-15 30-1 52" stroke="#d6b36f" stroke-width="7" fill="none"/><circle cx="106" cy="49" r="9" fill="#bd7158"/><circle cx="63" cy="75" r="8" fill="#ca8163"/><path d="M82 49q-12-22-19-8 7 13 19 8M103 82q19-1 15-13-13-2-15 13M66 60q-17-4-18 8 10 8 18-8" fill="#82966c"/>';
  return `<svg class="dish-art" viewBox="0 0 180 135" aria-hidden="true"><ellipse cx="86" cy="68" rx="62" ry="54" fill="#fffdf5"/><ellipse cx="86" cy="68" rx="49" ry="42" fill="#efe9d6"/><ellipse cx="86" cy="68" rx="44" ry="37" fill="#e4ddc5"/>${marks}<path d="M157 27v81m-7-81v21q7 9 14 0V27M168 27v21" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" opacity=".6"/></svg>`;
}
function card(recipe) {
  const inCart = cart.some(e => e.recipeId === recipe.id);
  const nutrition = nutritionFor(recipe);
  const calorieLabel = nutrition.known ? `${Math.round(nutrition.perServing)} kcal${nutrition.source === 'website' ? ' · source' : nutrition.complete ? '' : ' · partial'}` : 'Calories not added';
  return `<article class="recipe-card"><button class="card-art ${escape(recipe.color)}" data-action="detail" data-id="${recipe.id}" aria-label="Open ${escape(recipe.title)}"><span class="art-label">${escape(recipe.category)}</span>${dishArt(recipe)}${recipe.diet !== 'None' ? `<span class="diet-label">${icon('leaf')}${escape(recipe.diet)}</span>` : ''}</button><div class="card-body"><h3><button class="recipe-title" data-action="detail" data-id="${recipe.id}">${escape(recipe.title)}</button></h3><p class="card-description">${escape(recipe.description || 'A recipe from your personal collection.')}</p><div class="card-meta"><span>${icon('clock')}${recipe.minutes} min</span><span>${icon('users')}${recipe.servings} servings</span><span>${recipe.ingredients.length} ingredients</span></div><div class="card-footer"><span class="calorie-label" title="${nutrition.known ? nutrition.source === 'website' ? 'Per-serving estimate from the original recipe website.' : `Per serving; calorie values available for ${nutrition.known} of ${nutrition.count} ingredients.` : 'Add kcal per 100 g when editing ingredients.'}">${calorieLabel}</span><button class="add-meal" data-action="add-cart" data-id="${recipe.id}">${icon(inCart ? 'check' : 'plus')}${inCart ? 'In meal cart' : 'Plan this meal'}</button></div></div></article>`;
}
function cartPanel() {
  const valid = cart.map(entry => ({ ...entry, recipe: recipes.find(r => r.id === entry.recipeId) })).filter(e => e.recipe);
  return `<aside class="cart-panel" aria-label="Meal cart"><div class="cart-head"><div><div class="eyebrow">YOUR MEAL CART</div><h2>On the menu</h2></div><span class="cart-symbol">${icon('bag')}</span></div>${valid.length ? `<div class="cart-items">${valid.map(e => `<div class="cart-item"><div class="cart-item-head"><span class="cart-item-title">${escape(e.recipe.title)}</span><button class="icon-button" data-action="remove-cart" data-id="${e.recipeId}" aria-label="Remove ${escape(e.recipe.title)} from meal cart">${icon('close')}</button></div><div class="cart-item-controls"><span>Servings</span>${stepper(e.servings, 'cart', e.recipeId, e.recipe.title)}</div></div>`).join('')}</div>` : `<div class="cart-empty"><div class="empty-bag">${icon('bag')}</div><h3>What's cooking?</h3><p>Add a few recipes to your meal cart.<br>We'll take care of the shopping list.</p></div>`}<div class="cart-bottom">${valid.length ? `<div class="cart-summary"><span>${valid.length} ${valid.length === 1 ? 'recipe' : 'recipes'} planned</span><button class="text-button" data-action="clear-cart">Clear cart</button></div><button class="button primary full" data-action="shopping">${view === 'shopping' ? 'Back to recipes' : 'Make shopping list'}${icon('arrow')}</button><p>Adjust servings. Ingredients update for you.</p>` : `<p>One list. Fewer trips. Less guesswork.</p>`}</div></aside>`;
}
function stepper(servings, target, id, label) {
  return `<div class="stepper"><button data-action="serving" data-target="${target}" data-id="${id}" data-delta="-1" aria-label="Fewer servings for ${escape(label)}" ${servings <= 1 ? 'disabled' : ''}>−</button><input type="number" min="1" max="100" step="1" value="${servings}" data-serving="${target}" data-id="${id}" aria-label="Servings for ${escape(label)}"><button data-action="serving" data-target="${target}" data-id="${id}" data-delta="1" aria-label="More servings for ${escape(label)}" ${servings >= 100 ? 'disabled' : ''}>+</button></div>`;
}
function filteredRecipes() {
  const search = query.trim().toLocaleLowerCase('en');
  return recipes.filter(recipe => (!category || recipe.category === category) && (!search || [recipe.title, recipe.description, ...recipe.ingredients.map(i => i.name)].some(text => text.toLocaleLowerCase('en').includes(search)))).sort((a, b) => b.id - a.id);
}
function collectionResults() {
  const result = filteredRecipes();
  $('#results-heading').innerHTML = `All recipes <span class="result-count">${result.length}${result.length !== recipes.length ? ` of ${recipes.length}` : ''}</span>`;
  $('#recipe-grid').innerHTML = result.length ? result.map(card).join('') : recipes.length ? `<div class="empty-state"><div class="empty-bag">${icon('search')}</div><h2>No recipes found.</h2><p>Try another ingredient or meal type.</p><button class="button" data-action="reset-filters">Clear search & filters</button></div>` : `<div class="empty-state"><div class="empty-bag">${icon('book')}</div><div class="eyebrow">MAKE YOURSELF AT HOME</div><h2>Your next favourite belongs here.</h2><p>Start with a recipe you love, or try a small collection of examples to see how it all works.</p><div class="empty-actions"><button class="button primary" data-action="new">${icon('plus')}Add your first recipe</button><button class="button" data-action="examples">Load examples</button></div></div>`;
}
function render() {
  navigation();
  if (loadError) {
    main.innerHTML = `${hero()}<div class="empty-state"><h2>Couldn't open your recipe book.</h2><p>${escape(loadError)}</p><button class="button primary" data-action="retry">Try again</button></div>`;
    return;
  }
  if (view === 'shopping') return renderShopping();
  main.innerHTML = `${hero()}<div class="workspace"><section aria-label="Recipe collection"><div class="search-row"><label class="search-input">${icon('search')}<span class="visually-hidden">Search recipes or ingredients</span><input id="search" type="search" maxlength="200" placeholder="Search a recipe or an ingredient…" value="${escape(query)}"></label></div><div class="chips" aria-label="Filter by meal"><button class="chip ${!category ? 'active' : ''}" data-category="" aria-pressed="${!category}">All recipes</button>${categories.map(c => `<button class="chip ${category === c ? 'active' : ''}" data-category="${c}" aria-pressed="${category === c}">${c}</button>`).join('')}</div><div class="collection-heading"><h2 id="results-heading"></h2></div><div class="recipe-grid" id="recipe-grid"></div>${recipes.length ? '<p class="examples-note">Recipes live in your local database. Your meal cart is saved in this browser.</p>' : ''}</section>${cartPanel()}</div>`;
  collectionResults();
}
function renderShopping() {
  const rows = shoppingList(recipes, cart);
  const done = rows.filter(row => checked[row.key] === row.quantity).length;
  main.innerHTML = `${hero(true)}<div class="shopping-layout"><section class="shopping-paper" aria-label="Shopping list">${rows.length ? `<div class="shopping-toolbar"><div><h2>Your shopping list</h2><p id="shopping-progress" aria-live="polite">${done} of ${rows.length} items checked · ${cart.length} planned ${cart.length === 1 ? 'recipe' : 'recipes'}</p></div><div class="shopping-tools"><button class="button small" data-action="download">${icon('download')}Save list</button><button class="button small" data-action="print">Print</button></div></div><div class="shopping-items">${rows.map((row, index) => `<label class="shopping-row ${checked[row.key] === row.quantity ? 'checked' : ''}"><input type="checkbox" data-check="${index}" ${checked[row.key] === row.quantity ? 'checked' : ''}><span class="shopping-name">${escape(row.name)}<small>${escape([...row.notes, `For ${row.recipes.join(' · ')}`].join(' · '))}</small></span><span class="shopping-amount">${displayAmount(row.quantity, row.unit)}</span></label>`).join('')}</div><p class="shopping-footnote">Matching ingredient names are combined, ignoring case and extra spaces. Weight and volume units are converted automatically; other units stay separate. Check your pantry before you shop.</p><button class="text-button" data-action="uncheck">Uncheck all items</button>` : `<div class="empty-state"><div class="empty-bag">${icon('bag')}</div><h2>Good meals start with a plan.</h2><p>Add a recipe to your meal cart, choose your servings, and your shopping list will be ready here.</p><button class="button primary" data-action="recipes">Explore recipes${icon('arrow')}</button></div>`}</section>${cartPanel()}</div>`;
}
function refreshCart() {
  persist();
  if (view === 'shopping') renderShopping();
  else {
    const panel = $('.cart-panel');
    if (panel) panel.outerHTML = cartPanel();
    if ($('#recipe-grid')) collectionResults();
  }
  navigation();
}
function addToCart(id, servings) {
  const recipe = recipes.find(r => r.id === id);
  if (!recipe) return;
  const existing = cart.find(e => e.recipeId === id);
  if (existing && servings == null) { notify('Already in your meal cart. Adjust servings in “On the menu”.'); return; }
  if (existing) existing.servings = servings;
  else cart.push({ recipeId: id, servings: servings ?? recipe.servings });
  refreshCart();
  notify(`${recipe.title} ${existing ? 'updated in' : 'added to'} your meal cart.`);
}
function showDetail(id, servings) {
  const recipe = recipes.find(r => r.id === id);
  if (!recipe) return;
  detailId = id;
  detailServings = servings ?? cart.find(e => e.recipeId === id)?.servings ?? recipe.servings;
  const nutrition = nutritionFor(recipe, detailServings);
  detail.innerHTML = `<div class="dialog-header"><div><div class="eyebrow">${escape(recipe.category)}${recipe.diet !== 'None' ? ` · ${escape(recipe.diet)}` : ''}</div><h2 id="dialog-title">${escape(recipe.title)}</h2><p>${escape(recipe.description)}</p></div><button class="icon-button" data-action="close-detail" aria-label="Close recipe">${icon('close')}</button></div><div class="dialog-content"><div class="detail-summary"><span>${icon('clock')}${recipe.minutes} min</span><span>${icon('users')}Servings</span>${stepper(detailServings, 'detail', id, recipe.title)}<span>Original recipe: ${recipe.servings}</span></div><div class="detail-columns"><section><h3>Ingredients</h3><ul class="ingredients-list">${recipe.ingredients.map(i => `<li><span>${escape(i.name)}${i.note ? `<span class="ingredient-note">${escape(i.note)}</span>` : ''}</span><span class="ingredient-amount">${displayAmount(i.quantity * detailServings / recipe.servings, i.unit)}</span></li>`).join('')}</ul></section><section><h3>Let's make it</h3><ul class="instructions-list">${recipe.instructions.map(step => `<li>${escape(step)}</li>`).join('')}</ul></section></div><div class="nutrition-note">${nutritionExplanation(recipe, detailServings)}${recipe.sourceUrl ? `<p class="recipe-source"><a href="${escape(recipe.sourceUrl)}" target="_blank" rel="noopener noreferrer">Original recipe ↗</a></p>` : ''}</div></div><div class="dialog-actions"><div><button class="button small" data-action="edit" data-id="${id}">${icon('edit')}Edit</button><button class="button small danger" data-action="delete-prompt" data-id="${id}">${icon('trash')}Delete</button></div><button class="button primary" data-action="detail-cart" data-id="${id}">${icon('plus')}${cart.some(e => e.recipeId === id) ? 'Update meal cart' : 'Add to meal cart'}</button></div><div id="delete-confirm" hidden class="danger-confirm"></div>`;
  if (!detail.open) detail.showModal();
}
function options(values, current) { return values.map(value => `<option value="${escape(value)}" ${current === value ? 'selected' : ''}>${escape(value)}</option>`).join(''); }
function ingredientRow(i = {}) {
  const unit = i.unit || 'g';
  const mass = Boolean(GRAMS_PER_UNIT[unit]);
  const value = mass ? i.kcalPer100g : i.kcalPerUnit;
  return `<div class="ingredient-entry"><div class="ingredient-row" data-nutrition="${escape(JSON.stringify(i.nutritionMatch || null))}" data-original-name="${escape(i.name)}" data-original-unit="${unit}"><label>Ingredient<input data-field="name" required maxlength="120" placeholder="e.g. Cherry tomatoes" value="${escape(i.name)}"></label><label>Quantity<input data-field="quantity" type="number" required min="0.001" max="1000000" step="any" placeholder="200" value="${escape(i.quantity)}"></label><label>Unit<select data-field="unit">${options(UNITS, unit)}</select></label><label>Note (optional)<input data-field="note" maxlength="200" placeholder="e.g. diced" value="${escape(i.note)}"></label><label><span data-calorie-label>${mass ? 'kcal / 100 g' : `kcal / ${unit}`}</span><input data-field="calorieValue" type="number" min="0" max="${mass ? 1000 : 100000}" step="any" placeholder="Optional" value="${escape(value)}"></label><button type="button" class="icon-button" data-action="remove-ingredient" aria-label="Remove ingredient">${icon('close')}</button></div>${i.nutritionMatch ? `<p class="match-note">USDA match: ${escape(i.nutritionMatch.description)}${i.nutritionMatch.portion ? ` · ${escape(i.nutritionMatch.portion)}` : ''}. Check this matches your ingredient.</p>` : ''}</div>`;
}

function stepRow(step = '', index = 1) {
  return `<div class="step-row"><span class="step-number" aria-hidden="true">${index}</span><label><span class="visually-hidden">Instruction step ${index}</span><textarea data-field="step" required maxlength="2000" placeholder="What happens next?">${escape(step)}</textarea></label><button type="button" class="icon-button" data-action="remove-step" aria-label="Remove instruction step ${index}">${icon('close')}</button></div>`;
}
function showEditor(id = null, imported = null) {
  const recipe = imported?.recipe || recipes.find(r => r.id === id);
  editorOriginal = recipe ? structuredClone(recipe) : null;
  if (id != null && !recipe) return;
  editingId = id;
  detail.close();
  importer.close();
  editor.innerHTML = `<form id="recipe-form"><div class="dialog-header"><div><div class="eyebrow">YOUR PERSONAL RECIPE BOOK</div><h2 id="editor-title">${imported ? 'Review your imported recipe.' : recipe ? 'Make it your own.' : 'Something worth saving.'}</h2><p>${imported ? 'Just the ingredients and steps. Check the details, then save.' : recipe ? 'Update your recipe and keep the good ideas coming.' : 'Add the ingredients, write down the steps, and call it yours.'}</p></div><button type="button" class="icon-button" data-action="close-editor" aria-label="Close recipe editor">${icon('close')}</button></div><div class="editor-content">${imported ? importNotice(imported) : ''}<div class="form-grid"><label class="form-field wide">Recipe name<input name="title" required maxlength="120" placeholder="e.g. Sunday tomato pasta" value="${escape(recipe?.title)}" autofocus></label><label class="form-field wide">A short description <small>Optional</small><textarea name="description" maxlength="600" placeholder="What makes this one a favourite?">${escape(recipe?.description)}</textarea></label><label class="form-field">Meal type<select name="category">${options(categories, recipe?.category || 'Dinner')}</select></label><label class="form-field">Servings<input name="servings" type="number" min="1" max="100" step="1" required value="${recipe?.servings || 2}"></label><label class="form-field">Time (minutes)<input name="minutes" type="number" min="1" max="1440" step="1" required value="${recipe?.minutes || 30}"><small>Include prep and cooking time.</small></label><label class="form-field">Dietary label<select name="diet">${options(diets, recipe?.diet || 'None')}</select><small>Choose based on your ingredients.</small></label></div><section class="form-section"><div class="section-heading"><h3>Ingredients</h3><button type="button" class="button small" data-action="add-ingredient">${icon('plus')}Add ingredient</button></div><div class="nutrition-tools"><button type="button" class="button small" data-action="estimate">Estimate calories</button><span class="small-note">USDA estimates; review food matches below.</span></div><div id="nutrition-status" class="import-notice" role="status" hidden></div><p class="form-hint">Use consistent names to combine ingredients in your shopping list. Use Estimate calories to look up missing values, or enter them from the label. Weight uses kcal per 100 g; other units use kcal per unit.</p><div id="ingredient-rows">${(recipe?.ingredients || [{}]).map(ingredientRow).join('')}</div></section><section class="form-section"><div class="section-heading"><h3>Instructions</h3><button type="button" class="button small" data-action="add-step">${icon('plus')}Add step</button></div><p class="form-hint">One step at a time. Ingredient amounts will scale; instruction text stays as written.</p><div id="step-rows">${(recipe?.instructions || ['']).map((step, i) => stepRow(step, i + 1)).join('')}</div></section><p id="form-error" class="error-message" role="alert" hidden></p></div><div class="dialog-actions"><button type="button" class="button" data-action="close-editor">Cancel</button><button type="submit" class="button primary" id="save-recipe">${icon('check')}${id != null ? 'Save changes' : 'Save recipe'}</button></div></form>`;
  editor.showModal();
}
function nutritionExplanation(recipe, servings) {
  const nutrition = nutritionFor(recipe, servings);
  const badge = nutrition.known ? `<div class="nutrition-badge"><strong>${Math.round(nutrition.perServing)}</strong> kcal per serving${nutrition.source === 'website' ? ' · source estimate' : nutrition.complete ? ' · estimate' : ' · partial estimate'}</div>` : '';
  const explanation = nutrition.source === 'website' ? 'Published estimate from the original recipe website. Check its serving size.' : nutrition.known ? `Calculated for ${nutrition.known} of ${nutrition.count} ingredients. ${nutrition.complete ? 'Based on the calorie values entered or matched through USDA.' : 'Missing ingredients are excluded; this is not the full calorie total.'}` : 'Calories are not available. Edit this recipe and choose Estimate calories, or enter values from ingredient labels.';
  return `${badge}${nutrition.known ? `${Math.round(nutrition.total)} kcal for ${servings} servings. ` : ''}${explanation} Serving changes scale ingredients; adjust cooking times as needed.`;
}
function importNotice(result) {
  return `<div class="import-notice"><strong>Keep the recipe. Skip the story.</strong><p>Check servings, cooking time and ingredient amounts before saving.${result.recipe.sourceCaloriesPerServing != null ? ' Published calories will be cleared if you change the ingredients or base servings.' : ''}</p>${result.warnings?.length ? `<details><summary>${result.warnings.length} things to review</summary><ul>${result.warnings.map(warning => `<li>${escape(warning)}</li>`).join('')}</ul></details>` : ''}${result.recipe.sourceUrl ? `<a href="${escape(result.recipe.sourceUrl)}" target="_blank" rel="noopener noreferrer">Original recipe ↗</a>` : ''}</div>`;
}
function showImport() {
  importer.innerHTML = `<form id="import-form"><div class="dialog-header"><div><div class="eyebrow">JUST THE GOOD PARTS</div><h2 id="import-title">Bring a recipe home.</h2><p>A link or a little copied text. We'll pull out the ingredients and steps.</p></div><button type="button" class="icon-button" data-action="close-import" aria-label="Close recipe import">${icon('close')}</button></div><div class="dialog-content"><div class="import-tabs" aria-label="Recipe source"><button type="button" class="chip active" data-import-mode="url" aria-pressed="true">From a link</button><button type="button" class="chip" data-import-mode="text" aria-pressed="false">Paste text</button></div><div id="link-fields"><label class="form-field">Recipe link<input name="url" type="url" maxlength="2000" placeholder="https://example.com/your-favourite-recipe" required autofocus></label><p class="form-hint">Some sites block imports. If that happens, use Paste text instead.</p></div><div id="text-fields" hidden><label class="form-field">Recipe text<textarea name="text" maxlength="120000" placeholder="Recipe name
Servings: 2

Ingredients
100 g oats

Instructions
• Mix the ingredients.
• Cook and serve."></textarea></label><p class="form-hint">Include Ingredients and Instructions headings. You can also paste a recipe into our chat and I'll clean it up for you.</p></div><p class="small-note">Calories come from the source recipe when available, otherwise we try USDA ingredient lookup. Missing matches stay marked as incomplete.</p><p id="import-error" class="error-message" role="alert" hidden></p><p id="import-status" role="status" class="small-note" hidden>Reading the recipe and checking calorie values…</p></div><div class="dialog-actions"><button type="button" class="button" data-action="manual">Write manually</button><button type="submit" class="button primary" id="import-submit">Import recipe${icon('arrow')}</button></div></form>`;
  importer.dataset.mode = 'url';
  importer.showModal();
}
async function importRecipe(event) {
  event.preventDefault();
  const mode = importer.dataset.mode;
  const form = event.target;
  const button = $('#import-submit');
  const error = $('#import-error');
  const status = $('#import-status');
  button.disabled = true; error.hidden = true; status.hidden = false;
  const payload = mode === 'url' ? { url: form.elements.url.value.trim() } : { text: form.elements.text.value };
  try {
    const result = await api('/api/import', { method: 'POST', body: JSON.stringify(payload) });
    if (importer.open && $('#import-form') === form) showEditor(null, result);
  } catch (problem) { error.textContent = problem.message; error.hidden = false; }
  finally { button.disabled = false; status.hidden = true; }
}
function readEditor() {
  const form = $('#recipe-form');
  const values = new FormData(form);
  const ingredients = $$('.ingredient-row', form).map(row => {
    const field = name => $(`[data-field="${name}"]`, row);
    const unit = field('unit').value;
    const calories = field('calorieValue').value === '' ? null : Number(field('calorieValue').value);
    const matched = field('name').value === row.dataset.originalName && unit === row.dataset.originalUnit;
    return { name: field('name').value, quantity: Number(field('quantity').value), unit, note: field('note').value,
      kcalPer100g: GRAMS_PER_UNIT[unit] ? calories : null, kcalPerUnit: GRAMS_PER_UNIT[unit] ? null : calories,
      nutritionMatch: matched ? JSON.parse(row.dataset.nutrition || 'null') : null };
  });
  const recipe = { title: values.get('title'), description: values.get('description'), category: values.get('category'), diet: values.get('diet'), servings: Number(values.get('servings')), minutes: Number(values.get('minutes')), ingredients, instructions: $$('[data-field="step"]', form).map(field => field.value), sourceUrl: editorOriginal?.sourceUrl || '' };
  const signature = rows => JSON.stringify(rows.map(i => [i.name.trim().toLowerCase(), i.quantity, i.unit, i.kcalPer100g ?? null, i.kcalPerUnit ?? null]));
  recipe.sourceCaloriesPerServing = editorOriginal && recipe.servings === editorOriginal.servings && signature(ingredients) === signature(editorOriginal.ingredients) ? editorOriginal.sourceCaloriesPerServing : null;
  if (editorOriginal?.color) recipe.color = editorOriginal.color;
  return recipe;
}
async function estimateCalories(button) {
  const form = $('#recipe-form');
  if (!form.reportValidity()) return;
  button.disabled = true;
  const status = $('#nutrition-status');
  status.hidden = false;
  status.textContent = 'Looking up ingredients and serving weights…';
  const input = readEditor();
  const signature = value => JSON.stringify(value.ingredients);
  try {
    const result = await api('/api/nutrition', { method: 'POST', body: JSON.stringify(input) });
    if (!editor.open || !button.isConnected) return;
    if (signature(readEditor()) !== signature(input)) { status.textContent = 'The ingredients changed during lookup. Please estimate again.'; return; }
    $('#ingredient-rows').innerHTML = result.ingredients.map(ingredientRow).join('');
    status.replaceChildren();
    const matched = result.ingredients.filter(i => i.kcalPer100g != null || i.kcalPerUnit != null).length;
    status.textContent = `Calorie values available for ${matched} of ${result.ingredients.length} ingredients. ${result.warnings.join(' ')}${result.demo ? ' Demo lookup has a small daily limit.' : ''}`;
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
}
function renumberSteps() {
  $$('.step-row', editor).forEach((row, i) => {
    $('.step-number', row).textContent = i + 1;
    $('.visually-hidden', row).textContent = `Instruction step ${i + 1}`;
    $('button', row).setAttribute('aria-label', `Remove instruction step ${i + 1}`);
  });
}
async function saveRecipe(event) {
  event.preventDefault();
  const form = event.target;
  const button = $('#save-recipe');
  const errorLabel = $('#form-error');
  const input = readEditor();
  button.disabled = true;
  errorLabel.hidden = true;
  try {
    const saved = await api(editingId == null ? '/api/recipes' : `/api/recipes/${editingId}`, { method: editingId == null ? 'POST' : 'PUT', body: JSON.stringify(input) });
    const index = recipes.findIndex(r => r.id === saved.id);
    if (index === -1) recipes.unshift(saved); else recipes[index] = saved;
    persist();
    editor.close();
    // New recipes should be visible even when a previous search or filter was active.
    if (editingId == null) { query = ''; category = ''; view = 'recipes'; }
    render();
    notify(editingId == null ? 'Recipe saved to your collection.' : 'Recipe updated. Your shopping list is up to date.');
  } catch (error) { errorLabel.textContent = error.message; errorLabel.hidden = false; errorLabel.scrollIntoView({ block: 'nearest' }); }
  finally { button.disabled = false; }
}
function updateServing(target, id, value) {
  const servings = Number(value);
  if (!Number.isInteger(servings) || servings < 1 || servings > 100) {
    notify('Choose a whole number of servings between 1 and 100.');
    if (target === 'detail') showDetail(id, detailServings); else refreshCart();
    return;
  }
  if (target === 'detail') {
    // Preserve keyboard focus and scroll while re-rendering the scaled ingredients.
    const active = document.activeElement;
    const delta = active?.dataset.delta;
    const wasInput = active?.matches('[data-serving]');
    const scroll = detail.scrollTop;
    showDetail(id, servings);
    if (wasInput) $('[data-serving="detail"]', detail)?.focus({ preventScroll: true });
    else if (delta) $(`[data-target="detail"][data-delta="${delta}"]`, detail)?.focus({ preventScroll: true });
    detail.scrollTop = scroll;
  } else {
    const entry = cart.find(e => e.recipeId === id);
    if (entry) {
      const active = document.activeElement;
      const delta = active?.dataset.delta;
      const wasInput = active?.matches('[data-serving]');
      entry.servings = servings;
      refreshCart();
      if (wasInput) $(`[data-serving="cart"][data-id="${id}"]`)?.focus({ preventScroll: true });
      else if (delta) $(`[data-target="cart"][data-id="${id}"][data-delta="${delta}"]`)?.focus({ preventScroll: true });
    }
  }
}
function downloadList() {
  const rows = shoppingList(recipes, cart);
  const text = ['PANTRY — SHOPPING LIST', '', 'Planned meals:', ...cart.map(e => `${recipes.find(r => r.id === e.recipeId)?.title} (${e.servings} servings)`), '', 'Ingredients:', ...rows.map(row => `${checked[row.key] === row.quantity ? '[x]' : '[ ]'} ${displayAmount(row.quantity, row.unit)} ${row.name}${row.notes.length ? ` — ${row.notes.join('; ')}` : ''}`), ''].join('\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'pantry-shopping-list.txt'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.addEventListener('click', async event => {
  const mode = event.target.closest('[data-import-mode]');
  if (mode) {
    const text = mode.dataset.importMode === 'text';
    importer.dataset.mode = mode.dataset.importMode;
    $('#link-fields').hidden = text; $('#text-fields').hidden = !text;
    $('[name="url"]', importer).required = !text; $('[name="text"]', importer).required = text;
    $$('[data-import-mode]', importer).forEach(button => { const active = button === mode; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); });
    $(text ? '[name="text"]' : '[name="url"]', importer).focus();
    return;
  }
  const nav = event.target.closest('[data-view]');
  if (nav) return setView(nav.dataset.view);
  const chip = event.target.closest('[data-category]');
  if (chip) {
    category = chip.dataset.category;
    $$('.chip').forEach(button => { const active = button.dataset.category === category; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); });
    collectionResults();
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action, id = Number(button.dataset.id);
  try {
    if (action === 'new') showImport();
    else if (action === 'manual') showEditor();
    else if (action === 'close-import') importer.close();
    else if (action === 'estimate') await estimateCalories(button);
    else if (action === 'edit') showEditor(id);
    else if (action === 'close-editor') editor.close();
    else if (action === 'close-detail') detail.close();
    else if (action === 'detail') showDetail(id);
    else if (action === 'add-cart') addToCart(id);
    else if (action === 'detail-cart') { addToCart(id, detailServings); detail.close(); }
    else if (action === 'remove-cart') { cart = cart.filter(e => e.recipeId !== id); refreshCart(); }
    else if (action === 'clear-cart') { cart = []; checked = {}; refreshCart(); notify('Meal cart cleared.'); }
    else if (action === 'shopping') setView(view === 'shopping' ? 'recipes' : 'shopping');
    else if (action === 'recipes') setView('recipes');
    else if (action === 'serving') {
      const current = button.dataset.target === 'detail' ? detailServings : cart.find(e => e.recipeId === id)?.servings;
      updateServing(button.dataset.target, id, current + Number(button.dataset.delta));
    } else if (action === 'examples') {
      button.disabled = true;
      const added = await api('/api/examples', { method: 'POST', body: '{}' });
      await load();
      notify(`${added.length} example recipes added. You can edit or delete them.`);
    } else if (action === 'retry') await load();
    else if (action === 'reset-filters') { query = ''; category = ''; render(); $('#search')?.focus(); }
    else if (action === 'add-ingredient') {
      if ($$('.ingredient-row', editor).length >= 100) return notify('A recipe can have up to 100 ingredients.');
      $('#ingredient-rows').insertAdjacentHTML('beforeend', ingredientRow());
      $('#ingredient-rows').lastElementChild.querySelector('input').focus();
    } else if (action === 'remove-ingredient') {
      if ($$('.ingredient-row', editor).length === 1) return notify('Keep at least one ingredient.');
      button.closest('.ingredient-entry').remove();
    } else if (action === 'add-step') {
      const count = $$('.step-row', editor).length;
      if (count >= 100) return notify('A recipe can have up to 100 steps.');
      $('#step-rows').insertAdjacentHTML('beforeend', stepRow('', count + 1));
      $('#step-rows').lastElementChild.querySelector('textarea').focus();
    } else if (action === 'remove-step') {
      if ($$('.step-row', editor).length === 1) return notify('Keep at least one instruction step.');
      button.closest('.step-row').remove(); renumberSteps();
    } else if (action === 'delete-prompt') {
      const panel = $('#delete-confirm');
      panel.innerHTML = `Delete this recipe permanently? It will also be removed from your meal cart.<br><button class="button small danger" data-action="delete" data-id="${id}">Yes, delete recipe</button><button class="button small" data-action="cancel-delete">Keep recipe</button>`;
      panel.hidden = false;
      panel.scrollIntoView({ block: 'nearest' });
      $('[data-action="cancel-delete"]', panel).focus({ preventScroll: true });
    } else if (action === 'cancel-delete') $('#delete-confirm').hidden = true;
    else if (action === 'delete') {
      button.disabled = true;
      await api(`/api/recipes/${id}`, { method: 'DELETE' });
      recipes = recipes.filter(r => r.id !== id); cart = cart.filter(e => e.recipeId !== id);
      persist(); detail.close(); render(); notify('Recipe deleted.');
    } else if (action === 'download') downloadList();
    else if (action === 'print') window.print();
    else if (action === 'uncheck') { checked = {}; persist(); renderShopping(); }
  } catch (error) { notify(error.message); }
  finally { if (button.isConnected) button.disabled = false; }
});
document.addEventListener('input', event => {
  if (event.target.id === 'search') { query = event.target.value; collectionResults(); }
});
document.addEventListener('change', event => {
  const target = event.target;
  if (target.dataset.serving) updateServing(target.dataset.serving, Number(target.dataset.id), target.value);
  else if (target.dataset.field === 'unit') {
    const row = target.closest('.ingredient-row');
    const calories = $('[data-field="calorieValue"]', row);
    const mass = Boolean(GRAMS_PER_UNIT[target.value]);
    if (!mass || !GRAMS_PER_UNIT[row.dataset.originalUnit]) calories.value = '';
    $('[data-calorie-label]', row).textContent = mass ? 'kcal / 100 g' : `kcal / ${target.value}`;
    calories.max = mass ? 1000 : 100000;
    row.dataset.nutrition = 'null';
    $('.match-note', row.closest('.ingredient-entry'))?.remove();
  } else if (target.dataset.field === 'name') {
    const row = target.closest('.ingredient-row');
    if (row.dataset.nutrition !== 'null' && target.value !== row.dataset.originalName) {
      $('[data-field="calorieValue"]', row).value = '';
      row.dataset.nutrition = 'null';
      $('.match-note', row.closest('.ingredient-entry'))?.remove();
    }
  } else if (target.dataset.field === 'calorieValue') {
    const row = target.closest('.ingredient-row');
    row.dataset.nutrition = 'null';
    $('.match-note', row.closest('.ingredient-entry'))?.remove();
  } else if (target.matches('[data-check]')) {
    const rows = shoppingList(recipes, cart);
    const row = rows[Number(target.dataset.check)];
    if (!row) return;
    if (target.checked) checked[row.key] = row.quantity; else delete checked[row.key];
    target.closest('.shopping-row').classList.toggle('checked', target.checked);
    persist();
    const done = rows.filter(r => checked[r.key] === r.quantity).length;
    $('#shopping-progress').textContent = `${done} of ${rows.length} items checked · ${cart.length} planned ${cart.length === 1 ? 'recipe' : 'recipes'}`;
  }
});
document.addEventListener('submit', event => { if (event.target.id === 'recipe-form') saveRecipe(event); else if (event.target.id === 'import-form') importRecipe(event); });
for (const dialog of [detail, editor, importer]) dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
});
await load();
