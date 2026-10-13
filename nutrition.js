import { GRAMS_PER_UNIT } from './public/recipe-config.js';

function tokens(value) {
  return String(value).toLowerCase().replace(/[,()]/g, ' ').split(/[^a-z0-9]+/).filter(Boolean).filter(word => !['fresh', 'large', 'small', 'medium', 'extra', 'virgin', 'chopped', 'diced', 'sliced', 'minced', 'peeled', 'of', 'and'].includes(word)).map(word => word.endsWith('ies') ? word.slice(0, -3) + 'y' : word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word);
}
export function chooseFood(name, foods) {
  const wanted = tokens(name);
  if (!wanted.length || ['milk', 'rice', 'flour', 'oil', 'yogurt', 'cheese', 'bread', 'pasta'].includes(wanted.join(' '))) return null;
  const candidates = foods.filter(food => ['Foundation', 'SR Legacy'].includes(food.dataType)).map(food => {
    const actual = tokens(food.description);
    const parts = String(food.description).split(',');
    const genericGroups = new Set(['spice', 'nut', 'seed', 'beverage', 'vegetable', 'fruit']);
    let primary = tokens(parts[0]);
    if (primary.length === 1 && genericGroups.has(primary[0])) primary = tokens(parts[1] || '');
    // Matching a word inside another food's name is insufficient (e.g. water convolvulus).
    const primaryMatches = primary.length > 0 && primary.every(word => wanted.includes(word));
    const matches = wanted.filter(word => actual.includes(word)).length;
    // Do not substitute a prepared meal or differently cooked ingredient.
    const stateMismatch = ['raw', 'cooked', 'dry', 'roasted', 'fried', 'salted', 'unsalted'].some(state => wanted.includes(state) && !actual.includes(state));
    const unexpectedState = ['cooked', 'roasted', 'fried', 'flour', 'powder', 'juice', 'syrup', 'sauce', 'cereal', 'human', 'infant', 'baby'].some(state => actual.includes(state) && !wanted.includes(state));
    return { food, score: matches === wanted.length && primaryMatches && !stateMismatch && !unexpectedState ? 100 - actual.length + (actual.includes('raw') ? 1 : 0) : -1 };
  }).filter(entry => entry.score >= 0).sort((a, b) => b.score - a.score);
  return candidates[0]?.food || null;
}
function energy(food) {
  const nutrients = food.foodNutrients || [];
  // USDA nutrient 1008 is kcal/100 g. 2047/2048 are Atwater energy variants.
  for (const id of [1008, 2048, 2047]) {
    const nutrient = nutrients.find(n => (n.nutrientId ?? n.nutrient?.id) === id && /^kcal$/i.test(n.unitName ?? n.nutrient?.unitName ?? ''));
    const value = nutrient?.value ?? nutrient?.amount;
    if (typeof value === 'number' && value >= 0 && value <= 1000) return value;
  }
  return null;
}
export function portionGrams(food, unit) {
  const names = { cup: ['cup', 'cups'], tbsp: ['tablespoon', 'tbsp'], tsp: ['teaspoon', 'tsp'], ml: ['ml', 'milliliter', 'millilitre'], l: ['liter', 'litre'], piece: ['piece', 'whole', 'medium'] };
  const matches = (food.foodPortions || []).filter(p => {
    const text = `${p.modifier || ''} ${p.measureUnit?.name || ''} ${p.portionDescription || ''}`.toLowerCase();
    return names[unit]?.some(name => new RegExp(`\\b${name}\\b`).test(text)) && p.amount > 0 && p.gramWeight > 0;
  });
  // Multiple incompatible weights require review rather than an arbitrary choice.
  const weights = [...new Set(matches.map(p => p.gramWeight / p.amount))];
  return weights.length === 1 ? { grams: weights[0], description: matches[0].modifier || matches[0].portionDescription || matches[0].measureUnit?.name } : null;
}
export function createNutritionService({ apiKey = process.env.USDA_API_KEY || 'DEMO_KEY', fetcher = fetch } = {}) {
  const cache = new Map();
  async function request(path, params, signal) {
    const url = new URL(`https://api.nal.usda.gov/fdc/v1/${path}`);
    url.searchParams.set('api_key', apiKey);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    let response;
    try { response = await fetcher(url, { signal }); } catch { throw new Error('Nutrition lookup could not be reached. Existing recipe data was kept.'); }
    if (response.status === 429) throw new Error('USDA lookup limit reached. Try later or configure a free USDA API key.');
    if (response.status === 401 || response.status === 403) throw new Error('USDA access is unavailable. Check your API key or try later.');
    if (!response.ok) throw new Error('Nutrition lookup is temporarily unavailable.');
    return response.json();
  }
  async function lookupFood(name, needPortions, signal) {
    const key = tokens(name).join(' ');
    const saved = cache.get(key);
    if (saved && saved.expires > Date.now() && (!needPortions || saved.detail)) return saved.food;
    const results = await request('foods/search', { query: key, dataType: 'Foundation,SR Legacy', pageSize: '25' }, signal);
    let food = chooseFood(name, results.foods || []);
    if (food && needPortions) food = await request(`food/${food.fdcId}`, {}, signal);
    cache.set(key, { food, detail: needPortions, expires: Date.now() + 24 * 60 * 60 * 1000 });
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    return food;
  }
  return {
    async estimate(ingredients) {
      const warnings = [], result = ingredients.map(i => ({ ...i }));
      const signal = AbortSignal.timeout(25000);
      let lookedUp = 0;
      for (const ingredient of result) {
        if (!ingredient.name || !(ingredient.quantity > 0) || ingredient.kcalPer100g != null || ingredient.kcalPerUnit != null) continue;
        if (lookedUp >= 12) { warnings.push('Only the first 12 missing ingredients were looked up. Estimate again to continue.'); break; }
        lookedUp++;
        try {
          const mass = GRAMS_PER_UNIT[ingredient.unit];
          const food = await lookupFood(ingredient.name, !mass, signal);
          const kcal = food ? energy(food) : null;
          if (kcal == null) { warnings.push(`No reliable calorie match for “${ingredient.name}”. Enter its calories manually.`); continue; }
          const portion = mass ? null : portionGrams(food, ingredient.unit);
          if (!mass && !portion) { warnings.push(`“${ingredient.name}”: no unambiguous weight for ${ingredient.unit}. Use grams or enter calories per unit.`); continue; }
          if (mass) ingredient.kcalPer100g = kcal;
          else ingredient.kcalPerUnit = kcal * portion.grams / 100;
          ingredient.nutritionMatch = { fdcId: food.fdcId, description: food.description, portion: portion?.description || '' };
        } catch (error) { warnings.push(error.message); break; }
      }
      return { ingredients: result, warnings: [...new Set(warnings)], demo: apiKey === 'DEMO_KEY' };
    }
  };
}
