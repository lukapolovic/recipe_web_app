import { GRAMS_PER_UNIT } from './recipe-config.js';
export { UNITS } from './recipe-config.js';

export function formatQuantity(value) {
  return new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value);
}

export function nutritionFor(recipe, servings = recipe.servings) {
  if (recipe.sourceCaloriesPerServing != null) return {
    total: recipe.sourceCaloriesPerServing * servings, perServing: recipe.sourceCaloriesPerServing,
    complete: true, known: recipe.ingredients.length, count: recipe.ingredients.length, source: 'website',
  };
  const measurable = recipe.ingredients.filter(i => i.kcalPer100g != null && GRAMS_PER_UNIT[i.unit] || i.kcalPerUnit != null);
  const total = measurable.reduce((sum, i) => sum + i.quantity * (i.kcalPer100g != null && GRAMS_PER_UNIT[i.unit] ? GRAMS_PER_UNIT[i.unit] * i.kcalPer100g / 100 : i.kcalPerUnit), 0);
  return { total: total * servings / recipe.servings, perServing: total / recipe.servings,
    complete: measurable.length === recipe.ingredients.length, known: measurable.length, count: recipe.ingredients.length, source: 'ingredients' };
}

export function shoppingList(recipes, cart) {
  const groups = new Map();
  for (const entry of cart) {
    const recipe = recipes.find(r => r.id === entry.recipeId);
    if (!recipe) continue;
    for (const ingredient of recipe.ingredients) {
      const name = ingredient.name.trim().replace(/\s+/g, ' ');
      const unit = GRAMS_PER_UNIT[ingredient.unit] ? 'g' : ingredient.unit === 'l' ? 'ml' : ingredient.unit;
      const multiplier = GRAMS_PER_UNIT[ingredient.unit] || (ingredient.unit === 'l' ? 1000 : 1);
      const key = JSON.stringify([name.toLocaleLowerCase('en'), unit]);
      let row = groups.get(key);
      if (!row) {
        row = { key, name, unit, quantity: 0, notes: new Set(), recipes: new Set() };
        groups.set(key, row);
      }
      row.quantity += ingredient.quantity * multiplier * entry.servings / recipe.servings;
      if (ingredient.note) row.notes.add(ingredient.note);
      row.recipes.add(recipe.title);
    }
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name)).map(row => ({ ...row, notes: [...row.notes], recipes: [...row.recipes] }));
}

export function displayAmount(quantity, unit) {
  if (unit === 'g' && quantity >= 1000) return `${formatQuantity(quantity / 1000)} kg`;
  if (unit === 'ml' && quantity >= 1000) return `${formatQuantity(quantity / 1000)} l`;
  return `${formatQuantity(quantity)} ${unit === 'piece' ? (quantity === 1 ? 'piece' : 'pieces') : unit}`;
}
