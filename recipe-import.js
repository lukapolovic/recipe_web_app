import { load } from 'cheerio';
import { CATEGORIES } from './public/recipe-config.js';

export class ImportError extends Error {
  constructor(message, status = 422) { super(message); this.status = status; }
}
export function cleanText(value) {
  const $ = load(String(value ?? ''), null, false);
  $('script, style, iframe, noscript').remove();
  $('br').replaceWith('\n');
  $('p, li, div').append('\n');
  return $.root().text().replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
}
const fractions = { '¼': '1/4', '½': '1/2', '¾': '3/4', '⅓': '1/3', '⅔': '2/3', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8' };
const unitNames = {
  g: 'g', gram: 'g', grams: 'g', kilogram: 'kg', kilograms: 'kg', kg: 'kg',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
  l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp', tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  cup: 'cup', cups: 'cup', piece: 'piece', pieces: 'piece', pinch: 'pinch', pinches: 'pinch',
  oz: 'oz', ounce: 'oz', ounces: 'oz', lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
};
function numeric(value) {
  return value.trim().split(/\s+/).reduce((sum, part) => {
    if (part.includes('/')) { const [a, b] = part.split('/').map(Number); return sum + a / b; }
    return sum + Number(part.replace(',', '.'));
  }, 0);
}
export function parseIngredient(raw) {
  const original = cleanText(raw).replace(/^\s*[•*▪]\s*|^\s*-\s+/, '').trim();
  let text = original.replace(/(\d)([¼½¾⅓⅔⅛⅜⅝⅞])/g, '$1 $2').replace(/[¼½¾⅓⅔⅛⅜⅝⅞]/g, v => fractions[v]);
  const match = text.match(/^(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?)(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\s*/);
  const warnings = [];
  let quantity = null, unit = 'piece', name = original, note = '';
  if (match) {
    quantity = numeric(match[1].replace(/\s*\/\s*/g, '/'));
    text = text.slice(match[0].length).trim();
    if (/[-–]/.test(match[0])) warnings.push(`“${original}”: a quantity range was found; review the amount.`);
    const unitMatch = text.match(/^([a-zA-Z]+)\.?\b\s*/);
    if (unitMatch && unitNames[unitMatch[1].toLowerCase()]) {
      unit = unitNames[unitMatch[1].toLowerCase()];
      text = text.slice(unitMatch[0].length).replace(/^of\s+/i, '').trim();
    } else if (/^(?:(?:small|medium|large)\s+)?(?:cans?|packages?|packets?|bunch(?:es)?|handfuls?|scoops?|jars?|bottles?|slices?|cloves?)\b/i.test(text) || /^\(/.test(text)) {
      // A package, clove, scoop, or parenthesized size is not a known weight.
      // Preserve the source line and require a human to choose its quantity/unit.
      quantity = null;
      warnings.push(`“${original}”: review its package size or unit.`);
    }
    name = quantity == null ? original : text;
    if (quantity != null && name.includes(',')) {
      const comma = name.indexOf(','); note = name.slice(comma + 1).trim(); name = name.slice(0, comma).trim();
    }
  } else warnings.push(`“${original}”: enter its quantity and unit.`);
  if (!name || name.length > 120 || quantity != null && (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000000)) {
    name = original.slice(0, 120); quantity = null;
    warnings.push(`“${original}”: review this ingredient before saving.`);
  }
  return { ingredient: { name, quantity, unit, note: note.slice(0, 200), kcalPer100g: null, kcalPerUnit: null }, warnings };
}
function stepsFrom(value, depth = 0) {
  if (depth > 20 || value == null) return [];
  if (Array.isArray(value)) return value.flatMap(v => stepsFrom(v, depth + 1));
  if (typeof value === 'object') return stepsFrom(value.itemListElement ?? value.text ?? value.item ?? value.name, depth + 1);
  return cleanText(value).split(/\n+/).map(v => v.replace(/^\s*(?:step\s*)?\d+[.)\s:-]+|^\s*[•*▪-]\s*/i, '').trim()).filter(Boolean);
}
function findRecipes(value, found = [], depth = 0) {
  if (depth > 30 || !value || typeof value !== 'object') return found;
  if (Array.isArray(value)) { for (const child of value) findRecipes(child, found, depth + 1); }
  else {
    const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
    if (types.some(t => typeof t === 'string' && /(?:^|[/#])Recipe$/i.test(t))) found.push(value);
    for (const child of Object.values(value)) if (child && typeof child === 'object') findRecipes(child, found, depth + 1);
  }
  return found;
}
function minutesFrom(value) {
  const match = String(value || '').match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!match) return null;
  const minutes = Number(match[1] || 0) * 1440 + Number(match[2] || 0) * 60 + Number(match[3] || 0) + Number(match[4] || 0) / 60;
  return minutes > 0 && minutes <= 1440 ? Math.ceil(minutes) : null;
}
function categoryFrom(value, title) {
  const text = `${Array.isArray(value) ? value.join(' ') : value || ''} ${title}`.toLowerCase();
  if (/shake|smoothie/.test(text)) return 'Shake';
  return CATEGORIES.find(c => text.includes(c.toLowerCase())) || 'Dinner';
}
function draftFrom(data, sourceUrl = '') {
  const warnings = [];
  const rawIngredients = Array.isArray(data.recipeIngredient) ? data.recipeIngredient : typeof data.recipeIngredient === 'string' ? data.recipeIngredient.split('\n') : [];
  const parsed = rawIngredients.map(value => parseIngredient(typeof value === 'object' ? value.text ?? value.name ?? '' : value)).filter(row => row.ingredient.name);
  const instructions = stepsFrom(data.recipeInstructions);
  if (!parsed.length || !instructions.length) throw new ImportError('No complete recipe was found. Paste the recipe text with Ingredients and Instructions headings instead.');
  if (parsed.length > 100 || instructions.length > 100) throw new ImportError('This recipe is too long to import. Paste a single recipe instead.');
  const yieldText = cleanText(Array.isArray(data.recipeYield) ? data.recipeYield[0] : typeof data.recipeYield === 'object' ? data.recipeYield.value : data.recipeYield);
  const yieldMatch = yieldText.match(/\d+/);
  const servings = yieldMatch && Number(yieldMatch[0]) >= 1 && Number(yieldMatch[0]) <= 100 ? Number(yieldMatch[0]) : 2;
  if (!yieldMatch || /[-–]|\b(?:cups?|grams?|g|kg|ml|litres?|liters?)\b/i.test(yieldText)) warnings.push('Check servings; the recipe yield was missing or ambiguous.');
  const minutes = minutesFrom(data.totalTime) || (minutesFrom(data.prepTime) || 0) + (minutesFrom(data.cookTime) || 0) || 30;
  if (!data.totalTime && !data.prepTime && !data.cookTime) warnings.push('Check cooking time; 30 minutes is a placeholder.');
  const calorieText = cleanText(data.nutrition?.calories);
  const calorieMatch = calorieText.match(/^(\d+(?:[.,]\d+)?)\s*(kcal|calories?|cal)?$/i);
  const sourceCaloriesPerServing = calorieMatch ? Number(calorieMatch[1].replace(',', '.')) : null;
  if (sourceCaloriesPerServing != null) warnings.push('Calories are the source website’s per-serving estimate. Check that its serving size matches yours.');
  return {
    recipe: {
      title: cleanText(data.name || 'Imported recipe').slice(0, 120), description: '', category: categoryFrom(data.recipeCategory, data.name), diet: 'None',
      servings, minutes: Math.min(minutes, 1440), ingredients: parsed.map(row => row.ingredient), instructions: instructions.map(s => s.slice(0, 2000)),
      sourceUrl, sourceCaloriesPerServing: sourceCaloriesPerServing != null && sourceCaloriesPerServing <= 100000 ? sourceCaloriesPerServing : null,
    },
    warnings: [...warnings, ...parsed.flatMap(row => row.warnings)],
  };
}
export function extractHtml(html, sourceUrl = '') {
  const $ = load(html);
  const candidates = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    try { findRecipes(JSON.parse($(element).text().replace(/^\s*<!--|-->\s*$/g, '')), candidates); } catch { /* Some pages contain unrelated invalid JSON-LD blocks. */ }
  });
  const candidate = candidates.find(r => r.recipeIngredient && r.recipeInstructions);
  if (candidate) return draftFrom(candidate, sourceUrl);
  const scope = $('[itemtype$="/Recipe"]').first();
  if (scope.length) {
    const raw = {
      name: scope.find('[itemprop="name"]').first().text(),
      recipeIngredient: scope.find('[itemprop="recipeIngredient"]').map((_, e) => $(e).text()).get(),
      recipeInstructions: scope.find('[itemprop="recipeInstructions"] li, [itemprop="recipeInstructions"] [itemprop="text"]').map((_, e) => $(e).text()).get(),
      recipeYield: scope.find('[itemprop="recipeYield"]').first().text(),
      totalTime: scope.find('[itemprop="totalTime"]').attr('datetime'),
    };
    if (!raw.recipeInstructions.length) raw.recipeInstructions = scope.find('[itemprop="recipeInstructions"]').text();
    try { return draftFrom(raw, sourceUrl); } catch (error) { if (!(error instanceof ImportError)) throw error; }
  }
  // Common recipe-card markup, followed by heading-based text extraction.
  const card = $('.wprm-recipe, .tasty-recipes, .recipe-card').first();
  const body = card.length ? card : $('body');
  body.find('script, style, nav, header, footer, aside, form, iframe, noscript').remove();
  body.find('br').replaceWith('\n');
  body.find('p, li, h1, h2, h3, h4, div').append('\n');
  const result = extractText(body.text(), { sourceUrl });
  if (!result.recipe.title || result.recipe.title === 'Imported recipe') result.recipe.title = cleanText($('h1').first().text() || $('title').text()).slice(0, 120) || 'Imported recipe';
  result.warnings.unshift('Imported from visible page text. Check the ingredient amounts and steps.');
  return result;
}
export function extractText(input, { sourceUrl = '' } = {}) {
  if (typeof input !== 'string' || input.length < 10 || input.length > 120000) throw new ImportError('Paste between 10 and 120,000 characters of recipe text.', 400);
  const lines = cleanText(input).split(/\n+/).map(v => v.trim()).filter(Boolean);
  const ingredientHeader = lines.findIndex(v => /^(?:#{1,6}\s*)?ingredients?(?:\s*[:：])?$/i.test(v));
  const instructionHeader = lines.findIndex((v, i) => i > ingredientHeader && /^(?:#{1,6}\s*)?(?:instructions?|directions?|method|preparation)(?:\s*[:：])?$/i.test(v));
  if (ingredientHeader === -1 || instructionHeader === -1) throw new ImportError('Add Ingredients and Instructions headings so we can separate the recipe from the surrounding text. You can also paste it into this chat for cleanup.');
  const end = lines.findIndex((v, i) => i > instructionHeader && /^(?:#{1,6}\s*)?(?:notes?|nutrition(?: information| facts)?|tips|reviews?|comments?|related recipes|frequently asked questions|storage|subscribe|you may also like)\s*[:：]?$/i.test(v));
  const rawIngredients = lines.slice(ingredientHeader + 1, instructionHeader).filter(v => !/^(?:for the .+|US customary|metric|scale|\d+x)\s*:?$/i.test(v));
  const stepLines = lines.slice(instructionHeader + 1, end === -1 ? undefined : end).filter(v => !/^(?:print(?: recipe)?|save recipe|rate this recipe|jump to recipe|advertisement|subscribe|share|pin it|leave a comment)$/i.test(v));
  const front = lines.slice(0, ingredientHeader);
  const title = front.find(v => !/^(?:print|jump|save|subscribe|servings?|yield|prep|cook|total|time|calories|advertisement|#{1,6}\s*$)/i.test(v))?.replace(/^#{1,6}\s*/, '') || 'Imported recipe';
  const servings = front.join(' ').match(/(?:serves|servings?|yield)\s*[:：]?\s*(\d+)/i)?.[1];
  const time = front.join(' ').match(/(?:total time|time)\s*[:：]?\s*(\d+)\s*(?:min|minutes)/i)?.[1];
  const result = draftFrom({ name: title, recipeIngredient: rawIngredients, recipeInstructions: stepLines, recipeYield: servings, totalTime: time ? `PT${time}M` : undefined }, sourceUrl);
  if (front.length > 6) result.warnings.unshift('Check the recipe title; extra text appeared before the ingredient list.');
  return result;
}
