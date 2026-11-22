import { GRAMS_PER_UNIT } from './recipe-config.js';
import { ML, weightIn, volumeIn } from './units.js';

// The shopping list: every ingredient of every planned recipe, scaled to the
// planned servings and added up into one row per thing you would actually buy.
//
// A row is the same product (name, ignoring size, prep and spelling variants)
// measured the same way: by weight, by volume, or by count. Weight and volume
// each convert between their units. Weight and volume are not mixed, because
// that needs a density for every ingredient.
//
// The list is read in metric or imperial (units.js): every weight and volume is
// added up in grams and millilitres, then written in the chosen system.
//
// A row's `quantity` and `unit` are exact. Its `amount` is the same figure
// rounded the way a shopper reads it ("1 lb" -> "455 g", half a lemon -> "1 piece").

// --- Units ---------------------------------------------------------------

const CONTAINERS = ['tin', 'can', 'jar', 'bottle', 'packet', 'package', 'pint', 'bag', 'box', 'head', 'bunch'];

function measure(ingredient, factor, container) {
  const quantity = ingredient.quantity * factor, unit = ingredient.unit;
  if (GRAMS_PER_UNIT[unit]) return { family: 'weight', unitKey: 'g', base: quantity * GRAMS_PER_UNIT[unit] };
  if (ML[unit]) return { family: 'volume', unitKey: 'ml', base: quantity * ML[unit] };
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

const plural = (count, unit) => count === 1 || !['piece', ...CONTAINERS].includes(unit) ? unit : unit === 'bunch' ? 'bunches' : `${unit}s`;

// One row's figure read in one system: the unit, the exact quantity in it, and the rounded amount.
function describe(group, system) {
  let shown;
  if (group.family === 'weight') shown = weightIn(group.base, system);
  else if (group.family === 'volume') shown = volumeIn(group.base, system);
  else {
    const whole = Math.max(1, Math.ceil(group.base - 1e-9));
    shown = { unit: group.label, quantity: group.base, amount: `${whole} ${plural(whole, group.label)}` };
  }
  return group.garnish ? { ...shown, amount: group.garnish } : shown;
}

function finish(group, system) {
  const { unit, quantity, amount } = describe(group, system);
  // A tick belongs to the row, not to the units it is read in, so it survives a switch of system and the
  // couple who share a list can each read it their own way. It is lost when either reading changes.
  const tick = [describe(group, 'metric').amount, describe(group, 'imperial').amount].join('|');
  const notes = [...group.notes.values()];
  if (!group.required) notes.push('optional');
  // The most common spelling wins; the first one seen breaks ties.
  const name = [...group.names].reduce((best, entry) => entry[1] > best[1] ? entry : best)[0];
  return { key: group.key, name, unit, quantity, amount, tick, notes, recipes: [...group.recipes] };
}

export function shoppingList(recipes, cart, system = 'metric') {
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
      group = { key, family: line.family, label: line.label, base: 0, names: new Map(), notes: new Map(), recipes: new Set(), required: false, garnish: line.garnish };
      groups.set(key, group);
    }
    group.base += line.base;
    group.names.set(line.display, (group.names.get(line.display) ?? 0) + 1);
    for (const note of line.notes) if (!group.notes.has(note.toLocaleLowerCase('en'))) group.notes.set(note.toLocaleLowerCase('en'), note);
    group.recipes.add(line.recipe);
    if (!line.optional) group.required = true;
    if (!line.garnish) group.garnish = '';
  }
  return [...groups.values()].map(group => finish(group, system)).sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
}

// Identifies a shopping-list row (and its amount) for ticked-off checkboxes.
// Built from the amounts as shown (in both systems), so a servings change that leaves them the same keeps the tick.
export const checkKey = row => `${row.key}|${row.tick}`;
