import { GRAMS_PER_UNIT } from './recipe-config.js';

// The shopping list: every ingredient of every planned recipe, scaled to the
// planned servings and added up into one row per thing you would actually buy.
//
// A row is the same product (name, ignoring size, prep and spelling variants)
// measured the same way: by weight, by volume, or by count. Weight and volume
// each convert between their units. Weight and volume are not mixed, because
// that needs a density for every ingredient.
//
// A row's `quantity` and `unit` are exact. Its `amount` is the same figure
// rounded the way a shopper reads it ("1 lb" -> "455 g", half a lemon -> "1 piece").

// --- Units ---------------------------------------------------------------

const ML = { ml: 1, l: 1000, tsp: 4.92892159375, tbsp: 14.78676478125, cup: 236.5882365, pinch: 4.92892159375 / 16 };
// When volumes in different units meet, show the most "shop-like" one: metric, then cups, then spoons.
const VOLUME_STYLE = { ml: 'ml', l: 'ml', cup: 'cup', tsp: 'spoon', tbsp: 'spoon', pinch: 'spoon' };
const STYLE_RANK = { spoon: 0, cup: 1, ml: 2 };
const CONTAINERS = ['tin', 'can', 'jar', 'bottle', 'packet', 'package', 'pint', 'bag', 'box', 'head', 'bunch'];
const QUARTERS = { 0.25: '¼', 0.5: '½', 0.75: '¾' };

const numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });

function measure(ingredient, factor, container) {
  const quantity = ingredient.quantity * factor, unit = ingredient.unit;
  if (GRAMS_PER_UNIT[unit]) return { family: 'weight', unitKey: 'g', base: quantity * GRAMS_PER_UNIT[unit] };
  if (ML[unit]) return { family: 'volume', unitKey: 'ml', base: quantity * ML[unit], style: VOLUME_STYLE[unit] };
  // "pint fresh strawberries, 0.5 piece" means half a pint, not half a strawberry.
  const label = container && unit === 'piece' ? container : unit;
  return { family: 'count', unitKey: label, base: quantity, label };
}

// --- Names ---------------------------------------------------------------

// Words that describe the ingredient without changing what you buy. They leave the
// name (so "large banana" and "banana" add up) and stay on the row as a note.
const LEADING = new RegExp('^(?:' + [
  'small|medium|large|extra[- ]large|big',
  'non-?fat|low[- ]fat|reduced[- ]fat|full[- ]fat|fat[- ]free|extra[- ]virgin|old[- ]fashioned|boneless|skinless|fresh',
  'plain(?= (?:greek )?yo?gurt)',
  'light(?= (?:olive oil|cream cheese|mayonnaise|sour cream|yo?gurt|coconut milk))',
  'freshly (?:squeezed|ground|grated)',
  '(?:(?:finely|roughly|thinly|coarsely|lightly) )?(?:sliced|grated|halved)',
  '(?:(?:finely|roughly|coarsely) )?minced(?! (?:beef|meat|pork|lamb|turkey|chicken))',
  // Canned "chopped tomatoes" are a product of their own, unlike chopped onion.
  '(?:(?:finely|roughly|coarsely) )?(?:chopped|diced|peeled)(?! tomato)',
].join('|') + ')\\s+', 'i');
const CONTAINER = new RegExp(`^(${CONTAINERS.join('|')})s?\\s+(?:of\\s+)?(?=\\S)`, 'i');
const TRAILING = /\s+(cloves?|sticks?|stalks?|sprigs?|fillets?)$/i;
const GLUED_AMOUNT = /(?<=[a-z])\s*\d+(?:\.\d+)?\s*(?:tsp|tbsp|kg|g|ml|l|oz|lb)s?$/i;
const GARNISH = /^(?:to (serve|taste|garnish)|for (serving|garnish(?:ing)?)|as needed)$/i;
const OPTIONAL = /^(?:optional|if desired|if you like)$/i;
const SALT_AND_PEPPER = /^salt\s*(?:&|and|\/)\s*(?:(?:black|ground|freshly ground) )?pepper\b/i;

const SYNONYMS = {
  'spring onion': 'green onion', scallion: 'green onion', courgette: 'zucchini', aubergine: 'eggplant',
  'garbanzo bean': 'chickpea', oat: 'rolled oat',
};

function singular(word) {
  if (/ies$/.test(word) && word.length > 4) return `${word.slice(0, -3)}y`;
  if (/leaves$/.test(word)) return `${word.slice(0, -6)}leaf`;
  if (/(?:ss|x|z|ch|sh|o)es$/.test(word)) return word.slice(0, -2);
  if (/s$/.test(word) && !/(?:ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}
// What two names must share to be the same row.
function keyOf(text) {
  const words = text.toLocaleLowerCase('en').replace(/\byoghurt\b/g, 'yogurt').replace(/\bwhole[- ]?(?:grain|wheat)\b/g, 'wholegrain')
    .replace(/\bbroth\b/g, 'stock').replace(/[^\p{L}\p{N} -]/gu, ' ').split(/\s+/).filter(Boolean);
  if (words.length) words[words.length - 1] = singular(words[words.length - 1]);
  const key = words.join(' ');
  return SYNONYMS[key] ?? key;
}

// Splits note text into short pieces and sets aside the "to serve" and "optional" kinds.
function sortNotes(texts) {
  const notes = [];
  let garnish = '', optional = false;
  for (const text of texts) for (let piece of text.split(/\s*[,;·]\s*/)) {
    piece = piece.replace(/^and\s+/i, '').replace(/[()]/g, '').trim();
    if (!piece) continue;
    const serve = piece.match(GARNISH);
    if (serve) garnish ||= /taste/i.test(serve[1]) ? 'to taste' : 'to serve';
    else if (OPTIONAL.test(piece)) optional = true;
    else notes.push(piece);
  }
  return { notes, garnish, optional };
}

function cleanName(raw) {
  let text = String(raw).replace(/\s+/g, ' ').trim();
  const pieces = [];
  text = text.replace(GLUED_AMOUNT, ''); // "black pepper0.25tsp"
  text = text.replace(/\(([^()]*)\)/g, (_, inner) => { pieces.push(inner); return ' '; }).replace(/\s+/g, ' ').trim();
  const comma = text.indexOf(',');
  if (comma > 0) { pieces.push(text.slice(comma + 1)); text = text.slice(0, comma).trim(); }
  const container = text.match(CONTAINER);
  if (container) { text = text.slice(container[0].length); }
  for (let match; (match = LEADING.exec(text));) { pieces.push(match[0].trim().toLocaleLowerCase('en')); text = text.slice(match[0].length); }
  const trailing = text.match(TRAILING);
  if (trailing) { pieces.push(trailing[1].toLocaleLowerCase('en')); text = text.slice(0, trailing.index); }
  return { display: text, key: keyOf(text), container: container ? container[1].toLocaleLowerCase('en') : '', pieces };
}

// "Salt and pepper" is two things on a shopping list.
function expand(ingredient) {
  const name = ingredient.name.trim(), match = name.match(SALT_AND_PEPPER);
  if (!match) return [ingredient];
  const rest = name.slice(match[0].length);
  return [{ ...ingredient, name: `salt${rest}` }, { ...ingredient, name: `black pepper${rest}` }];
}

function parse(ingredient, factor, recipe) {
  return expand(ingredient).map(item => {
    const name = cleanName(item.name);
    // "tin chopped tomatoes, 200 g": the tin is only a hint here, so it stays as a note.
    const hint = name.container && item.unit !== 'piece' ? [name.container] : [];
    const { notes, garnish, optional } = sortNotes([...name.pieces, ...hint, ...(item.note ? [item.note] : [])]);
    const parts = name.display.split(/\s+or\s+/i);
    const alternatives = parts.length === 2 ? parts.map(part => ({ display: part, key: keyOf(part) })) : null;
    return { display: name.display, key: name.key, alternatives, notes, garnish, optional, recipe, ...measure(item, factor, name.container) };
  });
}

// --- Rows ----------------------------------------------------------------

const roundTo = (value, step) => Math.round(value / step) * step;
function metric(value, small, big) {
  const rounded = value >= 1000 ? roundTo(value, 10) : value >= 50 ? roundTo(value, 5) : Math.max(1, Math.round(value));
  return rounded >= 1000 ? `${numberFormat.format(rounded / 1000)} ${big}` : `${rounded} ${small}`;
}
function quarters(value) {
  const rounded = Math.max(0.25, roundTo(value, 0.25)), whole = Math.floor(rounded);
  return `${whole || ''}${QUARTERS[rounded - whole] ?? ''}`;
}
const plural = (count, unit) => count === 1 || !['piece', ...CONTAINERS].includes(unit) ? unit : unit === 'bunch' ? 'bunches' : `${unit}s`;

function finish(group) {
  const { family, base } = group;
  let unit, quantity, amount;
  if (family === 'weight') { unit = 'g'; quantity = base; amount = metric(base, 'g', 'kg'); }
  else if (family === 'volume' && group.style === 'ml') { unit = 'ml'; quantity = base; amount = metric(base, 'ml', 'l'); }
  else if (family === 'volume' && group.style === 'cup') { unit = 'cup'; quantity = base / ML.cup; amount = `${quarters(quantity)} cup`; }
  else if (family === 'volume') {
    const tsp = base / ML.tsp;
    if (tsp < 0.25) { unit = 'pinch'; quantity = base / ML.pinch; amount = 'a pinch'; }
    else if (roundTo(tsp, 0.25) >= 3) { unit = 'tbsp'; quantity = base / ML.tbsp; amount = `${quarters(quantity)} tbsp`; }
    else { unit = 'tsp'; quantity = tsp; amount = `${quarters(quantity)} tsp`; }
  } else {
    unit = group.label; quantity = base;
    const whole = Math.max(1, Math.ceil(base - 1e-9));
    amount = `${whole} ${plural(whole, unit)}`;
  }
  if (group.garnish) amount = group.garnish;
  const notes = [...group.notes.values()];
  if (!group.required) notes.push('optional');
  // The most common spelling wins; the first one seen breaks ties.
  const name = [...group.names].reduce((best, entry) => entry[1] > best[1] ? entry : best)[0];
  return { key: group.key, name, unit, quantity, amount, notes, recipes: [...group.recipes] };
}

export function shoppingList(recipes, cart) {
  const lines = [];
  for (const entry of cart) {
    const recipe = recipes.find(r => r.id === entry.recipeId);
    if (!recipe) continue;
    const factor = entry.servings / recipe.servings;
    for (const ingredient of recipe.ingredients) lines.push(...parse(ingredient, factor, recipe.title));
  }
  // "honey or maple syrup" joins the maple syrup already on the list; on its own it stays as written.
  const present = new Set(lines.filter(line => !line.alternatives).map(line => `${line.key}|${line.unitKey}`));
  for (const line of lines) {
    const index = line.alternatives?.findIndex(option => present.has(`${option.key}|${line.unitKey}`)) ?? -1;
    if (index < 0) continue;
    line.notes.push(`or ${line.alternatives[1 - index].display}`);
    ({ display: line.display, key: line.key } = line.alternatives[index]);
  }

  const groups = new Map();
  for (const line of lines) {
    const key = JSON.stringify([line.key, line.unitKey]);
    let group = groups.get(key);
    if (!group) {
      group = { key, family: line.family, label: line.label, style: line.style, base: 0, names: new Map(), notes: new Map(), recipes: new Set(), required: false, garnish: line.garnish };
      groups.set(key, group);
    }
    group.base += line.base;
    if (line.style && STYLE_RANK[line.style] > STYLE_RANK[group.style]) group.style = line.style;
    group.names.set(line.display, (group.names.get(line.display) ?? 0) + 1);
    for (const note of line.notes) if (!group.notes.has(note.toLocaleLowerCase('en'))) group.notes.set(note.toLocaleLowerCase('en'), note);
    group.recipes.add(line.recipe);
    if (!line.optional) group.required = true;
    if (!line.garnish) group.garnish = '';
  }
  return [...groups.values()].map(finish).sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
}

// Identifies a shopping-list row (and its amount) for ticked-off checkboxes.
// Built from the amount as shown, so a servings change that leaves it the same keeps the tick.
export const checkKey = row => `${row.key}|${row.amount}`;
